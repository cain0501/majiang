// Cloudflare Worker：一个文件同时干三件事 —— 发页面、给接口、存数据
// 由 build.mjs 把 index.html 塞进 PAGE 里生成 worker.js
import { applyOp, defaultState, normalizeState } from './core.js';

const PAGE = __PAGE__;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });

async function readState(env, key) {
  const raw = await env.MJ_KV.get(key);
  if (raw) {
    try {
      const state = normalizeState(JSON.parse(raw));
      await env.MJ_KV.put(key, JSON.stringify(state));
      return state;
    } catch (e) { /* 坏数据就当空的 */ }
  }
  return null;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const g = url.searchParams.get('g') || 'main';
    const key = 'g:' + g;

    try {
      if (url.pathname === '/api/state') {
        if (request.method !== 'GET') return json({ error: 'method not allowed' }, 405);
        let st = await readState(env, key);
        if (!st) {
          st = defaultState();
          await env.MJ_KV.put(key, JSON.stringify(st));
        }
        return json(st);
      }

      if (url.pathname === '/api/op') {
        if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
        let op;
        try { op = await request.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
        const st = (await readState(env, key)) || defaultState();
        const next = applyOp(st, op, Date.now());
        await env.MJ_KV.put(key, JSON.stringify(next));
        return json(next);
      }

      if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);

      return new Response(PAGE, {
        headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' }
      });
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  }
};
