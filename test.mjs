import puppeteer from 'puppeteer-core';

let fails = 0;
const ok = (c, m) => { console.log((c ? '  PASS  ' : '  FAIL  ') + m); if (!c) fails++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
});

const page = await browser.newPage();
await page.setViewport({ width: 430, height: 932, deviceScaleFactor: 2 });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto('file:///E:/majiang/index.html', { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await sleep(400);

// ---------- 1. 第一次进来应该让你选身份 ----------
let text = await page.evaluate(() => document.body.innerText);
ok(text.includes('你是哪位'), '第一次打开弹出「你是哪位」');
ok(text.includes('还没有成员名单'), '名单为空时给出提示');

// ---------- 2. 建名单 ----------
await page.click('[data-act="roster"]');
await page.waitForSelector('.row-edit', { timeout: 2000 }).catch(() => {});
await page.click('[data-act="roster-add"]');
await sleep(200);
await page.type('[data-row="0"] [data-name]', '老王');
await page.select('[data-row="0"] [data-emoji]', '🐯');
await page.click('[data-act="roster-add"]');
await sleep(200);
await page.type('[data-row="1"] [data-name]', '阿强');
await page.click('[data-act="roster-add"]');
await sleep(200);
await page.type('[data-row="2"] [data-name]', '小陈');
await page.screenshot({ path: 'shot-roster.png' });
await page.click('[data-act="roster-save"]');
await sleep(500);

const mem = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).members);
ok(mem.length === 3, '名单存了 3 个人：' + mem.map(m => m.name).join(','));
ok(mem[0].emoji === '🐯', '老王的头像表情存下来了');
ok(!!mem[0].color, '每个人有自动生成的颜色');

// ---------- 3. 选身份 ----------
text = await page.evaluate(() => document.body.innerText);
ok(text.includes('你是哪位'), '保存后回到选人界面');
ok(text.includes('老王') && text.includes('阿强'), '选人界面列出名单');
await page.screenshot({ path: 'shot-who.png' });

await page.click('.pick-item');
await sleep(400);
text = await page.evaluate(() => document.body.innerText);
ok(text.includes('老王'), '选中后头部显示「老王」');
ok(text.includes('聚会/活动报名'), '主标题使用通用活动文案');

const mid = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).memberId);
ok(!!mid, '身份绑定到了本机');

// ---------- 4. 报名 ----------
await page.click('[data-act="join-room"]');
await sleep(400);
text = await page.evaluate(() => document.body.innerText);
ok(text.includes('取消报名'), '报名后按钮变「取消报名」');
const st = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).session.players);
ok(st.length === 1 && st[0].memberId === mid, '报名记录存的是成员 id 而不是名字');

// ---------- 5. 一间房间 3 人，检查房间 ----------
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('mj_signup_v1'));
  const base = Date.now() - 600000;
  const roomId = s.session.rooms[0].id;
  s.session.players = s.members.map((m, i) => ({
    memberId: m.id, roomId, joinedAt: base + i * 60000, cancelled: false
  }));
  s.session.startAt = Date.now() + 5 * 3600 * 1000;
  localStorage.setItem('mj_signup_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'load' });
await sleep(500);
text = await page.evaluate(() => document.body.innerText);
ok(text.includes('房间 1'), '3 人显示房间 1');
ok(text.includes('3/4 · 还差 1'), '房间 1 显示 3/4 还差 1');
ok(text.includes('🐯') || text.includes('老'), '座位上有头像');
await page.click('[data-act="add-room"]');
await sleep(350);
const addedRoomCount = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).session.rooms.length);
ok(addedRoomCount === 2, '点击加号后立即新增第 2 个房间');

// ---------- 6. 按房间记分 ----------
await page.click('[data-act="settings"]');
await sleep(300);
await page.click('[data-act="open-score"]');
await sleep(350);
let sheetTxt = await page.evaluate(() => document.querySelector('.sheet').innerText);
ok(sheetTxt.includes('房间 1') && sheetTxt.includes('未录'), '记分面板按房间列出，标着未录');

await page.click('[data-act="score-table"]');
await sleep(350);
const nInputs = await page.$$eval('[data-score]', els => els.length);
ok(nInputs === 3, '这一桌 3 个人就出 3 个框：' + nInputs);

await page.evaluate(() => document.querySelectorAll('[data-score]').forEach(el => el.value = ''));
await page.type('[data-score="0"]', '50');
await page.evaluate(() => {
  document.querySelector('[data-score="1"]').value = '-20';
  document.querySelector('[data-score="2"]').value = '-30';
  updateSum();
});
await sleep(200);
ok(await page.evaluate(() => document.getElementById('sum').textContent) === '0', '填完合计正好 0');
ok(await page.evaluate(() => document.getElementById('save-score-btn').textContent) === '存进战绩', '归零时按钮是「存进战绩」');

// 故意填错，按钮应该变成提醒
await page.evaluate(() => { document.querySelector('[data-score="0"]').value = '99'; updateSum(); });
await sleep(200);
ok(await page.evaluate(() => document.getElementById('sum').textContent) === '+49', '合计实时跟着变：+49');
ok((await page.evaluate(() => document.getElementById('save-score-btn').textContent)).includes('仍然保存'), '不归零时按钮改成提醒文案');

// 改回正确值再存
await page.evaluate(() => { document.querySelector('[data-score="0"]').value = '50'; updateSum(); });
await sleep(150);
await page.click('[data-act="save-score"]');
await sleep(600);
sheetTxt = await page.evaluate(() => document.querySelector('.sheet').innerText);
ok(sheetTxt.includes('合计 0'), '存完回到列表，显示合计 0');
ok(sheetTxt.includes('改') && sheetTxt.includes('删'), '已录的桌有「改」和「删」');
await page.screenshot({ path: 'shot-score.png' });

await page.click('[data-act="close"]');
await sleep(300);
await page.click('[data-act="tab"][data-tab="rank"]');
await sleep(400);
text = await page.evaluate(() => document.body.innerText);
ok(text.includes('+50'), '排行显示得分 +50');
ok(text.includes('胜率 100%'), '胜率计算正确');

// 同一房间重新录，应该覆盖而不是累加
await page.click('[data-act="tab"][data-tab="signup"]');
await sleep(250);
await page.click('[data-act="settings"]');
await sleep(300);
await page.click('[data-act="open-score"]');
await sleep(300);
await page.click('[data-act="score-table"]');
await sleep(300);
await page.evaluate(() => {
  const v = ['80', '-40', '-40'];
  document.querySelectorAll('[data-score]').forEach((el, i) => el.value = v[i]);
  updateSum();
});
await page.click('[data-act="save-score"]');
await sleep(600);
let hist = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).history);
ok(hist.length === 1, '同一房间重录是覆盖，不会变成两条：' + hist.length);
ok(hist[0].results[0].score === 80, '分数被覆盖成 80');
ok(!!hist[0].roomId && hist[0].roomNo === '1', '记录里带着房间 id 和房间号');

// 删掉这条
await page.click('[data-act="unscore"]');
await sleep(600);
hist = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).history);
ok(hist.length === 0, '删掉后战绩清零');

// ---------- 7. 报名之后必须能退出 ----------
async function seed(startAt, joined){
  await page.evaluate(({ startAt, joined }) => {
    const members = [1, 2, 3, 4].map(i => ({ id: 'm' + i, name: i === 1 ? '老王' : '成员' + i, emoji: '', color: 'hsl(' + i * 60 + ',58%,63%)', credit: 100 }));
    localStorage.setItem('mj_signup_v1', JSON.stringify({
      members,
      session: {
        id: 's1', title: '测试局', startAt, venue: '棋牌室', capacity: 16, deadlineMin: 120,
        players: joined ? members.map((member, index) => ({ memberId: member.id, joinedAt: Date.now() - 7200000 + index, cancelled: false })) : [],
        results: null
      },
      history: [],
      memberId: joined ? 'm1' : null
    }));
  }, { startAt, joined });
  await page.reload({ waitUntil: 'load' });
  await sleep(450);
}

const btnState = () => page.$eval('[data-act="toggle"]', el => ({ t: el.textContent.trim(), d: el.disabled }));

await seed(Date.now() + 10 * 3600 * 1000, false);
await page.click('.pick-item');
await sleep(300);
await page.click('[data-act="join-room"]');
await sleep(400);
let bs = await btnState();
ok(bs.t === '取消报名' && bs.d === false, '截止前：取消按钮可点');
await page.click('[data-act="toggle"]');
await sleep(500);
bs = await btnState();
ok(bs.t === '请在房间卡片报名', '点一下就退出了');

await seed(Date.now() - 3600 * 1000, true);
bs = await btnState();
ok(bs.t === '取消报名' && bs.d === false, '开台之后：取消按钮依然可点（原来这里是禁用的）');
await page.click('[data-act="toggle"]');
await sleep(450);
ok(await page.evaluate(() => !!document.querySelector('.sheet')), '开台后退出会先弹确认');
await page.click('[data-act="confirm-ok"]');
await sleep(600);
bs = await btnState();
ok(bs.t === '请在房间卡片报名' && bs.d === true, '确认后真的退出了');
const stillJoined = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).session.players.some(p => p.memberId === 'm1' && !p.cancelled));
ok(stillJoined === false, '本地记录也真的没了');
const credit = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).members[0].credit);
ok(credit === 90, '放鸽子扣了 10 点信用，记在成员身上：' + credit);

// ---------- 8. 信用分跨局不清零 ----------
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('mj_signup_v1'));
  s.session.players = [];
  localStorage.setItem('mj_signup_v1', JSON.stringify(s));
});
await page.reload({ waitUntil: 'load' });
await sleep(500);
const credit2 = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).members[0].credit);
ok(credit2 === 90, '清空本场报名后，信用分还是 90：' + credit2);

// ---------- 9. 房间数量由设置决定 ----------
await page.evaluate(() => {
  const names = ['老王', '阿强', '小陈', '李姐', '周哥', '胖子'];
  const now = Date.now();
  const members = names.map((n, i) => ({ id: 'm' + i, name: n, emoji: '', color: 'hsl(' + (i * 60) + ',58%,63%)', credit: 100 }));
  localStorage.setItem('mj_signup_v1', JSON.stringify({
    members,
    session: {
      id: 'sess1', title: '周五聚会', startAt: now + 8 * 3600 * 1000, venue: '棋牌室',
      capacity: 16, deadlineMin: 120,
      players: members.map((m, i) => ({ memberId: m.id, joinedAt: now - 600000 + i * 60000, cancelled: false })),
      results: null
    },
    history: [{
      id: 'h1', sessionId: 'sess1', tableNo: 1, title: '周五聚会', date: now,
      results: members.slice(0, 4).map((m, i) => ({ memberId: m.id, score: [120, -40, 30, -110][i] }))
    }],
    memberId: 'm0'
  }));
});
await page.reload({ waitUntil: 'load' });
await sleep(500);
text = await page.evaluate(() => document.body.innerText);
ok(text.includes('房间 1') && text.includes('房间 2'), '6 个人在两个已开放房间中分配');

// ---------- 10. 用户可以换到有空位的房间 ----------
await page.click('.bar [data-act="move-table"]');
await sleep(300);
const moveOptions = await page.$$eval('.sheet [data-act="move-to"]', els => els.map((el, i) => ({
  no: String(i + 1),
  disabled: el.disabled,
  text: el.textContent
})));
ok(moveOptions.some(x => x.no === '1' && x.disabled), '已满的房间 1 不能换入');
ok(moveOptions.some(x => x.no === '2' && !x.disabled), '有空位的房间 2 可以换入');
await page.click('.sheet [data-act="move-to"]:not([disabled])');
await sleep(400);
const moved = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('mj_signup_v1'));
  const player = s.session.players.find(p => p.memberId === 'm0' && !p.cancelled);
  return player && player.roomId;
});
const room2Id = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).session.rooms[1].id);
ok(moved === room2Id, '换房间后报名记录保存了房间 2');

// ---------- 11. 群主可以设置开放房间数和房间号 ----------
await page.click('[data-act="settings"]');
await sleep(300);
await page.click('.sheet [data-act="add-room"]');
await sleep(350);
await page.$eval('[data-room-no="0"]', el => { el.value = 'A101'; });
await page.$eval('[data-room-no="1"]', el => { el.value = 'A102'; });
await page.$eval('[data-room-no="2"]', el => { el.value = 'A103'; });
await page.$eval('[data-room-title="0"]', el => { el.value = '国粹研究'; });
await page.$eval('[data-room-venue="0"]', el => { el.value = '源昌花园'; });
await page.$eval('[data-room-duration="0"]', el => { el.value = '240'; });
await page.click('[data-act="save-settings"]');
await sleep(500);
const roomConfig = await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('mj_signup_v1'));
  return { rooms: s.session.rooms, capacity: s.session.capacity };
});
ok(roomConfig.rooms.length === 3 && roomConfig.capacity === 12, '开放房间数保存为 3 个');
ok(roomConfig.rooms.map(r => r.roomNo).join(',') === 'A101,A102,A103', '房间号保存成功');
ok(roomConfig.rooms[0].title === '国粹研究' && roomConfig.rooms[0].venue === '源昌花园' && roomConfig.rooms[0].durationMin === 240, '房间标题、地点和时长保存成功');
await page.click('.room-card [data-act="edit-room"]');
await sleep(250);
await page.$eval('#edit-room-title', el => { el.value = '周末聚会'; });
await page.click('[data-act="save-room-edit"]');
await sleep(400);
const editedRoomTitle = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')).session.rooms[0].title);
ok(editedRoomTitle === '周末聚会', '可以直接编辑当前房间');

// ---------- 12. 房间信息独立维护 ----------
await page.click('[data-act="settings"]');
await sleep(300);
const settingsText = await page.evaluate(() => document.querySelector('.sheet').innerText);
ok(settingsText.includes('房间号') && settingsText.includes('开打时长'), '设置里显示房间独立信息');
await page.click('[data-act="open-score"]');
await sleep(400);
const scTxt = await page.evaluate(() => document.querySelector('.sheet').innerText);
ok(scTxt.includes('A101') && scTxt.includes('合计 0'), '房间记分按房间号显示');
await page.click('[data-act="close"]');
await sleep(300);

// ---------- 13. 房间结束后自动归档到历史 ----------
await page.evaluate(() => {
  const now = Date.now();
  localStorage.setItem('mj_signup_v1', JSON.stringify({
    members: [1, 2, 3, 4].map(i => ({ id: 'm' + i, name: '成员' + i, emoji: '', color: 'hsl(' + i * 60 + ',58%,63%)', credit: 100 })),
    session: {
      id: 'archive-session',
      rooms: [{ id: 'archive-room', roomNo: 'A201', title: '已结束房间', venue: '测试地点', startAt: now - 3600000, durationMin: 30, deadlineMin: 120 }],
      players: [1, 2, 3, 4].map((i, index) => ({ memberId: 'm' + i, roomId: 'archive-room', joinedAt: now - 3600000 + index, cancelled: false }))
    },
    history: [], archivedRooms: [], memberId: 'm1'
  }));
});
await page.reload({ waitUntil: 'load' });
await sleep(500);
const archived = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')));
ok(archived.session.rooms.length === 0 && archived.archivedRooms.length === 1, '房间结束后从当前列表移入归档');
ok((await page.evaluate(() => document.body.innerText)).includes('记录本局分数'), '结束后显示记录本局分数按钮');
await page.click('[data-act="score-room"]');
await sleep(250);
await page.$$eval('[data-score]', els => els.forEach(el => { el.value = '0'; }));
await page.click('[data-act="save-score"]');
await sleep(400);
const scoredArchive = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')));
ok(scoredArchive.archivedRooms[0].results.length === 1, '保存分数后房间归档记录包含成绩');
await page.click('[data-act="tab"][data-tab="history"]');
await sleep(250);
ok((await page.evaluate(() => document.body.innerText)).includes('A201'), '历史页显示已结束房间');

await page.evaluate(() => {
  const now = Date.now();
  localStorage.setItem('mj_signup_v1', JSON.stringify({
    members: [1, 2, 3].map(i => ({ id: 'm' + i, name: '成员' + i, emoji: '', color: 'red', credit: 100 })),
    session: {
      id: 'cancel-session',
      rooms: [{ id: 'cancel-room', roomNo: 'B101', title: '未凑齐', venue: '测试地点', startAt: now - 3600000, durationMin: 30, deadlineMin: 120 }],
      players: [1, 2, 3].map((i, index) => ({ memberId: 'm' + i, roomId: 'cancel-room', joinedAt: now - 3600000 + index, cancelled: false }))
    },
    history: [], archivedRooms: [], memberId: 'm1'
  }));
});
await page.reload({ waitUntil: 'load' });
await sleep(500);
const cancelledRoom = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')));
ok(cancelledRoom.session.rooms.length === 0 && cancelledRoom.archivedRooms.length === 0, '开打时未满 4 人的房间自动取消且不进历史');

await page.evaluate(() => {
  const now = Date.now();
  localStorage.setItem('mj_signup_v1', JSON.stringify({
    members: [{ id: 'admin', name: '该隐cain', emoji: '', color: 'gold', credit: 100 }, { id: 'user', name: '普通用户', emoji: '', color: 'red', credit: 100 }],
    session: {
      id: 'admin-session',
      rooms: [{ id: 'admin-room', roomNo: 'C101', title: '管理测试', venue: '测试地点', startAt: now + 3600000, durationMin: 180, deadlineMin: 120 }],
      players: []
    },
    history: [], archivedRooms: [], memberId: 'user'
  }));
});
await page.reload({ waitUntil: 'load' });
await sleep(400);
await page.click('[data-act="edit-room"]');
await sleep(200);
ok(!(await page.$('[data-act="delete-room"]')), '普通用户看不到删除入口');
await page.click('[data-act="close"]');
await page.evaluate(() => {
  const state = JSON.parse(localStorage.getItem('mj_signup_v1'));
  state.memberId = 'admin';
  localStorage.setItem('mj_signup_v1', JSON.stringify(state));
});
await page.reload({ waitUntil: 'load' });
await sleep(400);
await page.click('[data-act="edit-room"]');
await sleep(200);
ok(!!(await page.$('[data-act="delete-room"]')), '管理员可以看到删除入口');
await page.click('[data-act="delete-room"]');
await page.click('[data-act="confirm-ok"]');
await sleep(400);
const deletedRoomState = await page.evaluate(() => JSON.parse(localStorage.getItem('mj_signup_v1')));
ok(deletedRoomState.session.rooms.length === 0, '管理员删除后房间数据被清除');

console.log('\nJS 错误：', errors.length ? errors : '无');
await browser.close();
console.log(fails === 0 ? '\nALL PASSED' : `\n${fails} FAILED`);
process.exit(fails ? 1 : 0);
