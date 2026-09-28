import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const LS_KEYS = ["lp_habits", "leplan_todos", "lp_goals", "lp_daily", "lp_workperf", "lp_highlight", "lp_view_mode", "lp_weekly_reviews", "lp_weekly_objectives"];

export async function loadUserData(userId) {
  const { data, error } = await supabase
    .from("user_data")
    .select("*")
    .eq("id", userId)
    .single();
  if (error && error.code !== "PGRST116") throw error;
  return data;
}

export async function syncToSupabase(userId) {
  const payload = {
    id: userId,
    habits:          JSON.parse(localStorage.getItem("lp_habits")           || "[]"),
    todos:           JSON.parse(localStorage.getItem("leplan_todos")        || "[]"),
    goals:           JSON.parse(localStorage.getItem("lp_goals")            || "{}"),
    daily:           JSON.parse(localStorage.getItem("lp_daily")            || "{}"),
    workperf:        JSON.parse(localStorage.getItem("lp_workperf")         || "[]"),
    highlight:       JSON.parse(localStorage.getItem("lp_highlight")        || "{}"),
    weekly_reviews:  JSON.parse(localStorage.getItem("lp_weekly_reviews")   || "[]"),
    weekly_objectives: JSON.parse(localStorage.getItem("lp_weekly_objectives") || "[]"),
    view_mode:       localStorage.getItem("lp_view_mode") || "pc",
    updated_at:      new Date().toISOString(),
  };
  let { error } = await supabase.from("user_data").upsert(payload);
  // Migration 012 pas encore appliquée : on synchronise le reste plutôt que
  // de bloquer toute la sauvegarde sur une colonne manquante.
  if (error && /weekly_objectives/.test(error.message || "")) {
    const { weekly_objectives, ...rest } = payload;
    ({ error } = await supabase.from("user_data").upsert(rest));
  }
  if (error) {
    console.error("Supabase sync error:", error);
    window._syncStatus = "error: " + error.message;
    // Propagé : sans ça, setLS() affichait « ok » sur un upsert échoué.
    throw error;
  }
  window._syncStatus = "ok @ " + new Date().toLocaleTimeString();
}

const hasContent = v => {
  if (!v) return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v).length > 0;
  return Boolean(v);
};

export function hydrateLocalStorage(data) {
  if (!data) return;
  if (hasContent(data.habits))          localStorage.setItem("lp_habits",          JSON.stringify(data.habits));
  if (hasContent(data.todos))           localStorage.setItem("leplan_todos",       JSON.stringify(data.todos));
  if (hasContent(data.goals))           localStorage.setItem("lp_goals",           JSON.stringify(data.goals));
  if (hasContent(data.daily))           localStorage.setItem("lp_daily",           JSON.stringify(data.daily));
  if (hasContent(data.workperf))        localStorage.setItem("lp_workperf",        JSON.stringify(data.workperf));
  if (hasContent(data.highlight))       localStorage.setItem("lp_highlight",       JSON.stringify(data.highlight));
  if (hasContent(data.weekly_reviews))  localStorage.setItem("lp_weekly_reviews",  JSON.stringify(data.weekly_reviews));
  if (data.view_mode)                   localStorage.setItem("lp_view_mode",       data.view_mode);
  // Fusion par id plutôt qu'écrasement : avant la synchro, chaque appareil a pu
  // accumuler ses propres objectifs en local. Le serveur gagne en cas de conflit.
  if (hasContent(data.weekly_objectives)) {
    const local = JSON.parse(localStorage.getItem("lp_weekly_objectives") || "[]");
    const byId = new Map(local.map(o => [o.id, o]));
    data.weekly_objectives.forEach(o => byId.set(o.id, o));
    localStorage.setItem("lp_weekly_objectives", JSON.stringify([...byId.values()]));
  }
}
