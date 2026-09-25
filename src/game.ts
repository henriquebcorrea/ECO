export const MAX_GUESSES = 8;
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

export type RoundStatus = "playing" | "solved" | "failed";

export interface RoundState {
  version: 1;
  date: string;
  guesses: string[];
  status: RoundStatus;
  connectionChoice: string | null;
  routeUnlocked: boolean;
}

export interface GuessFeedback {
  node: WordNode;
  categoryMatch: boolean;
  distance: number;
  sharedLetters: string[];
}

export type GuessResult =
  | { kind: "accepted"; state: RoundState; feedback: GuessFeedback }
  | { kind: "unknown"; state: RoundState; suggestions: string[] }
  | { kind: "duplicate"; state: RoundState; node: WordNode }
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

function shortestDistance(puzzle: Puzzle, startId: string, targetId = puzzle.targetId): number {
  if (startId === targetId) return 0;
  const queue: Array<{ id: string; distance: number }> = [{ id: startId, distance: 0 }];
  const visited = new Set([startId]);

  while (queue.length) {
    const current = queue.shift()!;
    for (const edge of puzzle.edges) {
      const nextId = edge.from === current.id ? edge.to : edge.to === current.id ? edge.from : null;
      if (!nextId || visited.has(nextId)) continue;
      if (nextId === targetId) return current.distance + 1;
      visited.add(nextId);
      queue.push({ id: nextId, distance: current.distance + 1 });
    }
  }
  return Number.POSITIVE_INFINITY;
}

export function getFeedback(puzzle: Puzzle, node: WordNode): GuessFeedback {
  const target = puzzle.nodes.find((candidate) => candidate.id === puzzle.targetId)!;
  const guessLetters = new Set([...normalizeWord(node.label)].filter((letter) => /[a-z0-9]/.test(letter)));
  const targetLetters = new Set([...normalizeWord(target.label)].filter((letter) => /[a-z0-9]/.test(letter)));
  const sharedLetters = [...guessLetters].filter((letter) => targetLetters.has(letter));
  return {
    node,
    categoryMatch: normalizeWord(node.category) === normalizeWord(target.category),
    distance: shortestDistance(puzzle, node.id),
    sharedLetters,
  };
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let row = 1; row <= left.length; row += 1) {
    const current = [row];
    for (let column = 1; column <= right.length; column += 1) {
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function findSuggestions(puzzle: Puzzle, rawGuess: string): string[] {
  const guess = normalizeWord(rawGuess);
  if (guess.length < 3) return [];
  return puzzle.nodes
    .filter((node) => node.id !== puzzle.targetId)
    .map((node) => ({ node, distance: editDistance(guess, normalizeWord(node.label)) }))
    .filter(({ node, distance }) => distance <= Math.max(1, Math.floor(normalizeWord(node.label).length / 4)))
    .sort((left, right) => left.distance - right.distance || left.node.label.localeCompare(right.node.label, "pt-BR"))
    .slice(0, 3)
    .map(({ node }) => node.label);
}

export function createRound(date: string): RoundState {
  return {
    version: 1,
    date,
    guesses: [],
    status: "playing",
    connectionChoice: null,
    routeUnlocked: false,
  };
}

export function submitGuess(puzzle: Puzzle, state: RoundState, rawGuess: string): GuessResult {
  if (state.status !== "playing") return { kind: "finished", state };

  const node = findNode(puzzle, rawGuess);
  if (!node) return { kind: "unknown", state, suggestions: findSuggestions(puzzle, rawGuess) };
  if (state.guesses.includes(node.id)) return { kind: "duplicate", state, node };

  const guesses = [...state.guesses, node.id];
  const status: RoundStatus = node.id === puzzle.targetId
    ? "solved"
    : guesses.length >= MAX_GUESSES
      ? "failed"
      : "playing";
  const nextState = { ...state, guesses, status };
  return { kind: "accepted", state: nextState, feedback: getFeedback(puzzle, node) };
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

export function getVisibleGuessEdges(puzzle: Puzzle, guessIds: string[]): WordEdge[] {
  const visible = new Set(guessIds);
  return puzzle.edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to));
}

export function getNode(puzzle: Puzzle, id: string): WordNode | undefined {
  return puzzle.nodes.find((node) => node.id === id);
}

export function isRoundState(value: unknown, date: string, puzzle: Puzzle): value is RoundState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RoundState>;
  return candidate.version === 1
    && candidate.date === date
    && Array.isArray(candidate.guesses)
    && candidate.guesses.length <= MAX_GUESSES
    && candidate.guesses.every((id) => typeof id === "string" && Boolean(getNode(puzzle, id)))
    && ["playing", "solved", "failed"].includes(candidate.status ?? "")
    && (candidate.connectionChoice === null || typeof candidate.connectionChoice === "string")
    && typeof candidate.routeUnlocked === "boolean";
}
