import {encodeFunctionData,erc20Abi,keccak256,toHex,hashTypedData,recoverTypedDataAddress,type Hex} from 'viem';
import {acceptanceTreasury,acceptanceOwner,acceptanceReviewer,unpauseTypedData,requestTypes,type UnpauseRequest} from './v2-acceptance';
import {treasuryV2Abi} from './treasury-v2-abi';
export const paymentAmount=10n**18n;
export const paymentReference='MEZORA-V2-TEST-PAYMENT-20261025-01';
export const paymentTerms='Mezora V2 test payment; reference '+paymentReference+'; 1 MUSD; recipient '+acceptanceReviewer.toLowerCase()+'; test assets only; not revenue.';
export const paymentId=keccak256(toHex(paymentReference));
export const paymentTermsHash=keccak256(toHex(paymentTerms));
export interface PaymentRequest extends UnpauseRequest {action:0|1}
export function paymentTypedData(r:PaymentRequest){
 if(r.action!==0&&r.action!==1)throw Error('Only Reserve or Pay is allowed.');
 const base=unpauseTypedData(r);return {...base,types:requestTypes,message:{...base.message,action:r.action,id:paymentId,termsHash:paymentTermsHash,payee:acceptanceReviewer,amount:paymentAmount}};
}
export const paymentDigest=(r:PaymentRequest)=>hashTypedData(paymentTypedData(r));
export async function paymentSigner(r:PaymentRequest,signature:unknown){
 if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw Error('A 65-byte EIP-712 signature is required.');
 const s=BigInt('0x'+signature.slice(66,130)),v=parseInt(signature.slice(130),16);if(![27,28].includes(v)||!s||s>0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n)throw Error('Noncanonical signature.');
 const signer=await recoverTypedDataAddress({...paymentTypedData(r),signature:signature as Hex});if(![acceptanceOwner.toLowerCase(),acceptanceReviewer.toLowerCase()].includes(signer.toLowerCase()))throw Error('Signature must come from a configured signer.');return signer;
}
export const paymentCall=(r:PaymentRequest,owner:Hex,reviewer:Hex)=>encodeFunctionData({abi:treasuryV2Abi,functionName:'execute',args:[paymentTypedData(r).message,owner,[reviewer]]});
// Direct MUSD transfer: no spending allowance. The transfer receipt is the funding proof.
export const fundingCall=()=>encodeFunctionData({abi:erc20Abi,functionName:'transfer',args:[acceptanceTreasury,paymentAmount]});
