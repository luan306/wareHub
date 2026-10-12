import { useEffect, useRef, useState } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { api } from '../api/client';
import { printHandoverSheets } from '../utils/printPageSize';
import { LOAI_LABELS, LOAI_LABELS_EN } from '../utils/deviceTypes';
import { isoToday } from '../utils/date';
import { useT } from '../i18n';
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

// Phiếu bàn giao điện thoại: cùng mẫu nhưng bỏ 2 điều khoản về phần cứng/phần mềm của máy tính.
const PHONE_RESPONSIBILITIES = RESPONSIBILITIES.filter(
  (item) => typeof item !== 'string' || !/mustn't (change the hardware|install any software)/.test(item),
);

// 2022-09-06 -> 6/9/2022, giống định dạng trên mẫu phiếu giấy.
function formatDayMonthYear(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return match ? `${Number(match[3])}/${Number(match[2])}/${match[1]}` : iso || '';
}

export function buildHandoverData(device) {
  const isPhone = device.loai === 'phone';
  return {
    // 'phone' dùng mẫu phiếu điện thoại; phiếu cũ đã lưu không có trường này nên vẫn là mẫu máy tính.
    kind: isPhone ? 'phone' : 'computer',
    register_date: isoToday(),
    no: '',
    full_name: device.user_name || '',
    department: device.phong_ban || '',
    employee_id: '',
    transfer_date: isoToday(),
    computer_name: device.ten || '',
    service_tag: device.ma || '',
    // Loại của máy chính — dùng để liệt kê lại máy chính trong bảng đính kèm (xem attachmentRows bên dưới).
    main_loai: device.loai || '',
    storage: device.storage || '',
    ram: device.ram || '',
    cpu: device.cpu || '',
    adapter: isPhone ? 'SAMSUNG Fast Charge Adapter' : 'Adapter Dell 65W',
    // Số điện thoại của SIM trong máy (lấy từ GLPI hoặc nhập tay); chưa có thì ghi N/A.
    phone_number: (isPhone && device.phone_number) || 'N/A',
    // Lấy theo GLPI khi đã đồng bộ; chưa có thì dùng mặc định của công ty. Điện thoại không có Windows/Office/chuột
    // bàn phím nên mặc định "N/A" (khớp phiếu giấy) thay vì mặc định của máy tính — vẫn sửa tay được nếu cần.
    windows: isPhone ? 'N/A' : device.os_name || 'Win 11 Professional',
    office: isPhone ? 'N/A' : device.office_name || 'Office 365',
    peripherals: isPhone ? 'N/A' : 'Wire Mouse and Keyboard',
    // Màn hình rời đi kèm máy bàn — điền qua nút "Thêm màn hình theo Serial" (MonitorPicker), có dòng riêng trên
    // phiếu (khớp mẫu phiếu giấy chính thức ITFGE-00459_19_A: Mouse/Keyboard, Monitor, Others là 3 dòng tách biệt
    // trong "OTHER DEVICE", không gộp chung vào "Others" như trước). "monitor" là chuỗi hiện trong ô (sửa tay được);
    // "monitors" là danh sách gốc (mỗi lần bấm "+ Serial màn hình" thêm 1 phần tử) — dùng để biết chính xác đã thêm
    // bao nhiêu màn hình và để liệt kê chúng vào trang "ATTACHED EQUIPMENT LIST" (xem printedRows bên dưới).
    monitor: '',
    monitors: [],
    model: device.model || '',
    other: 'N/A',
    // Danh sách thiết bị đính kèm khi 1 người nhận nhiều thiết bị cùng lúc — in thành 1 trang riêng ngay sau
    // phiếu chính (không đụng tới ô Other devices trên phiếu).
    attachments: [],
  };
}

// Phiếu cấp nhiều máy (gộp từ trang Thiết bị): danh sách đính kèm liệt kê luôn máy chính ở dòng đầu, không chỉ các máy
// còn lại — để người nhận nhìn 1 bảng là biết đủ hết các máy, không cần tìm riêng máy chính ở phiếu trước. CHỈ tính
// các máy gộp (data.attachments) — không tính màn hình (xem printedRows), vì "N ea" ở đây dùng để quyết định các ô
// DEVICE NAME/SERIAL NUMBER/MODEL/PSU/LICENSE có hiện "refer to attached file" hay không, màn hình không liên quan.
function attachmentRows(data) {
  const extra = data.attachments || [];
  if (extra.length === 0) return extra;
  return [{ id: 'main', ten: data.computer_name, ma: data.service_tag, loai: data.main_loai || (data.kind === 'phone' ? 'phone' : 'laptop'), model: data.model }, ...extra];
}

// Ô Computer Name / Service Tag của phiếu chính: có từ 2 thiết bị trở lên (gộp từ trang Thiết bị) thì ghi
// "Please refer to the attached file (N ea)" thay vì chỉ tên/serial của riêng máy chính — áp dụng cho cả phiếu máy tính lẫn
// điện thoại, không chỉ riêng điện thoại; singleValue là giá trị hiện khi chỉ có đúng 1 thiết bị (mặc định service_tag).
function serviceTagDisplay(data, singleValue = data.service_tag) {
  const rows = attachmentRows(data);
  return rows.length > 1 ? `Please refer to the attached file (${rows.length} ea)` : singleValue;
}

// Ô Monitor: data.monitors là nguồn đúng (mỗi lần "+ Serial màn hình" thêm 1 phần tử); phiếu cũ đã lưu trước khi có
// mảng này chỉ còn chuỗi data.monitor — đếm tạm theo dấu hiệu " (S/N: " trong chuỗi đó để không hiện sai cho phiếu cũ.
function monitorDisplay(data) {
  if (data.monitors?.length > 0) return data.monitors.length > 1 ? `Please refer to the attached file (${data.monitors.length} ea)` : data.monitors[0].label;
  const raw = (data.monitor || '').trim();
  if (!raw) return 'N/A';
  const count = raw.match(/\(S\/N: /g)?.length || 1;
  return count > 1 ? `Please refer to the attached file (${count} ea)` : raw;
}

// Bảng in ra trang "ATTACHED EQUIPMENT LIST": máy chính + máy gộp thêm (attachmentRows) VÀ màn hình đã chọn qua
// "+ Serial màn hình" (data.monitors) — 2 nguồn khác nhau (gộp nhiều máy / màn hình rời đi kèm máy chính) nhưng gộp
// chung vào 1 bảng để người nhận thấy đủ hết, không phải đối chiếu ngược lại ô "Monitor" xem là máy nào.
function printedRows(data) {
  const devices = attachmentRows(data);
  const monitors = (data.monitors || []).map((m) => ({ id: `monitor-${m.id}`, ten: m.ten, ma: m.ma, loai: 'monitor', model: m.model }));
  if (devices.length === 0 && monitors.length === 0) return [];
  const base = devices.length > 0
    ? devices
    : [{ id: 'main', ten: data.computer_name, ma: data.service_tag, loai: data.main_loai || (data.kind === 'phone' ? 'phone' : 'laptop'), model: data.model }];
  return [...base, ...monitors];
}
// Có gì để in trang "ATTACHED EQUIPMENT LIST" không — dùng chung ở cả bản xem trước, lúc in thật, lẫn trang Phiếu bàn
// giao (in lại hàng loạt), tránh lặp lại điều kiện ở nhiều nơi rồi quên sửa đồng bộ khi đổi logic.
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
          {/* PSU/ADAPTER và LICENSE KHÔNG dùng serviceTagDisplay — khác với DEVICE NAME/SERIAL NUMBER/MODEL (chắc chắn
              khác nhau giữa các máy gộp, không có 1 giá trị đúng để ghi), adapter/bản quyền hoàn toàn có thể giống
              nhau giữa các máy, nên vẫn hiện và sửa tay được bình thường dù gộp bao nhiêu máy. */}
          <tr><th>PSU/ADAPTER</th><td colSpan="2" className="hv-center">{data.adapter}</td></tr>
          <tr>
            <th rowSpan="2">LICENSE</th>
            <td className="hv-center hv-sub">Windows</td><td className="hv-center">{data.windows}</td>
          </tr>
          <tr><td className="hv-center hv-sub">Office</td><td className="hv-center">{data.office}</td></tr>
          <tr>
            {/* Phiếu điện thoại dùng chung khung này nhưng có thêm dòng Mobile Phone Number (máy tính không có) —
                rowSpan phải cộng thêm 1 cho đúng số dòng thật sự render bên dưới. */}
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

// 1 trang A4 (284mm cao, lề 8mm, đầu trang ~45mm) chứa được khoảng chừng này dòng bảng (dòng ~7.5mm/dòng tính theo
// cỡ chữ 9pt + đệm trong .hv-attach-table) — chừa dư an toàn, không tính sát để lỡ font trình duyệt khác nhau
// chút cũng không bị tràn dòng cuối ra ngoài trang.
const ATTACH_ROWS_PER_PAGE = 34;

// Trang kèm theo phiếu chính khi 1 người nhận nhiều thiết bị — cùng khổ A4, cùng phong cách (logo, tiêu đề song
// ngữ, bảng viền đen) để in nối liền sau phiếu chính. Nhiều thiết bị (vd 25-50+) thì tự chia thành NHIỀU trang rõ
// ràng (mỗi trang lặp lại đầu đề + tiêu đề cột) thay vì 1 bảng dài lê thê — vừa đúng với số dòng thật sự in vừa 1
// trang giấy, vừa để bản xem trước ngay trong khung soạn phiếu trông gọn gàng như tài liệu nhiều trang thật.
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
// Gộp cả sạc điện thoại vào đây — máy chính giờ chọn theo thứ tự bấm (không còn luôn ưu tiên điện thoại lên trước),
// nên 1 phiếu máy tính vẫn có thể cần chọn loại sạc của điện thoại nếu máy chính đổi thành điện thoại giữa chừng.
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
      // Phiếu in ra có sẵn dòng HDD/SSD, RAM, CPU (khung dùng chung với máy tính, tự ghi N/A nếu trống) — thêm ô ở
      // đây để sửa tay được (đa số điện thoại để trống/N/A, nhưng tablet/điện thoại đời mới vẫn có thể cần ghi).
      ['cpu', 'CPU'],
      ['ram', 'RAM'],
      ['storage', 'HDD/SSD'],
      ['adapter', 'Adapter', 'select', PHONE_ADAPTER_OPTIONS],
      // Phiếu điện thoại dùng chung khung in với máy tính nên vẫn có dòng License Windows/Office/Mouse-Keyboard —
      // mặc định "N/A" (không áp dụng cho điện thoại) nhưng vẫn cần ô ở đây để sửa tay được (vd máy có kèm chuột/bàn
      // phím thật thì đổi lại), không thì không có cách nào sửa trường hiện trên phiếu in.
      ['windows', 'License - Windows', 'select', WINDOWS_OPTIONS],
      ['office', 'License - Office', 'select', OFFICE_OPTIONS],
      ['peripherals', 'Mouse/Keyboard', 'select', PERIPHERALS_OPTIONS],
      // Có sẵn ô Monitor riêng giống phiếu máy tính — để điện thoại/tablet đi kèm màn hình (vd tablet gắn đế có màn
      // hình rời) dùng đúng "+ Serial màn hình", không bị đẩy nhầm vào "+ Thêm thiết bị" (chỗ đó dành cho gộp NHIỀU
      // MÁY CHÍNH khác, thêm nhầm vào đó làm phiếu hiểu lầm có 2 thiết bị chính, in sai "refer to attached file").
      ['monitor', 'Monitor'],
      ['other', 'Other devices'],
    ],
  },
];

// Các ô thuộc về thiết bị (không phải về người nhận): dùng chung giữa các phiếu cùng model nên được tái dùng/clone.
// Họ tên, mã NV, bộ phận, serial, tên máy, IP là riêng của từng người/máy nên không nằm trong danh sách này.
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

// Hộp thoại chọn dùng chung: gõ để tìm (chờ 250ms sau lần gõ cuối), danh sách kết quả, báo lỗi/rỗng.
// load(search) trả về Promise<mảng>; bỏ qua kết quả của lần tìm đã bị thay thế.
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

// excludeId (không phải excludeNo): "no" chỉ duy nhất trong CÙNG 1 nhóm máy tính/điện thoại-tablet (xem backend
// HandoverKind) — 1 phiếu nhóm khác có thể mang đúng số đó mà vẫn là phiếu hợp lệ để chọn, không được lọc nhầm ra.
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

// Máy bàn thường kèm màn hình rời — màn hình đã là 1 loại thiết bị có sẵn trong hệ thống (loai: monitor),
// nên tìm theo Serial của chính nó thay vì phải gõ tay model/hãng.
// excludeIds: màn hình đã chọn rồi thì không hiện lại nữa (picker này cố ý không tự đóng sau mỗi lần chọn, để chọn
// liên tiếp nhiều màn hình — nếu không lọc, bấm trúng lại đúng màn hình vừa chọn sẽ bị thêm trùng vào danh sách).
function MonitorPicker({ excludeIds, onPick, onCancel }) {
  const { t } = useT();
  const picker = usePickerSearch('', (search) => (
    api.get('/devices', { search, loai: 'monitor', page: 1, pageSize: 20 }).then((result) => result.devices)
  ));
  // Lọc ngay ở đây (không phải trong usePickerSearch) để cập nhật tức thì mỗi lần chọn thêm 1 màn hình, không cần
  // gõ lại ô tìm kiếm mới thấy danh sách refresh (usePickerSearch chỉ tải lại khi "search" đổi).
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

// Khi 1 người nhận nhiều thiết bị cùng lúc — tìm & thêm bất kỳ loại thiết bị nào (không chỉ màn hình)
// vào danh sách đính kèm (in thành trang riêng sau phiếu), tách biệt với ô Other devices trên phiếu.
function AttachmentPicker({ excludeIds, onPick, onCancel }) {
  const { t } = useT();
  const picker = usePickerSearch('', (search) => (
    api.get('/devices', { search, page: 1, pageSize: 20 }).then((result) => result.devices)
  ));
  // Lọc lại ở đây (không chỉ trong load ở trên) để cập nhật tức thì mỗi lần thêm 1 thiết bị — hộp thoại này cố ý
  // không tự đóng sau mỗi lần chọn (để thêm liên tiếp nhiều thiết bị), usePickerSearch chỉ tải lại khi gõ ô tìm
  // kiếm mới (search đổi), không tự biết excludeIds vừa đổi.
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

// Tạo phiếu mới thẳng từ trang Phiếu bàn giao (không cần qua trang Thiết bị trước) — chọn 1 thiết bị bất kỳ để làm
// thiết bị chính, HandoverModal mở ra với device này giống hệt như bấm "Phiếu BG" từ trang Thiết bị.
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

// extraAttachments: chọn nhiều thiết bị cùng lúc ở trang Thiết bị rồi gộp vào 1 phiếu (1 người nhận nhiều máy) —
// thiết bị đầu tiên làm máy chính, các thiết bị còn lại đẩy thẳng vào danh sách đính kèm ngay khi mở phiếu, không
// cần mở lại phiếu đã lưu rồi bấm "Thêm thiết bị" từng cái một như trước.
export function HandoverModal({ device, saved, extraAttachments, onClose }) {
  const { t } = useT();
  const deviceId = saved ? saved.device_id : device?.id;
  const draftEnabled = !saved && deviceId != null;

  const [initial] = useState(() => {
    if (saved) return { draft: null, data: { ...buildHandoverData(device || {}), ...(saved.data || {}), no: saved.no } };
    const draft = draftEnabled ? readDraft(deviceId) : null;
    const base = { ...buildHandoverData(device), ...(draft || {}) };
    // Thay hẳn (không gộp) danh sách đính kèm của bản nháp cũ — bản nháp cũ của ĐÚNG thiết bị chính này có thể còn
    // sót thiết bị đính kèm từ 1 lần gộp TRƯỚC đó (đã đóng không lưu) không liên quan gì tới lần gộp mới đang làm;
    // người dùng vừa tự chọn đúng danh sách này, không nên âm thầm lẫn thêm thiết bị cũ nào khác vào.
    if (extraAttachments?.length) base.attachments = extraAttachments;
    return { draft, data: base };
  });
  const [data, setData] = useState(initial.data);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [issued, setIssued] = useState(Boolean(saved));
  // true khi người dùng tự gõ số phiếu (thay vì để hệ thống tự cấp) — dùng để tắt việc tự động lấy/ghi đè số dự kiến.
  const [manualNo, setManualNo] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [monitorPickerOpen, setMonitorPickerOpen] = useState(false);
  const [attachmentPickerOpen, setAttachmentPickerOpen] = useState(false);
  // Phiếu chính thức đã lưu: lưu/in lại thì sửa tiếp trên ĐÚNG bản ghi đó (theo id), không tốn thêm số. "no" một mình
  // không còn là khoá duy nhất từ khi tách dãy số máy tính/điện thoại-tablet (2 nhóm có thể cùng ra 1 chuỗi "no").
  const allocatedRef = useRef(saved ? { id: saved.id, no: saved.no } : null);
  const savedRef = useRef(false);

  // Đã lưu phiếu lên server thì bỏ bản nháp cục bộ, lần sau lấy từ phiếu đã lưu (không bị dính dữ liệu cũ).
  function handleClose() {
    if (savedRef.current && draftEnabled) {
      try { localStorage.removeItem(draftKey(deviceId)); } catch { /* bỏ qua */ }
    }
    onClose();
  }

  // Thiếu mảng dependency thì effect này chạy lại (gỡ + gắn listener) sau MỖI lần render, kể cả mỗi lần gõ phím vào form —
  // dùng ref giữ giá trị mới nhất để chỉ cần đăng ký 1 lần lúc mở phiếu (mount), không lặp lại mỗi lần data đổi.
  const pickerOpenRef = useRef(pickerOpen);
  pickerOpenRef.current = pickerOpen;
  const handleCloseRef = useRef(handleClose);
  handleCloseRef.current = handleClose;
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !pickerOpenRef.current) handleCloseRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        if (result.source === 'model') setNotice(t('hv.autoFilled', { no: result.no }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [saved, initial.draft, deviceId, device?.model]);

  useEffect(() => {
    if (manualNo) return undefined; // đang tự gõ số — không để hệ thống tự cấp đè lên nữa
    const allocated = allocatedRef.current;
    if (allocated && allocated.no.startsWith(monthPrefix(data.register_date))) {
      setIssued(true);
      setData((current) => (current.no === allocated.no ? current : { ...current, no: allocated.no }));
      return undefined;
    }
    setIssued(false);
    let cancelled = false;
    api.get('/handovers/next-no', { date: data.register_date, loai: device?.loai || '' })
      .then((result) => { if (!cancelled) setData((current) => ({ ...current, no: result.no })); })
      .catch(() => { if (!cancelled) setData((current) => ({ ...current, no: '' })); });
    return () => { cancelled = true; };
  }, [data.register_date, manualNo, device?.loai]);

  // Gõ tay vào ô "Số phiếu": tắt tự cấp. Xoá trống ô lại thì quay về tự cấp như cũ.
  function updateNoField(value) {
    setManualNo(value.trim().length > 0);
    updateField('no', value);
  }

  async function persist() {
    const { no: shownNo, ...payload } = data;
    // Đã lưu 1 lần rồi (dù tự cấp hay tự gõ) thì sửa tiếp trên ĐÚNG phiếu đó (PUT theo id) — số tự gõ không nhất
    // thiết theo định dạng YYMMxxx nên không áp điều kiện "cùng tháng" như số tự cấp.
    let existing = allocatedRef.current && (manualNo || allocatedRef.current.no.startsWith(monthPrefix(data.register_date))) ? allocatedRef.current : null;
    let no, id;
    if (existing) {
      // In lại phiếu cũ mà đổi số (gõ tay khác với số đang lưu) -> gửi kèm "no" mới để đổi luôn số của phiếu đó.
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

  // Đọc giá trị trước khi vào updater (React có thể chạy updater sau khi event bị tái sử dụng).
  function updateField(key, value) {
    setData((current) => ({ ...current, [key]: value }));
  }

  function handlePick(item) {
    setData((current) => mergeSpecs(current, item.data, { overwrite: true }));
    setNotice(t('hv.picked', { no: item.no }));
    setPickerOpen(false);
  }

  function handleMonitorPick(monitor) {
    const label = `${monitor.model || monitor.ten} (S/N: ${monitor.ma})`;
    // "monitors" (mảng) là nguồn đúng — vừa liệt kê vào trang "ATTACHED EQUIPMENT LIST" (xem printedRows), vừa tự
    // suy ra chuỗi "monitor" hiển thị/in gọn, không giữ 2 nguồn lệch nhau. KHÔNG tự đóng hộp chọn sau khi chọn 1 cái
    // — để chọn liên tiếp nhiều màn hình cùng lúc, tự bấm "×" trên hộp thoại khi chọn xong (giống AttachmentPicker
    // nhưng picker này cố ý ở lại mở vì người dùng hay chọn nhiều màn hình cùng lúc hơn).
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

  // Điền nhanh "Case for <model> (N ea)" cho phiếu điện thoại; N gồm cả máy chính khi có đính kèm. Vẫn sửa tay được.
  function handleCaseFill() {
    const count = attachmentRows(data).length || 1;
    const text = `Case for ${data.model || '...'}${count > 1 ? ` (${count}ea)` : ''}`;
    setData((current) => ({ ...current, other: text }));
    setNotice(t('hv.caseFilled'));
  }

  function handleAttachmentPick(item) {
    setData((current) => ({ ...current, attachments: [...(current.attachments || []), item] }));
    setNotice(t('hv.attachAdded', { code: item.ma }));
    // KHÔNG tự đóng — để thêm liên tiếp nhiều thiết bị cùng lúc, tự bấm "×" trên hộp thoại khi chọn xong (giống Monitor).
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
