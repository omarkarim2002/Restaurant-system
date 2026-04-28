import React from 'react';

const DELIVERIES = [
  { id: '1', supplier: 'Fresh Direct', date: '2026-04-28', status: 'expected', items: 8, value: '£340' },
  { id: '2', supplier: 'Prime Meats', date: '2026-04-27', status: 'received', items: 4, value: '£210', notes: 'Short on chicken — 2kg missing' },
  { id: '3', supplier: 'Dairy Co', date: '2026-04-26', status: 'received', items: 5, value: '£95' },
  { id: '4', supplier: 'Fresh Direct', date: '2026-04-25', status: 'received', items: 11, value: '£380' },
];

const STATUS: Record<string, { bg: string; text: string; label: string }> = {
  expected: { bg: '#e6f1fb', text: '#0c447c', label: 'Expected today' },
  received: { bg: '#eaf3de', text: '#27500a', label: 'Received' },
  partial:  { bg: '#faeeda', text: '#633806', label: 'Partial — discrepancy' },
};

export function InventoryDeliveriesPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Deliveries</h1>
          <p className="page-sub">Track incoming stock and flag discrepancies</p>
        </div>
        <button className="btn-primary">+ Log delivery</button>
      </div>

      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">Expected today</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>1</div>
          <div className="metric-sub">Fresh Direct</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">This week spend</div>
          <div className="metric-val" style={{ color: '#C9973A' }}>£685</div>
          <div className="metric-sub">3 deliveries</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Discrepancies</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>1</div>
          <div className="metric-sub">this week</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Suppliers</div>
          <div className="metric-val">3</div>
          <div className="metric-sub">active</div>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '12px 16px', borderBottom: '0.5px solid var(--color-border-tertiary)', background: 'var(--color-background-secondary)' }}>
          <h3 style={{ margin: 0, fontSize: '13px' }}>Recent & upcoming deliveries</h3>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 80px 180px 80px', padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>Supplier</div><div>Date</div><div>Items</div><div>Value</div><div>Status</div><div></div>
        </div>
        {DELIVERIES.map((d, idx) => {
          const st = STATUS[d.status] || STATUS.received;
          return (
            <div key={d.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 80px 180px 80px', padding: '12px 16px', borderBottom: idx < DELIVERIES.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 500 }}>{d.supplier}</div>
                {d.notes && <div style={{ fontSize: '11px', color: '#9e1830', marginTop: '2px' }}>⚠ {d.notes}</div>}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{new Date(d.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{d.items}</div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>{d.value}</div>
              <div><span style={{ fontSize: '11px', fontWeight: 500, background: st.bg, color: st.text, padding: '2px 9px', borderRadius: '20px' }}>{st.label}</span></div>
              <div style={{ fontSize: '11px', color: '#C41E3A', cursor: 'pointer' }}>View</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
