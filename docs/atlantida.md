# Island Shift to Atlantis: regras

Jogo de tabuleiro 3D em blocos, de 2 a 4 times (contra o computador ou passando o aparelho), feito para a Game Off 2026
(tema SHIFT). Uma ilha afunda enquanto a cidade antiga de Atlântida emerge por baixo. Nome, personagens, arte e sons são
originais. As partidas curta, média e longa estão em `modo-fuga.md`.

## Tabuleiro

- 61 casas hexagonais: o **Castelo** no centro e 60 casas de superfície (areia, grama e pedra).
- Cada casa esconde uma **peça de Atlântida**. Ela aparece quando a casa afunda ou quando um pirata pisa nela.
- Cada time tem um **navio** ancorado no mar e **2 piratas**: o capitão (sabre) e o marujo (gancho).

## Peças de Atlântida (60)

| Peça | Qtde | O que faz |
|---|---|---|
| Cristal | 18 | Tesouro: 1 ponto se guardar, e paga as convocações. |
| Tridente | 5 | Tesouro: vale 2 pontos. Quando o terremoto sorteia a casa do seu pirata, é usado **sozinho** e a casa não afunda. |
| Maré calma | 3 | Tesouro: vale **na hora**, sem guardar nem apertar nada. O próximo terremoto é pulado, e todos recebem um alerta. |
| Coluna | 8 | Já nasce com 1 andar. |
| Portal | 3 | Atalho até outro Portal livre. Só funciona com 2 Portais revelados. |
| Escudo | 2 | Quem está em cima não é levado pelo mar nem pelas criaturas. |
| Ruína | 21 | Nada. É também o que sobra de um tesouro levado. |

Tesouros (cristal, tridente e Maré calma) são pegos na hora, ao pisar na casa, e a casa vira Ruína.

## A vez de cada time

1. **Ação:** 3 ações para andar, empurrar um pirata vizinho, nadar, entrar no bote ou remar. Sobe-se 1 andar por vez.
2. **Maré (terremoto):** a mesa sorteia casas que afundam e viram Atlântida. Ninguém escolhe. Uma Maré calma pula esta fase.
3. **Criaturas:** role o dado e mova a criatura sorteada.

Uma **convocação** por turno, paga com cristais: Tritão (2) empurra até 2 casas, Laço (2) rouba a Princesa de um rival até
3 casas de distância, **Sereia (3)** rouba todos os cristais do time vizinho menos 2 (quem tem 2 ou menos não pode ser
roubado) e Colosso de coral (2) põe uma cúpula (ninguém pisa nela e as ondas não a levam; o terremoto ou o Leviatã ainda podem quebrá-la).

## O Castelo e a Princesa

- Ninguém constrói. Depois de **12 casas** viradas em Atlântida, o Castelo **emerge sozinho**, com 3 andares, duas
  **torres** (2 andares) e três **escadas** (1 andar) ao lado. As torres e escadas **não somem** com as ondas e os
  terremotos: o caminho até a Princesa fica de pé.
- Escadas deixam subir até 2 andares de uma vez. O caminho é: chão, escada, torre, topo.
- No topo espera a **Princesa**. Quem chega lá a resgata e a leva até o seu navio: **+4 pontos** ao embarcar com ela.
- Quem está numa torre (2º andar ou mais) não é empurrado e fica fora do alcance do Polvo, do Leviatã e do Nereu.
- O computador **não foge antes de a Princesa ser resgatada**: não entra em bote nem embarca. Fica na ilha e vai atrás dela.

## Criaturas (o dado)

O dado tem 6 faces: Polvo (2), Leviatã (2), Nereu e Maré viva.

- **Polvo-colosso** e **Leviatã** nadam só pelo mar (e pelos buracos de mar que a ilha abre). Ao parar, cada um agarra um
  pirata a até 2 casas, em terra e no chão ou no 1º andar, e o joga na água. O Leviatã também pode derrubar um andar de uma
  casa vizinha. Quem boia é jogado mais longe, e botes viram.
- **Nereu** sobe do mar e arrasta para a água um pirata sorteado de qualquer lugar do tabuleiro, menos quem está num Escudo
  ou numa torre. Se o pirata carregava a Princesa, Nereu a leva de volta ao fundo do mar.
- **Maré viva:** nenhuma criatura se mexe e todo pirata em casa de Atlântida ganha 1 cristal.

Quem cai na água **não morre**: fica numa boia e pode nadar de volta. Ninguém é eliminado.

## Atlântida é frágil

A partir da rodada 3, uma casa já emersa e sem ninguém por cima desmorona a cada rodada e vira um buraco de mar. Casas que
ainda guardam tesouro não desmoronam.

## Pontos

Pontos = cristais + tridentes × 2 + 4 se a Princesa está a salvo no seu navio. Gastar cristais e tridentes custa pontos.
Quem fugiu no navio conta todos os pontos. Quem ficou boiando conta metade, arredondada para baixo. Empate: vence quem salvou
a Princesa, depois quem fugiu primeiro.

## Para quem quer mexer

- Motor de regras em TypeScript puro: `src/engine/atlantida/` (testes ao lado).
- Contra o computador: `src/game/bot.ts`. Para simular partidas: `npm run simular -- 60 2 short`.
- Interface e 3D: `src/play/` e `src/stage/`. Salas em rede: `server/`.
