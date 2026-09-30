import fs from "node:fs";
import path from "node:path";

// Previews need extracted text, never configuration or application files.
export function readDocumentText(filePath: unknown, tempDirectory: string): string {
  if (typeof filePath !== "string" || !path.isAbsolute(filePath) || filePath.includes("\0")) {
    throw new Error("Invalid document path");
  }
  const root = fs.realpathSync(tempDirectory);
  if (root === path.parse(root).root || root === "/tmp" || root === "/private/tmp") {
    throw new Error("A dedicated document directory is required");
  }
  const resolved = fs.realpathSync(filePath);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)
      || path.extname(resolved).toLowerCase() !== ".txt") {
    throw new Error("Document path is not allowed");
  }
  const fd = fs.openSync(resolved, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 2 * 1024 * 1024) throw new Error("Invalid document size");
    return fs.readFileSync(fd, "utf8");
  } finally {
    fs.closeSync(fd);
  }
}
