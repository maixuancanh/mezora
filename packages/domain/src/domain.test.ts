import { describe, expect, it } from 'vitest';
import { parseMusd, formatMusd, cashPosition, createBill, createTermsHash, reviseBill, transitionBill, createPaymentIntent, transitionPaymentIntent } from './index';

export const terms = { workspaceId: 'ws', billId: 'bill', ownerAddress: '0x1111111111111111111111111111111111111111', chainId: 31611, version: 1, recipient: '0x2222222222222222222222222222222222222222', amountBaseUnits: '250000000000000000000', dueAt: 1800000000, randomSalt: `0x${'ab'.repeat(32)}` } as const;
describe('integer MUSD', () => {
  it('round trips units above number precision', () => expect(formatMusd(parseMusd('9007199254740993.000000000000000001'))).toBe('9007199254740993.000000000000000001'));
  it.each(['-1', '+1', '1e3', '1.0000000000000000001', ' 1', '.1', '1.', '01', ''])('rejects invalid %s', value => expect(() => parseMusd(value)).toThrow());
  it('enforces uint256 and truncates display explicitly', () => { expect(() => parseMusd((2n ** 256n).toString())).toThrow(); expect(formatMusd(parseMusd('1.239'), { maximumFractionDigits: 2, minimumFractionDigits: 2 })).toBe('1.23'); });
  it('conserves free and surplus after a reserved payment', () => {
    const before = cashPosition({ balanceBaseUnits: parseMusd('1000').toString(), reservedBaseUnits: parseMusd('400').toString(), operatingBufferBaseUnits: parseMusd('300').toString() });
    const after = cashPosition({ balanceBaseUnits: parseMusd('750').toString(), reservedBaseUnits: parseMusd('150').toString(), operatingBufferBaseUnits: parseMusd('300').toString() });
    expect(before.availableBaseUnits).toBe(parseMusd('600').toString()); expect(before.surplusBaseUnits).toBe(parseMusd('300').toString()); expect(after).toEqual(before);
    expect(() => cashPosition({ balanceBaseUnits: '1', reservedBaseUnits: '2', operatingBufferBaseUnits: '0' })).toThrow();
  });
});
describe('bill binding', () => {
  it('rejects invalid checksum, zero recipient, zero bill and invalid chain', () => {
    expect(() => createBill({...terms,recipient:'0x0000000000000000000000000000000000000000'})).toThrow();
    expect(() => createBill({...terms,recipient:'0x52908400098527886E0F7030069857D2E4169Ee7'})).toThrow();
    expect(() => createBill({...terms,amountBaseUnits:'0'})).toThrow();
    expect(() => createBill({...terms,chainId:0})).toThrow();
  });
  it('binds every term and requires a fresh version and salt', () => {
    const bill = createBill(terms); expect(bill.termsHash).toBe(createTermsHash(terms));
    for (const change of [{workspaceId:'other'}, {billId:'other'}, {ownerAddress:terms.recipient}, {chainId:1}, {version:2}, {recipient:terms.ownerAddress}, {amountBaseUnits:'1'}, {dueAt:1800000001}, {randomSalt:`0x${'cd'.repeat(32)}`}]) expect(createTermsHash({...terms,...change})).not.toBe(bill.termsHash);
    expect(() => reviseBill(bill, { amountBaseUnits: '1' }, terms.randomSalt)).toThrow();
    const next = reviseBill(bill, { amountBaseUnits: '1' }, `0x${'cd'.repeat(32)}`); expect(next.version).toBe(2); expect(next.state).toBe('draft');
  });
  it('rejects invalid state changes and edits to reserved bills', () => { const bill = createBill(terms); expect(() => transitionBill(bill, 'paid')).toThrow(); const reserved = transitionBill(transitionBill(transitionBill(bill, 'verified'), 'reserve_pending'), 'reserved'); expect(() => reviseBill(reserved, { amountBaseUnits:'1' }, `0x${'cd'.repeat(32)}`)).toThrow(); });
});
describe('intent recovery', () => {
  const input = { id: 'intent', ...terms, billVersion: 1, target: terms.ownerAddress, token: terms.recipient, termsHash: createTermsHash, policyVersion:1, expiresAt:1800000100 };
  const make = () => createPaymentIntent({ ...input, termsHash:createTermsHash(terms) }, 1800000000);
  it('preserves pending on unknown, settles only with canonical confirmation', () => {
    const reviewed = transitionPaymentIntent(make(), {type:'approve',now:1800000001});
    const pending = transitionPaymentIntent(reviewed, {type:'broadcast',txHash:`0x${'ef'.repeat(32)}`,now:1800000002});
    expect(transitionPaymentIntent(pending, {type:'unknown'}).state).toBe('pending');
    expect(() => transitionPaymentIntent(pending, {type:'receipt_confirmed',canonical:false})).toThrow();
    expect(transitionPaymentIntent(pending, {type:'receipt_reverted',canonical:true}).state).toBe('failed');
    expect(transitionPaymentIntent(pending, {type:'receipt_confirmed',canonical:true}).state).toBe('settled');
    expect(() => transitionPaymentIntent(pending, {type:'cancel'})).toThrow();
  });
  it('rejects expired approvals and cannot broadcast unapproved', () => { expect(() => transitionPaymentIntent(make(), {type:'approve',now:1800000100})).toThrow(); expect(() => transitionPaymentIntent(make(), {type:'broadcast',txHash:`0x${'ef'.repeat(32)}`,now:1800000002})).toThrow(); });
  it('rejects broadcast after approval expiry and tampered terms', () => {
    const approved = transitionPaymentIntent(make(), {type:'approve',now:1800000001});
    expect(() => transitionPaymentIntent(approved, {type:'broadcast',txHash:`0x${'ef'.repeat(32)}`,now:1800000100})).toThrow();
    expect(() => transitionPaymentIntent({...approved,amountBaseUnits:'1'}, {type:'broadcast',txHash:`0x${'ef'.repeat(32)}`,now:1800000002})).toThrow();
  });
  it('allows pre-broadcast cancel/expiry but never expires inflight', () => {
    expect(transitionPaymentIntent(make(), {type:'cancel'}).state).toBe('canceled');
    expect(transitionPaymentIntent(make(), {type:'expire',now:1800000100}).state).toBe('expired');
    const pending = transitionPaymentIntent(transitionPaymentIntent(make(), {type:'approve',now:1800000001}), {type:'broadcast',txHash:`0x${'ef'.repeat(32)}`,now:1800000002});
    expect(() => transitionPaymentIntent(pending,{type:'expire',now:1800000200})).toThrow();
  });
});
