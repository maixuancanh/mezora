import {beforeEach,afterEach,describe,it,expect} from 'vitest';
import {createDatabase,type Database} from '../packages/db/src/database';
import {previewImport,commitImport} from '../apps/web/src/server/imports';
import {recurringMutation} from '../apps/web/src/server/recurring';
import {createBill,ensureWorkspace,money} from '../packages/db/src/workspace';
import {policyMutation,assertBillPolicy} from '../apps/web/src/server/policy';
let db:Database;const ns='demo:operations',owner='0x0000000000000000000000000000000000000001',other='0x0000000000000000000000000000000000000002';
beforeEach(async()=>{db=await createDatabase('memory://');await ensureWorkspace(db,ns,'demo');});afterEach(async()=>db.close());
describe('business operations durability',()=>{
 it('commits selected import rows once and scopes batches by workspace',async()=>{
 const csv=`vendor,invoice_number,recipient,amount_musd,due_date,category,memo\nAcme,I1,${owner},10,2026-10-29,Tools,`;
 const preview=await previewImport(db,ns,'demo',csv),same=await previewImport(db,ns,'demo',csv);expect(same.id).toBe(preview.id);
 const result=await commitImport(db,ns,'demo',owner,preview.id,[2]);expect((await commitImport(db,ns,'demo',owner,preview.id,[2])).billIds).toEqual(result.billIds);
 expect((await db.query('SELECT id FROM bills WHERE workspace_id=$1',[ns])).rows).toHaveLength(1);
 await expect(commitImport(db,'demo:other','demo',owner,preview.id,[2])).rejects.toThrow('not found');
 });
 it('generates only one current recurring draft and honors pause version',async()=>{
 const today=new Date().toISOString().slice(0,10);const created=await recurringMutation(db,ns,'demo',owner,{action:'create',idempotencyKey:'template-one',vendor:'Acme',recipient:owner,amount:'10',frequency:'monthly',startDate:today});const t=created.template!;
 await recurringMutation(db,ns,'demo',owner,{action:'generate'});await recurringMutation(db,ns,'demo',owner,{action:'generate'});
 expect((await db.query('SELECT id FROM bills WHERE workspace_id=$1',[ns])).rows).toHaveLength(1);
 await recurringMutation(db,ns,'demo',owner,{action:'pause',id:t.id,expectedVersion:1});await expect(recurringMutation(db,ns,'demo',owner,{action:'resume',id:t.id,expectedVersion:1})).rejects.toThrow('version');
 });
 it('rechecks changed payee and invalidates acknowledgment when policy changes',async()=>{
 const bill=await createBill(db,ns,{vendor:'Acme',recipient:other,amount:'10',dueDate:'2026-10-29',category:'Tools'},'demo',owner);
 await policyMutation(db,ns,'demo',owner,{action:'confirm_vendor',vendor:'Acme',recipient:owner},money('1000'));
 await expect(assertBillPolicy(db,ns,bill,money('1000'))).rejects.toThrow('payee');
 const d=await policyMutation(db,ns,'demo',owner,{action:'evaluate',billId:bill.id},money('1000'));
 if(!('decisionHash' in d))throw new Error('Expected decision');
 await policyMutation(db,ns,'demo',owner,{action:'acknowledge',billId:bill.id,decisionHash:d.decisionHash,reason:'Verified new address directly with vendor.'},money('1000'));
 expect((await assertBillPolicy(db,ns,bill,money('1000'))).canSign).toBe(true);
 await policyMutation(db,ns,'demo',owner,{action:'set_budget',category:'Tools',amount:'5',expectedVersion:1},money('1000'));
 await expect(assertBillPolicy(db,ns,bill,money('1000'))).rejects.toThrow('policy review');
 });
 it('blocks duplicate invoice reference even with a different recipient',async()=>{
 await createBill(db,ns,{vendor:'Acme',recipient:owner,amount:'10',dueDate:'2026-10-29',invoiceReference:'INV-1'},'demo',owner);
 const b=await createBill(db,ns,{vendor:'Acme',recipient:other,amount:'20',dueDate:'2026-10-29',invoiceReference:'INV-1'},'demo',owner);
 await expect(assertBillPolicy(db,ns,b,money('1000'))).rejects.toThrow('reference already exists');
 });
});
