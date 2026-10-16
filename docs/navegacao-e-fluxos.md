# Navegação, módulos consolidados e fluxos · TsheetGRT

Este documento descreve a arquitetura de informação da aplicação e os fluxos introduzidos com as migrations `20261015000000_collaboration_availability_reminders.sql` e `20261015000001_reporting_centre.sql`.

Princípio: **cada capacidade tem um único destino principal**. O painel inicial responde ao "agora", cada módulo tem os detalhes e as ações, e o centro de relatórios analisa um período.

## 1. Menu lateral

O menu é gerado a partir de `src/components/layout/navigationConfig.ts`. Cada item só aparece se o utilizador tiver a permissão (ou uma das permissões) da rota: o menu reflete as permissões efetivas, não o nome do perfil. A RLS continua a ser a barreira real.

| Grupo | Destino | Rota | Requisito |
| :--- | :--- | :--- | :--- |
| Início | Dashboard | `/dashboard` | — |
| Trabalho | Timesheet | `/timesheets` | `SELF_TIMESHEET_READ` |
| | Tarefas | `/timesheet/tasks` | `TIMESHEET_TASK_READ` |
| | Calendário | `/timesheet/calendar` | `TIMESHEET_CALENDAR_READ` |
| | Atividades (registo de tempo) | `/timesheet/activities` | `SELF_TIMESHEET_READ` |
| | Oportunidades (e empresas) | `/timesheet/opportunities` | `TIMESHEET_OPPORTUNITY_READ` |
| Colaboração | Reuniões | `/timesheet/meetings` | `TIMESHEET_MEETING_READ` |
| | Equipa | `/team` | `TEAM_READ` |
| | Disponibilidade | `/timesheet/absences` | `TIMESHEET_ABSENCE_CREATE` |
| Aprovações | Aprovações | `/approvals` | uma de: `TEAM_TIMESHEET_REVIEW`, `TIMESHEET_ABSENCE_VALIDATE`, `TIMESHEET_ABSENCE_APPROVE`, `TIMESHEET_OPPORTUNITY_APPROVE`, `TIMESHEET_OPPORTUNITY_CREATE`, `TEAM_READ` |
| Análise | Relatórios | `/reports` | `REPORTS_READ` ou `TEAM_READ` |
| Suporte | Pedidos de suporte | `/support` | `IT_TICKET_CREATE` |
| | Fila de suporte, Ativos, Intervenções | `/it/...` | permissões `IT_*` |
| Administração | Utilizadores, Departamentos, Roles e Permissões, Configurações, Auditoria, Saúde do Sistema | | permissões administrativas |

Perfil e Notificações estão no menu do utilizador (cabeçalho). O cabeçalho mostra o grupo e a página atual em vez de repetir a identidade da empresa.

### Consolidações

| Antes | Agora |
| :--- | :--- |
| "Centro de trabalho" (`/timesheet`) e o dashboard do colaborador | O dashboard do colaborador é o centro de trabalho; `/timesheet` redireciona para `/dashboard` |
| "Minha Equipa" (`/team`), "Carga da equipa" (`/timesheet/team`), "Atividade" (`/activity`) | **Equipa** com os separadores Pessoas, Carga de trabalho, Disponibilidade e Atividade |
| "Aprovações" (`/approvals`), "Pedidos de aprovação" (`/timesheet/approvals`), separador "Equipa" das ausências | **Aprovações** com os separadores Timesheets, Ausências, Oportunidades e Reuniões (só os que o utilizador decide) |
| "Relatórios" (`/reports`) e "Relatórios da equipa" (`/timesheet/reports`) | **Relatórios** com Horas registadas, Timesheets, Equipa e tarefas e Aprovações |
| "Ausências" | **Disponibilidade**: pedidos formais e comunicação de ausência |

Os endereços antigos continuam a funcionar (`LEGACY_REDIRECTS` em `src/lib/auth/routeAccess.ts`), incluindo as ligações já guardadas nas notificações (`/timesheet/absences?tab=TEAM` abre o separador Ausências das aprovações).

"Atividades" (registo de tempo do Timesheet) e "Atividade" da equipa (eventos dos timesheets da equipa) são dados diferentes: o primeiro fica em Trabalho, o segundo dentro de Equipa. A auditoria completa continua em Administração › Auditoria.

## 2. Painéis por perfil

Todos os painéis têm o mesmo cabeçalho (`DashboardHeader`): data, departamento, saudação pelo nome preferido, uma frase sobre o painel e as ações do perfil. Não há fotografias decorativas.

| Perfil | Ação principal | Indicadores |
| :--- | :--- | :--- |
| Colaborador | Registar horas | Horas na semana, estado do timesheet atual, tarefas pendentes, próximas reuniões; decisões recentes |
| Gestor | Rever aprovações (com o número pendente) | Equipa, em curso, em atraso, concluídas; precisa da sua atenção |
| Manager | Rever aprovações | Gestores, concluídas, em atraso, horas; decisões pendentes e carga por equipa |
| IT | Abrir fila de suporte | Críticos, sem técnico, prazo ultrapassado, espera prolongada; saúde do sistema |
| Administração | Rever aprovações | Utilizadores, departamentos, timesheets por aprovar e aprovados; pontos de atenção, saúde do sistema, auditoria recente |

A saúde do sistema faz verificações reais (base de dados, autenticação, sessão) no momento da consulta.

Sem equipa configurada, o gestor e o Manager veem uma mensagem a explicar que a atribuição é feita por um administrador autorizado. Nunca se inventa hierarquia.

## 3. Aprovação de timesheets

O ciclo já era imposto pela base de dados: submissão só pelo próprio, decisão só por quem supervisiona o colaborador (`is_manager_of_employee`), nunca o próprio (`timesheets_no_self_approval`), rejeição com motivo (`timesheets_rejection_has_reason`), linha bloqueada durante a decisão (`FOR UPDATE`) e edição apenas em rascunho ou rejeitado.

Novo:

- **`get_timesheet_history(id)`** devolve o histórico guardado: criação, submissões e reaberturas vêm da auditoria, e as decisões vêm de `timesheet_approvals`, com o comentário. Leitura pelo próprio, por quem o supervisiona com `TEAM_TIMESHEET_READ` e pela administração.
- **`ApprovalFlow`** (`src/components/timesheets/ApprovalFlow.tsx`) mostra Rascunho → Submetido → Análise do gestor → Aprovado e bloqueado. É horizontal em ecrãs largos e vertical em ecrãs estreitos. Cada etapa tem texto, pessoa e data, e a rejeição mostra o motivo. Aparece no timesheet do colaborador e na revisão do gestor.

O estado "Em análise" corresponde a `SUBMITTED`: a aplicação não regista a abertura da revisão como estado separado.

## 4. Reuniões

Uma reunião normal e um pedido de participação de uma chefia são operações diferentes. O pedido é uma opção explícita da mesma reunião, não uma reunião à parte.

| Operação | Quem | Aprovação | Função |
| :--- | :--- | :--- | :--- |
| Agendar reunião | Quem tem `TIMESHEET_MEETING_CREATE` (todos os perfis desde `20261016000000`) | Nenhuma | `create_meeting` |
| Convidar um departamento | Quem agenda | Nenhuma | O formulário junta as pessoas do departamento (do diretório `list_work_people`, que agora devolve `department_id`) às escolhidas individualmente, sem duplicados |
| Solicitar participação do gestor / de outro gestor | Quem organiza | A chefia aceita, recusa ou propõe outro horário | `create_meeting(..., p_request_lead_id)` ou `request_meeting_participation` |

**Quem pode ser convidado** (`can_invite_to_meeting`):

- colegas (mesmo departamento ou mesma chefia direta);
- a sua equipa e as suas chefias;
- os envolvidos no registo ligado (tarefa ou oportunidade);
- qualquer pessoa, se for a administração.

O servidor recusa convidados fora destas regras, mesmo que o browser os envie. Quem organiza é sempre o utilizador autenticado.

**Ciclo do pedido** (`meetings.request_status`), independente do estado da reunião (`meetings.status`):

| Estado | Significado |
| :--- | :--- |
| `NULL` | Reunião normal, sem pedido. Nunca aparece nas decisões pendentes. |
| `PENDING` | À espera da chefia (`requested_with`), que ainda **não** é participante. A reunião não pode ser confirmada. |
| `ACCEPTED` | A chefia passou a participante (presença confirmada) e a reunião ficou `CONFIRMED`. |
| `REJECTED` | Motivo obrigatório. Com outros participantes, a reunião mantém-se. Só com a chefia, é cancelada. |
| `RESCHEDULE_PROPOSED` | A chefia propôs outro horário (`request_proposed_*`). Quem organiza aceita (`respond_to_reschedule_proposal`): a reunião muda de hora, os participantes são notificados e a chefia entra. Ou recusa, e o pedido é retirado. |
| `CANCELLED` | Pedido retirado por quem organiza (`cancel_meeting_request`) ou reunião cancelada. A chefia é informada. |

**Regras:**

- Só se pede a participação de uma chefia configurada de quem organiza (`list_my_leads`, mesma regra de `get_profile_leads`). Sem relação configurada, a interface explica que a atribuição é feita pela administração: nunca se escolhe uma pessoa arbitrária.
- Entre Managers não há hierarquia: um Manager só pede a participação de quem estiver configurado como sua chefia.
- Só decide a pessoa a quem foi pedido. Quem pediu, outros participantes e outras chefias recebem "não encontrado".
- A decisão bloqueia a linha. Uma segunda decisão é recusada.
- Pedidos repetidos para a mesma pessoa e hora são recusados.
- Cada abertura do formulário gera uma chave de pedido (`client_request_id`). Reenviar com a mesma chave (duplo clique, nova tentativa após falha de rede) devolve a reunião já criada, sem segundo convite. Duas reuniões diferentes com o mesmo título e horário continuam permitidas. O formulário tem ainda uma guarda contra duplo clique.

**Notificações:** convite, pedido de participação, participação aceite ou recusada, novo horário proposto, novo horário aceite, pedido retirado, reagendamento e cancelamento.

**Onde aparecem os pedidos:**

- Aprovações › Reuniões;
- painel do Manager ("Decisões pendentes");
- painel do Gestor ("Precisa da sua atenção").

No calendário, uma reunião com o pedido em curso aparece como "Planeada · participação pedida, por confirmar" (estado `REQUEST_PENDING` em `get_calendar_items`).

## 5. Ausências: pedir ou comunicar

| Ação | Quem | Resultado |
| :--- | :--- | :--- |
| Solicitar ausência | `TIMESHEET_ABSENCE_CREATE` | Fluxo formal existente: rascunho → validação do gestor → decisão do Manager (ou da administração, se não houver chefia) |
| Comunicar ausência | `TIMESHEET_ABSENCE_NOTIFY` (GESTOR, MANAGER, ADMIN; ajustável em Roles e Permissões) | Registo `kind = NOTICE`, estado `COMMUNICATED`. Notifica as chefias configuradas e a equipa direta |

- Uma comunicação nunca é uma ausência aprovada. A restrição `absence_requests_notice_consistency` impede que tenha validação ou decisão, e o rótulo é "Comunicada (sem aprovação)".
- Conta como indisponibilidade no calendário, nos conflitos de agenda, no resumo pessoal e na carga da equipa.
- Quem comunicou pode cancelar enquanto a ausência não terminou.

## 6. Centro de relatórios

- **Períodos:**
  - Diário, Semanal (segunda a domingo), Mensal, Trimestral, Anual e Personalizado (até 366 datas de calendário, validado também no servidor). O intervalo é sempre mostrado.
  - A comparação é com o período anterior equivalente. No modo personalizado, usa o mesmo número de dias imediatamente antes.
- **Dados:**
  - `get_hours_report`, `get_hours_trend` e `get_approval_report` agregam no servidor (o PostgREST devolve no máximo 1000 linhas).
  - Correm como quem chama (`SECURITY INVOKER`), por isso o âmbito é o das políticas RLS. Um filtro de departamento ou colaborador fora do âmbito é recusado (`private.assert_report_scope`, erro 42501) em vez de devolver zeros. A exportação CSV usa os mesmos dados e filtros.
- **Variações:** sem base no período anterior (zero), não se mostra percentagem.
- **Observações:**
  - Só aparecem quando a comparação é válida e a variação é de pelo menos 5% (`INSIGHT_MIN_CHANGE`).
  - Exemplos: horas a descer, menos pessoas com registos, timesheets pendentes há mais de N dias, variação da taxa de rejeição.
  - Descrevem o histórico, não fazem previsões.
- **Tempo até à decisão:** mede-se da última submissão à decisão mais recente de cada timesheet. Os ciclos anteriores não guardam a hora de submissão fora da auditoria.

## 7. Lembretes por regra

`refresh_approval_reminders()` é chamado ao carregar as notificações, tal como os alertas de prazo, e usa uma chave de deduplicação.

| Lembrete | Para quem | Regra |
| :--- | :--- | :--- |
| Timesheet pendente | Quem pode decidir (âmbito) | Submetido há mais de `APPROVAL_REMINDER_DAYS` dias (por omissão 3; configurável em Configurações, 1 a 30) |
| Ausência pendente | Quem deve validar ou decidir | Mesma regra |
| Timesheet por submeter | O próprio | Rascunho ou rejeitado, com registos, e período já terminado |

Não há agendador (`pg_cron`). Os lembretes são gerados quando a pessoa abre a aplicação. Não foi introduzido nenhum prazo de submissão da empresa: só se lembra o que já está atrasado pelos próprios dados.

## 8. Identidade visual

Os tokens estão centralizados em `src/index.css`:

- primário `#47B255`, verde-folha `#0B8043` e turquesa `#0F7A6B` (menu);
- fundo `#F8F9FA` e texto `#1A1A1A`/`#333333`;
- tema escuro com os mesmos tokens.

As cores dos gráficos deixaram de ser azuis:

| Tema | Série 1 (verde) | Série 2 (âmbar) |
| :--- | :--- | :--- |
| Claro | `#0B8043` | `#D9901A` |
| Escuro | `#1F7A36` | `#C4862C` |

Foram validadas para daltonismo com o validador de paletas. Os gráficos têm sempre legenda, tooltip e tabela de valores.

## 9. Aplicar as migrations

**Estado verificado em produção** (projeto `iahgopefwixbprfzcwbd`, 13/10/2026):

- As migrations até `20261014000000` estão aplicadas.
- As migrations `20261015000000` e `20261015000001` **não** estão aplicadas.
- As quatro colunas do pedido em `meetings` (`requested_with`, `request_status`, `request_decided_at`, `request_decision_comment`) foram acrescentadas à mão.

A verificação foi feita sem credenciais privilegiadas. Chamadas anónimas às funções devolvem "permission denied" quando a função existe e PGRST202 quando não existe. As colunas acrescentadas à mão são as indicadas por quem as criou.

Enquanto as migrations não forem aplicadas, as funcionalidades novas mostram "Esta funcionalidade precisa de uma atualização da base de dados que ainda não foi aplicada": relatórios, pedidos de participação, respostas aos convites e comunicação de ausências.

As duas migrations podem ser aplicadas sobre esse estado e podem ser repetidas:

- **Colunas:** `ADD COLUMN IF NOT EXISTS`. Os tipos das colunas acrescentadas à mão são normalizados só se forem diferentes.
- **Restrições:** criadas `NOT VALID` e validadas a seguir. Se houver linhas antigas fora da regra, a migration emite um aviso em vez de falhar.
- **Funções e triggers:** recriados (`CREATE OR REPLACE`, `DROP TRIGGER IF EXISTS`).
- **Dados:** nenhum dado é apagado. As colunas novas têm valores por omissão neutros.

Os testes reproduzem exatamente este estado e aplicam as duas migrations duas vezes (`supabase/tests/collaboration.security.test.ts`).

**Como aplicar** (por quem tem acesso de administração ao projeto):

1. Com a CLI: `supabase link --project-ref iahgopefwixbprfzcwbd` e depois `supabase db push`. A CLI aplica só as migrations em falta.
2. Em alternativa, no SQL Editor: executar o conteúdo de `20261015000000_collaboration_availability_reminders.sql` e depois o de `20261015000001_reporting_centre.sql`.
3. Verificar que não houve avisos `Restrição … por validar`. Se houver, corrigir as linhas indicadas e executar o `VALIDATE CONSTRAINT` sugerido.
4. Gerar de novo os tipos, se usar a geração automática, e confirmar com `npm run test:db`.
