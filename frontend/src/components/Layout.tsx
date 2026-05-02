import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { useAuthStore } from '../store/authStore';
import api from '../api/index';

const OPERATIONS = [
  { label: 'Dashboard',   path: '/',           icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: 'Rota',        path: '/rota',        icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { label: 'Rota config', path: '/rota-config', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Staff',       path: '/staff',       icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
  { label: 'Time off',    path: '/time-off',    icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: 'Wages',       path: '/wages',       icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
];

const BOOKINGS = [
  { label: 'Bookings',    path: '/bookings',           icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
  { label: 'Floor plan',  path: '/bookings/floor-plan', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
  { label: 'Analytics',   path: '/bookings/analytics',  icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
];

const INVENTORY = [
  { label: 'Items',           path: '/inventory',              icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
  { label: 'Recurring',       path: '/inventory/recurring',    icon: 'M4 4v5h5M4 9a9 9 0 1118 0M20 20v-5h-5M20 15a9 9 0 11-18 0' },
  { label: 'Daily order',     path: '/inventory/order',        icon: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { label: 'Requests',        path: '/inventory/requests',     icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
  { label: 'Checklists',      path: '/inventory/checklists',   icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7l2 2 4-4' },
  { label: 'Deliveries',      path: '/inventory/deliveries',   icon: 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2' },
  { label: 'Analytics',       path: '/inventory/analytics',    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
];

function Icon({ d }: { d: string }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {d.split(' M').map((seg, i) => <path key={i} d={i === 0 ? seg : 'M' + seg} />)}
    </svg>
  );
}

// ── Notifications ─────────────────────────────────────────────────────────────
function useNotifications() {
  return useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get('/notifications?limit=20').then(r => r.data.data),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}
function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/notifications/mark-read', b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }) });
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { data } = useNotifications();
  const markRead = useMarkRead();
  const unread = data?.unread_count || 0;

  function handleClick(n: any) {
    markRead.mutate({ id: n.id });
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(v => !v)}
        style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', borderRadius: '8px', color: unread > 0 ? '#C41E3A' : 'rgba(255,255,255,0.55)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
        </svg>
        {unread > 0 && (
          <div style={{ position: 'absolute', top: 4, right: 4, width: 14, height: 14, borderRadius: '50%', background: '#C41E3A', color: 'white', fontSize: '9px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {unread > 9 ? '9+' : unread}
          </div>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 99 }} />
          <div style={{ position: 'absolute', bottom: '100%', right: 0, marginBottom: '8px', width: '320px', maxHeight: '420px', background: 'white', border: '0.5px solid var(--color-border-secondary)', borderRadius: '12px', boxShadow: '0 12px 40px rgba(0,0,0,0.15)', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
            <div style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Notifications</div>
              {unread > 0 && (
                <button onClick={() => markRead.mutate({ all: true })} style={{ fontSize: '11px', color: '#C41E3A', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Mark all read</button>
              )}
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {!data?.notifications?.length ? (
                <div style={{ padding: '2rem', textAlign: 'center', fontSize: '12px', color: 'var(--color-text-tertiary)' }}>
                  No notifications
                </div>
              ) : (
                data.notifications.map((n: any) => (
                  <div key={n.id} onClick={() => handleClick(n)} style={{ padding: '10px 14px', borderBottom: '0.5px solid var(--color-border-tertiary)', cursor: 'pointer', background: !n.is_read ? '#fde8ec40' : 'transparent', borderLeft: !n.is_read ? '3px solid #C41E3A' : '3px solid transparent' }}>
                    <div style={{ fontSize: '12px', fontWeight: !n.is_read ? 500 : 400, color: 'var(--color-text-primary)' }}>{n.title}</div>
                    {n.body && <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '2px', lineHeight: 1.4 }}>{n.body}</div>}
                    <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '4px' }}>
                      {formatDistanceToNow(parseISO(n.created_at), { addSuffix: true })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { employee, logout } = useAuthStore();

  const initials = employee
    ? `${employee.first_name[0]}${employee.last_name[0]}`.toUpperCase()
    : 'U';

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    if (path === '/inventory') return location.pathname === '/inventory';
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const NavItem = ({ label, path, icon }: { label: string; path: string; icon: string }) => (
    <button className={`nav-item${isActive(path) ? ' active' : ''}`} onClick={() => navigate(path)}>
      <Icon d={icon} />{label}
    </button>
  );

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <div className="sidebar-logo-mark">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
          </div>
          <div>
            <div className="sidebar-logo-text">Restaurant MS</div>
            <div className="sidebar-logo-sub">Management platform</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">Operations</div>
          {OPERATIONS.map(item => <NavItem key={item.path} {...item} />)}

          <div className="sidebar-section-label">Bookings</div>
          {BOOKINGS.map(item => <NavItem key={item.path} {...item} />)}

          <div className="sidebar-section-label">Inventory</div>
          {INVENTORY.map(item => <NavItem key={item.path} {...item} />)}
        </nav>

        <div className="sidebar-footer">
          <div className="user-row">
            <div className="user-avatar">{initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="user-name">{employee?.first_name} {employee?.last_name}</div>
              <div className="user-role">{employee?.system_role}</div>
            </div>
            <NotificationBell />
            <button onClick={() => { logout(); navigate('/login'); }}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', fontSize: '11px', padding: '4px', cursor: 'pointer' }}>
              out
            </button>
          </div>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
