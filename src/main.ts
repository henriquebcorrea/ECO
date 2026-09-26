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
  isRoundState,
  MAX_GUESSES,
  restoreRound,
  submitGuess,
  type Puzzle,
  type RoundMode,
  type RoundState,
  type SemanticEdge,
  type SemanticIndex,
  type WordValidator,
  type WordNode,
} from "./game";
import { getPuzzleForPilotDay, puzzles } from "./data/puzzles";
import { loadSemanticEdges } from "./data/semantic";
import { loadPortugueseVocabulary, type PortugueseVocabulary } from "./data/vocabulary";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Elemento principal #app não encontrado.");

const TODAY = getSaoPauloDate();
const TODAY_INDEX = getPilotDay(TODAY);
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
let vocabulary: PortugueseVocabulary | null = null;
let vocabularyStatus: "loading" | "ready" | "failed" = "loading";
let notice = "";
let draftGuess = "";
let state = createRound(activeRoundKey, selection.mode);

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
  validator: WordValidator,
): RoundState {
  try {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return createRound(roundKey, mode);
    const parsed: unknown = JSON.parse(stored);
    const restored = restoreRound(parsed, roundKey, mode, selectedPuzzle, validator);
    if (restored) {
      if (!isRoundState(parsed, roundKey, mode, selectedPuzzle)
        || JSON.stringify(parsed) !== JSON.stringify(restored)) {
        localStorage.setItem(storageKey, JSON.stringify(restored));
      }
      return restored;
    }
  } catch {
    // Uma falha de armazenamento não impede uma nova partida.
  }
  return createRound(roundKey, mode);
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

function renderUpdatedGraph(selectedPuzzle: Puzzle, round: RoundState): string {
  const rows = round.guesses.slice(0, -1).map((guess, index) => {
    const next = round.guesses[index + 1];
    const feedback = getFeedback(selectedPuzzle, getGuessNode(selectedPuzzle, guess), semanticIndex);
    const relation = next.relationFromPrevious ?? feedback.nextStep?.relation ?? "leva a";
    return "<li class=\"connection-row\"><span class=\"trail-word trail-origin\">" + escapeHtml(guess.label)
      + "</span><span class=\"trail-link\"><span>" + escapeHtml(relation)
      + "</span><b aria-hidden=\"true\">↓</b></span><span class=\"trail-word trail-destination\">"
      + escapeHtml(next.label) + "</span></li>";
  }).join("");

  let connectionMarkup = rows;
  if (round.activeStep) {
    const step = round.activeStep;
    const latest = round.status !== "solved";
    const destination = round.status === "lost" ? step.answerLabel : step.isSecret ? "PALAVRA-CHAVE" : "????";
    const ariaDestination = round.status === "lost" ? destination : "destino escondido";
    connectionMarkup += "<li class=\"connection-row " + (latest ? "is-latest" : "") + "\" "
      + (latest ? "data-latest=\"true\" " : "") + "aria-label=\"" + escapeHtml(step.fromLabel) + "; "
      + escapeHtml(step.relation) + "; " + escapeHtml(ariaDestination) + "\">"
      + "<span class=\"trail-word trail-origin\">" + escapeHtml(step.fromLabel) + "</span>"
      + "<span class=\"trail-link\"><span>" + escapeHtml(step.relation) + "</span><b aria-hidden=\"true\">↓</b></span>"
      + "<span class=\"trail-word " + (step.isSecret ? "trail-secret" : "trail-destination") + "\">"
      + escapeHtml(destination) + "</span></li>";
  }
  if (round.status === "solved") {
    const target = getTarget(selectedPuzzle);
    connectionMarkup += "<li class=\"connection-row is-keyword-found\" data-latest=\"true\"><span class=\"trail-word trail-origin\">"
      + escapeHtml(target.label) + "</span><span class=\"trail-link\"><span>palavra-chave encontrada</span>"
      + "<b aria-hidden=\"true\">✓</b></span><span class=\"trail-word trail-destination\">"
      + escapeHtml(target.label) + "</span></li>";
  }

  const unlinked = round.unlinked.map((guess, index) => {
    const latest = !round.activeStep && round.status !== "solved" && index === round.unlinked.length - 1;
    return "<li class=\"unlinked-word " + (latest ? "is-latest" : "") + "\" "
      + (latest ? "data-latest=\"true\" " : "") + "><span class=\"trail-word\">"
      + escapeHtml(guess.label) + "</span><span class=\"unlinked-label\">Sem elo conhecido nesta rota</span></li>";
  }).join("");
  const empty = round.guesses.length === 0 && round.unlinked.length === 0
    ? "<div class=\"map-empty\"><span aria-hidden=\"true\">✳</span><p>Seu primeiro palpite abre uma trilha.</p><small>Acerte cada próximo elo para avançar.</small></div>"
    : "";
  return "<div class=\"graph-scroll\" tabindex=\"0\" aria-label=\"Mapa da trilha semântica; use as setas para navegar\"><div class=\"trail-content\">"
    + (connectionMarkup ? "<section class=\"trail-area\" aria-labelledby=\"known-trail-title\"><h3 id=\"known-trail-title\">TRILHA CONFIRMADA</h3><ol class=\"connection-list\">"
      + connectionMarkup + "</ol></section>" : "")
    + (unlinked ? "<section class=\"unlinked-area\" aria-labelledby=\"unlinked-trail-title\"><h3 id=\"unlinked-trail-title\">PALPITES SEM ELO</h3><ul class=\"unlinked-list\">"
      + unlinked + "</ul></section>" : "")
    + empty + "</div></div>";
}

function renderGraph(selectedPuzzle: Puzzle, round: RoundState): string {
  return renderUpdatedGraph(selectedPuzzle, round);
}
function renderUpdatedClue(selectedPuzzle: Puzzle, round: RoundState): string {
  const step = round.activeStep;
  if (!step && round.status === "lost") {
    return "<section class=\"clue-panel clue-solved\" aria-label=\"Rodada encerrada\"><span class=\"clue-spark\" aria-hidden=\"true\">↗</span><p>A palavra-chave era <strong>"
      + escapeHtml(getTarget(selectedPuzzle).label) + "</strong>. Tente outra rota no próximo desafio.</p></section>";
  }
  if (!step) {
    return "<section class=\"clue-panel clue-empty\" aria-label=\"Pistas\"><span class=\"clue-spark\" aria-hidden=\"true\">✳</span><p>Escolha uma palavra para abrir uma trilha. O destino do elo fica escondido.</p></section>";
  }
  if (round.status === "solved") {
    return "<section class=\"clue-panel clue-solved\" aria-label=\"Pistas do último palpite\" aria-live=\"polite\"><span class=\"clue-spark\" aria-hidden=\"true\">✓</span><p>Você encontrou a palavra-chave. Agora escolha a conexão para abrir o caminho secreto.</p></section>";
  }
  const revealed = Array.from(step.answerLabel).slice(0, step.revealedLetters).join("");
  const destination = round.status === "lost"
    ? step.answerLabel
    : step.revealedLetters > 0
      ? revealed + " _".repeat(Math.max(0, Array.from(step.answerLabel).length - step.revealedLetters))
      : "????";
  const heading = step.isSecret ? "PALAVRA-CHAVE" : "PRÓXIMO ELO";
  const message = round.status === "lost"
    ? "O elo que faltou era " + step.answerLabel + "."
    : "Erros válidos revelam uma letra · " + round.attemptCount + "/" + MAX_GUESSES + " palpites usados. Digite a palavra que completa a relação.";
  return "<section class=\"clue-panel clue-active\" aria-label=\"Pistas do último palpite\" aria-live=\"polite\">"
    + "<div class=\"clue-heading\"><span class=\"clue-kicker\">" + heading + "</span><strong>"
    + escapeHtml(step.fromLabel) + "</strong></div><div class=\"clue-flow\"><span class=\"clue-relation\">"
    + escapeHtml(step.relation) + "</span><span class=\"clue-flow-arrow\" aria-hidden=\"true\">↓</span>"
    + "<strong class=\"clue-next " + (step.isSecret ? "is-secret" : "") + "\">" + escapeHtml(destination)
    + "</strong></div><p class=\"clue-instruction\">" + escapeHtml(message) + "</p></section>";
}

function renderLatestClue(selectedPuzzle: Puzzle, round: RoundState): string {
  return renderUpdatedClue(selectedPuzzle, round);
}
function renderUpdatedStatus(selectedPuzzle: Puzzle, round: RoundState): string {
  if (round.status === "playing") return "";
  const target = getTarget(selectedPuzzle);
  const won = round.status === "solved";
  return "<section class=\"finish-panel " + (won ? "finish-win" : "finish-loss") + "\" aria-live=\"polite\">"
    + "<div class=\"finish-mark\" aria-hidden=\"true\">" + (won ? "✳" : "↗") + "</div><div><span class=\"clue-kicker\">"
    + (won ? "VOCÊ ENCONTROU" : "FIM DAS TENTATIVAS") + "</span><h2>" + escapeHtml(target.label)
    + "</h2><p>" + escapeHtml(selectedPuzzle.sense) + " · " + round.attemptCount + "/" + MAX_GUESSES
    + " palpites</p></div></section>";
}

function renderStatus(selectedPuzzle: Puzzle, round: RoundState): string {
  return renderUpdatedStatus(selectedPuzzle, round);
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
  if (round.status !== "playing") {
    const day = activeDayNumber();
    const trail = round.guesses.map((guess) => guess.label).join(" → ");
    const url = new URL(window.location.href);
    if (selection.mode === "practice") url.searchParams.set("treino", String(day));
    else url.searchParams.delete("treino");
    const mode = selection.mode === "practice" ? "treino" : "desafio diário";
    const result = round.status === "solved"
      ? "Resolvi em " + round.attemptCount + "/" + MAX_GUESSES + " palpites"
      : "A palavra-chave era " + getTarget(activePuzzle).label + " · " + round.attemptCount + "/" + MAX_GUESSES;
    return "ECO · " + mode + " " + day + "/7\n" + result + "\n" + trail + "\n\nJogue: " + url.href;
  }
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
  const day = activeDayNumber();
  const used = state.attemptCount;
  const mapCount = state.guesses.length + state.unlinked.length;
  const isPlaying = state.status === "playing";
  const newestGuess = state.guesses.at(-1) ?? state.unlinked.at(-1);
  const inputDisabled = vocabularyStatus !== "ready";

  app!.innerHTML = `<main class="page-shell">
    <header class="topbar">
      <a class="wordmark" href="/" aria-label="ECO início">ECO<span>.</span></a>
      <div class="topbar-meta">${renderChallengePicker()}</div>
    </header>

    <div class="game-layout">
      <section class="game-panel" aria-label="Partida">
        <section class="intro-row">
          <div><span class="eyebrow">${selection.mode === "daily" ? `${escapeHtml(formatDate(TODAY))} · DESAFIO DIÁRIO` : `TREINO ${String(day).padStart(2, "0")} · ${escapeHtml(formatDate(activePuzzle.date))}`}</span><h1>Uma palavra. <em>Vários caminhos.</em></h1></div>
          <details class="how-to"><summary>Como jogar <span aria-hidden="true">＋</span></summary><div class="how-to-copy"><p>Digite uma palavra do vocabulário português. O mapa revela o próximo elo conhecido e a relação entre as palavras; algumas palavras válidas não têm rota registrada.</p><p>Use uma palavra por palpite. As tentativas são ilimitadas. Ao encontrar a resposta, escolha a conexão que abre o caminho secreto.</p></div></details>
        </section>

        <section class="target-strip" aria-label="Palavra secreta e palpites">
          <div class="target-copy"><span class="target-label">${selection.mode === "daily" ? "A PALAVRA DE HOJE" : `PALAVRA DO TREINO ${String(day).padStart(2, "0")}`}</span><strong>${isPlaying ? "?????" : escapeHtml(getTarget(activePuzzle).label)}</strong><span class="target-sense">${isPlaying ? "escute os ecos" : escapeHtml(getTarget(activePuzzle).category)}</span></div>
          <div class="attempts-box"><div class="attempts-heading"><span>PALPITES</span><strong>${used}</strong></div><div class="attempt-dots" aria-label="${used} palpites feitos">${used === 0 ? `<span class="attempt-empty">sem limite</span>` : `<span class="attempt-used">${used} ${used === 1 ? "palpite" : "palpites"}</span>`}</div><small>tentativas ilimitadas</small></div>
        </section>

        ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ""}
        ${vocabularyStatus === "loading" ? `<p class="vocabulary-status" role="status">Carregando o vocabulário português offline…</p>` : ""}
        ${vocabularyStatus === "failed" ? `<p class="vocabulary-status vocabulary-error" role="alert">Não consegui carregar o vocabulário offline. Recarregue a página para tentar novamente.</p>` : ""}
        ${renderLatestClue(activePuzzle, state)}

        ${isPlaying ? `<form class="guess-form" id="guess-form" autocomplete="off">
          <label class="input-label" for="guess-input">Digite uma palavra em português</label>
          <div class="input-row"><div class="input-wrap"><span class="input-mark" aria-hidden="true">↳</span><input id="guess-input" name="guess" type="text" value="${escapeHtml(draftGuess)}" placeholder="Uma palavra…" aria-describedby="input-help" autocomplete="off" autocapitalize="none" spellcheck="false" ${inputDisabled ? "disabled" : ""} required /><button class="clear-input" type="button" aria-label="Limpar palavra" ${inputDisabled ? "disabled" : ""}>×</button></div><button class="submit-button" type="submit" ${inputDisabled ? "disabled" : ""}>ECOAR <span aria-hidden="true">↗</span></button></div>
          <div class="input-foot"><span id="input-help">Uma palavra por palpite. Sem limite de tentativas.</span><span>pt-BR</span></div>
        </form>` : ""}

        ${renderStatus(activePuzzle, state)}
        ${renderConnectionQuiz(activePuzzle, state)}
        ${!isPlaying ? `<section class="result-share"><div><span class="clue-kicker">SEU CAMINHO</span><p>Você encontrou ${escapeHtml(getTarget(activePuzzle).label)} em ${used} ${used === 1 ? "palpite" : "palpites"}.</p></div><button class="share-button" id="share-button" type="button"><span aria-hidden="true">↗</span> Compartilhar resultado</button></section>` : ""}
      </section>

      <section class="map-section" aria-labelledby="map-title">
        <div class="map-heading"><div><div class="section-label"><span>01</span><span>SEU MAPA</span></div><h2 id="map-title">Cada palpite deixa um eco.</h2></div><span class="map-count">${used} ${used === 1 ? "palavra" : "palavras"}</span></div>
        <div class="map-card">${renderGraph(activePuzzle, state)}<div class="map-legend"><span><i class="legend-node"></i>palpite</span><span><i class="legend-link"></i>elo e relação</span><span><i class="legend-unlinked"></i>sem elo</span></div></div>
        <p class="data-credit">Relações: <a href="https://conceptnet.io/" target="_blank" rel="noreferrer">ConceptNet 5.7</a> · CC BY-SA 4.0 · <a href="${import.meta.env.BASE_URL}licenses/third-party-notices.txt" target="_blank" rel="noreferrer">dicionário VERO e licenças</a></p>
      </section>
    </div>

    <footer class="page-footer"><span>Seu progresso fica salvo neste navegador.</span><span>${newestGuess ? `${used} ${used === 1 ? "palavra" : "palavras"} no mapa` : "Um jogo sem pressa, sem conta e sem barulho."}</span></footer>
  </main>`;

  const mapCountElement = app!.querySelector<HTMLElement>(".map-count");
  if (mapCountElement) mapCountElement.textContent = mapCount + (mapCount === 1 ? " palavra" : " palavras");
  const mapTitle = app!.querySelector<HTMLElement>("#map-title");
  if (mapTitle) mapTitle.textContent = "Cada elo confirmado abre caminho.";
  const mapLegendNode = app!.querySelector<HTMLElement>(".map-legend span:first-child");
  if (mapLegendNode) mapLegendNode.lastChild!.textContent = "palavra confirmada";
  const attemptCountElement = app!.querySelector<HTMLElement>(".attempts-heading strong");
  if (attemptCountElement) attemptCountElement.textContent = used + "/" + MAX_GUESSES;
  const attemptLabel = app!.querySelector<HTMLElement>(".attempt-dots");
  if (attemptLabel) {
    attemptLabel.textContent = used === 0 ? MAX_GUESSES + " palpites disponíveis" : used + "/" + MAX_GUESSES + " usados";
    attemptLabel.setAttribute("aria-label", used + " de " + MAX_GUESSES + " palpites usados");
  }
  const attemptHelp = app!.querySelector<HTMLElement>(".attempts-box small");
  if (attemptHelp) attemptHelp.textContent = "erros revelam letras";
  const targetHint = app!.querySelector<HTMLElement>(".target-sense");
  if (targetHint && isPlaying) targetHint.textContent = "palavra-chave em segredo";
  const inputHelp = app!.querySelector<HTMLElement>("#input-help");
  if (inputHelp) inputHelp.textContent = "Cada erro válido revela uma letra. Máximo de " + MAX_GUESSES + " palpites.";
  const helpCopy = app!.querySelector<HTMLElement>(".how-to-copy");
  if (helpCopy) helpCopy.innerHTML = "<p>Digite uma palavra válida para iniciar uma rota. Depois, descubra o próximo elo escondido pela relação indicada; a palavra não aparece no mapa.</p><p>Erros válidos revelam uma letra. Você tem até "
    + MAX_GUESSES + " palpites para alcançar a palavra-chave. Palavras repetidas ou fora do dicionário não contam.</p>";
  const resultCopy = app!.querySelector<HTMLElement>(".result-share p");
  if (resultCopy && state.status === "lost") {
    resultCopy.textContent = "As tentativas acabaram. A palavra-chave era " + getTarget(activePuzzle).label + ".";
  }
  const footerMapCount = app!.querySelector<HTMLElement>(".page-footer span:last-child");
  if (footerMapCount && mapCount > 0) footerMapCount.textContent = mapCount + (mapCount === 1 ? " palavra no mapa" : " palavras no mapa");

  bindChallengePicker();
  bindGuessForm();
  bindConnectionOptions();
  bindShareButton();
  bindGraphScroll();
  const scrollBehavior = nextMapScrollBehavior;
  nextMapScrollBehavior = "auto";
  window.requestAnimationFrame(() => scrollMapToLatest(scrollBehavior));
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
  semanticIndex = createActiveSemanticIndex();
  state = vocabulary
    ? readState(activePuzzle, activeRoundKey, activeStorageKey, selection.mode, vocabulary.isValidGuess)
    : createRound(activeRoundKey, selection.mode);
  notice = "";
  draftGuess = "";
  persistSelection();
  render();
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
    if (!vocabulary) {
      notice = "O vocabulário ainda está carregando. Tente novamente em instantes.";
      render();
      return;
    }
    const result = submitGuess(activePuzzle, state, input.value, semanticIndex, vocabulary.isValidGuess);
    if (result.kind === "empty") {
      notice = "Digite uma palavra para ecoar.";
      render();
      document.querySelector<HTMLInputElement>("#guess-input")?.focus();
      return;
    }
    if (result.kind === "invalid") {
      notice = "Essa palavra não está no dicionário pt-BR. Confira a grafia e tente uma palavra só.";
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
    notice = result.outcome === "wrong"
      ? "Essa não. Uma letra do elo escondido foi revelada."
      : result.outcome === "advanced"
        ? "Elo confirmado. Descubra a próxima palavra."
        : result.outcome === "started"
          ? "A trilha começou. Descubra o próximo elo."
          : result.outcome === "unlinked"
            ? "Essa palavra não tem elo conhecido. Tente outra para abrir a trilha."
            : result.outcome === "lost"
              ? "Suas 12 tentativas acabaram."
              : result.outcome === "solved"
                ? "Você encontrou a palavra-chave."
                : "";
    persistState();
    nextMapScrollBehavior = "smooth";
    render();
    if (state.status === "playing") document.querySelector<HTMLInputElement>("#guess-input")?.focus();
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
    if (event.key === "ArrowDown") graph.scrollBy({ top: 100, behavior: "smooth" });
    if (event.key === "ArrowUp") graph.scrollBy({ top: -100, behavior: "smooth" });
  });
}

let nextMapScrollBehavior: ScrollBehavior = "auto";

function scrollMapToLatest(behavior: ScrollBehavior): void {
  const graph = document.querySelector<HTMLDivElement>(".graph-scroll");
  const latest = graph?.querySelector<HTMLElement>("[data-latest='true']");
  if (!graph || !latest) return;
  const graphRect = graph.getBoundingClientRect();
  const latestRect = latest.getBoundingClientRect();
  const centeredTop = graph.scrollTop + latestRect.top - graphRect.top
    - Math.max(14, (graph.clientHeight - latest.offsetHeight) / 2);
  graph.scrollTo({ top: Math.max(0, centeredTop), behavior });
}

function createActiveSemanticIndex(): SemanticIndex {
  return createSemanticIndex(
    activePuzzle,
    semanticEdges,
    (term) => vocabulary?.resolveGraphTerm(term, activePuzzle) ?? null,
  );
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
      for (const id of item.secretRoute.slice(0, -1)) {
        if (!getFeedback(item, getNode(item, id)!, index).nextStep) {
          throw new Error(`Elo sem caminho até a resposta: ${item.date}/${id}`);
        }
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
void loadPortugueseVocabulary().then((loadedVocabulary) => {
  vocabulary = loadedVocabulary;
  vocabularyStatus = "ready";
  state = readState(activePuzzle, activeRoundKey, activeStorageKey, selection.mode, loadedVocabulary.isValidGuess);
  semanticIndex = createActiveSemanticIndex();
  render();
  return loadSemanticEdges();
}).then((loadedEdges) => {
  if (loadedEdges.length === 0) return;
  semanticEdges = loadedEdges;
  semanticIndex = createActiveSemanticIndex();
  render();
}).catch(() => {
  vocabularyStatus = "failed";
  notice = "";
  render();
});
scheduleDailyTurnover();
