import{decodeEventLog,parseAbi}from"viem";
const abi=parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
interface BoundReceipt{owner:string;to:string;token:string;data:string;nonce:number;amountBaseUnits:string;tx:{from:string;to:string|null;input:string;value:bigint;nonce:number};receipt:{status:string;blockHash:string;logs:readonly{address:string;data:string;topics:readonly string[]}[]};canonicalBlockHash:string|null}
export function verifyRepaymentReceipt(i:BoundReceipt):"pending"|"confirmed"|"reverted"{
 if(i.tx.from.toLowerCase()!==i.owner.toLowerCase()||i.tx.to?.toLowerCase()!==i.to.toLowerCase()||i.tx.input.toLowerCase()!==i.data.toLowerCase()||i.tx.nonce!==i.nonce||i.tx.value!==0n)throw new Error("Repayment transaction does not match the exact owner request.");
 if(i.receipt.blockHash!==i.canonicalBlockHash)return"pending";
 if(i.receipt.status==="reverted")return"reverted";
 if(i.receipt.status!=="success")return"pending";
 const burn=i.receipt.logs.some(log=>{
  if(log.address.toLowerCase()!==i.token.toLowerCase())return false;
  try{const e=decodeEventLog({abi,data:log.data as `0x${string}`,topics:log.topics as [`0x${string}`,...`0x${string}`[]]});return e.args.from.toLowerCase()===i.owner.toLowerCase()&&e.args.to==="0x0000000000000000000000000000000000000000"&&e.args.value===BigInt(i.amountBaseUnits);}catch{return false;}
 });if(!burn)throw new Error("Receipt has no exact MUSD repayment burn.");return"confirmed";
}
