import { readFile,writeFile,mkdir } from "node:fs/promises";
import {createPublicClient,createWalletClient,http,parseEther} from "viem";
import {mnemonicToAccount} from "viem/accounts";
import {mezoTestnet} from "../packages/mezo/src/network";
const account=mnemonicToAccount("test test test test test test test test test test test junk");
const rpc="http://127.0.0.1:8547",p=createPublicClient({transport:http(rpc)}),wallet=createWalletClient({account,chain:mezoTestnet,transport:http(rpc)});
async function deploy(file:string,args:unknown[]=[]){const artifact=JSON.parse(await readFile(file,"utf8"));const hash=await wallet.deployContract({abi:artifact.abi,bytecode:artifact.bytecode.object,args});const receipt=await p.waitForTransactionReceipt({hash});return receipt.contractAddress!;}
const token=await deploy("contracts/out/MezoraTreasury.t.sol/MockToken.json");
const treasury=await deploy("contracts/out/MezoraTreasury.sol/MezoraTreasury.json",[token,account.address]);
const artifact=JSON.parse(await readFile("contracts/out/MezoraTreasury.t.sol/MockToken.json","utf8"));
await p.waitForTransactionReceipt({hash:await wallet.writeContract({address:token,abi:artifact.abi,functionName:"mint",args:[account.address,parseEther("2000")]})});
await mkdir(".data",{recursive:true});await writeFile(".data/local-evm.json",JSON.stringify({token,treasury,owner:account.address,rpc},null,2));console.log({token,treasury,owner:account.address,scope:"local Anvil only"});

