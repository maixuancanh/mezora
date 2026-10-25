import {it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({getChainId:vi.fn(),getBlock:vi.fn(),getCode:vi.fn(),readContract:vi.fn(),call:vi.fn(),query:vi.fn(),audit:vi.fn()}));
vi.mock('../packages/mezo/src/network',async original=>({...await original<object>(),publicClient:()=>mock}));
vi.mock('../packages/db/src/database',()=>({database:async()=>({query:mock.query,transaction:async(fn:(q:unknown)=>unknown)=>fn({query:mock.query})})}));
vi.mock('../packages/db/src/workspace',()=>({ensureWorkspace:vi.fn()}));
vi.mock('../packages/db/src/persistence',()=>({appendAuditEvent:mock.audit}));
import {acceptanceAction,v2State} from '../apps/web/src/server/v2-acceptance';
import {acceptanceOwner,acceptanceReviewer,acceptanceDigest} from '../packages/mezo/src/v2-acceptance';
import {officialTestnetMusd} from '../packages/mezo/src/network';
import build from '../packages/mezo/src/treasury-v2-build.json';
const id='11111111-1111-4111-8111-111111111111',request={nonce:'123',deadline:'2000',policyVersion:'2'};
beforeEach(()=>{vi.clearAllMocks();mock.getChainId.mockResolvedValue(31611);mock.getBlock.mockResolvedValue({number:100n,timestamp:1000n,hash:'0xabc'});mock.getCode.mockResolvedValue(build.runtime);mock.readContract.mockImplementation(async({functionName}:{functionName:string})=>({owner:acceptanceOwner,token:officialTestnetMusd,reviewers:acceptanceReviewer,quorum:1n,paused:true,policyVersion:2n,consumedNonces:false})[functionName as 'owner']);mock.query.mockResolvedValue({rows:[]});});
it('requires authenticated owner before preparing or executing owner operations',async()=>{
 for(const action of ['pause','create','execute'])await expect(acceptanceAction({action,id},null)).rejects.toThrow();
 expect(mock.call).not.toHaveBeenCalled();expect(mock.audit).not.toHaveBeenCalled();
});
it('prepares a durable zero-value review using current chain policy and time',async()=>{
 const result=await acceptanceAction({action:'create'},acceptanceOwner) as {request:typeof request;digest:string};
 expect(result.request.deadline).toBe('2800');expect(result.request.policyVersion).toBe('2');expect(result.digest).toBe(acceptanceDigest(result.request));expect(mock.audit).toHaveBeenCalledOnce();
 expect(mock.query.mock.calls.every(([sql])=>!String(sql).includes('treasury_bindings'))).toBe(true);
});
it('fails closed for a different chain or signer configuration',async()=>{
 mock.getChainId.mockResolvedValueOnce(1);await expect(v2State()).rejects.toThrow('Wrong RPC chain');
 mock.readContract.mockResolvedValue('0x0000000000000000000000000000000000000001');await expect(v2State()).rejects.toThrow('mismatch');
});
it('will not execute a review without both verified signatures',async()=>{
 mock.query.mockImplementation(async(sql:string)=>({rows:sql.includes('v2.unpause.prepare')?[{body:{id,request,digest:acceptanceDigest(request)}}]:[]}));
 await expect(acceptanceAction({action:'execute',id},acceptanceOwner)).rejects.toThrow('Both owner and reviewer');
 expect(mock.call).not.toHaveBeenCalled();expect(mock.audit).not.toHaveBeenCalled();
});
