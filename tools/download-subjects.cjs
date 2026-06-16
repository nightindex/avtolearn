const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataFile = path.join(root, "data", "site-data.json");
const backend = "https://back.eavtotalim.uz";
const api = `${backend}/v2/api`;

async function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data.trim()));
  });
}

function getLocalizedName(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value.uz || value.kiril || value.ru || Object.values(value).find(Boolean) || "";
}

function normalizeContentBlock(block) {
  const content = getLocalizedName(block.content);
  return {
    id: Number(block.id),
    type: Number(block.type_id || block.type || 0),
    content,
  };
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
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const response = await fetch(`${api}${pathname}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept-Language": "uz",
      },
    });
    const data = await response.json().catch(() => ({}));
    if (response.ok && Number(data.status) !== 0) return data;
    if (response.status === 429 && attempt < 6) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 5000));
      continue;
    }
    throw new Error(data.message || `GET ${pathname} failed: ${response.status}`);
  }
  throw new Error(`GET ${pathname} failed`);
}

async function fetchLessonTopics(lessonId, token) {
  const topics = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const payload = await getJson(
      `/student-content/topics?edu_type_lesson_id=${lessonId}&page=${page}&show_count=100&relations[]=examTopicTestStudentResult&relations[]=examTopics`,
      token,
    );
    const pageData = payload.data || {};
    totalPages = Number(pageData.total_pages || totalPages);
    topics.push(...(pageData.data || []));
    page += 1;
  }

  return topics;
}

async function fetchTopicContents(topicId, token) {
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const payload = await getJson(`/student-content/contents?topic_id=${topicId}`, token);
  return (payload.data || []).map(normalizeContentBlock).filter((block) => block.content);
}

async function main() {
  const stdin = await readStdin();
  const [stdinUser, stdinPass] = stdin.split(/\r?\n/);
  const username = process.env.EAVTOTALIM_USERNAME || stdinUser;
  const password = process.env.EAVTOTALIM_PASSWORD || stdinPass;
  if (!username || !password) throw new Error("Expected username and password via stdin or env");

  const token = await login(username, password);
  const lessonsPayload = await getJson("/student-content/lessons", token);
  const rawLessons = lessonsPayload.data || [];

  const lessons = [];
  const topics = [];

  for (const item of rawLessons) {
    const lesson = item.lesson || {};
    const lessonTopics = await fetchLessonTopics(item.id, token);
    const normalizedLesson = {
      id: Number(item.id),
      sourceLessonId: Number(lesson.id || item.id),
      title: getLocalizedName(lesson.name),
      shortName: lesson.short_name || getLocalizedName(lesson.name) || "Dars",
      topicCount: lessonTopics.length,
    };
    lessons.push(normalizedLesson);
    for (const topic of lessonTopics) {
      const contents = await fetchTopicContents(topic.id, token);
      topics.push({
        id: Number(topic.id),
        lessonId: Number(item.id),
        title: getLocalizedName(topic.name),
        type: Number(topic.type || 0),
        questionCount: Number(topic.exam_topics_count || topic.question_count || 0),
        timeLimit: Number(topic.topic_action_limit?.time_limit || 0),
        contents,
      });
    }
    console.log(`${normalizedLesson.id} ${normalizedLesson.shortName}: ${lessonTopics.length} topics`);
  }

  const siteData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  siteData.lessons = lessons;
  siteData.topics = topics;
  siteData.subjectsDownloadedAt = new Date().toISOString();
  fs.writeFileSync(dataFile, JSON.stringify(siteData, null, 2));

  console.log(`updated lessons=${lessons.length}`);
  console.log(`updated topics=${topics.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
