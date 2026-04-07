import path from "path";
import { fixFileSpecificLinks } from "./link-fixes.mjs";
import { toTitleFromFolder } from "./naming.mjs";
import {
  getAttr,
  hasResolvableLocalImage,
  htmlTagSetHas,
  resolveImageSrc,
  stripTags,
  toBlockquote,
} from "./mdx-utils.mjs";

function setOrInsertFrontmatterField(text, key, valueLiteral) {
  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const body = fmMatch[2];
    const keyRe = new RegExp(`^${key}\\s*:.*$`, "m");
    const newFm = keyRe.test(fm)
      ? fm.replace(keyRe, `${key}: ${valueLiteral}`)
      : `${fm.trimEnd()}\n${key}: ${valueLiteral}\n`;
    return `---\n${newFm}---\n${body}`;
  }
  return `---\n${key}: ${valueLiteral}\n---\n${text}`;
}

function applyRepoSidebar(text, sourcePath = "", deps) {
  const { getRepoNameFromSourcePath, toSidebarId } = deps;
  const repoName = getRepoNameFromSourcePath(sourcePath);
  if (!repoName) return text;
  return setOrInsertFrontmatterField(text, "displayed_sidebar", JSON.stringify(toSidebarId(repoName)));
}

function addFrontmatterTitle(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) return text;

  const fm = m[1];
  const body = m[2];

  if (!/^[A-Za-z0-9_-]+\s*:/m.test(fm)) return text;
  if (/^title\s*:/m.test(fm)) return text;

  const h1m = body.match(/^\s*#\s+(.+)\s*$/m);
  if (!h1m) return text;

  let title = h1m[1].trim();
  const link = title.match(/^\[([^\]]+)\]\([^)]+\)$/);
  if (link) title = link[1].trim();

  const newFm = `${fm.trimEnd()}\ntitle: ${JSON.stringify(title)}\n`;
  return `---\n${newFm}---\n${body}`;
}

function addReadmeFolderTitle(text, sourcePath = "") {
  const base = path.basename(sourcePath || "").toLowerCase();
  if (base !== "readme.md" && base !== "readme.mdx") return text;

  const folder = path.basename(path.dirname(sourcePath || ""));
  const folderTitle = toTitleFromFolder(folder || "README");
  if (!folderTitle) return text;

  const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (fmMatch) {
    const fm = fmMatch[1];
    const body = fmMatch[2];
    if (/^title\s*:/m.test(fm)) return text;
    return `---\n${fm.trimEnd()}\ntitle: ${JSON.stringify(folderTitle)}\n---\n${body}`;
  }

  return `---\ntitle: ${JSON.stringify(folderTitle)}\n---\n${text}`;
}

export function patchMdx(text, sourcePath = "", deps) {
  const {
    SRC,
    getRepoMetaForSourcePath,
    getRepoNameFromSourcePath,
    injectSourceBanner,
    toSidebarId,
  } = deps;

  const fileDir = sourcePath ? path.dirname(sourcePath) : process.cwd();

  text = addReadmeFolderTitle(text, sourcePath);
  text = addFrontmatterTitle(text);
  text = applyRepoSidebar(text, sourcePath, { getRepoNameFromSourcePath, toSidebarId });

  let out = text
    .replace(/https:\/\/github\.com:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+(?:\.git)?)/g, "https://github.com/$1/$2")
    .replace(/<((?:https?|ftp):\/\/[^>\s]+)>/gi, "[$1]($1)")
    .replaceAll("geting-started-exp-port-authentication.png", "expanse-portal-authentication.png")
    .replace(/\[([^\]]+)\]\(\s*\)/g, "$1")
    .replace(/^[ \t]*(#{1,6}[ \t]+.*?)\s*<a\s+name=\"([^\"]+)\"\s*>(?:\s*<\/a>)?[ \t]*$/gim, "$1 {#$2}")
    .replace(/^[ \t]*(#{1,6}[ \t]*)<a\s+name=\"([^\"]+)\"\s*>(?:\s*<\/a>)?[ \t]*(.*?)[ \t]*$/gim, "$1$3 {#$2}")
    .replace(/^[ \t]*\*\*([^*]+)\*\*[ \t]*<a\s+name=\"([^\"]+)\"\s*>(?:\s*<\/a>)?[ \t]*$/gim, "### $1 {#$2}")
    .replace(/^[ \t]*\*\*([^*]+)\*\*[ \t]*(\([^)]+\))[ \t]*<a\s+name=\"([^\"]+)\"\s*>(?:\s*<\/a>)?[ \t]*$/gim, "### $1 $2 {#$3}")
    .replace(/^<a\s+name=\"([^\"]+)\"\s*>(?:\s*<\/a>)?\s*([^\n]+)$/gim, "## $2 {#$1}")
    .replace(/<a\s+href=\"([^\"]+)\"[^>]*>\s*([\s\S]*?)(?:<\/a>|(?=\n|$))/gi, "[$2]($1)")
    .replace(/\]\(module-commands\)/gi, "](#module-commands)")
    .replace(/<\/?a\b[^>]*>/gi, "")
    .replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_, level, content) => {
      const hashes = "#".repeat(Number(level));
      const clean = stripTags(content);
      return `\n${hashes} ${clean}\n`;
    })
    .replace(/<img\b([^>]*)\/?>/gi, (match, attrs) => {
      const originalSrc = getAttr(attrs, "src");
      const src = resolveImageSrc(originalSrc, fileDir);
      if (!hasResolvableLocalImage(src, fileDir)) return match;
      if (!src) return "";
      const alt = getAttr(attrs, "alt");
      const title = getAttr(attrs, "title");
      const titlePart = title ? ` \"${title}\"` : "";
      return `![${alt}](${src}${titlePart})`;
    })
    .replace(/<p\b[^>]*>([\s\S]*?)<\/p>/gi, "\n$1\n")
    .replace(/<div\b[^>]*>([\s\S]*?)<\/div>/gi, "\n$1\n")
    .replace(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi, (_, body) => `\n${toBlockquote(stripTags(body))}\n`)
    .replace(/<li\b[^>]*>([\s\S]*?)<\/li>/gi, (_, body) => `\n- ${stripTags(body)}`)
    .replace(/<\/?(ul|ol)\b[^>]*>/gi, "")
    .replace(/<pre\b[^>]*>\s*(?:<code\b[^>]*>)?([\s\S]*?)(?:<\/code>)?\s*<\/pre>/gi, (_, body) => `\n\`\`\`\n${body.trim()}\n\`\`\`\n`)
    .replaceAll("<hr>", "---\n")
    .replaceAll("<hr/>", "<hr />")
    .replaceAll("<hr />", "---\n")
    .replaceAll("<br>", "<br />")
    .replaceAll("<br/>", "  \n")
    .replaceAll("<br />", "  \n")
    .replaceAll("</br>", "  \n")
    .replace(/<([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})>/gi, "[$1](mailto:$1)")
    .replace(/^Note:\s*(.+)$/gim, ":::note\n$1\n:::")
    .replace(/\sstyle=\"[^\"]*\"/gi, "")
    .replace(/<b>(.*?)<\/b>/gi, "**$1**")
    .replace(/<\/?b>/gi, "")
    .replace(/<em>(.*?)<\/em>/gi, "*$1*")
    .replace(/<\/?em>/gi, "")
    .replace(/^(#{1,6})\s+(.*?)(?:#+\s*)?(\{#[^}]+\})?\s*$/gm, "$1 $2$3")
    .replace(/\[\s*\[\s*Back to[^\n]*$/gim, "")
    .replace(/\[\s*Back to[^\n]*$/gim, "")
    .replace(/<(?=#)/g, "&lt;")
    .replace(/\(#([^)#\s]*?)%22\)/gi, "(#$1)")
    .replace(/\]\(#([^\)\s\"]+)\"\)/gi, "](#$1)")
    .replace(/\(#([^)#\s]*?)\"\)/gi, "(#$1)")
    .replace(/<<\s*([^<>]+?)\s*>>|<([a-z][^<>]*?)>/gi, (match, p1, p2) => {
      const candidate = (p1 || p2 || "").trim();
      if (!candidate) return match;
      if (p1) return `\`${candidate}\``;
      if (candidate.startsWith("/") || /[=\"'\/]/.test(candidate)) return match;
      const tagName = candidate.split(/\s+/)[0].toLowerCase();
      if (htmlTagSetHas(tagName)) return match;
      return `\`${candidate}\``;
    });

  out = out.replace(
    /<div\s+id=['\"]([^'\"]+)['\"]\s*\/>\s*(?:\r?\n\s*)+(#{1,6}\s+[^\n]+)/gi,
    (_, id, heading) => `${heading} {#${id}}`
  );
  out = out.replace(/<div\s+id=['\"]([^'\"]+)['\"]\s*\/>/gi, '<a id="$1"></a>');

  out = fixFileSpecificLinks(out, sourcePath, { SRC, getRepoMetaForSourcePath });
  out = injectSourceBanner(out, sourcePath);

  return out;
}
