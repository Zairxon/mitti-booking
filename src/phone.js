// Телефон всегда в виде +998 12 123 12 12: +998 ставится сам, цифры группируются при наборе.
export function localDigits(s) {
  const str = String(s || '').trim();
  // «+998 …» из поля ввода: код страны всегда отбрасываем; номер без «+» вида 99 888 77 66 (9 цифр) трогать нельзя
  if (/^\+\s*998/.test(str)) return str.replace(/^\+\s*998/, '').replace(/\D/g, '').slice(0, 9);
  let d = str.replace(/\D/g, '');
  if (d.startsWith('998') && d.length > 9) d = d.slice(3);
  return d.slice(0, 9);
}
// Для поля ввода. deleting = пользователь стирает (иначе «+998 » вернулся бы навсегда).
export function fmtPhoneInput(raw, deleting) {
  const d = localDigits(raw);
  if (!d) return deleting || !raw ? '' : '+998 ';
  const g = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
  return '+998 ' + g.join(' ');
}
// Для показа в списках; чужой формат оставляем как есть
export function fmtPhone(p) {
  const s = String(p || '');
  return localDigits(s).length === 9 ? fmtPhoneInput(s, false) : s;
}
// Что хранить: +998901234567 или пусто, если номер не введён
export function cleanPhone(p) { const d = localDigits(p); return d ? '+998' + d : ''; }
