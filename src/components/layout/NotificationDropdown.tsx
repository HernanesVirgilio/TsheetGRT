import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ChevronRight } from 'lucide-react';
import { getErrorMessage } from '../../lib/errors';
import { useNotifications } from '../../lib/notifications/NotificationsContext';
import type { NotificationItem } from '../../types';
import { formatDateTime } from '../../utils/format';
import { NotificationCategoryBadge } from './NotificationCategoryBadge';
import { t } from '../../lib/i18n';

export const NotificationDropdown: React.FC = () => {
  const { recent, unreadCount, isLoading, error, refresh, markAsRead, markAllAsRead, targetOf } = useNotifications();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const runAction = (action: () => Promise<void>) => {
    setActionError(null);
    action().catch((actionFailure: unknown) =>
      setActionError(getErrorMessage(actionFailure, t('Não foi possível atualizar as notificações.')))
    );
  };

  // Abrir o menu não marca nada como lido: só abrir uma notificação (ou "marcar todas") o faz.
  const toggle = () => {
    if (!isOpen) {
      setActionError(null);
      refresh({ withDeadlineAlerts: true });
    }
    setIsOpen((open) => !open);
  };

  const openNotification = (notification: NotificationItem) => {
    const target = targetOf(notification);
    if (!notification.read_at) runAction(() => markAsRead(notification.id));
    if (target) {
      setIsOpen(false);
      navigate(target);
    }
  };

  const errorMessage = actionError ?? error;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={unreadCount > 0 ? t('Notificações: {unreadCount} por ler', { unreadCount }) : t('Notificações')}
        className="relative rounded-md p-2 text-text-secondary hover:bg-surface-muted hover:text-text"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-on-danger">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text">
              {t('Notificações')}
              {unreadCount > 0 && <span className="ml-1 font-normal text-text-secondary">· {unreadCount} por ler</span>}
            </p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => runAction(markAllAsRead)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-hover hover:underline"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                {t('Marcar todas como lidas')}
              </button>
            )}
          </div>

          <div className="max-h-80 divide-y divide-border overflow-y-auto custom-scrollbar">
            {errorMessage && <p className="px-4 py-3 text-sm text-danger">{errorMessage}</p>}
            {!errorMessage && isLoading && <p className="px-4 py-6 text-center text-sm text-text-secondary">{t('A carregar notificações...')}</p>}
            {!errorMessage && !isLoading && recent.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-text-secondary">{t('Não existem notificações.')}</p>
            )}
            {recent.map((notification) => {
              const hasTarget = targetOf(notification) !== null;
              return (
                <button
                  type="button"
                  key={notification.id}
                  onClick={() => openNotification(notification)}
                  className={`block w-full px-4 py-3 text-left hover:bg-background ${notification.read_at ? '' : 'bg-primary-soft'}`}
                >
                  <span className="flex items-start justify-between gap-2">
                    <span className={`text-sm ${notification.read_at ? 'text-text-secondary' : 'font-semibold text-text'}`}>
                      {notification.title}
                    </span>
                    {!notification.read_at && <span className="sr-only">{t('(por ler)')}</span>}
                    <NotificationCategoryBadge category={notification.category} />
                  </span>
                  <span className="mt-1 line-clamp-2 block text-sm text-text-secondary">{notification.message}</span>
                  <span className="mt-1 block text-xs text-text-muted">
                    {formatDateTime(notification.created_at)}
                    {!hasTarget && ` · ${t('Sem página associada')}`}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="border-t border-border bg-background p-2">
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/notifications');
              }}
              className="flex w-full items-center justify-center gap-1 rounded-md py-1.5 text-sm font-semibold text-primary-hover hover:bg-surface-muted"
            >
              {t('Ver todas as notificações')}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
