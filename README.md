# SI HOLDINGS TIMESHEET

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

- **Frontend:** React 19, TypeScript, Vite, React Router v7.
- **Estilos:** Tailwind CSS v4 com identidade institucional SI Holdings (`#1F5FAD` azul institucional, `#12304A` azul-marinho, `#F5F7FA` fundo claro).
- **Ícones:** Lucide React.
- **Base de Dados & Auth:** Supabase (PostgreSQL, Supabase Auth, Row Level Security, Edge Functions).

---

## 3. Contas de Desenvolvimento & Testes

Para efeitos de validação de funcionalidades em ambiente de desenvolvimento, estão pré-configuradas 4 contas correspondentes aos diferentes perfis operacionais:

| Perfil | E-mail de Desenvolvimento | Nome de Exibição | Palavra-passe Inicial |
| :--- | :--- | :--- | :--- |
| **ADMIN** | `admin@siholdings-mz.com` | Administrador SI Holdings | `123456` |
| **IT** | `it@siholdings-mz.com` | Hernanes Virgilio | `123456` |
| **MANAGER** | `manager@siholdings-mz.com` | Manager de Teste | `123456` |
| **COLABORADOR** | `colaborador@siholdings-mz.com` | Colaborador de Teste | `123456` |

> **Nota de Segurança:** As contas com palavra-passe inicial `123456` têm o sinalizador `must_change_password` ativo. O sistema redireciona automaticamente para `/alterar-palavra-passe` no primeiro acesso. O seletor de perfil na barra lateral permite alternar instantaneamente entre perfis durante a validação.

---

## 4. Variáveis de Ambiente & Supabase

Consulte o ficheiro `.env` e `.env.example`:

```bash
# Supabase Configuration
VITE_SUPABASE_URL=https://iahgopefwixbprfzcwbd.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_6cX3j02MOIURRS4xEVf3ww_74CjQUCs
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_6cX3j02MOIURRS4xEVf3ww_74CjQUCs

# Informação de infraestrutura
SUPABASE_URL=https://iahgopefwixbprfzcwbd.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_6cX3j02MOIURRS4xEVf3ww_74CjQUCs
SUPABASE_JWKS_URL=https://iahgopefwixbprfzcwbd.supabase.co/auth/v1/.well-known/jwks.json
```

### Inicialização do Esquema no Supabase
1. Abra o [SQL Editor no Supabase Dashboard](https://supabase.com/dashboard/project/iahgopefwixbprfzcwbd/sql/new).
2. Cole e execute o script consolidado em `supabase/schema_full.sql` (ou clique no botão **"Copiar SQL Completo"** disponível diretamente em `/system-health`).
3. O script cria automaticamente todas as 12 tabelas, extensões UUID, triggers de cálculo de horas e as políticas Row Level Security (RLS).

**Regras de Segurança:**
- Nunca exponha a `SUPABASE_SECRET_KEY` no pacote da aplicação web cliente.
- A anon key / publishable key pública comunica de forma segura com o Supabase com suporte a RLS.

---

## 5. Como Executar Localmente

### Pré-requisitos
- Node.js 18+ ou 20+
- npm 9+

### Instalação e Execução
```bash
# 1. Instalar dependências
npm install

# 2. Iniciar servidor de desenvolvimento (porta 3000)
npm run dev

# 3. Compilação e verificação de tipagem TypeScript
npm run build
npm run lint
```

---

## 6. Estrutura do Projeto

```
src/
├── components/
│   ├── layout/       # AppShell, Header, Sidebar, ProtectedRoute, NotificationDropdown
│   └── ui/           # PageHeader, StatCard, StatusBadge, ConfirmDialog, UserAvatar, EmptyState
├── lib/
│   ├── auth/         # AuthContext, hooks de permissão e sessão
│   └── supabase/     # Cliente centralizado Supabase, dados de semente e mockDb
├── pages/
│   ├── auth/         # Login, Alteração de palavra-passe, Recuperação de credenciais
│   ├── dashboard/    # Dashboards especializados para Colaborador, Gestor, IT e Admin
│   ├── timesheets/   # Listagem de períodos e editor diário de ponto
│   ├── manager/      # Validação de aprovações e visualização de equipa
│   ├── admin/        # Gestão de utilizadores, departamentos, roles, saúde e definições
│   ├── reports/      # Relatórios analíticos e exportação para CSV
│   └── profile/      # Perfil do colaborador e atualização de contactos
├── services/         # dataService com validações de negócio, cálculo de horas e auditoria
└── types/            # Definições estritas de TypeScript
```

---

## 7. Documentação Detalhada

- [Arquitetura do Sistema](docs/architecture.md)
- [Esquema da Base de Dados & Migrações](docs/database.md)
- [Políticas de Segurança & RLS](docs/security.md)
- [Matriz de Roles e Permissões](docs/roles-and-permissions.md)
