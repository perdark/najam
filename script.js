/* ============================================================
   نجمة وكمر — front-end logic
   - starfield + scroll reveals + header state
   - multi-step wizard with conditional role sections
   - submit to /api/submit (which forwards to Telegram)
   ============================================================ */

// ---- Easy-to-edit links (used on the success screen) -------
const CONFIG = {
  INSTAGRAM_URL: "https://www.instagram.com/najma_for_events/",
  WHATSAPP_NUMBER: "",                      // ← رقم الواتساب بالصيغة الدولية بدون + (اتركيه فارغاً لإخفاء الزر)
  WHATSAPP_MSG: "مرحباً، قدّمت على استمارة فريق نجمة وكمر وأحب أرسل نماذج أعمالي.",
};

/* ---------- Starfield ---------- */
(function makeStars() {
  const wrap = document.getElementById("stars");
  if (!wrap) return;
  const count = window.innerWidth < 640 ? 60 : 110;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const s = document.createElement("span");
    s.className = "star";
    const size = (Math.sin(i * 12.9898) * 0.5 + 0.5) * 1.8 + 0.6;
    s.style.left = ((i * 53) % 100) + (i % 7) + "%";
    s.style.top = ((i * 29) % 100) + (i % 5) + "%";
    s.style.width = s.style.height = size.toFixed(1) + "px";
    s.style.setProperty("--dur", (3 + (i % 5)) + "s");
    s.style.setProperty("--delay", ((i % 9) * 0.4).toFixed(1) + "s");
    frag.appendChild(s);
  }
  wrap.appendChild(frag);
})();

/* ---------- Header scroll state ---------- */
const header = document.getElementById("header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 24);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

/* ---------- Reveal on scroll ---------- */
const io = new IntersectionObserver(
  (entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) {
        e.target.classList.add("in");
        io.unobserve(e.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
);
document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

/* ---------- Footer year ---------- */
document.getElementById("year").textContent = new Date().getFullYear();

/* ---------- Success links ---------- */
(function wireSuccessLinks() {
  const ig = document.getElementById("igLink");
  const wa = document.getElementById("waLink");
  if (ig) ig.href = CONFIG.INSTAGRAM_URL;
  if (wa) {
    const num = (CONFIG.WHATSAPP_NUMBER || "").replace(/\D/g, "");
    if (num) {
      wa.href =
        "https://wa.me/" + num + "?text=" + encodeURIComponent(CONFIG.WHATSAPP_MSG);
    } else {
      // no WhatsApp number set → hide the button, make Instagram primary
      wa.remove();
      if (ig) { ig.classList.remove("btn-ghost"); ig.classList.add("btn-primary"); }
    }
  }
})();

/* ============================================================
   WIZARD
   ============================================================ */
const form = document.getElementById("applyForm");
const steps = Array.from(form.querySelectorAll(".step"));
const prevBtn = document.getElementById("prevBtn");
const nextBtn = document.getElementById("nextBtn");
const submitBtn = document.getElementById("submitBtn");
const progressBar = document.getElementById("progressBar");
const stepLabel = document.getElementById("stepLabel");
const stepCount = document.getElementById("stepCount");
const formStatus = document.getElementById("formStatus");

const STEP_LABELS = {
  roles: "اختيار الوظيفة",
  basic: "المعلومات الأساسية",
  experience: "الخبرة العامة",
  florist: "منسقة الزهور",
  photographer: "مصورة الهاتف",
  callcenter: "الكول سنتر",
  commitment: "الالتزام والعمل",
  closing: "اللمسة الأخيرة",
};

// Arabic-Indic digits for the counter (feels native)
const toAr = (n) => String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

let order = []; // active step keys
let idx = 0;

function selectedRoles() {
  return Array.from(form.querySelectorAll('input[name="roles"]:checked')).map(
    (i) => i.dataset.role
  );
}

function buildOrder() {
  const roles = selectedRoles();
  order = steps
    .filter((s) => {
      const role = s.dataset.role;
      if (!role) return true; // always-on step
      return roles.includes(role); // conditional step
    })
    .map((s) => s.dataset.step);
}

function showStep(i, doScroll = true) {
  idx = Math.max(0, Math.min(i, order.length - 1));
  const key = order[idx];
  steps.forEach((s) => s.classList.toggle("active", s.dataset.step === key));

  const total = order.length;
  const human = idx + 1;
  progressBar.style.width = ((human / total) * 100).toFixed(1) + "%";
  stepLabel.textContent = STEP_LABELS[key] || "خطوة";
  stepCount.textContent = toAr(human) + " / " + toAr(total);

  prevBtn.hidden = idx === 0;
  const isLast = idx === total - 1;
  nextBtn.hidden = isLast;
  submitBtn.hidden = !isLast;

  // scroll the wizard into comfortable view (not on first paint)
  if (doScroll) {
    document
      .getElementById("wizard")
      .scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

/* ---------- Validation ---------- */
function clearError(field) {
  field.classList.remove("invalid");
}

function validateStep(key) {
  const stepEl = steps.find((s) => s.dataset.step === key);
  let ok = true;
  let firstBad = null;

  // roles step: at least one role
  if (key === "roles") {
    const chosen = selectedRoles().length > 0;
    const err = stepEl.querySelector('[data-error="roles"]');
    err.classList.toggle("show", !chosen);
    if (!chosen) firstBad = err;
    return chosen;
  }

  // text / textarea required
  stepEl.querySelectorAll("[data-required]").forEach((node) => {
    // group (radio/checkbox) required
    if (node.dataset.name) {
      const checked = stepEl.querySelector(
        `[name="${cssEscape(node.dataset.name)}"]:checked`
      );
      const field = node.closest(".field");
      if (!checked) {
        ok = false;
        if (field) field.classList.add("invalid");
        if (!firstBad) firstBad = field || node;
      } else if (field) clearError(field);
      return;
    }
    // input/textarea
    const field = node.closest(".field");
    const empty = !node.value.trim();
    if (empty) {
      ok = false;
      if (field) field.classList.add("invalid");
      if (!firstBad) firstBad = field || node;
    } else if (field) clearError(field);
  });

  if (firstBad && firstBad.scrollIntoView) {
    firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  return ok;
}

function cssEscape(str) {
  // minimal: we only need to use it inside an attribute selector value
  return str.replace(/"/g, '\\"');
}

/* ---------- Live error clearing ---------- */
form.addEventListener("input", (e) => {
  const field = e.target.closest(".field");
  if (field) clearError(field);
});
form.addEventListener("change", (e) => {
  const field = e.target.closest(".field");
  if (field) clearError(field);
  if (e.target.name === "roles") {
    const err = form.querySelector('[data-error="roles"]');
    if (err && selectedRoles().length) err.classList.remove("show");
  }
});

/* ---------- Navigation ---------- */
nextBtn.addEventListener("click", () => {
  const key = order[idx];
  if (!validateStep(key)) return;
  if (key === "roles") buildOrder(); // recompute conditional steps after role pick
  showStep(idx + 1);
});

prevBtn.addEventListener("click", () => showStep(idx - 1));

/* ---------- Pre-pick role from the role cards, then enter the form ---------- */
document.querySelectorAll("[data-pick]").forEach((link) => {
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const role = link.dataset.pick;
    const box = form.querySelector(`input[name="roles"][data-role="${role}"]`);
    if (box) box.checked = true; // radio → single selection
    // reset success state if it was shown
    form.hidden = false;
    document.getElementById("success").hidden = true;
    document.querySelector(".progress").style.display = "";
    buildOrder();
    // jump straight into the basic-info step for the chosen role
    const startAt = Math.max(order.indexOf("basic"), 0);
    showStep(startAt);
  });
});

/* ============================================================
   COLLECT + SUBMIT
   ============================================================ */
function collectData() {
  const answers = [];
  const seen = new Set();

  // ordered keys as they appear in the active steps
  order.forEach((key) => {
    const stepEl = steps.find((s) => s.dataset.step === key);
    stepEl.querySelectorAll("input, textarea").forEach((el) => {
      if (el.classList.contains("hp")) return;
      const name = el.name;
      if (!name || name === "company" || name === "roles") return;
      if (el.type === "radio") {
        if (el.checked) pushAnswer(answers, name, el.value);
      } else if (el.type === "checkbox") {
        if (el.checked) appendAnswer(answers, name, el.value);
      } else {
        const v = el.value.trim();
        if (v) pushAnswer(answers, name, v);
      }
    });
  });

  const roles = selectedRoles().map(
    (r) =>
      ({ photographer: "مصورة هاتف", florist: "منسقة زهور", callcenter: "كول سنتر وإدارة الحجوزات" }[r])
  );

  const get = (n) => {
    const a = answers.find((x) => x.q === n);
    return a ? a.a : "";
  };

  return {
    meta: {
      name: get("الاسم الثلاثي"),
      phone: get("رقم الهاتف / واتساب"),
      city: get("المدينة / المنطقة"),
      age: get("العمر"),
      roles,
    },
    answers,
    company: document.getElementById("hp").value, // honeypot
  };
}

function pushAnswer(arr, q, a) {
  arr.push({ q, a });
}
function appendAnswer(arr, q, a) {
  const existing = arr.find((x) => x.q === q);
  if (existing) existing.a += "، " + a;
  else arr.push({ q, a });
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = order[idx];
  if (!validateStep(key)) return;

  const payload = collectData();
  formStatus.textContent = "";
  formStatus.className = "form-status";
  submitBtn.classList.add("loading");
  submitBtn.disabled = true;

  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let data = {};
    try { data = await res.json(); } catch (_) {}

    if (!res.ok || !data.ok) {
      throw new Error(data.error || "تعذّر الإرسال");
    }

    showSuccess();
  } catch (err) {
    formStatus.textContent =
      "صار خطأ بالإرسال 😔 — حاولي مرة ثانية، أو تواصلي وياّنا على واتساب.";
    formStatus.classList.add("error");
    submitBtn.classList.remove("loading");
    submitBtn.disabled = false;
  }
});

function showSuccess() {
  form.hidden = true;
  document.querySelector(".progress").style.display = "none";
  const ok = document.getElementById("success");
  ok.hidden = false;
  ok.scrollIntoView({ behavior: "smooth", block: "center" });
}

/* ---------- Init ---------- */
buildOrder();
showStep(0, false);
