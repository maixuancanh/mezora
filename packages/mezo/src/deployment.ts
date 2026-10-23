import{encodeDeployData,isAddress,getAddress,keccak256,type Address}from"viem";
import build from"./treasury-build.json";
import{treasuryAbi}from"./treasury-abi";import{publicClient,chainConfig}from"./network";
export function deploymentData(owner:Address,token=chainConfig().token){return encodeDeployData({abi:treasuryAbi,bytecode:build.bytecode as `0x${string}`,args:[token,owner]});}
export function matchesTreasuryRuntime(runtime:string){
 if(!/^0x[0-9a-fA-F]+$/.test(runtime)||runtime.length!==build.runtime.length)return false;
 for(const refs of Object.values(build.immutableReferences)){
  const first=runtime.slice(2+refs[0].start*2,2+(refs[0].start+refs[0].length)*2).toLowerCase();
  if(refs.some(r=>runtime.slice(2+r.start*2,2+(r.start+r.length)*2).toLowerCase()!==first))return false;
 }
 const mask=(source:string)=>{let out=source.toLowerCase();for(const ref of Object.values(build.immutableReferences).flat()){out=out.slice(0,2+ref.start*2)+"0".repeat(ref.length*2)+out.slice(2+(ref.start+ref.length)*2);}return out;};
 return mask(runtime)===mask(build.runtime);
}
export async function verifyTreasury(address:string,owner:string){
 if(!isAddress(address)||!isAddress(owner))throw new Error("Invalid treasury or owner address.");
 const p=publicClient(),c=chainConfig(),at=await p.getBlock();if(await p.getChainId()!==31611)throw new Error("Wrong RPC chain.");
 const [code,actualOwner,token]=await Promise.all([p.getCode({address,blockNumber:at.number}),p.readContract({address,abi:treasuryAbi,functionName:"owner",blockNumber:at.number}),p.readContract({address,abi:treasuryAbi,functionName:"token",blockNumber:at.number})]);
 if(!code||!matchesTreasuryRuntime(code))throw new Error("Treasury bytecode does not match this Mezora build.");
 if(actualOwner.toLowerCase()!==owner.toLowerCase()||token.toLowerCase()!==c.token.toLowerCase())throw new Error("Treasury owner or MUSD token does not match.");
 if((await p.getBlock({blockNumber:at.number})).hash!==at.hash)throw new Error("Chain snapshot changed; retry verification.");
 return {address:getAddress(address),owner:getAddress(owner),token:c.token,codeHash:keccak256(code),blockNumber:at.number.toString(),blockHash:at.hash};
}
