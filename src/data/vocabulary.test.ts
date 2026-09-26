import { afterAll, beforeAll, describe, expect, it } from "vitest";
import pt from "dictionary-pt";
import { createHunspellFromStrings, type Hunspell } from "hunspell-wasm";
import { puzzles } from "./puzzles";
import { isValidPortugueseWord, type VocabularyMetadata } from "./vocabulary";

let spell: Hunspell;

beforeAll(async () => {
  spell = await createHunspellFromStrings(pt.aff.toString(), pt.dic.toString());
});

afterAll(() => {
  spell?.dispose();
});

describe("dicionário pt-BR offline", () => {
  it("reconhece grafia, acentos e flexões e rejeita termos inventados", () => {
    expect(spell.testSpelling("casa")).toBe(true);
    expect(spell.testSpelling("CASA")).toBe(true);
    expect(spell.testSpelling("casas")).toBe(true);
    expect(spell.testSpelling("água")).toBe(true);
    expect(spell.testSpelling("agua")).toBe(false);
    expect(spell.testSpelling("xqzqplm")).toBe(false);
    expect(spell.testSpelling("casa grande")).toBe(false);
  });

  it("aplica a regra de uma palavra, nomes próprios e compostos listados", () => {
    const metadata: VocabularyMetadata = {
      properNames: ["henrique"],
      hyphenated: ["a-historico"],
      accentVariants: [],
    };
    const check = (word: string) => spell.testSpelling(word);

    expect(isValidPortugueseWord("CASA", puzzles[0], metadata, check)).toBe(true);
    expect(isValidPortugueseWord("Henrique", puzzles[0], metadata, check)).toBe(false);
    expect(isValidPortugueseWord("casa grande", puzzles[0], metadata, check)).toBe(false);
    expect(isValidPortugueseWord("a-histórico", puzzles[0], metadata, check)).toBe(true);
    expect(isValidPortugueseWord("guarda-chuva", puzzles[0], metadata, check)).toBe(false);
    expect(isValidPortugueseWord("guarda-sol", puzzles[0], metadata, check)).toBe(false);
    expect(isValidPortugueseWord("Marte", puzzles[0], metadata, check)).toBe(true);
  });
});
