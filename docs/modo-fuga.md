# Island Shift to Atlantis: partida curta, média e longa

Versão para a Game Off 2026 (tema SHIFT). O jogo base é o de `atlantida.md`; aqui mudam o **ritmo** e o **final**.
O modo **Longa** é o jogo original (o fim vem do Castelo). Curta e Média usam a **virada da maré** e o final por **fuga**.

## Ideia

A ilha começa de dia. A maré **vira fileiras inteiras em Atlântida**, o céu escurece junto e a cidade emerge. Quando
Atlântida está de pé, o objetivo é levar os tesouros para o navio. Quem foge primeiro faz a ilha inteira **sumir no mar**.

## Escolha da partida

| | Curta | Média | Longa |
|---|---|---|---|
| Terremoto (casas sorteadas por rodada) | 10 | 6 | 4 |
| Virada da maré (onda que vira fileiras) | sim, desde a rodada 2 | sim, desde a rodada 2 | só depois do cristal do Castelo |
| Criaturas | Polvo e Leviatã | Polvo, Leviatã e Sentinela | todas |
| Final | fuga | fuga | Castelo, depois fuga |
| A ilha some, no máximo, na rodada | 9 | 15 | não há |
| Rodadas (média, bot contra bot, 2 jogadores) | 7,0 | 8,3 | 16,4 |

O **Castelo** continua no tabuleiro: o cristal de valor 3 no topo vira **bônus**, e deixa de ser a porta do fim (nas
partidas Curta e Média).

## Virada da maré (Curta e Média)

1. Na virada para a rodada 2, o jogo **avisa** um lado da ilha: as casas ficam com espuma.
2. Na virada para a rodada 3, a onda **varre as duas fileiras de fora** daquele lado. Cada casa de superfície varrida vira
   **Atlântida na hora**, revelando a peça de baixo. Quem estava no chão ou no 1º andar cai no mar e fica boiando.
3. **Resistem:** casas com torre de 2 andares ou mais, casas com cúpula, o Castelo e quem está sobre um Escudo.
4. Já se avisa a próxima onda, de outro lado sorteado. Isso se repete a cada rodada.

É a mesma onda gigante do jogo original, que antes só começava depois do cristal do Castelo e só derrubava piratas.

## Final por fuga (Curta e Média)

1. **A fuga começa** quando o primeiro pirata de qualquer time chega ao navio dele. A tela avisa: *a ilha vai sumir*.
2. **Última chamada:** cada um dos outros times joga **mais um turno**. O aviso termina quando a vez volta a quem fugiu.
3. **A ilha some.** Todas as casas afundam no mar. Os piratas que não embarcaram ficam **boiando**, cada um na sua boia.
4. **Quem vence:** entre os times com **pelo menos um pirata no navio**, vence quem tiver **mais cristais**. No empate,
   vence quem fugiu primeiro. Quem ficou para trás não entra na contagem.
5. **Se ninguém fugir** até a rodada limite, a ilha some do mesmo jeito. Nesse caso Nereu fica com o tesouro e ninguém vence.

## Dia e noite

O céu depende da parte da ilha que já virou Atlântida: 0% é dia claro, 50% é entardecer, 100% é noite com a cidade
brilhando. Quando a ilha some, o mar fica escuro com o brilho dos cristais.

## O que não muda

Terremoto sorteado, convocações, bote, boia, pisar para descobrir, Polvo, Leviatã e as peças escondidas funcionam como no original.
O terremoto continua sendo da mesa (sorteio), mas agora tem **prazo**.

## Pontos a testar

- Se 10 casas por rodada deixam pouco tempo para descobrir cristais (Curta).
- Se o bot foge no momento certo (veja `npm run simular -- 60 2 short`).
- Ilha menor para a Curta (37 casas): ainda não feita, porque o raio é uma constante do motor.
- Idioma: a interface tem inglês (padrão) e português; este documento e `atlantida.md` ficam em português.
