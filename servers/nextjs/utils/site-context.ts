import { createHmac, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { headers } from "next/headers";

export async function siteContext() {
  if (process.env.PRESENTON_CUSTOMER_ACCESS !== "1") return null;
  const token = (await headers()).get("x-presenton-identity") || "";
  const [body, signature, extra] = token.split(".");
  const key = fs.readFileSync("/run/presenton/site-signing-key");
  const expected = createHmac("sha256",key).update(body || "").digest();
  const actual = Buffer.from(signature || "", "base64url");
  if (extra || key.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual,expected)) throw Error("Site identity required");
  const value = JSON.parse(Buffer.from(body,"base64url").toString());
  const now = Math.floor(Date.now()/1000);
  if (value.aud !== "presenton-site" || !/^[1-9][0-9]{0,9}$/.test(String(value.site)) || !Number.isSafeInteger(value.exp) || value.exp <= now || value.exp > now+600) throw Error("Invalid site identity");
  return {site:String(value.site), token};
}
export async function siteDirectory(kind:"data"|"temp") {
  const context=await siteContext();
  const root=kind === "data" ? process.env.APP_DATA_DIRECTORY || "/app_data" : process.env.TEMP_DIRECTORY || "/tmp/presenton";
  return context ? path.join(root,"sites",context.site) : root;
}
export async function configureRenderPage(page:any) {
  const context=await siteContext();
  if(context) {
    await page.setCookie({name:"presenton_render",value:context.token,domain:"127.0.0.1",path:"/",httpOnly:true,sameSite:"Strict"});
    await page.setRequestInterception(true);
    page.on("request", (request:any) => {
      try {
        const url=new URL(request.url());
        const allowed=["fonts.googleapis.com","fonts.gstatic.com","images.unsplash.com","images.pexels.com","cdn.pixabay.com","img.icons8.com"];
        if(url.origin === "http://127.0.0.1:8081" || url.protocol === "data:" || (url.protocol === "https:" && allowed.includes(url.hostname))) request.continue();
        else request.abort();
      } catch {request.abort();}
    });
  }
}
