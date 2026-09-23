import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { HandoverModal, HandoverSheet, AttachmentSheet, buildHandoverData } from '../components/HandoverSheet';
import { Pager } from '../components/Pager';
import { setPrintPageSize, HANDOVER_PAGE_CSS } from '../utils/printPageSize';

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Handovers() {
  const { isAdmin } = useAuth();
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
    if (!confirm(`Xoá phiếu ${item.no}${item.full_name ? ` (${item.full_name})` : ''}? Không thể khôi phục.`)) return;
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
    const cleanup = () => {
      document.body.classList.remove('printing-handover');
      window.removeEventListener('afterprint', cleanup);
      setPrintItems(null);
    };
    document.body.classList.add('printing-handover');
    window.addEventListener('afterprint', cleanup);
    setPrintPageSize(HANDOVER_PAGE_CSS);
    window.print();
  }

  return (
    <div>
      <div className="page-head manage-head">
        <h2>Phiếu bàn giao</h2>
        <div className="manage-actions">
          <button className="btn-primary" type="button" onClick={printSelected} disabled={selected.size === 0}>
            {selected.size > 0 ? `In ${selected.size} phiếu đã chọn` : 'In phiếu đã chọn'}
          </button>
          {selected.size > 0 && <button className="btn-secondary" type="button" onClick={() => setSelected(new Map())}>Bỏ chọn</button>}
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Tìm theo số phiếu, họ tên, serial, model, tên máy..."
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
              <th className="action-col">Action</th>
              <th>Số phiếu</th>
              <th>Ngày lập</th>
              <th>Họ tên</th>
              <th>Mã NV</th>
              <th>Bộ phận</th>
              <th>Computer name</th>
              <th>Serial</th>
              <th>Model</th>
              <th>Người lập</th>
              <th>Lưu lúc</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.no}>
                <td><input type="checkbox" checked={selected.has(item.no)} onChange={() => toggleOne(item)} /></td>
                <td className="action-col">
                  <div className="row-actions">
                    <button type="button" className="print-now-action" onClick={() => setOpenItem(item)}>Mở / In lại</button>
                    {isAdmin && <button type="button" onClick={() => handleDelete(item)}>Xoá</button>}
                  </div>
                </td>
                <td className="mono">{item.no}</td>
                <td>{item.data?.register_date || '—'}</td>
                <td>{item.full_name || '—'}</td>
                <td>{item.data?.employee_id || '—'}</td>
                <td>{item.data?.department || '—'}</td>
                <td>{item.data?.computer_name || '—'}</td>
                <td className="mono">{item.device_ma || item.data?.service_tag || '—'}</td>
                <td>{item.data?.model || '—'}</td>
                <td>{item.printed_by || '—'}</td>
                <td>{formatDateTime(item.created_at)}</td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan="12" className="hv-empty-row">{search ? 'Không có phiếu nào khớp tìm kiếm.' : 'Chưa có phiếu bàn giao nào. Vào trang Thiết bị, bấm "Phiếu BG" ở một thiết bị để tạo phiếu.'}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <Pager page={page} pageSize={pageSize} total={total} totalPages={totalPages} unit="phiếu" onPage={setPage} onPageSize={(size) => { setPage(1); setPageSize(size); }} />

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
