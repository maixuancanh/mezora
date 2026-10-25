import {it,expect} from 'vitest';
import {decodeFunctionData,zeroAddress,zeroHash,hashTypedData} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {acceptanceDigest,acceptanceSigner,acceptanceTreasury,unpauseTypedData,unpauseCall} from '../packages/mezo/src/v2-acceptance';
import {treasuryV2Abi} from '../packages/mezo/src/treasury-v2-abi';
const request={nonce:'123456',deadline:'2000000000',policyVersion:'2'};
it('pins every signed field to a zero-value unpause of the deployed testnet treasury',()=>{
 const typed=unpauseTypedData(request);
 expect(typed.domain).toEqual({name:'MezoraTreasuryV2',version:'2',chainId:31611,verifyingContract:acceptanceTreasury});
 expect(typed.message).toEqual({action:5,id:zeroHash,termsHash:zeroHash,payee:zeroAddress,amount:0n,nonce:123456n,deadline:2000000000n,policyVersion:2n});
 expect(acceptanceDigest(request)).toBe(hashTypedData(typed));
 for(const field of ['nonce','deadline','policyVersion'] as const)expect(acceptanceDigest({...request,[field]:String(BigInt(request[field])+1n)})).not.toBe(acceptanceDigest(request));
});
it('rejects malformed or out-of-range request numbers and noncanonical signatures',async()=>{
 for(const bad of ['-1','1.1','0x10','',String(2n**256n)])expect(()=>unpauseTypedData({...request,nonce:bad})).toThrow();
 for(const bad of ['0x','0x'+'00'.repeat(65),'0x'+'ff'.repeat(65)])await expect(acceptanceSigner(request,bad)).rejects.toThrow();
});
it('rejects a valid EIP712 signature from an unconfigured wallet',async()=>{
 const account=privateKeyToAccount('0x'+'11'.repeat(32) as `0x${string}`);
 const signature=await account.signTypedData(unpauseTypedData(request));
 await expect(acceptanceSigner(request,signature)).rejects.toThrow('configured owner or reviewer');
});
it('encodes the same fixed request and exactly one reviewer approval',()=>{
 const ownerSig=('0x'+'11'.repeat(65)) as `0x${string}`,reviewerSig=('0x'+'22'.repeat(65)) as `0x${string}`;
 const call=decodeFunctionData({abi:treasuryV2Abi,data:unpauseCall(request,ownerSig,reviewerSig)});
 expect(call.functionName).toBe('execute');
 expect(call.args).toEqual([unpauseTypedData(request).message,ownerSig,[reviewerSig]]);
});
