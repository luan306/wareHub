import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';
import { DEFAULT_PRINT_LABELS } from '../utils/printLabels';

export const PrintLabelsContext = createContext(null);

export function PrintLabelsProvider({ children }) {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState({});

  const refresh = useCallback(async () => {
    try {
      const data = await api.get('/print-labels');
      setOverrides(data.overrides || {});
    } catch {
      // keep whatever was loaded before; sheets still fall back to defaults
    }
  }, []);

  useEffect(() => {
    if (user) refresh(); else setOverrides({});
  }, [user, refresh]);

  const label = useCallback((key) => overrides[key] ?? DEFAULT_PRINT_LABELS[key] ?? '', [overrides]);

  const value = useMemo(() => ({ overrides, label, refresh }), [overrides, label, refresh]);
  return <PrintLabelsContext.Provider value={value}>{children}</PrintLabelsContext.Provider>;
}

export function usePrintLabels() {
  return useContext(PrintLabelsContext);
}
