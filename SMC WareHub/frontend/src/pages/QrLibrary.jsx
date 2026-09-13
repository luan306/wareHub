import { useEffect, useState, useCallback } from 'react';
import { api } from '../api/client';
import { usePrintQueue } from '../context/PrintQueueContext';

export function QrLibrary() {
  const { addDevices } = usePrintQueue();
  const [devices, setDevices] = useState([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [qrUrls, setQrUrls] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchDevices = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.get('/devices', { search, page, pageSize: 24 });
      setDevices(data.devices);
      setTotalPages(data.totalPages);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, page]);

  useEffect(() => {
    const timer = setTimeout(fetchDevices, 250);
    return () => clearTimeout(timer);
  }, [fetchDevices]);

  useEffect(() => {
    const controller = new AbortController();
    const token = localStorage.getItem('token');

    Promise.all(devices.map(async (device) => {
      const response = await fetch(`/api/qr/devices/${device.id}?size=256`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error('Không tải được mã QR');
      return [device.id, URL.createObjectURL(await response.blob())];
    })).then((entries) => {
      setQrUrls((previous) => {
        Object.values(previous).forEach(URL.revokeObjectURL);
        return Object.fromEntries(entries);
      });
    }).catch((err) => {
      if (err.name !== 'AbortError') setError(err.message);
    });

    return () => controller.abort();
  }, [devices]);

  function downloadQr(device) {
    if (!qrUrls[device.id]) return;
    const link = document.createElement('a');
    link.download = `${device.ma}-qr.png`;
    link.href = qrUrls[device.id];
    link.click();
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h2>Thư viện QR</h2>
          <p className="page-intro">Tạo, kiểm tra và tải mã QR nội bộ cho từng thiết bị.</p>
        </div>
        <button className="btn-primary" disabled={devices.length === 0} onClick={() => addDevices(devices)}>
          Thêm tất cả vào hàng đợi
        </button>
      </div>

      <div className="toolbar">
        <input
          placeholder="Tìm mã, tên thiết bị, model, người sử dụng..."
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <span className="library-count">Trang {page} / {totalPages}</span>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading && <div className="empty-state">Đang tải thư viện...</div>}
      {!loading && devices.length === 0 && <div className="empty-state">Chưa có thiết bị phù hợp.</div>}

      <div className="qr-library-grid">
        {devices.map((device) => (
          <article className="qr-library-card" key={device.id}>
            <div className="qr-library-code">{device.ma}</div>
            <div className="qr-canvas-wrap">
              {qrUrls[device.id] ? <img src={qrUrls[device.id]} alt={`QR ${device.ma}`} /> : <span className="qr-loading">Đang tạo QR...</span>}
            </div>
            <div className="qr-library-info">
              <h3>{device.ten}</h3>
              <p>{device.model || 'Chưa cập nhật model'}</p>
              <span>{device.cpu || 'Chưa cập nhật CPU'}</span>
              <span>{device.ram || 'Chưa cập nhật RAM'} · {device.storage || 'Chưa cập nhật STORAGE'}</span>
            </div>
            <div className="qr-library-actions">
              <button onClick={() => downloadQr(device)}>Tải PNG</button>
              <button className="btn-primary" onClick={() => addDevices([device])}>Thêm vào hàng đợi</button>
            </div>
          </article>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Trước</button>
          <span>Trang {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>Sau →</button>
        </div>
      )}
    </div>
  );
}
