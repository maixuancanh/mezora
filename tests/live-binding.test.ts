import {beforeAll,describe,test,expect,vi} from "vitest";
const c=vi.hoisted(()=>({getLogs:vi.fn(async()=>[]),getBlockNumber:vi.fn(async()=>110n),getBlock:vi.fn(async()=>({hash:"0x"+"a".repeat(64),timestamp:BigInt(Math.floor(Date.now()/1000)+1000),number:110n})),getTransaction:vi.fn(),getTransactionReceipt:vi.fn(),call:vi.fn(async()=>({})),readContract:vi.fn()}));
vi.mock("../packages/mezo/src/network",async(importOriginal)=>{
 const real=await importOriginal<typeof import("../packages/mezo/src/network")>();
 return {...real,publicClient:()=>c,chainConfig:()=>({token:"0x1111111111111111111111111111111111111111",treasury:"0x2222222222222222222222222222222222222222",chainId:31611,explorerUrl:"https://explorer.test.mezo.org"}),readTreasury:async()=>({token:"0x1111111111111111111111111111111111111111",treasury:"0x2222222222222222222222222222222222222222",balance:1000n*10n**18n,available:1000n*10n**18n,reserved:0n,gas:100n,owner:"0x3333333333333333333333333333333333333333",block:{number:110n,hash:"0x"+"a".repeat(64)}})};
});
import {createDatabase} from "../packages/db/src/database";
import {prepareTreasuryAction} from "../apps/web/src/server/live";
describe("live exact request binding",()=>{
 let db:Awaited<ReturnType<typeof createDatabase>>;
 beforeAll(async()=>{db=await createDatabase("memory://");});
 test("a prepared withdrawal100 cannot replace a reviewed withdrawal5",async()=>{
  await prepareTreasuryAction(db,"same-owner","0x3333333333333333333333333333333333333333","withdraw","100");
  await expect(prepareTreasuryAction(db,"same-owner","0x3333333333333333333333333333333333333333","withdraw","5")).rejects.toThrow(/different|conflict|pending/i);
 });
 test("repeat identical prepare preserves onchain request identity",async()=>{
  const a=await prepareTreasuryAction(db,"repeat","0x3333333333333333333333333333333333333333","withdraw","20");
  const b=await prepareTreasuryAction(db,"repeat","0x3333333333333333333333333333333333333333","withdraw","20");
  expect(a).toHaveProperty("transaction");expect((a as any).transaction.data).toBe((b as any).transaction.data);
  expect((a as any).review).toEqual({action:"withdraw",amount:"20",recipient:"0x3333333333333333333333333333333333333333",chainId:31611});
 });
 test("expired consumed withdrawal fails closed before new ID",async()=>{
  const a=await prepareTreasuryAction(db,"expired","0x3333333333333333333333333333333333333333","withdraw","20");
  await db.query("UPDATE intents SET body=jsonb_set(body,'{expiresAt}','1'::jsonb) WHERE id=$1",[(a as any).intentId]);
  c.readContract.mockResolvedValueOnce(true);
  await expect(prepareTreasuryAction(db,"expired","0x3333333333333333333333333333333333333333","withdraw","20")).rejects.toThrow(/Recover its transaction/i);
 });
});
