import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';

const FIELD_LABELS = {
  ma: 'Serial Number',
  ten: 'Device Name',
  loai: 'Type',
  model: 'Model',
  producer: 'Producer',
  ip_address: 'IP Address',
  user_name: 'User Name',
  phong_ban: 'Dept',
  ghi_chu: 'Comment',
  registered_at: 'Registered',
};

function displayValue(value) {
  return value === null || value === undefined || value === '' ? '—' : value;
}

export function DeviceHistory() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 30;

  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/devices/history', { search, from, to, page, pageSize });
      setRows(data.history);
      setTotal(data.total);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, from, to, page]);

  useEffect(() => {
    const t = setTimeout(fetchHistory, 250);
    return () => clearTimeout(t);
  }, [fetchHistory]);

  const totalPages = Math.max(Math.ceil(total / pageSize), 1);

  return (
    <div>
      <div className="page-head">
        <h2>Lịch sử thay đổi thiết bị</h2>
      </div>

      <div className="toolbar">
        <input
          placeholder="Tìm theo mã, tên thiết bị, người sửa..."
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <label className="inline-label">Từ ngày</label>
        <input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} />
        <label className="inline-label">Đến ngày</label>
        <input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} />
      </div>

      {error && <div className="error-box">{error}</div>}

      <table className="data-table">
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Mã thiết bị</th>
            <th>Tên thiết bị</th>
            <th>Trường thay đổi</th>
            <th>Giá trị cũ</th>
            <th>Giá trị mới</th>
            <th>Người sửa</th>
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={7} className="empty-row">Đang tải...</td></tr>}
          {!loading && rows.length === 0 && (
            <tr><td colSpan={7} className="empty-row">Không có dữ liệu</td></tr>
          )}
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono">{new Date(r.changed_at).toLocaleString('vi-VN')}</td>
              <td className="mono">{r.ma}</td>
              <td>{r.ten}</td>
              <td>{FIELD_LABELS[r.field_name] || r.field_name}</td>
              <td>{displayValue(r.old_value)}</td>
              <td>{displayValue(r.new_value)}</td>
              <td>{r.changed_by}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pagination">
        <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Trước</button>
        <span>Trang {page} / {totalPages}</span>
        <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Sau →</button>
      </div>
    </div>
  );
}
