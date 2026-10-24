import { describe,expect,it } from "vitest";
import { previewCsv, safeCsvCell } from "./csv-import";
const address="0x0000000000000000000000000000000000000001";
const header="vendor,invoice_number,recipient,amount_musd,due_date,category,memo";
describe("CSV import v1",()=>{
 it("parses BOM, quoted comma/newline and escaped quote without losing raw fields",()=>{
  const rows=previewCsv(`\ufeff${header}\r\n"Acme, Inc",INV1,${address},10.123,2026-02-28,Tools,"Line 1\nLine ""2"""`);
  expect(rows[0].errors).toEqual([]);expect(rows[0].raw.vendor).toBe("Acme, Inc");expect(rows[0].raw.memo).toBe('Line 1\nLine "2"');
 });
 it("reports errors per row, rejects invalid calendar days and excessive decimals",()=>{
  const rows=previewCsv(`${header}\nAcme,I1,${address},1e3,2026-02-31,,\nOther,I2,invalid,1.0000000000000000001,2026-02-28,,`);
  expect(rows).toHaveLength(2);expect(rows[0].errors.join(" ")).toMatch(/amount|MUSD/);expect(rows[0].errors.join(" ")).toMatch(/date/i);expect(rows[1].errors.length).toBe(2);
 });
 it("marks exact invoice duplicates and caps row/file size",()=>{
  expect(previewCsv(`${header}\nAcme,I1,${address},1,2026-02-28,,\nacme,I1,${address},1,2026-02-28,,`)[1].errors.join(" ")).toMatch(/duplicate/i);
  expect(()=>previewCsv(`${header}\n${`Acme,I1,${address},1,2026-02-28,,\n`.repeat(201)}`)).toThrow(/200/);
  expect(()=>previewCsv("x".repeat(2*1024*1024+1))).toThrow(/2 MB/);
  expect(()=>previewCsv(`${header}\n"unclosed`)).toThrow(/quote/i);
 });
 it("escapes spreadsheet formulas while leaving raw canonical values separate",()=>{
  expect(safeCsvCell("=SUM(A1)")).toBe('"\'=SUM(A1)"');expect(safeCsvCell(" +cmd")).toBe('"\' +cmd"');
 });
});
