import { translate, translateServerMessage } from '../i18n';
import { ApiError, connectionEvents } from './connection';
import { fetchWithTimeout } from '../utils/fetchWithTimeout';

const BASE = '/api';
const REQUEST_TIMEOUT_MS = 30000;

function getToken() {
  return localStorage.getItem('token');
}

async function request(path, { method = 'GET', body, params, formData, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  let url = `${BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null)
    ).toString();
    if (qs) url += `?${qs}`;
  }

  const headers = formData ? {} : { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetchWithTimeout(url, {
      timeoutMs,
      method,
      headers,
      body: formData || (body ? JSON.stringify(body) : undefined),
    });
  } catch {
    connectionEvents.emit({ type: 'unreachable' });
    throw new ApiError(translate('error.network'), { code: 'network' });
  }

  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
    throw new ApiError(translate('error.sessionExpired'), { status: 401 });
  }

  const isJson = (res.headers.get('content-type') || '').includes('json');
  const data = isJson ? await res.json().catch(() => ({})) : {};

  if (res.status === 503 && data.maintenance) {
    connectionEvents.emit({ type: 'maintenance', message: data.error, until: data.until });
    throw new ApiError(translateServerMessage(data.error), { status: 503, code: 'maintenance' });
  }
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
  postFile: (path, formData) => request(path, { method: 'POST', formData, timeoutMs: 60000 }),
};
