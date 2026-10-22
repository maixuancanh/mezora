import { beforeAll, describe, expect, test } from "vitest";
import { createDatabase } from "../packages/db/src/database";
import { createBill, performDemoAction, snapshot, treasuryAction } from "../packages/db/src/workspace";
describe("persistent local scenario accounting",()=>{
 let db:Awaited<ReturnType<typeof createDatabase>>;
 beforeAll(async()=>{db=await createDatabase("memory://");});
 test("reserves and pays without inventing surplus, and blocks replay",async()=>{
  const ns="accounting"; await snapshot(db,ns,"demo");
  const bill=await createBill(db,ns,{vendor:"Studio",recipient:"0x1111111111111111111111111111111111111111",amount:"250",dueDate:"2026-10-25"});
  await performDemoAction(db,ns,bill.id,"verify"); await performDemoAction(db,ns,bill.id,"reserve");
  const before=await snapshot(db,ns,"demo");
  await performDemoAction(db,ns,bill.id,"pay"); const after=await snapshot(db,ns,"demo");
  expect(after.summary.available).toBe(before.summary.available);
  expect(after.summary.surplus).toBe(before.summary.surplus);
  await expect(performDemoAction(db,ns,bill.id,"pay")).rejects.toThrow();
 });
 test("two concurrent reserves cannot spend the same funds",async()=>{
  const ns="concurrent";await snapshot(db,ns,"demo");
  const a=await createBill(db,ns,{vendor:"A",recipient:"0x1111111111111111111111111111111111111111",amount:"800",dueDate:"2026-10-25"});
  const b=await createBill(db,ns,{vendor:"B",recipient:"0x2222222222222222222222222222222222222222",amount:"800",dueDate:"2026-10-25"});
  await performDemoAction(db,ns,a.id,"verify");await performDemoAction(db,ns,b.id,"verify");
  const r=await Promise.allSettled([performDemoAction(db,ns,a.id,"reserve"),performDemoAction(db,ns,b.id,"reserve")]);
  expect(r.filter(x=>x.status==="fulfilled")).toHaveLength(1);
 });
 test("namespaces isolate workspaces and prevent reserved withdrawal",async()=>{
  const one=await snapshot(db,"accounting","demo");const two=await snapshot(db,"empty","demo");
  expect(one.bills.length).toBe(1);expect(two.bills.length).toBe(0);
  await expect(treasuryAction(db,"concurrent","withdraw","201")).rejects.toThrow();
 });
});
