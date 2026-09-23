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

export const HANDOVER_PAGE_CSS = 'size: A4 portrait; margin: 8mm;';

export function labelPageCss(kho) {
  return kho === '24' ? 'size: 60mm 24mm; margin: 0;' : 'size: 12mm 12mm; margin: 0;';
}

// In kèm theo 1 class tạm trên <body> (gỡ ngay sau khi hộp thoại in đóng lại) — CSS dựa vào class này
// để ẩn hẳn (display: none) phần còn lại của trang thay vì chỉ visibility: hidden, tránh phần nội dung
// tuy vô hình nhưng vẫn chiếm chỗ khiến máy in tự chia dư ra rất nhiều trang trống khi khổ trang nhỏ.
export function printWithBodyClass(className) {
  const cleanup = () => {
    document.body.classList.remove(className);
    window.removeEventListener('afterprint', cleanup);
  };
  document.body.classList.add(className);
  window.addEventListener('afterprint', cleanup);
  window.print();
}
