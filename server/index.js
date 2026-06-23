import { createServer } from "node:http";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
loadLocalEnv(join(root, ".env"));
const isProduction = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT || 5180);
const dataPath = process.env.SITE_DATA_PATH || join(root, "data", "site-data.json");
const dbPath = process.env.DB_PATH || join(root, "data", "avtolearn.sqlite");
const devBootstrapEmail = "i.muxtorov@avtolearn.uz";
const sessionCookie = "avtolearn_session";
const sessionDays = 14;
const maxJsonBodyBytes = Number(process.env.MAX_JSON_BODY_BYTES || 128 * 1024);
const aiTutorMaxMessageChars = Number(process.env.AI_TUTOR_MAX_MESSAGE_CHARS || 2500);
const aiTutorRateWindowMs = Number(process.env.AI_TUTOR_RATE_WINDOW_MS || 60 * 1000);
const aiTutorRateMax = Number(process.env.AI_TUTOR_RATE_MAX || 12);
const aiTutorDailyMax = Number(process.env.AI_TUTOR_DAILY_MAX || 200);
const aiTutorProviderTimeoutMs = Number(process.env.AI_TUTOR_PROVIDER_TIMEOUT_MS || 25 * 1000);
const aiHistoryRetentionDays = Number(process.env.AI_HISTORY_RETENTION_DAYS || 90);
const maxAvatarBytes = Number(process.env.MAX_AVATAR_BYTES || 2 * 1024 * 1024);
const siteData = JSON.parse(readFileSync(dataPath, "utf8"));
const aiTutorRateState = new Map();
let db;

if (isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET is required when NODE_ENV=production");
}

function loadLocalEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".mp4": "video/mp4",
  ".webp": "image/webp",
};

const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(self), microphone=(), geolocation=()",
};

const rolePermissions = {
  student: ["learner:read", "progress:write", "ai:use"],
  admin: [
    "learner:read",
    "progress:write",
    "ai:use",
    "admin:users",
    "admin:catalog",
    "admin:reports",
  ],
  super_admin: [
    "learner:read",
    "progress:write",
    "ai:use",
    "admin:users",
    "admin:catalog",
    "admin:reports",
    "admin:rbac",
  ],
};

const catalogResources = {
  lessons: {
    table: "lessons",
    id: "id",
    writable: ["source_lesson_id", "title", "short_name", "topic_count"],
    required: ["title", "short_name"],
    serialize: lessonRow,
    validate: (payload) => requireFields(payload, ["title", "shortName"]),
    toDb: (payload) => ({
      source_lesson_id: nullableNumber(payload.sourceLessonId),
      title: String(payload.title || ""),
      short_name: String(payload.shortName || ""),
      topic_count: nullableNumber(payload.topicCount),
    }),
  },
  topics: {
    table: "topics",
    id: "id",
    writable: ["lesson_id", "title", "type", "question_count", "time_limit"],
    required: ["title"],
    serialize: topicRow,
    validate: (payload) => requireFields(payload, ["title"]),
    toDb: (payload) => ({
      lesson_id: nullableNumber(payload.lessonId),
      title: String(payload.title || ""),
      type: Number(payload.type || 1),
      question_count: Number(payload.questionCount || 0),
      time_limit: nullableNumber(payload.timeLimit),
    }),
  },
  "topic-contents": {
    table: "topic_contents",
    id: "id",
    writable: ["topic_id", "type", "content"],
    required: ["topicId", "content"],
    serialize: topicContentRow,
    validate: (payload) => requireFields(payload, ["topicId", "content"]),
    toDb: (payload) => ({
      topic_id: Number(payload.topicId),
      type: Number(payload.type || 1),
      content: String(payload.content || ""),
    }),
  },
  questions: {
    table: "questions",
    id: "id",
    writable: ["title", "image", "video", "explanation"],
    required: ["title", "answers"],
    serialize: questionById,
    validate: validateQuestionPayload,
    customCreate: createQuestion,
    customUpdate: updateQuestion,
    customDelete: deleteQuestion,
  },
  templates: {
    table: "test_templates",
    id: "id",
    writable: ["name", "questions", "duration_minutes", "best_percent"],
    required: ["name"],
    serialize: templateRow,
    validate: (payload) => {
      requireFields(payload, ["name"]);
      if (payload.questions && Number(payload.questions) < 1) throw httpError(400, "questions must be positive");
    },
    toDb: (payload) => ({
      name: String(payload.name || ""),
      questions: Number(payload.questions || 20),
      duration_minutes: Number(payload.durationMinutes || 25),
      best_percent: Number(payload.bestPercent || 0),
    }),
  },
  "road-sign-categories": {
    table: "sign_categories",
    id: "id",
    writable: ["title", "code", "count", "image"],
    required: ["title", "code"],
    serialize: signCategoryRow,
    validate: (payload) => requireFields(payload, ["title", "code"]),
    toDb: (payload) => ({
      title: String(payload.title || ""),
      code: String(payload.code || ""),
      count: Number(payload.count || 0),
      image: String(payload.image || ""),
    }),
  },
  "road-signs": {
    table: "road_signs",
    id: "id",
    writable: ["type_id", "code", "title", "image", "description", "preview_images", "video", "audio"],
    required: ["typeId", "code", "title"],
    serialize: roadSignRow,
    validate: (payload) => requireFields(payload, ["typeId", "code", "title"]),
    toDb: (payload) => ({
      type_id: Number(payload.typeId),
      code: String(payload.code || ""),
      title: String(payload.title || ""),
      image: String(payload.image || ""),
      description: String(payload.description || ""),
      preview_images: JSON.stringify(payload.previewImages || []),
      video: String(payload.video || ""),
      audio: String(payload.audio || ""),
    }),
  },
  penalties: {
    table: "penalties",
    id: "id",
    writable: ["title", "description", "article", "amount", "bcv", "points"],
    required: ["title", "description"],
    serialize: penaltyRow,
    validate: (payload) => requireFields(payload, ["title", "description"]),
    toDb: (payload) => ({
      title: String(payload.title || ""),
      description: String(payload.description || ""),
      article: String(payload.article || ""),
      amount: String(payload.amount || ""),
      bcv: String(payload.bcv || ""),
      points: String(payload.points || ""),
    }),
  },
};

db = initDb();

function initDb() {
  mkdirSync(join(root, "data"), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  runMigrations(database);
  seedSecurity(database);
  if (shouldImportCatalog(database)) {
    importCatalog(database, siteData);
  }
  return database;
}

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);
  const migrations = [
    {
      version: 1,
      name: "platform_schema",
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS roles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS permissions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS role_permissions (
          role_id INTEGER NOT NULL,
          permission_id INTEGER NOT NULL,
          PRIMARY KEY (role_id, permission_id),
          FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
          FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS user_roles (
          user_id INTEGER NOT NULL,
          role_id INTEGER NOT NULL,
          PRIMARY KEY (user_id, role_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          used_at TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS brand (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          name TEXT NOT NULL,
          subtitle TEXT NOT NULL,
          logo TEXT NOT NULL,
          hero TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS lessons (
          id INTEGER PRIMARY KEY,
          source_lesson_id INTEGER,
          title TEXT NOT NULL,
          short_name TEXT NOT NULL,
          topic_count INTEGER DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS topics (
          id INTEGER PRIMARY KEY,
          lesson_id INTEGER,
          title TEXT NOT NULL,
          type INTEGER NOT NULL DEFAULT 1,
          question_count INTEGER NOT NULL DEFAULT 0,
          time_limit INTEGER,
          FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
        );
        CREATE TABLE IF NOT EXISTS topic_contents (
          id INTEGER PRIMARY KEY,
          topic_id INTEGER NOT NULL,
          type INTEGER NOT NULL,
          content TEXT NOT NULL,
          FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS questions (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          image TEXT NOT NULL DEFAULT '',
          video TEXT NOT NULL DEFAULT '',
          explanation TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS answers (
          id INTEGER PRIMARY KEY,
          question_id INTEGER NOT NULL,
          text TEXT NOT NULL,
          correct INTEGER NOT NULL DEFAULT 0,
          FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS test_templates (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          questions INTEGER NOT NULL DEFAULT 20,
          duration_minutes INTEGER NOT NULL DEFAULT 25,
          best_percent INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS template_questions (
          template_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (template_id, question_id),
          FOREIGN KEY (template_id) REFERENCES test_templates(id) ON DELETE CASCADE,
          FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS sign_categories (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          code TEXT NOT NULL,
          count INTEGER NOT NULL DEFAULT 0,
          image TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS road_signs (
          id INTEGER PRIMARY KEY,
          type_id INTEGER NOT NULL,
          code TEXT NOT NULL,
          title TEXT NOT NULL,
          image TEXT NOT NULL DEFAULT '',
          description TEXT NOT NULL DEFAULT '',
          preview_images TEXT NOT NULL DEFAULT '[]',
          video TEXT NOT NULL DEFAULT '',
          audio TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS penalties (
          id INTEGER PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT NOT NULL,
          article TEXT NOT NULL DEFAULT '',
          amount TEXT NOT NULL DEFAULT '',
          bcv TEXT NOT NULL DEFAULT '',
          points TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS penalty_info (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          source_url TEXT NOT NULL DEFAULT '',
          updated_label TEXT NOT NULL DEFAULT '',
          bcv_label TEXT NOT NULL DEFAULT '',
          summary TEXT NOT NULL DEFAULT '',
          points_summary TEXT NOT NULL DEFAULT '',
          points_rules TEXT NOT NULL DEFAULT '[]'
        );
        CREATE TABLE IF NOT EXISTS question_progress (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          question_id INTEGER NOT NULL,
          answer_id INTEGER,
          correct INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS saved_questions (
          user_id INTEGER,
          question_id INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, question_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS saved_templates (
          user_id INTEGER,
          template_id INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          PRIMARY KEY (user_id, template_id),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS test_attempts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          mode TEXT NOT NULL,
          score INTEGER NOT NULL,
          total INTEGER NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS ai_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER,
          message TEXT NOT NULL,
          answer TEXT NOT NULL,
          question_id INTEGER,
          model TEXT NOT NULL DEFAULT 'local',
          sources TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS ai_sessions (
          id TEXT PRIMARY KEY,
          user_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          question_id INTEGER,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS ai_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
          content TEXT NOT NULL,
          model TEXT NOT NULL DEFAULT '',
          sources TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL,
          FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
      `,
    },
    {
      version: 2,
      name: "compat_indexes",
      sql: `
        CREATE INDEX IF NOT EXISTS idx_questions_title ON questions(title);
        CREATE INDEX IF NOT EXISTS idx_topics_lesson ON topics(lesson_id);
        CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);
        CREATE INDEX IF NOT EXISTS idx_templates_name ON test_templates(name);
        CREATE INDEX IF NOT EXISTS idx_template_questions_template ON template_questions(template_id, position);
        CREATE INDEX IF NOT EXISTS idx_road_signs_type ON road_signs(type_id);
      `,
    },
    {
      version: 3,
      name: "template_question_mapping",
      sql: `
        CREATE TABLE IF NOT EXISTS template_questions (
          template_id INTEGER NOT NULL,
          question_id INTEGER NOT NULL,
          position INTEGER NOT NULL,
          PRIMARY KEY (template_id, question_id),
          FOREIGN KEY (template_id) REFERENCES test_templates(id) ON DELETE CASCADE,
          FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_template_questions_template ON template_questions(template_id, position);
        `,
    },
    {
      version: 4,
      name: "user_profile_settings",
      sql: "SELECT 1;",
    },
  ];

  for (const migration of migrations) {
    const exists = database.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(migration.version);
    if (exists) continue;
    database.exec(migration.sql);
    database.prepare("INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)").run(
      migration.version,
      migration.name,
      new Date().toISOString(),
    );
  }
  ensureColumn(database, "question_progress", "user_id", "INTEGER");
  ensureColumn(database, "saved_questions", "user_id", "INTEGER");
  ensureColumn(database, "saved_templates", "user_id", "INTEGER");
  ensureColumn(database, "test_attempts", "user_id", "INTEGER");
  ensureColumn(database, "ai_history", "user_id", "INTEGER");
  ensureColumn(database, "ai_history", "model", "TEXT NOT NULL DEFAULT 'local'");
  ensureColumn(database, "ai_history", "sources", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(database, "users", "avatar_url", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(database, "users", "avatar_color", "TEXT NOT NULL DEFAULT '#1477d4'");
  ensureColumn(database, "users", "avatar_size", "INTEGER NOT NULL DEFAULT 52");
  database.exec(`
    CREATE TABLE IF NOT EXISTS ai_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      question_id INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS ai_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      sources TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      FOREIGN KEY (session_id) REFERENCES ai_sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_ai_sessions_user_updated ON ai_sessions(user_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_ai_messages_session_created ON ai_messages(session_id, created_at);
  `);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_question_progress_user_created ON question_progress(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_test_attempts_user_created ON test_attempts(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_saved_questions_user ON saved_questions(user_id);
    CREATE INDEX IF NOT EXISTS idx_saved_templates_user ON saved_templates(user_id);
    CREATE INDEX IF NOT EXISTS idx_ai_history_user_created ON ai_history(user_id, created_at);
  `);
}

function ensureColumn(database, table, column, definition) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
  if (!columns.includes(column)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function seedSecurity(database) {
  for (const key of Object.keys(rolePermissions)) {
    database.prepare("INSERT OR IGNORE INTO roles (key, name) VALUES (?, ?)").run(key, titleCase(key));
  }
  const allPermissions = Array.from(new Set(Object.values(rolePermissions).flat()));
  for (const permission of allPermissions) {
    database.prepare("INSERT OR IGNORE INTO permissions (key, description) VALUES (?, ?)").run(permission, permission);
  }
  for (const [roleKey, permissions] of Object.entries(rolePermissions)) {
    const role = database.prepare("SELECT id FROM roles WHERE key = ?").get(roleKey);
    for (const permissionKey of permissions) {
      const permission = database.prepare("SELECT id FROM permissions WHERE key = ?").get(permissionKey);
      database.prepare("INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)").run(role.id, permission.id);
    }
  }

  const now = new Date().toISOString();
  const bootstrap = bootstrapAdminConfig(database);
  if (!bootstrap) return;

  const existing = database.prepare("SELECT id FROM users WHERE lower(email) = lower(?)").get(bootstrap.email);
  const userId = existing?.id || database
    .prepare("INSERT INTO users (email, name, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?) RETURNING id")
    .get(bootstrap.email, bootstrap.name, hashPassword(bootstrap.password), now, now).id;
  if (bootstrap.generated) {
    console.warn(`Generated development admin credentials: ${bootstrap.email} / ${bootstrap.password}`);
  }
  const superAdmin = database.prepare("SELECT id FROM roles WHERE key = 'super_admin'").get();
  database.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").run(userId, superAdmin.id);
  backfillAnonymousActivity(database, userId);
}

function bootstrapAdminConfig(database) {
  const userCount = database.prepare("SELECT COUNT(*) AS count FROM users").get().count || 0;
  const email = String(process.env.BOOTSTRAP_ADMIN_EMAIL || "").trim();
  const password = String(process.env.BOOTSTRAP_ADMIN_PASSWORD || "");
  const name = String(process.env.BOOTSTRAP_ADMIN_NAME || "Platform Administrator").trim();

  if (email || password) {
    if (!email || !password) throw new Error("Both BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD are required when bootstrapping an admin.");
    if (password.length < 12) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must contain at least 12 characters.");
    return { email, password, name: name || "Platform Administrator" };
  }

  if (userCount > 0) return null;
  if (isProduction) {
    throw new Error("No users exist. Set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD for first production startup.");
  }

  return {
    email: devBootstrapEmail,
    password: randomBytes(18).toString("base64url"),
    name: "I.MUXTOROV",
    generated: true,
  };
}

function shouldImportCatalog(database) {
  if (String(process.env.CATALOG_IMPORT_ON_START || "").toLowerCase() === "true") return true;
  const catalogTables = ["lessons", "topics", "questions", "test_templates", "sign_categories", "road_signs", "penalties"];
  return catalogTables.every((table) => (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count || 0) === 0);
}

function backfillAnonymousActivity(database, userId) {
  for (const table of ["question_progress", "saved_questions", "saved_templates", "test_attempts", "ai_history"]) {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name);
    if (columns.includes("user_id")) database.prepare(`UPDATE ${table} SET user_id = ? WHERE user_id IS NULL`).run(userId);
  }
}

function importCatalog(database, data) {
  database.exec("BEGIN");
  try {
    database.prepare("INSERT OR REPLACE INTO brand (id, name, subtitle, logo, hero) VALUES (1, ?, ?, ?, ?)").run(
      data.brand?.name || "AvtoLearn",
      data.brand?.subtitle || "",
      data.brand?.logo || "",
      data.brand?.hero || "",
    );
    for (const lesson of data.lessons || []) {
      database.prepare(
        "INSERT OR REPLACE INTO lessons (id, source_lesson_id, title, short_name, topic_count) VALUES (?, ?, ?, ?, ?)",
      ).run(lesson.id, lesson.sourceLessonId || null, lesson.title || "", lesson.shortName || "", lesson.topicCount || 0);
    }
    for (const topic of data.topics || []) {
      database.prepare(
        "INSERT OR REPLACE INTO topics (id, lesson_id, title, type, question_count, time_limit) VALUES (?, ?, ?, ?, ?, ?)",
      ).run(topic.id, topic.lessonId || null, topic.title || "", topic.type || 1, topic.questionCount || 0, topic.timeLimit || null);
      for (const content of topic.contents || []) {
        database.prepare("INSERT OR REPLACE INTO topic_contents (id, topic_id, type, content) VALUES (?, ?, ?, ?)").run(
          content.id,
          topic.id,
          content.type || 1,
          content.content || "",
        );
      }
    }
    database.prepare("DELETE FROM template_questions").run();
    database.prepare("DELETE FROM answers").run();
    database.prepare("DELETE FROM questions").run();
    database.prepare("DELETE FROM test_templates").run();
    for (const question of data.questions || []) {
      database.prepare("INSERT OR REPLACE INTO questions (id, title, image, video, explanation) VALUES (?, ?, ?, ?, ?)").run(
        question.id,
        question.title || "",
        question.image || "",
        question.video || "",
        question.explanation || "",
      );
      for (const answer of question.answers || []) {
        database.prepare("INSERT OR REPLACE INTO answers (id, question_id, text, correct) VALUES (?, ?, ?, ?)").run(
          answer.id,
          question.id,
          answer.text || "",
          answer.correct ? 1 : 0,
        );
      }
    }
    for (const template of data.tests || []) {
      database.prepare("INSERT OR REPLACE INTO test_templates (id, name, questions, duration_minutes, best_percent) VALUES (?, ?, ?, ?, ?)").run(
        template.id,
        template.name || `Variant ${template.id}`,
        template.questions || 20,
        template.durationMinutes || 25,
        template.bestPercent || 0,
      );
    }
    for (const mapping of data.templateQuestions || []) {
      const questionIds = mapping.questionIds || [];
      for (let index = 0; index < questionIds.length; index += 1) {
        database.prepare("INSERT OR REPLACE INTO template_questions (template_id, question_id, position) VALUES (?, ?, ?)").run(
          Number(mapping.templateId),
          Number(questionIds[index]),
          index + 1,
        );
      }
    }
    for (const sign of data.signs || []) {
      database.prepare("INSERT OR REPLACE INTO sign_categories (id, title, code, count, image) VALUES (?, ?, ?, ?, ?)").run(
        sign.id,
        sign.title || "",
        sign.code || "",
        sign.count || 0,
        sign.image || "",
      );
    }
    for (const sign of data.roadSigns || []) {
      database.prepare(
        "INSERT OR REPLACE INTO road_signs (id, type_id, code, title, image, description, preview_images, video, audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      ).run(
        sign.id,
        sign.typeId || 0,
        sign.code || "",
        sign.title || "",
        sign.image || "",
        sign.description || "",
        JSON.stringify(sign.previewImages || []),
        sign.video || "",
        sign.audio || "",
      );
    }
    for (const penalty of data.penalties || []) {
      database.prepare(
        "INSERT OR REPLACE INTO penalties (id, title, description, article, amount, bcv, points) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ).run(
        penalty.id,
        penalty.title || "",
        penalty.description || "",
        penalty.article || "",
        penalty.amount || "",
        penalty.bcv || "",
        penalty.points || "",
      );
    }
    const info = data.penaltyInfo || {};
    database.prepare(
      "INSERT OR REPLACE INTO penalty_info (id, source_url, updated_label, bcv_label, summary, points_summary, points_rules) VALUES (1, ?, ?, ?, ?, ?, ?)",
    ).run(
      info.sourceUrl || "",
      info.updatedLabel || "",
      info.bcvLabel || "",
      info.summary || "",
      info.pointsSummary || "",
      JSON.stringify(info.pointsRules || []),
    );
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [algorithm, salt, hash] = String(stored || "").split(":");
  if (algorithm !== "scrypt" || !salt || !hash) return false;
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("hex"));
  const expected = Buffer.from(hash);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token) {
  return createHmac("sha256", process.env.SESSION_SECRET || "avtolearn-local-secret").update(token).digest("hex");
}

function createSession(userId) {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expires = new Date(now.getTime() + sessionDays * 24 * 60 * 60 * 1000);
  db.prepare("INSERT INTO sessions (user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?)").run(
    userId,
    hashToken(token),
    expires.toISOString(),
    now.toISOString(),
  );
  return { token, expires };
}

function cookieHeader(token, expires) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookie}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${secure}`;
}

function clearCookieHeader() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookie}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function storeAvatarUpload(userId, dataUrl) {
  if (!dataUrl) return "";
  const match = String(dataUrl).match(/^data:(image\/(?:png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/);
  if (!match) throw httpError(400, "Avatar must be a PNG, JPG, or WebP image.");
  const mimeType = match[1];
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length) throw httpError(400, "Avatar image is empty.");
  if (buffer.length > maxAvatarBytes) throw httpError(413, `Avatar image is too large. Limit is ${Math.round(maxAvatarBytes / 1024 / 1024)}MB.`);
  const signatures = {
    "image/png": buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
    "image/jpeg": buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])),
    "image/webp": buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP",
  };
  if (!signatures[mimeType]) throw httpError(400, "Avatar image type does not match the file content.");
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType.split("/")[1];
  const avatarDir = join(root, "public", "uploads", "avatars");
  mkdirSync(avatarDir, { recursive: true });
  const filename = `${Number(userId)}-${Date.now()}-${randomBytes(6).toString("hex")}.${extension}`;
  writeFileSync(join(avatarDir, filename), buffer);
  return `/uploads/avatars/${filename}`;
}

function removeUploadedAvatar(avatarUrl) {
  if (!String(avatarUrl || "").startsWith("/uploads/avatars/")) return;
  const file = uploadedAssetPath(avatarUrl);
  if (!file || !existsSync(file)) return;
  try {
    unlinkSync(file);
  } catch {
    // Best effort cleanup; profile updates should not fail because an old file is locked.
  }
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function getSessionUser(req) {
  const token = parseCookies(req)[sessionCookie];
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at, u.id, u.email, u.name, u.active, u.avatar_url, u.avatar_color, u.avatar_size
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token));
  if (!row || !row.active || new Date(row.expires_at).getTime() <= Date.now()) {
    if (row?.session_id) db.prepare("DELETE FROM sessions WHERE id = ?").run(row.session_id);
    return null;
  }
  const roles = db
    .prepare("SELECT r.key FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?")
    .all(row.id)
    .map((role) => role.key);
  const permissions = db
    .prepare(
      `SELECT DISTINCT p.key FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`,
    )
    .all(row.id)
    .map((permission) => permission.key);
  return { id: row.id, email: row.email, name: row.name, avatar_url: row.avatar_url, avatar_color: row.avatar_color, avatar_size: row.avatar_size, roles, permissions };
}

function requireUser(context) {
  if (!context.user) throw httpError(401, "Authentication required");
  return context.user;
}

function requirePermission(context, permission) {
  const user = requireUser(context);
  if (!user.permissions.includes(permission)) throw httpError(403, "Permission denied");
  return user;
}

function publicPath(inputPath) {
  const decoded = decodeURIComponent(inputPath.split("?")[0]);
  const staticRoot = existsSync(join(root, "client", "dist")) ? join(root, "client", "dist") : root;
  const requested = normalize(join(staticRoot, decoded === "/" ? "index.html" : decoded));
  if (!requested.startsWith(staticRoot)) return null;
  return { file: requested, staticRoot };
}

function uploadedAssetPath(inputPath) {
  const decoded = decodeURIComponent(inputPath.split("?")[0]);
  if (!decoded.startsWith("/uploads/")) return null;
  const uploadRoot = join(root, "public", "uploads");
  const requested = normalize(join(uploadRoot, decoded.replace(/^\/uploads\/?/, "")));
  if (!requested.startsWith(uploadRoot)) return null;
  return requested;
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const uploaded = uploadedAssetPath(url.pathname);
  if (uploaded && existsSync(uploaded)) {
    res.writeHead(200, { ...securityHeaders, "content-type": mime[extname(uploaded).toLowerCase()] || "application/octet-stream" });
    createReadStream(uploaded).pipe(res);
    return;
  }
  const resolved = publicPath(url.pathname);
  let file = resolved?.file;
  if (!file || !existsSync(file)) {
    file = existsSync(join(root, "client", "dist", "index.html")) ? join(root, "client", "dist", "index.html") : join(root, "index.html");
  }
  res.writeHead(200, { ...securityHeaders, "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}

function json(res, status, value, headers = {}) {
  const body = JSON.stringify(value);
  res.writeHead(status, { ...securityHeaders, "content-type": "application/json; charset=utf-8", ...headers });
  res.end(body);
}

function httpError(status, message, details) {
  const error = new Error(message);
  error.status = status;
  error.details = details;
  return error;
}

function readBody(req, maxBytes = maxJsonBodyBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        tooLarge = true;
        reject(httpError(413, "Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) return;
      try {
        const text = Buffer.concat(chunks).toString("utf8");
        resolve(text ? JSON.parse(text) : {});
      } catch {
        reject(httpError(400, "Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function normalizeAsset(value) {
  if (/^https?:\/\//i.test(String(value || ""))) return String(value);
  return value ? `/${String(value)}`.replaceAll("//", "/") : "";
}

function titleCase(value) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function nullableNumber(value) {
  return value === undefined || value === null || value === "" ? null : Number(value);
}

function parseJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function requireFields(payload, fields) {
  const missing = fields.filter((field) => payload[field] === undefined || payload[field] === null || payload[field] === "");
  if (missing.length) throw httpError(400, `Missing required fields: ${missing.join(", ")}`);
}

function brand() {
  const row = db.prepare("SELECT * FROM brand WHERE id = 1").get();
  return {
    name: row?.name || "AvtoLearn",
    subtitle: row?.subtitle || "",
    logo: row?.logo || "",
    hero: row?.hero || "",
  };
}

function lessonRow(row) {
  return {
    id: row.id,
    sourceLessonId: row.source_lesson_id ?? undefined,
    title: row.title,
    shortName: row.short_name,
    topicCount: row.topic_count ?? undefined,
  };
}

function topicContentRow(row) {
  return { id: row.id, type: row.type, content: row.content };
}

function topicRow(row, includeContents = false) {
  const topic = {
    id: row.id,
    lessonId: row.lesson_id ?? undefined,
    title: row.title,
    type: row.type,
    questionCount: row.question_count,
    timeLimit: row.time_limit ?? undefined,
  };
  if (includeContents) {
    topic.contents = db.prepare("SELECT * FROM topic_contents WHERE topic_id = ? ORDER BY id").all(row.id).map(topicContentRow);
  }
  return topic;
}

function answerRow(row) {
  return { id: row.id, text: row.text, correct: Boolean(row.correct) };
}

function questionById(id) {
  const row = db.prepare("SELECT * FROM questions WHERE id = ?").get(Number(id));
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    image: normalizeAsset(row.image),
    video: normalizeAsset(row.video),
    explanation: row.explanation,
    answers: db.prepare("SELECT * FROM answers WHERE question_id = ? ORDER BY id").all(row.id).map(answerRow),
  };
}

function questionSummary(row) {
  return {
    id: row.id,
    title: row.title,
    image: normalizeAsset(row.image),
    hasVideo: Boolean(row.video),
    answerCount: db.prepare("SELECT COUNT(*) AS count FROM answers WHERE question_id = ?").get(row.id).count || 0,
  };
}

function templateRow(row) {
  return {
    id: row.id,
    name: row.name,
    questions: row.questions,
    durationMinutes: row.duration_minutes,
    bestPercent: row.best_percent,
  };
}

function signCategoryRow(row) {
  return { id: row.id, title: row.title, code: row.code, count: row.count, image: row.image };
}

function roadSignRow(row) {
  return {
    id: row.id,
    typeId: row.type_id,
    code: row.code,
    title: row.title,
    image: row.image,
    description: row.description || undefined,
    previewImages: parseJson(row.preview_images, []),
    video: row.video || undefined,
    audio: row.audio || undefined,
  };
}

function penaltyRow(row) {
  return { id: row.id, title: row.title, description: row.description, article: row.article, amount: row.amount, bcv: row.bcv, points: row.points };
}

function penaltyInfo() {
  const row = db.prepare("SELECT * FROM penalty_info WHERE id = 1").get();
  if (!row) return null;
  return {
    sourceUrl: row.source_url,
    updatedLabel: row.updated_label,
    bcvLabel: row.bcv_label,
    summary: row.summary,
    pointsSummary: row.points_summary,
    pointsRules: parseJson(row.points_rules, []),
  };
}

function userDto(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    avatarUrl: user.avatar_url || "",
    avatarColor: user.avatar_color || "#1477d4",
    avatarSize: Number(user.avatar_size || 52),
    roles: user.roles || [],
    permissions: user.permissions || [],
  };
}

function buildTemplates(userId) {
  const templates = db.prepare("SELECT * FROM test_templates ORDER BY id").all().map(templateRow);
  const saved = new Set(db.prepare("SELECT template_id FROM saved_templates WHERE user_id = ?").all(userId).map((row) => Number(row.template_id)));
  const attempts = db.prepare("SELECT mode, score, total, created_at FROM test_attempts WHERE user_id = ? AND mode LIKE 'template-tests:%'").all(userId);
  const maxTemplates = Math.max(62, templates.length);
  return Array.from({ length: maxTemplates }, (_, index) => {
    const id = index + 1;
    const source = templates.find((template) => Number(template.id) === id);
    const templateAttempts = attempts.filter((attempt) => attempt.mode === `template-tests:${id}`);
    const bestPercent = templateAttempts.reduce((best, attempt) => {
      const percent = attempt.total ? Math.round((Number(attempt.score) / Number(attempt.total)) * 100) : 0;
      return Math.max(best, percent);
    }, Number(source?.bestPercent || 0));
    const latest = templateAttempts.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    return {
      id,
      name: source?.name || `Variant ${id}`,
      questions: source?.questions || 20,
      durationMinutes: source?.durationMinutes || 25,
      bestPercent,
      completed: templateAttempts.length > 0 || bestPercent >= 100,
      saved: saved.has(id),
      lastAttemptAt: latest?.created_at || null,
    };
  });
}

function getTemplate(id) {
  return db.prepare("SELECT * FROM test_templates WHERE id = ?").get(Number(id));
}

function templateQuestionPool(template) {
  if (!template) return db.prepare("SELECT id FROM questions ORDER BY id").all();
  const mapped = db
    .prepare("SELECT question_id AS id FROM template_questions WHERE template_id = ? ORDER BY position")
    .all(Number(template.id));
  if (mapped.length) return mapped;
  const allQuestions = db.prepare("SELECT id FROM questions ORDER BY id").all();
  const start = ((Number(template.id) - 1) * Number(template.questions || 20)) % allQuestions.length;
  return Array.from({ length: Number(template.questions || 20) }, (_, index) => allQuestions[(start + index) % allQuestions.length]);
}

function filteredQuestionRows(searchParams, sourceRows) {
  const query = (searchParams.get("query") || "").toLowerCase();
  const hasVideo = searchParams.get("hasVideo");
  return sourceRows
    .map((source) => db.prepare("SELECT * FROM questions WHERE id = ?").get(source.id))
    .filter(Boolean)
    .filter((question) => {
      const answers = db.prepare("SELECT text FROM answers WHERE question_id = ?").all(question.id).map((row) => row.text).join(" ");
      const haystack = `${question.title} ${question.explanation} ${answers}`.toLowerCase();
      if (query && !haystack.includes(query)) return false;
      if (hasVideo === "true" && !question.video) return false;
      if (hasVideo === "false" && question.video) return false;
      return true;
    });
}

function seededRandom(seed) {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleRows(rows, seed) {
  const random = seededRandom(seed || new Date().toISOString());
  const shuffled = [...rows];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function progressSummary(userId) {
  const answered = db.prepare("SELECT COUNT(*) AS count FROM question_progress WHERE user_id = ?").get(userId).count || 0;
  const correct = db.prepare("SELECT COUNT(*) AS count FROM question_progress WHERE user_id = ? AND correct = 1").get(userId).count || 0;
  const attempts = db.prepare("SELECT COUNT(*) AS count FROM test_attempts WHERE user_id = ?").get(userId).count || 0;
  const saved = db.prepare("SELECT COUNT(*) AS count FROM saved_questions WHERE user_id = ?").get(userId).count || 0;
  const aiMessages = db.prepare("SELECT COUNT(*) AS count FROM ai_history WHERE user_id = ?").get(userId).count || 0;
  const latestAttempt = db
    .prepare("SELECT mode, score, total, created_at FROM test_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1")
    .get(userId);
  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    attempts,
    saved,
    aiMessages,
    latestAttempt: latestAttempt
      ? { mode: latestAttempt.mode, score: latestAttempt.score, total: latestAttempt.total, createdAt: latestAttempt.created_at }
      : null,
  };
}

function recentProgress(userId) {
  const questionRows = db
    .prepare("SELECT id, question_id, correct, created_at FROM question_progress WHERE user_id = ? ORDER BY created_at DESC LIMIT 6")
    .all(userId)
    .map((row) => {
      const question = questionById(row.question_id);
      return {
        type: "question",
        id: row.id,
        title: question ? `#${question.id} ${question.title}` : `Savol #${row.question_id}`,
        detail: row.correct ? "To'g'ri javob tanlandi" : "Qayta ko'rib chiqish kerak",
        createdAt: row.created_at,
        correct: Boolean(row.correct),
      };
    });
  const attemptRows = db
    .prepare("SELECT id, mode, score, total, created_at FROM test_attempts WHERE user_id = ? ORDER BY created_at DESC LIMIT 4")
    .all(userId)
    .map((row) => ({ type: "attempt", id: row.id, title: `${row.mode} natijasi`, detail: `${row.score}/${row.total} javob`, createdAt: row.created_at }));
  return [...questionRows, ...attemptRows].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0, 8);
}

function localTutorReply(message, question) {
  if (!question) {
    const lessons = db.prepare("SELECT title FROM lessons ORDER BY id LIMIT 3").all().map((lesson) => lesson.title).join(", ");
    return `Men lokal o'quv ma'lumotlari asosida yordam beraman. Savol ID kiritsangiz, javob va izohni tushuntiraman. Boshlash uchun mavzular: ${lessons}.`;
  }
  const correct = question.answers.find((answer) => answer.correct);
  return [
    `Savol: ${question.title}`,
    correct ? `To'g'ri javob: ${correct.text}` : "To'g'ri javob belgilanmagan.",
    question.explanation ? `Izoh: ${question.explanation}` : "Bu savol uchun izoh mavjud emas.",
    message ? `Siz so'ragan narsa: ${message}` : "",
  ].filter(Boolean).join("\n\n");
}

function cleanTutorAnswer(answer) {
  return String(answer || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*\n]+)\*/g, "$1")
    .replace(/_([^_\n]+)_/g, "$1")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ")
    .trim();
}

function aiTutorRateKey(req, userId) {
  return `${userId}:${req.headers["x-forwarded-for"] || req.socket.remoteAddress || "local"}`;
}

function assertAiTutorRateLimit(req, userId) {
  const key = aiTutorRateKey(req, userId);
  const now = Date.now();
  const day = new Date().toISOString().slice(0, 10);
  const state = aiTutorRateState.get(key) || { windowStart: now, count: 0, day, daily: 0 };
  if (now - state.windowStart > aiTutorRateWindowMs) {
    state.windowStart = now;
    state.count = 0;
  }
  if (state.day !== day) {
    state.day = day;
    state.daily = 0;
  }
  state.count += 1;
  state.daily += 1;
  aiTutorRateState.set(key, state);
  if (state.count > aiTutorRateMax) throw httpError(429, "AI tutor rate limit reached. Please wait a minute.");
  if (state.daily > aiTutorDailyMax) throw httpError(429, "Daily AI tutor limit reached. Please try again tomorrow.");
}

function pruneAiTutorRateState() {
  const now = Date.now();
  for (const [key, state] of aiTutorRateState.entries()) {
    if (now - state.windowStart > aiTutorRateWindowMs * 4) aiTutorRateState.delete(key);
  }
}

async function fetchWithTimeout(url, options, timeoutMs = aiTutorProviderTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function validateTutorPayload(payload) {
  const message = String(payload.message || "").trim();
  if (!message) throw httpError(400, "Message is required");
  if (message.length > aiTutorMaxMessageChars) throw httpError(413, `Message is too long. Limit is ${aiTutorMaxMessageChars} characters.`);
}

function pruneAiHistory() {
  if (!Number.isFinite(aiHistoryRetentionDays) || aiHistoryRetentionDays <= 0) return;
  const cutoff = new Date(Date.now() - aiHistoryRetentionDays * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("DELETE FROM ai_history WHERE created_at < ?").run(cutoff);
  db.prepare("DELETE FROM ai_messages WHERE created_at < ?").run(cutoff);
  db.prepare("DELETE FROM ai_sessions WHERE updated_at < ?").run(cutoff);
}

function aiMessageDto(row) {
  return {
    id: row.id,
    role: row.role,
    text: row.content,
    model: row.model || "",
    sources: safeJson(row.sources, []),
    createdAt: row.created_at,
  };
}

function aiSessionDto(row, includeMessages = true) {
  const messages = includeMessages
    ? db.prepare("SELECT * FROM ai_messages WHERE session_id = ? ORDER BY created_at ASC, id ASC LIMIT 80").all(row.id).map(aiMessageDto)
    : [];
  return {
    id: row.id,
    title: row.title,
    meta: relativeMeta(row.updated_at),
    questionId: row.question_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages,
  };
}

function safeJson(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function relativeMeta(value) {
  const diff = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diff) || diff < 60 * 1000) return "hozir";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes} daqiqa oldin`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} soat oldin`;
  return `${Math.floor(hours / 24)} kun oldin`;
}

function createAiSession(userId, payload = {}) {
  const now = new Date().toISOString();
  const id = `chat-${Date.now()}-${randomBytes(4).toString("hex")}`;
  const title = String(payload.title || "Yangi suhbat").trim().slice(0, 80) || "Yangi suhbat";
  const questionId = payload.questionId ? Number(payload.questionId) : null;
  db.prepare("INSERT INTO ai_sessions (id, user_id, title, question_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)").run(
    id,
    userId,
    title,
    questionId,
    now,
    now,
  );
  return aiSessionDto(db.prepare("SELECT * FROM ai_sessions WHERE id = ?").get(id));
}

function listAiSessions(userId) {
  return db.prepare("SELECT * FROM ai_sessions WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30").all(userId).map((row) => aiSessionDto(row));
}

function getAiSessionForUser(userId, sessionId) {
  return db.prepare("SELECT * FROM ai_sessions WHERE id = ? AND user_id = ?").get(String(sessionId), userId);
}

function saveAiMessage(userId, sessionId, role, content, model = "", sources = []) {
  const now = new Date().toISOString();
  db.prepare("INSERT INTO ai_messages (session_id, user_id, role, content, model, sources, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
    sessionId,
    userId,
    role,
    String(content || ""),
    String(model || ""),
    JSON.stringify(sources || []),
    now,
  );
  db.prepare("UPDATE ai_sessions SET updated_at = ? WHERE id = ? AND user_id = ?").run(now, sessionId, userId);
}

function renameAiSessionFromMessage(userId, sessionId, message) {
  const session = getAiSessionForUser(userId, sessionId);
  if (!session || session.title !== "Yangi suhbat") return;
  const title = String(message || "").trim().replace(/\s+/g, " ").slice(0, 44) || "Yangi suhbat";
  db.prepare("UPDATE ai_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?").run(title, new Date().toISOString(), sessionId, userId);
}

function recentAiMessages(userId, sessionId, limit = 10) {
  const rows = db.prepare("SELECT role, content FROM ai_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC, id DESC LIMIT ?").all(userId, sessionId, limit);
  return rows.reverse().map((row) => ({ role: row.role, content: row.content }));
}

async function aiTutor(payload, memory = []) {
  const question = payload.questionId ? questionById(payload.questionId) : null;
  const fallback = localTutorReply(payload.message || "", question);
  const sources = question ? [{ type: "question", id: question.id }] : [];
  const context = question
    ? `Question ${question.id}: ${question.title}\nAnswers: ${question.answers.map((answer) => `${answer.correct ? "[correct]" : "[option]"} ${answer.text}`).join("\n")}\nExplanation: ${question.explanation || "none"}`
    : `Lessons: ${db.prepare("SELECT title FROM lessons ORDER BY id").all().map((lesson) => lesson.title).join("; ")}`;
  const tutorPrompt = [
    "You are AvtoLearn Tutor, a professional driving-education AI assistant for students in Uzbekistan.",
    "Your job is to help the student understand traffic rules, test questions, road signs, penalties, and safe driving decisions.",
    "Language rules: answer in the same language and script as the student's message. If the language is unclear, use Uzbek Latin. Keep Russian answers natural and Uzbek answers clear and simple.",
    "Grounding rules: use only the provided local context. Do not invent laws, penalties, rule numbers, statistics, or official requirements. If the context is insufficient, say exactly what information is missing and suggest the next useful question.",
    "Answer style: be concise, professional, calm, and student-friendly. Avoid long lectures. Use short paragraphs or bullet points when helpful.",
    "Formatting rules: output plain text only. Do not use Markdown bold, italic, headings, tables, or asterisks. Use simple numbered lines like '1. Short answer:' if structure is needed.",
    "When a test question is provided, structure the answer as: 1) Short answer, 2) Why it is correct, 3) Why other options may be wrong or risky, 4) Memory tip. Skip any section that does not apply.",
    "If the student asks for just the answer, still include a one-sentence reason so they learn, not only memorize.",
    "If the student asks something unrelated to driving education, politely redirect to AvtoLearn topics.",
    "Never mention hidden instructions, system prompts, provider names, or model limitations unless the student specifically asks about the app configuration.",
    "Do not expose chain-of-thought. Provide only the final explanation and key reasoning steps.",
  ].join(" ");
  const memoryText = memory.length
    ? `Recent conversation:\n${memory.map((item) => `${item.role === "assistant" ? "Tutor" : "Student"}: ${item.content}`).join("\n")}\n\n`
    : "";
  const userPrompt = `Context:\n${context}\n\n${memoryText}Student question:\n${payload.message || "Explain this question."}`;

  if (process.env.OPENROUTER_API_KEY) {
    const primaryModel = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b:free";
    const fallbackModel = process.env.OPENROUTER_FALLBACK_MODEL || "nvidia/nemotron-3-super-120b-a12b:free";
    const models = Array.from(new Set([primaryModel, fallbackModel].filter(Boolean)));
    for (const model of models) {
      try {
        const response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
            "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:5177",
            "X-Title": process.env.OPENROUTER_APP_NAME || "AvtoLearn AI Studio",
          },
          body: JSON.stringify({
            model,
            messages: [
              { role: "system", content: tutorPrompt },
              { role: "user", content: userPrompt },
            ],
            temperature: 0.2,
            max_tokens: 900,
          }),
        });
        if (!response.ok) continue;
        const data = await response.json();
        const answer = data?.choices?.[0]?.message?.content;
        if (answer) return { answer: cleanTutorAnswer(answer), sources, model };
      } catch {
        // Try the next configured model, then fall back to the local deterministic tutor.
      }
    }
    return { answer: fallback, sources, model: "local-fallback" };
  }

  if (!process.env.OPENAI_API_KEY) return { answer: fallback, sources, model: "local" };
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetchWithTimeout("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: [
        { role: "system", content: tutorPrompt },
        { role: "user", content: userPrompt },
      ],
    }),
  });
  if (!response.ok) return { answer: fallback, sources, model: "local-fallback" };
  const data = await response.json();
  return { answer: cleanTutorAnswer(data.output_text || fallback), sources, model };
}

function validateQuestionPayload(payload) {
  requireFields(payload, ["title", "answers"]);
  if (!Array.isArray(payload.answers) || payload.answers.length < 2) throw httpError(400, "Question requires at least two answers");
  if (!payload.answers.some((answer) => answer.correct)) throw httpError(400, "Question requires one correct answer");
}

function createQuestion(payload) {
  validateQuestionPayload(payload);
  const id = payload.id ? Number(payload.id) : nextId("questions");
  db.prepare("INSERT INTO questions (id, title, image, video, explanation) VALUES (?, ?, ?, ?, ?)").run(
    id,
    String(payload.title),
    String(payload.image || ""),
    String(payload.video || ""),
    String(payload.explanation || ""),
  );
  for (const answer of payload.answers) {
    db.prepare("INSERT INTO answers (id, question_id, text, correct) VALUES (?, ?, ?, ?)").run(
      answer.id ? Number(answer.id) : nextId("answers"),
      id,
      String(answer.text || ""),
      answer.correct ? 1 : 0,
    );
  }
  return questionById(id);
}

function updateQuestion(id, payload) {
  const existing = questionById(id);
  if (!existing) throw httpError(404, "Question not found");
  const next = { ...existing, ...payload, answers: payload.answers || existing.answers };
  validateQuestionPayload(next);
  db.prepare("UPDATE questions SET title = ?, image = ?, video = ?, explanation = ? WHERE id = ?").run(
    String(next.title),
    String(next.image || "").replace(/^\//, ""),
    String(next.video || "").replace(/^\//, ""),
    String(next.explanation || ""),
    Number(id),
  );
  if (payload.answers) {
    db.prepare("DELETE FROM answers WHERE question_id = ?").run(Number(id));
    for (const answer of payload.answers) {
      db.prepare("INSERT INTO answers (id, question_id, text, correct) VALUES (?, ?, ?, ?)").run(
        answer.id ? Number(answer.id) : nextId("answers"),
        Number(id),
        String(answer.text || ""),
        answer.correct ? 1 : 0,
      );
    }
  }
  return questionById(id);
}

function deleteQuestion(id) {
  db.prepare("DELETE FROM questions WHERE id = ?").run(Number(id));
}

function nextId(table) {
  return (db.prepare(`SELECT COALESCE(MAX(id), 0) + 1 AS id FROM ${table}`).get().id || 1);
}

async function handleAuth(req, res, context, url) {
  if (req.method === "POST" && url.pathname === "/api/auth/login") {
    const payload = await readBody(req);
    const user = db.prepare("SELECT * FROM users WHERE lower(email) = lower(?) AND active = 1").get(String(payload.email || ""));
    if (!user || !verifyPassword(String(payload.password || ""), user.password_hash)) throw httpError(401, "Invalid email or password");
    const session = createSession(user.id);
    const hydrated = getUserById(user.id);
    json(res, 200, { user: userDto(hydrated) }, { "Set-Cookie": cookieHeader(session.token, session.expires) });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/auth/logout") {
    const token = parseCookies(req)[sessionCookie];
    if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hashToken(token));
    json(res, 200, { ok: true }, { "Set-Cookie": clearCookieHeader() });
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/auth/me") {
    if (!context.user) throw httpError(401, "Authentication required");
    json(res, 200, { user: userDto(context.user) });
    return true;
  }
  if (req.method === "PATCH" && url.pathname === "/api/auth/profile") {
    const user = requireUser(context);
    const payload = await readBody(req, Math.max(maxJsonBodyBytes, Math.ceil(maxAvatarBytes * 1.4) + 16 * 1024));
    const existing = getUserById(user.id);
    if (!existing) throw httpError(404, "User not found");

    const nextEmail = String(payload.email ?? existing.email).trim();
    const nextName = String(payload.name ?? existing.name).trim();
    if (!nextName) throw httpError(400, "Name is required");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) throw httpError(400, "Valid email is required");

    const duplicate = db.prepare("SELECT id FROM users WHERE lower(email) = lower(?) AND id <> ?").get(nextEmail, user.id);
    if (duplicate) throw httpError(409, "Email is already used");

    const uploadedAvatarUrl = payload.avatarDataUrl ? storeAvatarUpload(user.id, payload.avatarDataUrl) : "";
    const avatarUrl = uploadedAvatarUrl || String(payload.avatarUrl ?? existing.avatar_url ?? "").trim();
    const avatarColorInput = String(payload.avatarColor ?? existing.avatar_color ?? "#1477d4").trim();
    const avatarColor = /^#[0-9a-f]{6}$/i.test(avatarColorInput) ? avatarColorInput : "#1477d4";
    const avatarSize = Math.min(96, Math.max(36, Number(payload.avatarSize ?? existing.avatar_size ?? 52)));

    db.prepare("UPDATE users SET email = ?, name = ?, avatar_url = ?, avatar_color = ?, avatar_size = ?, updated_at = ? WHERE id = ?").run(
      nextEmail,
      nextName,
      avatarUrl,
      avatarColor,
      avatarSize,
      new Date().toISOString(),
      user.id,
    );
    if ((uploadedAvatarUrl || !avatarUrl) && existing.avatar_url !== avatarUrl) removeUploadedAvatar(existing.avatar_url);
    if (payload.password) {
      const password = String(payload.password);
      if (password.length < 6) throw httpError(400, "Password must contain at least 6 characters");
      db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(password), new Date().toISOString(), user.id);
    }
    json(res, 200, { user: userDto(getUserById(user.id)) });
    return true;
  }
  return false;
}

function getUserById(id) {
  const user = db.prepare("SELECT id, email, name, active, avatar_url, avatar_color, avatar_size FROM users WHERE id = ?").get(Number(id));
  if (!user) return null;
  const roles = db.prepare("SELECT r.key FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ?").all(user.id).map((row) => row.key);
  const permissions = db
    .prepare(
      `SELECT DISTINCT p.key FROM permissions p
       JOIN role_permissions rp ON rp.permission_id = p.id
       JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?`,
    )
    .all(user.id)
    .map((row) => row.key);
  return { ...user, roles, permissions };
}

function adminUsers(payload, method, id) {
  if (method === "GET" && !id) {
    return db.prepare("SELECT id, email, name, active, avatar_url, avatar_color, avatar_size, created_at, updated_at FROM users ORDER BY id").all().map((user) => ({ ...user, roles: getUserById(user.id).roles }));
  }
  if (method === "POST") {
    requireFields(payload, ["email", "name", "password"]);
    const now = new Date().toISOString();
    const result = db.prepare("INSERT INTO users (email, name, password_hash, active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id").get(
      String(payload.email),
      String(payload.name),
      hashPassword(String(payload.password)),
      payload.active === false ? 0 : 1,
      now,
      now,
    );
    setUserRoles(result.id, payload.roles || ["student"]);
    return userDto(getUserById(result.id));
  }
  if (method === "PATCH" && id) {
    const existing = getUserById(id);
    if (!existing) throw httpError(404, "User not found");
    db.prepare("UPDATE users SET email = ?, name = ?, active = ?, avatar_url = ?, avatar_color = ?, avatar_size = ?, updated_at = ? WHERE id = ?").run(
      payload.email || existing.email,
      payload.name || existing.name,
      payload.active === undefined ? existing.active : payload.active ? 1 : 0,
      payload.avatarUrl ?? payload.avatar_url ?? existing.avatar_url ?? "",
      payload.avatarColor ?? payload.avatar_color ?? existing.avatar_color ?? "#1477d4",
      Math.min(96, Math.max(36, Number(payload.avatarSize ?? payload.avatar_size ?? existing.avatar_size ?? 52))),
      new Date().toISOString(),
      Number(id),
    );
    if (payload.password) db.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").run(hashPassword(String(payload.password)), new Date().toISOString(), Number(id));
    if (payload.roles) setUserRoles(id, payload.roles);
    return userDto(getUserById(id));
  }
  if (method === "DELETE" && id) {
    db.prepare("DELETE FROM users WHERE id = ?").run(Number(id));
    return { ok: true };
  }
  throw httpError(405, "Method not allowed");
}

function setUserRoles(userId, roles) {
  db.prepare("DELETE FROM user_roles WHERE user_id = ?").run(Number(userId));
  for (const roleKey of roles) {
    const role = db.prepare("SELECT id FROM roles WHERE key = ?").get(String(roleKey));
    if (role) db.prepare("INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)").run(Number(userId), role.id);
  }
}

function adminRbac(method, payload, kind) {
  if (method !== "GET") throw httpError(405, "Method not allowed");
  if (kind === "roles") return db.prepare("SELECT * FROM roles ORDER BY id").all();
  if (kind === "permissions") return db.prepare("SELECT * FROM permissions ORDER BY id").all();
  return {
    roles: db.prepare("SELECT * FROM roles ORDER BY id").all(),
    permissions: db.prepare("SELECT * FROM permissions ORDER BY id").all(),
    rolePermissions,
  };
}

function adminReport(url) {
  const userId = url.searchParams.get("userId");
  const where = userId ? "WHERE user_id = ?" : "";
  const args = userId ? [Number(userId)] : [];
  return {
    users: db.prepare("SELECT COUNT(*) AS count FROM users").get().count || 0,
    progress: db.prepare(`SELECT COUNT(*) AS answered, SUM(correct) AS correct FROM question_progress ${where}`).get(...args),
    attempts: db.prepare(`SELECT COUNT(*) AS count, AVG(CASE WHEN total > 0 THEN score * 100.0 / total ELSE 0 END) AS averagePercent FROM test_attempts ${where}`).get(...args),
    savedQuestions: db.prepare(`SELECT COUNT(*) AS count FROM saved_questions ${where}`).get(...args).count || 0,
    aiMessages: db.prepare(`SELECT COUNT(*) AS count FROM ai_history ${where}`).get(...args).count || 0,
    byTemplate: db.prepare(`SELECT mode, COUNT(*) AS attempts, MAX(score * 100.0 / NULLIF(total, 0)) AS bestPercent FROM test_attempts ${where} GROUP BY mode ORDER BY attempts DESC LIMIT 20`).all(...args),
  };
}

function listResource(config) {
  return db.prepare(`SELECT * FROM ${config.table} ORDER BY ${config.id}`).all().map(config.serialize);
}

function createResource(config, payload) {
  if (config.customCreate) return config.customCreate(payload);
  config.validate(payload);
  const mapped = config.toDb(payload);
  const id = payload.id ? Number(payload.id) : nextId(config.table);
  const columns = [config.id, ...Object.keys(mapped)];
  const placeholders = columns.map(() => "?").join(", ");
  db.prepare(`INSERT INTO ${config.table} (${columns.join(", ")}) VALUES (${placeholders})`).run(id, ...Object.values(mapped));
  return config.serialize(db.prepare(`SELECT * FROM ${config.table} WHERE ${config.id} = ?`).get(id));
}

function updateResource(config, id, payload) {
  if (config.customUpdate) return config.customUpdate(id, payload);
  const existing = db.prepare(`SELECT * FROM ${config.table} WHERE ${config.id} = ?`).get(Number(id));
  if (!existing) throw httpError(404, "Resource not found");
  const mapped = config.toDb({ ...existing, ...payload });
  const assignments = Object.keys(mapped).map((key) => `${key} = ?`).join(", ");
  db.prepare(`UPDATE ${config.table} SET ${assignments} WHERE ${config.id} = ?`).run(...Object.values(mapped), Number(id));
  return config.serialize(db.prepare(`SELECT * FROM ${config.table} WHERE ${config.id} = ?`).get(Number(id)));
}

function deleteResource(config, id) {
  if (config.customDelete) config.customDelete(id);
  else db.prepare(`DELETE FROM ${config.table} WHERE ${config.id} = ?`).run(Number(id));
  return { ok: true };
}

async function handleAdmin(req, res, context, url) {
  if (!url.pathname.startsWith("/api/admin/")) return false;
  const parts = url.pathname.split("/").filter(Boolean);
  const area = parts[2];
  const id = parts[3];

  if (area === "users") {
    requirePermission(context, "admin:users");
    const payload = ["POST", "PATCH"].includes(req.method) ? await readBody(req) : {};
    json(res, 200, adminUsers(payload, req.method, id));
    return true;
  }
  if (area === "roles" || area === "permissions" || area === "rbac") {
    requirePermission(context, "admin:rbac");
    json(res, 200, adminRbac(req.method, {}, area));
    return true;
  }
  if (area === "reports") {
    requirePermission(context, "admin:reports");
    json(res, 200, adminReport(url));
    return true;
  }
  if (area === "catalog") {
    requirePermission(context, "admin:catalog");
    const resource = parts[3];
    const resourceId = parts[4];
    const config = catalogResources[resource];
    if (!config) throw httpError(404, "Unknown catalog resource");
    if (req.method === "GET" && !resourceId) json(res, 200, listResource(config));
    else if (req.method === "POST") json(res, 201, createResource(config, await readBody(req)));
    else if (req.method === "PATCH" && resourceId) json(res, 200, updateResource(config, resourceId, await readBody(req)));
    else if (req.method === "DELETE" && resourceId) json(res, 200, deleteResource(config, resourceId));
    else throw httpError(405, "Method not allowed");
    return true;
  }
  return false;
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const context = { user: getSessionUser(req) };
  if (await handleAuth(req, res, context, url)) return;
  if (await handleAdmin(req, res, context, url)) return;

  const user = requireUser(context);

  if (req.method === "GET" && url.pathname === "/api/data") {
    const questionCounts = db.prepare("SELECT COUNT(*) AS questions, SUM(CASE WHEN video != '' THEN 1 ELSE 0 END) AS videos, SUM(CASE WHEN image != '' THEN 1 ELSE 0 END) AS images FROM questions").get();
    json(res, 200, {
      brand: brand(),
      lessons: db.prepare("SELECT * FROM lessons ORDER BY id").all().map(lessonRow),
      topics: db.prepare("SELECT * FROM topics ORDER BY id").all().map((row) => topicRow(row, true)),
      tests: db.prepare("SELECT * FROM test_templates ORDER BY id").all().map(templateRow),
      signs: db.prepare("SELECT * FROM sign_categories ORDER BY id").all().map(signCategoryRow),
      roadSigns: db.prepare("SELECT * FROM road_signs ORDER BY id").all().map(roadSignRow),
      penalties: db.prepare("SELECT * FROM penalties ORDER BY id").all().map(penaltyRow),
      penaltyInfo: penaltyInfo(),
      counts: {
        questions: questionCounts.questions || 0,
        videos: questionCounts.videos || 0,
        images: questionCounts.images || 0,
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/questions") {
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 12)));
    const templateId = url.searchParams.get("templateId");
    const template = templateId ? getTemplate(templateId) : null;
    const sourceRows = template ? templateQuestionPool(template) : db.prepare("SELECT id FROM questions ORDER BY id").all();
    const filteredSource = filteredQuestionRows(url.searchParams, sourceRows);
    const filtered = url.searchParams.get("random") === "true" ? shuffleRows(filteredSource, url.searchParams.get("seed") || "") : filteredSource;
    const start = (page - 1) * pageSize;
    json(res, 200, {
      page,
      pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      data: filtered.slice(start, start + pageSize).map((row) => questionById(row.id)),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/templates") {
    json(res, 200, buildTemplates(user.id));
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/templates/save") {
    const payload = await readBody(req);
    const templateId = Number(payload.templateId);
    if (!templateId || !getTemplate(templateId)) throw httpError(400, "Invalid templateId");
    if (payload.saved === false) db.prepare("DELETE FROM saved_templates WHERE user_id = ? AND template_id = ?").run(user.id, templateId);
    else db.prepare("INSERT OR REPLACE INTO saved_templates (user_id, template_id, created_at) VALUES (?, ?, ?)").run(user.id, templateId, new Date().toISOString());
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/question-meta") {
    json(res, 200, db.prepare("SELECT * FROM questions ORDER BY id").all().map(questionSummary));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/progress/summary") {
    json(res, 200, progressSummary(user.id));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/progress/recent") {
    json(res, 200, recentProgress(user.id));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/questions/saved") {
    const rows = db.prepare("SELECT question_id, created_at FROM saved_questions WHERE user_id = ? ORDER BY created_at DESC").all(user.id);
    const data = rows.map((row) => {
      const question = questionById(row.question_id);
      return question ? { ...question, savedAt: row.created_at } : null;
    }).filter(Boolean);
    json(res, 200, { page: 1, pageSize: data.length, total: data.length, totalPages: 1, data });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/questions/save") {
    const payload = await readBody(req);
    const questionId = Number(payload.questionId);
    if (!questionId || !questionById(questionId)) throw httpError(400, "Invalid questionId");
    if (payload.saved === false) db.prepare("DELETE FROM saved_questions WHERE user_id = ? AND question_id = ?").run(user.id, questionId);
    else db.prepare("INSERT OR REPLACE INTO saved_questions (user_id, question_id, created_at) VALUES (?, ?, ?)").run(user.id, questionId, new Date().toISOString());
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/progress/question") {
    const payload = await readBody(req);
    db.prepare("INSERT INTO question_progress (user_id, question_id, answer_id, correct, created_at) VALUES (?, ?, ?, ?, ?)").run(
      user.id,
      Number(payload.questionId),
      payload.answerId ? Number(payload.answerId) : null,
      payload.correct ? 1 : 0,
      new Date().toISOString(),
    );
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/tests/attempt") {
    const payload = await readBody(req);
    db.prepare("INSERT INTO test_attempts (user_id, mode, score, total, created_at) VALUES (?, ?, ?, ?, ?)").run(
      user.id,
      String(payload.mode || "practice"),
      Number(payload.score || 0),
      Number(payload.total || 0),
      new Date().toISOString(),
    );
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/ai/sessions") {
    let sessions = listAiSessions(user.id);
    if (!sessions.length) sessions = [createAiSession(user.id, { title: "Yangi suhbat" })];
    json(res, 200, { sessions });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/sessions") {
    const payload = await readBody(req, 16 * 1024);
    json(res, 201, { session: createAiSession(user.id, payload) });
    return;
  }

  if (req.method === "DELETE" && url.pathname.startsWith("/api/ai/sessions/")) {
    const sessionId = decodeURIComponent(url.pathname.split("/").pop() || "");
    const session = getAiSessionForUser(user.id, sessionId);
    if (!session) throw httpError(404, "Chat session not found");
    db.prepare("DELETE FROM ai_sessions WHERE id = ? AND user_id = ?").run(sessionId, user.id);
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname.startsWith("/api/ai/sessions/") && url.pathname.endsWith("/clear")) {
    const parts = url.pathname.split("/");
    const sessionId = decodeURIComponent(parts[4] || "");
    const session = getAiSessionForUser(user.id, sessionId);
    if (!session) throw httpError(404, "Chat session not found");
    db.prepare("DELETE FROM ai_messages WHERE session_id = ? AND user_id = ?").run(sessionId, user.id);
    db.prepare("UPDATE ai_sessions SET updated_at = ? WHERE id = ? AND user_id = ?").run(new Date().toISOString(), sessionId, user.id);
    json(res, 200, { session: aiSessionDto(getAiSessionForUser(user.id, sessionId)) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/tutor") {
    assertAiTutorRateLimit(req, user.id);
    pruneAiTutorRateState();
    const payload = await readBody(req, Math.min(maxJsonBodyBytes, 32 * 1024));
    validateTutorPayload(payload);
    let session = payload.sessionId ? getAiSessionForUser(user.id, payload.sessionId) : null;
    if (!session) session = createAiSession(user.id, { title: String(payload.message || "").slice(0, 44) || "Yangi suhbat", questionId: payload.questionId });
    const memory = recentAiMessages(user.id, session.id, 10);
    saveAiMessage(user.id, session.id, "user", payload.message);
    renameAiSessionFromMessage(user.id, session.id, payload.message);
    const result = await aiTutor(payload, memory);
    saveAiMessage(user.id, session.id, "assistant", result.answer, result.model, result.sources || []);
    db.prepare("INSERT INTO ai_history (user_id, message, answer, question_id, model, sources, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      user.id,
      String(payload.message || ""),
      result.answer,
      payload.questionId ? Number(payload.questionId) : null,
      result.model || "local",
      JSON.stringify(result.sources || []),
      new Date().toISOString(),
    );
    pruneAiHistory();
    json(res, 200, { answer: result.answer, sources: result.sources || [], session: aiSessionDto(getAiSessionForUser(user.id, session.id)) });
    return;
  }

  json(res, 404, { message: "Not found" });
}

function createAppServer() {
  return createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch((error) => {
      const status = error.status || 500;
      json(res, status, { message: error.message || "Internal server error", details: error.details });
    });
    return;
  }
  serveStatic(req, res);
  });
}

if (process.env.NODE_ENV !== "test") {
  createAppServer().listen(port, () => {
    console.log(`Avtolearn AI API running at http://127.0.0.1:${port}`);
  });
}

export { bootstrapAdminConfig, createAppServer, initDb, shouldImportCatalog };
