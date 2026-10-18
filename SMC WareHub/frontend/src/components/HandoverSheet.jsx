import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../api/client';
import { printHandoverSheets } from '../utils/printPageSize';
import { LOAI_LABELS, LOAI_LABELS_EN } from '../utils/deviceTypes';
import { isoToday } from '../utils/date';
import { useT } from '../i18n';
import { LdapAutocompleteField } from './LdapAutocompleteField';
import smcLogo from '../img/Logo_SMC_Corporation.svg';

const FORM_CODE = 'ITFGE-00459_19_A';
const FORM_CODE_PHONE = 'ITFGE-00459_20_A';

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

const PHONE_RESPONSIBILITIES = RESPONSIBILITIES.filter(
  (item) => typeof item !== 'string' || !/mustn't (change the hardware|install any software)/.test(item),
);

function formatDayMonthYear(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return match ? `${Number(match[3])}/${Number(match[2])}/${match[1]}` : iso || '';
}

export function buildHandoverData(device) {
  const isPhone = device.loai === 'phone';
  return {
    kind: isPhone ? 'phone' : 'computer',
    register_date: isoToday(),
    no: '',
    full_name: device.user_name || '',
    department: device.phong_ban || '',
    employee_id: '',
    transfer_date: isoToday(),
    computer_name: device.ten || '',
    service_tag: device.ma || '',
    main_loai: device.loai || '',
    storage: device.storage || '',
    ram: device.ram || '',
    cpu: device.cpu || '',
    adapter: isPhone ? 'SAMSUNG Fast Charge Adapter' : 'Adapter Dell 65W',
    phone_number: (isPhone && device.phone_number) || 'N/A',
    windows: isPhone ? 'N/A' : device.os_name || 'Win 11 Professional',
    office: isPhone ? 'N/A' : device.office_name || 'Office 365',
    peripherals: isPhone ? 'N/A' : 'Wire Mouse and Keyboard',
    monitor: '',
    monitors: [],
    model: device.model || '',
    other: 'N/A',
    attachments: [],
  };
}

function attachmentRows(data) {
  const extra = data.attachments || [];
  if (extra.length === 0) return extra;
  return [{ id: 'main', ten: data.computer_name, ma: data.service_tag, loai: data.main_loai || (data.kind === 'phone' ? 'phone' : 'laptop'), model: data.model }, ...extra];
}

function serviceTagDisplay(data, singleValue = data.service_tag) {
  const rows = attachmentRows(data);
  return rows.length > 1 ? `Please refer to the attached file (${rows.length} ea)` : singleValue;
}

function monitorDisplay(data) {
  if (data.monitors?.length > 0) return data.monitors.length > 1 ? `Please refer to the attached file (${data.monitors.length} ea)` : data.monitors[0].label;
  const raw = (data.monitor || '').trim();
  if (!raw) return 'N/A';
  const count = raw.match(/\(S\/N: /g)?.length || 1;
  return count > 1 ? `Please refer to the attached file (${count} ea)` : raw;
}

function printedRows(data) {
  const devices = attachmentRows(data);
  const monitors = (data.monitors || []).map((m) => ({ id: `monitor-${m.id}`, ten: m.ten, ma: m.ma, loai: 'monitor', model: m.model }));
  if (devices.length === 0 && monitors.length === 0) return [];
  const base = devices.length > 0
    ? devices
    : [{ id: 'main', ten: data.computer_name, ma: data.service_tag, loai: data.main_loai || (data.kind === 'phone' ? 'phone' : 'laptop'), model: data.model }];
  return [...base, ...monitors];
}
export function hasPrintedAttachments(data) {
  return (data.attachments?.length || 0) > 0 || (data.monitors?.length || 0) > 0;
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
  const isPhone = data.kind === 'phone';
  const responsibilities = isPhone ? PHONE_RESPONSIBILITIES : RESPONSIBILITIES;
  return (
    <div className="hv-sheet">
      <div className="hv-head">
        <img src={smcLogo} alt="SMC" />
        <div className="hv-title">
          <h1>MINUTES OF EQUIPMENT HANDOVER</h1>
          <p>PHIẾU BÀN GIAO THIẾT BỊ</p>
        </div>
        <div className="hv-formno">管理No: {isPhone ? FORM_CODE_PHONE : FORM_CODE}</div>
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
          <tr><th>DEVICE NAME</th><td colSpan="2" className="hv-center">{serviceTagDisplay(data, data.computer_name)}</td></tr>
          <tr><th>SERIAL NUMBER</th><td colSpan="2" className="hv-center">{serviceTagDisplay(data)}</td></tr>
          <tr><th>MODEL</th><td colSpan="2" className="hv-center">{serviceTagDisplay(data, data.model)}</td></tr>
          <tr><th>HDD/SSD</th><td colSpan="2" className="hv-center">{data.storage || 'N/A'}</td></tr>
          <tr><th>RAM</th><td colSpan="2" className="hv-center">{data.ram || 'N/A'}</td></tr>
          <tr><th>CPU</th><td colSpan="2" className="hv-center">{data.cpu || 'N/A'}</td></tr>
          <tr><th>PSU/ADAPTER</th><td colSpan="2" className="hv-center">{data.adapter}</td></tr>
          <tr>
            <th rowSpan="2">LICENSE</th>
            <td className="hv-center hv-sub">Windows</td><td className="hv-center">{data.windows}</td>
          </tr>
          <tr><td className="hv-center hv-sub">Office</td><td className="hv-center">{data.office}</td></tr>
          <tr>
            <th rowSpan={isPhone ? 4 : 3}>OTHER DEVICE</th>
            <td className="hv-center hv-sub">Mouse/Keyboard</td><td className="hv-center">{data.peripherals}</td>
          </tr>
          <tr><td className="hv-center hv-sub">Monitor</td><td className="hv-center">{monitorDisplay(data)}</td></tr>
          {isPhone && <tr><td className="hv-center hv-sub">Mobile Phone Number</td><td className="hv-center">{data.phone_number}</td></tr>}
          <tr><td className="hv-center hv-sub">Others</td><td className="hv-center">{data.other}</td></tr>
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
                {responsibilities.map((item, index) => (
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

const ATTACH_ROWS_PER_PAGE = 34;

export function AttachmentSheet({ data }) {
  const attachments = printedRows(data);
  const pageCount = Math.max(1, Math.ceil(attachments.length / ATTACH_ROWS_PER_PAGE));
  const pages = Array.from({ length: pageCount }, (_, p) => attachments.slice(p * ATTACH_ROWS_PER_PAGE, (p + 1) * ATTACH_ROWS_PER_PAGE));
  return (
    <>
      {pages.map((rows, pageIndex) => (
        <div className="hv-sheet hv-attach-sheet" key={pageIndex}>
          <div className="hv-head">
            <img src={smcLogo} alt="SMC" />
            <div className="hv-title">
              <h1>ATTACHED EQUIPMENT LIST</h1>
              <p>DANH SÁCH THIẾT BỊ ĐÍNH KÈM</p>
            </div>
            <div className="hv-formno">No.: {data.no}{pageCount > 1 ? ` — page ${pageIndex + 1}/${pageCount}` : ''}</div>
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
                <th>#</th><th>Device Name</th><th>Serial Number</th><th>Type</th><th>Model</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={item.id}>
                  <td className="hv-center">{pageIndex * ATTACH_ROWS_PER_PAGE + index + 1}</td>
                  <td className="hv-center">{item.ten || '—'}</td>
                  <td className="hv-center mono">{item.ma}</td>
                  <td className="hv-center">{LOAI_LABELS_EN[item.loai] || item.loai}</td>
                  <td className="hv-center">{item.model || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

const WINDOWS_OPTIONS = ['Win 11 Professional', 'Win 10 Professional', 'N/A'];
const OFFICE_OPTIONS = ['Office 365', 'Office 2016', 'Office 2019', 'Office 2024', 'N/A'];
const ADAPTER_OPTIONS = ['Adapter Dell 65W', 'Adapter Dell 45W', 'PSU C13', 'SAMSUNG Fast Charge Adapter', 'N/A'];
const PHONE_ADAPTER_OPTIONS = ['SAMSUNG Fast Charge Adapter', 'N/A'];
const PERIPHERALS_OPTIONS = ['Wire Mouse and Keyboard', 'Wireless Dell', 'N/A'];

const INFO_GROUPS = [
  {
    titleKey: 'hv.group.slip',
    fields: [
      ['register_date', 'hv.f.register_date', 'date'],
      ['transfer_date', 'hv.f.transfer_date', 'date'],
    ],
  },
  {
    titleKey: 'hv.group.recipient',
    fields: [
      ['full_name', 'hv.f.full_name'],
      ['employee_id', 'hv.f.employee_id'],
      ['department', 'hv.f.department'],
    ],
  },
];

const COMPUTER_FIELD_GROUPS = [
  ...INFO_GROUPS,
  {
    titleKey: 'hv.group.device',
    fields: [
      ['computer_name', 'Device name'],
      ['service_tag', 'Serial number'],
      ['model', 'Model'],
      ['cpu', 'CPU'],
      ['ram', 'RAM'],
      ['storage', 'HDD/SSD'],
      ['adapter', 'PSU/Adapter', 'select', ADAPTER_OPTIONS],
    ],
  },
  {
    titleKey: 'hv.group.licenses',
    fields: [
      ['windows', 'License - Windows', 'select', WINDOWS_OPTIONS],
      ['office', 'License - Office', 'select', OFFICE_OPTIONS],
      ['peripherals', 'Mouse/Keyboard', 'select', PERIPHERALS_OPTIONS],
      ['monitor', 'Monitor'],
      ['other', 'Others'],
    ],
  },
];

const PHONE_FIELD_GROUPS = [
  ...INFO_GROUPS,
  {
    titleKey: 'hv.group.device',
    fields: [
      ['model', 'Model'],
      ['service_tag', 'IME/SN'],
      ['phone_number', 'Mobile phone number'],
      ['cpu', 'CPU'],
      ['ram', 'RAM'],
      ['storage', 'HDD/SSD'],
      ['adapter', 'Adapter', 'select', PHONE_ADAPTER_OPTIONS],
      ['windows', 'License - Windows', 'select', WINDOWS_OPTIONS],
      ['office', 'License - Office', 'select', OFFICE_OPTIONS],
      ['peripherals', 'Mouse/Keyboard', 'select', PERIPHERALS_OPTIONS],
      ['monitor', 'Monitor'],
      ['other', 'Other devices'],
    ],
  },
];

const SPEC_FIELDS = ['cpu', 'ram', 'storage', 'adapter', 'windows', 'office', 'peripherals', 'monitor', 'other'];
const draftKey = (deviceId) => `warehub-handover-draft-${deviceId}`;

function readDraft(deviceId) {
  try {
    const parsed = JSON.parse(localStorage.getItem(draftKey(deviceId)) || 'null');
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

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

function usePickerSearch(initialSearch, load) {
  const [search, setSearch] = useState(initialSearch);
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      loadRef.current(search)
        .then((result) => { if (!cancelled) { setRows(result); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search]);

  return { search, setSearch, rows, error };
}

function PickerDialog({ title, help, placeholder, emptyText, picker, onCancel, renderRow }) {
  const { t } = useT();
  const { search, setSearch, rows, error } = picker;
  return (
    <div className="hv-picker-backdrop">
      <div className="hv-picker" role="dialog" aria-label={title}>
        <div className="hv-picker-head">
          <b>{title}</b>
          <button type="button" className="btn-close" aria-label={t('common.close')} onClick={onCancel}>×</button>
        </div>
        <p className="hv-picker-help">{help}</p>
        <input className="form-control" autoFocus placeholder={placeholder} value={search} onChange={(event) => setSearch(event.target.value)} />
        <div className="hv-picker-list">
          {error && <div className="hv-error">{error}</div>}
          {!error && rows === null && <div className="hv-picker-empty">{t('common.loading')}</div>}
          {!error && rows && rows.length === 0 && <div className="hv-picker-empty">{emptyText}</div>}
          {rows && rows.map(renderRow)}
        </div>
      </div>
    </div>
  );
}

function PickerRow({ no, title, subtitle, who, onClick }) {
  return (
    <button type="button" className="hv-picker-row" onClick={onClick}>
      <span className="hv-picker-no">{no}</span>
      <span className="hv-picker-main">
        <b>{title}</b>
        <small>{subtitle}</small>
      </span>
      <span className="hv-picker-who">{who}</span>
    </button>
  );
}

function HandoverPicker({ initialSearch, excludeId, onPick, onCancel }) {
  const { t } = useT();
  const picker = usePickerSearch(initialSearch || '', (search) => (
    api.get('/handovers', { search, page: 1, pageSize: 20 }).then((result) => result.handovers.filter((item) => item.id !== excludeId))
  ));
  return (
    <PickerDialog
      title={t('hv.pick.cloneTitle')}
      help={t('hv.pick.cloneHelp')}
      placeholder={t('hv.pick.clonePlaceholder')}
      emptyText={t('hv.pick.cloneEmpty')}
      picker={picker}
      onCancel={onCancel}
      renderRow={(item) => (
        <PickerRow
          key={item.id}
          no={item.no}
          title={item.data?.model || '—'}
          subtitle={[item.data?.cpu, item.data?.ram, item.data?.storage].filter(Boolean).join(' · ') || t('hv.pick.noSpecs')}
          who={item.full_name || item.device_ma || ''}
          onClick={() => onPick(item)}
        />
      )}
    />
  );
}

function MonitorPicker({ excludeIds, onPick, onCancel }) {
  const { t } = useT();
  const picker = usePickerSearch('', (search) => (
    api.get('/devices', { search, loai: 'monitor', page: 1, pageSize: 20 }).then((result) => result.devices)
  ));
  const filteredPicker = { ...picker, rows: picker.rows ? picker.rows.filter((item) => !excludeIds.has(item.id)) : picker.rows };
  return (
    <PickerDialog
      title={t('hv.pick.monitorTitle')}
      help={t('hv.pick.monitorHelp')}
      placeholder={t('hv.pick.monitorPlaceholder')}
      emptyText={t('hv.pick.monitorEmpty')}
      picker={filteredPicker}
      onCancel={onCancel}
      renderRow={(item) => (
        <PickerRow
          key={item.id}
          no={item.ma}
          title={item.model || item.ten || '—'}
          subtitle={[item.producer, item.ten].filter(Boolean).join(' · ') || t('hv.pick.noInfo')}
          who={item.user_name || item.phong_ban || ''}
          onClick={() => onPick(item)}
        />
      )}
    />
  );
}

function AttachmentPicker({ excludeIds, onPick, onCancel }) {
  const { t } = useT();
  const picker = usePickerSearch('', (search) => (
    api.get('/devices', { search, page: 1, pageSize: 20 }).then((result) => result.devices)
  ));
  const filteredPicker = { ...picker, rows: picker.rows ? picker.rows.filter((item) => !excludeIds.has(item.id)) : picker.rows };
  return (
    <PickerDialog
      title={t('hv.pick.attachTitle')}
      help={t('hv.pick.attachHelp')}
      placeholder={t('hv.pick.attachPlaceholder')}
      emptyText={t('hv.pick.attachEmpty')}
      picker={filteredPicker}
      onCancel={onCancel}
      renderRow={(item) => (
        <PickerRow
          key={item.id}
          no={item.ma}
          title={item.model || item.ten || '—'}
          subtitle={[LOAI_LABELS[item.loai] && t(`loai.${item.loai}`), item.producer].filter(Boolean).join(' · ') || t('hv.pick.noInfo')}
          who={item.user_name || item.phong_ban || ''}
          onClick={() => onPick(item)}
        />
      )}
    />
  );
}

export function NewHandoverPicker({ onPick, onCancel }) {
  const { t } = useT();
  const picker = usePickerSearch('', (search) => (
    api.get('/devices', { search, page: 1, pageSize: 20 }).then((result) => result.devices)
  ));
  return (
    <PickerDialog
      title={t('hv.pick.newTitle')}
      help={t('hv.pick.newHelp')}
      placeholder={t('hv.pick.newPlaceholder')}
      emptyText={t('hv.pick.newEmpty')}
      picker={picker}
      onCancel={onCancel}
      renderRow={(item) => (
        <PickerRow
          key={item.id}
          no={item.ma}
          title={item.model || item.ten || '—'}
          subtitle={[LOAI_LABELS[item.loai] && t(`loai.${item.loai}`), item.producer].filter(Boolean).join(' · ') || t('hv.pick.noInfo')}
          who={item.user_name || item.phong_ban || ''}
          onClick={() => onPick(item)}
        />
      )}
    />
  );
}

export function HandoverModal({ device, saved, extraAttachments, onClose }) {
  const { t } = useT();
  const deviceId = saved ? saved.device_id : device?.id;
  const draftEnabled = !saved && deviceId != null;

  const [initial] = useState(() => {
    if (saved) return { draft: null, data: { ...buildHandoverData(device || {}), ...(saved.data || {}), no: saved.no } };
    const draft = draftEnabled ? readDraft(deviceId) : null;
    const base = { ...buildHandoverData(device), ...(draft || {}) };
    if (extraAttachments?.length) base.attachments = extraAttachments;
    return { draft, data: base };
  });
  const [data, setData] = useState(initial.data);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issued, setIssued] = useState(Boolean(saved));
  const [manualNo, setManualNo] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [monitorPickerOpen, setMonitorPickerOpen] = useState(false);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  const allocatedRef = useRef(saved ? { id: saved.id, no: saved.no } : null);
  const savedRef = useRef(false);

  function handleClose() {
    if (savedRef.current && draftEnabled) {
      try { localStorage.removeItem(draftKey(deviceId)); } catch {}
    }
    onClose();
  }

  const pickerOpenRef = useRef(pickerOpen);
  pickerOpenRef.current = pickerOpen;
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !pickerOpenRef.current) handleCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!draftEnabled) return;
    const { no, register_date, transfer_date, ...draft } = data;
    try { localStorage.setItem(draftKey(deviceId), JSON.stringify(draft)); } catch {}
  }, [data, deviceId, draftEnabled]);

  useEffect(() => {
    if (saved || initial.draft || deviceId == null) return undefined;
    let cancelled = false;
    api.get('/handovers/latest', { device_id: deviceId, model: device?.model || '' })
      .then((result) => {
        if (cancelled || !result.found || !result.data) return;
        setData((current) => mergeSpecs(current, result.data, { overwrite: false }));
        if (result.source === 'model') setNotice(t('hv.autoFilled', { no: result.no }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [saved, initial.draft, deviceId, device?.model]);

  useEffect(() => {
    if (manualNo) return undefined;
    const allocated = allocatedRef.current;
    if (allocated && allocated.no.startsWith(monthPrefix(data.register_date))) {
      setIssued(true);
      setData((current) => (current.no === allocated.no ? current : { ...current, no: allocated.no }));
      return undefined;
    }
    setIssued(false);
    let cancelled = false;
    api.get('/handovers/next-no', { date: data.register_date })
      .then((result) => { if (!cancelled) setData((current) => ({ ...current, no: result.no })); })
      .catch(() => { if (!cancelled) setData((current) => ({ ...current, no: '' })); });
    return () => { cancelled = true; };
  }, [data.register_date, manualNo]);

  function updateNoField(value) {
    setManualNo(value.trim().length > 0);
    updateField('no', value);
  }

  async function persist() {
    const { no: shownNo, ...payload } = data;
    let existing = allocatedRef.current && (manualNo || allocatedRef.current.no.startsWith(monthPrefix(data.register_date))) ? allocatedRef.current : null;
    let no, id;
    if (existing) {
      const result = await api.put(`/handovers/${existing.id}`, { full_name: data.full_name, data: payload, no: manualNo && shownNo && shownNo !== existing.no ? shownNo : null });
      no = result.no; id = result.id;
    } else {
      const result = await api.post('/handovers', { device_id: deviceId ?? null, register_date: data.register_date || null, full_name: data.full_name, data: payload, no: manualNo ? (shownNo || null) : null });
      no = result.no; id = result.id;
    }
    allocatedRef.current = { id, no };
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
      setNotice(t('hv.saved', { no }));
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
      printHandoverSheets();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function updateField(key, value) {
    setData((current) => ({ ...current, [key]: value }));
  }

  function handlePick(item) {
    setData((current) => mergeSpecs(current, item.data, { overwrite: true }));
    setNotice(t('hv.picked', { no: item.no }));
    setPickerOpen(false);
  }

  function handleLdapPick(match) {
    setData((current) => ({
      ...current,
      full_name: match.full_name,
      employee_id: match.employee_id || current.employee_id,
      department: current.department || match.department || current.department,
    }));
    setNotice(t('hv.ldapPicked', { name: match.full_name }));
  }

  function handleMonitorPick(monitor) {
    const label = `${monitor.model || monitor.ten} (S/N: ${monitor.ma})`;
    setData((current) => {
      const monitors = [...(current.monitors || []), { id: monitor.id, ten: monitor.ten, ma: monitor.ma, model: monitor.model, label }];
      return { ...current, monitors, monitor: monitors.map((m) => m.label).join(', ') };
    });
    setNotice(t('hv.monitorAdded', { code: monitor.ma }));
  }

  function removeMonitor(id) {
    setData((current) => {
      const monitors = (current.monitors || []).filter((m) => m.id !== id);
      return { ...current, monitors, monitor: monitors.map((m) => m.label).join(', ') };
    });
  }

  function handleCaseFill() {
    const count = attachmentRows(data).length || 1;
    const text = `Case for ${data.model || '...'}${count > 1 ? ` (${count}ea)` : ''}`;
    setData((current) => ({ ...current, other: text }));
    setNotice(t('hv.caseFilled'));
  }

  function handleAttachmentPick(item) {
    setData((current) => ({ ...current, attachments: [...(current.attachments || []), item] }));
    setNotice(t('hv.attachAdded', { code: item.ma }));
  }

  function removeAttachment(id) {
    setData((current) => ({ ...current, attachments: (current.attachments || []).filter((item) => item.id !== id) }));
  }

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-card hv-modal">
          <div className="modal-header">
            <h2 className="modal-title">{t('hv.title')}{saved ? ` — ${saved.no}` : ''}</h2>
            <button type="button" className="btn-close" aria-label={t('common.close')} onClick={handleClose}>×</button>
          </div>
          <div className="hv-modal-body">
            <div className="hv-form">
              {(data.kind === 'phone' ? PHONE_FIELD_GROUPS : COMPUTER_FIELD_GROUPS).map((group) => (
                <fieldset key={group.titleKey}>
                  <legend>{t(group.titleKey)}</legend>
                  <div className="hv-fields">
                    {group.fields.map(([key, label, type, options]) => (
                      <label key={key} className={key === 'other' ? 'hv-other-field' : undefined}>
                        {label.startsWith('hv.') ? t(label) : label}
                        {key === 'monitor' && <button type="button" className="hv-monitor-btn" onClick={() => setMonitorPickerOpen(true)}>{t('hv.monitorSerial')}</button>}
                        {key === 'other' && data.kind === 'phone' && <button type="button" className="hv-monitor-btn" onClick={handleCaseFill}>{t('hv.caseByModel')}</button>}
                        {key === 'monitor' && (data.monitors || []).length > 0 ? (
                          <ul className="hv-attach-list">
                            {data.monitors.map((m) => (
                              <li key={m.id}>
                                <span className="mono">{m.ma}</span>
                                <span>{m.label}</span>
                                <button type="button" onClick={() => removeMonitor(m.id)} aria-label={t('hv.removeItem', { code: m.ma })}>×</button>
                              </li>
                            ))}
                          </ul>
                        ) : type === 'select' ? (
                          <select className="form-control" value={data[key]} onChange={(event) => updateField(key, event.target.value)}>
                            {(data[key] && !options.includes(data[key]) ? [data[key], ...options] : options).map((option) => <option key={option} value={option}>{option}</option>)}
                          </select>
                        ) : key === 'full_name' || key === 'employee_id' ? (
                          <LdapAutocompleteField
                            value={data[key]}
                            searchPath="/handovers/ldap-search"
                            emptyText={t('hv.ldapEmpty')}
                            onChange={(value) => updateField(key, value)}
                            onSelect={handleLdapPick}
                          />
                        ) : (
                          <input
                            className="form-control"
                            type={type || 'text'}
                            value={data[key]}
                            placeholder={key === 'monitor' ? t('hv.monitorPlaceholder') : undefined}
                            onChange={(event) => updateField(key, event.target.value)}
                          />
                        )}
                      </label>
                    ))}
                    {group.titleKey === 'hv.group.slip' && (
                      <label className="hv-no-field">
                        {t('hv.noField')}
                        <input className="form-control" value={data.no} maxLength={12} onChange={(event) => updateNoField(event.target.value)} />
                        <span className="hv-hint">{manualNo ? t('hv.noManual') : issued ? t('hv.noIssued') : t('hv.noPending')}</span>
                      </label>
                    )}
                  </div>
                </fieldset>
              ))}
              <fieldset>
                <legend>{t('hv.group.attachments')}</legend>
                <p className="hv-attach-help">{t('hv.attachHelp')}{data.kind === 'phone' && t('hv.attachHelpPhone')}</p>
                {(data.attachments || []).length > 0 && (
                  <ul className="hv-attach-list">
                    {data.attachments.map((item) => (
                      <li key={item.id}>
                        <span className="mono">{item.ma}</span>
                        <span>{LOAI_LABELS[item.loai] ? t(`loai.${item.loai}`) : item.loai}{item.model ? ` · ${item.model}` : ''}</span>
                        <button type="button" onClick={() => removeAttachment(item.id)} aria-label={t('hv.removeItem', { code: item.ma })}>×</button>
                      </li>
                    ))}
                  </ul>
                )}
                <button type="button" className="btn-secondary" onClick={() => setAttachmentPickerOpen(true)}>{t('hv.addDevice')}</button>
              </fieldset>
            </div>
            <div className="hv-preview">
              <HandoverSheet data={data} />
              {hasPrintedAttachments(data) && <AttachmentSheet data={data} />}
            </div>
          </div>
          <div className="modal-actions modal-footer">
            {error
              ? <span className="hv-error">{error}</span>
              : notice && <span className="hv-note">{notice}</span>}
            <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)} disabled={busy}>{t('hv.cloneFrom')}</button>
            <button type="button" className="btn-secondary" onClick={handleClose}>{t('common.close')}</button>
            <button type="button" className="btn-secondary hv-save" onClick={handleSave} disabled={busy}>{busy ? t('hv.saving') : t('common.save')}</button>
            <button type="button" className="btn-primary" onClick={handlePrint} disabled={busy}>{t('hv.printSlip')}</button>
          </div>
          {pickerOpen && <HandoverPicker initialSearch={device?.model || data.model} excludeId={allocatedRef.current?.id} onPick={handlePick} onCancel={() => setPickerOpen(false)} />}
          {monitorPickerOpen && (
            <MonitorPicker
              excludeIds={new Set((data.monitors || []).map((m) => m.id))}
              onPick={handleMonitorPick}
              onCancel={() => setMonitorPickerOpen(false)}
            />
          )}
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
          {hasPrintedAttachments(data) && <AttachmentSheet data={data} />}
        </div>,
        document.body,
      )}
    </>
  );
}
