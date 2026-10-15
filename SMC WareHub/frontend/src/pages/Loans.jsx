import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { LoanModal, formatDateTimeDisplay } from '../components/LoanSheet';
import { Pager } from '../components/Pager';
import { useT } from '../i18n';
import { useReconnect } from '../context/ConnectionContext';

const STATUS_TABS = [['', 'lp.allStatus'], ['borrowed', 'lp.statusBorrowed'], ['overdue', 'lp.statusOverdue'], ['returned', 'lp.statusReturned']];

function StatusBadge({ status }) {
  const { t } = useT();
  const labelKey = status === 'overdue' ? 'lp.statusOverdue' : status === 'returned' ? 'lp.statusReturned' : 'lp.statusBorrowed';
  return <span className={`loan-status loan-status-${status}`}>{t(labelKey)}</span>;
}

export function Loans() {
  const { isAdmin } = useAuth();
  const { t, locale } = useT();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [openItem, setOpenItem] = useState(null);
  const [creating, setCreating] = useState(false);
  const [counts, setCounts] = useState({ borrowed: 0, overdue: 0, returned: 0 });
  const [exporting, setExporting] = useState(false);
  const requestVersion = useRef(0);

  const fetchItems = useCallback(async () => {
    const version = ++requestVersion.current;
    setError('');
    try {
      const data = await api.get('/loans', { search, status: status || undefined, page, pageSize });
      if (version !== requestVersion.current) return;
      setItems(data.loans);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      if (data.loans.length === 0 && page > data.total_pages) setPage(data.total_pages);
    } catch (err) {
      if (version === requestVersion.current) setError(err.message);
    }
  }, [search, status, page, pageSize]);

  const fetchCounts = useCallback(async () => {
    try {
      const [borrowed, overdue, returned] = await Promise.all([
        api.get('/loans', { search, status: 'borrowed', pageSize: 1 }),
        api.get('/loans', { search, status: 'overdue', pageSize: 1 }),
        api.get('/loans', { search, status: 'returned', pageSize: 1 }),
      ]);
      setCounts({ borrowed: borrowed.total, overdue: overdue.total, returned: returned.total });
    } catch {}
  }, [search]);

  const refresh = useCallback(() => { fetchItems(); fetchCounts(); }, [fetchItems, fetchCounts]);

  useEffect(() => {
    const timer = setTimeout(refresh, 250);
    return () => clearTimeout(timer);
  }, [refresh]);

  useReconnect(refresh);

  async function handleMarkReturned(item) {
    if (!confirm(t('lp.confirmReturn', { no: item.no }))) return;
    try {
      await api.put(`/loans/${item.id}/return`, {});
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleDelete(item) {
    if (!confirm(t('lp.confirmDelete', { no: item.no, name: item.borrower_name }))) return;
    try {
      await api.del(`/loans/${item.id}`);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  function selectStatus(value) { setPage(1); setStatus(value); }

  async function exportLoans() {
    setExporting(true);
    setError('');
    try {
      const CONCURRENCY = 6;
      const first = await api.get('/loans', { search, status: status || undefined, page: 1, pageSize: 100 });
      const pages = [first.loans];
      const remaining = Array.from({ length: first.total_pages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < remaining.length; i += CONCURRENCY) {
        const batch = remaining.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((p) => api.get('/loans', { search, status: status || undefined, page: p, pageSize: 100 })));
        results.forEach((data) => { pages[data.page - 1] = data.loans; });
      }
      const all = pages.flat();

      const headers = [
        t('lp.col.no'), t('lp.col.borrower'), t('loan.f.employee_id'), t('lp.col.department'), t('loan.f.cost_center'),
        t('lp.col.devices'), t('lp.col.borrowedAt'), t('lp.col.dueAt'), t('lp.col.returnedAt'), t('lp.col.status'),
        t('lp.col.notes'), t('lp.col.by'), t('lp.col.savedAt'),
      ];
      const rows = all.map((item) => [
        item.no, item.borrower_name, item.employee_id || '', item.department || '', item.cost_center || '',
        deviceSummary(item), formatDateTimeDisplay(item.borrowed_at), item.due_at ? formatDateTimeDisplay(item.due_at) : '',
        item.returned_at ? formatDateTimeDisplay(item.returned_at) : '', t(item.status === 'overdue' ? 'lp.statusOverdue' : item.status === 'returned' ? 'lp.statusReturned' : 'lp.statusBorrowed'),
        item.data?.notes || '', item.created_by_name || '', formatDateTimeDisplay(item.created_at),
      ]);
      const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
      link.download = 'warehub-loans.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  function deviceSummary(item) {
    const devices = item.data?.devices || [];
    if (devices.length === 0) return '—';
    const names = devices.map((d) => d.ma || d.ten).join(', ');
    return names;
  }

  return (
    <div>
      <div className="page-head manage-head">
        <h2>{t('lp.title')}</h2>
        <div className="manage-actions">
          <button className="btn-secondary" type="button" onClick={exportLoans} disabled={exporting}>{exporting ? t('lp.exporting') : t('lp.export')}</button>
          <button className="btn-primary" type="button" onClick={() => setCreating(true)}>{t('lp.newSlip')}</button>
        </div>
      </div>

      <div className="loan-stats-row">
        <button type="button" className={`loan-stat loan-status-borrowed ${status === 'borrowed' ? 'active' : ''}`} onClick={() => selectStatus('borrowed')}>
          <b>{counts.borrowed}</b><span>{t('lp.statusBorrowed')}</span>
        </button>
        <button type="button" className={`loan-stat loan-status-overdue ${status === 'overdue' ? 'active' : ''}`} onClick={() => selectStatus('overdue')}>
          <b>{counts.overdue}</b><span>{t('lp.statusOverdue')}</span>
        </button>
        <button type="button" className={`loan-stat loan-status-returned ${status === 'returned' ? 'active' : ''}`} onClick={() => selectStatus('returned')}>
          <b>{counts.returned}</b><span>{t('lp.statusReturned')}</span>
        </button>
      </div>

      <div className="toolbar">
        <input
          placeholder={t('lp.search')}
          value={search}
          onChange={(event) => { setPage(1); setSearch(event.target.value); }}
        />
        <div className="hv-kind-tabs" role="group" aria-label={t('lp.allStatus')}>
          {STATUS_TABS.map(([value, key]) => (
            <button key={value || 'all'} type="button" className={status === value ? 'active' : ''} onClick={() => selectStatus(value)}>
              {t(key)}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}

      <div className="inventory-table-wrap">
        <table className="data-table inventory-table">
          <thead>
            <tr>
              <th className="action-col loan-action-col">{t('lp.col.action')}</th>
              <th>{t('lp.col.no')}</th>
              <th>{t('lp.col.borrower')}</th>
              <th>{t('lp.col.department')}</th>
              <th>{t('lp.col.devices')}</th>
              <th>{t('lp.col.borrowedAt')}</th>
              <th>{t('lp.col.dueAt')}</th>
              <th>{t('lp.col.status')}</th>
              <th>{t('lp.col.by')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={item.status === 'overdue' ? 'loan-row-overdue' : undefined}>
                <td className="action-col loan-action-col">
                  <div className="row-actions">
                    <button type="button" className="print-now-action" onClick={() => setOpenItem(item)}>{t('lp.openView')}</button>
                    {item.status !== 'returned' && <button type="button" onClick={() => handleMarkReturned(item)}>{t('lp.markReturned')}</button>}
                    {isAdmin && <button type="button" onClick={() => handleDelete(item)}>{t('common.delete')}</button>}
                  </div>
                </td>
                <td className="mono" data-label={t('lp.col.no')}>{item.no}</td>
                <td data-label={t('lp.col.borrower')}>{item.borrower_name}</td>
                <td data-label={t('lp.col.department')}>{item.department || '—'}</td>
                <td className="mono" data-label={t('lp.col.devices')}>{deviceSummary(item)}</td>
                <td data-label={t('lp.col.borrowedAt')}>{formatDateTimeDisplay(item.borrowed_at)}</td>
                <td data-label={t('lp.col.dueAt')}>{item.due_at ? formatDateTimeDisplay(item.due_at) : '—'}</td>
                <td data-label={t('lp.col.status')}><StatusBadge status={item.status} /></td>
                <td data-label={t('lp.col.by')}>{item.created_by_name || '—'}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan="9" className="hv-empty-row">{search ? t('lp.emptySearch') : t('lp.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageSize={pageSize} total={total} totalPages={totalPages} unit={t('unit.slips')} onPage={setPage} onPageSize={(size) => { setPage(1); setPageSize(size); }} />

      {openItem && (
        <LoanModal key={openItem.id} saved={openItem} onClose={() => { setOpenItem(null); refresh(); }} />
      )}
      {creating && (
        <LoanModal onClose={() => { setCreating(false); refresh(); }} />
      )}
    </div>
  );
}
