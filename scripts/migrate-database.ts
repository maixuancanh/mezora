import {createDatabase} from '../packages/db/src/database';
const url=process.env.DATABASE_URL;
if(!url?.startsWith('postgres'))throw new Error('A PostgreSQL DATABASE_URL is required.');
const db=await createDatabase(url);
try{const migrations=await db.query('SELECT version,name FROM schema_migrations ORDER BY version');console.log(JSON.stringify({applied:migrations.rows}));}finally{await db.close();}
