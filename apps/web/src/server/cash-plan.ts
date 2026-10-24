import { forecastCashPlan, cashImpact, plannedRecurringBills, type ExpectedIncome, type GeneratedOccurrence } from '../../../../packages/domain/src/cash-plan';
import { money, show, type Bill, type Mode } from '../../../../packages/db/src/workspace';
import type { Database } from '../../../../packages/db/src/database';
import { recurringList, type SavedTemplate } from './recurring';
import { listReceivables } from './receivables';

export interface CashScenarioOptions {extraExpense?:string;expenseDate?:string;incomeDelayDays?:number}
export function validateScenarioOptions(options:CashScenarioOptions,today:string){const expense=options.extraExpense||'0';money(expense);const delay=options.incomeDelayDays||0;if(!Number.isSafeInteger(delay)||delay<0||delay>365)throw new Error('Income delay must be 0–365 days.');const date=options.expenseDate||today;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw new Error('Enter a valid extra-expense date.');return{extraExpense:expense,expenseDate:date,incomeDelayDays:delay};}
export function buildWorkspaceCashPlan(data: {mode: string; summary: {balance: string;reserved: string;buffer: string};bills: Bill[];blockNumber?: string;observedAt?: number}, repayment = '0', expectedIncome: ExpectedIncome[] = [], recurring: {templates:SavedTemplate[];generated:GeneratedOccurrence[]} = {templates:[],generated:[]}, now = new Date(), options:CashScenarioOptions = {}) {
  const today = now.toISOString().slice(0, 10),assumptions=validateScenarioOptions(options,today);
  expectedIncome=expectedIncome.map(i=>({...i,date:new Date(Date.parse(i.date+'T00:00:00Z')+assumptions.incomeDelayDays*86400000).toISOString().slice(0,10)}));
  const position = {balanceBaseUnits:money(data.summary.balance).toString(),reservedBaseUnits:money(data.summary.reserved).toString(),operatingBufferBaseUnits:money(data.summary.buffer).toString()};
  const recurringDrafts=plannedRecurringBills(today,recurring.templates,recurring.generated);
  const bills = [...data.bills.map(b=>({id:b.id,dueDate:b.dueDate,amountBaseUnits:money(b.amount).toString(),state:b.status,currency:'MUSD'})),...recurringDrafts];
  if(money(assumptions.extraExpense)>0n)bills.push({id:'scenario:extra-expense',dueDate:assumptions.expenseDate,amountBaseUnits:money(assumptions.extraExpense).toString(),state:'draft',currency:'MUSD'});
  const plan = forecastCashPlan({...position,today,bills,expectedIncome,repaymentBaseUnits:money(repayment).toString()});
  return {mode:data.mode,today,timeZone:'UTC',calculatedAt:now.toISOString(),blockNumber:data.blockNumber ?? null,observedAt:data.observedAt ?? null,
    repayment,assumptions,scenarioFirstBufferBreach:(()=>{const d=plan.days.find(d=>BigInt(d.scenarioBalanceBaseUnits)<BigInt(position.operatingBufferBaseUnits));return d?{date:d.date,shortfallBaseUnits:(BigInt(position.operatingBufferBaseUnits)-BigInt(d.scenarioBalanceBaseUnits)).toString()}:null;})(),impact:cashImpact(position),plan,draftTotal:show(data.bills.filter(b=>b.status==='draft').reduce((n,b)=>n+money(b.amount),0n)),
    recurringDraftTotal:show(recurringDrafts.reduce((n,b)=>n+BigInt(b.amountBaseUnits),0n)),recurringDrafts,expectedIncome,
    explanation:'Reviewed unpaid bills reduce actual cash on their due date. Draft bills and future recurring occurrences are scenario assumptions. Generated recurring bills replace their planned occurrence. Reservations do not move cash. Expected receipts affect only the scenario and never spending capacity.',
    repaymentSource:'Treasury scenario only. Withdrawal and repayment require two separate signed transactions.'};
}
export async function loadWorkspaceCashPlan(db:Database,workspaceId:string,data:Parameters<typeof buildWorkspaceCashPlan>[0] & {mode:Mode},repayment='0',options:CashScenarioOptions={}) {
  const [receivables,templates,occurrences]=await Promise.all([
    listReceivables(db,workspaceId,data.mode),recurringList(db,workspaceId),
    db.query<{templateId:string;periodKey:string}>('SELECT o.template_id AS "templateId",o.period_key AS "periodKey" FROM recurring_occurrences o JOIN recurring_templates t ON t.id=o.template_id WHERE t.workspace_id=$1',[workspaceId]),
  ]);
  return buildWorkspaceCashPlan(data,repayment,receivables.filter(r=>!r.cancelled&&r.status!=='received').map(r=>({id:r.id,date:r.dueDate,amountBaseUnits:money(r.outstanding).toString()})),{templates,generated:occurrences.rows},new Date(),options);
}
