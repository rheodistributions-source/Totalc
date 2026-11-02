// /api/ai  -  writes the AI reports. Needs ANTHROPIC_API_KEY in Netlify. Without it the app writes its own plain reports.
import { json } from "./_store.mjs";
export const config = { path: "/api/ai" };
export default async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return json({ error: "AI key not set" }, 501);
  let b; try { b = await req.json(); } catch { return json({ error: "bad request" }, 400); }
  const prompt = String(b.prompt || "").slice(0, 30000);
  if (!prompt) return json({ error: "empty" }, 400);
  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: process.env.AI_MODEL || "claude-sonnet-4-6", max_tokens: 1500, messages: [{ role: "user", content: prompt }] }),
    });
    const d = await r.json();
    const text = (d.content || []).map((c) => c.text || "").join("\n").trim();
    if (!r.ok || !text) return json({ error: (d.error && d.error.message) || "AI failed" }, 502);
    return json({ text });
  } catch (e) { return json({ error: String(e.message || e) }, 502); }
};
