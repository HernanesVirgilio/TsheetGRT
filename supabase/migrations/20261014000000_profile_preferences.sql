-- TsheetGRT · SI Holdings — Perfil pessoal: nome de apresentação e preferências de idioma e tema
--
-- Perfil pessoal ≠ perfil funcional: estes campos são opcionais, não entram em nenhuma regra de
-- autorização e não substituem os dados institucionais (nome completo, departamento, cargo, perfil).
--   * display_name: como a pessoa prefere ser tratada (saudação, cabeçalho); o próprio ou a administração.
--   * preferred_language / theme_preference: só o próprio. NULL = ainda não escolheu (a aplicação usa
--     português e o tema do sistema operativo).
-- Colunas novas com NULL por omissão: nenhum dado existente é alterado. Não são auditadas (preferências),
-- tal como os restantes campos fora da lista de audit_profile_changes.

ALTER TABLE public.profiles
    ADD COLUMN display_name VARCHAR(80)
        CONSTRAINT profiles_display_name_length CHECK (display_name IS NULL OR length(btrim(display_name)) BETWEEN 2 AND 80),
    ADD COLUMN preferred_language VARCHAR(5)
        CONSTRAINT profiles_preferred_language_valid CHECK (preferred_language IN ('pt', 'en')),
    ADD COLUMN theme_preference VARCHAR(10)
        CONSTRAINT profiles_theme_preference_valid CHECK (theme_preference IN ('light', 'dark', 'system'));

-- A política profiles_update já limita a escrita ao próprio e a quem tem USERS_UPDATE/USERS_DISABLE;
-- este trigger acrescenta a regra por coluna para os campos novos (guard_profile_changes mantém-se).
CREATE FUNCTION public.guard_profile_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF current_user = 'authenticated' THEN
        IF (NEW.preferred_language, NEW.theme_preference) IS DISTINCT FROM (OLD.preferred_language, OLD.theme_preference)
           AND OLD.auth_user_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION 'As preferências só podem ser alteradas pelo próprio utilizador.' USING ERRCODE = '42501';
        END IF;
        IF NEW.display_name IS DISTINCT FROM OLD.display_name
           AND OLD.auth_user_id IS DISTINCT FROM auth.uid()
           AND NOT public.has_permission('USERS_UPDATE') THEN
            RAISE EXCEPTION 'Não tem permissão para alterar o nome de apresentação deste utilizador.' USING ERRCODE = '42501';
        END IF;
    END IF;
    NEW.display_name := nullif(btrim(NEW.display_name), '');
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_guard_preferences
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_preferences();

-- Função de trigger: não é chamável pela API.
REVOKE EXECUTE ON FUNCTION public.guard_profile_preferences() FROM PUBLIC, anon, authenticated;
