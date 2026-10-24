import {workbenchFeatures} from './features';
import { createPublicClient, http, decodeEventLog, decodeFunctionData, erc20Abi, formatUnits, zeroAddress, type Hex } from "viem";
import { mezoTestnet, officialTestnetMusd } from "../../../../packages/mezo/src/network";
import { treasuryAbi } from "../../../../packages/mezo/src/treasury-abi";
import { matchesTreasuryRuntime } from "../../../../packages/mezo/src/deployment";
import { troveAbi, troveDeployment, troveImplementations } from "../../../../packages/mezo/src/trove";
import { verifyRepaymentReceipt } from "../../../../packages/mezo/src/repayment-receipt";

export type ReceiptState = "confirmed" | "pending" | "reverted" | "unavailable" | "unsupported";
export interface PublicReceipt {
  state: ReceiptState; chainId: number; txHash: string; message: string;
  kind?: "payment" | "repayment"; amount?: string; amountBaseUnits?: string;
  token?: string; from?: string; to?: string; sender?: string; contract?: string;
  blockNumber?: string; blockHash?: string; confirmations?: string; requiredConfirmations?: number;
  termsHash?: string; explorerUrl?: string;
}
const client = () => createPublicClient({ chain: mezoTestnet, transport: http(process.env.MEZO_RPC_URL || mezoTestnet.rpcUrls.default.http[0], { timeout: 4000, retryCount: 0 }) });
export type ReceiptClient = Pick<ReturnType<typeof client>, "getChainId" | "getTransaction" | "getTransactionReceipt" | "getBlockNumber" | "getBlock" | "getCode" | "readContract" | "getStorageAt">;
export function validReceiptHash(hash: string): hash is Hex { return /^0x[0-9a-fA-F]{64}$/.test(hash); }
const same = (a: string | null | undefined, b: string) => a?.toLowerCase() === b.toLowerCase();
const requiredConfirmations = () => Math.min(100, Math.max(1, Math.floor(Number(process.env.MEZORA_CONFIRMATIONS) || 2)));

/** Reads public chain data only. No workspace, bill, session or database access. */
export async function resolvePublicReceipt(chainId: string, txHash: string, p: ReceiptClient = client()): Promise<PublicReceipt> {
  const base: PublicReceipt = { state: "unsupported", chainId: 31611, txHash: validReceiptHash(txHash) ? txHash : "", message: "Only Mezo Testnet (31611) receipts are supported." };
  if (chainId !== "31611") return base;
  if (!validReceiptHash(txHash)) return { ...base, message: "Enter a transaction hash with 0x followed by 64 hexadecimal characters." };
  base.explorerUrl = `${mezoTestnet.blockExplorers.default.url}/tx/${txHash}`;
  const result = (state: ReceiptState, message: string): PublicReceipt => ({ ...base, state, message });
  try {
    if (await p.getChainId() !== 31611) return result("unavailable", "The configured RPC returned a different chain. Verification is unavailable.");
    const [tx, receipt, head] = await Promise.all([
      p.getTransaction({ hash: txHash }),
      p.getTransactionReceipt({ hash: txHash }).catch(error => {
        if (error?.name === "TransactionReceiptNotFoundError") return null;
        throw error;
      }), p.getBlockNumber(),
    ]);
    if (!tx.to || tx.value !== 0n) return result("unsupported", "This transaction is not a supported Mezora payment or MUSD repayment.");
    let paymentId: Hex | undefined, repaymentAmount: bigint | undefined;
    try {
      if (same(tx.to, troveDeployment.borrowerOperations)) {
        const call = decodeFunctionData({ abi: troveAbi, data: tx.input });
        if (call.functionName === "repayMUSD") repaymentAmount = call.args[0];
      } else {
        const call = decodeFunctionData({ abi: treasuryAbi, data: tx.input });
        if (call.functionName === "pay") paymentId = call.args[0];
      }
    } catch { /* An unrelated calldata is unsupported, never a payment proof. */ }
    if (!paymentId && repaymentAmount === undefined) return result("unsupported", "This transaction is not a supported Mezora payment or MUSD repayment.");
    if (!receipt) return result("pending", "The transaction is known to the RPC and is awaiting a mined receipt. Its payment has not been verified.");
    const block = await p.getBlock({ blockNumber: receipt.blockNumber });
    base.blockNumber = receipt.blockNumber.toString(); base.blockHash = receipt.blockHash;
    const confirmations = head >= receipt.blockNumber ? head - receipt.blockNumber + 1n : 0n;
    base.confirmations = confirmations.toString(); base.requiredConfirmations = requiredConfirmations();
    if (!same(block.hash, receipt.blockHash) || confirmations === 0n) return result("pending", "The receipt block is not canonical. Check again after the chain settles.");
    const n = receipt.blockNumber;
    if (paymentId) {
      const [code, owner, token] = await Promise.all([
        p.getCode({ address: tx.to, blockNumber: n }),
        p.readContract({ address: tx.to, abi: treasuryAbi, functionName: "owner", blockNumber: n }),
        p.readContract({ address: tx.to, abi: treasuryAbi, functionName: "token", blockNumber: n }),
      ]);
      if (!code || !matchesTreasuryRuntime(code) || !same(owner, tx.from) || !same(token, officialTestnetMusd)) return result("unsupported", "The destination does not match the verified Mezora treasury build and owner/MUSD binding.");
      base.kind = "payment";
      if (receipt.status === "success") {
        const events = receipt.logs.filter(log => same(log.address, tx.to!)).flatMap(log => {
          try { const event = decodeEventLog({ abi: treasuryAbi, data: log.data, topics: log.topics }); return event.eventName === "Paid" ? [event.args] : []; } catch { return []; }
        });
        if (events.length !== 1 || events[0].id !== paymentId || events[0].amount <= 0n) return result("unsupported", "No unambiguous treasury Paid event matches this transaction.");
        const paid = events[0];
        const transfers = receipt.logs.filter(log => same(log.address, token)).flatMap(log => {
          try { const event = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics }); return event.eventName === "Transfer" ? [event.args] : []; } catch { return []; }
        });
        if (transfers.length !== 1 || !same(transfers[0].from, tx.to) || !same(transfers[0].to, paid.recipient) || transfers[0].value !== paid.amount) return result("unsupported", "The MUSD Transfer does not agree with the treasury payment event.");
        Object.assign(base, { amountBaseUnits: paid.amount.toString(), amount: formatUnits(paid.amount, 18), token, from: tx.to, to: paid.recipient, termsHash: paid.termsHash });
      }
    } else {
      const [implementation, code, token] = await Promise.all([
        p.getStorageAt({ address: troveDeployment.borrowerOperations, slot: "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc", blockNumber: n }),
        p.getCode({ address: troveImplementations.borrowerOperations, blockNumber: n }),
        p.readContract({ address: troveDeployment.borrowerOperations, abi: troveAbi, functionName: "musd", blockNumber: n }),
      ]);
      if (!implementation || !same(`0x${implementation.slice(-40)}`, troveImplementations.borrowerOperations) || !code || code === "0x" || !same(token as string, officialTestnetMusd)) return result("unsupported", "The repayment protocol binding is not recognized.");
      base.kind = "repayment";
      try {
        verifyRepaymentReceipt({ owner: tx.from, to: tx.to, token: officialTestnetMusd, data: tx.input, nonce: tx.nonce, amountBaseUnits: repaymentAmount!.toString(), tx, receipt, canonicalBlockHash: block.hash });
      } catch { return result("unsupported", "The receipt has no exact owner MUSD repayment burn matching the call amount."); }
      if (receipt.status === "success" && repaymentAmount! > 0n) Object.assign(base, { amountBaseUnits: repaymentAmount!.toString(), amount: formatUnits(repaymentAmount!, 18), token: officialTestnetMusd, from: tx.from, to: zeroAddress });
      else if (receipt.status === "success") return result("unsupported", "A positive repayment amount is required.");
    }
    base.sender = tx.from; base.contract = tx.to;
    if (!same((await p.getBlock({ blockNumber: n })).hash, receipt.blockHash)) return result("pending", "The chain changed during verification. Check again.");
    if (confirmations < BigInt(base.requiredConfirmations)) return result("pending", "The mined receipt is awaiting the required confirmations.");
    if (receipt.status === "reverted") return result("reverted", "The transaction reverted. No payment or repayment was completed.");
    return result("confirmed", base.kind === "payment" ? "The treasury Paid event and MUSD Transfer agree on chain." : "The owner repayment call and exact MUSD burn agree on chain.");
  } catch {
    return result("unavailable", "The receipt could not be verified from the configured RPC. Retry shortly; this is not proof of payment.");
  }
}

const cache = new Map<string, { expires: number; value: PublicReceipt }>();
const pending = new Map<string, Promise<PublicReceipt>>();
let windowStart = 0, requests = 0;
/** Shared page/API budget, bounded cache and same-hash request coalescing per server process. */
export async function getPublicReceipt(chainId: string, hash: string): Promise<PublicReceipt> {
 if(!workbenchFeatures().receipts)return {state:"unavailable",chainId:31611,txHash:"",message:"Public receipts are not enabled on this deployment."};
  if (chainId !== "31611" || !validReceiptHash(hash)) return resolvePublicReceipt(chainId, hash);
  const key = hash.toLowerCase(), now = Date.now(), hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  if (pending.has(key)) return pending.get(key)!;
  if (now - windowStart >= 60000) { windowStart = now; requests = 0; }
  if (pending.size >= 4 || requests >= 30) return { state: "unavailable", chainId: 31611, txHash: hash, message: "Receipt lookup is busy. Retry in a minute." };
  requests++;
  const work = resolvePublicReceipt(chainId, hash).then(value => {
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, { expires: Date.now() + 15000, value }); return value;
  }).finally(() => pending.delete(key));
  pending.set(key, work); return work;
}
