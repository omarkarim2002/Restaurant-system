import React, { useState } from 'react';

const DEMO_ITEMS = [
  { id: '1', name: 'Chicken breast', unit: 'kg', par: 10, suggested: 8, category: 'Proteins' },
  { id: '2', name: 'Beef mince', unit: 'kg', par: 5, suggested: 6, category: 'Proteins' },
  { id: '3', name: 'Mixed salad leaves', unit: 'bag', par: 6, suggested: 8, category: 'Produce' },
  { id: '4', name: 'Tomatoes', unit: 'kg', par: 8, suggested: 5, category: 'Produce' },
  { id: '5', name: 'Garlic', unit: 'kg', par: 2, suggested: 3, category: 'Produce' },
  { id: '6', name: 'Butter', unit: 'kg', par: 2, suggested: 2, category: 'Dairy' },
  { id: '7', name: 'Double cream', unit: 'litre', par: 5, suggested: 4, category: 'Dairy' },
];

export function InventoryOrderPage() {
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(DEMO_ITEMS.map(i => [i.id, String(i.suggested)]))
  );
  const [showUpload, setShowUpload] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update(id: string, val: string) {
    setAmounts(prev => ({ ...prev, [id]: val }));
  }

  function useSuggested() {
    setAmounts(Object.fromEntries(DEMO_ITEMS.map(i => [i.id, String(i.suggested)])));
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Daily order</h1>
          <p className="page-sub">Enter or upload tomorrow's order quantities</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowUpload(true)} style={{ fontSize: '13px' }}>📸 Upload sheet</button>
          <button onClick={useSuggested} style={{ fontSize: '13px' }}>🤖 Use AI suggestions</button>
          <button className="btn-primary" onClick={() => setSubmitted(true)}>Submit order</button>
        </div>
      </div>

      {submitted && (
        <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#27500a' }}>
          ✓ Order submitted for {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      )}

      {/* AI suggestion banner */}
      <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', fontSize: '13px', color: '#0c447c', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🤖</span>
        <div>
          <strong>AI suggestions loaded</strong> — based on your last 4 weeks of orders, expected covers tomorrow (52), and current par levels. Adjust any amounts before submitting.
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 130px 120px', padding: '8px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
          <div>Item</div><div>Category</div><div>Par level</div><div>AI suggested</div><div>Order qty</div>
        </div>
        {DEMO_ITEMS.map((item, idx) => {
          const val = parseFloat(amounts[item.id] || '0');
          const isOver = val > item.suggested * 1.3;
          const isUnder = val < item.suggested * 0.7 && val > 0;
          return (
            <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 130px 120px', padding: '11px 16px', borderBottom: idx < DEMO_ITEMS.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.name}</div>
              <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)' }}>{item.category}</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.par} {item.unit}</div>
              <div style={{ fontSize: '12px', fontWeight: 500, color: '#0c447c' }}>{item.suggested} {item.unit}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input
                  type="number" min="0" step="0.5"
                  value={amounts[item.id]}
                  onChange={e => update(item.id, e.target.value)}
                  style={{ width: '65px', fontSize: '13px', padding: '5px 8px', borderColor: isOver ? '#ef9f27' : isUnder ? '#f5b8c4' : undefined }}
                />
                <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)' }}>{item.unit}</span>
                {isOver && <span title="Over suggested amount" style={{ fontSize: '11px' }}>⚠️</span>}
                {isUnder && <span title="Under suggested amount" style={{ fontSize: '11px' }}>⬇️</span>}
              </div>
            </div>
          );
        })}
      </div>

      {showUpload && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'white', borderRadius: '16px', width: '420px', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>Upload order sheet</h3>
              <button onClick={() => setShowUpload(false)} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Take a photo of your handwritten order sheet. AI will extract all quantities and match them to your item list.
            </p>
            <div style={{ border: '2px dashed var(--color-border-secondary)', borderRadius: '10px', padding: '2.5rem', textAlign: 'center', marginBottom: '1.25rem', background: 'var(--color-background-secondary)' }}>
              <div style={{ fontSize: '32px', marginBottom: '8px' }}>📸</div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Drop photo here or tap to upload</div>
            </div>
            <button className="btn-primary" style={{ width: '100%', padding: '10px' }} onClick={() => setShowUpload(false)}>Extract quantities →</button>
          </div>
        </div>
      )}
    </div>
  );
}
