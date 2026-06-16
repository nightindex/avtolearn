import { createServer } from "node:http";
import { readFileSync, existsSync, createReadStream, mkdirSync } from "node:fs";
import { join, normalize, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const port = Number(process.env.PORT || 5180);
const dataPath = join(root, "data", "site-data.json");
const dbPath = join(root, "data", "avtolearn.sqlite");
const siteData = JSON.parse(readFileSync(dataPath, "utf8"));
const db = initDb();

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

function initDb() {
  mkdirSync(join(root, "data"), { recursive: true });
  const database = new DatabaseSync(dbPath);
  database.exec(`
    CREATE TABLE IF NOT EXISTS question_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question_id INTEGER NOT NULL,
      answer_id INTEGER,
      correct INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saved_questions (
      question_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS saved_templates (
      template_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS test_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      mode TEXT NOT NULL,
      score INTEGER NOT NULL,
      total INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ai_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      answer TEXT NOT NULL,
      question_id INTEGER,
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

function json(res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(text ? JSON.parse(text) : {});
    });
    req.on("error", reject);
  });
}

function publicPath(inputPath) {
  const decoded = decodeURIComponent(inputPath.split("?")[0]);
  const staticRoot = existsSync(join(root, "client", "dist"))
    ? join(root, "client", "dist")
    : root;
  const requested = normalize(join(staticRoot, decoded === "/" ? "index.html" : decoded));
  if (!requested.startsWith(staticRoot)) return null;
  return { file: requested, staticRoot };
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const resolved = publicPath(url.pathname);
  let file = resolved?.file;
  if (!file || !existsSync(file)) {
    file = existsSync(join(root, "client", "dist", "index.html"))
      ? join(root, "client", "dist", "index.html")
      : join(root, "index.html");
  }
  res.writeHead(200, { "content-type": mime[extname(file).toLowerCase()] || "application/octet-stream" });
  createReadStream(file).pipe(res);
}

function questionSummary(question) {
  return {
    id: question.id,
    title: question.title,
    image: normalizeAsset(question.image),
    hasVideo: Boolean(question.video),
    answerCount: question.answers.length,
  };
}

function normalizeAsset(value) {
  return value ? `/${value}`.replaceAll("//", "/") : "";
}

function getQuestion(id) {
  return siteData.questions.find((question) => Number(question.id) === Number(id));
}

function normalizeQuestion(question) {
  return {
    ...question,
    image: normalizeAsset(question.image),
    video: normalizeAsset(question.video),
  };
}

function buildTemplates() {
  const maxTemplates = Math.max(62, siteData.tests.length);
  const saved = new Set(db.prepare("SELECT template_id FROM saved_templates").all().map((row) => Number(row.template_id)));
  const attempts = db
    .prepare("SELECT mode, score, total, created_at FROM test_attempts WHERE mode LIKE 'template-tests:%'")
    .all();
  return Array.from({ length: maxTemplates }, (_, index) => {
    const id = index + 1;
    const source = siteData.tests.find((template) => Number(template.id) === id);
    const templateAttempts = attempts.filter((attempt) => attempt.mode === `template-tests:${id}`);
    const bestPercent = templateAttempts.reduce((best, attempt) => {
      const percent = attempt.total ? Math.round((Number(attempt.score) / Number(attempt.total)) * 100) : 0;
      return Math.max(best, percent);
    }, Number(source?.bestPercent || 0));
    const latest = templateAttempts
      .slice()
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
    return {
      id,
      name: source?.name || `Variant ${id}`,
      questions: 20,
      durationMinutes: 25,
      bestPercent,
      completed: templateAttempts.length > 0 || bestPercent >= 100,
      saved: saved.has(id),
      lastAttemptAt: latest?.created_at || null,
    };
  });
}

function getTemplate(id) {
  return buildTemplates().find((template) => Number(template.id) === Number(id));
}

function templateQuestionPool(template) {
  if (!template) return siteData.questions;
  const start = ((Number(template.id) - 1) * Number(template.questions)) % siteData.questions.length;
  return Array.from({ length: Number(template.questions) }, (_, index) => {
    const questionIndex = (start + index) % siteData.questions.length;
    return siteData.questions[questionIndex];
  });
}

function filterQuestions(searchParams, sourceQuestions = siteData.questions) {
  const query = (searchParams.get("query") || "").toLowerCase();
  const hasVideo = searchParams.get("hasVideo");
  return sourceQuestions.filter((question) => {
    const haystack = JSON.stringify(question).toLowerCase();
    if (query && !haystack.includes(query)) return false;
    if (hasVideo === "true" && !question.video) return false;
    if (hasVideo === "false" && question.video) return false;
    return true;
  });
}

function seededRandom(seed) {
  let value = 0;
  for (let index = 0; index < seed.length; index += 1) {
    value = (value * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleQuestions(questions, seed) {
  const random = seededRandom(seed || new Date().toISOString());
  const shuffled = [...questions];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function progressSummary() {
  const answered = db.prepare("SELECT COUNT(*) AS count FROM question_progress").get().count || 0;
  const correct = db.prepare("SELECT COUNT(*) AS count FROM question_progress WHERE correct = 1").get().count || 0;
  const attempts = db.prepare("SELECT COUNT(*) AS count FROM test_attempts").get().count || 0;
  const saved = db.prepare("SELECT COUNT(*) AS count FROM saved_questions").get().count || 0;
  const aiMessages = db.prepare("SELECT COUNT(*) AS count FROM ai_history").get().count || 0;
  const latestAttempt = db
    .prepare("SELECT mode, score, total, created_at FROM test_attempts ORDER BY created_at DESC LIMIT 1")
    .get();
  return {
    answered,
    correct,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
    attempts,
    saved,
    aiMessages,
    latestAttempt: latestAttempt
      ? {
          mode: latestAttempt.mode,
          score: latestAttempt.score,
          total: latestAttempt.total,
          createdAt: latestAttempt.created_at,
        }
      : null,
  };
}

function recentProgress() {
  const questionRows = db
    .prepare(
      "SELECT id, question_id, correct, created_at FROM question_progress ORDER BY created_at DESC LIMIT 6",
    )
    .all()
    .map((row) => {
      const question = getQuestion(row.question_id);
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
    .prepare("SELECT id, mode, score, total, created_at FROM test_attempts ORDER BY created_at DESC LIMIT 4")
    .all()
    .map((row) => ({
      type: "attempt",
      id: row.id,
      title: `${row.mode} natijasi`,
      detail: `${row.score}/${row.total} javob`,
      createdAt: row.created_at,
    }));
  return [...questionRows, ...attemptRows]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 8);
}

function localTutorReply(message, question) {
  if (!question) {
    const lessons = siteData.lessons.slice(0, 3).map((lesson) => lesson.title).join(", ");
    return `Men lokal o'quv ma'lumotlari asosida yordam beraman. Savol ID kiritsangiz, javob va izohni tushuntiraman. Boshlash uchun mavzular: ${lessons}.`;
  }
  const correct = question.answers.find((answer) => answer.correct);
  return [
    `Savol: ${question.title}`,
    correct ? `To'g'ri javob: ${correct.text}` : "To'g'ri javob belgilanmagan.",
    question.explanation ? `Izoh: ${question.explanation}` : "Bu savol uchun izoh mavjud emas.",
    message ? `Siz so'ragan narsa: ${message}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

async function aiTutor(payload) {
  const question = payload.questionId ? getQuestion(payload.questionId) : null;
  const fallback = localTutorReply(payload.message || "", question);
  if (!process.env.OPENAI_API_KEY) {
    return { answer: fallback, sources: question ? [{ type: "question", id: question.id }] : [] };
  }
  const context = question
    ? `Question ${question.id}: ${question.title}\nAnswers: ${question.answers
        .map((answer) => `${answer.correct ? "[correct]" : "[option]"} ${answer.text}`)
        .join("\n")}\nExplanation: ${question.explanation || "none"}`
    : `Lessons: ${siteData.lessons.map((lesson) => lesson.title).join("; ")}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      input: [
        {
          role: "system",
          content:
            "You are an Uzbek driving education tutor. Only answer using the provided local context. If context is insufficient, say that.",
        },
        {
          role: "user",
          content: `Context:\n${context}\n\nUser question:\n${payload.message || "Explain this question."}`,
        },
      ],
    }),
  });

  if (!response.ok) return { answer: fallback, sources: question ? [{ type: "question", id: question.id }] : [] };
  const data = await response.json();
  return {
    answer: data.output_text || fallback,
    sources: question ? [{ type: "question", id: question.id }] : [],
  };
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  if (req.method === "GET" && url.pathname === "/api/data") {
    json(res, 200, {
      brand: siteData.brand,
      lessons: siteData.lessons,
      topics: siteData.topics,
      tests: siteData.tests,
      signs: siteData.signs,
      roadSigns: siteData.roadSigns || [],
      penalties: siteData.penalties || [],
      penaltyInfo: siteData.penaltyInfo || null,
      counts: {
        questions: siteData.questions.length,
        videos: siteData.questions.filter((question) => question.video).length,
        images: siteData.questions.filter((question) => question.image).length,
      },
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/questions") {
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize") || 12)));
    const templateId = url.searchParams.get("templateId");
    const template = templateId ? getTemplate(templateId) : null;
    const sourceQuestions = template ? templateQuestionPool(template) : siteData.questions;
    const filteredSource = filterQuestions(url.searchParams, sourceQuestions);
    const filtered = url.searchParams.get("random") === "true"
      ? shuffleQuestions(filteredSource, url.searchParams.get("seed") || "")
      : filteredSource;
    const start = (page - 1) * pageSize;
    json(res, 200, {
      page,
      pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      data: filtered.slice(start, start + pageSize).map(normalizeQuestion),
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/templates") {
    json(res, 200, buildTemplates());
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/templates/save") {
    const payload = await readBody(req);
    const templateId = Number(payload.templateId);
    if (!templateId || !getTemplate(templateId)) {
      json(res, 400, { message: "Invalid templateId" });
      return;
    }
    if (payload.saved === false) {
      db.prepare("DELETE FROM saved_templates WHERE template_id = ?").run(templateId);
    } else {
      db.prepare("INSERT OR REPLACE INTO saved_templates (template_id, created_at) VALUES (?, ?)").run(
        templateId,
        new Date().toISOString(),
      );
    }
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/question-meta") {
    json(res, 200, siteData.questions.map(questionSummary));
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/progress/summary") {
    json(res, 200, progressSummary());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/progress/recent") {
    json(res, 200, recentProgress());
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/questions/saved") {
    const rows = db.prepare("SELECT question_id, created_at FROM saved_questions ORDER BY created_at DESC").all();
    const data = rows
      .map((row) => {
        const question = getQuestion(row.question_id);
        return question ? { ...normalizeQuestion(question), savedAt: row.created_at } : null;
      })
      .filter(Boolean);
    json(res, 200, {
      page: 1,
      pageSize: data.length,
      total: data.length,
      totalPages: 1,
      data,
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/questions/save") {
    const payload = await readBody(req);
    const questionId = Number(payload.questionId);
    if (!questionId || !getQuestion(questionId)) {
      json(res, 400, { message: "Invalid questionId" });
      return;
    }
    if (payload.saved === false) {
      db.prepare("DELETE FROM saved_questions WHERE question_id = ?").run(questionId);
    } else {
      db.prepare("INSERT OR REPLACE INTO saved_questions (question_id, created_at) VALUES (?, ?)").run(
        questionId,
        new Date().toISOString(),
      );
    }
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/progress/question") {
    const payload = await readBody(req);
    db.prepare("INSERT INTO question_progress (question_id, answer_id, correct, created_at) VALUES (?, ?, ?, ?)").run(
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
    db.prepare("INSERT INTO test_attempts (mode, score, total, created_at) VALUES (?, ?, ?, ?)").run(
      String(payload.mode || "practice"),
      Number(payload.score || 0),
      Number(payload.total || 0),
      new Date().toISOString(),
    );
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/ai/tutor") {
    const payload = await readBody(req);
    const result = await aiTutor(payload);
    db.prepare("INSERT INTO ai_history (message, answer, question_id, created_at) VALUES (?, ?, ?, ?)").run(
      String(payload.message || ""),
      result.answer,
      payload.questionId ? Number(payload.questionId) : null,
      new Date().toISOString(),
    );
    json(res, 200, result);
    return;
  }

  json(res, 404, { message: "Not found" });
}

createServer((req, res) => {
  if (req.url.startsWith("/api/")) {
    handleApi(req, res).catch((error) => json(res, 500, { message: error.message }));
    return;
  }
  serveStatic(req, res);
}).listen(port, () => {
  console.log(`Avtolearn AI API running at http://127.0.0.1:${port}`);
});
