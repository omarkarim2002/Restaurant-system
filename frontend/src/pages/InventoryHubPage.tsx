import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

// Import all the existing page components
import { InventoryPage } from './InventoryPage';
import { RecurringOrdersPage } from './RecurringOrdersPage';
import { InventoryOrderPage } from './InventoryOrderPage';
import { ItemRequestsPage } from './ItemRequestsPage';
import { ChecklistsPage } from './ChecklistsPage';
import { InventoryDeliveriesPage } from './InventoryDeliveriesPage';
import { InventoryAnalyticsPage } from './InventoryAnalyticsPage';

const TABS = [
  { id: 'items',      label: 'Items',       path: '/inventory' },
  { id: 'recurring',  label: 'Recurring',   path: '/inventory/recurring' },
  { id: 'order',      label: 'Daily order', path: '/inventory/order' },
  { id: 'requests',   label: 'Requests',    path: '/inventory/requests' },
  { id: 'checklists', label: 'Checklists',  path: '/inventory/checklists' },
  { id: 'deliveries', label: 'Deliveries',  path: '/inventory/deliveries' },
  { id: 'analytics',  label: 'Analytics',   path: '/inventory/analytics' },
];

export function InventoryHubPage() {
  const location = useLocation();
  const navigate = useNavigate();

  // Derive active tab from URL
  const activeTab = (() => {
    const p = location.pathname;
    if (p === '/inventory' || p === '/inventory/') return 'items';
    const match = TABS.find(t => t.path !== '/inventory' && p.startsWith(t.path));
    return match?.id || 'items';
  })();

  function goTab(tab: typeof TABS[number]) {
    navigate(tab.path);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab bar — sits at the top of the main content area */}
      <div style={{
        display: 'flex', gap: 0, borderBottom: '0.5px solid var(--color-border-tertiary)',
        background: 'var(--color-background-primary)', flexShrink: 0,
        paddingLeft: '1.5rem', paddingRight: '1.5rem',
      }}>
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => goTab(tab)}
            style={{
              padding: '12px 16px', fontSize: '13px', border: 'none', background: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: activeTab === tab.id ? '2px solid #C41E3A' : '2px solid transparent',
              color: activeTab === tab.id ? '#C41E3A' : 'var(--color-text-secondary)',
              fontWeight: activeTab === tab.id ? 500 : 400,
              borderRadius: 0, marginBottom: '-1px',
              transition: 'color 0.1s',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Page content — rendered below the tabs */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'items'      && <InventoryPage />}
        {activeTab === 'recurring'  && <RecurringOrdersPage />}
        {activeTab === 'order'      && <InventoryOrderPage />}
        {activeTab === 'requests'   && <ItemRequestsPage />}
        {activeTab === 'checklists' && <ChecklistsPage />}
        {activeTab === 'deliveries' && <InventoryDeliveriesPage />}
        {activeTab === 'analytics'  && <InventoryAnalyticsPage />}
      </div>
    </div>
  );
}
