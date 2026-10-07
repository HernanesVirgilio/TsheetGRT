# Arquitetura de Segurança · SI Holdings Timesheet

## 1. Princípios de Segurança Implementados

1. **Princípio do Menor Privilégio (Least Privilege):** Cada utilizador e perfil tem acesso estritamente aos recursos necessários para a sua atividade diária.
2. **Defesa em Profundidade:**
   - **Frontend:** Proteção de rotas em React para guiar a navegação.
   - **Database RLS:** Políticas PostgreSQL que rejeitam transações não autorizadas.
   - **Trilho de Auditoria:** Eventos de segurança gerados e gravados de forma indelével.
3. **Ausência de Segredos no Cliente:**
   - As chaves de serviço com privilégios de superadministrador (`SUPABASE_SERVICE_ROLE_KEY`) nunca são expostas ao browser.
   - As palavras-passe nunca são retornadas em endpoints de leitura.
   - Não são armazenados tokens em registos de auditoria ou em mensagens de erro.

---

## 2. Row Level Security (RLS)

O acesso às tabelas é condicionado pela função de contexto:
- `public.get_current_profile_id()`
- `public.has_permission(permission_code)`
- `public.is_manager_of_employee(employee_id)`

### Matriz de Acesso RLS por Tabela:
- **`profiles`:** O colaborador apenas pode ler o seu perfil e atualizar dados de contacto próprios. Gestores podem consultar perfis de colaboradores sob a sua supervisão. Administradores podem consultar e gerir todos.
- **`timesheets`:**
  - `SELECT`: Apenas o próprio colaborador, gestores do mesmo departamento ou perfis com permissão `REPORTS_READ`.
  - `INSERT`: Apenas o próprio colaborador para o seu ID.
  - `UPDATE`: O colaborador apenas em estado `DRAFT` ou `REJECTED`; o gestor apenas para alterar o estado em processo de aprovação.
- **`audit_events`:** Apenas perfis com `AUDIT_READ` (IT e ADMIN) podem consultar.

---

## 3. Gestão de Palavras-passe & Primeiro Acesso

- As contas de desenvolvimento utilizam a palavra-passe temporária `123456`, associada à flag `must_change_password: true`.
- O utilizador é impedido de aceder aos módulos operacionais até definir uma palavra-passe pessoal com um mínimo de 12 carateres.
- Em produção, o provisionamento de novas contas envia links mágicos ou tokens de redefinição por e-mail com validade temporal restrita.
