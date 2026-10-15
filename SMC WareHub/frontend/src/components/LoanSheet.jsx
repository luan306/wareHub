import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/client';
import { printHandoverSheets } from '../utils/printPageSize';
import { LOAI_LABELS, LOAI_LABELS_EN } from '../utils/deviceTypes';
import { useT } from '../i18n';
import { useAuth } from '../context/AuthContext';
import smcLogo from '../img/Logo_SMC_Corporation.svg';

export function buildLoanData() {
  return {
    borrower_name: '',
    department: '',
    employee_id: '',
    cost_center: '',
    borrowed_at: toInputValue(new Date()),
    due_at: '',
    notes: '',
    devices: [],
    signature: '',
  };
}

const MANUAL_DEVICE_PRESETS = ['Chuột', 'Bàn phím', 'Thiết bị trình chiếu/Máy chiếu', 'Sạc/Adapter', 'Cáp HDMI/VGA', 'Loa/Tai nghe'];

function toInputValue(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function toApiValue(inputValue) {
  return inputValue ? `${inputValue}:00` : null;
}

export function formatDateTimeDisplay(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function SignaturePad({ onChange }) {
  const { t } = useT();
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const emptyRef = useRef(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#13223f';
  }, []);

  function pos(event) {
    const rect = canvasRef.current.getBoundingClientRect();
    const point = event.touches ? event.touches[0] : event;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  }
  function draw(point) {
    const ctx = canvasRef.current.getContext('2d');
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastRef.current = point;
    emptyRef.current = false;
  }
  function finish() {
    drawingRef.current = false;
    window.removeEventListener('mousemove', onWindowMouseMove);
    window.removeEventListener('mouseup', onWindowMouseUp);
    onChange(emptyRef.current ? '' : canvasRef.current.toDataURL('image/png'));
  }
  function onWindowMouseMove(event) { if (drawingRef.current) draw(pos(event)); }
  function onWindowMouseUp() { if (drawingRef.current) finish(); }
  function startMouse(event) {
    event.preventDefault();
    drawingRef.current = true;
    lastRef.current = pos(event);
    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
  }
  function startTouch(event) {
    event.preventDefault();
    drawingRef.current = true;
    lastRef.current = pos(event);
  }
  function moveTouch(event) {
    if (!drawingRef.current) return;
    event.preventDefault();
    draw(pos(event));
  }
  function endTouch() {
    if (drawingRef.current) finish();
  }
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    emptyRef.current = true;
    onChange('');
  }

  return (
    <div className="sig-pad-wrap">
      <canvas
        ref={canvasRef}
        className="sig-pad-canvas"
        onMouseDown={startMouse}
        onTouchStart={startTouch} onTouchMove={moveTouch} onTouchEnd={endTouch}
      />
      <button type="button" className="btn-secondary sig-pad-clear" onClick={clear}>{t('loan.sigClear')}</button>
    </div>
  );
}

export function LoanSheet({ no, data, returnedAt, createdByName }) {
  const devices = data.devices || [];
  return (
    <div className="hv-sheet">
      <div className="hv-head">
        <img src={smcLogo} alt="SMC" />
        <div className="hv-title">
          <h1>IT EQUIPMENT LOAN SLIP</h1>
          <p>PHIẾU MƯỢN THIẾT BỊ IT</p>
        </div>
        <div className="hv-formno">&nbsp;</div>
      </div>

      <div className="hv-reg">
        <span />
        <span className="hv-no">No.: <b>{no}</b></span>
      </div>

      <table className="hv-info">
        <colgroup><col style={{ width: '22%' }} /><col style={{ width: '28%' }} /><col style={{ width: '22%' }} /><col style={{ width: '28%' }} /></colgroup>
        <tbody>
          <tr>
            <th>Employee ID <i className="hv-vi-inline">(Mã số NV)</i>:</th>
            <td className="hv-center">{data.employee_id || '—'}</td>
            <th>Full name <i className="hv-vi-inline">(Họ Tên)</i>:</th>
            <td className="hv-center">{data.borrower_name}</td>
          </tr>
          <tr>
            <th>Department <i className="hv-vi-inline">(Bộ phận)</i>:</th>
            <td className="hv-center">{data.department || '—'}</td>
            <th>Cost center <i className="hv-vi-inline">(Cost center)</i>:</th>
            <td className="hv-center">{data.cost_center || '—'}</td>
          </tr>
          <tr>
            <th>Borrow time <i className="hv-vi-inline">(Thời gian mượn)</i>:</th>
            <td className="hv-center">{formatDateTimeDisplay(data.borrowed_at)}</td>
            <th>Expected return <i className="hv-vi-inline">(Thời gian trả dự kiến)</i>:</th>
            <td className="hv-center">{data.due_at ? formatDateTimeDisplay(data.due_at) : 'N/A'}</td>
          </tr>
          <tr>
            <th>Actual return <i className="hv-vi-inline">(Ngày trả thực tế)</i>:</th>
            <td className="hv-center" colSpan="3">{returnedAt ? formatDateTimeDisplay(returnedAt) : ' '}</td>
          </tr>
        </tbody>
      </table>

      <div className="hv-band hv-band-gap">DEVICES ON LOAN — THIẾT BỊ CHO MƯỢN</div>
      <table className="hv-attach-table">
        <colgroup>
          <col style={{ width: '8%' }} /><col style={{ width: '27%' }} /><col style={{ width: '25%' }} />
          <col style={{ width: '18%' }} /><col style={{ width: '22%' }} />
        </colgroup>
        <thead>
          <tr><th>#</th><th>Device Name</th><th>Serial Number</th><th>Type</th><th>Model</th></tr>
        </thead>
        <tbody>
          {devices.map((item, index) => (
            <tr key={item.id}>
              <td className="hv-center">{index + 1}</td>
              <td className="hv-center">{item.ten || '—'}</td>
              <td className="hv-center mono">{item.ma || '—'}</td>
              <td className="hv-center">{LOAI_LABELS_EN[item.loai] || item.loai}</td>
              <td className="hv-center">{item.model || '—'}</td>
            </tr>
          ))}
          {devices.length === 0 && <tr><td colSpan="5" className="hv-center">—</td></tr>}
        </tbody>
      </table>

      {data.notes && (
        <>
          <div className="hv-band hv-band-gap">NOTES — GHI CHÚ</div>
          <table className="hv-info"><tbody><tr><td>{data.notes}</td></tr></tbody></table>
        </>
      )}

      <div className="hv-signs">
        <table>
          <colgroup /><thead><tr><th className="hv-sign-title">IT DEPARTMENT — BỘ PHẬN IT</th></tr></thead>
          <tbody><tr className="hv-sign-space"><td className="hv-center">{createdByName}</td></tr></tbody>
        </table>
        <table>
          <thead><tr><th className="hv-sign-title">BORROWER'S SIGNATURE — CHỮ KÝ NGƯỜI MƯỢN</th></tr></thead>
          <tbody>
            <tr className="hv-sign-space">
              <td className="hv-center">
                {data.signature && <img src={data.signature} alt="signature" className="loan-sig-img" />}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function usePickerSearch(load) {
  const [search, setSearch] = useState('');
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

function LoanDevicePicker({ excludeIds, onPick, onCancel }) {
  const { t } = useT();
  const picker = usePickerSearch((search) => api.get('/devices', { search, page: 1, pageSize: 20 }).then((result) => result.devices));
  const rows = picker.rows ? picker.rows.filter((item) => !excludeIds.has(item.id)) : picker.rows;
  return (
    <div className="hv-picker-backdrop">
      <div className="hv-picker" role="dialog" aria-label={t('loan.pick.title')}>
        <div className="hv-picker-head">
          <b>{t('loan.pick.title')}</b>
          <button type="button" className="btn-close" aria-label={t('common.close')} onClick={onCancel}>×</button>
        </div>
        <p className="hv-picker-help">{t('loan.pick.help')}</p>
        <input className="form-control" autoFocus placeholder={t('loan.pick.placeholder')} value={picker.search} onChange={(event) => picker.setSearch(event.target.value)} />
        <div className="hv-picker-list">
          {picker.error && <div className="hv-error">{picker.error}</div>}
          {!picker.error && rows === null && <div className="hv-picker-empty">{t('common.loading')}</div>}
          {!picker.error && rows && rows.length === 0 && <div className="hv-picker-empty">{t('loan.pick.empty')}</div>}
          {rows && rows.map((item) => (
            <button type="button" className="hv-picker-row" key={item.id} onClick={() => onPick(item)}>
              <span className="hv-picker-no">{item.ma}</span>
              <span className="hv-picker-main">
                <b>{item.model || item.ten || '—'}</b>
                <small>{[LOAI_LABELS[item.loai] && t(`loai.${item.loai}`), item.producer].filter(Boolean).join(' · ') || t('loan.pick.noInfo')}</small>
              </span>
              <span className="hv-picker-who">{item.user_name || item.phong_ban || ''}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LdapAutocompleteField({ value, disabled, onChange, onSelect }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState('');
  const boxRef = useRef(null);
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => {
    if (!open) return undefined;
    const query = valueRef.current.trim();
    if (query.length < 2) { setResults(null); setError(''); return undefined; }
    let cancelled = false;
    const timer = setTimeout(() => {
      api.get('/loans/ldap-search', { q: query })
        .then((res) => { if (!cancelled) { setResults(res.results); setError(''); } })
        .catch((err) => { if (!cancelled) setError(err.message); });
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [value, open]);

  useEffect(() => {
    function onOutside(event) { if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false); }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  return (
    <div className="loan-borrower-field" ref={boxRef}>
      <input
        className="form-control"
        value={value}
        disabled={disabled}
        autoComplete="off"
        onFocus={() => setOpen(true)}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
      />
      {open && value.trim().length >= 2 && (
        <div className="loan-borrower-suggest">
          {error && <div className="hv-error">{error}</div>}
          {!error && results === null && <div className="loan-borrower-suggest-empty">{t('common.loading')}</div>}
          {!error && results && results.length === 0 && <div className="loan-borrower-suggest-empty">{t('loan.ldapEmpty')}</div>}
          {results && results.map((match) => (
            <button
              type="button"
              key={match.username}
              className="loan-borrower-suggest-row"
              onClick={() => { onSelect(match); setOpen(false); }}
            >
              <b>{match.full_name}</b>
              <small>{[match.employee_id, match.username, match.department].filter(Boolean).join(' · ')}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LoanModal({ saved, onClose }) {
  const { t } = useT();
  const { user } = useAuth();
  const isReturned = saved?.status === 'returned';
  const editableFields = !saved || !isReturned;
  const createdByName = saved?.created_by_name || user?.full_name || '';
  const [allocated, setAllocated] = useState(saved ? { id: saved.id, no: saved.no } : null);
  const [data, setData] = useState(() => (saved ? {
    borrower_name: saved.borrower_name || '',
    department: saved.department || '',
    employee_id: saved.employee_id || '',
    cost_center: saved.cost_center || '',
    borrowed_at: toInputValue(saved.borrowed_at),
    due_at: toInputValue(saved.due_at),
    notes: saved.data?.notes || '',
    devices: saved.data?.devices || [],
    signature: saved.signature || '',
  } : buildLoanData()));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualNote, setManualNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const isNew = !allocated;

  function updateField(key, value) {
    setData((current) => ({ ...current, [key]: value }));
  }
  function addDevice(item) {
    setData((current) => ({ ...current, devices: [...(current.devices || []), item] }));
    setNotice(t('loan.deviceAdded', { code: item.ma || item.ten }));
  }
  function removeDevice(id) {
    setData((current) => ({ ...current, devices: (current.devices || []).filter((item) => item.id !== id) }));
  }
  function addManualDevice() {
    const name = manualName.trim();
    if (!name) return;
    addDevice({ id: `manual-${Date.now()}`, ma: manualNote.trim() || null, ten: name, loai: 'other', model: null, manual: true });
    setManualName(''); setManualNote(''); setManualOpen(false);
  }
  function addManualPreset(name) {
    addDevice({ id: `manual-${Date.now()}`, ma: null, ten: name, loai: 'other', model: null, manual: true });
  }
  function handleLdapPick(match) {
    setData((current) => ({
      ...current,
      borrower_name: match.full_name,
      employee_id: match.employee_id || current.employee_id,
      department: current.department || match.department || current.department,
      cost_center: current.cost_center || match.cost_center || current.cost_center,
    }));
    setNotice(t('loan.ldapPicked', { name: match.full_name }));
  }

  async function persist() {
    if (isNew) {
      if (!data.borrower_name.trim()) throw new Error(t('loan.errNoBorrower'));
      if ((data.devices || []).length === 0) throw new Error(t('loan.errNoDevice'));
      if (!data.signature) throw new Error(t('loan.errNoSignature'));
      const result = await api.post('/loans', {
        borrower_name: data.borrower_name,
        department: data.department || null,
        employee_id: data.employee_id || null,
        cost_center: data.cost_center || null,
        borrowed_at: toApiValue(data.borrowed_at),
        due_at: toApiValue(data.due_at),
        signature: data.signature,
        data: { devices: data.devices, notes: data.notes },
      });
      setAllocated({ id: result.id, no: result.no });
      return result.no;
    }
    await api.put(`/loans/${allocated.id}`, {
      borrower_name: data.borrower_name,
      department: data.department || null,
      employee_id: data.employee_id || null,
      cost_center: data.cost_center || null,
      due_at: toApiValue(data.due_at),
      data: { devices: data.devices, notes: data.notes },
    });
    return allocated.no;
  }

  async function handleSave() {
    setError(''); setNotice(''); setBusy(true);
    try {
      const no = await persist();
      setNotice(t('loan.saved', { no }));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function handlePrint() {
    setError(''); setNotice(''); setBusy(true);
    try {
      await persist();
      printHandoverSheets();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const sheetNo = allocated?.no || t('loan.noPending');

  return (
    <>
      <div className="modal-backdrop">
        <div className="modal-card hv-modal">
          <div className="modal-header">
            <h2 className="modal-title">{t('loan.title')}{allocated ? ` — ${allocated.no}` : ''}</h2>
            <button type="button" className="btn-close" aria-label={t('common.close')} onClick={onClose}>×</button>
          </div>
          <div className="hv-modal-body">
            <div className="hv-form">
              <fieldset>
                <legend>{t('loan.group.borrower')}</legend>
                <div className="hv-fields">
                  <label>
                    {t('loan.f.employee_id')}
                    <LdapAutocompleteField
                      value={data.employee_id}
                      disabled={!editableFields}
                      onChange={(value) => updateField('employee_id', value)}
                      onSelect={handleLdapPick}
                    />
                  </label>
                  <label>
                    {t('loan.f.borrower_name')}
                    <LdapAutocompleteField
                      value={data.borrower_name}
                      disabled={!editableFields}
                      onChange={(value) => updateField('borrower_name', value)}
                      onSelect={handleLdapPick}
                    />
                  </label>
                  <label>
                    {t('loan.f.department')}
                    <input className="form-control" value={data.department} disabled={!editableFields} onChange={(event) => updateField('department', event.target.value)} />
                  </label>
                  <label>
                    {t('loan.f.cost_center')}
                    <input className="form-control" value={data.cost_center} disabled={!editableFields} onChange={(event) => updateField('cost_center', event.target.value)} />
                  </label>
                  <label>
                    {t('loan.f.borrowed_at')}
                    <input className="form-control" type="datetime-local" value={data.borrowed_at} disabled={!isNew} onChange={(event) => updateField('borrowed_at', event.target.value)} />
                  </label>
                  <label>
                    {t('loan.f.due_at')}
                    <input className="form-control" type="datetime-local" value={data.due_at} disabled={!editableFields} onChange={(event) => updateField('due_at', event.target.value)} />
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>{t('loan.group.devices')}</legend>
                {(data.devices || []).length > 0 && (
                  <ul className="hv-attach-list">
                    {data.devices.map((item) => (
                      <li key={item.id}>
                        <span className="mono">{item.ma || t('loan.manualBadge')}</span>
                        <span>{LOAI_LABELS[item.loai] ? t(`loai.${item.loai}`) : item.loai}{item.model ? ` · ${item.model}` : ''}</span>
                        {editableFields && <button type="button" onClick={() => removeDevice(item.id)} aria-label={t('loan.removeItem', { code: item.ma || item.ten })}>×</button>}
                      </li>
                    ))}
                  </ul>
                )}
                {editableFields && !manualOpen && (
                  <div className="loan-device-add-row">
                    <button type="button" className="btn-secondary" onClick={() => setPickerOpen(true)}>{t('loan.addDevice')}</button>
                    <button type="button" className="btn-secondary" onClick={() => setManualOpen(true)}>{t('loan.addManualDevice')}</button>
                  </div>
                )}
                {editableFields && (
                  <div className="loan-preset-row">
                    {MANUAL_DEVICE_PRESETS.map((name) => (
                      <button type="button" key={name} className="loan-preset-chip" onClick={() => addManualPreset(name)}>+ {name}</button>
                    ))}
                  </div>
                )}
                {editableFields && manualOpen && (
                  <div className="loan-manual-form">
                    <input className="form-control" placeholder={t('loan.manualNamePlaceholder')} value={manualName} onChange={(event) => setManualName(event.target.value)} autoFocus />
                    <input className="form-control" placeholder={t('loan.manualNotePlaceholder')} value={manualNote} onChange={(event) => setManualNote(event.target.value)} />
                    <div className="loan-manual-actions">
                      <button type="button" className="btn-secondary" onClick={() => { setManualOpen(false); setManualName(''); setManualNote(''); }}>{t('common.close')}</button>
                      <button type="button" className="btn-primary" onClick={addManualDevice} disabled={!manualName.trim()}>{t('loan.addManualConfirm')}</button>
                    </div>
                  </div>
                )}
              </fieldset>
              <fieldset>
                <legend>{t('loan.group.notes')}</legend>
                <div className="hv-fields">
                  <label className="hv-other-field">
                    {t('loan.f.notes')}
                    <input className="form-control" value={data.notes} disabled={!editableFields} onChange={(event) => updateField('notes', event.target.value)} />
                  </label>
                </div>
              </fieldset>
              <fieldset>
                <legend>{t('loan.group.signature')}</legend>
                {isNew ? (
                  <SignaturePad onChange={(value) => updateField('signature', value)} />
                ) : data.signature ? (
                  <img src={data.signature} alt="signature" className="loan-sig-img loan-sig-saved" />
                ) : (
                  <p className="hv-attach-help">{t('loan.noSignature')}</p>
                )}
              </fieldset>
            </div>
            <div className="hv-preview">
              <LoanSheet no={sheetNo} data={data} returnedAt={saved?.returned_at} createdByName={createdByName} />
            </div>
          </div>
          <div className="modal-actions modal-footer">
            {error ? <span className="hv-error">{error}</span> : notice && <span className="hv-note">{notice}</span>}
            <button type="button" className="btn-secondary" onClick={onClose}>{t('common.close')}</button>
            {editableFields && <button type="button" className="btn-secondary hv-save" onClick={handleSave} disabled={busy}>{busy ? t('hv.saving') : t('common.save')}</button>}
            <button type="button" className="btn-primary" onClick={handlePrint} disabled={busy}>{t('hv.printSlip')}</button>
          </div>
          {pickerOpen && (
            <LoanDevicePicker
              excludeIds={new Set((data.devices || []).map((item) => item.id))}
              onPick={addDevice}
              onCancel={() => setPickerOpen(false)}
            />
          )}
        </div>
      </div>
      {createPortal(
        <div className="handover-print-root">
          <LoanSheet no={sheetNo} data={data} returnedAt={saved?.returned_at} createdByName={createdByName} />
        </div>,
        document.body,
      )}
    </>
  );
}
