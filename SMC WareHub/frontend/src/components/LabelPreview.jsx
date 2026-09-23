import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import smcLogo from '../img/Logo_SMC_Corporation.svg';
import smcLogoRaw from '../img/Logo_SMC_Corporation.svg?raw';

const SMC_LOGO_URL = smcLogo;

// Logo nhúng giữa QR: chữ SMC đúng tỉ lệ gốc trên nền trắng bo góc. Phải inline path SVG vì ảnh SVG
// dạng data-URI không tải được tài nguyên ngoài.
const QR_BADGE_W = 400;
const QR_BADGE_H = 160;
const QR_LOGO_W = 290;
const QR_LOGO_H = QR_LOGO_W * (97.97 / 307.42);
const QR_LOGO_INNER = smcLogoRaw
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace('fill:#0066b3', 'fill:url(#logoGrad)');
// Hiệu ứng nổi khối: tấm nền vát cạnh + bóng bề mặt, chữ logo chuyển sắc và đổ bóng nhẹ.
const QR_BADGE_DEFS = '<defs>'
  + '<linearGradient id="plate" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9e3ee"/></linearGradient>'
  + '<linearGradient id="bevel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="0.5" stop-color="#b9c8d8"/><stop offset="1" stop-color="#5f7893"/></linearGradient>'
  + '<linearGradient id="logoGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3f9df0"/><stop offset="0.55" stop-color="#0066b3"/><stop offset="1" stop-color="#003f78"/></linearGradient>'
  + '<linearGradient id="gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
  + '<filter id="logoShadow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="5" stdDeviation="3.5" flood-color="#00264d" flood-opacity="0.45"/></filter>'
  + '<filter id="plateShadow" x="-10%" y="-20%" width="120%" height="150%"><feDropShadow dx="0" dy="6" stdDeviation="4" flood-color="#00264d" flood-opacity="0.35"/></filter>'
  + '</defs>';
const QR_BADGE_URL = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${QR_BADGE_W}" height="${QR_BADGE_H}" viewBox="0 0 ${QR_BADGE_W} ${QR_BADGE_H}">`
  + QR_BADGE_DEFS
  + `<rect width="${QR_BADGE_W}" height="${QR_BADGE_H}" fill="#fff"/>`
  + `<rect x="14" y="10" width="${QR_BADGE_W - 28}" height="${QR_BADGE_H - 30}" rx="34" fill="url(#plate)" stroke="url(#bevel)" stroke-width="7" filter="url(#plateShadow)"/>`
  + `<rect x="26" y="19" width="${QR_BADGE_W - 52}" height="${(QR_BADGE_H - 30) / 2 - 6}" rx="24" fill="url(#gloss)" opacity="0.7"/>`
  + `<svg x="${(QR_BADGE_W - QR_LOGO_W) / 2}" y="${(QR_BADGE_H - 20 - QR_LOGO_H) / 2 + 10}" width="${QR_LOGO_W}" height="${QR_LOGO_H}" viewBox="0 0 307.42249 97.970001" filter="url(#logoShadow)">${QR_LOGO_INNER}</svg>`
  + '</svg>',
)}`;
const FIT_TEXT_MAX_SIZE = 20;
const FIT_TEXT_MIN_SIZE = 12;

export function qrPayload(device) {
  return String(device.ma || '').trim();
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
    <div className={printMode ? `print-page print-page-${device.kho}` : undefined}>
      {device.kho === '24' ? (
        <DeviceLabelTable device={device} registeredText={registeredText} preview={!printMode} />
      ) : (
        <div className={`tem tem-12 tem-12-qr-only${!printMode ? ' tem-12-preview' : ''}`}>
          <div className="phone-label phone-label-qr-only">
            <QRCodeCanvas
              value={qrPayload(device)}
              size={qrSize}
              level="H"
              includeMargin={false}
              imageSettings={{ src: QR_BADGE_URL, width: qrSize * 0.4, height: qrSize * 0.4 * (QR_BADGE_H / QR_BADGE_W), excavate: true }}
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
