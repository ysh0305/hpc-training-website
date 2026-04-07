import fs from "fs";
import { execSync } from "child_process";

export function sh(cmd, opts = {}) {
  return execSync(cmd, { encoding: "utf8", stdio: "pipe", ...opts }).trim();
}

export function shInherit(cmd, opts = {}) {
  execSync(cmd, { stdio: "inherit", ...opts });
}

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
