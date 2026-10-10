import '@fontsource/onest/cyrillic-400.css';
import '@fontsource/onest/latin-400.css';
import '@fontsource/onest/cyrillic-500.css';
import '@fontsource/onest/latin-500.css';
import '@fontsource/onest/cyrillic-600.css';
import '@fontsource/onest/latin-600.css';
import '@fontsource/onest/cyrillic-700.css';
import '@fontsource/onest/latin-700.css';
import '@fontsource/jetbrains-mono/cyrillic-400.css';
import '@fontsource/jetbrains-mono/latin-400.css';
import './style.css';
import heroUrl from './assets/hero.jpg';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { t, getLang, setLang, months, weekdays } from './i18n.js';

const $ = (id) => document.getElementById(id);
const TZ = 5 * 3600e3;
const todayTz = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const isoDow = (d) => { const x = new Date(d + 'T00:00:00Z').getUTCDay(); return x === 0 ? 7 : x; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SRC = new URLSearchParams(location.search).get('src') === 'bot' ? 'bot' : 'site';

const S = { info: null, day: '', doctor: '', time: '', slots: null, loading: false, name: '', phone: '', busy: false, done: null, error: '' };

/* вызов публичных функций базы: они отдают только свободное время и принимают запись */
async function rpc(fn, args) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j && j.message) || 'error'); e.code = j && j.message; throw e; }
  return j;
}
const ERR = {
  slot_taken: 'Это время только что заняли. Выберите другое.',
  slot_unavailable: 'Это время недоступно. Выберите другое.',
  bad_name: 'Укажите имя (не короче 2 букв).',
  bad_phone: 'Проверьте номер телефона.',
  too_many: 'У вас уже есть несколько записей. Позвоните в клинику, чтобы записаться ещё.',
};
const errText = (e) => (ERR[e.code] ? t(ERR[e.code]) : t('Нет связи. Попробуйте ещё раз.'));

function workDays() { const out = []; for (let i = 0; i <= S.info.days_ahead; i++) { const d = addDays(todayTz(), i); if (S.info.work_days.indexOf(isoDow(d)) >= 0) out.push(d); } return out; }
const dayShort = (d) => weekdays()[isoDow(d) - 1] + ' ' + +d.slice(8, 10);
const dayFull = (d) => weekdays()[isoDow(d) - 1] + ', ' + +d.slice(8, 10) + ' ' + months()[+d.slice(5, 7) - 1].toLowerCase();
const docName = (id) => (S.info.doctors.filter((d) => d.id === id)[0] || { name: '' }).name;

function view() {
  if (S.error && !S.info) return '<section><div class="panel"><p class="alert">' + esc(S.error) + '</p><div class="row"><button class="btn" data-act="retry">' + t('Повторить') + '</button></div></div></section>';
  if (!S.info) return '<p class="empty">' + t('Загрузка…') + '</p>';
  if (S.done) {
    return '<section><div class="panel done"><div class="tick">✓</div><h2>' + t('Вы записаны') + '</h2>' +
      '<ul class="list"><li><div class="li-main"><b>' + t('Дата') + '</b></div><span>' + esc(dayFull(S.done.day)) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Время') + '</b></div><span class="num">' + S.done.time + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Врач') + '</b></div><span>' + esc(docName(S.done.doctor)) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Имя') + '</b></div><span>' + esc(S.done.name) + '</span></li></ul>' +
      '<p class="note">' + t('Пожалуйста, приходите за 5 минут до приёма. Если планы изменились, позвоните в клинику, чтобы отменить запись.') + '</p>' +
      '<div class="row"><button class="btn ghost" data-act="again">' + t('Записать ещё') + '</button></div></div></section>';
  }
  const days = workDays();
  let h = '<section><h2>1. ' + t('Выберите день') + '</h2><div class="days">' + days.map((d) => '<button type="button" class="pill dayp" data-act="day" data-id="' + d + '" aria-pressed="' + (S.day === d) + '">' + dayShort(d) + '</button>').join('') + '</div></section>';
  h += '<section><h2>2. ' + t('Выберите врача') + '</h2><div class="pills">' + S.info.doctors.map((d) => '<button type="button" class="pill" data-act="doctor" data-id="' + esc(d.id) + '" aria-pressed="' + (S.doctor === d.id) + '"><i class="dot" style="--c:' + esc(d.color) + '"></i>' + esc(d.name) + '</button>').join('') + '</div></section>';
  h += '<section><h2>3. ' + t('Выберите время') + '</h2>';
  if (S.error && !S.time) h += '<p class="alert">' + esc(S.error) + '</p>';
  if (!S.day || !S.doctor) h += '<p class="empty">' + t('Сначала выберите день и врача.') + '</p>';
  else if (S.loading) h += '<p class="empty">' + t('Загрузка…') + '</p>';
  else {
    const free = (S.slots && S.slots[S.doctor]) || [];
    h += free.length ? '<div class="times">' + free.map((x) => '<button type="button" class="pill tslot" data-act="time" data-id="' + x + '" aria-pressed="' + (S.time === x) + '">' + x + '</button>').join('') + '</div>' : '<p class="empty">' + t('На этот день свободного времени нет. Выберите другой день или врача.') + '</p>';
  }
  h += '</section>';
  if (S.time) {
    h += '<section><h2>4. ' + t('Ваши данные') + '</h2><div class="panel">' +
      '<div class="fld"><span>' + t('Ваше имя') + '</span><input id="b-name" type="text" autocomplete="name" value="' + esc(S.name) + '"></div>' +
      '<div class="fld"><span>' + t('Телефон') + '</span><input id="b-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67" value="' + esc(S.phone) + '"></div>' +
      '<p class="small muted">' + esc(dayFull(S.day)) + ' · <b>' + S.time + '</b> · ' + esc(docName(S.doctor)) + '</p>' +
      (S.error ? '<p class="alert">' + esc(S.error) + '</p>' : '') +
      '<div class="row"><button class="btn" data-act="book"' + (S.busy ? ' disabled' : '') + '>' + t('Записаться') + '</button></div></div>' +
      '<p class="note">' + t('Нажимая «Записаться», вы соглашаетесь, что клиника свяжется с вами по этому номеру.') + '</p></section>';
  }
  return h;
}

function render() {
  document.title = t('Митти юракча: онлайн-запись');
  $('hero-sub').textContent = t('Онлайн-запись на УЗИ');
  $('lang').textContent = getLang() === 'uz' ? 'РУ' : 'ЎЗ';
  $('app').innerHTML = view();
}

async function loadSlots() {
  if (!S.day || !S.doctor) { render(); return; }
  S.loading = true; S.time = ''; render();
  try { S.slots = await rpc('public_slots', { p_date: S.day }); S.error = ''; } catch (e) { S.slots = {}; S.error = errText(e); }
  S.loading = false; render();
}

document.addEventListener('click', async (ev) => {
  if (ev.target.closest('#lang')) { setLang(getLang() === 'uz' ? 'ru' : 'uz'); render(); return; }
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'day') { S.day = id; S.error = ''; await loadSlots(); }
  else if (act === 'doctor') { S.doctor = id; S.error = ''; await loadSlots(); }
  else if (act === 'time') { S.time = id; S.error = ''; render(); const n = $('b-name'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else if (act === 'again') { S.done = null; S.time = ''; S.error = ''; await loadSlots(); render(); }
  else if (act === 'retry') { start(); }
  else if (act === 'book') {
    if ((S.name || '').trim().length < 2) { S.error = t(ERR.bad_name); render(); return; }
    if ((S.phone || '').replace(/\D/g, '').length < 9) { S.error = t(ERR.bad_phone); render(); return; }
    S.busy = true; S.error = ''; render();
    try {
      await rpc('public_book', { p_doctor: S.doctor, p_start: S.day + 'T' + S.time + ':00+05:00', p_name: S.name.trim(), p_phone: S.phone.trim(), p_source: SRC });
      S.done = { day: S.day, time: S.time, doctor: S.doctor, name: S.name.trim() };
    } catch (e) {
      S.error = errText(e);
      if (e.code === 'slot_taken' || e.code === 'slot_unavailable') { S.busy = false; await loadSlots(); S.error = errText(e); }
    }
    S.busy = false; render();
  }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'b-name') S.name = ev.target.value;
  if (ev.target.id === 'b-phone') S.phone = ev.target.value;
});

async function start() {
  render();
  try { S.info = await rpc('public_info'); S.error = ''; if (S.info.doctors.length === 1) S.doctor = S.info.doctors[0].id; const w = workDays(); S.day = w[0] || ''; if (S.day && S.doctor) await loadSlots(); }
  catch (e) { S.error = t('Нет связи. Попробуйте ещё раз.'); }
  render();
}
$('hero').src = heroUrl;
start();
