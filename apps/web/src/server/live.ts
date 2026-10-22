import { randomUUID } from "node:crypto";
import { decodeEventLog, decodeFunctionData, erc20Abi, isHash, keccak256, toHex } from "viem";
import { database, type Database, type Sql } from "../../../../packages/db/src/database";
import { ensureWorkspace, getBill, saveBill, rawSnapshot, money, show, log, type Bill } from "../../../../packages/db/src/workspace";
import { chainConfig, publicClient, readTreasury, treasuryData, approvalData } from "../../../../packages/mezo/src/network";
import { treasuryAbi } from "../../../../packages/mezo/src/treasury-abi";
import {createApprovalHash} from "../../../../packages/domain/src/payment-intent";
interface Intent {id:string;action:string;billId?:string;from:string;to:`0x${string}`;data:`0x${string}`;chainId:number;createdAt:number;expiresAt:number;state:"prepared"|"broadcast"|"confirmed"|"reverted";amount?:string;recipient?:string;deadline?:number;txHash?:string;previousStatus?:string;error?:string;blockHash?:string;blockNumber?:string;approvalHash?:string;preparedBlock?:string}
async function createIntent(q:Sql,ns:string,body:Omit<Intent,"id"|"createdAt"|"expiresAt"|"state">){
 const existing=await q.query<{body:Intent}>("SELECT body FROM intents WHERE workspace_id=$1 AND entity_id=$2 AND action=$3 AND body->>'state' IN ('prepared','broadcast')",[ns,body.billId||body.action,body.action]);
 if(existing.rows[0]){
  const i=existing.rows[0].body;
  if(i.amount!==body.amount||i.recipient?.toLowerCase()!==body.recipient?.toLowerCase()||i.to.toLowerCase()!==body.to.toLowerCase()||i.from.toLowerCase()!==body.from.toLowerCase()||i.chainId!==body.chainId||(body.billId&&i.data!==body.data))throw new Error("A different pending request exists. Resolve the original request before changing its terms.");
  if(i.state==="broadcast"||i.expiresAt>Date.now())return intentResponse(i);
  if(i.deadline){
   const client=publicClient(),block=await client.getBlock();
   if(Number(block.timestamp)<=i.deadline)throw new Error("Previous request is still executable onchain. Wait for its deadline before retrying.");
   const old=decodeFunctionData({abi:treasuryAbi,data:i.data});
   const requestId=old.args?.[0] as `0x${string}`;
   const consumed=await client.readContract({address:i.to,abi:treasuryAbi,functionName:"consumedRequests",args:[requestId],blockNumber:block.number});
   if(consumed)throw new Error("The previous request executed onchain. Recover its transaction hash before starting another payment.");
  }
  await q.query("UPDATE intents SET body=jsonb_set(body,'{state}','\"expired\"'::jsonb) WHERE id=$1",[i.id]);
 }
 const intent:Intent={...body,id:randomUUID(),createdAt:Date.now(),expiresAt:Date.now()+600000,state:"prepared",preparedBlock:(await publicClient().getBlockNumber()).toString()};
 intent.approvalHash=createApprovalHash({id:intent.id,workspaceId:ns,billId:intent.billId||intent.action,billVersion:1,ownerAddress:intent.from,chainId:intent.chainId,target:intent.to,token:chainConfig().token,recipient:intent.recipient!,amountBaseUnits:money(intent.amount!).toString(),termsHash:keccak256(intent.data),policyVersion:1,expiresAt:Math.floor(intent.expiresAt/1000)});
 await q.query("INSERT INTO intents(id,workspace_id,entity_id,action,body) VALUES($1,$2,$3,$4,$5::jsonb)",[intent.id,ns,body.billId||body.action,body.action,JSON.stringify(intent)]);return intentResponse(intent);
}
function intentResponse(i:Intent){if(i.state==="broadcast")throw new Error("A transaction is already pending. Refresh to reconcile it before retrying.");return {intentId:i.id,transaction:{to:i.to,data:i.data,value:"0x0",chainId:i.chainId},expiresAt:i.expiresAt,action:i.action,review:{action:i.action,amount:i.amount,recipient:i.recipient,chainId:i.chainId}};}
export async function prepareBillAction(db:Database,ns:string,owner:string,id:string,action:string){
 const recovery=await reconcile(db,ns);if(recovery.recovered)return {recovered:true};
 const chain=await readTreasury(owner);
 return db.transaction(async q=>{
  await ensureWorkspace(q,ns,"live");await q.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[ns]);const b=await getBill(q,ns,id,true);
  if(action==="verify"){if(b.status!=="draft")throw new Error("Bill already verified or canceled.");b.status="verified";await saveBill(q,ns,b);await log(q,ns,"Bill verified",b.vendor,"verified");return {bill:b};}
  if(action==="cancel"&&["draft","verified"].includes(b.status)){b.status="canceled";await saveBill(q,ns,b);await log(q,ns,"Bill canceled",b.vendor,"canceled");return {bill:b};}
  const expected=action==="reserve"?"verified":action==="pay"||action==="cancel"?"reserved":null;
  // Prepared-but-not-broadcast requests are safe to return with the same immutable payload.
  const pendingStates={reserve:"reserve_pending",pay:"payment_pending",cancel:"cancel_pending"} as Record<string,string>;
  if(!expected||!(b.status===expected||b.status===pendingStates[action]))throw new Error("Action not allowed in current bill state.");
  if(action==="reserve"&&chain.available<money(b.amount))throw new Error("Not enough available MUSD.");
  const commitment=await publicClient().readContract({address:chain.treasury!,abi:treasuryAbi,functionName:"commitments",args:[b.onchainId as `0x${string}`]});
  if(action==="reserve"&&commitment[3]!==0)throw new Error("This commitment ID is already used onchain. Refresh before retrying.");
  if((action==="pay"||action==="cancel")&&(commitment[3]!==1||commitment[0].toLowerCase()!==b.termsHash.toLowerCase()||commitment[1].toLowerCase()!==b.recipient.toLowerCase()||commitment[2]!==money(b.amount)))throw new Error("Onchain commitment no longer matches this bill.");
  const args=action==="reserve"?[b.onchainId,b.termsHash,b.recipient,money(b.amount)]:[b.onchainId];
  const data=treasuryData(action as "reserve"|"pay"|"cancel",args);
  await publicClient().call({account:owner as `0x${string}`,to:chain.treasury!,data});
  const r=await createIntent(q,ns,{action,billId:id,from:owner,to:chain.treasury!,data,amount:b.amount,recipient:b.recipient,chainId:31611,previousStatus:expected});
  b.status=pendingStates[action];await saveBill(q,ns,b);return r;
 });
}
export async function prepareTreasuryAction(db:Database,ns:string,owner:string,action:string,amount:string){
 const recovery=await reconcile(db,ns);if(recovery.recovered)return {recovered:true};
 const chain=await readTreasury(owner),n=money(amount);
 if(action!=="buffer"&&n<=0n)throw new Error("Amount must be positive.");
 return db.transaction(async q=>{
 await ensureWorkspace(q,ns,"live");await q.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[ns]);
 if(action==="buffer"){await q.query("UPDATE workspaces SET buffer=$1::numeric WHERE id=$2",[n.toString(),ns]);return {updated:true};}
 if(!["deposit","withdraw"].includes(action))throw new Error("Unknown treasury action.");
 if(action==="withdraw"&&n>chain.available)throw new Error("Cannot withdraw funds reserved for bills.");
 if(action==="deposit"){
  const allowance=await publicClient().readContract({address:chain.token,abi:erc20Abi,functionName:"allowance",args:[owner as `0x${string}`,chain.treasury!]});
  if(allowance<n){return createIntent(q,ns,{action:"approve",amount:show(n),recipient:chain.treasury!,from:owner,to:chain.token,data:approvalData(chain.treasury!,n),chainId:31611});}
 }
 const requestId=keccak256(toHex(randomUUID())),deadline=Math.floor(Date.now()/1000)+600;
 const data=treasuryData(action==="withdraw"?"withdrawOnce":"depositOnce",action==="withdraw"?[requestId,owner,n,BigInt(deadline)]:[requestId,n,BigInt(deadline)]);
 await publicClient().call({account:owner as `0x${string}`,to:chain.treasury!,data});
 return createIntent(q,ns,{action,amount:show(n),recipient:action==="withdraw"?owner:chain.treasury!,deadline,from:owner,to:chain.treasury!,data,chainId:31611});
 });
}
export async function broadcast(db:Database,ns:string,owner:string,intentId:string,txHash:string){
 if(!isHash(txHash))throw new Error("Invalid transaction hash.");
 await db.transaction(async q=>{
 const result=await q.query<{body:Intent;hash:string|null}>("SELECT body,hash FROM intents WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[intentId,ns]);const row=result.rows[0];
 if(!row||row.body.from.toLowerCase()!==owner.toLowerCase())throw new Error("Payment request not found.");
 if(row.hash&&row.hash.toLowerCase()!==txHash.toLowerCase())throw new Error("Request already has a transaction; reconcile before replacement.");
 if(["confirmed","reverted"].includes(row.body.state))throw new Error("Payment request is already settled.");
 const i={...row.body,state:"broadcast" as const,txHash};
 await q.query("UPDATE intents SET body=$1::jsonb,hash=$2 WHERE id=$3",[JSON.stringify(i),txHash,intentId]);
 if(i.billId){const b=await getBill(q,ns,i.billId);b.txHash=txHash;await saveBill(q,ns,b);}
 await log(q,ns,"Transaction submitted",i.action+" · awaiting chain receipt","pending",txHash);
 });return {status:"pending",txHash};
}
export async function rejectPrepared(db:Database,ns:string,owner:string,intentId:string){
 return db.transaction(async q=>{
  const r=await q.query<{body:Intent;hash:string|null}>("SELECT body,hash FROM intents WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[intentId,ns]);
  const row=r.rows[0];if(!row||row.body.from.toLowerCase()!==owner.toLowerCase())throw new Error("Request not found.");
  if(row.hash||row.body.state!=="prepared")throw new Error("Submitted transactions must be reconciled before changing state.");
  if(row.body.deadline)return {status:"prepared",message:"Retry the same protected request until its onchain deadline."};
  await q.query("UPDATE intents SET body=jsonb_set(body,'{state}','\"rejected\"'::jsonb) WHERE id=$1",[intentId]);
  if(row.body.billId){const b=await getBill(q,ns,row.body.billId,true);b.status=row.body.previousStatus||"verified";await saveBill(q,ns,b);}
  return {status:"rejected"};
 });
}
export async function reconcile(db:Database,ns:string){
 const config=chainConfig();if(!config.treasury)return {status:"not_configured",lastCheckedAt:null,recovered:false};
 const client=publicClient();
 let recovered=false;
 const unsigned=await db.query<{id:string;body:Intent}>("SELECT id,body FROM intents WHERE workspace_id=$1 AND body->>'state'='prepared'",[ns]);
 for(const row of unsigned.rows){
  const i=row.body;if(!i.preparedBlock)continue;
  const latest=await client.getBlockNumber();let foundHash:`0x${string}`|undefined;
  for(let start=BigInt(i.preparedBlock);start<=latest&&!foundHash;start+=2000n){
   const logs=await client.getLogs({address:i.to,fromBlock:start,toBlock:start+1999n<latest?start+1999n:latest});
   for(const hash of new Set(logs.map(l=>l.transactionHash).filter((h):h is `0x${string}`=>Boolean(h)))){
    const tx=await client.getTransaction({hash});
    if(tx.from.toLowerCase()===i.from.toLowerCase()&&tx.to?.toLowerCase()===i.to.toLowerCase()&&tx.input.toLowerCase()===i.data.toLowerCase()&&tx.value===0n){foundHash=hash;break;}
   }
  }
  if(foundHash){
   await db.transaction(async q=>{
    const lock=await q.query<{body:Intent}>("SELECT body FROM intents WHERE id=$1 FOR UPDATE",[i.id]);if(lock.rows[0].body.state!=="prepared")return;
    await q.query("UPDATE intents SET body=$1::jsonb,hash=$2 WHERE id=$3",[JSON.stringify({...i,state:"broadcast",txHash:foundHash}),foundHash,i.id]);
    if(i.billId){const b=await getBill(q,ns,i.billId,true);b.txHash=foundHash;await saveBill(q,ns,b);}
    await log(q,ns,"Submitted transaction recovered",i.action,"pending",foundHash);
   });recovered=true;
  }
 }
 const pending=await db.query<{id:string;body:Intent}>("SELECT id,body FROM intents WHERE workspace_id=$1 AND body->>'state' IN ('broadcast','confirmed','reverted') ORDER BY body->>'createdAt'",[ns]);
 const latest=await client.getBlockNumber();const confirmations=BigInt(Math.max(1,Number(process.env.MEZORA_CONFIRMATIONS)||2));
 for(const row of pending.rows){
  const i=row.body;if(!i.txHash)continue;
  if(i.state!=="broadcast"&&i.blockNumber&&i.blockHash){
   const oldBlock=BigInt(i.blockNumber)<=latest?await client.getBlock({blockNumber:BigInt(i.blockNumber)}):null;
   if(oldBlock?.hash===i.blockHash)continue;
   await db.transaction(async q=>{
    await q.query("UPDATE intents SET body=$1::jsonb WHERE id=$2",[JSON.stringify({...i,state:"broadcast",blockHash:undefined,blockNumber:undefined}),i.id]);
    if(i.billId){const b=await getBill(q,ns,i.billId,true);b.status=({reserve:"reserve_pending",pay:"payment_pending",cancel:"cancel_pending"}[i.action]||b.status);await saveBill(q,ns,b);}
    await log(q,ns,"Chain reorganization detected","Rechecking "+i.action,"pending",i.txHash);
   });
  }
  let tx,receipt;
  try{[tx,receipt]=await Promise.all([client.getTransaction({hash:i.txHash as `0x${string}`}),client.getTransactionReceipt({hash:i.txHash as `0x${string}`})]);}catch{continue;} // Unknown is still pending.
  if(tx.from.toLowerCase()!==i.from.toLowerCase()||tx.to?.toLowerCase()!==i.to.toLowerCase()||tx.input.toLowerCase()!==i.data.toLowerCase()||tx.value!==0n)throw new Error("Submitted transaction does not match the approved request.");
  if(latest-receipt.blockNumber+1n<confirmations)continue;
  const canonical=await client.getBlock({blockNumber:receipt.blockNumber});if(canonical.hash!==receipt.blockHash)continue;
  if(receipt.status==="reverted"&&i.deadline){
   const decoded=decodeFunctionData({abi:treasuryAbi,data:i.data});
   const consumed=await client.readContract({address:i.to,abi:treasuryAbi,functionName:"consumedRequests",args:[decoded.args![0] as `0x${string}`],blockNumber:latest});
   if(consumed){
    let originalHash:`0x${string}`|undefined;
    for(let start=BigInt(i.preparedBlock||"0");start<=latest&&!originalHash;start+=2000n){
     const logs=await client.getLogs({address:i.to,fromBlock:start,toBlock:start+1999n<latest?start+1999n:latest});
     for(const hash of new Set(logs.map(l=>l.transactionHash).filter((h):h is `0x${string}`=>Boolean(h)))){
      const original=await client.getTransaction({hash});
      if(original.from.toLowerCase()===i.from.toLowerCase()&&original.to?.toLowerCase()===i.to.toLowerCase()&&original.input.toLowerCase()===i.data.toLowerCase()&&original.value===0n){originalHash=hash;break;}
     }
    }
    if(!originalHash)throw new Error("Request was already executed. Successful receipt recovery is required before another payment.");
    await db.transaction(async q=>{
     await q.query("UPDATE intents SET body=$1::jsonb,hash=$2 WHERE id=$3",[JSON.stringify({...i,state:"broadcast",txHash:originalHash}),originalHash,i.id]);
     await log(q,ns,"Original successful transaction recovered",i.action,"pending",originalHash);
    });recovered=true;continue;
   }
  }
  let matched=receipt.status==="reverted"||i.action==="approve";
  if(receipt.status==="success"&&i.action!=="approve"){
   for(const entry of receipt.logs){
    if(entry.address.toLowerCase()!==config.treasury.toLowerCase())continue;
    try{
     const event=decodeEventLog({abi:treasuryAbi,data:entry.data,topics:entry.topics});
     if(i.billId&&["Reserved","Paid","Canceled"].includes(event.eventName)){
      const b=await getBill(db,ns,i.billId),args=event.args as {id:string;termsHash:string;recipient:string;amount:bigint};
      const expected={reserve:"Reserved",pay:"Paid",cancel:"Canceled"}[i.action];
      if(event.eventName===expected&&args.id.toLowerCase()===b.onchainId.toLowerCase()&&args.termsHash.toLowerCase()===b.termsHash.toLowerCase()&&args.recipient.toLowerCase()===b.recipient.toLowerCase()&&args.amount===money(b.amount))matched=true;
     }else if(i.action==="deposit"&&event.eventName==="Deposited"){
      const a=event.args as {sender:string;amount:bigint};if(a.sender.toLowerCase()===i.from.toLowerCase()&&a.amount===money(i.amount!))matched=true;
     }else if(i.action==="withdraw"&&event.eventName==="Withdrawn"){
      const a=event.args as {recipient:string;amount:bigint};if(a.recipient.toLowerCase()===i.from.toLowerCase()&&a.amount===money(i.amount!))matched=true;
     }
    }catch{/* unrelated log */}
   }
  }
  if(!matched)throw new Error("Receipt succeeded without the required Mezora event. Manual reconciliation required.");
  await db.transaction(async q=>{
   const locked=await q.query<{body:Intent}>("SELECT body FROM intents WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[i.id,ns]);if(locked.rows[0].body.state!=="broadcast")return;
   const state=receipt.status==="success"?"confirmed":"reverted";
   await q.query("UPDATE intents SET body=$1::jsonb WHERE id=$2",[JSON.stringify({...i,state,blockHash:receipt.blockHash,blockNumber:receipt.blockNumber.toString()}),i.id]);
   if(i.billId){const b=await getBill(q,ns,i.billId,true);b.status=state==="confirmed"?({reserve:"reserved",pay:"paid",cancel:"canceled"}[i.action]||b.status):i.previousStatus||"verified";await saveBill(q,ns,b);}
   await log(q,ns,state==="confirmed"?"Transaction confirmed":"Transaction reverted",i.action,state,i.txHash);
  });
 }
 return {status:"on_demand",lastCheckedAt:new Date().toISOString(),recovered};
}
export async function liveSnapshot(db:Database,ns:string,owner:string){
 const worker=await reconcile(db,ns),c=await readTreasury(owner),s=await db.transaction(q=>rawSnapshot(q,ns,"live",c.balance,c.reserved));
 const buffer=money(s.summary.buffer),extra=c.available>buffer?c.available-buffer:0n;
 return {...s,walletAddress:owner,network:{...s.network,tokenAddress:c.token,treasuryAddress:c.treasury},summary:{balance:show(c.balance),reserved:show(c.reserved),available:show(c.available),buffer:show(buffer),surplus:show(extra)},worker,gasBalance:c.gas.toString(),blockNumber:c.block.number?.toString(),blockHash:c.block.hash,observedAt:Number(c.block.timestamp)};
}
