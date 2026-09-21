import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../api/client';
import smcLogo from '../img/Logo_SMC_Corporation.svg';

const FORM_CODE = 'ITFGE-00459_19_A';

const RESPONSIBILITIES = [
  'End User must protect devices carefully and avoid losing term.',
  'Do not take the computer out of company unless it is accepted by the Head of Department.',
  "End User mustn't change the hardware.",
  "End User mustn't install any software without permission of IT department.",
  "End User only using for working of company, don't using for personal purposes.",
  'When having the strange problem must inform to IT department so that check and repair immediately.',
  'If there is any equipment malfunction due to personal damages such as broken, falling into the water, etc that may be considered by IT members and can compensate that will depend on the charge of repairing fees.',
  { bold: 'When End user resigned, they have responsibility to return to IT department all of items above one working day before.' },
  'Any missing or different components will be fine as their prices in the present.',
];

function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// 2022-09-06 -> 6/9/2022, giống định dạng trên mẫu phiếu giấy.
function formatDayMonthYear(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return match ? `${Number(match[3])}/${Number(match[2])}/${match[1]}` : iso || '';
}

export function buildHandoverData(device) {
  return {
    register_date: isoToday(),
    no: '',
    full_name: device.user_name || '',
    department: device.phong_ban || '',
    employee_id: '',
    transfer_date: isoToday(),
    computer_name: device.ten || '',
    service_tag: device.ma || '',
    storage: device.storage || '',
    ram: device.ram || '',
    cpu: device.cpu || '',
    adapter: '',
    windows: '',
    office: '',
    ip: device.ip_address || '',
    peripherals: '',
    model: device.model || '',
    other: 'N/A',
  };
}

function Label({ en, vi }) {
  return (
    <>
      {en}
      {vi && <span className="hv-vi">{vi}</span>}
    </>
  );
}

export function HandoverSheet({ data }) {
  return (
    <div className="hv-sheet">
      <div className="hv-head">
        <img src={smcLogo} alt="SMC" />
        <div className="hv-title">
          <h1>MINUTES OF EQUIPMENT HANDOVER</h1>
          <p>PHIẾU BÀN GIAO THIẾT BỊ</p>
        </div>
        <div className="hv-formno">管理No: {FORM_CODE}</div>
      </div>

      <div className="hv-reg">
        <span>Register Date <i className="hv-vi-inline">(Ngày lập biên bản)</i>: {data.register_date}</span>
        <span className="hv-no">No.: <b>{data.no}</b></span>
      </div>

      <table className="hv-info">
        <colgroup><col style={{ width: '22%' }} /><col style={{ width: '28%' }} /><col style={{ width: '22%' }} /><col style={{ width: '28%' }} /></colgroup>
        <tbody>
          <tr>
            <th><Label en="Full name:" vi="Họ Tên" /></th>
            <td className="hv-center">{data.full_name}</td>
            <th><Label en="Factory / Department:" vi="Nhà máy / Bộ phận" /></th>
            <td className="hv-center">{data.department}</td>
          </tr>
          <tr>
            <th><Label en="Employee ID:" vi="Mã số nhân viên" /></th>
            <td className="hv-center">{data.employee_id}</td>
            <th><Label en="Transfer Date:" vi="Ngày giao nhận" /></th>
            <td className="hv-center">{formatDayMonthYear(data.transfer_date)}</td>
          </tr>
        </tbody>
      </table>

      <div className="hv-band">DETAILS INFORMATION</div>
      <table className="hv-details">
        <colgroup><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /><col style={{ width: '50%' }} /></colgroup>
        <tbody>
          <tr><th>COMPUTER NAME</th><td colSpan="2" className="hv-center">{data.computer_name}</td></tr>
          <tr><th>SERVICE TAG</th><td colSpan="2" className="hv-center">{data.service_tag}</td></tr>
          <tr><th>HDD/SSD</th><td colSpan="2" className="hv-center">{data.storage}</td></tr>
          <tr><th>RAM</th><td colSpan="2" className="hv-center">{data.ram}</td></tr>
          <tr><th>CPU</th><td colSpan="2" className="hv-center">{data.cpu}</td></tr>
          <tr><th>PSU/ADAPTER</th><td colSpan="2" className="hv-center">{data.adapter}</td></tr>
          <tr>
            <th rowSpan="2">LICENSE</th>
            <td className="hv-center hv-sub">Windows</td><td className="hv-center">{data.windows}</td>
          </tr>
          <tr><td className="hv-center hv-sub">Office</td><td className="hv-center">{data.office}</td></tr>
          <tr>
            <th rowSpan="4">OTHER EQUIPMENT</th>
            <td className="hv-center hv-sub">IP Address</td><td className="hv-center">{data.ip}</td>
          </tr>
          <tr><td className="hv-center hv-sub">Mouse/Keyboard</td><td className="hv-center">{data.peripherals}</td></tr>
          <tr><td className="hv-center hv-sub">Model</td><td className="hv-center">{data.model}</td></tr>
          <tr><td className="hv-center hv-sub">Other devices</td><td className="hv-center">{data.other}</td></tr>
        </tbody>
      </table>

      <div className="hv-band hv-band-gap">ASSET MANAGEMENT POLICY</div>
      <table className="hv-policy">
        <colgroup><col style={{ width: '13%' }} /><col style={{ width: '87%' }} /></colgroup>
        <tbody>
          <tr>
            <th>Responsibilities</th>
            <td>
              <ul>
                {RESPONSIBILITIES.map((item, index) => (
                  <li key={index}>{typeof item === 'string' ? item : <b>{item.bold}</b>}</li>
                ))}
              </ul>
            </td>
          </tr>
          <tr>
            <th>Procedures</th>
            <td>
              IT department create a minutes of computer handover ➔ End User ➔ Head Department ➔ IT
              <br />(End Users must send the minutes of equipment handover to IT department <b>within 2 days</b>)
            </td>
          </tr>
        </tbody>
      </table>

      <div className="hv-signs">
        <table>
          <colgroup><col /><col /><col /></colgroup>
          <thead>
            <tr><th colSpan="3" className="hv-sign-title">HANDOVER'S DEPARTMENT</th></tr>
            <tr><th>Head Dept's Approval</th><th>Checked by</th><th>Handover</th></tr>
          </thead>
          <tbody><tr className="hv-sign-space"><td /><td /><td /></tr></tbody>
        </table>
        <table>
          <colgroup><col /><col /><col /></colgroup>
          <thead>
            <tr><th colSpan="3" className="hv-sign-title">RECEIVER'S DEPARTMENT</th></tr>
            <tr><th>Head Dept's Approval</th><th>Checked by</th><th>Receiver</th></tr>
          </thead>
          <tbody><tr className="hv-sign-space"><td /><td /><td /></tr></tbody>
        </table>
      </div>

      <div className="hv-resigned">For resigned:</div>
      <div className="hv-signs hv-signs-resigned">
        <table>
          <thead><tr><th className="hv-sign-title">HANDOVER</th></tr></thead>
          <tbody><tr className="hv-resigned-space"><td><span className="hv-date">Date:</span></td></tr></tbody>
        </table>
        <table>
          <thead><tr><th className="hv-sign-title">RECEIVER</th></tr></thead>
          <tbody><tr className="hv-resigned-space"><td><span className="hv-date">Date:</span></td></tr></tbody>
        </table>
      </div>
    </div>
  );
}

const FIELD_GROUPS = [
  {
    title: 'Thông tin phiếu',
    fields: [
      ['register_date', 'Ngày lập biên bản', 'date'],
      ['transfer_date', 'Ngày giao nhận', 'date'],
    ],
  },
  {
    title: 'Người nhận',
    fields: [
      ['full_name', 'Họ tên'],
      ['employee_id', 'Mã số nhân viên'],
      ['department', 'Nhà máy / Bộ phận'],
    ],
  },
  {
    title: 'Thiết bị',
    fields: [
      ['computer_name', 'Computer name'],
      ['service_tag', 'Service tag (Serial)'],
      ['model', 'Model'],
      ['cpu', 'CPU'],
      ['ram', 'RAM'],
      ['storage', 'HDD/SSD'],
      ['adapter', 'PSU/Adapter'],
    ],
  },
  {
    title: 'Bản quyền & thiết bị khác',
    fields: [
      ['windows', 'License - Windows'],
      ['office', 'License - Office'],
      ['ip', 'IP Address'],
      ['peripherals', 'Mouse/Keyboard'],
      ['other', 'Other devices'],
    ],
  },
];

// Các ô thuộc về thiết bị (không phải về người nhận): dùng chung giữa các phiếu cùng model nên được tái dùng/clone.
// Họ tên, mã NV, bộ phận, serial, tên máy, IP là riêng của từng người/máy nên không nằm trong danh sách này.
const SPEC_FIELDS = ['cpu', 'ram', 'storage', 'adapter', 'windows', 'office', 'peripherals', 'other'];
const draftKey = (deviceId) => `warehub-handover-draft-${deviceId}`;

function readDraft(deviceId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(draftKey(deviceId)) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

// Tiền tố năm+tháng của ngày lập, khớp đầu số phiếu (2609001 -> "2609").
const monthPrefix = (isoDate) => (/^\d{4}-\d{2}/.test(isoDate || '') ? `${isoDate.slice(2, 4)}${isoDate.slice(5, 7)}` : '');

function mergeSpecs(current, source, { overwrite }) {
  const next = { ...current };
  SPEC_FIELDS.forEach((key) => {
    const value = typeof source?.[key] === 'string' ? source[key].trim() : '';
    if (!value) return;
    if (overwrite || !current[key] || (key === 'other' && current[key] === 'N/A')) next[key] = value;
  });
  return next;
}

function HandoverPicker({ initialSearch, excludeNo, onPick, onCancel }) {
  const [search, setSearch] = useState(initialSearch || '');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get('/handovers', { search, page: 1, pageSize: 20 })
        .then((result) => { if (!cancelled) { setRows(result.handovers.filter((item) => item.no !== excludeNo)); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, excludeNo]);

  return (
    <div className="hv-picker-backdrop">
      <div className="hv-picker" role="dialog" aria-label="Clone từ phiếu khác">
        <div className="hv-picker-head">
          <b>Clone thông số từ phiếu đã lưu</b>
          <button type="button" className="btn-close" aria-label="Close" onClick={onCancel}>×</button>
        </div>
        <p className="hv-picker-help">
          Chỉ lấy thông số thiết bị: CPU, RAM, ổ cứng, adapter, license, chuột/phím, thiết bị khác.
          Họ tên, mã NV, serial, tên máy và IP của thiết bị này được giữ nguyên.
        </p>
        <input className="form-control" autoFocus placeholder="Tìm theo model, số phiếu, tên, serial..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="hv-picker-list">
          {error && <div className="hv-error">{error}</div>}
          {!error && rows === null && <div className="hv-picker-empty">Đang tải...</div>}
          {!error && rows && rows.length === 0 && <div className="hv-picker-empty">Không có phiếu nào khớp.</div>}
          {rows && rows.map((item) => (
            <button type="button" key={item.no} className="hv-picker-row" onClick={() => onPick(item)}>
              <span className="hv-picker-no">{item.no}</span>
              <span className="hv-picker-main">
                <b>{item.data?.model || '—'}</b>
                <small>{[item.data?.cpu, item.data?.ram, item.data?.storage].filter(Boolean).join(' · ') || 'Chưa có thông số'}</small>
              </span>
              <span className="hv-picker-who">{item.full_name || item.device_ma || ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HandoverModal({ device, saved, onClose }) {
  const deviceId = saved ? saved.device_id : device?.id;
  const draftEnabled = !saved && deviceId != null;

  const [initial] = useState(() => {
    if (saved) return { draft: null, data: { ...buildHandoverData(device || {}), ...(saved.data || {}), no: saved.no } };
    const draft = draftEnabled ? readDraft(deviceId) : null;
    return { draft, data: { ...buildHandoverData(device), ...(draft || {}) } };
  });
  const [data, setData] = useState(initial.data);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issued, setIssued] = useState(Boolean(saved));
  const [pickerOpen, setPickerOpen] = useState(false);
  // Số phiếu chính thức đã cấp: lưu/in lại thì dùng lại số này (cập nhật nội dung), không tốn thêm số.
  const allocatedRef = useRef(saved ? saved.no : null);
  const savedRef = useRef(false);

  // Đã lưu phiếu lên server thì bỏ bản nháp cục bộ, lần sau lấy từ phiếu đã lưu (không bị dính dữ liệu cũ).
  function handleClose() {
    if (savedRef.current && draftEnabled) {
      try { localStorage.removeItem(draftKey(deviceId)); } catch { /* bỏ qua */ }
    }
    onClose();
  }

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !pickerOpen) handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Giữ lại phần đang gõ dở (kể cả khi lỡ đóng hộp thoại hoặc tải lại trang).
  useEffect(() => {
    if (!draftEnabled) return;
    const { no, register_date, transfer_date, ...draft } = data;
    try { localStorage.setItem(draftKey(deviceId), JSON.stringify(draft)); } catch { /* bỏ qua */ }
  }, [data, deviceId, draftEnabled]);

  // Thiết bị chưa có bản nháp: lấy thông số từ phiếu gần nhất của chính nó, hoặc của thiết bị cùng model.
  useEffect(() => {
    if (saved || initial.draft || deviceId == null) return undefined;
    let cancelled = false;
    api.get('/handovers/latest', { device_id: deviceId, model: device?.model || '' })
      .then((result) => {
        if (cancelled || !result.found || !result.data) return;
        setData((current) => mergeSpecs(current, result.data, { overwrite: false }));
        if (result.source === 'model') setNotice(`Đã tự điền thông số từ phiếu cùng model (${result.no}).`);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [saved, initial.draft, deviceId, device?.model]);

  useEffect(() => {
    const allocated = allocatedRef.current;
    if (allocated && allocated.startsWith(monthPrefix(data.register_date))) {
      setIssued(true);
      setData((current) => (current.no === allocated ? current : { ...current, no: allocated }));
      return undefined;
    }
    setIssued(false);
    let cancelled = false;
    api.get('/handovers/next-no', { date: data.register_date })
      .then((result) => { if (!cancelled) setData((current) => ({ ...current, no: result.no })); })
      .catch(() => { if (!cancelled) setData((current) => ({ ...current, no: '' })); });
    return () => { cancelled = true; };
  }, [data.register_date]);

  async function persist() {
    const { no: shownNo, ...payload } = data;
    let no = allocatedRef.current && allocatedRef.current.startsWith(monthPrefix(data.register_date)) ? allocatedRef.current : null;
    if (no) {
      await api.put(`/handovers/${no}`, { full_name: data.full_name, data: payload });
    } else {
      const result = await api.post('/handovers', { device_id: deviceId ?? null, register_date: data.register_date || null, full_name: data.full_name, data: payload });
      no = result.no;
      allocatedRef.current = no;
    }
    savedRef.current = true;
    setIssued(true);
    flushSync(() => setData((current) => ({ ...current, no })));
    return no;
  }

  async function handleSave() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      const no = await persist();
      setNotice(`Đã lưu phiếu ${no}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function handlePrint() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await persist();
      const cleanup = () => {
        document.body.classList.remove('printing-handover');
        window.removeEventListener('afterprint', cleanup);
      };
      document.body.classList.add('printing-handover');
      window.addEventListener('afterprint', cleanup);
      window.print();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function handlePick(item) {
    setData((current) => mergeSpecs(current, item.data, { overwrite: true }));
    setNotice(`Đã lấy thông số từ phiếu ${item.no}. Bấm Lưu hoặc In phiếu để ghi lại.`);
    setPickerOpen(false);
  }

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-card hv-modal">
          <div className="modal-header">
            <h2 className="modal-title">Phiếu bàn giao thiết bị{saved ? ` — ${saved.no}` : ''}</h2>
            <button type="button" className="btn-close" aria-label="Close" onClick={handleClose}>×</button>
          </div>
          <div className="hv-modal-body">
            <div className="hv-form">
              {FIELD_GROUPS.map((group) => (
                <fieldset key={group.title}>
                  <legend>{group.title}</legend>
                  <div className="hv-fields">
                    {group.fields.map(([key, label, type]) => (
                      <label key={key}>
                        {label}
                        <input className="form-control" type={type || 'text'} value={data[key]} onChange={(event) => { const { value } = event.target; setData((current) => ({ ...current, [key]: value })); }} />
                      </label>
                    ))}
                    {group.title === 'Thông tin phiếu' && (
                      <label className="hv-no-field">
                        Số phiếu (No.) — tự cấp
                        <input className="form-control" value={data.no} readOnly />
                        <span className="hv-hint">{issued ? 'Đã có số phiếu này.' : 'Số dự kiến, cấp chính thức khi bấm Lưu hoặc In phiếu.'}</span>
                      </label>
                    )}
                  </div>
                </fieldset>
              ))}
            </div>
            <div className="hv-preview">
              <HandoverSheet data={data} />
            </div>
          </div>
          <div className="modal-actions modal-footer">
            {error
              ? <span className="hv-error">{error}</span>
              : <span className="hv-note">{notice || 'Phần đang gõ dở được tự giữ lại. Bấm Lưu để ghi phiếu, In phiếu sẽ lưu rồi in.'}</span>}
            <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)} disabled={busy}>Clone từ phiếu khác</button>
            <button type="button" className="btn-secondary" onClick={handleClose}>Đóng</button>
            <button type="button" className="btn-secondary hv-save" onClick={handleSave} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
            <button type="button" className="btn-primary" onClick={handlePrint} disabled={busy}>In phiếu</button>
          </div>
          {pickerOpen && <HandoverPicker initialSearch={device?.model || data.model} excludeNo={allocatedRef.current} onPick={handlePick} onCancel={() => setPickerOpen(false)} />}
        </div>
      </div>
      {createPortal(<div id="handover-print"><HandoverSheet data={data} /></div>, document.body)}
    </>
  );
}
