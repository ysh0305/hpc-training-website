import fs from "fs";
import path from "path";

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

export function getAttr(attrs, name) {
  const re = new RegExp(`${name}\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')`, "i");
  const m = attrs.match(re);
  if (!m) return "";
  return (m[1] ?? m[2] ?? "").trim();
}

export function stripTags(text) {
  return text.replace(/<\/?[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

export function toBlockquote(text) {
  return text
    .trim()
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
}

export function isRemoteUrl(src) {
  return /^(https?:)?\/\//i.test(src) || src.startsWith("data:");
}

export function resolveImageSrc(src, fileDir) {
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

export function hasResolvableLocalImage(src, fileDir) {
  if (!src) return false;
  if (isRemoteUrl(src) || src.startsWith("/")) return true;
  return fs.existsSync(path.resolve(fileDir, src));
}

export function htmlTagSetHas(tagName) {
  return HTML_TAGS.has(String(tagName || "").toLowerCase());
}
