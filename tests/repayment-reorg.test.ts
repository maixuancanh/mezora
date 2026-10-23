import{beforeAll,describe,expect,test,vi}from"vitest";
vi.mock("../packages/mezo/src/network",async original=>({...await original<typeof import("../packages/mezo/src/network")>(),publicClient:()=>({getBlockNumber:async()=>100n,getBlock:async()=>({hash:"0x"+"b".repeat(64)}),getTransaction:async()=>{throw new Error("not found");},getTransactionReceipt:async()=>{throw new Error("not found");}})}));
import{createDatabase}from"../packages/db/src/database";import{reconcileRepayments}from"../apps/web/src/server/repayment";
test("persist pending when confirmed repayment disappears in reorg",async()=>{
 const db=await createDatabase("memory://"),owner="0x1111111111111111111111111111111111111111",body={id:"reorg",owner,amount:"1",amountBaseUnits:"1000000000000000000",nonce:1,data:"0x1234",createdAt:new Date().toISOString(),preparedBlock:"80",expiresAt:1,status:"confirmed",txHash:"0x"+"a".repeat(64),blockNumber:"90",blockHash:"0x"+"a".repeat(64)};
 await db.query("INSERT INTO repayments(id,owner,body,tx_hash) VALUES($1,$2,$3::jsonb,$4)",["reorg",owner,JSON.stringify(body),body.txHash]);
 await reconcileRepayments(db,owner);const r=await db.query<{body:any}>("SELECT body FROM repayments WHERE id='reorg'");
 expect(r.rows[0].body.status).toBe("pending");expect(r.rows[0].body.blockHash).toBeUndefined();await db.close();
});
