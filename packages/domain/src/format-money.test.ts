import { expect, it } from 'vitest';
import { formatMoney } from './format-money';
it('formats bigint without Number precision loss or rounding up available cash', () => {
  expect(formatMoney('123456789123456789123456789123456789')).toBe('123,456,789,123,456,789.12 MUSD');
  expect(formatMoney('1999999999999999999')).toBe('1.99 MUSD');
  expect(formatMoney('-1', {maximumFractionDigits:18,minimumFractionDigits:0})).toBe('-0.000000000000000001 MUSD');
  expect(() => formatMoney('1e18')).toThrow();
});
