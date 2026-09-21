import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { usePrintQueue } from '../context/PrintQueueContext';
import { LabelPreview, PrintLabelModal } from '../components/LabelPreview';
import { HandoverModal } from '../components/HandoverSheet';
import { Pager } from '../components/Pager';

const LOAI_LABELS = {
  laptop: 'Laptop',
  tablet: 'Tablet',
  pda: 'PDA',
  monitor: 'Màn hình',
  phone: 'Điện thoại',
};

const emptyForm = { id: null, source_id: null, original_ma: '', ma: '', ten: '', loai: 'laptop', model: '', producer: '', ip_address: '', cpu: '', ram: '', storage: '', is_active: false, user_name: '', registered_at: '', phong_ban: '', ghi_chu: '' };

// Khớp giới hạn deviceIds tối đa của endpoint POST /print ở backend — chặn sớm ở đây
// để tránh render hàng trăm/nghìn tem cùng lúc làm treo trình duyệt trước khi kịp báo lỗi.
const MAX_PRINT_BATCH = 500;

export function Devices() {
  const { isAdmin } = useAuth();
  const { queue, addDevices, removeDevice, clearQueue } = usePrintQueue();

  const [devices, setDevices] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [loaiFilter, setLoaiFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [printListOpen, setPrintListOpen] = useState(false);
  const [labelReviewOpen, setLabelReviewOpen] = useState(false);
  const [printListSelection, setPrintListSelection] = useState(new Set());
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [printingId, setPrintingId] = useState(null);
  const [queuePrinting, setQueuePrinting] = useState(false);
  const [instantPrintDevice, setInstantPrintDevice] = useState(null);
  const [handoverDevice, setHandoverDevice] = useState(null);
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
      const data = await api.get('/devices', { search, loai: loaiFilter, page, pageSize });
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
  }, [search, loaiFilter, page, pageSize]);

  useEffect(() => {
    const t = setTimeout(fetchDevices, 250); // debounce khi gõ tìm kiếm
    return () => clearTimeout(t);
  }, [fetchDevices]);

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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
    setPrintListSelection((previous) => {
      const next = new Set(previous);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
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

    if (incoming.length > MAX_PRINT_BATCH) {
      setError(`Chỉ được chọn tối đa ${MAX_PRINT_BATCH} thiết bị trong một lượt in. Bạn đang chọn ${incoming.length} thiết bị — vui lòng chia nhỏ ra nhiều lượt.`);
      return;
    }

    if (new Set(incoming.map((d) => d.kho)).size > 1) {
      setError('Bạn đang chọn lẫn cả tem 12mm và 24mm. Vui lòng chỉ chọn một khổ tem trong một lượt.');
      return;
    }

    const queueKho = queue[0]?.kho;
    const incomingKho = incoming[0]?.kho;
    if (queueKho && incomingKho && queueKho !== incomingKho) {
      setKhoConflict({ queueKho, incomingKho, queueCount: queue.length, incoming });
      return;
    }

    if (queue.length + incoming.length > MAX_PRINT_BATCH) {
      setError(`Hàng đợi in hiện có ${queue.length} thiết bị, thêm ${incoming.length} thiết bị nữa sẽ vượt quá giới hạn ${MAX_PRINT_BATCH} thiết bị/lượt in. Vui lòng in hàng đợi hiện tại trước hoặc chọn ít hơn.`);
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
      window.print();
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
      // K\u00E9o to\u00E0n b\u1ED9 thi\u1EBFt b\u1ECB kh\u1EDBp b\u1ED9 l\u1ECDc hi\u1EC7n t\u1EA1i qua t\u1EEBng trang (kh\u00F4ng ch\u1EC9 trang \u0111ang xem),
      // \u0111\u1EC3 export \u0111\u00FAng ngh\u0129a "to\u00E0n b\u1ED9 kho" k\u1EC3 c\u1EA3 khi c\u00F3 h\u00E0ng ngh\u00ECn thi\u1EBFt b\u1ECB.
      const all = [];
      let exportPage = 1;
      let exportTotalPages = 1;
      do {
        const data = await api.get('/devices', { search, loai: loaiFilter, page: exportPage, pageSize: 100 });
        all.push(...data.devices);
        exportTotalPages = data.total_pages;
        exportPage += 1;
      } while (exportPage <= exportTotalPages);

      const headers = ['Serial Number', 'Model', 'Producer', 'Type', 'Device Name', 'User Name', 'Dept', 'IP Address', 'Comment', 'Date'];
      const rows = all.map((device) => [device.ma, device.model || '', device.producer || '', LOAI_LABELS[device.loai] || device.loai, device.ten, device.user_name || '', device.phong_ban || '', device.ip_address || '', device.ghi_chu || '', device.registered_at ? device.registered_at.slice(0, 10) : '']);
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
    if (!confirm('Đồng bộ máy tính và điện thoại từ GLPI vào WareHub? Thiết bị đã có (khớp Serial Number) sẽ được cập nhật, thiết bị mới sẽ được thêm vào (ở trạng thái chưa kích hoạt).')) return;
    setSyncingGlpi(true);
    setError('');
    try {
      const result = await api.post('/devices/glpi-sync', {});
      const lines = [
        `Đồng bộ xong: ${result.created} thiết bị mới, ${result.updated} cập nhật, ${result.unchanged} không đổi.`,
        `Lấy từ GLPI: ${result.computers} máy tính, ${result.phones} điện thoại.`,
      ];
      if (result.skipped) lines.push(`${result.skipped} bỏ qua (thiếu Serial Number).`);
      if (result.duplicates) lines.push(`${result.duplicates} bỏ qua (trùng Serial Number).`);
      if (result.phone_error) lines.push(`Không lấy được điện thoại: ${result.phone_error}`);
      alert(lines.join('\n'));
      fetchDevices();
    } catch (err) {
      setError(err.message);
    } finally {
      setSyncingGlpi(false);
    }
  }

  function openCreateModal() {
    setForm(emptyForm);
    setFormError('');
    setModalOpen(true);
  }

  function openEditModal(device) {
    setForm({
      id: device.id,
      original_ma: device.ma,
      ma: device.ma,
      ten: device.ten,
      loai: device.loai,
      model: device.model || '',
      producer: device.producer || '',
      ip_address: device.ip_address || '',
      cpu: device.cpu || '',
      ram: device.ram || '',
      storage: device.storage || '',
      is_active: Boolean(device.is_active),
      user_name: device.user_name || '',
      registered_at: device.registered_at ? device.registered_at.slice(0, 10) : '',
      phong_ban: device.phong_ban || '',
      ghi_chu: device.ghi_chu || '',
    });
    setFormError('');
    setModalOpen(true);
  }

  function openCloneModal(device) {
    setForm({
      ...device,
      id: null,
      source_id: device.id,
      ma: `${device.ma}-COPY`,
      ten: device.ten || '',
      loai: device.loai || 'laptop',
      model: device.model || '',
      producer: device.producer || '',
      ip_address: device.ip_address || '',
      cpu: device.cpu || '',
      ram: device.ram || '',
      storage: device.storage || '',
      user_name: device.user_name || '',
      phong_ban: device.phong_ban || '',
      ghi_chu: device.ghi_chu || '',
      is_active: false,
      registered_at: device.registered_at ? device.registered_at.slice(0, 10) : '',
    });
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
    if (!confirm(`Xoá thiết bị "${device.ten}" (${device.ma})?`)) return;
    try {
      await api.del(`/devices/${device.id}`);
      fetchDevices();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleActivate(device) {
    try {
      await api.post(`/devices/${device.id}/activate`);
      fetchDevices();
    } catch (err) {
      alert(err.message);
    }
  }
  
  async function handleActivateAndQueue(device) {
    try {
      await api.post(`/devices/${device.id}/activate`);
      addDevices([{ ...device, is_active: true, lifecycle_status: 'old' }]);
      fetchDevices();
    } catch (err) {
      alert(err.message);
    }
  }

  async function handlePrintNow(device) {
    setPrintingId(device.id);
    setError('');
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
      window.print();
      setInstantPrintDevice(null);
    }, 80);
    if (date) {
      console.log('QR code printing date:', date);
    }
  }

  return (
    <div>
      <div className="page-head manage-head">
        <h2>Account Manage</h2>
        <div className="manage-actions">
          <button className="btn-secondary" type="button" onClick={exportInventory} disabled={exporting}>{exporting ? 'Đang xuất...' : 'Export Inventory'}</button>
          {isAdmin && <button className="btn-secondary" type="button" onClick={syncFromGlpi} disabled={syncingGlpi}>{syncingGlpi ? 'Đang đồng bộ...' : 'Đồng bộ từ GLPI'}</button>}
          {isAdmin && <button className="btn-primary" type="button" onClick={openCreateModal}>Add New</button>}
          <button className="btn-primary" type="button" onClick={openPrintListModal} disabled={selected.size === 0 && queue.length === 0}>Print Label List</button>
        </div>
      </div>

      <div className="toolbar">
        <input
          placeholder="Tìm theo mã, tên, phòng ban..."
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select value={loaiFilter} onChange={(e) => { setPage(1); setLoaiFilter(e.target.value); }}>
          <option value="">Tất cả loại</option>
          {Object.entries(LOAI_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      {error && <div className="error-box">{error}</div>}

      <div className="inventory-table-wrap">
      <table className="data-table inventory-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                checked={devices.length > 0 && devices.every((d) => selected.has(d.id))}
                onChange={toggleSelectAll}
              />
            </th>
            <th className="action-col">Action</th>
            <th>Serial Number</th>
            <th>Model</th>
            <th>Producer</th>
            <th>Type</th>
            <th>Device Name</th>
            <th>User Name</th>
            <th>Dept</th>
            <th>IP Address</th>
            <th>Comment</th>
            <th>Date</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr><td colSpan={12} className="empty-row">Đang tải...</td></tr>
          )}
          {!loading && devices.length === 0 && (
            <tr><td colSpan={12} className="empty-row">Chưa có thiết bị nào</td></tr>
          )}
          {devices.map((d) => (
            <tr key={d.id}>
              <td>
                <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)} />
              </td>
              <td className="action-col">
                <div className="row-actions">
                  {d.is_active && <button className="print-now-action" onClick={() => handlePrintNow(d)} disabled={printingId === d.id}>{printingId === d.id ? 'Đang in...' : 'In ngay'}</button>}
                  <button onClick={() => setHandoverDevice(d)}>Phiếu BG</button>
                  {isAdmin && <>
                  <button onClick={() => openEditModal(d)}>Sửa</button>
                  <button onClick={() => openCloneModal(d)}>Clone</button>
                  <button onClick={() => handleDelete(d)}>Xoá</button>
                  </>}
                </div>
              </td>
              <td className="mono">{d.ma}</td>
              <td>{d.model || '—'}</td>
              <td>{d.producer || '—'}</td>
              <td>{LOAI_LABELS[d.loai]}</td>
              <td>{d.ten}</td>
              <td>{d.user_name || '—'}</td>
              <td>{d.phong_ban || '—'}</td>
              <td>{d.ip_address || '—'}</td>
              <td>{d.ghi_chu || '—'}</td>
              <td>{d.registered_at ? d.registered_at.slice(0, 10) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <Pager page={page} pageSize={pageSize} total={total} totalPages={totalPages} unit="thiết bị" onPage={setPage} onPageSize={(size) => { setPage(1); setPageSize(size); }} />

      {printListOpen && (
        <div className="modal-backdrop" onClick={closePrintListModal}>
          <div className="modal-card print-list-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Print Label</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={closePrintListModal}>×</button>
            </div>
            <div className="modal-body">
              {error && <div className="error-box">{error}</div>}
              {!labelReviewOpen ? (
                <div className="table-scrollbar">
                  <table className="print-list-table">
                    <thead>
                      <tr>
                        <th style={{ width: '5%' }}><input type="checkbox" checked={printListSelection.size > 0 && printListSelection.size === selected.size} onChange={() => setPrintListSelection(printListSelection.size === selected.size ? new Set() : new Set(selected))} /></th>
                        <th style={{ width: '15%' }}>Serial Number</th>
                        <th style={{ width: '10%' }}>Model</th>
                        <th style={{ width: '10%' }}>Type</th>
                        <th style={{ width: '15%' }}>Device Name</th>
                        <th style={{ width: '15%' }}>User Name</th>
                        <th style={{ width: '5%' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {devices.filter((device) => selected.has(device.id)).map((device) => (
                        <tr key={device.id}>
                          <td><input type="checkbox" checked={printListSelection.has(device.id)} onChange={() => togglePrintListItem(device.id)} /></td>
                          <td className="mono">{device.ma}</td><td>{device.model || 'N/A'}</td><td>{LOAI_LABELS[device.loai]}</td><td>{device.ten}</td><td>{device.user_name || 'N/A'}</td>
                          <td><button type="button" className="print-list-delete" aria-label={`Remove ${device.ma}`} onClick={() => togglePrintListItem(device.id)}><TrashIcon /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <>
                  <h6 className="text-primary mb-3">Review</h6>
                  {queue.length === 0 ? (
                    <div className="empty-state">Chưa có tem nào để in.</div>
                  ) : (
                    <div className="label-grid">
                      {queue.map((device) => (
                        <div className="label-card" key={device.id}>
                          <button className="del" title="Bỏ khỏi hàng đợi" onClick={() => removeDevice(device.id)}>×</button>
                          <LabelPreview device={device} />
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer print-list-footer">
              <button type="button" className="btn-secondary" onClick={closePrintListModal}>Close</button>
              {!labelReviewOpen ? (
                <>
                  <button type="button" className="btn-secondary btn-danger-hover" onClick={deleteSelectedPrintItems} disabled={printListSelection.size === 0}>Delete Selected Items</button>
                  <button type="button" className="btn-primary" onClick={reviewPrintList} disabled={printListSelection.size === 0}>Review</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn-secondary btn-danger-hover" onClick={clearQueue} disabled={queue.length === 0}>Xóa hết</button>
                  <button type="button" className="btn-primary" onClick={handlePrintQueue} disabled={queue.length === 0 || queuePrinting}>
                    {queuePrinting ? 'Đang in...' : 'Print'}
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
            <h3>Khác khổ tem</h3>
            <p className="kho-conflict-text">
              Không thể gộp hai khổ tem trong cùng một lượt in. Hàng đợi hiện tại sẽ bị xoá nếu bạn tiếp tục.
            </p>
            <div className="kho-conflict-compare">
              <div className="kho-chip">
                <span className="kho-chip-size">{khoConflict.queueKho}mm</span>
                <span className="kho-chip-label">{khoConflict.queueKho === '12' ? 'Điện thoại' : 'Laptop / Tablet / PDA / Màn hình'}</span>
                <span className="kho-chip-count">{khoConflict.queueCount} thiết bị đang chờ in</span>
              </div>
              <div className="kho-conflict-arrow">→</div>
              <div className="kho-chip kho-chip-new">
                <span className="kho-chip-size">{khoConflict.incomingKho}mm</span>
                <span className="kho-chip-label">{khoConflict.incomingKho === '12' ? 'Điện thoại' : 'Laptop / Tablet / PDA / Màn hình'}</span>
                <span className="kho-chip-count">{khoConflict.incoming.length} thiết bị vừa chọn</span>
              </div>
            </div>
            <div className="modal-actions">
              <button type="button" className="btn-secondary" onClick={() => setKhoConflict(null)}>Huỷ</button>
              <button type="button" className="btn-primary btn-warning" onClick={confirmKhoSwap}>Xoá hàng đợi cũ &amp; thêm mới</button>
            </div>
          </div>
        </div>
      )}

      <div id="print-area">
        {instantPrintDevice ? (
          <LabelPreview device={instantPrintDevice} printMode />
        ) : (
          queue.map((device) => <LabelPreview key={device.id} device={device} printMode />)
        )}
      </div>

      {handoverDevice && <HandoverModal key={handoverDevice.id} device={handoverDevice} onClose={() => setHandoverDevice(null)} />}

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
              <h2 className="modal-title">{form.source_id ? 'Clone' : form.id ? 'Update' : 'Add'}</h2>
              <button type="button" className="btn-close" aria-label="Close" onClick={() => setModalOpen(false)}>×</button>
            </div>
            <div className="modal-body">
              <h6 className="text-primary mb-3">Equipment Information</h6>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">Serial Number</label><input className="form-control" value={form.ma} onChange={(e) => setForm({ ...form, ma: e.target.value })} required /></div>
                <div className="form-col"><label className="form-label">Model</label><input className="form-control" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required /></div>
              </div>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">Producer</label><input className="form-control" value={form.producer} onChange={(e) => setForm({ ...form, producer: e.target.value })} /></div>
                <div className="form-col"><label className="form-label">Device Name</label><input className="form-control" value={form.ten} onChange={(e) => setForm({ ...form, ten: e.target.value })} required /></div>
              </div>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">Type</label><select className="form-select" value={form.loai} onChange={(e) => setForm({ ...form, loai: e.target.value })} required>{Object.entries(LOAI_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select></div>
                <div className="form-col"><label className="form-label">User Name</label><input className="form-control" value={form.user_name} onChange={(e) => setForm({ ...form, user_name: e.target.value })} /></div>
              </div>
              <div className="form-row mb-3">
                <div className="form-col"><label className="form-label">IP Address</label><input className="form-control" value={form.ip_address} onChange={(e) => setForm({ ...form, ip_address: e.target.value })} /></div>
              </div>
              {formError && <div className="error-box">{formError}</div>}
            </div>

            <div className="modal-actions modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Close</button>
              <button type="submit" className="btn-primary">Save</button>
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
