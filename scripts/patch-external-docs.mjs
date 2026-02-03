// scripts/patch-external-docs.mjs
// Copies docs from a submodule folder into a generated docs folder,
// patching MD/MDX to be MDX-safe, WITHOUT deleting the output root folder.

import fs from "fs";
import path from "path";

const SRC = path.resolve("docs_external"); // submodule path (read-only)
const OUT_ROOT = path.resolve("docs");     // stable output root (do NOT delete)

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function addFrontmatterTitle(text) {
  // Only operate on files that already have frontmatter
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/m);
  if (!m) return text;

  const fm = m[1];
  const body = m[2];

  // If title already exists, do nothing
  if (/^title\s*:/m.test(fm)) return text;

  // Find first H1
  const h1m = body.match(/^\s*#\s+(.+)\s*$/m);
  if (!h1m) return text;

  let title = h1m[1].trim();

  // If H1 is a markdown link, keep only the text: [Text](url) -> Text
  const link = title.match(/^\[([^\]]+)\]\([^)]+\)$/);
  if (link) title = link[1].trim();

  // Insert title into frontmatter (keep other keys)
  const newFm = fm.trimEnd() + `\ntitle: ${title}\n`;
  return `---\n${newFm}---\n${body}`;
}

function patchMdx(text) {
  // add title first (uses original H1 before any later normalization)
  text = addFrontmatterTitle(text);

  return text
    // Anchor at end of a heading line:
    // "## Title <a name="id">" -> "## Title {#id}"
    .replace(/^(#{1,6}\s+.*?)\s*<a\s+name="([^"]+)"\s*>\s*$/gm, "$1 {#$2}")

    // Legacy anchor-only line:
    // "<a name="top">Contents" -> "## Contents {#top}"
    .replace(/^<a\s+name="([^"]+)"\s*>\s*([^\n]+)$/gim, "## $2 {#$1}")

    // Convert HTML links to Markdown links (works for both closed and broken <a href>)
    // <a href="URL">Text</a>  OR  <a href="URL">Text  ->  [Text](URL)
    .replace(/<a\s+href="([^"]+)"[^>]*>\s*([\s\S]*?)(?:<\/a>|(?=\n|$))/gi, "[$2]($1)")

    // Remove any remaining <a ...> or </a>
    .replace(/<\/?a\b[^>]*>/gi, "")

    // MDX-safe tags
    .replaceAll("<hr>", "---\n")
    .replaceAll("<hr/>", "<hr />")
    .replaceAll("<br>", "<br />")

    // Email autolinks: <consult@sdsc.edu> -> [consult@sdsc.edu](mailto:consult@sdsc.edu)
    .replace(/<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>/gi, "[$1](mailto:$1)")

    // Convert "Note:" paragraphs to Docusaurus note admonitions
    .replace(/^Note:\s*(.+)$/gim, ":::note\n$1\n:::")

    // Remove inline style="..." (invalid in JSX)
    .replace(/\sstyle="[^"]*"/gi, "")

    // Convert placeholder syntax to inline code:
    // "<< module name >>" OR "<module name>" -> `module name`
    .replace(/<<\s*([^<>]+?)\s*>>|<([a-z][^<>]*?)>/gi, (_, p1, p2) => `\`${(p1 || p2).trim()}\``)

    // Convert <b>text</b> to **text**, remove stray tags
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<\/?b>/gi, "")

    // Convert <em>text</em> to *text*, remove stray tags
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<\/?em>/gi, "")

    // Normalize headings (remove extra trailing hashes, keep optional {#id})
    .replace(/^(#{1,6})\s+(.*?)(?:#+\s*)?(\{#[^}]+\})?\s*$/gm, "$1 $2$3")
    // Remove any "Back to ..." nav chunks, even if malformed (missing ] or ) )
    // Example: "[ [Back to Top](#top)" or "[ [Back to X](#y) ]"
    .replace(/\[\s*\[\s*Back to[^\n]*$/gim, "")
    .replace(/\[\s*Back to[^\n]*$/gim, "")
    ;
}

// Recursively copy + patch *.md/*.mdx only; other files copied as-is
function walkAndCopy(srcDir, outDir) {
  ensureDir(outDir);

  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const outPath = path.join(outDir, entry.name);

    if (entry.isDirectory()) {
      walkAndCopy(srcPath, outPath);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".md" || ext === ".mdx") {
      const raw = fs.readFileSync(srcPath, "utf8");
      fs.writeFileSync(outPath, patchMdx(raw), "utf8");
    } else {
      fs.copyFileSync(srcPath, outPath);
    }
  }
}

// Fail fast if submodule folder is missing/empty
if (!fs.existsSync(SRC) || fs.readdirSync(SRC).length === 0) {
  console.error(
    `ERROR: external docs not found or empty at ${SRC}\n` +
      `Run: git submodule update --init --recursive`
  );
  process.exit(1);
}

// Ensure output root exists (never delete this folder)
ensureDir(OUT_ROOT);

// Update only the content coming from the submodule:
// For each top-level entry in SRC, remove the corresponding entry in OUT_ROOT, then copy/patch it.
for (const entry of fs.readdirSync(SRC, { withFileTypes: true })) {
  const srcPath = path.join(SRC, entry.name);
  const outPath = path.join(OUT_ROOT, entry.name);

  // Remove only what we're about to replace (NOT the whole OUT_ROOT)
  fs.rmSync(outPath, { recursive: true, force: true });

  if (entry.isDirectory()) {
    walkAndCopy(srcPath, outPath);
  } else {
    const ext = path.extname(entry.name).toLowerCase();
    if (ext === ".md" || ext === ".mdx") {
      const raw = fs.readFileSync(srcPath, "utf8");
      fs.writeFileSync(outPath, patchMdx(raw), "utf8");
    } else {
      fs.copyFileSync(srcPath, outPath);
    }
  }
}

console.log(`Patched external docs: ${SRC} -> ${OUT_ROOT}`);
