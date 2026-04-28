import React from 'react';

const ROADMAP = [
  { phase: 2, label: 'Daily ordering + AI extraction', desc: 'Staff upload handwritten sheets. AI reads quantities and auto-fills the order form.' },
  { phase: 3, label: 'Delivery tracking', desc: 'Log deliveries, match against orders, flag shortfalls from suppliers automatically.' },
  { phase: 4, label: 'Smart analytics + cost tracking', desc: 'AI recommends what to order and when. Upload weekly supplier invoices to track cost per item, over/under ordering patterns, and waste.' },
];

export function InventoryAnalyticsPage() {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="page-sub">Smart ordering insights and cost tracking</p>
        </div>
      </div>

      {/* Coming soon banner */}
      <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px', padding: '2rem', marginBottom: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontSize: '40px', marginBottom: '1rem' }}>🤖</div>
        <h2 style={{ fontSize: '18px', fontWeight: 500, marginBottom: '0.5rem' }}>AI analytics coming soon</h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', maxWidth: '480px', margin: '0 auto 1.5rem', lineHeight: 1.7 }}>
          Once you have a few weeks of ordering and delivery data, this module will analyse your patterns and make intelligent recommendations — including what to order, when to order it, and where you're over-spending.
        </p>
      </div>

      {/* Preview of what's coming */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>What analytics will include</div>
        {ROADMAP.map(r => (
          <div key={r.phase} className="card" style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', opacity: 0.7 }}>
            <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: '#fde8ec', color: '#C41E3A', fontSize: '12px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {r.phase}
            </div>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '3px' }}>{r.label}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{r.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
