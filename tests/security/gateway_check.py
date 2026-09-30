from pathlib import Path
import subprocess,tempfile,time,urllib.request,urllib.error,base64,threading,http.server,os
r=Path(__file__).resolve().parents[2];d=Path(tempfile.mkdtemp(prefix='presenton-gateway-'))
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  assert not self.headers.get('Authorization'),'Credentials reached upstream'
  self.send_response(200);self.end_headers();self.wfile.write(b'protected backend')
 def log_message(self,*a):pass
srv=http.server.HTTPServer(('127.0.0.1',18300),Handler);threading.Thread(target=srv.serve_forever,daemon=True).start()
hash=subprocess.check_output(['/usr/bin/openssl','passwd','-apr1','-salt','testonly','test-password'],text=True).strip();(d/'htpasswd').write_text('admin:'+hash+'\n')
config=(r/'nginx.conf').read_text().replace('user www-data;','').replace('/run/nginx.pid',str(d/'nginx.pid')).replace('/var/log/nginx/error.log',str(d/'error.log')).replace('/var/log/nginx/access.log',str(d/'access.log')).replace('include /etc/nginx/mime.types;','').replace('listen 80;','listen 127.0.0.1:18080;').replace('127.0.0.1:8081','127.0.0.1:18081').replace('/run/presenton/htpasswd',str(d/'htpasswd'))
for p in [3000,8000,8001]:config=config.replace(f'localhost:{p}', '127.0.0.1:18300')
(d/'nginx.conf').write_text(config);(d/'logs').mkdir()
proc=subprocess.Popen([os.environ['NGINX_BIN'],'-p',str(d)+'/', '-c',str(d/'nginx.conf'),'-g','daemon off;'],stderr=subprocess.PIPE)
def request(path,authorized=False,port=18080):
 headers={'Authorization':'Basic '+base64.b64encode(b'admin:test-password').decode()} if authorized else {}
 try:
  with urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}'+path,headers=headers),timeout=3) as response:return response.status
 except urllib.error.HTTPError as e:return e.code
try:
 for _ in range(50):
  try:
   if request('/')==401:break
  except OSError:time.sleep(.05)
 else:raise AssertionError(proc.stderr.read().decode())
 for route in ['/', '/api/v1/ppt/presentation/all?tenant=all','/api/user-config','/api/read-file','/docs','/openapi.json','/mcp','/mcp/', '/static/a','/app_data/exports/a','/app_data/uploads/a']:
  assert request(route)==401,route
 assert request('/',True)==200
 assert request('/api/v1/ppt/presentation/all',True)==200
 assert request('/',False,18081)==200
 request('/?callback_secret=never-log-this',True)
 time.sleep(.05)
 assert 'never-log-this' not in (d/'access.log').read_text()
 print('PASS: 11 anonymous entry points blocked; authorized and internal traffic works; Authorization stripped; query secrets omitted from access log')
finally:
 proc.terminate();proc.wait(timeout=5);srv.shutdown()
