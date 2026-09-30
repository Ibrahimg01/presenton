import { createHmac, timingSafeEqual } from 'node:crypto';

export function signIdentity(identity, key) {
  const payload = Buffer.from(JSON.stringify(identity)).toString('base64url');
  return payload + '.' + createHmac('sha256', key).update(payload).digest('base64url');
}
export function verifyIdentity(token, key, now = Math.floor(Date.now()/1000)) {
  if (typeof token !== 'string' || token.length > 4096 || key.length < 32) throw Error('Invalid identity');
  const [body, signature, extra] = token.split('.');
  const expected = createHmac('sha256', key).update(body || '').digest();
  const actual = Buffer.from(signature || '', 'base64url');
  if (extra || actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw Error('Invalid identity');
  const value = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (value.aud !== 'presenton-site' || !/^[1-9][0-9]{0,9}$/.test(String(value.site)) ||
      !/^[1-9][0-9]{0,19}$/.test(String(value.user)) || !Number.isSafeInteger(value.exp) ||
      value.exp <= now || value.exp > now + 600) throw Error('Invalid identity');
  return value;
}
