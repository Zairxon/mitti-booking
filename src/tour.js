// Первый вход: затемняем экран, подсвечиваем нужный блок и объясняем, что делать. Шаг ждёт нажатия на подсвеченное или кнопки «Далее».
import { t } from './i18n.js';

const KEY = 'mitti-tour';
let poll = 0, C = null, step = -1, root = null, hole = null, tip = null, blockers = [], shown = false, obs = null, tmo = 0;

export const tourDone = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return true; } };
export const tourActive = () => step >= 0;

const steps = () => {
  const S = C.S, list = [
    { intro: true, title: t('Как записаться за минуту'), text: t('Покажем, как выбрать день, врача и время. Это займёт меньше минуты.'), ok: t('Начать') },
    { sel: '.months', adv: '[data-act=day]', title: t('Шаг 1. Выберите день'), text: t('Нажмите на удобное число в календаре. Если подходит выбранный день, нажмите «Далее».'), done: () => true },
    { sel: '[data-tour=doctors]', adv: '[data-act=doctor]', skip: () => S.info.doctors.length <= 1 && !!S.doctor, title: t('Шаг 2. Выберите врача'), text: t('Нажмите на имя врача.'), done: () => !!S.doctor, need: t('Сначала выберите врача') },
    { sel: '.times', adv: '[data-act=time]', title: t('Шаг 3. Выберите время'), text: t('Нажмите на свободное время.'), done: () => !!S.time, need: t('Сначала выберите время') },
  ];
  if (C.prepayOn()) list.push({ sel: '.svcs', adv: '[data-act=svc]', title: t('Шаг 4. Выберите услугу'), text: t('От услуги зависит сумма предоплаты. Нажмите на нужную.'), done: () => !!S.svc, need: t('Сначала выберите услугу') });
  list.push({ sel: '[data-tour=data]', adv: '[data-act=book]', last: true, title: t('Последний шаг'), text: t('Введите имя и телефон и нажмите кнопку записи. Запись сохранится на этом телефоне.'), done: () => true, ok: t('Понятно') });
  return list;
};

function build() {
  root = document.createElement('div'); root.className = 'tour'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
  hole = document.createElement('div'); hole.className = 'tour-hole';
  tip = document.createElement('div'); tip.className = 'tour-tip';
  blockers = [0, 1, 2, 3].map(() => { const b = document.createElement('div'); b.className = 'tour-block'; return b; });
  root.append(...blockers, hole, tip);
  document.body.appendChild(root);
  tip.addEventListener('click', (e) => {
    const a = e.target.closest('[data-tour-act]'); if (!a) return;
    if (a.dataset.tourAct === 'skip') finish(); else if (a.dataset.tourAct === 'next') next();
  });
}

function render() {
  const list = steps(), s = list[step]; if (!s) { finish(); return; }
  if (!s.intro && s.skip && s.skip()) { step++; return render(); }
  const el = s.intro ? null : document.querySelector(s.sel);
  if (!s.intro && (!el || !el.getClientRects().length)) { root.style.display = 'none'; return; } // нужный блок ещё не появился
  root.style.display = '';
  const total = list.length - 1, idx = Math.max(0, list.slice(0, step).filter((x) => !(x.skip && x.skip())).length);
  const canNext = s.intro || !s.done || s.done();
  const dots = s.intro ? '' : '<span class="tour-dots">' + t('Шаг {n} из {m}', { n: idx, m: list.filter((x) => !x.intro && !(x.skip && x.skip())).length }) + '</span>';
  tip.innerHTML = dots + '<b>' + s.title + '</b><p>' + s.text + '</p>' + (!canNext && s.need ? '<p class="tour-need">' + s.need + '</p>' : '') +
    '<div class="tour-btns"><button type="button" class="tour-skip" data-tour-act="skip">' + t('Пропустить') + '</button><button type="button" class="tour-next" data-tour-act="next"' + (canNext ? '' : ' disabled') + '>' + (s.ok || t('Далее')) + '</button></div>';
  if (s.intro) { place(null); return; }
  if (!shown) { shown = true; const r = el.getBoundingClientRect(), th = tip.offsetHeight || 160; if (r.height > innerHeight - th - 60) window.scrollTo({ top: Math.max(0, scrollY + r.top - 24), behavior: 'smooth' }); else if (r.top < 70 || r.bottom > innerHeight - th - 30) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  place(el);
}

function place(el) {
  if (!root || !tip) return;
  const vw = innerWidth, vh = innerHeight;
  if (!el) { // вступление: весь экран затемнён, карточка по центру
    hole.style.cssText = 'left:50%;top:50%;width:0;height:0'; blockers.forEach((b) => { b.style.cssText = 'left:0;top:0;width:100%;height:100%'; });
    tip.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%)'; return;
  }
  const r = el.getBoundingClientRect(), pad = 8, th = tip.offsetHeight || 150;
  const dock = r.bottom + pad + 12 + th > vh - 8 && r.top - pad - 12 - th < 8; // ни снизу, ни сверху места нет: карточка внизу экрана, подсветка только над ней
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad), w = Math.min(vw - 8, r.width + pad * 2), h = dock ? Math.max(40, Math.min(r.bottom + pad, vh - th - 20) - y) : r.height + pad * 2;
  hole.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + w + 'px;height:' + h + 'px';
  const set = (b, l, tp, bw, bh) => { b.style.cssText = 'left:' + l + 'px;top:' + tp + 'px;width:' + Math.max(0, bw) + 'px;height:' + Math.max(0, bh) + 'px'; };
  set(blockers[0], 0, 0, vw, y); set(blockers[1], 0, y + h, vw, vh - y - h); set(blockers[2], 0, y, x, h); set(blockers[3], x + w, y, vw - x - w, h);
  const below = y + h + 12 + th <= vh, tl = Math.min(Math.max(12, x), vw - Math.min(340, vw - 24) - 12);
  tip.style.transform = 'none'; tip.style.left = tl + 'px';
  tip.style.top = (dock ? vh - th - 8 : below ? y + h + 12 : Math.max(8, y - th - 12)) + 'px';
}

function onClick(e) {
  if (step < 0) return;
  const s = steps()[step]; if (!s || !s.adv) return;
  if (e.target.closest && e.target.closest(s.adv)) setTimeout(() => { if (step >= 0) next(true); }, 80);
}

function next(fromClick) {
  const s = steps()[step]; if (!s) return finish();
  if (!fromClick && s.done && !s.done()) return;
  if (s.last || step >= steps().length - 1) return finish();
  step++; shown = false; render();
}

function sync() { clearTimeout(tmo); tmo = setTimeout(() => { if (step >= 0 && root) render(); }, 60); }
// пока идёт подсказка, страницу не прокрутить (колесом, пальцем, клавишами): только программная прокрутка к нужному блоку
const lockOn = () => step >= 0 && root && root.style.display !== 'none';
const stop = (e) => { if (lockOn() && e.cancelable) e.preventDefault(); };
const stopKey = (e) => { if (lockOn() && [' ', 'PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].indexOf(e.key) >= 0 && !/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test((e.target && e.target.tagName) || '')) e.preventDefault(); };
const onMove = () => { if (step >= 0 && root && root.style.display !== 'none') { const s = steps()[step]; place(s && !s.intro ? document.querySelector(s.sel) : null); } };

function finish() {
  try { localStorage.setItem(KEY, '1'); } catch (e) { /* не страшно */ }
  step = -1; shown = false;
  if (obs) { obs.disconnect(); obs = null; }
  clearInterval(poll);
  document.removeEventListener('click', onClick, true); removeEventListener('wheel', stop, { capture: true }); removeEventListener('touchmove', stop, { capture: true }); removeEventListener('keydown', stopKey, true); removeEventListener('resize', onMove); removeEventListener('scroll', onMove, true);
  if (root) { root.remove(); root = null; }
}

export function initTour(ctx) { C = ctx; }
export function startTour() {
  if (!C || step >= 0) return;
  step = 0; shown = false; build(); render();
  document.addEventListener('click', onClick, true); addEventListener('wheel', stop, { capture: true, passive: false }); addEventListener('touchmove', stop, { capture: true, passive: false }); addEventListener('keydown', stopKey, true); addEventListener('resize', onMove); addEventListener('scroll', onMove, true);
  obs = new MutationObserver(sync); obs.observe(document.getElementById('app'), { childList: true, subtree: true });
  poll = setInterval(onMove, 250);
}
export const tourSync = sync;
