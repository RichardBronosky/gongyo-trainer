#!/usr/bin/env bash
# Local development utility belt. All runtime tools come from the Nix dev shell.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${GONGYO_TOOLS_CONFIG:-${REPO_ROOT}/.env}"

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
  nix develop "path:${REPO_ROOT}" --command "$@"
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
    notify) cmd_notify "$@" ;;
    shell) cmd_shell "$@" ;;
    help|-h|--help) cmd_help ;;
    *) die "unknown command: $command (see: $0 help)" ;;
  esac
}

main "$@"
