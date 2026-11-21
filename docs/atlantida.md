# Atlântida, Cidade Submersa — regras e plano

Rascunho de projeto. Jogo autoral de 2 a 4 pessoas, partidas de uns 20 a 30 minutos. Mistura a construção por andares (inspirada no Santorini) com um jogo de fases, criaturas e afundamento. Uma ilha afunda enquanto uma cidade antiga emerge por baixo. Nome, personagens e arte são próprios; só os mecanismos de regras têm inspiração em jogos existentes (que não são protegidos).

Proposta visual: `docs/propostas/atlantida-proposta.png`. Briefing para o projeto novo: `docs/atlantida-briefing.md`.

## A ideia

O tabuleiro tem 61 casas hexagonais. Cada casa tem **dois lados**: a superfície da ilha (areia e grama) e, por baixo, uma **peça de Atlântida** escondida. Conforme o mar sobe, as casas da ilha afundam e viram peças da cidade antiga, com efeitos. No centro está o **Castelo de Atlântida**, que só desperta quando Atlântida já emergiu um pouco. O jogo é de **confronto**: dá para empurrar, derrubar, roubar e jogar adversários na água.

## Componentes

- 61 casas: 1 casa central (o Castelo) e 60 casas de superfície, cada uma com uma peça de Atlântida escondida embaixo.
- 2 piratas por jogador, de uma cor.
- Blocos de construção: cada casa pode ter até 3 andares e uma cúpula (o Castelo não aceita cúpula).
- 3 criaturas: Polvo-colosso, Leviatã e Guardião de pedra.
- Dado das criaturas (6 faces).
- Fichas de cristal de cada jogador.
- Boias salva-vidas (anéis redondos, como um donut) para os piratas que caem na água.

### As 60 peças de Atlântida

Entra-se numa casa de Atlântida ao terminar o movimento nela. O efeito vale na hora.

| Peça | Qtd. | Efeito |
|---|---|---|
| **Cristal** | 10 | Você pega 1 cristal. A casa vira uma Ruína. |
| **Coluna** | 5 | A casa já nasce com 1 andar construído. |
| **Portal** | 4 | Em vez de parar aqui, você pode se transportar para outro Portal livre. |
| **Tridente** | 3 | Você pega 1 tridente. Uma vez, durante a fase de Maré de qualquer jogador, você cancela a descida: a casa escolhida não afunda nessa rodada. |
| **Maré calma** | 2 | A próxima fase de Maré é pulada. A peça some. |
| **Escudo** | 3 | Enquanto seu pirata estiver aqui, o mar e as criaturas não o levam. |
| **Ruína** | 5 | Nenhum efeito. |

## Preparação

1. As 60 peças de Atlântida são **embaralhadas automaticamente** e escondidas embaixo das casas. Ninguém olha. No modo online, quem sorteia é o servidor, e as peças só são reveladas para todos quando a casa afunda.
2. Os piratas são colocados um de cada vez, **alternando**, em casas livres da borda (anel 4). Quem joga por último coloca primeiro. Existe a opção "Organização automática", que espalha os piratas de forma justa.
3. As criaturas são colocadas **automaticamente** em pontos separados da água ao redor da ilha. O Guardião de pedra entra na primeira casa de Atlântida que emergir.

## Uma rodada: 3 fases

Cada jogador faz suas 3 fases na sua vez.

### Fase 1: Ação

Você tem **3 ações**, em qualquer ordem e quantas vezes quiser:

- **Mover** um pirata seu para uma casa vizinha livre. Pode subir no máximo **1 andar** por vez e descer quantos quiser. Não dá para entrar em casa com pirata, com cúpula ou na água.
- **Descobrir** uma casa de superfície vizinha (do anel 2 em diante, longe do Castelo): a peça de baixo fica à vista, sem a casa afundar. Se for tesouro (Cristal, Tridente ou Maré calma), o pirata pega na hora e a casa vira uma Ruína aberta.
- **Construir** 1 bloco só **no Castelo e nas casas coladas nele** (as outras casas não recebem blocos). A casa na frente do portão do Castelo fica sempre livre: ali não se constrói. O 4º bloco é uma **cúpula**, que bloqueia a casa (menos no Castelo).
- **Empurrar** um pirata vizinho: ele vai 1 casa para trás, em linha reta, se a casa de trás estiver livre e em terra. O empurrão simples nunca joga alguém na água.

Além disso, uma vez por turno você pode usar uma **convocação** (veja abaixo), sem gastar ação.

### Fase 2: Maré

É o **terremoto**: a cada rodada **4 casas** se desfazem e revelam Atlântida. Essas 4 são divididas entre os jogadores (2 jogadores: 2 cada; 3: 1, 1 e 2; 4: 1 cada). As casas são **sorteadas pela mesa**, uma de cada vez, entre todas as casas de superfície, da borda ou do meio (menos o Castelo). Ninguém escolhe, então ninguém usa o terremoto contra outro jogador. Cada casa sorteada afunda:

- Os blocos construídos sobre ela desaparecem.
- Quem estava nela cai na água e **fica boiando** (veja "Boiando"), a menos que haja um Escudo.
- A peça de Atlântida de baixo é revelada: a casa vira Atlântida, no nível 0.
- O Castelo nunca é escolhido.

### Fase 3: Criaturas

O jogador da vez rola o **dado das criaturas** e **move a criatura sorteada**, escolhendo o caminho. As criaturas só atacam quando terminam o movimento ao lado de piratas.

| Face | Resultado |
|---|---|
| Polvo (2 faces) | Move o **Polvo-colosso** até 3 casas, **só pelo mar** (a água em volta da ilha e os buracos onde Atlântida desmoronou; nunca sobe na ilha). Ao parar, **estica um tentáculo até 2 casas**, enrola um pirata (obrigatório se houver alguém ao alcance) e o joga no mar: ele fica boiando. Quem já boia é jogado mais longe, o bote vira. Piratas no 2º andar ou mais alto, ou num Escudo, não são alcançados. |
| Leviatã (2 faces) | Move o **Leviatã** até 2 casas, só pelo mar. Ao parar, pode **laçar com a cauda** um pirata a até 2 casas e jogá-lo no mar, ou derrubar o bloco de cima de uma casa vizinha (quem estava nela cai um andar). Também empurra 1 casa os náufragos vizinhos. |
| Sentinela (1 face) | A **Sentinela de pedra** (um troll com chifres) fica parada como estátua. Ela **acorda sozinha** quando um pirata termina o movimento a até 2 casas dela e, sem sair do lugar, dispara um **jato de água** que empurra o pirata **2 casas para longe do centro** (se passar da borda, ele cai no mar). Esta face do dado também a faz atirar no pirata mais perto (até 2 casas). Escudo e 2º andar ou mais protegem. |
| Maré viva (1 face) | Nenhuma criatura se mexe. Todo pirata em casa de Atlântida ganha 1 cristal. |

## Atlântida desmorona

Da **3ª rodada** em diante, a cada virada de rodada (2 casas na fase final), uma casa de Atlântida sem construção e sem ninguém em cima, colada na água, **desmorona e vira buraco de mar**. O mar avança para dentro da ilha em canais, e o Polvo e o Leviatã passam por eles para chegar perto dos piratas. Casas com tesouro ainda não pego não desmoronam.

## Boiando

Quem cai na água **não morre**. O pirata é colocado numa **boia salva-vidas**, um anel redondo com um buraco no meio, como um donut, vermelho e branco. Ele fica sentado nela, balançando com as ondas.

- Um náufrago não constrói e não conta para vencer.
- Ele pode **nadar 1 casa por ação**, empurrando a boia, para chegar a uma casa de terra de nível 0 ou 1.
- Ele fica vulnerável ao **Polvo** e ao **Leviatã**: se o agarram, é jogado mais longe no mar. Ninguém é eliminado.
- O **Golfinho-guia** (convocação) o leva de volta à ilha.

## Convocações (poderes)

As convocações funcionam como poderes de uso único: um personagem entra em cena, faz a ação e some. A moeda é o **cristal**: você gasta cristais, mas eles também servem para vencer. Só pode **1 convocação por turno**, durante a Ação.

| Personagem | Custo | Efeito |
|---|---|---|
| **Tritão** | 2 cristais | **Empurrão forte:** joga um pirata adversário até 2 casas em linha reta. Se cair na água, fica boiando. |
| **Golfinho-guia** | 1 cristal | **Resgate:** nada até um náufrago seu, leva-o até 2 casas e o solta numa casa de terra de nível 0 ou 1. Depois vai embora e a boia some. |
| **Sereia** | 1 cristal | **Canto:** rouba 1 cristal de um pirata vizinho. |
| **Colosso de coral** | 2 cristais | **Cúpula relâmpago:** coloca uma cúpula em qualquer casa que não seja o Castelo. |

Não há eliminação: quem cai no mar só boia.

## O Castelo

O Castelo só **desperta** quando 12 casas já viraram Atlântida (cerca de 3 rodadas). Antes disso, ele não pode ser pisado nem receber blocos. Depois, funciona como uma casa comum, com até 3 andares, mas **não aceita cúpula**. Para impedir que alguém suba, é preciso ocupar o 3º andar com um pirata.

## Como se vence

Você vence ao cumprir **qualquer um** destes objetivos:

O jogo é de **tesouros e fuga**: ganha quem tiver **mais cristais** no fim.

- **Navios:** cada time tem um navio ancorado no mar desde o começo (nas pontas do mar, longe dos outros).
- **Bote:** de qualquer casa de praia (colada na água, nível 0 ou 1), o pirata entra num bote (1 ação). **Cabem 2 piratas do mesmo time** no bote: o segundo entra no bote do companheiro (da praia ou nadando) e cada remada leva os dois. Ao encostar numa praia, só desce quem remou. No bote ele rema até 2 casas de água por ação, pode encostar numa praia e descer, ou subir no navio do próprio time. Boiando, também dá para nadar até o navio.
- **Perigo no mar:** o Polvo vira o bote e o pirata fica boiando; o Leviatã empurra botes e náufragos.
- **Princesa do Castelo:** um pirata que entra no **3º andar** do Castelo resgata a **Princesa**. Só existe uma. Ela não dá cristais na hora: quando alguém do time embarca no navio, o time ganha **+4 cristais**. Não vence sozinha: continua ganhando quem tiver mais cristais.

**Fase final.** Quando alguém resgata a Princesa:

- o terremoto passa a afundar **o dobro** de casas por rodada (8), e Atlântida emerge quase inteira;
- começa a **onda gigante**: a cada virada de rodada, uma onda vem de um dos 6 lados da ilha. Ela é avisada uma rodada antes (espuma nas casas). Quem está no chão ou no 1º andar das **duas fileiras de borda** daquele lado cai no mar e fica boiando. Quem está no 2º andar ou mais alto, ou num Escudo, aguenta.

A partida acaba quando:

1. **Fuga:** a Princesa já foi resgatada e um time está com **todos** os piratas vivos no navio (ninguém fica para trás). Vence quem tiver mais cristais; no empate, quem fugiu.
2. **Fim da ilha:** toda a superfície afundou.

Nas partidas curtas e médias, o final é a **fuga**: quando a ilha afunda, **Nereu**, rei dos mares e de Atlântida (meio homem, meio sereia), surge do mar e urra pela sua Princesa. Vence quem tiver mais pontos entre os times que fugiram (quem ficou boiando conta a metade). Se **ninguém** fugiu, Nereu fica com o tesouro e ninguém vence.

## Por que isso funciona

- Afundar o meio abre caminho para as criaturas, e afundar a borda revela peças longe do Castelo: cada escolha é uma aposta.
- O centro é seguro, mas lá a disputa é pelo Castelo.
- A perda tem graus: terra, depois boiando, e quem boia ainda pode nadar, ser resgatado ou fugir. Ninguém é eliminado.
- O cristal vale dois usos: vencer ou atacar. Guardar ou gastar vira uma decisão.
- Subir protege das criaturas e leva ao Castelo: defesa e objetivo apontam para o mesmo lugar.
- O dado traz sorte e surpresa, mas quem joga escolhe para onde a criatura vai.

## Visual

- **Superfície:** areia, grama e rocha em blocos.
- **Atlântida:** mármore claro, colunas, escadarias, cristais turquesa que brilham e detalhes dourados. Brilho pulsando nas casas recém-reveladas.
- **Água:** azul profundo, com raios de luz entrando.
- **Personagens:** piratas de blocos em duas a quatro cores; Tritão, Golfinho-guia, Sereia e Colosso como personagens voxel originais.
- **Boia salva-vidas:** anel redondo vermelho e branco, com o pirata sentado, balançando.

## Pontos a testar com jogadores reais

- **Velocidade do mar:** 1 casa por rodada pode ser rápido demais com 2 jogadores.
- **Cristais:** 5 de 10 pode ser fácil demais com 2 jogadores; talvez 4.
- **Peso do Castelo:** ver se a partida não vira sempre uma corrida pelo centro.
- **Polvo e Leviatã:** só nadam no mar e nos buracos que Atlântida abre; os 2 andares de proteção e o Escudo são as válvulas.
- **Snowball contra o líder:** com tanto ataque, o jogo pode virar "todos contra o líder".
- **Quantidade de peças e convocações:** ver se há efeitos demais para decorar.
