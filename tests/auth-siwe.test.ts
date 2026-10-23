import { beforeAll, describe, expect, test, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { parseSiweMessage } from 'viem/siwe';
import { createDatabase } from '../packages/db/src/database';
import { createSignInMessage, validateSignInMessage } from '../apps/web/src/lib/sign-in-message';

const state = vi.hoisted(() => ({ db: null as any, setCookie: vi.fn() }));
vi.mock('../packages/db/src/database', async original => ({ ...await original<typeof import('../packages/db/src/database')>(), database: async () => state.db }));
vi.mock('next/headers', () => ({ cookies: async () => ({ set: state.setCookie }) }));
import { challenge, verifySession } from '../apps/web/src/server/auth';

const account = privateKeyToAccount(`0x${'1'.repeat(64)}`);
const origin = 'https://mezora.vercel.app';
describe('EIP-4361 sign-in', () => {
 beforeAll(async () => { state.db = await createDatabase('memory://'); });
 test('challenge is standard SIWE and binds domain, URI, chain, address and lifetime', async () => {
  const { message } = await challenge(account.address, origin);
  const parsed = validateSignInMessage(message, account.address, origin);
  expect(parsed.domain).toBe('mezora.vercel.app');
  expect(parsed.uri).toBe(origin); expect(parsed.chainId).toBe(31611);
  expect(parsed.version).toBe('1'); expect(parsed.nonce).toMatch(/^[a-f0-9]{40}$/);
  expect(parsed.expirationTime!.getTime() - parsed.issuedAt!.getTime()).toBe(300000);
 });
 test('valid signatures create a session, and nonce replay fails', async () => {
  const { message } = await challenge(account.address, origin);
  const signature = await account.signMessage({ message });
  expect(await verifySession(account.address, signature, message, origin)).toEqual({ address: account.address });
  expect(state.setCookie).toHaveBeenCalled();
  await expect(verifySession(account.address, signature, message, origin)).rejects.toThrow(/used/);
 });
 test('cross-origin verification fails even for a stored valid signed challenge', async () => {
  const { message } = await challenge(account.address, origin);
  await expect(verifySession(account.address, await account.signMessage({ message }), message, 'https://other.example')).rejects.toThrow(/sign-in message/i);
 });
 test('concurrent verification consumes a nonce only once', async () => {
  const { message } = await challenge(account.address, origin);
  const signature = await account.signMessage({ message });
  const attempts = await Promise.allSettled([verifySession(account.address, signature, message, origin), verifySession(account.address, signature, message, origin)]);
  expect(attempts.filter(a => a.status === 'fulfilled')).toHaveLength(1);
 });
 test('only the exact stored message can authenticate and wrong signatures preserve nonce', async () => {
  const { message } = await challenge(account.address, origin);
  const other = privateKeyToAccount(`0x${'2'.repeat(64)}`);
  await expect(verifySession(account.address, await other.signMessage({ message }), message, origin)).rejects.toThrow(/signature/);
  const forged = createSignInMessage(account.address, origin, 'notIssuedByTheServer');
  await expect(verifySession(account.address, await account.signMessage({ message: forged }), forged, origin)).rejects.toThrow(/expired|used/);
  expect(await verifySession(account.address, await account.signMessage({ message }), message, origin)).toEqual({ address: account.address });
 });
 test('database expiry remains authoritative and cannot be extended by a signed message', async () => {
  const { message } = await challenge(account.address, origin);
  await state.db.query('UPDATE challenges SET expires_at=$1 WHERE message=$2',[Date.now()-1,message]);
  await expect(verifySession(account.address, await account.signMessage({ message }), message, origin)).rejects.toThrow(/expired/);
 });
 test('rejects wrong chain, address, domain, URI, old messages and appended content', () => {
  const message = createSignInMessage(account.address, origin, 'abcdefgh1234');
  for (const altered of [message.replace('Chain ID: 31611','Chain ID: 1'), message.replace('URI: '+origin,'URI: https://other.example'), message.replace('mezora.vercel.app wants','other.example wants'), message+'\nPay me now', 'Mezora wallet sign-in\nOrigin: '+origin]) {
   expect(() => validateSignInMessage(altered, account.address, origin)).toThrow();
  }
  expect(() => validateSignInMessage(message, '0x2222222222222222222222222222222222222222', origin)).toThrow();
  expect(() => validateSignInMessage(undefined, account.address, origin)).toThrow();
 });
 test('requires current issued-at and expiration and rejects messages older than five minutes', () => {
  const issuedAt = new Date(Date.now()-300001);
  const expired = createSignInMessage(account.address, origin, 'abcdefgh1234', issuedAt);
  expect(() => validateSignInMessage(expired, account.address, origin)).toThrow();
  const fresh = createSignInMessage(account.address, origin, 'abcdefgh1234');
  expect(() => validateSignInMessage(fresh.replace(/\nExpiration Time:.*/,''), account.address, origin)).toThrow();
  expect(() => validateSignInMessage(createSignInMessage(account.address, origin, 'abcdefgh1234', new Date(Date.now()+60000)), account.address, origin)).toThrow();
  expect(parseSiweMessage(fresh).issuedAt).toBeInstanceOf(Date);
 });
});
