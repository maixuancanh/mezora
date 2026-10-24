import {afterEach, expect, it} from 'vitest';
import sharp from 'sharp';
import {writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {localOcr} from '../apps/web/src/server/local-ocr';

afterEach(()=>{delete process.env.MEZORA_LOCAL_OCR;});
it('keeps local OCR disabled until explicitly enabled',async()=>{
 await expect(localOcr(new Uint8Array([1]),'image/png')).rejects.toThrow(/disabled/i);
});
it('rejects unsupported formats before spawning a process',async()=>{
 process.env.MEZORA_LOCAL_OCR='true';
 await expect(localOcr(new Uint8Array([1]),'text/plain')).rejects.toThrow(/PDF, PNG and JPEG/);
});
it('rejects empty and oversized sources',async()=>{
 process.env.MEZORA_LOCAL_OCR='true';
 await expect(localOcr(new Uint8Array(),'image/png')).rejects.toThrow(/10 MB/);
 await expect(localOcr(new Uint8Array(10*1024*1024+1),'image/png')).rejects.toThrow(/10 MB/);
});
it('bounds decoded image pixels and releases its busy slot after errors',async()=>{
 process.env.MEZORA_LOCAL_OCR='true';
 const image=await sharp({create:{width:2001,height:2000,channels:3,background:'white'}}).png().toBuffer();
 await expect(localOcr(image,'image/png')).rejects.toThrow(/pixel limit|4 megapixels/i);
 await expect(localOcr(new Uint8Array([1]),'image/png')).rejects.toThrow(/unsupported image|corrupt|invalid/i);
});
it.skipIf(process.env.MEZORA_TEST_LOCAL_OCR!=='true')('reads a synthetic invoice locally and rejects a concurrent job',async()=>{
 process.env.MEZORA_LOCAL_OCR='true';
 const svg='<svg width="1600" height="900" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="48" fill="black"><text x="80" y="120">Vendor: Acme Services</text><text x="80" y="230">Invoice number: INV-42</text><text x="80" y="340">Total: 10.25 MUSD</text><text x="80" y="450">Due date: 2026-10-29</text></g></svg>';
 const image=await sharp(Buffer.from(svg)).png().toBuffer();
 await writeFile(join(tmpdir(),'mezora-local-ocr-invoice.png'),image);
 const pending=localOcr(image,'image/png');
 await expect(localOcr(image,'image/png')).rejects.toThrow(/busy/i);
 const pages=await pending;
 expect(pages).toHaveLength(1);
 expect(pages[0].page).toBe(1);
 expect(pages[0].text).toContain('INV-42');
 expect(pages[0].text).toContain('10.25 MUSD');
},30000);

it.skipIf(process.env.MEZORA_TEST_LOCAL_OCR!=='true')('reads an image-only PDF locally with page numbering',async()=>{
 process.env.MEZORA_LOCAL_OCR='true';
 const image=await sharp(Buffer.from('<svg width="1200" height="600" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><g font-family="Arial" font-size="44"><text x="60" y="120">Invoice number: INV-42</text><text x="60" y="220">Total: 10.25 MUSD</text></g></svg>')).jpeg().toBuffer();
 const contents=Buffer.from('q 600 0 0 300 0 0 cm /Im0 Do Q');
 const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 300] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width 1200 /Height 600 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length} >>\nstream\n`),image,Buffer.from('\nendstream')]),Buffer.concat([Buffer.from(`<< /Length ${contents.length} >>\nstream\n`),contents,Buffer.from('\nendstream')])];
 const chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0];let length=chunks[0].length;
 objects.forEach((object,i)=>{offsets.push(length);const chunk=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),object,Buffer.from('\nendobj\n')]);chunks.push(chunk);length+=chunk.length;});
 chunks.push(Buffer.from(`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${length}\n%%EOF`));
 const pdf=Buffer.concat(chunks);await writeFile(join(tmpdir(),'mezora-local-ocr-scanned-invoice.pdf'),pdf);
 const pages=await localOcr(pdf,'application/pdf');
 expect(pages[0].page).toBe(1);expect(pages[0].text).toContain('INV-42');expect(pages[0].text).toContain('10.25 MUSD');
},30000);
