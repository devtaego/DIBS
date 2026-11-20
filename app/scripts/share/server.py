# DIBS 앱 데모 실행기: 이 폴더의 site/ 를 http://localhost:8080 으로 띄운다 (영상 이동을 위한 Range 지원)
import http.server, os, re, socket, sys, webbrowser
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'site')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def send_head(self):
        rng = self.headers.get('Range'); p = self.translate_path(self.path)
        if not rng or not os.path.isfile(p): return super().send_head()
        size = os.path.getsize(p); m = re.match(r'bytes=(\d*)-(\d*)', rng)
        a = int(m.group(1) or 0); b = int(m.group(2) or size - 1)
        f = open(p, 'rb'); f.seek(a); self.send_response(206)
        self.send_header('Content-Type', self.guess_type(p)); self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Range', f'bytes {a}-{b}/{size}'); self.send_header('Content-Length', str(b - a + 1)); self.end_headers()
        self._left = b - a + 1; return f
    def copyfile(self, src, dst):
        n = getattr(self, '_left', None)
        if n is None: return super().copyfile(src, dst)
        while n > 0:
            buf = src.read(min(65536, n))
            if not buf: break
            dst.write(buf); n -= len(buf)
    def log_message(self, *a): pass
try:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); ip = s.getsockname()[0]; s.close()
except Exception:
    ip = '이 PC의 IP'
print(f'DIBS 앱 데모가 열렸어요\n  PC:   http://localhost:{PORT}/index.html\n  휴대폰(같은 와이파이): http://{ip}:{PORT}/index.html\n끄려면 이 창을 닫거나 Ctrl+C')
webbrowser.open(f'http://localhost:{PORT}/index.html')
http.server.ThreadingHTTPServer(('0.0.0.0', PORT), H).serve_forever()
