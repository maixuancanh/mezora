import {writeFile} from 'node:fs/promises';
import {publicClient} from '../packages/mezo/src/network';
import {treasuryV2Abi} from '../packages/mezo/src/treasury-v2-abi';
import {acceptanceTreasury,acceptanceOwner,acceptanceReviewer,acceptanceSigner,acceptanceDigest,unpauseCall,unpauseTypedData} from '../packages/mezo/src/v2-acceptance';
const id='dbd4d536-1ea4-4230-83ff-ab557a25351a',base='https://mezora.vercel.app/api/v2-acceptance';
const response=await fetch(base+'?id='+id);if(!response.ok)throw Error('Review lookup failed');const {review}=await response.json();
if(!review.ownerSignature||!review.reviewerSignature||acceptanceDigest(review.request)!==review.digest)throw Error('Missing or mismatched review');
if((await acceptanceSigner(review.request,review.ownerSignature)).toLowerCase()!==acceptanceOwner.toLowerCase()||(await acceptanceSigner(review.request,review.reviewerSignature)).toLowerCase()!==acceptanceReviewer.toLowerCase())throw Error('Signer roles mismatch');
const p=publicClient();if(await p.getChainId()!==31611)throw Error('Wrong chain');
const logs=await p.getContractEvents({address:acceptanceTreasury,abi:treasuryV2Abi,eventName:'ActionExecuted',fromBlock:16354797n,toBlock:'latest'});
const matches=logs.filter(l=>l.args.action===5&&l.args.nonce===BigInt(review.request.nonce));if(matches.length!==1)throw Error('Expected one matching Unpause execution');const log=matches[0];
// Reproduce the missing-reviewer rejection immediately before the actual execution.
let ownerOnlyRejected=false;try{await p.simulateContract({account:acceptanceOwner,address:acceptanceTreasury,abi:treasuryV2Abi,functionName:'execute',args:[unpauseTypedData(review.request).message,review.ownerSignature,[]],blockNumber:log.blockNumber!-1n});}catch(e){ownerOnlyRejected=String(e).includes('InvalidQuorum');}if(!ownerOnlyRejected)throw Error('Missing-reviewer negative simulation not established');
const tx=await p.getTransaction({hash:log.transactionHash!});if(tx.input!==unpauseCall(review.request,review.ownerSignature,review.reviewerSignature))throw Error('Calldata mismatch');
const result=await fetch(base,{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://mezora.vercel.app'},body:JSON.stringify({action:'verify',id,txHash:log.transactionHash})});const proof=await result.json();if(!result.ok||proof.status!=='confirmed')throw Error(JSON.stringify(proof));
const evidence={verifiedAt:new Date().toISOString(),chainId:31611,reviewId:id,...proof,ownerSignatureVerified:true,reviewerSignatureVerified:true,ownerOnlyRejectedAtPreviousBlock:ownerOnlyRejected,amountMusd:'0',fundedPaymentAcceptance:false,v1MigrationPerformed:false,scope:'Zero-MUSD pause/unpause shared authorization acceptance; no V2 funded payment tested'};
await writeFile('docs/testnet-v2-shared-approval-evidence-2026-10-25.json',JSON.stringify(evidence,null,2));console.log(JSON.stringify(evidence));
