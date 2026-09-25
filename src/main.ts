import "./styles.css";
import {
  chooseConnection,
  createRound,
  getFeedback,
  getNode,
  getNextSaoPauloMidnight,
  getPilotDay,
  getSaoPauloDate,
  isRoundState,
  MAX_GUESSES,
  PILOT_START_DATE,
  submitGuess,
  type GuessFeedback,
  type Puzzle,
  type RoundState,
  type WordNode,
} from "./game";
import { getPuzzleForPilotDay, puzzles } from "./data/puzzles";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Elemento principal #app não encontrado.");

const TODAY = getSaoPauloDate();
const DAY_INDEX = getPilotDay(TODAY);
const puzzle: Puzzle | undefined = DAY_INDEX === null ? undefined : getPuzzleForPilotDay(DAY_INDEX);
const stateKey = `eco:round:${TODAY}`;
const themeKey = "eco:theme";
let notice = "";
let draftGuess = "";
let state: RoundState = puzzle ? readState(puzzle, TODAY) : createRound(TODAY);
let theme = readTheme();

function readState(selectedPuzzle: Puzzle, date: string): RoundState {
  try {
    const stored = localStorage.getItem(`eco:round:${date}`);
    if (!stored) return createRound(date);
    const parsed: unknown = JSON.parse(stored);
    if (isRoundState(parsed, date, selectedPuzzle)) return parsed;
  } catch {
    // O jogo continua disponível mesmo quando o navegador bloqueia o armazenamento local.
  }
  return createRound(date);
}

function readTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(themeKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function scheduleDailyTurnover(): void {
  const nextMidnight = getNextSaoPauloMidnight();
  const delay = Math.max(1_000, nextMidnight.getTime() - Date.now() + 250);
  window.setTimeout(() => window.location.reload(), delay);
}

function persistState(): void {
  try {
    localStorage.setItem(stateKey, JSON.stringify(state));
  } catch {
    notice = "Não consegui salvar esta partida neste navegador.";
  }
}

function persistTheme(): void {
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    // A escolha de tema segue funcionando nesta visita.
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function formatDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, day, 12)));
}

function getTarget(selectedPuzzle: Puzzle): WordNode {
  return getNode(selectedPuzzle, selectedPuzzle.targetId)!;
}

function getLastFeedback(selectedPuzzle: Puzzle, round: RoundState): GuessFeedback | undefined {
  const id = round.guesses.at(-1);
  return id ? getFeedback(selectedPuzzle, getNode(selectedPuzzle, id)!) : undefined;
}

function categoryCopy(feedback: GuessFeedback): string {
  return feedback.categoryMatch ? "Mesma categoria" : "Categoria diferente";
}

function distanceCopy(distance: number): string {
  return distance === 1 ? "1 conexão" : `${distance} conexões`;
}

function renderProgress(round: RoundState): string {
  return Array.from({ length: MAX_GUESSES }, (_, index) => {
    const guessId = round.guesses[index];
    const isWinningGuess = guessId === puzzle?.targetId;
    return `<span class="attempt-dot ${guessId ? "is-used" : ""} ${isWinningGuess ? "is-winning" : ""}" aria-hidden="true"></span>`;
  }).join("");
}

const positions = [
  { x: 112, y: 202 }, { x: 310, y: 202 }, { x: 508, y: 202 }, { x: 706, y: 202 },
  { x: 112, y: 400 }, { x: 310, y: 400 }, { x: 508, y: 400 }, { x: 706, y: 400 },
];

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, index: number): string {
  const offset = index % 2 === 0 ? -16 : 16;
  const midX = (from.x + to.x) / 2 + offset;
  const midY = (from.y + to.y) / 2 - offset;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

function renderGraph(selectedPuzzle: Puzzle, round: RoundState): string {
  const guessNodes = round.guesses
    .map((id) => getNode(selectedPuzzle, id))
    .filter((node): node is WordNode => Boolean(node));
  const target = getTarget(selectedPuzzle);
  const targetVisible = round.status !== "playing";
  const targetPosition = { x: 409, y: 77 };
  const guessPositions = new Map(guessNodes.map((node, index) => [node.id, positions[index]]));
  const visibleIds = targetVisible ? [...round.guesses, target.id] : round.guesses;
  const visibleEdges = selectedPuzzle.edges.filter((edge) => visibleIds.includes(edge.from) && visibleIds.includes(edge.to));

  const drawnEdges = visibleEdges.map((edge, index) => {
    const from = edge.from === target.id ? targetPosition : guessPositions.get(edge.from);
    const to = edge.to === target.id ? targetPosition : guessPositions.get(edge.to);
    if (!from || !to) return "";
    const labelX = (from.x + to.x) / 2;
    const labelY = (from.y + to.y) / 2 - 13;
    return `<g class="graph-edge-group ${edge.from === target.id || edge.to === target.id ? "edge-to-target" : ""}">
      <path class="graph-edge ${index === visibleEdges.length - 1 ? "edge-new" : ""}" d="${edgePath(from, to, index)}" />
      <text class="edge-label" x="${labelX}" y="${labelY}" text-anchor="middle">${escapeHtml(edge.label)}</text>
    </g>`;
  }).join("");

  const hiddenTargetConnections = !targetVisible
    ? selectedPuzzle.edges
        .filter((edge) => edge.to === target.id && guessPositions.has(edge.from) || edge.from === target.id && guessPositions.has(edge.to))
        .map((edge, index) => {
          const guessId = edge.from === target.id ? edge.to : edge.from;
          const from = guessPositions.get(guessId)!;
          return `<g class="graph-edge-group edge-to-target">
            <path class="graph-edge ${index === 0 ? "edge-new" : ""}" d="${edgePath(from, targetPosition, index)}" />
            <text class="edge-label edge-secret-label" x="${(from.x + targetPosition.x) / 2}" y="${(from.y + targetPosition.y) / 2 - 13}" text-anchor="middle">?</text>
          </g>`;
        }).join("")
    : "";

  const targetNode = `<g class="graph-node target-node ${targetVisible ? "target-revealed" : "target-hidden"}" transform="translate(${targetPosition.x - 78} ${targetPosition.y - 31})" aria-label="${targetVisible ? `Resposta: ${escapeHtml(target.label)}` : "Palavra secreta"}">
      <rect width="156" height="62" rx="22" />
      <text class="target-eyebrow" x="78" y="22" text-anchor="middle">${targetVisible ? "RESPOSTA" : "PALAVRA SECRETA"}</text>
      <text class="target-label" x="78" y="45" text-anchor="middle">${targetVisible ? escapeHtml(target.label) : "?????"}</text>
    </g>`;

  const guessMarkup = guessNodes.map((node, index) => {
    const position = positions[index];
    const feedback = getFeedback(selectedPuzzle, node);
    const latest = index === guessNodes.length - 1;
    const winning = node.id === selectedPuzzle.targetId;
    const letters = feedback.sharedLetters.length === 0 ? "0 letras" : `${feedback.sharedLetters.length} ${feedback.sharedLetters.length === 1 ? "letra" : "letras"}`;
    return `<g class="graph-node guess-node ${latest ? "guess-latest" : ""} ${winning ? "guess-winning" : ""}" transform="translate(${position.x - 78} ${position.y - 34})" aria-label="${escapeHtml(node.label)}; ${categoryCopy(feedback)}; ${distanceCopy(feedback.distance)}; ${letters} em comum">
      <rect width="156" height="68" rx="20" />
      <text class="guess-word" x="78" y="29" text-anchor="middle">${escapeHtml(node.label)}</text>
      <text class="guess-meta" x="78" y="50" text-anchor="middle">${feedback.distance} conex. · ${letters}</text>
    </g>`;
  }).join("");

  return `<div class="graph-scroll" tabindex="0" aria-label="Mapa semântico; role para os lados em telas pequenas">
    <svg class="graph-svg" viewBox="0 0 818 500" role="img" aria-label="Mapa com ${guessNodes.length} ${guessNodes.length === 1 ? "palpite" : "palpites"} e suas conexões">
      <defs>
        <marker id="edge-dot" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6"><circle cx="4" cy="4" r="3" /></marker>
      </defs>
      <path class="target-stem" d="M 409 108 L 409 139" />
      ${drawnEdges}${hiddenTargetConnections}${targetNode}${guessMarkup}
      ${guessNodes.length === 0 ? `<g class="graph-empty" transform="translate(409 322)"><circle r="48" /><text y="7" text-anchor="middle">ECO</text></g>` : ""}
    </svg>
  </div>`;
}

function renderLatestClue(selectedPuzzle: Puzzle, round: RoundState): string {
  const feedback = getLastFeedback(selectedPuzzle, round);
  if (!feedback) {
    return `<div class="clue-panel clue-empty"><span class="clue-spark" aria-hidden="true">✳</span><p>O primeiro palpite abre o mapa.</p></div>`;
  }
  const sharedText = feedback.sharedLetters.length === 0
    ? "Nenhuma letra em comum"
    : `${feedback.sharedLetters.length} ${feedback.sharedLetters.length === 1 ? "letra" : "letras"} em comum`;
  return `<section class="clue-panel" aria-label="Pistas do último palpite" aria-live="polite">
    <div class="clue-heading"><span class="clue-kicker">ÚLTIMO ECO</span><strong>${escapeHtml(feedback.node.label)}</strong></div>
    <div class="clue-values">
      <span class="clue-value ${feedback.categoryMatch ? "clue-good" : ""}"><i aria-hidden="true">${feedback.categoryMatch ? "✓" : "·"}</i>${categoryCopy(feedback)}</span>
      <span class="clue-value"><i aria-hidden="true">↔</i>${distanceCopy(feedback.distance)}</span>
      <span class="clue-value ${feedback.sharedLetters.length ? "clue-good" : "clue-muted"}"><i aria-hidden="true">Aa</i>${sharedText}</span>
    </div>
  </section>`;
}

function renderStatus(selectedPuzzle: Puzzle, round: RoundState): string {
  if (round.status === "playing") return "";
  const target = getTarget(selectedPuzzle);
  if (round.status === "solved") {
    const count = round.guesses.length;
    return `<section class="finish-panel finish-win" aria-live="polite">
      <div class="finish-mark" aria-hidden="true">✳</div>
      <div><span class="clue-kicker">VOCÊ ENCONTROU</span><h2>${escapeHtml(target.label)}</h2><p>${escapeHtml(selectedPuzzle.sense)} · ${count} ${count === 1 ? "palpite" : "palpites"}</p></div>
    </section>`;
  }
  return `<section class="finish-panel finish-loss" aria-live="polite">
    <div class="finish-mark" aria-hidden="true">↗</div>
    <div><span class="clue-kicker">O CAMINHO CONTINUA</span><h2>${escapeHtml(target.label)}</h2><p>A resposta era ${escapeHtml(selectedPuzzle.sense)}. Oito palpites, um mapa novo amanhã.</p></div>
  </section>`;
}

function renderConnectionQuiz(selectedPuzzle: Puzzle, round: RoundState): string {
  if (round.status !== "solved") return "";
  if (round.connectionChoice === null) {
    return `<section class="connection-panel" aria-labelledby="connection-title">
      <div class="section-label"><span>02</span><span>CAMINHO SECRETO</span></div>
      <h2 id="connection-title">${escapeHtml(selectedPuzzle.connectionQuestion)}</h2>
      <p>Uma escolha. A resposta certa abre outra trilha.</p>
      <div class="connection-options">${selectedPuzzle.connectionOptions.map((option) =>
        `<button class="connection-option" type="button" data-option="${escapeHtml(option.id)}"><span>${escapeHtml(option.label)}</span><b aria-hidden="true">↗</b></button>`,
      ).join("")}</div>
    </section>`;
  }

  const correct = round.routeUnlocked;
  const correctOption = selectedPuzzle.connectionOptions.find((option) => option.id === selectedPuzzle.correctConnectionId)!;
  const path = correct
    ? `<div class="secret-route" aria-label="Caminho secreto desbloqueado">${selectedPuzzle.secretRoute.map((id, index) => {
        const node = getNode(selectedPuzzle, id)!;
        return `${index ? `<span class="route-arrow" aria-hidden="true">→</span>` : ""}<span class="route-node">${escapeHtml(node.label)}</span>`;
      }).join("")}</div>`
    : `<p class="route-locked-copy">A resposta que abria a trilha era <strong>${escapeHtml(correctOption.label)}</strong>. O caminho secreto fica para outra rodada.</p>`;
  return `<section class="connection-panel connection-result ${correct ? "is-unlocked" : "is-locked"}" aria-live="polite">
    <div class="section-label"><span>02</span><span>CAMINHO SECRETO</span></div>
    <h2>${correct ? "Trilha desbloqueada." : "Essa conexão ficou pelo caminho."}</h2>
    ${path}
  </section>`;
}

function shareText(selectedPuzzle: Puzzle, round: RoundState): string {
  const day = DAY_INDEX === null ? 0 : DAY_INDEX + 1;
  const solved = round.status === "solved";
  const trail = round.guesses
    .map((id) => getNode(selectedPuzzle, id)?.label ?? "")
    .filter(Boolean)
    .join(" → ");
  const outcome = solved ? `Resolvi em ${round.guesses.length}/${MAX_GUESSES} palpites` : `Usei ${MAX_GUESSES}/${MAX_GUESSES} palpites`;
  return `ECO · ${day}/7\n${outcome}\n${trail}\n\nJoga o desafio de hoje: ${window.location.href}`;
}

function renderPilotEnded(): void {
  const isBefore = TODAY < PILOT_START_DATE;
  app!.innerHTML = `<main class="page-shell">
    <header class="topbar"><a class="wordmark" href="/" aria-label="ECO início">ECO<span>.</span></a><button class="theme-toggle" type="button" aria-label="Alternar tema">${theme === "dark" ? "☼" : "◐"}</button></header>
    <section class="pilot-ended"><span class="eyebrow">UM JOGO DE PALAVRAS</span><div class="big-echo" aria-hidden="true">E</div><h1>${isBefore ? "O primeiro eco está chegando." : "Este ciclo chegou ao fim."}</h1><p>${isBefore ? `O piloto de sete dias começa em ${formatDate(PILOT_START_DATE)}.` : "O piloto foi preparado para sete dias. Novas trilhas poderão chegar em uma próxima atualização."}</p></section>
    <footer class="page-footer"><span>Sem pressa. As palavras ficam no mapa.</span></footer>
  </main>`;
  bindThemeToggle();
}

function render(): void {
  document.documentElement.dataset.theme = theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "dark" ? "#111914" : "#f3f2eb";
  if (!puzzle || DAY_INDEX === null) {
    renderPilotEnded();
    return;
  }
  const day = DAY_INDEX + 1;
  const used = state.guesses.length;
  const remaining = MAX_GUESSES - used;
  const isPlaying = state.status === "playing";
  const newestNode = state.guesses.at(-1) ? getNode(puzzle, state.guesses.at(-1)!) : undefined;

  app!.innerHTML = `<main class="page-shell">
    <header class="topbar">
      <a class="wordmark" href="/" aria-label="ECO início">ECO<span>.</span></a>
      <div class="topbar-meta"><span class="daily-chip"><span class="daily-dot"></span>DESAFIO ${String(day).padStart(2, "0")} <i>/ 07</i></span><button class="theme-toggle" type="button" aria-label="${theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}" title="Alternar tema">${theme === "dark" ? "☼" : "◐"}</button></div>
    </header>

    <section class="intro-row">
      <div><span class="eyebrow">${escapeHtml(formatDate(TODAY)).toLocaleUpperCase("pt-BR")} · PILOTO DE 7 DIAS</span><h1>Uma palavra.<br /><em>Vários caminhos.</em></h1></div>
      <details class="how-to"><summary>Como jogar <span aria-hidden="true">＋</span></summary><div class="how-to-copy"><p>Encontre a palavra secreta em até oito palpites. Cada palavra mostra a distância, a categoria e as letras em comum. As conexões entre seus palpites formam um mapa.</p><p>Depois de acertar, escolha a relação que abre o caminho secreto.</p></div></details>
    </section>

    <section class="target-strip" aria-label="Palavra secreta e tentativas">
      <div class="target-copy"><span class="target-label">A PALAVRA DE HOJE</span><strong>${state.status === "playing" ? "?????" : escapeHtml(getTarget(puzzle).label)}</strong><span class="target-sense">${state.status === "playing" ? "escute os ecos" : escapeHtml(getTarget(puzzle).category)}</span></div>
      <div class="attempts-box"><div class="attempts-heading"><span>PALPITES</span><strong>${used}<i> / ${MAX_GUESSES}</i></strong></div><div class="attempt-dots" aria-label="${used} de ${MAX_GUESSES} palpites usados">${renderProgress(state)}</div><small>${isPlaying ? `${remaining} ${remaining === 1 ? "restante" : "restantes"}` : state.status === "solved" ? "palavra encontrada" : "rodada encerrada"}</small></div>
    </section>

    ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ""}
    ${renderLatestClue(puzzle, state)}

    <section class="map-section" aria-labelledby="map-title">
      <div class="map-heading"><div><div class="section-label"><span>01</span><span>SEU MAPA</span></div><h2 id="map-title">Cada palpite deixa um eco.</h2></div><span class="map-count">${used} ${used === 1 ? "palavra" : "palavras"}</span></div>
      <div class="map-card">${renderGraph(puzzle, state)}<div class="map-legend"><span><i class="legend-node"></i>palpite</span><span><i class="legend-link"></i>relação descoberta</span><span class="map-scroll-hint">arraste o mapa <b aria-hidden="true">↔</b></span></div></div>
    </section>

    ${isPlaying ? `<form class="guess-form" id="guess-form" autocomplete="off">
      <label class="input-label" for="guess-input">Qual palavra você quer testar?</label>
      <div class="input-row"><div class="input-wrap"><span class="input-mark" aria-hidden="true">↳</span><input id="guess-input" name="guess" type="text" maxlength="40" value="${escapeHtml(draftGuess)}" placeholder="Digite uma palavra…" aria-describedby="input-help" required /><button class="clear-input" type="button" aria-label="Limpar palavra">×</button></div><button class="submit-button" type="submit">ECOAR <span aria-hidden="true">↗</span></button></div>
      <div class="input-foot"><span id="input-help">Palavras conhecidas pelo mapa não gastam tentativa se repetidas.</span><span>${remaining} ${remaining === 1 ? "palpite" : "palpites"} restantes</span></div>
    </form>` : ""}

    ${renderStatus(puzzle, state)}
    ${renderConnectionQuiz(puzzle, state)}
    ${!isPlaying ? `<section class="result-share"><div><span class="clue-kicker">SEU CAMINHO</span><p>${newestNode ? `Você chegou a ${escapeHtml(getTarget(puzzle).label)} depois de ${used} ${used === 1 ? "palpite" : "palpites"}.` : "Sua rodada de hoje."}</p></div><button class="share-button" id="share-button" type="button"><span aria-hidden="true">↗</span> Compartilhar resultado</button></section>` : ""}

    <footer class="page-footer"><span>Seu progresso fica salvo neste navegador.</span><span>Um jogo sem pressa, sem conta e sem barulho.</span></footer>
  </main>`;

  bindThemeToggle();
  bindGuessForm();
  bindConnectionOptions();
  bindShareButton();
  bindGraphScroll();
}

function bindThemeToggle(): void {
  document.querySelector<HTMLButtonElement>(".theme-toggle")?.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    persistTheme();
    render();
  });
}

function bindGuessForm(): void {
  const form = document.querySelector<HTMLFormElement>("#guess-form");
  const input = document.querySelector<HTMLInputElement>("#guess-input");
  if (!form || !input || !puzzle) return;
  input.addEventListener("input", () => { draftGuess = input.value; });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    draftGuess = input.value;
    const result = submitGuess(puzzle, state, input.value);
    if (result.kind === "unknown") {
      const suggestionCopy = result.suggestions.length
        ? ` Talvez você quis dizer ${result.suggestions.map((word) => `“${word}”`).join(", ")}?`
        : " Tente um sinônimo conhecido pelo mapa.";
      notice = `Essa palavra ainda não está no mapa.${suggestionCopy}`;
      render();
      document.querySelector<HTMLInputElement>("#guess-input")?.focus();
      return;
    }
    if (result.kind === "duplicate") {
      notice = `“${result.node.label}” já deixou um eco. Tente outra palavra.`;
      render();
      document.querySelector<HTMLInputElement>("#guess-input")?.focus();
      return;
    }
    if (result.kind === "finished") return;
    state = result.state;
    draftGuess = "";
    notice = "";
    persistState();
    render();
    if (state.status === "playing") document.querySelector<HTMLInputElement>("#guess-input")?.focus();
    document.querySelector<HTMLElement>(".graph-scroll")?.scrollTo({ left: 0, behavior: "smooth" });
  });
  document.querySelector<HTMLButtonElement>(".clear-input")?.addEventListener("click", () => {
    draftGuess = "";
    input.value = "";
    input.focus();
  });
}

function bindConnectionOptions(): void {
  if (!puzzle) return;
  document.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const optionId = button.dataset.option;
      if (!optionId) return;
      state = chooseConnection(puzzle, state, optionId);
      persistState();
      render();
      document.querySelector(".connection-result")?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  });
}

async function bindShareButton(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#share-button");
  if (!button || !puzzle) return;
  button.addEventListener("click", async () => {
    const text = shareText(puzzle!, state);
    const data = { title: "ECO — seu caminho de hoje", text };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        try {
          await navigator.share(data);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") return;
        }
      }
      await copyText(text);
      button.innerHTML = "<span aria-hidden=\"true\">✓</span> Copiado";
      window.setTimeout(() => {
        if (document.body.contains(button)) button.innerHTML = "<span aria-hidden=\"true\">↗</span> Compartilhar resultado";
      }, 2200);
    } catch {
      notice = "Não consegui compartilhar agora. Selecione e copie o caminho acima.";
      render();
    }
  });
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("O navegador não permitiu copiar o resultado.");
}

function bindGraphScroll(): void {
  const graph = document.querySelector<HTMLDivElement>(".graph-scroll");
  if (!graph) return;
  graph.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") graph.scrollBy({ left: 120, behavior: "smooth" });
    if (event.key === "ArrowLeft") graph.scrollBy({ left: -120, behavior: "smooth" });
  });
}

function validatePuzzleData(): void {
  if (import.meta.env.DEV) {
    const ids = new Set<string>();
    for (const item of puzzles) {
      for (const word of item.nodes) {
        if (ids.has(`${item.date}:${word.id}`)) throw new Error(`ID de palavra duplicado: ${item.date}/${word.id}`);
        ids.add(`${item.date}:${word.id}`);
      }
      for (const edge of item.edges) {
        if (!getNode(item, edge.from) || !getNode(item, edge.to)) throw new Error(`Aresta sem nó em ${item.date}: ${edge.from} → ${edge.to}`);
      }
      for (const id of item.nodes.map((word) => word.id)) {
        if (!Number.isFinite(getFeedback(item, getNode(item, id)!).distance)) throw new Error(`Nó desconectado da resposta: ${item.date}/${id}`);
      }
      for (let index = 1; index < item.secretRoute.length; index += 1) {
        const left = item.secretRoute[index - 1];
        const right = item.secretRoute[index];
        if (!item.edges.some((edge) => edge.from === left && edge.to === right || edge.from === right && edge.to === left)) {
          throw new Error(`Rota secreta sem conexão direta: ${item.date}/${left}/${right}`);
        }
      }
      if (item.connectionOptions.length !== 4 || !item.connectionOptions.some((option) => option.id === item.correctConnectionId)) {
        throw new Error(`Pergunta de conexão inválida: ${item.date}`);
      }
    }
  }
}

validatePuzzleData();
render();
scheduleDailyTurnover();
