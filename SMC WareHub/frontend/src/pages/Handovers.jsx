import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { HandoverModal, HandoverSheet, AttachmentSheet, buildHandoverData } from '../components/HandoverSheet';
import { Pager } from '../components/Pager';
import { useT } from '../i18n';
import { useReconnect } from '../context/ConnectionContext';
import { printHandoverSheets } from '../utils/printPageSize';

function formatDateTime(value, locale) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(locale, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Handovers() {
  const { isAdmin } = useAuth();
  const { t, locale } = useT();
  const [items, setItems] = useState([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(() => new Map());
  const [openItem, setOpenItem] = useState(null);
  const [printItems, setPrintItems] = useState(null);
  const requestVersion = useRef(0);

  const fetchItems = useCallback(async () => {
    const version = ++requestVersion.current;
    setError('');
    try {
      const data = await api.get('/handovers', { search, page, pageSize });
      if (version !== requestVersion.current) return;
      setItems(data.handovers);
      setTotal(data.total);
      setTotalPages(data.total_pages);
      if (data.handovers.length === 0 && page > data.total_pages) setPage(data.total_pages);
    } catch (err) {
      if (version === requestVersion.current) setError(err.message);
    }
  }, [search, page, pageSize]);

  useEffect(() => {
    const timer = setTimeout(fetchItems, 250);
    return () => clearTimeout(timer);
  }, [fetchItems]);

  useReconnect(fetchItems);

  function toggleOne(item) {
    setSelected((previous) => {
      const next = new Map(previous);
      if (next.has(item.no)) next.delete(item.no); else next.set(item.no, item);
      return next;
    });
  }

  const allOnPageSelected = items.length > 0 && items.every((item) => selected.has(item.no));

  function toggleAll() {
    setSelected((previous) => {
      const next = new Map(previous);
      items.forEach((item) => { if (allOnPageSelected) next.delete(item.no); else next.set(item.no, item); });
      return next;
    });
  }

  async function handleDelete(item) {
    if (!confirm(t('hvp.confirmDelete', { no: item.no, name: item.full_name ? ` (${item.full_name})` : '' }))) return;
    try {
      await api.del(`/handovers/${item.no}`);
      setSelected((previous) => { const next = new Map(previous); next.delete(item.no); return next; });
      fetchItems();
    } catch (err) {
      setError(err.message);
    }
  }

  function printSelected() {
    const chosen = [...selected.values()].sort((a, b) => a.no.localeCompare(b.no, undefined, { numeric: true }));
    if (chosen.length === 0) return;
    flushSync(() => setPrintItems(chosen));
    printHandoverSheets(() => setPrintItems(null));
  }

  return (
    <div>
      <div className="page-head manage-head">
        <h2>{t('hvp.title')}</h2>
        <div className="manage-actions">
          <button className="btn-primary" type="button" onClick={printSelected} disabled={selected.size === 0}>
            {selected.size > 0 ? t('hvp.printSelected', { count: selected.size }) : t('hvp.printSelectedNone')}
          </button>
          {selected.size > 0 && <button className="btn-secondary" type="button" onClick={() => setSelected(new Map())}>{t('hvp.clearSelection')}</button>}
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder={t('hvp.search')}
          value={search}
          onChange={(event) => { setPage(1); setSearch(event.target.value); }}
        />
      </div>
      {error && <div className="error-box">{error}</div>}

      <div className="inventory-table-wrap">
        <table className="data-table inventory-table">
          <thead>
            <tr>
              <th><input type="checkbox" checked={allOnPageSelected} onChange={toggleAll} /></th>
              <th className="action-col">{t('hvp.col.action')}</th>
              <th>{t('hvp.col.no')}</th>
              <th>{t('hvp.col.date')}</th>
              <th>{t('hvp.col.name')}</th>
              <th>{t('hvp.col.employeeId')}</th>
              <th>{t('hvp.col.department')}</th>
              <th>{t('hvp.col.computer')}</th>
              <th>{t('hvp.col.serial')}</th>
              <th>{t('hvp.col.model')}</th>
              <th>{t('hvp.col.by')}</th>
              <th>{t('hvp.col.savedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.no}>
                <td><input type="checkbox" checked={selected.has(item.no)} onChange={() => toggleOne(item)} /></td>
                <td className="action-col">
                  <div className="row-actions">
                    <button type="button" className="print-now-action" onClick={() => setOpenItem(item)}>{t('hvp.openReprint')}</button>
                    {isAdmin && <button type="button" onClick={() => handleDelete(item)}>{t('common.delete')}</button>}
                  </div>
                </td>
                <td className="mono" data-label={t('hvp.col.no')}>{item.no}</td>
                <td data-label={t('hvp.col.date')}>{item.data?.register_date || '—'}</td>
                <td data-label={t('hvp.col.name')}>{item.full_name || '—'}</td>
                <td data-label={t('hvp.col.employeeId')}>{item.data?.employee_id || '—'}</td>
                <td data-label={t('hvp.col.department')}>{item.data?.department || '—'}</td>
                <td data-label={t('hvp.col.computer')}>{item.data?.computer_name || '—'}</td>
                <td className="mono" data-label={t('hvp.col.serial')}>{item.device_ma || item.data?.service_tag || '—'}</td>
                <td data-label={t('hvp.col.model')}>{item.data?.model || '—'}</td>
                <td data-label={t('hvp.col.by')}>{item.printed_by || '—'}</td>
                <td data-label={t('hvp.col.savedAt')}>{formatDateTime(item.created_at, locale)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan="12" className="hv-empty-row">{search ? t('hvp.emptySearch') : t('hvp.empty')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageSize={pageSize} total={total} totalPages={totalPages} unit={t('unit.slips')} onPage={setPage} onPageSize={(size) => { setPage(1); setPageSize(size); }} />

      {openItem && (
        <HandoverModal key={openItem.no} saved={openItem} onClose={() => { setOpenItem(null); fetchItems(); }} />
      )}

      {printItems && createPortal(
        <div className="handover-print-root">
          {printItems.map((item) => {
            const sheetData = { ...buildHandoverData({}), ...(item.data || {}), no: item.no };
            return (
              <Fragment key={item.no}>
                <HandoverSheet data={sheetData} />
                {(sheetData.attachments || []).length > 0 && <AttachmentSheet data={sheetData} />}
              </Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
