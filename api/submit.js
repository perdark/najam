// Vercel Serverless Function — forwards the application to a Telegram bot
// and stores it in the private Blob store so the bot dashboard can list it.
// The bot token NEVER reaches the browser; it lives only in env vars here.
//
// Required env vars (set in Vercel → Project → Settings → Environment Variables,
// and in .env.local for `vercel dev`):
//   TELEGRAM_BOT_TOKEN   e.g. 123456:ABC-DEF...
//   TELEGRAM_CHAT_ID     the chat/group id that should receive applications
//   BLOB_READ_WRITE_TOKEN   (auto-added when the Blob store was linked)
import { saveApplication } from "../lib/store.js";

const GIRLS_ONLY_ROLES = new Set([
  "مصورة هاتف",
  "منسقة زهور",
  "كول سنتر وإدارة الحجوزات",
]);

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return res
      .status(500)
      .json({ ok: false, error: "Server not configured (missing Telegram env vars)" });
  }

  // Body may arrive parsed (Vercel) or as a raw string.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  body = body || {};

  // Honeypot: bots fill hidden fields. Pretend success, send nothing.
  if (body.company) return res.status(200).json({ ok: true });

  const meta = body.meta || {};
  const answers = Array.isArray(body.answers) ? body.answers : [];

  // Server-side validation of the essentials.
  if (!meta.name || !meta.phone || !Array.isArray(meta.roles) || meta.roles.length === 0) {
    return res.status(400).json({ ok: false, error: "بيانات ناقصة" });
  }
  if (answers.length === 0 || answers.length > 60) {
    return res.status(400).json({ ok: false, error: "بيانات غير صالحة" });
  }
  const gender = meta.gender || answers.find((a) => a?.q === "الجنس")?.a || "";
  if (gender === "ذكر" && meta.roles.some((role) => GIRLS_ONLY_ROLES.has(role))) {
    return res.status(400).json({
      ok: false,
      error: "هذه الوظيفة مخصصة للبنات فقط. للشباب متاح التقديم على تصميم الجرافيك أو الموارد البشرية.",
    });
  }

  const text = buildMessage(meta, answers);

  try {
    const tgRes = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });

    const tgData = await tgRes.json().catch(() => ({}));
    if (!tgRes.ok || !tgData.ok) {
      console.error("Telegram error:", tgData);
      return res.status(502).json({ ok: false, error: "تعذّر الإرسال للتلكرام" });
    }

    // Persist for the dashboard (best-effort — never block the applicant on it).
    try {
      const rand = Math.random().toString(36).slice(2, 8);
      await saveApplication({ meta, answers, submittedAt: new Date().toISOString() }, rand);
    } catch (e) {
      console.error("blob save error:", e);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("submit error:", err);
    return res.status(500).json({ ok: false, error: "خطأ بالخادم" });
  }
}

/* Escape user text for Telegram HTML parse mode. */
function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildMessage(meta, answers) {
  const lines = [];
  lines.push("🌙✨ <b>استمارة توظيف جديدة — نجمة وكمر</b>");
  lines.push("");
  lines.push(`👤 <b>${esc(meta.name)}</b>`);
  if (meta.roles?.length) lines.push(`🎯 <b>الوظيفة:</b> ${esc(meta.roles.join("، "))}`);
  if (meta.city) lines.push(`📍 ${esc(meta.city)}`);
  if (meta.age) lines.push(`🎂 العمر: ${esc(meta.age)}`);
  lines.push(`📱 <b>الهاتف/واتساب:</b> ${esc(meta.phone)}`);
  lines.push("");
  lines.push("———————————————");

  // skip the fields already shown in the header
  const headerKeys = new Set([
    "الاسم الثلاثي",
    "رقم الهاتف / واتساب",
    "المدينة / المنطقة",
    "العمر",
  ]);

  answers.forEach(({ q, a }) => {
    if (!q || !a) return;
    if (headerKeys.has(q)) return;
    lines.push(`• <b>${esc(q)}:</b> ${esc(a)}`);
  });

  let msg = lines.join("\n");
  // Telegram hard limit is 4096 chars.
  if (msg.length > 4000) msg = msg.slice(0, 3990) + "\n…";
  return msg;
}
