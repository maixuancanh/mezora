import { createPublicClient, http, defineChain, erc20Abi, getAddress, isAddress, encodeFunctionData } from "viem";
import { treasuryAbi } from "./treasury-abi";
export const officialTestnetMusd="0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503" as const;
export const mezoTestnet=defineChain({id:31611,name:"Mezo Testnet",nativeCurrency:{name:"Bitcoin",symbol:"BTC",decimals:18},rpcUrls:{default:{http:["https://rpc.test.mezo.org"]}},blockExplorers:{default:{name:"Mezo Explorer",url:"https://explorer.test.mezo.org"}}});
export function chainConfig(){
 const token=process.env.MUSD_ADDRESS||officialTestnetMusd;
 const treasury=process.env.MEZORA_TREASURY_ADDRESS;
 if(!isAddress(token))throw new Error("Invalid configured MUSD address.");
 if(treasury&&!isAddress(treasury))throw new Error("Invalid configured treasury address.");
 return {token:getAddress(token),treasury:treasury?getAddress(treasury):null,chainId:31611,explorerUrl:"https://explorer.test.mezo.org"};
}
export const publicClient=()=>createPublicClient({chain:mezoTestnet,transport:http(process.env.MEZO_RPC_URL||mezoTestnet.rpcUrls.default.http[0],{timeout:10000,retryCount:1})});
export async function readTreasury(owner?:string){
 const c=chainConfig();if(!c.treasury)throw new Error("Treasury not configured. Deploy your treasury on Mezo Testnet and set MEZORA_TREASURY_ADDRESS.");
 const p=publicClient();
 if(await p.getChainId()!==31611)throw new Error("RPC returned the wrong chain.");
 const block=await p.getBlock();const blockNumber=block.number;
 const [code,decimals,actualOwner,actualToken,balance,reserved,available,gas]=await Promise.all([
 p.getCode({address:c.treasury,blockNumber}),
 p.readContract({address:c.token,abi:erc20Abi,functionName:"decimals",blockNumber}),
 p.readContract({address:c.treasury,abi:treasuryAbi,functionName:"owner",blockNumber}),
 p.readContract({address:c.treasury,abi:treasuryAbi,functionName:"token",blockNumber}),
 p.readContract({address:c.token,abi:erc20Abi,functionName:"balanceOf",args:[c.treasury],blockNumber}),
 p.readContract({address:c.treasury,abi:treasuryAbi,functionName:"totalReserved",blockNumber}),
 p.readContract({address:c.treasury,abi:treasuryAbi,functionName:"availableBalance",blockNumber}),
 owner?p.getBalance({address:owner as `0x${string}`,blockNumber}):Promise.resolve(0n)]);
 if((await p.getBlock({blockNumber})).hash!==block.hash)throw new Error("Chain snapshot changed. Refresh before acting.");
 if(!code||code==="0x"||decimals!==18||actualToken.toLowerCase()!==c.token.toLowerCase())throw new Error("Treasury/token configuration failed onchain validation.");
 if(owner&&actualOwner.toLowerCase()!==owner.toLowerCase())throw new Error("Connected wallet does not own the configured treasury.");
 return {...c,balance,reserved,available,owner:actualOwner,block,gas};
}
export const treasuryData=(name:"deposit"|"withdraw"|"depositOnce"|"withdrawOnce"|"reserve"|"pay"|"cancel",args:unknown[])=>encodeFunctionData({abi:treasuryAbi,functionName:name,args:args as never});
export const approvalData=(treasury:`0x${string}`,amount:bigint)=>encodeFunctionData({abi:erc20Abi,functionName:"approve",args:[treasury,amount]});

