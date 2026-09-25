import "./styles.css";
import {
  chooseConnection,
  createRound,
  createSemanticIndex,
  getFeedback,
  getGuessNode,
  getNextSaoPauloMidnight,
  getNode,
  getPilotDay,
  getSaoPauloDate,
  getVisibleGuessEdges,
  isRoundState,
  migrateLegacyRound,
  normalizeWord,
  submitGuess,
  type GuessFeedback,
  type Puzzle,
  type RoundMode,
  type RoundState,
  type SemanticEdge,
  type SemanticIndex,
  type WordNode,
} from "./game";
import { getPuzzleForPilotDay, puzzles } from "./data/puzzles";
import { loadSemanticEdges } from "./data/semantic";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Elemento principal #app não encontrado.");

const TODAY = getSaoPauloDate();
const TODAY_INDEX = getPilotDay(TODAY);
const themeKey = "eco:theme";
const selectionKey = "eco:selection";

interface ChallengeSelection {
  mode: RoundMode;
  practiceDay: number;
}

function readSelection(): ChallengeSelection {
  const queryDay = Number(new URLSearchParams(window.location.search).get("treino"));
  if (Number.isInteger(queryDay) && queryDay >= 1 && queryDay <= 7) {
    return { mode: "practice", practiceDay: queryDay - 1 };
  }
  try {
    const parsed = JSON.parse(localStorage.getItem(selectionKey) ?? "null") as Partial<ChallengeSelection> | null;
    const stored = parsed ?? {};
    const practiceDay = Number.isInteger(stored.practiceDay) && stored.practiceDay! >= 0 && stored.practiceDay! < 7
      ? stored.practiceDay!
      : 0;
    if (stored?.mode === "practice") return { mode: "practice", practiceDay };
    if (stored?.mode === "daily" && TODAY_INDEX !== null) return { mode: "daily", practiceDay };
  } catch {
    // O desafio diário continua acessível sem armazenamento local.
  }
  return TODAY_INDEX === null
    ? { mode: "practice", practiceDay: 0 }
    : { mode: "daily", practiceDay: 0 };
}

let selection = readSelection();
let activePuzzle = getPuzzleForPilotDay(selection.mode === "daily" ? TODAY_INDEX ?? 0 : selection.practiceDay)!;
let activeRoundKey = getRoundKey(selection);
let activeStorageKey = getStorageKey(selection);
let semanticEdges: SemanticEdge[] = [];
let semanticIndex: SemanticIndex = createSemanticIndex(activePuzzle, semanticEdges);
let notice = "";
let draftGuess = "";
let theme = readTheme();
let state = readState(activePuzzle, activeRoundKey, activeStorageKey, selection.mode);

function getRoundKey(value: ChallengeSelection): string {
  return value.mode === "daily" ? `daily:${TODAY}` : `practice:${value.practiceDay + 1}`;
}

function getStorageKey(value: ChallengeSelection): string {
  return value.mode === "daily" ? `eco:round:${TODAY}` : `eco:practice:${value.practiceDay + 1}`;
}

function readState(
  selectedPuzzle: Puzzle,
  roundKey: string,
  storageKey: string,
  mode: RoundMode,
): RoundState {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return createRound(roundKey, mode);
    const parsed: unknown = JSON.parse(stored);
    if (isRoundState(parsed, roundKey, mode, selectedPuzzle)) return parsed;
    const migrated = migrateLegacyRound(parsed, roundKey, mode, selectedPuzzle);
    if (migrated) {
      localStorage.setItem(storageKey, JSON.stringify(migrated));
      return migrated;
    }
  } catch {
    // Uma falha de armazenamento não impede uma nova partida.
  }
  return createRound(roundKey, mode);
}

function readTheme(): "light" | "dark" {
  try {
    return localStorage.getItem(themeKey) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

function persistState(): void {
  try {
    localStorage.setItem(activeStorageKey, JSON.stringify(state));
  } catch {
    notice = "Não consegui salvar esta partida neste navegador.";
  }
}

function persistSelection(): void {
  try {
    localStorage.setItem(selectionKey, JSON.stringify(selection));
  } catch {
    // O seletor continua funcionando durante esta visita.
  }
  const url = new URL(window.location.href);
  if (selection.mode === "practice") url.searchParams.set("treino", String(selection.practiceDay + 1));
  else url.searchParams.delete("treino");
  window.history.replaceState(null, "", url);
}

function persistTheme(): void {
  try {
    localStorage.setItem(themeKey, theme);
  } catch {
    // A escolha de tema segue funcionando nesta visita.
  }
}

function scheduleDailyTurnover(): void {
  const nextMidnight = getNextSaoPauloMidnight();
  const delay = Math.max(1_000, nextMidnight.getTime() - Date.now() + 250);
  window.setTimeout(() => window.location.reload(), delay);
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
  const guess = round.guesses.at(-1);
  return guess ? getFeedback(selectedPuzzle, getGuessNode(selectedPuzzle, guess), semanticIndex) : undefined;
}

function distanceCopy(distance: number): string {
  return distance === 1 ? "1 conexão" : `${distance} conexões`;
}

function displayRelationPath(feedback: GuessFeedback): string {
  return feedback.semanticPath?.relations.slice(0, 3).join(" → ") ?? "";
}

function renderChallengePicker(): string {
  const dailyOption = TODAY_INDEX === null
    ? ""
    : `<option value="daily" ${selection.mode === "daily" ? "selected" : ""}>Diário · dia ${String(TODAY_INDEX + 1).padStart(2, "0")}</option>`;
  const practiceOptions = puzzles.map((_, index) =>
    `<option value="practice:${index}" ${selection.mode === "practice" && selection.practiceDay === index ? "selected" : ""}>Dia ${String(index + 1).padStart(2, "0")}</option>`,
  ).join("");
  return `<label class="sr-only" for="challenge-select">Escolher desafio ou dia de treino</label>
    <select class="challenge-select" id="challenge-select" aria-label="Escolher desafio ou dia de treino">
      ${dailyOption}<optgroup label="Treino · sete desafios">${practiceOptions}</optgroup>
    </select>`;
}

const graphColumns = [125, 375];

function edgePath(from: { x: number; y: number }, to: { x: number; y: number }, index: number): string {
  const offset = index % 2 === 0 ? -16 : 16;
  const midX = (from.x + to.x) / 2 + offset;
  const midY = (from.y + to.y) / 2 - offset;
  return `M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`;
}

function renderGraph(selectedPuzzle: Puzzle, round: RoundState): string {
  const guesses = round.guesses;
  const target = getTarget(selectedPuzzle);
  const targetVisible = round.status === "solved";
  const targetPosition = { x: 250, y: 64 };
  const rowHeight = 142;
  const firstRowY = 191;
  const rowCount = Math.max(1, Math.ceil(guesses.length / graphColumns.length));
  const graphHeight = Math.max(380, firstRowY + rowCount * rowHeight + 36);
  const guessPositions = new Map(guesses.map((guess, index) => [
    guess.id,
    { x: graphColumns[index % graphColumns.length], y: firstRowY + Math.floor(index / graphColumns.length) * rowHeight },
  ]));

  const directEdges = getVisibleGuessEdges(guesses, semanticIndex);
  const guessedEdges = directEdges.map((edge, index) => {
    const from = guessPositions.get(edge.from);
    const to = guessPositions.get(edge.to);
    if (!from || !to) return "";
    return `<g class="graph-edge-group">
      <path class="graph-edge ${index === directEdges.length - 1 ? "edge-new" : ""}" d="${edgePath(from, to, index)}" />
      <text class="edge-label" x="${(from.x + to.x) / 2}" y="${(from.y + to.y) / 2 - 12}" text-anchor="middle">${escapeHtml(edge.label)}</text>
    </g>`;
  }).join("");

  const targetEdges = guesses.map((guess, index) => {
    const node = getGuessNode(selectedPuzzle, guess);
    const feedback = getFeedback(selectedPuzzle, node, semanticIndex);
    if (feedback.distance !== 1) return "";
    const position = guessPositions.get(guess.id)!;
    const label = semanticIndex.adjacency.get(normalizeWord(guess.label))?.get(normalizeWord(target.label));
    const edgeLabel = targetVisible ? label ?? "conexão" : "?";
    return `<g class="graph-edge-group edge-to-target">
      <path class="graph-edge ${index === guesses.length - 1 ? "edge-new" : ""}" d="${edgePath(position, targetPosition, index)}" />
      <text class="edge-label ${targetVisible ? "" : "edge-secret-label"}" x="${(position.x + targetPosition.x) / 2}" y="${(position.y + targetPosition.y) / 2 - 12}" text-anchor="middle">${escapeHtml(edgeLabel)}</text>
    </g>`;
  }).join("");

  const targetNode = `<g class="graph-node target-node ${targetVisible ? "target-revealed" : "target-hidden"}" transform="translate(${targetPosition.x - 78} ${targetPosition.y - 31})" aria-label="${targetVisible ? `Resposta: ${escapeHtml(target.label)}` : "Palavra secreta"}">
      <rect width="156" height="62" rx="22" />
      <text class="target-eyebrow" x="78" y="22" text-anchor="middle">${targetVisible ? "RESPOSTA" : "PALAVRA SECRETA"}</text>
      <text class="target-label" x="78" y="45" text-anchor="middle">${targetVisible ? escapeHtml(target.label) : "?????"}</text>
    </g>`;

  const guessMarkup = guesses.map((guess, index) => {
    const position = guessPositions.get(guess.id)!;
    const node = getGuessNode(selectedPuzzle, guess);
    const feedback = getFeedback(selectedPuzzle, node, semanticIndex);
    const latest = index === guesses.length - 1;
    const winning = guess.id === selectedPuzzle.targetId;
    const letters = feedback.sharedLetters.length === 0 ? "0 letras" : `${feedback.sharedLetters.length} ${feedback.sharedLetters.length === 1 ? "letra" : "letras"}`;
    const distance = feedback.distance === null ? "sem caminho" : `${feedback.distance} conex.`;
    const path = displayRelationPath(feedback);
    const meta = path ? `${distance} · ${letters}` : `${distance} · ${letters}`;
    return `<g class="graph-node guess-node ${latest ? "guess-latest" : ""} ${winning ? "guess-winning" : ""}" transform="translate(${position.x - 78} ${position.y - 34})" aria-label="${escapeHtml(node.label)}; ${feedback.distance === null ? "sem relação registrada" : distanceCopy(feedback.distance)}; ${letters} em comum${path ? `; ${escapeHtml(path)}` : ""}">
      <rect width="156" height="68" rx="20" />
      <text class="guess-word" x="78" y="29" text-anchor="middle">${escapeHtml(node.label)}</text>
      <text class="guess-meta" x="78" y="51" text-anchor="middle">${escapeHtml(meta)}</text>
    </g>`;
  }).join("");

  const empty = guesses.length === 0
    ? `<g class="graph-empty" transform="translate(250 ${Math.max(250, graphHeight - 92)})"><circle r="48" /><text y="7" text-anchor="middle">ECO</text></g>`
    : "";

  return `<div class="graph-scroll" tabindex="0" aria-label="Mapa semântico; use as setas para navegar">
    <svg class="graph-svg" viewBox="0 0 500 ${graphHeight}" role="img" aria-label="Mapa com ${guesses.length} ${guesses.length === 1 ? "palpite" : "palpites"} e suas conexões">
      <defs>
        <marker id="edge-dot" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="6" markerHeight="6"><circle cx="4" cy="4" r="3" /></marker>
      </defs>
      <path class="target-stem" d="M 250 95 L 250 129" />
      ${guessedEdges}${targetEdges}${targetNode}${guessMarkup}${empty}
    </svg>
  </div>`;
}

function renderLatestClue(selectedPuzzle: Puzzle, round: RoundState): string {
  const feedback = getLastFeedback(selectedPuzzle, round);
  if (!feedback) {
    return `<section class="clue-panel clue-empty" aria-label="Pistas"><span class="clue-spark" aria-hidden="true">✳</span><p>Seu primeiro palpite abre o mapa.</p></section>`;
  }
  const sharedText = feedback.sharedLetters.length === 0
    ? "Nenhuma letra em comum"
    : `${feedback.sharedLetters.length} ${feedback.sharedLetters.length === 1 ? "letra" : "letras"} em comum`;
  const relationPath = displayRelationPath(feedback);
  return `<section class="clue-panel" aria-label="Pistas do último palpite" aria-live="polite">
    <div class="clue-heading"><span class="clue-kicker">ÚLTIMO ECO</span><strong>${escapeHtml(feedback.node.label)}</strong></div>
    <div class="clue-values">
      ${feedback.distance !== null ? `<span class="clue-value clue-good"><i aria-hidden="true">↔</i>${distanceCopy(feedback.distance)}</span>` : ""}
      ${relationPath ? `<span class="clue-value clue-relation"><i aria-hidden="true">⌁</i>${escapeHtml(relationPath)}</span>` : ""}
      <span class="clue-value ${feedback.sharedLetters.length ? "clue-good" : "clue-muted"}"><i aria-hidden="true">Aa</i>${sharedText}</span>
    </div>
  </section>`;
}

function renderStatus(selectedPuzzle: Puzzle, round: RoundState): string {
  if (round.status !== "solved") return "";
  const target = getTarget(selectedPuzzle);
  const count = round.guesses.length;
  return `<section class="finish-panel finish-win" aria-live="polite">
    <div class="finish-mark" aria-hidden="true">✳</div>
    <div><span class="clue-kicker">VOCÊ ENCONTROU</span><h2>${escapeHtml(target.label)}</h2><p>${escapeHtml(selectedPuzzle.sense)} · ${count} ${count === 1 ? "palpite" : "palpites"}</p></div>
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

function activeDayNumber(): number {
  return selection.mode === "daily" ? (TODAY_INDEX ?? 0) + 1 : selection.practiceDay + 1;
}

function shareText(round: RoundState): string {
  const day = activeDayNumber();
  const trail = round.guesses.map((guess) => guess.label).join(" → ");
  const outcome = `Resolvi em ${round.guesses.length} ${round.guesses.length === 1 ? "palpite" : "palpites"}`;
  const url = new URL(window.location.href);
  if (selection.mode === "practice") url.searchParams.set("treino", String(day));
  else url.searchParams.delete("treino");
  const mode = selection.mode === "practice" ? "treino" : "desafio diário";
  return `ECO · ${mode} ${day}/7\n${outcome}\n${trail}\n\nJogue: ${url.href}`;
}

function render(): void {
  document.documentElement.dataset.theme = theme;
  const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeColor) themeColor.content = theme === "dark" ? "#111914" : "#f3f2eb";
  const day = activeDayNumber();
  const used = state.guesses.length;
  const isPlaying = state.status === "playing";
  const newestGuess = state.guesses.at(-1);

  app!.innerHTML = `<main class="page-shell">
    <header class="topbar">
      <a class="wordmark" href="/" aria-label="ECO início">ECO<span>.</span></a>
      <div class="topbar-meta">${renderChallengePicker()}<button class="theme-toggle" type="button" aria-label="${theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}" title="Alternar tema">${theme === "dark" ? "☼" : "◐"}</button></div>
    </header>

    <div class="game-layout">
      <section class="game-panel" aria-label="Partida">
        <section class="intro-row">
          <div><span class="eyebrow">${selection.mode === "daily" ? `${escapeHtml(formatDate(TODAY))} · DESAFIO DIÁRIO` : `TREINO ${String(day).padStart(2, "0")} · ${escapeHtml(formatDate(activePuzzle.date))}`}</span><h1>Uma palavra. <em>Vários caminhos.</em></h1></div>
          <details class="how-to"><summary>Como jogar <span aria-hidden="true">＋</span></summary><div class="how-to-copy"><p>Digite qualquer palavra. O ECO mostra conexões conhecidas e letras em comum; palavras sem relação no mapa também valem.</p><p>Ao encontrar a resposta, escolha a relação que abre o caminho secreto.</p></div></details>
        </section>

        <section class="target-strip" aria-label="Palavra secreta e palpites">
          <div class="target-copy"><span class="target-label">${selection.mode === "daily" ? "A PALAVRA DE HOJE" : `PALAVRA DO TREINO ${String(day).padStart(2, "0")}`}</span><strong>${isPlaying ? "?????" : escapeHtml(getTarget(activePuzzle).label)}</strong><span class="target-sense">${isPlaying ? "escute os ecos" : escapeHtml(getTarget(activePuzzle).category)}</span></div>
          <div class="attempts-box"><div class="attempts-heading"><span>PALPITES</span><strong>${used}</strong></div><div class="attempt-dots" aria-label="${used} palpites feitos">${used === 0 ? `<span class="attempt-empty">sem limite</span>` : `<span class="attempt-used">${used} ${used === 1 ? "palpite" : "palpites"}</span>`}</div><small>tentativas ilimitadas</small></div>
        </section>

        ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ""}
        ${renderLatestClue(activePuzzle, state)}

        ${isPlaying ? `<form class="guess-form" id="guess-form" autocomplete="off">
          <label class="input-label" for="guess-input">Qual palavra você quer testar?</label>
          <div class="input-row"><div class="input-wrap"><span class="input-mark" aria-hidden="true">↳</span><input id="guess-input" name="guess" type="text" value="${escapeHtml(draftGuess)}" placeholder="Digite qualquer palavra…" aria-describedby="input-help" required /><button class="clear-input" type="button" aria-label="Limpar palavra">×</button></div><button class="submit-button" type="submit">ECOAR <span aria-hidden="true">↗</span></button></div>
          <div class="input-foot"><span id="input-help">Uma palavra diferente, uma nova conexão possível.</span><span>sem limite</span></div>
        </form>` : ""}

        ${renderStatus(activePuzzle, state)}
        ${renderConnectionQuiz(activePuzzle, state)}
        ${!isPlaying ? `<section class="result-share"><div><span class="clue-kicker">SEU CAMINHO</span><p>Você encontrou ${escapeHtml(getTarget(activePuzzle).label)} em ${used} ${used === 1 ? "palpite" : "palpites"}.</p></div><button class="share-button" id="share-button" type="button"><span aria-hidden="true">↗</span> Compartilhar resultado</button></section>` : ""}
      </section>

      <section class="map-section" aria-labelledby="map-title">
        <div class="map-heading"><div><div class="section-label"><span>01</span><span>SEU MAPA</span></div><h2 id="map-title">Cada palpite deixa um eco.</h2></div><span class="map-count">${used} ${used === 1 ? "palavra" : "palavras"}</span></div>
        <div class="map-card">${renderGraph(activePuzzle, state)}<div class="map-legend"><span><i class="legend-node"></i>palpite</span><span><i class="legend-link"></i>relação registrada</span></div></div>
        <p class="data-credit">Relações semânticas: <a href="https://conceptnet.io/" target="_blank" rel="noreferrer">ConceptNet 5.7</a> · CC BY-SA 4.0</p>
      </section>
    </div>

    <footer class="page-footer"><span>Seu progresso fica salvo neste navegador.</span><span>${newestGuess ? `${used} ${used === 1 ? "palavra" : "palavras"} no mapa` : "Um jogo sem pressa, sem conta e sem barulho."}</span></footer>
  </main>`;

  bindThemeToggle();
  bindChallengePicker();
  bindGuessForm();
  bindConnectionOptions();
  bindShareButton();
  bindGraphScroll();
}

function switchChallenge(value: string): void {
  if (value === "daily" && TODAY_INDEX !== null) {
    selection = { ...selection, mode: "daily" };
  } else if (value.startsWith("practice:")) {
    const day = Number(value.slice("practice:".length));
    if (!Number.isInteger(day) || day < 0 || day >= puzzles.length) return;
    selection = { mode: "practice", practiceDay: day };
  } else return;

  activePuzzle = getPuzzleForPilotDay(selection.mode === "daily" ? TODAY_INDEX! : selection.practiceDay)!;
  activeRoundKey = getRoundKey(selection);
  activeStorageKey = getStorageKey(selection);
  semanticIndex = createSemanticIndex(activePuzzle, semanticEdges);
  state = readState(activePuzzle, activeRoundKey, activeStorageKey, selection.mode);
  notice = "";
  draftGuess = "";
  persistSelection();
  render();
}

function bindThemeToggle(): void {
  document.querySelector<HTMLButtonElement>(".theme-toggle")?.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    persistTheme();
    render();
  });
}

function bindChallengePicker(): void {
  document.querySelector<HTMLSelectElement>("#challenge-select")?.addEventListener("change", (event) => {
    switchChallenge((event.currentTarget as HTMLSelectElement).value);
  });
}

function bindGuessForm(): void {
  const form = document.querySelector<HTMLFormElement>("#guess-form");
  const input = document.querySelector<HTMLInputElement>("#guess-input");
  if (!form || !input) return;
  input.addEventListener("input", () => { draftGuess = input.value; });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    draftGuess = input.value;
    const result = submitGuess(activePuzzle, state, input.value, semanticIndex);
    if (result.kind === "empty") {
      notice = "Digite uma palavra para ecoar.";
      render();
      document.querySelector<HTMLInputElement>("#guess-input")?.focus();
      return;
    }
    if (result.kind === "duplicate") {
      notice = `“${result.guess.label}” já deixou um eco. Digite outra palavra.`;
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
    document.querySelector<HTMLElement>(".graph-scroll")?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  });
  document.querySelector<HTMLButtonElement>(".clear-input")?.addEventListener("click", () => {
    draftGuess = "";
    input.value = "";
    input.focus();
  });
}

function bindConnectionOptions(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const optionId = button.dataset.option;
      if (!optionId) return;
      state = chooseConnection(activePuzzle, state, optionId);
      persistState();
      render();
    });
  });
}

async function bindShareButton(): Promise<void> {
  const button = document.querySelector<HTMLButtonElement>("#share-button");
  if (!button) return;
  button.addEventListener("click", async () => {
    const text = shareText(state);
    const data = { title: "ECO — seu caminho", text };
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
    if (event.key === "ArrowDown") graph.scrollBy({ top: 100, behavior: "smooth" });
    if (event.key === "ArrowUp") graph.scrollBy({ top: -100, behavior: "smooth" });
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
      const index = createSemanticIndex(item, semanticEdges);
      for (const id of item.nodes.map((word) => word.id)) {
        if (getFeedback(item, getNode(item, id)!, index).distance === null) throw new Error(`Nó desconectado da resposta: ${item.date}/${id}`);
      }
      for (let routeIndex = 1; routeIndex < item.secretRoute.length; routeIndex += 1) {
        const left = item.secretRoute[routeIndex - 1];
        const right = item.secretRoute[routeIndex];
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
void loadSemanticEdges().then((loadedEdges) => {
  if (loadedEdges.length === 0) return;
  const wasGuessFocused = document.activeElement?.id === "guess-input";
  semanticEdges = loadedEdges;
  semanticIndex = createSemanticIndex(activePuzzle, semanticEdges);
  render();
  if (wasGuessFocused) document.querySelector<HTMLInputElement>("#guess-input")?.focus();
});
scheduleDailyTurnover();
