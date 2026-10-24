export interface Citation {page:number;quote:string}
export interface ExtractedField {value:string;source:Citation;confidence:'pattern'}
export function extractInvoiceFields(pages:{page:number;text:string}[]){
 const fields:Record<string,ExtractedField>={};
 const patterns:Record<string,RegExp>={vendor:/^\s*(?:vendor|supplier|from)\s*:\s*(.{1,150})$/im,invoiceReference:/^\s*(?:invoice\s*(?:number|no\.?|#)|reference)\s*:?\s*([\w./-]{1,150})$/im,amount:/^\s*(?:total|amount\s*due)\s*:?\s*(?:MUSD\s*)?([0-9]+(?:\.[0-9]{1,18})?)\s*(MUSD|USD|USDC|EUR)?\s*$/im,dueDate:/^\s*due(?:\s*date)?\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/im,recipient:/^\s*(?:recipient|wallet|payment\s*address)\s*:\s*(0x[0-9a-fA-F]{40})\s*$/im};
 for(const page of pages){for(const [name,pattern]of Object.entries(patterns)){if(fields[name])continue;const match=page.text.match(pattern);if(match){fields[name]={value:match[1].trim(),source:{page:page.page,quote:match[0].trim()},confidence:'pattern'};if(name==='amount')fields.currency={value:match[2]||(/MUSD/.test(match[0])?'MUSD':'unknown'),source:{page:page.page,quote:match[0].trim()},confidence:'pattern'};}}}
 return fields;
}
