import { describe, expect, it } from 'vitest';
import { cashImpact, forecastCashPlan, safeRepaymentCapacity, plannedRecurringBills } from './cash-plan';
import { parseMusd } from './money';
const u = (v: string) => parseMusd(v).toString();
const base = { today:'2026-10-25', balanceBaseUnits:u('1000'),reservedBaseUnits:u('700'),operatingBufferBaseUnits:u('200'),bills:[{id:'a',dueDate:'2026-10-28',amountBaseUnits:u('400'),state:'reserved',currency:'MUSD'},{id:'b',dueDate:'2026-11-04',amountBaseUnits:u('300'),state:'verified',currency:'MUSD'}] };
describe('cash plan', () => {
  const template={id:'rent',vendor:'Rent',recipient:'0x0000000000000000000000000000000000000001',amount:'100',category:'Office',frequency:'weekly' as const,timezone:'UTC',startDate:'2026-10-25',endDate:null,activeFrom:'2026-10-25',paused:false};
  it('replaces generated occurrences with their bill exactly once and leaves future occurrences as drafts',()=>{
    const drafts=plannedRecurringBills(base.today,[template],[{templateId:'rent',periodKey:'2026-10-25'}]);
    expect(drafts.map(d=>d.dueDate)).toEqual(['2026-11-01','2026-11-08','2026-11-15','2026-11-22']);
    const f=forecastCashPlan({...base,bills:[{id:'generated',dueDate:base.today,amountBaseUnits:u('100'),state:'draft',currency:'MUSD'},...drafts]});
    expect(f.days.reduce((sum,d)=>sum+BigInt(d.draftBillsBaseUnits),0n)).toBe(BigInt(u('500')));
    expect(f.days[29]?.actualBalanceBaseUnits).toBe(u('1000'));
    expect(f.days[29]?.scenarioBalanceBaseUnits).toBe(u('500'));
    expect(()=>plannedRecurringBills(base.today,[template,template],[])).toThrow(/Duplicate/);
  });
  it('respects monthly month ends, paused periods, and activation dates',()=>{
    expect(plannedRecurringBills('2026-02-01',[{...template,frequency:'monthly',startDate:'2026-01-31',activeFrom:'2026-01-31'}],[]).map(d=>d.dueDate)).toEqual(['2026-02-28']);
    expect(plannedRecurringBills(base.today,[{...template,paused:true}],[])).toEqual([]);
    expect(plannedRecurringBills(base.today,[{...template,activeFrom:'2026-11-02',endDate:'2026-11-09'}],[]).map(d=>d.dueDate)).toEqual(['2026-11-08']);
  });
  it('finds the first actual shortfall without subtracting reserves twice', () => {
    const f = forecastCashPlan({...base,repaymentBaseUnits:u('150')});
    expect(f.days).toHaveLength(30);
    expect(f.days[0]?.actualBalanceBaseUnits).toBe(u('850'));
    expect(f.firstBufferBreach).toEqual({date:'2026-11-04',shortfallBaseUnits:u('50')});
    expect(f.days[10]?.actualBalanceBaseUnits).toBe(u('150'));
  });
  it('excludes expected income from safe headroom and labels the separate scenario', () => {
    const f = forecastCashPlan({...base,expectedIncome:[{id:'income',date:'2026-10-26',amountBaseUnits:u('999')} ]});
    expect(f.minimumActualHeadroomBaseUnits).toBe(u('100'));
    expect(f.days[10]?.scenarioBalanceBaseUnits).toBe(u('1299'));
    expect(f.scenarioLabel).toBe('Includes unconfirmed expected income');
  });
  it('charges overdue today, excludes paid, aggregates same-day before buffer testing', () => {
    const bills = [{id:'overdue',dueDate:'2026-10-01',amountBaseUnits:u('900'),state:'verified',currency:'MUSD'},{id:'paid',dueDate:'2026-10-25',amountBaseUnits:u('999'),state:'paid',currency:'MUSD'}];
    const f = forecastCashPlan({...base,reservedBaseUnits:'0',bills,expectedIncome:[{id:'i',date:base.today,amountBaseUnits:u('1000')}]});
    expect(f.firstBufferBreach).toEqual({date:base.today,shortfallBaseUnits:u('100')});
    expect(f.days[0]?.scenarioBalanceBaseUnits).toBe(u('1100'));
    expect(f.minimumActualHeadroomBaseUnits).toBe('0');
  });
  it('rejects wrong currency, impossible dates and duplicate identities', () => {
    expect(() => forecastCashPlan({...base,bills:[{...base.bills[0]!,currency:'USDC'}]})).toThrow(/currency/);
    expect(() => forecastCashPlan({...base,today:'2026-02-30'})).toThrow(/date/);
    expect(() => forecastCashPlan({...base,bills:[base.bills[0]!,base.bills[0]!]})).toThrow(/Duplicate/);
  });
  it('keeps a negative forecast balance and full precision', () => {
    const f = forecastCashPlan({...base,balanceBaseUnits:'1',reservedBaseUnits:'0',operatingBufferBaseUnits:'0',bills:[{id:'a',dueDate:base.today,amountBaseUnits:'2',state:'verified',currency:'MUSD'}]});
    expect(f.days[0]?.actualBalanceBaseUnits).toBe('-1');
  });
  it('computes earmarked cash impact and independent wallet vs treasury repayment capacity', () => {
    expect(cashImpact(base)).toMatchObject({availableBaseUnits:u('300'),surplusBaseUnits:u('100')});
    expect(safeRepaymentCapacity({...base,withdrawableBaseUnits:u('80'),protocolRepayCapacityBaseUnits:u('500'),walletBalanceBaseUnits:u('450')})).toEqual({treasuryRepaymentBaseUnits:u('80'),walletRepaymentBaseUnits:u('450')});
  });
  it('keeps drafts in the scenario and applies adapter repayment capacity once', () => {
    const planned = {...base,reservedBaseUnits:'0',bills:[{...base.bills[0]!,state:'draft'}]};
    const f = forecastCashPlan(planned);
    expect(f.days[3]?.actualBalanceBaseUnits).toBe(u('1000'));
    expect(f.days[3]?.draftBillsBaseUnits).toBe(u('400'));
    expect(f.days[3]?.scenarioBalanceBaseUnits).toBe(u('600'));
    expect(safeRepaymentCapacity({...planned,withdrawableBaseUnits:u('900'),protocolRepayCapacityBaseUnits:u('17'),walletBalanceBaseUnits:u('100')})).toEqual({treasuryRepaymentBaseUnits:u('17'),walletRepaymentBaseUnits:u('17')});
  });
});
