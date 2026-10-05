import { headers } from 'next/headers';

// Session cookies must be `Secure` only when the browser actually reached us over HTTPS —
// browsers silently drop a Secure cookie set over plain HTTP, which makes every login look
// like it worked and then bounce straight back to /login. nginx overwrites X-Forwarded-Proto
// with its own $scheme, so a client cannot spoof it. When the header is absent we fall back
// to the safe default (Secure in production).
export async function shouldUseSecureCookie(): Promise<boolean> {
  const proto = (await headers()).get('x-forwarded-proto');
  if (proto) return (proto.split(',')[0] ?? '').trim().toLowerCase() === 'https';
  return process.env.NODE_ENV === 'production';
}
