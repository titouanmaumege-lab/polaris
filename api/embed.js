// Vercel Function — sert une page HTML intégrée (table knowledge_embeds) dans
// l'iframe de Base. Ex. PREPA BOOST, poussée par build_prepa_boost.py.
//
// Pourquoi une fonction : la CSP de l'app interdit les scripts inline et cdnjs,
// et une iframe srcdoc/blob hérite de cette CSP. Ici la page reçoit sa propre
// CSP, limitée à ce dont elle a besoin, et n'est intégrable que par POLARIS.
//
// Appel : <form method="POST" target="<iframe>"> avec token (JWT Supabase) et
// slug — un POST pour que le token n'apparaisse ni dans l'URL ni dans les logs.
// La ligne est lue avec le token de l'utilisateur : la RLS garantit qu'on ne
// sert que ses propres pages.
//
// Variables d'environnement : VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (déjà présentes).

const PAGE_CSP = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com",
  "img-src data: https:",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'self'",
].join("; ");

function send(res, status, html) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Content-Security-Policy", PAGE_CSP);
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "private, no-store");
  return res.status(status).send(html);
}

function message(title, detail) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B0714;color:#F4F2FF;font:14px system-ui,sans-serif;text-align:center;padding:24px;box-sizing:border-box}
b{display:block;font-size:15px;margin-bottom:6px}span{color:#9990C0}</style></head>
<body><div><b>${title}</b><span>${detail}</span></div></body></html>`;
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return Object.fromEntries(new URLSearchParams(String(req.body || ""))); } catch { return {}; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, message("Méthode non autorisée", ""));
  }
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !anon) return send(res, 503, message("Indisponible", "Configuration Supabase manquante."));

  const { token = "", slug = "" } = readBody(req);
  if (!token) return send(res, 401, message("Session expirée", "Recharge la page."));
  if (!/^[a-z0-9-]{1,64}$/.test(slug)) return send(res, 400, message("Page inconnue", ""));

  try {
    const r = await fetch(`${url}/rest/v1/knowledge_embeds?slug=eq.${slug}&select=html&limit=1`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    if (r.status === 401 || r.status === 403) return send(res, 401, message("Session expirée", "Recharge la page."));
    if (!r.ok) return send(res, 502, message("Page indisponible", "Lecture impossible pour le moment."));
    const rows = await r.json();
    if (!rows?.[0]?.html) {
      return send(res, 404, message("Pas encore publiée", "Elle apparaîtra au prochain lancement du script de génération."));
    }
    return send(res, 200, rows[0].html);
  } catch {
    return send(res, 502, message("Page indisponible", "Lecture impossible pour le moment."));
  }
}
