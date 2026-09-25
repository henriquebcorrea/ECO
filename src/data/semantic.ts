import type { SemanticEdge } from "../game";

interface SemanticPayload {
  source?: string;
  license?: string;
  edges?: unknown;
}

type CompactEdge = [string, string, string];

export async function loadSemanticEdges(): Promise<SemanticEdge[]> {
  try {
    const url = new URL(`${import.meta.env.BASE_URL}data/conceptnet-pt.json.gz`, window.location.href);
    const response = await fetch(url);
    if (!response.ok || !response.body) return [];

    let payload: SemanticPayload;
    if (response.headers.get("content-encoding")?.includes("gzip")) {
      payload = await response.json() as SemanticPayload;
    } else {
      if (!("DecompressionStream" in window)) return [];
      const decompressed = response.body.pipeThrough(new DecompressionStream("gzip"));
      payload = await new Response(decompressed).json() as SemanticPayload;
    }

    if (!Array.isArray(payload.edges)) return [];
    return (payload.edges as CompactEdge[])
      .filter((edge) => Array.isArray(edge)
        && edge.length === 3
        && edge.every((value) => typeof value === "string"))
      .map(([from, to, label]) => ({ from, to, label }));
  } catch {
    // O índice é um reforço local; as relações curadas seguem disponíveis se o asset falhar.
    return [];
  }
}
