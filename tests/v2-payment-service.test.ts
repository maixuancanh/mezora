import {it,expect,vi,beforeEach} from 'vitest';
import {encodeAbiParameters,encodeEventTopics,erc20Abi} from 'viem';
const m=vi.hoisted(()=>({readContract:vi.fn(),call:vi.fn(),getBlock:vi.fn(),query:vi.fn(),audit:vi.fn(),state:vi.fn(),simulateContract:vi.fn(),getTransactionReceipt:vi.fn(),getTransaction:vi.fn(),getBlockNumber:vi.fn(),getChainId:vi.fn()}));
vi.mock('../packages/mezo/src/network',async original=>({...await original<object>(),publicClient:()=>m}));
vi.mock('../apps/web/src/server/v2-acceptance',()=>({v2State:m.state}));
vi.mock('../packages/db/src/database',()=>({database:async()=>({query:m.query,transaction:async(fn:(q:unknown)=>unknown)=>fn({query:m.query})})}));
vi.mock('../packages/db/src/workspace',()=>({ensureWorkspace:vi.fn()}));vi.mock('../packages/db/src/persistence',()=>({appendAuditEvent:m.audit}));
// Signature cryptography is exercised by v2-payment.test.ts. These fixtures isolate receipt validation.
vi.mock('../packages/mezo/src/v2-payment',async original=>({...await original<object>(),paymentSigner:async(_r:unknown,s:string)=>s===('0x'+'11'.repeat(65))?'0x2c7FFA7b22B5D75b390f7BCA5D75bE0475C85b31':'0x018afE2Be696274bCb3A33B2FB1487F96f649bd6'}));
import {paymentAction,paymentState,paymentReceipts} from '../apps/web/src/server/v2-payment';
import {acceptanceOwner,acceptanceReviewer} from '../packages/mezo/src/v2-acceptance';
import {paymentAmount,paymentTermsHash,paymentDigest,type PaymentRequest} from '../packages/mezo/src/v2-payment';
import {fundingCall,paymentId,paymentCall} from '../packages/mezo/src/v2-payment';
import {treasuryV2Abi} from '../packages/mezo/src/treasury-v2-abi';
import {acceptanceTreasury} from '../packages/mezo/src/v2-acceptance';
import {officialTestnetMusd} from '../packages/mezo/src/network';
const request:PaymentRequest={action:0,nonce:'123',deadline:'2000',policyVersion:'2'},id='11111111-1111-4111-8111-111111111111';
beforeEach(()=>{vi.clearAllMocks();m.state.mockResolvedValue({paused:false,policyVersion:'2',timestamp:1000,blockNumber:'100'});m.getBlock.mockResolvedValue({hash:'0xabc'});m.query.mockResolvedValue({rows:[]});m.readContract.mockImplementation(async({functionName}:{functionName:string})=>functionName==='commitments'?['0x'+'0'.repeat(64),acceptanceReviewer,0n,0]:functionName==='balanceOf'?paymentAmount:functionName==='consumedNonces'?false:0n);});
it('requires owner authentication for funding, review creation and execution',async()=>{
 for(const action of ['fund','create','execute'])await expect(paymentAction({action,id},null)).rejects.toThrow('owner');expect(m.call).not.toHaveBeenCalled();expect(m.audit).not.toHaveBeenCalled();
});
it('does not offer another funding transaction when enough test MUSD is already present',async()=>{
 await expect(paymentAction({action:'fund'},acceptanceOwner)).rejects.toThrow('already funded');expect(m.call).not.toHaveBeenCalled();
});
it('will not create reserve approval without enough funds, or while paused',async()=>{
 m.readContract.mockImplementation(async({functionName}:{functionName:string})=>functionName==='commitments'?['0x'+'0'.repeat(64),acceptanceReviewer,0n,0]:0n);await expect(paymentAction({action:'create'},acceptanceOwner)).rejects.toThrow();m.state.mockResolvedValue({paused:true,policyVersion:'2',timestamp:1000,blockNumber:'100'});await expect(paymentAction({action:'create'},acceptanceOwner)).rejects.toThrow('paused');expect(m.audit).not.toHaveBeenCalled();
});
it('refuses a reserved commitment whose terms differ from the test bill',async()=>{
 m.readContract.mockImplementation(async({functionName}:{functionName:string})=>functionName==='commitments'?['0x'+'f'.repeat(64),acceptanceReviewer,paymentAmount,1]:paymentAmount);await expect(paymentState()).rejects.toThrow('commitment');
});
it('requires two signatures before any execute simulation or payload',async()=>{
 m.query.mockImplementation(async(sql:string)=>({rows:sql.includes("action='v2.payment.prepare'")?[{body:{id,request,digest:paymentDigest(request)}}]:[]}));await expect(paymentAction({action:'execute',id},acceptanceOwner)).rejects.toThrow('Both');expect(m.simulateContract).not.toHaveBeenCalled();
});
it('rejects already consumed or expired reviews before accepting a signature',async()=>{
 m.query.mockImplementation(async(sql:string)=>({rows:sql.includes("action='v2.payment.prepare'")?[{body:{id,request:{...request,deadline:'999'}}}]:[]}));await expect(paymentAction({action:'sign',id,signature:'0x'},null)).rejects.toThrow();expect(m.audit).not.toHaveBeenCalled();
});
const hash='0x'+'a'.repeat(64),blockHash='0x'+'b'.repeat(64);
function fundingReceipt(){
 m.getChainId.mockResolvedValue(31611);m.getBlockNumber.mockResolvedValue(101n);m.getBlock.mockResolvedValue({hash:blockHash});m.getTransaction.mockResolvedValue({from:acceptanceOwner,to:officialTestnetMusd,value:0n,input:fundingCall()});
 m.getTransactionReceipt.mockResolvedValue({status:'success',blockNumber:100n,blockHash,logs:[{address:officialTestnetMusd,logIndex:0,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:acceptanceOwner,to:acceptanceTreasury}}),data:encodeAbiParameters([{type:'uint256'}],[paymentAmount])}]});
}
it('records exact direct funding only after canonical two-confirmation receipt and token transfer',async()=>{
 fundingReceipt();expect(await paymentAction({action:'verify-fund',txHash:hash},null)).toMatchObject({status:'confirmed',kind:'funding',amount:'1',recipient:acceptanceTreasury});expect(m.audit).toHaveBeenCalledOnce();
});
it('does not confirm a reorged or insufficiently confirmed funding receipt',async()=>{
 fundingReceipt();m.getBlock.mockResolvedValueOnce({hash:'0xwrong'});expect(await paymentAction({action:'verify-fund',txHash:hash},null)).toEqual({status:'pending'});m.getBlockNumber.mockResolvedValue(100n);expect(await paymentAction({action:'verify-fund',txHash:hash},null)).toEqual({status:'pending'});expect(m.audit).not.toHaveBeenCalled();
});
it('rejects a different sender, calldata, or transfer-log amount',async()=>{
 fundingReceipt();m.getTransaction.mockResolvedValueOnce({from:acceptanceReviewer,to:officialTestnetMusd,value:0n,input:fundingCall()});await expect(paymentAction({action:'verify-fund',txHash:hash},null)).rejects.toThrow('does not match');
 m.getTransactionReceipt.mockResolvedValue({status:'success',blockNumber:100n,blockHash,logs:[]});await expect(paymentAction({action:'verify-fund',txHash:hash},null)).rejects.toThrow('transfer log');expect(m.audit).not.toHaveBeenCalled();
});
function outgoingReceipt(action:0|1){
 fundingReceipt();const r={...request,action},ownerSignature=('0x'+'11'.repeat(65)) as `0x${string}`,reviewerSignature=('0x'+'22'.repeat(65)) as `0x${string}`;
 m.query.mockImplementation(async(sql:string)=>({rows:sql.includes("action='v2.payment.prepare'")?[{body:{id,request:r,digest:paymentDigest(r),ownerSignature,reviewerSignature}}]:[]}));
 m.getTransaction.mockResolvedValue({from:acceptanceOwner,to:acceptanceTreasury,value:0n,input:paymentCall(r,ownerSignature,reviewerSignature)});
 const actionLog={address:acceptanceTreasury,logIndex:1,topics:encodeEventTopics({abi:treasuryV2Abi,eventName:'ActionExecuted',args:{action,nonce:123n,id:paymentId}}),data:encodeAbiParameters([{type:'bytes32'},{type:'address'},{type:'uint256'},{type:'uint256'}],[paymentTermsHash,acceptanceReviewer,paymentAmount,2n])};
 const transfer={address:officialTestnetMusd,logIndex:0,topics:encodeEventTopics({abi:erc20Abi,eventName:'Transfer',args:{from:acceptanceTreasury,to:acceptanceReviewer}}),data:encodeAbiParameters([{type:'uint256'}],[paymentAmount])};
 m.getTransactionReceipt.mockResolvedValue({status:'success',blockNumber:100n,blockHash,logs:action===0?[actionLog]:[transfer,actionLog]});
 m.readContract.mockImplementation(async({functionName}:{functionName:string})=>functionName==='commitments'?[paymentTermsHash,acceptanceReviewer,paymentAmount,action===0?1:2]:true);
}
it('confirms reserve and pay only against their exact event, nonce and commitment state',async()=>{
 for(const action of [0,1] as const){outgoingReceipt(action);expect(await paymentAction({action:'verify',id,txHash:hash},null)).toMatchObject({status:'confirmed',kind:action===0?'reserve':'payment',nonceConsumed:true});}
});
it('does not confirm payment without its token transfer or correct paid commitment',async()=>{
 outgoingReceipt(1);const receipt=await m.getTransactionReceipt();m.getTransactionReceipt.mockResolvedValue({...receipt,logs:receipt.logs.slice(1)});await expect(paymentAction({action:'verify',id,txHash:hash},null)).rejects.toThrow('transfer log');
 outgoingReceipt(1);m.readContract.mockResolvedValue(false);await expect(paymentAction({action:'verify',id,txHash:hash},null)).rejects.toThrow('commitment or nonce');
});
it('restores canonical verified receipts on reload without relying on wallet localStorage',async()=>{
 m.query.mockResolvedValue({rows:[{body:{status:'confirmed',kind:'payment',txHash:hash,blockNumber:'100',blockHash,amount:'1',treasury:acceptanceTreasury,token:officialTestnetMusd,recipient:acceptanceReviewer}}]});m.getBlock.mockResolvedValue({hash:blockHash});
 expect(await paymentReceipts({query:m.query} as never)).toMatchObject({payment:{txHash:hash,amount:'1'}});
 m.getBlock.mockResolvedValue({hash:'0xchanged'});expect(await paymentReceipts({query:m.query} as never)).toEqual({});
});
