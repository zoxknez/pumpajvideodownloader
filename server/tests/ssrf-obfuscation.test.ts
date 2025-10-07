import { describe, it, expect } from 'vitest';
import { assertPublicHttpHost } from '../core/ssrfGuard.js';

describe('SSRF guard obfuscation variants', () => {
  it('blocks decimal IP format (localhost)', async () => {
    // 127.0.0.1 in decimal = 2130706433
    await expect(assertPublicHttpHost('http://2130706433/')).rejects.toThrow('private IPv4');
  });

  it('blocks octal IP format (localhost)', async () => {
    // 127.0.0.1 in octal = 0177.0.0.1
    await expect(assertPublicHttpHost('http://0177.0.0.1/')).rejects.toThrow('private IPv4');
  });

  it('blocks hex IP format (localhost)', async () => {
    // 127.0.0.1 in hex = 0x7f.0.0.1
    await expect(assertPublicHttpHost('http://0x7f.0.0.1/')).rejects.toThrow('private IPv4');
  });

  it('blocks IPv6 compressed localhost', async () => {
    await expect(assertPublicHttpHost('http://[::1]/')).rejects.toThrow(/localhost|private/);
  });

  it('blocks IPv6 expanded localhost', async () => {
    await expect(assertPublicHttpHost('http://[0000:0000:0000:0000:0000:0000:0000:0001]/')).rejects.toThrow(/localhost|private/);
  });

  it('blocks mixed-case "LOCALHOST"', async () => {
    await expect(assertPublicHttpHost('http://LOCALHOST/')).rejects.toThrow('localhost blocked');
  });

  it('blocks private IP 10.0.0.1', async () => {
    await expect(assertPublicHttpHost('http://10.0.0.1/')).rejects.toThrow('private IPv4');
  });

  it('blocks private IP 172.16.0.1', async () => {
    await expect(assertPublicHttpHost('http://172.16.0.1/')).rejects.toThrow('private IPv4');
  });

  it('blocks private IP 192.168.1.1', async () => {
    await expect(assertPublicHttpHost('http://192.168.1.1/')).rejects.toThrow('private IPv4');
  });

  it('blocks link-local 169.254.1.1', async () => {
    await expect(assertPublicHttpHost('http://169.254.1.1/')).rejects.toThrow('private IPv4');
  });

  it('blocks 0.0.0.0', async () => {
    await expect(assertPublicHttpHost('http://0.0.0.0/')).rejects.toThrow('0.0.0.0 blocked');
  });

  it('rejects non-standard port', async () => {
    await expect(assertPublicHttpHost('http://example.com:8080/')).rejects.toThrow('port 8080 not allowed');
  });

  it('rejects ftp protocol', async () => {
    await expect(assertPublicHttpHost('ftp://example.com/')).rejects.toThrow('Only http/https');
  });

  it('allows public domain', async () => {
    await expect(assertPublicHttpHost('https://www.youtube.com/')).resolves.not.toThrow();
  });
});
