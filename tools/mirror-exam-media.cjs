const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataFile = path.join(root, "data", "site-data.json");
const publicDir = path.join(root, "public");
const concurrency = Number(process.env.EXAM_MEDIA_CONCURRENCY || 6);

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

async function download(url, relativeBase, nameBase) {
  if (!url || !/^https?:\/\//i.test(url)) return url || "";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Media download failed ${response.status}: ${url}`);
  const ext = extensionFor(url, response.headers.get("content-type"));
  const relativePath = path.posix.join(relativeBase, `${safeName(nameBase)}${ext}`);
  const fullPath = path.join(publicDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  if (!fs.existsSync(fullPath)) {
    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(fullPath, buffer);
    return { path: relativePath.replaceAll("\\", "/"), downloaded: true };
  }
  await response.arrayBuffer();
  return { path: relativePath.replaceAll("\\", "/"), downloaded: false };
}

async function runPool(items, worker) {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < items.length) {
      const current = items[index];
      index += 1;
      await worker(current);
    }
  });
  await Promise.all(workers);
}

async function main() {
  const siteData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  const mediaByUrl = new Map();

  for (const question of siteData.questions || []) {
    if (question.image && /^https?:\/\//i.test(question.image)) {
      mediaByUrl.set(question.image, {
        url: question.image,
        relativeBase: "assets/exam-questions/images",
        nameBase: `${question.id}-image`,
      });
    }
    if (question.video && /^https?:\/\//i.test(question.video)) {
      mediaByUrl.set(question.video, {
        url: question.video,
        relativeBase: "assets/exam-questions/videos",
        nameBase: `${question.id}-answer`,
      });
    }
  }

  const media = [...mediaByUrl.values()];
  const pathByUrl = new Map();
  let downloaded = 0;
  let reused = 0;
  let completed = 0;

  await runPool(media, async (item) => {
    const result = await download(item.url, item.relativeBase, item.nameBase);
    pathByUrl.set(item.url, result.path);
    if (result.downloaded) downloaded += 1;
    else reused += 1;
    completed += 1;
    if (completed % 50 === 0 || completed === media.length) {
      console.log(`media ${completed}/${media.length} downloaded=${downloaded} reused=${reused}`);
    }
  });

  for (const question of siteData.questions || []) {
    if (pathByUrl.has(question.image)) question.image = pathByUrl.get(question.image);
    if (pathByUrl.has(question.video)) question.video = pathByUrl.get(question.video);
  }

  siteData.examQuestionsSource = {
    ...(siteData.examQuestionsSource || {}),
    media: "local",
    mediaMirroredAt: new Date().toISOString(),
  };
  fs.writeFileSync(dataFile, JSON.stringify(siteData, null, 2));

  console.log(`updated questions=${siteData.questions?.length || 0}`);
  console.log(`media total=${media.length}`);
  console.log(`media downloaded=${downloaded}`);
  console.log(`media reused=${reused}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
