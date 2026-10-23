import { createPublicClient,http } from 'viem';
import { mezoTestnet } from '../packages/mezo/src/network';
import { readTroveSnapshot,prepareOwnerRepayment,troveDeployment } from '../packages/mezo/src/trove';

// Read-only: no private key, wallet client, signature or broadcast method.
const client=createPublicClient({chain:mezoTestnet,transport:http(process.env.MEZO_RPC_URL??'https://rpc.test.mezo.org',{timeout:15000,retryCount:0})});
const borrower=process.argv[2]??troveDeployment.borrowerOperations;
const snapshot=await readTroveSnapshot(client,borrower);
const output:{probeKind:string;snapshot:typeof snapshot;unsignedRepayment?:unknown}={probeKind:process.argv[2]?'explicit_public_address':'protocol_contract_nonborrower_probe',snapshot};
if(process.argv[3])output.unsignedRepayment=await prepareOwnerRepayment(client,{borrower,ownerAddress:borrower,amountBaseUnits:process.argv[3]});
console.log(JSON.stringify(output,null,2));
