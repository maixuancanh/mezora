import { decodeFunctionData, encodeFunctionData, encodeDeployData, erc20Abi, isAddress, isHash, parseUnits, type Address, type Hex } from 'viem';
import { treasuryAbi } from '../../../../packages/mezo/src/treasury-abi';
import build from '../../../../packages/mezo/src/treasury-build.json';

const TOKEN = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';
const fail = (): never => { throw new Error('Transaction calldata does not match your review. Nothing was sent.'); };
function same(a: unknown, b: string): boolean { return typeof a === 'string' && a.toLowerCase() === b.toLowerCase(); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(); return value as Record<string, unknown>; }
function txFields(value: unknown, deployment = false) {
  const tx = record(value);
  if (Object.keys(tx).some(k => !['to', 'data', 'value', 'chainId'].includes(k)) || tx.chainId !== 31611 || tx.value !== '0x0' || typeof tx.data !== 'string' || !/^0x(?:[0-9a-f]{2})+$/i.test(tx.data)) fail();
  if (deployment ? tx.to !== undefined : typeof tx.to !== 'string' || !isAddress(tx.to)) fail();
  return { data: tx.data as Hex, value: '0x0' as const, to: tx.to as Address | undefined };
}
export function validateDeploymentPayload(transaction: unknown, owner: string) {
  if (!isAddress(owner)) fail();
  const tx = txFields(transaction, true);
  const expected = encodeDeployData({ abi: treasuryAbi, bytecode: build.bytecode as Hex, args: [TOKEN, owner as Address] });
  if (!same(tx.data, expected)) fail();
  return { data: tx.data, value: tx.value, chainId: '0x7b7b' as const };
}

interface Context { action: string; amount: string; recipient: string; owner: string; treasury: string; token: string; bill?: { onchainId: string; termsHash: string }; now?: number }
export function validateWorkspacePayload(response: unknown, context: Context) {
  const r = record(response), tx = txFields(r.transaction), now = context.now ?? Date.now();
  if (!same(context.token, TOKEN) || ![context.owner, context.treasury, context.recipient].every(a => isAddress(a)) || !/^[0-9]+(?:\.[0-9]{1,18})?$/.test(context.amount) || r.action !== context.action || typeof r.expiresAt !== 'number' || !Number.isSafeInteger(r.expiresAt) || r.expiresAt <= now || r.expiresAt > now + 601000) fail();
  const amount = parseUnits(context.amount, 18);
  if (amount <= 0n) fail();
  let expected: Hex;
  if (context.action === 'approve') {
    if (!same(tx.to, TOKEN) || !same(context.recipient, context.treasury)) fail();
    expected = encodeFunctionData({ abi: erc20Abi, functionName: 'approve', args: [context.treasury as Address, amount] });
  } else {
    if (!same(tx.to, context.treasury)) fail();
    const decoded = decodeFunctionData({ abi: treasuryAbi, data: tx.data });
    if (context.action === 'reserve' || context.action === 'pay' || context.action === 'cancel') {
      const bill = context.bill;
      if (!bill || !isHash(bill.onchainId) || !isHash(bill.termsHash)) fail();
      expected = context.action === 'reserve'
        ? encodeFunctionData({ abi: treasuryAbi, functionName: 'reserve', args: [bill!.onchainId as Hex, bill!.termsHash as Hex, context.recipient as Address, amount] })
        : encodeFunctionData({ abi: treasuryAbi, functionName: context.action, args: [bill!.onchainId as Hex] });
    } else if (context.action === 'deposit' || context.action === 'withdraw') {
      const args = decoded.args as readonly unknown[] | undefined;
      const deadline = args?.[context.action === 'withdraw' ? 3 : 2];
      const id = args?.[0];
      if (typeof id !== 'string' || !isHash(id) || BigInt(id) === 0n || typeof deadline !== 'bigint' || deadline * 1000n <= BigInt(now) || deadline * 1000n > BigInt(now + 601000)) fail();
      if (context.action === 'withdraw' && !same(context.recipient, context.owner) || context.action === 'deposit' && !same(context.recipient, context.treasury)) fail();
      expected = context.action === 'withdraw'
        ? encodeFunctionData({ abi: treasuryAbi, functionName: 'withdrawOnce', args: [id as Hex, context.owner as Address, amount, deadline as bigint] })
        : encodeFunctionData({ abi: treasuryAbi, functionName: 'depositOnce', args: [id as Hex, amount, deadline as bigint] });
    } else return fail();
  }
  if (!same(tx.data, expected)) fail();
  // Never spread untrusted RPC transaction fields such as authorizationList.
  return { to: tx.to!, data: tx.data, value: tx.value, chainId: '0x7b7b' as const };
}
