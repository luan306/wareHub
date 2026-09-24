import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { connectionEvents } from '../api/connection';
import { useAuth } from './AuthContext';

// Theo dõi kết nối tới máy chủ để giao diện báo đúng tình huống thay vì lỗi "Failed to fetch" khó hiểu:
//   offline     = trình duyệt mất mạng                       -> thanh cảnh báo (vẫn xem được dữ liệu đã tải)
//   unreachable = có mạng nhưng không tới được máy chủ       -> màn hình chắn (đang cập nhật/khởi động lại)
//   maintenance = máy chủ báo đang bảo trì (503)             -> màn hình chắn kèm thông báo
// Khi mất kết nối, cứ vài giây hỏi /api/health; hệ thống sẵn sàng lại thì tự tiếp tục (tự tải lại trang nếu máy chủ
// vừa được cập nhật phiên bản mới) và báo các trang tải lại dữ liệu qua sự kiện 'warehub:reconnected'.
const ConnectionContext = createContext(null);

const POLL_MS = 4000;
const IDLE_CHECK_MS = 30000;
const NOTICE_MS = 3500;
export const RECONNECTED_EVENT = 'warehub:reconnected';

async function fetchHealth() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch('/api/health', { cache: 'no-store', signal: controller.signal });
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function ConnectionProvider({ children }) {
  const { user, isAdmin } = useAuth();
  const [browserOnline, setBrowserOnline] = useState(() => navigator.onLine !== false);
  const [server, setServer] = useState({ state: 'ok' });
  const [maintenanceInfo, setMaintenanceInfo] = useState(null); // chỉ dành cho admin: bảo trì đang bật
  const [loginNotice, setLoginNotice] = useState(null); // người CHƯA đăng nhập: bảo trì đang bật (chỉ báo, không chắn)
  const [newVersion, setNewVersion] = useState(false);
  const [notice, setNotice] = useState(false);
  const [checking, setChecking] = useState(false);
  const versionRef = useRef(null);
  const hadProblemRef = useRef(false);
  const serverStateRef = useRef('ok');
  const noticeTimerRef = useRef(0);
  const adminRef = useRef(isAdmin);
  adminRef.current = isAdmin;
  const userRef = useRef(user);
  userRef.current = user;
  serverStateRef.current = server.state;

  const status = !browserOnline ? 'offline' : server.state;

  const markProblem = useCallback((next) => {
    hadProblemRef.current = true;
    setServer((current) => (current.state === next.state && current.message === next.message ? current : next));
  }, []);

  // Máy chủ hoạt động lại. Nếu vừa được cập nhật phiên bản mới thì tải lại trang để lấy giao diện mới.
  const recover = useCallback((health) => {
    if (health?.version && versionRef.current && health.version !== versionRef.current && hadProblemRef.current) {
      window.location.reload();
      return;
    }
    if (health?.version) versionRef.current = health.version;
    setServer({ state: 'ok' });
    if (hadProblemRef.current) {
      hadProblemRef.current = false;
      setNotice(true);
      clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = setTimeout(() => setNotice(false), NOTICE_MS);
      window.dispatchEvent(new Event(RECONNECTED_EVENT));
    }
  }, []);

  const checkNow = useCallback(async () => {
    setChecking(true);
    const health = await fetchHealth();
    setChecking(false);
    if (!health) return false;
    if (health.maintenance && !adminRef.current) {
      let info = { state: 'maintenance' };
      try { const detail = await (await fetch('/api/maintenance', { cache: 'no-store' })).json(); info = { state: 'maintenance', message: detail.message, until: detail.until }; } catch { /* dùng thông báo mặc định */ }
      // Chưa đăng nhập: chỉ báo ở trang đăng nhập, không chắn — để admin còn đăng nhập vào tắt bảo trì.
      if (!userRef.current && serverStateRef.current === 'ok') { setLoginNotice(info); return false; }
      markProblem(info);
      return false;
    }
    setLoginNotice(null);
    recover(health);
    return true;
  }, [markProblem, recover]);

  useEffect(() => {
    const goOnline = () => { setBrowserOnline(true); checkNow(); };
    const goOffline = () => { hadProblemRef.current = true; setBrowserOnline(false); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, [checkNow]);

  useEffect(() => connectionEvents.subscribe((event) => {
    if (event.type === 'unreachable') markProblem({ state: 'unreachable' });
    else if (event.type === 'maintenance') markProblem({ state: 'maintenance', message: event.message, until: event.until });
    else if (event.type === 'ok' && serverStateRef.current !== 'ok') checkNow();
  }), [markProblem, checkNow]);

  // Đang có sự cố: hỏi /api/health định kỳ cho tới khi hệ thống sẵn sàng.
  const inProblem = status !== 'ok';
  useEffect(() => {
    if (!inProblem) return undefined;
    const timer = setInterval(checkNow, POLL_MS);
    return () => clearInterval(timer);
  }, [inProblem, checkNow]);

  // Lúc bình thường: mỗi 30 giây kiểm tra nhẹ để biết có phiên bản mới / bảo trì đang bật (admin) / máy chủ vừa tắt.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const health = await fetchHealth();
      if (cancelled) return;
      if (!health) {
        if (navigator.onLine !== false) markProblem({ state: 'unreachable' });
        return;
      }
      if (versionRef.current && health.version && health.version !== versionRef.current) setNewVersion(true);
      if (!versionRef.current && health.version) versionRef.current = health.version;
      if (health.maintenance) {
        if (adminRef.current) {
          try { const info = await api.get('/maintenance'); if (!cancelled) setMaintenanceInfo(info.enabled ? info : null); } catch { /* bỏ qua */ }
        } else {
          checkNow();
        }
      } else {
        setMaintenanceInfo(null);
        setLoginNotice(null);
      }
    };
    check();
    const timer = setInterval(() => { if (serverStateRef.current === 'ok') check(); }, IDLE_CHECK_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [user?.id, isAdmin, markProblem, checkNow]);

  // Admin bật/tắt chế độ bảo trì; enabled=true kèm thông báo và giờ dự kiến xong (tuỳ chọn).
  const setMaintenance = useCallback(async (enabled, message, until) => {
    const info = await api.put('/maintenance', { enabled, message: message || null, until: until || null });
    setMaintenanceInfo(info.enabled ? info : null);
    return info;
  }, []);

  // Người chưa đăng nhập bỏ qua màn hình chắn để đăng nhập bằng tài khoản admin.
  const dismissMaintenance = useCallback(() => {
    hadProblemRef.current = false;
    setServer({ state: 'ok' });
  }, []);

  const value = {
    status,
    loginNotice,
    dismissMaintenance,
    maintenance: server.state === 'maintenance' ? server : null,
    notice,
    newVersion,
    checking,
    maintenanceInfo,
    retryNow: checkNow,
    setMaintenance,
  };
  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  return useContext(ConnectionContext);
}

// Chạy callback (thường là tải lại dữ liệu của trang) mỗi khi kết nối được khôi phục.
export function useReconnect(callback) {
  const ref = useRef(callback);
  ref.current = callback;
  useEffect(() => {
    const handler = () => ref.current();
    window.addEventListener(RECONNECTED_EVENT, handler);
    return () => window.removeEventListener(RECONNECTED_EVENT, handler);
  }, []);
}
