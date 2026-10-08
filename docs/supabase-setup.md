# Configuração do Supabase · TsheetGRT

Guia para preparar um projeto Supabase de raiz. Execute os passos por ordem.

## 1. Base de dados

No **SQL Editor** do projeto, execute cada ficheiro **uma única vez, por esta ordem**:

1. `supabase/migrations/20261001000000_initial_schema.sql` — tabelas, constraints, índices e triggers de integridade.
2. `supabase/migrations/20261001000001_rls_policies.sql` — funções de segurança, triggers de proteção e auditoria, políticas RLS e privilégios.
3. `supabase/migrations/20261001000002_seed_data.sql` — departamentos, perfis de acesso, permissões, atividades e configurações.
4. `supabase/migrations/20261008000000_manager_scope_and_reviews.sql` — módulo Manager: âmbito de gestão, leitura por âmbito, submissão e decisão de timesheets por funções do servidor, notificações e auditoria da equipa.
5. `supabase/migrations/20261009000000_scope_rules_and_reviewer_visibility.sql` — âmbito por departamento limitado a colaboradores (EMPLOYEE), exclusão de administradores e leitura limitada de quem decidiu um timesheet.

Execute apenas os ficheiros que ainda não aplicou, pela ordem indicada.

Estes ficheiros são a **única fonte de verdade** do schema. Alterações futuras devem ser feitas em novas migrations.

Com a Supabase CLI ligada ao projeto, o equivalente é `supabase db push`.

## 2. Autenticação (Authentication › Settings)

| Definição | Valor |
| :--- | :--- |
| **Allow new users to sign up** | Desligado (contas criadas apenas por convite) |
| **Minimum password length** | 12 |
| **Site URL** | URL público do frontend (ex.: `https://timesheet.siholdings-mz.com`) |
| **Redirect URLs** | `<URL do frontend>/reset-password` e, em desenvolvimento, `http://localhost:3000/reset-password` |

**E-mail:** o serviço de e-mail incluído no Supabase só entrega mensagens a membros da equipa do projeto e tem limites baixos. Para enviar convites a colaboradores, configure um SMTP próprio em *Authentication › Emails › SMTP Settings*.

## 3. Edge Function `admin-create-user`

```bash
supabase login
supabase link --project-ref <project-ref>
supabase secrets set APP_URL=https://timesheet.siholdings-mz.com
# Opcional, para testar a partir do ambiente local:
supabase secrets set ALLOWED_ORIGINS=http://localhost:3000
supabase functions deploy admin-create-user --no-verify-jwt
```

- `--no-verify-jwt` é seguro neste caso: a função valida ela própria o token com `auth.getUser()` e as permissões com `has_permission`. Isto é necessário em projetos que usam as novas chaves de assinatura JWT.
- A `service_role` é injetada automaticamente pelo Supabase no ambiente da função. Nunca a coloque no `.env` do frontend.

## 4. Primeiro administrador

1. Em **Authentication › Users › Invite user**, convide o e-mail do administrador.
2. No **SQL Editor**, abra `supabase/scripts/bootstrap_first_admin.sql`, substitua o e-mail e o nome **apenas no editor** (não grave os valores no repositório) e execute.
3. O administrador abre o link do convite, é encaminhado para `/reset-password` e define a sua palavra-passe.

A função `bootstrap_first_admin` só pode ser executada a partir do SQL Editor e recusa a operação se já existir um administrador ativo. A partir daí, os utilizadores são criados na área Admin.

## 5. Atribuir equipas aos gestores

Na área Admin, abra **Utilizadores › (utilizador com perfil MANAGER) › Âmbito de gestão** e atribua departamentos e/ou colaboradores. Sem âmbito, o gestor não vê nenhuma equipa nem pode aprovar timesheets.

## 6. Frontend

```bash
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
```

## Validação

| Comando | O que verifica |
| :--- | :--- |
| `npm run typecheck` | TypeScript em modo `strict` |
| `npm test` | Regras de validação, erros, CSV, relatórios, timesheets **e** testes de segurança da base de dados |
| `npm run test:db` | Apenas os testes de segurança: aplica todas as migrations em PostgreSQL 17 (PGlite) com um ambiente que simula o Supabase e verifica RLS, âmbito de gestão, aprovações, auditoria e acessos proibidos |
| `npm run build` | Build de produção |

Os testes de segurança (`supabase/tests/security.test.ts`) não precisam de ligação ao Supabase.
