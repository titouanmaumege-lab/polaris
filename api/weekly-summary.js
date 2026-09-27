// Vercel Function — résumé IA de la Weekly Review.
// La clé Anthropic ne doit jamais atteindre le navigateur : tout passe par ici.
// Même origine que l'app, donc la CSP (`connect-src 'self'`) autorise déjà l'appel.
//
// Variables d'environnement attendues côté Vercel :
//   ANTHROPIC_API_KEY        — clé API Anthropic
//   VITE_SUPABASE_URL        — déjà présente (build client)
//   VITE_SUPABASE_ANON_KEY   — déjà présente (build client)
import Anthropic from "@anthropic-ai/sdk";

const MAX_BODY_BYTES = 80_000;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: "ai_not_configured" });
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!(await verifyUser(token))) {
    return res.status(401).json({ error: "unauthorized" });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body;
  if (!body || typeof body.digest !== "string") {
    return res.status(400).json({ error: "bad_request" });
  }
  if (body.digest.length > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "payload_too_large" });
  }

  try {
    const client = new Anthropic();
    const message = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 2000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [{ role: "user", content: body.digest }],
    });

    if (message.stop_reason === "refusal") {
      return res.status(502).json({ error: "refused" });
    }
    const text = message.content.filter(b => b.type === "text").map(b => b.text).join("");
    const parsed = safeParse(text);
    if (!parsed) return res.status(502).json({ error: "bad_model_output" });

    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(parsed);
  } catch (e) {
    const status = e?.status === 429 ? 429 : 502;
    return res.status(status).json({ error: "upstream", detail: e?.message?.slice(0, 200) });
  }
}

function safeParse(s) {
  try { return JSON.parse(s); } catch { return null; }
}
