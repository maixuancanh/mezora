import { PGlite } from "@electric-sql/pglite";
import pg from "pg";
import path from "node:path";
import { mkdir } from "node:fs/promises";
export interface Sql { query<T = Record<string,unknown>>(sql:string, params?:unknown[]):Promise<{rows:T[]}> }
export interface Database extends Sql { transaction<T>(fn:(sql:Sql)=>Promise<T>):Promise<T>;close():Promise<void> }
const schema = `
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
`;
export async function createDatabase(url?:string):Promise<Database>{
 if((process.env.VERCEL||process.env.NODE_ENV==="production")&&!url?.startsWith("postgres"))throw new Error("Hosted Mezora requires a dedicated PostgreSQL DATABASE_URL. Local PGlite cannot provide durable serverless storage.");
 if(url?.startsWith("postgres")){
  const pool=new pg.Pool({connectionString:url,max:5});
  const query:Sql["query"]=async(sql,params)=>{const r=await pool.query(sql,params);return {rows:r.rows}};
  const migration=await pool.connect();try{await migration.query("BEGIN");await migration.query("SELECT pg_advisory_xact_lock(73498121)");await migration.query(schema);await migration.query("COMMIT");}catch(error){await migration.query("ROLLBACK");throw error;}finally{migration.release();}
  return {query,close:()=>pool.end(),async transaction(fn){const c=await pool.connect();try{await c.query("BEGIN");const out=await fn({query:async(s,p)=>({rows:(await c.query(s,p)).rows})});await c.query("COMMIT");return out;}catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}}};
 }
 const dir=url==="memory://"?undefined:url||path.resolve(/*turbopackIgnore: true*/ process.env.MEZORA_DATA_DIR||path.join(process.cwd(),".data","mezora"));
 if(dir)await mkdir(dir,{recursive:true});
 const p=new PGlite(dir);await p.exec(schema);
 const query:Sql["query"]=async(sql,params)=>({rows:(await p.query(sql,params)).rows as never[]});
 return {query,close:()=>p.close(),transaction:fn=>p.transaction(tx=>fn({query:async(s,a)=>({rows:(await tx.query(s,a)).rows as never[]})}))};
}
const globalDb=globalThis as typeof globalThis & {mezoraDb?:Promise<Database>};
export const database=()=>globalDb.mezoraDb??=(createDatabase(process.env.DATABASE_URL));
