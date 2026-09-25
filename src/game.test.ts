import { describe, expect, it } from "vitest";
import {
  chooseConnection,
  createRound,
  findNode,
  getFeedback,
  getNextSaoPauloMidnight,
  getPilotDay,
  getSaoPauloDate,
  getVisibleGuessEdges,
  MAX_GUESSES,
  normalizeWord,
  PILOT_START_DATE,
  submitGuess,
} from "./game";
import { puzzles } from "./data/puzzles";

describe("piloto diário", () => {
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

  it("vira o desafio à meia-noite de São Paulo, não à meia-noite UTC", () => {
    expect(getSaoPauloDate(new Date("2026-09-26T02:59:00.000Z"))).toBe("2026-09-25");
    expect(getSaoPauloDate(new Date("2026-09-26T03:00:00.000Z"))).toBe("2026-09-26");
    expect(getNextSaoPauloMidnight(new Date("2026-09-25T23:59:00.000Z")).toISOString()).toBe("2026-09-26T03:00:00.000Z");
  });
});

describe("vocabulário e pistas", () => {
  it("normaliza caixa, acentos e espaços", () => {
    expect(normalizeWord("  AÇÚCAR  ")).toBe("acucar");
    expect(normalizeWord("  Relógio   Digital ")).toBe("relogio digital");
  });

  it("resolve aliases para a palavra canônica", () => {
    expect(findNode(puzzles[2], "cafezinho")?.id).toBe("cafe");
    expect(findNode(puzzles[0], "planeta vermelho")?.id).toBe("marte");
  });

  it("calcula categoria, distância e letras compartilhadas", () => {
    const saturno = findNode(puzzles[0], "saturno")!;
    const feedback = getFeedback(puzzles[0], saturno);
    expect(feedback.categoryMatch).toBe(true);
    expect(feedback.distance).toBe(2);
    expect(feedback.sharedLetters.sort()).toEqual(["a", "r", "t"]);
  });

  it("mantém todos os nós ligados à resposta e todas as rotas secretas percorríveis", () => {
    for (const puzzle of puzzles) {
      const ids = new Set(puzzle.nodes.map((node) => node.id));
      expect(puzzle.nodes.length).toBeGreaterThan(10);
      expect(ids.size).toBe(puzzle.nodes.length);
      expect(puzzle.connectionOptions).toHaveLength(4);
      expect(puzzle.connectionOptions.some((option) => option.id === puzzle.correctConnectionId)).toBe(true);
      for (const node of puzzle.nodes) {
        expect(Number.isFinite(getFeedback(puzzle, node).distance), `${puzzle.date}/${node.id} precisa chegar à resposta`).toBe(true);
      }
      for (let index = 1; index < puzzle.secretRoute.length; index += 1) {
        const left = puzzle.secretRoute[index - 1];
        const right = puzzle.secretRoute[index];
        expect(puzzle.edges.some((edge) => edge.from === left && edge.to === right || edge.from === right && edge.to === left)).toBe(true);
      }
    }
  });
});

describe("uma rodada", () => {
  it("não gasta tentativa com palavra desconhecida ou repetida", () => {
    const puzzle = puzzles[0];
    const initial = createRound(puzzle.date);
    const unknown = submitGuess(puzzle, initial, "abacaxi");
    expect(unknown.kind).toBe("unknown");
    expect(unknown.state.guesses).toHaveLength(0);

    const first = submitGuess(puzzle, initial, "lua");
    expect(first.kind).toBe("accepted");
    if (first.kind !== "accepted") return;
    const duplicate = submitGuess(puzzle, first.state, "LÚA");
    expect(duplicate.kind).toBe("duplicate");
    expect(duplicate.state.guesses).toHaveLength(1);
  });

  it("encerra a rodada ao acertar e desbloqueia a trilha com a opção certa", () => {
    const puzzle = puzzles[0];
    const solved = submitGuess(puzzle, createRound(puzzle.date), "MARTE");
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

  it("encerra após oito palpites válidos sem descobrir a resposta", () => {
    const puzzle = puzzles[0];
    const guesses = ["lua", "noite", "céu", "espaço", "planeta", "saturno", "anéis", "terra"];
    let state = createRound(puzzle.date);
    for (const guess of guesses) {
      const result = submitGuess(puzzle, state, guess);
      expect(result.kind).toBe("accepted");
      if (result.kind === "accepted") state = result.state;
    }
    expect(state.guesses).toHaveLength(MAX_GUESSES);
    expect(state.status).toBe("failed");
  });

  it("revela relações diretas entre palpites do mapa", () => {
    const edges = getVisibleGuessEdges(puzzles[0], ["lua", "noite", "terra"]);
    expect(edges).toHaveLength(1);
    expect(edges[0].label).toBe("aparece na");
  });
});
