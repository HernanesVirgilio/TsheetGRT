import React, { useState, useEffect } from 'react';
import { Bell, Check, Clock, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService } from '../../services/dataService';
import { NotificationItem } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/EmptyState';

export const NotificationsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'UNREAD'>('ALL');

  const loadData = () => {
    if (currentUser) {
      setNotifications(dataService.getNotifications(currentUser.id));
    }
  };

  useEffect(() => {
    loadData();
  }, [currentUser]);

  const handleMarkAsRead = (id: string) => {
    dataService.markNotificationAsRead(id);
    loadData();
  };

  const handleMarkAllRead = () => {
    if (currentUser) {
      dataService.markAllNotificationsAsRead(currentUser.id);
      loadData();
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'UNREAD') return !n.read_at;
    return true;
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Notificações"
        subtitle="Comunicações operacionais, alertas de aprovação e avisos do sistema."
        actions={
          unreadCount > 0 && (
            <button
              onClick={handleMarkAllRead}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#D9E0E7] text-slate-700 hover:bg-slate-50 text-xs font-semibold rounded shadow-xs transition"
            >
              <Check className="w-3.5 h-3.5 text-[#1F5FAD]" />
              Marcar todas como lidas
            </button>
          )
        }
      />

      {/* Filter Tabs */}
      <div className="border-b border-[#D9E0E7] flex items-center gap-4 text-xs font-semibold">
        <button
          onClick={() => setFilter('ALL')}
          className={`pb-3 border-b-2 transition ${
            filter === 'ALL'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Todas ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('UNREAD')}
          className={`pb-3 border-b-2 transition ${
            filter === 'UNREAD'
              ? 'border-[#1F5FAD] text-[#1F5FAD]'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          Não Lidas ({unreadCount})
        </button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="Não existem notificações"
          message={filter === 'UNREAD' ? 'Não existem notificações por ler.' : 'A sua caixa de notificações está limpa.'}
          icon={Bell}
        />
      ) : (
        <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs divide-y divide-slate-100 overflow-hidden">
          {filtered.map((item) => (
            <div
              key={item.id}
              onClick={() => handleMarkAsRead(item.id)}
              className={`p-4 cursor-pointer transition hover:bg-slate-50/80 flex items-start justify-between gap-4 ${
                !item.read_at ? 'bg-blue-50/40' : 'bg-white'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                    !item.read_at ? 'bg-[#1F5FAD]' : 'bg-transparent'
                  }`}
                />
                <div>
                  <h4 className={`text-xs ${!item.read_at ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                    {item.title}
                  </h4>
                  <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                    {item.message}
                  </p>
                  <div className="flex items-center gap-1.5 mt-2 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(item.created_at).toLocaleString('pt-PT')}</span>
                  </div>
                </div>
              </div>

              {!item.read_at && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleMarkAsRead(item.id);
                  }}
                  className="text-[11px] font-semibold text-[#1F5FAD] hover:underline shrink-0"
                >
                  Marcar como lida
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
