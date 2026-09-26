import "./styles.css";
import {
  createRound,
  getCurrentIndex,
  isCurrentRelationRevealed,
  isRoundState,
  MAX_GUESSES,
  RELATION_REVEAL_MISSES,
  restoreRound,
  routeIsValid,
  submitGuess,
  type Puzzle,
  type RoundState,
} from "./game";
import { getPuzzleById, puzzles } from "./data/puzzles";
import { loadPortugueseVocabulary, type PortugueseVocabulary } from "./data/vocabulary";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Elemento principal #app não encontrado.");

const selectionKey = "eco:sequence:selection:v1";
const DEFAULT_PUZZLE_ID = puzzles[0].id;

function readSelection(): string {
  const requestedId = new URLSearchParams(window.location.search).get("rota");
  if (requestedId && getPuzzleById(requestedId)) return requestedId;
  try {
    const storedId = localStorage.getItem(selectionKey);
    if (storedId && getPuzzleById(storedId)) return storedId;
  } catch { /* seleção apenas desta visita */ }
  return DEFAULT_PUZZLE_ID;
}

let activePuzzle = getPuzzleById(readSelection())!;
let state = createRound(activePuzzle.id);
let vocabulary: PortugueseVocabulary | null = null;
let vocabularyStatus: "loading" | "ready" | "failed" = "loading";
let notice = "";
let draftGuess = "";
let nextMapScrollBehavior: ScrollBehavior = "auto";

function storageKey(puzzle: Puzzle): string {
  return `eco:sequence:v1:${puzzle.id}`;
}

function readState(puzzle: Puzzle): RoundState {
  try {
    const raw = localStorage.getItem(storageKey(puzzle));
    if (!raw) return createRound(puzzle.id);
    const parsed: unknown = JSON.parse(raw);
    const restored = restoreRound(parsed, puzzle);
    if (!restored) return createRound(puzzle.id);
    if (!isRoundState(parsed, puzzle) || JSON.stringify(parsed) !== JSON.stringify(restored)) {
      localStorage.setItem(storageKey(puzzle), JSON.stringify(restored));
    }
    return restored;
  } catch { return createRound(puzzle.id); }
}

function persistState(): void {
  try { localStorage.setItem(storageKey(activePuzzle), JSON.stringify(state)); }
  catch { notice = "Não consegui salvar esta partida neste navegador."; }
}

function persistSelection(): void {
  try { localStorage.setItem(selectionKey, activePuzzle.id); } catch { /* funciona nesta visita */ }
  const url = new URL(window.location.href);
  url.searchParams.delete("treino");
  url.searchParams.delete("date");
  url.searchParams.set("rota", activePuzzle.id);
  window.history.replaceState(null, "", url);
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function getVisibleNodeLabel(puzzle: Puzzle, round: RoundState, index: number): string {
  const node = puzzle.nodes[index];
  if (index === 0 || index === puzzle.nodes.length - 1 || round.foundIndices.includes(index) || round.status === "lost") {
    return node.label;
  }
  return "????";
}

function latestMapIndex(puzzle: Puzzle, round: RoundState): number {
  const lastAttempt = round.attemptedWords.at(-1);
  if (lastAttempt?.startsWith("route:")) {
    const index = puzzle.nodes.findIndex((node) => `route:${node.id}` === lastAttempt);
    if (index >= 0) return index;
  }
  return getCurrentIndex(puzzle, round) ?? puzzle.nodes.length - 1;
}

function renderRoute(puzzle: Puzzle, round: RoundState): string {
  const currentIndex = getCurrentIndex(puzzle, round);
  const latestIndex = latestMapIndex(puzzle, round);
  const list = puzzle.nodes.map((_, index) => {
    const isKnown = index === 0 || index === puzzle.nodes.length - 1
      || round.foundIndices.includes(index) || round.status === "lost";
    const isCurrent = index === currentIndex && round.status === "playing";
    const isLatest = index === latestIndex;
    const label = getVisibleNodeLabel(puzzle, round, index);
    const stateLabel = index === 0 ? "INÍCIO" : index === puzzle.nodes.length - 1 ? "CHEGADA"
      : isKnown ? "ENCONTRADA" : isCurrent ? "PRÓXIMO ELO" : `POSIÇÃO ${String(index + 1).padStart(2, "0")}`;
    const nodeMarkup = `<li class="sequence-item ${index === 0 || index === puzzle.nodes.length - 1 ? "is-endpoint" : ""} ${isKnown ? "is-known" : "is-hidden"} ${isCurrent ? "is-current" : ""} ${isLatest ? "is-latest" : ""}" ${isLatest ? 'data-latest="true"' : ""} aria-label="Posição ${index + 1} de 10, ${isKnown ? escapeHtml(label) : stateLabel.toLocaleLowerCase("pt-BR")}">
      <span class="sequence-marker" aria-hidden="true">${String(index + 1).padStart(2, "0")}</span>
      <div class="sequence-node"><span class="sequence-state">${stateLabel}</span><strong>${escapeHtml(label)}</strong></div>
      ${index < puzzle.nodes.length - 1 ? (() => {
        const isPastLink = currentIndex !== null && index < currentIndex - 1;
        const isCurrentLink = currentIndex !== null && index === currentIndex - 1;
        const relationVisible = round.status !== "playing" || isPastLink
          || (isCurrentLink && isCurrentRelationRevealed(round));
        const isActiveLink = isCurrentLink && round.status === "playing";
        return `<div class="sequence-link ${relationVisible ? "is-unlocked" : ""} ${isActiveLink ? "is-active" : ""}" aria-hidden="true"><i></i><span>${relationVisible ? escapeHtml(puzzle.edges[index].label) : ""}</span></div>`;
      })() : ""}
    </li>`;
    return nodeMarkup;
  }).join("");
  return `<div class="map-scroll" tabindex="0" aria-label="Mapa linear de dez posições; use as setas para navegar"><ol class="sequence-map">${list}</ol></div>`;
}

function renderChallengePicker(): string {
  return `<label class="sr-only" for="challenge-select">Escolher protótipo</label>
    <select class="challenge-select" id="challenge-select" aria-label="Escolher protótipo">
      ${puzzles.map((puzzle, index) => `<option value="${escapeHtml(puzzle.id)}" ${activePuzzle.id === puzzle.id ? "selected" : ""}>Protótipo ${index + 1} · ${escapeHtml(puzzle.title)}</option>`).join("")}
    </select>`;
}

function renderClue(puzzle: Puzzle, round: RoundState): string {
  if (round.status === "solved") {
    return `<section class="clue-panel clue-complete" aria-live="polite"><span class="clue-icon" aria-hidden="true">✓</span><div><span class="clue-label">TRILHA COMPLETA</span><p>Você encontrou todos os elos. Boa leitura do caminho.</p></div></section>`;
  }
  if (round.status === "lost") {
    return `<section class="clue-panel clue-complete" aria-live="polite"><span class="clue-icon" aria-hidden="true">↗</span><div><span class="clue-label">SEQUÊNCIA REVELADA</span><p>O limite de ${MAX_GUESSES} palpites terminou. A rota inteira está no mapa.</p></div></section>`;
  }
  const currentIndex = getCurrentIndex(puzzle, round)!;
  const previous = puzzle.nodes[currentIndex - 1];
  const relation = puzzle.edges[currentIndex - 1].label;
  const relationRevealed = isCurrentRelationRevealed(round);
  const dots = Array.from({ length: RELATION_REVEAL_MISSES }, (_, index) =>
    `<span class="clue-pip ${index < round.wrongGuessesForCurrent ? "is-used" : ""}" aria-hidden="true"></span>`).join("");
  const pipLabel = relationRevealed
    ? "Relação revelada"
    : `${RELATION_REVEAL_MISSES - round.wrongGuessesForCurrent} ${RELATION_REVEAL_MISSES - round.wrongGuessesForCurrent === 1 ? "erro" : "erros"} até a pista`;
  return `<section class="clue-panel" aria-live="polite" aria-label="Pista da posição ${currentIndex + 1}">
    <div class="clue-heading"><span class="clue-label">PRÓXIMO ELO · POSIÇÃO ${String(currentIndex + 1).padStart(2, "0")}</span><strong>${escapeHtml(previous.label)}</strong></div>
    <div class="clue-equation"><span class="clue-relation">${relationRevealed ? escapeHtml(relation) : "Relação oculta"}</span><span aria-hidden="true">↓</span><strong>????</strong></div>
    <div class="clue-progress"><p class="clue-help">${relationRevealed ? "A relação fica visível até você encontrar este elo." : "Erros válidos acendem as bolinhas; a relação aparece no terceiro."}</p><div class="clue-pips" role="img" aria-label="${round.wrongGuessesForCurrent} de ${RELATION_REVEAL_MISSES} erros válidos; ${pipLabel.toLocaleLowerCase("pt-BR")}">${dots}<span>${pipLabel}</span></div></div>
  </section>`;
}

function shareText(): string {
  const routeNumber = puzzles.findIndex((puzzle) => puzzle.id === activePuzzle.id) + 1;
  const result = state.status === "solved"
    ? `Completei em ${state.attemptCount}/${MAX_GUESSES} palpites.`
    : `Cheguei a ${state.foundIndices.length}/8 elos em ${state.attemptCount}/${MAX_GUESSES} palpites.`;
  const url = new URL(window.location.href);
  url.searchParams.delete("treino");
  url.searchParams.delete("date");
  url.searchParams.set("rota", activePuzzle.id);
  return `ECO · Protótipo ${routeNumber}\n${result}\n🟩 ${state.foundIndices.length} elos encontrados\n\nJogue: ${url.href}`;
}

function render(): void {
  const isPlaying = state.status === "playing";
  const start = activePuzzle.nodes[0];
  const end = activePuzzle.nodes[activePuzzle.nodes.length - 1];
  const inputDisabled = vocabularyStatus !== "ready" || !isPlaying;

  app!.innerHTML = `<main class="page-shell">
    <header class="topbar"><a class="wordmark" href="/" aria-label="ECO início">ECO<span>.</span></a><div class="topbar-meta">${renderChallengePicker()}</div></header>
    <div class="game-layout">
      <section class="game-panel" aria-label="Partida">
        <section class="intro-row"><div><span class="eyebrow">TRÊS PROTÓTIPOS · SEQUÊNCIAS FIXAS</span><h1>Encontre cada elo.<br><em>Complete o caminho.</em></h1></div>
          <details class="how-to"><summary>Como jogar <span aria-hidden="true">＋</span></summary><div class="how-to-copy"><p>O mapa tem dez posições: início e chegada ficam visíveis. Descubra os oito elos entre elas sem ver a relação logo de cara.</p><p>Um palpite válido fora da rota acende uma bolinha; a relação aparece após três erros. Acertar uma palavra futura marca sua posição, mas você continua pela primeira lacuna. Há ${MAX_GUESSES} palpites por percurso.</p></div></details>
        </section>
        <section class="target-strip" aria-label="Início, destino e palpites">
          <div class="endpoint"><span>INÍCIO</span><strong>${escapeHtml(start.label)}</strong></div><span class="endpoint-arrow" aria-hidden="true">→</span>
          <div class="endpoint endpoint-arrival"><span>CHEGADA</span><strong>${escapeHtml(end.label)}</strong></div>
          <div class="attempts-box"><span class="attempt-label">PALPITES</span><strong>${state.attemptCount}<i>/${MAX_GUESSES}</i></strong><small>${activePuzzle.nodes.length - 2 - state.foundIndices.length} elos restantes</small></div>
        </section>
        ${notice ? `<div class="notice" role="status">${escapeHtml(notice)}</div>` : ""}
        ${vocabularyStatus === "loading" ? `<p class="vocabulary-status" role="status">Carregando o vocabulário português offline…</p>` : ""}
        ${vocabularyStatus === "failed" ? `<p class="vocabulary-status vocabulary-error" role="alert">Não consegui carregar o vocabulário offline. Recarregue a página para tentar novamente.</p>` : ""}
        ${renderClue(activePuzzle, state)}
        ${isPlaying ? `<form class="guess-form" id="guess-form" autocomplete="off"><label class="input-label" for="guess-input">DIGITE O PRÓXIMO ELO</label><div class="input-row"><div class="input-wrap"><span aria-hidden="true">↳</span><input id="guess-input" name="guess" type="text" value="${escapeHtml(draftGuess)}" placeholder="Uma palavra…" aria-describedby="input-help" autocomplete="off" autocapitalize="none" spellcheck="false" ${inputDisabled ? "disabled" : ""} required /><button class="clear-input" type="button" aria-label="Limpar palavra" ${inputDisabled ? "disabled" : ""}>×</button></div><button class="submit-button" type="submit" ${inputDisabled ? "disabled" : ""}>TENTAR <span aria-hidden="true">↗</span></button></div><div class="input-foot"><span id="input-help">Uma palavra do português por palpite</span><span>RESTAM ${Math.max(0, MAX_GUESSES - state.attemptCount)}</span></div></form>` : ""}
        ${!isPlaying ? `<section class="finish-panel ${state.status === "solved" ? "finish-win" : "finish-loss"}" aria-live="polite"><span class="finish-mark" aria-hidden="true">${state.status === "solved" ? "✳" : "↗"}</span><div><span class="clue-label">${state.status === "solved" ? "CAMINHO COMPLETO" : "LIMITE DE PALPITES"}</span><h2>${state.status === "solved" ? "Você encontrou a sequência." : "A sequência está revelada."}</h2><p>${state.attemptCount} de ${MAX_GUESSES} palpites usados.</p></div></section>
          <section class="result-actions"><button class="share-button" id="share-button" type="button">↗ Compartilhar resultado</button><button class="restart-button" id="restart-button" type="button">Reiniciar percurso</button></section>` : ""}
      </section>
      <section class="map-section" aria-labelledby="map-title"><div class="map-heading"><div><div class="section-label"><span>01</span><span>TRILHA</span></div><h2 id="map-title">Dez posições, um caminho.</h2></div><span class="map-count">${state.foundIndices.length}/8 elos</span></div>
        <div class="map-card">${renderRoute(activePuzzle, state)}<div class="map-legend"><span><i class="legend-found"></i>encontrada</span><span><i class="legend-hidden"></i>a descobrir</span></div></div>
        <p class="data-credit">Vocabulário offline: <a href="${import.meta.env.BASE_URL}licenses/third-party-notices.txt" target="_blank" rel="noreferrer">VERO / Hunspell e licenças</a></p>
      </section>
    </div>
    <footer class="page-footer"><span>Seu progresso fica salvo neste navegador.</span><span>Partidas independentes · sem virada diária</span></footer>
  </main>`;

  bindChallengePicker();
  bindGuessForm();
  bindShareButton();
  bindRestartButton();
  bindMapKeyboard();
  const behavior = nextMapScrollBehavior;
  nextMapScrollBehavior = "auto";
  window.requestAnimationFrame(() => scrollMapToLatest(behavior));
}

function switchChallenge(id: string): void {
  const next = getPuzzleById(id);
  if (!next || next.id === activePuzzle.id) return;
  activePuzzle = next;
  state = readState(activePuzzle);
  draftGuess = "";
  notice = "";
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
    const result = submitGuess(activePuzzle, state, input.value, vocabulary.isValidGuess);
    if (result.kind === "accepted") {
      state = result.state;
      persistState();
      notice = result.outcome === "wrong"
        ? isCurrentRelationRevealed(state)
          ? "Terceiro erro: a relação foi revelada."
          : `Ainda não é essa palavra. ${state.wrongGuessesForCurrent} de ${RELATION_REVEAL_MISSES} erros antes da pista.`
        : result.outcome === "correct"
          ? result.foundIndex !== undefined && getCurrentIndex(activePuzzle, state) !== null
            && result.foundIndex > getCurrentIndex(activePuzzle, state)!
            ? "Essa posição futura foi encontrada. Continue pela primeira lacuna."
            : "Elo encontrado. Siga a próxima relação."
          : result.outcome === "solved"
            ? "Você completou as oito posições intermediárias!"
            : "O limite de 24 palpites terminou. Veja a sequência completa no mapa.";
      draftGuess = "";
      nextMapScrollBehavior = "smooth";
    } else if (result.kind === "empty") notice = "Digite uma palavra para tentar.";
    else if (result.kind === "invalid") notice = "Essa palavra não foi reconhecida no dicionário pt-BR. Confira a grafia e tente uma palavra só.";
    else if (result.kind === "duplicate") notice = "Essa palavra já foi usada neste percurso. Tente outra.";
    else if (result.kind === "endpoint") notice = "O início e a chegada já estão visíveis; tente descobrir um dos elos entre eles.";
    else if (result.kind === "finished") {
      render();
      return;
    }
    render();
    document.querySelector<HTMLInputElement>("#guess-input")?.focus();
  });
  document.querySelector<HTMLButtonElement>(".clear-input")?.addEventListener("click", () => {
    draftGuess = "";
    const currentInput = document.querySelector<HTMLInputElement>("#guess-input");
    if (currentInput) { currentInput.value = ""; currentInput.focus(); }
  });
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
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

function bindShareButton(): void {
  const button = document.querySelector<HTMLButtonElement>("#share-button");
  button?.addEventListener("click", async () => {
    const text = shareText();
    const data = { title: "ECO — seu caminho", text };
    try {
      if (navigator.share && (!navigator.canShare || navigator.canShare(data))) {
        try { await navigator.share(data); return; }
        catch (error) { if (error instanceof DOMException && error.name === "AbortError") return; }
      }
      await copyText(text);
      button.textContent = "✓ Resultado copiado";
      window.setTimeout(() => { if (document.body.contains(button)) button.textContent = "↗ Compartilhar resultado"; }, 2200);
    } catch {
      notice = "Não consegui compartilhar agora. Tente novamente.";
      render();
    }
  });
}

function bindRestartButton(): void {
  document.querySelector<HTMLButtonElement>("#restart-button")?.addEventListener("click", () => {
    state = createRound(activePuzzle.id);
    draftGuess = "";
    notice = "Percurso reiniciado.";
    persistState();
    render();
    document.querySelector<HTMLInputElement>("#guess-input")?.focus();
  });
}

function bindMapKeyboard(): void {
  const map = document.querySelector<HTMLDivElement>(".map-scroll");
  map?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") map.scrollBy({ top: 90, behavior: "smooth" });
    if (event.key === "ArrowUp") map.scrollBy({ top: -90, behavior: "smooth" });
  });
}

function scrollMapToLatest(behavior: ScrollBehavior): void {
  const map = document.querySelector<HTMLDivElement>(".map-scroll");
  const latest = map?.querySelector<HTMLElement>("[data-latest='true']");
  if (!map || !latest) return;
  const mapRect = map.getBoundingClientRect();
  const latestRect = latest.getBoundingClientRect();
  const centeredTop = map.scrollTop + latestRect.top - mapRect.top
    - Math.max(12, (map.clientHeight - latest.offsetHeight) / 2);
  map.scrollTo({ top: Math.max(0, centeredTop), behavior });
}

function validatePuzzleData(): void {
  if (puzzles.length !== 3) throw new Error("O ECO deve oferecer exatamente três protótipos.");
  for (const puzzle of puzzles) {
    if (!routeIsValid(puzzle)) throw new Error(`Rota inválida: ${puzzle.id}`);
    const intermediates = puzzle.nodes.slice(1, -1);
    if (intermediates.length !== 8) throw new Error(`A rota ${puzzle.id} precisa ter oito lacunas.`);
  }
}

validatePuzzleData();
persistSelection();
state = readState(activePuzzle);
render();
void loadPortugueseVocabulary().then((loaded) => {
  vocabulary = loaded;
  vocabularyStatus = "ready";
  render();
}).catch(() => {
  vocabularyStatus = "failed";
  render();
});
