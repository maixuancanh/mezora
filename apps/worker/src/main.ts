import { database } from "../../../packages/db/src/database";
import { reconcile } from "../../web/src/server/live";
if(!process.env.DATABASE_URL?.startsWith("postgres"))throw new Error("A separate receipt worker requires DATABASE_URL PostgreSQL. Local PGlite is reconciled on demand by the web process.");
const db=await database();let stopping=false;process.on("SIGINT",()=>{stopping=true;});process.on("SIGTERM",()=>{stopping=true;});
while(!stopping){
 const spaces=await db.query<{id:string}>("SELECT id FROM workspaces WHERE mode='live'");
 for(const space of spaces.rows){try{await reconcile(db,space.id);}catch(error){console.error("Receipt reconciliation failed",space.id,error instanceof Error?error.message:String(error));}}
 await new Promise(resolve=>setTimeout(resolve,10000));
}await db.close();
