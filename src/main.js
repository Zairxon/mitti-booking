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
import { initTour, startTour, tourDone } from './tour.js';
import { mountFooter } from './footer.js';
window.__appReady = true;

const $ = (id) => document.getElementById(id);
const TZ = 5 * 3600e3;
const todayTz = () => new Date(Date.now() + TZ).toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const isoDow = (d) => { const x = new Date(d + 'T00:00:00Z').getUTCDay(); return x === 0 ? 7 : x; };
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SRC = new URLSearchParams(location.search).get('src') === 'bot' ? 'bot' : 'site';
// Откуда пришёл клиент: метки ?utm_source=…&utm_medium=…&utm_campaign=… из рекламной ссылки; без меток берём сайт, с которого перешли
const UTM_KEY = 'mitti-utm';
function captureUtm() {
  try {
    const q = new URLSearchParams(location.search), clean = (v, n) => String(v || '').trim().slice(0, n);
    let u = { source: clean(q.get('utm_source') || q.get('ref'), 40), medium: clean(q.get('utm_medium'), 40), campaign: clean(q.get('utm_campaign'), 60) };
    if (!u.source && document.referrer) { try { const h = new URL(document.referrer).hostname.replace(/^www\./, ''); if (h && h !== location.hostname) u = { source: h, medium: 'referral', campaign: '' }; } catch (e) { /* без referrer */ } }
    if (u.source) localStorage.setItem(UTM_KEY, JSON.stringify({ ...u, t: Date.now() }));
  } catch (e) { /* без запоминания */ }
}
function loadUtm() {
  try { const u = JSON.parse(localStorage.getItem(UTM_KEY) || 'null'); if (u && u.source && Date.now() - (u.t || 0) < 30 * 86400e3) return { source: u.source, medium: u.medium || '', campaign: u.campaign || '' }; } catch (e) { /* нет метки */ }
  return null;
}
captureUtm();

const S = { svc: '', agree: false, consent: false, legal: '', cancelAsk: false, pay: null, fresh: '', seen: {}, days: null, info: null, day: '', doctor: '', time: '', slots: null, loading: false, name: '', phone: '', busy: false, done: null, error: '' };

/* вызов публичных функций базы: они отдают только свободное время и принимают запись */
// Воронка записи: на каком шаге клиент остановился (без имени и телефона). Ошибки трекинга клиенту не показываются.
const SID = (() => { try { let s = sessionStorage.getItem('mitti-sid'); if (!s) { s = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 32); sessionStorage.setItem('mitti-sid', s); } return s; } catch (e) { return String(Date.now()) + Math.random().toString(36).slice(2, 10); } })();
const tracked = {};
function track(step, meta, once) {
  if (once) { if (tracked[step]) return; tracked[step] = 1; }
  try { Promise.resolve(rpc('public_track', { p_sid: SID, p_step: step, p_meta: meta || null })).catch(() => {}); } catch (e) { /* без трекинга */ }
}
async function rpc(fn, args) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error((j && j.message) || 'error'); e.code = j && j.message; throw e; }
  return j;
}
const ERR = {
  slot_taken: 'Это время только что заняли. Выберите другое.',
  slot_unavailable: 'Это время недоступно. Выберите другое.',
  not_allowed: 'Это действие сейчас недоступно.',
  bad_name: 'Укажите имя (не короче 2 букв).',
  bad_phone: 'Проверьте номер телефона.',
  too_many: 'У вас уже есть 3 активные записи на этот номер. Отмените ненужную в боте или позвоните в клинику.',
  bad_service: 'Выберите услугу.',
  consent: 'Подтвердите согласие на обработку персональных данных.',
  too_late: 'До приёма меньше часа: позвоните в клинику.',
  paid_call: 'Запись с оплатой отменяется по звонку в клинику.',
  cannot_cancel: 'Эту запись уже нельзя отменить.',
  not_found: 'Запись не найдена.',
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
// Политика конфиденциальности и публичная оферта: типовые тексты, их проверяет юрист клиники
const LEGAL = {
  privacy: ['Политика конфиденциальности', [
    ['Какие данные мы собираем', 'Имя, номер телефона, выбранные день, время и врач, сведения о предоплате. Диагнозы и жалобы при записи на сайте мы не спрашиваем.'],
    ['Для чего', 'Чтобы записать вас на приём, связаться с вами по поводу записи, подтвердить оплату, учесть приём и выполнить требования законодательства.'],
    ['Кому передаются', 'Данные доступны сотрудникам клиники в рамках их работы. Мы не передаём их третьим лицам, кроме случаев, когда этого требует закон.'],
    ['Как хранятся', 'Данные хранятся на защищённых серверах с ограниченным доступом. Срок хранения — столько, сколько нужно для записи и учёта.'],
    ['Ваши права', 'Вы можете узнать, какие данные о вас хранятся, исправить их или попросить удалить, позвонив в клинику. Согласие можно отозвать в любое время.']]],
  offer: ['Публичная оферта', [
    ['Услуга', 'Клиника «Митти юрак» оказывает услуги ультразвукового исследования по предварительной записи. Нажимая «Записаться», вы принимаете эти условия.'],
    ['Предоплата', 'Если включена предоплата, её сумма указана при выборе услуги и засчитывается в стоимость приёма. Время удерживается за вами ограниченный срок, затем бронь снимается автоматически, если оплата не подтверждена.'],
    ['Отмена и перенос', 'Запись без оплаты можно отменить на сайте не позже чем за час до приёма. Запись с оплатой изменяется по звонку в клинику.'],
    ['Если вы не пришли', 'При оплаченной записи, если вы не пришли, вы можете выбрать другое время без повторной оплаты или запросить возврат предоплаты. Возврат оформляет клиника после вашей заявки.'],
    ['Результат исследования', 'Результат УЗИ оценивает врач. Исследование не заменяет очную консультацию специалиста.'],
    ['Контакты', 'Телефоны и адрес клиники указаны на сайте.']]],
};
function legalSheet() {
  const d = LEGAL[S.legal]; if (!d) return '';
  return '<div class="legal-ov" data-act="legal-close" role="dialog" aria-modal="true"><div class="legal-card"><button type="button" class="legal-x" data-act="legal-close" aria-label="' + esc(t('Закрыть')) + '">×</button><h2>' + t(d[0]) + '</h2>' +
    d[1].map((x) => '<h3>' + t(x[0]) + '</h3><p class="small">' + t(x[1]) + '</p>').join('') + '<div class="row"><button type="button" class="btn" data-act="legal-close">' + t('Закрыть') + '</button></div></div></div>';
}
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
// журнал визитов: токены своих броней хранятся на телефоне, по ним сервер отдаёт историю (без токена чужую историю не увидеть)
const TOK_KEY = 'mitti-tokens';
const getTokens = () => { try { const a = JSON.parse(localStorage.getItem(TOK_KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch (e) { return []; } };
const addToken = (tok) => { try { if (!tok) return; const a = getTokens().filter((x) => x !== tok); a.push(tok); localStorage.setItem(TOK_KEY, JSON.stringify(a.slice(-10))); } catch (e) { /* без журнала */ } };
async function loadHist() {
  try { const tr = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); if (tr && tr.token) addToken(tr.token); } catch (e) { /* нет записи */ }
  const tk = getTokens(); if (!tk.length) { S.hist = null; return; }
  try { S.hist = await rpc('public_my_visits', { p_tokens: tk }); } catch (e) { /* журнал не обязателен */ }
}
const isoDay = (iso) => new Date(Date.parse(iso) + TZ).toISOString().slice(0, 10);
// по каждому записанному человеку отдельно: если клиент записывал подругу, её визиты не смешиваются с его собственными
function histBlock() {
  const ps = ((S.hist && S.hist.people) || []).filter((p) => p.visits > 0); if (!ps.length) return '';
  const many = ps.length > 1;
  return '<section class="hist"><h2 class="hh">' + t('Журнал визитов') + '</h2>' + ps.map((p) => '<div class="panel">' + (many ? '<p class="hn">' + esc(p.name || '') + (p.tail ? ' <span class="muted">••' + esc(p.tail) + '</span>' : '') + '</p>' : '') + '<ul class="list">' +
    '<li><div class="li-main"><b>' + t('Визитов в клинику') + '</b></div><span class="num">' + p.visits + '</span></li>' +
    '<li><div class="li-main"><b>' + t('Последний визит') + '</b></div><span>' + esc(dayFull(isoDay(p.last))) + '</span></li>' +
    (p.upcoming ? '<li><div class="li-main"><b>' + t('Ближайшая запись') + '</b></div><span>' + esc(dayFull(isoDay(p.upcoming.starts_at))) + ', ' + new Date(Date.parse(p.upcoming.starts_at) + TZ).toISOString().slice(11, 16) + '</span></li>' : '') +
    (p.list || []).map((v) => '<li class="hv"><div class="li-main"><span class="small muted">' + esc(dayFull(isoDay(v.starts_at))) + (v.doctor ? ' · ' + esc(v.doctor) : '') + '</span></div></li>').join('') + '</ul></div>').join('') + '</section>';
}
// после приёма сотрудник нажимает «Прошёл»: тогда показываем клиенту благодарность
async function checkVisit() {
  let tr = null; try { tr = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); } catch (e) { /* нет записи */ }
  if (!tr || !tr.id || !tr.token) return;
  try {
    const j = await rpc('public_booking_status', { p_id: tr.id, p_token: tr.token });
    if (j.finished) { saveTrack(null); S.noshow = null; S.thanks = { name: tr.name || '' }; await loadHist(); render(); }
    else if (j.status === 'booked' && tr.snap && !tr.dismissed && !S.done && !S.pay && !S.noshow && !S.thanks && !S.resched && (j.pay_status === 'none' || j.pay_status === 'paid')) {
      S.done = { ...tr.snap, paid: j.pay_status === 'paid' }; render();
    }
    else if (j.status === 'no_show' && j.pay_status === 'paid' && !j.refunded) {
      const ns = { id: tr.id, token: tr.token, name: tr.name || '', at: j.starts_at, requested: !!j.refund_requested };
      if (!S.resched && (!S.noshow || S.noshow.requested !== ns.requested)) { S.noshow = ns; render(); }
    } else if (j.status === 'cancelled' || j.status === 'no_show') { saveTrack(null); if (S.noshow) { S.noshow = null; render(); } }
  } catch (e) { if (e && e.code === 'not_found') saveTrack(null); }
}
// Сайт не может написать клиенту сам: даём кнопку подключить уведомления в Telegram (бот привязывает запись по секретному коду)
// Push-уведомления на этот телефон: клиент разрешает один раз, сообщения приходят и при закрытом сайте
const pushOK = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => !!(navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches));
const keyBytes = (s) => { const p = '='.repeat((4 - s.length % 4) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, (c) => c.charCodeAt(0)); };
async function subscribePush(id, token) {
  const key = await rpc('public_push_key', {});
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
  await rpc('public_push_subscribe', { p_id: id, p_token: token, p_sub: sub.toJSON(), p_lang: getLang() });
}
async function enablePush() {
  let tr = null; try { tr = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); } catch (e) { /* нет записи */ }
  if (!tr || !tr.token) return;
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast(t('Уведомления запрещены в настройках браузера. Разрешите их для этого сайта и нажмите кнопку ещё раз.')); S.pushDenied = true; render(); return; }
    await subscribePush(tr.id, tr.token);
    saveTrack({ ...tr, push: true }); toast(t('Уведомления включены')); render();
  } catch (e) { toast(t('Не удалось включить уведомления. Попробуйте ещё раз.')); }
}
// у клиента уже есть разрешение: новую запись подписываем на уведомления сразу, без лишних нажатий
async function autoPush(id, token) {
  try { if (pushOK() && Notification.permission === 'granted') { await subscribePush(id, token); const tr = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); if (tr && tr.id === id) saveTrack({ ...tr, push: true }); } } catch (e) { /* без push */ }
}
function pushBlock(tr) {
  if (!pushOK()) return '';
  if (isIos() && !standalone()) return '<div class="tgnote"><p class="small">' + t('Чтобы получать уведомления на iPhone, добавьте сайт на экран «Домой» (кнопка «Поделиться» → «На экран Домой») и откройте его оттуда.') + '</p></div>';
  if (tr.push && Notification.permission === 'granted') return '<div class="tgnote"><p class="small">✅ ' + t('Уведомления на этом телефоне включены.') + '</p></div>';
  return '<div class="tgnote"><p class="small">' + t('Включите уведомления: сообщим, когда оплата подтверждена, и если вы не сможете прийти, предложим другое время.') + '</p><button type="button" class="btn" data-act="push-on">🔔 ' + t('Получать уведомления на этом телефоне') + '</button>' + (S.pushDenied ? '<p class="small muted">' + t('Разрешите уведомления для этого сайта в настройках браузера.') + '</p>' : '') + '</div>';
}
function tgNotifyBlock() {
  let tr = null; try { tr = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); } catch (e) { /* нет записи */ }
  if (!tr || !tr.token) return '';
  return pushBlock(tr) + '<div class="tgnote"><p class="small">' + t('Хотите получать сообщения о записи в Telegram? Если не сможете прийти, мы предложим другое время.') + '</p><a class="btn" href="https://t.me/mittiyurakcha_bot?start=a_' + String(tr.token).replace(/-/g, '') + '" target="_blank" rel="noopener">✈️ ' + t('Получать уведомления в Telegram') + '</a></div>';
}
function noshowScreen() {
  const n = S.noshow;
  return '<section><div class="panel thanks"><div class="thheart" aria-hidden="true">🕘</div><h2>' + t('Вы не пришли на приём') + '</h2>' + (n.name ? '<p class="thn">' + esc(n.name) + '</p>' : '') +
    '<p class="thtx">' + t('Мы ждали вас, но вы не появились в клинике. Ваша предоплата сохранена: можно выбрать другое время без повторной оплаты или вернуть деньги.') + '</p>' +
    (n.requested ? '<p class="note">' + t('Заявка на возврат принята. Клиника свяжется с вами. Если передумали, выберите другое время.') + '</p>' : '') +
    '<div class="row nsrow"><button class="btn" data-act="ns-resched">' + t('Выбрать другое время') + '</button>' + (n.requested ? '' : '<button class="btn ghost" data-act="ns-refund"' + (S.busy ? ' disabled' : '') + '>' + t('Вернуть деньги') + '</button>') + '</div></div></section>';
}
function thanksScreen() {
  const nm = S.thanks.name ? '<p class="thn">' + esc(S.thanks.name) + '</p>' : '';
  return '<section><div class="panel thanks"><div class="thheart" aria-hidden="true">💗</div><h2>' + t('Спасибо, что выбрали «Митти юрак»!') + '</h2>' + nm +
    '<p class="thtx">' + t('Благодарим вас за доверие и за то, что воспользовались нашими услугами. Мы желаем вам и вашему малышу крепкого здоровья.') + '</p>' +
    '<p class="thsm">' + t('Будем рады видеть вас снова.') + '</p>' + histBlock() +
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
  if (S.noshow && !S.resched) return noshowScreen();
  if (S.pay && S.pay.pay_status !== 'paid') return payScreen();
  if (S.done) {
    return '<section><div class="panel done"><div class="tick">✓</div><h2>' + t(S.done.paid ? 'Оплата подтверждена, вы записаны' : 'Вы записаны') + '</h2>' +
      '<ul class="list"><li><div class="li-main"><b>' + t('Дата') + '</b></div><span>' + esc(dayFull(S.done.day)) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Время') + '</b></div><span class="num">' + S.done.time + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Врач') + '</b></div><span>' + esc(docName(S.done.doctor)) + '</span></li>' +
      '<li><div class="li-main"><b>' + t('Имя') + '</b></div><span>' + esc(S.done.name) + '</span></li></ul>' +
      '<p class="note">' + t('Пожалуйста, приходите за 5 минут до приёма. Если планы изменились, позвоните в клинику, чтобы отменить запись.') + '</p>' +
      '<div class="row">' + (mapHref() ? '<a class="btn ghost" href="' + esc(mapHref()) + '" target="_blank" rel="noopener">📍 ' + t('Как добраться') + '</a>' : '') + '</div>' +
      tgNotifyBlock() + '<div class="row"><button class="btn ghost" data-act="again">' + t('Записать ещё') + '</button></div>' +
      (S.done.paid ? '' : S.cancelAsk ? '<div class="cancelbox"><p class="small">' + t('Точно отменить запись?') + '</p><div class="row"><button type="button" class="btn danger solid" data-act="cancel-yes">' + t('Да, отменить') + '</button><button type="button" class="btn ghost" data-act="cancel-no">' + t('Нет') + '</button></div></div>' : '<div class="row"><button type="button" class="btn ghost danger" data-act="cancel-ask">' + t('Отменить запись') + '</button></div>') + '</div></section>';
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
  let h = (S.resched ? '' : histBlock()) + '<h2 class="bookh">' + t(S.resched ? 'Выберите новое время' : 'Записаться на приём') + '</h2>' + (S.resched ? '<p class="small center muted">' + t('Предоплата уже внесена, платить ещё раз не нужно.') + '</p>' : '') + '<section><h2 class="stp"><i>1</i>' + t('Выберите день') + '</h2><div class="months">' + cal + '</div></section>';
  h += '<section><h2 class="stp"><i>2</i>' + t('Выберите врача') + '</h2><div class="pills" data-tour="doctors">' + S.info.doctors.map((d) => '<button type="button" class="pill" data-act="doctor" data-id="' + esc(d.id) + '" aria-pressed="' + (S.doctor === d.id) + '"' + (docWorks(d, S.day) ? '' : ' disabled title="' + esc(t('В этот день не работает')) + '"') + '><i class="dot" style="--c:' + esc(d.color) + '"></i>' + esc(d.name) + '</button>').join('') + '</div></section>';
  h += '<section><h2 class="stp"><i>3</i>' + t('Выберите время') + '</h2>';
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
  const pre = prepayOn() && !S.resched;
  if (S.resched && S.time) {
    h += '<section><div class="panel"><p class="small">' + esc(dayFull(S.day)) + ' · <b>' + S.time + '</b> · ' + esc(docName(S.doctor)) + '</p>' + (S.error ? '<p class="alert errbox" id="b-err" role="alert">⚠️ ' + esc(S.error) + '</p>' : '') + '<div class="row nsrow"><button class="btn" data-act="resched-go"' + (S.busy ? ' disabled' : '') + '>' + t(S.busy ? 'Отправляю…' : 'Перенести запись') + '</button><button class="btn ghost" data-act="resched-back">' + t('Назад') + '</button></div></div></section>';
  }
  if (!S.resched && S.time && pre) {
    h += '<section><h2 class="stp"><i>4</i>' + t('Выберите услугу') + '</h2>' + prepayNote() + '<div class="svcs">' + S.info.prepay.services.map((x) => '<button type="button" class="pill svc" data-act="svc" data-id="' + esc(x.id) + '" aria-pressed="' + (S.svc === x.id) + '"><b>' + esc(L(x.name)) + '</b><span class="num">' + t('Предоплата') + ': ' + money(x.deposit) + ' ' + t('сум') + '</span></button>').join('') + '</div></section>';
  }
  if (!S.resched && S.time && (!pre || S.svc)) {
    h += '<section><h2 class="stp"><i>' + (pre ? '5' : '4') + '</i>' + t('Ваши данные') + '</h2><div class="panel" data-tour="data">' +
      '<div class="fld"><span>' + t('Ваше имя') + '</span><input id="b-name" type="text" autocomplete="name" value="' + esc(S.name) + '"></div>' +
      '<div class="fld"><span>' + t('Телефон') + '</span><input id="b-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+998 90 123 45 67" value="' + esc(S.phone) + '"></div>' +
      '<p class="small muted">' + esc(dayFull(S.day)) + ' · <b>' + S.time + '</b> · ' + esc(docName(S.doctor)) + '</p>' +
      (pre ? '<p class="small"><b>' + esc(L((svcOf(S.svc) || {}).name)) + '</b> · ' + t('Предоплата') + ': <b class="num">' + money((svcOf(S.svc) || {}).deposit) + ' ' + t('сум') + '</b></p><label class="agree"><input type="checkbox" id="b-agree"' + (S.agree ? ' checked' : '') + '><span>' + t('Я понимаю, что оплата вносится вперёд') + '</span></label>' : '') +
      '<label class="agree"><input type="checkbox" id="b-consent"' + (S.consent ? ' checked' : '') + '><span>' + t('Я согласен на обработку персональных данных.') + ' <button type="button" class="linkbtn" data-act="legal" data-id="privacy">' + t('Политика конфиденциальности') + '</button> · <button type="button" class="linkbtn" data-act="legal" data-id="offer">' + t('Публичная оферта') + '</button></span></label>' +
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
  $('app').innerHTML = view() + legalSheet();
  if (!S.introDone) { S.introDone = true; $('app').classList.add('intro'); setTimeout(() => $('app').classList.remove('intro'), 1400); }
  // при смене экрана (форма → оплата → «записаны») возвращаемся наверх, иначе на телефоне остаётся пустой низ страницы
  const vk = S.thanks ? 'thanks' : S.noshow && !S.resched ? 'noshow' : S.resched ? 'resched' : S.pay && S.pay.pay_status !== 'paid' ? 'pay' : S.done ? 'done' : 'main';
  if (vk !== S.vk) { S.vk = vk; window.scrollTo(0, 0); if (vk === 'pay') track('pay_view', null, true); }
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
  if (act === 'day') { track('day', null, true); S.day = id; S.error = ''; await loadSlots(); }
  else if (act === 'doctor') { track('doctor', null, true); S.doctor = id; S.error = ''; await loadSlots(); }
  else if (act === 'svc') { track('service', null, true); S.svc = id; S.error = ''; render(); const n = $('b-name'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else if (act === 'copy') { track('copy_card', null, true); try { await navigator.clipboard.writeText(String(S.pay.card_number).replace(/\s/g, '')); b.textContent = t('Скопировано'); } catch (e) { /* без буфера */ } }
  else if (act === 'again-pay') { if (S.pay && S.pay.id && S.pay.pay_status === 'pending') rpc('public_cancel', { p_id: S.pay.id, p_token: S.pay.token }).catch(() => {}); S.pay = null; savePay(); S.time = ''; S.svc = ''; S.agree = false; S.error = ''; await loadDays(); await loadSlots(); render(); }
  else if (act === 'time') { track('time', null, true); S.time = id; S.svc = ''; S.error = ''; render(); const n = $('b-name'); if (n) n.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  else if (act === 'push-on') { await enablePush(); }
  else if (act === 'legal') { S.legal = id; render(); }
  else if (act === 'legal-close') { if (b === ev.target || b.classList.contains('legal-x') || b.classList.contains('btn')) { S.legal = ''; render(); } }
  else if (act === 'cancel-ask') { S.cancelAsk = true; render(); }
  else if (act === 'cancel-no') { S.cancelAsk = false; render(); }
  else if (act === 'cancel-yes') {
    let tr = null; try { tr = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); } catch (e) { /* нет записи */ }
    S.cancelAsk = false;
    if (!tr || !tr.id) { toast(t(ERR.not_found)); render(); return; }
    try { await rpc('public_cancel', { p_id: tr.id, p_token: tr.token }); saveTrack(null); S.done = null; S.time = ''; toast(t('Запись отменена')); await loadDays(); await loadSlots(); }
    catch (e) { toast(errText(e)); }
    render();
  }
  else if (act === 'ns-resched') { S.resched = { id: S.noshow.id, token: S.noshow.token, ns: S.noshow }; S.noshow = null; S.time = ''; S.error = ''; await loadDays(); await loadSlots(); render(); window.scrollTo(0, 0); }
  else if (act === 'resched-back') { S.noshow = S.resched.ns; S.resched = null; S.time = ''; render(); window.scrollTo(0, 0); }
  else if (act === 'resched-go') {
    if (S.busy) return;
    S.busy = true; S.error = ''; render();
    try {
      await rpc('public_reschedule', { p_id: S.resched.id, p_token: S.resched.token, p_doctor: S.doctor, p_start: S.day + 'T' + S.time + ':00+05:00' });
      const nm = (S.resched.ns && S.resched.ns.name) || S.name || '';
      S.done = { day: S.day, time: S.time, doctor: S.doctor, name: nm, paid: true }; S.resched = null; S.noshow = null; S.time = '';
    } catch (e) { S.error = errText(e); toast(S.error); if (e.code === 'slot_taken' || e.code === 'slot_unavailable') { await loadSlots(); S.time = ''; } }
    S.busy = false; render();
  }
  else if (act === 'ns-refund') {
    if (S.busy) return;
    S.busy = true; render();
    try { await rpc('public_refund_request', { p_id: S.noshow.id, p_token: S.noshow.token }); S.noshow.requested = true; toast(t('Заявка на возврат принята')); } catch (e) { toast(errText(e)); }
    S.busy = false; render();
  }
  else if (act === 'thanks-close') { S.thanks = null; S.done = null; S.time = ''; S.error = ''; await loadSlots(); render(); }
  else if (act === 'again') { try { const tr0 = JSON.parse(localStorage.getItem(TRACK_KEY) || 'null'); if (tr0) saveTrack({ ...tr0, dismissed: true }); } catch (e) { /* без запоминания */ } S.done = null; S.time = ''; S.error = ''; await loadSlots(); render(); }
  else if (act === 'retry') { start(); }
  else if (act === 'book') {
    if ($('b-name')) S.name = $('b-name').value; if ($('b-phone')) S.phone = $('b-phone').value;
    track('book_click');
    const fail = (m, code) => { track('book_error', { code: code || 'validation' }); S.error = m; toast(m); render(); const e = $('b-err'); if (e) e.scrollIntoView({ block: 'center', behavior: 'smooth' }); };
    if ((S.name || '').trim().length < 2) return fail(t(ERR.bad_name), 'bad_name');
    if (localDigits(S.phone).length < 9) return fail(t(ERR.bad_phone), 'bad_phone');
    if (prepayOn() && !S.svc) return fail(t(ERR.bad_service), 'no_service');
    if (!S.consent) return fail(t(ERR.consent), 'no_consent');
    if (prepayOn() && !S.agree) return fail(t('Подтвердите, что понимаете условия предоплаты.'), 'no_agree');
    S.busy = true; S.error = ''; render();
    try {
      const res = await rpc('public_book', { p_doctor: S.doctor, p_start: S.day + 'T' + S.time + ':00+05:00', p_name: S.name.trim(), p_phone: cleanPhone(S.phone), p_source: SRC, p_utm: loadUtm(), p_service: prepayOn() ? S.svc : null });
      if (res && res.id && res.token) { autoPush(res.id, res.token); addToken(res.token); rpc('public_consent', { p_id: res.id, p_token: res.token }).catch(() => {}); }
      track(res && res.deposit ? 'held' : 'done');
      if (res && res.id && res.token) saveTrack({ id: res.id, token: res.token, name: S.name.trim(), snap: { day: S.day, time: S.time, doctor: S.doctor, name: S.name.trim() } });
      if (res && res.deposit) { S.pay = { ...res, pay_status: 'pending', snap: { day: S.day, time: S.time, doctor: S.doctor, name: S.name.trim() } }; savePay(); startPolling(); }
      else S.done = { day: S.day, time: S.time, doctor: S.doctor, name: S.name.trim() };
    } catch (e) {
      track('book_error', { code: String(e.code || 'net').slice(0, 30) }); S.error = errText(e); toast(S.error); setTimeout(() => { const el = $('b-err'); if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 50);
      if (e.code === 'slot_taken' || e.code === 'slot_unavailable') { S.busy = false; await loadSlots(); S.error = errText(e); toast(S.error); const al = document.querySelector('.alert'); if (al) al.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
    }
    S.busy = false; render();
  }
});
document.addEventListener('change', async (ev) => {
  const el = ev.target;
  if (el.id === 'b-agree') { S.agree = el.checked; return; }
  if (el.id === 'b-consent') { S.consent = el.checked; return; }
  if ((el.id === 'rfile' || el.id === 'rfile2') && el.files && el.files[0]) { const f = el.files[0]; el.value = ''; await sendReceipt(f); }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'b-name' || ev.target.id === 'b-phone') track('form', null, true);
  if (ev.target.id === 'b-name') S.name = ev.target.value;
  if (ev.target.id === 'b-phone') {
    const el = ev.target, del = !!(ev.inputType && ev.inputType.indexOf('delete') === 0), pos = el.selectionStart;
    // сколько цифр номера стоит левее курсора: после форматирования курсор возвращаем туда же, чтобы можно было исправить цифру в середине
    const before = pos == null ? -1 : localDigits('+998' + el.value.slice(0, pos).replace(/^\+?\s*998/, '')).length;
    el.value = fmtPhoneInput(el.value, del); S.phone = el.value;
    if (before >= 0 && document.activeElement === el) { let n = 0, i = 0; if (before > 0) for (; i < el.value.length; i++) { if (/\d/.test(el.value[i]) && i >= 5 && ++n === before) { i++; break; } } else i = Math.min(5, el.value.length); try { el.setSelectionRange(i, i); } catch (e) { /* без курсора */ } }
  }
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
  track('receipt_pick'); p.uploading = true; p.err = ''; render();
  try {
    const image = await shrink(file);
    const r = await fetch(SUPABASE_URL + '/functions/v1/telegram-bot?op=upload', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY }, body: JSON.stringify({ id: p.id, token: p.token, image, mime: 'image/jpeg' }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { p.pay_status = 'review'; track('receipt_sent'); } else if (j.error === 'expired') p.pay_status = 'expired'; else p.err = t('Не удалось отправить чек. Попробуйте ещё раз.');
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
  initTour({ S, prepayOn, track });
  if (S.info) track('open', null, true);
  await loadHist();
  render();
  try { const hasTrack = !!localStorage.getItem(TRACK_KEY); if (!tourDone() && !hasTrack && S.info && !S.pay && !S.done) setTimeout(startTour, 1700); } catch (e) { /* без подсказок */ }
  const hb = document.getElementById('helpbtn'); if (hb) hb.addEventListener('click', () => { try { localStorage.removeItem('mitti-tour'); } catch (e) { /* не страшно */ } if (!S.done && !S.pay && !S.noshow && !S.thanks && !S.resched) { window.scrollTo(0, 0); startTour(); } });
  checkVisit();
  setInterval(() => { if (document.visibilityState === 'visible') checkVisit(); }, 20000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkVisit(); });
}
document.documentElement.style.setProperty('--bg-img', 'url(' + bgUrl + ')');
start();
