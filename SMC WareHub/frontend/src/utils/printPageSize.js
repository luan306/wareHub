// Chrome/Edge chỉ áp dụng đúng 1 khai báo @page cho cả lượt in — nếu file CSS có nhiều @page đặt tên
// (@page ten-rieng) cùng lúc, trình duyệt không biết dùng cái nào và quay về khổ giấy mặc định (Letter/A4)
// thay vì đúng khổ tem/phiếu mong muốn. Nên thay vì khai báo cố định trong CSS, ta chỉ giữ đúng MỘT
// thẻ <style> và ghi đè nội dung của nó ngay trước mỗi lần gọi window.print().
const STYLE_ID = 'dynamic-page-size';

export function setPrintPageSize(css) {
  let styleEl = document.getElementById(STYLE_ID);
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = STYLE_ID;
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `@page { ${css} }`;
}

// Lề trang khai báo 0 và lề 8mm do chính tờ phiếu tự chừa (padding): nếu để lề trong @page thì khi người dùng chọn
// Margins = None trong hộp thoại in của Chrome (vd. còn nhớ từ lần in tem Brother) lề bị ghi đè, phiếu sát mép và lệch.
export const HANDOVER_PAGE_CSS = 'size: A4 portrait; margin: 0;';

export function labelPageCss(kho) {
  return kho === '24' ? 'size: 60mm 24mm; margin: 0;' : 'size: 30mm 12mm; margin: 0;';
}

// In kèm theo 1 class tạm trên <body> (gỡ ngay sau khi hộp thoại in đóng lại) — CSS dựa vào class này
// để ẩn hẳn (display: none) phần còn lại của trang thay vì chỉ visibility: hidden, tránh phần nội dung
// tuy vô hình nhưng vẫn chiếm chỗ khiến máy in tự chia dư ra rất nhiều trang trống khi khổ trang nhỏ.
export function printWithBodyClass(className, onDone) {
  const cleanup = () => {
    document.body.classList.remove(className);
    window.removeEventListener('afterprint', cleanup);
    onDone?.();
  };
  document.body.classList.add(className);
  window.addEventListener('afterprint', cleanup);
  window.print();
}

// In các phiếu bàn giao (A4): đặt khổ giấy rồi in; onDone chạy sau khi hộp thoại in đóng lại.
export function printHandoverSheets(onDone) {
  setPrintPageSize(HANDOVER_PAGE_CSS);
  printWithBodyClass('printing-handover', onDone);
}
