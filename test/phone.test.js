import { describe, it, expect } from 'vitest';
import { localDigits, fmtPhoneInput, cleanPhone } from '../src/phone.js';

describe('телефон', () => {
  it('номер, начинающийся на 998 (код 99 + 8…), не обрезается', () => {
    expect(localDigits('99 888 77 66')).toBe('998887766');
    expect(localDigits('+998 99 888 77 66')).toBe('998887766');
    expect(cleanPhone('998887766')).toBe('+998998887766');
  });
  it('полный международный формат и формат поля', () => {
    expect(cleanPhone('998901234567')).toBe('+998901234567');
    expect(fmtPhoneInput('+998 90 123 4', false)).toBe('+998 90 123 4');
    expect(fmtPhoneInput('+998 ', true)).toBe('');
  });
});
