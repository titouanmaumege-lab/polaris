// Dernière erreur d'écriture Supabase du module Finances.
//
// Les hooks faisaient `console.error(...); return null`, et l'UI affichait
// « Modifié » quoi qu'il arrive : un échec d'écriture était indiscernable d'un
// succès. On garde l'erreur ici pour pouvoir la montrer à l'écran.

let last = null;
const listeners = new Set();

export const setFinanceError = (where, error) => {
  last = error ? { where, message: error.message || String(error), code: error.code || null } : null;
  console.error(`[finances] ${where}:`, error);
  listeners.forEach(fn => fn(last));
  return last;
};

export const getFinanceError = () => last;

export const clearFinanceError = () => { last = null; listeners.forEach(fn => fn(null)); };

export const onFinanceError = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// Une colonne ou une table manquante = migration non appliquée. C'est un cas
// distinct d'une vraie panne : le message doit dire quoi faire.
export const isSchemaError = (e) => {
  if (!e) return false;
  const m = (e.message || "").toLowerCase();
  return e.code === "42703" || e.code === "42P01" || e.code === "PGRST204"
    || m.includes("does not exist") || m.includes("schema cache");
};

// Message court et actionnable pour un toast.
export const financeErrorText = (e) => {
  if (!e) return "Échec de l'enregistrement";
  if (isSchemaError(e)) return "Base non à jour — migration SQL à appliquer";
  return `Échec : ${e.message}`;
};
