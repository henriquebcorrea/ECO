import { routeIsValid, type Puzzle, type WordEdge, type WordNode } from "../game";

type RouteWord = readonly [id: string, label: string];

function makePuzzle(
  id: string,
  title: string,
  sense: string,
  words: RouteWord[],
  relations: string[],
): Puzzle {
  const nodes: WordNode[] = words.map(([wordId, label]) => ({
    id: wordId,
    label,
    aliases: [],
    category: "",
  }));
  const edges: WordEdge[] = relations.map((label, index) => ({
    from: nodes[index].id,
    to: nodes[index + 1].id,
    label,
  }));
  return { id, title, sense, nodes, edges };
}

export const puzzles: Puzzle[] = [
  makePuzzle("prototipo-1", "Pão → Lua", "Uma sequência entre o cotidiano e o céu.", [
    ["pao", "Pão"], ["massa", "Massa"], ["fermento", "Fermento"], ["bolo", "Bolo"],
    ["aniversario", "Aniversário"], ["festa", "Festa"], ["fogos", "Fogos"], ["fumaca", "Fumaça"],
    ["ceu", "Céu"], ["lua", "Lua"],
  ], [
    "começa como", "leva", "é ingrediente de", "é comum em", "é celebrado com",
    "pode ter", "soltam", "sobe ao", "mostra a",
  ]),
  makePuzzle("prototipo-2", "Relógio → Floresta", "Uma sequência que atravessa ideias e lugares.", [
    ["relogio", "Relógio"], ["tempo", "Tempo"], ["historia", "História"], ["museu", "Museu"],
    ["arte", "Arte"], ["quadro", "Quadro"], ["moldura", "Moldura"], ["madeira", "Madeira"],
    ["arvore", "Árvore"], ["floresta", "Floresta"],
  ], [
    "marca o", "fica na", "é preservada em", "pode exibir", "pode ser um",
    "tem uma", "pode ser feita de", "vem da", "cresce na",
  ]),
];

if (import.meta.env.DEV && puzzles.some((puzzle) => !routeIsValid(puzzle))) {
  throw new Error("Cada protótipo ECO precisa ter dez palavras únicas e nove relações em sequência.");
}

export function getPuzzleById(id: string): Puzzle | undefined {
  return puzzles.find((puzzle) => puzzle.id === id);
}
