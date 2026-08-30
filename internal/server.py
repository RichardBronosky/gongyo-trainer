from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from ipaddress import ip_address
import mimetypes
from os import getpid
from pathlib import Path


DENIED_BODY = b"""<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Accepted</title></head>
  <body><p>Request accepted.</p></body>
</html>
"""


class DevelopmentHandler(SimpleHTTPRequestHandler):
  server_version = "GongyoDevelopment/1.0"

  def __init__(self, *args, allowed_forwarded_ip=None, require_forwarded_for=False, **kwargs):
    self.allowed_forwarded_ip = ip_address(allowed_forwarded_ip) if allowed_forwarded_ip else None
    self.require_forwarded_for = require_forwarded_for
    super().__init__(*args, **kwargs)

  def end_headers(self):
    self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
    self.send_header("Pragma", "no-cache")
    self.send_header("Expires", "0")
    self.send_header("Accept-Ranges", "bytes")
    super().end_headers()

  def remove_conditional_headers(self):
    for header in ("If-Modified-Since", "If-None-Match"):
      if header in self.headers:
        del self.headers[header]

  def do_GET(self):
    self.remove_conditional_headers()
    if not self.allow_request():
      self.send_denied_response(include_body=True)
      return

    if "Range" in self.headers:
      self.send_range_response()
      return

    super().do_GET()

  def do_HEAD(self):
    self.remove_conditional_headers()
    if not self.allow_request():
      self.send_denied_response(include_body=False)
      return
    super().do_HEAD()

  def allow_request(self):
    if self.allowed_forwarded_ip is None:
      return True

    try:
      peer = ip_address(self.client_address[0])
    except ValueError:
      return False
    if not peer.is_loopback:
      return False

    forwarded_headers = self.headers.get_all("X-Forwarded-For", [])
    if not forwarded_headers:
      return not self.require_forwarded_for

    forwarded = [part.strip() for value in forwarded_headers for part in value.split(",")]
    if not forwarded or any(not value for value in forwarded):
      return False
    try:
      addresses = [ip_address(value) for value in forwarded]
    except ValueError:
      return False
    return addresses[-1] == self.allowed_forwarded_ip

  def send_denied_response(self, include_body):
    self.send_response(202, "Accepted")
    self.send_header("Content-Type", "text/html; charset=utf-8")
    self.send_header("Content-Length", str(len(DENIED_BODY)))
    self.end_headers()
    if include_body:
      try:
        self.wfile.write(DENIED_BODY)
      except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
        pass

  def send_range_response(self):
    path = Path(self.translate_path(self.path))
    if not path.is_file():
      self.send_error(404, "File not found")
      return

    size = path.stat().st_size
    try:
      range_header = self.headers["Range"]
      if not range_header.startswith("bytes=") or "," in range_header or size == 0:
        raise ValueError

      start_text, separator, end_text = range_header[6:].partition("-")
      if not separator or not (start_text or end_text):
        raise ValueError

      if start_text:
        start = int(start_text)
        end = int(end_text) if end_text else size - 1
      else:
        suffix_length = int(end_text)
        if suffix_length <= 0:
          raise ValueError
        start = max(0, size - suffix_length)
        end = size - 1

      if start < 0 or start >= size or end < start:
        raise ValueError
      end = min(end, size - 1)
    except ValueError:
      self.send_response(416)
      self.send_header("Content-Range", f"bytes */{size}")
      self.end_headers()
      return

    length = end - start + 1
    self.send_response(206)
    self.send_header("Content-Type", mimetypes.guess_type(path.name)[0] or "application/octet-stream")
    self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
    self.send_header("Content-Length", str(length))
    self.end_headers()

    with path.open("rb") as file:
      file.seek(start)
      remaining = length
      while remaining:
        chunk = file.read(min(1024 * 1024, remaining))
        if not chunk:
          break
        try:
          self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
          return
        remaining -= len(chunk)


def main():
  parser = ArgumentParser(description="Serve Gongyo assets without browser caching and with byte ranges.")
  parser.add_argument("--host", default="127.0.0.1")
  parser.add_argument("--port", type=int, default=8000)
  parser.add_argument("--directory", default="web")
  parser.add_argument("--allowed-forwarded-ip", help="Only serve forwarded requests from this exact client IP.")
  parser.add_argument("--require-forwarded-for", action="store_true", help="Deny requests without a forwarded client IP.")
  parser.add_argument("--ready-file", help="Write the server PID and bound port here after successfully binding.")
  args = parser.parse_args()

  if args.allowed_forwarded_ip:
    try:
      ip_address(args.allowed_forwarded_ip)
    except ValueError:
      parser.error(f"invalid --allowed-forwarded-ip: {args.allowed_forwarded_ip}")

  handler = partial(
    DevelopmentHandler,
    directory=args.directory,
    allowed_forwarded_ip=args.allowed_forwarded_ip,
    require_forwarded_for=args.require_forwarded_for,
  )
  server = ThreadingHTTPServer((args.host, args.port), handler)
  ready_file = Path(args.ready_file) if args.ready_file else None
  if ready_file:
    ready_file.write_text(f"{getpid()} {server.server_address[1]}\n")
  print(f"Serving {Path(args.directory).resolve()} at http://{args.host}:{server.server_address[1]}/", flush=True)
  try:
    server.serve_forever()
  except KeyboardInterrupt:
    pass
  finally:
    server.server_close()
    if ready_file:
      ready_file.unlink(missing_ok=True)


if __name__ == "__main__":
  main()
