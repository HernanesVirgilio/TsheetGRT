import React, { useState, useEffect } from 'react';
import { Shield, ShieldCheck, Users, Lock, ChevronDown, ChevronUp, Edit3, Check, X, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService } from '../../services/dataService';
import { Role, Permission, RoleCode } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';

export const RolesPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [roles, setRoles] = useState<(Role & { user_count: number })[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [expandedRoleCode, setExpandedRoleCode] = useState<string | null>('EMPLOYEE');

  // Manage permissions modal
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [selectedPermCodes, setSelectedPermCodes] = useState<string[]>([]);
  const [successMessage, setSuccessMessage] = useState('');

  const loadData = () => {
    setRoles(dataService.getRoles());
    setPermissions(dataService.getPermissions());
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleExpand = (code: string) => {
    setExpandedRoleCode(expandedRoleCode === code ? null : code);
  };

  const handleOpenEditPermissions = (roleItem: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(roleItem);
    const existing = (roleItem.permissions || []).map((p) => p.code);
    setSelectedPermCodes(existing);
  };

  const handleTogglePermCode = (code: string) => {
    if (selectedPermCodes.includes(code)) {
      setSelectedPermCodes(selectedPermCodes.filter((c) => c !== code));
    } else {
      setSelectedPermCodes([...selectedPermCodes, code]);
    }
  };

  const handleSaveRolePermissions = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRole || !currentUser) return;

    dataService.updateRolePermissions(
      editingRole.code as RoleCode,
      selectedPermCodes,
      currentUser.id
    );

    setEditingRole(null);
    loadData();
    setSuccessMessage(`Permissões do perfil ${editingRole.code} atualizadas com sucesso.`);
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  // Group permissions by module
  const groupedPermissions: Record<string, Permission[]> = permissions.reduce((acc, p) => {
    acc[p.module] = acc[p.module] || [];
    acc[p.module].push(p);
    return acc;
  }, {} as Record<string, Permission[]>);

  const moduleLabels: Record<string, string> = {
    core: 'Geral / Core',
    profile: 'Perfil do Utilizador',
    timesheet: 'Registo de Horas (Timesheet)',
    team: 'Gestão de Equipa',
    approvals: 'Aprovações e Validação',
    users: 'Utilizadores',
    roles: 'Perfis e Acessos',
    permissions: 'Permissões do Sistema',
    departments: 'Departamentos',
    audit: 'Auditoria e Segurança',
    health: 'Saúde e Monitorização',
    settings: 'Configurações Institucionais',
    reports: 'Relatórios Operacionais',
    admin: 'Acesso Superadministrador',
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Roles e Permissões"
        subtitle="Matriz de autorização baseada em funções (RBAC) e políticas de acesso corporativas."
      />

      {successMessage && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 rounded flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4">
        {roles.map((r) => {
          const isExpanded = expandedRoleCode === r.code;
          return (
            <div
              key={r.id}
              className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden"
            >
              <div
                onClick={() => toggleExpand(r.code)}
                className="p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-slate-50/70 transition"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded bg-blue-50 text-[#1F5FAD] border border-blue-100 flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-800">{r.name}</h3>
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                        {r.code}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{r.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span><strong>{r.user_count}</strong> utilizador{r.user_count !== 1 ? 'es' : ''}</span>
                  </div>

                  <button
                    onClick={(e) => handleOpenEditPermissions(r, e)}
                    className="px-2.5 py-1 text-xs font-semibold text-[#1F5FAD] bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 flex items-center gap-1"
                    title="Editar permissões deste perfil"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span className="hidden sm:inline">Gerir Permissões</span>
                  </button>

                  <div className="text-xs text-[#1F5FAD] font-semibold flex items-center gap-1">
                    <span>{r.permissions?.length || 0} permissões</span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </div>
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-[#D9E0E7] bg-slate-50/50 p-5">
                  <div className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-3">
                    Permissões Atribuídas ao Perfil
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {r.permissions?.map((perm) => (
                      <div
                        key={perm.id}
                        className="p-2.5 bg-white rounded border border-slate-200 text-xs flex items-start gap-2 shadow-2xs"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-mono text-[11px] font-bold text-slate-800">
                            {perm.code}
                          </div>
                          <div className="text-slate-600 text-[11px] mt-0.5">
                            {perm.name}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal to configure role permissions */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-2xl w-full p-6 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-base font-bold text-slate-800">
                  Gerir Permissões do Perfil: {editingRole.name} ({editingRole.code})
                </h3>
                <p className="text-xs text-slate-500">
                  Selecione os módulos e privilégios autorizados para este role.
                </p>
              </div>
              <button
                onClick={() => setEditingRole(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveRolePermissions} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto py-4 space-y-4 custom-scrollbar text-xs">
                {Object.entries(groupedPermissions).map(([moduleKey, permList]) => (
                  <div key={moduleKey} className="p-3 bg-slate-50 rounded border border-slate-200">
                    <span className="font-semibold text-slate-800 uppercase tracking-wider text-[11px] block mb-2">
                      {moduleLabels[moduleKey] || moduleKey}
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {permList.map((perm) => {
                        const isChecked = selectedPermCodes.includes(perm.code);
                        return (
                          <label
                            key={perm.id}
                            className={`p-2 rounded border cursor-pointer flex items-center justify-between transition ${
                              isChecked
                                ? 'bg-white border-[#1F5FAD] shadow-2xs'
                                : 'bg-white/60 border-slate-200 hover:bg-white'
                            }`}
                          >
                            <div className="pr-2">
                              <span className="font-mono text-[11px] font-bold text-slate-800 block">
                                {perm.code}
                              </span>
                              <span className="text-[11px] text-slate-500 leading-tight block">
                                {perm.name}
                              </span>
                            </div>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleTogglePermCode(perm.code)}
                              className="h-4 w-4 rounded border-slate-300 text-[#1F5FAD] focus:ring-[#1F5FAD]"
                            />
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs text-slate-500">
                  {selectedPermCodes.length} permissões selecionadas
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingRole(null)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded hover:bg-slate-50"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] rounded shadow-xs"
                  >
                    Guardar Permissões
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
