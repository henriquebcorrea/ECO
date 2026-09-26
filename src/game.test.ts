import { describe, expect, it } from "vitest";
import {
  createRound,
  getCurrentIndex,
  isCurrentRelationRevealed,
  MAX_GUESSES,
  normalizeWord,
  RELATION_REVEAL_MISSES,
  restoreRound,
  routeIsValid,
  submitGuess,
  type WordValidator,
} from "./game";
import { puzzles } from "./data/puzzles";

const acceptedWrongWords = new Set([
  "abacaxi", "casa", "janela", "computador", "musica", "rio", "montanha", "livro", "gato", "nuvem",
  "mar", "agua", "encanamento", "pato", "cachorro", "flor", "telefone", "cadeira", "sapato", "escola",
  "cidade", "praia", "garrafa", "teclado", "caderno", "ponte", "cozinha", "relampago", "cafe", "baleia",
]);
const validator: WordValidator = (word) => acceptedWrongWords.has(normalizeWord(word));
const alwaysValid: WordValidator = () => true;

function guess(puzzleIndex: number, state: ReturnType<typeof createRound>, word: string) {
  const puzzle = puzzles[puzzleIndex];
  const result = submitGuess(puzzle, state, word, alwaysValid);
  expect(result.kind).toBe("accepted");
  if (result.kind !== "accepted") throw new Error("Esperava palpite aceito");
  return result;
}

describe("protótipos de sequência", () => {
  it("oferece exatamente três rotas de dez palavras e nove relações", () => {
    expect(puzzles).toHaveLength(3);
    for (const puzzle of puzzles) {
      expect(puzzle.nodes).toHaveLength(10);
      expect(puzzle.edges).toHaveLength(9);
      expect(routeIsValid(puzzle)).toBe(true);
    }
    expect(puzzles[0].nodes.map((node) => node.label)).toEqual([
      "Pão", "Massa", "Fermento", "Bolo", "Aniversário", "Festa", "Fogos", "Fumaça", "Céu", "Lua",
    ]);
  });

  it("aceita elos na ordem e completa o percurso", () => {
    const puzzle = puzzles[0];
    let state = createRound(puzzle.id);
    for (const node of puzzle.nodes.slice(1, -1)) {
      const result = submitGuess(puzzle, state, node.label, alwaysValid);
      expect(result.kind).toBe("accepted");
      if (result.kind !== "accepted") return;
      state = result.state;
    }
    expect(state.status).toBe("solved");
    expect(state.attemptCount).toBe(8);
    expect(state.foundIndices).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("marca uma palavra futura sem pular lacunas e avança automaticamente ao fechá-las", () => {
    const puzzle = puzzles[0];
    let state = createRound(puzzle.id);
    state = guess(0, state, "Bolo").state;
    expect(state.foundIndices).toEqual([3]);
    expect(getCurrentIndex(puzzle, state)).toBe(1);

    state = guess(0, state, "Massa").state;
    expect(getCurrentIndex(puzzle, state)).toBe(2);
    state = guess(0, state, "Fermento").state;
    expect(getCurrentIndex(puzzle, state)).toBe(4);
    expect(state.foundIndices).toEqual([1, 2, 3]);
  });

  it("esconde a relação nos dois primeiros erros e a revela no terceiro", () => {
    const puzzle = puzzles[0];
    let state = createRound(puzzle.id);
    expect(state.wrongGuessesForCurrent).toBe(0);
    expect(isCurrentRelationRevealed(state)).toBe(false);

    state = guess(0, state, "Água").state;
    expect(state.wrongGuessesForCurrent).toBe(1);
    expect(isCurrentRelationRevealed(state)).toBe(false);
    state = guess(0, state, "Casa").state;
    expect(state.wrongGuessesForCurrent).toBe(2);
    expect(isCurrentRelationRevealed(state)).toBe(false);
    state = guess(0, state, "Janela").state;
    expect(state.wrongGuessesForCurrent).toBe(RELATION_REVEAL_MISSES);
    expect(isCurrentRelationRevealed(state)).toBe(true);

    state = guess(0, state, "Computador").state;
    expect(state.wrongGuessesForCurrent).toBe(RELATION_REVEAL_MISSES);
    expect(state.attemptCount).toBe(4);
  });

  it("não gasta bolinhas com acerto futuro e reinicia ao preencher a lacuna atual", () => {
    const puzzle = puzzles[0];
    let state = guess(0, createRound(puzzle.id), "Água").state;
    state = guess(0, state, "Casa").state;
    state = guess(0, state, "Bolo").state;
    expect(state.wrongGuessesForCurrent).toBe(2);
    expect(getCurrentIndex(puzzle, state)).toBe(1);

    state = guess(0, state, "Massa").state;
    expect(getCurrentIndex(puzzle, state)).toBe(2);
    expect(state.wrongGuessesForCurrent).toBe(0);
    expect(isCurrentRelationRevealed(state)).toBe(false);
  });

  it("migra rodadas anteriores sem perder acertos ou palpites", () => {
    const puzzle = puzzles[0];
    const legacy = {
      version: 5,
      puzzleId: puzzle.id,
      foundIndices: [3],
      attemptedWords: ["route:bolo", "word:agua"],
      attemptCount: 2,
      revealedLetters: 2,
      status: "playing",
    };
    const restored = restoreRound(legacy, puzzle);
    expect(restored?.version).toBe(6);
    expect(restored?.foundIndices).toEqual([3]);
    expect(restored?.attemptedWords).toEqual(["route:bolo", "word:agua"]);
    expect(restored?.attemptCount).toBe(2);
    expect(restored?.wrongGuessesForCurrent).toBe(0);
  });

  it("normaliza acentos e caixa, bloqueia duplicatas, entradas inválidas e os extremos sem gastar palpites", () => {
    const puzzle = puzzles[0];
    let state = createRound(puzzle.id);
    expect(submitGuess(puzzle, state, "", alwaysValid).kind).toBe("empty");
    expect(submitGuess(puzzle, state, "palavra composta", alwaysValid).kind).toBe("invalid");
    expect(submitGuess(puzzle, state, "inventado", () => false).kind).toBe("invalid");
    expect(submitGuess(puzzle, state, "PÃO", alwaysValid).kind).toBe("endpoint");
    expect(submitGuess(puzzle, state, "lua", alwaysValid).kind).toBe("endpoint");
    expect(state.attemptCount).toBe(0);
    expect(state.wrongGuessesForCurrent).toBe(0);

    state = guess(0, state, "Casa").state;
    expect(submitGuess(puzzle, state, "casa", alwaysValid).kind).toBe("duplicate");
    expect(submitGuess(puzzle, state, "palavra composta", alwaysValid).kind).toBe("invalid");
    expect(state.attemptCount).toBe(1);
    expect(state.wrongGuessesForCurrent).toBe(1);
  });

  it("encerra em derrota exatamente no palpite 24 e revela o restante ao restaurar", () => {
    const puzzle = puzzles[0];
    let state = createRound(puzzle.id);
    for (let index = 0; index < MAX_GUESSES; index += 1) {
      const word = [...acceptedWrongWords][index];
      const result = submitGuess(puzzle, state, word, validator);
      expect(result.kind).toBe("accepted");
      if (result.kind !== "accepted") return;
      state = result.state;
      if (index < MAX_GUESSES - 1) expect(state.status).toBe("playing");
    }
    expect(state.attemptCount).toBe(24);
    expect(state.status).toBe("lost");
    expect(submitGuess(puzzle, state, "Massa", alwaysValid).kind).toBe("finished");
    expect(restoreRound(JSON.parse(JSON.stringify(state)), puzzle)?.status).toBe("lost");
  });

  it("vence no palpite 24 se aquele palpite preencher a última lacuna", () => {
    const puzzle = puzzles[0];
    let state = createRound(puzzle.id);
    const offRoute = [...acceptedWrongWords].slice(0, MAX_GUESSES - 8);
    for (const word of offRoute) state = guess(0, state, word).state;
    for (const node of puzzle.nodes.slice(1, -1)) state = guess(0, state, node.label).state;
    expect(state.attemptCount).toBe(MAX_GUESSES);
    expect(state.status).toBe("solved");
  });

  it("separa o progresso dos dois protótipos ao restaurar", () => {
    const first = puzzles[0];
    const second = puzzles[1];
    const firstState = guess(0, createRound(first.id), "Massa").state;
    expect(restoreRound(firstState, first)?.foundIndices).toEqual([1]);
    expect(restoreRound(firstState, second)).toBeNull();
    expect(createRound(second.id).foundIndices).toEqual([]);
  });
});
