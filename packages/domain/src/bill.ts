import { encodeAbiParameters, getAddress, isAddress, keccak256 } from 'viem';
import { baseUnits } from './money';
export interface BillTerms { workspaceId: string; billId: string; ownerAddress: string; chainId: number; version: number; recipient: string; amountBaseUnits: string; dueAt: number; randomSalt: string }
export type BillState = 'draft' | 'verified' | 'reserve_pending' | 'reserved' | 'payment_pending' | 'paid' | 'cancel_pending' | 'canceled';
export interface Bill extends BillTerms { termsHash: string; state: BillState }
export function safeInteger(value: number, name: string, minimum = 0): void { if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`Invalid ${name}`); }
export function address(value: string): `0x${string}` {
  if (!isAddress(value, {strict:true})) throw new Error('Invalid address or checksum');
  const result = getAddress(value);
  if (result === '0x0000000000000000000000000000000000000000') throw new Error('Zero address is not allowed');
  return result;
}
export function hash32(value: string): `0x${string}` {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) throw new Error('Expected bytes32');
  return value.toLowerCase() as `0x${string}`;
}
export function createTermsHash(terms: BillTerms): `0x${string}` {
  if (!terms.workspaceId || !terms.billId) throw new Error('Workspace and bill required');
  safeInteger(terms.chainId,'chain',1); safeInteger(terms.version,'version',1); safeInteger(terms.dueAt,'due time');
  const amount = baseUnits(terms.amountBaseUnits); if (amount === 0n) throw new Error('Bill amount must be positive');
  return keccak256(encodeAbiParameters([{type:'string'},{type:'address'},{type:'uint256'},{type:'string'},{type:'string'},{type:'uint256'},{type:'address'},{type:'uint256'},{type:'uint256'},{type:'bytes32'}],['Mezora.BillTerms.v1', address(terms.ownerAddress), BigInt(terms.chainId), terms.workspaceId, terms.billId, BigInt(terms.version), address(terms.recipient), amount, BigInt(terms.dueAt), hash32(terms.randomSalt)]));
}
export function createBill(terms: BillTerms): Bill {
  return { workspaceId:terms.workspaceId,billId:terms.billId,ownerAddress:address(terms.ownerAddress),chainId:terms.chainId,version:terms.version,recipient:address(terms.recipient),amountBaseUnits:terms.amountBaseUnits,dueAt:terms.dueAt,randomSalt:hash32(terms.randomSalt),termsHash:createTermsHash(terms),state:'draft' };
}
export function reviseBill(bill: Bill, changes: Partial<Pick<BillTerms,'recipient'|'amountBaseUnits'|'dueAt'>>, newSalt: string): Bill {
  if (!['draft','verified','canceled'].includes(bill.state)) throw new Error('Cancel the active reservation before revising');
  if (hash32(newSalt) === hash32(bill.randomSalt)) throw new Error('Fresh random salt required');
  return createBill({...bill,...changes,version:bill.version + 1,randomSalt:newSalt});
}
const billTransitions: Record<BillState, readonly BillState[]> = {draft:['verified','canceled'],verified:['reserve_pending','canceled'],reserve_pending:['reserved','verified'],reserved:['payment_pending','cancel_pending'],payment_pending:['paid','reserved'],paid:[],cancel_pending:['canceled','reserved'],canceled:[]};
/** Recovery transitions require independently confirmed chain evidence in the adapter. */
export function transitionBill(bill: Bill, next: BillState): Bill {
  if (!billTransitions[bill.state]?.includes(next)) throw new Error(`Invalid bill transition ${bill.state} -> ${next}`);
  return {...bill,state:next};
}
