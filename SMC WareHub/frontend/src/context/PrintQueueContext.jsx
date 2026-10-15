import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';

const PrintQueueContext = createContext(null);
const STORAGE_KEY = 'warehub-print-queue';

function loadQueue() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function PrintQueueProvider({ children }) {
  const [queue, setQueue] = useState(loadQueue);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(queue)); } catch {}
  }, [queue]);

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

  const value = useMemo(() => ({ queue, addDevices, removeDevice, clearQueue }), [queue, addDevices, removeDevice, clearQueue]);

  return <PrintQueueContext.Provider value={value}>{children}</PrintQueueContext.Provider>;
}

export function usePrintQueue() {
  return useContext(PrintQueueContext);
}
