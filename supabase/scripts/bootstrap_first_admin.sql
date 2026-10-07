-- TsheetGRT · Configuração do primeiro administrador
--
-- Executar UMA vez, no SQL Editor do Supabase, depois de:
--   1. Aplicar as migrations de supabase/migrations (por ordem).
--   2. Convidar o utilizador em Authentication > Users > "Invite user".
--
-- Substitua os dois valores abaixo antes de executar. Não guarde o e-mail real neste ficheiro.
-- A palavra-passe nunca passa por aqui: o administrador define-a através do link do convite.
--
-- A função recusa a operação se já existir um administrador ativo.

SELECT public.bootstrap_first_admin(
    'EMAIL_DO_ADMINISTRADOR',
    'NOME COMPLETO DO ADMINISTRADOR'
);
