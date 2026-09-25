import { useEffect, useState, useCallback, useRef } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePrintQueue } from '../context/PrintQueueContext';
import { LabelPreview, PrintLabelModal } from '../components/LabelPreview';
import { HandoverModal, HandoverSheet, buildHandoverData, mergeSpecs } from '../components/HandoverSheet';
import { Pager } from '../components/Pager';
import { setPrintPageSize, labelPageCss, printHandoverSheets, printWithBodyClass } from '../utils/printPageSize';
import { LOAI_LABELS } from '../utils/deviceTypes';
import { useT, translateServerMessage } from '../i18n';
import { useReconnect } from '../context/ConnectionContext';

const emptyForm = { id: null, source_id: null, original_ma: '', ma: '', ten: '', loai: 'laptop', model: '', producer: '', ip_address: '', cpu: '', ram: '', storage: '', os_name: '', office_name: '', phone_number: '', sim_serial: '', is_active: false, user_name: '', registered_at: '', phong_ban: '', ghi_chu: '' };

// Cột của bảng thiết bị — bấm chuột phải vào tiêu đề bảng để tick ẩn/hiện từng cột.
const COLUMN_DEFS = [
  { key: 'ma', labelKey: 'field.ma', className: 'mono', cell: (d) => d.ma },
  { key: 'model', labelKey: 'field.model', cell: (d) => d.model || '—' },
  { key: 'producer', labelKey: 'field.producer', cell: (d) => d.producer || '—' },
  { key: 'loai', labelKey: 'field.loai', cell: (d, t) => t(`loai.${d.loai}`) },
  { key: 'ten', labelKey: 'field.ten', cell: (d) => d.ten },
  { key: 'user_name', labelKey: 'field.user_name', cell: (d) => d.user_name || '—' },
  { key: 'phong_ban', labelKey: 'field.phong_ban', cell: (d) => d.phong_ban || '—' },
  { key: 'ip_address', labelKey: 'field.ip_address', cell: (d) => d.ip_address || '—' },
  { key: 'cpu', labelKey: 'field.cpu', defaultHidden: true, cell: (d) => d.cpu || '—' },
  { key: 'ram', labelKey: 'field.ram', defaultHidden: true, cell: (d) => d.ram || '—' },
  { key: 'storage', labelKey: 'field.storage', defaultHidden: true, cell: (d) => d.storage || '—' },
  { key: 'os_name', labelKey: 'field.os_name', defaultHidden: true, cell: (d) => d.os_name || '—' },
  { key: 'office_name', labelKey: 'field.office_name', defaultHidden: true, cell: (d) => d.office_name || '—' },
  { key: 'phone_number', labelKey: 'field.phone_number', defaultHidden: true, cell: (d) => d.phone_number || '—' },
  { key: 'sim_serial', labelKey: 'field.sim_serial', defaultHidden: true, cell: (d) => d.sim_serial || '—' },
  { key: 'ghi_chu', labelKey: 'field.ghi_chu', cell: (d) => d.ghi_chu || '—' },
  { key: 'registered_at', labelKey: 'field.date', cell: (d) => (d.registered_at ? d.registered_at.slice(0, 10) : '—') },
];
const COLUMN_STORAGE_KEY = 'warehub-devices-columns';

function loadColumnVisibility() {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMN_STORAGE_KEY) || '{}');
    return Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, saved[c.key] === undefined ? !c.defaultHidden : saved[c.key] !== false]));
  } catch {
    return Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, !c.defaultHidden]));
  }
}

// Khớp giới hạn deviceIds tối đa của endpoint POST /print ở backend — chặn sớm ở đây
// để tránh render hàng trăm/nghìn tem cùng lúc làm treo trình duyệt trước khi kịp báo lỗi.
const MAX_PRINT_BATCH = 500;
const LOAI_KEYS = Object.keys(LOAI_LABELS);

const toggleInSet = (set, id) => {
  const next = new Set(set);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
};

// Các trường của form thiết bị lấy từ 1 thiết bị (dùng chung cho Sửa và Clone).
const deviceToFormFields = (device) => ({
  ma: device.ma,
  ten: device.ten || '',
  loai: device.loai || 'laptop',
  model: device.model || '',
  producer: device.producer || '',
  ip_address: device.ip_address || '',
  cpu: device.cpu || '',
  ram: device.ram || '',
  storage: device.storage || '',
  os_name: device.os_name || '',
  office_name: device.office_name || '',
  phone_number: device.phone_number || '',
  sim_serial: device.sim_serial || '',
  user_name: device.user_name || '',
  registered_at: device.registered_at ? device.registered_at.slice(0, 10) : '',
  phong_ban: device.phong_ban || '',
  ghi_chu: device.ghi_chu || '',
});

export function Devices() {
  const { isAdmin } = useAuth();
  const { t } = useT();
  const { queue, addDevices, removeDevice, clearQueue } = usePrintQueue();

  const [devices, setDevices] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [loaiFilter, setLoaiFilter] = useState('');
  const [sort, setSort] = useState({ by: null, dir: 'asc' });
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [printListOpen, setPrintListOpen] = useState(false);
  const [labelReviewOpen, setLabelReviewOpen] = useState(false);
  const [printListSelection, setPrintListSelection] = useState(new Set());
  const [addedNotice, setAddedNotice] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [printingId, setPrintingId] = useState(null);
  const [queuePrinting, setQueuePrinting] = useState(false);
  const [instantPrintDevice, setInstantPrintDevice] = useState(null);
  const [handoverDevice, setHandoverDevice] = useState(null);
  const [bulkHandoverBusy, setBulkHandoverBusy] = useState(false);
  const [bulkHandoverItems, setBulkHandoverItems] = useState(null);
  const [columnVisibility, setColumnVisibility] = useState(loadColumnVisibility);
  const [columnMenu, setColumnMenu] = useState(null);
  const columnMenuRef = useRef(null);
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [khoConflict, setKhoConflict] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [syncingGlpi, setSyncingGlpi] = useState(false);
  const requestVersion = useRef(0);

  const fetchDevices = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/devices', { search, loai: loaiFilter, page, pageSize, sortBy: sort.by || undefined, sortDir: sort.by ? sort.dir : undefined });
      if (version !== requestVersion.current) return;
      setDevices(data.devices);
      setTotalPages(data.total_pages);
      setTotal(data.total);
      if (data.devices.length === 0 && page > data.total_pages) setPage(data.total_pages);
    } catch (err) {
      if (version === requestVersion.current) setError(err.message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [search, loaiFilter, page, pageSize, sort]);

  useEffect(() => {
    const timer = setTimeout(fetchDevices, 250); // debounce khi gõ tìm kiếm
    return () => clearTimeout(timer);
  }, [fetchDevices]);

  useReconnect(fetchDevices);

  useEffect(() => {
    try { localStorage.setItem(COLUMN_STORAGE_KEY, JSON.stringify(columnVisibility)); } catch { /* bỏ qua */ }
  }, [columnVisibility]);

  useEffect(() => {
    if (!columnMenu) return undefined;
    const close = (event) => {
      if (columnMenuRef.current && columnMenuRef.current.contains(event.target)) return;
      setColumnMenu(null);
    };
    const onKey = (event) => { if (event.key === 'Escape') setColumnMenu(null); };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [columnMenu]);

  function openColumnMenu(event) {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 220;
    const x = Math.min(event.clientX, window.innerWidth - menuWidth - 12);
    setColumnMenu({ x, y: event.clientY });
  }

  function toggleColumn(key) {
    setColumnVisibility((previous) => ({ ...previous, [key]: !previous[key] }));
  }

  const visibleColumns = COLUMN_DEFS.filter((c) => columnVisibility[c.key]);

  function toggleSort(key) {
    setPage(1);
    setSort((current) => (current.by === key ? { by: key, dir: current.dir === 'asc' ? 'desc' : 'asc' } : { by: key, dir: 'asc' }));
  }

  function toggleSelect(id) {
    setSelected((prev) => toggleInSet(prev, id));
  }

  function toggleSelectAll() {
    const allOnPageSelected = devices.length > 0 && devices.every((d) => selected.has(d.id));
    setSelected((prev) => {
      const next = new Set(prev);
      devices.forEach((d) => (allOnPageSelected ? next.delete(d.id) : next.add(d.id)));
      return next;
    });
  }

  function handleAddToQueue() {
    const chosen = devices.filter((d) => selected.has(d.id));
    addDevices(chosen);
    setSelected(new Set());
  }

  function openPrintListModal() {
    if (selected.size === 0 && queue.length === 0) return;
    setError('');
    setAddedNotice('');
    setPrintListSelection(new Set(selected));
    setLabelReviewOpen(selected.size === 0);
    setPrintListOpen(true);
  }

  function closePrintListModal() {
    setError('');
    setPrintListOpen(false);
    setLabelReviewOpen(false);
  }

  function togglePrintListItem(id) {
    setPrintListSelection((previous) => toggleInSet(previous, id));
  }

  function deleteSelectedPrintItems() {
    setSelected((previous) => {
      const next = new Set(previous);
      printListSelection.forEach((id) => next.delete(id));
      return next;
    });
    setPrintListSelection(new Set());
  }

  function commitReview(incoming) {
    setError('');
    // Báo đúng số thiết bị thực sự được thêm: thiết bị đã có trong hàng đợi không thêm lần nữa.
    const inQueue = new Set(queue.map((d) => d.id));
    const added = incoming.filter((d) => !inQueue.has(d.id)).length;
    const already = incoming.length - added;
    setAddedNotice([added > 0 ? t('dev.queueAdded', { count: added }) : '', already > 0 ? t('dev.queueAlready', { count: already }) : ''].filter(Boolean).join(' '));
    addDevices(incoming);
    setSelected((previous) => {
      const next = new Set(previous);
      printListSelection.forEach((id) => next.delete(id));
      return next;
    });
    setPrintListSelection(new Set());
    setLabelReviewOpen(true);
  }

  function reviewPrintList() {
    const incoming = devices.filter((device) => printListSelection.has(device.id));

    // Mã QR chứa Serial Number (Mã thiết bị): thiết bị không có serial thì không tạo được QR, phải báo cho người dùng biết.
    const noSerial = incoming.filter((device) => !device.ma?.trim());
    if (noSerial.length > 0) {
      setError(t('dev.noSerial', { count: noSerial.length, names: noSerial.slice(0, 5).map((d) => d.ten || `#${d.id}`).join(', ') }));
      return;
    }

    if (incoming.length > MAX_PRINT_BATCH) {
      setError(t('dev.printTooMany', { max: MAX_PRINT_BATCH, count: incoming.length }));
      return;
    }

    if (new Set(incoming.map((d) => d.kho)).size > 1) {
      setError(t('dev.mixedKho'));
      return;
    }

    const queueKho = queue[0]?.kho;
    const incomingKho = incoming[0]?.kho;
    if (queueKho && incomingKho && queueKho !== incomingKho) {
      setKhoConflict({ queueKho, incomingKho, queueCount: queue.length, incoming });
      return;
    }

    if (queue.length + incoming.length > MAX_PRINT_BATCH) {
      setError(t('dev.queueTooMany', { queue: queue.length, incoming: incoming.length, max: MAX_PRINT_BATCH }));
      return;
    }

    commitReview(incoming);
  }

  function confirmKhoSwap() {
    if (!khoConflict) return;
    clearQueue();
    commitReview(khoConflict.incoming);
    setKhoConflict(null);
  }

  async function handlePrintQueue() {
    setError('');
    setQueuePrinting(true);
    try {
      await api.post('/print', { deviceIds: queue.map((device) => device.id) });
      setPrintPageSize(labelPageCss(queue[0]?.kho));
      printWithBodyClass('printing-labels');
      clearQueue();
      closePrintListModal();
    } catch (err) {
      setError(err.message);
    } finally {
      setQueuePrinting(false);
    }
  }

  async function exportInventory() {
    setExporting(true);
    setError('');
    try {
      // Kéo toàn bộ thiết bị khớp bộ lọc hiện tại qua từng trang (không chỉ trang đang xem),
      // để export đúng nghĩa "toàn bộ kho" kể cả khi có hàng nghìn thiết bị. Lấy trang đầu để biết
      // tổng số trang, rồi tải các trang còn lại song song (giới hạn số lượt cùng lúc) thay vì
      // tuần tự từng trang một — nhanh hơn nhiều lần khi dữ liệu lớn.
      const CONCURRENCY = 6;
      const first = await api.get('/devices', { search, loai: loaiFilter, page: 1, pageSize: 100 });
      const pages = [first.devices];
      const remaining = Array.from({ length: first.total_pages - 1 }, (_, i) => i + 2);
      for (let i = 0; i < remaining.length; i += CONCURRENCY) {
        const batch = remaining.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((p) => api.get('/devices', { search, loai: loaiFilter, page: p, pageSize: 100 })));
        results.forEach((data) => { pages[data.page - 1] = data.devices; });
      }
      const all = pages.flat();

      const headers = ['ma', 'model', 'producer', 'loai', 'ten', 'user_name', 'phong_ban', 'ip_address', 'ghi_chu', 'date'].map((key) => t(`field.${key}`));
      const rows = all.map((device) => [device.ma, device.model || '', device.producer || '', LOAI_LABELS[device.loai] ? t(`loai.${device.loai}`) : device.loai, device.ten, device.user_name || '', device.phong_ban || '', device.ip_address || '', device.ghi_chu || '', device.registered_at ? device.registered_at.slice(0, 10) : '']);
      const csv = [headers, ...rows].map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
      link.download = 'warehub-inventory.csv';
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  }

  async function syncFromGlpi() {
    if (!confirm(t('dev.confirmSync'))) return;
    setSyncingGlpi(true);
    setError('');
    try {
      const result = await api.post('/devices/glpi-sync', {});
      const lines = [
        t('dev.syncDone', { created: result.created, updated: result.updated, unchanged: result.unchanged }),
        t('dev.syncFetched', { computers: result.computers, phones: result.phones }),
      ];
      if (result.skipped) lines.push(t('dev.syncSkipped', { count: result.skipped }));
      if (result.skipped_names?.length > 0) lines.push(t('dev.syncSkippedNames', { names: result.skipped_names.join(', '), more: result.skipped > result.skipped_names.length ? '…' : '' }));
      if (result.duplicates) lines.push(t('dev.syncDuplicates', { count: result.duplicates }));
      if (result.tablets || result.monitors) lines.push(t('dev.syncFetchedMore', { tablets: result.tablets ?? 0, monitors: result.monitors ?? 0 }));
      if (result.phone_error) lines.push(t('dev.syncPhoneError', { error: translateServerMessage(result.phone_error) }));
      if (result.tablet_error) lines.push(t('dev.syncTabletError', { error: translateServerMessage(result.tablet_error) }));
      if (result.monitor_error) lines.push(t('dev.syncMonitorError', { error: translateServerMessage(result.monitor_error) }));
      lines.push(t('dev.syncDetailed', { count: result.detailed ?? 0 }));
      (result.detail_warnings || []).forEach((w) => lines.push(`⚠ ${translateServerMessage(w)}`));
      alert(lines.join('\n'));
      fetchDevices();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncingGlpi(false);
    }
  }

  async function createBulkHandovers() {
    const chosen = devices.filter((d) => selected.has(d.id));
    if (chosen.length === 0) return;
    if (chosen.length > MAX_PRINT_BATCH) {
      setError(t('dev.bulkTooMany', { max: MAX_PRINT_BATCH, count: chosen.length }));
      return;
    }
    if (!confirm(t('dev.bulkConfirm', { count: chosen.length }))) return;
    setError('');
    setBulkHandoverBusy(true);
    try {
      const created = [];
      // Tạo tuần tự từng phiếu (không song song) để số phiếu YYMMxxx cấp ra đúng thứ tự liền mạch, không bị chen ngang.
      for (const device of chosen) {
        let base = buildHandoverData(device);
        try {
          const latest = await api.get('/handovers/latest', { device_id: device.id, model: device.model || '' });
          if (latest.found && latest.data) base = mergeSpecs(base, latest.data, { overwrite: false });
        } catch { /* không lấy được thông số cũ thì để trống, không chặn cả lượt tạo */ }
        const { no: _no, ...payload } = base;
        const result = await api.post('/handovers', { device_id: device.id, register_date: base.register_date, full_name: base.full_name, data: payload });
        created.push({ ...payload, no: result.no });
      }
      setSelected(new Set());
      flushSync(() => setBulkHandoverItems(created));
      printHandoverSheets(() => setBulkHandoverItems(null));
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkHandoverBusy(false);
    }
  }

  function openCreateModal() {
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  }

  function openEditModal(device) {
    setForm({ id: device.id, original_ma: device.ma, ...deviceToFormFields(device) });
    setFormError('');
    setModalOpen(true);
  }

  function openCloneModal(device) {
    setForm({ ...device, id: null, source_id: device.id, ...deviceToFormFields(device), ma: `${device.ma}-COPY` });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSaveDevice(e) {
    e.preventDefault();
    setFormError('');
    const devicePayload = { ...form, registered_at: form.registered_at || null };
    try {
      if (form.source_id) {
        await api.post(`/devices/${form.source_id}/clone`, devicePayload);
      } else if (form.id) {
        await api.put(`/devices/${form.id}`, devicePayload);
      } else {
        await api.post('/devices', devicePayload);
      }
      setModalOpen(false);
      fetchDevices();
    } catch (err) {
      setFormError(err.message);
    }
  }

  async function handleDelete(device) {
    if (!confirm(t('dev.confirmDelete', { name: device.ten, code: device.ma }))) return;
    try {
      await api.del(`/devices/${device.id}`);
      fetchDevices();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handlePrintNow(device) {
    setError('');
    if (!device.ma?.trim()) {
      setError(t('dev.noSerial', { count: 1, names: device.ten || `#${device.id}` }));
      return;
    }
    setPrintingId(device.id);
    try {
      await api.post('/print', { deviceIds: [device.id] });
      setInstantPrintDevice(device);
      setPrintDialogOpen(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setPrintingId(null);
    }
  }

  function handlePrintDialogClose() {
    setPrintDialogOpen(false);
    setInstantPrintDevice(null);
  }

  function handlePrintFromDialog(date) {
    setPrintDialogOpen(false);
    if (date && instantPrintDevice) {
      setInstantPrintDevice((device) => ({ ...device, registered_at: date }));
    }
    setTimeout(() => {
      setPrintPageSize(labelPageCss(instantPrintDevice?.kho));
      printWithBodyClass('printing-labels');
      setInstantPrintDevice(null);
    }, 80);
  }

  return (
    <div>
      <div className="page-head manage-head">
        <h2>{t('dev.title')}</h2>
        <div className="manage-actions">
          <button className="btn-secondary" type="button" onClick={exportInventory} disabled={exporting}>{exporting ? t('dev.exporting') : t('dev.exportInventory')}</button>
          {isAdmin && <button className="btn-secondary" type="button" onClick={syncFromGlpi} disabled={syncingGlpi}>{syncingGlpi ? t('dev.syncing') : t('dev.syncGlpi')}</button>}
          {isAdmin && <button className="btn-primary" type="button" onClick={openCreateModal}>{t('dev.addNew')}</button>}
          <button className="btn-secondary" type="button" onClick={createBulkHandovers} disabled={selected.size === 0 || bulkHandoverBusy}>
            {bulkHandoverBusy ? t('dev.creatingSlips') : `${t('dev.createSlips')}${selected.size > 0 ? ` (${selected.size})` : ''}`}
          </button>
          <button className="btn-primary" type="button" onClick={openPrintListModal} disabled={selected.size === 0 && queue.length === 0}>
            {t('dev.printLabelList')}{queue.length > 0 ? ` (${queue.length})` : ''}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder={t('dev.searchPlaceholder')}
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select value={loaiFilter} onChange={(e) => { setPage(1); setLoaiFilter(e.target.value); }}>
          <option value="">{t('dev.allTypes')}</option>
          {LOAI_KEYS.map((k) => (
            <option key={k} value={k}>{t(`loai.${k}`)}</option>
          ))}
        </select>
      </div>
      {error && <div className="error-box">{error}</div>}

      <div className="inventory-table-wrap">
      <table className="data-table inventory-table">
        <thead>
          <tr onContextMenu={openColumnMenu} title={t('dev.columnsHint')}>
            <th>
              <input
                type="checkbox"
                checked={devices.length > 0 && devices.every((d) => selected.has(d.id))}
                onChange={toggleSelectAll}
              />
            </th>
            <th className="action-col">{t('dev.action')}</th>
            {visibleColumns.map((c) => (
              <th key={c.key} className="sortable-col" onClick={(event) => { event.stopPropagation(); toggleSort(c.key); }}>
                {t(c.labelKey)}
                <span className={`sort-arrow${sort.by === c.key ? ' active' : ''}`}>{sort.by === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '⇅'}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={2 + visibleColumns.length} className="empty-row">{t('common.loading')}</td></tr>
          )}
          {!loading && devices.length === 0 && (
            <tr><td colSpan={2 + visibleColumns.length} className="empty-row">{t('dev.empty')}</td></tr>
          )}
          {devices.map((d) => (
            <tr key={d.id}>
              <td>
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} />
              </td>
              <td className="action-col">
                <div className="row-actions">
                  <button className="print-now-action" onClick={() => handlePrintNow(d)} disabled={printingId === d.id}>{printingId === d.id ? t('dev.printing') : t('dev.printNow')}</button>
                  <button onClick={() => setHandoverDevice(d)}>{t('dev.slip')}</button>
                  {isAdmin && <>
                  <button onClick={() => openEditModal(d)}>{t('common.edit')}</button>
                  <button onClick={() => openCloneModal(d)}>{t('dev.clone')}</button>
                  <button onClick={() => handleDelete(d)}>{t('common.delete')}</button>
                  </>}
                </div>
              </td>
              {visibleColumns.map((c) => <td key={c.key} className={c.className} data-label={t(c.labelKey)}>{c.cell(d, t)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      {columnMenu && (
        <div className="col-menu" ref={columnMenuRef} style={{ left: columnMenu.x, top: columnMenu.y }}>
          <div className="col-menu-title">{t('dev.showColumns')}</div>
          {COLUMN_DEFS.map((c) => (
            <label className="col-menu-item" key={c.key}>
              <input type="checkbox" checked={columnVisibility[c.key]} onChange={() => toggleColumn(c.key)} />
              {t(c.labelKey)}
            </label>
          ))}
          <button type="button" className="col-menu-reset" onClick={() => setColumnVisibility(Object.fromEntries(COLUMN_DEFS.map((c) => [c.key, true])))}>{t('dev.showAll')}</button>
        </div>
      )}

      <Pager page={page} pageSize={pageSize} total={total} totalPages={totalPages} unit={t('unit.devices')} onPage={setPage} onPageSize={(size) => { setPage(1); setPageSize(size); }} />

      {printListOpen && (
        <div className="modal-backdrop" onClick={closePrintListModal}>
          <div className="modal-card print-list-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{t('print.title')}</h2>
              <button type="button" className="btn-close" aria-label={t('print.close')} onClick={closePrintListModal}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-box">{error}</div>}
              {!labelReviewOpen ? (
                <div className="table-scrollbar">
                  <table className="print-list-table">
                    <thead>
                      <tr>
                        <th style={{ width: '5%' }}><input type="checkbox" checked={printListSelection.size > 0 && printListSelection.size === selected.size} onChange={() => setPrintListSelection(printListSelection.size === selected.size ? new Set() : new Set(selected))} /></th>
                        <th style={{ width: '15%' }}>{t('field.ma')}</th>
                        <th style={{ width: '10%' }}>{t('field.model')}</th>
                        <th style={{ width: '10%' }}>{t('field.loai')}</th>
                        <th style={{ width: '15%' }}>{t('field.ten')}</th>
                        <th style={{ width: '15%' }}>{t('field.user_name')}</th>
                        <th style={{ width: '5%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.filter((device) => selected.has(device.id)).map((device) => (
                        <tr key={device.id}>
                          <td><input type="checkbox" checked={printListSelection.has(device.id)} onChange={() => togglePrintListItem(device.id)} /></td>
                          <td className="mono">{device.ma}</td><td>{device.model || 'N/A'}</td><td>{t(`loai.${device.loai}`)}</td><td>{device.ten}</td><td>{device.user_name || 'N/A'}</td>
                          <td><button type="button" className="print-list-delete" aria-label={t('print.remove', { code: device.ma })} onClick={() => togglePrintListItem(device.id)}><TrashIcon /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <h6 className="text-primary mb-3">{t('print.review')}</h6>
                  {addedNotice && <div className="notice-box">{addedNotice}</div>}
                  {queue.length === 0 ? (
                    <div className="empty-state">{t('print.noLabels')}</div>
                  ) : (
                    <div className="label-grid">
                      {queue.map((device) => (
                        <div className="label-card" key={device.id}>
                          <button className="del" title={t('print.removeFromQueue')} onClick={() => removeDevice(device.id)}>×</button>
                          <LabelPreview device={device} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer print-list-footer">
              <button type="button" className="btn-secondary" onClick={closePrintListModal}>{t('print.close')}</button>
              {!labelReviewOpen ? (
                <>
                  <button type="button" className="btn-secondary btn-danger-hover" onClick={deleteSelectedPrintItems} disabled={printListSelection.size === 0}>{t('print.deleteSelected')}</button>
                  <button type="button" className="btn-primary" onClick={reviewPrintList} disabled={printListSelection.size === 0}>{t('print.review')}</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-secondary btn-danger-hover" onClick={clearQueue} disabled={queue.length === 0}>{t('print.clearAll')}</button>
                  <button type="button" className="btn-primary" onClick={handlePrintQueue} disabled={queue.length === 0 || queuePrinting}>
                    {queuePrinting ? t('print.printing') : `${t('print.print')}${queue.length > 0 ? ` (${queue.length})` : ''}`}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {khoConflict && (
        <div className="modal-backdrop" onClick={() => setKhoConflict(null)}>
          <div className="modal-card kho-conflict-modal" onClick={(event) => event.stopPropagation()}>
            <div className="kho-conflict-icon">!</div>
            <h3>{t('kho.conflictTitle')}</h3>
            <p className="kho-conflict-text">
              {t('kho.conflictText')}
            </p>
            <div className="kho-conflict-compare">
              <div className="kho-chip">
                <span className="kho-chip-size">{khoConflict.queueKho}mm</span>
                <span className="kho-chip-label">{t(`kho.${khoConflict.queueKho}`)}</span>
                <span className="kho-chip-count">{t('kho.waiting', { count: khoConflict.queueCount })}</span>
              </div>
              <div className="kho-conflict-arrow">→</div>
              <div className="kho-chip kho-chip-new">
                <span className="kho-chip-size">{khoConflict.incomingKho}mm</span>
                <span className="kho-chip-label">{t(`kho.${khoConflict.incomingKho}`)}</span>
                <span className="kho-chip-count">{t('kho.justSelected', { count: khoConflict.incoming.length })}</span>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setKhoConflict(null)}>{t('common.cancel')}</button>
              <button type="button" className="btn-primary btn-warning" onClick={confirmKhoSwap}>{t('kho.replace')}</button>
            </div>
          </div>
        </div>
      )}

      {createPortal(
        <div id="print-area">
          {instantPrintDevice ? (
            <LabelPreview device={instantPrintDevice} printMode />
          ) : (
            queue.map((device) => <LabelPreview key={device.id} device={device} printMode />)
          )}
        </div>,
        document.body,
      )}

      {handoverDevice && <HandoverModal key={handoverDevice.id} device={handoverDevice} onClose={() => setHandoverDevice(null)} />}

      {bulkHandoverItems && createPortal(
        <div className="handover-print-root">
          {bulkHandoverItems.map((data) => <HandoverSheet key={data.no} data={data} />)}
        </div>,
        document.body,
      )}

      <PrintLabelModal
        device={instantPrintDevice}
        open={printDialogOpen}
        onClose={handlePrintDialogClose}
        onPrint={handlePrintFromDialog}
      />

      {modalOpen && (
        <div className="modal-backdrop" onClick={() => setModalOpen(false)}>
          <form className="modal-card modal-xl update-device-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSaveDevice}>
            <div className="modal-header">
              <h2 className="modal-title">{form.source_id ? t('form.clone') : form.id ? t('form.update') : t('form.add')}</h2>
              <button type="button" className="btn-close" aria-label={t('common.close')} onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <h6 className="text-primary mb-3">{t('form.section')}</h6>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">{t('field.ma')}</label><input className="form-control" value={form.ma} onChange={(e) => setForm({ ...form, ma: e.target.value })} required /></div>
                <div className="form-col"><label className="form-label">{t('field.model')}</label><input className="form-control" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required /></div>
              </div>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">{t('field.producer')}</label><input className="form-control" value={form.producer} onChange={(e) => setForm({ ...form, producer: e.target.value })} /></div>
                <div className="form-col"><label className="form-label">{t('field.ten')}</label><input className="form-control" value={form.ten} onChange={(e) => setForm({ ...form, ten: e.target.value })} required /></div>
              </div>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">{t('field.loai')}</label><select className="form-select" value={form.loai} onChange={(e) => setForm({ ...form, loai: e.target.value })} required>{LOAI_KEYS.map((key) => <option key={key} value={key}>{t(`loai.${key}`)}</option>)}</select></div>
                <div className="form-col"><label className="form-label">{t('field.user_name')}</label><input className="form-control" value={form.user_name} onChange={(e) => setForm({ ...form, user_name: e.target.value })} /></div>
              </div>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">{t('field.ip_address')}</label><input className="form-control" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} /></div>
                <div className="form-col"><label className="form-label">{t('field.cpu')}</label><input className="form-control" value={form.cpu} onChange={(e) => setForm({ ...form, cpu: e.target.value })} /></div>
              </div>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">{t('field.ram')}</label><input className="form-control" value={form.ram} onChange={(e) => setForm({ ...form, ram: e.target.value })} /></div>
                <div className="form-col"><label className="form-label">{t('field.storage')}</label><input className="form-control" value={form.storage} onChange={(e) => setForm({ ...form, storage: e.target.value })} /></div>
              </div>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">{t('field.os_name')}</label><input className="form-control" value={form.os_name} onChange={(e) => setForm({ ...form, os_name: e.target.value })} placeholder="Win 11 Professional" /></div>
                <div className="form-col"><label className="form-label">{t('field.office_name')}</label><input className="form-control" value={form.office_name} onChange={(e) => setForm({ ...form, office_name: e.target.value })} placeholder="Office 365" /></div>
              </div>
              {form.loai === 'phone' && (
                <div className="form-row mb-3">
                  <div className="form-col"><label className="form-label">{t('field.phone_number')}</label><input className="form-control" value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} /></div>
                  <div className="form-col"><label className="form-label">{t('field.sim_serial')}</label><input className="form-control" value={form.sim_serial} onChange={(e) => setForm({ ...form, sim_serial: e.target.value })} /></div>
                </div>
              )}
              {formError && <div className="error-box">{formError}</div>}
            </div>

            <div className="modal-actions modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>{t('common.close')}</button>
              <button type="submit" className="btn-primary">{t('common.save')}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}
