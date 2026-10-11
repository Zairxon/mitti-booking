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
import bgUrl from './assets/bg.jpg';
import { SUPABASE_URL, SUPABASE_KEY } from './config.js';
import { fmtPhoneInput, fmtPhone, cleanPhone, localDigits } from './phone.js';
import { t, getLang, setLang, weekdays, weekdaysFull, monthsGen, months, pick, pickList, brand } from './i18n.js';

const $ = (id) => document.getElementById(id);
const TZ = 5 * 3600e3;
const todayTz = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const isoDow = (d) => { const x = new Date(d + 'T00:00:00Z').getUTCDay(); return x === 0 ? 7 : x; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SRC = new URLSearchParams(location.search).get('src') === 'bot' ? 'bot' : 'site';

const S = { fresh: '', seen: {}, days: null, info: null, day: '', doctor: '', time: '', slots: null, loading: false, name: '', phone: '', busy: false, done: null, error: '' };

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
const dayFull = (d) => weekdaysFull()[isoDow(d) - 1] + ', ' + +d.slice(8, 10) + ' ' + monthsGen()[+d.slice(5, 7) - 1];
const docWorks = (d, day) => !day || (d.work_days || S.info.work_days).indexOf(isoDow(day)) >= 0;
const docName = (id) => (S.info.doctors.filter((d) => d.id === id)[0] || { name: '' }).name;

const L = (o) => pick(o);
const nextYm = (ym) => { const y = +ym.slice(0, 4), mo = +ym.slice(5, 7); return mo === 12 ? (y + 1) + '-01' : y + '-' + String(mo + 1).padStart(2, '0'); };
function mapHref() {
  const i = (S.info && S.info.info) || {};
  if (i.map_url) return i.map_url;
  if (i.lat != null && i.lng != null) return 'https://yandex.com/maps/?pt=' + i.lng + ',' + i.lat + '&z=17&l=map';
  return i.address ? 'https://yandex.com/maps/?text=' + encodeURIComponent(i.address) : '';
}
const telLinks = (cls) => (((S.info.info || {}).phones) || []).map((p) => '<a class="' + cls + '" href="tel:' + esc(cleanPhone(p)) + '"><span aria-hidden="true">📞</span> <span class="num">' + esc(fmtPhone(p)) + '</span></a>').join('');
// строка контактов под заголовком: адрес — заметная кнопка (открывает карту), ориентир, телефоны с подписью
function quickBar() {
  const i = S.info.info || {}, mh = mapHref(), lm = L(i.landmark), ph = (i.phones || []).length;
  if (!i.address && !ph) return '';
  let h = '<div class="quick">';
  if (i.address) {
    const inner = '<span class="qa"><span aria-hidden="true">📍</span> <b>' + esc(i.address) + '</b></span>' + (lm ? '<span class="ql">🧭 ' + t('Ориентир') + ': ' + esc(lm) + '</span>' : '') + (mh ? '<span class="qh">' + t('Нажмите — откроется карта') + ' <i aria-hidden="true">↗</i></span>' : '');
    h += mh ? '<a class="qmap" href="' + esc(mh) + '" target="_blank" rel="noopener">' + inner + '<span class="finger" aria-hidden="true">👆</span></a>' : '<div class="qmap static">' + inner + '</div>';
  }
  if (ph) h += '<div class="qphones"><span class="qlabel"><span aria-hidden="true">📞</span> ' + t('Запись на приём') + '</span><span class="qrow">' + telLinks('qk') + '</span></div>';
  return h + '</div>';
}
// «О клинике»: описание одним блоком, преимущества компактными плитками, врачи. Блоки плавно появляются при прокрутке (один раз).
const EMO = /^(\p{Extended_Pictographic}[\uFE0F\u200D\p{Extended_Pictographic}]*)\s*/u;
function aboutBlock() {
  const i = S.info.info || {}, rv = (k) => 'rv' + (S.seen[k] ? ' in' : '') + '" data-rv="' + k;
  let h = '';
  const about = L(i.about), perks = pickList(i.perks);
  if (about || perks.length) {
    h += '<section class="about"><h2 class="' + rv('h-about') + '">' + t('О клинике') + '</h2><div class="aboutcard ' + rv('card-about') + '">' + (about ? '<p class="lead">' + esc(about) + '</p>' : '') +
      (perks.length ? '<div class="perks2">' + perks.map((p, k) => {
        const m = EMO.exec(p), rest = m ? p.slice(m[0].length) : p, cut = rest.indexOf(':'), title = cut > 0 ? rest.slice(0, cut) : rest, desc = cut > 0 ? rest.slice(cut + 1).trim() : '';
        return '<div class="perk ' + rv('perk' + k) + '" style="--i:' + k + '"><span class="pe" aria-hidden="true">' + (m ? m[1] : '✦') + '</span><b>' + esc(title) + '</b>' + (desc ? '<span>' + esc(desc) + '</span>' : '') + '</div>';
      }).join('') + '</div>' : '') + '</div></section>';
  }
  const docs = S.info.doctors.filter((d) => L(d.specialty) || L(d.bio));
  if (docs.length) {
    h += '<section><h2 class="' + rv('h-docs') + '">' + t('Наши врачи') + '</h2><div class="docs">' + docs.map((d, k) => '<article class="doc ' + rv('doc' + k) + '" style="--i:' + k + '"><span class="av" style="--c:' + esc(d.color) + '">' + esc((d.name || '?').trim().charAt(0).toUpperCase()) + '</span><div class="dtx"><b>' + esc(d.name) + '</b>' +
      (L(d.specialty) ? '<span class="dsp">' + esc(L(d.specialty)) + '</span>' : '') + (L(d.bio) ? '<p class="small">' + esc(L(d.bio)) + '</p>' : '') + '</div></article>').join('') + '</div></section>';
  }
  return h;
}

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
  // дни неделями: заголовок Пн–Вс, ряды по семь, каждый месяц отдельным блоком; нажимаются только дни со свободным временем
  const today = todayTz(), last = addDays(today, S.info.days_ahead), wd = weekdays();
  const open = (d) => d >= today && d <= last && S.info.work_days.indexOf(isoDow(d)) >= 0 && (!S.days || S.days[d] > 0 || S.days[d] === undefined);
  let cal = '';
  for (let ym = today.slice(0, 7); ym <= last.slice(0, 7); ym = nextYm(ym)) {
    const first = ym + '-01', dim = new Date(Date.UTC(+ym.slice(0, 4), +ym.slice(5, 7), 0)).getUTCDate(), days = [];
    for (let k = 0; k < dim; k++) days.push(addDays(first, k));
    if (!days.some(open)) continue;
    let cells = wd.map((w) => '<span class="wd">' + w + '</span>').join('') + '<span class="dayp off"></span>'.repeat(isoDow(first) - 1);
    days.forEach((d) => { cells += open(d) ? '<button type="button" class="pill dayp" data-act="day" data-id="' + d + '" aria-pressed="' + (S.day === d) + '" aria-label="' + esc(dayFull(d)) + '">' + +d.slice(8, 10) + '</button>' : '<span class="dayp off" aria-hidden="true">·</span>'; });
    cal += '<div class="mblock"><p class="mname">' + esc(months()[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4)) + '</p><div class="cal7">' + cells + '</div></div>';
  }
  let h = quickBar() + '<section><h2>1. ' + t('Выберите день') + '</h2><div class="months">' + cal + '</div></section>';
  h += '<section><h2>2. ' + t('Выберите врача') + '</h2><div class="pills">' + S.info.doctors.map((d) => '<button type="button" class="pill" data-act="doctor" data-id="' + esc(d.id) + '" aria-pressed="' + (S.doctor === d.id) + '"' + (docWorks(d, S.day) ? '' : ' disabled title="' + esc(t('В этот день не работает')) + '"') + '><i class="dot" style="--c:' + esc(d.color) + '"></i>' + esc(d.name) + '</button>').join('') + '</div></section>';
  h += '<section><h2>3. ' + t('Выберите время') + '</h2>';
  if (S.error && !S.time) h += '<p class="alert">' + esc(S.error) + '</p>';
  if (!S.day || !S.doctor) h += '<p class="empty">' + t('Сначала выберите день и врача.') + '</p>';
  else if (S.loading) h += '<p class="empty">' + t('Загрузка…') + '</p>';
  else {
    const free = (S.slots && S.slots[S.doctor]) || [];
    const dd = S.info.doctors.filter((x) => x.id === S.doctor)[0];
    if (dd && !docWorks(dd, S.day)) h += '<p class="empty">' + t('Врач в этот день не работает. Выберите другой день или врача.') + '</p>'; else
    h += free.length ? '<div class="times">' + free.map((x, k) => '<button type="button" class="pill tslot" style="--k:' + k + '" data-act="time" data-id="' + x + '" aria-pressed="' + (S.time === x) + '">' + x + '</button>').join('') + '</div>' : '<p class="empty">' + t('На этот день свободного времени нет. Выберите другой день или врача.') + '</p>';
  }
  h += '</section>';
  if (S.time) {
    h += '<section><h2>4. ' + t('Ваши данные') + '</h2><div class="panel">' +
      '<div class="fld"><span>' + t('Ваше имя') + '</span><input id="b-name" type="text" autocomplete="name" value="' + esc(S.name) + '"></div>' +
      '<div class="fld"><span>' + t('Телефон') + '</span><input id="b-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67" maxlength="17" value="' + esc(S.phone) + '"></div>' +
      '<p class="small muted">' + esc(dayFull(S.day)) + ' · <b>' + S.time + '</b> · ' + esc(docName(S.doctor)) + '</p>' +
      (S.error ? '<p class="alert">' + esc(S.error) + '</p>' : '') +
      '<div class="row"><button class="btn" data-act="book"' + (S.busy ? ' disabled' : '') + '>' + t('Записаться') + '</button></div></div>' +
      '<p class="note">' + t('Нажимая «Записаться», вы соглашаетесь, что клиника свяжется с вами по этому номеру.') + '</p></section>';
  }
  return h + aboutBlock();
}

function render() {
  document.title = brand() + ': ' + t('Очередь'); document.querySelector('.hero-title').textContent = brand();
  $('hero-sub').textContent = t('Очередь: онлайн-запись на УЗИ');
  $('lang').textContent = { ru: 'РУ', uz: 'ЎЗ', uzl: 'UZ' }[getLang()];
  document.querySelectorAll('#langmenu button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === getLang())));
  const sl = S.info && S.info.info ? L(S.info.info.slogan) : '';
  $('slogan').textContent = sl; $('slogan').hidden = !sl;
  $('app').dataset.fresh = S.fresh; S.fresh = '';
  $('app').innerHTML = view();
  observeReveal();
}
let io = null;
function observeReveal() {
  const els = document.querySelectorAll('.rv:not(.in)'); if (!els.length) return;
  if (!('IntersectionObserver' in window)) { els.forEach((e) => { e.classList.add('in'); S.seen[e.dataset.rv] = 1; }); return; }
  if (!io) io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); S.seen[e.target.dataset.rv] = 1; io.unobserve(e.target); } }), { threshold: 0.15 });
  els.forEach((e) => io.observe(e));
}

async function loadDays() { try { S.days = await rpc('public_days'); } catch (e) { S.days = null; } }
async function loadSlots() {
  if (!S.day || !S.doctor) { render(); return; }
  S.loading = true; S.time = ''; render();
  try { S.slots = await rpc('public_slots', { p_date: S.day }); S.error = ''; } catch (e) { S.slots = {}; S.error = errText(e); }
  S.loading = false; S.fresh = 'slots'; render();
}

document.addEventListener('click', async (ev) => {
  const lm = $('langmenu');
  if (ev.target.closest('#lang')) { lm.hidden = !lm.hidden; return; }
  if (!ev.target.closest('#langmenu')) lm.hidden = true;
  const lb = ev.target.closest('[data-act=lang-set]'); if (lb) { setLang(lb.dataset.id); lm.hidden = true; render(); return; }
  const b = ev.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, id = b.dataset.id;
  if (act === 'day') { S.day = id; S.error = ''; await loadSlots(); }
  else if (act === 'doctor') { S.doctor = id; S.error = ''; await loadSlots(); }
  else if (act === 'time') { S.time = id; S.error = ''; render(); const n = $('b-name'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else if (act === 'again') { S.done = null; S.time = ''; S.error = ''; await loadSlots(); render(); }
  else if (act === 'retry') { start(); }
  else if (act === 'book') {
    if ((S.name || '').trim().length < 2) { S.error = t(ERR.bad_name); render(); return; }
    if (localDigits(S.phone).length < 9) { S.error = t(ERR.bad_phone); render(); return; }
    S.busy = true; S.error = ''; render();
    try {
      await rpc('public_book', { p_doctor: S.doctor, p_start: S.day + 'T' + S.time + ':00+05:00', p_name: S.name.trim(), p_phone: cleanPhone(S.phone), p_source: SRC });
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
  if (ev.target.id === 'b-phone') { const el = ev.target, del = !!(ev.inputType && ev.inputType.indexOf('delete') === 0); el.value = fmtPhoneInput(el.value, del); S.phone = el.value; }
});
document.addEventListener('focusin', (ev) => { const el = ev.target; if (el.id === 'b-phone' && !el.value) { el.value = '+998 '; S.phone = el.value; } });
document.addEventListener('focusout', (ev) => { const el = ev.target; if (el.id === 'b-phone' && localDigits(el.value) === '') { el.value = ''; S.phone = ''; } });

async function start() {
  render();
  try { S.info = await rpc('public_info'); S.error = ''; await loadDays(); if (S.info.doctors.length === 1) S.doctor = S.info.doctors[0].id; const w = workDays(); S.day = w.filter((d) => !S.days || S.days[d] !== 0)[0] || w[0] || ''; if (S.day && S.doctor) await loadSlots(); }
  catch (e) { S.error = t('Нет связи. Попробуйте ещё раз.'); }
  render();
}
document.documentElement.style.setProperty('--bg-img', 'url(' + bgUrl + ')');
start();
