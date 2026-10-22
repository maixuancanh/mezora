import{readFile,writeFile}from"node:fs/promises";import{request,expect}from"@playwright/test";import{createWalletClient,createPublicClient,http}from"viem";import{mnemonicToAccount}from"viem/accounts";import{mezoTestnet}from"../packages/mezo/src/network";
const cfg=JSON.parse(await readFile(".data/local-evm.json","utf8")),base="http://127.0.0.1:3211",account=mnemonicToAccount("test test test test test test test test test test test junk"),wallet=createWalletClient({account,chain:mezoTestnet,transport:http(cfg.rpc)}),p=createPublicClient({transport:http(cfg.rpc)}),api=await request.newContext({baseURL:base,extraHTTPHeaders:{origin:base}});
async function post(path:string,body:unknown){const r=await api.post(path,{data:body}),j=await r.json();if(!r.ok())throw new Error(JSON.stringify(j));return j;}
async function snap(){const r=await api.get("/api/workspace?mode=live"),j=await r.json();if(!r.ok())throw new Error(JSON.stringify(j));return j;}
const c=await(await api.get("/api/auth/challenge?address="+account.address)).json();await post("/api/auth/verify",{address:account.address,message:c.message,signature:await account.signMessage({message:c.message})});
const b=await post("/api/bills",{mode:"live",vendor:"Recovery vendor",recipient:"0x2222222222222222222222222222222222222222",amount:"25",dueDate:"2026-10-26"}),path="/api/bills/"+b.bill.id+"/actions";
await post(path,{mode:"live",action:"verify"});
async function lostSend(action:string){const r=await post(path,{mode:"live",action});const hash=await wallet.sendTransaction({to:r.transaction.to,data:r.transaction.data});await p.waitForTransactionReceipt({hash});return hash;} // intentionally no hash POST
const reservedHash=await lostSend("reserve");const reserved=await snap();expect(reserved.bills.find((x:any)=>x.id===b.bill.id).status).toBe("reserved");
const snapshotId=await p.request({method:"evm_snapshot" as any});
const paidHash=await lostSend("pay");const paid=await snap();expect(paid.bills.find((x:any)=>x.id===b.bill.id).status).toBe("paid");
await p.request({method:"evm_revert" as any,params:[snapshotId] as any});
const reverted=await snap();expect(reverted.bills.find((x:any)=>x.id===b.bill.id).status).toBe("payment_pending");expect(reverted.summary.reserved).toBe("25");
await writeFile("docs/recovery-evidence.json",JSON.stringify({checkedAt:new Date().toISOString(),scope:"local Anvil only",checks:["reserve hash-loss backfill","pay hash-loss backfill","previously settled payment becomes pending after chain reorg"],reservedHash,paidHash,afterReorg:reverted.summary},null,2));console.log("PASS lost-hash recovery and reorg",reverted.summary);await api.dispose();

