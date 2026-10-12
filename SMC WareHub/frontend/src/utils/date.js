// Ngày hôm nay dạng YYYY-MM-DD theo múi giờ máy người dùng (không phải UTC) — khớp định dạng input type="date".
export function isoToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
