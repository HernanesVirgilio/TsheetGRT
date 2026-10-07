import React from 'react';
import { LucideIcon, Inbox } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  message,
  icon: Icon = Inbox,
  action,
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-10 text-center bg-white rounded-lg border border-dashed border-[#D9E0E7] my-4">
      <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 mb-3 border border-slate-200">
        <Icon className="w-6 h-6" />
      </div>
      <h3 className="text-sm font-semibold text-[#1F2937] mb-1">{title}</h3>
      {message && <p className="text-xs text-[#64748B] max-w-sm mb-4">{message}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
};
