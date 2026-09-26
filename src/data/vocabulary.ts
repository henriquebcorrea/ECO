import { isSingleWord, normalizeWord, type Puzzle } from "../game";

export interface VocabularyMetadata {
  properNames: string[];
  hyphenated: string[];
  accentVariants: Array<[string, string[]]>;
}

export interface PortugueseVocabulary {
  isValidGuess(value: string, puzzle: Puzzle): boolean;
  dispose(): void;
}

async function loadGzText(path: string): Promise<string> {
  const response = await fetch(new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href));
  if (!response.ok || !response.body) throw new Error(`Não foi possível carregar ${path}.`);
  if (response.headers.get("content-encoding")?.includes("gzip")) return response.text();
  if (!("DecompressionStream" in window)) throw new Error("Este navegador não consegue abrir o dicionário local.");
  const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
  return new Response(decompressed).text();
}

function puzzleTerms(puzzle: Puzzle): Map<string, string> {
  const terms = new Map<string, string>();
  for (const node of puzzle.nodes) {
    if (isSingleWord(node.label)) terms.set(normalizeWord(node.label), node.label);
    for (const alias of node.aliases) {
      if (isSingleWord(alias)) terms.set(normalizeWord(alias), alias);
    }
  }
  return terms;
}

export function isValidPortugueseWord(
  value: string,
  puzzle: Puzzle,
  metadata: VocabularyMetadata,
  spell: (word: string) => boolean,
): boolean {
  const raw = value.trim().normalize("NFC");
  if (!isSingleWord(raw)) return false;
  const key = normalizeWord(raw);
  if (puzzleTerms(puzzle).has(key)) return true;
  if (metadata.properNames.includes(key)) return false;
  if (raw.includes("-") && !metadata.hyphenated.includes(key)) return false;
  return spell(raw.toLocaleLowerCase("pt-BR"));
}

export async function loadPortugueseVocabulary(): Promise<PortugueseVocabulary> {
  const [affixes, dictionary, metadataText] = await Promise.all([
    loadGzText("data/pt-br.aff.gz"),
    loadGzText("data/pt-br.dic.gz"),
    loadGzText("data/pt-br-meta.json.gz"),
  ]);
  const metadata = JSON.parse(metadataText) as VocabularyMetadata;
  const wrapperUrl = new URL(`${import.meta.env.BASE_URL}vendor/hunspell-wrapper/dist/Hunspell.js`, window.location.href).href;
  const wrapper = await import(/* @vite-ignore */ wrapperUrl) as {
    createHunspellFromStrings: (affixes: string, dictionary: string) => Promise<{
      testSpelling(word: string): boolean;
      dispose(): void;
    }>;
  };
  const spell = await wrapper.createHunspellFromStrings(affixes, dictionary);

  return {
    isValidGuess(value, puzzle) {
      return isValidPortugueseWord(value, puzzle, metadata, (word) => spell.testSpelling(word));
    },
    dispose() {
      spell.dispose();
    },
  };
}
