// Приём заказов: проверяет заказ и отправляет его в Telegram.
// Секреты берутся только из настроек Netlify (переменные окружения), в коде их нет.
const MENU = require('./menu.json'); // создаётся из меню на сайте: scripts/build-menu.js

const MAX_ITEMS = 30;
const MAX_QTY = 20;

const baseReply = (code, obj, extra) => ({
  statusCode: code,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  body: JSON.stringify(obj),
});
const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const clean = (s, n) => String(s == null ? '' : s).replace(/[\x00-\x1f\x7f]+/g, ' ').trim().slice(0, n);
const money = (t) => (t / 10).toFixed(1) + ' BYN';

exports.handler = async (event) => {
  // Кто может отправлять заказы с другого сайта (например, с GitHub Pages). Список меняется в настройках Netlify: ALLOWED_ORIGINS.
  const h = event.headers || {};
  const origin = h.origin || h.Origin || '';
  const host = h.host || h.Host || '';
  const allowed = (process.env.ALLOWED_ORIGINS || 'https://plorez.github.io').split(',').map((x) => x.trim()).filter(Boolean);
  let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === host; } catch (e) { /* игнорируем */ }
  const cors = origin && allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    : { Vary: 'Origin' };
  const reply = (code, obj) => baseReply(code, obj, cors);
  if (origin && !sameOrigin && !allowed.includes(origin)) return reply(403, { ok: false, error: 'origin' });
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: cors, body: '' };

  if (event.httpMethod !== 'POST') return reply(405, { ok: false, error: 'method' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.error('Не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_CHAT_ID');
    return reply(500, { ok: false, error: 'config' });
  }

  const raw = String(event.body || '');
  if (raw.length > 10000) return reply(413, { ok: false, error: 'too_big' });
  let d;
  try { d = JSON.parse(raw); } catch (e) { return reply(400, { ok: false, error: 'bad_json' }); }
  if (!d || typeof d !== 'object') return reply(400, { ok: false, error: 'bad_json' });

  // Скрытое поле-ловушка для ботов: люди его не заполняют.
  if (d.website) return reply(200, { ok: true, id: '0000' });

  const name = clean(d.name, 60);
  const phone = clean(d.phone, 30);
  const note = clean(d.note, 300);
  const how = d.how === 'В кофейне' ? 'В кофейне' : 'С собой';
  const digits = phone.replace(/\D/g, '');
  if (!name) return reply(400, { ok: false, error: 'name' });
  if (!/^[+\d\s()\-]+$/.test(phone) || digits.length < 7 || digits.length > 15) {
    return reply(400, { ok: false, error: 'phone' });
  }

  // Цены берём из нашего меню, а не из браузера, чтобы их нельзя было подделать.
  if (!Array.isArray(d.items) || d.items.length < 1 || d.items.length > MAX_ITEMS) {
    return reply(400, { ok: false, error: 'items' });
  }
  const lines = new Map();
  for (const it of d.items) {
    const id = clean(it && it.id, 160);
    const q = it && it.q;
    const m = Object.prototype.hasOwnProperty.call(MENU, id) ? MENU[id] : null;
    if (!m || !Number.isInteger(q) || q < 1 || q > MAX_QTY) return reply(400, { ok: false, error: 'items' });
    const prev = lines.get(id);
    const total = (prev ? prev.q : 0) + q;
    if (total > MAX_QTY) return reply(400, { ok: false, error: 'items' });
    lines.set(id, { m, q: total });
  }

  let sum = 0;
  const rows = [];
  for (const { m, q } of lines.values()) {
    sum += m.p * q;
    rows.push(`• ${esc(m.n)}${m.l ? ' (' + esc(m.l) + ')' : ''} × ${q} — ${money(m.p * q)}`);
  }

  const test = (process.env.ORDER_MODE || 'test') !== 'live';
  const orderId = Date.now().toString(36).slice(-4).toUpperCase();
  const when = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Minsk' });
  const text = [
    test ? '🧪 <b>ТЕСТОВЫЙ ЗАКАЗ</b>' : '☕ <b>Новый заказ</b>',
    `№ ${orderId} · ${when}`,
    '',
    ...rows,
    '',
    `<b>Итого: ${money(sum)}</b>`,
    `Получение: ${how}`,
    `Имя: ${esc(name)}`,
    `Телефон: ${esc(phone)}`,
    note ? `Комментарий: ${esc(note)}` : null,
  ].filter((x) => x !== null).join('\n');

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      const info = await res.json().catch(() => ({}));
      console.error('Telegram ответил ошибкой', res.status, info.description || '');
      return reply(502, { ok: false, error: 'telegram' });
    }
  } catch (e) {
    console.error('Не удалось связаться с Telegram:', e && e.name);
    return reply(502, { ok: false, error: 'telegram' });
  } finally {
    clearTimeout(timer);
  }
  return reply(200, { ok: true, id: orderId, test });
};
