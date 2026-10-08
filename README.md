# TsheetGRT · SI Holdings

Plataforma corporativa interna para gestão de operações, folhas de horas (*timesheets*), aprovações e auditoria da **SI Holdings**.

---

## 1. Visão Geral

O **SI Holdings Timesheet** é um sistema corporativo de uso diário concebido especificamente para colaboradores, gestores, equipas de IT, Recursos Humanos, Finanças, Operações, ESG, Marketing & Vendas e Comercial.

O produto foi desenhado segundo os seguintes princípios:
- Prático, direto e institucional.
- Focado na alta usabilidade de tabelas e formulários de ponto.
- Conformidade estrita com segurança: Row Level Security (RLS), isolamento por departamentos e trilho de auditoria imutável.
- Fuso horário padrão: `Africa/Maputo` (CAT).
- Localização primária: Português europeu (`pt-PT`).

---

## 2. Tecnologias Utilizadas

- **Frontend:** React 19, TypeScript (modo `strict`), Vite, React Router v7.
- **Estilos:** Tailwind CSS v4 com o Design System global definido em `src/index.css` (`@theme`).
- **Ícones:** Lucide React.
- **Backend:** Supabase (PostgreSQL, Supabase Auth, Row Level Security, Edge Functions).

### Design System

Tokens semânticos partilhados por todas as dashboards (nunca usar cores hexadecimais diretamente nos componentes):

| Token | Valor | Uso |
| :--- | :--- | :--- |
| `primary` | `#47B255` | Botões primários (texto `on-primary`), estados ativos, destaques |
| `primary-hover` | `#0B8043` | Hover, links e foco (contraste AA sobre branco) |
| `sidebar` | `#0F7A6B` | Sidebar, cabeçalhos de tabela, ícones institucionais |
| `background` / `surface` | `#F8F9FA` / `#FFFFFF` | Fundo da aplicação / cartões, modais, tabelas |
| `text` / `text-secondary` | `#1A1A1A` / `#333333` | Texto principal / secundário |
| `border` / `border-input` | `#D9E0E7` / `#7D8A96` | Divisórias / contorno de campos (≥ 3:1) |

Componentes base em `src/components/ui`: `Button`, `IconButton`, `TextField`, `SelectField`, `TextAreaField`, `Modal`, `ConfirmDialog`, `Alert`, `LoadingState`, `ErrorState`, `EmptyState`, `Panel`, `DataTable` (tabela no desktop, cartões no mobile), `Pagination`, `StatusBadge` (tons partilhados em `badgeTones.ts`).

---

## 3. Configuração

Siga [docs/supabase-setup.md](docs/supabase-setup.md) para preparar o projeto Supabase (migrations, autenticação, Edge Function e primeiro administrador).

Variáveis do frontend (`.env`, a partir de `.env.example`):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable-key>
```

Apenas a chave pública (publishable) é usada no frontend. A `service_role` existe exclusivamente no ambiente da Edge Function.

---

## 4. Como Executar Localmente

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # TypeScript strict
npm test           # testes de regras, utilitários e segurança da base de dados
npm run test:db    # apenas segurança da base de dados (RLS, âmbitos, aprovações, módulo IT)
npm run build      # build de produção
```

---

## 5. Estrutura do Projeto

```
src/
├── components/
│   ├── admin/        # Formulário de utilizador, atribuição de perfil, ativação/desativação
│   ├── it/           # Pedidos de suporte, histórico, equipamentos e intervenções
│   ├── layout/       # AppShell, Header, Sidebar, ProtectedRoute, AuthLayout
│   └── ui/           # Design System (componentes base)
├── hooks/            # useAsyncData, useDebouncedValue
├── lib/
│   ├── auth/         # AuthContext (Supabase Auth → perfil → permissões)
│   ├── supabase/     # Cliente Supabase tipado
│   └── errors.ts     # Tradução de erros do Supabase para mensagens claras
├── pages/            # Páginas por área (admin, auth, dashboard, reports, ...)
├── services/         # Acesso a dados (um serviço por domínio)
├── types/            # Tipos de domínio e da base de dados
└── utils/            # Validação, formatação, CSV, agregações de relatórios
supabase/
├── migrations/       # Schema, segurança e dados de referência (fonte única de verdade)
├── functions/        # Edge Function admin-create-user
└── scripts/          # Configuração do primeiro administrador
```

> **Estado dos módulos:** integrados com o Supabase: área Admin; módulo Manager (equipa por âmbito, aprovações e rejeições, aprovação em massa, atividade, relatórios por âmbito); "Meu Timesheet" (períodos, registos de horas e submissão); módulo **Suporte IT** (pedidos de suporte, fila do IT, histórico, equipamentos, intervenções e painel operacional). Ainda usa a camada temporária `src/services/dataService.ts`: a dashboard do Colaborador, que será migrada numa próxima fase.

### Módulo Suporte IT

- **Colaboradores** (`IT_TICKET_CREATE`): abrem pedidos em **Pedidos de suporte** (`/support`), acompanham o estado, respondem quando o IT pede informação, confirmam a resolução ou reabrem um pedido resolvido.
- **Equipa de IT** (`IT_TICKETS_*`, `IT_ASSETS_*`): painel operacional (`/it`), fila de solicitações com filtros e paginação no servidor (`/it/tickets`), tratamento do pedido (assumir, atribuir, prioridade, categoria, equipamento, pedir informação, resolver, fechar, reabrir, notas internas), inventário de equipamentos (`/it/assets`) e intervenções técnicas (`/it/interventions`).
- Todas as transições são feitas por funções do servidor; o histórico, a auditoria e as notificações são gerados no servidor. Ver [docs/security.md](docs/security.md#8-módulo-suporte-it).

---

## 6. Documentação Detalhada

- [Configuração do Supabase](docs/supabase-setup.md)
- [Arquitetura do Sistema](docs/architecture.md)
- [Esquema da Base de Dados & Migrações](docs/database.md)
- [Políticas de Segurança & RLS](docs/security.md)
- [Matriz de Roles e Permissões](docs/roles-and-permissions.md)
