import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { useT } from '../i18n';

// Dành cho quản trị viên: bật/tắt chế độ bảo trì khi cập nhật code. Khi bật, người dùng khác thấy màn hình
// "đang bảo trì"; admin vẫn dùng bình thường và thấy thanh nhắc ở đầu trang để nhớ tắt sau khi cập nhật xong.
export function MaintenanceControl() {
  const { isAdmin } = useAuth();
  const { t } = useT();
  const { maintenanceInfo, setMaintenance } = useConnection();
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!isAdmin) return null;
  const on = Boolean(maintenanceInfo);

  async function apply(enabled) {
    setBusy(true);
    setError('');
    try {
      await setMaintenance(enabled, message.trim(), until ? new Date(until).toISOString() : null);
      setOpen(false);
      setMessage('');
      setUntil('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    if (on) {
      if (confirm(t('maint.confirmOff'))) apply(false);
    } else {
      setError('');
      setOpen(true);
    }
  }

  return (
    <>
      <button
        type="button"
        className={`maint-toggle${on ? ' on' : ''}`}
        onClick={toggle}
        aria-pressed={on}
        aria-label={on ? t('maint.buttonOff') : t('maint.buttonOn')}
        title={on ? t('maint.buttonOff') : t('maint.buttonOn')}
      >🛠</button>

      {on && (
        <div className="conn-banner conn-maint" role="status">
          {t('maint.banner')}
          <button type="button" onClick={toggle} disabled={busy}>{t('maint.turnOff')}</button>
        </div>
      )}

      {open && (
        <div className="modal-backdrop" onClick={() => setOpen(false)}>
          <form className="modal-card" onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); apply(true); }}>
            <h3>{t('maint.modalTitle')}</h3>
            <p className="maint-help">{t('maint.help')}</p>
            <label htmlFor="maint-message">{t('maint.message')}</label>
            <input id="maint-message" value={message} maxLength={300} placeholder={t('maint.messagePlaceholder')} onChange={(event) => setMessage(event.target.value)} autoFocus />
            <label htmlFor="maint-until">{t('maint.until')}</label>
            <input id="maint-until" type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} />
            {error && <div className="error-box">{error}</div>}
            <div className="modal-actions">
              <button type="button" onClick={() => setOpen(false)}>{t('common.cancel')}</button>
              <button type="submit" className="btn-primary" disabled={busy}>{t('maint.confirmOn')}</button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
