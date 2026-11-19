// Проверка приёма заказов без интернета: Telegram подменён имитацией.
const assert = require('assert');
process.env.TELEGRAM_BOT_TOKEN = 'TEST_TOKEN_123';
process.env.TELEGRAM_CHAT_ID = '42';
const { handler } = require('../netlify/functions/order.js');
const MENU = require('../netlify/functions/menu.json');
let sent = [], tgStatus = 200;
global.fetch = async (url, opt) => { sent.push({ url, body: JSON.parse(opt.body) }); return { ok: tgStatus === 200, status: tgStatus, json: async () => ({ description: 'x' }) }; };
const post = (b, method = 'POST') => handler({ httpMethod: method, body: typeof b === 'string' ? b : JSON.stringify(b) });
const good = () => ({ name: 'Тест', phone: '+375 29 123-45-67', how: 'С собой', note: 'без сахара <b>', items: [{ id: 'Кофе|Капучино|350 мл', q: 2 }, { id: 'Лето|Мохито|', q: 1 }] });
const run = async (name, fn) => { sent = []; tgStatus = 200; await fn(); console.log('ok  ', name); };
(async () => {
  await run('меню на сервере не пустое', async () => assert(Object.keys(MENU).length > 60));
  await run('верный заказ уходит в Telegram с пересчитанной суммой', async () => {
    const r = await post(good()), j = JSON.parse(r.body);
    assert.equal(r.statusCode, 200); assert(j.ok && j.test);
    assert.equal(sent.length, 1); assert(sent[0].url.includes('TEST_TOKEN_123'));
    const t = sent[0].body.text; assert(t.includes('ТЕСТОВЫЙ') && t.includes('Итого: 23.0 BYN') && t.includes('&lt;b&gt;'));
    assert(!r.body.includes('TEST_TOKEN_123'));
  });
  await run('режим live убирает пометку ТЕСТ', async () => {
    process.env.ORDER_MODE = 'live'; const j = JSON.parse((await post(good())).body); delete process.env.ORDER_MODE;
    assert.equal(j.test, false); assert(!sent[0].body.text.includes('ТЕСТОВЫЙ'));
  });
  await run('новые чаи есть, старые дубли убраны', async () => {
    for (const id of ['Чай|Чёрный чай: бергамот|350 мл','Чай|Зелёный чай: жасмин|700 мл','Чай|Зелёный чай: 7 самураев (фруктовый)|350 мл','Чай|Ройбуш|350 мл','Чай|Гречишный чай|700 мл','Чай|Чай на основе пюре: облепиховый|']) assert(MENU[id], id);
    for (const id of ['Кофе|Чай листовой|350 мл','Сезонное|Чай облепиха|','Чай|Чай облепиха|']) assert(!MENU[id], id);
    assert.equal(MENU['Чай|Зелёный чай: жасмин|700 мл'].p, 75); assert.equal(MENU['Чай|Чай на основе пюре: клюквенный|'].p, 80);
    const r = await post({ ...good(), items: [{ id: 'Чай|Чёрный чай: бергамот|700 мл', q: 1 }, { id: 'Чай|Чай на основе пюре: облепиховый|', q: 2 }] });
    assert.equal(r.statusCode, 200); assert(sent[0].body.text.includes('Итого: 23.5 BYN') && sent[0].body.text.includes('Чёрный чай: бергамот (700 мл)'));
  });
  await run('CORS: GitHub Pages разрешён, чужой сайт и предзапрос', async () => {
    const withH = (origin, extra = {}) => handler({ httpMethod: 'POST', headers: { origin, host: 'shop.netlify.app', ...extra }, body: JSON.stringify(good()) });
    let r = await withH('https://plorez.github.io'); assert.equal(r.statusCode, 200); assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://plorez.github.io');
    sent = []; r = await withH('https://evil.example'); assert.equal(r.statusCode, 403); assert.equal(sent.length, 0); assert(!r.headers['Access-Control-Allow-Origin']);
    r = await withH('https://shop.netlify.app'); assert.equal(r.statusCode, 200);
    r = await handler({ httpMethod: 'OPTIONS', headers: { origin: 'https://plorez.github.io', host: 'shop.netlify.app' } }); assert.equal(r.statusCode, 204); assert(r.headers['Access-Control-Allow-Methods'].includes('POST'));
  });
  await run('GET запрещён', async () => assert.equal((await post('', 'GET')).statusCode, 405));
  await run('битый JSON', async () => assert.equal((await post('{oops')).statusCode, 400));
  await run('пустая корзина', async () => assert.equal((await post({ ...good(), items: [] })).statusCode, 400));
  await run('неизвестная позиция', async () => assert.equal((await post({ ...good(), items: [{ id: 'Кофе|Выдумка|', q: 1 }] })).statusCode, 400));
  await run('подделка цены игнорируется', async () => { await post({ ...good(), items: [{ id: 'Лето|Мохито|', q: 1, p: 1 }] }); assert(sent[0].body.text.includes('Итого: 9.0 BYN')); });
  await run('плохое количество', async () => { for (const q of [0, -1, 1.5, 21, '2']) assert.equal((await post({ ...good(), items: [{ id: 'Лето|Мохито|', q }] })).statusCode, 400); });
  await run('плохой телефон и пустое имя', async () => { assert.equal((await post({ ...good(), phone: 'abc' })).statusCode, 400); assert.equal((await post({ ...good(), name: ' ' })).statusCode, 400); });
  await run('ловушка для ботов: ничего не отправляется', async () => { const r = await post({ ...good(), website: 'spam.com' }); assert.equal(r.statusCode, 200); assert.equal(sent.length, 0); });
  await run('ошибка Telegram даёт 502 без утечки токена', async () => { tgStatus = 401; const r = await post(good()); assert.equal(r.statusCode, 502); assert(!r.body.includes('TEST_TOKEN_123')); });
  await run('нет настроек: 500', async () => { const t = process.env.TELEGRAM_BOT_TOKEN; delete process.env.TELEGRAM_BOT_TOKEN; const r = await post(good()); process.env.TELEGRAM_BOT_TOKEN = t; assert.equal(r.statusCode, 500); });
  console.log('\nВсе проверки пройдены');
})().catch((e) => { console.error('ОШИБКА:', e.message); process.exit(1); });
