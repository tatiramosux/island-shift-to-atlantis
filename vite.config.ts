import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';

/** Identificação da versão publicada (commit): o Render e a Vercel informam o commit; no computador, vem do Git. Aparece em "Sobre". */
const buildId = (): string => {
  const env = process.env.RENDER_GIT_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA;
  if (env) return env.slice(0, 7);
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
};

export default defineConfig(({ mode }) => {
  // `npm run build:itch` (modo "itch"): o jogo roda numa subpasta da itch.io, então os caminhos são relativos,
  // e não existe servidor de salas (o modo Online fica desativado, como na Vercel)
  const itch = mode === 'itch';
  return {
    base: itch ? './' : '/',
    // na Vercel (variável VERCEL=1 durante a compilação) não existe servidor de salas: o modo Online fica desativado
    define: { __NO_ONLINE__: JSON.stringify(!!process.env.VERCEL || itch), __BUILD_ID__: JSON.stringify(buildId()) },
    // em desenvolvimento (npm run dev), as salas em rede passam para o servidor (npm run server)
    server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  };
});
