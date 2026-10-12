import React from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getApprovalCounts, totalPending } from '../../services/approvalCenterService';
import { t } from '../../lib/i18n';

/** Ação principal de quem decide: abre o centro de aprovações com o número de pedidos à espera. */
export const ReviewApprovalsLink: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const counts = useAsyncData(() => getApprovalCounts(viewerId, hasPermission), [viewerId]);
  const pending = totalPending(counts.data);
  return (
    <Link
      to="/approvals"
      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover hover:text-on-primary-hover"
    >
      <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
      {t('Rever aprovações')}
      {pending > 0 && (
        <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface px-1.5 text-[11px] font-bold text-text">
          {pending > 99 ? '99+' : pending}
          <span className="sr-only"> {t('pendentes')}</span>
        </span>
      )}
    </Link>
  );
};

/** Ligação secundária no cabeçalho dos painéis (mesma altura dos botões). */
export const HeaderLink: React.FC<{ to: string; icon: LucideIcon; children: React.ReactNode }> = ({ to, icon: Icon, children }) => (
  <Link
    to={to}
    className="inline-flex h-10 items-center gap-2 rounded-md border border-border-input bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-muted"
  >
    <Icon className="h-4 w-4" aria-hidden="true" />
    {children}
  </Link>
);
