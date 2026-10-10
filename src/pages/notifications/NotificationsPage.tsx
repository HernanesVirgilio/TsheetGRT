import React, { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { isNotificationCategory, NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS, safeNotificationLink } from '../../utils/notifications';
import type { NotificationCategory } from '../../utils/notifications';
import { NotificationCategoryBadge } from '../../components/layout/NotificationCategoryBadge';

type NotificationFilter = 'ALL' | 'UNREAD';

export const NotificationsPage: React.FC = () => {
  const notifications = useAsyncData(() => notificationService.listNotifications(), []);
  const [filter, setFilter] = useState<NotificationFilter>('ALL');
  const [category, setCategory] = useState<NotificationCategory | 'ALL'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);

  const items = notifications.data ?? [];
  const unreadCount = items.filter((notification) => !notification.read_at).length;
  const visibleItems = items.filter(
    (notification) => (filter === 'ALL' || !notification.read_at) && (category === 'ALL' || notification.category === category)
  );

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

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por tipo">
        <label htmlFor="notification-category" className="text-sm text-text-secondary">
          Tipo
        </label>
        <select
          id="notification-category"
          value={category}
          onChange={(event) => {
            const value = event.target.value;
            setCategory(isNotificationCategory(value) ? value : 'ALL');
          }}
          className="h-9 rounded-md border border-border-input bg-surface px-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary-hover"
        >
          <option value="ALL">Todos</option>
          {NOTIFICATION_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {NOTIFICATION_CATEGORY_LABELS[value]}
            </option>
          ))}
        </select>
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
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className={`text-sm ${notification.read_at ? 'text-text-secondary' : 'font-semibold text-text'}`}>
                      {notification.title}
                      {!notification.read_at && <span className="sr-only"> (por ler)</span>}
                    </span>
                    <NotificationCategoryBadge category={notification.category} />
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">{notification.message}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                    {formatDateTime(notification.created_at)}
                    {safeNotificationLink(notification.link) && (
                      <Link
                        to={safeNotificationLink(notification.link) ?? '/notifications'}
                        onClick={() => {
                          if (!notification.read_at) notificationService.markNotificationAsRead(notification.id).catch(() => undefined);
                        }}
                        className="font-semibold text-primary-hover hover:underline"
                      >
                        Abrir registo
                      </Link>
                    )}
                  </p>
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
