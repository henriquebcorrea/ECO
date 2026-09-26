import { describe, expect, it } from "vitest";
import {
  chooseConnection,
  createRound,
  createSemanticIndex,
  getFeedback,
  getGuessNode,
  getNextSaoPauloMidnight,
  getPilotDay,
  getSaoPauloDate,
  isRoundState,
  MAX_GUESSES,
  normalizeWord,
  PILOT_START_DATE,
  restoreRound,
  submitGuess,
  type Puzzle,
  type WordValidator,
} from "./game";
import { getPuzzleForPilotDay, puzzles } from "./data/puzzles";

const fixtureWords = new Set([
  "abacaxi", "casa", "janela", "computador", "musica", "rio", "montanha", "livro", "gato", "nuvem", "mar", "agua", "encanamento",
]);
const fixtureValidator: WordValidator = (value) => fixtureWords.has(normalizeWord(value));

function makeHousePuzzle(): Puzzle {
  return {
    ...puzzles[0],
    targetId: "casa",
    nodes: [
      { id: "casa", label: "Casa", aliases: [], category: "Lugar" },
      { id: "agua", label: "Água", aliases: [], category: "Líquido" },
      { id: "encanamento", label: "Encanamento", aliases: [], category: "Objeto" },
    ],
    edges: [],
    secretRoute: ["agua", "encanamento", "casa"],
  };
}

describe("piloto diário e treino", () => {
  it("abre sete datas consecutivas e nenhuma fora do piloto", () => {
    expect(getPilotDay("2026-09-24", "2026-09-25")).toBeNull();
    expect(getPilotDay("2026-09-25", "2026-09-25")).toBe(0);
    expect(getPilotDay("2026-10-01", "2026-09-25")).toBe(6);
    expect(getPilotDay("2026-10-02", "2026-09-25")).toBeNull();
    expect(getPilotDay("2026-09-99", "2026-09-25")).toBeNull();
    expect(getPilotDay("not-a-date", "2026-09-25")).toBeNull();
    expect(puzzles.map((puzzle) => puzzle.date)).toEqual(Array.from({ length: 7 }, (_, index) => {
      const [year, month, day] = PILOT_START_DATE.split("-").map(Number);
      return new Date(Date.UTC(year, month - 1, day + index)).toISOString().slice(0, 10);
    }));
  });

  it("permite escolher todos os sete desafios no treino", () => {
    for (let index = 0; index < 7; index += 1) expect(getPuzzleForPilotDay(index)).toBe(puzzles[index]);
    expect(getPuzzleForPilotDay(-1)).toBeUndefined();
    expect(getPuzzleForPilotDay(7)).toBeUndefined();
  });

  it("vira o desafio à meia-noite de São Paulo", () => {
    expect(getSaoPauloDate(new Date("2026-09-26T02:59:00.000Z"))).toBe("2026-09-25");
    expect(getSaoPauloDate(new Date("2026-09-26T03:00:00.000Z"))).toBe("2026-09-26");
    expect(getNextSaoPauloMidnight(new Date("2026-09-25T23:59:00.000Z")).toISOString()).toBe("2026-09-26T03:00:00.000Z");
  });
});

describe("trilha semântica", () => {
  it("revela o próximo termo e a relação, sem mostrar a resposta", () => {
    const puzzle = makeHousePuzzle();
    const index = createSemanticIndex(puzzle, [
      { from: "água", to: "encanamento", label: "passa pelo" },
      { from: "encanamento", to: "casa", label: "faz parte de" },
    ]);
    const water = { id: "word:agua", label: "água", aliases: [], category: "" };
    const pipe = { id: "word:encanamento", label: "encanamento", aliases: [], category: "" };

    expect(getFeedback(puzzle, water, index).nextStep).toEqual({
      word: "Encanamento",
      answerTerm: "encanamento",
      relation: "passa pelo",
      isSecret: false,
    });
    expect(getFeedback(puzzle, pipe, index).nextStep).toEqual({
      word: null,
      answerTerm: "casa",
      relation: "faz parte de",
      isSecret: true,
    });
  });

  it("mostra elos curados em ordem e filtra relações vagas", () => {
    const puzzle = puzzles[0];
    const index = createSemanticIndex(puzzle, [
      { from: "abacaxi", to: "marte", label: "tem relação com" },
      { from: "lua", to: "marte", label: "fica em" },
    ]);
    const lua = getFeedback(puzzle, getGuessNode(puzzle, { id: "lua", label: "Lua" }), index);
    const abacaxi = getFeedback(puzzle, { id: "word:abacaxi", label: "abacaxi", aliases: [], category: "" }, index);

    expect(lua.nextStep).toEqual({ word: "Noite", answerTerm: "noite", relation: "aparece na", isSecret: false });
    expect(abacaxi.nextStep).toBeNull();
    expect("distance" in lua).toBe(false);
    expect("sharedLetters" in lua).toBe(false);
  });

  it("mantém as sete rotas secretas alcançáveis e suas relações direcionais", () => {
    for (const puzzle of puzzles) {
      const index = createSemanticIndex(puzzle);
      for (const id of puzzle.secretRoute.slice(0, -1)) {
        const feedback = getFeedback(puzzle, getNodeFromPuzzle(puzzle, id), index);
        expect(feedback.nextStep, `${puzzle.date}/${id} precisa mostrar o próximo elo`).not.toBeNull();
      }
      for (let routeIndex = 1; routeIndex < puzzle.secretRoute.length; routeIndex += 1) {
        const from = puzzle.secretRoute[routeIndex - 1];
        const to = puzzle.secretRoute[routeIndex];
        expect(puzzle.edges.some((edge) => edge.from === from && edge.to === to)).toBe(true);
      }
    }
  });
});

function getNodeFromPuzzle(puzzle: Puzzle, id: string) {
  return puzzle.nodes.find((node) => node.id === id)!;
}

describe("palpites e vocabulário", () => {
  it("aceita só uma palavra válida e não apresenta sugestões ortográficas", () => {
    const puzzle = puzzles[0];
    const initial = createRound("practice:1", "practice");
    const valid = submitGuess(puzzle, initial, "CASA", createSemanticIndex(puzzle), fixtureValidator);
    expect(valid.kind).toBe("accepted");
    if (valid.kind !== "accepted") return;
    expect(valid.guess).toEqual({ id: "word:casa", label: "casa" });

    expect(submitGuess(puzzle, valid.state, "CASA", createSemanticIndex(puzzle), fixtureValidator).kind).toBe("duplicate");
    expect(submitGuess(puzzle, valid.state, "casa grande", createSemanticIndex(puzzle), fixtureValidator).kind).toBe("invalid");
    expect(submitGuess(puzzle, valid.state, "xqzqplm", createSemanticIndex(puzzle), fixtureValidator).kind).toBe("invalid");
    expect(submitGuess(puzzle, valid.state, " ", createSemanticIndex(puzzle), fixtureValidator).kind).toBe("empty");
  });

  it("aceita palavra válida sem rota e não inventa uma conexão", () => {
    const puzzle = puzzles[0];
    const result = submitGuess(puzzle, createRound("practice:1", "practice"), "abacaxi", createSemanticIndex(puzzle), fixtureValidator);
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") {
      expect(result.outcome).toBe("unlinked");
      expect(result.state.unlinked).toHaveLength(1);
      expect(result.state.activeStep).toBeNull();
    }
  });

  it("esconde o próximo elo, revela letras após erros e avança ao acertar", () => {
    const puzzle = makeHousePuzzle();
    const index = createSemanticIndex(puzzle, [
      { from: "água", to: "encanamento", label: "passa pelo" },
      { from: "encanamento", to: "casa", label: "faz parte de" },
    ]);
    let state = createRound("practice:1", "practice");
    const start = submitGuess(puzzle, state, "ÁGUA", index, fixtureValidator);
    expect(start.kind).toBe("accepted");
    if (start.kind !== "accepted") return;
    state = start.state;
    expect(start.outcome).toBe("started");
    expect(state.activeStep).toMatchObject({ fromLabel: "Água", relation: "passa pelo", answerLabel: "Encanamento", revealedLetters: 0 });
    expect(state.guesses.map((guess) => guess.label)).toEqual(["Água"]);

    const wrong = submitGuess(puzzle, state, "casa", index, fixtureValidator);
    expect(wrong.kind).toBe("accepted");
    if (wrong.kind !== "accepted") return;
    state = wrong.state;
    expect(wrong.outcome).toBe("wrong");
    expect(state.attemptCount).toBe(2);
    expect(state.activeStep?.revealedLetters).toBe(1);
    expect(state.guesses).toHaveLength(1);

    const duplicate = submitGuess(puzzle, state, "CASA", index, fixtureValidator);
    expect(duplicate.kind).toBe("duplicate");
    if (duplicate.kind === "duplicate") expect(duplicate.state.attemptCount).toBe(2);

    const nextHint = submitGuess(puzzle, state, "mar", index, fixtureValidator);
    expect(nextHint.kind).toBe("accepted");
    if (nextHint.kind !== "accepted") return;
    state = nextHint.state;
    expect(state.activeStep?.revealedLetters).toBe(2);

    const pipe = submitGuess(puzzle, state, "ENCANAMENTO", index, fixtureValidator);
    expect(pipe.kind).toBe("accepted");
    if (pipe.kind !== "accepted") return;
    state = pipe.state;
    expect(pipe.outcome).toBe("advanced");
    expect(state.guesses.map((guess) => guess.label)).toEqual(["Água", "Encanamento"]);
    expect(state.guesses[1].relationFromPrevious).toBe("passa pelo");
    expect(state.activeStep).toMatchObject({ fromLabel: "Encanamento", relation: "faz parte de", answerLabel: "Casa", isSecret: true });

    const answer = submitGuess(puzzle, state, "CASA", index, fixtureValidator);
    expect(answer.kind).toBe("accepted");
    if (answer.kind === "accepted") {
      expect(answer.outcome).toBe("solved");
      expect(answer.state.status).toBe("solved");
      expect(answer.state.attemptCount).toBe(5);
    }
  });

  it("permite no máximo doze palpites válidos e encerra a rodada ao esgotar", () => {
    const puzzle = puzzles[0];
    let state = createRound("daily:2026-09-25", "daily");
    for (const word of [...fixtureWords].slice(0, MAX_GUESSES)) {
      const result = submitGuess(puzzle, state, word, createSemanticIndex(puzzle), fixtureValidator);
      expect(result.kind).toBe("accepted");
      if (result.kind === "accepted") state = result.state;
    }
    expect(state.attemptCount).toBe(MAX_GUESSES);
    expect(state.status).toBe("lost");
    expect(submitGuess(puzzle, state, "encanamento", createSemanticIndex(puzzle), fixtureValidator).kind).toBe("finished");
  });

  it("permite completar a trilha guiada de cada um dos sete desafios", () => {
    const acceptVocabulary: WordValidator = () => true;
    for (const puzzle of puzzles) {
      const index = createSemanticIndex(puzzle);
      const first = getNodeFromPuzzle(puzzle, puzzle.secretRoute[0]);
      let state = createRound("practice:" + puzzle.date, "practice");
      let result = submitGuess(puzzle, state, first.label, index, acceptVocabulary);
      expect(result.kind, puzzle.date).toBe("accepted");
      if (result.kind !== "accepted") continue;
      state = result.state;
      let safety = 0;
      while (state.status === "playing" && state.activeStep && safety < MAX_GUESSES) {
        result = submitGuess(puzzle, state, state.activeStep.answerLabel, index, acceptVocabulary);
        expect(result.kind, puzzle.date).toBe("accepted");
        if (result.kind !== "accepted") break;
        state = result.state;
        safety += 1;
      }
      expect(state.status, puzzle.date).toBe("solved");
      expect(state.attemptCount).toBeLessThanOrEqual(MAX_GUESSES);
    }
  });

  it("encerra ao acertar e abre a rota secreta pela opção certa", () => {
    const puzzle = puzzles[0];
    const solved = submitGuess(puzzle, createRound("daily:2026-09-25", "daily"), "MARTE", createSemanticIndex(puzzle), fixtureValidator);
    expect(solved.kind).toBe("accepted");
    if (solved.kind !== "accepted") return;
    expect(solved.state.status).toBe("solved");
    expect(submitGuess(puzzle, solved.state, "lua", createSemanticIndex(puzzle), fixtureValidator).kind).toBe("finished");
    expect(chooseConnection(puzzle, solved.state, "cinema").routeUnlocked).toBe(false);
    expect(chooseConnection(puzzle, solved.state, "astronomia").routeUnlocked).toBe(true);
  });

  it("migra rodadas antigas, remove entradas inválidas e mantém treino separado", () => {
    const puzzle = puzzles[0];
    const legacy = {
      version: 2,
      roundKey: "daily:2026-09-25",
      mode: "daily",
      guesses: [
        { id: "word:casa", label: "casa" },
        { id: "word:casa-copy", label: "CASA" },
        { id: "word:bad", label: "xqzqplm" },
        { id: "word:phrase", label: "casa grande" },
      ],
      status: "playing",
      connectionChoice: null,
      routeUnlocked: false,
    };
    const restored = restoreRound(legacy, "daily:2026-09-25", "daily", puzzle, fixtureValidator);
    expect(restored?.version).toBe(4);
    expect(restored?.guesses).toHaveLength(0);
    expect(restored?.attemptCount).toBe(0);
    expect(isRoundState(restored, "daily:2026-09-25", "daily", puzzle)).toBe(true);
    expect(restoreRound(legacy, "practice:1", "practice", puzzle, fixtureValidator)).toBeNull();
  });
});
