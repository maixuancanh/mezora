import pg from 'pg';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

// Invoke with Node --env-file=<private file>. Never print connection strings or row contents.
if(!process.env.DATABASE_URL?.startsWith('postgres'))throw new Error('A PostgreSQL DATABASE_URL is required.');
const destination=path.resolve('.data','backups',`pre-workbench-${new Date().toISOString().replaceAll(/[:.]/g,'-')}.json`);
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
try{
 await client.connect();await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 const names=(await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' ORDER BY table_name")).rows.map(r=>r.table_name);
 const tables={},hashes={};
 for(const name of names){if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name))throw new Error('Unexpected table identifier.');const rows=(await client.query(`SELECT * FROM public."${name}"`)).rows;tables[name]=rows;hashes[name]={rows:rows.length,sha256:createHash('sha256').update(JSON.stringify(rows.map(row=>JSON.stringify(row)).sort())).digest('hex')};}
 await client.query('COMMIT');await mkdir(path.dirname(destination),{recursive:true});
 await writeFile(destination,JSON.stringify({format:'mezora-private-logical-snapshot-v1',createdAt:new Date().toISOString(),tables},null,2),{flag:'wx',mode:0o600});
 await writeFile(destination.replace(/\.json$/,'.summary.json'),JSON.stringify({createdAt:new Date().toISOString(),hashes},null,2),{flag:'wx',mode:0o600});
 console.log(JSON.stringify({backup:destination,tableCounts:Object.fromEntries(Object.entries(hashes).map(([k,v])=>[k,v.rows]))}));
}catch(error){console.error(JSON.stringify({error:'Database backup failed; no migration should proceed.',code:error?.code||'UNKNOWN'}));process.exitCode=1;}finally{await client.end().catch(()=>{});}
