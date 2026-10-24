import {withIdempotentMutation} from '../../../../packages/db/src/persistence';
import {requireRole} from "../../../../packages/db/src/memberships";
import {assertBillPolicy} from './policy';
import { NextResponse, type NextRequest } from "next/server";
import { database } from "../../../../packages/db/src/database";
import { chainConfig } from "../../../../packages/mezo/src/network";
import { snapshot, createBill, createBillTx,ensureWorkspace, performDemoAction, treasuryAction, type Mode } from "../../../../packages/db/src/workspace";
import { workspaceIdentity, sessionAddress } from "./auth";
import { liveSnapshot, prepareBillAction, prepareTreasuryAction, broadcast, rejectPrepared } from "./live";
import {withProposal} from "./proposal";
import{effectiveConfig}from"./treasury-config";
import{allowedOrigins}from"./origin";
export function errorResponse(error:unknown){const message=error instanceof Error?error.message:"Request failed.";const explicit=(error as {status?:number})?.status;const code=[403,409].includes(explicit||0)?explicit!:/sign in|owner wallet/.test(message)?401:/not found/i.test(message)?404:400;console.error("[Mezora]",message);return NextResponse.json({error:message},{status:code});}
export function modeOf(value:unknown):Mode {if(value==="demo"||value===undefined||value===null)return "demo";if(value==="live")return "live";throw new Error("Invalid workspace mode.");}
export function checkOrigin(req:NextRequest){
 if(!allowedOrigins().includes(req.headers.get("origin")||""))throw new Error("Untrusted request origin.");
 if(!req.headers.get("content-type")?.includes("application/json"))throw new Error("JSON request required.");
}
export async function readBody(req:NextRequest){checkOrigin(req);const text=await req.text();if(text.length>12000)throw new Error("Request too large.");const body=JSON.parse(text);if(!body||Array.isArray(body)||typeof body!=="object")throw new Error("Invalid JSON request.");return body;}
export async function workspaceResponse(req:NextRequest){
 const mode=modeOf(req.nextUrl.searchParams.get("mode")),db=await database();
 if(mode==="demo"){const {id}=await workspaceIdentity(mode);return withProposal(await snapshot(db,id,mode),id);}
 const session=await sessionAddress();const identity=session?await workspaceIdentity(mode):null;const owner=identity?.owner||null,c=await effectiveConfig(db,owner);
 if(!c.treasury||!owner)return {mode,network:{chainId:31611,name:"Mezo Testnet",tokenAddress:c.token,treasuryAddress:c.treasury,explorerUrl:c.explorerUrl},walletAddress:owner,summary:{balance:"0",reserved:"0",available:"0",buffer:"300",surplus:"0"},bills:[],activity:[],worker:{status:!c.treasury?"not_configured":"sign_in_required",lastCheckedAt:null},configurationMessage:!c.treasury?"Deploy MezoraTreasury and configure its address to enable live payments.":"Connect and sign in with the owner wallet."};
 const id=identity!.id;return {...withProposal(await liveSnapshot(db,id,owner),id),workspaceRole:identity!.role,actorAddress:identity!.actor};
}
export async function billsPost(req:NextRequest){const b=await readBody(req),mode=modeOf(b.mode),identity=await workspaceIdentity(mode),db=await database();await requireRole(db,identity.id,identity.actor||"scenario",["owner","requester"]);const input={vendor:b.vendor,recipient:b.recipient,amount:b.amount,dueDate:b.dueDate,invoiceReference:b.invoiceReference||undefined,category:b.category||undefined,memo:b.memo||undefined,createdBy:identity.actor||'scenario'};await ensureWorkspace(db,identity.id,mode);return withIdempotentMutation(db,{workspaceId:identity.id,actorId:identity.actor||'scenario',action:'bill.create',entityId:identity.id,idempotencyKey:String(b.idempotencyKey||''),request:{vendor:input.vendor,recipient:input.recipient,amount:input.amount,dueDate:input.dueDate,invoiceReference:input.invoiceReference||null,category:input.category||null,memo:input.memo||null}},async q=>({bill:await createBillTx(q,identity.id,input,mode,identity.owner||undefined)}));}
export async function billActionPost(req:NextRequest,id:string){const b=await readBody(req),mode=modeOf(b.mode),identity=await workspaceIdentity(mode),db=await database();
 await requireRole(db,identity.id,identity.actor||"scenario",["owner"]);
 if(mode==="demo"){
  if(b.action==='reserve'||b.action==='pay')await db.transaction(async q=>{const {getBill,rawSnapshot,money}=await import('../../../../packages/db/src/workspace');const bill=await getBill(q,identity.id,id),snap=await rawSnapshot(q,identity.id,'demo');await assertBillPolicy(q,identity.id,bill,money(snap.summary.available)+(b.action==='pay'?money(bill.amount):0n));});
  return {bill:await performDemoAction(db,identity.id,id,b.action)};
 }
 if(b.action==="reject")return rejectPrepared(db,identity.id,identity.owner!,b.intentId);
 if(b.action==="broadcast")return broadcast(db,identity.id,identity.owner!,b.intentId,b.txHash);
 return prepareBillAction(db,identity.id,identity.owner!,id,b.action);
}
export async function treasuryPost(req:NextRequest){const b=await readBody(req),mode=modeOf(b.mode),identity=await workspaceIdentity(mode),db=await database();
 await requireRole(db,identity.id,identity.actor||"scenario",["owner"]);
 if(mode==="demo")return treasuryAction(db,identity.id,b.action,b.amount);
 if(b.action==="reject")return rejectPrepared(db,identity.id,identity.owner!,b.intentId);
 if(b.action==="broadcast")return broadcast(db,identity.id,identity.owner!,b.intentId,b.txHash);
 return prepareTreasuryAction(db,identity.id,identity.owner!,b.action,b.amount);
}
