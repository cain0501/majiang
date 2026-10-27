import puppeteer from 'puppeteer-core';

const GROUP = 'mem' + Date.now();
const PAGE = 'http://127.0.0.1:8788/?g=' + GROUP;
const API = 'http://127.0.0.1:8788/api/op?g=' + GROUP;

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
});

async function openUser() {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(PAGE, { waitUntil: 'load' });
  await sleep(700);
  page._errors = errors;
  return page;
}

// ---------- A 建名单 ----------
const A = await openUser();
await A.click('[data-act="roster"]');
await sleep(300);
for (const name of ['老王', '阿强', '小陈']) {
  await A.click('[data-act="roster-add"]');
  await sleep(200);
  const idx = await A.evaluate(() => document.querySelectorAll('.row-edit').length - 1);
  await A.type('[data-row="' + idx + '"] [data-name]', name);
}
await A.click('[data-act="roster-save"]');
await sleep(800);

let mem = await A.evaluate(async () => (await (await fetch('/api/state?g=' + new URLSearchParams(location.search).get('g'))).json()).members);
ok(mem.length === 3, 'A 建的名单进了服务器：' + mem.map(m => m.name).join(','));

await A.click('.pick-item');
await sleep(400);
await A.click('[data-act="toggle"]');
await sleep(600);

// ---------- B 是另一部手机 ----------
const B = await openUser();
let tb = await B.evaluate(() => document.body.innerText);
ok(tb.includes('你是哪位'), 'B 打开直接进选身份');
ok(tb.includes('老王') && tb.includes('小陈'), 'B 看到的是 A 建的那份名单');

// B 选第二个人
const items = await B.$$('.pick-item');
await items[1].click();
await sleep(400);
await B.click('[data-act="toggle"]');
await sleep(600);
tb = await B.evaluate(() => document.body.innerText);
ok(tb.includes('第 1 桌'), 'B 报名后有一桌');

// ---------- A 轮询拿到 B ----------
await sleep(6000);
const ta = await A.evaluate(() => document.body.innerText);
ok(ta.includes('老王') && ta.includes('阿强'), 'A 5 秒内看到两个人');

// ---------- 改名字，战绩不串 ----------
await B.click('[data-act="settings"]');
await sleep(300);
await B.click('[data-act="roster"]');
await sleep(300);
await B.evaluate(() => {
  const rows = document.querySelectorAll('.row-edit');
  rows[1].querySelector('[data-name]').value = '强哥';
});
await B.click('[data-act="roster-save"]');
await sleep(900);
const tb2 = await B.evaluate(() => document.body.innerText);
ok(tb2.includes('强哥'), '改名后立刻生效');
const stillIn = await B.evaluate(() => document.body.innerText.includes('取消报名'));
ok(stillIn, '改名不会把已报名的人弄丢');

// ---------- B 退出，A 要跟着变 ----------
await B.click('[data-act="toggle"]');
await sleep(800);
await sleep(6000);
const ta2 = await A.evaluate(() => document.body.innerText);
ok(!ta2.includes('强哥'), 'B 退出后 A 5 秒内也跟着去掉');

const serverPlayers = await A.evaluate(async () => {
  const g = new URLSearchParams(location.search).get('g');
  const d = await (await fetch('/api/state?g=' + g)).json();
  return d.session.players.filter(p => !p.cancelled).length;
});
ok(serverPlayers === 1, '服务器上确实只剩 1 个人：' + serverPlayers);

// ---------- 补到 6 人，拍图 ----------
const names = ['老王', '强哥', '小陈', '李姐', '周哥', '胖子'];
const list = await B.evaluate(async () => (await (await fetch('/api/state?g=' + new URLSearchParams(location.search).get('g'))).json()));
const ids = list.members.map(m => m.id);
await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ t: 'members', list: names.map((n, i) => ({ id: 'm' + i, name: n, emoji: ['🀄','🐯','🐼','🦊','🍺','🍉'][i], color: '' })) }) });
for (let i = 0; i < 6; i++) {
  await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ t: 'join', memberId: 'm' + i }) });
}

const C = await openUser();
await C.evaluate(() => localStorage.clear());
await C.reload({ waitUntil: 'load' });
await sleep(800);
await C.screenshot({ path: 'shot-pick.png' });
await C.click('.pick-item');
await sleep(400);
const tc = await C.evaluate(() => document.body.innerText);
ok(tc.includes('第 1 桌') && tc.includes('第 2 桌'), '6 人两桌');
ok(tc.includes('2/4 · 还差 2'), '第 2 桌 2/4 还差 2');
await C.screenshot({ path: 'shot-cloud-signup.png', fullPage: true });

const allErr = [...A._errors, ...B._errors, ...C._errors];
console.log('\nJS 错误：', allErr.length ? allErr : '无');
await browser.close();
console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
