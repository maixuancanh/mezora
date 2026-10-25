import {randomBytes,randomUUID} from 'node:crypto';
import {decodeEventLog,erc20Abi,type Hex} from 'viem';
import {database,type Database} from '../../../../packages/db/src/database';
import {ensureWorkspace} from '../../../../packages/db/src/workspace';
import {appendAuditEvent} from '../../../../packages/db/src/persistence';
import {publicClient,officialTestnetMusd} from '../../../../packages/mezo/src/network';
import {treasuryV2Abi} from '../../../../packages/mezo/src/treasury-v2-abi';
import {acceptanceOwner,acceptanceReviewer,acceptanceTreasury} from '../../../../packages/mezo/src/v2-acceptance';
import {paymentAmount,paymentId,paymentTermsHash,paymentTypedData,paymentDigest,paymentSigner,paymentCall,fundingCall,type PaymentRequest} from '../../../../packages/mezo/src/v2-payment';
import {v2State} from './v2-acceptance';
const ns='live:'+acceptanceOwner.toLowerCase(),same=(a:string,b:string)=>a.toLowerCase()===b.toLowerCase();
export interface PaymentReview{id:string;request:PaymentRequest;digest:string;ownerSignature?:Hex;reviewerSignature?:Hex}
export async function paymentReceipts(db:Database){
 const rows=(await db.query<{body:{status:string;kind:string;txHash:string;blockNumber:string;blockHash:string;treasury:string;token:string;amount:string;recipient:string}}>("SELECT body FROM audit_events WHERE workspace_id=$1 AND action='v2.payment.confirm' ORDER BY created_at DESC LIMIT 100",[ns])).rows;
 const receipts:Record<string,{txHash:string;blockNumber:string;amount:string}>={};
 for(const {body:b} of rows){
  if(!['funding','reserve','payment'].includes(b.kind)||receipts[b.kind]||b.status!=='confirmed'||b.amount!=='1'||!same(b.treasury,acceptanceTreasury)||!same(b.token,officialTestnetMusd)||!same(b.recipient,b.kind==='funding'?acceptanceTreasury:acceptanceReviewer)||!/^0x[0-9a-f]{64}$/i.test(b.txHash))continue;
  // Do not resurrect a receipt from a block that no longer belongs to the canonical chain.
  const block=await publicClient().getBlock({blockNumber:BigInt(b.blockNumber)});if(block.hash===b.blockHash)receipts[b.kind]={txHash:b.txHash,blockNumber:b.blockNumber,amount:b.amount};
  if(Object.keys(receipts).length===3)break;
 }return receipts;
}
export async function paymentState(){
 const state=await v2State(),p=publicClient(),blockNumber=BigInt(state.blockNumber),block=await p.getBlock({blockNumber});
 const [balance,reserved,buffer,cap,commitment]=await Promise.all([
 p.readContract({address:officialTestnetMusd,abi:erc20Abi,functionName:'balanceOf',args:[acceptanceTreasury],blockNumber}),
 p.readContract({address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'totalReserved',blockNumber}),
 p.readContract({address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'minimumBuffer',blockNumber}),
 p.readContract({address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'maxSpend',blockNumber}),
 p.readContract({address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'commitments',args:[paymentId],blockNumber})]);
 if((await p.getBlock({blockNumber})).hash!==block.hash)throw Error('Chain changed; refresh.');
 if(commitment[3]!==0&&(commitment[0]!==paymentTermsHash||!same(commitment[1],acceptanceReviewer)||commitment[2]!==paymentAmount))throw Error('Existing commitment does not match this test bill.');
 return {...state,balance:balance.toString(),reserved:reserved.toString(),buffer:buffer.toString(),cap:cap.toString(),billStatus:commitment[3]};
}
async function audit(db:Database,actor:string,action:string,id:string,details:unknown){await db.transaction(async q=>{await ensureWorkspace(q,ns,'live');await q.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[ns]);await appendAuditEvent(q,{workspaceId:ns,actorId:actor,action,entityId:id,details});});}
export async function paymentReview(db:Database,id?:string):Promise<PaymentReview|null>{
 if(id&&!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid review ID.');
 const r=(await db.query<{body:PaymentReview}>("SELECT body FROM audit_events WHERE workspace_id=$1 AND action='v2.payment.prepare'"+(id?' AND entity_id=$2':'')+' ORDER BY created_at DESC LIMIT 1',id?[ns,id]:[ns])).rows[0]?.body;if(!r){if(id)throw Error('Review not found.');return null;}
 if(paymentDigest(r.request)!==r.digest)throw Error('Stored review digest mismatch.');
 const votes=(await db.query<{actor_id:string;body:{signature:Hex}}>("SELECT actor_id,body FROM audit_events WHERE workspace_id=$1 AND action='v2.payment.sign' AND entity_id=$2 ORDER BY created_at DESC",[ns,r.id])).rows;
 for(const v of votes){if(same(v.actor_id,acceptanceOwner)&&!r.ownerSignature)r.ownerSignature=v.body.signature;if(same(v.actor_id,acceptanceReviewer)&&!r.reviewerSignature)r.reviewerSignature=v.body.signature;}return r;
}
function owner(session:string|null){if(!session||!same(session,acceptanceOwner))throw Error('Sign in with the V2 owner wallet.');}
async function fresh(r:PaymentReview){const s=await paymentState();if(s.paused)throw Error('V2 is paused.');if(s.policyVersion!==r.request.policyVersion||s.timestamp>Number(r.request.deadline))throw Error('Review expired or policy changed. Create a fresh review.');if(await publicClient().readContract({address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'consumedNonces',args:[BigInt(r.request.nonce)]}))throw Error('Review already executed. Refresh state.');if(r.request.action===0&&s.billStatus!==0||r.request.action===1&&s.billStatus!==1)throw Error('Bill state changed. Refresh.');return s;}
export async function paymentAction(b:Record<string,unknown>,session:string|null){
 if(['fund','create','execute'].includes(String(b.action)))owner(session);
 const db=await database(),p=publicClient();
 if(b.action==='fund'){
 owner(session);const s=await paymentState();if(s.paused)throw Error('V2 is paused.');if(s.billStatus!==0||BigInt(s.balance)>=paymentAmount)throw Error('Test bill already funded or started; do not send again.');
 if(await p.readContract({address:officialTestnetMusd,abi:erc20Abi,functionName:'balanceOf',args:[acceptanceOwner]})<paymentAmount)throw Error('Owner needs 1 test MUSD.');await p.call({account:acceptanceOwner,to:officialTestnetMusd,data:fundingCall()});return {transaction:{to:officialTestnetMusd,data:fundingCall(),value:'0x0',chainId:31611}};
 }
 if(b.action==='create'){
 owner(session);const s=await paymentState();if(s.paused)throw Error('V2 is paused.');if(s.billStatus!==0&&s.billStatus!==1)throw Error('Test bill is already paid or canceled.');const action=s.billStatus===0?0:1;
 if(BigInt(s.cap)<paymentAmount||BigInt(s.balance)<BigInt(s.reserved)+BigInt(s.buffer)+(action===0?paymentAmount:0n))throw Error('Insufficient uncommitted funds or policy cap for this test bill.');
 const existing=await paymentReview(db);if(existing&&existing.request.action===action&&existing.request.policyVersion===s.policyVersion&&Number(existing.request.deadline)>s.timestamp+120)return existing;
 const r:PaymentReview={id:randomUUID(),request:{action,nonce:BigInt('0x'+randomBytes(32).toString('hex')).toString(),deadline:String(s.timestamp+1800),policyVersion:s.policyVersion},digest:''};r.digest=paymentDigest(r.request);await audit(db,session!,'v2.payment.prepare',r.id,r);return r;
 }
 if(b.action==='verify-fund')return verify(db,b,null);
 const r=await paymentReview(db,String(b.id||''));if(!r)throw Error('Review not found.');
 if(b.action==='sign'){await fresh(r);const signer=await paymentSigner(r.request,b.signature);await audit(db,signer,'v2.payment.sign',r.id,{signature:b.signature,digest:r.digest});return {signed:true,signer};}
 if(b.action==='execute'){
 owner(session);await fresh(r);if(!r.ownerSignature||!r.reviewerSignature)throw Error('Both owner and reviewer signatures are required.');await signatures(r);
 let rejected=false;try{await p.simulateContract({account:acceptanceOwner,address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'execute',args:[paymentTypedData(r.request).message,r.ownerSignature,[]]});}catch(e){rejected=String(e).includes('InvalidQuorum');}if(!rejected)throw Error('Missing-reviewer rejection could not be verified.');
 const data=paymentCall(r.request,r.ownerSignature,r.reviewerSignature);await p.call({account:acceptanceOwner,to:acceptanceTreasury,data});return {ownerOnlyRejected:true,transaction:{to:acceptanceTreasury,data,value:'0x0',chainId:31611}};
 }
 if(b.action==='verify')return verify(db,b,r);throw Error('Unknown payment acceptance action.');
}
async function signatures(r:PaymentReview){if(!r.ownerSignature||!r.reviewerSignature||!same(await paymentSigner(r.request,r.ownerSignature),acceptanceOwner)||!same(await paymentSigner(r.request,r.reviewerSignature),acceptanceReviewer))throw Error('Both signer roles must match.');}
async function verify(db:Database,b:Record<string,unknown>,r:PaymentReview|null){
 const hash=String(b.txHash) as Hex;if(!/^0x[0-9a-f]{64}$/i.test(hash))throw Error('Invalid transaction hash.');const p=publicClient();if(await p.getChainId()!==31611)throw Error('Wrong chain.');
 const receipt=await p.getTransactionReceipt({hash}).catch(()=>null);if(!receipt)return {status:'pending'};if(receipt.status!=='success')return {status:'reverted'};
 const [tx,block,head]=await Promise.all([p.getTransaction({hash}),p.getBlock({blockNumber:receipt.blockNumber}),p.getBlockNumber()]);if(block.hash!==receipt.blockHash||head-receipt.blockNumber+1n<2n)return {status:'pending'};
 const data=r?(await signatures(r),paymentCall(r.request,r.ownerSignature!,r.reviewerSignature!)):fundingCall(),to=r?acceptanceTreasury:officialTestnetMusd;
 if(!tx.to||!same(tx.to,to)||!same(tx.from,acceptanceOwner)||tx.value!==0n||tx.input!==data)throw Error('Transaction does not match the approved test action.');
 const transfers=receipt.logs.filter(l=>same(l.address,officialTestnetMusd)).flatMap(l=>{try{const e=decodeEventLog({abi:erc20Abi,data:l.data,topics:l.topics});return e.eventName==='Transfer'?[{from:e.args.from,to:e.args.to,amount:e.args.value,index:l.logIndex}]:[];}catch{return [];}});
 if(!r||r.request.action===1){const from=r?acceptanceTreasury:acceptanceOwner,payee=r?acceptanceReviewer:acceptanceTreasury;if(transfers.filter(t=>same(t.from,from)&&same(t.to,payee)&&t.amount===paymentAmount).length!==1)throw Error('Exact MUSD transfer log missing.');}
 if(r){
 const expected=paymentTypedData(r.request).message,events=receipt.logs.filter(l=>same(l.address,acceptanceTreasury)).flatMap(l=>{try{const e=decodeEventLog({abi:treasuryV2Abi,data:l.data,topics:l.topics});return e.eventName==='ActionExecuted'&&e.args.action===expected.action&&e.args.nonce===expected.nonce&&e.args.id===expected.id&&e.args.termsHash===expected.termsHash&&same(e.args.payee,expected.payee)&&e.args.amount===expected.amount&&e.args.policyVersion===expected.policyVersion?[e]:[];}catch{return [];}});if(events.length!==1)throw Error('Matching action event missing.');
 const [commitment,consumed]=await Promise.all([p.readContract({address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'commitments',args:[paymentId],blockNumber:receipt.blockNumber}),p.readContract({address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'consumedNonces',args:[expected.nonce],blockNumber:receipt.blockNumber})]);if(!consumed||commitment[3]!== (r.request.action===0?1:2)||commitment[0]!==paymentTermsHash||!same(commitment[1],acceptanceReviewer)||commitment[2]!==paymentAmount)throw Error('Receipt-block commitment or nonce mismatch.');
 }
 const proof={status:'confirmed',kind:r?(r.request.action===0?'reserve':'payment'):'funding',chainId:31611,txHash:hash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,treasury:acceptanceTreasury,amount:'1',token:officialTestnetMusd,recipient:r?acceptanceReviewer:acceptanceTreasury,billId:paymentId,termsHash:paymentTermsHash,...(r?{reviewId:r.id,digest:r.digest,nonceConsumed:true}:{}),transfers:transfers.map(t=>({...t,amount:t.amount.toString()})),v1MigrationPerformed:false};
 await audit(db,acceptanceOwner,'v2.payment.confirm',r?.id||hash,proof);return proof;
}
