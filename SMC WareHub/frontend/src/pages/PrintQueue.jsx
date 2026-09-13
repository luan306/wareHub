import { useState } from 'react';
import { usePrintQueue } from '../context/PrintQueueContext';
import { LabelPreview } from '../components/LabelPreview';
import { api } from '../api/client';

export function PrintQueue() {
  const { queue, removeDevice, clearQueue } = usePrintQueue();
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  async function handlePrintAll() {
    setError('');
    setPrinting(true);
    try {
      await api.post('/print', { deviceIds: queue.map((d) => d.id) });
      window.print();
      clearQueue();
    } catch (err) {
      setError(err.message);
    } finally {
      setPrinting(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <h2>Hàng đợi in tem</h2>
        <div className="print-actions">
          <button onClick={clearQueue} disabled={queue.length === 0}>Xoá hết</button>
          <button className="btn-primary" onClick={handlePrintAll} disabled={queue.length === 0 || printing}>
            {printing ? 'Đang xử lý...' : 'In tất cả'}
          </button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {queue.length === 0 && (
        <div className="empty-state">
          Chưa có tem nào trong hàng đợi. Sang trang "Thiết bị" để chọn thiết bị cần in.
        </div>
      )}

      {queue.length > 0 && (
        <div className="label-grid">
          {queue.map((d) => (
            <QueueCard key={d.id} device={d} onRemove={() => removeDevice(d.id)} />
          ))}
        </div>
      )}

      <div id="print-area">
        {queue.map((d) => (
          <LabelPreview key={d.id} device={d} printMode />
        ))}
      </div>
    </div>
  );
}

function QueueCard({ device, onRemove }) {
  return (
    <div className="label-card">
      <button className="del" title="Bỏ khỏi hàng đợi" onClick={onRemove}>×</button>
      <LabelPreview device={device} />
    </div>
  );
}
