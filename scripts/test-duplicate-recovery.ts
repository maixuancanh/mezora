import{readFile,writeFile}from"node:fs/promises";import{request,expect}from"@playwright/test";import{createWalletClient,createPublicClient,http}from"viem";import{mnemonicToAccount}from"viem/accounts";import{mezoTestnet}from"../packages/mezo/src/network";
const cfg=JSON.parse(await readFile(".data/local-evm.json","utf8")),base="http://127.0.0.1:3211",account=mnemonicToAccount("test test test test test test test test test test test junk"),wallet=createWalletClient({account,chain:mezoTestnet,transport:http(cfg.rpc)}),p=createPublicClient({transport:http(cfg.rpc)}),api=await request.newContext({baseURL:base,extraHTTPHeaders:{origin:base}});
async function post(path:string,body:unknown){const r=await api.post(path,{data:body}),j=await r.json();if(!r.ok())throw new Error(JSON.stringify(j));return j;}async function snap(){const r=await api.get("/api/workspace?mode=live"),j=await r.json();if(!r.ok())throw new Error(JSON.stringify(j));return j;}
const c=await(await api.get("/api/auth/challenge?address="+account.address)).json();await post("/api/auth/verify",{address:account.address,message:c.message,signature:await account.signMessage({message:c.message})});
const before=await snap(),r=await post("/api/treasury",{mode:"live",action:"withdraw",amount:"7"});
const first=await wallet.sendTransaction({to:r.transaction.to,data:r.transaction.data});expect((await p.waitForTransactionReceipt({hash:first})).status).toBe("success");
const duplicate=await wallet.sendTransaction({to:r.transaction.to,data:r.transaction.data,gas:200000n});expect((await p.waitForTransactionReceipt({hash:duplicate})).status).toBe("reverted");
await post("/api/treasury",{mode:"live",action:"broadcast",intentId:r.intentId,txHash:duplicate});await snap();const after=await snap();
expect(BigInt(after.summary.balance)).toBe(BigInt(before.summary.balance)-7n);
expect(after.activity.some((a:any)=>a.title==="Original successful transaction recovered"&&a.txHash===first)).toBe(true);
await writeFile("docs/duplicate-recovery-evidence.json",JSON.stringify({checkedAt:new Date().toISOString(),scope:"local Anvil only",check:"success hash lost + duplicate reverted hash posted -> recover original success",first,duplicate,before:before.summary,after:after.summary},null,2));console.log("PASS original success recovered after duplicate reverted",after.summary);await api.dispose();

