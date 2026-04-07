import fs from "fs";
import path from "path";

function writePatchedMarkdown(srcPath, outPath, deps) {
  const {
    patchMdx,
    patchMdxDeps,
    isQuarantinedSourceFile,
    writeQuarantinePlaceholder,
  } = deps;

  if (isQuarantinedSourceFile(srcPath)) {
    console.warn(`Quarantined source file: ${srcPath}`);
    writeQuarantinePlaceholder(outPath, srcPath);
    return;
  }

  const raw = fs.readFileSync(srcPath, "utf8");
  fs.writeFileSync(outPath, patchMdx(raw, srcPath, patchMdxDeps), "utf8");
}

function copyFileSafe(srcPath, outPath) {
  try {
    fs.copyFileSync(srcPath, outPath);
  } catch (err) {
    if (err && err.code === "ENOENT") {
      console.warn(`Skipping missing file during copy: ${srcPath}`);
      return;
    }
    throw err;
  }
}

function copyNode(srcPath, outPath, deps) {
  const { ensureDir } = deps;
  let stat = null;
  try {
    stat = fs.statSync(srcPath);
  } catch {
    console.warn(`Skipping unreadable path: ${srcPath}`);
    return;
  }

  if (stat.isDirectory()) {
    ensureDir(outPath);
    for (const entry of fs.readdirSync(srcPath, { withFileTypes: true })) {
      copyNode(path.join(srcPath, entry.name), path.join(outPath, entry.name), deps);
    }
    return;
  }

  const ext = path.extname(srcPath).toLowerCase();
  if (ext === ".md" || ext === ".mdx") {
    writePatchedMarkdown(srcPath, outPath, deps);
    return;
  }

  copyFileSafe(srcPath, outPath);
}

export function syncSourceToOutput(srcRoot, outRoot, deps) {
  const { removePathSafe } = deps;
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    const srcPath = path.join(srcRoot, entry.name);
    const outPath = path.join(outRoot, entry.name);
    removePathSafe(outPath);
    copyNode(srcPath, outPath, deps);
  }
}
