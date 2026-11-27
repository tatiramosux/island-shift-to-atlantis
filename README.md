# Island Shift to Atlantis

A 3D isometric pirate board game for 2–4 players, made for **Game Off 2026** (theme: **SHIFT**).

An island sinks while the ancient city of Atlantis rises from underneath. Day turns to night as the tide shifts rows of
the island into the city. Discover treasure, outsmart the other pirates and escape on your ship before the island
disappears into the sea.

- **Play:** solo against bots or pass-and-play on one device. Runs in the browser, no install.
- **Languages:** English (default) and Portuguese. Switch with the **EN / PT** buttons on the start screen.
- **Online rooms:** play with friends on the Render site, https://island-shift-to-atlantis.onrender.com (the first visit can take about a minute to wake up). The itch.io build is offline-only: vs. bots or pass-and-play.
- **Promo page:** https://island-shift-to-atlantis.vercel.app (source in `landing/`; preview it with `npm run dev:landing`).

## How a match works

Each tile has two sides: the island surface and a hidden Atlantis piece underneath. On your turn:

1. **Action** — 3 actions: walk (stepping on a closed tile reveals the treasure under it), build, push, swim, row. One summon per turn (costs crystals).
2. **Tide** — the table randomly picks tiles that crumble and reveal Atlantis.
3. **Creatures** — roll the die and move the creature it picks.

**Tide shift (the theme).** From round 2 a wave, warned one round ahead by foam on the tiles, sweeps two rows of the
island and turns them into Atlantis. Anyone on the ground or the 1st floor falls into the sea. Towers (2nd floor or
higher), domes and Shields hold.

**Escape.** Every team has a ship at sea. When the first pirate boards a ship, everyone else gets one last turn, and then the
whole island sinks. Whoever is left on land is adrift on a buoy. The winner has the most points among the teams with a
pirate on a ship.

Pick a **Short**, **Medium** or **Long** match on the start screen (about 9, 11 and 15 rounds against bots). The Long
match is the full game, where the end comes from the crystal at the top of the Temple. More details in
[`docs/modo-fuga.md`](docs/modo-fuga.md) (Portuguese) and the in-game "How to play".

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # rules engine, bots and match-length tests
npm run simular -- 60 2 short   # bot-vs-bot balance numbers (matches, players, short|medium|long)
```

### Build for itch.io

```bash
npm run build:itch   # relative paths, online switched off; zip the contents of dist/
```

Upload the zip as an HTML project and tick "This file will be played in the browser".

## How it is built

- `src/engine/` — the rules, pure TypeScript with no DOM or three.js, so it runs the same in the browser, in tests and on a
  server. Tests cover every rule (`rules.test.ts`, `escape.test.ts`).
- `src/game/` — bots, automatic setup and team names.
- `src/stage/` — the 3D board (three.js): voxel-style pieces, camera, lights, day/night sky.
- `src/play/` — screens, menus, sounds (all synthesized in the browser, no audio files) and the logo.
- `src/i18n.ts` — English / Portuguese text.
- `server/` — room server for online play (Node + WebSocket; it also serves the game on Render).

## Credits

- Made with [three.js](https://threejs.org/) (MIT), [Lucide](https://lucide.dev/) icons (ISC) and Google Fonts
  (Cinzel Decorative, Nunito; SIL Open Font License).
- Name, characters, art and sounds were made for this game.
