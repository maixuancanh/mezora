import { isAddress, zeroAddress } from 'viem';
import { parseMusd } from './money';
const fields=['vendor','invoice_number','recipient','amount_musd','due_date','category','memo'] as const;
export interface CsvRow {row:number;raw:Record<typeof fields[number],string>;errors:string[]}
export function safeCsvCell(value:string){return '"'+(/^[\s]*[=+\-@]/.test(value)?"'"+value:value).replaceAll('"','""')+'"';}
export function previewCsv(text:string):CsvRow[]{
 if(new TextEncoder().encode(text).length>2*1024*1024)throw new Error('CSV exceeds 2 MB.');
 text=text.replace(/^\ufeff/,'');const records:string[][]=[];let record:string[]=[],cell='',quoted=false,closed=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(quoted){if(c==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=c;continue;}
  if(c==='"'){if(cell||closed)throw new Error('Invalid CSV quote.');quoted=true;}
  else if(c===','){record.push(cell);cell='';closed=false;}
  else if(c==='\n'||c==='\r'){if(c==='\r'&&text[i+1]==='\n')i++;record.push(cell);if(record.some(v=>v.trim()))records.push(record);record=[];cell='';closed=false;}
  else{if(closed)throw new Error('Unexpected data after closing quote.');cell+=c;}
 }
 if(quoted)throw new Error('Unclosed CSV quote.');record.push(cell);if(record.some(v=>v.trim()))records.push(record);
 const header=records.shift()?.map(v=>v.trim());if(!header||header.join(',')!==fields.join(','))throw new Error(`CSV columns must be: ${fields.join(',')}`);
 if(records.length>200)throw new Error('CSV supports up to 200 rows.');const seen=new Set<string>();
 return records.map((values,index)=>{const raw=Object.fromEntries(fields.map((f,n)=>[f,values[n]?.trim()??''])) as CsvRow['raw'],errors:string[]=[];
  if(values.length!==fields.length)errors.push('Incorrect column count.');
  if(!raw.vendor||raw.vendor.length>150)errors.push('Enter a vendor name up to 150 characters.');
  if(!isAddress(raw.recipient)||raw.recipient.toLowerCase()===zeroAddress)errors.push('Invalid recipient address.');
  try{if(parseMusd(raw.amount_musd)<=0n)throw new Error();}catch{errors.push('Invalid positive MUSD amount (maximum 18 decimals).');}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(raw.due_date)||!Number.isFinite(Date.parse(raw.due_date))||new Date(raw.due_date).toISOString().slice(0,10)!==raw.due_date)errors.push('Invalid calendar due date.');
  if(raw.invoice_number){const key=raw.vendor.toLowerCase()+'\0'+raw.invoice_number.toLowerCase();if(seen.has(key))errors.push('Duplicate vendor invoice number in this file.');seen.add(key);}
  if(raw.memo.length>2000||raw.category.length>80||raw.invoice_number.length>150)errors.push('Metadata is too long.');
  return{row:index+2,raw,errors};});
}
