import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../api/client';
import { setPrintPageSize, HANDOVER_PAGE_CSS } from '../utils/printPageSize';
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

const LOAI_LABELS = { laptop: 'Laptop', tablet: 'Tablet', pda: 'PDA', monitor: 'Màn hình', phone: 'Điện thoại' };

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
    adapter: 'Adapter Dell 65W',
    windows: 'Win 11 Professional',
    office: 'Office 365',
    ip: device.ip_address || '',
    peripherals: 'Wire Mouse and Keyboard',
    model: device.model || '',
    other: 'N/A',
    // Danh sách thiết bị đính kèm khi 1 người nhận nhiều thiết bị cùng lúc — không in lên phiếu,
    // chỉ dùng để xuất file Excel riêng đính kèm theo phiếu giấy (không đụng tới ô Other devices).
    attachments: [],
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

// Trang kèm theo phiếu chính khi 1 người nhận nhiều thiết bị — cùng khổ A4, cùng phong cách (logo,
// tiêu đề song ngữ, bảng viền đen) để in nối liền sau phiếu chính, không phải file rời.
export function AttachmentSheet({ data }) {
  const attachments = data.attachments || [];
  return (
    <div className="hv-sheet hv-attach-sheet">
      <div className="hv-head">
        <img src={smcLogo} alt="SMC" />
        <div className="hv-title">
          <h1>ATTACHED EQUIPMENT LIST</h1>
          <p>DANH SÁCH THIẾT BỊ ĐÍNH KÈM</p>
        </div>
        <div className="hv-formno">No.: {data.no}</div>
      </div>
      <div className="hv-reg">
        <span>Full name <i className="hv-vi-inline">(Họ tên)</i>: {data.full_name}</span>
        <span className="hv-no">Ngày: <b>{formatDayMonthYear(data.register_date)}</b></span>
      </div>
      <table className="hv-attach-table">
        <colgroup>
          <col style={{ width: '8%' }} /><col style={{ width: '24%' }} /><col style={{ width: '25%' }} />
          <col style={{ width: '20%' }} /><col style={{ width: '23%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>#</th><th>Device Name</th><th>Serial Number</th><th>Loại</th><th>Model</th>
          </tr>
        </thead>
        <tbody>
          {attachments.map((item, index) => (
            <tr key={item.id}>
              <td className="hv-center">{index + 1}</td>
              <td className="hv-center">{item.ten || '—'}</td>
              <td className="hv-center mono">{item.ma}</td>
              <td className="hv-center">{LOAI_LABELS[item.loai] || item.loai}</td>
              <td className="hv-center">{item.model || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const WINDOWS_OPTIONS = ['Win 11 Professional', 'Win 10 Professional'];
const OFFICE_OPTIONS = ['Office 365', 'Office 2016', 'Office 2019', 'Office 2024'];
const ADAPTER_OPTIONS = ['Adapter Dell 65W', 'PSU C13'];
const PERIPHERALS_OPTIONS = ['Wire Mouse and Keyboard', 'Wireless Dell', 'N/A'];

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
      ['adapter', 'PSU/Adapter', 'select', ADAPTER_OPTIONS],
    ],
  },
  {
    title: 'Bản quyền & thiết bị khác',
    fields: [
      ['windows', 'License - Windows', 'select', WINDOWS_OPTIONS],
      ['office', 'License - Office', 'select', OFFICE_OPTIONS],
      ['ip', 'IP Address'],
      ['peripherals', 'Mouse/Keyboard', 'select', PERIPHERALS_OPTIONS],
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

export function mergeSpecs(current, source, { overwrite }) {
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

// Máy bàn thường kèm màn hình rời — màn hình đã là 1 loại thiết bị có sẵn trong hệ thống (loai: monitor),
// nên tìm theo Serial của chính nó thay vì phải gõ tay model/hãng.
function MonitorPicker({ onPick, onCancel }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get('/devices', { search, loai: 'monitor', page: 1, pageSize: 20 })
        .then((result) => { if (!cancelled) { setRows(result.devices); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search]);

  return (
    <div className="hv-picker-backdrop">
      <div className="hv-picker" role="dialog" aria-label="Thêm màn hình theo Serial">
        <div className="hv-picker-head">
          <b>Thêm màn hình theo Serial</b>
          <button type="button" className="btn-close" aria-label="Close" onClick={onCancel}>×</button>
        </div>
        <p className="hv-picker-help">Tìm đúng màn hình đã có trong hệ thống (loại "Màn hình") để tự điền vào Other devices, không cần gõ tay model/hãng.</p>
        <input className="form-control" autoFocus placeholder="Tìm theo serial, tên, model màn hình..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="hv-picker-list">
          {error && <div className="hv-error">{error}</div>}
          {!error && rows === null && <div className="hv-picker-empty">Đang tải...</div>}
          {!error && rows && rows.length === 0 && <div className="hv-picker-empty">Không có màn hình nào khớp.</div>}
          {rows && rows.map((item) => (
            <button type="button" key={item.id} className="hv-picker-row" onClick={() => onPick(item)}>
              <span className="hv-picker-no">{item.ma}</span>
              <span className="hv-picker-main">
                <b>{item.model || item.ten || '—'}</b>
                <small>{[item.producer, item.ten].filter(Boolean).join(' · ') || 'Chưa có thông tin'}</small>
              </span>
              <span className="hv-picker-who">{item.user_name || item.phong_ban || ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Khi 1 người nhận nhiều thiết bị cùng lúc — tìm & thêm bất kỳ loại thiết bị nào (không chỉ màn hình)
// vào danh sách đính kèm để xuất Excel riêng, tách biệt với ô Other devices trên phiếu.
function AttachmentPicker({ excludeIds, onPick, onCancel }) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get('/devices', { search, page: 1, pageSize: 20 })
        .then((result) => { if (!cancelled) { setRows(result.devices.filter((d) => !excludeIds.has(d.id))); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, excludeIds]);

  return (
    <div className="hv-picker-backdrop">
      <div className="hv-picker" role="dialog" aria-label="Thêm thiết bị đính kèm">
        <div className="hv-picker-head">
          <b>Thêm thiết bị đính kèm</b>
          <button type="button" className="btn-close" aria-label="Close" onClick={onCancel}>×</button>
        </div>
        <p className="hv-picker-help">Tìm và thêm các thiết bị khác cấp kèm cho người này (màn hình, điện thoại...) — dùng để xuất file Excel riêng, không in lên phiếu.</p>
        <input className="form-control" autoFocus placeholder="Tìm theo serial, tên, model..." value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="hv-picker-list">
          {error && <div className="hv-error">{error}</div>}
          {!error && rows === null && <div className="hv-picker-empty">Đang tải...</div>}
          {!error && rows && rows.length === 0 && <div className="hv-picker-empty">Không có thiết bị nào khớp.</div>}
          {rows && rows.map((item) => (
            <button type="button" key={item.id} className="hv-picker-row" onClick={() => onPick(item)}>
              <span className="hv-picker-no">{item.ma}</span>
              <span className="hv-picker-main">
                <b>{item.model || item.ten || '—'}</b>
                <small>{[LOAI_LABELS[item.loai], item.producer].filter(Boolean).join(' · ') || 'Chưa có thông tin'}</small>
              </span>
              <span className="hv-picker-who">{item.user_name || item.phong_ban || ''}</span>
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
  const [monitorPickerOpen, setMonitorPickerOpen] = useState(false);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
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
      setPrintPageSize(HANDOVER_PAGE_CSS);
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

  function handleMonitorPick(monitor) {
    const label = `Monitor : ${monitor.model || monitor.ten} (S/N: ${monitor.ma})`;
    setData((current) => ({ ...current, other: current.other ? `${current.other}, ${label}` : label }));
    setNotice(`Đã thêm màn hình ${monitor.ma} vào Other devices.`);
    setMonitorPickerOpen(false);
  }

  function handleAttachmentPick(item) {
    setData((current) => ({ ...current, attachments: [...(current.attachments || []), item] }));
    setNotice(`Đã thêm ${item.ma} vào danh sách thiết bị đính kèm.`);
    setAttachmentPickerOpen(false);
  }

  function removeAttachment(id) {
    setData((current) => ({ ...current, attachments: (current.attachments || []).filter((item) => item.id !== id) }));
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
                    {group.fields.map(([key, label, type, options]) => (
                      <label key={key} className={key === 'other' ? 'hv-other-field' : undefined}>
                        {label}
                        {key === 'other' && <button type="button" className="hv-monitor-btn" onClick={() => setMonitorPickerOpen(true)}>+ Serial màn hình</button>}
                        {type === 'select' ? (
                          <select className="form-control" value={data[key]} onChange={(event) => { const { value } = event.target; setData((current) => ({ ...current, [key]: value })); }}>
                            {options.map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        ) : (
                          <input className="form-control" type={type || 'text'} value={data[key]} onChange={(event) => { const { value } = event.target; setData((current) => ({ ...current, [key]: value })); }} />
                        )}
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
              <fieldset>
                <legend>Thiết bị đính kèm</legend>
                <p className="hv-attach-help">Khi cấp nhiều thiết bị cho 1 người — thêm vào đây, sẽ tự in thêm 1 trang danh sách này ngay sau phiếu chính khi bấm In phiếu.</p>
                {(data.attachments || []).length > 0 && (
                  <ul className="hv-attach-list">
                    {data.attachments.map((item) => (
                      <li key={item.id}>
                        <span className="mono">{item.ma}</span>
                        <span>{LOAI_LABELS[item.loai] || item.loai}{item.model ? ` · ${item.model}` : ''}</span>
                        <button type="button" onClick={() => removeAttachment(item.id)} aria-label={`Bỏ ${item.ma}`}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="btn-secondary" onClick={() => setAttachmentPickerOpen(true)}>+ Thêm thiết bị</button>
              </fieldset>
            </div>
            <div className="hv-preview">
              <HandoverSheet data={data} />
              {(data.attachments || []).length > 0 && <AttachmentSheet data={data} />}
            </div>
          </div>
          <div className="modal-actions modal-footer">
            {error
              ? <span className="hv-error">{error}</span>
              : notice && <span className="hv-note">{notice}</span>}
            <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)} disabled={busy}>Clone từ phiếu khác</button>
            <button type="button" className="btn-secondary" onClick={handleClose}>Đóng</button>
            <button type="button" className="btn-secondary hv-save" onClick={handleSave} disabled={busy}>{busy ? 'Đang lưu...' : 'Lưu'}</button>
            <button type="button" className="btn-primary" onClick={handlePrint} disabled={busy}>In phiếu</button>
          </div>
          {pickerOpen && <HandoverPicker initialSearch={device?.model || data.model} excludeNo={allocatedRef.current} onPick={handlePick} onCancel={() => setPickerOpen(false)} />}
          {monitorPickerOpen && <MonitorPicker onPick={handleMonitorPick} onCancel={() => setMonitorPickerOpen(false)} />}
          {attachmentPickerOpen && (
            <AttachmentPicker
              excludeIds={new Set([device?.id, ...(data.attachments || []).map((item) => item.id)].filter(Boolean))}
              onPick={handleAttachmentPick}
              onCancel={() => setAttachmentPickerOpen(false)}
            />
          )}
        </div>
      </div>
      {createPortal(
        <div className="handover-print-root">
          <HandoverSheet data={data} />
          {(data.attachments || []).length > 0 && <AttachmentSheet data={data} />}
        </div>,
        document.body,
      )}
    </>
  );
}
