# ECO

ECO é um jogo web em português no qual você completa uma sequência fixa de dez palavras. Os dois protótipos mostram o início, o destino e a relação da lacuna atual. Os oito elos intermediários são descobertos durante a partida.

## Como jogar

- Cada percurso tem dez posições e nove relações revisadas.
- Digite uma palavra por vez, usando o vocabulário pt-BR VERO/Hunspell.
- Um acerto preenche a posição correspondente. Se descobrir uma palavra que aparece mais adiante, ela fica marcada, mas você continua pela primeira lacuna.
- Um palpite válido fora da sequência conta como erro e revela uma letra do próximo elo.
- Você tem 24 palpites válidos. Duplicatas, palavras inválidas e o início ou destino visíveis não contam.
- O progresso fica salvo separadamente para cada protótipo, sem conta e sem virada diária.

O segundo protótipo mantém os elos secretos na interface até serem encontrados ou até a partida terminar. A seleção e os links compartilhados identificam apenas qual dos dois percursos abrir.

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

Os percursos e relações são dados estáticos em `src/data/puzzles.ts`. Para alterar ou publicar percursos novos, atualize esse arquivo e faça um novo deploy. O site apresenta somente os dois protótipos desta rodada de avaliação.

## Publicar gratuitamente

O site é estático e gera os arquivos em `dist/`. No Cloudflare Pages, conecte o repositório e use:

- Framework: **Vite**
- Build command: `npm run build`
- Build output directory: `dist`
- Node.js: **20 ou superior**

## Privacidade

Cada progresso fica no armazenamento local do próprio navegador. Não há conta, servidor de jogo, coleta de resultados ou estatísticas globais. O compartilhamento usa o recurso nativo do navegador ou copia um resumo sem revelar os elos.
