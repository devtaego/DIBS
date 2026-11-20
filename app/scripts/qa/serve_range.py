import http.server, os, re, sys
ROOT='/home/claude/devtaego/dibs-dist'; PRE='/_f/tok123/'
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path=path.split('?')[0].split('#')[0]
        if not path.startswith(PRE): return '/nonexistent'
        return os.path.join(ROOT, path[len(PRE):] or 'index.html')
    def send_head(self):
        rng=self.headers.get('Range'); p=self.translate_path(self.path)
        if not rng or not os.path.isfile(p): return super().send_head()
        size=os.path.getsize(p); m=re.match(r'bytes=(\d*)-(\d*)',rng); a=int(m.group(1) or 0); b=int(m.group(2) or size-1)
        f=open(p,'rb'); f.seek(a); self.send_response(206)
        self.send_header('Content-Type', self.guess_type(p)); self.send_header('Accept-Ranges','bytes')
        self.send_header('Content-Range', f'bytes {a}-{b}/{size}'); self.send_header('Content-Length', str(b-a+1)); self.end_headers()
        self._left=b-a+1; return f
    def copyfile(self, src, dst):
        n=getattr(self,'_left',None)
        if n is None: return super().copyfile(src,dst)
        while n>0:
            buf=src.read(min(65536,n))
            if not buf: break
            dst.write(buf); n-=len(buf)
    def log_message(self,*a): pass
http.server.ThreadingHTTPServer(('127.0.0.1',8091),H).serve_forever()
