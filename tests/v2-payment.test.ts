import {it,expect} from 'vitest';
import {decodeFunctionData,hashTypedData,erc20Abi} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {paymentTypedData,paymentDigest,paymentSigner,paymentCall,fundingCall,paymentAmount,paymentId,paymentTermsHash} from '../packages/mezo/src/v2-payment';
import {acceptanceTreasury,acceptanceReviewer} from '../packages/mezo/src/v2-acceptance';
import {treasuryV2Abi} from '../packages/mezo/src/treasury-v2-abi';
const r={action:0 as const,nonce:'123',deadline:'2000000000',policyVersion:'2'};
it('pins a one-MUSD test bill, recipient and terms for separate reserve and pay approvals',()=>{
 const t=paymentTypedData(r);expect(t.message).toMatchObject({action:0,id:paymentId,termsHash:paymentTermsHash,payee:acceptanceReviewer,amount:10n**18n});expect(t.domain.verifyingContract).toBe(acceptanceTreasury);
 expect(paymentDigest(r)).toBe(hashTypedData(t));expect(paymentDigest({...r,action:1})).not.toBe(paymentDigest(r));
 expect(()=>paymentTypedData({...r,action:3} as never)).toThrow();
 for(const value of ['-1','1.2','0x10',String(2n**256n)])expect(()=>paymentTypedData({...r,nonce:value})).toThrow();
});
it('encodes only exact one-MUSD direct funding, never token approval',()=>{
 const d=decodeFunctionData({abi:erc20Abi,data:fundingCall()});expect(d.functionName).toBe('transfer');expect(String(d.args?.[0]).toLowerCase()).toBe(acceptanceTreasury);expect(d.args?.[1]).toBe(paymentAmount);
});
it('retains the exact fixed bill and both supplied approvals in execute calldata',()=>{
 const a=('0x'+'11'.repeat(65)) as `0x${string}`,b=('0x'+'22'.repeat(65)) as `0x${string}`;
 expect(decodeFunctionData({abi:treasuryV2Abi,data:paymentCall(r,a,b)}).args).toEqual([paymentTypedData(r).message,a,[b]]);
});
it('rejects a cryptographically valid signature from an unauthorized signer',async()=>{
 const a=privateKeyToAccount(('0x'+'11'.repeat(32)) as `0x${string}`),sig=await a.signTypedData(paymentTypedData(r));await expect(paymentSigner(r,sig)).rejects.toThrow('configured');
});
