const { copyFileSync, existsSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const source = join(root, "data", "avtolearn.sqlite");
const backupDir = join(root, "data", "backups");

if (!existsSync(source)) {
  console.error("Database not found:", source);
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = join(backupDir, `avtolearn-${stamp}.sqlite`);

copyFileSync(source, target);
console.log(`Backup created: ${target}`);
