const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataFile = path.join(root, "data", "site-data.json");
const publicDir = path.join(root, "public");
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
  return value.uz || value.kiril || value.ru || value.en || Object.values(value).find(Boolean) || "";
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanTitle(value, code) {
  const text = stripHtml(value)
    .replace(new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.?\\s*`, "i"), "")
    .replace(/^["'“”«»\s]+|["'“”«»\s]+$/g, "")
    .trim();
  return text || stripHtml(value);
}

function assetUrl(value) {
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  return `${backend}/${String(value).replace(/^\/+/, "")}`;
}

function extensionFor(url, contentType) {
  const pathname = new URL(url).pathname;
  const ext = path.extname(pathname).split("?")[0];
  if (ext) return ext.toLowerCase();
  if (contentType?.includes("jpeg")) return ".jpg";
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("gif")) return ".gif";
  if (contentType?.includes("mp4")) return ".mp4";
  if (contentType?.includes("mpeg")) return ".mp3";
  return ".bin";
}

function safeName(value) {
  return String(value || "asset").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "");
}

async function downloadAsset(url, relativeBase, nameBase, token) {
  if (!url) return "";
  const absoluteUrl = assetUrl(url);
  const response = await fetch(absoluteUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Language": "uz",
    },
  });
  if (!response.ok) {
    throw new Error(`Asset download failed ${response.status}: ${absoluteUrl}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  const ext = extensionFor(absoluteUrl, response.headers.get("content-type"));
  const relativePath = path.posix.join(relativeBase, `${safeName(nameBase)}${ext}`);
  const fullPath = path.join(publicDir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, buffer);
  return relativePath.replaceAll("\\", "/");
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
  const response = await fetch(`${api}${pathname}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Accept-Language": "uz",
      Accept: "application/json",
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || Number(data.status) === 0) {
    throw new Error(data.message || `GET ${pathname} failed: ${response.status}`);
  }
  return data;
}

async function fetchAllRoadSigns(token) {
  const first = await getJson("/road-sign/index?page=1&show_count=100", token);
  const pageData = first.data || {};
  const signs = [...(pageData.data || [])];
  const totalPages = Number(pageData.total_pages || 1);
  for (let page = 2; page <= totalPages; page += 1) {
    const payload = await getJson(`/road-sign/index?page=${page}&show_count=100`, token);
    signs.push(...(payload.data?.data || []));
  }
  return signs;
}

function naturalCodeSort(a, b) {
  return String(a.code).localeCompare(String(b.code), "uz", { numeric: true, sensitivity: "base" });
}

async function main() {
  const stdin = await readStdin();
  const [stdinUser, stdinPass] = stdin.split(/\r?\n/);
  const username = process.env.EAVTOTALIM_USERNAME || stdinUser;
  const password = process.env.EAVTOTALIM_PASSWORD || stdinPass;
  if (!username || !password) throw new Error("Expected username and password via stdin or env");

  const token = await login(username, password);
  const typesPayload = await getJson("/road-sign/types/index?page=1&show_count=100", token);
  const rawTypes = typesPayload.data?.data || [];
  const rawSigns = await fetchAllRoadSigns(token);

  const signs = [];
  for (const type of rawTypes) {
    const localImage = await downloadAsset(type.image_url, "assets/road-signs/types", `type-${type.id}`, token);
    signs.push({
      id: Number(type.id),
      title: getLocalizedName(type.name),
      code: String(type.code || type.id),
      count: Number(type.road_signs_count || 0),
      image: localImage,
    });
    console.log(`type ${type.id}: ${getLocalizedName(type.name)} (${type.road_signs_count || 0})`);
  }

  const roadSigns = [];
  for (const item of rawSigns.sort((a, b) => Number(a.road_sign_type_id) - Number(b.road_sign_type_id) || naturalCodeSort(a, b))) {
    const code = String(item.code || item.id);
    const typeId = Number(item.road_sign_type_id);
    const name = getLocalizedName(item.name);
    const baseName = `${typeId}-${code}-${item.id}`;
    const image = await downloadAsset(item.image, "assets/road-signs/items", baseName, token);
    const content = item.content?.uz || [];
    const textBlocks = content.filter((block) => String(block.type) === "1").map((block) => stripHtml(block.value)).filter(Boolean);
    const contentImages = [];
    let video = "";
    let audio = "";

    let mediaIndex = 1;
    for (const block of content) {
      if (String(block.type) === "3") {
        contentImages.push(await downloadAsset(block.value, "assets/road-signs/content", `${baseName}-preview-${mediaIndex}`, token));
        mediaIndex += 1;
      }
      if (String(block.type) === "2" && !video) {
        video = await downloadAsset(block.value, "assets/road-signs/media", `${baseName}-video`, token);
      }
      if (String(block.type) === "4" && !audio) {
        audio = await downloadAsset(block.value, "assets/road-signs/media", `${baseName}-audio`, token);
      }
    }

    roadSigns.push({
      id: Number(item.id),
      typeId,
      code,
      title: cleanTitle(name, code),
      image,
      previewImages: [image, ...contentImages],
      description: textBlocks.join("\n\n"),
      ...(video ? { video } : {}),
      ...(audio ? { audio } : {}),
    });
  }

  const siteData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  siteData.signs = signs.sort((a, b) => Number(a.id) - Number(b.id));
  siteData.roadSigns = roadSigns;
  siteData.roadSignsParsedFrom = `${api}/road-sign/index`;
  siteData.roadSignsDownloadedAt = new Date().toISOString();
  fs.writeFileSync(dataFile, JSON.stringify(siteData, null, 2));

  console.log(`updated sign types=${siteData.signs.length}`);
  console.log(`updated road signs=${siteData.roadSigns.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
