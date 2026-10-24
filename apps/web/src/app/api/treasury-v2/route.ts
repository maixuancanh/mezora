import {NextRequest,NextResponse} from 'next/server';
import {isHash,parseUnits,keccak256,type Address} from 'viem';
import {database} from '../../../../../../packages/db/src/database';
import {ensureWorkspace} from '../../../../../../packages/db/src/workspace';
import {appendAuditEvent} from '../../../../../../packages/db/src/persistence';
import {publicClient,officialTestnetMusd} from '../../../../../../packages/mezo/src/network';
import {v2Config,v2DeploymentData,matchesV2Runtime} from '../../../../../../packages/mezo/src/v2-deployment';
import {treasuryV2Abi} from '../../../../../../packages/mezo/src/treasury-v2-abi';
import {sessionAddress} from '../../../server/auth';import {readBody,errorResponse} from '../../../server/http';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(){try{const owner=await sessionAddress();if(!owner)throw new Error('Connect and sign in with OKX first.');const db=await database();return NextResponse.json({owner,deployments:(await db.query("SELECT body FROM audit_events WHERE workspace_id=$1 AND action='v2.register' ORDER BY created_at DESC LIMIT 10",['live:'+owner.toLowerCase()])).rows},{headers:{'Cache-Control':'private, no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(req:NextRequest){try{
 const b=await readBody(req),owner=await sessionAddress();if(!owner)throw new Error('Connect and sign in with OKX first.');const config=v2Config(b.config);if(config.owner.toLowerCase()!==owner.toLowerCase())throw new Error('The signed-in account must own this new V2 treasury.');const p=publicClient();if(await p.getChainId()!==31611)throw new Error('Wrong RPC chain.');const data=v2DeploymentData(config);
 if(b.action==='prepare'){
  const codes=await Promise.all([config.owner,...config.reviewers].map(address=>p.getCode({address})));if(codes.some(c=>c&&c!=='0x'))throw new Error('V2 supports EOA owner and reviewer wallets only.');
  const gas=await p.estimateGas({account:config.owner,data,value:0n});return NextResponse.json({config,transaction:{data,value:'0x0',chainId:31611},estimatedGas:gas.toString(),expiresAt:Date.now()+300000});
 }
 if(b.action!=='register'||!isHash(b.txHash))throw new Error('Enter the deployment transaction hash.');
 const receipt=await p.getTransactionReceipt({hash:b.txHash}).catch(()=>null);if(!receipt)return NextResponse.json({status:'pending',txHash:b.txHash});if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('Deployment failed or did not create a contract.');
 const [tx,head,block]=await Promise.all([p.getTransaction({hash:b.txHash}),p.getBlockNumber(),p.getBlock({blockNumber:receipt.blockNumber})]);
 if(tx.from.toLowerCase()!==owner.toLowerCase()||tx.to!==null||tx.value!==0n||tx.input.toLowerCase()!==data.toLowerCase())throw new Error('Deployment does not match this exact owner, reviewer quorum, policy and build.');if(block.hash!==receipt.blockHash||head-receipt.blockNumber+1n<2n)return NextResponse.json({status:'pending',txHash:b.txHash});
 const address=receipt.contractAddress as Address,code=await p.getCode({address,blockNumber:receipt.blockNumber});if(!code||!matchesV2Runtime(code))throw new Error('V2 runtime does not match this build.');
 const read=(functionName:'owner'|'token'|'quorum'|'maxSpend'|'minimumBuffer')=>p.readContract({address,abi:treasuryV2Abi,functionName,blockNumber:receipt.blockNumber});const [actualOwner,token,quorum,maxSpend,buffer]=await Promise.all([read('owner'),read('token'),read('quorum'),read('maxSpend'),read('minimumBuffer')]);
 if(String(actualOwner).toLowerCase()!==owner.toLowerCase()||String(token).toLowerCase()!==officialTestnetMusd.toLowerCase()||quorum!==BigInt(config.quorum)||maxSpend!==parseUnits(config.maxSpend,18)||buffer!==parseUnits(config.minimumBuffer,18))throw new Error('V2 contract configuration mismatch.');
 for(let i=0;i<config.reviewers.length;i++)if((await p.readContract({address,abi:treasuryV2Abi,functionName:'reviewers',args:[BigInt(i)],blockNumber:receipt.blockNumber})).toLowerCase()!==config.reviewers[i].toLowerCase())throw new Error('Reviewer list mismatch.');
 if((await p.getBlock({blockNumber:receipt.blockNumber})).hash!==receipt.blockHash)throw new Error('Canonical block changed. Retry verification.');
 const verified={status:'confirmed',address,config,txHash:b.txHash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,codeHash:keccak256(code),v1Unchanged:true};const db=await database(),ns='live:'+owner.toLowerCase();await db.transaction(async q=>{await ensureWorkspace(q,ns,'live');await q.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE',[ns]);if(!(await q.query("SELECT id FROM audit_events WHERE workspace_id=$1 AND action='v2.register' AND entity_id=$2",[ns,address.toLowerCase()])).rows.length)await appendAuditEvent(q,{workspaceId:ns,actorId:owner,action:'v2.register',entityId:address.toLowerCase(),details:verified});});return NextResponse.json(verified);
 }catch(e){return errorResponse(e);}}
