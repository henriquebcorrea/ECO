import { describe, expect, it } from "vitest";
import {
  chooseConnection,
  createRound,
  createSemanticIndex,
  findNode,
  getFeedback,
  getGuessNode,
  getNextSaoPauloMidnight,
  getPilotDay,
  getSaoPauloDate,
  getVisibleGuessEdges,
  isRoundState,
  migrateLegacyRound,
  normalizeWord,
  PILOT_START_DATE,
  submitGuess,
  type SemanticEdge,
} from "./game";
import { getPuzzleForPilotDay, puzzles } from "./data/puzzles";

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
    for (let index = 0; index < 7; index += 1) {
      expect(getPuzzleForPilotDay(index)).toBe(puzzles[index]);
    }
    expect(getPuzzleForPilotDay(-1)).toBeUndefined();
    expect(getPuzzleForPilotDay(7)).toBeUndefined();
  });

  it("vira o desafio à meia-noite de São Paulo, não à meia-noite UTC", () => {
    expect(getSaoPauloDate(new Date("2026-09-26T02:59:00.000Z"))).toBe("2026-09-25");
    expect(getSaoPauloDate(new Date("2026-09-26T03:00:00.000Z"))).toBe("2026-09-26");
    expect(getNextSaoPauloMidnight(new Date("2026-09-25T23:59:00.000Z")).toISOString()).toBe("2026-09-26T03:00:00.000Z");
  });
});

describe("vocabulário e relações", () => {
  it("normaliza caixa, acentos e espaços", () => {
    expect(normalizeWord("  AÇÚCAR  ")).toBe("acucar");
    expect(normalizeWord("  Relógio   Digital ")).toBe("relogio digital");
  });

  it("resolve aliases curados para a palavra canônica", () => {
    expect(findNode(puzzles[2], "cafezinho")?.id).toBe("cafe");
    expect(findNode(puzzles[0], "planeta vermelho")?.id).toBe("marte");
  });

  it("mantém as relações e letras em comum dos nós curados", () => {
    const saturno = findNode(puzzles[0], "saturno")!;
    const index = createSemanticIndex(puzzles[0]);
    const feedback = getFeedback(puzzles[0], saturno, index);
    expect(feedback.categoryMatch).toBe(true);
    expect(feedback.distance).toBe(2);
    expect(feedback.sharedLetters.sort()).toEqual(["a", "r", "t"]);
    expect(feedback.semanticPath?.relations).toEqual(["faz parte de", "contém"]);
  });

  it("encontra caminhos do índice local e deixa palavras sem caminho desconectadas", () => {
    const puzzle = puzzles[0];
    const edges: SemanticEdge[] = [
      { from: "casa", to: "noite", label: "fica em" },
    ];
    const index = createSemanticIndex(puzzle, edges);
    const casa = { id: "word:casa", label: "casa", aliases: [], category: "" };
    const semRelacao = { id: "word:abacaxi", label: "abacaxi", aliases: [], category: "" };
    expect(getFeedback(puzzle, casa, index).distance).toBe(5);
    expect(getFeedback(puzzle, getGuessNode(puzzle, { id: "word:casa", label: "casa" }), index).semanticPath?.relations[0]).toBe("fica em");
    expect(getFeedback(puzzle, semRelacao, index).distance).toBeNull();
    expect(getFeedback(puzzle, semRelacao, index).sharedLetters).toEqual(["a"]);
  });

  it("mantém todos os nós curados ligados às respostas e as rotas secretas percorríveis", () => {
    for (const puzzle of puzzles) {
      const ids = new Set(puzzle.nodes.map((node) => node.id));
      expect(puzzle.nodes.length).toBeGreaterThan(10);
      expect(ids.size).toBe(puzzle.nodes.length);
      expect(puzzle.connectionOptions).toHaveLength(4);
      expect(puzzle.connectionOptions.some((option) => option.id === puzzle.correctConnectionId)).toBe(true);
      const index = createSemanticIndex(puzzle);
      for (const node of puzzle.nodes) {
        expect(getFeedback(puzzle, node, index).distance, `${puzzle.date}/${node.id} precisa chegar à resposta`).not.toBeNull();
      }
      for (let routeIndex = 1; routeIndex < puzzle.secretRoute.length; routeIndex += 1) {
        const left = puzzle.secretRoute[routeIndex - 1];
        const right = puzzle.secretRoute[routeIndex];
        expect(puzzle.edges.some((edge) => edge.from === left && edge.to === right || edge.from === right && edge.to === left)).toBe(true);
      }
    }
  });
});

describe("uma rodada", () => {
  it("aceita qualquer palavra sem sugestão e não repete termos normalizados", () => {
    const puzzle = puzzles[0];
    const initial = createRound("practice:1", "practice");
    const first = submitGuess(puzzle, initial, "casa");
    expect(first.kind).toBe("accepted");
    if (first.kind !== "accepted") return;
    expect(first.guess).toEqual({ id: "word:casa", label: "casa" });
    expect(first.feedback.distance).toBeNull();
    expect(first.feedback.sharedLetters).toEqual(["a"]);

    const duplicate = submitGuess(puzzle, first.state, "CASÁ");
    expect(duplicate.kind).toBe("duplicate");
    expect(duplicate.state.guesses).toHaveLength(1);
    expect(submitGuess(puzzle, first.state, " ").kind).toBe("empty");
  });

  it("calcula distância semântica de termos livres quando há uma rota registrada", () => {
    const puzzle = puzzles[0];
    const index = createSemanticIndex(puzzle, [
      { from: "casa", to: "noite", label: "fica em" },
    ]);
    const result = submitGuess(puzzle, createRound("practice:1", "practice"), "casa", index);
    expect(result.kind).toBe("accepted");
    if (result.kind === "accepted") {
      expect(result.feedback.distance).toBe(5);
      expect(result.feedback.semanticPath?.relations[0]).toBe("fica em");
    }
  });

  it("aceita mais de oito palpites válidos até encontrar a resposta", () => {
    const puzzle = puzzles[0];
    let state = createRound("daily:2026-09-25", "daily");
    const guesses = ["abacaxi", "casa", "janela", "computador", "música", "rio", "montanha", "livro", "gato", "nuvem"];
    for (const guess of guesses) {
      const result = submitGuess(puzzle, state, guess);
      expect(result.kind).toBe("accepted");
      if (result.kind === "accepted") state = result.state;
    }
    expect(state.guesses).toHaveLength(10);
    expect(state.status).toBe("playing");
  });

  it("encerra ao acertar e desbloqueia a trilha com a opção certa", () => {
    const puzzle = puzzles[0];
    const solved = submitGuess(puzzle, createRound("daily:2026-09-25", "daily"), "MARTE");
    expect(solved.kind).toBe("accepted");
    if (solved.kind !== "accepted") return;
    expect(solved.state.status).toBe("solved");
    expect(submitGuess(puzzle, solved.state, "lua").kind).toBe("finished");

    const wrong = chooseConnection(puzzle, solved.state, "cinema");
    expect(wrong.routeUnlocked).toBe(false);
    expect(wrong.connectionChoice).toBe("cinema");
    expect(chooseConnection(puzzle, wrong, "astronomia")).toBe(wrong);

    const correct = chooseConnection(puzzle, solved.state, "astronomia");
    expect(correct.routeUnlocked).toBe(true);
  });

  it("exibe conexões diretas entre palpites conhecidos e livres", () => {
    const index = createSemanticIndex(puzzles[0], [
      { from: "casa", to: "noite", label: "fica em" },
    ]);
    const guesses = [
      { id: "word:casa", label: "casa" },
      { id: "noite", label: "Noite" },
      { id: "ceu", label: "Céu" },
    ];
    const edges = getVisibleGuessEdges(guesses, index);
    expect(edges).toHaveLength(2);
    expect(edges.map((edge) => edge.label)).toContain("fica em");
    expect(edges.map((edge) => edge.label)).toContain("escurece o");
  });

  it("valida progresso separado de diário e treino e migra rodadas antigas", () => {
    const puzzle = puzzles[0];
    const daily = createRound("daily:2026-09-25", "daily");
    expect(isRoundState(daily, "daily:2026-09-25", "daily", puzzle)).toBe(true);
    expect(isRoundState(daily, "practice:1", "practice", puzzle)).toBe(false);

    const legacy = {
      version: 1,
      date: puzzle.date,
      guesses: ["lua", "noite", "ceu", "espaco", "planeta", "saturno", "aneis", "terra"],
      status: "failed",
      connectionChoice: null,
      routeUnlocked: false,
    };
    const migrated = migrateLegacyRound(legacy, "daily:2026-09-25", "daily", puzzle);
    expect(migrated?.status).toBe("playing");
    expect(migrated?.guesses).toHaveLength(8);
    expect(isRoundState(migrated, "daily:2026-09-25", "daily", puzzle)).toBe(true);
  });
});
