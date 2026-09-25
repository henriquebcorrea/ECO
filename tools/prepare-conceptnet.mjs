import { createReadStream, createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createGunzip, createGzip } from "node:zlib";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const input = resolve(process.argv[2] ?? "data/conceptnet-assertions-5.7.0.csv.gz");
const output = resolve(process.argv[3] ?? "public/data/conceptnet-pt.json.gz");

const relations = new Map([
  ["/r/AtLocation", "fica em"],
  ["/r/CapableOf", "pode"],
  ["/r/Causes", "causa"],
  ["/r/HasA", "tem"],
  ["/r/HasProperty", "tem como característica"],
  ["/r/HasPrerequisite", "depende de"],
  ["/r/IsA", "é um tipo de"],
  ["/r/MadeOf", "é feito de"],
  ["/r/PartOf", "faz parte de"],
  ["/r/ReceivesAction", "recebe"],
  ["/r/RelatedTo", "tem relação com"],
  ["/r/SimilarTo", "é semelhante a"],
  ["/r/Synonym", "é sinônimo de"],
  ["/r/Antonym", "é o oposto de"],
  ["/r/UsedFor", "serve para"],
]);

function normalize(value) {
  return value
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ");
}

function conceptFromUri(uri) {
  const parts = uri.split("/").slice(3);
  if (["n", "v", "a", "r"].includes(parts.at(-1))) parts.pop();
  try {
    return normalize(decodeURIComponent(parts.join("/")));
  } catch {
    return normalize(parts.join("/"));
  }
}

const uniqueEdges = new Map();
let scanned = 0;
let portugueseEdges = 0;
const stream = createReadStream(input).pipe(createGunzip());
const lines = createInterface({ input: stream, crlfDelay: Infinity });

for await (const line of lines) {
  scanned += 1;
  if (!line.includes("/c/pt/")) continue;
  const fields = line.split("\t");
  if (fields.length < 5) continue;
  const label = relations.get(fields[1]);
  if (!label || !fields[2].startsWith("/c/pt/") || !fields[3].startsWith("/c/pt/")) continue;

  let weight = 1;
  try {
    weight = JSON.parse(fields[4]).weight ?? 1;
  } catch {
    continue;
  }
  if (weight < 1) continue;

  const from = conceptFromUri(fields[2]);
  const to = conceptFromUri(fields[3]);
  if (!from || !to || from === to) continue;
  uniqueEdges.set(`${from}\t${to}\t${label}`, [from, to, label]);
  portugueseEdges += 1;
}

const edges = [...uniqueEdges.values()].sort((left, right) =>
  left[0].localeCompare(right[0], "pt-BR")
  || left[1].localeCompare(right[1], "pt-BR")
  || left[2].localeCompare(right[2], "pt-BR"),
);
const payload = JSON.stringify({
  source: "ConceptNet 5.7.0",
  license: "CC BY-SA 4.0",
  edges,
});

await mkdir(dirname(output), { recursive: true });
await pipeline(
  Readable.from([payload]),
  createGzip({ level: 9 }),
  createWriteStream(output),
);

console.log(`Linhas percorridas: ${scanned.toLocaleString("pt-BR")}`);
console.log(`Arestas PT filtradas: ${portugueseEdges.toLocaleString("pt-BR")}`);
console.log(`Arestas únicas: ${edges.length.toLocaleString("pt-BR")}`);
console.log(`Saída: ${output}`);
