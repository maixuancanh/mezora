import type {Sql} from './database';
export type Role='owner'|'requester'|'reviewer'|'viewer';
export async function memberRole(q:Sql,ns:string,actor:string):Promise<Role|null>{
 if(ns.startsWith('demo:'))return'owner';
 if(ns==='live:'+actor.toLowerCase())return'owner';
 return(await q.query<{role:Role}>('SELECT role FROM workspace_members WHERE workspace_id=$1 AND lower(address)=$2',[ns,actor.toLowerCase()])).rows[0]?.role||null;
}
export async function requireRole(q:Sql,ns:string,actor:string,allowed:Role[]){const role=await memberRole(q,ns,actor);if(!role||!allowed.includes(role))throw Object.assign(new Error('Workspace permission denied.'),{status:403});return role;}
