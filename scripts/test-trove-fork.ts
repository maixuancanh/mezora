import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createPublicClient,createWalletClient,http,parseAbi,zeroAddress,type Address,type Hex } from 'viem';
import { mezoTestnet } from '../packages/mezo/src/network';
import { prepareOwnerRepayment,readTroveSnapshot,troveDeployment,troveAbi } from '../packages/mezo/src/trove';

/** This script may write ONLY to the isolated Anvil instance on loopback port 8549. */
const endpoint='http://127.0.0.1:8549';
function assertLoopback(){const url=new URL(endpoint);assert.equal(url.protocol,'http:');assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'8549');assert.equal(url.pathname,'/');}
assertLoopback();
const client=createPublicClient({chain:mezoTestnet,transport:http(endpoint,{timeout:30000,retryCount:0}),cacheTime:0});
const version=await client.request({method:'web3_clientVersion'});assert.match(version,/anvil/i);assert.equal(await client.getChainId(),31611);
async function localMutation(method:string,params:unknown[]){
 assertLoopback();assert.match(await client.request({method:'web3_clientVersion'}),/anvil/i);
 const response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),redirect:'error'});
 const body=await response.json() as {error?:unknown;result?:unknown};if(body.error)throw new Error(JSON.stringify(body.error));return body.result;
}
const d=troveDeployment,amount=10n**18n;
const listAbi=parseAbi(['function getFirst() view returns (address)','function getNext(address) view returns (address)','function getTrovePrincipal(address) view returns (uint256)','function totalSupply() view returns (uint256)']);
const forkBlock=await client.getBlock();
const minNetDebt=await client.readContract({address:d.borrowerOperations,abi:troveAbi,functionName:'minNetDebt',blockNumber:forkBlock.number});
const gasComp=await client.readContract({address:d.borrowerOperations,abi:troveAbi,functionName:'MUSD_GAS_COMPENSATION',blockNumber:forkBlock.number});
let cursor=await client.readContract({address:d.sortedTroves,abi:listAbi,functionName:'getFirst',blockNumber:forkBlock.number});
let borrower:Address|undefined;let inspected=0;
while(cursor!==zeroAddress&&inspected<64){
 const [status,entire,balance]=await Promise.all([
 client.readContract({address:d.troveManager,abi:troveAbi,functionName:'getTroveStatus',args:[cursor],blockNumber:forkBlock.number}),
 client.readContract({address:d.troveManager,abi:troveAbi,functionName:'getEntireDebtAndColl',args:[cursor],blockNumber:forkBlock.number}),
 client.readContract({address:d.musd,abi:troveAbi,functionName:'balanceOf',args:[cursor],blockNumber:forkBlock.number})]);
 inspected++;
 if(status===1&&balance>=amount&&entire[1]+entire[2]>minNetDebt+gasComp+amount){borrower=cursor;break;}
 cursor=await client.readContract({address:d.sortedTroves,abi:listAbi,functionName:'getNext',args:[cursor],blockNumber:forkBlock.number});
}
assert.ok(borrower,'No suitably funded active borrower found within bounded 64 address scan; no transaction sent');
let impersonating=false;
try{
 await localMutation('anvil_impersonateAccount',[borrower]);impersonating=true;
 await localMutation('anvil_setBalance',[borrower,'0xde0b6b3a7640000']);
 const prepared=await prepareOwnerRepayment(client,{borrower,ownerAddress:borrower,amountBaseUnits:amount.toString(),now:Number(forkBlock.timestamp),maxSnapshotAgeSeconds:30});
 assert.equal(prepared.requiresOwnerSignature,true);assert.equal(prepared.from,borrower);assert.equal(prepared.to,d.borrowerOperations);assert.equal(prepared.value,'0');
 const before=prepared.snapshot;
 const [rawPrincipal,totalSupplyBefore]=await Promise.all([
 client.readContract({address:d.troveManager,abi:listAbi,functionName:'getTrovePrincipal',args:[borrower],blockNumber:BigInt(before.blockNumber)}),
 client.readContract({address:d.musd,abi:listAbi,functionName:'totalSupply',blockNumber:BigInt(before.blockNumber)})]);
 const nextTimestamp=before.blockTimestamp+1;
 await localMutation('evm_setNextBlockTimestamp',[nextTimestamp]);
 assertLoopback();assert.match(await client.request({method:'web3_clientVersion'}),/anvil/i);
 const wallet=createWalletClient({account:borrower,chain:mezoTestnet,transport:http(endpoint,{timeout:30000,retryCount:0})});
 // This uses an unlocked impersonated account on LOCAL ANVIL only, with exactly adapter calldata.
 const txHash=await wallet.sendTransaction({account:borrower,to:prepared.to,data:prepared.data as Hex,value:BigInt(prepared.value),gas:1500000n,gasPrice:await client.getGasPrice()});
 const receipt=await client.waitForTransactionReceipt({hash:txHash,pollingInterval:100});assert.equal(receipt.status,'success');
 const after=await readTroveSnapshot(client,borrower);const elapsed=BigInt(after.blockTimestamp-before.blockTimestamp);
 // Source InterestRateMath uses 365.2425 days and integer annual basis points.
 const accruedBetween=rawPrincipal*BigInt(before.troveInterestRateBps)*elapsed/(10000n*31556952n);
 assert.equal(BigInt(before.ownerMusdBalanceBaseUnits)-BigInt(after.ownerMusdBalanceBaseUnits),amount,'Exact borrower MUSD burn');
 assert.equal(BigInt(after.debtBaseUnits),BigInt(before.debtBaseUnits)+accruedBetween-amount,'Debt conservation including block-time interest');
 const interestAtPayment=BigInt(before.interestBaseUnits)+accruedBetween;
 const interestPaid=amount<interestAtPayment?amount:interestAtPayment,principalPaid=amount-interestPaid;
 assert.equal(BigInt(after.principalBaseUnits),BigInt(before.principalBaseUnits)-principalPaid);
 assert.equal(BigInt(after.interestBaseUnits),interestAtPayment-interestPaid);
 assert.equal(after.collateralBaseUnits,before.collateralBaseUnits);assert.equal(after.status,'active');
 const totalSupplyAfter=await client.readContract({address:d.musd,abi:listAbi,functionName:'totalSupply',blockNumber:receipt.blockNumber});
 const evidence={kind:'local_anvil_fork_only',publicNetworkWrites:false,userOwnerRepaid:false,userOwnerAddress:'0x6A613e758D77c46B6E74971F7481dd66b59fE33a',sourceCommit:d.sourceCommit,endpoint,anvilVersion:version,forkUpstream:'https://rpc.test.mezo.org',forkBlock:{number:forkBlock.number.toString(),hash:forkBlock.hash,timestamp:forkBlock.timestamp.toString()},inspectedBorrowers:inspected,impersonatedBorrower:borrower,localGasFundingBaseUnits:'1000000000000000000',musdFunding:'existing borrower MUSD on fork; no token funding or mint override',prepared:{from:prepared.from,to:prepared.to,data:prepared.data,value:prepared.value,upperHint:prepared.upperHint,lowerHint:prepared.lowerHint,economics:prepared.economics},receipt:{transactionHash:receipt.transactionHash,blockNumber:receipt.blockNumber.toString(),blockHash:receipt.blockHash,status:receipt.status,gasUsed:receipt.gasUsed.toString()},amountBaseUnits:amount.toString(),accruedBetweenBaseUnits:accruedBetween.toString(),interestPaidBaseUnits:interestPaid.toString(),principalPaidBaseUnits:principalPaid.toString(),totalSupplyBeforeBaseUnits:totalSupplyBefore.toString(),totalSupplyAfterBaseUnits:totalSupplyAfter.toString(),before,after,checks:{exactBorrowerBurn:true,debtConservationIncludingAccrual:true,interestFirst:true,principalConservation:true,collateralUnchanged:true,activeAfter:true},limitations:['All state changes exist only on a discarded local fork.','Public borrower impersonation proves source compatibility, not user authorization or a user live repayment.','The supplied user owner has no funded active Trove in the earlier live snapshot.','MUSD total supply also reflects system interest minting during repayment; borrower balance burn and debt conservation are checked independently.']};
 await writeFile(new URL('../docs/trove-fork-evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({kind:evidence.kind,forkBlock:evidence.forkBlock,borrower,transactionHash:txHash,status:receipt.status,amountBaseUnits:amount.toString(),interestPaidBaseUnits:interestPaid.toString(),principalPaidBaseUnits:principalPaid.toString(),accruedBetweenBaseUnits:accruedBetween.toString(),checks:evidence.checks,publicNetworkWrites:false,userOwnerRepaid:false},null,2));
}finally{if(impersonating)await localMutation('anvil_stopImpersonatingAccount',[borrower]);}
