import dns from 'node:dns/promises';
import net from 'node:net';
import { domainToASCII } from 'node:url';

const privateCidrsV4 = [
  { net: '10.0.0.0',   mask: '255.0.0.0'   },
  { net: '172.16.0.0', mask: '255.240.0.0' },
  { net: '192.168.0.0',mask: '255.255.0.0' },
  { net: '127.0.0.0',  mask: '255.0.0.0'   },
  { net: '169.254.0.0',mask: '255.255.0.0' }, // link-local
];
const specialV6 = [/^fc/i, /^fd/i, /^fe8/i, /^fe9/i, /^fea/i, /^feb/i];

function ipInCidr(ip: string, netAddr: string, mask: string): boolean {
  const ipNum  = ipToNum(ip);
  const netNum = ipToNum(netAddr);
  const maskNum= ipToNum(mask);
  return (ipNum & maskNum) === (netNum & maskNum);
}
function ipToNum(ip: string): number {
  return ip.split('.').reduce((acc, part) => (acc << 8) + (Number(part) & 255), 0) >>> 0;
}

export async function assertPublicHttpHost(urlStr: string) {
  const u = new URL(urlStr);
  const hostname = domainToASCII(u.hostname || '') || u.hostname;
  const ALLOWED_PORTS = new Set([80, 443, 8080, 8443]);
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (!ALLOWED_PORTS.has(port)) throw mkErr(400, 'SSRF_FORBIDDEN', `port ${port} not allowed`);
  if (hostname === 'localhost') throw mkErr(400, 'SSRF_FORBIDDEN', 'localhost not allowed');
  // 1) Resolve pre-operation
  const addrs1 = await dns.lookup(hostname, { all: true });
  for (const a of addrs1) {
    if (net.isIP(a.address) === 4) {
      for (const c of privateCidrsV4) if (ipInCidr(a.address, c.net, c.mask)) {
        throw mkErr(400, 'SSRF_FORBIDDEN', `private IPv4 blocked: ${a.address}`);
      }
    } else {
      const compact = a.address.replace(/:/g,'').toLowerCase();
      if (compact === ''.padStart(32,'0')) throw mkErr(400,'SSRF_FORBIDDEN',':: blocked');
      if (a.address.includes('::1')) throw mkErr(400,'SSRF_FORBIDDEN','loopback ::1 blocked');
      if (specialV6.some(r => r.test(compact))) throw mkErr(400,'SSRF_FORBIDDEN',`private/link-local IPv6 blocked: ${a.address}`);
    }
  }
  // 2) Re-resolve immediately before external operation
  const addrs2 = await dns.lookup(hostname, { all: true });
  if (JSON.stringify(addrs1) !== JSON.stringify(addrs2)) {
    throw mkErr(400, 'SSRF_FORBIDDEN', 'DNS rebind suspicion');
  }
}

function mkErr(status: number, code: string, message: string) {
  const e: any = new Error(message);
  e.status = status; e.code = code;
  return e;
}
