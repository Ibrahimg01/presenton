import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startSiteGateway } from '../../security/site-gateway.js';
import { signIdentity } from '../../security/site-identity.js';

test('gateway binds session to site and rejects spoofing, forged render access and cross-site assets',async()=>{
 const realFetch=global.fetch, key=randomBytes(32), root=fs.mkdtempSync(path.join(os.tmpdir(),'site-gateway-'));
 const before=process.env.APP_DATA_DIRECTORY;process.env.APP_DATA_DIRECTORY=root;
 for(const site of ['1','2']){fs.mkdirSync(path.join(root,'sites',site,'images'),{recursive:true});fs.writeFileSync(path.join(root,'sites',site,'images','test.txt'),'site '+site);}
 global.fetch=async(url,options)=>{
  if(String(url).startsWith('https://wordpress.example/')) {
   const body=JSON.parse(options.body);
   if(body.ticket==='a'.repeat(64))return new Response(JSON.stringify({site:1,user:7,parent_origin:'https://customer.wordpress.example'}));
   return new Response('{}',{status:403});
  }
  return realFetch(url,options);
 };
 const server=startSiteGateway({key,wordpressOrigin:'https://wordpress.example',studioOrigin:'https://studio.example',port:0});
 await once(server,'listening');const base='http://127.0.0.1:'+server.address().port;
 const request=(p,extra={})=>realFetch(base+p,{headers:{cookie:'__Host-presenton-session='+'a'.repeat(64),...extra}});
 try {
  assert.equal((await realFetch(base+'/verify')).status,403);
  assert.equal((await request('/verify',{'x-original-uri':'/upload?tenant=1'})).status,204);
  assert.equal((await request('/verify',{'x-original-uri':'/upload?tenant=1','origin':'https://evil.example'})).headers.get('x-presenton-frame-ancestors'),'https://customer.wordpress.example');
  for(const tenant of ['2','all','1&tenant=2'])assert.equal((await request('/verify',{'x-original-uri':'/upload?tenant='+tenant})).status,403);
  for(const p of ['/api/user-config','/api/save-layout','/api/v1/ppt/ollama/model/pull','/api/v1/ppt/html-to-react/'])assert.equal((await request('/verify',{'x-original-uri':p})).status,403);
  assert.equal((await request('/app_data/sites/1/images/test.txt')).status,200);
  assert.equal((await request('/app_data/sites/2/images/test.txt')).status,403);
  const render=signIdentity({aud:'presenton-site',site:'2',user:'8',exp:Math.floor(Date.now()/1000)+60},key);
  assert.equal((await request('/verify',{cookie:'presenton_render='+render})).status,403);
  assert.equal((await request('/verify',{cookie:'presenton_render='+render,'x-internal-render':'1'})).status,204);
  assert.equal((await request('/verify',{cookie:'presenton_render='+render+'x','x-internal-render':'1'})).status,403);
 }finally{server.close();global.fetch=realFetch;before===undefined?delete process.env.APP_DATA_DIRECTORY:process.env.APP_DATA_DIRECTORY=before;fs.rmSync(root,{recursive:true,force:true});}
});
