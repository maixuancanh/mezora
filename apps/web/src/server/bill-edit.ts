import {randomBytes} from 'node:crypto';
import {encodeAbiParameters,keccak256} from 'viem';
import type {Database} from '../../../../packages/db/src/database';
import {getBill,saveBill,validateBillInput,show,type BillInput} from '../../../../packages/db/src/workspace';
import {createTermsHash} from '../../../../packages/domain/src/index';
import {requireRole} from '../../../../packages/db/src/memberships';
import {assertExpectedVersion,appendAuditEvent} from '../../../../packages/db/src/persistence';
export async function editDraftBill(db:Database,ns:string,owner:string,actor:string,id:string,input:BillInput,expectedVersion:number){return db.transaction(async q=>{
 const role=await requireRole(q,ns,actor,['owner','requester']);await q.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[ns]);const bill=await getBill(q,ns,id,true);assertExpectedVersion(bill.version,expectedVersion);if(bill.status!=='draft')throw new Error('Only draft bills can be edited.');if(role==='requester'&&bill.createdBy?.toLowerCase()!==actor.toLowerCase())throw Object.assign(new Error('You may only edit your own draft bills.'),{status:403});
 const {amt,recipient}=validateBillInput(input),version=bill.version+1,termsHash=createTermsHash({workspaceId:ns,billId:id,ownerAddress:owner,chainId:31611,version,recipient,amountBaseUnits:amt.toString(),dueAt:Math.floor(Date.parse(input.dueDate)/1000),randomSalt:'0x'+randomBytes(32).toString('hex')});
 const next={...bill,vendor:input.vendor.trim(),recipient,amount:show(amt),dueDate:input.dueDate,invoiceReference:input.invoiceReference?.trim()||undefined,category:input.category?.trim()||undefined,memo:input.memo||undefined,version,termsHash,onchainId:keccak256(encodeAbiParameters([{type:'string'},{type:'bytes32'}],[id,termsHash]))};
 await saveBill(q,ns,next);await q.query('DELETE FROM policy_acknowledgements WHERE workspace_id=$1 AND bill_id=$2',[ns,id]);await q.query('DELETE FROM approval_votes WHERE workspace_id=$1 AND bill_id=$2',[ns,id]);await appendAuditEvent(q,{workspaceId:ns,actorId:actor,action:'bill.edit',entityId:id,entityVersion:version});return next;
 });}
