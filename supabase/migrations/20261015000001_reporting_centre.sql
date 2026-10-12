-- TsheetGRT · SI Holdings — Centro de relatórios: agregações por período
--
-- O PostgREST limita as respostas a 1000 linhas: um ano de registos de horas não pode ser agregado no
-- browser. Estas funções agregam no servidor e correm como quem chama (SECURITY INVOKER): o âmbito é o
-- das políticas RLS já existentes (o próprio, a equipa do âmbito com TEAM_TIMESHEET_READ, a administração).
-- Nenhuma função devolve registos individuais nem dados fora do que o utilizador já pode ler.
-- Datas locais (Africa/Maputo): work_date é uma data local; os instantes de decisão são convertidos.

CREATE FUNCTION private.assert_report_range(p_from DATE, p_to DATE)
RETURNS VOID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from THEN
        RAISE EXCEPTION 'Intervalo de datas inválido.';
    END IF;
    IF p_to - p_from > 400 THEN
        RAISE EXCEPTION 'O período de um relatório não pode exceder um ano.';
    END IF;
END;
$$;

-- Prazo do lembrete de aprovação (definição da organização; a tabela de definições só é legível pela administração).
CREATE FUNCTION private.approval_reminder_days()
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce((SELECT value FROM public.system_settings WHERE key = 'APPROVAL_REMINDER_DAYS'), '3')::INTEGER;
$$;

-- Horas por colaborador e atividade no período.
CREATE FUNCTION public.get_hours_report(p_from DATE, p_to DATE, p_department_id UUID DEFAULT NULL, p_employee_id UUID DEFAULT NULL)
RETURNS TABLE (
    employee_id UUID,
    employee_name TEXT,
    department_id UUID,
    department_name TEXT,
    activity_name TEXT,
    minutes BIGINT,
    entries BIGINT,
    days_worked BIGINT
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.assert_report_range(p_from, p_to);
    RETURN QUERY
    SELECT e.employee_id, p.full_name::TEXT, p.department_id, d.name::TEXT, a.name::TEXT,
           sum(e.total_minutes)::BIGINT, count(*)::BIGINT, count(DISTINCT e.work_date)::BIGINT
    FROM public.timesheet_entries e
    JOIN public.activities a ON a.id = e.activity_id
    LEFT JOIN public.profiles p ON p.id = e.employee_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE e.work_date BETWEEN p_from AND p_to
      AND (p_employee_id IS NULL OR e.employee_id = p_employee_id)
      AND (p_department_id IS NULL OR p.department_id = p_department_id)
    GROUP BY e.employee_id, p.full_name, p.department_id, d.name, a.name;
END;
$$;

-- Evolução das horas por dia, semana (ISO, segunda-feira) ou mês.
CREATE FUNCTION public.get_hours_trend(p_from DATE, p_to DATE, p_bucket TEXT, p_department_id UUID DEFAULT NULL, p_employee_id UUID DEFAULT NULL)
RETURNS TABLE (bucket_start DATE, minutes BIGINT, people BIGINT)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.assert_report_range(p_from, p_to);
    IF p_bucket NOT IN ('day', 'week', 'month') THEN
        RAISE EXCEPTION 'Agrupamento inválido.';
    END IF;
    RETURN QUERY
    SELECT date_trunc(p_bucket, e.work_date::TIMESTAMP)::DATE, sum(e.total_minutes)::BIGINT, count(DISTINCT e.employee_id)::BIGINT
    FROM public.timesheet_entries e
    LEFT JOIN public.profiles p ON p.id = e.employee_id
    WHERE e.work_date BETWEEN p_from AND p_to
      AND (p_employee_id IS NULL OR e.employee_id = p_employee_id)
      AND (p_department_id IS NULL OR p.department_id = p_department_id)
    GROUP BY 1
    ORDER BY 1;
END;
$$;

-- Indicadores de aprovação. Decisões no período (pela data local da decisão); tempo até à decisão medido
-- entre a última submissão e a decisão mais recente de cada timesheet (os ciclos anteriores não guardam a
-- hora de submissão fora da auditoria); pendentes contados no momento da consulta.
CREATE FUNCTION public.get_approval_report(p_from DATE, p_to DATE, p_department_id UUID DEFAULT NULL)
RETURNS TABLE (
    approved_count INTEGER,
    rejected_count INTEGER,
    avg_decision_hours NUMERIC,
    decisions_measured INTEGER,
    resubmitted_approved INTEGER,
    pending_now INTEGER,
    pending_over_threshold INTEGER,
    threshold_days INTEGER,
    oldest_pending_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_from TIMESTAMPTZ := (p_from::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_to TIMESTAMPTZ := ((p_to + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_days INTEGER := private.approval_reminder_days();
BEGIN
    PERFORM private.assert_report_range(p_from, p_to);
    RETURN QUERY
    WITH scoped AS (
        SELECT t.*
        FROM public.timesheets t
        LEFT JOIN public.profiles p ON p.id = t.employee_id
        WHERE p_department_id IS NULL OR p.department_id = p_department_id
    ),
    decisions AS (
        SELECT ta.status
        FROM public.timesheet_approvals ta
        JOIN scoped s ON s.id = ta.timesheet_id
        WHERE ta.created_at >= v_from AND ta.created_at < v_to AND ta.status IN ('APPROVED', 'REJECTED')
    ),
    latest AS (
        SELECT extract(epoch FROM (coalesce(s.approved_at, s.rejected_at) - s.submitted_at)) / 3600.0 AS hours
        FROM scoped s
        WHERE s.submitted_at IS NOT NULL
          AND coalesce(s.approved_at, s.rejected_at) >= v_from
          AND coalesce(s.approved_at, s.rejected_at) < v_to
          AND coalesce(s.approved_at, s.rejected_at) >= s.submitted_at
    )
    SELECT
        (SELECT count(*) FROM decisions WHERE status = 'APPROVED')::INTEGER,
        (SELECT count(*) FROM decisions WHERE status = 'REJECTED')::INTEGER,
        (SELECT round(avg(hours)::NUMERIC, 1) FROM latest),
        (SELECT count(*) FROM latest)::INTEGER,
        (SELECT count(*) FROM scoped s
          WHERE s.status = 'APPROVED' AND s.approved_at >= v_from AND s.approved_at < v_to
            AND EXISTS (SELECT 1 FROM public.timesheet_approvals r WHERE r.timesheet_id = s.id AND r.status = 'REJECTED'))::INTEGER,
        (SELECT count(*) FROM scoped s WHERE s.status = 'SUBMITTED')::INTEGER,
        (SELECT count(*) FROM scoped s WHERE s.status = 'SUBMITTED' AND s.submitted_at < now() - make_interval(days => v_days))::INTEGER,
        v_days,
        (SELECT min(s.submitted_at) FROM scoped s WHERE s.status = 'SUBMITTED');
END;
$$;

-- Avaliadas dentro das funções SECURITY INVOKER, com os privilégios de quem chama.
REVOKE EXECUTE ON FUNCTION private.assert_report_range(DATE, DATE), private.approval_reminder_days() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.assert_report_range(DATE, DATE), private.approval_reminder_days() TO authenticated;

REVOKE EXECUTE ON FUNCTION
    public.get_hours_report(DATE, DATE, UUID, UUID),
    public.get_hours_trend(DATE, DATE, TEXT, UUID, UUID),
    public.get_approval_report(DATE, DATE, UUID)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_hours_report(DATE, DATE, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_hours_trend(DATE, DATE, TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_approval_report(DATE, DATE, UUID) TO authenticated;
