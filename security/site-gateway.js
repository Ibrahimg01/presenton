import http from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { signIdentity, verifyIdentity } from './site-identity.js';

export function startSiteGateway({key, wordpressOrigin, studioOrigin, port=8082}) {
  const wp = new URL(wordpressOrigin), studio = new URL(studioOrigin);
  for (const u of [wp,studio]) if (u.protocol !== 'https:' || u.pathname !== '/' || u.search || u.hash || u.username || u.password) throw Error('HTTPS origins required');
  const now = () => Math.floor(Date.now()/1000);
  const cookie = (name,value,seconds) => `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;
  const cookies = req => Object.fromEntries((req.headers.cookie || '').split(';').map(s=>s.trim().split('=')));
  const hash = s => createHash('sha256').update(s).digest('base64url');
  const cache = new Map();
  async function callWP(route, payload) {
    const response = await fetch(new URL('/wp-json/presenton-security/v1/'+route,wp), {method:'POST', redirect:'error', signal:AbortSignal.timeout(8000), headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    if (!response.ok) throw Error('WordPress access denied');
    return response.json();
  }
  async function authorize(req) {
    const c=cookies(req);
    if (req.headers['x-internal-render']==='1' && c.presenton_render) return verifyIdentity(c.presenton_render,key);
    const ticket=c['__Host-presenton-session'];
    if (!ticket || !/^[a-f0-9]{64}$/.test(ticket)) throw Error('Sign in through WordPress');
    const cached=cache.get(hash(ticket));
    if (cached && cached.until>now()) return cached.identity;
    const value=await callWP('session',{ticket});
    const parent=new URL(value.parent_origin);
    if(parent.protocol!=='https:' || parent.origin!==value.parent_origin || parent.username || parent.password) throw Error('Invalid parent origin');
    const identity={aud:'presenton-site',site:String(value.site),user:String(value.user),parent:parent.origin,exp:now()+300};
    verifyIdentity(signIdentity(identity,key),key);
    if (cache.size>2000) cache.clear();
    cache.set(hash(ticket),{until:now()+30,identity});
    return identity;
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store'); res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    try {
      const u=new URL(req.url,'http://127.0.0.1');
      if(u.pathname==='/auth/start' && req.method==='GET') {
        const site=u.searchParams.get('site'); if(!/^[1-9][0-9]{0,9}$/.test(site||'')) throw Error('Select a WordPress site');
        const verifier=randomBytes(32).toString('base64url'), state=randomBytes(24).toString('hex');
        const flow=signIdentity({aud:'presenton-site',site,user:'1',exp:now()+300,state,verifier},key);
        const destination=new URL('/wp-admin/admin-post.php',wp);
        destination.search=new URLSearchParams({action:'presenton_studio_authorize',site,state,challenge:hash(verifier)}).toString();
        res.writeHead(302,{'Set-Cookie':cookie('__Host-presenton-flow',flow,300),Location:destination.href});return res.end();
      }
      if(u.pathname==='/auth/callback' && req.method==='GET') {
        const flow=verifyIdentity(cookies(req)['__Host-presenton-flow'],key);
        if(u.searchParams.get('state')!==flow.state) throw Error('Login state mismatch');
        const value=await callWP('exchange',{code:u.searchParams.get('code'),verifier:flow.verifier});
        if(String(value.site)!==flow.site || !/^[a-f0-9]{64}$/.test(value.ticket||'')) throw Error('Login site mismatch');
        res.writeHead(302,{'Set-Cookie':[cookie('__Host-presenton-flow','',0),cookie('__Host-presenton-session',value.ticket,28800)],Location:'/upload?tenant='+flow.site}); return res.end();
      }
      if(u.pathname==='/auth/logout' && req.method==='POST') {
        if(req.headers.origin!==studio.origin) throw Error('Same-origin request required');
        const ticket=cookies(req)['__Host-presenton-session']; if(ticket) {await callWP('logout',{ticket});cache.delete(hash(ticket));}
        res.writeHead(200,{'Set-Cookie':cookie('__Host-presenton-session','',0)});return res.end('Signed out');
      }
      const identity=await authorize(req);
      if(u.pathname==='/verify') {
        const original=new URL(req.headers['x-original-uri']||'/',studio);
        if(req.headers["sec-fetch-site"] === "cross-site" && original.pathname.startsWith("/api/")) throw Error("Same-origin API required");
        if(original.searchParams.has('tenant') && original.searchParams.getAll('tenant').some(t=>t!==identity.site)) throw Error('Site mismatch');
        // Management surfaces are not customer APIs, including for super-admin site sessions.
        if(/^\/(?:mcp|docs|openapi.json|custom-template|custom-layout)(?:\/|$)/.test(original.pathname) || /^\/api\/(?:save-layout|user-config)(?:\/|$)/.test(original.pathname) || /^\/api\/v1\/(?:webhook|mock)/.test(original.pathname) || /^\/api\/v1\/ppt\/(?:ollama|openai|google|anthropic|slide-to-html|html-to-react|html-edit|template-management|pptx-slides|pdf-slides)(?:\/|$)/.test(original.pathname)) throw Error('Server management only');
        res.writeHead(204,{'X-Presenton-Identity':signIdentity({...identity,exp:now()+300},key),'X-Presenton-Site':identity.site,'X-Presenton-Frame-Ancestors':identity.parent || "'none'"});return res.end();
      }
      if(u.pathname.startsWith('/app_data/')) {
        if(!['GET','HEAD'].includes(req.method)) throw Error('Read only');
        const root=fs.realpathSync(path.join(process.env.APP_DATA_DIRECTORY||'/app_data','sites',identity.site));
        const relative=decodeURIComponent(u.pathname).slice('/app_data/'.length);
        const requested=fs.realpathSync(path.join(process.env.APP_DATA_DIRECTORY||'/app_data',relative));
        const rel=path.relative(root,requested);
        if(rel.startsWith('..') || path.isAbsolute(rel) || !/^(images|exports|uploads|fonts)\//.test(rel) || !fs.statSync(requested).isFile()) throw Error('File not owned by site');
        const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.svg':'image/svg+xml','.pdf':'application/pdf','.pptx':'application/vnd.openxmlformats-officedocument.presentationml.presentation','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.otf':'font/otf'};
        const ext=path.extname(requested).toLowerCase();res.setHeader('Content-Type',types[ext]||'application/octet-stream');
        res.setHeader('Content-Security-Policy',"default-src 'none'; sandbox");
        if(['.pdf','.pptx'].includes(ext) || !types[ext]) res.setHeader('Content-Disposition','attachment');
        if(req.method==='HEAD')return res.end();return fs.createReadStream(requested).pipe(res);
      }
      res.writeHead(404);res.end('Not found');
    } catch {res.writeHead(403);res.end('Access denied. Open the studio from your WordPress site.');}
  });
  server.listen(port,'127.0.0.1');return server;
}
