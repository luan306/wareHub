import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { useT } from '../i18n';
import { useReconnect } from '../context/ConnectionContext';

// Trường được ghi trong lịch sử -> khoá dịch (field.<tên trường>).
const FIELD_KEYS = ['ma', 'ten', 'loai', 'model', 'producer', 'ip_address', 'cpu', 'ram', 'storage', 'os_name', 'office_name', 'phone_number', 'sim_serial', 'user_name', 'phong_ban', 'ghi_chu', 'registered_at'];

function displayValue(value) {
  return value === null || value === undefined || value === '' ? '—' : value;
}

export function DeviceHistory() {
  const { t, locale } = useT();
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/devices/history', { search, from, to, page, pageSize });
      setRows(data.history);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, from, to, page]);

  useEffect(() => {
    const timer = setTimeout(fetchHistory, 250);
    return () => clearTimeout(timer);
  }, [fetchHistory]);

  useReconnect(fetchHistory);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div>
      <div className="page-head">
        <h2>{t('history.title')}</h2>
      </div>

      <div className="toolbar">
        <input
          placeholder={t('history.search')}
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <label className="inline-label">{t('history.from')}</label>
        <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
        <label className="inline-label">{t('history.to')}</label>
        <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} />
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('history.time')}</th>
            <th>{t('history.code')}</th>
            <th>{t('history.name')}</th>
            <th>{t('history.field')}</th>
            <th>{t('history.oldValue')}</th>
            <th>{t('history.newValue')}</th>
            <th>{t('history.editor')}</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={7} className="empty-row">{t('common.loading')}</td></tr>}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={7} className="empty-row">{t('common.noData')}</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono" data-label={t('history.time')}>{new Date(r.changed_at).toLocaleString(locale)}</td>
              <td className="mono" data-label={t('history.code')}>{r.ma}</td>
              <td data-label={t('history.name')}>{r.ten}</td>
              <td data-label={t('history.field')}>{FIELD_KEYS.includes(r.field_name) ? t(`field.${r.field_name}`) : r.field_name}</td>
              <td data-label={t('history.oldValue')}>{displayValue(r.old_value)}</td>
              <td data-label={t('history.newValue')}>{displayValue(r.new_value)}</td>
              <td data-label={t('history.editor')}>{r.changed_by}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>{t('history.prev')}</button>
        <span>{t('history.page', { page, total: totalPages })}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>{t('history.next')}</button>
      </div>
    </div>
  );
}
