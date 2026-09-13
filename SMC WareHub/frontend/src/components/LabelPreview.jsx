import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import smcLogo from '../img/Logo_SMC_Corporation.svg';

const SMC_LOGO_URL = smcLogo;
const FIT_TEXT_MAX_SIZE = 20;
const FIT_TEXT_MIN_SIZE = 12;

export function qrPayload(device) {
  return [device.ma, device.model || device.ten, device.cpu, device.ram, device.storage]
    .map((value) => String(value || '').replace(/[$\r\n]/g, ' ').trim())
    .join('$');
}

// Shrinks its own font-size until the text fits on one line within the cell (never truncates
// with an ellipsis, and never changes the label's fixed frame size). If it's still too long
// at the smallest readable size, it wraps onto a second line instead of clipping mid-word.
function FitText({ text }) {
  const ref = useRef(null);
  const [style, setStyle] = useState({ fontSize: FIT_TEXT_MAX_SIZE, whiteSpace: 'nowrap' });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.whiteSpace = 'nowrap';

    // Binary search the largest font size that still fits on one line — far fewer
    // forced-reflow measurements than stepping down 1px at a time, which matters
    // when a print batch renders many labels (each with up to 3 of these) at once.
    const fits = (size) => {
      el.style.fontSize = `${size}px`;
      return el.scrollWidth <= el.clientWidth;
    };

    let size = FIT_TEXT_MAX_SIZE;
    if (!fits(size)) {
      let lo = FIT_TEXT_MIN_SIZE;
      let hi = FIT_TEXT_MAX_SIZE;
      while (lo < hi) {
        const mid = Math.ceil((lo + hi) / 2);
        if (fits(mid)) lo = mid; else hi = mid - 1;
      }
      size = lo;
      fits(size);
    }

    const whiteSpace = el.scrollWidth > el.clientWidth ? 'normal' : 'nowrap';
    el.style.whiteSpace = whiteSpace;
    setStyle({ fontSize: size, whiteSpace });
  }, [text]);

  return <div ref={ref} className="fit-text" style={style}>{text}</div>;
}

function DeviceLabelTable({ device, registeredText, preview = false }) {
  return (
    <table className={`print-preview-table device-label-table${preview ? ' device-label-table-preview' : ''}`}>
      <tbody>
        <tr>
          <td className="preview-logo-cell">
            <img src={SMC_LOGO_URL} alt="SMC" />
          </td>
          <td className="preview-field">Device Name</td>
          <td className="preview-value"><FitText text={device.ten || 'N/A'} /></td>
        </tr>
        <tr>
          <td rowSpan="3" className="preview-qr-cell">
            <QRCodeCanvas value={qrPayload(device)} size={124} level="M" />
          </td>
          <td className="preview-field">Model</td>
          <td className="preview-value"><FitText text={device.model || 'N/A'} /></td>
        </tr>
        <tr>
          <td className="preview-field">User Name</td>
          <td className="preview-value"><FitText text={device.user_name || device.phong_ban || 'N/A'} /></td>
        </tr>
        <tr>
          <td className="preview-field">Registered</td>
          <td className="preview-value">{registeredText || 'N/A'}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function LabelPreview({ device, printMode = false }) {
  const qrSize = 180;
  const registered = device.registered_at || device.created_at;
  const registeredText = registered
    ? new Date(registered).toLocaleDateString('en-CA')
    : 'N/A';

  return (
    <div className={printMode ? 'print-page' : undefined}>
      {device.kho === '24' ? (
        <DeviceLabelTable device={device} registeredText={registeredText} preview={!printMode} />
      ) : (
        <div className={`tem tem-12 tem-12-qr-only${!printMode ? ' tem-12-preview' : ''}`}>
          <div className="phone-label phone-label-qr-only">
            <QRCodeCanvas
              value={qrPayload(device)}
              size={qrSize}
              level="M"
              imageSettings={{ src: SMC_LOGO_URL, height: qrSize * 0.16, width: qrSize * 0.16, excavate: true }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function PrintLabelModal({ device, open, onClose, onPrint }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    if (open) {
      setDate(new Date().toISOString().slice(0, 10));
    }
  }, [open, device]);

  if (!open || !device) return null;

  return (
    <div className="print-label-modal-backdrop" onClick={onClose}>
      <div className="print-label-modal" onClick={(event) => event.stopPropagation()}>
        <div className="print-label-header modal-header">
          <h2 className="modal-title">Print Label</h2>
          <button className="print-modal-close btn-close" type="button" aria-label="Close" onClick={onClose}>×</button>
        </div>

        <div className="print-label-form">
          <label htmlFor="print-date">QR Code Printing Date</label>
          <div className="print-date-input">
            <input id="print-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="print-label-review">
          <h6 className="review-title">Review</h6>
          <div className="print-preview-wrap">
            <LabelPreview device={{ ...device, registered_at: date }} />
          </div>
        </div>

        <div className="print-label-actions">
          <button type="button" className="print-close-btn" onClick={onClose}>Close</button>
          <button type="button" className="print-action-btn" onClick={() => onPrint(date)}>Print</button>
        </div>
      </div>
    </div>
  );
}
