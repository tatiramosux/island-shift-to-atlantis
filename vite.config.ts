import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';

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

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

/** A imagem que aparece quando o link da página de divulgação é compartilhado precisa de um endereço fixo. */
const shareImage = (): Plugin => ({
  name: 'share-image',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'og-cover.png', source: readFileSync(here('./landing/img/cover.png')) });
  },
});

export default defineConfig(({ mode }) => {
  // na Vercel (variável VERCEL=1 durante a compilação) vai ao ar só a página de divulgação, da pasta "landing"
  // (no computador: npm run dev:landing). O jogo é publicado no Render e na itch.io
  if (process.env.VERCEL || mode === 'landing') {
    return {
      root: here('./landing'),
      publicDir: here('./public'), // os vídeos e o ícone são os mesmos do jogo
      plugins: [shareImage()],
      build: { outDir: here('./dist'), emptyOutDir: true },
    };
  }
  // `npm run build:itch` (modo "itch"): o jogo roda numa subpasta da itch.io, então os caminhos são relativos,
  // e não existe servidor de salas (o modo Online fica desativado)
  const itch = mode === 'itch';
  return {
    base: itch ? './' : '/',
    define: { __NO_ONLINE__: JSON.stringify(itch), __BUILD_ID__: JSON.stringify(buildId()) },
    // em desenvolvimento (npm run dev), as salas em rede passam para o servidor (npm run server)
    server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  };
});
