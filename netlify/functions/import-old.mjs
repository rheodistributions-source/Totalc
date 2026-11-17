// /api/import-old  -  pull the old site's data into this site. GET ?dry=1 = preview only. POST = import (needs the Top Management code).
import { json } from "./_store.mjs";
import { importOld } from "./_oldimport.mjs";
export const config = { path: "/api/import-old" };
export default async (req) => {
  const u = new URL(req.url), need = String(process.env.OPS_CODE || "8910");
  const dry = req.method !== "POST";
  if (!dry && String(req.headers.get("x-unlock-code") || "") !== need) return json({ error: "wrong code" }, 403);
  try { return json({ ok: true, dry, ...(await importOld(dry)) }); }
  catch (e) { return json({ error: String(e && e.message || e) }, 502); }
};
