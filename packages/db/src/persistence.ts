import { createHash, randomUUID } from "node:crypto";
import type { Database, Sql } from "./database";

export class VersionConflictError extends Error {
 readonly status=409;
 constructor(readonly currentVersion:number){super("The entity version changed. Refresh and review before retrying.");this.name="VersionConflictError";}
}
export function assertExpectedVersion(actual:number,expected:number) {
 if(!Number.isSafeInteger(expected)||expected<1)throw new Error("A positive expectedVersion is required.");
 if(actual!==expected)throw new VersionConflictError(actual);
}
export class IdempotencyConflictError extends Error {
 readonly status=409;
 constructor(){super("This idempotency key was already used for a different request.");this.name="IdempotencyConflictError";}
}
export interface AuditEvent {
 workspaceId:string;actorId:string;action:string;entityId:string;entityVersion?:number;details?:unknown;
}
/** Pass the same transaction Sql used for the business write. Do not include private document contents. */
export async function appendAuditEvent(q:Sql,event:AuditEvent) {
 const id=randomUUID();
 await q.query("INSERT INTO audit_events(id,workspace_id,actor_id,action,entity_id,entity_version,body) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)",
  [id,event.workspaceId,event.actorId,event.action,event.entityId,event.entityVersion??null,JSON.stringify(event.details??{})]);
 return id;
}
// Stable object key order makes HTTP retries equivalent without weakening array ordering.
function canonical(value:unknown):string {
 if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number"&&Number.isFinite(value))return JSON.stringify(value);
 if(Array.isArray(value))return `[${value.map(canonical).join(",")}]`;
 if(typeof value==="object"&&Object.getPrototypeOf(value)===Object.prototype) {
  return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(",")}}`;
 }
 throw new Error("Mutation data must be JSON-safe; encode base units as strings.");
}
export interface IdempotentMutation extends AuditEvent {idempotencyKey:string;request:unknown}
/** Authorization must run before this helper. Check entity version under a row lock inside mutate. */
export async function withIdempotentMutation<T>(db:Database,input:IdempotentMutation,mutate:(q:Sql)=>Promise<T>):Promise<T> {
 if(!input.idempotencyKey?.trim()||input.idempotencyKey.length>200)throw new Error("An idempotency key of 1–200 characters is required.");
 const hash=createHash("sha256").update(canonical({actorId:input.actorId,entityId:input.entityId,entityVersion:input.entityVersion??null,request:input.request})).digest("hex");
 return db.transaction(async q=>{
  const params=[input.workspaceId,input.action,input.idempotencyKey];
  await q.query("INSERT INTO mutation_idempotency(workspace_id,action,idempotency_key,request_hash) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[...params,hash]);
  const row=(await q.query<{request_hash:string;response:T;completed_at:unknown}>("SELECT request_hash,response,completed_at FROM mutation_idempotency WHERE workspace_id=$1 AND action=$2 AND idempotency_key=$3 FOR UPDATE",params)).rows[0];
  if(row.request_hash!==hash)throw new IdempotencyConflictError();
  if(row.completed_at!==null)return row.response;
  const result=await mutate(q);
  const serialized=canonical(result);
  await appendAuditEvent(q,input);
  await q.query("UPDATE mutation_idempotency SET response=$4::jsonb,completed_at=now() WHERE workspace_id=$1 AND action=$2 AND idempotency_key=$3",[...params,serialized]);
  return result;
 });
}
