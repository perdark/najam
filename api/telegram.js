// Telegram bot webhook — a button-driven dashboard for the team.
// Owners (TELEGRAM_OWNER_IDS) tap inline buttons to see stats and applicants.
// Applicant data is NEVER shown to anyone who isn't an owner.
//
// Env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, TELEGRAM_OWNER_IDS (or TELEGRAM_CHAT_ID),
//      BLOB_READ_WRITE_TOKEN.
import { counts, latest, readApp, SLUG_LABEL } from "../lib/store.js";

const API = (m) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${m}`;
const tg = (method, body) =>
  fetch(API(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const owners = () =>
  (process.env.TELEGRAM_OWNER_IDS || process.env.TELEGRAM_CHAT_ID || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
const isOwner = (id) => owners().includes(String(id));

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export default async function handler(req, res) {
  // Only Telegram (with our secret) may call this.
  if (req.headers["x-telegram-bot-api-secret-token"] !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return res.status(401).json({ ok: false });
  }
  let u = req.body;
  if (typeof u === "string") { try { u = JSON.parse(u); } catch { u = {}; } }
  u = u || {};

  try {
    if (u.callback_query) await onCallback(u.callback_query);
    else if (u.message) await onMessage(u.message);
  } catch (e) {
    console.error("telegram error:", e);
  }
  // Always ack so Telegram doesn't retry.
  return res.status(200).json({ ok: true });
}

/* ---------- handlers ---------- */
async function onMessage(msg) {
  const chatId = msg.chat?.id;
  if (!isOwner(chatId)) {
    await tg("sendMessage", {
      chat_id: chatId,
      text: "هذا البوت خاص بإدارة فريق نجمة وكمر فقط. 🌙",
    });
    return;
  }
  const c = await counts();
  await tg("sendMessage", {
    chat_id: chatId,
    text: menuText(c),
    parse_mode: "HTML",
    reply_markup: mainKeyboard(),
  });
}

async function onCallback(cq) {
  const chatId = cq.message?.chat?.id;
  const msgId = cq.message?.message_id;
  if (!isOwner(chatId)) {
    await tg("answerCallbackQuery", { callback_query_id: cq.id, text: "غير مصرح", show_alert: true });
    return;
  }
  await tg("answerCallbackQuery", { callback_query_id: cq.id });
  const data = cq.data || "";

  if (data === "menu") {
    const c = await counts();
    return edit(chatId, msgId, menuText(c), mainKeyboard());
  }
  if (data === "stats") {
    const c = await counts();
    return edit(chatId, msgId, statsText(c), backKeyboard());
  }
  if (data.startsWith("latest:")) {
    const slugPart = data.split(":")[1]; // all | photographer | florist | callcenter
    const slug = slugPart === "all" ? undefined : slugPart;
    const apps = await latest(8, slug);
    return edit(chatId, msgId, listText(apps, slugPart), listKeyboard(apps, slugPart));
  }
  if (data.startsWith("view:")) {
    const pathname = data.slice(5);
    let app;
    try { app = await readApp(pathname); } catch { app = null; }
    if (!app) return edit(chatId, msgId, "تعذّر فتح الطلب.", backKeyboard());
    return edit(chatId, msgId, fullText(app), detailKeyboard(app, pathname));
  }
}

/* ---------- views ---------- */
function menuText(c) {
  return (
    "🌙 <b>لوحة نجمة وكمر</b>\n" +
    "إدارة طلبات التوظيف\n\n" +
    `مجموع الطلبات: <b>${c.total}</b>\n\n` +
    "اختاري من الأزرار 👇"
  );
}
function mainKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "📊 الإحصائيات", callback_data: "stats" }],
      [{ text: "🕐 آخر الطلبات", callback_data: "latest:all" }],
      [
        { text: "📸 المصورات", callback_data: "latest:photographer" },
        { text: "💐 الزهور", callback_data: "latest:florist" },
        { text: "💬 الكول سنتر", callback_data: "latest:callcenter" },
      ],
      [{ text: "🔄 تحديث", callback_data: "menu" }],
    ],
  };
}

function statsText(c) {
  return (
    "📊 <b>إحصائيات الطلبات</b>\n\n" +
    `الإجمالي: <b>${c.total}</b>\n\n` +
    `📸 مصورة هاتف: <b>${c.photographer}</b>\n` +
    `💐 منسقة زهور: <b>${c.florist}</b>\n` +
    `💬 كول سنتر: <b>${c.callcenter}</b>` +
    (c.other ? `\n• أخرى: <b>${c.other}</b>` : "")
  );
}

function listText(apps, slugPart) {
  const title = slugPart === "all" ? "آخر الطلبات" : `آخر طلبات: ${SLUG_LABEL[slugPart] || slugPart}`;
  if (!apps.length) return `🕐 <b>${esc(title)}</b>\n\nلا توجد طلبات بعد.`;
  const lines = apps.map((a, i) => {
    const m = a.meta || {};
    return (
      `${i + 1}. <b>${esc(m.name || "—")}</b> — ${esc((m.roles || [])[0] || "")}\n` +
      `   📍 ${esc(m.city || "—")} · 📱 ${esc(m.phone || "—")}`
    );
  });
  return `🕐 <b>${esc(title)}</b>\n\n${lines.join("\n")}\n\nاضغطي على اسم لعرض كل التفاصيل 👇`;
}
function listKeyboard(apps, slugPart) {
  const rows = apps.map((a) => [
    { text: `👤 ${(a.meta?.name || "—").slice(0, 40)}`, callback_data: `view:${a.pathname}` },
  ]);
  rows.push([{ text: "🏠 القائمة", callback_data: "menu" }]);
  return { inline_keyboard: rows };
}

function fullText(app) {
  const m = app.meta || {};
  const answers = Array.isArray(app.answers) ? app.answers : [];
  const skip = new Set(["الاسم الثلاثي", "رقم الهاتف / واتساب", "المدينة / المنطقة", "العمر"]);
  const out = [];
  out.push(`👤 <b>${esc(m.name || "—")}</b>`);
  if (m.roles?.length) out.push(`🎯 <b>الوظيفة:</b> ${esc(m.roles.join("، "))}`);
  if (m.city) out.push(`📍 ${esc(m.city)}`);
  if (m.age) out.push(`🎂 العمر: ${esc(m.age)}`);
  out.push(`📱 ${esc(m.phone || "—")}`);
  out.push("———————————————");
  answers.forEach(({ q, a }) => {
    if (!q || !a || skip.has(q)) return;
    out.push(`• <b>${esc(q)}:</b> ${esc(a)}`);
  });
  if (app.submittedAt) {
    const d = new Date(app.submittedAt);
    out.push(`\n🗓 ${d.toLocaleDateString("ar-IQ")} ${d.toLocaleTimeString("ar-IQ", { hour: "2-digit", minute: "2-digit" })}`);
  }
  let msg = out.join("\n");
  if (msg.length > 3800) msg = msg.slice(0, 3790) + "\n…";
  return msg;
}
function detailKeyboard(app, pathname) {
  const slug = pathname.split("/")[1];
  const wa = waLink(app.meta?.phone);
  const row1 = [];
  if (wa) row1.push({ text: "💬 واتساب", url: wa });
  return {
    inline_keyboard: [
      ...(row1.length ? [row1] : []),
      [{ text: "⬅️ رجوع للقائمة", callback_data: `latest:${slug || "all"}` }],
      [{ text: "🏠 القائمة الرئيسية", callback_data: "menu" }],
    ],
  };
}

function backKeyboard() {
  return { inline_keyboard: [[{ text: "🏠 القائمة", callback_data: "menu" }]] };
}

function waLink(phone) {
  let d = String(phone || "").replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = "964" + d.slice(1); // Iraqi local → international
  else if (!d.startsWith("964")) d = "964" + d;
  return `https://wa.me/${d}`;
}

/* ---------- helper ---------- */
async function edit(chatId, msgId, text, keyboard) {
  const r = await tg("editMessageText", {
    chat_id: chatId,
    message_id: msgId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: keyboard,
  });
  // If the content was identical Telegram returns 400 "not modified" — harmless.
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    if (!/not modified/i.test(e.description || "")) console.error("edit error:", e);
  }
}
