# ECO

Um jogo diário de palavras em português. Cada palpite deixa uma pista e uma relação no mapa. O piloto inclui sete desafios curados, um treino com os sete dias e não usa servidor, conta ou API paga.

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

## Relações semânticas

O índice local `public/data/conceptnet-pt.json.gz` contém arestas em português do ConceptNet 5.7.0. O app não consulta serviços externos durante a partida. O índice é um recorte das relações com peso a partir de 1.0 e nomes de relação usados pelo jogo; conexões que passem por conceitos com mais de 80 ligações não encurtam a distância, para evitar atalhos genéricos.

Para regenerar o índice, baixe o arquivo `conceptnet-assertions-5.7.0.csv.gz` da [página oficial de downloads do ConceptNet](https://github.com/commonsense/conceptnet5/wiki/Downloads), salve-o em `data/conceptnet-assertions-5.7.0.csv.gz` e rode `npm run prepare:conceptnet`. O arquivo original não deve ser commitado. O ConceptNet é disponibilizado sob CC BY-SA 4.0; a atribuição aparece no jogo e esta cópia adaptada mantém a licença. Consulte a [licença do ConceptNet](https://www.conceptnet.io/c/en/get_licence).

## Publicar gratuitamente

O site é estático e gera os arquivos em `dist/`. No Cloudflare Pages, conecte o repositório e use:

- Framework: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: **20 ou superior**

O ECO não usa Pages Functions, banco ou variáveis secretas. O plano Free do Cloudflare Pages informa requisições de arquivos estáticos sem cobrança e sem limite publicado; os limites do serviço podem mudar, então confira a [documentação oficial](https://developers.cloudflare.com/pages/platform/limits/) ao publicar.

## Privacidade e progresso

Palpites, resposta da pergunta final, seleção diário/treino e tema ficam no armazenamento local do navegador. Cada dia de treino tem uma partida salva separadamente. Não há coleta de resultados nem comparação global entre jogadores. Para compartilhar, o ECO usa o recurso nativo do navegador ou copia o texto para a área de transferência.
