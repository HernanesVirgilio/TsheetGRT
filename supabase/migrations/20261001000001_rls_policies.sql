-- SI HOLDINGS TIMESHEET - ROW LEVEL SECURITY (RLS) POLICIES
-- PostgreSQL / Supabase Migration

-- 1. HELPER FUNCTIONS FOR SECURITY CONTEXT

-- Get current profile ID from auth.uid()
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID AS $$
    SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Check if current user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_has BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id
        JOIN public.roles r ON r.id = ur.role_id
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions perm ON perm.id = rp.permission_id
        WHERE p.auth_user_id = auth.uid()
          AND p.is_active = true
          AND (perm.code = p_permission_code OR perm.code = 'ADMIN_ACCESS')
    ) INTO v_has;
    RETURN COALESCE(v_has, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Check if current user is manager of an employee
CREATE OR REPLACE FUNCTION public.is_manager_of_employee(p_employee_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_mgr BOOLEAN;
    v_my_profile_id UUID;
BEGIN
    v_my_profile_id := public.get_current_profile_id();
    IF v_my_profile_id IS NULL THEN
        RETURN false;
    END IF;

    -- Check direct employee scope or department scope
    SELECT EXISTS (
        SELECT 1
        FROM public.manager_scopes ms
        JOIN public.profiles emp ON emp.id = p_employee_id
        WHERE ms.manager_id = v_my_profile_id
          AND (
            ms.employee_id = p_employee_id
            OR ms.department_id = emp.department_id
          )
    ) INTO v_is_mgr;

    RETURN COALESCE(v_is_mgr, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;


-- 2. ENABLE RLS ON ALL TABLES
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;


-- 3. POLICIES: DEPARTMENTS
CREATE POLICY "Departments are viewable by active users"
ON public.departments FOR SELECT
TO authenticated
USING (public.has_permission('DEPARTMENTS_READ') OR public.has_permission('SELF_ACCESS'));

CREATE POLICY "Departments are manageable by authorized administrators"
ON public.departments FOR ALL
TO authenticated
USING (public.has_permission('DEPARTMENTS_MANAGE'));


-- 4. POLICIES: PROFILES
CREATE POLICY "Users can read own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (
    auth_user_id = auth.uid()
    OR public.has_permission('USERS_READ')
    OR public.is_manager_of_employee(id)
);

CREATE POLICY "Users can update own profile contact info"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth_user_id = auth.uid() OR public.has_permission('USERS_UPDATE'))
WITH CHECK (auth_user_id = auth.uid() OR public.has_permission('USERS_UPDATE'));

CREATE POLICY "Admins can insert profiles"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (public.has_permission('USERS_CREATE'));


-- 5. POLICIES: ROLES & PERMISSIONS
CREATE POLICY "Roles are viewable by users with ROLES_READ"
ON public.roles FOR SELECT
TO authenticated
USING (public.has_permission('ROLES_READ') OR public.has_permission('SELF_ACCESS'));

CREATE POLICY "Roles are manageable by admins"
ON public.roles FOR ALL
TO authenticated
USING (public.has_permission('ROLES_MANAGE'));

CREATE POLICY "Permissions viewable by authenticated users with permission"
ON public.permissions FOR SELECT
TO authenticated
USING (public.has_permission('PERMISSIONS_READ') OR public.has_permission('ROLES_READ'));

CREATE POLICY "Role permissions viewable"
ON public.role_permissions FOR SELECT
TO authenticated
USING (public.has_permission('ROLES_READ') OR public.has_permission('PERMISSIONS_READ'));

CREATE POLICY "Role permissions manageable by admins"
ON public.role_permissions FOR ALL
TO authenticated
USING (public.has_permission('PERMISSIONS_MANAGE'));

CREATE POLICY "User roles viewable by owner or admin"
ON public.user_roles FOR SELECT
TO authenticated
USING (user_id = public.get_current_profile_id() OR public.has_permission('USERS_READ'));

CREATE POLICY "User roles manageable by admin"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_permission('USERS_ASSIGN_ROLE'));


-- 6. POLICIES: ACTIVITIES
CREATE POLICY "Activities viewable by all active users"
ON public.activities FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Activities manageable by admins"
ON public.activities FOR ALL
TO authenticated
USING (public.has_permission('ADMIN_ACCESS'));


-- 7. POLICIES: TIMESHEETS
CREATE POLICY "Employees can view own timesheets, Managers view team, Admins view all"
ON public.timesheets FOR SELECT
TO authenticated
USING (
    employee_id = public.get_current_profile_id()
    OR (public.has_permission('TEAM_TIMESHEET_READ') AND public.is_manager_of_employee(employee_id))
    OR public.has_permission('REPORTS_READ')
);

CREATE POLICY "Employees can create own timesheet"
ON public.timesheets FOR INSERT
TO authenticated
WITH CHECK (
    employee_id = public.get_current_profile_id()
    AND public.has_permission('SELF_TIMESHEET_CREATE')
);

CREATE POLICY "Employees can update draft/rejected timesheets; Managers can update status on review"
ON public.timesheets FOR UPDATE
TO authenticated
USING (
    (employee_id = public.get_current_profile_id() AND status IN ('DRAFT', 'REJECTED'))
    OR (public.is_manager_of_employee(employee_id) AND public.has_permission('TEAM_TIMESHEET_APPROVE'))
    OR public.has_permission('ADMIN_ACCESS')
);


-- 8. POLICIES: TIMESHEET ENTRIES
CREATE POLICY "Users can view entries of visible timesheets"
ON public.timesheet_entries FOR SELECT
TO authenticated
USING (
    employee_id = public.get_current_profile_id()
    OR (public.has_permission('TEAM_TIMESHEET_READ') AND public.is_manager_of_employee(employee_id))
    OR public.has_permission('REPORTS_READ')
);

CREATE POLICY "Users can insert entries into own DRAFT/REJECTED timesheets"
ON public.timesheet_entries FOR INSERT
TO authenticated
WITH CHECK (
    employee_id = public.get_current_profile_id()
    AND EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND t.employee_id = public.get_current_profile_id()
          AND t.status IN ('DRAFT', 'REJECTED')
    )
);

CREATE POLICY "Users can update/delete entries of own DRAFT/REJECTED timesheets"
ON public.timesheet_entries FOR UPDATE
TO authenticated
USING (
    employee_id = public.get_current_profile_id()
    AND EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND t.employee_id = public.get_current_profile_id()
          AND t.status IN ('DRAFT', 'REJECTED')
    )
);

CREATE POLICY "Users can delete entries of own DRAFT timesheets"
ON public.timesheet_entries FOR DELETE
TO authenticated
USING (
    employee_id = public.get_current_profile_id()
    AND EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND t.employee_id = public.get_current_profile_id()
          AND t.status IN ('DRAFT', 'REJECTED')
    )
);


-- 9. POLICIES: TIMESHEET APPROVALS
CREATE POLICY "Approvals viewable by employee or manager"
ON public.timesheet_approvals FOR SELECT
TO authenticated
USING (
    approver_id = public.get_current_profile_id()
    OR EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id AND (t.employee_id = public.get_current_profile_id() OR public.is_manager_of_employee(t.employee_id))
    )
    OR public.has_permission('ADMIN_ACCESS')
);

CREATE POLICY "Managers can insert approval decisions"
ON public.timesheet_approvals FOR INSERT
TO authenticated
WITH CHECK (
    public.has_permission('TEAM_TIMESHEET_APPROVE')
    AND approver_id = public.get_current_profile_id()
);


-- 10. POLICIES: AUDIT EVENTS
CREATE POLICY "Audit logs readable only by authorized roles (IT/Admin)"
ON public.audit_events FOR SELECT
TO authenticated
USING (public.has_permission('AUDIT_READ'));

CREATE POLICY "Audit events insertable by authenticated users"
ON public.audit_events FOR INSERT
TO authenticated
WITH CHECK (true);


-- 11. POLICIES: NOTIFICATIONS
CREATE POLICY "Users can only read own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (user_id = public.get_current_profile_id());

CREATE POLICY "Users can update read status of own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (user_id = public.get_current_profile_id())
WITH CHECK (user_id = public.get_current_profile_id());


-- 12. POLICIES: SYSTEM SETTINGS
CREATE POLICY "System settings readable by IT/Admin"
ON public.system_settings FOR SELECT
TO authenticated
USING (public.has_permission('SYSTEM_SETTINGS_READ'));

CREATE POLICY "System settings manageable by Admin"
ON public.system_settings FOR ALL
TO authenticated
USING (public.has_permission('SYSTEM_SETTINGS_MANAGE'));
