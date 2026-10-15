const listeners = new Set();

export const connectionEvents = {
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  emit(event) {
    listeners.forEach((listener) => listener(event));
  },
};

export class ApiError extends Error {
  constructor(message, { status = 0, code = '' } = {}) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
