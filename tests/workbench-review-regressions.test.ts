import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createDatabase,type Database} from '../packages/db/src/database';
import {createBill,ensureWorkspace,money,saveBill} from '../packages/db/src/workspace';
import {draftFromDocument,extractDocument,uploadDocument} from '../apps/web/src/server/documents';
import {policyDecision,policyMutation,assertBillPolicy} from '../apps/web/src/server/policy';
import {recurringMutation} from '../apps/web/src/server/recurring';

let db:Database;
const owner='0x0000000000000000000000000000000000000001',ns='demo:review-regressions';
const invoice={vendor:'Acme',recipient:owner,amount:'150',dueDate:'2026-10-29',category:'Tools'};
const image=()=>new File([new Uint8Array([0xff,0xd8,0xff,0])],'invoice.jpg',{type:'image/jpeg'});
const deleteSource=(id:string)=>db.query("UPDATE documents SET bytes=NULL,body=jsonb_build_object('status','deleted','billId',body->'billId') WHERE id=$1 AND workspace_id=$2",[id,ns]);
beforeEach(async()=>{db=await createDatabase('memory://');await ensureWorkspace(db,ns,'demo');});
afterEach(async()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();await db.close();});

it('retains the existing bill when a deleted or expired source is uploaded again',async()=>{
 const doc=await uploadDocument(db,ns,'demo',owner,image());
 const first=await draftFromDocument(db,ns,'demo',owner,owner,doc.id,invoice,'MUSD');
 await deleteSource(doc.id);
 const reuploaded=await uploadDocument(db,ns,'demo',owner,image());
 expect(reuploaded.id).toBe(doc.id);
 expect(await draftFromDocument(db,ns,'demo',owner,owner,reuploaded.id,invoice,'MUSD')).toEqual(first);
 await db.query('UPDATE documents SET expires_at=$1 WHERE id=$2',[Date.now()-1,doc.id]);
 await uploadDocument(db,ns,'demo',owner,image());
 expect(await draftFromDocument(db,ns,'demo',owner,owner,doc.id,invoice,'MUSD')).toEqual(first);
 expect((await db.query('SELECT id FROM bills WHERE workspace_id=$1',[ns])).rows).toHaveLength(1);
});

it('invalidates an acknowledged budget warning when settled spending changes',async()=>{
 await policyMutation(db,ns,'demo',owner,{action:'set_budget',category:'Tools',amount:'100',expectedVersion:1},money('1000'));
 const bill=await createBill(db,ns,invoice,'demo',owner),before=await policyDecision(db,ns,bill,money('1000'));
 await policyMutation(db,ns,'demo',owner,{action:'acknowledge',billId:bill.id,decisionHash:before.decisionHash,reason:'Reviewed the initial fifty MUSD budget overage.'},money('1000'));
 expect((await policyDecision(db,ns,bill,money('1000'))).canSign).toBe(true);
 const settled=await createBill(db,ns,{...invoice,vendor:'Other',amount:'900'},'demo',owner);settled.status='paid';await saveBill(db,ns,settled);
 const after=await policyDecision(db,ns,bill,money('1000'));
 expect(after.decisionHash).not.toBe(before.decisionHash);
 expect(after.acknowledged).toBe(false);expect(after.canSign).toBe(false);
 await expect(assertBillPolicy(db,ns,bill,money('1000'))).rejects.toThrow('policy review');
});

it('replays recurring creation without duplicating its template or generated bill',async()=>{
 const input={action:'create',idempotencyKey:'review-recurring-1',vendor:'Acme',recipient:owner,amount:'10',frequency:'monthly',startDate:new Date().toISOString().slice(0,10)};
 const first=await recurringMutation(db,ns,'demo',owner,input),again=await recurringMutation(db,ns,'demo',owner,input);
 expect(again).toEqual(first);
 await expect(recurringMutation(db,ns,'demo',owner,{...input,amount:'20'})).rejects.toMatchObject({status:409});
 await recurringMutation(db,ns,'demo',owner,{action:'generate'});await recurringMutation(db,ns,'demo',owner,{action:'generate'});
 expect((await db.query('SELECT id FROM recurring_templates WHERE workspace_id=$1',[ns])).rows).toHaveLength(1);
 expect((await db.query('SELECT id FROM bills WHERE workspace_id=$1',[ns])).rows).toHaveLength(1);
});

it('does not restore deleted document data when an in-flight OCR response completes',async()=>{
 vi.stubEnv('MEZORA_OCR_URL','https://ocr.invalid/extract');
 let finish!:(value:Response)=>void,started!:()=>void;
 const entered=new Promise<void>(resolve=>{started=resolve;});
 vi.stubGlobal('fetch',vi.fn(()=>{started();return new Promise<Response>(resolve=>{finish=resolve;});}));
 const doc=await uploadDocument(db,ns,'demo',owner,image()),pending=extractDocument(db,ns,doc.id);
 await entered;await deleteSource(doc.id);
 finish(new Response(JSON.stringify({pages:[{page:1,text:'Vendor: Acme\nTotal: 150 MUSD'}]})));
 await expect(pending).rejects.toThrow('Source changed or was deleted');
 const stored=(await db.query<{bytes:Uint8Array|null;body:{status:string;pages?:unknown}}>('SELECT bytes,body FROM documents WHERE id=$1',[doc.id])).rows[0];
 expect(stored.bytes).toBeNull();expect(stored.body.status).toBe('deleted');expect(stored.body.pages).toBeUndefined();
 await expect(draftFromDocument(db,ns,'demo',owner,owner,doc.id,invoice,'MUSD')).rejects.toThrow('not found');
});
