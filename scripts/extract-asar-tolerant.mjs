#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { getRawHeader } from "@electron/asar";

function usage() {
  console.error("Usage: node scripts/extract-asar-tolerant.mjs <app.asar> <dest>");
  process.exit(1);
}

const [archivePath, dest] = process.argv.slice(2);
if (!archivePath || !dest) usage();

const archive = path.resolve(archivePath);
const destination = path.resolve(dest);
const unpackedRoot = `${archive}.unpacked`;
const { header, headerSize } = getRawHeader(archive);
const dataStart = 8 + headerSize;
const archiveFd = fs.openSync(archive, "r");
let missingUnpacked = 0;

function ensureInside(root, target) {
  const relative = path.relative(root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to write outside destination: ${target}`);
  }
}

function ensureParent(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function extractFile(relativePath, entry) {
  const destPath = path.join(destination, relativePath);
  ensureInside(destination, destPath);
  ensureParent(destPath);

  if (entry.unpacked) {
    const src = path.join(unpackedRoot, relativePath);
    if (!fs.existsSync(src)) {
      missingUnpacked++;
      console.warn(`[warn] missing unpacked file skipped: ${relativePath}`);
      return;
    }
    fs.copyFileSync(src, destPath);
  } else if (!entry.size) {
    fs.writeFileSync(destPath, Buffer.alloc(0));
  } else {
    const buffer = Buffer.alloc(entry.size);
    fs.readSync(archiveFd, buffer, 0, entry.size, dataStart + Number(entry.offset));
    fs.writeFileSync(destPath, buffer);
  }

  if (entry.executable) {
    try {
      fs.chmodSync(destPath, 0o755);
    } catch {
      // Best-effort on Windows.
    }
  }
}

function extractLink(relativePath, entry) {
  const destPath = path.join(destination, relativePath);
  const linkTarget = path.join(path.dirname(destPath), entry.link);
  ensureInside(destination, destPath);
  ensureParent(destPath);

  if (fs.existsSync(linkTarget) && fs.statSync(linkTarget).isFile()) {
    fs.copyFileSync(linkTarget, destPath);
    return;
  }

  try {
    fs.symlinkSync(entry.link, destPath);
  } catch {
    console.warn(`[warn] symlink skipped: ${relativePath} -> ${entry.link}`);
  }
}

function walk(node, parts = []) {
  if (node.files) {
    const dirPath = path.join(destination, ...parts);
    ensureInside(destination, dirPath);
    fs.mkdirSync(dirPath, { recursive: true });
    for (const [name, child] of Object.entries(node.files)) {
      walk(child, [...parts, name]);
    }
    return;
  }

  const relativePath = path.join(...parts);
  if (node.link) {
    extractLink(relativePath, node);
  } else {
    extractFile(relativePath, node);
  }
}

try {
  fs.mkdirSync(destination, { recursive: true });
  walk(header);
} finally {
  fs.closeSync(archiveFd);
}

if (missingUnpacked > 0) {
  console.warn(`[warn] skipped ${missingUnpacked} missing unpacked file(s)`);
}
