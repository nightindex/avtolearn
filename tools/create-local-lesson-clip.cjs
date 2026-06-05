const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const input = path.join(root, "public", "assets", "newmedia", "10686-1-234-48de79a0f0.jpg");
const output = path.join(root, "public", "assets", "newmedia", "10686-418-2eed0c2f19.webm");

async function main() {
  if (!fs.existsSync(input)) {
    throw new Error(`Missing input image: ${input}`);
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });

  const imageBase64 = fs.readFileSync(input).toString("base64");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  try {
    const videoBase64 = await page.evaluate(async ({ imageBase64 }) => {
      const width = 1920;
      const height = 1080;
      const durationMs = 6500;
      const fps = 30;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      document.body.style.margin = "0";
      document.body.appendChild(canvas);
      const ctx = canvas.getContext("2d");

      const img = new Image();
      img.src = `data:image/jpeg;base64,${imageBase64}`;
      await img.decode();

      const stream = canvas.captureStream(fps);
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8")
        ? "video/webm;codecs=vp8"
        : "video/webm";
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5_000_000,
      });

      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };

      function easeInOut(t) {
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      }

      function drawArrow(fromX, fromY, toX, toY, alpha) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#f8fafc";
        ctx.fillStyle = "#f8fafc";
        ctx.lineWidth = 12;
        ctx.lineCap = "round";
        ctx.shadowColor = "rgba(15, 23, 42, 0.45)";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - 34 * Math.cos(angle - Math.PI / 6), toY - 34 * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(toX - 34 * Math.cos(angle + Math.PI / 6), toY - 34 * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      function drawPulse(x, y, radius, label, t, color) {
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 8);
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = color;
        ctx.lineWidth = 9;
        ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(x, y, radius + pulse * 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "rgba(15, 23, 42, 0.76)";
        ctx.beginPath();
        ctx.roundRect(x - 48, y + radius + 22, 96, 58, 14);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "700 40px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, y + radius + 52);
        ctx.restore();
      }

      let start = null;
      recorder.start();

      await new Promise((resolve) => {
        function frame(now) {
          if (start === null) start = now;
          const elapsed = now - start;
          const t = Math.min(1, elapsed / durationMs);
          const e = easeInOut(t);

          const scale = 1.035 + e * 0.055;
          const dx = -38 * e;
          const dy = -18 * e;
          const drawW = width * scale;
          const drawH = height * scale;
          ctx.clearRect(0, 0, width, height);
          ctx.drawImage(img, (width - drawW) / 2 + dx, (height - drawH) / 2 + dy, drawW, drawH);

          ctx.fillStyle = `rgba(3, 7, 18, ${0.08 + 0.05 * Math.sin(t * Math.PI)})`;
          ctx.fillRect(0, 0, width, height);

          const routeAlpha = Math.min(1, Math.max(0, (t - 0.12) / 0.24));
          drawArrow(840, 845, 835, 285, routeAlpha * 0.9);

          if (t > 0.25) drawPulse(820, 305, 70, "A", t, "#22c55e");
          if (t > 0.42) drawPulse(1035, 405, 62, "B", t, "#f59e0b");
          if (t > 0.58) drawPulse(1120, 720, 68, "C", t, "#ef4444");

          ctx.save();
          ctx.globalAlpha = Math.min(1, t / 0.4);
          ctx.fillStyle = "rgba(15, 23, 42, 0.76)";
          ctx.beginPath();
          ctx.roundRect(56, 50, 560, 86, 18);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "700 38px Arial";
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("Choose the safest path", 86, 94);
          ctx.restore();

          if (elapsed < durationMs) {
            requestAnimationFrame(frame);
          } else {
            resolve();
          }
        }
        requestAnimationFrame(frame);
      });

      await new Promise((resolve) => {
        recorder.onstop = resolve;
        recorder.stop();
      });

      const blob = new Blob(chunks, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      let binary = "";
      const bytes = new Uint8Array(buffer);
      for (let i = 0; i < bytes.byteLength; i += 1) {
        binary += String.fromCharCode(bytes[i]);
      }
      return btoa(binary);
    }, { imageBase64 });

    fs.writeFileSync(output, Buffer.from(videoBase64, "base64"));
    console.log(`Wrote ${output}`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
