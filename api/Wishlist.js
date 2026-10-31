// api/Wishlist.js
// Safe public-data proxy only. Does not accept or store game credentials/tokens.
const SOURCES = {
  catalog: "https://macxtools.vercel.app/api/itemdata",
  version: "https://macxtools.vercel.app/api/version"
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const type = String(req.query.type || "catalog").toLowerCase();
  const source = SOURCES[type];
  if (!source) return res.status(400).json({ error: "Unsupported type. Use catalog or version." });

  try {
    const upstream = await fetch(source, { headers: { Accept: "application/json" } });
    if (!upstream.ok) {
      return res.status(502).json({ error: `Upstream returned HTTP ${upstream.status}` });
    }
    const data = await upstream.json();
    if (type === "catalog" && (!data || typeof data !== "object" || Array.isArray(data))) {
      return res.status(502).json({ error: "Unexpected catalog format" });
    }
    if (type === "version" && (!data || typeof data.version !== "string")) {
      return res.status(502).json({ error: "Unexpected version format" });
    }
    return res.status(200).json(data);
  } catch (error) {
    return res.status(502).json({ error: "Unable to contact upstream API", detail: error.message });
  }
}
