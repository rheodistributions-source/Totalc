import { getStore } from "@netlify/blobs";
export const db = () => getStore({ name: "tcs", consistency: "strong" });
export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
export const okKey = (k) => typeof k === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(k);
