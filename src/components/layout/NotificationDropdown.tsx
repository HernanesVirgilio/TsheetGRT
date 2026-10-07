import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, ChevronRight } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import * as notificationService from '../../services/notificationService';
import type { NotificationItem } from '../../types';
import { formatDateTime } from '../../utils/format';

const NOTIFICATION_PREVIEW_LIMIT = 10;
const NOTIFICATION_REFRESH_INTERVAL_MS = 60_000;

export const NotificationDropdown: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const currentUserId = currentUser?.id;

  const loadNotifications = useCallback(async () => {
    try {
      setNotifications(await notificationService.listNotifications(NOTIFICATION_PREVIEW_LIMIT));
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível carregar as notificações.'));
    }
  }, []);

  useEffect(() => {
    if (!currentUserId) return undefined;
    loadNotifications();
    const interval = window.setInterval(loadNotifications, NOTIFICATION_REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [currentUserId, loadNotifications]);

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

  const unreadCount = notifications.filter((notification) => !notification.read_at).length;

  const runAndReload = async (action: () => Promise<void>) => {
    try {
      await action();
      await loadNotifications();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível atualizar as notificações.'));
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-label={unreadCount > 0 ? `Notificações: ${unreadCount} por ler` : 'Notificações'}
        className="relative rounded-md p-2 text-text-secondary hover:bg-surface-muted hover:text-text"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-surface shadow-lg">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-text">Notificações</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => runAndReload(notificationService.markAllNotificationsAsRead)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary-hover hover:underline"
              >
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-80 divide-y divide-border overflow-y-auto custom-scrollbar">
            {errorMessage && <p className="px-4 py-3 text-sm text-danger">{errorMessage}</p>}
            {!errorMessage && notifications.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-text-secondary">Não existem notificações.</p>
            )}
            {notifications.map((notification) => (
              <button
                type="button"
                key={notification.id}
                onClick={() => runAndReload(() => notificationService.markNotificationAsRead(notification.id))}
                className={`block w-full px-4 py-3 text-left hover:bg-background ${notification.read_at ? '' : 'bg-primary-soft'}`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span className={`text-sm ${notification.read_at ? 'text-text-secondary' : 'font-semibold text-text'}`}>
                    {notification.title}
                  </span>
                  {!notification.read_at && <span className="sr-only">(por ler)</span>}
                </span>
                <span className="mt-1 line-clamp-2 block text-sm text-text-secondary">{notification.message}</span>
                <span className="mt-1 block text-xs text-text-muted">{formatDateTime(notification.created_at)}</span>
              </button>
            ))}
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
              Ver todas as notificações
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
