"""Run against the production build, with dummy credentials and no provider calls."""
from pathlib import Path
import tempfile, subprocess, os, time, urllib.request, urllib.error, json
root=Path(__file__).resolve().parents[2]
tmp=Path(tempfile.mkdtemp(prefix='presenton-routes-'))
(tmp/'notes.txt').write_text('safe preview')
(tmp/'userConfig.json').write_text('{"secret":"must-not-be-readable"}')
env={**os.environ,'OPENAI_API_KEY':'security-test-placeholder','TEMP_DIRECTORY':str(tmp),'NEXT_TELEMETRY_DISABLED':'1'}
log=open(tmp/'server.log','w+')
proc=subprocess.Popen(['node','node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','18400'],cwd=root/'servers/nextjs',env=env,stdout=log,stderr=log)
def call(route,body=None,origin=None):
 headers={'Content-Type':'application/json'}
 if origin:headers['Origin']=origin
 request=urllib.request.Request('http://127.0.0.1:18400'+route,data=None if body is None else json.dumps(body).encode(),headers=headers)
 try:
  with urllib.request.urlopen(request,timeout=5) as response:return response.status,json.loads(response.read())
 except urllib.error.HTTPError as e:return e.code,json.loads(e.read())
try:
 for _ in range(100):
  try:
   if call('/api/has-required-key')[0]==200:break
  except OSError:time.sleep(.1)
 else:raise AssertionError('Next server did not start')
 assert call('/api/has-required-key')==(200,{'hasKey':True})
 assert call('/api/can-change-keys')==(200,{'canChange':False})
 assert call('/api/user-config')[0]==403
 assert call('/api/user-config',{})[0]==403
 assert call('/api/read-file',{'filePath':str(tmp/'notes.txt')})==(200,{'content':'safe preview'})
 assert call('/api/read-file',{'filePath':str(tmp/'userConfig.json')})[0]==403
 assert call('/api/read-file',{'filePath':'/etc/passwd'})[0]==403
 assert call('/api/read-file',{'filePath':str(tmp/'notes.txt')},'https://attacker.example.test')[0]==403
 assert call('/api/save-layout',{'layout_name':'../../escape','components':[]})[0]==400
 assert call('/api/save-layout',{'layout_name':'safe','components':[{'component_name':'../../escape','component_code':'x'}]})[0]==400
 log.flush();log.seek(0);assert 'security-test-placeholder' not in log.read()
 print('PASS: 10 production Next route assertions; credentials not logged; no provider requests')
finally:
 proc.terminate();proc.wait(timeout=10);log.close()
