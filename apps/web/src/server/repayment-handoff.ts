import {randomUUID} from 'node:crypto';
import type {Database,Sql} from '../../../../packages/db/src/database';
import {money,show} from '../../../../packages/db/src/workspace';
import {appendAuditEvent} from '../../../../packages/db/src/persistence';
import {reconcile} from './live';
import {reconcileRepayments} from './repayment';
import {effectiveConfig} from './treasury-config';
interface Withdrawal {id:string;amount:string;state:string;txHash?:string;from:string;to:string;recipient?:string;chainId:number;blockHash?:string;blockNumber?:string}
function namespace(ns:string,owner:string){if(ns!==`live:${owner.toLowerCase()}`)throw new Error('Handoff requires the borrower owner workspace.');}
function confirmed(w:Withdrawal|undefined,owner:string,treasury?:string|null):w is Withdrawal {
 return Boolean(w&&w.state==='confirmed'&&w.txHash&&w.blockHash&&w.blockNumber&&w.chainId===31611&&w.from.toLowerCase()===owner.toLowerCase()&&w.recipient?.toLowerCase()===owner.toLowerCase()&&treasury&&w.to.toLowerCase()===treasury.toLowerCase());
}
async function refreshWithdrawal(db:Database,ns:string,ids:string[]){if(ids.length)await reconcile(db,ns,{intentIds:ids,discoverPrepared:false});}
export async function handoffState(db:Database,ns:string,owner:string){
 namespace(ns,owner);
 const candidates=(await db.query<{id:string}>("SELECT id FROM intents WHERE workspace_id=$1 AND action='withdraw' AND body->>'state' IN ('confirmed','broadcast') ORDER BY body->>'createdAt' DESC LIMIT 20",[ns])).rows;
 const linked=(await db.query<{withdrawal_intent_id:string;repayment_id:string|null}>('SELECT withdrawal_intent_id,repayment_id FROM repayment_handoffs WHERE workspace_id=$1 AND owner=$2 ORDER BY created_at DESC LIMIT 20',[ns,owner.toLowerCase()])).rows;
 await refreshWithdrawal(db,ns,[...new Set([...candidates.map(i=>i.id),...linked.map(h=>h.withdrawal_intent_id)])]);
 const repaymentIds=linked.flatMap(h=>h.repayment_id?[h.repayment_id]:[]);
 if(repaymentIds.length)await reconcileRepayments(db,owner,{intentIds:repaymentIds,discoverPrepared:false});
 const cfg=await effectiveConfig(db,owner);
 const withdrawals=(await db.query<{body:Withdrawal}>("SELECT body FROM intents WHERE workspace_id=$1 AND action='withdraw' AND body->>'state'='confirmed' ORDER BY body->>'createdAt' DESC LIMIT 20",[ns])).rows.map(r=>r.body).filter(w=>confirmed(w,owner,cfg.treasury));
 const handoffs=(await db.query<{id:string;amountBaseUnits:string;withdrawal:Withdrawal;repaymentStatus:string|null;repaymentTxHash:string|null}>("SELECT h.id,h.amount::text AS \"amountBaseUnits\",i.body AS withdrawal,r.body->>'txHash' AS \"repaymentTxHash\",r.body->>'status' AS \"repaymentStatus\",h.created_at::text AS \"createdAt\" FROM repayment_handoffs h JOIN intents i ON i.id=h.withdrawal_intent_id AND i.workspace_id=h.workspace_id LEFT JOIN repayments r ON r.id=h.repayment_id AND r.owner=h.owner WHERE h.workspace_id=$1 AND h.owner=$2 ORDER BY h.created_at DESC LIMIT 20",[ns,owner.toLowerCase()])).rows.map(({withdrawal,...h})=>({...h,withdrawalTxHash:withdrawal.txHash,withdrawalStatus:withdrawal.state,currentTreasury:withdrawal.to.toLowerCase()===cfg.treasury?.toLowerCase(),canReview:confirmed(withdrawal,owner,cfg.treasury)&&(!h.repaymentStatus||h.repaymentStatus==='prepared')}));
 return{withdrawals,handoffs};
}
export async function createHandoff(db:Database,ns:string,owner:string,withdrawalId:string,amount:string){
 namespace(ns,owner);await refreshWithdrawal(db,ns,[withdrawalId]);const n=money(amount);if(n<=0n)throw new Error('Enter a positive repayment amount.');
 return db.transaction(async q=>{
  await q.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[ns]);
  const withdrawal=(await q.query<{body:Withdrawal}>("SELECT body FROM intents WHERE id=$1 AND workspace_id=$2 AND action='withdraw' FOR UPDATE",[withdrawalId,ns])).rows[0]?.body;
  if(!confirmed(withdrawal,owner,(await effectiveConfig(q,owner)).treasury))throw new Error('Choose your confirmed withdrawal from the current treasury.');
  if(n>money(withdrawal.amount))throw new Error('The tracked repayment cannot exceed this withdrawal.');
  const existing=(await q.query<{id:string;amount:string}>('SELECT id,amount::text FROM repayment_handoffs WHERE withdrawal_intent_id=$1',[withdrawalId])).rows[0];
  if(existing){if(BigInt(existing.amount)!==n)throw new Error('This withdrawal already has a different tracked repayment.');return{id:existing.id,amount:show(n)};}
  const id=randomUUID();await q.query('INSERT INTO repayment_handoffs(id,workspace_id,owner,withdrawal_intent_id,amount) VALUES($1,$2,$3,$4,$5)',[id,ns,owner.toLowerCase(),withdrawalId,n.toString()]);
  await appendAuditEvent(q,{workspaceId:ns,actorId:owner,action:'repayment.handoff',entityId:id,details:{withdrawalId,amountBaseUnits:n.toString()}});return{id,amount:show(n)};
 });
}
/** Called before prepare and again under the repayment workspace lock. */
export async function validateHandoff(q:Sql,owner:string,id:string,amount:string){
 const r=(await q.query<{amount:string;withdrawal:Withdrawal;repayment_id:string|null;repaymentStatus:string|null}>("SELECT h.amount::text,i.body AS withdrawal,h.repayment_id,r.body->>'status' AS \"repaymentStatus\" FROM repayment_handoffs h JOIN intents i ON i.id=h.withdrawal_intent_id AND i.workspace_id=h.workspace_id AND i.action='withdraw' LEFT JOIN repayments r ON r.id=h.repayment_id AND r.owner=h.owner WHERE h.id=$1 AND h.owner=$2 AND h.workspace_id=$3",[id,owner.toLowerCase(),`live:${owner.toLowerCase()}`])).rows[0];
 if(!r||!confirmed(r.withdrawal,owner,(await effectiveConfig(q,owner)).treasury)||BigInt(r.amount)!==money(amount))throw new Error('Tracked withdrawal does not match this owner, amount or current confirmed receipt.');
 if(r.repayment_id&&r.repaymentStatus!=='prepared')throw new Error('This handoff already has a pending or settled repayment. Refresh its receipt.');
 return r.repayment_id;
}
export async function refreshHandoff(db:Database,owner:string,id:string){
 const r=(await db.query<{withdrawal_intent_id:string}>('SELECT withdrawal_intent_id FROM repayment_handoffs WHERE id=$1 AND owner=$2 AND workspace_id=$3',[id,owner.toLowerCase(),`live:${owner.toLowerCase()}`])).rows[0];
 if(!r)throw new Error('Tracked withdrawal not found.');await refreshWithdrawal(db,`live:${owner.toLowerCase()}`,[r.withdrawal_intent_id]);
}
/** Caller holds the workspace lock; binding and repayment preparation commit together. */
export async function attachHandoff(q:Sql,owner:string,id:string,repaymentId:string){
 const repayment=(await q.query<{body:{owner:string;amount:string;amountBaseUnits:string;status:string}}>('SELECT body FROM repayments WHERE id=$1 AND owner=$2',[repaymentId,owner.toLowerCase()])).rows[0]?.body;
 if(!repayment||repayment.owner.toLowerCase()!==owner.toLowerCase()||repayment.status!=='prepared'||BigInt(repayment.amountBaseUnits)!==money(repayment.amount))throw new Error('Prepared repayment not found.');
 const bound=await validateHandoff(q,owner,id,repayment.amount);
 if(bound&&bound!==repaymentId)throw new Error('Handoff is already bound.');
 await q.query('UPDATE repayment_handoffs SET repayment_id=$1 WHERE id=$2 AND owner=$3',[repaymentId,id,owner.toLowerCase()]);
}
