import {readFile,writeFile} from "node:fs/promises";
import {request,expect} from "@playwright/test";
import {createWalletClient,createPublicClient,http,parseEther} from "viem";
import {mnemonicToAccount} from "viem/accounts";
import {mezoTestnet} from "../packages/mezo/src/network";
const URL="http://127.0.0.1:3211",cfg=JSON.parse(await readFile(".data/local-evm.json","utf8"));
const account=mnemonicToAccount("test test test test test test test test test test test junk");
const wallet=createWalletClient({account,chain:mezoTestnet,transport:http(cfg.rpc)}),p=createPublicClient({transport:http(cfg.rpc)});
const api=await request.newContext({baseURL:URL,extraHTTPHeaders:{origin:URL}});
async function post(path:string,body:unknown){const r=await api.post(path,{data:body});const j=await r.json();if(!r.ok())throw new Error(JSON.stringify(j));return j;}
async function snapshot(){const r=await api.get("/api/workspace?mode=live");const j=await r.json();if(!r.ok())throw new Error(JSON.stringify(j));return j;}
const challenge=await (await api.get("/api/auth/challenge?address="+account.address)).json();
await post("/api/auth/verify",{address:account.address,message:challenge.message,signature:await account.signMessage({message:challenge.message})});
const replay=await api.post("/api/auth/verify",{data:{address:account.address,message:challenge.message,signature:await account.signMessage({message:challenge.message})}});expect(replay.status()).toBe(400);
async function execute(path:string,body:unknown){const r=await post(path,body);if(!r.transaction)return r;
 const hash=await wallet.sendTransaction({to:r.transaction.to,data:r.transaction.data,value:BigInt(r.transaction.value||"0")});
 await post(path,{mode:"live",action:"broadcast",intentId:r.intentId,txHash:hash});
 await p.waitForTransactionReceipt({hash});await snapshot();return {...r,hash};
}
await execute("/api/treasury",{mode:"live",action:"deposit",amount:"1000"}); // approve first
await execute("/api/treasury",{mode:"live",action:"deposit",amount:"1000"});
const initial=await snapshot();expect(initial.summary.balance).toBe("1000");
const b=await post("/api/bills",{mode:"live",vendor:"Local EVM Vendor",recipient:"0x1111111111111111111111111111111111111111",amount:"250",dueDate:"2026-10-25"});
const path="/api/bills/"+b.bill.id+"/actions";
await execute(path,{mode:"live",action:"verify"});
await execute(path,{mode:"live",action:"reserve"});
const reserved=await snapshot();expect(reserved.summary.reserved).toBe("250");expect(reserved.summary.available).toBe("750");
await execute(path,{mode:"live",action:"pay"});
const paid=await snapshot();expect(paid.bills[0].status).toBe("paid");expect(paid.summary.balance).toBe("750");expect(paid.summary.available).toBe("750");
const dup=await api.post(path,{data:{mode:"live",action:"pay"}});expect(dup.status()).toBe(400);
const wd=await post("/api/treasury",{mode:"live",action:"withdraw",amount:"5"});
const changed=await api.post("/api/treasury",{data:{mode:"live",action:"withdraw",amount:"100"}});expect(changed.status()).toBe(400);
const first=await wallet.sendTransaction({to:wd.transaction.to,data:wd.transaction.data});
await post("/api/treasury",{mode:"live",action:"broadcast",intentId:wd.intentId,txHash:first});await p.waitForTransactionReceipt({hash:first});await snapshot();
let doubleBlocked=false;try{const h=await wallet.sendTransaction({to:wd.transaction.to,data:wd.transaction.data,gas:200000n});const rec=await p.waitForTransactionReceipt({hash:h});doubleBlocked=rec.status==="reverted";}catch{doubleBlocked=true;}expect(doubleBlocked).toBe(true);
const final=await snapshot();expect(final.summary.balance).toBe("745");
await writeFile("docs/local-evm-evidence.json",JSON.stringify({checkedAt:new Date().toISOString(),scope:"Anvil local EVM only, not Mezo testnet",chainId:31611,treasury:cfg.treasury,token:cfg.token,checks:["wallet signature login + replay rejection","MUSD approval + protected deposit","bill reserve/pay exact receipt","bill replay rejected","treasury changed amount conflict","protected withdrawal replay rejected","surplus conservation"],initial:initial.summary,reserved:reserved.summary,paid:paid.summary,final:final.summary,txHashes:final.activity.filter((a:any)=>a.txHash).map((a:any)=>a.txHash)},null,2));console.log("PASS local EVM API/signature/receipt integration",final.summary);await api.dispose();

