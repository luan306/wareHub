// Kênh nhỏ để api client báo tình trạng kết nối cho giao diện (ConnectionContext) mà không phụ thuộc React.
const listeners = new Set();

export const connectionEvents = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  // event: { type: 'ok' } | { type: 'unreachable' } | { type: 'maintenance', message, until }
  emit(event) {
    listeners.forEach((listener) => listener(event));
  },
};

// code: 'network' (không tới được máy chủ) | 'maintenance' (máy chủ đang bảo trì)
export class ApiError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
