import { describe, expect, test } from 'vitest';
import { encodeFunctionData, erc20Abi, encodeDeployData } from 'viem';
import { treasuryAbi } from '../packages/mezo/src/treasury-abi';
import build from '../packages/mezo/src/treasury-build.json';
import { validateWorkspacePayload, validateDeploymentPayload } from '../apps/web/src/components/wallet-payload';
import { assertSetupWallet } from '../apps/web/src/components/setup-wallet';
const owner='0x1111111111111111111111111111111111111111', treasury='0x2222222222222222222222222222222222222222', token='0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503', other='0x3333333333333333333333333333333333333333';
const now=1700000000000;
const context={action:'approve',amount:'2',recipient:treasury,owner,treasury,token,now};
const approval=()=>({action:'approve',expiresAt:now+600000,transaction:{to:token,value:'0x0',chainId:31611,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[treasury,2n*10n**18n]})}});
describe('independent pre-sign payload checks',()=>{
 test('accepts exact approval and returns only allowlisted transaction fields',()=>{
  expect(validateWorkspacePayload(approval(),context).to).toBe(token); expect(validateWorkspacePayload(approval(),context).chainId).toBe('0x7b7b');
 });
 test('rejects changed spender, amount, selector, appended data, expired request and extra fields',()=>{
  for(const data of [encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[other,2n*10n**18n]}),encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[treasury,2n**256n-1n]}),encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[other,2n]}),approval().transaction.data+'00']){
   const r=approval();r.transaction.data=data as `0x${string}`;expect(()=>validateWorkspacePayload(r,context)).toThrow();
  }
  expect(()=>validateWorkspacePayload({...approval(),expiresAt:now},context)).toThrow();
  expect(()=>validateWorkspacePayload({...approval(),transaction:{...approval().transaction,authorizationList:[]}},context)).toThrow();
 });
 test('binds reserve recipient, amount, bill id and terms hash; binds pay/cancel to id',()=>{
  const bill={onchainId:('0x'+'11'.repeat(32)),termsHash:('0x'+'22'.repeat(32))};
  const r={action:'reserve',expiresAt:now+600000,transaction:{to:treasury,value:'0x0',chainId:31611,data:encodeFunctionData({abi:treasuryAbi,functionName:'reserve',args:[bill.onchainId as `0x${string}`,bill.termsHash as `0x${string}`,other,2n*10n**18n]})}};
  const c={...context,action:'reserve',recipient:other,bill};
  expect(validateWorkspacePayload(r,c).to).toBe(treasury);
  expect(()=>validateWorkspacePayload(r,{...c,bill:{...bill,termsHash:'0x'+'33'.repeat(32)}})).toThrow();
  for(const action of ['pay','cancel'] as const){const req={...r,action,transaction:{...r.transaction,data:encodeFunctionData({abi:treasuryAbi,functionName:action,args:[bill.onchainId as `0x${string}`]})}};expect(validateWorkspacePayload(req,{...c,action}).to).toBe(treasury);expect(()=>validateWorkspacePayload(req,{...c,action,bill:{...bill,onchainId:'0x'+'33'.repeat(32)}})).toThrow();}
 });
 test('only permits protected once methods and binds withdrawal to owner and amount',()=>{
  const id=('0x'+'44'.repeat(32)) as `0x${string}`,deadline=BigInt(now/1000+600);
  for(const action of ['deposit','withdraw'] as const){
   const data=action==='deposit'?encodeFunctionData({abi:treasuryAbi,functionName:'depositOnce',args:[id,2n*10n**18n,deadline]}):encodeFunctionData({abi:treasuryAbi,functionName:'withdrawOnce',args:[id,owner,2n*10n**18n,deadline]});
   const r={action,expiresAt:now+600000,transaction:{to:treasury,value:'0x0',chainId:31611,data}};
   expect(validateWorkspacePayload(r,{...context,action,recipient:action==='withdraw'?owner:treasury}).to).toBe(treasury);
   if(action==='withdraw')expect(()=>validateWorkspacePayload(r,{...context,action,owner:other,recipient:other})).toThrow();
  }
 });
 test('checks full deployment bytecode and immutable constructor arguments',()=>{
  const data=encodeDeployData({abi:treasuryAbi,bytecode:build.bytecode as `0x${string}`,args:[token,owner]});
  expect(validateDeploymentPayload({data,value:'0x0',chainId:31611},owner).data).toBe(data); expect(validateDeploymentPayload({data,value:'0x0',chainId:31611},owner).chainId).toBe('0x7b7b');
  expect(()=>validateDeploymentPayload({data:data+'00',value:'0x0',chainId:31611},owner)).toThrow();
  expect(()=>validateDeploymentPayload({data,value:'0x0',chainId:31611},other)).toThrow();
 });
 test('rejects wrong network or changed account immediately before sending',async()=>{
  const provider={request:async({method}:{method:string})=>method==='eth_chainId'?'0x1':[owner]};
  await expect(assertSetupWallet(provider,owner)).rejects.toThrow();
  await expect(assertSetupWallet({request:async({method})=>method==='eth_chainId'?'0x7b7b':[other]},owner)).rejects.toThrow();
  await expect(assertSetupWallet({request:async({method})=>method==='eth_chainId'?'0x7B7B':[owner]},owner)).resolves.toBeUndefined();
 });
});
