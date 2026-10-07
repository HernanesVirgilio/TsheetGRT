import React, { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import * as notificationService from '../../services/notificationService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime } from '../../utils/format';

type NotificationFilter = 'ALL' | 'UNREAD';

export const NotificationsPage: React.FC = () => {
  const notifications = useAsyncData(() => notificationService.listNotifications(), []);
  const [filter, setFilter] = useState<NotificationFilter>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);

  const items = notifications.data ?? [];
  const unreadCount = items.filter((notification) => !notification.read_at).length;
  const visibleItems = filter === 'UNREAD' ? items.filter((notification) => !notification.read_at) : items;

  const runAndReload = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
      notifications.reload();
    } catch (error) {
      setActionError(getErrorMessage(error, 'Não foi possível atualizar as notificações.'));
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Notificações"
        subtitle="Avisos operacionais e alertas de aprovação."
        actions={
          unreadCount > 0 && (
            <Button
              variant="secondary"
              icon={Check}
              onClick={() => runAndReload(notificationService.markAllNotificationsAsRead)}
            >
              Marcar todas como lidas
            </Button>
          )
        }
      />

      {actionError && <Alert variant="error">{actionError}</Alert>}

      <div role="tablist" aria-label="Filtrar notificações" className="flex gap-1 border-b border-border">
        {(
          [
            ['ALL', `Todas (${items.length})`],
            ['UNREAD', `Não lidas (${unreadCount})`],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            onClick={() => setFilter(value)}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${
              filter === value ? 'border-primary-hover text-text' : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <Panel flush>
        {notifications.error && (
          <div className="p-4">
            <ErrorState message={notifications.error} onRetry={notifications.reload} />
          </div>
        )}
        {notifications.isLoading && !notifications.data && <LoadingState />}
        {notifications.data && visibleItems.length === 0 && (
          <EmptyState
            bordered={false}
            icon={Bell}
            title={filter === 'UNREAD' ? 'Não existem notificações por ler.' : 'Não existem notificações.'}
          />
        )}
        {visibleItems.length > 0 && (
          <ul className="divide-y divide-border">
            {visibleItems.map((notification) => (
              <li
                key={notification.id}
                className={`flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-start sm:justify-between ${
                  notification.read_at ? '' : 'bg-primary-soft'
                }`}
              >
                <div>
                  <p className={`text-sm ${notification.read_at ? 'text-text-secondary' : 'font-semibold text-text'}`}>
                    {notification.title}
                    {!notification.read_at && <span className="sr-only"> (por ler)</span>}
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">{notification.message}</p>
                  <p className="mt-1 text-xs text-text-muted">{formatDateTime(notification.created_at)}</p>
                </div>
                {!notification.read_at && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => runAndReload(() => notificationService.markNotificationAsRead(notification.id))}
                  >
                    Marcar como lida
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};
