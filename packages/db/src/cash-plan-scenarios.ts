import {randomUUID} from 'node:crypto';
import type {Database,Sql} from './database';
import {withIdempotentMutation} from './persistence';
export interface CashPlanScenario<T=unknown> {id:string;name:string;createdAt:string;snapshot:T}
export type CashPlanScenarioSummary=Omit<CashPlanScenario,'snapshot'>;
export async function listCashPlanScenarios(q:Sql,workspaceId:string):Promise<CashPlanScenarioSummary[]> {
  return (await q.query<CashPlanScenarioSummary>('SELECT id,name,created_at::text AS "createdAt" FROM cash_plan_scenarios WHERE workspace_id=$1 ORDER BY created_at DESC,id LIMIT 50',[workspaceId])).rows;
}
export async function readCashPlanScenario<T=unknown>(q:Sql,workspaceId:string,id:string):Promise<CashPlanScenario<T>> {
  const row=(await q.query<CashPlanScenario<T>>('SELECT id,name,created_at::text AS "createdAt",snapshot FROM cash_plan_scenarios WHERE workspace_id=$1 AND id=$2',[workspaceId,id])).rows[0];
  if(!row)throw new Error('Cash plan scenario not found.');
  return row;
}
/** Build only on first save. Retries replay the exact snapshot, even if source balances or dates have changed. */
export async function saveCashPlanScenario<T>(db:Database,input:{workspaceId:string;actorId:string;name:string;repayment:string;options?:unknown;idempotencyKey:string},build:()=>Promise<T>):Promise<CashPlanScenario<T>> {
  const name=input.name.trim();
  if(!name||name.length>120)throw new Error('Enter a scenario name of 1–120 characters.');
  return withIdempotentMutation(db,{workspaceId:input.workspaceId,actorId:input.actorId,action:'cash-plan.save',entityId:input.workspaceId,idempotencyKey:input.idempotencyKey,request:{name,repayment:input.repayment,options:input.options??null}},async q=>{
    const id=randomUUID(),snapshot=await build();
    const row=(await q.query<CashPlanScenario<T>>('INSERT INTO cash_plan_scenarios(id,workspace_id,name,snapshot) VALUES($1,$2,$3,$4::jsonb) RETURNING id,name,created_at::text AS "createdAt",snapshot',[id,input.workspaceId,name,JSON.stringify(snapshot)])).rows[0];
    return row;
  });
}
