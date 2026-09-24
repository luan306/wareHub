import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { useT } from '../i18n';
import smcLogo from '../img/Logo_SMC_Corporation.svg';
import smcLogoRaw from '../img/Logo_SMC_Corporation.svg?raw';

// Logo SMC gốc: chỉ lấy phần ruột SVG (path) để nhúng lại được ở nhiều nơi. Phải inline path vì ảnh SVG
// dạng data-URI không tải được tài nguyên ngoài.
const LOGO_VIEWBOX = '0 0 307.42249 97.970001';
const LOGO_PATHS = smcLogoRaw.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const PHONE_QR_SIZE = 180;
const todayIso = () => new Date().toISOString().slice(0, 10);
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

// Bản in (tem 60x24mm): #print-area đang display:none nên không đo được chiều rộng thật — FitText sẽ luôn
// giữ mức tối đa 20px (cỡ cho bản xem trước rộng 500px), tràn ô tem và bị cắt chữ. Ở đây đo độ rộng chữ
// thật: phần giá trị của tem chỉ rộng khoảng 26.7mm (≈96px sau khi trừ lề).
const PRINT_TEXT_MAX = 10;
const PRINT_TEXT_MIN = 6;
const PRINT_TEXT_WIDTH_PX = 96;

let measureCtx;
// Đo độ rộng chữ thật (canvas) để chọn cỡ chữ lớn nhất vẫn nằm gọn 1 dòng; ước lượng theo số ký tự sẽ sai với chữ HOA/số rộng.
function widthPerPx(text, weight) {
  try {
    measureCtx = measureCtx || document.createElement('canvas').getContext('2d');
    measureCtx.font = `${weight} 100px Inter, sans-serif`;
    return measureCtx.measureText(text).width / 100;
  } catch {
    return Math.max(String(text).length, 1) * 0.66;
  }
}

// Cỡ chữ (px) lớn nhất trong [min, max] để text vừa 1 dòng rộng widthPx.
function fitFontSize(text, widthPx, { min, max, weight = 400 }) {
  const fit = widthPx / widthPerPx(String(text) || ' ', weight);
  return Math.min(max, Math.max(min, Math.floor(fit * 0.96 * 10) / 10));
}

function PrintText({ text }) {
  const size = fitFontSize(text, PRINT_TEXT_WIDTH_PX, { min: PRINT_TEXT_MIN, max: PRINT_TEXT_MAX });
  return <div className="print-value-text" style={{ fontSize: `${size.toFixed(1)}px` }}>{text}</div>;
}

// Máy in tem Brother chỉ in ĐEN TRẮNG — mọi màu/độ chuyển sắc/bóng đổ đều bị driver biến thành chấm li ti
// (halftone) nên logo xanh nhìn mờ. Bản in dùng logo đen thuần dạng vector (nét sắc ở mọi độ phân giải) và mã QR
// vector (QRCodeSVG) thay cho canvas ảnh raster.
const BLACK_LOGO_PATHS = LOGO_PATHS.replace('fill:#0066b3', 'fill:#000000');

function BlackLogo({ className }) {
  return <svg className={className} viewBox={LOGO_VIEWBOX} role="img" aria-label="SMC" dangerouslySetInnerHTML={{ __html: BLACK_LOGO_PATHS }} />;
}

// Dòng "IME/SN : <serial>" trên tem điện thoại: chữ đậm, số serial luôn nằm trọn 1 dòng (không chẻ ký tự).
// Ở mỗi cỡ (từ 10px xuống 5px) thử: (1) cả "IME/SN : <serial>" vừa 1 dòng; (2) nhãn 1 dòng, số serial 1 dòng bên dưới.
const PHONE_SERIAL_LABEL = 'IME/SN :';
const PHONE_SERIAL_WIDTH_PX = 63; // cột phải của tem ≈ 16.9mm
function serialLayout(value) {
  const full = `${PHONE_SERIAL_LABEL} ${value}`;
  const limit = PHONE_SERIAL_WIDTH_PX * 0.96;
  for (let size = 10; size >= 5; size -= 0.5) {
    const fits = (text) => widthPerPx(text, 700) * size <= limit;
    if (fits(full)) return { lines: [full], size };
    if (fits(value)) return { lines: [PHONE_SERIAL_LABEL, value], size };
  }
  return { lines: [PHONE_SERIAL_LABEL, value], size: 5 };
}

// Tem điện thoại kiểu Dell (băng 12mm, dài 30mm): QR vector bên trái; bên phải logo SMC nhỏ và dòng IME/SN chữ đậm.
// Bản in đen trắng thuần dạng vector để máy in Brother không biến thành chấm li ti; bản xem trước giữ logo xanh như tem laptop.
function PhoneTagBody({ value, preview }) {
  const { lines, size } = serialLayout(value);
  return (
    <>
      <QRCodeSVG value={value} size={PHONE_QR_SIZE} level="M" includeMargin={false} className="phone-tag-qr" />
      <div className="phone-tag-side">
        {preview ? <img src={smcLogo} alt="SMC" className="phone-tag-logo" /> : <BlackLogo className="phone-tag-logo" />}
        <div className="phone-tag-serial" style={{ fontSize: `${size.toFixed(1)}px` }}>
          {lines.map((line, index) => <div key={index}>{line}</div>)}
        </div>
      </div>
    </>
  );
}

function DeviceLabelTable({ device, registeredText, preview = false }) {
  const Value = preview ? FitText : PrintText;
  return (
    <table className={`print-preview-table device-label-table${preview ? ' device-label-table-preview' : ''}`}>
      <tbody>
        <tr>
          <td className="preview-logo-cell">
            {preview ? <img src={smcLogo} alt="SMC" /> : <BlackLogo className="print-logo" />}
          </td>
          <td className="preview-field">Device Name</td>
          <td className="preview-value"><Value text={device.ten || 'N/A'} /></td>
        </tr>
        <tr>
          <td rowSpan="3" className="preview-qr-cell">
            {preview
              ? <QRCodeCanvas value={qrPayload(device)} size={124} level="M" />
              : <QRCodeSVG value={qrPayload(device)} size={124} level="M" includeMargin={false} className="print-qr" />}
          </td>
          <td className="preview-field">Model</td>
          <td className="preview-value"><Value text={device.model || 'N/A'} /></td>
        </tr>
        <tr>
          <td className="preview-field">User Name</td>
          <td className="preview-value"><Value text={device.user_name || device.phong_ban || 'N/A'} /></td>
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
            <PhoneTagBody value={qrPayload(device)} preview={!printMode} />
          </div>
        </div>
      )}
    </div>
  );
}

export function PrintLabelModal({ device, open, onClose, onPrint }) {
  const { t } = useT();
  const [date, setDate] = useState(todayIso);

  useEffect(() => {
    if (open) setDate(todayIso());
  }, [open, device]);

  if (!open || !device) return null;

  return (
    <div className="print-label-modal-backdrop" onClick={onClose}>
      <div className="print-label-modal" onClick={(event) => event.stopPropagation()}>
        <div className="print-label-header modal-header">
          <h2 className="modal-title">{t('label.modalTitle')}</h2>
          <button className="print-modal-close btn-close" type="button" aria-label={t('label.close')} onClick={onClose}>×</button>
        </div>

        <div className="print-label-form">
          <label htmlFor="print-date">{t('label.printDate')}</label>
          <div className="print-date-input">
            <input id="print-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>

        <div className="print-label-review">
          <h6 className="review-title">{t('label.review')}</h6>
          <div className="print-preview-wrap">
            <LabelPreview device={{ ...device, registered_at: date }} />
          </div>
        </div>

        <div className="print-label-actions">
          <button type="button" className="print-close-btn" onClick={onClose}>{t('label.close')}</button>
          <button type="button" className="print-action-btn" onClick={() => onPrint(date)}>{t('label.print')}</button>
        </div>
      </div>
    </div>
  );
}
