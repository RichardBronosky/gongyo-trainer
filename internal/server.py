from argparse import ArgumentParser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path


class DevelopmentHandler(SimpleHTTPRequestHandler):
  server_version = "GongyoDevelopment/1.0"

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

    if "Range" in self.headers:
      self.send_range_response()
      return

    super().do_GET()

  def do_HEAD(self):
    self.remove_conditional_headers()
    super().do_HEAD()

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
        self.wfile.write(chunk)
        remaining -= len(chunk)


def main():
  parser = ArgumentParser(description="Serve Gongyo assets without browser caching and with byte ranges.")
  parser.add_argument("--host", default="127.0.0.1")
  parser.add_argument("--port", type=int, default=8000)
  parser.add_argument("--directory", default="web")
  args = parser.parse_args()

  handler = partial(DevelopmentHandler, directory=args.directory)
  server = ThreadingHTTPServer((args.host, args.port), handler)
  print(f"Serving {Path(args.directory).resolve()} at http://{args.host}:{args.port}/", flush=True)
  server.serve_forever()


if __name__ == "__main__":
  main()
