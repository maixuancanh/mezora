import { createHash, randomUUID } from 'node:crypto';
import type { Database } from '../../../../packages/db/src/database';
import { createBillTx, ensureWorkspace, type Mode } from '../../../../packages/db/src/workspace';
import { appendAuditEvent } from '../../../../packages/db/src/persistence';
import { previewCsv, type CsvRow } from '../../../../packages/domain/src/csv-import';
interface Batch {id:string;rows:CsvRow[];committed:boolean;billIds:string[];selectedRows?:number[]}
export async function previewImport(db:Database,ns:string,mode:Mode,csv:string){
 const rows=previewCsv(csv),hash=createHash('sha256').update(csv).digest('hex');
 return db.transaction(async q=>{await ensureWorkspace(q,ns,mode);await q.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[ns]);
 const old=(await q.query<{body:Batch}>('SELECT body FROM import_batches WHERE workspace_id=$1 AND source_hash=$2',[ns,hash])).rows[0];if(old)return old.body;
 const body:Batch={id:randomUUID(),rows,committed:false,billIds:[]};await q.query('INSERT INTO import_batches(id,workspace_id,source_hash,body) VALUES($1,$2,$3,$4::jsonb)',[body.id,ns,hash,JSON.stringify(body)]);return body;});
}
export async function commitImport(db:Database,ns:string,mode:Mode,owner:string,id:string,selected:unknown){
 if(!Array.isArray(selected)||!selected.length||selected.length>200||!selected.every(Number.isSafeInteger)||new Set(selected).size!==selected.length)throw new Error('Select distinct valid row numbers.');
 const chosen=(selected as number[]).slice().sort((a,b)=>a-b);
 return db.transaction(async q=>{await q.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[ns]);const batch=(await q.query<{body:Batch}>('SELECT body FROM import_batches WHERE id=$1 AND workspace_id=$2 FOR UPDATE',[id,ns])).rows[0]?.body;if(!batch)throw new Error('Import not found.');
 if(batch.committed){if(JSON.stringify(batch.selectedRows)!==JSON.stringify(chosen))throw new Error('This import was already committed with different rows.');return batch;}
 const existing=(await q.query<{body:{vendor:string;invoiceReference?:string}}>('SELECT body FROM bills WHERE workspace_id=$1',[ns])).rows.map(r=>r.body);
 for(const rowNo of chosen){const row=batch.rows.find(r=>r.row===rowNo);if(!row||row.errors.length)throw new Error(`Row ${rowNo} is not valid.`);const r=row.raw;
 if(r.invoice_number&&existing.some(b=>b.vendor.toLowerCase()===r.vendor.toLowerCase()&&b.invoiceReference?.toLowerCase()===r.invoice_number.toLowerCase()))throw new Error(`Row ${rowNo}: vendor invoice already exists.`);
 const bill=await createBillTx(q,ns,{vendor:r.vendor,recipient:r.recipient,amount:r.amount_musd,dueDate:r.due_date,invoiceReference:r.invoice_number,category:r.category,memo:r.memo},mode,mode==='demo'?'0x0000000000000000000000000000000000000001':owner);batch.billIds.push(bill.id);existing.push(bill);}
 batch.committed=true;batch.selectedRows=chosen;await q.query('UPDATE import_batches SET body=$1::jsonb WHERE id=$2 AND workspace_id=$3',[JSON.stringify(batch),id,ns]);await appendAuditEvent(q,{workspaceId:ns,actorId:owner,action:'import.commit',entityId:id,details:{billIds:batch.billIds}});return batch;});
}
