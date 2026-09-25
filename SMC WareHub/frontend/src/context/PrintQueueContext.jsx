import { createContext, useContext, useState, useCallback } from 'react';

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

  return (
    <PrintQueueContext.Provider value={{ queue, addDevices, removeDevice, clearQueue }}>
      {children}
    </PrintQueueContext.Provider>
  );
}

export function usePrintQueue() {
  return useContext(PrintQueueContext);
}
