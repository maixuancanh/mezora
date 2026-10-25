import {writeFile} from 'node:fs/promises';
import {decodeFunctionData,erc20Abi} from 'viem';
import {publicClient,officialTestnetMusd} from '../packages/mezo/src/network';
import {treasuryV2Abi} from '../packages/mezo/src/treasury-v2-abi';
import {acceptanceTreasury,acceptanceOwner,acceptanceReviewer} from '../packages/mezo/src/v2-acceptance';
import {paymentId,paymentTermsHash,paymentAmount,paymentDigest,paymentSigner,fundingCall,type PaymentRequest} from '../packages/mezo/src/v2-payment';
const base='https://mezora.vercel.app/api/v2-payment',p=publicClient();
async function rpcRead<T>(read:()=>Promise<T>):Promise<T>{let last:unknown;for(let attempt=0;attempt<4;attempt++){try{return await read();}catch(e){last=e;if(!/could not be found|timeout|HTTP request failed/i.test(String(e)))throw e;}}throw last;}

if(await p.getChainId()!==31611)throw Error('Wrong chain');
const get=await fetch(base);if(!get.ok)throw Error('Payment API unavailable');const current=await get.json();
if(current.state.billStatus!==2||current.review?.request.action!==1)throw Error('V2 test bill has not completed payment. No acceptance evidence written.');
const events=await p.getContractEvents({address:acceptanceTreasury,abi:treasuryV2Abi,eventName:'ActionExecuted',args:{id:paymentId},fromBlock:16354797n,toBlock:'latest'});
const approvals=[];
for(const action of [0,1] as const){
 const candidates=events.filter(e=>e.args.action===action&&e.args.amount===paymentAmount&&e.args.termsHash===paymentTermsHash&&e.args.payee?.toLowerCase()===acceptanceReviewer.toLowerCase());if(candidates.length!==1)throw Error('Expected one exact reserve/pay event');
 const event=candidates[0],hash=event.transactionHash!,[tx,receipt,head,block]=await Promise.all([rpcRead(()=>p.getTransaction({hash})),rpcRead(()=>p.getTransactionReceipt({hash})),p.getBlockNumber(),p.getBlock({blockNumber:event.blockNumber!})]);
 if(receipt.status!=='success'||receipt.blockHash!==block.hash||head-receipt.blockNumber+1n<2n||tx.from.toLowerCase()!==acceptanceOwner.toLowerCase()||tx.to?.toLowerCase()!==acceptanceTreasury||tx.value!==0n)throw Error('Receipt or transaction mismatch');
 const decoded=decodeFunctionData({abi:treasuryV2Abi,data:tx.input});if(decoded.functionName!=='execute')throw Error('Not an execute call');const [r,ownerSig,reviewerSigs]=decoded.args as [{action:number;nonce:bigint;deadline:bigint;policyVersion:bigint},`0x${string}`,`0x${string}`[]];
 const request:PaymentRequest={action,nonce:String(r.nonce),deadline:String(r.deadline),policyVersion:String(r.policyVersion)};if(r.action!==action||reviewerSigs.length!==1||(await paymentSigner(request,ownerSig)).toLowerCase()!==acceptanceOwner.toLowerCase()||(await paymentSigner(request,reviewerSigs[0])).toLowerCase()!==acceptanceReviewer.toLowerCase())throw Error('Signer mismatch');
 const consumed=await p.readContract({address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'consumedNonces',args:[r.nonce],blockNumber:receipt.blockNumber});if(!consumed)throw Error('Nonce not consumed');
 approvals.push({action:action===0?'Reserve':'Pay',txHash:hash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,digest:paymentDigest(request),request,bothSignersVerified:true,nonceConsumed:true});
}
const funding=await p.getContractEvents({address:officialTestnetMusd,abi:erc20Abi,eventName:'Transfer',args:{from:acceptanceOwner,to:acceptanceTreasury},fromBlock:16354797n,toBlock:'latest'});
let fundingHash:string|undefined;for(const e of funding){if(e.args.value!==paymentAmount)continue;const tx=await rpcRead(()=>p.getTransaction({hash:e.transactionHash!}));if(tx.input===fundingCall())fundingHash=e.transactionHash!;}if(!fundingHash)throw Error('Exact funding transfer missing');
async function verify(body:unknown){return rpcRead(async()=>{const r=await fetch(base,{method:'POST',headers:{Origin:'https://mezora.vercel.app','Content-Type':'application/json'},body:JSON.stringify(body)}),proof=await r.json();if(!r.ok||proof.status!=='confirmed')throw Error(JSON.stringify(proof));return proof;});}
const fundingProof=await verify({action:'verify-fund',txHash:fundingHash}),paymentProof=await verify({action:'verify',id:current.review.id,txHash:approvals[1].txHash});
const proof={verifiedAt:new Date().toISOString(),scope:'Self-funded one-MUSD V2 bill acceptance; not customer revenue or audit',treasury:acceptanceTreasury,owner:acceptanceOwner,reviewer:acceptanceReviewer,amountMusd:'1',billId:paymentId,termsHash:paymentTermsHash,funding:fundingProof,approvals,payment:paymentProof,v1MigrationPerformed:false};
await writeFile('docs/testnet-v2-funded-payment-evidence-2026-10-25.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof));
