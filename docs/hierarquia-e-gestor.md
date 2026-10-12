# Hierarquia organizacional, Gestor e Manager · TsheetGRT

Este documento descreve a hierarquia ADMIN → MANAGER → GESTOR → COLABORADORES. Explica como está representada na base de dados, que regras o servidor aplica e o que cada painel mostra.

As migrations são três, aplicadas por esta ordem depois do Timesheet Core:

| Migration | Conteúdo |
| :--- | :--- |
| `20261012000000_hierarchy_roles_scope.sql` | Perfil GESTOR, permissões novas, descrição da função, âmbito em dois níveis, notificações com categoria e ligação |
| `20261012000001_hierarchy_workflows.sql` | Ausências em dois níveis, pedidos de aprovação de oportunidades, acompanhamento de tarefas, âmbito dos convidados das reuniões, encaminhamento das notificações, alertas de prazo |
| `20261012000002_hierarchy_dashboards_security.sql` | Painéis, relatórios, supervisão, diretório de pessoas, calendário, RLS e privilégios |

## 1. Análise de dependências (antes da implementação)

Situação encontrada no código e nas migrations:

| Área | O que existia | Dependência para o Gestor |
| :--- | :--- | :--- |
| Perfis | `ADMIN`, `IT`, `MANAGER`, `EMPLOYEE`; um perfil por utilizador | Não existia perfil GESTOR. O MANAGER acumulava a gestão direta e a supervisão. |
| Equipas | `manager_scopes` (gestor → departamento ou colaborador) e `private.scope_covers` (um só nível) | Serve para Gestor → equipa e para Manager → Gestor. Faltava a relação de supervisão em dois níveis. |
| Restrição do âmbito | `guard_manager_scope` só aceitava gestores com o perfil MANAGER | Tem de aceitar o GESTOR, sem que este possa ter outros gestores no âmbito. |
| Autorização | Todas as políticas usam `is_manager_of_employee` | Basta alterar esta função para a hierarquia se refletir em tarefas, timesheets, ausências, reuniões e oportunidades. |
| Notificações | Tabela `notifications` sem categoria nem ligação | Cada notificação ia para o gestor direto, e a aprovação de ausências para todos os gestores do âmbito. Faltava distinguir o pedido de aprovação, a conclusão e a decisão. |
| Tarefas | Os campos criador (`created_by`) e responsável (`assignee_id`) já eram distintos | Já era possível atribuir uma tarefa ao próprio criador. Faltavam o acompanhamento (revisão) e o escalonamento para o Manager. |
| Reuniões | Todos os perfis tinham `TIMESHEET_MEETING_CREATE` | O colaborador não pode agendar reuniões. Os participantes não estavam limitados ao âmbito. |
| Ausências | Um só nível de decisão (`decide_absence_request`) | Faltava o fluxo colaborador → validação do Gestor → decisão do Manager. |
| Oportunidades | Criação, ciclo comercial e empresas | Não existia pedido de aprovação, e uma oportunidade nova podia avançar livremente. |
| Funções profissionais | `profiles.job_title` (cargo) | Não existia a descrição da função. |
| Painéis | Dashboard do MANAGER com os timesheets da equipa | Não existiam painéis do Gestor nem de supervisão, nem relatórios operacionais da equipa. |

### Operações que o Gestor não executa sem o Manager

- **Decisão final de uma ausência.** A exceção são os tipos que a empresa marcar como "sem decisão do Manager".
- **Avanço de uma oportunidade** para Proposta, Negociação ou Ganha sem aprovação.
- **Aprovação dos próprios pedidos.** O servidor recusa sempre que quem decide é quem pediu ou o responsável da oportunidade.
- **Composição da equipa.** O âmbito continua a ser gerido pela administração.
- **Perfis técnicos e permissões.**

## 2. Como a hierarquia está representada

Não foram criadas tabelas de equipa novas: a hierarquia usa `manager_scopes`.

```text
ADMIN ─────────────── vê a organização inteira (ADMIN_ACCESS); não pertence a nenhum âmbito
  │
MANAGER ── âmbito explícito por colaborador ──► GESTOR (supervisão)
  │       └ âmbito por departamento/colaborador ──► colaboradores sem gestor (equipa direta)
  │
GESTOR ─── âmbito por departamento (colaboradores EMPLOYEE) e/ou por colaborador ──► COLABORADORES
```

- **`private.scope_covers(gestor, pessoa)`** é a relação **direta** e mantém as regras anteriores. Um âmbito por departamento abrange os colaboradores com perfil EMPLOYEE desse departamento. Um âmbito por colaborador pode abranger outro gestor. Um administrador nunca está no âmbito de ninguém.
- **`private.supervises(chefia, pessoa)`** acrescenta **um nível**: o Manager abrange também as equipas dos GESTORES que supervisiona. `is_manager_of_employee` passou a usar esta função, por isso todas as políticas RLS existentes refletem a hierarquia sem terem sido reescritas.
- **Um âmbito só conta enquanto o titular tiver `TEAM_READ`.** Se um gestor mudar para o perfil de colaborador, os âmbitos antigos deixam de dar acesso.
- **Regras de `guard_manager_scope`:**
  - o âmbito só é atribuído a utilizadores ativos com o perfil MANAGER ou GESTOR;
  - um GESTOR só pode ter colaboradores no âmbito (nunca outro gestor, um Manager ou um administrador), o que evita ciclos e inversões;
  - ninguém altera o próprio âmbito.
- **Vários departamentos e vários Managers.** Um gestor pode ter vários departamentos. Um Manager supervisiona apenas os gestores que lhe forem atribuídos, e um gestor pode ser supervisionado por mais de um Manager.

## 3. Perfis e permissões

### Permissões novas

| Permissão | Módulo | Para que serve |
| :--- | :--- | :--- |
| `TEAM_SUPERVISE` | team | Visão de supervisão dos gestores e das suas equipas; recebe os escalonamentos |
| `TEAM_JOB_DESCRIPTION_UPDATE` | team | Preencher e atualizar a descrição da função dos colaboradores do âmbito |
| `TIMESHEET_ABSENCE_VALIDATE` | work | Validar e encaminhar ao Manager as ausências da equipa direta |
| `TIMESHEET_OPPORTUNITY_APPROVE` | work | Decidir os pedidos de aprovação de oportunidades do âmbito |

### Atribuição por perfil

- **GESTOR (novo):**
  - uso pessoal (`SELF_*`, `IT_TICKET_CREATE`);
  - equipa e timesheets da equipa (`TEAM_READ`, `TEAM_TIMESHEET_*`) e `REPORTS_READ`;
  - tarefas (`TIMESHEET_TASK_*`), calendário (leitura) e reuniões (`TIMESHEET_MEETING_READ`/`CREATE`);
  - ausências: pedir, consultar a equipa e **validar**;
  - oportunidades: ler, trabalhar, criar e gerir (sem **aprovar**);
  - anexos.
  - Não tem `TIMESHEET_ABSENCE_APPROVE`, `TIMESHEET_OPPORTUNITY_APPROVE`, `TEAM_SUPERVISE`, `TIMESHEET_CALENDAR_MANAGE` nem `TEAM_JOB_DESCRIPTION_UPDATE`.
- **MANAGER:** mantém tudo o que tinha e recebe `TEAM_SUPERVISE`, `TEAM_JOB_DESCRIPTION_UPDATE` e `TIMESHEET_OPPORTUNITY_APPROVE`.
- **EMPLOYEE e IT:** perdem `TIMESHEET_MEETING_CREATE`. Recebem as reuniões, mas não as agendam.
- **ADMIN:** recebe todas as permissões novas.

A autorização usa sempre as permissões e o âmbito, nunca o código do perfil. O código do perfil só é usado para escolher o painel inicial e para as regras estruturais do âmbito (quem pode ter âmbito e quem pode estar nele). Cada matriz pode ser ajustada em **Roles e Permissões**.

## 4. Responsabilidades e painéis

### Gestor — `Painel da equipa` (dashboard do perfil GESTOR)

- **Resumo:**
  - colaboradores da equipa e horas registadas em 30 dias;
  - tarefas em curso (e bloqueadas);
  - tarefas em atraso;
  - tarefas concluídas em 30 dias (e quantas com atraso).
- **Precisa da sua atenção:**
  - tarefas bloqueadas;
  - conclusões por acompanhar;
  - ausências por validar;
  - ausências que aguardam o Manager;
  - oportunidades enviadas para aprovação.
  - Cada linha abre o trabalho correspondente.
- **A minha equipa:** nome, cargo, departamento, descrição da função, tarefas em aberto, atrasos e ausência de hoje. Cada linha abre o detalhe do colaborador.
- **Outros blocos:**
  - as minhas tarefas (incluindo as que criou para si);
  - próximas reuniões;
  - oportunidades da equipa por moeda;
  - atividade recente.
- **Resumo de relatórios:**
  - tarefas concluídas por semana (no prazo e com atraso);
  - trabalho em aberto por colaborador (no prazo e em atraso);
  - ligação para os relatórios completos.

Todos os números vêm de `get_team_dashboard`, `get_team_work_overview`, `get_opportunity_pipeline` e `get_team_completion_trend`, sempre limitados ao âmbito. Um valor zero é um valor real; não há indicadores de demonstração.

### Manager — `Supervisão` (dashboard do perfil MANAGER)

- **Filtros:** período (7, 30 ou 90 dias), departamento e gestor.
- **Resumo:** gestores supervisionados e pessoas supervisionadas; concluídas; em atraso (e bloqueadas); horas registadas.
- **Gestores e equipas:** uma linha por gestor, mais a equipa direta sem gestor, se existir. Cada linha mostra:
  - departamentos e pessoas;
  - tarefas concluídas (com atraso), em aberto, atrasadas e bloqueadas;
  - horas e pedidos pendentes.
- **Distribuição da carga:** tarefas em aberto por equipa (no prazo e em atraso).
- **Decisões pendentes:**
  - ausências validadas pelos gestores;
  - oportunidades para aprovar (exceto as que ele próprio pediu);
  - timesheets dos gestores e da equipa direta.
- **Também mostra:** resumo de relatórios (com os filtros), as minhas tarefas, próximas reuniões e oportunidades por moeda.

### Relatórios da equipa (`/timesheet/reports`, `TEAM_READ`)

- **Filtros:** período até um ano; departamento; gestor (com `TEAM_SUPERVISE`); situação (com atraso, com bloqueios, sem tempo registado).
- **Conteúdo:**
  - evolução semanal;
  - tarefas concluídas por pessoa;
  - tabela por pessoa (concluídas, com atraso, em aberto, atrasadas, bloqueadas, horas).
- **Exportação CSV:** com `REPORTS_EXPORT`.

Um gestor não pode pedir o relatório de outro gestor. Um Manager só filtra pelos gestores que supervisiona.

### Equipa e descrição da função

- **Conceitos distintos:**
  - `job_title` (cargo);
  - `job_description` (descrição da função: o que a pessoa faz);
  - perfil técnico (`user_roles`);
  - permissões;
  - responsável numa tarefa.
  - Atribuir uma tarefa nunca altera perfis nem permissões (há um teste que o confirma).
- **Quem vê a descrição:**
  - o gestor e o Manager, na equipa, no detalhe do colaborador e na carga da equipa;
  - quem escolhe o responsável de uma tarefa (`list_work_people('ASSIGNEE')`).
- **Quem edita:**
  - quem tem `USERS_UPDATE` (administração), no formulário do utilizador;
  - quem tem `TEAM_JOB_DESCRIPTION_UPDATE`, através de `update_team_member_job_description`, só para pessoas do âmbito e nunca a própria.
  - Cada alteração é auditada (`user.job_description.updated`).
- **Campos vazios:** não são preenchidos com texto inventado; a interface mostra "por preencher".

## 5. Tarefas: criador, responsável e acompanhamento

- **Tarefas para si próprio.** O Manager e o Gestor podem criar tarefas para si próprios: o criador e o responsável são campos distintos. A tarefa aparece no painel, na lista "As minhas", no calendário e no histórico de quem a executa. Não é encaminhada para ninguém, e as regras normais (prazos, conclusão com atraso, registo de tempo) aplicam-se.
- **Acompanhamento** (`review_task`). Uma tarefa concluída fica "por acompanhar" até ser validada:
  - **Tarefa normal:** valida quem a gere (o gestor da equipa ou quem a criou).
  - **Tarefa marcada "Exige acompanhamento do Manager"** (opção do gestor ao criar a tarefa): valida quem supervisiona o responsável (`TEAM_SUPERVISE`) ou a administração.
  - **Regras comuns:** o responsável nunca valida a própria conclusão. Reabrir a tarefa limpa a validação. Fica registado `TASK_REVIEWED` no histórico e `task.reviewed` na auditoria.

## 6. Reuniões e calendário

- **Quem agenda:** é preciso `TIMESHEET_MEETING_CREATE`. Desde `20261015000000`, todos os perfis agendam reuniões com colegas sem aprovação, e os pedidos de tempo a uma chefia seguem um fluxo de aceitação (ver [navegacao-e-fluxos.md](navegacao-e-fluxos.md) §4).
- **Quem pode ser convidado** (`private.can_invite_to_meeting`):
  - a equipa de quem organiza (dois níveis para o Manager);
  - as chefias de quem organiza;
  - os envolvidos na tarefa ou oportunidade ligada;
  - os colegas (mesmo departamento ou mesma chefia direta);
  - qualquer pessoa, se for a administração.
  - Quem já participa mantém-se ao editar. A lista de convidáveis vem de `list_work_people('MEETING')`.
- **Quem altera ou cancela:** só quem gere a reunião (o organizador, o gestor do organizador ou a administração).
- **Notificações:** o reagendamento, o cancelamento e as mudanças de local ou de ligação notificam os participantes. Quem é retirado também é notificado.
- **Validação:** o fim tem de ser posterior ao início (no formulário e na base de dados).

**Calendário interativo** (vistas Semana e Dia):

- Grelha horária das 07:00 às 21:00, em fatias de 30 minutos.
- **Formas de selecionar um intervalo:**
  - **Rato:** clicar na hora inicial e arrastar até à final. Ao largar, abre o formulário com a data, o início e o fim preenchidos (ex.: 09:00–10:30).
  - **Ecrã tátil:** tocar na hora inicial e depois na final. O arrastamento continua a deslocar a página.
  - **Teclado:** setas para mover, Shift+setas para alargar, Enter para confirmar, Escape para anular.
- **Na vista Mês:** clicar no dia abre a vista Dia para escolher a hora; o botão "+" do dia abre logo o formulário (09:00–10:00).
- **Sem permissão para agendar:** a grelha é só de leitura, sem seleção.
- **Itens existentes:** continuam clicáveis e abrem o registo.

## 7. Ausências: fluxo em dois níveis

```text
Colaborador ── submete ──► SUBMITTED (aguarda validação do gestor da equipa)
                               │ gestor: validar e encaminhar        │ gestor: pedir correção
                               ▼                                     ▼
                     PENDING_APPROVAL (aguarda decisão)            DRAFT
                               │ Manager: aprovar / rejeitar / pedir correção
                               ▼
                      APPROVED | REJECTED  ──► notificação ao colaborador (e ao gestor que validou)
                                              calendário atualizado se aprovado
```

- **Quem valida:** os gestores que abrangem o colaborador diretamente e têm `TIMESHEET_ABSENCE_VALIDATE` sem `TIMESHEET_ABSENCE_APPROVE`.
- **Sem gestor de equipa:** se ninguém valida (por exemplo, o pedido do próprio gestor, ou um colaborador que responde diretamente ao Manager), o pedido segue logo para `PENDING_APPROVAL`, com nota no histórico.
- **Quem decide:** quem tem `TIMESHEET_ABSENCE_APPROVE` e supervisiona o colaborador (dois níveis). Se não houver ninguém, decide a administração.
  - Ninguém decide nem valida o próprio pedido; as restrições `absence_requests_no_self_decision` e `absence_requests_no_self_validation` garantem-no.
  - O Manager não salta a validação: um pedido `SUBMITTED` só pode ser decidido se já não houver um gestor ativo para o validar.
- **Política da empresa:** `absence_types.requires_manager_approval` (por omissão `true` em todos os tipos). Num tipo marcado `false`, a validação do gestor é a aprovação final.
- **O que fica registado:**
  - requerente, tipo, período, motivo e anexos;
  - quem validou (`validated_by`/`validated_at`/`validation_comment`);
  - quem decidiu (`decided_by`/`decided_at`/`decision_comment`);
  - o histórico (`absence_events`) e a auditoria (`absence.submitted`, `absence.validated`, `absence.approved`, ...).
- **Concorrência:** a decisão bloqueia a linha; uma segunda decisão concorrente é recusada.

## 8. Oportunidades, empresas e aprovação

- **Criar a empresa no formulário da oportunidade.** A ligação "A empresa não existe? Criar empresa" abre um formulário dentro do próprio formulário (nome, NUIT, contacto principal, telefone, e-mail, endereço, website, observações; a empresa nasce ativa).
  - **Antes de criar,** procura empresas com o mesmo NUIT ou com nome semelhante e mostra-as com "Usar esta". Se o NUIT já existir, não é possível criar outra.
  - **Unicidade:** o nome (sem distinção de maiúsculas) e o NUIT são únicos na base de dados.
  - **Depois de guardar,** a empresa fica selecionada na oportunidade.
- **Estado de aprovação** (`opportunities.approval_status`):

| Estado | Significado |
| :--- | :--- |
| `NOT_SUBMITTED` | Registada por quem não tem poder de aprovação; ainda sem pedido |
| `PENDING` | Pedido de aprovação em curso |
| `APPROVED` / `REJECTED` | Decisão do Manager |
| `NOT_REQUIRED` | Registada por quem tem `TIMESHEET_OPPORTUNITY_APPROVE` |

- **Regras** (trigger `guard_opportunity_approval`, aplicado a qualquer escrita):
  - a criação nunca equivale a aprovação;
  - sem aprovação, a oportunidade não passa a Proposta, Negociação ou Ganha;
  - os valores ficam fixos enquanto o pedido está pendente;
  - perder ou cancelar a oportunidade anula o pedido pendente.
- **Pedido explícito** (`approval_requests`): referência `APR-00001`, quem submeteu, o que está a ser aprovado, valor e moeda, estado, quem decidiu, motivo e data.
  - Há um único pedido pendente por oportunidade.
  - Uma restrição na base de dados impede que quem pediu decida.
  - O histórico fica em `opportunity_events` (`OPPORTUNITY_APPROVAL_REQUESTED`, `OPPORTUNITY_APPROVED`, `OPPORTUNITY_APPROVAL_REJECTED`, `OPPORTUNITY_APPROVAL_CANCELLED`) e a auditoria em `opportunity.approval_requested`, `opportunity.approved`, etc.
- **Quem decide** (`decide_opportunity_approval`):
  - quem tem `TIMESHEET_OPPORTUNITY_APPROVE` e supervisiona o responsável (ou a administração);
  - nunca quem pediu nem o responsável;
  - a decisão é atómica.
- **Página "Pedidos de aprovação"** (`/timesheet/approvals`): mostra os pedidos por decidir (Manager) e o histórico (todos os pedidos que o utilizador pode ver).
- **Moedas:** os totais nunca misturam moedas. O painel mostra uma linha por moeda (`get_opportunity_pipeline`).

## 9. Notificações

Cada notificação tem uma **categoria**, derivada do tipo no servidor, e uma **ligação** interna para o registo:

| Categoria | Exemplos |
| :--- | :--- |
| Informação | tarefa atribuída, convite para reunião, comentário |
| Conclusão | tarefa concluída, tarefa da equipa concluída, conclusão para acompanhamento |
| Pedido de aprovação | timesheet, ausência para validar ou decidir, oportunidade para aprovar |
| Alerta de prazo | prazo nas próximas 24 h, tarefa em atraso, tarefa da equipa em atraso |
| Decisão tomada | timesheet ou ausência decidida, oportunidade aprovada ou rejeitada, conclusão validada |

Os destinatários são calculados no backend (triggers e funções), nunca no frontend:

- **Gestor da equipa** (`private.operational_leads`):
  - bloqueios e conclusões das tarefas da equipa;
  - trabalho atribuído à equipa por outra pessoa;
  - ausências por validar e as decisões dessas ausências;
  - atrasos da equipa.
- **Manager:**
  - conclusões de tarefas que exigem o seu acompanhamento;
  - ausências que aguardam a sua decisão;
  - pedidos de aprovação de oportunidades;
  - o que ele próprio criou.
  - **Não recebe** atribuições, comentários, bloqueios, alterações de prazo nem conclusões de rotina das equipas dos gestores (há um teste que o confirma).
- **Regras gerais:** nunca se notifica o autor da ação nem contas inativas.
- **Alertas de prazo:** sem agendador no projeto, são gerados a pedido (`refresh_deadline_alerts`) quando a aplicação carrega as notificações. Uma chave de deduplicação impede repetições, e um prazo novo gera um alerta novo.

## 10. Segurança

- Todas as funções novas são `SECURITY DEFINER` com `search_path = ''`. Cada uma valida a sessão, a permissão, o âmbito, o estado do registo e a transição pedida, e responde "não encontrado ou fora do seu âmbito" sem revelar se o registo existe.
- A tabela nova `approval_requests` tem RLS: é legível por quem vê a oportunidade e não tem escrita direta (`INSERT`/`UPDATE`/`DELETE` revogados) nem acesso anónimo.
- A vista `my_team_members` foi recriada para expor a descrição da função; a RLS de `profiles` continua a aplicar-se.
- Os IDs enviados pelo frontend nunca estabelecem autorização: o âmbito é sempre recalculado no servidor a partir da sessão.

## 11. Testes

| Ficheiro | Cobertura |
| :--- | :--- |
| `supabase/tests/hierarchy.security.test.ts` | 168 verificações em PostgreSQL (PGlite) com as migrations reais |
| `src/tests/hierarchy.test.ts` | 32 regras puras |
| Testes anteriores | Atualizados para as regras novas: o colaborador já não agenda reuniões, e as contagens de permissões mudaram |

Os 20 cenários pedidos estão cobertos, com tentativas de acesso não autorizado:

1. O colaborador não agenda reuniões nem obtém a lista de convidáveis.
2. Vê as reuniões em que participa e recebe o convite.
3. O gestor agenda com a equipa e com o seu Manager, mas não com outra equipa.
4. O Manager agenda com o gestor e a equipa supervisionada, mas não fora dela.
5. A seleção de 09:00 a 10:30 preenche o início e o fim, em qualquer direção, e o formulário abre com esses valores.
6. O Manager não recebe notificações de rotina.
7. O Manager recebe as ausências para decidir, as aprovações de oportunidades e as conclusões escaladas.
8. O gestor recebe os bloqueios, as conclusões e as atribuições da equipa.
9. A tarefa do Manager para si próprio aparece no painel e no calendário.
10. A tarefa do gestor para si próprio aparece no painel e na lista.
11. O gestor não vê perfis, tarefas nem relatórios de outra equipa.
12. O gestor vê o cargo e a descrição da função da equipa.
13. O gestor cria a empresa durante o registo da oportunidade.
14. A empresa fica ligada à oportunidade.
15. A oportunidade não fica aprovada ao ser criada nem avança sem aprovação.
16. Quem pede nunca decide, também ao nível do Manager.
17. O Manager não decide pedidos fora do seu âmbito (oportunidades e ausências).
18. As decisões ficam auditadas, com o autor.
19. Os painéis coincidem com consultas à base de dados e estão limitados ao âmbito.
20. A administração vê a organização inteira.

## 12. Limitações e decisões que dependem da política da empresa

**Decisões de política** (os valores atuais estão entre parênteses):

- **O que exige aprovação numa oportunidade** (avançar para Proposta, Negociação ou Ganha; sem limiar de valor). Um limiar por valor ou por moeda pode ser acrescentado na função `guard_opportunity_approval`.
- **Quem dispensa aprovação** (quem tem `TIMESHEET_OPPORTUNITY_APPROVE`). As oportunidades registadas pelo Manager não pedem aprovação a uma chefia superior.
- **Tipos de ausência aprovados pelo gestor** (todos exigem o Manager: `requires_manager_approval = true`). Ainda não há interface para alterar este campo: faz-se por SQL ou pela API com `ADMIN_ACCESS`.
- **Convites de reuniões entre equipas** (só a equipa, as chefias e os envolvidos no registo ligado). Gestores pares não podem ser convidados uns pelos outros.
- **Quem edita a descrição da função** (MANAGER e administração; o GESTOR só consulta). Pode ser concedido ao GESTOR em **Roles e Permissões**.
- **Composição das equipas** (só a administração). Delegar no Manager a gestão das equipas dos seus gestores exigiria mudar a política de `manager_scopes`.
- **Aprovação de timesheets.** O gestor aprova os da equipa; o Manager também pode aprovar os da equipa dos seus gestores, porque a autorização é em dois níveis. No painel, o Manager vê como pendentes apenas os timesheets dos gestores e da equipa direta.

**Limitações técnicas:**

- **Edge Function `admin-create-user`:** o código já aceita o perfil GESTOR, mas ainda não foi publicada. Até lá, crie o utilizador com outro perfil e mude-o para GESTOR no detalhe do utilizador.
- **Alertas de prazo:** só são gerados quando o utilizador abre a aplicação (não há `pg_cron`).
- **Testes E2E:** não existem no projeto. A validação visual dos painéis e do calendário com dados reais tem de ser feita com contas de teste no ambiente da empresa.
