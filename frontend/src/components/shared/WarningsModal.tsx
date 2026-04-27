import React from 'react';
import { format, parseISO } from 'date-fns';

interface Warning {
  date: string;
  shift_name: string;
  level: 'understaffed' | 'overstaffed';
  message: string;
}

interface Props {
  warnings: Warning[];
  onClose: () => void;
}

function friendlyDate(dateStr: string) {
  try {
    return format(parseISO(dateStr), 'EEEE d MMM');
  } catch {
    return dateStr;
  }
}

export function WarningsModal({ warnings, onClose }: Props) {
  const understaffed = warnings.filter(w => w.level === 'understaffed');
  const overstaffed = warnings.filter(w => w.level === 'overstaffed');

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }}>
      <div style={{ background: 'white', borderRadius: '16px', width: '520px', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
        {/* Header — always visible */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.25rem 1.5rem', borderBottom: '0.5px solid #eee', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 500, margin: 0 }}>Staffing warnings ({warnings.length})</h3>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '2px' }}>Review and resolve before publishing the rota</p>
          </div>
          <button
            onClick={onClose}
            style={{ width: '32px', height: '32px', borderRadius: '50%', border: '0.5px solid #e0e0d8', background: '#f7f6f3', cursor: 'pointer', fontSize: '16px', color: '#555', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
          >
            ×
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ overflowY: 'auto', padding: '1.25rem 1.5rem', flex: 1 }}>
          {understaffed.length > 0 && (
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9e1830', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C41E3A', display: 'inline-block' }} />
                Understaffed ({understaffed.length})
              </div>
              {understaffed.map((w, i) => (
                <div key={i} style={{ background: '#fde8ec', border: '0.5px solid #f5b8c4', borderRadius: '8px', padding: '10px 14px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#9e1830', marginBottom: '2px' }}>
                        {w.shift_name} · {friendlyDate(w.date)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#b84a5e' }}>{w.message}</div>
                    </div>
                    <span style={{ fontSize: '10px', background: '#fde8ec', border: '0.5px solid #f5b8c4', color: '#9e1830', padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap', marginTop: '1px', fontWeight: 500 }}>
                      understaffed
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {overstaffed.length > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#633806', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#C9973A', display: 'inline-block' }} />
                Overstaffed — cost risk ({overstaffed.length})
              </div>
              {overstaffed.map((w, i) => (
                <div key={i} style={{ background: '#faeeda', border: '0.5px solid #ef9f27', borderRadius: '8px', padding: '10px 14px', marginBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 500, color: '#633806', marginBottom: '2px' }}>
                        {w.shift_name} · {friendlyDate(w.date)}
                      </div>
                      <div style={{ fontSize: '12px', color: '#854f0b' }}>{w.message}</div>
                    </div>
                    <span style={{ fontSize: '10px', background: '#faeeda', border: '0.5px solid #ef9f27', color: '#633806', padding: '2px 8px', borderRadius: '20px', whiteSpace: 'nowrap', marginTop: '1px', fontWeight: 500 }}>
                      overstaffed
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '1rem 1.5rem', borderTop: '0.5px solid #eee', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ width: '100%', background: '#C41E3A', color: 'white', border: 'none', borderRadius: '8px', padding: '10px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
