import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { provisionAuthentication } from '../../security/auth-file.js';

test('authentication fails closed and never writes invalid credentials',()=>{
 const base=fs.mkdtempSync(path.join(os.tmpdir(),'presenton-auth-'));
 const target=path.join(base,'auth');
 try {
  for(const bad of [undefined,'','admin:password','admin:{PLAIN}password','admin:$6$bad', 'admin:$6$salt$'+'a'.repeat(86)+'\nother:secret']) {
    assert.throws(()=>provisionAuthentication(bad,target));
    assert.equal(fs.existsSync(target),false);
  }
  const record='admin:$6$salt$'+'a'.repeat(86);
  provisionAuthentication(record,target);
  assert.equal(fs.readFileSync(path.join(target,'htpasswd'),'utf8'),record+'\n');
 } finally {fs.rmSync(base,{recursive:true,force:true});}
});
