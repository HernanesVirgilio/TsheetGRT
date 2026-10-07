import React from 'react';
import { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  supporting?: string;
  icon?: LucideIcon;
  badge?: React.ReactNode;
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  supporting,
  icon: Icon,
  badge,
}) => {
  return (
    <div className="bg-white rounded-lg p-5 border border-[#D9E0E7] shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between text-[#64748B] mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
        {Icon && <Icon className="w-4 h-4 text-slate-400" />}
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight text-[#1F2937]">{value}</div>
        {badge}
      </div>
      {supporting && (
        <div className="mt-2 text-xs text-[#64748B] border-t border-slate-100 pt-2">
          {supporting}
        </div>
      )}
    </div>
  );
};
