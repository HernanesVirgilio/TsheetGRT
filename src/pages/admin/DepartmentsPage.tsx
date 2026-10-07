import React, { useState, useEffect } from 'react';
import { Building2, Plus, Edit2, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService } from '../../services/dataService';
import { Department } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatusBadge } from '../../components/ui/StatusBadge';

export const DepartmentsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [departments, setDepartments] = useState<Department[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDept, setEditingDept] = useState<Department | null>(null);

  // Form
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const loadData = () => {
    setDepartments(dataService.getDepartments());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleOpenCreate = () => {
    setEditingDept(null);
    setCode('');
    setName('');
    setDescription('');
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (dept: Department) => {
    setEditingDept(dept);
    setCode(dept.code);
    setName(dept.name);
    setDescription(dept.description);
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!code.trim() || !name.trim()) {
      setFormError('Código e Nome do departamento são obrigatórios.');
      return;
    }

    if (!currentUser) return;

    try {
      if (editingDept) {
        dataService.updateDepartment(
          editingDept.id,
          {
            name: name.trim(),
            description: description.trim(),
          },
          currentUser.id
        );
      } else {
        dataService.createDepartment(
          {
            code: code.trim().toUpperCase(),
            name: name.trim(),
            description: description.trim(),
          },
          currentUser.id
        );
      }

      setModalOpen(false);
      loadData();
    } catch (err: any) {
      setFormError(err.message || 'Erro ao guardar departamento.');
    }
  };

  const handleToggleActive = (dept: Department) => {
    if (!currentUser) return;
    try {
      dataService.updateDepartment(dept.id, { active: !dept.active }, currentUser.id);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar estado.');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gestão de Departamentos"
        subtitle="Unidades orgânicas e estrutura departamental da SI Holdings."
        actions={
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#1F5FAD] hover:bg-[#184d8f] text-white text-sm font-semibold rounded shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            Novo Departamento
          </button>
        }
      />

      <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#D9E0E7] bg-slate-50 text-slate-600 font-semibold">
                <th className="py-3 px-4">Código</th>
                <th className="py-3 px-4">Nome do Departamento</th>
                <th className="py-3 px-4">Descrição Operacional</th>
                <th className="py-3 px-4">Estado</th>
                <th className="py-3 px-4">Criado em</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {departments.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50">
                  <td className="py-3 px-4 font-mono font-bold text-slate-800 whitespace-nowrap">
                    {d.code}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap">
                    {d.name}
                  </td>
                  <td className="py-3 px-4 text-slate-600 max-w-sm">
                    {d.description || '—'}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <StatusBadge status={d.active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                  </td>
                  <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                    {new Date(d.created_at).toLocaleDateString('pt-PT')}
                  </td>
                  <td className="py-3 px-4 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleOpenEdit(d)}
                        className="p-1.5 text-slate-400 hover:text-[#1F5FAD] rounded hover:bg-slate-100"
                        title="Editar"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(d)}
                        className={`p-1.5 rounded transition ${
                          d.active
                            ? 'text-slate-400 hover:text-[#C0392B] hover:bg-red-50'
                            : 'text-slate-400 hover:text-emerald-700 hover:bg-emerald-50'
                        }`}
                        title={d.active ? 'Desativar departamento' : 'Ativar departamento'}
                      >
                        {d.active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Add / Edit Department */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xl max-w-md w-full p-6">
            <h3 className="text-base font-bold text-[#1F2937] mb-1">
              {editingDept ? 'Editar Departamento' : 'Novo Departamento'}
            </h3>
            <p className="text-xs text-[#64748B] mb-4">
              Indique os parâmetros da unidade departamental.
            </p>

            {formError && (
              <div className="mb-4 p-2 bg-red-50 border border-red-200 text-xs text-[#C0392B] rounded">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Código (Sigla)</label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingDept)}
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  placeholder="Ex.: FIN, RH, ESG"
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white uppercase font-mono disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nome do Departamento</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Finanças e Contabilidade"
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descrição</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Âmbito operacional do departamento..."
                  className="w-full px-3 py-2 border border-[#D9E0E7] rounded bg-white text-slate-900"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-3 py-2 font-medium text-slate-700 bg-white border border-[#D9E0E7] rounded hover:bg-slate-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] rounded"
                >
                  Guardar Departamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
