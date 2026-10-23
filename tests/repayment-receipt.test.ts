import{describe,test,expect}from"vitest";import{verifyRepaymentReceipt}from"../packages/mezo/src/repayment-receipt";import{encodeEventTopics,encodeAbiParameters,parseAbi}from"viem";
const owner="0x1111111111111111111111111111111111111111",to="0x2222222222222222222222222222222222222222",token="0x3333333333333333333333333333333333333333",hash="0x"+"4".repeat(64),data="0x12345678",blockHash="0x"+"5".repeat(64);
const abi=parseAbi(["event Transfer(address indexed from,address indexed to,uint256 value)"]);
const input={owner,to,token,data,nonce:3,amountBaseUnits:"250",tx:{from:owner,to,input:data,value:0n,nonce:3},receipt:{status:"success",blockHash,logs:[{address:token,topics:encodeEventTopics({abi,eventName:"Transfer",args:{from:owner as any,to:"0x0000000000000000000000000000000000000000"}}) as `0x${string}`[],data:encodeAbiParameters([{type:"uint256"}],[250n])}]},canonicalBlockHash:blockHash};
describe("owner repayment receipt binding",()=>{
 test("accepts exact owner nonce data and matching MUSD burn",()=>expect(verifyRepaymentReceipt(input)).toBe("confirmed"));
 test("rejects altered nonce and missing burn",()=>{expect(()=>verifyRepaymentReceipt({...input,nonce:4})).toThrow(/match/i);expect(()=>verifyRepaymentReceipt({...input,receipt:{...input.receipt,logs:[]}})).toThrow(/burn/i);});
 test("keeps reorg uncertain and identifies confirmed revert",()=>{expect(verifyRepaymentReceipt({...input,canonicalBlockHash:hash})).toBe("pending");expect(verifyRepaymentReceipt({...input,receipt:{...input.receipt,status:"reverted",logs:[]}})).toBe("reverted");});
});
