const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const dataFile = path.join(root, "data", "site-data.json");
const sourceUrl = "https://www.goldenpages.uz/uz/avto/avto_pdd/";

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

function firstMatch(value, regex) {
  return value.match(regex)?.[1]?.trim() || "";
}

function parseRows(html) {
  const body = firstMatch(html, /<tbody>([\s\S]*?)<\/tbody>/i);
  const rows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/gi)];
  return rows
    .map((row, index) => {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cell[1]);
      if (cells.length < 5) return null;
      const title = stripHtml(firstMatch(cells[0], /<strong>([\s\S]*?)<\/strong>/i));
      const fullText = stripHtml(cells[0]);
      const description = title ? fullText.replace(title, "").trim() : fullText;
      return {
        id: index + 1,
        title,
        description,
        article: stripHtml(cells[1]),
        amount: stripHtml(cells[2]),
        bcv: stripHtml(cells[3]),
        points: stripHtml(cells[4]),
      };
    })
    .filter((row) => row && row.title && row.article);
}

async function main() {
  const response = await fetch(sourceUrl);
  if (!response.ok) throw new Error(`Failed to fetch penalties: ${response.status}`);
  const html = await response.text();
  const penalties = parseRows(html);
  if (penalties.length < 20) throw new Error(`Unexpectedly few penalties parsed: ${penalties.length}`);

  const siteData = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  siteData.penalties = penalties;
  siteData.penaltyInfo = {
    sourceUrl,
    updatedLabel: "Ma'lumot yangilangan 01.08.2025",
    bcvLabel: "BHM - 412 000 so'm (01.08.2025 dan)",
    summary:
      "Yo'l harakati qoidalari buzilganligi uchun jarima miqdori O'zbekiston Respublikasining Ma'muriy javobgarlik to'g'risidagi kodeksiga muvofiq belgilanadi.",
    pointsSummary:
      "2025-yil 1-iyundan haydovchilar uchun 12 ballik jarima ballari tizimi ishga tushgan. 2026-yil 1-apreldan avtomatlashtirilgan foto-video qayd etish moslamalari va YPX xodimlari aniqlagan qoidabuzarliklar bo'yicha ham ball hisoblanadi.",
    pointsRules: [
      "Haydovchiga 12 oy davomida 12 ball limiti beriladi; limitga yetganda boshqarish huquqidan mahrum qilinadi.",
      "To'plangan ballarni my.gov.uz yoki SafeROAD YHXX mobil ilovasi orqali kuzatish mumkin.",
      "12 oy qoidabuzarliksiz yurgan haydovchining keyingi birinchi qoidabuzarligi uchun jarima balli hisoblanmaydi.",
      "6 oy yangi qoidabuzarlik bo'lmasa, umumiy balldan 2 ball chegiriladi.",
      "12 oy davomida ballar yig'indisi 12 tadan kam bo'lsa, ballar nollashtiriladi.",
    ],
  };
  siteData.penaltiesDownloadedAt = new Date().toISOString();
  fs.writeFileSync(dataFile, JSON.stringify(siteData, null, 2));
  console.log(`updated penalties=${penalties.length}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
