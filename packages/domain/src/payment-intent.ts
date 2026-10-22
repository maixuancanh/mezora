/**
 * Intent lifecycle model adapted from OmniAgentPay intents/service.py,
 * commit 8af4b414a4b50e591c25274ec5a34f21fedc81f8.
 * Copyright (c) 2026 Abiola Adeshina and OmniArc Team.
 * MIT; full permission and warranty notice in ../LICENSE-OMNIAGENTPAY.
 * Storage, Redis and float accounting are not included.
 */
import { encodeAbiParameters, keccak256 } from 'viem';
import { address, hash32, safeInteger } from './bill';
import { baseUnits } from './money';
export type PaymentIntentState = 'requires_approval' | 'approved' | 'pending' | 'settled' | 'failed' | 'canceled' | 'expired';
export interface PaymentIntentInput { id:string; workspaceId:string; billId:string; billVersion:number; ownerAddress:string; chainId:number; target:string; token:string; recipient:string; amountBaseUnits:string; termsHash:string; policyVersion:number; expiresAt:number }
export interface PaymentIntent extends PaymentIntentInput { state:PaymentIntentState; approvalHash:string; txHash?:string }
export type PaymentIntentEvent = {type:'approve';now:number} | {type:'broadcast';txHash:string;now:number} | {type:'unknown'} | {type:'receipt_confirmed'|'receipt_reverted';canonical:boolean} | {type:'cancel'} | {type:'expire';now:number};
export function createApprovalHash(input: PaymentIntentInput): `0x${string}` {
  if (!input.id || !input.workspaceId || !input.billId) throw new Error('Intent identity required');
  safeInteger(input.chainId,'chain',1); safeInteger(input.billVersion,'bill version',1); safeInteger(input.policyVersion,'policy version',1); safeInteger(input.expiresAt,'expiry',1);
  const amount = baseUnits(input.amountBaseUnits); if (amount === 0n) throw new Error('Positive intent amount required');
  return keccak256(encodeAbiParameters([{type:'string'},{type:'string'},{type:'string'},{type:'string'},{type:'uint256'},{type:'address'},{type:'uint256'},{type:'address'},{type:'address'},{type:'address'},{type:'uint256'},{type:'bytes32'},{type:'uint256'},{type:'uint256'}],['Mezora.PaymentIntent.v1', input.id,input.workspaceId,input.billId,BigInt(input.billVersion),address(input.ownerAddress),BigInt(input.chainId),address(input.target),address(input.token),address(input.recipient),amount,hash32(input.termsHash),BigInt(input.policyVersion),BigInt(input.expiresAt)]));
}
export function createPaymentIntent(input: PaymentIntentInput, now: number): PaymentIntent {
  safeInteger(now,'current time'); if (input.expiresAt <= now) throw new Error('Intent expired');
  const value:PaymentIntentInput = {id:input.id,workspaceId:input.workspaceId,billId:input.billId,billVersion:input.billVersion,ownerAddress:address(input.ownerAddress),chainId:input.chainId,target:address(input.target),token:address(input.token),recipient:address(input.recipient),amountBaseUnits:input.amountBaseUnits,termsHash:hash32(input.termsHash),policyVersion:input.policyVersion,expiresAt:input.expiresAt};
  return {...value,state:'requires_approval',approvalHash:createApprovalHash(value)};
}
export function transitionPaymentIntent(intent: PaymentIntent,event: PaymentIntentEvent): PaymentIntent {
  if (createApprovalHash(intent) !== intent.approvalHash) throw new Error('Approval terms changed');
  const fail = ():never => { throw new Error(`Invalid intent event ${event.type} from ${intent.state}`); };
  switch (event.type) {
    case 'approve': safeInteger(event.now,'current time'); if (intent.state !== 'requires_approval' || event.now >= intent.expiresAt) return fail(); return {...intent,state:'approved'};
    case 'broadcast': safeInteger(event.now,'current time'); if (intent.state !== 'approved' || event.now >= intent.expiresAt) return fail(); return {...intent,state:'pending',txHash:hash32(event.txHash)};
    case 'unknown': if (intent.state !== 'pending') return fail(); return {...intent};
    case 'receipt_confirmed': case 'receipt_reverted': if (intent.state !== 'pending' || !event.canonical) return fail(); return {...intent,state:event.type === 'receipt_confirmed' ? 'settled':'failed'};
    case 'cancel': if (!['requires_approval','approved'].includes(intent.state)) return fail(); return {...intent,state:'canceled'};
    case 'expire': safeInteger(event.now,'current time'); if (!['requires_approval','approved'].includes(intent.state) || event.now < intent.expiresAt) return fail(); return {...intent,state:'expired'};
  }
}
