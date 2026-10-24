/** Server-owned release switches; preview/local enables modules for acceptance. */
export function workbenchFeatures() {
 const enabled=(name:string)=>process.env[name]==='true'||process.env[name]!=='false'&&process.env.NODE_ENV!=='production';
 return {receipts:process.env.MEZORA_PUBLIC_RECEIPTS!=='false',cashPlan:enabled('MEZORA_CASH_PLAN'),policy:enabled('MEZORA_POLICY'),imports:enabled('MEZORA_IMPORTS'),statements:enabled('MEZORA_STATEMENTS'),recurring:enabled('MEZORA_RECURRING'),documents:enabled('MEZORA_DOCUMENTS'),team:enabled('MEZORA_TEAM'),receivables:enabled('MEZORA_RECEIVABLES')};
}
export function assertFeature(feature:keyof ReturnType<typeof workbenchFeatures>){if(!workbenchFeatures()[feature])throw Object.assign(new Error('This module is not enabled on this deployment.'),{status:403});}
