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
}

export interface SemanticIndex {
  adjacency: Map<string, Map<string, string>>;
  targetPaths: Map<string, { distance: number; next: string | null; relation: string | null }>;
}

export interface SemanticPath {
  terms: string[];
  relations: string[];
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
export type RoundStatus = "playing" | "solved";

export interface RoundGuess {
  id: string;
  label: string;
}

export interface RoundState {
  version: 2;
  roundKey: string;
  mode: RoundMode;
  guesses: RoundGuess[];
  status: RoundStatus;
  connectionChoice: string | null;
  routeUnlocked: boolean;
}

export interface GuessFeedback {
  node: WordNode;
  categoryMatch: boolean | null;
  distance: number | null;
  semanticPath: SemanticPath | null;
  sharedLetters: string[];
}

export type GuessResult =
  | { kind: "accepted"; state: RoundState; guess: RoundGuess; feedback: GuessFeedback }
  | { kind: "empty"; state: RoundState }
  | { kind: "duplicate"; state: RoundState; guess: RoundGuess }
  | { kind: "finished"; state: RoundState };

export function normalizeWord(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, " ");
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

function addUndirectedEdge(
  adjacency: Map<string, Map<string, string>>,
  from: string,
  to: string,
  label: string,
): void {
  if (!from || !to || from === to) return;
  const fromEdges = adjacency.get(from) ?? new Map<string, string>();
  const toEdges = adjacency.get(to) ?? new Map<string, string>();
  if (!fromEdges.has(to)) fromEdges.set(to, label);
  if (!toEdges.has(from)) toEdges.set(from, inverseRelation(label));
  adjacency.set(from, fromEdges);
  adjacency.set(to, toEdges);
}

function inverseRelation(label: string): string {
  const inverses: Record<string, string> = {
    "aparece na": "aparece com",
    "escurece o": "é escurecido por",
    "se abre para o": "dá acesso a",
    "abriga": "está em",
    "inclui": "faz parte de",
    "é famoso pelos": "tem como característica",
    "também é": "inclui",
    "brilha no": "recebe luz de",
    "viaja em": "transporta",
    "atravessa o": "é atravessado por",
    "envia": "recebe de",
    "é uma missão da": "realiza",
    "explora": "é explorado por",
    "aparece em": "inclui",
    "pode ser de": "é um tipo de",
    "imagina o": "é imaginado por",
    "divide o nome com o deus romano da": "tem o nome associado a",
    "é a cor associada a": "é associada à cor",
    "marcam a superfície de": "tem a superfície marcada por",
    "é um tipo de": "inclui",
    "é feito de": "compõe",
    "faz parte de": "contém",
    "tem": "faz parte de",
    "serve para": "é usado para",
    "causa": "é causado por",
    "fica em": "está em",
    "tem como característica": "caracteriza",
    "depende de": "é pré-requisito de",
    "recebe": "age sobre",
    "está em": "fica em",
    "é semelhante a": "é semelhante a",
    "é sinônimo de": "é sinônimo de",
    "é o oposto de": "é o oposto de",
    "tem relação com": "tem relação com",
  };
  return inverses[label] ?? "relaciona com";
}

export function createSemanticIndex(puzzle: Puzzle, semanticEdges: SemanticEdge[] = []): SemanticIndex {
  const adjacency = new Map<string, Map<string, string>>();
  const byId = new Map(puzzle.nodes.map((node) => [node.id, node]));

  for (const edge of puzzle.edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (from && to) addUndirectedEdge(adjacency, normalizeWord(from.label), normalizeWord(to.label), edge.label);
  }

  for (const node of puzzle.nodes) {
    for (const alias of node.aliases) {
      addUndirectedEdge(adjacency, normalizeWord(alias), normalizeWord(node.label), "também chamado de");
    }
  }

  for (const edge of semanticEdges) {
    addUndirectedEdge(adjacency, normalizeWord(edge.from), normalizeWord(edge.to), edge.label);
  }

  const target = getNode(puzzle, puzzle.targetId)!;
  const targetTerms = [...new Set([target.label, ...target.aliases].map(normalizeWord).filter(Boolean))];
  const targetPaths = new Map<string, { distance: number; next: string | null; relation: string | null }>();
  const queue = [...targetTerms];
  for (const term of targetTerms) targetPaths.set(term, { distance: 0, next: null, relation: null });
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor];
    const currentDistance = targetPaths.get(current)!.distance;
    const currentDegree = adjacency.get(current)?.size ?? 0;
    if (currentDistance > 0 && currentDegree > 80) continue;
    for (const [next, relation] of adjacency.get(current) ?? []) {
      if (targetPaths.has(next)) continue;
      const nextDistance = currentDistance + 1;
      const nextDegree = adjacency.get(next)?.size ?? 0;
      if (nextDistance > 1 && nextDegree > 80) continue;
      targetPaths.set(next, { distance: nextDistance, next: current, relation: inverseRelation(relation) });
      queue.push(next);
    }
  }
  return { adjacency, targetPaths };
}

function pathFromTargetMap(index: SemanticIndex, start: string): SemanticPath | null {
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

function pathToTarget(index: SemanticIndex, start: string): SemanticPath | null {
  const directPath = pathFromTargetMap(index, start);
  if (directPath) return directPath;

  // Common guesses can have many ConceptNet edges. Let the guess use one explicit
  // relation, but do not let a high-degree word become a shortcut between topics.
  let bestPath: SemanticPath | null = null;
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
  const target = getNode(puzzle, puzzle.targetId)!;
  const guessLetters = new Set([...normalizeWord(node.label)].filter((letter) => /[a-z0-9]/.test(letter)));
  const targetLetters = new Set([...normalizeWord(target.label)].filter((letter) => /[a-z0-9]/.test(letter)));
  const sharedLetters = [...guessLetters].filter((letter) => targetLetters.has(letter));
  const path = pathToTarget(index, normalizeWord(node.label));
  const categoryMatch = node.category
    ? normalizeWord(node.category) === normalizeWord(target.category)
    : null;
  return {
    node,
    categoryMatch,
    distance: path?.relations.length ?? null,
    semanticPath: path,
    sharedLetters,
  };
}

export function createRound(roundKey: string, mode: RoundMode): RoundState {
  return {
    version: 2,
    roundKey,
    mode,
    guesses: [],
    status: "playing",
    connectionChoice: null,
    routeUnlocked: false,
  };
}

export function submitGuess(
  puzzle: Puzzle,
  state: RoundState,
  rawGuess: string,
  index = createSemanticIndex(puzzle),
): GuessResult {
  if (state.status !== "playing") return { kind: "finished", state };
  const normalized = normalizeWord(rawGuess);
  if (!normalized) return { kind: "empty", state };

  const knownNode = findNode(puzzle, normalized);
  const id = knownNode?.id ?? `word:${normalized}`;
  const existing = state.guesses.find((guess) => guess.id === id);
  if (existing) return { kind: "duplicate", state, guess: existing };

  const guess: RoundGuess = {
    id,
    label: knownNode?.label ?? rawGuess.trim().replace(/\s+/g, " "),
  };
  const guesses = [...state.guesses, guess];
  const status: RoundStatus = knownNode?.id === puzzle.targetId ? "solved" : "playing";
  const nextState = { ...state, guesses, status };
  return {
    kind: "accepted",
    state: nextState,
    guess,
    feedback: getFeedback(puzzle, getGuessNode(puzzle, guess), index),
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

export interface VisibleGuessEdge {
  from: string;
  to: string;
  label: string;
}

export function getVisibleGuessEdges(
  guesses: RoundGuess[],
  index: SemanticIndex,
): VisibleGuessEdge[] {
  const result: VisibleGuessEdge[] = [];
  for (let left = 0; left < guesses.length; left += 1) {
    const from = normalizeWord(guesses[left].label);
    const adjacent = index.adjacency.get(from);
    if (!adjacent) continue;
    for (let right = left + 1; right < guesses.length; right += 1) {
      const to = normalizeWord(guesses[right].label);
      const label = adjacent.get(to);
      if (label) result.push({ from: guesses[left].id, to: guesses[right].id, label });
    }
  }
  return result;
}

export function isRoundState(
  value: unknown,
  roundKey: string,
  mode: RoundMode,
  puzzle: Puzzle,
): value is RoundState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RoundState>;
  if (candidate.version !== 2 || candidate.roundKey !== roundKey || candidate.mode !== mode) return false;
  if (!Array.isArray(candidate.guesses) || !candidate.guesses.every((guess) =>
    Boolean(guess)
    && typeof guess === "object"
    && typeof guess.id === "string"
    && typeof guess.label === "string"
    && Boolean(normalizeWord(guess.label)),
  )) return false;
  const ids = candidate.guesses.map((guess) => guess.id);
  if (new Set(ids).size !== ids.length) return false;
  const solvedByGuess = ids.includes(puzzle.targetId);
  return (candidate.status === "playing" || candidate.status === "solved")
    && (candidate.status === "solved") === solvedByGuess
    && (candidate.connectionChoice === null || typeof candidate.connectionChoice === "string")
    && typeof candidate.routeUnlocked === "boolean";
}

export function migrateLegacyRound(
  value: unknown,
  roundKey: string,
  mode: RoundMode,
  puzzle: Puzzle,
): RoundState | null {
  if (mode !== "daily" || !value || typeof value !== "object") return null;
  const candidate = value as {
    version?: unknown;
    date?: unknown;
    guesses?: unknown;
    status?: unknown;
    connectionChoice?: unknown;
    routeUnlocked?: unknown;
  };
  if (candidate.version !== 1 || candidate.date !== puzzle.date || !Array.isArray(candidate.guesses)) return null;
  const guesses: RoundGuess[] = [];
  for (const id of candidate.guesses) {
    if (typeof id !== "string") return null;
    const node = getNode(puzzle, id);
    if (!node) return null;
    guesses.push({ id: node.id, label: node.label });
  }
  if (new Set(guesses.map((guess) => guess.id)).size !== guesses.length) return null;
  const solved = guesses.some((guess) => guess.id === puzzle.targetId);
  const migrated: RoundState = {
    version: 2,
    roundKey,
    mode,
    guesses,
    status: solved || candidate.status === "solved" ? "solved" : "playing",
    connectionChoice: typeof candidate.connectionChoice === "string" ? candidate.connectionChoice : null,
    routeUnlocked: candidate.routeUnlocked === true,
  };
  return isRoundState(migrated, roundKey, mode, puzzle) ? migrated : null;
}
