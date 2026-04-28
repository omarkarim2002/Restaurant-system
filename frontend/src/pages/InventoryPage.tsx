import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const PHASES = [
  {
    num: 1, label: 'Items & setup', status: 'active',
    desc: 'Upload your template sheet or manually add inventory items. AI extracts and categorises everything once.',
    items: ['AI template extraction', 'Manual item entry', 'Category management', 'Unit configuration'],
  },
  {
    num: 2, label: 'Daily ordering', status: 'soon',
    desc: 'Staff fill out daily order sheets by hand or directly in the app. Upload photos for AI extraction.',
    items: ['Daily order form', 'Photo upload + AI extraction', 'Par level tracking', 'Order history'],
  },
  {
    num: 3, label: 'Deliveries', status: 'soon',
    desc: 'Track incoming deliveries, match against orders, flag discrepancies.',
    items: ['Delivery logging', 'Order vs delivery matching', 'Supplier management', 'Discrepancy alerts'],
  },
  {
    num: 4, label: 'Smart analytics', status: 'soon',
    desc: 'AI recommendations on what to order, when, and how much. Cost tracking and waste reduction insights.',
    items: ['Order recommendations', 'Cost per item tracking', 'Over/under ordering alerts', 'Weekly cost upload'],
  },
];

const DEMO_CATEGORIES = [
  {
    name: 'Proteins',
    color: '#fde8ec',
    textColor: '#9e1830',
    icon: '🥩',
    items: [
      { name: 'Chicken breast', unit: 'kg', par: 10, status: 'ok' },
      { name: 'Beef mince', unit: 'kg', par: 5, status: 'low' },
      { name: 'Salmon fillet', unit: 'kg', par: 3, status: 'ok' },
      { name: 'Eggs', unit: 'dozen', par: 8, status: 'ok' },
    ],
  },
  {
    name: 'Produce',
    color: '#eaf3de',
    textColor: '#27500a',
    icon: '🥦',
    items: [
      { name: 'Tomatoes', unit: 'kg', par: 8, status: 'ok' },
      { name: 'Mixed salad leaves', unit: 'bag', par: 6, status: 'critical' },
      { name: 'Red onions', unit: 'kg', par: 4, status: 'ok' },
      { name: 'Garlic', unit: 'kg', par: 2, status: 'low' },
    ],
  },
  {
    name: 'Dairy',
    color: '#e6f1fb',
    textColor: '#0c447c',
    icon: '🧀',
    items: [
      { name: 'Double cream', unit: 'litre', par: 5, status: 'ok' },
      { name: 'Cheddar', unit: 'kg', par: 3, status: 'ok' },
      { name: 'Butter', unit: 'kg', par: 2, status: 'low' },
    ],
  },
  {
    name: 'Dry goods',
    color: '#f5ead6',
    textColor: '#8a6220',
    icon: '🌾',
    items: [
      { name: 'Pasta (rigatoni)', unit: 'kg', par: 5, status: 'ok' },
      { name: 'Arborio rice', unit: 'kg', par: 3, status: 'ok' },
      { name: 'Plain flour', unit: 'kg', par: 8, status: 'ok' },
      { name: 'Panko breadcrumbs', unit: 'kg', par: 2, status: 'ok' },
    ],
  },
];

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  ok:       { bg: '#eaf3de', text: '#27500a', label: 'OK' },
  low:      { bg: '#faeeda', text: '#633806', label: 'Low' },
  critical: { bg: '#fde8ec', text: '#9e1830', label: 'Critical' },
};

export function InventoryPage() {
  const navigate = useNavigate();
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [extracted, setExtracted] = useState(false);

  function simulateExtract() {
    setUploading(true);
    setTimeout(() => { setUploading(false); setExtracted(true); }, 2200);
  }

  const totalItems = DEMO_CATEGORIES.reduce((s, c) => s + c.items.length, 0);
  const lowCount   = DEMO_CATEGORIES.flatMap(c => c.items).filter(i => i.status === 'low').length;
  const critCount  = DEMO_CATEGORIES.flatMap(c => c.items).filter(i => i.status === 'critical').length;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory items</h1>
          <p className="page-sub">Manage your ingredient list · AI-powered setup</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowUpload(true)} style={{ fontSize: '13px' }}>
            📄 Upload template
          </button>
          <button className="btn-primary" onClick={() => {}}>+ Add item</button>
        </div>
      </div>

      {/* Status metrics */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">Total items</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>{totalItems}</div>
          <div className="metric-sub">across {DEMO_CATEGORIES.length} categories</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Low stock</div>
          <div className="metric-val" style={{ color: '#C9973A' }}>{lowCount}</div>
          <div className="metric-sub">below par level</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Critical</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>{critCount}</div>
          <div className="metric-sub">needs ordering today</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Next delivery</div>
          <div className="metric-val" style={{ fontSize: '18px' }}>Tomorrow</div>
          <div className="metric-sub">3 items expected</div>
        </div>
      </div>

      {/* Critical alert */}
      {critCount > 0 && (
        <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#C41E3A', color: 'white', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</div>
          <div style={{ flex: 1, fontSize: '13px', color: '#9e1830', fontWeight: 500 }}>
            {critCount} item{critCount !== 1 ? 's' : ''} at critical level — order today
          </div>
          <button className="btn-primary" style={{ fontSize: '12px', padding: '5px 12px' }} onClick={() => navigate('/inventory/order')}>
            Create order →
          </button>
        </div>
      )}

      {/* Category grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {DEMO_CATEGORIES.map(cat => (
          <div key={cat.name} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: cat.color, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: '16px' }}>{cat.icon}</span>
              <div style={{ fontSize: '13px', fontWeight: 600, color: cat.textColor }}>{cat.name}</div>
              <div style={{ fontSize: '11px', color: cat.textColor, opacity: 0.7, marginLeft: 'auto' }}>
                {cat.items.length} items
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 80px', padding: '6px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <div>Item</div><div>Unit</div><div>Par level</div><div>Status</div><div></div>
            </div>
            {cat.items.map((item, idx) => {
              const st = STATUS_STYLE[item.status];
              return (
                <div key={item.name} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 80px', padding: '10px 16px', borderBottom: idx < cat.items.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.unit}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.par} {item.unit}</div>
                  <div>
                    <span style={{ fontSize: '11px', fontWeight: 500, background: st.bg, color: st.text, padding: '2px 8px', borderRadius: '20px' }}>
                      {st.label}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: '#C41E3A', cursor: 'pointer' }}>Edit</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'white', borderRadius: '16px', width: '460px', padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 500, margin: 0 }}>AI template extraction</h3>
              <button onClick={() => { setShowUpload(false); setExtracted(false); }} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
            </div>
            {!extracted ? (
              <>
                <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                  Upload a photo or scan of your existing inventory template or order sheet. The AI will extract all items, categories, and units automatically — you only need to do this once.
                </p>
                <div style={{ border: '2px dashed var(--color-border-secondary)', borderRadius: '10px', padding: '2.5rem', textAlign: 'center', marginBottom: '1.25rem', background: 'var(--color-background-secondary)' }}>
                  <div style={{ fontSize: '32px', marginBottom: '8px' }}>📄</div>
                  <div style={{ fontSize: '13px', fontWeight: 500, marginBottom: '4px' }}>Drop your template here</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>PNG, JPG, or PDF · up to 10MB</div>
                </div>
                {uploading ? (
                  <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#0c447c', textAlign: 'center' }}>
                    🤖 AI is extracting your inventory items…
                  </div>
                ) : (
                  <button className="btn-primary" style={{ width: '100%', padding: '10px', fontSize: '14px' }} onClick={simulateExtract}>
                    Extract items with AI →
                  </button>
                )}
              </>
            ) : (
              <>
                <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '12px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#27500a' }}>
                  ✓ Extracted 23 items across 5 categories. Review and confirm below.
                </div>
                <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
                  Items will be added to your inventory list. You can edit any details after import.
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="btn-primary" style={{ flex: 1, padding: '10px' }} onClick={() => { setShowUpload(false); setExtracted(false); }}>
                    Import all items
                  </button>
                  <button style={{ padding: '10px 16px' }} onClick={() => setExtracted(false)}>Back</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
