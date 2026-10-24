import { describe,expect,it } from "vitest";
import { occurrenceForDate, validateRecurringTemplate } from "./recurrence";
const template={vendor:"Acme",recipient:"0x0000000000000000000000000000000000000001",amount:"10",category:"Tools",frequency:"monthly" as const,timezone:"UTC",startDate:"2026-01-31",endDate:null,paused:false,activeFrom:"2026-01-01"};
describe("recurring schedule",()=>{
 it("caps month end and returns one stable period key",()=>{
  expect(occurrenceForDate(template,"2026-02-28")).toEqual({periodKey:"2026-02",dueDate:"2026-02-28"});
  expect(occurrenceForDate(template,"2026-03-10")).toEqual({periodKey:"2026-02",dueDate:"2026-02-28"});
  expect(occurrenceForDate({...template,startDate:"2028-01-31"},"2028-02-29")?.dueDate).toBe("2028-02-29");
 });
 it("weekly cadence uses start anchor and skips before activation, pause and end",()=>{
  const weekly={...template,frequency:"weekly" as const,startDate:"2026-10-01"};
  expect(occurrenceForDate(weekly,"2026-10-20")?.dueDate).toBe("2026-10-15");
  expect(occurrenceForDate({...weekly,activeFrom:"2026-10-20"},"2026-10-20")).toBeNull();
  expect(occurrenceForDate({...weekly,paused:true},"2026-10-22")).toBeNull();
  expect(occurrenceForDate({...weekly,endDate:"2026-10-10"},"2026-10-22")).toBeNull();
 });
 it("rejects invalid timezones, decimal amounts and reversed date ranges",()=>{
  expect(()=>validateRecurringTemplate({...template,timezone:"bad/time"})).toThrow(/timezone/i);
  expect(()=>validateRecurringTemplate({...template,amount:"1e9"})).toThrow();
  expect(()=>validateRecurringTemplate({...template,endDate:"2025-01-01"})).toThrow(/end/i);
 });
});
