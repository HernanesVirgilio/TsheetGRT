# Configuração do Supabase · TsheetGRT

Guia para preparar um projeto Supabase de raiz. Execute os passos por ordem.

## 1. Base de dados

No **SQL Editor** do projeto, execute cada ficheiro **uma única vez, por esta ordem**:

1. `supabase/migrations/20261001000000_initial_schema.sql` — tabelas, constraints, índices e triggers de integridade.
2. `supabase/migrations/20261001000001_rls_policies.sql` — funções de segurança, triggers de proteção e auditoria, políticas RLS e privilégios.
3. `supabase/migrations/20261001000002_seed_data.sql` — departamentos, perfis de acesso, permissões, atividades e configurações.
4. `supabase/migrations/20261008000000_manager_scope_and_reviews.sql` — módulo Manager: âmbito de gestão, leitura por âmbito, submissão e decisão de timesheets por funções do servidor, notificações e auditoria da equipa.
5. `supabase/migrations/20261009000000_scope_rules_and_reviewer_visibility.sql` — âmbito por departamento limitado a colaboradores (EMPLOYEE), exclusão de administradores e leitura limitada de quem decidiu um timesheet.
6. `supabase/migrations/20261010000000_it_support_module.sql` — módulo Suporte IT: permissões, prazos de resolução, pedidos, histórico, equipamentos, intervenções, RLS, auditoria e notificações.

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

## 6. Módulo Suporte IT

Num projeto onde as migrations 1 a 5 já estão aplicadas, execute **apenas** `20261010000000_it_support_module.sql` no SQL Editor (uma única vez). A migration não altera nem apaga tabelas existentes: cria as tabelas do módulo, acrescenta permissões aos perfis existentes e novas definições, e substitui a função `validate_system_setting` mantendo as regras atuais (com validação das novas chaves).

Depois de aplicar:

1. Os prazos de resolução por prioridade e o alerta de espera ficam em `system_settings` (`IT_SLA_HOURS_CRITICAL` = 8, `IT_SLA_HOURS_HIGH` = 24, `IT_SLA_HOURS_MEDIUM` = 72, `IT_SLA_HOURS_LOW` = 120, `IT_WAITING_USER_ALERT_DAYS` = 3). Para os alterar, use o SQL Editor, por exemplo:
   ```sql
   UPDATE public.system_settings SET value = '12' WHERE key = 'IT_SLA_HOURS_CRITICAL';
   ```
   O valor é validado no servidor. A alteração aplica-se a pedidos novos, a mudanças de prioridade e a reaberturas.
2. Atribua o perfil **IT** aos técnicos em **Utilizadores**. Os utilizadores com perfil **ADMIN** também contam como técnicos.
3. Para verificar, entre como colaborador, abra um pedido em **Pedidos de suporte** e confirme que a equipa de IT o vê em **Suporte IT › Solicitações** e recebe a notificação.

## 7. Frontend

```bash
cp .env.example .env   # preencher VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
```

## Validação

| Comando | O que verifica |
| :--- | :--- |
| `npm run typecheck` | TypeScript em modo `strict` |
| `npm test` | Regras de validação, erros, CSV, relatórios, timesheets, módulo IT **e** testes de segurança da base de dados |
| `npm run test:db` | Apenas os testes de segurança: aplica todas as migrations em PostgreSQL 17 (PGlite) com um ambiente que simula o Supabase e verifica RLS, âmbito de gestão, aprovações, auditoria, acessos proibidos e o módulo IT (transições, notas internas, notificações, equipamentos, escalada de privilégios, acesso anónimo) |
| `npm run build` | Build de produção |

Os testes de segurança (`supabase/tests/security.test.ts` e `supabase/tests/it.security.test.ts`) não precisam de ligação ao Supabase.
