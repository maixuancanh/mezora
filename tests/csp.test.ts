import { describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from '../apps/web/src/proxy';
describe('nonce Content Security Policy', () => {
 test('production has fresh nonces shared with rendering and blocks inline/eval scripts', () => {
  vi.stubEnv('NODE_ENV','production');
  try {
   const a = proxy(new NextRequest('https://mezora.vercel.app/setup'));
   const b = proxy(new NextRequest('https://mezora.vercel.app/setup'));
   const policy = a.headers.get('Content-Security-Policy')!;
   const nonce = a.headers.get('x-middleware-request-x-nonce');
   expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
   expect(policy).toContain(`'nonce-${nonce}'`);
   expect(policy).toBe(a.headers.get('x-middleware-request-content-security-policy'));
   expect(b.headers.get('x-middleware-request-x-nonce')).not.toBe(nonce);
   const scripts = policy.split(';').find(d=>d.trim().startsWith('script-src'))!;
   expect(scripts).toContain("'strict-dynamic'");
   expect(scripts).not.toMatch(/unsafe-inline|unsafe-eval/);
   expect(policy).toContain("frame-ancestors 'none'");
   expect(policy).toContain("object-src 'none'");
   expect(policy).toContain('https://fonts.googleapis.com');
   expect(policy).toContain('https://fonts.gstatic.com');
   expect(a.headers.get('X-Content-Type-Options')).toBe('nosniff');
  } finally { vi.unstubAllEnvs(); }
 });
 test('development alone allows eval and local websocket', () => {
  vi.stubEnv('NODE_ENV','development');
  try { const csp = proxy(new NextRequest('http://127.0.0.1:3210/')).headers.get('Content-Security-Policy')!;
   expect(csp).toContain("'unsafe-eval'"); expect(csp).toContain('ws:');
   expect(csp).not.toContain('upgrade-insecure-requests');
  } finally { vi.unstubAllEnvs(); }
 });
 test('caller cannot inject a chosen CSP nonce upstream', () => {
  const response = proxy(new NextRequest('https://mezora.vercel.app/', { headers: { 'x-nonce': 'attacker', 'Content-Security-Policy': "script-src 'unsafe-inline'" } }));
  expect(response.headers.get('x-middleware-request-x-nonce')).not.toBe('attacker');
  expect(response.headers.get('x-middleware-request-content-security-policy')).not.toBe("script-src 'unsafe-inline'");
 });
});
