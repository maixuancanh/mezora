import {encodeDeployData,getAddress,isAddress,parseUnits,type Address,type Hex} from 'viem';
import {treasuryV2Abi} from './treasury-v2-abi';
import build from './treasury-v2-build.json';
import {officialTestnetMusd} from './network';
export interface V2Config {owner:Address;reviewers:Address[];quorum:number;maxSpend:string;minimumBuffer:string}
export function v2Config(input:unknown):V2Config{
 const v=input as V2Config;if(!v||!isAddress(v.owner)||!Array.isArray(v.reviewers)||!v.reviewers.length||v.reviewers.length>5||v.reviewers.some(a=>!isAddress(a)||a.toLowerCase()===v.owner.toLowerCase()||/^0x0{40}$/i.test(a))||new Set(v.reviewers.map(a=>a.toLowerCase())).size!==v.reviewers.length||!Number.isInteger(v.quorum)||v.quorum<1||v.quorum>v.reviewers.length)throw new Error('Choose a distinct owner and 1–5 reviewers with a valid quorum.');
 if(!isAddress(v.owner)||/^0x0{40}$/i.test(v.owner)||![v.maxSpend,v.minimumBuffer].every(n=>typeof n==='string'&&/^(0|[1-9][0-9]{0,40})(\.[0-9]{1,18})?$/.test(n))||parseUnits(v.maxSpend,18)<=0n)throw new Error('Enter a positive per-payment limit and nonnegative cash cushion.');
 return {owner:getAddress(v.owner),reviewers:v.reviewers.map(getAddress),quorum:v.quorum,maxSpend:v.maxSpend,minimumBuffer:v.minimumBuffer};
}
export function v2DeploymentData(input:V2Config){const c=v2Config(input);return encodeDeployData({abi:treasuryV2Abi,bytecode:build.bytecode as Hex,args:[officialTestnetMusd,c.owner,c.reviewers,BigInt(c.quorum),parseUnits(c.maxSpend,18),parseUnits(c.minimumBuffer,18)]});}
export function matchesV2Runtime(runtime:string){
 if(!/^0x[0-9a-f]+$/i.test(runtime)||runtime.length!==build.runtime.length)return false;
 const refs=Object.values(build.immutableReferences) as {start:number;length:number}[][];
 for(const group of refs){const first=runtime.slice(2+group[0].start*2,2+(group[0].start+group[0].length)*2).toLowerCase();if(group.some(r=>runtime.slice(2+r.start*2,2+(r.start+r.length)*2).toLowerCase()!==first))return false;}
 const mask=(source:string)=>{let out=source.toLowerCase();for(const r of refs.flat())out=out.slice(0,2+r.start*2)+'0'.repeat(r.length*2)+out.slice(2+(r.start+r.length)*2);return out;};return mask(runtime)===mask(build.runtime);
}
