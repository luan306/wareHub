#!/usr/bin/env bash
# Triển khai blue-green cho WareHub (xem deploy/docker-compose.yml).
#
#   ./bluegreen.sh deploy     Dựng bản mới lên bộ đang rảnh, kiểm tra, rồi chuyển lưu lượng. Bản cũ giữ nguyên để quay lại.
#   ./bluegreen.sh rollback   Chuyển lưu lượng về bản trước ngay lập tức.
#   ./bluegreen.sh status     Xem bộ nào đang phục vụ, phiên bản của từng bộ.
#   ./bluegreen.sh cleanup    Tắt bộ không còn phục vụ (sau khi chắc chắn bản mới ổn) để nhường tài nguyên.
#
# Trong lúc `deploy`, bản hiện tại vẫn phục vụ bình thường; nếu bản mới không lên được thì KHÔNG chuyển lưu lượng.
# Chạy trên máy chủ đã cài Docker, từ thư mục deploy/ (đã có file .env). Windows: dùng Git Bash hoặc WSL.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

DOCKER="${DOCKER:-docker}"            # đổi được để chạy thử (xem docs)
STATE_DIR="${STATE_DIR:-./state}"
READY_TIMEOUT="${READY_TIMEOUT:-120}" # giây chờ bản mới sẵn sàng
FORCE="${FORCE:-0}"                   # FORCE=1: vẫn chuyển dù phiên bản không đổi

log()  { printf '\033[1;34m[bluegreen]\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[bluegreen]\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m[bluegreen] LỖI:\033[0m %s\n' "$*" >&2; exit 1; }

# shellcheck disable=SC2086
compose() { $DOCKER compose "$@"; }
other()   { if [ "$1" = blue ]; then echo green; else echo blue; fi; }
active()  { if [ -f "$STATE_DIR/active" ]; then cat "$STATE_DIR/active"; else echo none; fi; }

# Gọi HTTP từ BÊN TRONG container gateway (cùng mạng nội bộ với web-blue / web-green).
probe()      { compose exec -T gateway wget -qO- -T 5 "$1" 2>/dev/null; }
json_field() { sed -n "s/.*\"$1\":\"\{0,1\}\([^\",}]*\).*/\1/p"; }
version_of() { probe "http://web-$1/api/ready" | json_field version || true; }

# Bộ $1 sẵn sàng khi: backend nối được cơ sở dữ liệu (/api/ready) VÀ web trả về trang chủ.
is_ready() {
  probe "http://web-$1/api/ready" | grep -q '"ready":true' && probe "http://web-$1/" | grep -q 'id="root"'
}

wait_ready() {
  local waited=0
  while [ "$waited" -lt "$READY_TIMEOUT" ]; do
    if is_ready "$1"; then return 0; fi
    sleep 2
    waited=$((waited + 2))
  done
  return 1
}

# Đổi bộ nhận lưu lượng sang $1 (bộ cũ là $2). Ghi file tạm rồi đổi tên nguyên tử; nginx -t trước khi nạp lại,
# lỗi cấu hình thì khôi phục file cũ và dừng — gateway không bao giờ nạp một cấu hình hỏng.
switch_to() {
  local target="$1" previous="${2:-}"
  mkdir -p "$STATE_DIR"
  [ -f "$STATE_DIR/upstream.conf" ] && cp "$STATE_DIR/upstream.conf" "$STATE_DIR/upstream.conf.bak"
  printf 'server web-%s:80;\n' "$target" > "$STATE_DIR/upstream.conf.tmp"
  mv "$STATE_DIR/upstream.conf.tmp" "$STATE_DIR/upstream.conf"
  if ! compose exec -T gateway nginx -t; then
    [ -f "$STATE_DIR/upstream.conf.bak" ] && mv "$STATE_DIR/upstream.conf.bak" "$STATE_DIR/upstream.conf"
    die "Cấu hình gateway không hợp lệ, đã khôi phục cấu hình cũ (lưu lượng vẫn ở bộ cũ)."
  fi
  compose exec -T gateway nginx -s reload
  if [ -n "$previous" ]; then echo "$previous" > "$STATE_DIR/previous"; fi
  echo "$target" > "$STATE_DIR/active"
  log "Lưu lượng đã chuyển sang: $target"
}

# Sau khi chuyển: gọi qua gateway nhiều lần, phiên bản trả về phải là bản mới và luôn sẵn sàng.
verify_through_gateway() {
  local expected="$1" i got
  for i in 1 2 3 4 5 6 7 8; do
    got="$(probe 'http://localhost/api/health' | json_field version || true)"
    [ "$got" = "$expected" ] || { warn "Kiểm tra qua gateway lần $i: thấy phiên bản '$got', cần '$expected'"; return 1; }
    probe 'http://localhost/api/ready' | grep -q '"ready":true' || { warn "Kiểm tra qua gateway lần $i: chưa sẵn sàng"; return 1; }
    sleep 1
  done
}

first_deploy() {
  log "Lần triển khai đầu tiên: dựng bộ blue"
  mkdir -p "$STATE_DIR"
  compose build backend-blue web-blue
  compose up -d mysql
  compose up -d backend-blue web-blue
  printf 'server web-blue:80;\n' > "$STATE_DIR/upstream.conf"
  compose up -d gateway
  echo blue > "$STATE_DIR/active"
  wait_ready blue || die "Bộ blue không sẵn sàng sau ${READY_TIMEOUT}s (xem: docker compose logs backend-blue)"
  log "Xong. Hệ thống đang chạy trên blue. Lần cập nhật sau sẽ dựng lên green rồi chuyển sang."
}

cmd_deploy() {
  local current idle old_v new_v
  current="$(active)"
  if [ "$current" = none ]; then first_deploy; return; fi
  idle="$(other "$current")"

  log "Đang phục vụ: $current. Dựng bản mới lên $idle (người dùng vẫn dùng $current bình thường)..."
  compose build "backend-$idle" "web-$idle"
  compose up -d --no-deps --force-recreate "backend-$idle" "web-$idle"

  log "Chờ $idle sẵn sàng (tối đa ${READY_TIMEOUT}s)..."
  if ! wait_ready "$idle"; then
    compose logs --tail=60 "backend-$idle" || true
    compose stop "backend-$idle" "web-$idle" || true
    die "Bản mới KHÔNG sẵn sàng. Chưa chuyển lưu lượng — $current vẫn đang phục vụ bình thường."
  fi

  old_v="$(version_of "$current")"
  new_v="$(version_of "$idle")"
  log "Phiên bản đang phục vụ: ${old_v:-?} | bản mới: ${new_v:-?}"
  if [ -n "$new_v" ] && [ "$new_v" = "$old_v" ] && [ "$FORCE" != 1 ]; then
    compose stop "backend-$idle" "web-$idle" || true
    die "Bản mới trùng phiên bản đang chạy (chưa có thay đổi nào được build). Dùng FORCE=1 nếu vẫn muốn chuyển."
  fi

  switch_to "$idle" "$current"
  if ! verify_through_gateway "$new_v"; then
    warn "Kiểm tra sau khi chuyển THẤT BẠI — tự động quay lại $current"
    switch_to "$current" "$idle"
    die "Đã quay lại $current. Xem log: docker compose logs backend-$idle"
  fi
  log "THÀNH CÔNG: $idle (phiên bản $new_v) đang phục vụ."
  log "Bản cũ ($current, phiên bản ${old_v:-?}) vẫn chạy để quay lại tức thì: ./bluegreen.sh rollback"
  log "Khi đã yên tâm: ./bluegreen.sh cleanup"
}

cmd_rollback() {
  local current previous
  current="$(active)"
  [ "$current" != none ] || die "Chưa có lần triển khai nào."
  previous="$(cat "$STATE_DIR/previous" 2>/dev/null || true)"
  [ -n "$previous" ] || previous="$(other "$current")"

  log "Quay lại $previous (đang phục vụ: $current)..."
  compose up -d --no-deps "backend-$previous" "web-$previous"   # bật lại nếu đã bị cleanup
  wait_ready "$previous" || die "Bộ $previous không sẵn sàng; giữ nguyên $current."
  local v; v="$(version_of "$previous")"
  switch_to "$previous" "$current"
  verify_through_gateway "$v" || warn "Kiểm tra sau rollback có cảnh báo, hãy xem ./bluegreen.sh status"
  log "Đã quay lại $previous (phiên bản ${v:-?})."
}

cmd_status() {
  local current; current="$(active)"
  echo "Bộ đang phục vụ : $current"
  echo "Bộ trước đó     : $(cat "$STATE_DIR/previous" 2>/dev/null || echo -)"
  for c in blue green; do
    if is_ready "$c"; then echo "  $c: sẵn sàng, phiên bản $(version_of "$c")"; else echo "  $c: không chạy / chưa sẵn sàng"; fi
  done
}

cmd_cleanup() {
  local current idle
  current="$(active)"
  [ "$current" != none ] || die "Chưa có lần triển khai nào."
  idle="$(other "$current")"
  log "Tắt bộ $idle (không còn phục vụ). Sau bước này chỉ quay lại được bằng cách deploy lại."
  compose stop "backend-$idle" "web-$idle"
}

case "${1:-}" in
  deploy)   cmd_deploy ;;
  rollback) cmd_rollback ;;
  status)   cmd_status ;;
  cleanup)  cmd_cleanup ;;
  *) sed -n '2,10p' "$0"; exit 1 ;;
esac
