import fs from "node:fs";
import path from "node:path";
export function provisionAuthentication(record, directory = "/run/presenton") {
  if (typeof record !== "string" || !/^[A-Za-z0-9_.-]{1,64}:\$6\$(?:rounds=[0-9]+\$)?[A-Za-z0-9./]{1,16}\$[A-Za-z0-9./]{86}$/.test(record)) {
    throw new Error("PRESENTON_HTPASSWD must contain one valid SHA-512 crypt administrator record");
  }
  fs.mkdirSync(directory, { recursive: true, mode: 0o755 });
  fs.writeFileSync(path.join(directory, "htpasswd"), record + "\n", { mode: 0o644 });
}
