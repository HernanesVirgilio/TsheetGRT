import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Check, Clock, ChevronRight } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { dataService } from '../../services/dataService';
import { NotificationItem } from '../../types';

export const NotificationDropdown: React.FC = () => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const loadNotifications = () => {
    if (currentUser) {
      setNotifications(dataService.getNotifications(currentUser.id));
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 10000);
    return () => clearInterval(interval);
  }, [currentUser]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const handleMarkAsRead = (id: string) => {
    dataService.markNotificationAsRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = () => {
    if (currentUser) {
      dataService.markAllNotificationsAsRead(currentUser.id);
      loadNotifications();
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition focus:outline-none"
        title="Notificações"
        aria-label="Abrir notificações"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#C0392B] text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-lg shadow-xl border border-[#D9E0E7] z-50 overflow-hidden">
          <div className="flex items-center justify-between p-3.5 border-b border-[#D9E0E7] bg-slate-50">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#1F2937]">Notificações</span>
              {unreadCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-[#1F5FAD] font-medium">
                  {unreadCount} nova{unreadCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="text-xs text-[#1F5FAD] hover:underline flex items-center gap-1 font-medium"
              >
                <Check className="w-3.5 h-3.5" />
                Marcar todas como lidas
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 custom-scrollbar">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                Não existem notificações de momento.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  onClick={() => handleMarkAsRead(item.id)}
                  className={`p-3.5 cursor-pointer transition hover:bg-slate-50 ${
                    !item.read_at ? 'bg-blue-50/50' : 'bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-xs ${!item.read_at ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                      {item.title}
                    </p>
                    {!item.read_at && (
                      <span className="w-2 h-2 rounded-full bg-[#1F5FAD] shrink-0 mt-1" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                    {item.message}
                  </p>
                  <div className="flex items-center gap-1 mt-2 text-[11px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(item.created_at).toLocaleString('pt-PT')}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
            <button
              onClick={() => {
                setIsOpen(false);
                navigate('/notifications');
              }}
              className="w-full py-1.5 text-xs text-[#1F5FAD] font-semibold hover:bg-slate-100 rounded transition flex items-center justify-center gap-1"
            >
              <span>Ver todas as notificações</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
