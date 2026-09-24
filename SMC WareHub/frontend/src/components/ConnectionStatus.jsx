import { useAuth } from '../context/AuthContext';
import { useConnection } from '../context/ConnectionContext';
import { translateServerMessage, useT } from '../i18n';

// Thanh cảnh báo mất mạng, thông báo "đã kết nối lại", gợi ý tải lại khi có phiên bản mới,
// và màn hình chắn khi không tới được máy chủ / máy chủ đang bảo trì.
export function ConnectionStatus() {
  const { t, locale } = useT();
  const { user } = useAuth();
  const { status, maintenance, notice, newVersion, checking, retryNow, loginNotice, dismissMaintenance } = useConnection();

  const blocking = status === 'unreachable' || status === 'maintenance';
  const until = maintenance?.until ? new Date(maintenance.until) : null;
  const untilText = until && !Number.isNaN(until.getTime())
    ? until.toLocaleString(locale, { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })
    : '';

  return (
    <>
      {status === 'offline' && (
        <div className="conn-banner conn-offline" role="alert">
          <span className="conn-dot" /> {t('conn.offlineBanner')}
        </div>
      )}
      {status === 'ok' && !user && loginNotice && (
        <div className="conn-banner conn-maint" role="status">
          {translateServerMessage(loginNotice.message) || t('conn.maintenanceText')} {t('conn.adminOnly')}
        </div>
      )}
      {status === 'ok' && notice && (
        <div className="conn-banner conn-ok" role="status">{t('conn.reconnected')}</div>
      )}
      {status === 'ok' && !notice && newVersion && (
        <div className="conn-banner conn-info" role="status">
          {t('conn.newVersion')}
          <button type="button" onClick={() => window.location.reload()}>{t('conn.reload')}</button>
        </div>
      )}
      {blocking && (
        <div className="conn-overlay" role="alertdialog" aria-live="assertive" aria-labelledby="conn-title">
          <div className="conn-card">
            <div className="conn-spinner" aria-hidden="true" />
            <h2 id="conn-title">{status === 'maintenance' ? t('conn.maintenanceTitle') : t('conn.unreachableTitle')}</h2>
            <p>{status === 'maintenance' ? translateServerMessage(maintenance?.message) || t('conn.maintenanceText') : t('conn.unreachableText')}</p>
            {status === 'maintenance' && untilText && <p className="conn-until">{t('conn.maintenanceUntil', { time: untilText })}</p>}
            <div className="conn-actions">
              <span>{t('conn.retrying')}</span>
              <button type="button" className="btn-primary" onClick={retryNow} disabled={checking}>{t('conn.retryNow')}</button>
              {status === 'maintenance' && !user && (
                <button type="button" className="conn-link" onClick={dismissMaintenance}>{t('conn.adminLogin')}</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
