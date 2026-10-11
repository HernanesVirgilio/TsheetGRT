import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, Check } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { useNotifications } from '../../lib/notifications/NotificationsContext';
import * as notificationService from '../../services/notificationService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime } from '../../utils/format';
import { isNotificationCategory, NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS } from '../../utils/notifications';
import type { NotificationCategory } from '../../utils/notifications';
import { NotificationCategoryBadge } from '../../components/layout/NotificationCategoryBadge';
import { t } from '../../lib/i18n';

type NotificationFilter = 'ALL' | 'UNREAD';

export const NotificationsPage: React.FC = () => {
  // A lista completa recarrega sempre que o estado partilhado muda (nova notificação ou leitura no cabeçalho).
  const { unreadCount, revision, refresh, markAsRead, markAllAsRead, targetOf } = useNotifications();
  const notifications = useAsyncData(() => notificationService.listNotifications(), [revision]);
  const [filter, setFilter] = useState<NotificationFilter>('ALL');
  const [category, setCategory] = useState<NotificationCategory | 'ALL'>('ALL');
  const [actionError, setActionError] = useState<string | null>(null);

  const items = notifications.data ?? [];
  const visibleItems = items.filter(
    (notification) => (filter === 'ALL' || !notification.read_at) && (category === 'ALL' || notification.category === category)
  );

  useEffect(() => {
    refresh({ withDeadlineAlerts: true });
  }, [refresh]);

  const runAction = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(getErrorMessage(error, t('Não foi possível atualizar as notificações.')));
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={t('Notificações')}
        subtitle={t('Avisos operacionais e alertas de aprovação.')}
        actions={
          unreadCount > 0 && (
            <Button
              variant="secondary"
              icon={Check}
              onClick={() => runAction(markAllAsRead)}
            >
              {t('Marcar todas como lidas')}
            </Button>
          )
        }
      />

      {actionError && <Alert variant="error">{actionError}</Alert>}

      <div role="tablist" aria-label={t('Filtrar notificações')} className="flex gap-1 border-b border-border">
        {(
          [
            ['ALL', t('Todas ({count})', { count: items.length })],
            ['UNREAD', t('Não lidas ({unreadCount})', { unreadCount })],
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

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Filtrar por tipo')}>
        <label htmlFor="notification-category" className="text-sm text-text-secondary">
          {t('Tipo')}
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
          <option value="ALL">{t('Todos')}</option>
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
            title={filter === 'UNREAD' ? t('Não existem notificações por ler.') : t('Não existem notificações.')}
          />
        )}
        {visibleItems.length > 0 && (
          <ul className="divide-y divide-border">
            {visibleItems.map((notification) => {
              const target = targetOf(notification);
              return (
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
                        {!notification.read_at && <span className="sr-only"> {t('(por ler)')}</span>}
                      </span>
                      <NotificationCategoryBadge category={notification.category} />
                    </p>
                    <p className="mt-1 text-sm text-text-secondary">{notification.message}</p>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
                      {formatDateTime(notification.created_at)}
                      {target ? (
                        <Link
                          to={target}
                          onClick={() => {
                            if (!notification.read_at) runAction(() => markAsRead(notification.id));
                          }}
                          className="font-semibold text-primary-hover hover:underline"
                        >
                          {target === notification.link ? t('Abrir registo') : t('Abrir módulo')}
                        </Link>
                      ) : (
                        <span>{t('Sem página associada')}</span>
                      )}
                    </p>
                  </div>
                  {!notification.read_at && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => runAction(() => markAsRead(notification.id))}
                    >
                      {t('Marcar como lida')}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
};
