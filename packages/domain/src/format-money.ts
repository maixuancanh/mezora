import { baseUnits, formatMusd, type DisplayOptions } from './money';
/** Display truncates extra precision so spendable cash is never rounded upward. */
export function formatMoney(value:string|bigint, options:DisplayOptions = {}):string {
  const raw = value.toString();
  if (!/^-?(0|[1-9][0-9]*)$/.test(raw) || raw === '-0') throw new Error('Expected canonical signed base units');
  const negative = raw.startsWith('-'), amount = baseUnits(negative ? raw.slice(1) : raw);
  const [whole,fraction] = formatMusd(amount,{minimumFractionDigits:2,maximumFractionDigits:2,...options}).split('.');
  return `${negative ? '-' : ''}${whole!.replace(/\B(?=(\d{3})+(?!\d))/g,',')}${fraction ? `.${fraction}` : ''} MUSD`;
}
