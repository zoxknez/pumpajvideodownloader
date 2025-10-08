import dns from 'node:dns/promises';
import net from 'node:net';
import { domainToASCII } from 'node:url';

const ALLOWED_PORTS = new Set([80, 443]);

const privateCidrsV4 = [
  { net: '10.0.0.0', mask: '255.0.0.0' },
  { net: '172.16.0.0', mask: '255.240.0.0' },
  { net: '192.168.0.0', mask: '255.255.0.0' },
  { net: '127.0.0.0', mask: '255.0.0.0' },
  { net: '169.254.0.0', mask: '255.255.0.0' },
];
const specialV6 = [/^fc/i, /^fd/i, /^fe8/i, /^fe9/i, /^fea/i, /^feb/i];

function ipToNum(ip: string) {
  return ip.split('.').reduce((acc, x) => (acc << 8) + (parseInt(x, 10) & 255), 0) >>> 0;
}

function ipInCidr(ip: string, netAddr: string, mask: string) {
  const ipNum = ipToNum(ip);
  const netNum = ipToNum(netAddr);
  const maskNum = ipToNum(mask);
  return (ipNum & maskNum) === (netNum & maskNum);
}

function isPrivateV4(ip: string) {
  return privateCidrsV4.some((c) => ipInCidr(ip, c.net, c.mask));
}

function isPrivateV6(ip: string) {
  const compact = ip.replace(/:/g, '').toLowerCase();
  if (compact === ''.padStart(32, '0')) return true;
  if (/^::1$/.test(ip)) return true;
  return specialV6.some((r) => r.test(compact));
}

function mkErr(status: number, code: string, message: string) {
  const e: any = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

// Whitelist of trusted domains that skip SSRF checks
const TRUSTED_DOMAINS = new Set([
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'm.youtube.com',
  'music.youtube.com',
  'googlevideo.com',
  'twitter.com',
  'x.com',
  'twimg.com',
  'facebook.com',
  'fbcdn.net',
  'instagram.com',
  'cdninstagram.com',
  'tiktok.com',
  'tiktokcdn.com',
  'vimeo.com',
  'dailymotion.com',
  'soundcloud.com',
  'sndcdn.com',
  'twitch.tv',
]);

export async function assertPublicHttpHost(rawUrl: string) {
  const u = new URL(rawUrl);
  if (!/^https?:$/.test(u.protocol)) throw mkErr(400, 'SSRF_FORBIDDEN', 'Only http/https');
  const hostAscii = domainToASCII((u.hostname || '').replace(/\.+$/, ''));
  const hostname = hostAscii.toLowerCase();
  if (!hostname) throw mkErr(400, 'SSRF_FORBIDDEN', 'Invalid host');

  // Skip SSRF checks for trusted domains
  if (TRUSTED_DOMAINS.has(hostname)) {
    return; // Trusted domain - no SSRF check needed
  }
  
  // Also check if it's a subdomain of trusted domain
  const isTrustedSubdomain = Array.from(TRUSTED_DOMAINS).some(trusted => 
    hostname.endsWith(`.${trusted}`)
  );
  if (isTrustedSubdomain) {
    return; // Trusted subdomain - no SSRF check needed
  }

  const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
  if (!ALLOWED_PORTS.has(port)) throw mkErr(400, 'SSRF_FORBIDDEN', `port ${port} not allowed`);
  if (hostname === 'localhost') throw mkErr(400, 'SSRF_FORBIDDEN', 'localhost blocked');

  const checkAddrs = async () => {
    const res = await dns.lookup(hostname, { all: true, verbatim: true });
    const addrs = new Set(res.map((a) => a.address));
    if (addrs.size === 0) throw mkErr(400, 'SSRF_FORBIDDEN', 'No A/AAAA records');
    for (const addr of addrs) {
      const ver = net.isIP(addr);
      if (ver === 4 && isPrivateV4(addr)) throw mkErr(400, 'SSRF_FORBIDDEN', `private IPv4: ${addr}`);
      if (ver === 6 && isPrivateV6(addr)) throw mkErr(400, 'SSRF_FORBIDDEN', `private/link-local IPv6: ${addr}`);
      if (addr === '0.0.0.0') throw mkErr(400, 'SSRF_FORBIDDEN', '0.0.0.0 blocked');
    }
    return addrs;
  };

  const first = await checkAddrs();
  const second = await checkAddrs();
  if (first.size !== second.size || [...first].some((addr) => !second.has(addr))) {
    throw mkErr(400, 'SSRF_FORBIDDEN', 'DNS rebind suspicion');
  }
}
