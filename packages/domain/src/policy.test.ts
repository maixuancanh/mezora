import { describe, expect, it } from 'vitest';
import { evaluatePolicy, categoryBudget, type PolicyInput } from './policy';
const recipient = '0x1111111111111111111111111111111111111111';
const token = '0x2222222222222222222222222222222222222222';
const input:PolicyInput = {policyVersion:3,expectedChainId:1,expectedToken:token,availableBaseUnits:'100',bill:{id:'new',vendorId:'vendor',invoiceReference:'INV-2',sourceHash:'hash2',recipient,chainId:1,token,amountBaseUnits:'10',state:'verified'},existingBills:[]};
describe('payment policy', () => {
  it('allows equal amounts on a new invoice and ignores the current bill identity', () => {
    const decision = evaluatePolicy({...input,existingBills:[{...input.bill,id:'old',invoiceReference:'INV-1',sourceHash:'hash1'},input.bill]});
    expect(decision).toEqual({policyVersion:3,status:'allow',canSign:true,reasons:[]});
  });
  it('blocks duplicate source or vendor invoice reference, independent of amount', () => {
    expect(evaluatePolicy({...input,existingBills:[{...input.bill,id:'old',amountBaseUnits:'11'}]}).reasons.map(r => r.code)).toEqual(['DUPLICATE_SOURCE','DUPLICATE_INVOICE']);
  });
  it('warns for changed payee and counts committed separately from consumption', () => {
    const decision = evaluatePolicy({...input,knownVendorRecipient:'0x3333333333333333333333333333333333333333',budget:{limitBaseUnits:'100',spentBaseUnits:'80',committedBaseUnits:'15'}});
    expect(decision.status).toBe('review');
    expect(decision.canSign).toBe(false);
    expect(decision.reasons.map(r => r.code)).toEqual(['CHANGED_PAYEE','CATEGORY_BUDGET_EXCEEDED']);
    expect(categoryBudget({limitBaseUnits:'100',spentBaseUnits:'80',committedBaseUnits:'15'})).toEqual({spentBaseUnits:'80',committedBaseUnits:'15',remainingBaseUnits:'5',overBudgetBaseUnits:'0'});
  });
  it.each([
    ['WRONG_CHAIN',{chainId:2}],['WRONG_TOKEN',{token:recipient}],['INVALID_RECIPIENT',{recipient:'bad'}],['ALREADY_PAID',{state:'paid'}],['INSUFFICIENT_FUNDS',{amountBaseUnits:'101'}],['INVALID_AMOUNT',{amountBaseUnits:'1.2'}],['INVALID_AMOUNT',{amountBaseUnits:'0'}],['INACTIVE_BILL',{state:'canceled'}],
  ])('hard blocks %s', (code, changes) => {
    const decision = evaluatePolicy({...input,bill:{...input.bill,...changes}});
    expect(decision.status).toBe('block');
    expect(decision.canSign).toBe(false);
    expect(decision.reasons.some(r => r.code === code && r.severity === 'block')).toBe(true);
  });
  it('fails closed on malformed signing funds', () => {
    expect(evaluatePolicy({...input,availableBaseUnits:'NaN'}).reasons.map(r => r.code)).toContain('INVALID_FUNDS');
  });
});
