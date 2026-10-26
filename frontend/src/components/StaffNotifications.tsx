
import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { useStaffNotificationsSocket } from '@/hooks/useStaffNotificationsSocket';

type StaffNotification = {
  id: string;
  title: string;
  body: string;
  category: string;
  status: 'UNREAD' | 'READ' | 'ARCHIVED';
  entityType?: string | null;
  entityId?: string | null;
  createdAt: string;
  readAt?: string | null;
};

type NotificationResponse = {
  notifications: StaffNotification[];
  unreadCount: number;
};

export default function StaffNotifications() {
  const [notifications, setNotifications] = useState<
    StaffNotification[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  
const loadNotifications = useCallback(async () => {
  try {
    const response = await api.get<NotificationResponse>(
      '/staff-notifications',
    );

    setNotifications(response.notifications);
    setUnreadCount(response.unreadCount);
    setError('');
  } catch {
    setError('Could not load notifications. Please try again.');
  } finally {
    setLoading(false);
  }
}, []);


  // Refresh notifications whenever a WebSocket event arrives.
  const { status: socketStatus } = useStaffNotificationsSocket(() => {
    void loadNotifications();
  });

  // Load notifications on mount and periodically refresh as a fallback.
  useEffect(() => {
    void loadNotifications();

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void loadNotifications();
      }
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  async function markAsRead(id: string) {
    try {
      await api.post(`/staff-notifications/${id}/read`);
      await loadNotifications();
    } catch {
      setError('Could not mark notification as read.');
    }
  }

  async function archiveNotification(id: string) {
    try {
      await api.post(`/staff-notifications/${id}/archive`);
      await loadNotifications();
    } catch {
      setError('Could not archive notification.');
    }
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 p-4">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Bell aria-hidden="true" />
            Staff notifications
          </h1>

          <p className="text-sm text-muted-foreground">
            Updates about hotel operations and staff activities.
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Real-time connection: {socketStatus}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadNotifications()}
          className="inline-flex items-center gap-2 rounded-md border px-3 py-2"
        >
          <RefreshCw size={16} aria-hidden="true" />
          Refresh
        </button>
      </header>

      <div
        className="rounded-lg border p-4"
        aria-live="polite"
      >
        <p className="text-sm text-muted-foreground">
          Unread notifications
        </p>
        <p className="text-3xl font-bold">{unreadCount}</p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border p-3 text-sm">
          {error}
        </p>
      )}

      {loading ? (
        <p>Loading notifications...</p>
      ) : notifications.length === 0 ? (
        <div className="rounded-lg border p-8 text-center">
          <Bell
            className="mx-auto mb-2"
            size={28}
            aria-hidden="true"
          />
          <p className="font-medium">You are all caught up</p>
          <p className="text-sm text-muted-foreground">
            New staff notifications will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <article
              key={notification.id}
              className="rounded-lg border p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-semibold">
                      {notification.title}
                    </h2>

                    {notification.status === 'UNREAD' && (
                      <span className="rounded-full bg-blue-100 px-2 py-1 text-xs text-blue-800">
                        Unread
                      </span>
                    )}
                  </div>

                  <p className="mt-2 whitespace-pre-wrap text-sm">
                    {notification.body}
                  </p>

                  <p className="mt-2 text-xs text-muted-foreground">
                    {notification.category} ·{' '}
                    {new Date(notification.createdAt).toLocaleString()}
                  </p>
                </div>

                {notification.status === 'UNREAD' && (
                  <button
                    type="button"
                    title="Mark as read"
                    aria-label={`Mark ${notification.title} as read`}
                    onClick={() => void markAsRead(notification.id)}
                    className="rounded-md border p-2"
                  >
                    <Check size={16} aria-hidden="true" />
                  </button>
                )}
              </div>

              {notification.status !== 'ARCHIVED' && (
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      void archiveNotification(notification.id)
                    }
                    className="text-sm underline"
                  >
                    Archive
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
