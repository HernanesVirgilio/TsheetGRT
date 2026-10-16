-- TsheetGRT · SI Holdings — Responsabilidades por perfil (tarefas, reuniões e ausências)
--
-- 1. Tarefas: o Manager (TEAM_SUPERVISE) atribui tarefas aos gestores que supervisiona e à sua equipa direta
--    (colaboradores sem gestor); não a si próprio nem à equipa de um gestor. O gestor distribui pela sua equipa
--    (e pode atribuir a si próprio). A
--    administração atribui a qualquer pessoa ativa. Um só responsável por tarefa (tasks.assignee_id), validado
--    no servidor em create_task e assign_task (private.assert_task_assignee) e refletido em list_work_people.
--    O gestor responsável por uma tarefa recebida pode distribuí-la pela sua equipa (assign_task).
-- 2. Responsável comercial de uma oportunidade: continua a ser escolhido no âmbito de gestão (manages_work_of),
--    com a sua própria lista (list_work_people('SCOPE')); deixa de partilhar a lista de responsáveis de tarefas.
-- 3. Reuniões: o Manager convida qualquer gestor ativo, mesmo sem âmbito configurado (convidar não dá acesso a
--    dados da equipa nem cria hierarquia). Os colaboradores (EMPLOYEE, IT) passam a agendar reuniões com colegas
--    (TIMESHEET_MEETING_CREATE), com as regras de convite de 20261015000000, e a pedir a participação da chefia.
-- 4. Ausências: o gestor decide os pedidos da equipa direta — aprova (encaminhando ao Manager quando o tipo o
--    exige) ou rejeita —, sempre com justificação. Gestores e Managers deixam de usar o pedido formal de
--    colaborador (TIMESHEET_ABSENCE_CREATE): comunicam a ausência (TIMESHEET_ABSENCE_NOTIFY, migration 20261015).
--    Os pedidos já existentes mantêm-se no seu fluxo e podem ser cancelados por quem os fez.
--
-- Depende de 20261015000000 (list_work_people com department_id, is_colleague, can_invite_to_meeting).
-- Sem tabelas novas, sem alterações de dados operacionais; pode ser aplicada mais de uma vez.

-- =============================================================================
-- 1. TAREFAS: QUEM PODE SER RESPONSÁVEL
-- =============================================================================
-- Fonte única da regra, usada pela validação no servidor e pela lista da interface.
CREATE OR REPLACE FUNCTION private.can_assign_task_to(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_profile_id IS NOT NULL
       AND private.is_active_profile(p_profile_id)
       AND (
           public.has_permission('ADMIN_ACCESS')
           OR CASE
               -- Manager: os gestores que supervisiona e a sua equipa direta (colaboradores que nenhum gestor
               -- abrange); nunca a si próprio nem a equipa de um gestor (essa recebe o trabalho do gestor).
               WHEN public.has_permission('TEAM_SUPERVISE') THEN
                   p_profile_id <> public.get_current_profile_id()
                   AND NOT private.profile_has_permission(p_profile_id, 'TEAM_SUPERVISE')
                   AND private.scope_covers(public.get_current_profile_id(), p_profile_id)
                   AND (private.profile_has_permission(p_profile_id, 'TEAM_READ')
                        OR cardinality(private.operational_leads(p_profile_id)) = 0)
               -- Gestor (e restantes perfis com TIMESHEET_TASK_ASSIGN): o próprio e a equipa do âmbito.
               ELSE private.manages_work_of(p_profile_id)
           END
       );
$$;

CREATE OR REPLACE FUNCTION private.assert_task_assignee(p_assignee_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT private.can_assign_task_to(p_assignee_id) THEN
        -- Mensagem própria só para quem está no âmbito do Manager (o próprio ou a equipa de um gestor).
        IF public.has_permission('TEAM_SUPERVISE') AND NOT public.has_permission('ADMIN_ACCESS')
           AND private.is_active_profile(p_assignee_id)
           AND (p_assignee_id = public.get_current_profile_id() OR public.is_manager_of_employee(p_assignee_id)) THEN
            RAISE EXCEPTION 'O Manager atribui tarefas aos gestores que supervisiona e à equipa direta sem gestor (não a si próprio nem à equipa de um gestor).'
                USING ERRCODE = '42501';
        END IF;
        RAISE EXCEPTION 'O responsável tem de ser um utilizador ativo do seu âmbito de gestão.' USING ERRCODE = '42501';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION private.can_assign_task_to(UUID) FROM PUBLIC, anon, authenticated;

-- Delegação: o gestor (TEAM_READ sem TEAM_SUPERVISE) que é responsável por uma tarefa em aberto pode passá-la a
-- alguém da sua equipa (a tarefa recebida do Manager é distribuída). Não ganha outros poderes sobre a tarefa
-- (editar, cancelar, reabrir continuam com quem a gere). As restantes regras não mudam.
CREATE OR REPLACE FUNCTION public.assign_task(p_task_id UUID, p_assignee_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
    v_after_closure BOOLEAN := v_task.status = 'COMPLETED';
    v_delegating BOOLEAN;
    v_note TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_ASSIGN', 'Não tem permissão para atribuir tarefas.');
    v_delegating := v_task.assignee_id = public.get_current_profile_id()
        AND public.has_permission('TEAM_READ') AND NOT public.has_permission('TEAM_SUPERVISE')
        AND v_task.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED');
    IF NOT (private.manages_task(v_task) OR v_delegating) THEN
        RAISE EXCEPTION 'Não pode atribuir esta tarefa: está fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'A tarefa está cancelada.';
    END IF;
    v_note := CASE WHEN v_after_closure
        THEN private.required_text(p_note, 5, 1000, 'Indique o motivo da alteração de uma tarefa concluída')
        ELSE private.optional_text(p_note, 1000, 'A nota') END;

    IF p_assignee_id IS NULL THEN
        IF NOT private.manages_task(v_task) THEN
            RAISE EXCEPTION 'Para distribuir a tarefa, escolha um colaborador da sua equipa.';
        END IF;
        IF v_task.status <> 'ASSIGNED' THEN
            RAISE EXCEPTION 'Só é possível retirar o responsável de uma tarefa ainda não iniciada.';
        END IF;
        UPDATE public.tasks SET assignee_id = NULL, status = 'PLANNED' WHERE id = p_task_id;
        PERFORM private.log_task_event(p_task_id, 'TASK_UNASSIGNED', 'assignee', private.profile_label(v_task.assignee_id), 'Sem responsável', v_note);
        RETURN;
    END IF;

    PERFORM private.assert_task_assignee(p_assignee_id);
    IF p_assignee_id = v_task.assignee_id THEN
        RAISE EXCEPTION 'A tarefa já está atribuída a este colaborador.';
    END IF;

    UPDATE public.tasks
    SET assignee_id = p_assignee_id,
        status = CASE WHEN status = 'PLANNED' THEN 'ASSIGNED' ELSE status END
    WHERE id = p_task_id;
    PERFORM private.log_task_event(p_task_id,
        CASE WHEN v_task.assignee_id IS NULL THEN 'TASK_ASSIGNED' ELSE 'TASK_REASSIGNED' END,
        'assignee', private.profile_label(v_task.assignee_id), private.profile_label(p_assignee_id), v_note, v_after_closure);
END;
$$;

-- =============================================================================
-- 2 e 3. LISTAS DE PESSOAS E CONVITES PARA REUNIÕES
-- =============================================================================
-- Convidar: as regras de 20261015000000 e, para quem supervisiona, qualquer gestor ativo.
CREATE OR REPLACE FUNCTION private.can_invite_to_meeting(p_profile_id UUID, p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('ADMIN_ACCESS')
        OR private.manages_work_of(p_profile_id)
        OR private.supervises(p_profile_id, public.get_current_profile_id())
        OR private.is_colleague(p_profile_id, public.get_current_profile_id())
        OR (public.has_permission('TEAM_SUPERVISE') AND private.profile_has_permission(p_profile_id, 'TEAM_READ'))
        OR EXISTS (
            SELECT 1 FROM public.meetings m
            WHERE m.id = p_meeting_id
              AND (
                  m.organizer_id = p_profile_id
                  OR EXISTS (SELECT 1 FROM public.tasks t
                             WHERE t.id = m.task_id AND p_profile_id IN (t.assignee_id, t.created_by))
                  OR EXISTS (SELECT 1 FROM public.opportunities o
                             WHERE o.id = m.opportunity_id
                               AND (o.owner_id = p_profile_id OR private.is_opportunity_member(o.id, p_profile_id)))
              )
        );
$$;

-- ASSIGNEE: responsáveis de tarefas (regra acima). SCOPE: o próprio e o âmbito de gestão (responsável comercial,
-- como create_opportunity e set_opportunity_owner; filtros das listas da equipa). MEETING: convidáveis (como can_invite_to_meeting,
-- sem o próprio). PARTICIPANT / TEAM_LEAD: diretório para a equipa do projeto (sem alterações).
CREATE OR REPLACE FUNCTION public.list_work_people(p_purpose TEXT DEFAULT 'PARTICIPANT')
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, department_name TEXT, job_description TEXT, department_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
BEGIN
    IF p_purpose = 'ASSIGNEE' THEN
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, p.job_description, p.department_id
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND private.can_assign_task_to(p.id)
        ORDER BY (p.id = v_me) DESC, p.full_name;
    ELSIF p_purpose = 'SCOPE' THEN
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, p.job_description, p.department_id
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND private.manages_work_of(p.id)
        ORDER BY (p.id = v_me) DESC, p.full_name;
    ELSIF p_purpose = 'MEETING' THEN
        PERFORM private.require_permission('TIMESHEET_MEETING_CREATE', 'Não tem permissão para organizar reuniões.');
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, NULL::TEXT, p.department_id
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND p.id <> v_me
          AND (public.has_permission('ADMIN_ACCESS') OR private.manages_work_of(p.id) OR private.supervises(p.id, v_me)
               OR private.is_colleague(p.id, v_me)
               OR (public.has_permission('TEAM_SUPERVISE') AND private.profile_has_permission(p.id, 'TEAM_READ')))
        ORDER BY p.full_name;
    ELSIF p_purpose IN ('PARTICIPANT', 'TEAM_LEAD') THEN
        IF NOT (public.has_permission('TIMESHEET_MEETING_CREATE') OR public.has_permission('TIMESHEET_OPPORTUNITY_UPDATE')) THEN
            RAISE EXCEPTION 'Não tem permissão para consultar o diretório.' USING ERRCODE = '42501';
        END IF;
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, NULL::TEXT, p.department_id
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND p.id <> v_me
          AND (p_purpose = 'PARTICIPANT' OR private.profile_has_permission(p.id, 'TEAM_READ'))
        ORDER BY p.full_name;
    ELSE
        RAISE EXCEPTION 'Finalidade inválida.';
    END IF;
END;
$$;

-- =============================================================================
-- 4. AUSÊNCIAS
-- =============================================================================
-- Decisão do gestor sobre um pedido da equipa direta, sempre justificada:
--   VALIDATED          aprova; segue para o Manager se o tipo exigir a sua decisão, senão fica aprovado
--   REJECTED           rejeita (decisão final; o colaborador é notificado com a justificação)
--   CHANGES_REQUESTED  devolve ao colaborador para correção
CREATE OR REPLACE FUNCTION public.validate_absence_request(p_request_id UUID, p_decision TEXT, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_request public.absence_requests%ROWTYPE;
    v_requires_manager BOOLEAN;
    v_comment TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_ABSENCE_VALIDATE', 'Não tem permissão para validar pedidos de ausência.');
    IF p_decision IS NULL OR p_decision NOT IN ('VALIDATED', 'REJECTED', 'CHANGES_REQUESTED') THEN
        RAISE EXCEPTION 'Decisão inválida.';
    END IF;

    SELECT * INTO v_request FROM public.absence_requests WHERE id = p_request_id FOR UPDATE;
    IF FOUND AND v_request.employee_id = v_actor THEN
        RAISE EXCEPTION 'Não pode validar o seu próprio pedido de ausência.' USING ERRCODE = '42501';
    END IF;
    IF NOT FOUND OR NOT (public.has_permission('ADMIN_ACCESS') OR private.scope_covers(v_actor, v_request.employee_id)) THEN
        RAISE EXCEPTION 'Pedido de ausência não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Só é possível decidir pedidos a aguardar a decisão do gestor (estado atual: %).',
            lower(private.absence_status_label(v_request.status));
    END IF;

    IF p_decision = 'CHANGES_REQUESTED' THEN
        v_comment := private.required_text(p_comment, 5, 1000, 'Indique o que deve ser corrigido');
        UPDATE public.absence_requests SET status = 'DRAFT', submitted_at = NULL, decision_comment = v_comment WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_CHANGES_REQUESTED', 'status',
            private.absence_status_label('SUBMITTED'), private.absence_status_label('DRAFT'), v_comment);
        RETURN;
    END IF;

    v_comment := private.required_text(p_comment, 3, 1000, 'Indique a justificação da decisão');

    IF p_decision = 'REJECTED' THEN
        UPDATE public.absence_requests
        SET status = 'REJECTED', validated_at = now(), validated_by = v_actor, validation_comment = v_comment,
            decided_at = now(), decided_by = v_actor, decision_comment = v_comment
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_REJECTED', 'status',
            private.absence_status_label('SUBMITTED'), private.absence_status_label('REJECTED'), v_comment);
        RETURN;
    END IF;

    SELECT requires_manager_approval INTO v_requires_manager FROM public.absence_types WHERE id = v_request.absence_type_id;

    IF v_requires_manager THEN
        UPDATE public.absence_requests
        SET status = 'PENDING_APPROVAL', validated_at = now(), validated_by = v_actor, validation_comment = v_comment
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_VALIDATED', 'status',
            private.absence_status_label('SUBMITTED'), private.absence_status_label('PENDING_APPROVAL'), v_comment);
    ELSE
        UPDATE public.absence_requests
        SET status = 'APPROVED', validated_at = now(), validated_by = v_actor, validation_comment = v_comment,
            decided_at = now(), decided_by = v_actor, decision_comment = v_comment
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_APPROVED', 'status',
            private.absence_status_label('SUBMITTED'), private.absence_status_label('APPROVED'),
            'Aprovado pelo gestor (este tipo não exige decisão do Manager). ' || v_comment);
    END IF;
END;
$$;

-- Quem gere equipa comunica a ausência (TIMESHEET_ABSENCE_NOTIFY); o pedido formal fica para os colaboradores.
-- Retira apenas a associação perfil → permissão; nenhum pedido existente é alterado.
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code IN ('GESTOR', 'MANAGER') AND p.code = 'TIMESHEET_ABSENCE_CREATE';

-- Reuniões entre colegas: os colaboradores agendam (sem aprovação) e podem pedir a participação da chefia.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = 'TIMESHEET_MEETING_CREATE'
WHERE r.code IN ('EMPLOYEE', 'IT')
ON CONFLICT (role_id, permission_id) DO NOTHING;

SELECT private.write_audit_event('permission.changed', 'role_permissions', NULL,
    'Responsabilidades por perfil: TIMESHEET_ABSENCE_CREATE retirada a GESTOR e MANAGER (comunicam a ausência com TIMESHEET_ABSENCE_NOTIFY); TIMESHEET_MEETING_CREATE atribuída a EMPLOYEE e IT (reuniões entre colegas).');

NOTIFY pgrst, 'reload schema';
