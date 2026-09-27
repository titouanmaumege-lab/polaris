// Vercel Function — résumé IA de la Weekly Review (Gemini, offre gratuite).
// La clé ne doit jamais atteindre le navigateur : tout passe par ici.
// Même origine que l'app, donc la CSP (`connect-src 'self'`) autorise déjà l'appel.
//
// Variables d'environnement attendues côté Vercel :
//   GEMINI_API_KEY           — clé Google AI Studio (gratuite, sans carte bancaire)
//   GEMINI_MODEL             — optionnel, défaut ci-dessous
//   VITE_SUPABASE_URL        — déjà présente (build client)
//   VITE_SUPABASE_ANON_KEY   — déjà présente (build client)
//
// Aucune dépendance npm : fetch brut sur l'API Interactions.
// Réf. https://ai.google.dev/gemini-api/docs/interactions/text-generation

const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const API_REVISION = "2026-05-20";
const DEFAULT_MODEL = "gemini-3.8-flash";
const MAX_BODY_CHARS = 80_000;

const SCHEMA = {
  type: "object",
  required: ["winSummary", "lossSummary", "suggestWin", "suggestLoss", "suggestAmeliorer"],
  properties: {
    winSummary:       { type: "string", description: "2 à 3 phrases qui résument les victoires de la semaine." },
    lossSummary:      { type: "string", description: "2 à 3 phrases qui résument ce qui n'a pas marché." },
    suggestWin:       { type: "string", description: "Suggestion de WIN à écrire, 1 à 2 phrases." },
    suggestLoss:      { type: "string", description: "Suggestion de LOSS à écrire, 1 à 2 phrases." },
    suggestAmeliorer: { type: "string", description: "Suggestion d'axe d'amélioration, 1 à 2 phrases." },
  },
};

const SYSTEM = `Tu écris la rétrospective hebdomadaire de POLARIS, une app de pilotage personnel.

Règles :
- Français, tutoiement, ton direct et concret. Pas de coaching mièvre, pas d'emoji, pas de guillemets décoratifs.
- Appuie-toi UNIQUEMENT sur les données fournies. Cite des chiffres réels (heures de deep work, X/7 d'habitude, moyennes des jauges).
- N'invente jamais un fait absent des données. Si une catégorie est vide, dis-le en une demi-phrase plutôt que de broder.
- winSummary et lossSummary : tu synthétises ce qui s'est passé, au passé.
- suggestWin / suggestLoss / suggestAmeliorer : des propositions de texte que l'utilisateur pourra reprendre ou corriger. Écris-les à la première personne, comme s'il les avait notées lui-même.
- Chaque champ fait au maximum 320 caractères.`;

// Vérifie le JWT Supabase : sinon l'endpoint devient un proxy LLM ouvert.
async function verifyUser(token) {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon || !token) return false;
  try {
    const r = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    return r.ok;
  } catch {
    return false;
  }
}

// La réponse est une Interaction : une suite de `steps`. `output_text` est une
// commodité des SDK, pas garantie en REST — on retombe sur les blocs de contenu.
// On écarte les steps `thought` et `user_input`, qui ne sont pas la réponse.
function extractText(j) {
  if (typeof j?.output_text === "string" && j.output_text.trim()) return j.output_text;

  const out = [];
  const walk = node => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(walk);
    if (typeof node !== "object") return;
    if (typeof node.text === "string") out.push(node.text);
    walk(node.content);
    walk(node.parts);
  };

  const steps = Array.isArray(j?.steps) ? j.steps : [];
  const model = steps.filter(s => s?.type === "model_output");
  const usable = model.length ? model : steps.filter(s => s?.type !== "thought" && s?.type !== "user_input");
  walk(usable.length ? usable : j?.candidates);
  return out.join("");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: "ai_not_configured" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!(await verifyUser(token))) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  if (!body || typeof body.digest !== "string") {
    return res.status(400).json({ error: "bad_request" });
  }
  if (body.digest.length > MAX_BODY_CHARS) {
    return res.status(413).json({ error: "payload_too_large" });
  }

  try {
    const r = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "x-goog-api-key": key,
        "Content-Type": "application/json",
        "Api-Revision": API_REVISION,
      },
      body: JSON.stringify({
        model: process.env.GEMINI_MODEL || DEFAULT_MODEL,
        system_instruction: SYSTEM,
        input: body.digest,
        store: false,
        generation_config: { temperature: 0.7, max_output_tokens: 1200, thinking_level: "low" },
        response_format: { type: "text", mime_type: "application/json", schema: SCHEMA },
      }),
    });

    if (!r.ok) {
      const detail = (await r.text().catch(() => "")).slice(0, 300);
      // 429 = quota gratuit épuisé pour aujourd'hui, on le remonte tel quel.
      return res.status(r.status === 429 ? 429 : 502).json({ error: "upstream", status: r.status, detail });
    }

    const parsed = safeParse(extractText(await r.json()));
    if (!parsed) return res.status(502).json({ error: "bad_model_output" });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(502).json({ error: "upstream", detail: String(e?.message || e).slice(0, 200) });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
