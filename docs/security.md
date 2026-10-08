# Arquitetura de Segurança · TsheetGRT

## 1. Fluxo de autenticação e autorização

```
Supabase Auth (palavra-passe / convite / recuperação)
      ↓
Sessão Supabase (JWT gerido pelo SDK)
      ↓
profiles (perfil ativo associado a auth.users)
      ↓
user_roles → roles → role_permissions → permissions
      ↓
ProtectedRoute (experiência de utilizador)
      ↓
Políticas RLS no PostgreSQL (barreira real)
```

- Não existe autenticação local, palavras-passe em `localStorage` nem troca de conta.
- O frontend obtém as permissões com `get_my_permissions()`. **Não existe atalho implícito para ADMIN**: o perfil ADMIN tem todas as permissões atribuídas explicitamente.
- Uma conta desativada (`is_active = false`) ou sem perfil fica sem qualquer permissão no servidor. O frontend mostra um ecrã de acesso indisponível.

## 2. Funções de contexto (SQL)

| Função | Uso |
| :--- | :--- |
| `get_current_profile_id()` | Perfil **ativo** da sessão atual |
| `has_permission(code)` | Verifica uma permissão explícita do utilizador ativo |
| `is_manager_of_employee(id)` | Âmbito de gestão (`manager_scopes`) |
| `get_my_permissions()` | Lista de permissões para o frontend |

Todas são `SECURITY DEFINER` com `SET search_path = ''` e nomes qualificados. As funções internas (`write_audit_event`, `assert_other_active_admin`, `is_admin_profile`) vivem no schema `private`, que não é exposto pela API. O `EXECUTE` é revogado a `PUBLIC`/`anon` e concedido apenas ao que é necessário.

## 3. Regras protegidas no servidor

- **Perfis:** o próprio utilizador só altera o telefone. Dados institucionais exigem `USERS_UPDATE`, ativação/desativação exige `USERS_DISABLE`, e ninguém altera o estado da própria conta. E-mail, número de colaborador, `auth_user_id`, `last_login_at` e `must_change_password` não são editáveis pela API.
- **Último administrador:** é impossível desativar, retirar o perfil ADMIN ou apagar a conta de autenticação do último administrador ativo. A verificação é serializada com um advisory lock.
- **Escalada de privilégios:** só quem tem `ADMIN_ACCESS` pode atribuir o perfil ADMIN. A permissão `ADMIN_ACCESS` é exclusiva do perfil ADMIN e as permissões do perfil ADMIN não podem ser alteradas.
- **Departamentos:** o código é imutável e só departamentos ativos podem ser atribuídos.
- **Configurações:** cada chave é validada no servidor (fuso horário, ciclo, meta diária, etc.).
- **Desativação suave:** a API não permite apagar utilizadores, departamentos, atribuições de perfil nem configurações.
- **Anónimo:** o role `anon` não tem acesso a nenhuma tabela.

## 4. Âmbito de gestão (Manager)

- **ADMIN** (`ADMIN_ACCESS`): acesso global aos timesheets. **MANAGER**: apenas colaboradores no seu `manager_scopes` (departamento e/ou colaboradores específicos). **Colaborador**: apenas os próprios dados. `REPORTS_READ` dá acesso à página de relatórios, não a dados fora do âmbito.
- Os âmbitos são atribuídos pela administração (`USERS_UPDATE`), só a utilizadores ativos com perfil MANAGER, e são auditados. Ninguém altera o próprio âmbito.
- **Regra do âmbito** (função `private.scope_covers`, usada pela RLS e pelas notificações):
  - âmbito por **departamento** abrange apenas os utilizadores com perfil **EMPLOYEE** desse departamento;
  - outro **MANAGER** só entra no âmbito por atribuição **explícita** (âmbito por colaborador);
  - um **ADMIN** nunca faz parte do âmbito de um gestor, nem por atribuição explícita (a atribuição é recusada e, se um colaborador for promovido a ADMIN, sai do âmbito).
- A equipa é lida pela vista `my_team_members` (`security_invoker`, a RLS de `profiles` aplica-se).
- **Transições de estado só por funções do servidor**: não existe `UPDATE` direto em `timesheets` nem `INSERT` em `timesheet_approvals` pela API.
  - `submit_timesheet`: apenas o próprio colaborador, de rascunho/rejeitado para submetido, com registos.
  - `review_timesheet`: valida permissão (`TEAM_TIMESHEET_APPROVE`/`REJECT`), âmbito (ou `ADMIN_ACCESS`), estado `SUBMITTED`, proíbe decidir o próprio timesheet e exige motivo na rejeição. Inexistente e fora do âmbito têm a mesma resposta.
  - `approve_timesheets`: aprovação em massa (máx. 100), com validação individual e resultado por timesheet; as falhas não anulam os restantes.
- Os registos de horas só podem ser alterados pelo próprio colaborador enquanto o timesheet está em rascunho ou rejeitado. O total de minutos é sempre calculado no servidor.
- O gestor lê a auditoria dos timesheets da sua equipa, e nunca a administrativa nem a de outras equipas.
- Notificações (submissão → gestores do âmbito; aprovação/rejeição → colaborador) são criadas por trigger no servidor.
- **Quem decidiu:** `get_timesheet_decisions(timesheet)` devolve o histórico de decisões de um timesheet visível a quem consulta, expondo do gestor apenas **nome, cargo e e-mail institucional**. O colaborador continua sem acesso ao perfil do gestor.

## 5. Auditoria imutável

- O cliente **não insere** eventos: a tabela não tem políticas de escrita e os privilégios estão revogados.
- Os eventos são escritos por triggers (utilizadores, perfis de acesso, departamentos, configurações, âmbitos de gestão, ciclo de vida dos timesheets, incluindo o motivo de rejeição) e por funções do servidor (`set_role_permissions`, `log_auth_event`, `approve_timesheets`).
- O ator é sempre o utilizador da sessão. IP e user-agent vêm dos cabeçalhos do pedido HTTP; nunca são gerados pelo cliente.
- `log_auth_event` aceita apenas `auth.login.success`, `auth.logout` e `auth.password.changed`.

## 6. Criação de utilizadores

A Edge Function `admin-create-user`:

1. Valida o JWT com `auth.getUser()`.
2. Verifica `USERS_CREATE` e `USERS_ASSIGN_ROLE` com o token de quem pede.
3. Valida os dados de entrada.
4. Convida o utilizador (`auth.admin.inviteUserByEmail`). É **o único uso da `service_role`**.
5. Cria perfil e perfil de acesso com `create_user_profile` (`SECURITY INVOKER`), sob a RLS e com auditoria do ator.
6. Reverte o convite se a criação do perfil falhar.

O utilizador define a própria palavra-passe através do link do convite (mínimo de 12 carateres). Nenhuma palavra-passe é guardada no código, no SQL ou no frontend.

## 7. Segredos

- O frontend usa apenas `VITE_SUPABASE_URL` e a chave **publishable**.
- A `service_role` existe apenas no ambiente da Edge Function.
- Ficheiros `.env*` estão no `.gitignore` (exceto `.env.example`).

## 8. Módulo Suporte IT

### Quem vê o quê (RLS)

| Tabela | Colaborador (`IT_TICKET_CREATE`) | Equipa de IT (`IT_TICKETS_READ` / `IT_ASSETS_READ`) | `anon` |
| :--- | :--- | :--- | :--- |
| `it_tickets` | Apenas os pedidos que abriu | Todos | Sem acesso |
| `it_ticket_comments`, `it_ticket_events` | Dos seus pedidos, **sem notas internas** | Todos, incluindo notas internas | Sem acesso |
| `it_assets` | Apenas os equipamentos que lhe estão atribuídos | Todos (`IT_ASSETS_READ`) | Sem acesso |
| `it_interventions` | Sem acesso | `IT_TICKETS_READ` ou `IT_ASSETS_READ` | Sem acesso |
| `it_ticket_categories` | Leitura | Leitura | Sem acesso |

- `INSERT`/`UPDATE`/`DELETE` estão **revogados** a `authenticated` em pedidos, comentários, eventos, intervenções e categorias: não é possível forjar estados, eventos, comentários ou o ator. Em `it_assets` só existe `INSERT`/`UPDATE` com `IT_ASSETS_MANAGE`; `DELETE` está revogado.
- O colaborador não tem acesso aos perfis da equipa de IT. O nome do técnico responsável chega-lhe pelo histórico do pedido (nome guardado no evento).

### Transições só por funções do servidor

Todas são `SECURITY DEFINER`, `SET search_path = ''`, usam `get_current_profile_id()` (conta ativa) como ator e bloqueiam o pedido (`FOR UPDATE`). Um pedido inexistente e um pedido fora do acesso de quem chama têm a mesma resposta (`Pedido de suporte não encontrado.`).

| Função | Quem | Regras |
| :--- | :--- | :--- |
| `create_it_ticket` | `IT_TICKET_CREATE` | Categoria ativa; o colaborador só associa equipamentos que lhe estão atribuídos (quem tem `IT_ASSETS_READ` pode associar qualquer um); prazo calculado no servidor |
| `take_it_ticket` | `IT_TICKETS_MANAGE` | Atribui a quem chama; um pedido aberto passa a "Em atendimento" |
| `assign_it_ticket` | `IT_TICKETS_ASSIGN` + `IT_TICKETS_MANAGE` | O responsável tem de ser um técnico ativo (`IT_TICKETS_MANAGE`) |
| `change_it_ticket_status` | `IT_TICKETS_MANAGE` | Apenas `IN_PROGRESS` ou `WAITING_USER`; `WAITING_USER` exige a informação pedida |
| `update_it_ticket_priority` | `IT_TICKETS_MANAGE` | Recalcula o prazo a partir da data de abertura; motivo opcional (≤ 1000) |
| `update_it_ticket_category`, `set_it_ticket_asset` | `IT_TICKETS_MANAGE` | Pedido em curso; categoria ativa / equipamento existente |
| `resolve_it_ticket` | `IT_TICKETS_MANAGE` | Resolução obrigatória (5–2000) |
| `close_it_ticket` | Solicitante ou técnico | Apenas a partir de "Resolvido" |
| `reopen_it_ticket` | Solicitante (de "Resolvido") ou IT (de "Resolvido"/"Fechado") | Motivo obrigatório (5–1000); novo prazo; limpa a resolução |
| `add_it_ticket_comment` | Solicitante ou IT | Notas internas só do IT; pedido fechado não aceita mensagens; a resposta do colaborador a um pedido "A aguardar" devolve-o ao IT |
| `add_it_intervention` | `IT_TICKETS_MANAGE` | Pedido e/ou equipamento existentes; data não futura |
| `list_it_technicians` | Autenticado | Devolve apenas nome, cargo e e-mail dos técnicos ativos |
| `get_it_dashboard_summary` | `IT_TICKETS_READ` | Contagens do painel |

Transições inválidas (ex.: alterar um pedido resolvido sem o reabrir, fechar um pedido não resolvido, o colaborador reabrir um pedido fechado) são recusadas no servidor. A interface apenas esconde as ações que o servidor recusaria.

### Técnicos

Um técnico é um utilizador **ativo** com `IT_TICKETS_MANAGE` (por omissão os perfis IT e ADMIN). Uma conta desativada perde imediatamente o acesso, mesmo que continue atribuída a pedidos.

### Auditoria e notificações

- Cada evento do histórico (exceto comentários e intervenções, que têm registo próprio) gera um evento de auditoria `it_ticket.<tipo>` (ex.: `it_ticket.resolved`). Os equipamentos geram `it_asset.created`, `it_asset.status_changed`, `it_asset.assigned` e `it_asset.updated`; as intervenções `it_intervention.created`. O cliente continua sem poder inserir eventos de auditoria.
- As notificações são criadas por trigger em `notifications` (mecanismo existente) e nunca para eventos internos: novo pedido → técnicos; atribuição → técnico e solicitante; pedido de informação → solicitante; resposta do colaborador e comentários → a outra parte; prioridade alterada, resolução, fecho e reabertura → a parte interessada. Tipos: `IT_TICKET_CREATED`, `IT_TICKET_ASSIGNED`, `IT_TICKET_UPDATED`, `IT_TICKET_WAITING_USER`, `IT_TICKET_USER_REPLIED`, `IT_TICKET_COMMENT`, `IT_TICKET_RESOLVED`, `IT_TICKET_CLOSED`, `IT_TICKET_REOPENED`.
