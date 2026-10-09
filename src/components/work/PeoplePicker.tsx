import React, { useId, useState } from 'react';
import type { WorkPerson } from '../../types/work';

interface PeoplePickerProps {
  label: string;
  people: WorkPerson[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  hint?: string;
}

/** Seleção múltipla com pesquisa (participantes de reuniões). Lista acessível de caixas de seleção. */
export const PeoplePicker: React.FC<PeoplePickerProps> = ({ label, people, selectedIds, onChange, hint }) => {
  const [search, setSearch] = useState('');
  const groupId = useId();
  const term = search.trim().toLowerCase();
  const visible = term
    ? people.filter((person) => `${person.fullName} ${person.departmentName ?? ''} ${person.jobTitle ?? ''}`.toLowerCase().includes(term))
    : people;

  const toggle = (profileId: string) =>
    onChange(selectedIds.includes(profileId) ? selectedIds.filter((id) => id !== profileId) : [...selectedIds, profileId]);

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-text">
        {label} <span className="font-normal text-text-muted">({selectedIds.length} selecionado{selectedIds.length === 1 ? '' : 's'})</span>
      </legend>
      {hint && <p className="text-xs text-text-muted">{hint}</p>}
      <input
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Pesquisar por nome ou departamento"
        aria-label={`Pesquisar ${label.toLowerCase()}`}
        aria-controls={groupId}
        className="h-9 w-full rounded-md border border-border-input bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-hover"
      />
      <ul id={groupId} className="max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border custom-scrollbar">
        {visible.length === 0 && <li className="px-3 py-2 text-sm text-text-muted">Nenhum colaborador encontrado.</li>}
        {visible.map((person) => (
          <li key={person.profileId}>
            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-background">
              <input
                type="checkbox"
                className="h-4 w-4 accent-primary-hover"
                checked={selectedIds.includes(person.profileId)}
                onChange={() => toggle(person.profileId)}
              />
              <span className="min-w-0">
                <span className="block truncate text-text">{person.fullName}</span>
                <span className="block truncate text-xs text-text-muted">
                  {[person.jobTitle, person.departmentName].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
};
