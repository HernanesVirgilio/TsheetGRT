# Aplicação das migrations 20261015 em produção · TsheetGRT

Procedimento para aplicar `20261015000000_collaboration_availability_reminders.sql` e `20261015000001_reporting_centre.sql` ao projeto Supabase `iahgopefwixbprfzcwbd`.

Destina-se a quem tem acesso de administração ao projeto.

**Estado (2026-10-16):** as duas migrations estão aplicadas e registadas no histórico. O conteúdo registado em `supabase_migrations.schema_migrations` é idêntico aos ficheiros deste repositório (83 e 11 instruções). A pós-verificação no projeto real deu 89 verificações: 88 OK, 0 bloqueios e 1 aviso (exposição do esquema `private`, a confirmar em Settings › API › Exposed schemas). Pendente: `20261016000000_role_responsibilities.sql`.

## 1. O que vai ser aplicado

**Versões revistas.** Impressões digitais SHA-256 dos ficheiros na árvore de trabalho atual, com fins de linha LF:

| Ficheiro | Linhas | SHA-256 |
| :--- | ---: | :--- |
| `supabase/migrations/20261015000000_collaboration_availability_reminders.sql` | 1626 | `e2bffe159725a3336c4a339c5816ded9a5f4245a3dc5c9cd9c7faa0d8a66b5fd` |
| `supabase/migrations/20261015000001_reporting_centre.sql` | 213 | `58b34224232b88d6888d9637b18194c13c047d73e89cccb904979efc34ce31d4` |
| `supabase/scripts/20261015_preflight.sql` (só leitura) | | `d003f1cd6ffa4cfd2393874497e9b4232efd9c88aec36bb30e64de6a3821cee9` |
| `supabase/scripts/20261015_postcheck.sql` (só leitura) | | `c32d6a2fee4d44183b344d0195c79600be4c3c81e9171a53a559cbde8c11690b` |

**Reconciliação do histórico (2026-10-16).** O projeto tinha duas versões registadas sem ficheiro local, ambas reparações parciais feitas à mão (só `ADD COLUMN IF NOT EXISTS`). O SQL exato foi recuperado de `supabase_migrations.schema_migrations.statements` e guardado sem alterações; não foi preciso `migration repair`:

| Ficheiro | Linhas | SHA-256 (LF) |
| :--- | ---: | :--- |
| `supabase/migrations/20261012144835_repair_meeting_requests_and_absence_kind.sql` | 27 | `7d41796b167d75c239b0ebfbc4ea4a18133182df6a7422fba7b8c2e5fe4cb4d0` |
| `supabase/migrations/20261013141640_repair_missing_meeting_columns.sql` | 13 | `e77c877cdcf07d07d13ab2b46bd9b43621cb61763be1d4dc188803a9674cfadc` |

Diferenças que ficam depois de aplicar `20261015000000` (inofensivas): `absence_requests.kind` mantém `varchar(30)` (a migration acrescenta-a como `varchar(10)` só quando não existe; a restrição `absence_requests_kind_valid` limita os valores) e o índice `idx_meetings_requested_with_request_status` da reparação mantém-se.

O Git está configurado para converter LF em CRLF ao fazer commit no Windows, o que muda a impressão digital. Depois do commit, compare com `git diff 13093aa -- supabase/migrations`, ou registe o hash do commit que for aplicado.

**Histórico dos ficheiros.**

- O commit `13093aa` contém uma versão anterior destas migrations.
- A árvore de trabalho altera-as em 738 linhas acrescentadas e 171 removidas.
- Nenhuma das versões foi aplicada em produção: as funções não existem no projeto, como se indica na secção 3.
- Aplicar sempre a versão da árvore de trabalho (ou o commit que a incluir), nunca a de `13093aa`.

**Alterações por commitar** (`git status`):

| Área | Ficheiros |
| :--- | :--- |
| Base de dados | as duas migrations; `supabase/scripts/20261015_preflight.sql` e `20261015_postcheck.sql` (novos); testes `collaboration.security`, `migration-procedure` (novo) e `harness` |
| Layout | `AppShell.tsx` e `Sidebar.tsx` (um só contexto de deslocamento); `index.html` e `public/favicon.svg` |
| Reuniões | `MeetingFormModal`, `MeetingDetailPage`, `MeetingsPage`, `CalendarPage`, `MeetingRequestsPanel` e `DashboardPanels`; `MeetingRequestActions.tsx` (novo); `MeetingRequestModal.tsx` removido |
| Painéis | `ManagerDashboard`, `GestorDashboard` (pedidos de participação nas decisões pendentes) |
| Dados e erros | `meetingService`, `calendarService`, `types/database.ts`, `types/work.ts`, `lib/errors.ts` (esquema em falta explicado) |
| Textos e testes | `i18n/en.ts`, `admin.test.ts`, `navigation.test.ts`, `package.json`, `docs/navegacao-e-fluxos.md`, este documento |

## 2. Revisão de segurança

Resultado da revisão automática e manual das duas migrations:

| Verificação | Resultado |
| :--- | :--- |
| Tabelas novas | Nenhuma. Não se cria uma segunda tabela de reuniões nem de pedidos. |
| Políticas RLS | Nenhuma criada, alterada ou removida. Nenhuma tabela fica sem RLS. |
| Privilégios de tabelas | Nenhum `GRANT` em tabelas. Nada é concedido a `anon`. |
| Funções `SECURITY DEFINER` | Todas com `search_path = ''`. Cada uma valida a sessão, a permissão, o âmbito e o estado do registo. |
| Funções novas expostas à API | `EXECUTE` revogado de `PUBLIC` e de `anon` e concedido só a `authenticated`. |
| Funções internas novas (`private.*`) | Sem `EXECUTE` para `anon`/`PUBLIC`. Só três têm `EXECUTE` para `authenticated`, porque são chamadas dentro de funções `SECURITY INVOKER` (que correm com os privilégios de quem chama): `assert_report_range` (só valida datas), `assert_report_scope` (devolve `VOID` ou recusa) e `approval_reminder_days` (devolve um número de dias). Nenhuma devolve dados de outras pessoas. `is_valid_approval_reminder_days` fica sem acesso para `authenticated`. O esquema `private` não deve estar exposto no PostgREST (confirmar em Settings › API › Exposed schemas; a pré/pós-verificação mostra AVISO quando não o consegue determinar). |
| Funções de relatório | `SECURITY INVOKER`, mantido: os dados são sempre filtrados pelas políticas RLS de quem chama. Em cima disso, `private.assert_report_scope` recusa (erro 42501) filtros de departamento ou colaborador fora do âmbito, em vez de devolver zeros enganadores. O departamento enviado pelo browser nunca alarga o acesso. |
| Reuniões e participantes | Sem escrita direta. Só as funções escrevem, numa transação, com a linha bloqueada (`FOR UPDATE`) nas decisões. |
| Quem organiza | Definido no servidor (`require_actor`); o browser nunca envia o organizador. |
| Quem decide um pedido | Só a pessoa em `requested_with`. Quem pediu, outros participantes e outras chefias recebem "não encontrado". |
| Dados existentes | Nenhum `DELETE`, `TRUNCATE`, `DROP TABLE` nem `DROP COLUMN`. Os `DROP FUNCTION` são seguidos da recriação na mesma transação. |
| Segredos | Nenhum no SQL. A pesquisa no bundle do frontend não encontrou chaves de serviço. |

As funções `CREATE OR REPLACE` sobre funções já existentes mantêm o dono e os privilégios atuais. Estão neste caso `get_calendar_items`, `get_my_work_summary`, `get_team_work_overview`, `get_schedule_conflicts`, `cancel_absence_request`, `can_invite_to_meeting`, `absence_status_label` e `notification_category`. A pós-verificação confirma que continuam sem acesso anónimo.

**Alterações de regras de negócio, intencionais, a confirmar por quem decide:**

1. A versão aplicada em produção (2026-10-16) **não** dá `TIMESHEET_MEETING_CREATE` a EMPLOYEE e IT. A especificação de harmonização dos papéis, posterior, pede que os colaboradores agendem reuniões com colegas: a permissão é atribuída pela migration seguinte, `20261016000000_role_responsibilities.sql` (a `20261015000000` já aplicada não é alterada).
2. Podem ser convidados colegas do mesmo departamento ou da mesma chefia direta, além da equipa, das chefias e dos envolvidos.
3. GESTOR, MANAGER e ADMIN recebem `TIMESHEET_ABSENCE_NOTIFY` (comunicar ausência). Ajustável em Roles e Permissões.

### Correções da revisão estática (2026-10-13)

| Problema | Correção | Migration |
| :--- | :--- | :--- |
| `assert_report_range` aceitava `p_to - p_from <= 400` com a mensagem "um ano" | Máximo de 366 datas de calendário (`p_to - p_from <= 365`): um ano bissexto completo é aceite, 367 datas são recusadas. Datas nulas e invertidas continuam recusadas, com mensagens próprias. | 000001 |
| `get_hours_trend` com `p_bucket` NULL devolvia um único grupo nulo | NULL recusado explicitamente, como qualquer valor fora de `day`/`week`/`month`. | 000001 |
| Filtro de departamento/colaborador fora do âmbito devolvia vazio | `private.assert_report_scope` recusa com 42501. ADMIN: qualquer filtro. Restantes: o próprio departamento/a si próprio; com `TEAM_TIMESHEET_READ`, departamentos e pessoas que chefiam. | 000001 |
| `APPROVAL_REMINDER_DAYS` só validado em `UPDATE`; valor inválido convertido sem controlo | Trigger `BEFORE INSERT OR UPDATE` (inteiro 1–30, texto não numérico recusado sem erro de conversão). `private.approval_reminder_days()` dá erro explícito se a definição faltar ou for inválida, nunca um valor inventado. A migration **para** se a definição já existir com valor inválido, sem a substituir. | 000000 (a função passou para esta migration) |
| Restrições novas sobre dados históricos (`meeting_events`, `absence_events`, `absence_requests`) | Bloco "0. PRÉ-CONDIÇÕES": conta registos incompatíveis, mostra até 10 identificadores e **para sem aplicar nada**. Nenhum registo é apagado ou convertido. | 000000 |
| `create_meeting` evitava duplicados com uma heurística (mesmo título e hora em 2 minutos), que bloqueava reuniões legítimas e não era segura com pedidos simultâneos | Idempotência explícita: `p_client_request_id` (UUID gerado pelo formulário, mantido entre tentativas), coluna `meetings.client_request_id`, índice único parcial `(organizer_id, client_request_id)` e `INSERT … ON CONFLICT DO NOTHING`. Mesma chave → mesma reunião, sem segundo convite. Sem chave (versão anterior da aplicação) → sem bloqueio. | 000000 |

**Divergência conhecida, não alterada:** `get_team_report` (migration 20261012000002, já aplicada) aceita `p_to - p_from <= 366` (367 datas). Alterá-la exigiria uma migration nova; o frontend já limita a 366 datas (`rangeLength > 366`).

## 3. Compatibilidade com o estado real

### O que foi verificado

Verificado sem credenciais de administração:

- Chamadas anónimas às funções devolvem `permission denied` se a função existe e `PGRST202` se não existe.
- **Aplicadas:** as migrations até `20261014000000` (por exemplo, `get_profile_leads` e `get_schedule_conflicts` existem).
- **Não aplicadas:** as duas migrations 20261015. Não existem `respond_to_meeting`, `communicate_absence`, `get_hours_report`, `get_timesheet_history` nem `list_my_leads`.
- O acesso anónimo às tabelas está bloqueado, como esperado.

### O que não foi verificado

Exige administração:

- a definição exata das quatro colunas acrescentadas à mão (tipo, `NULL`, valor por omissão);
- restrições, índices ou triggers criados à mão;
- o conteúdo de `supabase_migrations.schema_migrations`;
- se alguma função foi alterada diretamente no painel do Supabase.

### Como a migration lida com o que não foi verificado

| Situação possível | Comportamento | Testado |
| :--- | :--- | :--- |
| As colunas não existem, ou existem com outro tipo | `ADD COLUMN IF NOT EXISTS`. O tipo só é normalizado se for diferente, sem perder valores. | Sim |
| As colunas têm `DEFAULT` ou `NOT NULL` (ex.: `DEFAULT 'NONE'`) | `DROP DEFAULT` e `DROP NOT NULL`, sem alterar valores. As linhas existentes fora da regra geram um aviso `Restrição … por validar`, e a restrição fica ativa para dados novos. | Sim |
| Restrição criada à mão com outro nome sobre estas colunas | A migration **para sem aplicar nada** e indica a restrição. Nada é apagado às cegas. | Sim |
| Chave estrangeira criada com o nome por omissão (`meetings_requested_with_fkey`) | Recriada com `ON DELETE RESTRICT` | Sim |
| Uma vista depende de `create_meeting`, `decide_meeting_request`, `get_meeting_people` ou `list_work_people` | O `DROP FUNCTION` falha e nada é aplicado. A pré-verificação P8 deteta este caso antes. | Pré-verificação |
| Aplicação repetida | Sem efeito adicional. Só acrescenta um registo de auditoria `permission.changed`. | Sim |
| Uma função foi alterada à mão no painel | É substituída pela versão do repositório. | Não detetável sem administração: comparar com a pré-verificação P7 |

O teste `supabase/tests/migration-procedure.test.ts` reproduz o estado de produção:

- migrations até 20261014;
- reuniões, participantes e ausências criados com as funções antigas;
- as quatro colunas acrescentadas à mão.

Sobre esse estado, corre a pré-verificação, aplica as duas migrations e corre a pós-verificação (mais de 80 verificações, sem bloqueios; o único aviso é a exposição do esquema `private`, que SQL não determina). Confirma também:

- os dados existentes ficam intactos;
- a versão anterior do frontend continua a funcionar (a nova assinatura de `create_meeting` aceita as chamadas antigas);
- as duas variantes da tabela anterior se comportam como descrito;
- **bloqueios:** restrição desconhecida, `APPROVAL_REMINDER_DAYS` inválido (valor preservado) e dados históricos incompatíveis — a pré-verificação mostra BLOQUEIO, a migration para e nada fica aplicado;
- sem `supabase_migrations.schema_migrations`, o resumo da pré-verificação corre e mostra AVISO.

**Ordem de implantação:**

1. Aplicar a base de dados.
2. Publicar o frontend.

O frontend atual funciona com a base de dados nova. O frontend novo com a base de dados antiga mostra "Esta funcionalidade precisa de uma atualização da base de dados".

## 4. Histórico de migrations: verificar antes e depois

A CLI regista cada migration aplicada na tabela `supabase_migrations.schema_migrations` (colunas `version`, `name`, `statements`). É essa tabela que decide o que `db push` aplica.

**Antes de aplicar:**

```bash
supabase link --project-ref iahgopefwixbprfzcwbd
supabase migration list --linked        # colunas Local | Remote, uma linha por versão
supabase db push --linked --dry-run     # lista o que seria aplicado, sem aplicar
```

E no SQL Editor, o bloco P1 de `20261015_preflight.sql`:

```sql
SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;
```

**Resultado esperado:** `Remote` preenchido de `20261001000000` a `20261014000000`, e `--dry-run` a listar **apenas** `20261015000000` e `20261015000001`.

Se o `--dry-run` listar migrations antigas (por exemplo `20261001000000`), o projeto foi montado sem a CLI. Nesse caso, **não executar `db push`**: tentaria recriar o esquema inicial e falharia. Primeiro, registar o que já está aplicado:

```bash
supabase migration repair --linked --status applied 20261001000000 20261001000001 ... 20261014000000
```

### Diferença entre `db push` e SQL manual

| | `supabase db push` | SQL Editor (manual) |
| :--- | :--- | :--- |
| O que aplica | Só as versões em falta no histórico | Exatamente o texto colado |
| Transação | Uma por ficheiro: falha → nada desse ficheiro fica aplicado | Um script sem `BEGIN`/`COMMIT` corre numa transação implícita. Por clareza, envolver em `BEGIN; … COMMIT;` |
| Histórico | Registado automaticamente | **Não é registado.** Executar depois `supabase migration repair --linked --status applied 20261015000000 20261015000001`; caso contrário, o próximo `db push` volta a aplicá-las (sem efeito, por serem repetíveis, mas o histórico fica errado) |
| Avisos (`RAISE WARNING`) | Aparecem na saída da CLI | Aparecem no painel de resultados ou nos logs |

**Recomendação:** usar `db push` se o `--dry-run` listar só as duas versões. Caso contrário, aplicar manualmente com `BEGIN`/`COMMIT` e registar com `migration repair`.

**Depois de aplicar:** `supabase migration list --linked` deve mostrar `20261015000000` e `20261015000001` em `Remote`. A consulta P1 deve devolver as duas versões novas.

## 5. Procedimento passo a passo

1. **Janela.** Escolher um período de pouca utilização. As `ALTER TABLE` bloqueiam `meetings`, `meeting_participants` e `absence_requests` por instantes. O volume aparece em P10.
2. **Cópia de segurança.** Confirmar que existe uma cópia recente ou recuperação para um ponto no tempo (Database › Backups). Não há migration de reversão; a reversão é a reposição da cópia.
3. **Pré-verificação.** Executar `supabase/scripts/20261015_preflight.sql` e guardar os resultados. Só lê; não altera dados. O primeiro bloco (P0) devolve uma linha por verificação com `status` e o **RESULTADO GLOBAL**:
   - **OK:** conforme.
   - **AVISO:** não impede a aplicação, mas tem de ser lido e confirmado (ex.: `DEFAULT` nas colunas do pedido, exposição do esquema não determinável).
   - **BLOQUEIO:** não aplicar. A migration também pararia, mas sem o diagnóstico completo.

   Os blocos P1–P15 dão o detalhe (P11 tipos de evento, P12 ausências incompatíveis por categoria, P13 definição de lembretes, P14 RLS/políticas das tabelas dos relatórios, P15 esquemas expostos). Critérios para avançar:
   - **P1:** histórico até 20261014.
   - **P2:** as colunas do pedido existem; anotar `DEFAULT` e `NOT NULL`.
   - **P3:** nenhuma restrição sobre `request_*` fora da lista do script. Se existir, decidir antes o que fazer com ela.
   - **P4:** de preferência, só linhas com `request_status` a NULL.
   - **P5:** sem triggers desconhecidos nas tabelas.
   - **P7:** `create_meeting` com 10 argumentos e as funções novas ausentes.
   - **P8:** nenhuma linha.
   - **P11–P13:** nenhum registo incompatível e `APPROVAL_REMINDER_DAYS` inexistente ou entre 1 e 30.
4. **Aplicar**, como na secção 4. Guardar a saída completa e verificar se houve avisos `Restrição … por validar`.
5. **Pós-verificação.** Executar `supabase/scripts/20261015_postcheck.sql`. Critério: **nenhuma linha BLOQUEIO**; cada AVISO lido e justificado. O resultado global nunca é OK enquanto houver um ponto por confirmar. Uma restrição de `meetings` "por validar" (`NOT VALID`, AVISO) significa linhas antigas fora da regra:
   - identificar as linhas com a consulta P4;
   - corrigir os dados com quem os conhece;
   - executar `ALTER TABLE public.meetings VALIDATE CONSTRAINT <nome>;`.
6. **Advisors.** No painel: Advisors › Security e Performance. Não devem surgir alertas novos sobre as funções ou tabelas alteradas.
7. **Publicar o frontend** correspondente a estas migrations.
8. **Testes funcionais** (secção 6) com contas de teste.

## 6. Testes funcionais no ambiente real

### Preparação

A preparação exige administração. Usar contas de teste identificadas, por exemplo `teste.*@siholdings-mz.com`, e títulos começados por `[TESTE]`. Nunca usar contas reais.

| Conta | Perfil | Configuração em Utilizadores › Âmbito |
| :--- | :--- | :--- |
| G | GESTOR | âmbito sobre E1 e E2 (individual) |
| M | MANAGER | âmbito sobre G |
| E1, E2 | EMPLOYEE | mesmo departamento |
| X | EMPLOYEE | outro departamento, sem relação com G |

As reuniões e ausências criadas não se apagam pela aplicação (a auditoria é só de acréscimo). No fim, cancelá-las com o motivo "Teste de aplicação".

### Reuniões e convites

| # | Conta | Ação | Resultado esperado |
| :--- | :--- | :--- | :--- |
| R1 | E1 | Agendar reunião com E2 | Criada sem aprovação. E2 recebe "Convite para reunião". Aparece no calendário de E1 e de E2. |
| R2 | E1 | Convidar X | Recusado: "Fora do seu âmbito". |
| R3 | E2 | Aceitar o convite de R1 | E2 fica "Aceite" e E1 recebe "Convite aceite". |
| R4 | E1 | Reagendar R1 | E2 é notificado e volta a "Por responder". |
| R5 | M | Agendar reunião e convidar um departamento + uma pessoa já incluída | Lista final sem duplicados. Criada diretamente, sem pedido. |
| R6 | E1 | Duplo clique em "Agendar reunião" | Uma única reunião criada. |
| R7 | E1 | Agendar duas reuniões diferentes com o mesmo título e horário | Ambas criadas (já não há bloqueio por título e hora). |

### Pedidos de participação

| # | Conta | Ação | Resultado esperado |
| :--- | :--- | :--- | :--- |
| P1 | E1 | Agendar com E2 e ativar "Solicitar participação do gestor" (G) | E2 é convidado. G recebe "Pedido de participação" e **não** é participante. No calendário de E1 aparece "participação pedida, por confirmar". |
| P2 | E1 | Tentar "Confirmar" a reunião de P1 | Recusado. |
| P3 | M, E2 | Abrir o pedido de P1 | Não podem decidir (o pedido não lhes foi dirigido). |
| P4 | G | Aceitar | G passa a participante ("Aceite") e a reunião fica "Confirmada". E1 recebe "Participação aceite". |
| P5 | G | Num novo pedido, recusar sem motivo e depois com motivo | Sem motivo: recusado. Com motivo: a reunião com E2 mantém-se e E1 vê o motivo. |
| P6 | G | Num novo pedido, "Propor outro horário"; E1 aceita | A reunião muda de hora, E2 é notificado e G entra confirmado. |
| P7 | E1 | Cancelar uma reunião com o pedido pendente | G recebe "Pedido de participação retirado"; nada fica pendente em Aprovações › Reuniões. |
| P8 | X | "Solicitar participação do gestor" | "Ainda não tem uma chefia configurada"; o pedido não é enviado. |
| P9 | M | Painel inicial com um pedido pendente para M (criado por G) | Aparece em "Decisões pendentes"; uma reunião normal nunca aparece. |

### Ausências

| # | Conta | Ação | Resultado esperado |
| :--- | :--- | :--- | :--- |
| A1 | G | Comunicar ausência | Estado "Comunicada (sem aprovação)". M, E1 e E2 recebem "Ausência comunicada"; X não. Não aparece para aprovação. |
| A2 | E1 | Procurar "Comunicar ausência" | Não disponível. Pode "Solicitar ausência" (fluxo formal inalterado). |
| A3 | G | Comunicar outra ausência sobreposta | Recusado: "Já existe uma ausência registada…". |

### Relatórios

| # | Conta | Ação | Resultado esperado |
| :--- | :--- | :--- | :--- |
| T1 | M | Relatórios › Horas: Semanal, Mensal, Trimestral, Anual, Personalizado | O intervalo mostrado corresponde ao período e há comparação com o anterior. Sem erros. |
| T2 | M | Filtrar por departamento e por colaborador | Os totais mudam de forma coerente com Timesheet. |
| T3 | X | Abrir Relatórios | Sem acesso ao menu ou à rota (403). |
| T4 | G | Comparar as horas da equipa com a soma manual dos timesheets da equipa | Valores iguais. Só aparecem pessoas do âmbito de G. |
| T5 | M | Aprovações (relatório) | Decisões, taxa de rejeição e pendentes coerentes com o centro de aprovações. |
| T6 | G | Personalizado de 367 dias; e filtro por um departamento sem equipa de G (chamada direta à API) | 367 dias recusado ("366 dias"); departamento fora do âmbito recusado (42501). |

**Consultas de apoio**, a executar no SQL Editor como administrador:

```sql
-- Pedidos de participação dos testes e respetivo estado
SELECT title, status, request_status, requested_with, request_decision_comment
FROM public.meetings WHERE title LIKE '[TESTE]%' ORDER BY created_at DESC;

-- Notificações geradas pelos testes (tipos novos)
SELECT n.type, n.title, p.email, n.created_at
FROM public.notifications n JOIN public.profiles p ON p.id = n.user_id
WHERE n.type IN ('MEETING_REQUEST', 'MEETING_REQUEST_DECIDED', 'MEETING_RESPONSE', 'ABSENCE_COMMUNICATED')
  AND n.created_at > now() - interval '1 day'
ORDER BY n.created_at DESC;

-- Auditoria das decisões
SELECT action, description, created_at FROM public.audit_events
WHERE action LIKE 'meeting.request%' OR action = 'absence.communicated'
ORDER BY created_at DESC LIMIT 50;
```

## 7. Riscos remanescentes

1. **Esquema real não verificado em pormenor.** A definição das colunas acrescentadas à mão, os triggers e as funções eventualmente editadas no painel só se conhecem com a pré-verificação. A migration protege-se dos casos previsíveis (secção 3), mas não de uma função alterada à mão: essa é substituída.
2. **Histórico da CLI desconhecido.** Se `schema_migrations` estiver incompleto, um `db push` direto falha. Ver secção 4.
3. **Regras de negócio novas** (secção 2): EMPLOYEE e IT passam a agendar reuniões, e o convite alarga-se a colegas. Confirmar antes de aplicar.
4. **Visibilidade do motivo de recusa.** `request_decision_comment` é legível por quem vê a reunião, incluindo os outros convidados. Se o motivo puder ser sensível, avisar quem decide ou restringir a coluna numa migration futura.
5. **Desempenho do convite a colegas.** `private.is_colleague` percorre os âmbitos configurados em cada verificação. É adequado à dimensão atual; com centenas de âmbitos, medir o tempo de criação de reuniões grandes.
6. **Lembretes.** São gerados quando a pessoa abre a aplicação (não há `pg_cron`). Quem não abre a aplicação não recebe lembretes. Se `APPROVAL_REMINDER_DAYS` for apagado, os lembretes e o relatório de aprovações dão erro explícito até a definição ser reposta.
7. **Bloqueios breves** durante as `ALTER TABLE`. Daí a janela de pouca utilização.
8. **Sem migration de reversão.** As alterações são aditivas e o frontend anterior continua compatível, por isso não é preciso reverter a base de dados se o frontend novo tiver de ser retirado. Para um problema grave na base de dados: repor a cópia de segurança.
9. **Concorrência real não testada.** A base de testes (PGlite) tem uma única ligação; a idempotência sob pedidos simultâneos assenta no índice único + `ON CONFLICT`, testado só por inserção direta.
10. **Âmbito dos relatórios para MANAGER.** Um departamento é aceite se o Manager chefiar pelo menos uma pessoa desse departamento; os dados continuam limitados pelas políticas RLS às pessoas do seu âmbito.

## 8. O que exige acesso de administração

| Verificação | Porquê |
| :--- | :--- |
| `supabase migration list` / `db push --dry-run` / `migration repair` | A conta usada nesta análise recebe `403` do endpoint de gestão do projeto. |
| Pré-verificação P0–P15 e pós-verificação | Leem `pg_catalog`, `information_schema`, `supabase_migrations` e dados de todas as reuniões, o que exige o papel `postgres` (SQL Editor). |
| Cópia de segurança / recuperação para um ponto no tempo | Definições do projeto. |
| Advisors (Security e Performance) e logs (Postgres, API) | Painel do projeto. |
| Contas de teste, perfis e âmbitos para a secção 6 | `USERS_CREATE`, `USERS_ASSIGN_ROLE` e a gestão de `manager_scopes` são da administração. |
| Confirmação das regras de negócio (secção 2) | Decisão de quem gere a plataforma, não técnica. |
