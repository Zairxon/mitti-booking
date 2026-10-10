import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { UZ_DICT, t, setLang } from '../src/i18n.js';

const src = readFileSync('src/main.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const keys = new Set();
for (const m of src.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) if (/[А-Яа-яЁё]/.test(m[1]) && !m[1].includes('<')) keys.add(m[1]);
const SKIP = new Set(['Митти юракча', '«Митти юракча»: ', 'РУ', 'ЎЗ']);

describe('сайт записи: узбекский', () => {
  it('у каждой русской строки есть перевод', () => {
    expect([...keys].filter((k) => !SKIP.has(k) && !(k in UZ_DICT))).toEqual([]);
  });
  it('в переводах нет латиницы', () => {
    for (const [k, v] of Object.entries(UZ_DICT)) expect(v.replace(/\{\w+\}/g, '').match(/[A-Za-z]+/g), k).toBeNull();
  });
  it('t() переключает язык', () => {
    setLang('uz'); expect(t('Записаться')).toBe('Ёзилиш'); setLang('ru'); expect(t('Записаться')).toBe('Записаться');
  });
});
