// fetch() không tự có timeout — quá thời gian này mà máy chủ không trả lời thì tự huỷ yêu cầu (tránh treo mãi khi
// mạng chập chờn) thay vì mỗi nơi gọi tự viết lại AbortController + setTimeout + clearTimeout của riêng mình.
export function fetchWithTimeout(url, { timeoutMs, ...options } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}
