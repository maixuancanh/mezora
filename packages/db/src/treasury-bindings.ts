import{getAddress,isAddress}from"viem";import type{Database,Sql}from"./database";
export async function getTreasuryBinding(db:Sql,owner:string){if(!isAddress(owner))throw new Error("Invalid owner address.");const r=await db.query<{address:string}>("SELECT address FROM treasury_bindings WHERE owner=$1",[owner.toLowerCase()]);return r.rows[0]?.address||null;}
export async function saveTreasuryBinding(db:Database,owner:string,address:string,txHash?:string){
 if(!isAddress(owner)||!isAddress(address)||/^0x0{40}$/i.test(address))throw new Error("Invalid treasury binding.");
 const normalized=getAddress(address);return db.transaction(async q=>{
  await q.query("INSERT INTO treasury_bindings(owner,address,tx_hash) VALUES($1,$2,$3) ON CONFLICT(owner) DO NOTHING",[owner.toLowerCase(),normalized,txHash||null]);
  const existing=await getTreasuryBinding(q,owner);if(existing?.toLowerCase()!==normalized.toLowerCase())throw new Error("An owner treasury is already connected. Switching requires a separate workspace migration.");
  return normalized;
 });
}
