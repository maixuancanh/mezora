import { decide } from "../../../../packages/automation/src/decide";
import { money, show } from "../../../../packages/db/src/workspace";
import { keccak256, toHex } from "viem";
type Data={mode:"demo"|"live";summary:{balance:string;reserved:string;buffer:string};network:{treasuryAddress:string|null};blockNumber?:string;blockHash?:string|null;observedAt?:number};
export function withProposal<T extends Data>(data:T,workspaceId:string){
 const now=Math.floor(Date.now()/1000),isDemo=data.mode==="demo";
 const snapshot={workspaceId,chainId:31611,treasuryAddress:data.network.treasuryAddress||"0x0000000000000000000000000000000000000001",blockNumber:data.blockNumber||"0",blockHash:data.blockHash||keccak256(toHex(JSON.stringify(data.summary))),observedAt:data.observedAt||now,balanceBaseUnits:money(data.summary.balance).toString(),reservedBaseUnits:money(data.summary.reserved).toString()};
 const config={version:1,now,maxSnapshotAgeSeconds:120,proposalTtlSeconds:60,operatingBufferBaseUnits:money(data.summary.buffer).toString(),minimumSurplusBaseUnits:money("1").toString()};
 try{const p=decide(snapshot,config);return {...data,proposal:p?{...p,amount:show(BigInt(p.amountBaseUnits)),mode:isDemo?"demo":"live"}:null};}catch{return {...data,proposal:null};}
}
