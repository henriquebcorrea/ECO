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

/** One fixed, authored route. `nodes` are stored in route order. */
export interface Puzzle {
  id: string;
  title: string;
  sense: string;
  nodes: WordNode[];
  edges: WordEdge[];
}

export type RoundStatus = "playing" | "solved" | "lost";
export const MAX_GUESSES = 24;
const STATE_VERSION = 5 as const;

export interface RoundState {
  version: typeof STATE_VERSION;
  puzzleId: string;
  /** Indices in the route that the player has guessed correctly. Endpoints are always visible. */
  foundIndices: number[];
  /** Canonicalized words make aliases count as duplicates. */
  attemptedWords: string[];
  attemptCount: number;
  /** Number of leading letters shown for the current missing position. */
  revealedLetters: number;
  status: RoundStatus;
}

export type WordValidator = (value: string, puzzle: Puzzle) => boolean;

export type GuessResult =
  | { kind: "accepted"; state: RoundState; outcome: "correct" | "wrong" | "solved" | "lost"; foundIndex?: number }
  | { kind: "empty" | "invalid" | "duplicate" | "endpoint" | "finished"; state: RoundState };

export function normalizeWord(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, " ");
}

export function isSingleWord(value: string): boolean {
  return /^(?:\p{L}+)(?:-\p{L}+)*$/u.test(value.trim().normalize("NFC"));
}

export function findNode(puzzle: Puzzle, rawGuess: string): WordNode | undefined {
  const normalized = normalizeWord(rawGuess);
  if (!normalized) return undefined;
  return puzzle.nodes.find((node) => [node.label, ...node.aliases]
    .some((term) => normalizeWord(term) === normalized));
}

export function createRound(puzzleId: string): RoundState {
  return {
    version: STATE_VERSION,
    puzzleId,
    foundIndices: [],
    attemptedWords: [],
    attemptCount: 0,
    revealedLetters: 0,
    status: "playing",
  };
}

export function getCurrentIndex(puzzle: Puzzle, state: RoundState): number | null {
  for (let index = 1; index < puzzle.nodes.length - 1; index += 1) {
    if (!state.foundIndices.includes(index)) return index;
  }
  return null;
}

export function getRevealedHint(puzzle: Puzzle, state: RoundState): string {
  const index = getCurrentIndex(puzzle, state);
  if (index === null || state.revealedLetters <= 0) return "";
  return Array.from(puzzle.nodes[index].label).slice(0, state.revealedLetters).join("");
}

function canonicalGuessKey(raw: string, knownNode?: WordNode): string {
  return knownNode ? `route:${knownNode.id}` : `word:${normalizeWord(raw)}`;
}

export function submitGuess(
  puzzle: Puzzle,
  state: RoundState,
  rawGuess: string,
  isValidWord: WordValidator,
): GuessResult {
  if (state.status !== "playing") return { kind: "finished", state };
  const raw = rawGuess.trim().normalize("NFC");
  if (!raw) return { kind: "empty", state };
  if (!isSingleWord(raw)) return { kind: "invalid", state };

  const knownNode = findNode(puzzle, raw);
  const start = puzzle.nodes[0];
  const end = puzzle.nodes[puzzle.nodes.length - 1];
  if ((knownNode && (knownNode.id === start.id || knownNode.id === end.id))) {
    return { kind: "endpoint", state };
  }

  const key = canonicalGuessKey(raw, knownNode);
  if (state.attemptedWords.includes(key)) return { kind: "duplicate", state };
  if (!knownNode && !isValidWord(raw, puzzle)) return { kind: "invalid", state };

  const attemptedWords = [...state.attemptedWords, key];
  const attemptCount = state.attemptCount + 1;
  const routeIndex = knownNode ? puzzle.nodes.findIndex((node) => node.id === knownNode.id) : -1;
  const isIntermediate = routeIndex > 0 && routeIndex < puzzle.nodes.length - 1;

  if (isIntermediate) {
    const foundIndices = state.foundIndices.includes(routeIndex)
      ? state.foundIndices
      : [...state.foundIndices, routeIndex].sort((left, right) => left - right);
    const solved = foundIndices.length === puzzle.nodes.length - 2;
    const lost = !solved && attemptCount >= MAX_GUESSES;
    const currentIndex = getCurrentIndex(puzzle, state);
    const nextState: RoundState = {
      ...state,
      attemptedWords,
      attemptCount,
      foundIndices,
      revealedLetters: currentIndex !== null && routeIndex === currentIndex ? 0 : state.revealedLetters,
      status: solved ? "solved" : lost ? "lost" : "playing",
    };
    return {
      kind: "accepted",
      state: nextState,
      outcome: solved ? "solved" : lost ? "lost" : "correct",
      foundIndex: routeIndex,
    };
  }

  const lost = attemptCount >= MAX_GUESSES;
  const nextState: RoundState = {
    ...state,
    attemptedWords,
    attemptCount,
    revealedLetters: Math.min(
      Array.from(puzzle.nodes[getCurrentIndex(puzzle, state) ?? 1].label).length,
      state.revealedLetters + 1,
    ),
    status: lost ? "lost" : "playing",
  };
  return { kind: "accepted", state: nextState, outcome: lost ? "lost" : "wrong" };
}

export function isRoundState(value: unknown, puzzle: Puzzle): value is RoundState {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RoundState>;
  if (candidate.version !== STATE_VERSION || candidate.puzzleId !== puzzle.id) return false;
  if (!Array.isArray(candidate.foundIndices) || !candidate.foundIndices.every((index) =>
    Number.isInteger(index) && index! > 0 && index! < puzzle.nodes.length - 1)) return false;
  if (new Set(candidate.foundIndices).size !== candidate.foundIndices.length) return false;
  if (!Array.isArray(candidate.attemptedWords) || !candidate.attemptedWords.every((word) => typeof word === "string")) return false;
  if (!Number.isInteger(candidate.attemptCount) || candidate.attemptCount! < 0 || candidate.attemptCount! > MAX_GUESSES) return false;
  if (!Number.isInteger(candidate.revealedLetters) || candidate.revealedLetters! < 0) return false;
  if (candidate.status !== "playing" && candidate.status !== "solved" && candidate.status !== "lost") return false;
  return true;
}

export function restoreRound(value: unknown, puzzle: Puzzle): RoundState | null {
  if (!isRoundState(value, puzzle)) return null;
  const foundIndices = [...value.foundIndices].sort((left, right) => left - right);
  const allFound = foundIndices.length === puzzle.nodes.length - 2;
  const status = allFound ? "solved" : value.attemptCount >= MAX_GUESSES ? "lost" : "playing";
  const currentIndex = (() => {
    for (let index = 1; index < puzzle.nodes.length - 1; index += 1) {
      if (!foundIndices.includes(index)) return index;
    }
    return null;
  })();
  const revealLimit = currentIndex === null ? 0 : Array.from(puzzle.nodes[currentIndex].label).length;
  return {
    ...value,
    foundIndices,
    attemptedWords: [...new Set(value.attemptedWords)],
    revealedLetters: Math.min(value.revealedLetters, revealLimit),
    status,
  };
}

export function routeIsValid(puzzle: Puzzle): boolean {
  if (puzzle.nodes.length !== 10 || puzzle.edges.length !== 9) return false;
  const ids = new Set(puzzle.nodes.map((node) => node.id));
  if (ids.size !== 10) return false;
  const terms = puzzle.nodes.flatMap((node) => [node.label, ...node.aliases]).map(normalizeWord);
  if (new Set(terms).size !== terms.length) return false;
  return puzzle.edges.every((edge, index) => {
    const relationWords = normalizeWord(edge.label).split(" ");
    const nextWord = normalizeWord(puzzle.nodes[index + 1].label);
    return edge.from === puzzle.nodes[index].id
      && edge.to === puzzle.nodes[index + 1].id
      && Boolean(edge.label.trim())
      && !relationWords.includes(nextWord);
  });
}
