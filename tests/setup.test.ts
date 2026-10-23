import {beforeAll,describe,test,expect} from "vitest";
import {createDatabase} from "../packages/db/src/database";
import {getTreasuryBinding,saveTreasuryBinding} from "../packages/db/src/treasury-bindings";
import {matchesTreasuryRuntime} from "../packages/mezo/src/deployment";
import build from "../packages/mezo/src/treasury-build.json";
describe("owner treasury bindings",()=>{
 let db:Awaited<ReturnType<typeof createDatabase>>;const owner="0x1111111111111111111111111111111111111111",treasury="0x2222222222222222222222222222222222222222";
 beforeAll(async()=>{db=await createDatabase("memory://");});
 test("persists one treasury per owner and isolates wallets",async()=>{
  await saveTreasuryBinding(db,owner,treasury);
  expect(await getTreasuryBinding(db,owner)).toBe(treasury);
  expect(await getTreasuryBinding(db,"0x3333333333333333333333333333333333333333")).toBe(null);
  await saveTreasuryBinding(db,owner,treasury);
  await expect(saveTreasuryBinding(db,owner,"0x4444444444444444444444444444444444444444")).rejects.toThrow(/already/i);
 });
 test("runtime checks ignore only compiler-declared immutable locations",()=>{
  expect(matchesTreasuryRuntime(build.runtime)).toBe(true);
  const ref=Object.values(build.immutableReferences).flat()[0];
  const mutated=build.runtime.slice(0,2+ref.start*2)+"1".repeat(ref.length*2)+build.runtime.slice(2+(ref.start+ref.length)*2);
  expect(matchesTreasuryRuntime(mutated)).toBe(false);
  let consistent=build.runtime;for(const r of Object.values(build.immutableReferences)[0])consistent=consistent.slice(0,2+r.start*2)+"1".repeat(r.length*2)+consistent.slice(2+(r.start+r.length)*2);
  expect(matchesTreasuryRuntime(consistent)).toBe(true);
  expect(matchesTreasuryRuntime("0xff"+build.runtime.slice(4))).toBe(false);
  expect(matchesTreasuryRuntime("0x")).toBe(false);
 });
});
