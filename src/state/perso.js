// Store de personnalisation. AVANT : 5 globals mutables (let WP_TYPES / DJ_TYPES /
// SPHERES / WP_DOMAINES / WP_CATEGORIES) dans App.jsx, réassignés à la sauvegarde.
// Impossible à partager entre fichiers (les bindings let ne sont pas live cross-module).
// On expose un objet P : la lecture de P.xxx est toujours à jour partout.
import { getLS } from "../utils/storage";

const _D_DOMAINES = ["BUSINESS","MASTER","PRÉPA","STAGE","MÉMOIRE","FORMATIONS PP","PROJET PERSO","PERSO","CLIENT","OPTIMISATION","AUTRE"];
const _D_WP_TYPES = ["DEEP","SHALLOW","COURS","GROUPE"];
const _D_DJ_TYPES = ["Journée classique","Journée libre","Weekend","Voyage","Jour off","Jour spécial"];
const _D_SPHERES  = { business:{label:"💸 Business",c:"#8b5cf6"}, master:{label:"📚 Master",c:"#3b82f6"}, sport:{label:"⚡ Sport",c:"#10b981"}, perso:{label:"👁 Perso",c:"#f59e0b"}, pro:{label:"🧑‍💻 Pro",c:"#ec4899"} };

const _saved = getLS("lp_personalization", {});

export const P = {
  domaines:     _saved.domaines || _D_DOMAINES,
  wpCategories: _saved.domaines || _D_DOMAINES,
  wpTypes:      _saved.wpTypes  || _D_WP_TYPES,
  djTypes:      _saved.djTypes  || _D_DJ_TYPES,
  spheres:      _saved.spheres  || _D_SPHERES,
};

// Applique une nouvelle config perso (appelé par handleSavePerso).
export const applyPerso = (p) => {
  P.domaines     = p.domaines;
  P.wpCategories = p.domaines;
  P.wpTypes      = p.wpTypes;
  P.djTypes      = p.djTypes;
  P.spheres      = p.spheres;
};
