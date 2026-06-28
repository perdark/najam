// Shared storage layer — persists applications to a private Vercel Blob store.
// One blob per application: apps/<roleSlug>/<ts>-<rand>.json  (race-free, easy to query)
import { put, list, get } from "@vercel/blob";

const token = () => process.env.BLOB_READ_WRITE_TOKEN;

export const ROLE_SLUG = {
  "مصورة هاتف": "photographer",
  "منسقة زهور": "florist",
  "كول سنتر وإدارة الحجوزات": "callcenter",
  "تصميم جرافيك": "graphic",
  "موارد بشرية": "hr",
};
export const SLUG_LABEL = {
  photographer: "مصورة هاتف",
  florist: "منسقة زهور",
  callcenter: "كول سنتر وإدارة الحجوزات",
  graphic: "تصميم جرافيك",
  hr: "موارد بشرية",
  other: "أخرى",
};

export function roleSlug(roleLabel) {
  return ROLE_SLUG[roleLabel] || "other";
}

// Save one application. Returns the blob pathname (its id).
export async function saveApplication(app, rand) {
  const slug = roleSlug(app?.meta?.roles?.[0]);
  const id = `${Date.now()}-${rand || "x"}`;
  const pathname = `apps/${slug}/${id}.json`;
  await put(pathname, JSON.stringify(app), {
    access: "private",
    token: token(),
    addRandomSuffix: false,
    allowOverwrite: false,
    contentType: "application/json",
  });
  return pathname;
}

// List all blob metadata under a prefix (handles pagination).
export async function listAll(prefix = "apps/") {
  const out = [];
  let cursor;
  do {
    const res = await list({ token: token(), prefix, cursor, limit: 1000 });
    out.push(...res.blobs);
    cursor = res.hasMore ? res.cursor : undefined;
  } while (cursor);
  return out;
}

// Counts: total + per role.
export async function counts() {
  const blobs = await listAll("apps/");
  const c = { total: blobs.length, photographer: 0, florist: 0, callcenter: 0, graphic: 0, hr: 0, other: 0 };
  for (const b of blobs) {
    const seg = b.pathname.split("/")[1];
    if (c[seg] !== undefined) c[seg]++;
    else c.other++;
  }
  return c;
}

// Read one application by pathname.
export async function readApp(pathname) {
  const g = await get(pathname, { access: "private", token: token() });
  const text = await new Response(g.stream).text();
  return JSON.parse(text);
}

// Latest N application records (optionally filtered by role slug). Reads content.
export async function latest(n = 5, slug) {
  const prefix = slug ? `apps/${slug}/` : "apps/";
  const blobs = await listAll(prefix);
  blobs.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
  const top = blobs.slice(0, n);
  const apps = [];
  for (const b of top) {
    try {
      apps.push({ pathname: b.pathname, uploadedAt: b.uploadedAt, ...(await readApp(b.pathname)) });
    } catch {
      /* skip unreadable */
    }
  }
  return apps;
}
