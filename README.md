# ECO

Um jogo diário de palavras em português. Cada palpite deixa uma pista e uma relação no mapa. O piloto inclui sete desafios curados, sem servidor, conta ou API paga.

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

## Publicar gratuitamente

O site é estático e gera os arquivos em `dist/`. No Cloudflare Pages, conecte o repositório e use:

- Framework: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: **20 ou superior**

O ECO não usa Pages Functions, banco ou variáveis secretas. O plano Free do Cloudflare Pages informa requisições de arquivos estáticos sem cobrança e sem limite publicado; os limites do serviço podem mudar, então confira a [documentação oficial](https://developers.cloudflare.com/pages/platform/limits/) ao publicar.

## Privacidade e progresso

Palpites, resposta da pergunta final e tema ficam no armazenamento local do navegador. Não há coleta de resultados nem comparação global entre jogadores. Para compartilhar, o ECO usa o recurso nativo do navegador ou copia o texto para a área de transferência.
