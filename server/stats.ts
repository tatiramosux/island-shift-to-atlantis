/**
 * Estatísticas anônimas do jogo: o navegador avisa quando uma partida começa e termina (modo, duração, idioma...) e o servidor
 * só conta. Não guarda nome, e-mail, cookie, endereço IP nem identificador de pessoa.
 *
 * - POST /api/event  recebe um evento (texto JSON curto). Aceita de qualquer site, porque o jogo também roda no itch.io e na Vercel.
 * - GET  /api/stats?key=SENHA  mostra os totais desde que o servidor ligou. Só existe se a variável STATS_KEY estiver definida.
 * - Cada evento também vai para o log do servidor (linha "[stat] {...}"), que o Render guarda por alguns dias.
 */
import crypto from 'node:crypto';
import type http from 'node:http';

const EVENTS = new Set(['visit', 'start', 'end', 'rules', 'about']);
/** Campos aceitos (qualquer outro é ignorado). Valores viram texto curto sem símbolos. */
const FIELDS = new Set(['mode', 'length', 'players', 'lang', 'site', 'rounds', 'secs', 'reason', 'won', 'princess']);
const COUNT_FIELDS = ['mode', 'length', 'players', 'lang', 'site', 'reason', 'won', 'princess'];

const since = new Date();
const totals = new Map<string, number>();
const breakdown = new Map<string, Map<string, number>>();
const sums = { rounds: 0, secs: 0, ends: 0 };
const recent: string[] = [];
const rate = new Map<string, { n: number; t: number }>(); // por origem da conexão, só na memória e só para frear abuso

const val = (v: unknown): string | number | boolean => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.max(0, Math.min(100000, Math.round(v)));
  if (typeof v === 'boolean') return v;
  return String(v ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 16);
};

const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);

const tooFast = (req: http.IncomingMessage): boolean => {
  const who = String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? '').split(',')[0].trim();
  const now = Date.now();
  const r = rate.get(who);
  if (!r || now - r.t > 60000) {
    rate.set(who, { n: 1, t: now });
    if (rate.size > 5000) rate.clear();
    return false;
  }
  r.n++;
  return r.n > 120;
};

const record = (raw: Record<string, unknown>) => {
  const e = String(raw.e ?? '');
  if (!EVENTS.has(e)) return;
  const clean: Record<string, string | number | boolean> = { e };
  for (const [k, v] of Object.entries(raw)) if (FIELDS.has(k)) clean[k] = val(v);
  bump(totals, e);
  for (const k of COUNT_FIELDS) {
    if (clean[k] === undefined) continue;
    const key = `${e}.${k}`;
    if (!breakdown.has(key)) breakdown.set(key, new Map());
    bump(breakdown.get(key)!, String(clean[k]));
  }
  if (e === 'end') {
    sums.ends++;
    sums.rounds += Number(clean.rounds ?? 0);
    sums.secs += Number(clean.secs ?? 0);
  }
  const line = JSON.stringify(clean);
  recent.unshift(`${new Date().toISOString()} ${line}`);
  if (recent.length > 60) recent.pop();
  console.log('[stat]', line);
};

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type' };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const page = (): string => {
  const rows = [...totals.entries()].sort().map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('');
  const parts = [...breakdown.entries()]
    .sort()
    .map(([k, m]) => `<tr><td>${esc(k)}</td><td>${[...m.entries()].sort().map(([v, n]) => `${esc(v)}: <b>${n}</b>`).join(' &nbsp; ')}</td></tr>`)
    .join('');
  const avg = sums.ends ? `${(sums.rounds / sums.ends).toFixed(1)} rodadas, ${Math.round(sums.secs / sums.ends / 60)} min em média (${sums.ends} partidas terminadas)` : 'ainda sem partidas terminadas';
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Estatísticas</title>
<style>body{font:15px system-ui;background:#111;color:#eee;margin:16px}table{border-collapse:collapse;margin:8px 0 20px}td{border:1px solid #333;padding:4px 10px;vertical-align:top}h2{margin:18px 0 4px}code{color:#9cf}</style>
<h1>Island Shift: estatísticas anônimas</h1>
<p>Desde ${since.toISOString()} (o plano grátis do Render reinicia e zera estes números; o histórico fica no Log do serviço, linhas <code>[stat]</code>).</p>
<h2>Totais</h2><table>${rows || '<tr><td>nada ainda</td></tr>'}</table>
<h2>Detalhes</h2><table>${parts || '<tr><td>nada ainda</td></tr>'}</table>
<h2>Média das partidas</h2><p>${avg}</p>
<h2>Últimos eventos</h2><pre>${esc(recent.join('\n')) || 'nada ainda'}</pre>`;
};

/** Trata /api/event e /api/stats. Devolve true quando respondeu (o servidor não segue para os arquivos do jogo). */
export function handleStats(req: http.IncomingMessage, res: http.ServerResponse): boolean {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/api/event') {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, cors).end();
      return true;
    }
    if (req.method !== 'POST') {
      res.writeHead(405, cors).end();
      return true;
    }
    if (tooFast(req)) {
      res.writeHead(429, cors).end();
      return true;
    }
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 2000) req.destroy();
    });
    req.on('end', () => {
      try {
        record(JSON.parse(body) as Record<string, unknown>);
      } catch {
        /* evento inválido: ignora */
      }
      res.writeHead(204, cors).end();
    });
    return true;
  }
  if (url.pathname === '/api/stats') {
    const secret = process.env.STATS_KEY;
    const given = url.searchParams.get('key') ?? '';
    const ok = !!secret && given.length === secret.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(secret));
    if (!ok) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return true;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(page());
    return true;
  }
  return false;
}
