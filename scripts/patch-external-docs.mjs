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
  // Only operate on files that begin with real frontmatter.
  // Do not treat in-body markdown separators (---) as frontmatter.
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return text;

  const fm = m[1];
  const body = m[2];

  // Require at least one frontmatter-like key to reduce false positives.
  if (!/^[A-Za-z0-9_-]+\s*:/m.test(fm)) return text;

  // If title already exists, do nothing
  if (/^title\s*:/m.test(fm)) return text;

  // Find first H1
  const h1m = body.match(/^\s*#\s+(.+)\s*$/m);
  if (!h1m) return text;

  let title = h1m[1].trim();

  // If H1 is a markdown link, keep only the text: [Text](url) -> Text
  const link = title.match(/^\[([^\]]+)\]\([^)]+\)$/);
  if (link) title = link[1].trim();

  // Insert title into frontmatter (quoted for YAML safety)
  const newFm = `${fm.trimEnd()}\ntitle: ${JSON.stringify(title)}\n`;
  return `---\n${newFm}---\n${body}`;
}

const HTML_TAGS = new Set([
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "strong",
  "table",
  "tbody",
  "td",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);

function getAttr(attrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i");
  const m = attrs.match(re);
  if (!m) return "";
  return (m[1] ?? m[2] ?? "").trim();
}

function stripTags(text) {
  return text.replace(/<\/?[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function toBlockquote(text) {
  return text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

function isRemoteUrl(src) {
  return /^(https?:)?\/\//i.test(src) || src.startsWith("data:");
}

function resolveImageSrc(src, fileDir) {
  if (!src || isRemoteUrl(src) || src.startsWith("/")) return src;

  const normalized = src.replace(/\\/g, "/");
  const candidates = [
    normalized,
    normalized.startsWith("./") ? normalized.slice(2) : `./${normalized}`,
    normalized.startsWith("./") ? normalized : `../${normalized}`,
    `../docs/${normalized}`,
    `../expanse-101/docs/${normalized}`,
    `../../docs/${normalized}`,
    `../../expanse-101/docs/${normalized}`,
  ];

  for (const rel of candidates) {
    const abs = path.resolve(fileDir, rel);
    if (fs.existsSync(abs)) {
      return rel.replace(/\\/g, "/");
    }
  }

  return normalized;
}

function hasResolvableLocalImage(src, fileDir) {
  if (!src) return false;
  if (isRemoteUrl(src) || src.startsWith("/")) return true;
  return fs.existsSync(path.resolve(fileDir, src));
}

function fixFileSpecificLinks(text, sourcePath) {
  const src = (sourcePath || "").replace(/\\/g, "/");

  function rewriteToSiblingDocs(input, slugs) {
    let out = input;
    for (const slug of slugs) {
      const escaped = slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      out = out.replace(new RegExp(`\\]\\(#${escaped}\\)`, "gi"), `](./${slug})`);
      out = out.replace(new RegExp(`\\]\\(${escaped}\\)`, "gi"), `](./${slug})`);
    }
    return out;
  }

  if (src.endsWith("/basic_skills/basic_linux_skills_expanse/basic_linux_skills_expanse.md")) {
    text = rewriteToSiblingDocs(text, [
      "basic-environment",
      "directories-navigation",
      "copying-directories",
      "manipulating-files",
      "permissions",
      "wildcards-utilities",
    ]);
  }

  if (src.endsWith("/basic_skills/interactive_computing/interactive_computing.md")) {
    text = rewriteToSiblingDocs(text, [
      "interactive-nodes",
      "interactive-node-command-line",
      "interactive-gpu-command-line",
    ]);
  }

  if (src.endsWith("/basic_skills/using_github/using_github.md")) {
    text = rewriteToSiblingDocs(text, [
      "create-github-account",
      "install-git",
      "using-git-at-sdsc",
    ]);
  }

  if (src.endsWith("/basic_skills/basic_linux_skills_expanse/directories-navigation.md")) {
    text = text.replace(/\]\(#permissions\)/gi, "](./permissions)");
  }

  return text;
}

function patchMdx(text, sourcePath = "") {
  const fileDir = sourcePath ? path.dirname(sourcePath) : process.cwd();

  // add title first (uses original H1 before any later normalization)
  text = addFrontmatterTitle(text);

  let out = text
    // Anchor at end of a heading line:
    // "## Title <a name="id"></a>" -> "## Title {#id}"
    .replace(/^(#{1,6}\s+.*?)\s*<a\s+name="([^"]+)"\s*>(?:\s*<\/a>)?\s*$/gim, "$1 {#$2}")

    // Anchor at beginning of heading line:
    // "## <a name="id"></a>Title" -> "## Title {#id}"
    .replace(/^(#{1,6}\s*)<a\s+name="([^"]+)"\s*>(?:\s*<\/a>)?\s*(.*?)\s*$/gim, "$1$3 {#$2}")

    // Legacy anchor-only line:
    // "<a name="top">Contents" -> "## Contents {#top}"
    .replace(/^<a\s+name="([^"]+)"\s*>(?:\s*<\/a>)?\s*([^\n]+)$/gim, "## $2 {#$1}")

    // Convert HTML links to Markdown links (works for both closed and broken <a href>)
    // <a href="URL">Text</a>  OR  <a href="URL">Text  ->  [Text](URL)
    .replace(/<a\s+href="([^"]+)"[^>]*>\s*([\s\S]*?)(?:<\/a>|(?=\n|$))/gi, "[$2]($1)")
    // Fix known bare same-page slug links in source docs.
    .replace(/\]\(module-commands\)/gi, "](#module-commands)")

    // Remove any remaining <a ...> or </a>
    .replace(/<\/?a\b[^>]*>/gi, "")

    // Headings: <h1>..</h1> -> # ..
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, content) => {
      const hashes = "#".repeat(Number(level));
      const clean = stripTags(content);
      return `\n${hashes} ${clean}\n`;
    })

    // Images: <img src="..." alt="..."> -> ![...](...)
    .replace(/<img\b([^>]*)\/?>/gi, (match, attrs) => {
      const originalSrc = getAttr(attrs, "src");
      const src = resolveImageSrc(originalSrc, fileDir);
      if (!hasResolvableLocalImage(src, fileDir)) return match;
      if (!src) return "";
      const alt = getAttr(attrs, "alt");
      const title = getAttr(attrs, "title");
      const titlePart = title ? ` "${title}"` : "";
      return `![${alt}](${src}${titlePart})`;
    })

    // Structural wrappers
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, "\n$1\n")
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, body) => `\n${toBlockquote(stripTags(body))}\n`)

    // Lists
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => `\n- ${stripTags(body)}`)
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, "")

    // Fenced code blocks
    .replace(/<pre\b[^>]*>\s*(?:<code\b[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi, (_, body) => `\n\`\`\`\n${body.trim()}\n\`\`\`\n`)

    // MDX-safe tags
    .replaceAll("<hr>", "---\n")
    .replaceAll("<hr/>", "<hr />")
    .replaceAll("<hr />", "---\n")
    .replaceAll("<br>", "<br />")
    .replaceAll("<br/>", "  \n")
    .replaceAll("<br />", "  \n")

    // Email autolinks: <consult@sdsc.edu> -> [consult@sdsc.edu](mailto:consult@sdsc.edu)
    .replace(/<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>/gi, "[$1](mailto:$1)")

    // Convert "Note:" paragraphs to Docusaurus note admonitions
    .replace(/^Note:\s*(.+)$/gim, ":::note\n$1\n:::")

    // Remove inline style="..." (invalid in JSX)
    .replace(/\sstyle="[^"]*"/gi, "")

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

    // Normalize malformed encoded/quoted anchors.
    .replace(/\(#([^)#\s]*?)%22\)/gi, "(#$1)")
    .replace(/\]\(#([^)\s"]+)"\)/gi, "](#$1)")
    .replace(/\(#([^)#\s]*?)"\)/gi, "(#$1)")

    // Convert placeholder syntax to inline code:
    // "<< module name >>" OR "<module name>" -> `module name`
    // Run this late so most HTML tags have already been converted first.
    .replace(/<<\s*([^<>]+?)\s*>>|<([a-z][^<>]*?)>/gi, (match, p1, p2) => {
      const candidate = (p1 || p2 || "").trim();
      if (!candidate) return match;

      // Always convert <<...>> placeholders.
      if (p1) return `\`${candidate}\``;

      // Skip anything that still looks like HTML.
      if (candidate.startsWith("/") || /[="'/]/.test(candidate)) return match;
      const tagName = candidate.split(/\s+/)[0].toLowerCase();
      if (HTML_TAGS.has(tagName)) return match;

      return `\`${candidate}\``;
    })
    ;

  // Promote self-closing div ids to heading ids when followed by a heading.
  // Example:
  // <div id='quickstart'/>
  // ## Quick Start
  // -> ## Quick Start {#quickstart}
  out = out.replace(
    /<div\s+id=['"]([^'"]+)['"]\s*\/>\s*(?:\r?\n\s*)+(#{1,6}\s+[^\n]+)/gi,
    (_, id, heading) => `${heading} {#${id}}`
  );

  // If any self-closing div id remains, keep it as explicit HTML anchor.
  out = out.replace(/<div\s+id=['"]([^'"]+)['"]\s*\/>/gi, '<a id="$1"></a>');

  out = fixFileSpecificLinks(out, sourcePath);

  return out;
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
      fs.writeFileSync(outPath, patchMdx(raw, srcPath), "utf8");
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
      fs.writeFileSync(outPath, patchMdx(raw, srcPath), "utf8");
    } else {
      fs.copyFileSync(srcPath, outPath);
    }
  }
}

console.log(`Patched external docs: ${SRC} -> ${OUT_ROOT}`);
