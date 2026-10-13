import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { canAccessPath } from '../auth/routeAccess';
import { getErrorMessage, logDevError } from '../errors';
import * as notificationService from '../../services/notificationService';
import type { NotificationItem } from '../../types';
import { resolveNotificationTarget } from '../../utils/notifications';
import { t } from '../i18n';

const PREVIEW_LIMIT = 10;
const REFRESH_INTERVAL_MS = 60_000;
/** Os alertas de prazo são gerados a pedido no servidor; basta pedi-los no máximo uma vez por minuto. */
const DEADLINE_ALERTS_MIN_INTERVAL_MS = 60_000;

interface RefreshOptions {
  withDeadlineAlerts?: boolean;
}

interface NotificationsContextValue {
  /** Últimas notificações (pré-visualização do cabeçalho). */
  recent: NotificationItem[];
  /** Total por ler no servidor, independente do limite da pré-visualização. */
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  /** Muda sempre que as notificações mudam (chegada ou leitura); a página completa recarrega com ela. */
  revision: number;
  refresh: (options?: RefreshOptions) => Promise<void>;
  markAsRead: (notificationId: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  /** Página a abrir para a notificação, ou `null` se não houver destino acessível ao utilizador. */
  targetOf: (notification: NotificationItem) => string | null;
}

interface NotificationsSnapshot {
  recent: NotificationItem[];
  unreadCount: number;
}

const EMPTY_SNAPSHOT: NotificationsSnapshot = { recent: [], unreadCount: 0 };

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function signatureOf({ recent, unreadCount }: NotificationsSnapshot): string {
  return `${unreadCount}|${recent.map((notification) => `${notification.id}:${notification.read_at ? 1 : 0}`).join(',')}`;
}

/**
 * Estado único das notificações para o cabeçalho, o menu lateral e a página de notificações.
 * Pedidos simultâneos são agrupados: no máximo um pedido em curso e um a seguir, com dados atuais.
 */
export const NotificationsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, hasPermission } = useAuth();
  const userId = currentUser?.id ?? null;
  const [snapshot, setSnapshot] = useState<NotificationsSnapshot>(EMPTY_SNAPSHOT);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const inFlightRef = useRef<Promise<void> | null>(null);
  const rerunRequestedRef = useRef(false);
  const deadlineAlertsRequestedRef = useRef(false);
  const lastDeadlineAlertsAtRef = useRef(0);
  const signatureRef = useRef('');

  const load = useCallback(async () => {
    const requestUserId = userIdRef.current;
    if (!requestUserId) return;

    const now = Date.now();
    if (deadlineAlertsRequestedRef.current && now - lastDeadlineAlertsAtRef.current >= DEADLINE_ALERTS_MIN_INTERVAL_MS) {
      lastDeadlineAlertsAtRef.current = now;
      // Uma falha na geração dos alertas não impede a leitura das notificações.
      await Promise.all([
        notificationService.refreshDeadlineAlerts().catch((error: unknown) => logDevError('alertas de prazo', error)),
        notificationService.refreshApprovalReminders().catch((error: unknown) => logDevError('lembretes', error)),
      ]);
    }
    deadlineAlertsRequestedRef.current = false;

    try {
      const [recent, unreadCount] = await Promise.all([
        notificationService.listNotifications(PREVIEW_LIMIT),
        notificationService.countUnreadNotifications(),
      ]);
      if (userIdRef.current !== requestUserId) return;
      const next = { recent, unreadCount };
      setSnapshot(next);
      setError(null);
      const signature = signatureOf(next);
      if (signature !== signatureRef.current) {
        signatureRef.current = signature;
        setRevision((value) => value + 1);
      }
    } catch (loadError) {
      if (userIdRef.current === requestUserId) {
        setError(getErrorMessage(loadError, t('Não foi possível carregar as notificações.')));
      }
    } finally {
      if (userIdRef.current === requestUserId) setIsLoading(false);
    }
  }, []);

  const refresh = useCallback(
    (options: RefreshOptions = {}): Promise<void> => {
      if (options.withDeadlineAlerts) deadlineAlertsRequestedRef.current = true;
      if (inFlightRef.current) {
        // O pedido em curso pode ter começado antes de uma alteração: repete-se uma vez no fim.
        rerunRequestedRef.current = true;
        return inFlightRef.current;
      }
      const run = async () => {
        do {
          rerunRequestedRef.current = false;
          await load();
        } while (rerunRequestedRef.current);
      };
      const promise = run().finally(() => {
        inFlightRef.current = null;
      });
      inFlightRef.current = promise;
      return promise;
    },
    [load]
  );

  useEffect(() => {
    setSnapshot(EMPTY_SNAPSHOT);
    setIsLoading(true);
    signatureRef.current = '';
    if (!userId) return undefined;

    refresh({ withDeadlineAlerts: true });
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const interval = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [userId, refresh]);

  const markAsRead = useCallback(
    async (notificationId: string) => {
      // Atualização imediata do contador; o servidor confirma a seguir.
      setSnapshot((previous) => {
        const isUnreadInPreview = previous.recent.some((item) => item.id === notificationId && !item.read_at);
        if (!isUnreadInPreview) return previous;
        const readAt = new Date().toISOString();
        return {
          recent: previous.recent.map((item) => (item.id === notificationId ? { ...item, read_at: readAt } : item)),
          unreadCount: Math.max(0, previous.unreadCount - 1),
        };
      });
      try {
        await notificationService.markNotificationAsRead(notificationId);
      } finally {
        await refresh();
      }
    },
    [refresh]
  );

  const markAllAsRead = useCallback(async () => {
    const readAt = new Date().toISOString();
    setSnapshot((previous) => ({
      recent: previous.recent.map((item) => (item.read_at ? item : { ...item, read_at: readAt })),
      unreadCount: 0,
    }));
    try {
      await notificationService.markAllNotificationsAsRead();
    } finally {
      await refresh();
    }
  }, [refresh]);

  const targetOf = useCallback(
    (notification: NotificationItem) => resolveNotificationTarget(notification, (path) => canAccessPath(path, hasPermission)),
    [hasPermission]
  );

  const value = useMemo<NotificationsContextValue>(
    () => ({
      recent: snapshot.recent,
      unreadCount: snapshot.unreadCount,
      isLoading,
      error,
      revision,
      refresh,
      markAsRead,
      markAllAsRead,
      targetOf,
    }),
    [snapshot, isLoading, error, revision, refresh, markAsRead, markAllAsRead, targetOf]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
};

export const useNotifications = (): NotificationsContextValue => {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error('useNotifications deve ser utilizado dentro de um NotificationsProvider');
  return context;
};
