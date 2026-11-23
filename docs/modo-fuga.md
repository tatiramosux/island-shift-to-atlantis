# Island Shift to Atlantis: partida curta, média e longa

Versão para a Game Off 2026 (tema SHIFT). As regras do jogo estão em `atlantida.md`; aqui mudam o **ritmo** e o **final**.
A **Longa** é o jogo completo (o fim vem do Castelo). A **Curta** e a **Média** usam a **virada da maré** e o final por **fuga**.

## Escolha da partida

| | Curta | Média | Longa |
|---|---|---|---|
| Rodadas aproximadas (qualquer número de jogadores) | 9 | 11 | 15 |
| Casas sorteadas por terremoto, a cada rodada (2 / 3 / 4 jogadores) | 10 / 8 / 6 | 3 / 2 / 2 | 3 / 3 / 3 |
| Casas afundadas para o Castelo emergir | 12 | 20 | 20 |
| Virada da maré (onda que vira fileiras) | desde a rodada 2 | desde a rodada 2 | só depois de a Princesa ser resgatada |
| Final | fuga | fuga | Castelo, depois fuga |
| Rodadas para chegar ao navio depois do resgate da Princesa | 5 | 6 | não há |
| A ilha some, no máximo, na rodada | 9 | 22 | não há |
| Dado das criaturas | sem o Nereu; entra o Mar parado | com o Nereu e 1 face de Mar parado | 6 faces de sempre |

Com mais jogadores cada rodada tem mais turnos, então menos casas afundam por rodada e a partida mantém quase o mesmo número de rodadas.
A tela inicial já marca a duração recomendada: 2 jogadores, Curta; 3 jogadores, Média; 4 jogadores, Longa (ela pode ser trocada à mão).
As salas em rede usam a Longa. Os números vêm de simulações com bots (`npm run simular`) e ainda podem ser ajustados jogando.

## Virada da maré (Curta e Média)

1. Na virada para a rodada 2, o jogo **avisa** um lado da ilha: as casas ficam com espuma.
2. Na virada para a rodada 3, a onda **varre as duas fileiras de fora** daquele lado. Cada casa de superfície varrida vira
   **Atlântida na hora**, revelando a peça de baixo. Quem estava no chão ou no 1º andar cai no mar e fica boiando.
3. **Resistem:** torres de 2 andares ou mais, casas com cúpula, o Castelo e quem está sobre um Escudo.
4. Já se avisa a próxima onda, de outro lado sorteado. Isso se repete a cada rodada.

## Final por fuga (Curta e Média)

1. **Resgate da Princesa:** quando alguém chega ao topo do Castelo e a resgata, começa uma **contagem de rodadas** na tela, embaixo das etapas
   (Curta: 5 rodadas; Média: 6). Na última rodada o aviso fica vermelho.
2. **A ilha some** em um destes casos: um **time inteiro** (os dois piratas) está a bordo do navio dele, a contagem acabou ou, se a Princesa
   nunca for resgatada, a rodada limite chegou (9 na Curta, 22 na Média). Um pirata só no navio não faz a ilha sumir.
3. Todas as casas afundam no mar. Quem não embarcou fica **boiando**.
4. **Quem vence:** quem tiver **mais pontos** (veja `atlantida.md`). Quem ficou boiando conta metade, e quem ficou para trás pode vencer se
   mesmo assim tiver mais. **Sempre há um vencedor.** Empate: vence quem salvou a Princesa, depois quem fugiu primeiro, depois quem estava no navio.

O computador só embarca depois de a Princesa ser resgatada (ou perto da rodada limite se ela nunca for).

## Dia e noite

O céu depende da parte da ilha que já virou Atlântida: 0% é dia claro, 50% é entardecer, 100% é noite com a cidade
brilhando. Quando a ilha some, o mar fica escuro.

## Idiomas

A interface tem inglês (padrão) e português. Os documentos desta pasta ficam em português.
