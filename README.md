# ECO

Um jogo diário de palavras em português. Cada rodada tem até 12 palpites válidos: um palpite inicia uma trilha e cada elo seguinte precisa ser descoberto antes de entrar no mapa. A relação aparece sem revelar a palavra; cada erro válido mostra mais uma letra. Ao chegar à palavra-chave, uma pergunta final pode abrir uma rota secreta. O piloto inclui sete desafios curados, treino com os sete dias e não usa servidor, conta ou API paga.

## Rodar localmente

Requer Node.js 20 ou superior.

```sh
npm install
npm run dev
```

## Conferir o projeto

```sh
npm test
npm run build
```

## Datas do piloto

O build define o início do piloto para o dia da publicação em São Paulo. Se precisar agendar outra data, defina `VITE_PILOT_START_DATE` no formato `AAAA-MM-DD` nas variáveis de build. Os sete desafios seguem a ordem do arquivo `src/data/puzzles.ts` e abrem em dias consecutivos.

## Palpites e conexões

Os palpites são verificados localmente com Hunspell e o dicionário pt-BR VERO. O app aceita flexões e compostos hifenizados listados no dicionário; exige uma palavra por palpite e não sugere correções. Palavras repetidas ou fora do vocabulário não consomem tentativa. Palavras próprias usadas pelos desafios continuam aceitas. Uma palavra válida sem rota registrada aparece separada e não recebe uma conexão inventada; esse palpite consome uma tentativa.

As rotas revisadas do desafio têm prioridade sobre relações amplas do ConceptNet para manter as pistas previsíveis. O mapa só confirma uma ligação quando o jogador acerta o próximo elo. O progresso de cada partida fica salvo separadamente no navegador.

O índice local `public/data/conceptnet-pt.json.gz` contém arestas em português do ConceptNet 5.7.0, junto das conexões revisadas dos desafios. O jogo preserva a direção das relações, ignora relações genéricas e não usa conceitos com mais de 80 ligações como atalhos internos. Nenhuma requisição semântica é feita durante a partida.

Para regenerar o índice, baixe o arquivo `conceptnet-assertions-5.7.0.csv.gz` da [página oficial de downloads do ConceptNet](https://github.com/commonsense/conceptnet5/wiki/Downloads), salve-o em `data/conceptnet-assertions-5.7.0.csv.gz` e rode `npm run prepare:conceptnet`. O arquivo original não deve ser commitado. O ConceptNet é disponibilizado sob CC BY-SA 4.0; a atribuição aparece no jogo e esta cópia adaptada mantém a licença. Consulte a [licença do ConceptNet](https://www.conceptnet.io/c/en/get_licence).

O `predev` e o `prebuild` geram os arquivos compactados do dicionário e do motor WebAssembly a partir das dependências npm. Para gerar esses assets manualmente, rode `npm run prepare:dictionary`. Os arquivos gerados ficam fora do controle de versão; a página de créditos lista as fontes e as licenças do VERO e do Hunspell.

## Publicar gratuitamente

O site é estático e gera os arquivos em `dist/`. No Cloudflare Pages, conecte o repositório e use:

- Framework: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: **20 ou superior**

O ECO não usa Pages Functions, banco ou variáveis secretas. O plano Free do Cloudflare Pages informa requisições de arquivos estáticos sem cobrança e sem limite publicado; os limites do serviço podem mudar, então confira a [documentação oficial](https://developers.cloudflare.com/pages/platform/limits/) ao publicar.

## Privacidade e progresso

Palpites, resposta da pergunta final, seleção diário/treino e tema ficam no armazenamento local do navegador. Cada dia de treino tem uma partida salva separadamente. Não há coleta de resultados nem comparação global entre jogadores. Para compartilhar, o ECO usa o recurso nativo do navegador ou copia o texto para a área de transferência.
