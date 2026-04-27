import React from 'react';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false, onConfirm, onCancel }: Props) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div style={{ background: 'white', borderRadius: '14px', width: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }}>
        <div style={{ padding: '1.5rem 1.5rem 1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 500, margin: 0 }}>{title}</h3>
            <button onClick={onCancel} style={{ border: 'none', background: 'none', fontSize: '18px', color: '#999', cursor: 'pointer', lineHeight: 1, padding: '0 0 0 8px' }}>×</button>
          </div>
          <p style={{ fontSize: '13px', color: '#5f5e5a', lineHeight: 1.5 }}>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', padding: '1rem 1.5rem 1.5rem' }}>
          <button
            onClick={onConfirm}
            style={{ flex: 1, background: danger ? '#C41E3A' : '#1a1a18', color: 'white', border: 'none', borderRadius: '8px', padding: '9px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            style={{ flex: 1, background: 'transparent', border: '0.5px solid #e0e0d8', borderRadius: '8px', padding: '9px', fontSize: '13px', cursor: 'pointer' }}
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
