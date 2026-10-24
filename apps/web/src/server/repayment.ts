import{randomUUID}from"node:crypto";
import{type Address,type Hex,isHash,TransactionNotFoundError}from"viem";
import{type Database, type Sql}from"../../../../packages/db/src/database";
import{ensureWorkspace,money,show}from"../../../../packages/db/src/workspace";
import{publicClient}from"../../../../packages/mezo/src/network";
import{readTroveSnapshot,prepareOwnerRepayment,repaymentEconomics,troveDeployment}from"../../../../packages/mezo/src/trove";
import{verifyRepaymentReceipt}from"../../../../packages/mezo/src/repayment-receipt";
import{effectiveConfig}from"./treasury-config";import{readTreasury}from"../../../../packages/mezo/src/network";
interface RepayIntent{id:string;owner:string;amount:string;amountBaseUnits:string;nonce:number;data:Hex;preparedBlock:string;createdAt:string;expiresAt:number;status:"prepared"|"pending"|"confirmed"|"reverted";txHash?:Hex;blockNumber?:string;blockHash?:string;snapshot:unknown;economics:unknown}
function response(i:RepayIntent){return{intentId:i.id,transaction:{to:troveDeployment.borrowerOperations,data:i.data,value:"0x0",chainId:31611,nonce:"0x"+i.nonce.toString(16)},review:{action:"repay",amount:i.amount,recipient:troveDeployment.borrowerOperations,chainId:31611},snapshot:i.snapshot,economics:i.economics,expiresAt:i.expiresAt};}
async function findHash(i:RepayIntent,head:bigint){
 const p=publicClient();for(let n=BigInt(i.preparedBlock);n<=head;n+=2000n){
  const logs=await p.getLogs({address:troveDeployment.musd,fromBlock:n,toBlock:n+1999n<head?n+1999n:head});
  for(const hash of new Set(logs.map(l=>l.transactionHash).filter((h):h is Hex=>Boolean(h)))){
   const tx=await p.getTransaction({hash});if(tx.from.toLowerCase()===i.owner.toLowerCase()&&tx.to?.toLowerCase()===troveDeployment.borrowerOperations.toLowerCase()&&tx.input.toLowerCase()===i.data.toLowerCase()&&tx.nonce===i.nonce&&tx.value===0n)return hash;
  }
 }return null;
}
export async function reconcileRepayments(db:Database,owner:string){
 const p=publicClient(),head=await p.getBlockNumber(),rows=await db.query<{body:RepayIntent}>("SELECT body FROM repayments WHERE owner=$1 ORDER BY body->>'createdAt'",[owner.toLowerCase()]);
 for(const row of rows.rows){
  const i=row.body;
  if(i.status==="prepared"&&!i.txHash){const hash=await findHash(i,head);if(hash){i.txHash=hash;i.status="pending";}}
  if((i.status==="confirmed"||i.status==="reverted")&&i.blockNumber&&i.blockHash){const b=BigInt(i.blockNumber)<=head?await p.getBlock({blockNumber:BigInt(i.blockNumber)}):null;if(b?.hash===i.blockHash)continue;i.status="pending";delete i.blockHash;delete i.blockNumber;await db.query("UPDATE repayments SET body=$1::jsonb WHERE id=$2 AND owner=$3",[JSON.stringify(i),i.id,owner.toLowerCase()]);}
  if(!i.txHash)continue;
  let tx,receipt;try{[tx,receipt]=await Promise.all([p.getTransaction({hash:i.txHash}),p.getTransactionReceipt({hash:i.txHash})]);}catch{continue;}
  if(head-receipt.blockNumber+1n<BigInt(Math.max(1,Number(process.env.MEZORA_CONFIRMATIONS)||2)))continue;
  const canonical=await p.getBlock({blockNumber:receipt.blockNumber});
  const status=verifyRepaymentReceipt({owner,to:troveDeployment.borrowerOperations,token:troveDeployment.musd,data:i.data,nonce:i.nonce,amountBaseUnits:i.amountBaseUnits,tx,receipt,canonicalBlockHash:canonical.hash});
  i.status=status;i.blockNumber=receipt.blockNumber.toString();i.blockHash=receipt.blockHash;
  await db.query("UPDATE repayments SET body=$1::jsonb,tx_hash=$2 WHERE id=$3 AND owner=$4",[JSON.stringify(i),i.txHash,i.id,owner.toLowerCase()]);
 }
}
export async function getRepaymentState(db:Database,owner:string){
 await reconcileRepayments(db,owner);const snapshot=await readTroveSnapshot(publicClient(),owner);
 const repayments=(await db.query<{body:RepayIntent}>("SELECT body FROM repayments WHERE owner=$1 ORDER BY body->>'createdAt' DESC LIMIT 30",[owner.toLowerCase()])).rows.map(({body:i})=>({id:i.id,amount:i.amount,status:i.status,txHash:i.txHash,createdAt:i.createdAt}));
 const cfg=await effectiveConfig(db,owner);let treasury=null;if(cfg.treasury){const t=await readTreasury(owner,cfg.treasury),ws=await db.query<{buffer:string}>("SELECT buffer::text FROM workspaces WHERE id=$1",["live:"+owner.toLowerCase()]),buffer=BigInt(ws.rows[0]?.buffer||money("300").toString());treasury={available:show(t.available),buffer:show(buffer),surplus:show(t.available>buffer?t.available-buffer:0n)};}
 return{snapshot,repayments,treasury};
}
export async function prepareRepayment(db:Database,owner:string,amount:string,preview=false){
 const amountBaseUnits=money(amount).toString();await reconcileRepayments(db,owner);
 if(preview){const snapshot=await readTroveSnapshot(publicClient(),owner);return{snapshot,economics:repaymentEconomics(snapshot,amountBaseUnits)};}
 return db.transaction(async q=>{
  const ns="live:"+owner.toLowerCase();await ensureWorkspace(q,ns,"live");await q.query("SELECT id FROM workspaces WHERE id=$1 FOR UPDATE",[ns]);
  const active=await q.query<{body:RepayIntent}>("SELECT body FROM repayments WHERE owner=$1 AND body->>'status' IN ('prepared','pending')",[owner.toLowerCase()]);
  const i=active.rows[0]?.body;if(i){if(i.amountBaseUnits!==amountBaseUnits)throw new Error("A different repayment is unresolved. Recover its receipt before changing the amount.");if(i.status==="pending")throw new Error("A repayment is pending; refresh before retrying.");if(i.expiresAt<=Math.floor(Date.now()/1000))throw new Error("Previous repayment review expired. Recover or cancel its pinned wallet nonce before creating another repayment.");return response(i);}
  const prepared=await prepareOwnerRepayment(publicClient(),{borrower:owner,ownerAddress:owner,amountBaseUnits,maxSnapshotAgeSeconds:60});
  const nonce=await publicClient().getTransactionCount({address:owner as Address,blockTag:"pending"});
  const intent:RepayIntent={id:randomUUID(),owner,amount:show(BigInt(amountBaseUnits)),amountBaseUnits,nonce,data:prepared.data,preparedBlock:prepared.snapshot.blockNumber,createdAt:new Date().toISOString(),expiresAt:prepared.expiresAt,status:"prepared",snapshot:prepared.snapshot,economics:prepared.economics};
  await q.query("INSERT INTO repayments(id,owner,body) VALUES($1,$2,$3::jsonb)",[intent.id,owner.toLowerCase(),JSON.stringify(intent)]);return response(intent);
 });
}
export async function broadcastRepayment(db:Database,owner:string,id:string,hash:string){
 if(!isHash(hash))throw new Error("Invalid repayment transaction hash.");
 return db.transaction(async q=>{const r=await q.query<{body:RepayIntent}>("SELECT body FROM repayments WHERE id=$1 AND owner=$2 FOR UPDATE",[id,owner.toLowerCase()]);const i=r.rows[0]?.body;if(!i)throw new Error("Repayment not found.");if(!["prepared","pending"].includes(i.status))throw new Error("Repayment already settled.");let tx;try{tx=await publicClient().getTransaction({hash});}catch(error){if(!(error instanceof TransactionNotFoundError))throw error;}if(tx&&(tx.from.toLowerCase()!==owner.toLowerCase()||tx.to?.toLowerCase()!==troveDeployment.borrowerOperations.toLowerCase()||tx.input.toLowerCase()!==i.data.toLowerCase()||tx.nonce!==i.nonce||tx.value!==0n))throw new Error("Transaction does not match the pinned repayment.");if(i.txHash&&i.txHash.toLowerCase()!==hash.toLowerCase())throw new Error("A different repayment hash is already recorded. Recover its receipt before retrying.");i.status="pending";i.txHash=hash;await q.query("UPDATE repayments SET body=$1::jsonb,tx_hash=$2 WHERE id=$3",[JSON.stringify(i),hash,id]);return{status:"pending",txHash:hash};});
}
