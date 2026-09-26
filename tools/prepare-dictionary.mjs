import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dictionaryRoot = resolve(root, "node_modules/dictionary-pt");
const hunspellRoot = resolve(root, "node_modules/hunspell-wasm");
const outputData = resolve(root, "public/data");
const outputVendor = resolve(root, "public/vendor");
const outputHunspell = resolve(outputVendor, "hunspell-wrapper");
const outputHunspellDist = resolve(outputHunspell, "dist");
const outputHunspellWasm = resolve(outputHunspell, "wasm");
const outputLicenses = resolve(root, "public/licenses");

function foldWord(value) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9-]/g, "");
}

async function writeGzip(path, value) {
  const chunks = [];
  const stream = createGzip({ level: 9 });
  stream.on("data", (chunk) => chunks.push(chunk));
  const finished = new Promise((resolvePromise, reject) => {
    stream.on("error", reject);
    stream.on("end", () => resolvePromise(Buffer.concat(chunks)));
  });
  stream.end(Buffer.from(value));
  await writeFile(path, await finished);
}

await Promise.all([
  mkdir(outputData, { recursive: true }),
  mkdir(outputHunspellDist, { recursive: true }),
  mkdir(outputHunspellWasm, { recursive: true }),
  mkdir(outputLicenses, { recursive: true }),
]);

const [aff, dic] = await Promise.all([
  readFile(resolve(dictionaryRoot, "index.aff")),
  readFile(resolve(dictionaryRoot, "index.dic")),
]);
const lines = dic.toString("utf8").split(/\r?\n/).slice(1).filter(Boolean);
const words = lines.map((line) => line.split("/", 1)[0]).filter(Boolean);
const dictionaryWords = new Set(words);
const properNames = new Set();
const hyphenated = new Set();
const accentVariants = new Map();

for (const word of words) {
  const lowercase = word.toLocaleLowerCase("pt-BR");
  const folded = foldWord(word);
  if (!folded) continue;
  if (/\p{Lu}/u.test(word) && !dictionaryWords.has(lowercase)) properNames.add(folded);
  if (word.includes("-")) hyphenated.add(folded);
  const unaccented = lowercase.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (unaccented !== lowercase) {
    const variants = accentVariants.get(folded) ?? new Set();
    variants.add(lowercase);
    accentVariants.set(folded, variants);
  }
}

const metadata = JSON.stringify({
  properNames: [...properNames],
  hyphenated: [...hyphenated],
  accentVariants: [...accentVariants].map(([word, variants]) => [word, [...variants]]),
});

await Promise.all([
  writeGzip(resolve(outputData, "pt-br.aff.gz"), aff),
  writeGzip(resolve(outputData, "pt-br.dic.gz"), dic),
  writeGzip(resolve(outputData, "pt-br-meta.json.gz"), metadata),
  ...["Hunspell.js", "Utilities.js", "WasmMemoryManager.js", "Utf8.js", "TypedArray.js"].map((file) =>
    copyFile(resolve(hunspellRoot, "dist", file), resolve(outputHunspellDist, file))),
  copyFile(resolve(hunspellRoot, "wasm/hunspell.js"), resolve(outputHunspellWasm, "hunspell.js")),
  copyFile(resolve(hunspellRoot, "wasm/hunspell.wasm"), resolve(outputHunspellWasm, "hunspell.wasm")),
  writeFile(resolve(outputLicenses, "third-party-notices.txt"), [
    "ECO incorpora e redistribui estes componentes e dados:",
    "",
    "Dicionário português (pt) do projeto wooorm/dictionaries, gerado a partir de LibreOffice/dictionaries (VERO).",
    "Licença dos dados: LGPL-3.0 OU MPL-2.0. Créditos: Raimundo Moura e colaboradores do VERO.",
    "Fontes: https://github.com/wooorm/dictionaries/tree/main/dictionaries/pt e https://github.com/LibreOffice/dictionaries/tree/master/pt_BR",
    "",
    "Hunspell WebAssembly (hunspell-wasm). Licença: LGPL-2.0 OU GPL-2.0 OU MPL-1.1.",
    "Fonte: https://github.com/rotemdan/hunspell-wasm",
    "",
    "ConceptNet 5.7.0. Dados sob CC BY-SA 4.0. Fonte: https://conceptnet.io/",
  ].join("\n"), "utf8"),
]);

console.log(`Dicionário pt-BR preparado (${words.length.toLocaleString("pt-BR")} entradas-base).`);
