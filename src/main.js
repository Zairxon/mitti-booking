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
import { mountFooter } from './footer.js';
window.__appReady = true;

const $ = (id) => document.getElementById(id);
const TZ = 5 * 3600e3;
const todayTz = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const isoDow = (d) => { const x = new Date(d + 'T00:00:00Z').getUTCDay(); return x === 0 ? 7 : x; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SRC = new URLSearchParams(location.search).get('src') === 'bot' ? 'bot' : 'site';

const S = { svc: '', agree: false, pay: null, fresh: '', seen: {}, days: null, info: null, day: '', doctor: '', time: '', slots: null, loading: false, name: '', phone: '', busy: false, done: null, error: '' };

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
  too_many: 'У вас уже есть 3 активные записи на этот номер. Отмените ненужную в боте или позвоните в клинику.',
  bad_service: 'Выберите услугу.',
};
// Всплывающее сообщение внизу экрана: видно, где бы ни была прокручена страница
function toast(msg) {
  let el = $('toast'); if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'alert'); document.body.appendChild(el); }
  el.textContent = msg; el.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('show'), 7000);
}
window.addEventListener('error', (e) => toast(t('Что-то пошло не так') + ': ' + (e.message || '')));
window.addEventListener('unhandledrejection', (e) => toast(t('Что-то пошло не так') + ': ' + ((e.reason && e.reason.message) || '')));
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
// адрес: небольшая кнопка (открывает карту), ориентир; ниже — как записаться на приём
function quickBar() {
  const i = S.info.info || {}, mh = mapHref(), lm = L(i.landmark), ph = (i.phones || []).length;
  if (!i.address && !ph) return '';
  let h = '<div class="quick">';
  if (i.address) {
    h += '<p class="qttl">' + t('Наш адрес и локация') + '</p>';
    const inner = '<span class="qa"><span aria-hidden="true">📍</span> ' + esc(i.address) + '</span>' + (lm ? '<span class="ql">🧭 ' + t('Ориентир') + ': ' + esc(lm) + '</span>' : '') + (mh ? '<span class="qh">' + t('Нажмите — откроется карта') + ' <i aria-hidden="true">↗</i></span>' : '');
    h += mh ? '<a class="qmap" href="' + esc(mh) + '" target="_blank" rel="noopener">' + inner + '<span class="finger" aria-hidden="true">👆</span></a>' : '<div class="qmap static">' + inner + '</div>';
  }
  if (ph) h += '<div class="howto"><p class="howt">' + t('Записаться через звонок') + '</p><div class="hwrow"><div class="hw"><span class="hwi" aria-hidden="true">📞</span><b>' + t('По телефону') + '</b><span class="qrow">' + telLinks('qk') + '</span></div></div></div>';
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
  return h;
}

const prepayOn = () => !!(S.info && S.info.prepay && S.info.prepay.enabled && (S.info.prepay.services || []).length);
const money = (n) => String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const svcOf = (id) => ((S.info.prepay || {}).services || []).filter((x) => x.id === id)[0];
const hhmm = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const tgHref = (c) => { const x = String(c || '').trim(); return /^@\w+$/.test(x) ? 'https://t.me/' + x.slice(1) : /^https?:\/\//.test(x) ? x : ''; };
const PAY_KEY = 'mitti-pay';
const savePay = () => { try { if (S.pay) localStorage.setItem(PAY_KEY, JSON.stringify(S.pay)); else localStorage.removeItem(PAY_KEY); } catch (e) { /* без запоминания */ } };
const TRACK_KEY = 'mitti-visit';
const saveTrack = (o) => { try { if (o) localStorage.setItem(TRACK_KEY, JSON.stringify(o)); else localStorage.removeItem(TRACK_KEY); } catch (e) { /* без запоминания */ } };
// после приёма сотрудник нажимает «Прошёл»: тогда показываем клиенту благодарность
async function checkVisit() {
  let tr = null; try { tr = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); } catch (e) { /* нет записи */ }
  if (!tr || !tr.id || !tr.token) return;
  try {
    const j = await rpc('public_booking_status', { p_id: tr.id, p_token: tr.token });
    if (j.finished) { saveTrack(null); S.thanks = { name: tr.name || '' }; render(); }
    else if (j.status === 'cancelled' || j.status === 'no_show') saveTrack(null);
  } catch (e) { if (e && e.code === 'not_found') saveTrack(null); }
}
function thanksScreen() {
  const nm = S.thanks.name ? '<p class="thn">' + esc(S.thanks.name) + '</p>' : '';
  return '<section><div class="panel thanks"><div class="thheart" aria-hidden="true">💗</div><h2>' + t('Спасибо, что выбрали «Митти юракча»!') + '</h2>' + nm +
    '<p class="thtx">' + t('Благодарим вас за доверие и за то, что воспользовались нашими услугами. Мы желаем вам и вашему малышу крепкого здоровья.') + '</p>' +
    '<p class="thsm">' + t('Будем рады видеть вас снова.') + '</p>' +
    '<div class="row"><button class="btn" data-act="thanks-close">' + t('Записаться снова') + '</button></div></div></section>';
}
const prepayNote = () => '<div class="prepay"><span class="pi" aria-hidden="true">💳</span><p>' + t('Бронь с предоплатой. Оплата вносится вперёд на карту клиники, сумма зависит от услуги. На оплату даётся {min} минут, затем время освободится.', { min: S.info.prepay.hold_minutes }) + '</p></div>';

// экран оплаты: карта, сумма, таймер удержания, кнопка «Сфотографировать чек»
function payScreen() {
  const p = S.pay, st = p.pay_status, svc = p.service ? L(p.service) : '';
  const left = Date.parse(p.hold_until) - Date.now(), tg = tgHref(p.receipt_contact);
  let h = '<section><div class="panel payc"><h2>' + t('Внесите предоплату') + '</h2>' +
    '<p class="amount"><span class="num">' + money(p.deposit) + '</span> ' + t('сум') + '</p>' + (svc ? '<p class="small muted">' + esc(svc) + '</p>' : '') +
    '<div class="cardbox"><span class="small muted">' + t('Карта') + '</span><b class="num cardnum">' + esc(p.card_number) + '</b>' + (p.card_holder ? '<span class="small muted">' + t('Владелец карты') + ': ' + esc(p.card_holder) + '</span>' : '') +
    '<button type="button" class="btn ghost small" data-act="copy">' + t('Скопировать') + '</button></div>' +
    '<ul class="list"><li><div class="li-main"><b>' + t('Дата') + '</b></div><span>' + esc(dayFull(p.snap.day)) + ' · ' + p.snap.time + '</span></li><li><div class="li-main"><b>' + t('Врач') + '</b></div><span>' + esc(docName(p.snap.doctor)) + '</span></li></ul>';
  if (p.cancelled && st !== 'expired') {
    h += '<p class="alert">' + t('Запись отменена клиникой. Если это ошибка, позвоните нам.') + '</p><div class="row"><button class="btn" data-act="again-pay">' + t('Выбрать время заново') + '</button></div>';
  } else if (st === 'pending' || st === 'rejected') {
    h += '<p class="timer">⏳ ' + t('Осталось времени') + ': <b class="num" id="timer">' + hhmm(left) + '</b></p><p class="small muted">' + t('Если оплата не придёт вовремя, бронь снимется автоматически.') + '</p>';
    if (st === 'rejected') h += '<p class="alert">' + t('Чек не принят. Проверьте сумму и отправьте фото ещё раз.') + '</p>';
    if (p.err) h += '<p class="alert">' + esc(p.err) + '</p>';
    h += '<label class="btn camera' + (p.uploading ? ' off' : '') + '"><span aria-hidden="true">🧾</span> ' + t(p.uploading ? 'Отправляю…' : 'Отправить чек') + '<input id="rfile" type="file" accept="image/*" hidden' + (p.uploading ? ' disabled' : '') + '></label><p class="small muted center">' + t('Откроется выбор: камера или галерея (можно скриншот)') + '</p>';
    if (tg || p.receipt_contact) h += '<p class="small muted">' + t('Или отправьте чек в Telegram: {c}', { c: '' }) + (tg ? '<a href="' + esc(tg) + '" target="_blank" rel="noopener">' + esc(p.receipt_contact) + '</a>' : esc(p.receipt_contact)) + '</p>';
  } else if (st === 'review') {
    h += '<div class="reviewing"><span class="spin" aria-hidden="true"></span><p>' + t('Чек отправлен. Сотрудник проверяет оплату, это займёт несколько минут. Не закрывайте страницу.') + '</p><p class="small muted">' + t('Если закроете страницу, запись сохранится, а клиника свяжется с вами по номеру телефона.') + '</p></div>';
  } else { // expired
    h += '<p class="alert">' + t('Время на оплату вышло, бронь снята.') + '</p><div class="row"><button class="btn" data-act="again-pay">' + t('Выбрать время заново') + '</button></div>';
  }
  return h + '</div></section>';
}

function view() {
  if (S.error && !S.info) return '<section><div class="panel"><p class="alert">' + esc(S.error) + '</p><div class="row"><button class="btn" data-act="retry">' + t('Повторить') + '</button></div></div></section>';
  if (!S.info) return '<p class="empty">' + t('Загрузка…') + '</p>';
  if (S.thanks) return thanksScreen();
  if (S.pay && S.pay.pay_status !== 'paid') return payScreen();
  if (S.done) {
    return '<section><div class="panel done"><div class="tick">✓</div><h2>' + t(S.done.paid ? 'Оплата подтверждена, вы записаны' : 'Вы записаны') + '</h2>' +
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
  let h = '<h2 class="bookh">' + t('Записаться на приём') + '</h2><section><h2>1. ' + t('Выберите день') + '</h2><div class="months">' + cal + '</div></section>';
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
  const pre = prepayOn();
  if (S.time && pre) {
    h += '<section><h2>4. ' + t('Выберите услугу') + '</h2>' + prepayNote() + '<div class="svcs">' + S.info.prepay.services.map((x) => '<button type="button" class="pill svc" data-act="svc" data-id="' + esc(x.id) + '" aria-pressed="' + (S.svc === x.id) + '"><b>' + esc(L(x.name)) + '</b><span class="num">' + t('Предоплата') + ': ' + money(x.deposit) + ' ' + t('сум') + '</span></button>').join('') + '</div></section>';
  }
  if (S.time && (!pre || S.svc)) {
    h += '<section><h2>' + (pre ? '5. ' : '4. ') + t('Ваши данные') + '</h2><div class="panel">' +
      '<div class="fld"><span>' + t('Ваше имя') + '</span><input id="b-name" type="text" autocomplete="name" value="' + esc(S.name) + '"></div>' +
      '<div class="fld"><span>' + t('Телефон') + '</span><input id="b-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67" maxlength="17" value="' + esc(S.phone) + '"></div>' +
      '<p class="small muted">' + esc(dayFull(S.day)) + ' · <b>' + S.time + '</b> · ' + esc(docName(S.doctor)) + '</p>' +
      (pre ? '<p class="small"><b>' + esc(L((svcOf(S.svc) || {}).name)) + '</b> · ' + t('Предоплата') + ': <b class="num">' + money((svcOf(S.svc) || {}).deposit) + ' ' + t('сум') + '</b></p><label class="agree"><input type="checkbox" id="b-agree"' + (S.agree ? ' checked' : '') + '><span>' + t('Я понимаю, что оплата вносится вперёд') + '</span></label>' : '') +
      (S.error ? '<p class="alert errbox" id="b-err" role="alert">⚠️ ' + esc(S.error) + '</p>' : '') +
      '<div class="row"><button class="btn" data-act="book"' + (S.busy ? ' disabled' : '') + '>' + t(S.busy ? 'Отправляю…' : pre ? 'Записаться и оплатить' : 'Записаться') + '</button></div></div>' +
      '<p class="note">' + t('Нажимая «Записаться», вы соглашаетесь, что клиника свяжется с вами по этому номеру.') + '</p></section>';
  }
  return h + quickBar() + aboutBlock();
}

function render() {
  mountFooter(t('Очередь')); document.title = brand() + ': ' + t('Очередь'); document.querySelector('.hero-title').textContent = brand();
  $('hero-sub').textContent = t('Очередь: онлайн-запись на УЗИ');
  $('lang').textContent = { ru: 'РУ', uz: 'ЎЗ', uzl: 'UZ' }[getLang()];
  document.querySelectorAll('#langmenu button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === getLang())));
  const sl = S.info && S.info.info ? L(S.info.info.slogan) : '';
  $('slogan').textContent = sl; $('slogan').hidden = !sl;
  $('app').dataset.fresh = S.fresh; S.fresh = '';
  $('app').innerHTML = view();
  if (!S.introDone) { S.introDone = true; $('app').classList.add('intro'); setTimeout(() => $('app').classList.remove('intro'), 1400); }
  // при смене экрана (форма → оплата → «записаны») возвращаемся наверх, иначе на телефоне остаётся пустой низ страницы
  const vk = S.thanks ? 'thanks' : S.pay && S.pay.pay_status !== 'paid' ? 'pay' : S.done ? 'done' : 'main';
  if (vk !== S.vk) { S.vk = vk; window.scrollTo(0, 0); }
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
  else if (act === 'svc') { S.svc = id; S.error = ''; render(); const n = $('b-name'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else if (act === 'copy') { try { await navigator.clipboard.writeText(String(S.pay.card_number).replace(/\s/g, '')); b.textContent = t('Скопировано'); } catch (e) { /* без буфера */ } }
  else if (act === 'again-pay') { S.pay = null; savePay(); S.time = ''; S.svc = ''; S.agree = false; S.error = ''; await loadDays(); await loadSlots(); render(); }
  else if (act === 'time') { S.time = id; S.svc = ''; S.error = ''; render(); const n = $('b-name'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else if (act === 'thanks-close') { S.thanks = null; S.done = null; S.time = ''; S.error = ''; await loadSlots(); render(); }
  else if (act === 'again') { S.done = null; S.time = ''; S.error = ''; await loadSlots(); render(); }
  else if (act === 'retry') { start(); }
  else if (act === 'book') {
    if ($('b-name')) S.name = $('b-name').value; if ($('b-phone')) S.phone = $('b-phone').value;
    const fail = (m) => { S.error = m; toast(m); render(); const e = $('b-err'); if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    if ((S.name || '').trim().length < 2) return fail(t(ERR.bad_name));
    if (localDigits(S.phone).length < 9) return fail(t(ERR.bad_phone));
    if (prepayOn() && !S.svc) return fail(t(ERR.bad_service));
    if (prepayOn() && !S.agree) return fail(t('Подтвердите, что понимаете условия предоплаты.'));
    S.busy = true; S.error = ''; render();
    try {
      const res = await rpc('public_book', { p_doctor: S.doctor, p_start: S.day + 'T' + S.time + ':00+05:00', p_name: S.name.trim(), p_phone: cleanPhone(S.phone), p_source: SRC, p_service: prepayOn() ? S.svc : null });
      if (res && res.id && res.token) saveTrack({ id: res.id, token: res.token, name: S.name.trim() });
      if (res && res.deposit) { S.pay = { ...res, pay_status: 'pending', snap: { day: S.day, time: S.time, doctor: S.doctor, name: S.name.trim() } }; savePay(); startPolling(); }
      else S.done = { day: S.day, time: S.time, doctor: S.doctor, name: S.name.trim() };
    } catch (e) {
      S.error = errText(e); toast(S.error); setTimeout(() => { const el = $('b-err'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
      if (e.code === 'slot_taken' || e.code === 'slot_unavailable') { S.busy = false; await loadSlots(); S.error = errText(e); toast(S.error); const al = document.querySelector('.alert'); if (al) al.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
    S.busy = false; render();
  }
});
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'b-agree') { S.agree = el.checked; return; }
  if ((el.id === 'rfile' || el.id === 'rfile2') && el.files && el.files[0]) { const f = el.files[0]; el.value = ''; await sendReceipt(f); }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'b-name') S.name = ev.target.value;
  if (ev.target.id === 'b-phone') { const el = ev.target, del = !!(ev.inputType && ev.inputType.indexOf('delete') === 0); el.value = fmtPhoneInput(el.value, del); S.phone = el.value; }
});
document.addEventListener('focusin', (ev) => { const el = ev.target; if (el.id === 'b-phone' && !el.value) { el.value = '+998 '; S.phone = el.value; } });
document.addEventListener('focusout', (ev) => { const el = ev.target; if (el.id === 'b-phone' && localDigits(el.value) === '') { el.value = ''; S.phone = ''; } });

// фото сжимаем до ~1400 px, чтобы не гонять мегабайты по мобильной сети
function shrink(file) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 1400 / Math.max(img.width, img.height)), c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad_image')); };
    img.src = url;
  });
}
async function sendReceipt(file) {
  const p = S.pay; if (!p) return;
  p.uploading = true; p.err = ''; render();
  try {
    const image = await shrink(file);
    const r = await fetch(SUPABASE_URL + '/functions/v1/telegram-bot?op=upload', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ id: p.id, token: p.token, image, mime: 'image/jpeg' }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) p.pay_status = 'review'; else if (j.error === 'expired') p.pay_status = 'expired'; else p.err = t('Не удалось отправить чек. Попробуйте ещё раз.');
  } catch (e) { p.err = t('Не удалось отправить чек. Попробуйте ещё раз.'); }
  p.uploading = false; savePay(); render();
}
let pollT = null, tickT = null;
async function pollPay() {
  const p = S.pay; if (!p) return;
  try {
    const j = await rpc('public_booking_status', { p_id: p.id, p_token: p.token });
    let ch = false;
    if ((j.status === 'cancelled') !== !!p.cancelled) { p.cancelled = j.status === 'cancelled'; savePay(); ch = true; }
    if (j.pay_status !== p.pay_status) { p.pay_status = j.pay_status; p.hold_until = j.hold_until || p.hold_until; savePay(); ch = true; }
    else if (j.hold_until && j.hold_until !== p.hold_until) { p.hold_until = j.hold_until; savePay(); }
    if (j.pay_status === 'paid') { S.done = { ...p.snap, paid: true }; S.pay = null; savePay(); stopPolling(); ch = true; }
    if (ch) render();
  } catch (e) { if (e.code === 'not_found') { S.pay = null; savePay(); stopPolling(); render(); } }
}
function startPolling() {
  stopPolling();
  pollT = setInterval(pollPay, 6000);
  tickT = setInterval(() => { // таймер: обновляем только цифры, чтобы не перерисовывать страницу
    const p = S.pay, el = $('timer'); if (!p || !el) return;
    const left = Date.parse(p.hold_until) - Date.now(); el.textContent = hhmm(left);
    if (left <= 0 && p.pay_status !== 'review') pollPay();
  }, 1000);
}
function stopPolling() { clearInterval(pollT); clearInterval(tickT); pollT = tickT = null; }

async function start() {
  render();
  try { S.info = await rpc('public_info'); S.error = ''; await loadDays(); if (S.info.doctors.length === 1) S.doctor = S.info.doctors[0].id; const w = workDays(); S.day = w.filter((d) => !S.days || S.days[d] !== 0)[0] || w[0] || ''; if (S.day && S.doctor) await loadSlots(); }
  catch (e) { S.error = t('Нет связи. Попробуйте ещё раз.'); }
  try { const sv = JSON.parse(localStorage.getItem(PAY_KEY) || 'null'); if (sv && sv.id && sv.token) { S.pay = sv; await pollPay(); if (S.pay) startPolling(); } } catch (e) { /* нет сохранённой брони */ }
  render();
  checkVisit();
  setInterval(() => { if (document.visibilityState === 'visible') checkVisit(); }, 60000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVisit(); });
}
document.documentElement.style.setProperty('--bg-img', 'url(' + bgUrl + ')');
start();
