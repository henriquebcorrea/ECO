export const PILOT_START_DATE = typeof __ECO_PILOT_START_DATE__ === "undefined"
  ? "2026-09-25"
  : __ECO_PILOT_START_DATE__;
export const GAME_TIME_ZONE = "America/Sao_Paulo";

export interface WordNode {
  id: string;
  label: string;
  aliases: string[];
  category: string;
}

export interface WordEdge {
  from: string;
  to: string;
  label: string;
}

export interface SemanticEdge {
  from: string;
  to: string;
  label: string;
  weight?: number;
}

export interface SemanticIndex {
  adjacency: Map<string, Map<string, string>>;
  targetPaths: Map<string, { next: string | null; relation: string | null; hops: number }>;
  targetTerms: Set<string>;
  displayTerms: Map<string, string>;
}

export interface ConnectionOption {
  id: string;
  label: string;
}

export interface Puzzle {
  date: string;
  targetId: string;
  sense: string;
  nodes: WordNode[];
  edges: WordEdge[];
  connectionQuestion: string;
  connectionOptions: ConnectionOption[];
  correctConnectionId: string;
  secretRoute: string[];
}

export type RoundMode = "daily" | "practice";
export type RoundStatus = "playing" | "solved" | "lost";

export const MAX_GUESSES = 12;

export interface RoundGuess {
  id: string;
  label: string;
  relationFromPrevious?: string;
}

export interface RoundState {
  version: 4;
  roundKey: string;
  mode: RoundMode;
  /** Confirmed words on the semantic route. Wrong answers do not enter the map. */
  guesses: RoundGuess[];
  attemptedWords: string[];
  attemptCount: number;
  unlinked: RoundGuess[];
  activeStep: ActiveStep | null;
  status: RoundStatus;
  connectionChoice: string | null;
  routeUnlocked: boolean;
}

export interface ActiveStep {
  fromId: string;
  fromLabel: string;
  answerId: string;
  /** Stored for restoring progress, but never rendered before the step is solved. */
  answerLabel: string;
  relation: string;
  isSecret: boolean;
  revealedLetters: number;
}

export interface GuessFeedback {
  node: WordNode;
  nextStep: { word: string | null; answerTerm: string; relation: string; isSecret: boolean } | null;
}

export type GuessResult =
  | { kind: "accepted"; state: RoundState; guess: RoundGuess; outcome: "started" | "wrong" | "advanced" | "unlinked" | "solved" | "lost" }
  | { kind: "empty"; state: RoundState }
  | { kind: "invalid"; state: RoundState }
  | { kind: "duplicate"; state: RoundState; guess: RoundGuess }
  | { kind: "finished"; state: RoundState };

export type WordValidator = (value: string, puzzle: Puzzle) => boolean;
export type GraphTermResolver = (value: string) => string | null;

export function normalizeWord(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ");
}

export function isSingleWord(value: string): boolean {
  return /^(?:\p{L}+)(?:-\p{L}+)*$/u.test(value.trim().normalize("NFC"));
}

export function getSaoPauloDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GAME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function dayNumber(isoDate: string): number {
  const [year, month, day] = isoDate.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function saoPauloOffsetAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: GAME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const values = Object.fromEntries(parts.map((part) => [part.type, Number(part.value)]));
  return Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute, values.second)
    - instant.getTime();
}

export function getNextSaoPauloMidnight(now = new Date()): Date {
  const nextDateWallTime = (dayNumber(getSaoPauloDate(now)) + 1) * 86_400_000;
  let nextInstant = nextDateWallTime;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    nextInstant = nextDateWallTime - saoPauloOffsetAt(new Date(nextInstant));
  }
  return new Date(nextInstant);
}

export function getPilotDay(date: string, startDate = PILOT_START_DATE): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== date) return null;
  const offset = dayNumber(date) - dayNumber(startDate);
  return offset >= 0 && offset < 7 ? offset : null;
}

export function findNode(puzzle: Puzzle, rawGuess: string): WordNode | undefined {
  const normalized = normalizeWord(rawGuess);
  if (!normalized) return undefined;
  return puzzle.nodes.find((node) =>
    [node.label, ...node.aliases].some((term) => normalizeWord(term) === normalized),
  );
}

export function getNode(puzzle: Puzzle, id: string): WordNode | undefined {
  return puzzle.nodes.find((node) => node.id === id);
}

const inverseRelations: Record<string, string> = {
  "inclui": "faz parte de",
  "faz parte de": "contém",
  "contém": "faz parte de",
  "é um tipo de": "inclui",
  "é feito de": "compõe",
  "compõe": "é feito de",
  "causa": "é causado por",
  "é causado por": "causa",
  "fica em": "contém",
  "abriga": "está em",
  "serve para": "é usado para",
  "é usado para": "serve para",
  "é semelhante a": "é semelhante a",
  "é sinônimo de": "é sinônimo de",
  "é o oposto de": "é o oposto de",
  "combina com": "combina com",
  "é servido na": "recebe",
  "é menor que uma": "é maior que",
  "é uma bebida de": "é ingrediente de",
  "pode incluir": "pode fazer parte de",
};

const unusableRelationLabels = new Set(["tem relacao com", "relaciona com"]);

function resolverSemanticoBasico(value: string): string | null {
  const raw = value.trim().normalize("NFC");
  return isSingleWord(raw) ? raw.toLocaleLowerCase("pt-BR") : null;
}

function addDirectedEdge(
  adjacency: Map<string, Map<string, string>>,
  displayTerms: Map<string, string>,
  from: string,
  to: string,
  label: string,
): void {
  if (!from || !to || from === to || unusableRelationLabels.has(normalizeWord(label))) return;
  const fromEdges = adjacency.get(normalizeWord(from)) ?? new Map<string, string>();
  const toKey = normalizeWord(to);
  if (!fromEdges.has(toKey)) fromEdges.set(toKey, label.trim());
  adjacency.set(normalizeWord(from), fromEdges);
  if (!displayTerms.has(normalizeWord(from))) displayTerms.set(normalizeWord(from), from.trim());
  if (!displayTerms.has(toKey)) displayTerms.set(toKey, to.trim());
}

function addCuratedEdge(
  adjacency: Map<string, Map<string, string>>,
  displayTerms: Map<string, string>,
  from: string,
  to: string,
  label: string,
): void {
  addDirectedEdge(adjacency, displayTerms, from, to, label);
  const reverse = inverseRelations[label];
  if (reverse) addDirectedEdge(adjacency, displayTerms, to, from, reverse);
}

export function createSemanticIndex(
  puzzle: Puzzle,
  semanticEdges: SemanticEdge[] = [],
  resolveTerm: GraphTermResolver = resolverSemanticoBasico,
): SemanticIndex {
  const adjacency = new Map<string, Map<string, string>>();
  const displayTerms = new Map<string, string>();
  const canonicalTerms = new Map<string, string>();
  const getGraphTerm = (value: string): string | null => {
    const known = canonicalTerms.get(normalizeWord(value));
    if (known) return known;
    const resolved = resolveTerm(value);
    return resolved && isSingleWord(resolved) ? resolved : null;
  };

  for (const node of puzzle.nodes) {
    if (isSingleWord(node.label)) canonicalTerms.set(normalizeWord(node.label), node.label);
    for (const alias of node.aliases) {
      if (isSingleWord(alias)) canonicalTerms.set(normalizeWord(alias), alias);
    }
  }

  const byId = new Map(puzzle.nodes.map((node) => [node.id, node]));
  for (const edge of puzzle.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    const fromTerm = from ? getGraphTerm(from.label) : null;
    const toTerm = to ? getGraphTerm(to.label) : null;
    if (fromTerm && toTerm) addCuratedEdge(adjacency, displayTerms, fromTerm, toTerm, edge.label);
  }

  for (const node of puzzle.nodes) {
    const canonical = getGraphTerm(node.label);
    if (!canonical) continue;
    for (const alias of node.aliases) {
      const aliasTerm = getGraphTerm(alias);
      if (aliasTerm && normalizeWord(aliasTerm) !== normalizeWord(canonical)) {
        addCuratedEdge(adjacency, displayTerms, aliasTerm, canonical, "é sinônimo de");
      }
    }
  }

  const curatedSources = new Set(adjacency.keys());
  for (const edge of semanticEdges) {
    const from = getGraphTerm(edge.from);
    const to = getGraphTerm(edge.to);
    // Keep reviewed puzzle routes stable. The broad ConceptNet index fills in
    // routes for other words without replacing a challenge's authored clue.
    if (from && to && !curatedSources.has(normalizeWord(from))) {
      addCuratedEdge(adjacency, displayTerms, from, to, edge.label);
    }
  }

  const target = getNode(puzzle, puzzle.targetId)!;
  const targetTerms = new Set([target.label, ...target.aliases]
    .filter(isSingleWord)
    .map(normalizeWord));
  const incoming = new Map<string, Array<{ from: string; relation: string }>>();
  for (const [from, edges] of adjacency) {
    for (const [to, relation] of edges) {
      const predecessors = incoming.get(to) ?? [];
      predecessors.push({ from, relation });
      incoming.set(to, predecessors);
    }
  }

  const targetPaths = new Map<string, { next: string | null; relation: string | null; hops: number }>();
  const queue: string[] = [];
  for (const term of targetTerms) {
    targetPaths.set(term, { next: null, relation: null, hops: 0 });
    queue.push(term);
  }
  const degree = new Map([...adjacency].map(([term, edges]) => [term, edges.size]));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const currentHops = targetPaths.get(current)!.hops;
    if (currentHops > 0 && (degree.get(current) ?? 0) > 80) continue;
    const predecessors = incoming.get(current) ?? [];
    for (const edge of predecessors) {
      if (targetPaths.has(edge.from)) continue;
      const hops = currentHops + 1;
      if (hops > 1 && (degree.get(edge.from) ?? 0) > 80) continue;
      targetPaths.set(edge.from, { next: current, relation: edge.relation, hops });
      queue.push(edge.from);
    }
  }

  return { adjacency, targetPaths, targetTerms, displayTerms };
}

function pathFromTargetMap(index: SemanticIndex, start: string): { terms: string[]; relations: string[] } | null {
  const first = index.targetPaths.get(start);
  if (!first) return null;
  const terms = [start];
  const relations: string[] = [];
  let current = start;
  while (index.targetPaths.get(current)?.next) {
    const step = index.targetPaths.get(current)!;
    if (step.relation) relations.push(step.relation);
    current = step.next!;
    terms.push(current);
  }
  return { terms, relations };
}

function pathToTarget(index: SemanticIndex, start: string): { terms: string[]; relations: string[] } | null {
  const directPath = pathFromTargetMap(index, start);
  if (directPath) return directPath;

  let bestPath: { terms: string[]; relations: string[] } | null = null;
  for (const [neighbor, relation] of index.adjacency.get(start) ?? []) {
    if ((index.adjacency.get(neighbor)?.size ?? 0) > 80) continue;
    const neighborPath = pathFromTargetMap(index, neighbor);
    if (!neighborPath) continue;
    const candidate = {
      terms: [start, ...neighborPath.terms],
      relations: [relation, ...neighborPath.relations],
    };
    if (!bestPath || candidate.relations.length < bestPath.relations.length) bestPath = candidate;
  }
  return bestPath;
}

export function getGuessNode(puzzle: Puzzle, guess: RoundGuess): WordNode {
  const known = getNode(puzzle, guess.id);
  return known ? { ...known, label: guess.label } : {
    id: guess.id,
    label: guess.label,
    aliases: [],
    category: "",
  };
}

export function getFeedback(
  puzzle: Puzzle,
  node: WordNode,
  index = createSemanticIndex(puzzle),
): GuessFeedback {
  const path = pathToTarget(index, normalizeWord(node.label));
  if (!path || path.terms.length < 2 || !path.relations[0]) return { node, nextStep: null };
  const nextTerm = path.terms[1];
  const isSecret = index.targetTerms.has(nextTerm);
  return {
    node,
    nextStep: {
      word: isSecret ? null : index.displayTerms.get(nextTerm) ?? nextTerm,
      answerTerm: nextTerm,
      relation: path.relations[0],
      isSecret,
    },
  };
}

export function createRound(roundKey: string, mode: RoundMode): RoundState {
  return {
    version: 4,
    roundKey,
    mode,
    guesses: [],
    attemptedWords: [],
    attemptCount: 0,
    unlinked: [],
    activeStep: null,
    status: "playing",
    connectionChoice: null,
    routeUnlocked: false,
  };
}

export function submitGuess(
  puzzle: Puzzle,
  state: RoundState,
  rawGuess: string,
  index: SemanticIndex,
  isValidWord: WordValidator,
): GuessResult {
  if (state.status !== "playing") return { kind: "finished", state };
  const raw = rawGuess.trim().normalize("NFC");
  if (!raw) return { kind: "empty", state };
  if (!isSingleWord(raw)) return { kind: "invalid", state };

  const normalized = normalizeWord(raw);
  const knownNode = findNode(puzzle, normalized);
  const id = knownNode?.id ?? "word:" + normalized;
  const guess: RoundGuess = {
    id,
    label: knownNode && isSingleWord(knownNode.label)
      ? knownNode.label
      : raw.toLocaleLowerCase("pt-BR"),
  };

  const isExpectedAnswer = (step: ActiveStep): boolean => {
    const candidateTerms = knownNode ? [knownNode.label, ...knownNode.aliases] : [raw];
    if (candidateTerms.some((term) => normalizeWord(term) === normalizeWord(step.answerLabel))) return true;
    return step.isSecret && knownNode?.id === puzzle.targetId;
  };
  const wordWasTried = state.attemptedWords.includes(normalized);

  // Check the current hidden answer first: a term tried in an earlier context
  // can still be the right next link in the route now.
  if (state.activeStep && isExpectedAnswer(state.activeStep)) {
    const answerNode = knownNode ?? (state.activeStep.isSecret ? getNode(puzzle, puzzle.targetId) : undefined);
    const acceptedGuess: RoundGuess = answerNode
      ? { id: answerNode.id, label: answerNode.label, relationFromPrevious: state.activeStep.relation }
      : { id: "word:" + normalizeWord(state.activeStep.answerLabel), label: state.activeStep.answerLabel, relationFromPrevious: state.activeStep.relation };
    const guesses = state.guesses.some((item) => item.id === acceptedGuess.id)
      ? state.guesses
      : [...state.guesses, acceptedGuess];
    const attemptedWords = wordWasTried ? state.attemptedWords : [...state.attemptedWords, normalized];
    const attemptCount = state.attemptCount + 1;
    const solved = state.activeStep.isSecret || answerNode?.id === puzzle.targetId;
    const nextFeedback = solved ? null : getFeedback(puzzle, getGuessNode(puzzle, acceptedGuess), index);
    const activeStep = nextFeedback?.nextStep
      ? makeActiveStep(puzzle, acceptedGuess, nextFeedback)
      : null;
    const nextState: RoundState = {
      ...state,
      guesses,
      attemptedWords,
      attemptCount,
      activeStep,
      status: solved ? "solved" : "playing",
    };
    return { kind: "accepted", state: nextState, guess: acceptedGuess, outcome: solved ? "solved" : "advanced" };
  }

  if (!isValidWord(raw, puzzle) && !knownNode) return { kind: "invalid", state };
  if (wordWasTried) {
    const previous = [...state.guesses, ...state.unlinked].find((item) => normalizeWord(item.label) === normalized)
      ?? guess;
    return { kind: "duplicate", state, guess: previous };
  }

  const attemptedWords = [...state.attemptedWords, normalized];
  const attemptCount = state.attemptCount + 1;
  if (state.activeStep) {
    const exhausted = attemptCount >= MAX_GUESSES;
    const nextState: RoundState = {
      ...state,
      attemptedWords,
      attemptCount,
      activeStep: exhausted ? state.activeStep : {
        ...state.activeStep,
        revealedLetters: Math.min(
          Array.from(state.activeStep.answerLabel).length,
          state.activeStep.revealedLetters + 1,
        ),
      },
      status: exhausted ? "lost" : "playing",
    };
    return { kind: "accepted", state: nextState, guess, outcome: exhausted ? "lost" : "wrong" };
  }

  if (knownNode?.id === puzzle.targetId) {
    return {
      kind: "accepted",
      state: { ...state, guesses: [...state.guesses, guess], attemptedWords, attemptCount, status: "solved" },
      guess,
      outcome: "solved",
    };
  }

  const feedback = getFeedback(puzzle, getGuessNode(puzzle, guess), index);
  if (feedback.nextStep) {
    const nextState: RoundState = {
      ...state,
      guesses: [...state.guesses, guess],
      attemptedWords,
      attemptCount,
      activeStep: makeActiveStep(puzzle, guess, feedback),
    };
    return { kind: "accepted", state: nextState, guess, outcome: "started" };
  }

  const exhausted = attemptCount >= MAX_GUESSES;
  const nextState: RoundState = {
    ...state,
    attemptedWords,
    attemptCount,
    unlinked: [...state.unlinked, guess],
    status: exhausted ? "lost" : "playing",
  };
  return { kind: "accepted", state: nextState, guess, outcome: exhausted ? "lost" : "unlinked" };
}

function makeActiveStep(puzzle: Puzzle, from: RoundGuess, feedback: GuessFeedback): ActiveStep | null {
  const step = feedback.nextStep;
  if (!step) return null;
  const target = getNode(puzzle, puzzle.targetId)!;
  const answer = step.isSecret
    ? target
    : findNode(puzzle, step.answerTerm) ?? { id: "word:" + normalizeWord(step.answerTerm), label: step.word ?? step.answerTerm };
  return {
    fromId: from.id,
    fromLabel: from.label,
    answerId: answer.id,
    answerLabel: answer.label,
    relation: step.relation,
    isSecret: step.isSecret,
    revealedLetters: 0,
  };
}

export function chooseConnection(
  puzzle: Puzzle,
  state: RoundState,
  optionId: string,
): RoundState {
  if (state.status !== "solved" || state.connectionChoice !== null) return state;
  const validOption = puzzle.connectionOptions.some((option) => option.id === optionId);
  if (!validOption) return state;
  return {
    ...state,
    connectionChoice: optionId,
    routeUnlocked: optionId === puzzle.correctConnectionId,
  };
}

function isStoredGuess(value: unknown): value is RoundGuess {
  if (!value || typeof value !== "object") return false;
  const guess = value as Partial<RoundGuess>;
  return typeof guess.id === "string" && typeof guess.label === "string" && isSingleWord(guess.label)
    && (guess.relationFromPrevious === undefined || typeof guess.relationFromPrevious === "string");
}

export function isRoundState(
  value: unknown,
  roundKey: string,
  mode: RoundMode,
  puzzle: Puzzle,
): value is RoundState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RoundState>;
  if (candidate.version !== 4 || candidate.roundKey !== roundKey || candidate.mode !== mode) return false;
  if (!Array.isArray(candidate.guesses) || !candidate.guesses.every(isStoredGuess)) return false;
  const ids = candidate.guesses.map((guess) => guess.id);
  if (new Set(ids).size !== ids.length) return false;
  if (!Array.isArray(candidate.unlinked) || !candidate.unlinked.every(isStoredGuess)) return false;
  if (!Array.isArray(candidate.attemptedWords) || !candidate.attemptedWords.every((word) => typeof word === "string")) return false;
  if (!Number.isInteger(candidate.attemptCount) || candidate.attemptCount! < 0 || candidate.attemptCount! > MAX_GUESSES) return false;
  if (candidate.attemptedWords.length > candidate.attemptCount!) return false;
  if (candidate.activeStep !== null && (!candidate.activeStep || typeof candidate.activeStep !== "object")) return false;
  if (candidate.activeStep && (
    typeof candidate.activeStep.fromId !== "string"
    || typeof candidate.activeStep.fromLabel !== "string"
    || typeof candidate.activeStep.answerId !== "string"
    || typeof candidate.activeStep.answerLabel !== "string"
    || typeof candidate.activeStep.relation !== "string"
    || typeof candidate.activeStep.isSecret !== "boolean"
    || !Number.isInteger(candidate.activeStep.revealedLetters)
    || candidate.activeStep.revealedLetters! < 0
    || candidate.activeStep.revealedLetters! > Array.from(candidate.activeStep.answerLabel).length
  )) return false;
  const solvedByGuess = ids.includes(puzzle.targetId);
  const lostByAttempts = candidate.attemptCount === MAX_GUESSES && !solvedByGuess;
  return (candidate.status === "playing" || candidate.status === "solved" || candidate.status === "lost")
    && (candidate.status === "solved") === solvedByGuess
    && (candidate.status === "lost") === lostByAttempts
    && (candidate.status !== "playing" || candidate.attemptCount! < MAX_GUESSES)
    && (!candidate.activeStep || candidate.activeStep.fromId === candidate.guesses.at(-1)?.id)
    && (candidate.status !== "solved" || candidate.activeStep === null)
    && (candidate.connectionChoice === null || typeof candidate.connectionChoice === "string")
    && typeof candidate.routeUnlocked === "boolean";
}

export function restoreRound(
  value: unknown,
  roundKey: string,
  mode: RoundMode,
  puzzle: Puzzle,
  isValidWord: WordValidator,
): RoundState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as {
    version?: unknown;
    date?: unknown;
    roundKey?: unknown;
    mode?: unknown;
    guesses?: unknown;
    connectionChoice?: unknown;
    attemptCount?: unknown;
  };
  if (
    candidate.version === 4
    && candidate.roundKey === roundKey
    && candidate.mode === mode
  ) {
    return isRoundState(value, roundKey, mode, puzzle) ? value : null;
  }
  if (candidate.version === 1) {
    if (mode !== "daily" || candidate.date !== puzzle.date || !Array.isArray(candidate.guesses)) return null;
  } else if (
    (candidate.version !== 2 && candidate.version !== 3)
    || candidate.roundKey !== roundKey
    || candidate.mode !== mode
    || !Array.isArray(candidate.guesses)
  ) return null;

  const guesses: RoundGuess[] = [];
  const ids = new Set<string>();
  for (const stored of candidate.guesses) {
    let raw: string;
    if (candidate.version === 1) {
      if (typeof stored !== "string") continue;
      const node = getNode(puzzle, stored);
      if (!node) continue;
      raw = node.label;
    } else {
      if (!stored || typeof stored !== "object" || typeof (stored as RoundGuess).label !== "string") continue;
      raw = (stored as RoundGuess).label;
    }

    const label = raw.trim().normalize("NFC");
    if (!isSingleWord(label)) continue;
    const normalized = normalizeWord(label);
    const knownNode = findNode(puzzle, normalized);
    if (!knownNode && !isValidWord(label, puzzle)) continue;
    const id = knownNode?.id ?? `word:${normalized}`;
    if (ids.has(id)) continue;
    ids.add(id);
    guesses.push({
      id,
      label: knownNode && isSingleWord(knownNode.label)
        ? knownNode.label
        : label.toLocaleLowerCase("pt-BR"),
    });
  }

  const solved = guesses.some((guess) => guess.id === puzzle.targetId);
  const chosenOption = typeof candidate.connectionChoice === "string"
    && puzzle.connectionOptions.some((option) => option.id === candidate.connectionChoice)
    ? candidate.connectionChoice
    : null;
  const state: RoundState = {
    version: 4,
    roundKey,
    mode,
    // The old free-guess format cannot reconstruct which hidden step was being
    // solved. Preserve a completed target; restart incomplete legacy rounds.
    guesses: solved ? [guesses.find((guess) => guess.id === puzzle.targetId)!] : [],
    attemptedWords: solved ? guesses.map((guess) => normalizeWord(guess.label)).slice(0, MAX_GUESSES) : [],
    attemptCount: solved ? Math.min(MAX_GUESSES, Math.max(1, guesses.length)) : 0,
    unlinked: [],
    activeStep: null,
    status: solved ? "solved" : "playing",
    connectionChoice: solved ? chosenOption : null,
    routeUnlocked: solved && chosenOption === puzzle.correctConnectionId,
  };
  return isRoundState(state, roundKey, mode, puzzle) ? state : null;
}
