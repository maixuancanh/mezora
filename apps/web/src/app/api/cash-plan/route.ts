import {assertFeature} from '@/server/features';
import {workspaceIdentity} from '@/server/auth';
import {database} from '../../../../../../packages/db/src/database';
import {money,ensureWorkspace} from '../../../../../../packages/db/src/workspace';
import {requireRole} from '../../../../../../packages/db/src/memberships';
import {listCashPlanScenarios,readCashPlanScenario,saveCashPlanScenario} from '../../../../../../packages/db/src/cash-plan-scenarios';
import { NextRequest, NextResponse } from 'next/server';
import { workspaceResponse, errorResponse,readBody,modeOf } from '@/server/http';
import { loadWorkspaceCashPlan } from '@/server/cash-plan';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:NextRequest) {
  try {assertFeature('cashPlan');
    const mode=modeOf(req.nextUrl.searchParams.get('mode')),identity=await workspaceIdentity(mode),db=await database();
    const scenarios=await listCashPlanScenarios(db,identity.id),id=req.nextUrl.searchParams.get('scenarioId');
    if(id){const scenario=await readCashPlanScenario<Record<string,unknown>>(db,identity.id,id);return NextResponse.json({...scenario.snapshot,scenario,scenarios},{headers});}
    const data=await workspaceResponse(req);
    return NextResponse.json({...await loadWorkspaceCashPlan(db,identity.id,data,req.nextUrl.searchParams.get('repayment') || '0',{extraExpense:req.nextUrl.searchParams.get('extraExpense')||'0',expenseDate:req.nextUrl.searchParams.get('expenseDate')||undefined,incomeDelayDays:Number(req.nextUrl.searchParams.get('incomeDelayDays')||0)}),scenarios},{headers});
  } catch(error) { return errorResponse(error); }
}
/** POST {mode, name, repayment (MUSD decimal), idempotencyKey}; the server captures its own immutable snapshot. */
export async function POST(req:NextRequest) {
  try {assertFeature('cashPlan');
    const b=await readBody(req),mode=modeOf(b.mode),identity=await workspaceIdentity(mode),db=await database();
    await requireRole(db,identity.id,identity.actor||'scenario',['owner','reviewer']);
    if(typeof b.name!=='string'||typeof b.idempotencyKey!=='string'||(b.repayment!==undefined&&typeof b.repayment!=='string'))throw new Error('Enter a scenario name, repayment and idempotency key.');
    const repayment=String(b.repayment??'0');money(repayment);
    const url=new URL(req.url);url.searchParams.set('mode',mode);
    const data=await workspaceResponse(new NextRequest(url,{headers:req.headers}));
    await ensureWorkspace(db,identity.id,mode);
    const options={extraExpense:typeof b.extraExpense==='string'?b.extraExpense:'0',expenseDate:typeof b.expenseDate==='string'?b.expenseDate:undefined,incomeDelayDays:Number(b.incomeDelayDays||0)};const snapshot=await loadWorkspaceCashPlan(db,identity.id,data,repayment,options);
    const scenario=await saveCashPlanScenario(db,{workspaceId:identity.id,actorId:identity.actor||'scenario',name:b.name,repayment,options:snapshot.assumptions,idempotencyKey:b.idempotencyKey},async()=>snapshot);
    return NextResponse.json({...scenario.snapshot,scenario,scenarios:await listCashPlanScenarios(db,identity.id)},{headers});
  }catch(error){return errorResponse(error);}
}
