import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  supporting?: string;
  icon?: LucideIcon;
  badge?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, supporting, icon: Icon, badge }) => (
  <div className="flex flex-col justify-between rounded-lg border border-border bg-surface p-5">
    <div className="mb-2 flex items-center justify-between text-text-secondary">
      <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      {Icon && <Icon className="h-4 w-4 text-sidebar" aria-hidden="true" />}
    </div>
    <div className="flex items-baseline justify-between gap-2">
      <div className="text-2xl font-semibold tracking-tight text-text">{value}</div>
      {badge}
    </div>
    {supporting && <div className="mt-2 text-xs text-text-secondary">{supporting}</div>}
  </div>
);
