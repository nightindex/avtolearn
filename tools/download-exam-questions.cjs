const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataFile = path.join(root, "data", "site-data.json");
const publicDir = path.join(root, "public");
const backend = "https://back.eavtotalim.uz";
const api = `${backend}/v2/api`;
const langId = Number(process.env.EAVTOTALIM_LANG_ID || 1);
const skipMedia = process.env.EAVTOTALIM_SKIP_MEDIA === "1";
let currentUsername = "";
let currentPassword = "";
let currentToken = "";
let mediaDownloaded = 0;
let mediaReused = 0;

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

async function login(username, password) {
  const formData = new FormData();
  formData.append("username", username);
  formData.append("password", password);
  formData.append("device", "web");
  formData.append("device_id", crypto.randomUUID());
  formData.append("model_device", process.platform);
  formData.append("platform", "Windows");

  const response = await fetch(`${api}/login`, {
    method: "POST",
    body: formData,
    headers: { "Accept-Language": "uz" },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.message || `Login failed: ${response.status}`);
  }
  return data.access_token;
}

async function getJson(pathname, token) {
  for (let attempt = 1; attempt <= 8; attempt += 1) {
    const response = await fetch(`${api}${pathname}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Language": "uz",
        Accept: "application/json",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && Number(data.status) !== 0) return data;
    if ((response.status === 401 || response.status === 403 || /avtorizatsiya/i.test(String(data.message || ""))) && attempt < 8) {
      console.log(`api token expired, logging in again: ${pathname}`);
      currentToken = await login(currentUsername, currentPassword);
      continue;
    }
    if ((response.status === 429 || /too many attempts/i.test(String(data.message || ""))) && attempt < 8) {
      const delay = attempt * 8000;
      console.log(`rate limited, retrying in ${Math.round(delay / 1000)}s: ${pathname}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    throw new Error(data.message || `GET ${pathname} failed: ${response.status}`);
  }
  throw new Error(`GET ${pathname} failed`);
}

function decodeEntities(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripHtml(value) {
  return decodeEntities(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseBody(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === "object") return Object.values(parsed);
    } catch {
      return [{ order: 1, type: 1, value }];
    }
  }
  if (typeof value === "object") return Object.values(value);
  return [];
}

function bodyText(body) {
  return parseBody(body)
    .filter((block) => Number(block.type) === 1)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((block) => stripHtml(block.value))
    .filter(Boolean)
    .join("\n");
}

function firstMedia(body, mediaType) {
  const block = parseBody(body)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .find((item) => Number(item.type) === mediaType && item.value);
  return normalizeRemoteAsset(block?.value || "");
}

function normalizeRemoteAsset(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${backend}/${String(value).replace(/^\/+/, "")}`;
}

function safeName(value) {
  return String(value || "asset").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

function extensionFor(url, contentType) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).split("?")[0];
  if (ext) return ext.toLowerCase();
  if (contentType?.includes("jpeg")) return ".jpg";
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("gif")) return ".gif";
  if (contentType?.includes("mp4")) return ".mp4";
  return ".bin";
}

async function downloadAsset(url, relativeBase, nameBase, token) {
  if (!url) return "";
  if (!/^https?:\/\//i.test(url)) return url;
  let response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Language": "uz",
    },
  });
  if (response.status === 401 || response.status === 403) {
    console.log("media token expired, logging in again");
    currentToken = await login(currentUsername, currentPassword);
    response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${currentToken}`,
        "Accept-Language": "uz",
      },
    });
  }
  if (!response.ok) throw new Error(`Asset download failed ${response.status}: ${url}`);
  const ext = extensionFor(url, response.headers.get("content-type"));
  const relativePath = path.posix.join(relativeBase, `${safeName(nameBase)}${ext}`);
  const fullPath = path.join(publicDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  if (!fs.existsSync(fullPath)) {
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(fullPath, buffer);
    mediaDownloaded += 1;
  } else {
    await response.arrayBuffer();
    mediaReused += 1;
  }
  return relativePath.replaceAll("\\", "/");
}

async function normalizeQuestion(raw) {
  const question = raw.question || raw;
  const title = bodyText(question.body) || stripHtml(raw.body_short) || `Question ${question.id}`;
  const questionId = Number(question.id);
  const imageUrl = firstMedia(question.body, 2);
  const videoUrl = normalizeRemoteAsset(question.answer_video || "");
  const answers = (question.answers || [])
    .map((answer) => ({
      id: Number(answer.id),
      text: bodyText(answer.body),
      correct: Number(answer.check) === 1,
    }))
    .filter((answer) => answer.id && answer.text);
  return {
    id: questionId,
    title,
    image: skipMedia ? imageUrl : await downloadAsset(imageUrl, "assets/exam-questions/images", `${questionId}-image`, currentToken),
    video: skipMedia ? videoUrl : await downloadAsset(videoUrl, "assets/exam-questions/videos", `${questionId}-answer`, currentToken),
    explanation: stripHtml(question.answer_description || question.comment || ""),
    answers,
  };
}

function uniqueById(items) {
  const map = new Map();
  for (const item of items) {
    if (item?.id) map.set(Number(item.id), item);
  }
  return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id));
}

async function fetchTemplates(token) {
  const templates = [];
  let page = 1;
  let totalPages = 1;
  while (page <= totalPages) {
    const payload = await getJson(`/exam-center-test-templates/index/${langId}?page=${page}&show_count=100`, token);
    const pageData = payload.data?.templates || {};
    totalPages = Number(pageData.total_pages || totalPages);
    templates.push(...(pageData.data || []));
    page += 1;
  }
  return templates;
}

async function main() {
  const stdin = await readStdin();
  const [stdinUser, stdinPass] = stdin.split(/\r?\n/);
  const username = process.env.EAVTOTALIM_USERNAME || stdinUser;
  const password = process.env.EAVTOTALIM_PASSWORD || stdinPass;
  if (!username || !password) throw new Error("Expected username and password via stdin or env");
  currentUsername = username;
  currentPassword = password;

  currentToken = await login(username, password);
  const templateRows = await fetchTemplates(currentToken);
  const templates = templateRows
    .map((template) => ({
      id: Number(template.id),
      name: `${template.name || template.id} SHABLON`,
      questions: Number(template.exam_center_test_template_questions_count || 20),
      durationMinutes: 25,
      bestPercent: 0,
      status: Number(template.status || 0),
    }))
    .filter((template) => template.id)
    .sort((a, b) => Number(a.id) - Number(b.id));

  const importedQuestions = [];
  const templateQuestions = [];

  for (const template of templates) {
    const payload = await getJson(`/student-exam-center-test-template-start/${template.id}/${langId}`, currentToken);
    const rawQuestions = payload.data?.questions || payload.data || [];
    const questionIds = [];
    for (const raw of rawQuestions) {
      const question = await normalizeQuestion(raw);
      if (!question.id || question.answers.length < 2 || !question.answers.some((answer) => answer.correct)) {
        throw new Error(`Invalid question payload in template ${template.id}`);
      }
      importedQuestions.push(question);
      questionIds.push(question.id);
    }
    template.questions = questionIds.length;
    templateQuestions.push({ templateId: template.id, questionIds });
    console.log(`template ${template.id}: ${questionIds.length} questions`);
    await new Promise((resolve) => setTimeout(resolve, 450));
  }

  const siteData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  siteData.tests = templates.map(({ status, ...template }) => template);
  siteData.questions = uniqueById(importedQuestions);
  siteData.templateQuestions = templateQuestions;
  siteData.examQuestionsSource = {
    sourceUrl: "https://eavtotalim.uz/exam-questions",
    apiBase: api,
    langId,
    media: skipMedia ? "remote" : "local",
    downloadedAt: new Date().toISOString(),
  };
  fs.writeFileSync(dataFile, JSON.stringify(siteData, null, 2));

  const mappedCount = templateQuestions.reduce((sum, item) => sum + item.questionIds.length, 0);
  console.log(`updated templates=${siteData.tests.length}`);
  console.log(`updated unique questions=${siteData.questions.length}`);
  console.log(`updated template mappings=${mappedCount}`);
  console.log(`media downloaded=${mediaDownloaded}`);
  console.log(`media reused=${mediaReused}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
