import { createContext, useContext, useState, useCallback, useMemo } from 'react';

const PrintQueueContext = createContext(null);

export function PrintQueueProvider({ children }) {
  const [queue, setQueue] = useState([]); // mảng device object

  const addDevices = useCallback((devices) => {
    setQueue((prev) => {
      const existingIds = new Set(prev.map((d) => d.id));
      const toAdd = devices.filter((d) => !existingIds.has(d.id));
      return [...prev, ...toAdd];
    });
  }, []);

  const removeDevice = useCallback((id) => {
    setQueue((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const clearQueue = useCallback(() => setQueue([]), []);

  // Ghi nhớ (useMemo): không tạo object mới mỗi lần render, tránh vẽ lại mọi nơi dùng usePrintQueue() một cách vô ích.
  const value = useMemo(() => ({ queue, addDevices, removeDevice, clearQueue }), [queue, addDevices, removeDevice, clearQueue]);

  return <PrintQueueContext.Provider value={value}>{children}</PrintQueueContext.Provider>;
}

export function usePrintQueue() {
  return useContext(PrintQueueContext);
}
