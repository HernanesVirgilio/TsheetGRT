# Timesheet Core · TsheetGRT

O Timesheet Core liga o registo de horas ao trabalho real da SI Holdings. O caminho deixa de ser "trabalhei 8 horas" e passa a ser:

```
Tarefa / Reunião / Oportunidade ──► Atividade com tempo ──► Período do timesheet ──► Revisão ──► Aprovação
          │                                  │
          └── histórico append-only          └── contexto: 3h tarefa A · 1h reunião · 1h oportunidade X …
```

As migrations são quatro, aplicadas por esta ordem:

| Migration | Conteúdo |
| :--- | :--- |
| `20261011000000_timesheet_core_schema.sql` | Permissões, tabelas, restrições, índices, contexto do tempo, funções internas |
| `20261011000001_timesheet_core_workflows.sql` | Tarefas, registo de tempo, totais de tempo |
| `20261011000002_timesheet_core_meetings_absences_opportunities.sql` | Reuniões, ausências, empresas, oportunidades |
| `20261011000003_timesheet_core_security.sql` | Anexos (Storage), eventos internos, calendário, resumos, RLS, privilégios |

## 1. Decisões de arquitetura

- **O tempo continua numa única tabela.** `timesheet_entries` ganha `kind` (`GENERAL`, `TASK`, `MEETING`, `OPPORTUNITY`, `UNPLANNED`) e as referências `task_id`, `meeting_id` e `opportunity_id`.
  - Não existe uma tabela de "atividades" paralela: uma atividade é um registo de tempo com contexto.
  - O catálogo `activities` continua a ser o tipo de atividade.
  - Os registos anteriores ficam `GENERAL`.
  - O fluxo de aprovação existente (`submit_timesheet` e `review_timesheet`) não muda.
- **O período é criado automaticamente.** Ao registar uma atividade, `ensure_my_timesheet_period(data)` devolve o período do colaborador que contém a data. Se não existir, cria-o segundo o ciclo da empresa (`TIMESHEET_PERIOD_TYPE`). Um período submetido ou aprovado não aceita registos novos.
- **A oportunidade do tempo é derivada.** Num registo ligado a uma tarefa ou reunião, o servidor preenche `opportunity_id` a partir dela. Assim, "tempo por oportunidade" é sempre coerente.
- **Cada entidade tem o seu histórico append-only:** `task_events`, `meeting_events`, `absence_events` e `opportunity_events`. Cada evento guarda o ator, o tipo, o campo, o valor anterior, o valor novo, a nota ou motivo, a marca `after_closure` e a data. A auditoria de segurança continua em `audit_events`, alimentada por triggers sobre estes históricos. São conceitos relacionados, mas tabelas distintas.
- **O âmbito de gestão é o existente.** Toda a regra "o gestor vê/gere" usa `is_manager_of_employee` e `private.scope_covers`; não existe um segundo sistema de âmbito.
- **Permissões granulares no módulo `work`.** Um futuro perfil (ex.: GESTOR) recebe estas permissões sem reconstrução do modelo. Até lá, o MANAGER assume essas funções. A única restrição a rever será `guard_manager_scope`, que hoje só aceita âmbitos para o perfil MANAGER.
- **Sem remoção física.** Usam-se estados: tarefas `CANCELLED`, reuniões `CANCELLED`, empresas `INACTIVE`, tipos de ausência inativos, eventos `CANCELLED`, anexos com remoção lógica (`deleted_at`).
- **Concorrência.** As funções bloqueiam a linha (`FOR UPDATE`). As edições de tarefas, reuniões e oportunidades recebem o `updated_at` lido pelo cliente e são recusadas se outra pessoa alterou o registo entretanto.

## 2. Entidades

| Tabela | Conteúdo principal |
| :--- | :--- |
| `tasks` | `reference` (TAR-00001), título, descrição, criador, responsável, departamento, prioridade, estado, início, prazo (`due_at`), estimativa, datas de início, conclusão e cancelamento, motivos (atraso, bloqueio, cancelamento), tarefa de origem, oportunidade, reunião |
| `meetings` + `meeting_participants` | Título, objetivo, agenda, início e fim (máx. 24 h), local, ligação (só http/https), organizador, estado, resultado, decisões, próximos passos, tarefa e oportunidade |
| `absence_types` | Tipos configuráveis (férias, doença, licença, assuntos pessoais, formação, missão, outro); `requires_attachment` |
| `absence_requests` | `reference` (AUS-00001), colaborador, tipo, período (máx. 1 ano), motivo, estado, submissão, decisão (decisor ≠ colaborador) |
| `companies` | Nome (único), NUIT (9 dígitos), contacto, telefone, e-mail, endereço, site, notas, estado |
| `opportunities` + `opportunity_members` | `reference` (OP-0001), empresa, contacto, descrição, problema, proposta, valores, moeda, probabilidade, data esperada, responsável, membros, estado, próximo passo e data, motivo de perda |
| `calendar_events` | Eventos internos (toda a empresa ou um departamento) |
| `attachments` | Metadados dos ficheiros (o binário fica no bucket privado `work-attachments`) |

## 3. Máquinas de estado

**Tarefas.** Não existe um estado "atrasada": o atraso calcula-se (`due_at < agora` e tarefa por concluir).

```
PLANNED ──atribuir──► ASSIGNED ──iniciar──► IN_PROGRESS ──concluir──► COMPLETED
   ▲                     │                    │    ▲                      │
   └──retirar resp.──────┘          bloquear  ▼    │ desbloquear          │ reabrir (gestão, motivo)
                                           BLOCKED ┘                      ▼
qualquer estado em aberto ──cancelar (gestão, motivo)──► CANCELLED    IN_PROGRESS
```

- **Conclusão depois do prazo:** exige motivo (`late_reason`, 5–1000 carateres). Fica no evento `TASK_COMPLETED_LATE` e uma restrição na base de dados impede apagá-lo.
- **Edição de uma tarefa concluída:** é permitida, mas exige motivo, e cada campo alterado gera um evento com `after_closure = true`.
- **Tarefa cancelada:** não volta a nenhum estado.
- **Tarefa adicional:** é uma nova tarefa com `parent_task_id`; a original nunca é sobrescrita.

**Reuniões:** `PLANNED → CONFIRMED → COMPLETED` (exige resultado, e só depois do início). `PLANNED`/`CONFIRMED → CANCELLED` (com motivo). Corrigir o resultado de uma reunião concluída exige motivo e fica marcado como pós-encerramento.

**Ausências:** `DRAFT → SUBMITTED → APPROVED | REJECTED`; "pedir correção" devolve a `DRAFT` com comentário.
- **Cancelamento pelo próprio:** um rascunho ou um pedido pendente pode ser cancelado a qualquer momento; uma ausência aprovada só antes de começar e com motivo.
- **Sobreposições:** são recusadas.
- **Tipos com comprovativo:** só são submetidos com o anexo.

**Oportunidades:** `NEW ↔ QUALIFICATION ↔ PROPOSAL ↔ NEGOTIATION → WON | LOST` (a perda exige motivo).
- **Cancelar e reabrir:** de `WON`/`LOST`/`CANCELLED` para `QUALIFICATION`; ambos exigem `TIMESHEET_OPPORTUNITY_MANAGE` e motivo.
- **Edição de uma oportunidade fechada:** exige motivo.

## 4. Permissões

| Permissão | EMPLOYEE | MANAGER | IT | ADMIN |
| :--- | :---: | :---: | :---: | :---: |
| `TIMESHEET_TASK_READ`, `TIMESHEET_TASK_UPDATE` | ✓ | ✓ | ✓ | ✓ |
| `TIMESHEET_TASK_CREATE`, `TIMESHEET_TASK_ASSIGN`, `TIMESHEET_TASK_REOPEN` | | ✓ | | ✓ |
| `TIMESHEET_CALENDAR_READ` | ✓ | ✓ | ✓ | ✓ |
| `TIMESHEET_CALENDAR_MANAGE` | | ✓ | | ✓ |
| `TIMESHEET_MEETING_READ`, `TIMESHEET_MEETING_CREATE` | ✓ | ✓ | ✓ | ✓ |
| `TIMESHEET_ABSENCE_CREATE` | ✓ | ✓ | ✓ | ✓ |
| `TIMESHEET_ABSENCE_READ`, `TIMESHEET_ABSENCE_APPROVE` | | ✓ | | ✓ |
| `TIMESHEET_OPPORTUNITY_READ`, `TIMESHEET_OPPORTUNITY_UPDATE` | ✓ | ✓ | | ✓ |
| `TIMESHEET_OPPORTUNITY_CREATE`, `TIMESHEET_OPPORTUNITY_MANAGE` | | ✓ | | ✓ |
| `TIMESHEET_ATTACHMENT_CREATE` | ✓ | ✓ | ✓ | ✓ |
| `TIMESHEET_ATTACHMENT_DELETE` | | ✓ | | ✓ |

- **Registo de tempo:** reutiliza as permissões existentes `SELF_TIMESHEET_*`, sem permissões novas.
- **Vista "equipa":** tarefas, reuniões, calendário e carga da equipa usam `TEAM_READ` em conjunto com o âmbito.
- **IT:** recebe apenas o uso pessoal, sem acesso administrativo ao timesheet. Como não tem `SELF_TIMESHEET_*`, não regista tempo, a menos que a administração lho atribua.

## 5. Quem vê e quem altera

| Registo | Vê | Altera / decide |
| :--- | :--- | :--- |
| Tarefa | Responsável, criador, gestor do responsável (âmbito), administração, responsável da oportunidade ligada | Execução: responsável. Planeamento, atribuição, cancelamento e reabertura: administração, criador ou gestor do responsável, com as permissões respetivas |
| Reunião | Organizador, participantes, gestor do organizador, administração | Organizador, gestor do organizador, administração |
| Ausência | Próprio, gestor do âmbito com `TIMESHEET_ABSENCE_READ`, administração | Próprio (rascunho, submissão, cancelamento); decisão: gestor do âmbito ou administração, nunca o próprio |
| Oportunidade | Responsável, criador, membros, gestor do responsável, administração | Dados e etapa: responsável, criador, gestor, administração; membros comentam e registam tempo |
| Anexo | Quem vê o registo a que pertence | Quem trabalha no registo, enquanto está aberto; remoção de anexos de terceiros com `TIMESHEET_ATTACHMENT_DELETE` e gestão do registo |
| Evento interno | Toda a empresa, ou o departamento indicado | Quem o criou (com `TIMESHEET_CALENDAR_MANAGE`) ou a administração |

## 6. Anexos

1. `register_attachment` valida a permissão, o acesso ao registo, o tipo (imagens, PDF, Office, texto, CSV) e o tamanho (≤ 10 MB, máximo de 20 por registo). Reserva um caminho gerado no servidor: `entidade/id/anexo/nome-sanitizado`.
2. O cliente carrega o ficheiro para esse caminho. A política de INSERT do Storage só aceita caminhos reservados pelo próprio utilizador e ainda não confirmados.
3. `confirm_attachment` confirma que o ficheiro existe, regista o evento no histórico da entidade e a auditoria `attachment.added`.

A leitura usa **URLs assinados de 2 minutos**: a política de SELECT do Storage só os emite se os metadados forem visíveis a quem pede (a RLS da entidade aplica-se). A remoção é lógica, com motivo obrigatório quando é feita por terceiros: o ficheiro deixa de estar acessível, mas o registo permanece. Não existem políticas de UPDATE nem de DELETE no Storage.

## 7. Notificações (mecanismo existente `notifications`)

| Acontecimento | Destinatários |
| :--- | :--- |
| Tarefa atribuída ou reatribuída | Novo responsável |
| Tarefa bloqueada; concluída (ou concluída com atraso) | Quem a criou |
| Tarefa reaberta ou cancelada; prazo ou prioridade alterados | Responsável |
| Comentário numa tarefa | Responsável e criador (exceto o autor) |
| Reunião criada, reagendada ou cancelada | Participantes e organizador (exceto o autor) |
| Participante acrescentado | O participante |
| Ausência submetida | Gestores do âmbito com permissão de aprovação; sem gestor, a administração |
| Ausência aprovada, rejeitada ou devolvida | O colaborador |
| Ausência aprovada cancelada | Gestores do âmbito |
| Oportunidade atribuída; membro acrescentado | O responsável; o membro |
| Oportunidade ganha, perdida, cancelada ou reaberta | Responsável e criador |
| Comentário numa oportunidade | O responsável |

Nunca se notifica o próprio autor nem contas inativas.

As notificações de **prazo próximo** não são enviadas, porque exigem um agendador (o projeto não tem `pg_cron`). Os prazos próximos e atrasados aparecem no centro de trabalho, na carga da equipa e no calendário.

## 8. Auditoria

| Origem | Ações registadas |
| :--- | :--- |
| Tarefas | `task.created`, `task.assigned`, `task.reassigned`, `task.unassigned`, `task.started`, `task.blocked`, `task.unblocked`, `task.updated`, `task.priority_changed`, `task.deadline_changed`, `task.completed`, `task.completed_late`, `task.reopened`, `task.cancelled` |
| Reuniões | `meeting.created`, `meeting.updated`, `meeting.rescheduled`, `meeting.confirmed`, `meeting.completed`, `meeting.outcome_updated`, `meeting.cancelled`, `meeting.participant_added`, `meeting.participant_removed` |
| Ausências | `absence.created`, `absence.updated`, `absence.submitted`, `absence.approved`, `absence.rejected`, `absence.changes_requested`, `absence.cancelled` |
| Oportunidades | `opportunity.created`, `opportunity.updated`, `opportunity.stage_changed`, `opportunity.owner_changed`, `opportunity.member_added`, `opportunity.member_removed`, `opportunity.won`, `opportunity.lost`, `opportunity.cancelled`, `opportunity.reopened` |
| Outros | `company.created`, `company.updated`, `company.status_changed`; `calendar_event.created`, `calendar_event.updated`, `calendar_event.cancelled`; `absence_type.created`, `absence_type.updated`; `attachment.added`, `attachment.removed` |

## 9. Calendário e resumos

- **`get_calendar_items(de, até, 'ME' | 'TEAM')`:** função `SECURITY INVOKER`, por isso cada fonte é lida com a RLS de quem consulta. Junta prazos e inícios de tarefas, reuniões, ausências aprovadas (e as pendentes do próprio), atividades com tempo, eventos internos e próximos passos de oportunidades. O intervalo máximo é de 62 dias.
- **`get_my_work_summary()`:** resumo do dia do próprio — tarefas por estado, atrasadas, prazos de hoje e dos próximos 7 dias, tempo de hoje e da semana, meta diária, reuniões de hoje, ausência de hoje e pedidos pendentes.
- **`get_team_work_overview()`:** carga de trabalho por colaborador do âmbito (ou de toda a organização, para a administração). Mostra tarefas em aberto, em curso, bloqueadas e atrasadas, prazos a 7 dias, horas da semana, ausência de hoje e pedidos pendentes.
- **`get_work_time_totals(tipo, id)`:** tempo dedicado a uma tarefa, reunião ou oportunidade, por pessoa. Responde à pergunta "em que passou a equipa o tempo?".
- **`list_work_people(finalidade)`, `get_meeting_people(id)` e `get_opportunity_people(id)`:** diretórios mínimos (nome, cargo, departamento). Permitem escolher responsáveis e participantes sem abrir a leitura de perfis completos.

## 10. Interface

As páginas ficam na secção **Trabalho** da barra lateral, cada uma protegida por permissão:

| Rota | Conteúdo | Permissão |
| :--- | :--- | :--- |
| `/timesheet` | Centro de trabalho; é também a dashboard do perfil EMPLOYEE | `TIMESHEET_TASK_READ` |
| `/timesheet/tasks`, `/timesheet/tasks/:id` | Tarefas | `TIMESHEET_TASK_READ` |
| `/timesheet/activities` | Atividades e tempo | `SELF_TIMESHEET_READ` |
| `/timesheet/calendar` | Calendário | `TIMESHEET_CALENDAR_READ` |
| `/timesheet/meetings`, `/timesheet/meetings/:id` | Reuniões | `TIMESHEET_MEETING_READ` |
| `/timesheet/absences` | Ausências e aprovações | `TIMESHEET_ABSENCE_CREATE` |
| `/timesheet/opportunities`, `/timesheet/opportunities/:id`, `/timesheet/companies` | Oportunidades e empresas | `TIMESHEET_OPPORTUNITY_READ` |
| `/timesheet/team` | Carga da equipa | `TEAM_READ` |

O detalhe do timesheet e a revisão do gestor mostram agora o contexto de cada registo de tempo e as ausências aprovadas no período.

## 11. Fora do âmbito nesta fase

- Perfil GESTOR operacional.
- Lembretes agendados de prazos (exigem `pg_cron` ou uma Edge Function agendada).
- Ligação automática entre pedidos de IT e tarefas.
- Interface para gerir os tipos de ausência: por agora geridos pela administração por SQL ou pela API sob RLS.
- Relatórios agregados por contexto: os dados existem em `timesheet_entries`.
- Divisão do bundle por rotas.
