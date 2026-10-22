import { writeFile,mkdir } from "node:fs/promises";
import {createPublicClient,http,erc20Abi} from "viem";
import {officialTestnetMusd,mezoTestnet} from "../packages/mezo/src/network";
const p=createPublicClient({chain:mezoTestnet,transport:http()});
const block=await p.getBlock();const [chainId,code,decimals,symbol]=await Promise.all([p.getChainId(),p.getCode({address:officialTestnetMusd,blockNumber:block.number}),p.readContract({address:officialTestnetMusd,abi:erc20Abi,functionName:"decimals",blockNumber:block.number}),p.readContract({address:officialTestnetMusd,abi:erc20Abi,functionName:"symbol",blockNumber:block.number})]);
if(chainId!==31611||!code||code==="0x"||decimals!==18)throw new Error("Mezo MUSD validation failed");
const record={checkedAt:new Date().toISOString(),scope:"read-only live testnet; no transaction sent",chainId,token:officialTestnetMusd,decimals,symbol,blockNumber:block.number.toString(),blockHash:block.hash,tokenCodeBytes:(code.length-2)/2,source:"https://github.com/mezo-org/musd/blob/b51f6cb8e0f048770e32cb6ab5d704785e0b75b1/solidity/artifacts/deployments/matsnet/MUSD.json",networkSource:"https://mezo.org/docs/developers/getting-started/"};
await mkdir("deployments",{recursive:true});await writeFile("deployments/testnet-token-verification.json",JSON.stringify(record,null,2));console.log(record);

