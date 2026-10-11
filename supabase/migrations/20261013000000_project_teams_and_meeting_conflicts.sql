-- TsheetGRT · SI Holdings — Equipas de projeto, responsáveis hierárquicos e conflitos de agenda
--
-- 1. Oportunidades: gestor de execução (opcional), distinto do responsável comercial.
--    Reutiliza opportunity_members com uma função (MEMBER | EXECUTION_LEAD): não há entidade de projeto nova.
--    O gestor de execução tem o acesso de um membro (consultar, comentar, registar tempo e ligar à
--    oportunidade tarefas da sua própria equipa); não ganha poderes de gestão comercial. As regras de
--    leitura e de gestão (can_read_opportunity / manages_opportunity) e as políticas RLS não mudam.
-- 2. Notificações da equipa do projeto com ligação ao registo e aviso a quem é retirado.
-- 3. Responsáveis hierárquicos de um utilizador (consulta; a atribuição continua em manager_scopes).
-- 4. Conflitos de agenda dos participantes de uma reunião: aviso antes de confirmar, nunca bloqueio.

-- =============================================================================
-- 1. GESTOR DE EXECUÇÃO
-- =============================================================================
ALTER TABLE public.opportunity_members
    ADD COLUMN member_role VARCHAR(20) NOT NULL DEFAULT 'MEMBER'
        CONSTRAINT opportunity_members_role_valid CHECK (member_role IN ('MEMBER', 'EXECUTION_LEAD'));

CREATE UNIQUE INDEX opportunity_members_one_execution_lead
    ON public.opportunity_members (opportunity_id) WHERE member_role = 'EXECUTION_LEAD';

ALTER TABLE public.opportunity_events
    DROP CONSTRAINT opportunity_events_type_valid,
    ADD CONSTRAINT opportunity_events_type_valid CHECK (event_type IN (
        'OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_OWNER_CHANGED',
        'OPPORTUNITY_MEMBER_ADDED', 'OPPORTUNITY_MEMBER_REMOVED', 'OPPORTUNITY_COMMENT_ADDED',
        'OPPORTUNITY_WON', 'OPPORTUNITY_LOST', 'OPPORTUNITY_CANCELLED', 'OPPORTUNITY_REOPENED',
        'OPPORTUNITY_ATTACHMENT_ADDED', 'OPPORTUNITY_ATTACHMENT_REMOVED',
        'OPPORTUNITY_APPROVAL_REQUESTED', 'OPPORTUNITY_APPROVED', 'OPPORTUNITY_APPROVAL_REJECTED', 'OPPORTUNITY_APPROVAL_CANCELLED',
        'OPPORTUNITY_EXECUTION_LEAD_CHANGED'
    ));

-- Define, substitui ou retira (p_profile_id NULL) o gestor de execução. O anterior continua na equipa.
CREATE FUNCTION public.set_opportunity_execution_lead(p_opportunity_id UUID, p_profile_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
    v_actor UUID := private.require_actor();
    v_current UUID;
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para alterar oportunidades.');
    IF NOT private.manages_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a oportunidade pode definir o gestor de execução.' USING ERRCODE = '42501';
    END IF;
    IF v_opportunity.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'A oportunidade está cancelada.';
    END IF;

    SELECT profile_id INTO v_current
    FROM public.opportunity_members
    WHERE opportunity_id = p_opportunity_id AND member_role = 'EXECUTION_LEAD';

    IF p_profile_id IS NULL AND v_current IS NULL THEN
        RAISE EXCEPTION 'A oportunidade não tem gestor de execução.';
    END IF;
    IF p_profile_id IS NOT NULL THEN
        IF p_profile_id = v_current THEN
            RAISE EXCEPTION 'Esta pessoa já é o gestor de execução.';
        END IF;
        IF p_profile_id = v_opportunity.owner_id THEN
            RAISE EXCEPTION 'O responsável comercial já coordena a oportunidade: escolha outra pessoa para a execução.';
        END IF;
        IF NOT private.is_active_profile(p_profile_id) THEN
            RAISE EXCEPTION 'O gestor de execução tem de ser um utilizador ativo.';
        END IF;
        IF NOT private.profile_has_permission(p_profile_id, 'TEAM_READ') THEN
            RAISE EXCEPTION 'O gestor de execução tem de ter um perfil de gestão de equipa (GESTOR ou MANAGER).';
        END IF;
    END IF;

    UPDATE public.opportunity_members SET member_role = 'MEMBER'
    WHERE opportunity_id = p_opportunity_id AND member_role = 'EXECUTION_LEAD';

    IF p_profile_id IS NOT NULL THEN
        INSERT INTO public.opportunity_members (opportunity_id, profile_id, added_by, member_role)
        VALUES (p_opportunity_id, p_profile_id, v_actor, 'EXECUTION_LEAD')
        ON CONFLICT (opportunity_id, profile_id) DO UPDATE SET member_role = 'EXECUTION_LEAD';
        PERFORM private.notify(ARRAY[p_profile_id], v_actor, 'OPPORTUNITY_ASSIGNED', 'Gestor de execução de uma oportunidade',
            v_opportunity.reference || ' — ' || v_opportunity.title, '/timesheet/opportunities/' || p_opportunity_id);
    END IF;

    PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_EXECUTION_LEAD_CHANGED', 'execution_lead',
        CASE WHEN v_current IS NULL THEN NULL ELSE private.profile_label(v_current) END,
        CASE WHEN p_profile_id IS NULL THEN NULL ELSE private.profile_label(p_profile_id) END,
        private.optional_text(p_note, 1000, 'A nota'));
END;
$$;

-- Diretório de pessoas: acrescenta a finalidade TEAM_LEAD (quem pode ser gestor de execução), com a
-- mesma permissão do diretório de participantes. As restantes finalidades mantêm-se inalteradas.
CREATE OR REPLACE FUNCTION public.list_work_people(p_purpose TEXT DEFAULT 'PARTICIPANT')
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, department_name TEXT, job_description TEXT)
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
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, p.job_description
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND private.manages_work_of(p.id)
        ORDER BY (p.id = v_me) DESC, p.full_name;
    ELSIF p_purpose = 'MEETING' THEN
        PERFORM private.require_permission('TIMESHEET_MEETING_CREATE', 'Não tem permissão para organizar reuniões.');
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, NULL::TEXT
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND p.id <> v_me
          AND (public.has_permission('ADMIN_ACCESS') OR private.manages_work_of(p.id) OR private.supervises(p.id, v_me))
        ORDER BY p.full_name;
    ELSIF p_purpose IN ('PARTICIPANT', 'TEAM_LEAD') THEN
        IF NOT (public.has_permission('TIMESHEET_MEETING_CREATE') OR public.has_permission('TIMESHEET_OPPORTUNITY_UPDATE')) THEN
            RAISE EXCEPTION 'Não tem permissão para consultar o diretório.' USING ERRCODE = '42501';
        END IF;
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, NULL::TEXT
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
-- 2. MEMBROS: NOTIFICAÇÃO COM LIGAÇÃO E AVISO DE REMOÇÃO
-- =============================================================================
CREATE OR REPLACE FUNCTION public.add_opportunity_member(p_opportunity_id UUID, p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para alterar oportunidades.');
    IF NOT private.manages_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a oportunidade pode acrescentar membros.' USING ERRCODE = '42501';
    END IF;
    IF v_opportunity.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'A oportunidade está cancelada.';
    END IF;
    IF NOT private.is_active_profile(p_profile_id) THEN
        RAISE EXCEPTION 'O membro tem de ser um utilizador ativo.';
    END IF;
    IF p_profile_id = v_opportunity.owner_id OR private.is_opportunity_member(p_opportunity_id, p_profile_id) THEN
        RAISE EXCEPTION 'Este colaborador já trabalha nesta oportunidade.';
    END IF;
    INSERT INTO public.opportunity_members (opportunity_id, profile_id, added_by)
    VALUES (p_opportunity_id, p_profile_id, public.get_current_profile_id());
    PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_MEMBER_ADDED', 'member', NULL,
        private.profile_label(p_profile_id), NULL);
    PERFORM private.notify(ARRAY[p_profile_id], public.get_current_profile_id(), 'OPPORTUNITY_ASSIGNED',
        'Foi adicionado a uma oportunidade', v_opportunity.reference || ' — ' || v_opportunity.title,
        '/timesheet/opportunities/' || p_opportunity_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_opportunity_member(p_opportunity_id UUID, p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para alterar oportunidades.');
    IF NOT private.manages_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a oportunidade pode retirar membros.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.opportunity_members WHERE opportunity_id = p_opportunity_id AND profile_id = p_profile_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Este colaborador não é membro da oportunidade.';
    END IF;
    PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_MEMBER_REMOVED', 'member',
        private.profile_label(p_profile_id), NULL, NULL);
    -- Sem ligação: quem sai pode deixar de ter acesso ao registo.
    PERFORM private.notify(ARRAY[p_profile_id], public.get_current_profile_id(), 'OPPORTUNITY_UPDATED',
        'Retirado de uma oportunidade', v_opportunity.reference || ' — ' || v_opportunity.title, NULL);
END;
$$;

-- Responsável, gestor de execução e membros de uma oportunidade visível.
DROP FUNCTION public.get_opportunity_people(UUID);

CREATE FUNCTION public.get_opportunity_people(p_opportunity_id UUID)
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, is_owner BOOLEAN, member_role TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE;
BEGIN
    PERFORM private.require_actor();
    SELECT * INTO v_opportunity FROM public.opportunities WHERE id = p_opportunity_id;
    IF NOT FOUND OR NOT private.can_read_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Oportunidade não encontrada.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, p.id = v_opportunity.owner_id,
           CASE WHEN p.id = v_opportunity.owner_id THEN 'OWNER' ELSE om.member_role::TEXT END
    FROM public.profiles p
    LEFT JOIN public.opportunity_members om ON om.opportunity_id = p_opportunity_id AND om.profile_id = p.id
    WHERE p.id = v_opportunity.owner_id OR om.profile_id IS NOT NULL
    ORDER BY (p.id = v_opportunity.owner_id) DESC, (om.member_role = 'EXECUTION_LEAD') DESC, p.full_name;
END;
$$;

-- =============================================================================
-- 3. RESPONSÁVEIS HIERÁRQUICOS DE UM UTILIZADOR
-- =============================================================================
-- Mesma regra de private.scope_covers / private.supervises: gestores diretos (âmbito individual ou por
-- departamento) e, um nível acima, os Managers que supervisionam esses gestores.
CREATE FUNCTION public.get_profile_leads(p_profile_id UUID)
RETURNS TABLE (manager_id UUID, full_name TEXT, role_code TEXT, is_active BOOLEAN, relation TEXT, via TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
BEGIN
    IF NOT (p_profile_id = v_me OR public.has_permission('USERS_READ') OR public.is_manager_of_employee(p_profile_id)) THEN
        RAISE EXCEPTION 'Não tem permissão para consultar a hierarquia deste utilizador.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    WITH leads AS (
        SELECT DISTINCT ON (ms.manager_id)
               ms.manager_id,
               CASE WHEN ms.employee_id IS NOT NULL THEN 'Atribuição individual'
                    ELSE 'Departamento ' || d.name END AS via
        FROM public.manager_scopes ms
        LEFT JOIN public.departments d ON d.id = ms.department_id
        WHERE (ms.employee_id = p_profile_id
               OR ms.department_id = (SELECT p.department_id FROM public.profiles p WHERE p.id = p_profile_id))
          AND private.profile_has_permission(ms.manager_id, 'TEAM_READ')
          AND private.scope_covers(ms.manager_id, p_profile_id)
        ORDER BY ms.manager_id, (ms.employee_id IS NOT NULL) DESC
    ),
    supervisors AS (
        SELECT DISTINCT ON (ms.manager_id) ms.manager_id, 'Supervisiona ' || lead.full_name AS via
        FROM leads l
        JOIN public.profiles lead ON lead.id = l.manager_id
        JOIN public.user_roles lur ON lur.user_id = lead.id
        JOIN public.roles lr ON lr.id = lur.role_id AND lr.code = 'GESTOR'
        JOIN public.manager_scopes ms ON ms.employee_id = lead.id
        WHERE ms.manager_id <> p_profile_id
          AND private.profile_has_permission(ms.manager_id, 'TEAM_READ')
          AND ms.manager_id NOT IN (SELECT l2.manager_id FROM leads l2)
        ORDER BY ms.manager_id, lead.full_name
    )
    SELECT p.id, p.full_name::TEXT, r.code::TEXT, p.is_active, 'LEAD'::TEXT, l.via::TEXT
    FROM leads l
    JOIN public.profiles p ON p.id = l.manager_id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    UNION ALL
    SELECT p.id, p.full_name::TEXT, r.code::TEXT, p.is_active, 'SUPERVISOR'::TEXT, s.via::TEXT
    FROM supervisors s
    JOIN public.profiles p ON p.id = s.manager_id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    ORDER BY 5, 2;
END;
$$;

-- =============================================================================
-- 4. CONFLITOS DE AGENDA
-- =============================================================================
-- Reuniões ativas e ausências aprovadas que se sobrepõem ao intervalo, para as pessoas que quem organiza
-- pode convidar (não serve para consultar a agenda de qualquer pessoa). O título só aparece se quem
-- pergunta puder ver a reunião; caso contrário indica-se apenas o período ocupado.
-- Minimização: o intervalo tem no máximo 24 horas (a duração máxima de uma reunião), para não permitir
-- extrair a agenda de alguém por períodos longos, e a ausência só é indicada nos dias consultados.
CREATE FUNCTION public.get_schedule_conflicts(
    p_profile_ids UUID[],
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_exclude_meeting_id UUID DEFAULT NULL,
    p_task_id UUID DEFAULT NULL,
    p_opportunity_id UUID DEFAULT NULL
)
RETURNS TABLE (
    profile_id UUID,
    full_name TEXT,
    conflict_type TEXT,
    meeting_id UUID,
    title TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_meeting public.meetings%ROWTYPE;
    v_people UUID[];
    v_first_day DATE := (p_starts_at AT TIME ZONE 'Africa/Maputo')::DATE;
    v_last_day DATE := (p_ends_at AT TIME ZONE 'Africa/Maputo')::DATE;
BEGIN
    PERFORM private.require_permission('TIMESHEET_MEETING_CREATE', 'Não tem permissão para organizar reuniões.');
    IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'A reunião tem de terminar depois de começar.';
    END IF;
    IF p_ends_at - p_starts_at > interval '24 hours' THEN
        RAISE EXCEPTION 'Uma reunião não pode durar mais de 24 horas.';
    END IF;
    IF cardinality(coalesce(p_profile_ids, ARRAY[]::UUID[])) > 51 THEN
        RAISE EXCEPTION 'Uma reunião não pode ter mais de 50 participantes.';
    END IF;
    IF p_exclude_meeting_id IS NOT NULL THEN
        SELECT * INTO v_meeting FROM public.meetings WHERE id = p_exclude_meeting_id;
        IF NOT FOUND OR NOT private.manages_meeting(v_meeting) THEN
            RAISE EXCEPTION 'Reunião não encontrada.' USING ERRCODE = '42501';
        END IF;
    END IF;

    v_people := ARRAY(
        SELECT DISTINCT person
        FROM unnest(coalesce(p_profile_ids, ARRAY[]::UUID[])) AS person
        WHERE person IS NOT NULL
          AND private.is_active_profile(person)
          AND (
              person = v_me
              OR private.can_invite_to_meeting(person, p_exclude_meeting_id)
              OR (p_exclude_meeting_id IS NOT NULL AND private.is_meeting_participant(p_exclude_meeting_id, person))
              OR EXISTS (SELECT 1 FROM public.tasks t
                         WHERE t.id = p_task_id AND private.can_read_task(t) AND person IN (t.assignee_id, t.created_by))
              OR EXISTS (SELECT 1 FROM public.opportunities o
                         WHERE o.id = p_opportunity_id AND private.can_read_opportunity(o)
                           AND (o.owner_id = person OR private.is_opportunity_member(o.id, person)))
          )
    );

    RETURN QUERY
    SELECT conflicts.profile_id, conflicts.full_name, conflicts.conflict_type, conflicts.meeting_id,
           conflicts.title, conflicts.starts_at, conflicts.ends_at
    FROM (
        SELECT p.id AS profile_id, p.full_name::TEXT AS full_name, 'MEETING'::TEXT AS conflict_type,
               CASE WHEN private.can_read_meeting(m) THEN m.id END AS meeting_id,
               CASE WHEN private.can_read_meeting(m) THEN m.title::TEXT END AS title,
               m.starts_at, m.ends_at
        FROM unnest(v_people) AS person
        JOIN public.profiles p ON p.id = person
        JOIN public.meetings m
          ON m.organizer_id = person
          OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = m.id AND mp.profile_id = person)
        WHERE m.status IN ('PLANNED', 'CONFIRMED')
          AND m.id IS DISTINCT FROM p_exclude_meeting_id
          AND m.starts_at < p_ends_at
          AND m.ends_at > p_starts_at
        UNION ALL
        SELECT p.id, p.full_name::TEXT, 'ABSENCE'::TEXT, NULL::UUID, NULL::TEXT,
               (greatest(a.start_date, v_first_day)::TIMESTAMP AT TIME ZONE 'Africa/Maputo'),
               ((least(a.end_date, v_last_day) + 1)::TIMESTAMP AT TIME ZONE 'Africa/Maputo')
        FROM unnest(v_people) AS person
        JOIN public.profiles p ON p.id = person
        JOIN public.absence_requests a ON a.employee_id = person
        WHERE a.status = 'APPROVED'
          AND a.start_date <= v_last_day
          AND a.end_date >= v_first_day
    ) AS conflicts
    ORDER BY conflicts.full_name, conflicts.starts_at;
END;
$$;

-- =============================================================================
-- 5. PRIVILÉGIOS
-- =============================================================================
REVOKE EXECUTE ON FUNCTION
    public.set_opportunity_execution_lead(UUID, UUID, TEXT),
    public.get_opportunity_people(UUID),
    public.get_profile_leads(UUID),
    public.get_schedule_conflicts(UUID[], TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID)
FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.set_opportunity_execution_lead(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_opportunity_people(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_profile_leads(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_schedule_conflicts(UUID[], TIMESTAMPTZ, TIMESTAMPTZ, UUID, UUID, UUID) TO authenticated;
