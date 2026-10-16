-- TsheetGRT · SI Holdings — Equipas de projeto nas vistas da equipa e delegação de tarefas
--
-- 1. Equipa de projeto ≠ hierarquia. Quem é responsável de uma oportunidade (owner) ou o seu gestor de execução
--    (opportunity_members.member_role = EXECUTION_LEAD) passa a ver os membros desse projeto ativo: perfil
--    (RLS de profiles), carga do projeto (get_project_team_overview) e, para os colaboradores comuns, a
--    possibilidade de lhes atribuir tarefas. Não cria registos em manager_scopes nem dá acesso a timesheets,
--    ausências ou aprovações: essas continuam a depender da hierarquia formal configurada pela administração.
--    Um projeto cancelado ou perdido deixa de contar; um membro retirado deixa de contar de imediato.
-- 2. Responsáveis de tarefas (private.can_assign_task_to, usado por create_task, assign_task e list_work_people):
--    ninguém se atribui a si próprio (exceto a administração);
--    Manager → gestores que supervisiona ou que coordenam projetos seus, e a equipa direta sem gestor;
--    Gestor  → colaboradores comuns da sua equipa formal ou dos projetos que coordena (de qualquer departamento).
-- 3. Delegação: tasks.assigned_by guarda quem atribuiu (além de created_by e assignee_id; o histórico continua em
--    task_events). Quem delegou continua a ver e a acompanhar a tarefa.
-- 4. Definição protegida: numa tarefa criada por quem supervisiona (Manager ou administração) para outra pessoa
--    (tasks.definition_locked), só quem a criou ou a administração altera título, descrição, prioridade, prazos,
--    estimativa, ligações, cancela ou reabre. O gestor que a recebe distribui-a e acompanha a execução.
-- 5. Listas: TEAM_LEAD (gestor de execução de um projeto) só gestores; PARTICIPANT (membros de projeto) só
--    colaboradores comuns.
--
-- Nenhum registo existente é apagado. As colunas novas são preenchidas a partir do histórico existente sem
-- alterar updated_at.

-- =============================================================================
-- 1. COLUNAS DE DELEGAÇÃO
-- =============================================================================
ALTER TABLE public.tasks
    ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS definition_locked BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.tasks.assigned_by IS 'Quem atribuiu o responsável atual (delegação). O histórico completo está em task_events.';
COMMENT ON COLUMN public.tasks.definition_locked IS
    'Tarefa delegada por quem supervisiona: só quem a criou ou a administração altera a definição, cancela ou reabre.';

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON public.tasks(assigned_by) WHERE assigned_by IS NOT NULL;

-- Preenchimento a partir do histórico, sem mexer em updated_at (versão usada no controlo de concorrência).
ALTER TABLE public.tasks DISABLE TRIGGER trg_tasks_updated_at;
ALTER TABLE public.tasks DISABLE TRIGGER trg_tasks_review_reset;

UPDATE public.tasks t
SET assigned_by = coalesce(
        (SELECT e.actor_id FROM public.task_events e
         WHERE e.task_id = t.id AND e.event_type IN ('TASK_ASSIGNED', 'TASK_REASSIGNED') AND e.actor_id IS NOT NULL
         ORDER BY e.created_at DESC LIMIT 1),
        t.created_by)
WHERE t.assigned_by IS NULL AND t.assignee_id IS NOT NULL;

UPDATE public.tasks t
SET definition_locked = true
WHERE NOT t.definition_locked
  AND t.assignee_id IS DISTINCT FROM t.created_by
  AND private.profile_has_permission(t.created_by, 'TEAM_SUPERVISE');

ALTER TABLE public.tasks ENABLE TRIGGER trg_tasks_updated_at;
ALTER TABLE public.tasks ENABLE TRIGGER trg_tasks_review_reset;

-- Regista quem atribui e protege a definição em qualquer escrita (também nas funções existentes).
CREATE OR REPLACE FUNCTION private.guard_task_delegation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := public.get_current_profile_id();
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.assigned_by := CASE WHEN NEW.assignee_id IS NULL THEN NULL ELSE coalesce(v_actor, NEW.created_by) END;
        NEW.definition_locked := NEW.assignee_id IS DISTINCT FROM NEW.created_by
            AND private.profile_has_permission(NEW.created_by, 'TEAM_SUPERVISE');
        RETURN NEW;
    END IF;

    -- A marca de proteção e o criador não mudam depois da criação.
    NEW.definition_locked := OLD.definition_locked;
    NEW.created_by := OLD.created_by;
    IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
        NEW.assigned_by := CASE WHEN NEW.assignee_id IS NULL THEN NULL ELSE coalesce(v_actor, OLD.assigned_by) END;
    ELSE
        NEW.assigned_by := OLD.assigned_by;
    END IF;

    IF OLD.definition_locked AND v_actor IS NOT NULL AND v_actor <> OLD.created_by AND NOT public.has_permission('ADMIN_ACCESS')
       AND (NEW.title IS DISTINCT FROM OLD.title
            OR NEW.description IS DISTINCT FROM OLD.description
            OR NEW.priority IS DISTINCT FROM OLD.priority
            OR NEW.due_at IS DISTINCT FROM OLD.due_at
            OR NEW.start_date IS DISTINCT FROM OLD.start_date
            OR NEW.estimated_minutes IS DISTINCT FROM OLD.estimated_minutes
            OR NEW.department_id IS DISTINCT FROM OLD.department_id
            OR NEW.requires_manager_review IS DISTINCT FROM OLD.requires_manager_review
            OR NEW.parent_task_id IS DISTINCT FROM OLD.parent_task_id
            OR NEW.opportunity_id IS DISTINCT FROM OLD.opportunity_id
            OR NEW.meeting_id IS DISTINCT FROM OLD.meeting_id
            OR (NEW.status = 'CANCELLED' AND OLD.status <> 'CANCELLED')
            OR (OLD.status = 'COMPLETED' AND NEW.status <> 'COMPLETED')) THEN
        RAISE EXCEPTION 'Esta tarefa foi delegada por quem a criou: só essa pessoa ou a administração altera a definição, cancela ou reabre.'
            USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tasks_delegation ON public.tasks;
CREATE TRIGGER trg_tasks_delegation
    BEFORE INSERT OR UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION private.guard_task_delegation();

REVOKE ALL ON FUNCTION private.guard_task_delegation() FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. EQUIPA DE PROJETO
-- =============================================================================
-- p_lead coordena um projeto ativo (responsável ou gestor de execução) de que p_profile é membro.
CREATE OR REPLACE FUNCTION private.leads_project(p_lead UUID, p_profile UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_lead IS NOT NULL AND p_profile IS NOT NULL AND p_lead <> p_profile
       AND EXISTS (
           SELECT 1
           FROM public.opportunities o
           JOIN public.opportunity_members member ON member.opportunity_id = o.id AND member.profile_id = p_profile
           WHERE o.status NOT IN ('CANCELLED', 'LOST')
             AND (o.owner_id = p_lead
                  OR EXISTS (SELECT 1 FROM public.opportunity_members lead
                             WHERE lead.opportunity_id = o.id AND lead.profile_id = p_lead AND lead.member_role = 'EXECUTION_LEAD'))
       );
$$;

REVOKE ALL ON FUNCTION private.leads_project(UUID, UUID) FROM PUBLIC, anon;
-- Chamada pela política RLS de profiles (avaliada com os privilégios de quem consulta).
GRANT EXECUTE ON FUNCTION private.leads_project(UUID, UUID) TO authenticated;

-- Perfis: além do próprio, da administração de utilizadores e da equipa formal, os membros dos projetos que coordena.
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
    FOR SELECT TO authenticated
    USING (
        auth_user_id = (SELECT auth.uid())
        OR (SELECT public.has_permission('USERS_READ'))
        OR ((SELECT public.has_permission('TEAM_READ')) AND public.is_manager_of_employee(id))
        OR ((SELECT public.has_permission('TEAM_READ')) AND private.leads_project((SELECT public.get_current_profile_id()), id))
    );

-- Carga da equipa de projeto: uma linha por membro e projeto. Só o que diz respeito ao projeto (tarefas ligadas a
-- ele ou atribuídas por quem consulta) e a indicação de ausência hoje, sem o tipo.
CREATE OR REPLACE FUNCTION public.get_project_team_overview()
RETURNS TABLE (
    profile_id UUID, full_name TEXT, job_title TEXT, department_name TEXT, is_lead BOOLEAN,
    project_role TEXT, opportunity_id UUID, opportunity_reference TEXT, opportunity_title TEXT,
    tasks_open INTEGER, tasks_overdue INTEGER, absent_today BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_today DATE := private.local_today();
BEGIN
    PERFORM private.require_permission('TEAM_READ', 'Não tem permissão para consultar a equipa.');
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT,
        private.profile_has_permission(p.id, 'TEAM_READ'),
        om.member_role::TEXT, o.id, o.reference::TEXT, o.title::TEXT,
        (SELECT count(*) FROM public.tasks t
         WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
           AND (t.opportunity_id = o.id OR v_me IN (t.created_by, t.assigned_by)))::INTEGER,
        (SELECT count(*) FROM public.tasks t
         WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now()
           AND (t.opportunity_id = o.id OR v_me IN (t.created_by, t.assigned_by)))::INTEGER,
        EXISTS (SELECT 1 FROM public.absence_requests a
                WHERE a.employee_id = p.id AND a.status IN ('APPROVED', 'COMMUNICATED')
                  AND v_today BETWEEN a.start_date AND a.end_date)
    FROM public.opportunities o
    JOIN public.opportunity_members om ON om.opportunity_id = o.id
    JOIN public.profiles p ON p.id = om.profile_id AND p.is_active AND p.id <> v_me
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE o.status NOT IN ('CANCELLED', 'LOST')
      AND (o.owner_id = v_me
           OR EXISTS (SELECT 1 FROM public.opportunity_members lead
                      WHERE lead.opportunity_id = o.id AND lead.profile_id = v_me AND lead.member_role = 'EXECUTION_LEAD'))
    ORDER BY o.reference, (om.member_role = 'EXECUTION_LEAD') DESC, p.full_name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_team_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_project_team_overview() TO authenticated;

-- =============================================================================
-- 3. RESPONSÁVEIS DE TAREFAS, LEITURA E GESTÃO
-- =============================================================================
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
           OR (
               public.has_permission('TIMESHEET_TASK_ASSIGN')
               AND p_profile_id <> public.get_current_profile_id()
               AND NOT private.profile_has_permission(p_profile_id, 'TEAM_SUPERVISE')
               AND CASE
                   -- Manager: gestores que supervisiona ou que coordenam projetos seus; equipa direta sem gestor.
                   WHEN public.has_permission('TEAM_SUPERVISE') THEN
                       (private.profile_has_permission(p_profile_id, 'TEAM_READ')
                        AND (private.scope_covers(public.get_current_profile_id(), p_profile_id)
                             OR private.leads_project(public.get_current_profile_id(), p_profile_id)))
                       OR (NOT private.profile_has_permission(p_profile_id, 'TEAM_READ')
                           AND private.scope_covers(public.get_current_profile_id(), p_profile_id)
                           AND cardinality(private.operational_leads(p_profile_id)) = 0)
                   -- Gestor: colaboradores comuns da equipa formal ou dos projetos que coordena.
                   ELSE NOT private.profile_has_permission(p_profile_id, 'TEAM_READ')
                        AND (public.is_manager_of_employee(p_profile_id)
                             OR private.leads_project(public.get_current_profile_id(), p_profile_id))
               END
           )
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
        IF p_assignee_id = public.get_current_profile_id() AND NOT public.has_permission('ADMIN_ACCESS') THEN
            RAISE EXCEPTION 'Não pode atribuir tarefas a si próprio: escolha a pessoa que as vai executar.' USING ERRCODE = '42501';
        END IF;
        -- Mensagem própria só para quem está no âmbito do Manager (a equipa de um gestor).
        IF public.has_permission('TEAM_SUPERVISE') AND NOT public.has_permission('ADMIN_ACCESS')
           AND private.is_active_profile(p_assignee_id) AND public.is_manager_of_employee(p_assignee_id) THEN
            RAISE EXCEPTION 'O Manager atribui tarefas aos gestores (e à equipa direta sem gestor), não à equipa de um gestor.'
                USING ERRCODE = '42501';
        END IF;
        RAISE EXCEPTION 'O responsável tem de ser um utilizador ativo do seu âmbito de gestão ou dos projetos que coordena.' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- Quem delegou continua a ver a tarefa e a acompanhá-la (redistribuir, validar a conclusão). A definição de uma
-- tarefa protegida continua reservada a quem a criou (trigger acima).
CREATE OR REPLACE FUNCTION private.can_read_task(p_task public.tasks)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('TIMESHEET_TASK_READ') AND (
        p_task.assignee_id = public.get_current_profile_id()
        OR p_task.created_by = public.get_current_profile_id()
        OR p_task.assigned_by = public.get_current_profile_id()
        OR (public.has_permission('TEAM_READ') AND p_task.assignee_id IS NOT NULL
            AND public.is_manager_of_employee(p_task.assignee_id))
        OR public.has_permission('ADMIN_ACCESS')
        OR (p_task.opportunity_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.opportunities o
            WHERE o.id = p_task.opportunity_id AND o.owner_id = public.get_current_profile_id()
        ))
    );
$$;

CREATE OR REPLACE FUNCTION private.manages_task(p_task public.tasks)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('ADMIN_ACCESS')
        OR p_task.created_by = public.get_current_profile_id()
        OR (p_task.assigned_by = public.get_current_profile_id() AND public.has_permission('TIMESHEET_TASK_ASSIGN'))
        OR (p_task.assignee_id IS NOT NULL AND public.is_manager_of_employee(p_task.assignee_id));
$$;

DROP POLICY IF EXISTS tasks_select ON public.tasks;
CREATE POLICY tasks_select ON public.tasks
    FOR SELECT TO authenticated
    USING (
        (SELECT public.has_permission('TIMESHEET_TASK_READ'))
        AND (
            assignee_id = (SELECT public.get_current_profile_id())
            OR created_by = (SELECT public.get_current_profile_id())
            OR assigned_by = (SELECT public.get_current_profile_id())
            OR ((SELECT public.has_permission('TEAM_READ')) AND assignee_id IS NOT NULL AND public.is_manager_of_employee(assignee_id))
            OR (SELECT public.has_permission('ADMIN_ACCESS'))
            OR (opportunity_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM public.opportunities o
                WHERE o.id = tasks.opportunity_id AND o.owner_id = (SELECT public.get_current_profile_id())
            ))
        )
    );

-- =============================================================================
-- 4. LISTAS DE PESSOAS
-- =============================================================================
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
        ORDER BY p.full_name;
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
        -- TEAM_LEAD: gestores (coordenam a execução de um projeto). PARTICIPANT: colaboradores comuns.
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, NULL::TEXT, p.department_id
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND p.id <> v_me
          AND CASE WHEN p_purpose = 'TEAM_LEAD'
                   THEN private.profile_has_permission(p.id, 'TEAM_READ') AND NOT private.profile_has_permission(p.id, 'TEAM_SUPERVISE')
                   ELSE NOT private.profile_has_permission(p.id, 'TEAM_READ') END
        ORDER BY p.full_name;
    ELSE
        RAISE EXCEPTION 'Finalidade inválida.';
    END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
