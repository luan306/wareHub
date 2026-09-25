import { translate, translateServerMessage } from '../i18n';
import { ApiError, connectionEvents } from './connection';

const BASE = '/api';
// Quá thời gian này mà máy chủ không trả lời thì coi như mất kết nối (tránh nút bấm treo mãi khi mạng chập chờn).
const REQUEST_TIMEOUT_MS = 30000;

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, { method = 'GET', body, params } = {}) {
  let url = `${BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null)
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    // Không tới được máy chủ: mất mạng, máy chủ đang tắt/khởi động lại, hoặc quá thời gian chờ.
    connectionEvents.emit({ type: 'unreachable' });
    throw new ApiError(translate('error.network'), { code: 'network' });
  } finally {
    clearTimeout(timer);
  }

  // 401 từ chính endpoint đăng nhập nghĩa là sai tài khoản/mật khẩu, không phải phiên hết hạn —
  // để rơi xuống nhánh bên dưới hiện đúng lỗi từ server, không tự redirect/xoá phiên.
  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new ApiError(translate('error.sessionExpired'), { status: 401 });
  }

  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json().catch(() => ({})) : {};

  // Máy chủ đang ở chế độ bảo trì (backend trả 503 kèm maintenance: true).
  if (res.status === 503 && data.maintenance) {
    connectionEvents.emit({ type: 'maintenance', message: data.error, until: data.until });
    throw new ApiError(translateServerMessage(data.error), { status: 503, code: 'maintenance' });
  }
  // Lỗi 5xx không phải JSON của ứng dụng = cổng/proxy báo backend không phản hồi (đang tắt hoặc khởi động lại).
  if (!res.ok && !isJson && res.status >= 500) {
    connectionEvents.emit({ type: 'unreachable' });
    throw new ApiError(translate('error.network'), { status: res.status, code: 'network' });
  }

  if (!res.ok) {
    throw new ApiError(translateServerMessage(data.error || data.detail) || translate('error.http', { status: res.status }), { status: res.status });
  }
  connectionEvents.emit({ type: 'ok' });
  return data;
}

export const api = {
  get: (path, params) => request(path, { method: 'GET', params }),
  post: (path, body) => request(path, { method: 'POST', body }),
  put: (path, body) => request(path, { method: 'PUT', body }),
  del: (path) => request(path, { method: 'DELETE' }),
};
