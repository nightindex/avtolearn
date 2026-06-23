const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { mkdtempSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");

const root = resolve(__dirname, "..");
const serverPath = join(root, "server", "index.js");

function writeSiteData(dir) {
  const siteDataPath = join(dir, "site-data.json");
  writeFileSync(
    siteDataPath,
    JSON.stringify({
      brand: { name: "Test", subtitle: "", logo: "", hero: "" },
      lessons: [{ id: 1, sourceLessonId: 1, title: "Lesson", shortName: "L1", topicCount: 1 }],
      topics: [{ id: 1, lessonId: 1, title: "Topic", type: 1, questionCount: 1, contents: [] }],
      questions: [{
        id: 1,
        title: "Source Question",
        image: "",
        video: "",
        explanation: "",
        answers: [
          { id: 1, text: "Yes", correct: true },
          { id: 2, text: "No", correct: false },
        ],
      }],
      tests: [{ id: 1, name: "Template", questions: 1, durationMinutes: 1, bestPercent: 0 }],
      templateQuestions: [{ templateId: 1, questionIds: [1] }],
      signs: [],
      roadSigns: [],
      penalties: [],
      penaltyInfo: {},
    }),
  );
  return siteDataPath;
}

function importServer(env) {
  execFileSync(
    process.execPath,
    ["--input-type=module", "--eval", `await import(${JSON.stringify(`file:///${serverPath.replaceAll("\\", "/")}`)});`],
    {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "test",
        SESSION_SECRET: "test-secret",
        ...env,
      },
      stdio: "pipe",
    },
  );
}

function questionTitle(dbPath) {
  const db = new DatabaseSync(dbPath);
  try {
    return db.prepare("SELECT title FROM questions WHERE id = 1").get().title;
  } finally {
    db.close();
  }
}

test("catalog import seeds empty databases but preserves admin edits on later startups", () => {
  const dir = mkdtempSync(join(tmpdir(), "avtolearn-startup-"));
  const dbPath = join(dir, "avtolearn.sqlite");
  const siteDataPath = writeSiteData(dir);
  const env = { DB_PATH: dbPath, SITE_DATA_PATH: siteDataPath };

  importServer(env);
  assert.equal(questionTitle(dbPath), "Source Question");

  const db = new DatabaseSync(dbPath);
  try {
    db.prepare("UPDATE questions SET title = ? WHERE id = 1").run("Admin Edited Question");
  } finally {
    db.close();
  }

  importServer(env);
  assert.equal(questionTitle(dbPath), "Admin Edited Question");

  importServer({ ...env, CATALOG_IMPORT_ON_START: "true" });
  assert.equal(questionTitle(dbPath), "Source Question");
});

test("fresh production databases require explicit bootstrap admin credentials", () => {
  const dir = mkdtempSync(join(tmpdir(), "avtolearn-prod-bootstrap-"));
  const dbPath = join(dir, "avtolearn.sqlite");
  const siteDataPath = writeSiteData(dir);

  assert.throws(
    () => importServer({
      DB_PATH: dbPath,
      SITE_DATA_PATH: siteDataPath,
      NODE_ENV: "production",
      SESSION_SECRET: "production-test-secret",
    }),
    /No users exist\. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD/,
  );
});
