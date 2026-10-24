import { address, safeInteger } from './bill';
import { baseUnits } from './money';

export interface PolicyBill { id:string; vendorId:string; invoiceReference?:string|null; sourceHash?:string|null; recipient:string; chainId:number; token:string; amountBaseUnits:string; state:string }
export interface CategoryBudgetInput { limitBaseUnits:string; spentBaseUnits:string; committedBaseUnits:string }
export interface CategoryBudgetPosition { spentBaseUnits:string; committedBaseUnits:string; remainingBaseUnits:string; overBudgetBaseUnits:string }
/** Consumption is settled spending; commitments earmark capacity but are not consumption. Caller supplies the same category and period, excluding the candidate bill. */
export function categoryBudget(input:CategoryBudgetInput):CategoryBudgetPosition {
  const limit = baseUnits(input.limitBaseUnits), spent = baseUnits(input.spentBaseUnits), committed = baseUnits(input.committedBaseUnits), remaining = limit - spent - committed;
  return {spentBaseUnits:spent.toString(),committedBaseUnits:committed.toString(),remainingBaseUnits:(remaining > 0n ? remaining : 0n).toString(),overBudgetBaseUnits:(remaining < 0n ? -remaining : 0n).toString()};
}
export type PolicyReasonCode = 'DUPLICATE_SOURCE'|'DUPLICATE_INVOICE'|'CHANGED_PAYEE'|'WRONG_CHAIN'|'WRONG_TOKEN'|'INVALID_RECIPIENT'|'INVALID_TOKEN'|'ALREADY_PAID'|'INACTIVE_BILL'|'INVALID_AMOUNT'|'INVALID_FUNDS'|'INSUFFICIENT_FUNDS'|'CATEGORY_BUDGET_EXCEEDED'|'INVALID_BUDGET';
export interface PolicyReason { code:PolicyReasonCode; severity:'block'|'warning'; message:string; relatedBillIds?:string[] }
export interface PolicyDecision { policyVersion:number; status:'allow'|'review'|'block'; canSign:boolean; reasons:PolicyReason[] }
export interface PolicyInput { policyVersion:number; expectedChainId:number; expectedToken:string; availableBaseUnits:string; bill:PolicyBill; existingBills:readonly PolicyBill[]; knownVendorRecipient?:string|null; budget?:CategoryBudgetInput }
function normalize(value:string|null|undefined):string { return value?.trim().toLowerCase() ?? ''; }
function validAddress(value:string):boolean { try { address(value); return true; } catch { return false; } }
/** Pure pre-sign assessment. Warnings require explicit review before a signing intent may be created. */
export function evaluatePolicy(input:PolicyInput):PolicyDecision {
  safeInteger(input.policyVersion,'policy version',1); safeInteger(input.expectedChainId,'expected chain',1); address(input.expectedToken);
  const reasons:PolicyReason[] = [], bill = input.bill;
  const add = (code:PolicyReasonCode,severity:PolicyReason['severity'],message:string,relatedBillIds?:string[]) => reasons.push({code,severity,message,...(relatedBillIds ? {relatedBillIds} : {})});
  const others = input.existingBills.filter(other => other.id !== bill.id && !['canceled','cancelled'].includes(other.state));
  const duplicateSource = others.filter(other => normalize(bill.sourceHash) && normalize(bill.sourceHash) === normalize(other.sourceHash));
  const duplicateInvoice = others.filter(other => normalize(bill.vendorId) && normalize(bill.invoiceReference) && normalize(bill.vendorId) === normalize(other.vendorId) && normalize(bill.invoiceReference) === normalize(other.invoiceReference));
  if (duplicateSource.length) add('DUPLICATE_SOURCE','block','This source document is already attached to another bill.',duplicateSource.map(b => b.id).sort());
  if (duplicateInvoice.length) add('DUPLICATE_INVOICE','block','This vendor invoice reference already exists.',duplicateInvoice.map(b => b.id).sort());
  if (input.knownVendorRecipient && normalize(input.knownVendorRecipient) !== normalize(bill.recipient)) add('CHANGED_PAYEE','warning','The payee differs from the saved vendor address.');
  if (!Number.isSafeInteger(bill.chainId) || bill.chainId !== input.expectedChainId) add('WRONG_CHAIN','block','The bill chain does not match the workspace chain.');
  if (!validAddress(bill.token)) add('INVALID_TOKEN','block','The bill token address is invalid.');
  if (normalize(bill.token) !== normalize(input.expectedToken)) add('WRONG_TOKEN','block','Only the configured MUSD token may be paid.');
  if (!validAddress(bill.recipient)) add('INVALID_RECIPIENT','block','A valid nonzero payee address is required.');
  if (bill.state === 'paid') add('ALREADY_PAID','block','This bill is already paid.');
  else if (!['draft','verified','reserve_pending','reserved','overdue','unpaid'].includes(bill.state)) add('INACTIVE_BILL','block','This bill is canceled, pending payment or otherwise inactive.');
  let amount:bigint|undefined, available:bigint|undefined;
  try { amount = baseUnits(bill.amountBaseUnits); if (amount === 0n) throw new Error('Zero amount'); } catch { add('INVALID_AMOUNT','block','The payment amount must be positive canonical MUSD base units.'); }
  try { available = baseUnits(input.availableBaseUnits); } catch { add('INVALID_FUNDS','block','Confirmed available signing funds are invalid.'); }
  if (amount !== undefined && available !== undefined && amount > available) add('INSUFFICIENT_FUNDS','block','Confirmed available funds do not cover this payment.');
  if (input.budget) {
    try {
      const position = categoryBudget(input.budget);
      if (baseUnits(position.overBudgetBaseUnits) > 0n || amount !== undefined && amount > baseUnits(position.remainingBaseUnits)) add('CATEGORY_BUDGET_EXCEEDED','warning','Settled spending plus commitments and this payment exceed the category budget.');
    } catch { add('INVALID_BUDGET','block','The category budget amounts are invalid.'); }
  }
  const status = reasons.some(r => r.severity === 'block') ? 'block' : reasons.length ? 'review' : 'allow';
  return {policyVersion:input.policyVersion,status,canSign:status === 'allow',reasons};
}
