import { randomUUID, randomBytes } from "node:crypto";
import { encodeAbiParameters, keccak256, isAddress, getAddress, parseUnits, formatUnits } from "viem";
import type { Database, Sql } from "./database";
import { parseMusd, formatMusd, createTermsHash } from "../../domain/src/index";
export type Mode="demo"|"live";
export interface Bill {id:string;version:number;vendor:string;recipient:string;amount:string;dueDate:string;status:string;termsHash:string;onchainId:string;txHash?:string;invoiceReference?:string;sourceHash?:string;category?:string;memo?:string;createdBy?:string}
export interface Activity{id:string;title:string;detail:string;createdAt:string;status:string;txHash?:string}
export const money=(value:string)=>parseMusd(value);
export const show=(value:bigint)=>formatMusd(value);
export async function ensureWorkspace(q:Sql,id:string,mode:Mode){await q.query("INSERT INTO workspaces(id,mode,balance,buffer) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[id,mode,mode==="demo"?money("1000").toString():"0",money("300").toString()]);}
export async function log(q:Sql,ns:string,title:string,detail:string,status="scenario",txHash?:string){
 const body:Activity={id:randomUUID(),title,detail,status,createdAt:new Date().toISOString(),...(txHash?{txHash}:{})};
 await q.query("INSERT INTO activity(id,workspace_id,body) VALUES($1,$2,$3::jsonb)",[body.id,ns,JSON.stringify(body)]);
}
export async function getBill(q:Sql,ns:string,id:string,lock=false){
 const r=await q.query<{body:Bill}>("SELECT body FROM bills WHERE id=$1 AND workspace_id=$2"+(lock?" FOR UPDATE":""),[id,ns]);
 if(!r.rows[0])throw new Error("Bill not found.");return r.rows[0].body;
}
export async function saveBill(q:Sql,ns:string,b:Bill){await q.query("UPDATE bills SET body=$1::jsonb WHERE id=$2 AND workspace_id=$3",[JSON.stringify(b),b.id,ns]);}
export interface BillInput {vendor:string;recipient:string;amount:string;dueDate:string;invoiceReference?:string;sourceHash?:string;category?:string;memo?:string;createdBy?:string}
export async function createBill(db:Database,ns:string,input:BillInput,mode:Mode="demo",owner="0x0000000000000000000000000000000000000001"){return db.transaction(q=>createBillTx(q,ns,input,mode,owner));}
export function validateBillInput(input:BillInput){
 if(!input.vendor?.trim()||input.vendor.length>150)throw new Error("Enter a vendor name (max 150 characters).");
 if(!isAddress(input.recipient)||/^0x0{40}$/i.test(input.recipient))throw new Error("Enter a valid, nonzero EVM recipient.");
 const amt=money(input.amount);if(amt<=0n)throw new Error("Bill amount must be positive.");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)||!Number.isFinite(Date.parse(input.dueDate))||new Date(input.dueDate).toISOString().slice(0,10)!==input.dueDate)throw new Error("Enter a valid due date.");
 for(const [key,max] of [['invoiceReference',150],['category',80],['memo',2000],['sourceHash',100],['createdBy',100]] as const){const value=input[key];if(value!=null&&(typeof value!=='string'||value.length>max))throw new Error(`Invalid ${key}.`);}
 return{amt,recipient:getAddress(input.recipient)};
}
export async function createBillTx(q:Sql,ns:string,input:BillInput,mode:Mode="demo",owner="0x0000000000000000000000000000000000000001"){
 const {amt,recipient}=validateBillInput(input);
 const id=randomUUID(),version=1,salt="0x"+randomBytes(32).toString("hex");
 const termsHash=createTermsHash({workspaceId:ns,billId:id,ownerAddress:owner,chainId:31611,version,recipient,amountBaseUnits:amt.toString(),dueAt:Math.floor(Date.parse(input.dueDate)/1000),randomSalt:salt});
 const bill:Bill={id,version,vendor:input.vendor.trim(),recipient,amount:show(amt),dueDate:input.dueDate,status:"draft",createdBy:input.createdBy||owner,...(input.memo?{memo:input.memo}:{}),...(input.invoiceReference?{invoiceReference:input.invoiceReference.trim().slice(0,150)}:{}),...(input.sourceHash?{sourceHash:input.sourceHash.slice(0,100)}:{}),...(input.category?{category:input.category.trim().slice(0,80)}:{}),termsHash,onchainId:keccak256(encodeAbiParameters([{type:"string"},{type:"bytes32"}],[id,termsHash]))};
 await ensureWorkspace(q,ns,mode);await q.query("INSERT INTO bills(id,workspace_id,body) VALUES($1,$2,$3::jsonb)",[id,ns,JSON.stringify(bill)]);await log(q,ns,"Bill created",bill.vendor+" · "+bill.amount+" MUSD",mode==="demo"?"scenario":"draft");return bill;
}
export async function rawSnapshot(q:Sql,ns:string,mode:Mode,chainBalance?:bigint,chainReserved?:bigint){
 await ensureWorkspace(q,ns,mode);
 const wr=await q.query<{balance:string;buffer:string}>("SELECT balance::text,buffer::text FROM workspaces WHERE id=$1",[ns]);
 const bills=(await q.query<{body:Bill}>("SELECT body FROM bills WHERE workspace_id=$1 ORDER BY body->>'dueDate',id",[ns])).rows.map(r=>r.body);
 const activity=(await q.query<{body:Activity}>("SELECT body FROM activity WHERE workspace_id=$1 ORDER BY body->>'createdAt' DESC LIMIT 50",[ns])).rows.map(r=>r.body);
 const balance=chainBalance??BigInt(wr.rows[0].balance),buffer=BigInt(wr.rows[0].buffer);
 const reserved=chainReserved??bills.filter(b=>["reserved","payment_pending","cancel_pending"].includes(b.status)).reduce((sum,b)=>sum+money(b.amount),0n);
 const available=balance-reserved,surplus=available>buffer?available-buffer:0n;
 return {mode,network:{chainId:31611,name:"Mezo Testnet",tokenAddress:process.env.MUSD_ADDRESS||null,treasuryAddress:process.env.MEZORA_TREASURY_ADDRESS||null,explorerUrl:"https://explorer.test.mezo.org"},walletAddress:null as string|null,summary:{balance:show(balance),reserved:show(reserved),available:show(available),buffer:show(buffer),surplus:show(surplus)},bills,activity,worker:{status:mode==="demo"?"scenario":"not_configured",lastCheckedAt:mode==="demo"?new Date().toISOString():null as string|null}};
}
export const snapshot=(db:Database,ns:string,mode:Mode)=>db.transaction(q=>rawSnapshot(q,ns,mode));
export async function performDemoAction(db:Database,ns:string,id:string,action:string){return db.transaction(async q=>{
 await q.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[ns]);const b=await getBill(q,ns,id,true);
 const s=await rawSnapshot(q,ns,"demo");
 if(action==="verify"&&b.status==="draft")b.status="verified";
 else if(action==="reserve"&&b.status==="verified"){if(money(s.summary.available)<money(b.amount))throw new Error("Not enough available MUSD to reserve this bill.");b.status="reserved";}
 else if(action==="pay"&&b.status==="reserved"){await q.query("UPDATE workspaces SET balance=balance-$1::numeric WHERE id=$2",[money(b.amount).toString(),ns]);b.status="paid";}
 else if(action==="cancel"&&["draft","verified","reserved"].includes(b.status))b.status="canceled";
 else throw new Error("This action is not available for the bill's current state.");
 await saveBill(q,ns,b);await log(q,ns,action==="pay"?"Scenario payment recorded":"Bill "+action,b.vendor+" · "+b.amount+" MUSD");return b;
 });}
export async function treasuryAction(db:Database,ns:string,action:string,amount:string){const n=money(amount);if(n<=0n&&action!=="buffer")throw new Error("Amount must be positive.");
 return db.transaction(async q=>{await ensureWorkspace(q,ns,"demo");await q.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[ns]);const s=await rawSnapshot(q,ns,"demo");
 if(action==="withdraw"){if(n>money(s.summary.available))throw new Error("Cannot withdraw funds reserved for bills.");await q.query("UPDATE workspaces SET balance=balance-$1::numeric WHERE id=$2",[n.toString(),ns]);}
 else if(action==="deposit")await q.query("UPDATE workspaces SET balance=balance+$1::numeric WHERE id=$2",[n.toString(),ns]);
 else if(action==="buffer")await q.query("UPDATE workspaces SET buffer=$1::numeric WHERE id=$2",[n.toString(),ns]);
 else throw new Error("Unknown treasury action.");
 await log(q,ns,action==="buffer"?"Operating buffer updated":"Scenario "+action,show(n)+" MUSD");
 return rawSnapshot(q,ns,"demo");});
}
