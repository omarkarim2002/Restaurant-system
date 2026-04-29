import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../api/index';

// ── Hooks ─────────────────────────────────────────────────────────────────────

function useCategories() {
  return useQuery({ queryKey: ['inv-categories'], queryFn: () => api.get('/inventory/categories').then(r => r.data.data) });
}
function useItems() {
  return useQuery({ queryKey: ['inv-items'], queryFn: () => api.get('/inventory/items').then(r => r.data.data) });
}
function useAddItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/inventory/items', b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-items'] }) });
}
function useEditItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ id, ...b }: any) => api.patch(`/inventory/items/${id}`, b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-items'] }) });
}
function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (id: string) => api.delete(`/inventory/items/${id}`).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-items'] }) });
}
function useBulkImport() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (items: any[]) => api.post('/inventory/items/bulk', { items }).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-items'] }) });
}
function useExtract() {
  return useMutation({ mutationFn: (body: any) => api.post('/inventory/extract', body).then(r => r.data.data) });
}
function useAddCategory() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (b: any) => api.post('/inventory/categories', b).then(r => r.data), onSuccess: () => qc.invalidateQueries({ queryKey: ['inv-categories'] }) });
}

// ── Status helpers ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { bg: string; text: string; label: string; dot: string }> = {
  ok:       { bg: '#eaf3de', text: '#27500a', label: 'OK',       dot: '#97c459' },
  low:      { bg: '#faeeda', text: '#633806', label: 'Low',      dot: '#ef9f27' },
  critical: { bg: '#fde8ec', text: '#9e1830', label: 'Critical', dot: '#C41E3A' },
};

const COLOR_MAP: Record<string, { bg: string; text: string }> = {
  red:    { bg: '#fde8ec', text: '#9e1830' },
  green:  { bg: '#eaf3de', text: '#27500a' },
  blue:   { bg: '#e6f1fb', text: '#0c447c' },
  amber:  { bg: '#faeeda', text: '#633806' },
  teal:   { bg: '#e1f5ee', text: '#085041' },
  gray:   { bg: '#f1efe8', text: '#444441' },
  purple: { bg: '#eeedfe', text: '#3c3489' },
};

const UNITS = ['kg', 'g', 'litre', 'ml', 'unit', 'bag', 'box', 'dozen', 'bunch', 'tin', 'bottle', 'pack'];

// ── Add / Edit item modal ─────────────────────────────────────────────────────

function ItemModal({ categories, item, onClose }: { categories: any[]; item?: any; onClose: () => void }) {
  const addItem  = useAddItem();
  const editItem = useEditItem();
  const [form, setForm] = useState({
    category_id:   item?.category_id   || (categories[0]?.id || ''),
    name:          item?.name          || '',
    unit:          item?.unit          || 'kg',
    par_level:     item?.par_level     || 0,
    current_stock: item?.current_stock || 0,
    notes:         item?.notes         || '',
  });
  const [error, setError] = useState('');

  async function save() {
    if (!form.name) { setError('Name is required.'); return; }
    try {
      if (item) await editItem.mutateAsync({ id: item.id, ...form });
      else await addItem.mutateAsync(form);
      onClose();
    } catch (e: any) { setError(e.response?.data?.error || 'Failed to save.'); }
  }

  const f = (k: string, v: any) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '440px', padding: '1.75rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>{item ? 'Edit item' : 'Add item'}</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>
        {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div className="form-group">
            <label className="form-label">Category *</label>
            <select value={form.category_id} onChange={e => f('category_id', e.target.value)}>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Item name *</label>
            <input value={form.name} onChange={e => f('name', e.target.value)} placeholder="e.g. Chicken breast" autoFocus />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label className="form-label">Unit</label>
              <select value={form.unit} onChange={e => f('unit', e.target.value)}>
                {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Par level</label>
              <input type="number" min={0} step={0.5} value={form.par_level} onChange={e => f('par_level', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="form-group">
              <label className="form-label">In stock</label>
              <input type="number" min={0} step={0.5} value={form.current_stock} onChange={e => f('current_stock', parseFloat(e.target.value) || 0)} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Notes (optional)</label>
            <input value={form.notes} onChange={e => f('notes', e.target.value)} placeholder="e.g. Order from Fresh Direct only" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', marginTop: '1.25rem' }}>
          <button onClick={save} className="btn-primary" disabled={addItem.isPending || editItem.isPending} style={{ flex: 1, padding: '10px' }}>
            {addItem.isPending || editItem.isPending ? 'Saving…' : item ? 'Save changes' : 'Add item'}
          </button>
          <button onClick={onClose} style={{ padding: '10px 16px', borderRadius: '8px' }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── AI extraction modal ───────────────────────────────────────────────────────

function ExtractModal({ categories, onClose }: { categories: any[]; onClose: () => void }) {
  const extract    = useExtract();
  const bulkImport = useBulkImport();
  const fileRef    = useRef<HTMLInputElement>(null);
  const [preview, setPreview]     = useState<string | null>(null);
  const [extracted, setExtracted] = useState<any[] | null>(null);
  const [editable, setEditable]   = useState<any[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError]         = useState('');

  async function handleFile(file: File) {
    setError('');
    setExtracted(null);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const mediaType = file.type || 'image/jpeg';
      setPreview(reader.result as string);
      try {
        const result = await extract.mutateAsync({ image_base64: base64, media_type: mediaType });
        setExtracted(result.items);
        setEditable(result.items.map((item: any, i: number) => ({ ...item, _key: i })));
      } catch (e: any) {
        setError(e.response?.data?.error || 'Extraction failed — try a clearer photo.');
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleImport() {
    setImporting(true);
    try {
      await bulkImport.mutateAsync(editable.filter(i => i.name && i.category_id));
      onClose();
    } catch (e: any) {
      setError(e.response?.data?.error || 'Import failed.');
    } finally { setImporting(false); }
  }

  function updateEditable(idx: number, field: string, value: any) {
    setEditable(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  function removeEditable(idx: number) {
    setEditable(prev => prev.filter((_, i) => i !== idx));
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '580px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ padding: '1.5rem 1.5rem 1rem', borderBottom: '0.5px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>AI template extraction</h3>
            <div style={{ fontSize: '12px', color: '#888', marginTop: '3px' }}>Upload a photo or scan of your inventory sheet</div>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: '20px', color: '#aaa', cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem 1.5rem' }}>
          {error && <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '8px 12px', marginBottom: '1rem', fontSize: '13px', color: '#9e1830' }}>{error}</div>}

          {/* Upload area */}
          {!extracted && (
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              style={{ border: '2px dashed var(--color-border-secondary)', borderRadius: '10px', padding: preview ? '12px' : '3rem', textAlign: 'center', cursor: 'pointer', background: 'var(--color-background-secondary)', marginBottom: '1rem' }}
            >
              {preview ? (
                <img src={preview} alt="Preview" style={{ maxHeight: '200px', maxWidth: '100%', borderRadius: '6px', objectFit: 'contain' }} />
              ) : (
                <>
                  <div style={{ fontSize: '36px', marginBottom: '10px' }}>📄</div>
                  <div style={{ fontSize: '14px', fontWeight: 500, marginBottom: '4px' }}>Drop your template here</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>PNG, JPG, PDF · up to 10MB · Click to browse</div>
                </>
              )}
              <input ref={fileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
            </div>
          )}

          {/* Loading state */}
          {extract.isPending && (
            <div style={{ background: '#e6f1fb', border: '0.5px solid #85b7eb', borderRadius: '8px', padding: '12px 14px', fontSize: '13px', color: '#0c447c', textAlign: 'center' }}>
              🤖 AI is reading your template — usually takes 5–10 seconds…
            </div>
          )}

          {/* Review extracted items */}
          {extracted && (
            <>
              <div style={{ background: '#eaf3de', border: '0.5px solid #97c459', borderRadius: '8px', padding: '10px 12px', marginBottom: '1rem', fontSize: '13px', color: '#27500a' }}>
                ✓ Found {extracted.length} items — review and edit below before importing
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {editable.map((item, idx) => (
                  <div key={item._key} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 70px 70px 28px', gap: '6px', alignItems: 'center', padding: '8px 10px', background: 'var(--color-background-secondary)', borderRadius: '8px' }}>
                    <input value={item.name} onChange={e => updateEditable(idx, 'name', e.target.value)} style={{ fontSize: '13px', padding: '4px 8px' }} />
                    <select value={item.category_id} onChange={e => updateEditable(idx, 'category_id', e.target.value)} style={{ fontSize: '12px', padding: '4px 6px' }}>
                      {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    <select value={item.unit} onChange={e => updateEditable(idx, 'unit', e.target.value)} style={{ fontSize: '12px', padding: '4px 6px' }}>
                      {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <input type="number" min={0} step={0.5} value={item.par_level || 0} onChange={e => updateEditable(idx, 'par_level', parseFloat(e.target.value) || 0)} style={{ width: '55px', fontSize: '12px', padding: '4px 6px' }} />
                    </div>
                    <button onClick={() => removeEditable(idx)} style={{ color: '#9e1830', border: 'none', background: 'none', cursor: 'pointer', fontSize: '16px', padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                ))}
              </div>

              <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '8px' }}>
                Columns: Name · Category · Unit · Par level · Remove
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', display: 'flex', gap: '8px', flexShrink: 0 }}>
          {extracted ? (
            <>
              <button onClick={handleImport} className="btn-primary" disabled={importing || editable.length === 0} style={{ flex: 1, padding: '10px' }}>
                {importing ? 'Importing…' : `Import ${editable.length} item${editable.length !== 1 ? 's' : ''}`}
              </button>
              <button onClick={() => { setExtracted(null); setEditable([]); setPreview(null); }} style={{ padding: '10px 14px', borderRadius: '8px' }}>Try again</button>
            </>
          ) : (
            <button onClick={onClose} style={{ padding: '10px 14px', borderRadius: '8px' }}>Cancel</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main inventory page ───────────────────────────────────────────────────────

export function InventoryPage() {
  const navigate = useNavigate();
  const { data: categories = [], isLoading: catsLoading } = useCategories();
  const { data: items = [], isLoading: itemsLoading }     = useItems();
  const deleteItem = useDeleteItem();

  const [showAddItem, setShowAddItem]     = useState(false);
  const [editingItem, setEditingItem]     = useState<any | null>(null);
  const [showExtract, setShowExtract]     = useState(false);
  const [filterCat, setFilterCat]         = useState<string>('all');
  const [search, setSearch]               = useState('');
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const filtered = items.filter((item: any) => {
    const catMatch  = filterCat === 'all' || item.category_id === filterCat;
    const nameMatch = item.name.toLowerCase().includes(search.toLowerCase());
    return catMatch && nameMatch;
  });

  // Group by category
  const grouped: Record<string, { cat: any; items: any[] }> = {};
  for (const item of filtered) {
    if (!grouped[item.category_id]) {
      const cat = categories.find((c: any) => c.id === item.category_id);
      grouped[item.category_id] = { cat: cat || { name: 'Unknown', icon: '📦', color: 'gray' }, items: [] };
    }
    grouped[item.category_id].items.push(item);
  }

  const totalItems   = items.length;
  const critCount    = items.filter((i: any) => i.stock_status === 'critical').length;
  const lowCount     = items.filter((i: any) => i.stock_status === 'low').length;
  const catCount     = categories.length;

  const isLoading = catsLoading || itemsLoading;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory items</h1>
          <p className="page-sub">Manage your ingredient list · AI-powered setup</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowExtract(true)} style={{ fontSize: '13px' }}>📄 Upload template</button>
          <button className="btn-primary" onClick={() => setShowAddItem(true)}>+ Add item</button>
        </div>
      </div>

      {/* Metric cards */}
      <div className="metric-grid" style={{ marginBottom: '1.5rem' }}>
        <div className="metric-card">
          <div className="metric-label">Total items</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>{totalItems}</div>
          <div className="metric-sub">across {catCount} categories</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Low stock</div>
          <div className="metric-val" style={{ color: '#C9973A' }}>{lowCount}</div>
          <div className="metric-sub">below 75% of par level</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Critical</div>
          <div className="metric-val" style={{ color: '#C41E3A' }}>{critCount}</div>
          <div className="metric-sub">below 40% of par level</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Categories</div>
          <div className="metric-val">{catCount}</div>
          <div className="metric-sub">active</div>
        </div>
      </div>

      {/* Alert banner */}
      {critCount > 0 && (
        <div style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#C41E3A', color: 'white', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>!</div>
          <div style={{ flex: 1, fontSize: '13px', color: '#9e1830', fontWeight: 500 }}>
            {critCount} item{critCount !== 1 ? 's' : ''} at critical level — order today
          </div>
          <button className="btn-primary" style={{ fontSize: '12px', padding: '5px 12px' }} onClick={() => navigate('/inventory/order')}>
            Create order →
          </button>
        </div>
      )}

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search items…"
          style={{ fontSize: '13px', padding: '6px 12px', width: '180px' }}
        />
        <button onClick={() => setFilterCat('all')} style={filterCat === 'all' ? { background: '#C41E3A', color: 'white', border: 'none', fontWeight: 500 } : {}}>
          All ({items.length})
        </button>
        {categories.map((cat: any) => {
          const count = items.filter((i: any) => i.category_id === cat.id).length;
          return (
            <button key={cat.id} onClick={() => setFilterCat(cat.id)}
              style={filterCat === cat.id ? { background: '#C41E3A', color: 'white', border: 'none', fontWeight: 500 } : {}}>
              {cat.icon} {cat.name} ({count})
            </button>
          );
        })}
      </div>

      {/* No items state */}
      {!isLoading && items.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontSize: '40px', marginBottom: '1rem' }}>📦</div>
          <h3 style={{ fontSize: '16px', fontWeight: 500, marginBottom: '0.5rem' }}>No items yet</h3>
          <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.5rem' }}>
            Upload your existing template sheet and the AI will extract all items automatically — or add them one by one.
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button onClick={() => setShowExtract(true)} style={{ fontSize: '13px' }}>📄 Upload template</button>
            <button className="btn-primary" onClick={() => setShowAddItem(true)}>+ Add first item</button>
          </div>
        </div>
      )}

      {/* Category groups */}
      {Object.values(grouped).map(({ cat, items: catItems }) => {
        const colors = COLOR_MAP[cat.color] || COLOR_MAP.gray;
        return (
          <div key={cat.id} className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '12px' }}>
            {/* Category header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', background: colors.bg, borderBottom: '0.5px solid var(--color-border-tertiary)' }}>
              <span style={{ fontSize: '16px' }}>{cat.icon}</span>
              <div style={{ fontSize: '13px', fontWeight: 600, color: colors.text }}>{cat.name}</div>
              <div style={{ fontSize: '11px', color: colors.text, opacity: 0.7, marginLeft: 'auto' }}>
                {catItems.length} item{catItems.length !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 100px 110px 80px', padding: '6px 16px', background: 'var(--color-background-secondary)', borderBottom: '0.5px solid var(--color-border-tertiary)', fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.04em' }}>
              <div>Item</div><div>Unit</div><div>Par level</div><div>In stock</div><div>Status</div><div></div>
            </div>

            {catItems.map((item: any, idx: number) => {
              const st = STATUS_STYLE[item.stock_status] || STATUS_STYLE.ok;
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 100px 110px 80px', padding: '11px 16px', borderBottom: idx < catItems.length - 1 ? '0.5px solid var(--color-border-tertiary)' : 'none', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500 }}>{item.name}</div>
                    {item.notes && <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', marginTop: '1px' }}>{item.notes}</div>}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.unit}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>{item.par_level} {item.unit}</div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: parseFloat(item.current_stock) === 0 ? '#d0cec6' : 'var(--color-text-primary)' }}>
                    {parseFloat(item.current_stock) > 0 ? `${item.current_stock} ${item.unit}` : '—'}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: st.dot }} />
                    <span style={{ fontSize: '11px', fontWeight: 500, background: st.bg, color: st.text, padding: '2px 8px', borderRadius: '20px' }}>{st.label}</span>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={() => setEditingItem(item)} style={{ fontSize: '11px', color: '#C41E3A', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Edit</button>
                    <button onClick={() => setConfirmDelete(item)} style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', border: 'none', background: 'none', cursor: 'pointer', padding: 0 }}>Remove</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
          <div style={{ background: 'white', borderRadius: '14px', width: '380px', padding: '1.5rem', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 500, marginBottom: '0.5rem' }}>Remove this item?</h3>
            <p style={{ fontSize: '13px', color: 'var(--color-text-secondary)', marginBottom: '1.25rem' }}>
              Remove <strong>{confirmDelete.name}</strong> from your inventory list? This can't be undone.
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { deleteItem.mutate(confirmDelete.id); setConfirmDelete(null); }} style={{ flex: 1, padding: '9px', background: '#C41E3A', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer' }}>
                Remove
              </button>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '9px', borderRadius: '8px', cursor: 'pointer' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {(showAddItem || editingItem) && (
        <ItemModal
          categories={categories}
          item={editingItem || undefined}
          onClose={() => { setShowAddItem(false); setEditingItem(null); }}
        />
      )}
      {showExtract && <ExtractModal categories={categories} onClose={() => setShowExtract(false)} />}
    </div>
  );
}
