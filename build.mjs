import fs from 'node:fs';

// 1) 把 core.js 内联进页面，保证前端和云端跑的是同一份规则
const core = fs.readFileSync('core.js', 'utf8').replace(/^export\s+/gm, '');
const appTpl = fs.readFileSync('app.template.html', 'utf8');
if (!appTpl.includes('/*__CORE__*/')) throw new Error('app.template.html 里找不到 /*__CORE__*/ 占位符');

const page = appTpl.replace('/*__CORE__*/', () => core);
fs.writeFileSync('index.html', page, 'utf8');

// 2) 把页面塞进 Worker
const tpl = fs.readFileSync('worker.template.js', 'utf8');
if (!tpl.includes('__PAGE__')) throw new Error('worker.template.js 里找不到 __PAGE__ 占位符');

const worker = tpl.replace('__PAGE__', () => JSON.stringify(page));
fs.writeFileSync('worker.js', worker, 'utf8');

console.log('index.html  ' + (page.length / 1024).toFixed(1) + ' KB');
console.log('worker.js   ' + (worker.length / 1024).toFixed(1) + ' KB');
