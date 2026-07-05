// Pages légales publiques : /mentions-legales, /confidentialite, /cgu.
// Rendues hors AuthGate (accessibles sans compte — exigence RGPD art. 13 :
// l'information doit être lisible AVANT l'inscription).
import { C } from "../../ui/tokens";
import PolarisLogo from "../../PolarisLogo";

/* ------------------------------------------------------------------ */
/* Coordonnées éditeur — placeholders à compléter (voir docs/conformite) */
const EDITEUR = {
  nom: "[Prénom NOM]",                        // à compléter
  statut: "Entrepreneur individuel (EI)",
  siret: "[SIRET à compléter]",
  adresse: "[Adresse professionnelle à compléter]",
  email: "[email de contact à compléter]",    // ex. privacy@…
  directeurPublication: "[Prénom NOM]",       // à compléter
};
const HEBERGEUR = {
  nom: "Vercel Inc.",
  adresse: "440 N Barranca Ave #4133, Covina, CA 91723, États-Unis",
  tel: "+1 (559) 288-7060",
};
const DERNIERE_MAJ = "5 juillet 2026";
/* ------------------------------------------------------------------ */

export const LEGAL_ROUTES = {
  "/mentions-legales": "mentions",
  "/confidentialite": "confidentialite",
  "/cgu": "cgu",
};

const S = {
  page: { minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "var(--font-body)" },
  wrap: { maxWidth: 780, margin: "0 auto", padding: "40px 20px 80px" },
  h1: { fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 800, letterSpacing: "-0.01em", margin: "18px 0 6px" },
  updated: { color: C.faint, fontSize: 12, marginBottom: 28 },
  h2: { fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700, color: C.text, margin: "34px 0 10px", paddingBottom: 6, borderBottom: `1px solid ${C.border}` },
  h3: { fontSize: 15, fontWeight: 700, color: C.text, margin: "20px 0 6px" },
  p: { fontSize: 14, lineHeight: 1.7, color: C.muted, margin: "0 0 12px" },
  strong: { color: C.text, fontWeight: 600 },
  ul: { fontSize: 14, lineHeight: 1.7, color: C.muted, margin: "0 0 12px", paddingLeft: 22 },
  tableWrap: { overflowX: "auto", margin: "0 0 12px" },
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13, lineHeight: 1.5 },
  th: { textAlign: "left", padding: "8px 10px", color: C.text, fontWeight: 700, borderBottom: `1px solid ${C.borderMid}`, whiteSpace: "nowrap" },
  td: { padding: "8px 10px", color: C.muted, borderBottom: `1px solid ${C.border}`, verticalAlign: "top" },
  card: { background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: "16px 18px", margin: "0 0 12px" },
  warn: { background: C.amberBg, border: `1px solid rgba(245,158,11,0.35)`, borderRadius: 12, padding: "14px 18px", margin: "0 0 12px", color: C.text, fontSize: 14, lineHeight: 1.65 },
  a: { color: C.accent, textDecoration: "none" },
};

function Th({ children }) { return <th style={S.th}>{children}</th>; }
function Td({ children }) { return <td style={S.td}>{children}</td>; }
function B({ children }) { return <span style={S.strong}>{children}</span>; }

export function LegalFooter({ compact }) {
  const links = [
    ["/mentions-legales", "Mentions légales"],
    ["/confidentialite", "Confidentialité"],
    ["/cgu", "CGU"],
  ];
  return (
    <footer style={{
      display: "flex", flexWrap: "wrap", gap: compact ? 12 : 18, justifyContent: "center",
      padding: compact ? "14px 12px" : "22px 12px calc(env(safe-area-inset-bottom) + 88px)",
      fontSize: 11.5, color: C.faint,
    }}>
      {links.map(([href, label]) => (
        <a key={href} href={href} style={{ color: C.faint, textDecoration: "none" }}
          onMouseEnter={e => e.currentTarget.style.color = C.muted}
          onMouseLeave={e => e.currentTarget.style.color = C.faint}>
          {label}
        </a>
      ))}
      <span style={{ color: C.faint }}>© {new Date().getFullYear()} POLARIS</span>
    </footer>
  );
}

function LegalShell({ title, children }) {
  return (
    <div style={S.page}>
      <div style={S.wrap}>
        <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 10, textDecoration: "none", color: C.muted, fontSize: 13 }}>
          <PolarisLogo size={34} />
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, letterSpacing: "0.05em", color: C.text }}>POLARIS</span>
          <span style={{ color: C.faint }}>← Retour à l'application</span>
        </a>
        <h1 style={S.h1}>{title}</h1>
        <div style={S.updated}>Dernière mise à jour : {DERNIERE_MAJ}</div>
        {children}
        <div style={{ borderTop: `1px solid ${C.border}`, marginTop: 40 }}>
          <LegalFooter compact />
        </div>
      </div>
    </div>
  );
}

/* ============================ MENTIONS LÉGALES ============================ */

function MentionsLegales() {
  return (
    <LegalShell title="Mentions légales">
      <p style={S.p}>Informations fournies en application de l'article 6-III de la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l'économie numérique (LCEN).</p>

      <h2 style={S.h2}>Éditeur du site</h2>
      <div style={S.card}>
        <p style={S.p}><B>{EDITEUR.nom}</B> — {EDITEUR.statut}</p>
        <p style={S.p}>SIRET : {EDITEUR.siret}</p>
        <p style={S.p}>Adresse : {EDITEUR.adresse}</p>
        <p style={S.p}>Contact : <a style={S.a} href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a></p>
        <p style={{ ...S.p, marginBottom: 0 }}>TVA non applicable, article 293 B du Code général des impôts.</p>
      </div>

      <h2 style={S.h2}>Directeur de la publication</h2>
      <p style={S.p}>{EDITEUR.directeurPublication}</p>

      <h2 style={S.h2}>Hébergeur</h2>
      <div style={S.card}>
        <p style={S.p}><B>{HEBERGEUR.nom}</B></p>
        <p style={S.p}>{HEBERGEUR.adresse}</p>
        <p style={{ ...S.p, marginBottom: 0 }}>Téléphone : {HEBERGEUR.tel}</p>
      </div>
      <p style={S.p}>Les données applicatives sont stockées par Supabase Inc. sur des serveurs situés dans l'Union européenne (AWS, région <B>eu-west-1</B>, Irlande). Voir la <a style={S.a} href="/confidentialite">politique de confidentialité</a>.</p>

      <h2 style={S.h2}>Propriété intellectuelle</h2>
      <p style={S.p}>L'ensemble du site POLARIS — structure, interface, textes, graphismes, logo et code — est protégé par le droit de la propriété intellectuelle. Toute reproduction, représentation, modification ou adaptation, totale ou partielle, sans autorisation écrite préalable de l'éditeur est interdite.</p>
      <p style={S.p}>La dénomination « POLARIS », le logo et l'identité visuelle associée sont la propriété exclusive de l'éditeur.</p>
      <p style={S.p}>Les contenus créés par les utilisateurs dans l'application (notes, objectifs, journaux, données financières) restent la propriété exclusive de leurs auteurs — voir les <a style={S.a} href="/cgu">CGU</a>.</p>
    </LegalShell>
  );
}

/* ======================= POLITIQUE DE CONFIDENTIALITÉ ===================== */

function Confidentialite() {
  return (
    <LegalShell title="Politique de confidentialité">
      <p style={S.p}>Cette politique décrit comment POLARIS traite vos données personnelles, conformément au Règlement (UE) 2016/679 (« RGPD ») et à la loi Informatique et Libertés. Elle vous est présentée avant toute inscription (art. 13 RGPD).</p>

      <h2 style={S.h2}>1. Responsable de traitement</h2>
      <p style={S.p}><B>{EDITEUR.nom}</B>, {EDITEUR.statut}, {EDITEUR.adresse} — <a style={S.a} href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a>.</p>

      <h2 style={S.h2}>2. Données collectées</h2>
      <p style={S.p}>POLARIS ne collecte que les données que vous saisissez vous-même, plus le strict nécessaire technique. Aucune donnée n'est collectée en arrière-plan (pas de traceur publicitaire, pas de mesure d'audience).</p>
      <div style={S.tableWrap}><table style={S.table}>
        <thead><tr><Th>Catégorie</Th><Th>Données</Th></tr></thead>
        <tbody>
          <tr><Td><B>Compte</B></Td><Td>Adresse email, mot de passe (haché, jamais stocké en clair), horodatages de connexion</Td></tr>
          <tr><Td><B>Bien-être — données de santé</B></Td><Td>Journal quotidien : niveaux d'énergie, de concentration, de stress et de bonheur ; bilans et remarques en texte libre ; habitudes à caractère santé (sommeil, sport…) ; objectifs de forme physique</Td></tr>
          <tr><Td><B>Organisation personnelle</B></Td><Td>Habitudes, tâches, objectifs, sessions de travail, revues hebdomadaires, notes et bases de connaissances</Td></tr>
          <tr><Td><B>Finances personnelles</B></Td><Td>Comptes, transactions, budgets, abonnements, dettes, investissements (saisis manuellement — aucune connexion bancaire)</Td></tr>
          <tr><Td><B>Partage</B></Td><Td>Email des membres lorsque vous partagez une base de connaissances</Td></tr>
          <tr><Td><B>Technique</B></Td><Td>Adresse IP et user-agent dans les journaux techniques de nos hébergeurs</Td></tr>
        </tbody>
      </table></div>
      <div style={S.warn}>⚠️ <B>Données de bien-être :</B> les niveaux d'énergie, de stress, de concentration et de bonheur, ainsi que vos bilans quotidiens, sont des <B>données de santé</B> au sens de l'article 9 du RGPD. Elles ne sont traitées qu'avec votre <B>consentement explicite</B>, recueilli séparément à l'inscription, et que vous pouvez retirer à tout moment dans les réglages.</div>

      <h2 style={S.h2}>3. Finalités et bases légales</h2>
      <div style={S.tableWrap}><table style={S.table}>
        <thead><tr><Th>Traitement</Th><Th>Finalité</Th><Th>Base légale</Th></tr></thead>
        <tbody>
          <tr><Td>Compte et authentification</Td><Td>Créer et sécuriser votre compte</Td><Td>Exécution du contrat (art. 6(1)(b))</Td></tr>
          <tr><Td>Journal de bien-être</Td><Td>Auto-suivi de votre état quotidien</Td><Td><B>Consentement explicite (art. 9(2)(a))</B></Td></tr>
          <tr><Td>Organisation personnelle, finances, notes</Td><Td>Fournir les fonctionnalités de l'application</Td><Td>Exécution du contrat (art. 6(1)(b))</Td></tr>
          <tr><Td>Partage de bases</Td><Td>Permettre l'invitation de membres</Td><Td>Exécution du contrat (art. 6(1)(b))</Td></tr>
          <tr><Td>Journaux techniques</Td><Td>Sécurité et diagnostic</Td><Td>Intérêt légitime (art. 6(1)(f))</Td></tr>
        </tbody>
      </table></div>
      <p style={S.p}>Aucune décision automatisée ni profilage produisant des effets juridiques n'est réalisé. Vos données ne sont jamais vendues ni utilisées à des fins publicitaires.</p>

      <h2 style={S.h2}>4. Durées de conservation</h2>
      <div style={S.tableWrap}><table style={S.table}>
        <thead><tr><Th>Données</Th><Th>Durée</Th></tr></thead>
        <tbody>
          <tr><Td>Données de compte et contenus</Td><Td>Durée de vie du compte, puis suppression complète dans les 30 jours suivant la suppression du compte</Td></tr>
          <tr><Td>Données de bien-être</Td><Td>Idem ; suppression anticipée possible dès le retrait du consentement</Td></tr>
          <tr><Td>Journaux techniques</Td><Td>12 mois maximum</Td></tr>
          <tr><Td>Copies de sauvegarde</Td><Td>Écrasées au plus tard 30 jours après la suppression</Td></tr>
        </tbody>
      </table></div>

      <h2 style={S.h2}>5. Destinataires et sous-traitants</h2>
      <p style={S.p}>Vos données ne sont accessibles qu'à vous (et aux membres que vous invitez explicitement sur une base partagée). Elles sont traitées techniquement par :</p>
      <div style={S.tableWrap}><table style={S.table}>
        <thead><tr><Th>Sous-traitant</Th><Th>Rôle</Th><Th>Localisation</Th><Th>Encadrement</Th></tr></thead>
        <tbody>
          <tr><Td>Supabase Inc.</Td><Td>Base de données, authentification, emails de compte</Td><Td><B>Union européenne</B> (AWS eu-west-1, Irlande)</Td><Td>Accord de sous-traitance (DPA) incluant les clauses contractuelles types de la Commission européenne</Td></tr>
          <tr><Td>Vercel Inc.</Td><Td>Hébergement de l'interface, réseau de diffusion, journaux techniques</Td><Td>États-Unis / points de présence mondiaux</Td><Td>DPA avec clauses contractuelles types ; certification EU-U.S. Data Privacy Framework</Td></tr>
          <tr><Td>Amazon Web Services</Td><Td>Infrastructure sous-jacente de Supabase</Td><Td>Union européenne (Irlande)</Td><Td>Sous-traitant ultérieur, DPA AWS</Td></tr>
        </tbody>
      </table></div>
      <p style={S.p}>Vos contenus (journal, finances, notes) sont stockés au repos dans l'Union européenne. Les transferts résiduels vers les États-Unis (diffusion de l'interface, journaux techniques) sont encadrés par les mécanismes ci-dessus.</p>

      <h2 style={S.h2}>6. Vos droits</h2>
      <p style={S.p}>Vous disposez des droits d'<B>accès</B>, de <B>rectification</B>, d'<B>effacement</B>, de <B>portabilité</B>, de <B>limitation</B> et d'<B>opposition</B>, ainsi que du droit de <B>retirer votre consentement à tout moment</B> (sans affecter la licéité des traitements antérieurs).</p>
      <ul style={S.ul}>
        <li>Directement dans l'application : export de vos données, retrait du consentement bien-être, suppression du compte (réglages).</li>
        <li>Par email : <a style={S.a} href={`mailto:${EDITEUR.email}`}>{EDITEUR.email}</a> — réponse sous un mois maximum.</li>
      </ul>
      <p style={S.p}>Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une réclamation à la CNIL : <a style={S.a} href="https://www.cnil.fr" target="_blank" rel="noreferrer">www.cnil.fr</a>.</p>

      <h2 style={S.h2}>7. Cookies et stockage local</h2>
      <p style={S.p}>POLARIS ne dépose <B>aucun cookie publicitaire ni de mesure d'audience</B>. Sont utilisés uniquement :</p>
      <ul style={S.ul}>
        <li>Un jeton de session (stockage local du navigateur) — strictement nécessaire à l'authentification, exempté de consentement.</li>
        <li>Le stockage local de vos données applicatives sur votre appareil, pour le fonctionnement hors-ligne et la fluidité de l'interface.</li>
      </ul>
      <p style={S.p}>Si vous intégrez des contenus externes (vidéos YouTube, tableaux Miro) dans vos notes, ces services tiers peuvent déposer leurs propres traceurs lors de l'affichage du contenu intégré. Ces intégrations résultent de votre action volontaire.</p>

      <h2 style={S.h2}>8. Sécurité</h2>
      <ul style={S.ul}>
        <li>Chiffrement des échanges (HTTPS/TLS) et des données au repos (AES-256).</li>
        <li>Cloisonnement strict des comptes : des règles de sécurité au niveau de la base de données (Row Level Security) garantissent que chaque utilisateur n'accède qu'à ses propres données.</li>
        <li>Mots de passe hachés (bcrypt) — jamais stockés ni transmis en clair.</li>
        <li>Limitation du nombre de tentatives de connexion.</li>
      </ul>
      <p style={S.p}>En cas de violation de données susceptible d'engendrer un risque pour vos droits, vous et la CNIL serez notifiés conformément aux articles 33 et 34 du RGPD.</p>
    </LegalShell>
  );
}

/* ================================ CGU ==================================== */

function CGU() {
  return (
    <LegalShell title="Conditions générales d'utilisation">
      <h2 style={S.h2}>1. Objet</h2>
      <p style={S.p}>POLARIS est une application web personnelle de suivi et d'organisation : habitudes, objectifs, journal quotidien de bien-être, sessions de travail, finances personnelles et bases de connaissances. Les présentes CGU régissent l'accès et l'utilisation du service, édité par {EDITEUR.nom} ({EDITEUR.statut}).</p>
      <p style={S.p}>L'utilisation du service vaut acceptation pleine et entière des présentes CGU, recueillie explicitement lors de la création du compte.</p>

      <h2 style={S.h2}>2. Avertissement — POLARIS n'est pas un dispositif médical</h2>
      <div style={S.warn}>
        <B>POLARIS est un outil de suivi personnel.</B> Il ne fournit aucun conseil médical, aucun diagnostic, aucune recommandation thérapeutique, et ne remplace en aucun cas l'avis d'un professionnel de santé. Les indicateurs de bien-être (énergie, stress, bonheur…) sont de simples auto-évaluations subjectives, sans valeur clinique. En cas de difficulté touchant à votre santé physique ou mentale, consultez un professionnel de santé. En cas de détresse, contactez le 3114 (prévention du suicide, gratuit, 24h/24) ou le 15.
      </div>

      <h2 style={S.h2}>3. Accès au service et compte</h2>
      <ul style={S.ul}>
        <li>La création d'un compte requiert une adresse email valide et un mot de passe. Vous êtes responsable de la confidentialité de vos identifiants et des activités réalisées depuis votre compte.</li>
        <li>Le service est destiné aux personnes d'au moins 15 ans (âge du consentement numérique en France, art. 45 de la loi Informatique et Libertés). </li>
        <li>Vous vous engagez à un usage strictement personnel et licite du service, et à ne pas tenter d'accéder aux données d'autrui, de perturber le service ou d'en contourner les mesures de sécurité.</li>
      </ul>

      <h2 style={S.h2}>4. Propriété des données</h2>
      <p style={S.p}><B>Vos données vous appartiennent.</B> L'éditeur ne revendique aucun droit de propriété sur les contenus que vous créez (journaux, notes, objectifs, données financières). Vous pouvez les exporter à tout moment (format JSON) et supprimer votre compte — et l'intégralité des données associées — directement depuis les réglages de l'application.</p>

      <h2 style={S.h2}>5. Disponibilité et évolution du service</h2>
      <p style={S.p}>Le service est fourni « en l'état » et accessible 24h/24 dans la mesure du possible. L'éditeur ne garantit pas une disponibilité ininterrompue : maintenances, mises à jour, pannes des hébergeurs ou cas de force majeure peuvent entraîner des interruptions temporaires. Les fonctionnalités peuvent évoluer ; en cas de modification substantielle des présentes CGU, vous en serez informé et les nouvelles conditions vous seront soumises.</p>

      <h2 style={S.h2}>6. Responsabilité</h2>
      <ul style={S.ul}>
        <li>L'éditeur met en œuvre des mesures de sécurité conformes à l'état de l'art (voir la <a style={S.a} href="/confidentialite">politique de confidentialité</a>) mais ne peut garantir une sécurité absolue.</li>
        <li>L'éditeur n'est pas responsable des décisions (personnelles, financières, de santé) que vous prenez sur la base des informations que vous saisissez ou visualisez dans l'application. Les fonctionnalités financières sont de simples outils de suivi manuel et ne constituent ni un conseil en investissement ni un service bancaire.</li>
        <li>La responsabilité de l'éditeur, quelle qu'en soit la cause, est limitée aux dommages directs et prévisibles, dans les limites permises par la loi. Rien dans les présentes n'exclut la responsabilité en cas de faute lourde, de dol ou de dommage corporel.</li>
      </ul>

      <h2 style={S.h2}>7. Résiliation</h2>
      <p style={S.p}>Vous pouvez supprimer votre compte à tout moment depuis les réglages ; la suppression est définitive et vos données sont effacées dans les conditions décrites dans la politique de confidentialité. L'éditeur peut suspendre ou résilier un compte en cas de violation des présentes CGU, après notification par email restée sans effet sous 15 jours (sauf urgence ou obligation légale).</p>

      <h2 style={S.h2}>8. Droit applicable et juridiction</h2>
      <p style={S.p}>Les présentes CGU sont soumises au <B>droit français</B>. En cas de litige, une solution amiable sera recherchée en priorité ({EDITEUR.email}). À défaut, le litige sera porté devant les juridictions françaises compétentes. Conformément au code de la consommation, vous pouvez recourir gratuitement à un médiateur de la consommation ; les coordonnées du médiateur compétent seront communiquées sur demande. Plateforme européenne de règlement en ligne des litiges : <a style={S.a} href="https://ec.europa.eu/consumers/odr" target="_blank" rel="noreferrer">ec.europa.eu/consumers/odr</a>.</p>
    </LegalShell>
  );
}

export default function LegalPage({ slug }) {
  if (slug === "mentions") return <MentionsLegales />;
  if (slug === "confidentialite") return <Confidentialite />;
  if (slug === "cgu") return <CGU />;
  return null;
}
