function pageItems(page, totalPages) {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
  const items = new Set([1, totalPages, page - 1, page, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => items.add(n));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => items.add(n));
  const sorted = [...items].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1] > 1 ? ['…', n] : [n]));
}

export function Pager({ page, pageSize, total, totalPages, unit, onPage, onPageSize }) {
  if (total <= 0) return null;
  return (
    <div className="pager">
      <div className="pager-info">
        Hiển thị {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} / {total} {unit}
      </div>
      <div className="pager-nav">
        <button type="button" disabled={page <= 1} onClick={() => onPage(1)} aria-label="Trang đầu">«</button>
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Trang trước">‹</button>
        {pageItems(page, totalPages).map((item, index) => (
          item === '…'
            ? <span className="pager-gap" key={`gap-${index}`}>…</span>
            : <button type="button" key={item} className={item === page ? 'active' : ''} aria-current={item === page ? 'page' : undefined} onClick={() => onPage(item)}>{item}</button>
        ))}
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Trang sau">›</button>
        <button type="button" disabled={page >= totalPages} onClick={() => onPage(totalPages)} aria-label="Trang cuối">»</button>
      </div>
      <label className="pager-size">
        Số dòng/trang
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
    </div>
  );
}
