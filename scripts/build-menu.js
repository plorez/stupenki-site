// Берёт меню из public/index.html и делает файл для сервера (цены проверяются на сервере).
const fs = require('fs'), path = require('path');
const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');
const m = html.match(/const D=(\{[\s\S]*?\});\s*const tabs=/);
if (!m) { console.error('Не нашёл меню в index.html'); process.exit(1); }
const D = new Function('return ' + m[1])();
// Эта функция должна совпадать с variants() на сайте.
function variants(r){const p=r[2].split('/'),v=r[1].replace(' мл','').split('/'),n=r[0].split(' / ');if(p.length==1)return[{l:'',p:p[0]}];if(r[1]&&v.length==p.length)return p.map((x,i)=>({l:v[i]+' мл',p:x}));if(n.length==p.length)return p.map((x,i)=>({l:n[i],p:x}));return p.map(x=>({l:'',p:x}))}
const out = {};
for (const [cat, rows] of Object.entries(D)) for (const r of rows) { if (r[0]==='#'||r[0]==='!'||r[0]==='##') continue; for (const v of variants(r)) {
  out[cat + '|' + (r[4]||r[0]) + '|' + v.l] = { n: (r[4]||r[0]), l: v.l, p: Math.round(parseFloat(v.p) * 10) };
} }
fs.writeFileSync(path.join(__dirname, '../netlify/functions/menu.json'), JSON.stringify(out, null, 1));
console.log('Позиций в меню для сервера:', Object.keys(out).length);
