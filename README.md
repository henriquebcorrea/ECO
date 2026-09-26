# ECO

ECO é um jogo web em português no qual você completa sequências fixas de dez palavras. Os três protótipos mostram o início e o destino; os oito elos intermediários são descobertos durante a partida.

## Como jogar

- Cada percurso tem dez posições e nove relações revisadas.
- Digite uma palavra por vez, usando o vocabulário pt-BR VERO/Hunspell.
- Um acerto preenche a posição correspondente. Se descobrir uma palavra que aparece mais adiante, ela fica marcada, mas você continua pela primeira lacuna.
- A relação da lacuna atual começa oculta. Cada erro válido acende uma bolinha; no terceiro erro, a relação aparece.
- Você tem 24 palpites válidos. Duplicatas, palavras inválidas e o início ou destino visíveis não contam.
- O progresso fica salvo separadamente para cada protótipo, sem conta e sem virada diária.

Os protótipos mantêm os elos secretos na interface até serem encontrados ou até a partida terminar. A seleção e os links compartilhados identificam apenas qual percurso abrir.

## Rodar localmente

Requer Node.js 20 ou superior.

```sh
npm install
npm run dev
```

## Conferir

```sh
npm test
npm run build
```

## Vocabulário e licenças

O dicionário VERO/Hunspell é empacotado localmente. A página de créditos aponta para os avisos de terceiros e as licenças. Não há API ou serviço de IA durante a partida.

Os percursos e relações são dados estáticos em `src/data/puzzles.ts`. Para alterar ou publicar percursos novos, atualize esse arquivo e faça um novo deploy. O site apresenta três protótipos nesta rodada de avaliação.

## Publicar gratuitamente

O site é estático e gera os arquivos em `dist/`. No Cloudflare Pages, conecte o repositório e use:

- Framework: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: **20 ou superior**

## Privacidade

Cada progresso fica no armazenamento local do próprio navegador. Não há conta, servidor de jogo, coleta de resultados ou estatísticas globais. O compartilhamento usa o recurso nativo do navegador ou copia um resumo sem revelar os elos.
