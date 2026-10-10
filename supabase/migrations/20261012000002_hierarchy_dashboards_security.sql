-- TsheetGRT · SI Holdings — Hierarquia organizacional (3/3): painéis, relatórios, RLS e privilégios
--
-- Os indicadores dos painéis do Gestor e do Manager são calculados no servidor, sempre limitados ao
-- âmbito de quem consulta (private.supervises; a administração vê a organização inteira).

-- =============================================================================
-- 1. EQUIPA DO ÂMBITO
-- =============================================================================
-- Conjunto de pessoas que quem chama gere ou supervisiona (exclui o próprio e os administradores).
CREATE FUNCTION private.team_member_ids(p_viewer_id UUID)
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id
    FROM public.profiles p
    WHERE p.is_active
      AND p.id <> p_viewer_id
      AND NOT private.is_admin_profile(p.id)
      AND (private.supervises(p_viewer_id, p.id) OR private.profile_has_permission(p_viewer_id, 'ADMIN_ACCESS'));
$$;

-- Os membros diretos do gestor (lead) ou, para lead NULL, toda a equipa do âmbito; com filtro de departamento.
CREATE FUNCTION private.report_member_ids(p_viewer_id UUID, p_department_id UUID, p_lead_id UUID)
RETURNS SETOF UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF p_lead_id IS NOT NULL AND p_lead_id <> p_viewer_id
       AND NOT (private.profile_has_permission(p_viewer_id, 'ADMIN_ACCESS') OR private.supervises(p_viewer_id, p_lead_id)) THEN
        RAISE EXCEPTION 'Gestor fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT member.id
    FROM private.team_member_ids(p_viewer_id) AS member(id)
    JOIN public.profiles p ON p.id = member.id
    WHERE (p_department_id IS NULL OR p.department_id = p_department_id)
      AND (p_lead_id IS NULL OR member.id = p_lead_id OR private.scope_covers(p_lead_id, member.id));
END;
$$;

CREATE FUNCTION private.assert_report_period(p_from DATE, p_to DATE)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 366 THEN
        RAISE EXCEPTION 'Período inválido (máximo de um ano).';
    END IF;
END;
$$;

-- Carga de trabalho por pessoa da equipa, com cargo, descrição da função e gestor direto.
DROP FUNCTION public.get_team_work_overview();

CREATE FUNCTION public.get_team_work_overview()
RETURNS TABLE (
    profile_id UUID,
    full_name TEXT,
    job_title TEXT,
    job_description TEXT,
    department_name TEXT,
    role_code TEXT,
    lead_names TEXT,
    is_direct BOOLEAN,
    tasks_open INTEGER,
    tasks_in_progress INTEGER,
    tasks_blocked INTEGER,
    tasks_overdue INTEGER,
    tasks_due_next_7_days INTEGER,
    tasks_completed_30_days INTEGER,
    opportunities_active INTEGER,
    minutes_this_week INTEGER,
    last_activity_date DATE,
    absence_today TEXT,
    pending_absence_requests INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_today DATE := private.local_today();
    v_week_start DATE := v_today - (extract(isodow FROM v_today)::INTEGER - 1);
BEGIN
    PERFORM private.require_permission('TEAM_READ', 'Não tem permissão para consultar a equipa.');
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, p.job_description, d.name::TEXT, r.code::TEXT,
        (SELECT string_agg(lead.full_name, ', ' ORDER BY lead.full_name) FROM public.profiles lead
            WHERE lead.id = ANY (private.operational_leads(p.id)))::TEXT,
        private.scope_covers(v_me, p.id),
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED'))::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'IN_PROGRESS')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'BLOCKED')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now())::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
            AND t.due_at >= now() AND t.due_at < now() + interval '7 days')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'COMPLETED'
            AND t.completed_at >= now() - interval '30 days')::INTEGER,
        (SELECT count(*) FROM public.opportunities o WHERE o.owner_id = p.id
            AND o.status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'))::INTEGER,
        (SELECT coalesce(sum(e.total_minutes), 0) FROM public.timesheet_entries e
            WHERE e.employee_id = p.id AND e.work_date BETWEEN v_week_start AND v_today)::INTEGER,
        (SELECT max(e.work_date) FROM public.timesheet_entries e WHERE e.employee_id = p.id),
        (SELECT at.name::TEXT FROM public.absence_requests a JOIN public.absence_types at ON at.id = a.absence_type_id
            WHERE a.employee_id = p.id AND a.status = 'APPROVED' AND v_today BETWEEN a.start_date AND a.end_date LIMIT 1),
        (SELECT count(*) FROM public.absence_requests a WHERE a.employee_id = p.id
            AND a.status IN ('SUBMITTED', 'PENDING_APPROVAL'))::INTEGER
    FROM private.team_member_ids(v_me) AS member(id)
    JOIN public.profiles p ON p.id = member.id
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    ORDER BY (r.code = 'GESTOR') DESC, p.full_name
    LIMIT 500;
END;
$$;

-- =============================================================================
-- 2. PAINEL OPERACIONAL (Gestor e Manager)
-- =============================================================================
CREATE FUNCTION public.get_team_dashboard(p_from DATE, p_to DATE)
RETURNS TABLE (
    team_size INTEGER,
    tasks_in_progress INTEGER,
    tasks_blocked INTEGER,
    tasks_overdue INTEGER,
    tasks_completed INTEGER,
    tasks_completed_late INTEGER,
    tasks_pending_follow_up INTEGER,
    absences_to_validate INTEGER,
    absences_awaiting_decision INTEGER,
    opportunities_active INTEGER,
    opportunity_approvals_pending INTEGER,
    meetings_next_7_days INTEGER,
    minutes_logged INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_from TIMESTAMPTZ := (p_from::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_to TIMESTAMPTZ := ((p_to + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_supervisor BOOLEAN := public.has_permission('TEAM_SUPERVISE');
    v_can_validate BOOLEAN := public.has_permission('TIMESHEET_ABSENCE_VALIDATE');
    v_team UUID[];
BEGIN
    PERFORM private.require_permission('TEAM_READ', 'Não tem permissão para consultar a equipa.');
    PERFORM private.assert_report_period(p_from, p_to);
    v_team := ARRAY(SELECT private.team_member_ids(v_me));

    RETURN QUERY
    SELECT
        cardinality(v_team),
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = ANY (v_team) AND t.status = 'IN_PROGRESS')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = ANY (v_team) AND t.status = 'BLOCKED')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = ANY (v_team)
            AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now())::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = ANY (v_team) AND t.status = 'COMPLETED'
            AND t.completed_at >= v_from AND t.completed_at < v_to)::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = ANY (v_team) AND t.status = 'COMPLETED'
            AND t.completed_at >= v_from AND t.completed_at < v_to AND t.late_reason IS NOT NULL)::INTEGER,
        -- Por acompanhar: concluídas e ainda não validadas por quem lhes compete.
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = ANY (v_team) AND t.status = 'COMPLETED' AND t.reviewed_at IS NULL
            AND ((t.requires_manager_review AND v_supervisor)
                 OR (NOT t.requires_manager_review AND (t.created_by = v_me OR private.scope_covers(v_me, t.assignee_id)))))::INTEGER,
        (SELECT count(*) FROM public.absence_requests a WHERE a.status = 'SUBMITTED' AND a.employee_id = ANY (v_team)
            AND v_can_validate AND private.scope_covers(v_me, a.employee_id))::INTEGER,
        (SELECT count(*) FROM public.absence_requests a WHERE a.status = 'PENDING_APPROVAL' AND a.employee_id = ANY (v_team))::INTEGER,
        (SELECT count(*) FROM public.opportunities o WHERE (o.owner_id = ANY (v_team) OR o.owner_id = v_me)
            AND o.status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'))::INTEGER,
        (SELECT count(*) FROM public.approval_requests ar JOIN public.opportunities o ON o.id = ar.opportunity_id
            WHERE ar.status = 'PENDING' AND (o.owner_id = ANY (v_team) OR o.owner_id = v_me))::INTEGER,
        (SELECT count(*) FROM public.meetings m WHERE m.status IN ('PLANNED', 'CONFIRMED')
            AND m.starts_at >= now() AND m.starts_at < now() + interval '7 days'
            AND (m.organizer_id = v_me OR private.is_meeting_participant(m.id, v_me)))::INTEGER,
        (SELECT coalesce(sum(e.total_minutes), 0) FROM public.timesheet_entries e
            WHERE e.employee_id = ANY (v_team) AND e.work_date BETWEEN p_from AND p_to)::INTEGER;
END;
$$;

-- Oportunidades da equipa por moeda (os montantes nunca se somam entre moedas). SECURITY INVOKER:
-- a RLS de opportunities aplica-se a quem consulta.
CREATE FUNCTION public.get_opportunity_pipeline()
RETURNS TABLE (
    currency TEXT,
    opportunities_active INTEGER,
    estimated_value_active NUMERIC,
    weighted_value_active NUMERIC,
    approvals_pending INTEGER,
    won_last_90_days INTEGER,
    won_value_last_90_days NUMERIC
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT o.currency::TEXT,
        (count(*) FILTER (WHERE o.status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION')))::INTEGER,
        coalesce(sum(o.estimated_value) FILTER (WHERE o.status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION')), 0),
        coalesce(sum(o.estimated_value * coalesce(o.probability, 0) / 100.0)
            FILTER (WHERE o.status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION')), 0)::NUMERIC(14, 2),
        (count(*) FILTER (WHERE o.approval_status = 'PENDING'))::INTEGER,
        (count(*) FILTER (WHERE o.status = 'WON' AND o.closed_at >= now() - interval '90 days'))::INTEGER,
        coalesce(sum(o.estimated_value) FILTER (WHERE o.status = 'WON' AND o.closed_at >= now() - interval '90 days'), 0)
    FROM public.opportunities o
    WHERE public.get_current_profile_id() IS NOT NULL
      AND (o.owner_id = public.get_current_profile_id()
           OR public.is_manager_of_employee(o.owner_id)
           OR public.has_permission('ADMIN_ACCESS'))
    GROUP BY o.currency
    ORDER BY o.currency;
$$;

-- =============================================================================
-- 3. RELATÓRIOS DA EQUIPA
-- =============================================================================
CREATE FUNCTION public.get_team_report(p_from DATE, p_to DATE, p_department_id UUID DEFAULT NULL, p_lead_id UUID DEFAULT NULL)
RETURNS TABLE (
    profile_id UUID,
    full_name TEXT,
    job_title TEXT,
    department_name TEXT,
    lead_names TEXT,
    tasks_completed INTEGER,
    tasks_completed_late INTEGER,
    tasks_open INTEGER,
    tasks_overdue INTEGER,
    tasks_blocked INTEGER,
    minutes_logged INTEGER,
    entry_count INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_from TIMESTAMPTZ := (p_from::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_to TIMESTAMPTZ := ((p_to + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
BEGIN
    PERFORM private.require_permission('TEAM_READ', 'Não tem permissão para consultar relatórios da equipa.');
    PERFORM private.assert_report_period(p_from, p_to);
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT,
        (SELECT string_agg(lead.full_name, ', ' ORDER BY lead.full_name) FROM public.profiles lead
            WHERE lead.id = ANY (private.operational_leads(p.id)))::TEXT,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'COMPLETED'
            AND t.completed_at >= v_from AND t.completed_at < v_to)::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'COMPLETED'
            AND t.completed_at >= v_from AND t.completed_at < v_to AND t.late_reason IS NOT NULL)::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED'))::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now())::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'BLOCKED')::INTEGER,
        (SELECT coalesce(sum(e.total_minutes), 0) FROM public.timesheet_entries e
            WHERE e.employee_id = p.id AND e.work_date BETWEEN p_from AND p_to)::INTEGER,
        (SELECT count(*) FROM public.timesheet_entries e WHERE e.employee_id = p.id AND e.work_date BETWEEN p_from AND p_to)::INTEGER
    FROM private.report_member_ids(v_me, p_department_id, p_lead_id) AS member(id)
    JOIN public.profiles p ON p.id = member.id
    LEFT JOIN public.departments d ON d.id = p.department_id
    ORDER BY p.full_name;
END;
$$;

-- Evolução semanal (segunda-feira de cada semana do período).
CREATE FUNCTION public.get_team_completion_trend(p_from DATE, p_to DATE, p_department_id UUID DEFAULT NULL, p_lead_id UUID DEFAULT NULL)
RETURNS TABLE (week_start DATE, tasks_completed INTEGER, tasks_completed_late INTEGER, minutes_logged INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_members UUID[];
BEGIN
    PERFORM private.require_permission('TEAM_READ', 'Não tem permissão para consultar relatórios da equipa.');
    PERFORM private.assert_report_period(p_from, p_to);
    v_members := ARRAY(SELECT private.report_member_ids(v_me, p_department_id, p_lead_id));
    RETURN QUERY
    SELECT week.start_date::DATE,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = ANY (v_members) AND t.status = 'COMPLETED'
            AND (t.completed_at AT TIME ZONE 'Africa/Maputo')::date BETWEEN greatest(week.start_date::DATE, p_from) AND least(week.start_date::DATE + 6, p_to))::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = ANY (v_members) AND t.status = 'COMPLETED' AND t.late_reason IS NOT NULL
            AND (t.completed_at AT TIME ZONE 'Africa/Maputo')::date BETWEEN greatest(week.start_date::DATE, p_from) AND least(week.start_date::DATE + 6, p_to))::INTEGER,
        (SELECT coalesce(sum(e.total_minutes), 0) FROM public.timesheet_entries e WHERE e.employee_id = ANY (v_members)
            AND e.work_date BETWEEN greatest(week.start_date::DATE, p_from) AND least(week.start_date::DATE + 6, p_to))::INTEGER
    FROM generate_series(
        (p_from - (extract(isodow FROM p_from)::INTEGER - 1))::TIMESTAMP,
        p_to::TIMESTAMP,
        interval '7 days'
    ) AS week(start_date)
    ORDER BY 1;
END;
$$;

-- Supervisão (Manager): uma linha por gestor supervisionado e outra para a equipa direta sem gestor.
-- A administração vê todos os gestores.
CREATE FUNCTION public.get_supervision_overview(p_from DATE, p_to DATE)
RETURNS TABLE (
    lead_id UUID,
    lead_name TEXT,
    departments TEXT,
    team_size INTEGER,
    tasks_completed INTEGER,
    tasks_completed_late INTEGER,
    tasks_open INTEGER,
    tasks_overdue INTEGER,
    tasks_blocked INTEGER,
    minutes_logged INTEGER,
    absences_pending INTEGER,
    approvals_pending INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_is_admin BOOLEAN := public.has_permission('ADMIN_ACCESS');
    v_from TIMESTAMPTZ := (p_from::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_to TIMESTAMPTZ := ((p_to + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
BEGIN
    PERFORM private.require_permission('TEAM_SUPERVISE', 'Não tem permissão para a visão de supervisão.');
    PERFORM private.assert_report_period(p_from, p_to);
    RETURN QUERY
    WITH leads AS (
        SELECT g.id, g.full_name::TEXT AS name
        FROM public.profiles g
        JOIN public.user_roles ur ON ur.user_id = g.id
        JOIN public.roles r ON r.id = ur.role_id AND r.code = 'GESTOR'
        WHERE g.is_active AND (v_is_admin OR private.scope_covers(v_me, g.id))
    ),
    groups AS (
        SELECT l.id AS group_lead, l.name AS group_name, member.id AS member_id
        FROM leads l
        CROSS JOIN LATERAL (
            SELECT p.id FROM public.profiles p
            WHERE p.is_active AND p.id <> l.id AND private.scope_covers(l.id, p.id)
        ) AS member
        UNION ALL
        -- Equipa direta: abrangida pelo próprio Manager e por nenhum dos seus gestores.
        SELECT NULL::UUID, 'Equipa direta'::TEXT, p.id
        FROM public.profiles p
        WHERE NOT v_is_admin AND p.is_active AND p.id <> v_me
          AND private.scope_covers(v_me, p.id)
          AND NOT EXISTS (SELECT 1 FROM leads l WHERE l.id = p.id OR private.scope_covers(l.id, p.id))
    ),
    lead_rows AS (
        SELECT l.id AS group_lead, l.name AS group_name FROM leads l
        UNION ALL
        SELECT DISTINCT NULL::UUID, 'Equipa direta'::TEXT FROM groups WHERE group_lead IS NULL
    )
    SELECT lr.group_lead, lr.group_name,
        (SELECT string_agg(DISTINCT d.name, ', ') FROM public.manager_scopes ms JOIN public.departments d ON d.id = ms.department_id
            WHERE ms.manager_id = lr.group_lead)::TEXT,
        (SELECT count(*) FROM groups g WHERE g.group_lead IS NOT DISTINCT FROM lr.group_lead)::INTEGER,
        (SELECT count(*) FROM public.tasks t JOIN groups g ON g.member_id = t.assignee_id AND g.group_lead IS NOT DISTINCT FROM lr.group_lead
            WHERE t.status = 'COMPLETED' AND t.completed_at >= v_from AND t.completed_at < v_to)::INTEGER,
        (SELECT count(*) FROM public.tasks t JOIN groups g ON g.member_id = t.assignee_id AND g.group_lead IS NOT DISTINCT FROM lr.group_lead
            WHERE t.status = 'COMPLETED' AND t.completed_at >= v_from AND t.completed_at < v_to AND t.late_reason IS NOT NULL)::INTEGER,
        (SELECT count(*) FROM public.tasks t JOIN groups g ON g.member_id = t.assignee_id AND g.group_lead IS NOT DISTINCT FROM lr.group_lead
            WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED'))::INTEGER,
        (SELECT count(*) FROM public.tasks t JOIN groups g ON g.member_id = t.assignee_id AND g.group_lead IS NOT DISTINCT FROM lr.group_lead
            WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now())::INTEGER,
        (SELECT count(*) FROM public.tasks t JOIN groups g ON g.member_id = t.assignee_id AND g.group_lead IS NOT DISTINCT FROM lr.group_lead
            WHERE t.status = 'BLOCKED')::INTEGER,
        (SELECT coalesce(sum(e.total_minutes), 0) FROM public.timesheet_entries e
            JOIN groups g ON g.member_id = e.employee_id AND g.group_lead IS NOT DISTINCT FROM lr.group_lead
            WHERE e.work_date BETWEEN p_from AND p_to)::INTEGER,
        (SELECT count(*) FROM public.absence_requests a
            WHERE a.status IN ('SUBMITTED', 'PENDING_APPROVAL')
              AND (a.employee_id = lr.group_lead
                   OR a.employee_id IN (SELECT g.member_id FROM groups g WHERE g.group_lead IS NOT DISTINCT FROM lr.group_lead)))::INTEGER,
        (SELECT count(*) FROM public.approval_requests ar JOIN public.opportunities o ON o.id = ar.opportunity_id
            WHERE ar.status = 'PENDING'
              AND (o.owner_id = lr.group_lead
                   OR o.owner_id IN (SELECT g.member_id FROM groups g WHERE g.group_lead IS NOT DISTINCT FROM lr.group_lead)))::INTEGER
    FROM lead_rows lr
    ORDER BY (lr.group_lead IS NULL), lr.group_name;
END;
$$;

-- =============================================================================
-- 4. DIRETÓRIO DE PESSOAS (responsáveis e participantes)
-- =============================================================================
-- ASSIGNEE: responsáveis possíveis (o próprio e a equipa do âmbito), com a descrição da função.
-- MEETING: quem pode ser convidado para uma reunião (equipa e chefias de quem organiza).
-- PARTICIPANT: colaboradores ativos (membros de oportunidades); sem descrição da função.
DROP FUNCTION public.list_work_people(TEXT);

CREATE FUNCTION public.list_work_people(p_purpose TEXT DEFAULT 'PARTICIPANT')
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
    ELSIF p_purpose = 'PARTICIPANT' THEN
        IF NOT (public.has_permission('TIMESHEET_MEETING_CREATE') OR public.has_permission('TIMESHEET_OPPORTUNITY_UPDATE')) THEN
            RAISE EXCEPTION 'Não tem permissão para consultar o diretório.' USING ERRCODE = '42501';
        END IF;
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, NULL::TEXT
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND p.id <> v_me
        ORDER BY p.full_name;
    ELSE
        RAISE EXCEPTION 'Finalidade inválida.';
    END IF;
END;
$$;

-- =============================================================================
-- 5. CALENDÁRIO E RESUMO PESSOAL (novo estado PENDING_APPROVAL)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_calendar_items(p_from DATE, p_to DATE, p_scope TEXT DEFAULT 'ME')
RETURNS TABLE (
    item_type TEXT,
    item_id UUID,
    title TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    all_day BOOLEAN,
    status TEXT,
    person_id UUID,
    person_name TEXT,
    reference TEXT,
    is_overdue BOOLEAN
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_from TIMESTAMPTZ := (p_from::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_to TIMESTAMPTZ := ((p_to + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_mine BOOLEAN := coalesce(p_scope, 'ME') <> 'TEAM';
BEGIN
    IF v_me IS NULL OR NOT public.has_permission('TIMESHEET_CALENDAR_READ') THEN
        RAISE EXCEPTION 'Não tem permissão para consultar o calendário.' USING ERRCODE = '42501';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
        RAISE EXCEPTION 'Intervalo de datas inválido (máximo de 62 dias).';
    END IF;

    RETURN QUERY
    SELECT 'DEADLINE'::TEXT, t.id, t.title::TEXT, t.due_at, t.due_at, false, t.status::TEXT,
           t.assignee_id, assignee.full_name::TEXT, t.reference::TEXT,
           (t.due_at < now() AND t.status NOT IN ('COMPLETED', 'CANCELLED'))
    FROM public.tasks t
    LEFT JOIN public.profiles assignee ON assignee.id = t.assignee_id
    WHERE t.due_at >= v_from AND t.due_at < v_to AND t.status <> 'CANCELLED'
      AND (NOT v_mine OR t.assignee_id = v_me)
    UNION ALL
    SELECT 'TASK'::TEXT, t.id, t.title::TEXT, (t.start_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           (t.start_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo', true, t.status::TEXT,
           t.assignee_id, assignee.full_name::TEXT, t.reference::TEXT, false
    FROM public.tasks t
    LEFT JOIN public.profiles assignee ON assignee.id = t.assignee_id
    WHERE t.start_date >= p_from AND t.start_date <= p_to AND t.status NOT IN ('COMPLETED', 'CANCELLED')
      AND (NOT v_mine OR t.assignee_id = v_me)
    UNION ALL
    SELECT 'MEETING'::TEXT, m.id, m.title::TEXT, m.starts_at, m.ends_at, false, m.status::TEXT,
           m.organizer_id, organizer.full_name::TEXT, NULL::TEXT, false
    FROM public.meetings m
    LEFT JOIN public.profiles organizer ON organizer.id = m.organizer_id
    WHERE m.starts_at < v_to AND m.ends_at >= v_from
      AND (NOT v_mine OR m.organizer_id = v_me OR EXISTS (
          SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = m.id AND mp.profile_id = v_me))
    UNION ALL
    SELECT 'ABSENCE'::TEXT, a.id, at.name::TEXT, (a.start_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           ((a.end_date + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo', true, a.status::TEXT,
           a.employee_id, employee.full_name::TEXT, a.reference::TEXT, false
    FROM public.absence_requests a
    JOIN public.absence_types at ON at.id = a.absence_type_id
    LEFT JOIN public.profiles employee ON employee.id = a.employee_id
    WHERE a.start_date <= p_to AND a.end_date >= p_from
      AND (a.status = 'APPROVED' OR (a.status IN ('SUBMITTED', 'PENDING_APPROVAL') AND a.employee_id = v_me))
      AND (NOT v_mine OR a.employee_id = v_me)
    UNION ALL
    SELECT 'ACTIVITY'::TEXT, e.id,
           coalesce(task.title::TEXT, meeting.title::TEXT, opportunity.title::TEXT, activity.name::TEXT),
           ((e.work_date + e.start_time)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           ((e.work_date + e.end_time)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           false, e.kind::TEXT, e.employee_id, employee.full_name::TEXT, task.reference::TEXT, false
    FROM public.timesheet_entries e
    JOIN public.activities activity ON activity.id = e.activity_id
    LEFT JOIN public.tasks task ON task.id = e.task_id
    LEFT JOIN public.meetings meeting ON meeting.id = e.meeting_id
    LEFT JOIN public.opportunities opportunity ON opportunity.id = e.opportunity_id
    LEFT JOIN public.profiles employee ON employee.id = e.employee_id
    WHERE e.work_date >= p_from AND e.work_date <= p_to
      AND (NOT v_mine OR e.employee_id = v_me)
    UNION ALL
    SELECT 'INTERNAL_EVENT'::TEXT, ce.id, ce.title::TEXT, ce.starts_at, ce.ends_at, ce.all_day, ce.status::TEXT,
           ce.created_by, NULL::TEXT, NULL::TEXT, false
    FROM public.calendar_events ce
    WHERE ce.status = 'ACTIVE' AND ce.starts_at < v_to AND ce.ends_at >= v_from
    UNION ALL
    SELECT 'OPPORTUNITY_ACTIVITY'::TEXT, o.id, (o.title || ': ' || coalesce(o.next_step, 'próximo passo'))::TEXT,
           (o.next_step_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo', (o.next_step_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           true, o.status::TEXT, o.owner_id, owner.full_name::TEXT, o.reference::TEXT,
           (o.next_step_date < private.local_today())
    FROM public.opportunities o
    LEFT JOIN public.profiles owner ON owner.id = o.owner_id
    WHERE o.next_step_date >= p_from AND o.next_step_date <= p_to
      AND o.status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION')
      AND (NOT v_mine OR o.owner_id = v_me OR EXISTS (
          SELECT 1 FROM public.opportunity_members om WHERE om.opportunity_id = o.id AND om.profile_id = v_me));
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_work_summary()
RETURNS TABLE (
    tasks_assigned INTEGER,
    tasks_in_progress INTEGER,
    tasks_blocked INTEGER,
    tasks_overdue INTEGER,
    tasks_due_today INTEGER,
    tasks_due_next_7_days INTEGER,
    minutes_today INTEGER,
    minutes_this_week INTEGER,
    daily_target_minutes INTEGER,
    meetings_today INTEGER,
    absence_today TEXT,
    pending_absence_requests INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_today DATE := private.local_today();
    v_week_start DATE := v_today - (extract(isodow FROM v_today)::INTEGER - 1);
    v_day_start TIMESTAMPTZ := (v_today::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_day_end TIMESTAMPTZ := ((v_today + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
BEGIN
    RETURN QUERY
    SELECT
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status = 'ASSIGNED')::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status = 'IN_PROGRESS')::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status = 'BLOCKED')::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND due_at < now())::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
            AND due_at >= now() AND due_at < v_day_end)::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
            AND due_at >= v_day_end AND due_at < v_day_end + interval '7 days')::INTEGER,
        (SELECT coalesce(sum(total_minutes), 0) FROM public.timesheet_entries WHERE employee_id = v_me AND work_date = v_today)::INTEGER,
        (SELECT coalesce(sum(total_minutes), 0) FROM public.timesheet_entries
            WHERE employee_id = v_me AND work_date BETWEEN v_week_start AND v_today)::INTEGER,
        (coalesce((SELECT value FROM public.system_settings WHERE key = 'TIMESHEET_DAILY_TARGET_HOURS'), '8')::INTEGER * 60),
        (SELECT count(*) FROM public.meetings m
            WHERE m.status IN ('PLANNED', 'CONFIRMED', 'COMPLETED') AND m.starts_at < v_day_end AND m.ends_at >= v_day_start
              AND (m.organizer_id = v_me OR private.is_meeting_participant(m.id, v_me)))::INTEGER,
        (SELECT t.name::TEXT FROM public.absence_requests a JOIN public.absence_types t ON t.id = a.absence_type_id
            WHERE a.employee_id = v_me AND a.status = 'APPROVED' AND v_today BETWEEN a.start_date AND a.end_date LIMIT 1),
        (SELECT count(*) FROM public.absence_requests WHERE employee_id = v_me AND status IN ('SUBMITTED', 'PENDING_APPROVAL'))::INTEGER;
END;
$$;

-- =============================================================================
-- 6. RLS DOS PEDIDOS DE APROVAÇÃO
-- =============================================================================
-- Visíveis a quem vê a oportunidade (responsável, membros, gestor e Manager do âmbito, administração).
-- Escrita apenas pelas funções do servidor.
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY approval_requests_select ON public.approval_requests FOR SELECT TO authenticated
USING (
    requested_by = (SELECT public.get_current_profile_id())
    OR EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id)
);

REVOKE ALL ON public.approval_requests FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.approval_requests FROM authenticated;
REVOKE ALL ON SEQUENCE public.approval_request_number_seq FROM anon;

-- A vista da equipa foi criada com p.* e não inclui colunas novas: é recriada para expor a descrição da
-- função (a RLS de profiles continua a aplicar-se a quem consulta; o âmbito passa a ter dois níveis).
CREATE OR REPLACE VIEW public.my_team_members
WITH (security_invoker = true) AS
SELECT p.*
FROM public.profiles p
WHERE p.id IS DISTINCT FROM public.get_current_profile_id()
  AND public.is_manager_of_employee(p.id);

-- =============================================================================
-- 7. PRIVILÉGIOS
-- =============================================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
    public.create_task(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, DATE, INTEGER, UUID, UUID, UUID, UUID, BOOLEAN),
    public.review_task(UUID, TEXT),
    public.validate_absence_request(UUID, TEXT, TEXT),
    public.request_opportunity_approval(UUID, TEXT),
    public.decide_opportunity_approval(UUID, TEXT, TEXT),
    public.cancel_opportunity_approval(UUID, TEXT),
    public.refresh_deadline_alerts(),
    public.get_team_work_overview(),
    public.get_team_dashboard(DATE, DATE),
    public.get_opportunity_pipeline(),
    public.get_team_report(DATE, DATE, UUID, UUID),
    public.get_team_completion_trend(DATE, DATE, UUID, UUID),
    public.get_supervision_overview(DATE, DATE),
    public.list_work_people(TEXT)
FROM authenticated;

GRANT EXECUTE ON FUNCTION public.create_task(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, DATE, INTEGER, UUID, UUID, UUID, UUID, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_task(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.validate_absence_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_opportunity_approval(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_opportunity_approval(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_opportunity_approval(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_deadline_alerts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_work_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_dashboard(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_opportunity_pipeline() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_report(DATE, DATE, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_completion_trend(DATE, DATE, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_supervision_overview(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_work_people(TEXT) TO authenticated;

-- Funções privadas avaliadas nas políticas RLS e em triggers SECURITY INVOKER durante pedidos da API.
GRANT EXECUTE ON FUNCTION private.can_edit_own_timesheet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.assert_other_active_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_meeting_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_opportunity_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_department_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.local_today() TO authenticated;
