#!/usr/bin/env bash
# Local development utility belt. All runtime tools come from the Nix dev shell.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${GONGYO_TOOLS_CONFIG:-${REPO_ROOT}/.env}"
EXPOSE_SERVER_PID=""
EXPOSE_GATEWAY_PID=""
EXPOSE_TUNNEL_PID=""
EXPOSE_READY_FILE=""
EXPOSE_GATEWAY_READY_FILE=""

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"; }

load_config() {
  local env_http_bind="${HTTP_BIND:-}"
  local env_http_port="${HTTP_PORT:-}"
  local env_web_root="${WEB_ROOT:-}"
  local env_ngrok_url="${NGROK_URL:-}"
  local env_ntfy_server_url="${NTFY_SERVER_URL:-}"
  local env_ntfy_topic="${NTFY_TOPIC:-}"

  if [[ -f "$CONFIG_FILE" ]]; then
    # This is a project-local shell configuration file; do not put secrets in it.
    set -a
    # shellcheck disable=SC1090
    source "$CONFIG_FILE"
    set +a
  fi

  HTTP_BIND="${env_http_bind:-${HTTP_BIND:-127.0.0.1}}"
  HTTP_PORT="${env_http_port:-${HTTP_PORT:-8000}}"
  WEB_ROOT="${env_web_root:-${WEB_ROOT:-${REPO_ROOT}/web}}"
  NGROK_URL="${env_ngrok_url:-${NGROK_URL:-}}"
  NTFY_SERVER_URL="${env_ntfy_server_url:-${NTFY_SERVER_URL:-https://ntfy.sh}}"
  NTFY_TOPIC="${env_ntfy_topic:-${NTFY_TOPIC:-BrunoBronosky}}"

  [[ "$HTTP_PORT" =~ ^[0-9]+$ ]] || die "HTTP_PORT must be numeric: $HTTP_PORT"
  [[ -d "$WEB_ROOT" ]] || die "WEB_ROOT is not a directory: $WEB_ROOT"
  [[ -n "$NTFY_SERVER_URL" ]] || die "NTFY_SERVER_URL must not be empty"
  [[ -n "$NTFY_TOPIC" ]] || die "NTFY_TOPIC must not be empty"
}

in_dev_shell() {
  need nix
  exec nix develop "path:${REPO_ROOT}" --command "$@"
}

cmd_serve() {
  printf 'Serving %s at http://%s:%s/\n' "$WEB_ROOT" "$HTTP_BIND" "$HTTP_PORT"
  in_dev_shell python3 "${REPO_ROOT}/internal/server.py" \
    --host "$HTTP_BIND" \
    --port "$HTTP_PORT" \
    --directory "$WEB_ROOT"
}

cmd_tunnel() {
  if [[ -n "$NGROK_URL" ]]; then
    printf 'Forwarding %s to http://127.0.0.1:%s/\n' "$NGROK_URL" "$HTTP_PORT"
    in_dev_shell ngrok http --url "$NGROK_URL" "$HTTP_PORT"
  else
    printf 'Starting a free ngrok endpoint for http://127.0.0.1:%s/\n' "$HTTP_PORT"
    in_dev_shell ngrok http "$HTTP_PORT"
  fi
}

cmd_public() {
  need ngrok-home
  local public_ip
  public_ip="$(ngrok-home --print-ip)"
  [[ "$public_ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || die "could not detect a public IPv4 address: $public_ip"
  in_dev_shell "${REPO_ROOT}/tools.sh" __expose-inner ngrok "$public_ip"
}

wait_for_server() {
  local server_pid="$1"
  local ready_file="$2"
  local attempts=0
  while (( attempts < 100 )); do
    kill -0 "$server_pid" 2>/dev/null || return 1
    [[ "$(<"$ready_file")" == "$server_pid "* ]] && return 0
    sleep 0.05
    attempts=$((attempts + 1))
  done
  return 1
}

ngrok_public_url() {
  local target_port="$1"
  python3 - "$target_port" <<'PY'
import json
import sys
from urllib.request import urlopen

try:
  with urlopen("http://127.0.0.1:4040/api/tunnels", timeout=0.2) as response:
    tunnels = json.load(response).get("tunnels", [])
except Exception:
  raise SystemExit(1)

target = f"http://localhost:{sys.argv[1]}"
for tunnel in tunnels:
  if tunnel.get("proto") == "https" and tunnel.get("config", {}).get("addr") in (target, target.replace("localhost", "127.0.0.1")):
    print(tunnel["public_url"])
    break
else:
  raise SystemExit(1)
PY
}

wait_for_tunnel_url() {
  local backend="$1"
  local tunnel_pid="$2"
  local target_port="$3"
  local attempts=0
  local url
  while (( attempts < 100 )); do
    kill -0 "$tunnel_pid" 2>/dev/null || return 1
    if [[ "$backend" == "ngrok" ]] && url="$(ngrok_public_url "$target_port" 2>/dev/null)"; then
      printf '%s\n' "$url"
      return 0
    fi
    sleep 0.1
    attempts=$((attempts + 1))
  done
  return 1
}

inspection_port_available() {
  python3 <<'PY'
import socket

with socket.socket() as sock:
  try:
    sock.bind(("127.0.0.1", 4040))
  except OSError:
    raise SystemExit(1)
PY
}

cmd_expose_inner() {
  local backend="${1:-}"
  local public_ip="${2:-}"
  local gateway_port=""

  [[ "$backend" == "ngrok" ]] || die "unsupported tunnel backend: $backend"
  [[ -n "$public_ip" ]] || die "missing public IPv4 address"

  cleanup_exposure() {
    trap - EXIT
    [[ -z "$EXPOSE_TUNNEL_PID" ]] || kill "$EXPOSE_TUNNEL_PID" 2>/dev/null || true
    [[ -z "$EXPOSE_GATEWAY_PID" ]] || kill "$EXPOSE_GATEWAY_PID" 2>/dev/null || true
    [[ -z "$EXPOSE_SERVER_PID" ]] || kill "$EXPOSE_SERVER_PID" 2>/dev/null || true
    [[ -z "$EXPOSE_TUNNEL_PID" ]] || wait "$EXPOSE_TUNNEL_PID" 2>/dev/null || true
    [[ -z "$EXPOSE_GATEWAY_PID" ]] || wait "$EXPOSE_GATEWAY_PID" 2>/dev/null || true
    [[ -z "$EXPOSE_SERVER_PID" ]] || wait "$EXPOSE_SERVER_PID" 2>/dev/null || true
    [[ -z "$EXPOSE_READY_FILE" ]] || rm -f "$EXPOSE_READY_FILE"
    [[ -z "$EXPOSE_GATEWAY_READY_FILE" ]] || rm -f "$EXPOSE_GATEWAY_READY_FILE"
  }
  trap cleanup_exposure EXIT
  trap 'exit 130' INT TERM HUP

  inspection_port_available || die "ngrok inspection port 4040 is already in use"
  EXPOSE_READY_FILE="$(mktemp "${TMPDIR:-/tmp}/gongyo-ready.XXXXXX")"
  EXPOSE_GATEWAY_READY_FILE="$(mktemp "${TMPDIR:-/tmp}/gongyo-gateway-ready.XXXXXX")"

  python3 "${REPO_ROOT}/internal/server.py" \
    --host 127.0.0.1 \
    --port "$HTTP_PORT" \
    --directory "$WEB_ROOT" \
    --ready-file "$EXPOSE_READY_FILE" &
  EXPOSE_SERVER_PID=$!
  wait_for_server "$EXPOSE_SERVER_PID" "$EXPOSE_READY_FILE" || die "development server failed to start"

  python3 "${REPO_ROOT}/internal/server.py" \
    --host 127.0.0.1 \
    --port 0 \
    --directory "$WEB_ROOT" \
    --allowed-forwarded-ip "$public_ip" \
    --require-forwarded-for \
    --ready-file "$EXPOSE_GATEWAY_READY_FILE" &
  EXPOSE_GATEWAY_PID=$!
  wait_for_server "$EXPOSE_GATEWAY_PID" "$EXPOSE_GATEWAY_READY_FILE" || die "gated server failed to start"
  read -r _ gateway_port <"$EXPOSE_GATEWAY_READY_FILE"

  if [[ -n "$NGROK_URL" ]]; then
    ngrok http --url "$NGROK_URL" "$gateway_port" &
  else
    ngrok http "$gateway_port" &
  fi
  EXPOSE_TUNNEL_PID=$!

  local public_url
  public_url="$(wait_for_tunnel_url "$backend" "$EXPOSE_TUNNEL_PID" "$gateway_port")" || die "$backend failed to provide a public URL"
  printf '\nPublic URL: %s/\n' "${public_url%/}"
  printf 'Serving only localhost and forwarded client %s. Press Ctrl-C to stop both processes.\n\n' "$public_ip"

  local status
  set +e
  wait -n "$EXPOSE_SERVER_PID" "$EXPOSE_GATEWAY_PID" "$EXPOSE_TUNNEL_PID"
  status=$?
  set -e
  return "$status"
}

cmd_bump() {
  local sw_file="${REPO_ROOT}/web/sw.js"
  local html_file="${REPO_ROOT}/web/index.html"
  local current next

  current="$(grep -oP 'gongyo-trainer-v\K[0-9]+' "$sw_file")" || die "could not read version from $sw_file"
  next=$((current + 1))

  sed -i "s/gongyo-trainer-v${current}/gongyo-trainer-v${next}/" "$sw_file"
  sed -i "s/v${current}/v${next}/" "$html_file"
  printf 'Bumped %s → %s\n' "v${current}" "v${next}"
}

cmd_notify() {
  local message="${*:-Gongyo Trainer notification test}"
  local topic_url="${NTFY_SERVER_URL%/}/${NTFY_TOPIC#/}"

  in_dev_shell ntfy publish \
    --title "Gongyo Trainer" \
    "$topic_url" \
    "$message"
}

cmd_shell() {
  need nix
  exec nix develop "path:${REPO_ROOT}"
}

cmd_help() {
  local ngrok_target="an ngrok-assigned URL"
  [[ -n "$NGROK_URL" ]] && ngrok_target="$NGROK_URL"

  cat <<EOF
Usage: $0 <command> [args]

  serve
      Serve $WEB_ROOT at http://$HTTP_BIND:$HTTP_PORT/ without caching and with byte ranges.

  tunnel
      Expose the local server at $ngrok_target. Run serve in another terminal first.

  public
      Start the server and ngrok together, restricted to your current public IPv4.

  bump
      Increment the cache-busting version in sw.js and index.html.

  notify [message...]
      Publish a message to ${NTFY_SERVER_URL%/}/${NTFY_TOPIC#/}.

  shell
      Enter the Nix development shell containing Python, ngrok, and ntfy.

Configuration is loaded from $CONFIG_FILE when it exists. Environment variables
override that file. See .env.example for available settings.
EOF
}

main() {
  load_config

  local command="${1:-help}"
  shift || true

  case "$command" in
    serve) cmd_serve "$@" ;;
    tunnel) cmd_tunnel "$@" ;;
    public) cmd_public "$@" ;;
    bump) cmd_bump "$@" ;;
    __expose-inner) cmd_expose_inner "$@" ;;
    notify) cmd_notify "$@" ;;
    shell) cmd_shell "$@" ;;
    help|-h|--help) cmd_help ;;
    *) die "unknown command: $command (see: $0 help)" ;;
  esac
}

main "$@"
