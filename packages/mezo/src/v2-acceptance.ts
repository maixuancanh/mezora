import {encodeFunctionData,hashTypedData,recoverTypedDataAddress,zeroAddress,zeroHash,type Hex} from 'viem';
import {treasuryV2Abi} from './treasury-v2-abi';
export const acceptanceTreasury='0x54bdde1c3be2e8fa178a55ae06700160846002ec' as const;
export const acceptanceOwner='0x2c7FFA7b22B5D75b390f7BCA5D75bE0475C85b31' as const;
export const acceptanceReviewer='0x018afE2Be696274bCb3A33B2FB1487F96f649bd6' as const;
export const requestTypes={Request:[{name:'action',type:'uint8'},{name:'id',type:'bytes32'},{name:'termsHash',type:'bytes32'},{name:'payee',type:'address'},{name:'amount',type:'uint256'},{name:'nonce',type:'uint256'},{name:'deadline',type:'uint256'},{name:'policyVersion',type:'uint256'}]} as const;
export interface UnpauseRequest {nonce:string;deadline:string;policyVersion:string}
export function unpauseTypedData(r:UnpauseRequest){
 for(const value of [r.nonce,r.deadline,r.policyVersion])if(!/^\d{1,78}$/.test(value)||BigInt(value)>=2n**256n)throw new Error('Invalid unsigned request field.');
 return {domain:{name:'MezoraTreasuryV2',version:'2',chainId:31611,verifyingContract:acceptanceTreasury},types:requestTypes,primaryType:'Request' as const,message:{action:5,id:zeroHash,termsHash:zeroHash,payee:zeroAddress,amount:0n,nonce:BigInt(r.nonce),deadline:BigInt(r.deadline),policyVersion:BigInt(r.policyVersion)}};
}
export function acceptanceDigest(r:UnpauseRequest){return hashTypedData(unpauseTypedData(r));}
export async function acceptanceSigner(r:UnpauseRequest,signature:unknown){
 if(typeof signature!=='string'||!/^0x[0-9a-f]{130}$/i.test(signature))throw new Error('A 65-byte EIP-712 signature is required.');
 const s=BigInt('0x'+signature.slice(66,130)),v=parseInt(signature.slice(130),16);if(![27,28].includes(v)||s===0n||s>0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0n)throw new Error('Noncanonical signature.');
 const signer=await recoverTypedDataAddress({...unpauseTypedData(r),signature:signature as Hex});if(![acceptanceOwner.toLowerCase(),acceptanceReviewer.toLowerCase()].includes(signer.toLowerCase()))throw new Error('Signature must come from the configured owner or reviewer.');return signer;
}
export function unpauseCall(r:UnpauseRequest,ownerSignature:Hex,reviewerSignature:Hex){return encodeFunctionData({abi:treasuryV2Abi,functionName:'execute',args:[unpauseTypedData(r).message,ownerSignature,[reviewerSignature]]});}
export const pauseCall=()=>encodeFunctionData({abi:treasuryV2Abi,functionName:'pause'});
