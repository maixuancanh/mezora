import{chainConfig}from"../../../../packages/mezo/src/network";
import{getTreasuryBinding}from"../../../../packages/db/src/treasury-bindings";
import type{Sql}from"../../../../packages/db/src/database";
export async function effectiveConfig(db:Sql,owner?:string|null){
 const fallback=chainConfig();if(!owner)return fallback;
 const address=await getTreasuryBinding(db,owner);return {...fallback,treasury:address||fallback.treasury};
}
export async function namespaceConfig(db:Sql,ns:string){return effectiveConfig(db,ns.startsWith("live:")?ns.slice(5):null);}
