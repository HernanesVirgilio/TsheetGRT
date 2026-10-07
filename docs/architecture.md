# Arquitetura do Sistema · SI Holdings Timesheet

## 1. Visão Arquitetural

A arquitetura do **SI Holdings Timesheet** assenta numa abordagem moderna e desacoplada, eliminando dependências legadas (como Grails, Java, Spring ou Hibernate) e privilegiando a segurança orientada a dados no motor PostgreSQL via Supabase:

```
┌─────────────────────────────────────────────────────────┐
│                    Navegador Web                        │
│   React 19 + TypeScript + Vite + Tailwind CSS           │
│   (Contexto Auth, Router v7, Componentes Corporativos)   │
└───────────────────────────┬─────────────────────────────┘
                            │
                    HTTPS / REST / WS
                            │
┌───────────────────────────▼─────────────────────────────┐
│                    Supabase Platform                    │
│   ┌─────────────────────┐    ┌──────────────────────┐   │
│   │    Supabase Auth    │    │   PostgreSQL Engine  │   │
│   │  (Tokens JWT/Sessão)│    │ (Tabelas, FKs, RLS)  │   │
│   └─────────────────────┘    └──────────────────────┘   │
│   ┌─────────────────────┐    ┌──────────────────────┐   │
│   │  Edge Functions     │    │  Triggers & Funções  │   │
│   │  (Operações críti.) │    │  (Cálculo de Horas)  │   │
│   └─────────────────────┘    └──────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Princípio da Fronteira de Segurança (Security Boundary)

1. **Apresentação (React):** O controlo de rotas no frontend (`ProtectedRoute`) e a ocultação de botões é estritamente uma camada de experiência de utilizador (UX protection) e **não** constitui o perímetro de segurança.
2. **Autorização Central (RLS):** Toda e qualquer leitura, inserção, atualização ou desativação passa obrigatoriamente pelas políticas de Row Level Security (RLS) no PostgreSQL.
3. **Cálculo de Tempos:** O tempo total trabalhado (`total_minutes`) não depende do valor enviado pelo cliente; é calculado e validado através da fórmula:
   $$\text{total\_minutes} = (\text{end\_time} - \text{start\_time}) - \text{break\_minutes}$$
   com validações estritas ($end\_time > start\_time$, $break\_minutes \ge 0$, $total\_minutes > 0$).

---

## 3. Módulos Funcionais

- **Módulo de Autenticação (`/login`, `/forgot-password`, `/reset-password`, `/alterar-palavra-passe`):**
  - Supabase Auth com e-mail institucional e palavra-passe (mínimo 12 carateres).
  - Contas criadas apenas por convite (Edge Function `admin-create-user`); o utilizador define a própria palavra-passe.
  - Após o login, o perfil, o perfil de acesso e as permissões são lidos da base de dados; contas desativadas ficam bloqueadas.
- **Módulo de Timesheet (`/timesheets`):**
  - Gestão de ciclos de apuração periódicos (normalmente mensais).
  - Lançamento diário de apontamentos de ponto associados a atividades autorizadas.
  - Estados: `DRAFT` $\to$ `SUBMITTED` $\to$ `APPROVED` ou `REJECTED`.
- **Módulo de Aprovações (`/approvals`):**
  - Acesso restrito a gestores e administradores.
  - Revisão analítica dos lançamentos dos colaboradores do departamento.
  - Rejeição obriga a fundamentação textual auditada.
  - Regra de ouro: Um gestor não pode aprovar a sua própria folha de horas.
- **Módulo de Administração (`/users`, `/departments`, `/roles`, `/settings`, `/reports`):**
  - Criação (por convite) e manutenção de contas, atribuição de perfis de acesso e departamentos.
  - Desativação suave (*soft-disable*) via `is_active: false`, com proteção do último administrador.
  - Gestão de departamentos, matriz de permissões, configurações institucionais e relatórios consolidados.
- **Módulo de Auditoria & Saúde (`/audit`, `/system-health`):**
  - Histórico imutável de eventos operacionais.
  - Diagnóstico em tempo real da plataforma.
