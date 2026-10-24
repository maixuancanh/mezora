import {safeCsvCell} from './csv-import';
export interface StatementTransfer {txHash:string;logIndex:number;blockNumber:string;blockHash?:string;from:string;to:string;amountBaseUnits:string;classification?:'exact_bill_match'|'unclassified';billId?:string}
export function reconcileStatement(input:{address:string;openingBaseUnits:string;closingBaseUnits:string;transfers:StatementTransfer[];coverageComplete:boolean}){
 const seen=new Map<string,StatementTransfer>();let inflows=0n,outflows=0n;
 for(const t of input.transfers){const key=t.txHash.toLowerCase()+':'+t.logIndex;const previous=seen.get(key);if(previous){if(JSON.stringify(previous)!==JSON.stringify(t))throw new Error('Conflicting transfer provenance');continue;}seen.set(key,t);const n=BigInt(t.amountBaseUnits);if(n<0n)throw new Error('Negative transfer');const from=t.from.toLowerCase()===input.address.toLowerCase(),to=t.to.toLowerCase()===input.address.toLowerCase();if(!from&&!to)throw new Error('Unrelated transfer');if(from&&!to)outflows+=n;if(to&&!from)inflows+=n;}
 const transfers=[...seen.values()].sort((a,b)=>BigInt(a.blockNumber)<BigInt(b.blockNumber)?-1:BigInt(a.blockNumber)>BigInt(b.blockNumber)?1:a.logIndex-b.logIndex||a.txHash.localeCompare(b.txHash));
 const difference=BigInt(input.closingBaseUnits)-BigInt(input.openingBaseUnits)-inflows+outflows;
 return{...input,transfers,inflowsBaseUnits:inflows.toString(),outflowsBaseUnits:outflows.toString(),differenceBaseUnits:difference.toString(),status:!input.coverageComplete?'partial':difference===0n?'reconciled':'unreconciled'};
}
/** One portable CSV contains both the reconciliation summary and full transfer provenance. */
export function statementCsv(statement:Record<string,unknown>&{transfers:StatementTransfer[]}){
 const rows:unknown[][]=[['section','field','value']];
 for(const key of Object.keys(statement).filter(k=>k!=='transfers').sort())rows.push(['summary',key,typeof statement[key]==='object'?JSON.stringify(statement[key]):statement[key]]);
 const columns=['txHash','logIndex','blockNumber','blockHash','from','to','amountBaseUnits','classification','billId'] as const;
 rows.push([],['transfers',...columns]);for(const transfer of statement.transfers)rows.push(['transfer',...columns.map(k=>transfer[k]??'')]);
 return rows.map(row=>row.map(v=>safeCsvCell(String(v??''))).join(',')).join('\r\n')+'\r\n';
}
