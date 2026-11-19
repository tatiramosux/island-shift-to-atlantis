import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  // `npm run build:itch` (modo "itch"): o jogo roda numa subpasta da itch.io, então os caminhos são relativos,
  // e não existe servidor de salas (o modo Online fica desativado, como na Vercel)
  const itch = mode === 'itch';
  return {
    base: itch ? './' : '/',
    // na Vercel (variável VERCEL=1 durante a compilação) não existe servidor de salas: o modo Online fica desativado
    define: { __NO_ONLINE__: JSON.stringify(!!process.env.VERCEL || itch) },
    // em desenvolvimento (npm run dev), as salas em rede passam para o servidor (npm run server)
    server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  };
});
