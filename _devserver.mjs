// 本地跑真实的 worker.js：用一个“落盘的 Map”顶替 Cloudflare KV
// 重启服务不会丢数据（存在 _data.json 里）
import worker from './worker.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.PORT || 8788);
const DATA = path.join(process.cwd(), '_data.json');

let store = new Map();
try {
  if (fs.existsSync(DATA)) {
    const obj = JSON.parse(fs.readFileSync(DATA, 'utf8'));
    store = new Map(Object.entries(obj));
    console.log('已载入 ' + store.size + ' 个分组的数据');
  }
} catch (e) {
  console.log('数据文件读不了，从空开始：' + e.message);
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      // 覆盖之前先留一份上一版，写坏了还能退回去
      if (fs.existsSync(DATA)) fs.copyFileSync(DATA, DATA + '.bak');
      fs.writeFileSync(DATA, JSON.stringify(Object.fromEntries(store)), 'utf8');
    } catch (e) {
      console.error('写数据文件失败：', e.message);
    }
  }, 50);
}

const env = {
  MJ_KV: {
    async get(k) { return store.has(k) ? store.get(k) : null; },
    async put(k, v) { store.set(k, v); persist(); },
    async delete(k) { store.delete(k); persist(); }
  }
};

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === 'string') headers[k] = v;
    }

    const request = new Request('http://localhost:' + PORT + req.url, {
      method: req.method,
      headers,
      body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body
    });

    const out = await worker.fetch(request, env);
    const buf = Buffer.from(await out.arrayBuffer());
    const outHeaders = {};
    out.headers.forEach((v, k) => { outHeaders[k] = v; });
    res.writeHead(out.status, outHeaders);
    res.end(buf);
  } catch (e) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('devserver error: ' + ((e && e.stack) || e));
  }
});

server.on('error', (e) => {
  console.error('服务出错：', e && e.message);
  if (e && e.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 被占了，可能是上一个进程还没退干净。');
  }
});

// 别让一个异常把整个服务带走
process.on('uncaughtException', (e) => console.error('未捕获异常：', e && e.stack || e));
process.on('unhandledRejection', (e) => console.error('未处理的 Promise：', e && e.stack || e));

server.listen(PORT, '127.0.0.1', () => {
  console.log('本地服务： http://127.0.0.1:' + PORT + '  （数据存在 _data.json，重启不丢）');
  console.log('进程 pid ' + process.pid);
});
