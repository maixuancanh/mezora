import { afterEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { createDatabase, type Database, type Sql } from "../database";
import { runMigrations } from "./runner";
import { appendAuditEvent, assertExpectedVersion, withIdempotentMutation } from "../persistence";

const opened: Database[] = [];
afterEach(async () => { await Promise.all(opened.splice(0).map(db => db.close())); });
async function db() { const value = await createDatabase("memory://"); opened.push(value); return value; }
async function workspace(database: Database) {
  await database.query("INSERT INTO workspaces(id,mode) VALUES('owner','live')");
}
const mutation = {workspaceId:"owner",actorId:"wallet",action:"example.create",entityId:"example",idempotencyKey:"retry-key",request:{amount:"10"}};

describe("workbench foundation", () => {
  it("records baseline once and preserves legacy private rows on repeated startup", async () => {
    const p = new PGlite();
    const adapter: Database = {query: async (s,a) => ({rows:(await p.query(s,a)).rows as never[]}), transaction: fn => p.transaction(tx => fn({query:async(s,a)=>({rows:(await tx.query(s,a)).rows as never[]}),exec:s=>tx.exec(s)})),close:()=>p.close()};
    opened.push(adapter);
    await adapter.query("CREATE TABLE workspaces(id text PRIMARY KEY, mode text NOT NULL, balance numeric(78,0) DEFAULT 0 NOT NULL, buffer numeric(78,0) DEFAULT 0 NOT NULL)");
    await adapter.query("INSERT INTO workspaces(id,mode) VALUES('enzo','live')");
    await adapter.query("CREATE TABLE bills(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES workspaces(id),body jsonb NOT NULL)");
    const legacy = {id:"old",status:"paid",txHash:"0xreceipt",privateMemo:"private"};
    await adapter.query("INSERT INTO bills VALUES('old','enzo',$1::jsonb)",[JSON.stringify(legacy)]);
    await runMigrations(adapter);
    await adapter.query("INSERT INTO sessions VALUES('session','owner-wallet',123)");
    await runMigrations(adapter);
    expect((await adapter.query<{body:unknown}>("SELECT body FROM bills")).rows[0].body).toEqual(legacy);
    expect((await adapter.query("SELECT * FROM sessions")).rows).toHaveLength(1);
    expect((await adapter.query("SELECT version FROM schema_migrations ORDER BY version")).rows).toEqual([{version:0},{version:1},{version:2},{version:3},{version:4},{version:5},{version:6}]);
  });

  it("rolls back a failed migration and can retry cleanly", async () => {
    const database = await db();
    await expect(runMigrations(database,{migrations:[{version:99,name:"broken",sql:"CREATE TABLE rollback_probe(id text); SELECT * FROM missing_migration_table;"}]})).rejects.toThrow();
    expect((await database.query("SELECT to_regclass('rollback_probe') AS name")).rows).toEqual([{name:null}]);
    expect((await database.query("SELECT * FROM schema_migrations WHERE version=99")).rows).toHaveLength(0);
    await runMigrations(database,{migrations:[{version:99,name:"fixed",sql:"CREATE TABLE rollback_probe(id text);"}]});
    expect((await database.query("SELECT * FROM schema_migrations WHERE version=99")).rows).toHaveLength(1);
  });

  it("takes the PostgreSQL transaction lock before registry access and rejects registry drift", async () => {
    const statements:string[]=[];
    let inTransaction=false;
    const adapter:Database={
      query:async()=>{throw new Error("Migration escaped transaction");},close:async()=>{},
      transaction:async fn=>{inTransaction=true;try{return await fn({query:async <T>(sql:string)=>{
        expect(inTransaction).toBe(true);statements.push(sql);
        return {rows:(sql==="SELECT version,name FROM schema_migrations"?[{version:99,name:"original"}]:[]) as T[]};
      }});}finally{inTransaction=false;}},
    };
    await expect(runMigrations(adapter,{postgres:true,migrations:[{version:99,name:"renamed",sql:"SELECT 1"}]})).rejects.toThrow(/does not match/);
    expect(statements[0]).toBe("SELECT pg_advisory_xact_lock(73498121)");
    expect(statements[1]).toMatch(/^CREATE TABLE IF NOT EXISTS schema_migrations/);
    expect(statements).not.toContain("SELECT 1");
  });

  it("replays one committed mutation and audit event under concurrent retries", async () => {
    const database = await db(); await workspace(database);
    let calls = 0;
    const change = async (q: Sql) => { calls++; await q.query("UPDATE workspaces SET balance=balance+10 WHERE id='owner'"); return {id:"created",version:1}; };
    const results = await Promise.all([withIdempotentMutation(database,mutation,change),withIdempotentMutation(database,mutation,change)]);
    expect(results).toEqual([{id:"created",version:1},{id:"created",version:1}]);
    expect(calls).toBe(1);
    expect((await database.query("SELECT balance::text AS balance FROM workspaces")).rows).toEqual([{balance:"10"}]);
    expect((await database.query("SELECT * FROM audit_events")).rows).toHaveLength(1);
  });

  it("rejects key reuse with changed request, actor or entity", async () => {
    const database = await db(); await workspace(database);
    await withIdempotentMutation(database,mutation,async()=>({ok:true}));
    for (const change of [{request:{amount:"20"}},{actorId:"other"},{entityId:"other"}]) {
      await expect(withIdempotentMutation(database,{...mutation,...change},async()=>({ok:true}))).rejects.toThrow(/idempotency/i);
    }
  });

  it("treats reordered JSON object keys as the same retry and keeps workspace scope isolated", async () => {
    const database = await db();await workspace(database);
    await database.query("INSERT INTO workspaces(id,mode) VALUES('other','live')");
    const first={...mutation,request:{amount:"10",currency:"MUSD"}};
    await withIdempotentMutation(database,first,async()=>({id:"first"}));
    await expect(withIdempotentMutation(database,{...first,request:{currency:"MUSD",amount:"10"}},async()=>{throw new Error("must replay");})).resolves.toEqual({id:"first"});
    await expect(withIdempotentMutation(database,{...first,workspaceId:"other"},async()=>({id:"second"}))).resolves.toEqual({id:"second"});
    expect((await database.query("SELECT * FROM audit_events")).rows).toHaveLength(2);
  });

  it("rolls back mutation, idempotency claim and audit together", async () => {
    const database = await db(); await workspace(database);
    await expect(withIdempotentMutation(database,mutation,async q=>{
      await q.query("UPDATE workspaces SET balance=100 WHERE id='owner'");
      await appendAuditEvent(q,{workspaceId:"owner",actorId:"wallet",action:"attempt",entityId:"example"});
      throw new Error("operation failed");
    })).rejects.toThrow("operation failed");
    expect((await database.query("SELECT balance::text AS balance FROM workspaces")).rows).toEqual([{balance:"0"}]);
    expect((await database.query("SELECT * FROM audit_events")).rows).toHaveLength(0);
    expect((await database.query("SELECT * FROM mutation_idempotency")).rows).toHaveLength(0);
    await expect(withIdempotentMutation(database,mutation,async()=>({retried:true}))).resolves.toEqual({retried:true});
  });

  it("enforces optimistic version conflicts and append-only audit rows", async () => {
    const database = await db(); await workspace(database);
    expect(()=>assertExpectedVersion(2,1)).toThrow(/version/i);
    expect(()=>assertExpectedVersion(2,2)).not.toThrow();
    await database.transaction(q=>appendAuditEvent(q,{workspaceId:"owner",actorId:"wallet",action:"created",entityId:"example",entityVersion:1}));
    await expect(database.query("UPDATE audit_events SET action='changed'")).rejects.toThrow(/append.only/i);
    await expect(database.query("DELETE FROM audit_events")).rejects.toThrow(/append.only/i);
  });
});
