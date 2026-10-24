import {it,expect} from 'vitest';
import {createDatabase} from '../packages/db/src/database';
import {uploadDocument,extractDocument} from '../apps/web/src/server/documents';
function invoicePdf(){
 const stream='BT /F1 12 Tf 50 750 Td (Vendor: Acme) Tj 0 -20 Td (Invoice number: INV-42) Tj 0 -20 Td (Total: 10.25 MUSD) Tj 0 -20 Td (Due date: 2026-10-29) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let s='%PDF-1.4\n';const offsets=[0];objects.forEach((o,i)=>{offsets.push(s.length);s+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=s.length;s+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return s;
}
it('extracts a real text PDF with page citations without an OCR provider',async()=>{
 const db=await createDatabase('memory://');try{const source=await uploadDocument(db,'demo:pdf','demo','scenario',new File([invoicePdf()],'invoice.pdf',{type:'application/pdf'}));const result=await extractDocument(db,'demo:pdf',source.id);expect(result.status).toBe('extracted');expect(result.fields?.amount.value).toBe('10.25');expect(result.fields?.currency.value).toBe('MUSD');expect(result.fields?.invoiceReference.value).toBe('INV-42');expect(result.fields?.vendor.source.page).toBe(1);}finally{await db.close();}
},30000);
