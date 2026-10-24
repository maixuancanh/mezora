import { baseUnits, cashPosition, type CashSnapshot } from './money';
import { parseMusd } from './money';
import { occurrenceForDate, type RecurringTemplate } from './recurrence';

export interface CashImpact extends CashSnapshot { availableBaseUnits:string; surplusBaseUnits:string }
export function cashImpact(input:CashSnapshot):CashImpact { return {...input,...cashPosition(input)}; }
export interface PlannedBill { id:string; dueDate:string; amountBaseUnits:string; state:string; currency:string }
export interface GeneratedOccurrence { templateId:string; periodKey:string }
/** Future template occurrences remain draft assumptions; their generated bills replace them, even when paid or canceled. */
export function plannedRecurringBills(today:string, templates:readonly (RecurringTemplate & {id:string})[], generated:readonly GeneratedOccurrence[]):PlannedBill[] {
  const start=day(today), seen=new Set<string>(), generatedKeys=new Set(generated.map(row=>JSON.stringify([row.templateId,row.periodKey]))), result:PlannedBill[]=[];
  for(const template of templates) {
    if(!template.id||seen.has(template.id))throw new Error('Duplicate or missing recurring template identity');
    seen.add(template.id);
    for(let index=0;index<30;index++) {
      const date=new Date(start+index*DAY).toISOString().slice(0,10), occurrence=occurrenceForDate(template,date);
      if(!occurrence||occurrence.dueDate!==date||generatedKeys.has(JSON.stringify([template.id,occurrence.periodKey])))continue;
      result.push({id:`recurring:${template.id}:${occurrence.periodKey}`,dueDate:date,amountBaseUnits:parseMusd(template.amount).toString(),state:'draft',currency:'MUSD'});
    }
  }
  return result;
}
export interface ExpectedIncome { id:string; date:string; amountBaseUnits:string }
export interface CashPlanInput extends CashSnapshot { today:string; bills:readonly PlannedBill[]; expectedIncome?:readonly ExpectedIncome[]; repaymentBaseUnits?:string }
export interface CashPlanDay { date:string; billsBaseUnits:string; draftBillsBaseUnits:string; repaymentBaseUnits:string; expectedIncomeBaseUnits:string; actualBalanceBaseUnits:string; scenarioBalanceBaseUnits:string; bufferShortfallBaseUnits:string }
export interface CashPlan { days:CashPlanDay[]; firstBufferBreach:{date:string;shortfallBaseUnits:string}|null; minimumActualHeadroomBaseUnits:string; scenarioLabel:string }
const DAY = 86_400_000;
function day(date:string):number {
  const value = Date.parse(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(value) || new Date(value).toISOString().slice(0,10) !== date) throw new Error('Invalid date');
  return value;
}
function minimum(...values:bigint[]):bigint { return values.reduce((a,b) => a < b ? a : b); }
function nonnegative(value:bigint):bigint { return value > 0n ? value : 0n; }
/** A reservation earmarks the balance; the scheduled bill is the one actual cash outflow. */
export function forecastCashPlan(input:CashPlanInput):CashPlan {
  cashImpact(input);
  const start = day(input.today), buffer = baseUnits(input.operatingBufferBaseUnits);
  const bills = new Map<number,bigint>(), drafts = new Map<number,bigint>(), income = new Map<number,bigint>(), ids = new Set<string>();
  for (const bill of input.bills) {
    if (!bill.id || ids.has(bill.id)) throw new Error('Duplicate or missing bill identity');
    ids.add(bill.id);
    if (bill.currency !== 'MUSD') throw new Error('Unsupported bill currency');
    const amount = baseUnits(bill.amountBaseUnits), due = Math.max(start,day(bill.dueDate));
    if (['paid','canceled','cancelled'].includes(bill.state)) continue;
    if (!['draft','verified','reserve_pending','reserved','payment_pending','cancel_pending','overdue','unpaid'].includes(bill.state)) throw new Error('Unknown bill state');
    const target = bill.state === 'draft' ? drafts : bills;
    target.set(due,(target.get(due) ?? 0n) + amount);
  }
  ids.clear();
  for (const receipt of input.expectedIncome ?? []) {
    if (!receipt.id || ids.has(receipt.id)) throw new Error('Duplicate or missing income identity');
    ids.add(receipt.id);
    const date = Math.max(start,day(receipt.date)), amount = baseUnits(receipt.amountBaseUnits);
    income.set(date,(income.get(date) ?? 0n) + amount);
  }
  let actual = baseUnits(input.balanceBaseUnits), scenario = actual;
  const repayment = baseUnits(input.repaymentBaseUnits ?? '0');
  let headroom = nonnegative(actual - buffer), first:CashPlan['firstBufferBreach'] = null;
  const days:CashPlanDay[] = [];
  for (let index = 0; index < 30; index++) {
    const date = start + index * DAY, out = bills.get(date) ?? 0n, draft = drafts.get(date) ?? 0n, received = income.get(date) ?? 0n, repaid = index === 0 ? repayment : 0n;
    actual -= out + repaid; scenario += received - out - draft - repaid;
    const shortfall = nonnegative(buffer - actual), dateString = new Date(date).toISOString().slice(0,10);
    if (shortfall > 0n && !first) first = {date:dateString,shortfallBaseUnits:shortfall.toString()};
    headroom = minimum(headroom,nonnegative(actual - buffer));
    days.push({date:dateString,billsBaseUnits:out.toString(),draftBillsBaseUnits:draft.toString(),repaymentBaseUnits:repaid.toString(),expectedIncomeBaseUnits:received.toString(),actualBalanceBaseUnits:actual.toString(),scenarioBalanceBaseUnits:scenario.toString(),bufferShortfallBaseUnits:shortfall.toString()});
  }
  return {days,firstBufferBreach:first,minimumActualHeadroomBaseUnits:headroom.toString(),scenarioLabel:drafts.size ? 'Includes unconfirmed expected income and draft bills' : 'Includes unconfirmed expected income'};
}
/** The adapter computes protocol capacity after debt-floor and other protocol rules; do not subtract those rules again here. */
export interface RepaymentCapacityInput extends CashPlanInput { walletBalanceBaseUnits:string; withdrawableBaseUnits:string; protocolRepayCapacityBaseUnits:string }
export interface RepaymentCapacity { treasuryRepaymentBaseUnits:string; walletRepaymentBaseUnits:string }
/** Wallet repayment uses wallet funds. Treasury repayment must additionally clear the cash plan and withdrawal limits. */
export function safeRepaymentCapacity(input:RepaymentCapacityInput):RepaymentCapacity {
  const position = cashImpact(input), forecast = forecastCashPlan({...input,repaymentBaseUnits:'0'}), debt = baseUnits(input.protocolRepayCapacityBaseUnits);
  return {treasuryRepaymentBaseUnits:minimum(baseUnits(position.surplusBaseUnits),baseUnits(forecast.minimumActualHeadroomBaseUnits),baseUnits(input.withdrawableBaseUnits),debt).toString(),walletRepaymentBaseUnits:minimum(baseUnits(input.walletBalanceBaseUnits),debt).toString()};
}
