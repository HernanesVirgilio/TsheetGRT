import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Plus,
  Search,
  Filter,
  Shield,
  UserCheck,
  UserX,
  Edit2,
  AlertCircle,
  Building2,
  Eye,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService } from '../../services/dataService';
import { Profile, Department, Role, RoleCode } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';

export const UsersPage: React.FC = () => {
  const { currentUser, role: userRole } = useAuth();
  const navigate = useNavigate();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRole, setSelectedRole] = useState('ALL');
  const [selectedDept, setSelectedDept] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [roleModalProfile, setRoleModalProfile] = useState<Profile | null>(null);
  const [newSelectedRole, setNewSelectedRole] = useState<RoleCode>('EMPLOYEE');

  // Status toggle confirmation
  const [statusConfirmProfile, setStatusConfirmProfile] = useState<Profile | null>(null);

  // New user form
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [deptId, setDeptId] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [initialRole, setInitialRole] = useState<RoleCode>('EMPLOYEE');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadData = () => {
    const pList = dataService.getProfiles();
    setProfiles(pList);
    const dList = dataService.getDepartments();
    setDepartments(dList);
    if (dList.length > 0 && !deptId) {
      setDeptId(dList[0].id);
    }
    const rList = dataService.getRoles();
    setRoles(rList);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = profiles.filter((p) => {
    const matchesSearch =
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.employee_number && p.employee_number.toLowerCase().includes(searchTerm.toLowerCase()));

    const currentRoleCode = p.roles?.[0]?.code || 'EMPLOYEE';
    const matchesRole = selectedRole === 'ALL' || currentRoleCode === selectedRole;
    const matchesDept = selectedDept === 'ALL' || p.department_id === selectedDept;
    const matchesStatus =
      selectedStatus === 'ALL' ||
      (selectedStatus === 'ACTIVE' && p.is_active) ||
      (selectedStatus === 'INACTIVE' && !p.is_active);

    return matchesSearch && matchesRole && matchesDept && matchesStatus;
  });

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!fullName.trim() || !email.trim() || !deptId) {
      setFormError('Por favor preencha todos os campos obrigatórios.');
      return;
    }

    if (!currentUser) return;

    setIsSubmitting(true);
    try {
      dataService.createProfile(
        {
          full_name: fullName.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          department_id: deptId,
          job_title: jobTitle.trim() || undefined,
          role: initialRole,
        },
        currentUser.id
      );

      setCreateModalOpen(false);
      // Reset form
      setFullName('');
      setEmail('');
      setPhone('');
      setJobTitle('');
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao criar utilizador');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = () => {
    if (!currentUser || !statusConfirmProfile) return;
    try {
      dataService.toggleUserStatus(
        statusConfirmProfile.id,
        !statusConfirmProfile.is_active,
        currentUser.id
      );
      setStatusConfirmProfile(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar estado do utilizador');
    }
  };

  const handleSaveRole = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !roleModalProfile) return;

    try {
      dataService.assignUserRole(roleModalProfile.id, newSelectedRole, currentUser.id);
      setRoleModalProfile(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao alterar role');
    }
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !editProfile) return;

    try {
      dataService.updateProfile(
        editProfile.id,
        {
          full_name: editProfile.full_name,
          phone: editProfile.phone,
          department_id: editProfile.department_id,
          job_title: editProfile.job_title,
        },
        currentUser.id
      );
      setEditProfile(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar dados');
    }
  };

  const canManage = userRole === 'ADMIN';

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Utilizadores"
        subtitle="Administração de contas corporativas, departamentos e perfis de acesso da SI Holdings."
        actions={
          canManage && (
            <button
              onClick={() => setCreateModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-sm font-semibold rounded shadow-xs transition"
            >
              <Plus className="w-4 h-4" />
              Novo Utilizador
            </button>
          )
        }
      />

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-[#D9E0E7] shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Pesquisar por nome, e-mail ou nº..."
              className="w-full px-3 py-2 pl-9 border border-[#D9E0E7] rounded bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1F5FAD]"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          </div>

          {/* Role Filter */}
          <div>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
            >
              <option value="ALL">Todos os Roles</option>
              <option value="ADMIN">ADMIN</option>
              <option value="IT">IT</option>
              <option value="MANAGER">MANAGER</option>
              <option value="EMPLOYEE">COLABORADOR</option>
            </select>
          </div>

          {/* Department Filter */}
          <div>
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
            >
              <option value="ALL">Todos os Departamentos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.code})
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
            >
              <option value="ALL">Todos os Estados</option>
              <option value="ACTIVE">Ativo</option>
              <option value="INACTIVE">Inativo</option>
            </select>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 flex items-center justify-between pt-1">
          <span>A mostrar {filtered.length} de {profiles.length} utilizadores</span>
          {(searchTerm || selectedRole !== 'ALL' || selectedDept !== 'ALL' || selectedStatus !== 'ALL') && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedRole('ALL');
                setSelectedDept('ALL');
                setSelectedStatus('ALL');
              }}
              className="text-[#1F5FAD] hover:underline font-medium"
            >
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Users Table */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Não existem utilizadores que correspondam aos filtros"
          message="Tente ajustar a sua pesquisa ou filtros de departamento e role."
          icon={Users}
        />
      ) : (
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-[#D9E0E7] bg-slate-50 text-slate-600 font-semibold">
                  <th className="py-3 px-4">Nome / Colaborador</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Departamento</th>
                  <th className="py-3 px-4">Cargo</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Último Acesso</th>
                  {canManage && <th className="py-3 px-4 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((user) => {
                  const roleCode = user.roles?.[0]?.code || 'EMPLOYEE';
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar name={user.full_name} size="sm" />
                          <div>
                            <div className="font-semibold text-slate-800">{user.full_name}</div>
                            <div className="text-[11px] text-slate-400">{user.employee_number || 'SIH'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{user.email}</td>
                      <td className="py-3 px-4 text-slate-700 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          {user.department?.name || 'Geral'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                        {user.job_title || '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                          {roleCode}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <StatusBadge status={user.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {user.last_login_at
                          ? new Date(user.last_login_at).toLocaleString('pt-PT')
                          : 'Nunca acedeu'}
                      </td>
                      {canManage && (
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={() => navigate(`/users/${user.id}`)}
                              className="p-1.5 text-slate-400 hover:text-[#1F5FAD] rounded hover:bg-slate-100"
                              title="Ver ficha completa e histórico"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditProfile(user)}
                              className="p-1.5 text-slate-400 hover:text-[#1F5FAD] rounded hover:bg-slate-100"
                              title="Editar dados"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setRoleModalProfile(user);
                                setNewSelectedRole(roleCode as RoleCode);
                              }}
                              className="p-1.5 text-slate-400 hover:text-slate-800 rounded hover:bg-slate-100"
                              title="Alterar Role"
                            >
                              <Shield className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setStatusConfirmProfile(user)}
                              className={`p-1.5 rounded transition ${
                                user.is_active
                                  ? 'text-slate-400 hover:text-[#C0392B] hover:bg-red-50'
                                  : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                              }`}
                              title={user.is_active ? 'Desativar utilizador' : 'Ativar utilizador'}
                            >
                              {user.is_active ? (
                                <UserX className="w-3.5 h-3.5" />
                              ) : (
                                <UserCheck className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create User */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-lg w-full p-6">
            <h3 className="text-base font-bold text-[#1F2937] mb-1">Criar Novo Utilizador</h3>
            <p className="text-xs text-[#64748B] mb-4">
              Registe uma nova conta institucional. O utilizador receberá acesso com a palavra-passe inicial temporária e será forçado a redefini-la no primeiro acesso.
            </p>

            {formError && (
              <div className="mb-4 p-2.5 bg-red-50 border border-red-200 text-xs text-[#C0392B] rounded flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex.: Maria Fernandes"
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">E-mail Institucional</label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nome@siholdings-mz.com"
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-900"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Telefone / Contacto</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+258 84 000 0000"
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Departamento</label>
                  <select
                    value={deptId}
                    onChange={(e) => setDeptId(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cargo / Função</label>
                  <input
                    type="text"
                    value={jobTitle}
                    onChange={(e) => setJobTitle(e.target.value)}
                    placeholder="Ex.: Engenheiro de Operações"
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Perfil de Acesso Inicial (Role)</label>
                <select
                  value={initialRole}
                  onChange={(e) => setInitialRole(e.target.value as RoleCode)}
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-800"
                >
                  <option value="EMPLOYEE">COLABORADOR (Registo e consulta própria)</option>
                  <option value="MANAGER">MANAGER (Gestão e aprovação da equipa)</option>
                  <option value="IT">IT (Monitorização técnica e auditoria)</option>
                  <option value="ADMIN">ADMIN (Superadministrador global)</option>
                </select>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-3 py-2 font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] rounded flex items-center gap-2"
                >
                  {isSubmitting && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Criar Utilizador
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit User */}
      {editProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-lg w-full p-6">
            <h3 className="text-base font-bold text-[#1F2937] mb-1">Editar Dados do Utilizador</h3>
            <p className="text-xs text-[#64748B] mb-4">{editProfile.email}</p>

            <form onSubmit={handleSaveEdit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  value={editProfile.full_name}
                  onChange={(e) => setEditProfile({ ...editProfile, full_name: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Telefone</label>
                  <input
                    type="tel"
                    value={editProfile.phone || ''}
                    onChange={(e) => setEditProfile({ ...editProfile, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Departamento</label>
                  <select
                    value={editProfile.department_id || ''}
                    onChange={(e) => setEditProfile({ ...editProfile, department_id: e.target.value })}
                    className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
                  >
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Cargo / Função</label>
                <input
                  type="text"
                  value={editProfile.job_title || ''}
                  onChange={(e) => setEditProfile({ ...editProfile, job_title: e.target.value })}
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditProfile(null)}
                  className="px-3 py-2 font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] rounded"
                >
                  Guardar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change Role */}
      {roleModalProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-[#1F2937] mb-1">Alterar Perfil de Acesso</h3>
            <p className="text-xs text-[#64748B] mb-4">
              Defina o nível de permissões de <strong>{roleModalProfile.full_name}</strong>.
            </p>

            <form onSubmit={handleSaveRole} className="space-y-4 text-xs">
              <div className="space-y-2">
                {(['EMPLOYEE', 'MANAGER', 'IT', 'ADMIN'] as RoleCode[]).map((rCode) => (
                  <label
                    key={rCode}
                    className={`flex items-center justify-between p-3 rounded border cursor-pointer transition ${
                      newSelectedRole === rCode
                        ? 'border-[#1F5FAD] bg-blue-50/50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div>
                      <div className="font-bold text-slate-800">{rCode}</div>
                      <div className="text-[11px] text-slate-500">
                        {rCode === 'ADMIN' && 'Acesso global irrestrito à administração'}
                        {rCode === 'IT' && 'Supervisão técnica, integridade e auditoria'}
                        {rCode === 'MANAGER' && 'Supervisão da equipa e aprovações de ponto'}
                        {rCode === 'EMPLOYEE' && 'Registo e submissão individual de horas'}
                      </div>
                    </div>
                    <input
                      type="radio"
                      name="roleOption"
                      checked={newSelectedRole === rCode}
                      onChange={() => setNewSelectedRole(rCode)}
                      className="text-[#1F5FAD] focus:ring-[#1F5FAD]"
                    />
                  </label>
                ))}
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setRoleModalProfile(null)}
                  className="px-3 py-2 font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] rounded"
                >
                  Confirmar Alteração
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for Toggle Status */}
      <ConfirmDialog
        isOpen={Boolean(statusConfirmProfile)}
        title={statusConfirmProfile?.is_active ? 'Desativar este utilizador?' : 'Ativar este utilizador?'}
        message={
          statusConfirmProfile?.is_active
            ? `O utilizador ${statusConfirmProfile?.full_name} deixará de conseguir iniciar sessão no sistema corporativo da SI Holdings.`
            : `O utilizador ${statusConfirmProfile?.full_name} recuperará o acesso à plataforma com o seu perfil previamente atribuído.`
        }
        confirmLabel={statusConfirmProfile?.is_active ? 'Desativar utilizador' : 'Ativar utilizador'}
        variant={statusConfirmProfile?.is_active ? 'danger' : 'primary'}
        onConfirm={handleToggleStatus}
        onCancel={() => setStatusConfirmProfile(null)}
      />
    </div>
  );
};
