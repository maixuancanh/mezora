import type { Database } from "../database";
import {repaymentHandoffs} from "./006-repayment-handoffs";
import {cashPlanScenarios} from "./005-cash-plan-scenarios";
import { documents } from "./004-documents";
import { teamAndReceivables } from "./003-team-and-receivables";
import { businessOperations } from "./002-business-operations";
import { businessWorkbench } from "./001-business-workbench";

export interface Migration { version:number; name:string; sql:string }
// Baseline is intentionally the original additive schema. Existing JSON and IDs are untouched.
const baseline: Migration = {version:0,name:"original-treasury-schema",sql:`
CREATE TABLE IF NOT EXISTS workspaces (id text PRIMARY KEY, mode text NOT NULL, balance numeric(78,0) NOT NULL DEFAULT 0, buffer numeric(78,0) NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS bills (id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), body jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS bills_workspace ON bills(workspace_id);
CREATE TABLE IF NOT EXISTS activity (id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), body jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS intents (id text PRIMARY KEY, workspace_id text NOT NULL, entity_id text, action text NOT NULL, body jsonb NOT NULL, hash text UNIQUE);
CREATE TABLE IF NOT EXISTS challenges (id text PRIMARY KEY,address text NOT NULL,message text NOT NULL,expires_at bigint NOT NULL,used boolean NOT NULL DEFAULT false);
CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY,address text NOT NULL,expires_at bigint NOT NULL);
CREATE TABLE IF NOT EXISTS treasury_bindings(owner text PRIMARY KEY,address text NOT NULL UNIQUE,tx_hash text);
CREATE TABLE IF NOT EXISTS repayments(id text PRIMARY KEY,owner text NOT NULL,body jsonb NOT NULL,tx_hash text UNIQUE);
CREATE INDEX IF NOT EXISTS repayments_owner ON repayments(owner);
`};
export const migrations: readonly Migration[] = [baseline,businessWorkbench,businessOperations,teamAndReceivables,documents,cashPlanScenarios,repaymentHandoffs];

export async function runMigrations(db:Database, options:{postgres?:boolean;migrations?:readonly Migration[]}={}) {
 const pending = options.migrations ?? migrations;
 const versions = new Set<number>();
 for(const migration of pending) {
  if(!Number.isSafeInteger(migration.version)||migration.version<0||versions.has(migration.version))throw new Error("Invalid or duplicate migration version.");
  versions.add(migration.version);
 }
 await db.transaction(async q=>{
  // PostgreSQL locks before registry creation so concurrent cold starts cannot race DDL.
  if(options.postgres)await q.query("SELECT pg_advisory_xact_lock(73498121)");
  await q.query("CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,name text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())");
  const applied=new Map((await q.query<{version:number;name:string}>("SELECT version,name FROM schema_migrations")).rows.map(row=>[row.version,row.name]));
  for(const migration of [...pending].sort((a,b)=>a.version-b.version)) {
   const recorded=applied.get(migration.version);
   if(recorded!==undefined) {
    if(recorded!==migration.name)throw new Error(`Migration ${migration.version} does not match the recorded migration.`);
    continue;
   }
   // PGlite needs exec for scripts; pg query uses its simple-query protocol here.
   if(q.exec)await q.exec(migration.sql);else await q.query(migration.sql);
   await q.query("INSERT INTO schema_migrations(version,name) VALUES($1,$2)",[migration.version,migration.name]);
  }
 });
}
