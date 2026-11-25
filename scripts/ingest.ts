/**
 * Downloads each official rulebook, extracts its text and splits it into
 * searchable rule chunks in data/rules/<sport>.json.
 *
 *   npm run ingest                 # all sports
 *   npm run ingest -- soccer       # one sport
 *   npm run ingest -- --offline    # reuse PDFs already in data/raw/
 *   npm run ingest -- --dry-run    # don't write data/rules/
 *
 * Needs `pdftotext` (poppler-utils) on the PATH.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SPORTS, type SourceDoc } from "../lib/sources.ts";
import { splitRulebook } from "../lib/split.ts";
import type { RuleChunk, SportIndexFile } from "../lib/types.ts";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const dryRun = args.includes("--dry-run");
const only = args.filter((a) => !a.startsWith("--"));
const RAW = "data/raw";
const OUT = "data/rules";
mkdirSync(RAW, { recursive: true });
mkdirSync(OUT, { recursive: true });

async function download(doc: SourceDoc, file: string): Promise<{ bytes: Buffer; url: string }> {
  if (offline) {
    if (!existsSync(file)) throw new Error(`--offline but ${file} is missing`);
    return { bytes: readFileSync(file), url: doc.urls[0] };
  }
  const errors: string[] = [];
  for (const url of doc.urls) {
    try {
      const res = await fetch(url, {
        redirect: "follow",
        headers: { "user-agent": "Mozilla/5.0 (compatible; sports-rules-ingest/0.1)" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error(`not a PDF (${res.headers.get("content-type")})`);
      writeFileSync(file, bytes);
      return { bytes, url };
    } catch (e) {
      errors.push(`${url}: ${(e as Error).message}`);
    }
  }
  throw new Error(`could not download "${doc.name}":\n  ${errors.join("\n  ")}`);
}

function pdfPages(file: string): string[] {
  const text = execFileSync("pdftotext", ["-enc", "UTF-8", file, "-"], { maxBuffer: 256 * 1024 * 1024 }).toString("utf8");
  const pages = text.split("\f");
  if (pages.at(-1)?.trim() === "") pages.pop();
  return pages;
}

let failures = 0;
for (const sport of SPORTS) {
  if (only.length && !only.includes(sport.id)) continue;
  console.log(`\n== ${sport.name}`);
  const outFile = path.join(OUT, `${sport.id}.json`);
  const previous: SportIndexFile | null = existsSync(outFile) ? JSON.parse(readFileSync(outFile, "utf8")) : null;
  const documents: SportIndexFile["documents"] = [];
  const chunks: RuleChunk[] = [];

  for (const [i, doc] of sport.docs.entries()) {
    const file = path.join(RAW, `${sport.id}-${i}.pdf`);
    try {
      const { bytes, url } = await download(doc, file);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const pages = pdfPages(file);
      const res = splitRulebook({
        sport: sport.id,
        source: doc.name,
        kind: doc.kind,
        headings: doc.headings,
        pages,
        firstPage: doc.firstPage,
      });
      documents.push({ source: doc.name, kind: doc.kind, url, sha256, pages: pages.length });
      chunks.push(...res.chunks);
      console.log(`  ${doc.name}: ${pages.length} pages, ${res.rulesFound} rule headings, ${res.chunks.length} chunks${res.usedFallback ? " (FALLBACK: page chunks, heading patterns need tuning)" : ""}`);
      console.log(`  refs: ${[...new Set(res.chunks.map((c) => c.ref))].slice(0, 25).join(", ")}`);
      if (res.usedFallback || process.env.INGEST_DEBUG) {
        const mid = Math.floor(pages.length / 2);
        console.log(`  --- sample text, page ${mid + 1} ---\n${pages[mid].split("\n").slice(0, 60).map((l) => `  | ${l}`).join("\n")}`);
      }
    } catch (e) {
      failures++;
      console.error(`  ERROR ${(e as Error).message}`);
    }
  }

  if (!documents.length) continue;
  const unchanged =
    previous &&
    previous.documents.length === documents.length &&
    previous.documents.every((d, i) => d.sha256 === documents[i].sha256) &&
    previous.chunks.length === chunks.length;
  if (unchanged) {
    console.log("  unchanged since last ingest");
    continue;
  }
  if (dryRun) continue;
  const index: SportIndexFile = { sport: sport.id, generatedAt: new Date().toISOString(), documents, chunks };
  writeFileSync(outFile, JSON.stringify(index, null, 1));
  console.log(`  wrote ${outFile}`);
}

if (failures) {
  console.error(`\n${failures} document(s) failed`);
  process.exitCode = 1;
}
