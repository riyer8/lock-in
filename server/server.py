import json
import os
import re
import sys
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if not sys.path or sys.path[0] != str(ROOT):
    sys.path.insert(0, str(ROOT))

from server.coach import CoachError, request_coach_response, request_daily_plan
from server.envfile import load_env_file

HOST = os.environ.get("COACH_HOST") or "127.0.0.1"
PORT = int(os.environ.get("COACH_PORT") or 8787)
MAX_BODY_BYTES = 128 * 1024
ALLOWED_ORIGIN = re.compile(r"^chrome-extension://[a-z]{32}$")
REPO_ROOT = Path(__file__).resolve().parent.parent


def is_allowed_origin(origin):
    return (not origin) or bool(ALLOWED_ORIGIN.match(origin))


def response_headers(origin):
    headers = {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Connection": "close",
    }
    if origin and is_allowed_origin(origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Vary"] = "Origin"
    return headers


def read_json_body(handler):
    content_length = handler.headers.get("Content-Length")
    if content_length is not None:
        try:
            length = int(content_length)
        except ValueError as error:
            raise CoachError(
                "Request body must be valid JSON.",
                400,
                "MALFORMED_REQUEST",
            ) from error
        if length > MAX_BODY_BYTES:
            raise CoachError("Request body is too large.", 413, "REQUEST_TOO_LARGE")
        raw = handler.rfile.read(length)
    else:
        chunks = []
        size = 0
        while True:
            chunk = handler.rfile.read(4096)
            if not chunk:
                break
            size += len(chunk)
            if size > MAX_BODY_BYTES:
                raise CoachError("Request body is too large.", 413, "REQUEST_TOO_LARGE")
            chunks.append(chunk)
        raw = b"".join(chunks)

    text = raw.decode("utf-8")
    if not text.strip():
        raise CoachError("Request body is required.", 400, "MALFORMED_REQUEST")
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        raise CoachError(
            "Request body must be valid JSON.",
            400,
            "MALFORMED_REQUEST",
        ) from error


class CoachRequestHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def do_GET(self):
        self._handle()

    def do_POST(self):
        self._handle()

    def do_OPTIONS(self):
        self._handle()

    def do_PUT(self):
        self._handle()

    def do_DELETE(self):
        self._handle()

    def do_PATCH(self):
        self._handle()

    def _handle(self):
        origin = self.headers.get("Origin")

        if not is_allowed_origin(origin):
            self._send_json(403, {"error": "Origin is not allowed."}, None)
            return

        if self.command == "GET" and self.path == "/health":
            self._send_json(200, {"ok": True, "service": "lock-in-coach"}, origin)
            return

        if self.command == "OPTIONS" and self.path in ("/api/coach", "/api/plan"):
            headers = response_headers(origin)
            headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
            headers["Access-Control-Allow-Headers"] = "Content-Type"
            headers["Access-Control-Max-Age"] = "600"
            self.send_response(204)
            for key, value in headers.items():
                self.send_header(key, value)
            self.send_header("Content-Length", "0")
            self.end_headers()
            return

        is_coach_request = self.command == "POST" and self.path == "/api/coach"
        is_plan_request = self.command == "POST" and self.path == "/api/plan"
        if not is_coach_request and not is_plan_request:
            self._send_json(404, {"error": "Not found."}, origin)
            return

        content_type = (self.headers.get("Content-Type") or "").lower()
        if not content_type.startswith("application/json"):
            self._send_json(
                415,
                {"error": "Content-Type must be application/json."},
                origin,
            )
            return

        try:
            context = read_json_body(self)
            if is_plan_request:
                plan = request_daily_plan(context)
                self._send_json(200, {"plan": plan}, origin)
                return
            coaching = request_coach_response(context)
            self._send_json(200, {"coaching": coaching}, origin)
        except CoachError as error:
            self._send_json(
                error.status_code,
                {"error": str(error), "code": error.code},
                origin,
            )
        except Exception:
            print("AI Coach request failed", file=sys.stderr)
            traceback.print_exc()
            self._send_json(
                500,
                {"error": "AI Coach failed unexpectedly.", "code": "INTERNAL_ERROR"},
                origin,
            )

    def _send_json(self, status_code, body, origin):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status_code)
        for key, value in response_headers(origin).items():
            self.send_header(key, value)
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)


class CoachServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


def create_coach_server(host="127.0.0.1", port=0):
    return CoachServer((host, port), CoachRequestHandler)


def main():
    load_env_file(REPO_ROOT / ".env")
    host = os.environ.get("COACH_HOST") or "127.0.0.1"
    port = int(os.environ.get("COACH_PORT") or 8787)
    try:
        server = CoachServer((host, port), CoachRequestHandler)
    except OSError as error:
        print("AI Coach failed to listen", error, file=sys.stderr)
        sys.exit(1)
    print(f"LOCK IN AI Coach listening at http://{host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nLOCK IN AI Coach stopped.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
