import { isAddress, zeroAddress } from 'viem';
import { parseMusd } from './money';
export interface RecurringTemplate {vendor:string;recipient:string;amount:string;category:string;frequency:'weekly'|'monthly';timezone:string;startDate:string;endDate:string|null;paused:boolean;activeFrom:string}
function day(s:string){const n=Date.parse(s+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s)throw new Error('Invalid calendar date.');return n;}
export function validateRecurringTemplate(t:RecurringTemplate){
 if(!t.vendor?.trim()||t.vendor.length>150||!isAddress(t.recipient)||t.recipient.toLowerCase()===zeroAddress)throw new Error('Invalid vendor or recipient.');
 if(parseMusd(t.amount)<=0n)throw new Error('Amount must be positive.');
 if(!['weekly','monthly'].includes(t.frequency))throw new Error('Invalid frequency.');
 // The first release uses one explicit timezone for repeatable accounting.
 if(t.timezone!=='UTC')throw new Error('Recurring timezone must be UTC in this release.');
 day(t.activeFrom);const start=day(t.startDate);if(t.endDate&&day(t.endDate)<start)throw new Error('End date must follow start date.');
}
export function occurrenceForDate(t:RecurringTemplate,today:string):{periodKey:string;dueDate:string}|null{
 validateRecurringTemplate(t);const now=day(today),start=day(t.startDate);if(t.paused||now<start)return null;let due:number;
 if(t.frequency==='weekly')due=start+Math.floor((now-start)/(7*86400000))*7*86400000;
 else{const anchor=new Date(start),current=new Date(now);let year=current.getUTCFullYear(),month=current.getUTCMonth();
  const dateFor=(y:number,m:number)=>Date.UTC(y,m,Math.min(anchor.getUTCDate(),new Date(Date.UTC(y,m+1,0)).getUTCDate()));
  due=dateFor(year,month);if(due>now){month--;if(month<0){month=11;year--;}due=dateFor(year,month);}}
 if(due<start||due<day(t.activeFrom)||(t.endDate&&due>day(t.endDate)))return null;
 const dueDate=new Date(due).toISOString().slice(0,10);return{periodKey:t.frequency==='monthly'?dueDate.slice(0,7):dueDate,dueDate};
}
