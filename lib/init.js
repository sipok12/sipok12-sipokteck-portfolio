const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { cleanString, validEmail } = require("./validate");
const content = require("./content");

const defaultConditions =
  "Prix indicatif en FCFA. Le tarif final est précisé dans un devis personnalisé après étude de votre besoin.";

// Prestations proposées au lancement. Les prix sont indicatifs (fourchette ou « à partir de »),
// à ajuster depuis l'administration (onglet « Services & tarifs »).
const defaultServices = [
  ["sites-vitrines", "Sites vitrines", "Un site clair, rapide et responsive pour présenter votre activité.",
    "Design adapté au mobile, à la tablette et à l'ordinateur\nPages essentielles : accueil, services, contact\nFormulaire de contact et bouton WhatsApp\nBases du référencement Google\nMise en ligne du site", "⌘", 25000, 40000, ""],
  ["boutiques-en-ligne", "Boutiques en ligne", "Présentez vos produits et recevez des commandes en ligne.",
    "Catalogue de produits avec catégories\nPanier et demande de commande\nGestion des produits depuis un espace administrateur\nContact client par WhatsApp\nMise en ligne et prise en main", "◇", 50000, 100000, ""],
  ["applications-web", "Applications web", "Des outils sur mesure pour organiser vos données et simplifier votre travail.",
    "Analyse de votre besoin\nInterface web responsive\nBase de données et comptes utilisateurs\nEspace d'administration sécurisé\nMise en ligne", "▣", 150000, null, ""],
  ["design-graphique", "Design graphique", "Visuels soignés pour vos supports de communication.",
    "Affiches et flyers\nVisuels pour les réseaux sociaux\nCartes de visite\nFichiers livrés prêts à l'emploi", "✎", 5000, null, ""],
  ["identite-numerique", "Identité numérique", "Une image cohérente pour votre marque, en ligne comme hors ligne.",
    "Logo\nCouleurs et typographies\nCharte graphique simple\nHabillage de vos profils sur les réseaux sociaux", "◎", 50000, null, ""],
  ["assistance-maintenance", "Assistance & maintenance", "Un suivi pour garder votre site à jour et fonctionnel.",
    "Corrections et petites évolutions\nMises à jour et vérifications régulières\nAssistance en cas de problème\nSauvegardes selon l'hébergement choisi", "↻", 15000, null, "/ mois"]
];

async function initializeDatabase() {
  const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
  await query(schema);
  await query(`
    CREATE TABLE IF NOT EXISTS user_sessions (
      sid varchar NOT NULL COLLATE "default",
      sess json NOT NULL,
      expire timestamp(6) NOT NULL,
      CONSTRAINT session_pkey PRIMARY KEY (sid)
    );
    CREATE INDEX IF NOT EXISTS "IDX_user_sessions_expire" ON user_sessions (expire);
    ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
  `);

  const email = cleanString(process.env.ADMIN_EMAIL, 254).toLowerCase();
  // Liste blanche des administrateurs Supabase : ADMIN_EMAIL (et, facultatif, ADMIN_EMAILS séparés par des virgules).
  const allowed = [email, ...String(process.env.ADMIN_EMAILS || "").split(",").map((e) => e.trim().toLowerCase())]
    .filter((e, i, all) => e && validEmail(e) && all.indexOf(e) === i);
  for (const address of allowed) {
    await query(
      "INSERT INTO admin_profiles (email, name) VALUES ($1, $2) ON CONFLICT (email) DO NOTHING",
      [address, cleanString(process.env.ADMIN_NAME || "Administrateur", 100)]
    );
  }
  const passwordHash = cleanString(process.env.ADMIN_PASSWORD_HASH, 200);
  if (email && passwordHash && validEmail(email)) {
    await query(
      `INSERT INTO admins (name, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING`,
      [cleanString(process.env.ADMIN_NAME || "Administrateur", 100), email, passwordHash]
    );
  }

  const projects = await query("SELECT COUNT(*)::int AS n FROM projects");
  if (projects.rows[0].n === 0) {
    const demos = [
      ["Boutique SIPOKTECH", "E-commerce", "Concept de boutique en ligne pour présenter des vêtements, chaussures et accessoires. Projet de démonstration à personnaliser.", "🛍️", "HTML, CSS, JavaScript", "business"],
      ["Radio web", "Média numérique", "Interface de radio en ligne avec lecteur audio intégré et informations sur la station. Projet de démonstration.", "📻", "HTML, CSS, JavaScript", "website"],
      ["Portfolio SIPOKTECH", "Portfolio", "Portfolio professionnel pour présenter les compétences, les services et les projets. Projet de démonstration.", "💻", "Node.js, Express, PostgreSQL", "portfolio"]
    ];
    for (const p of demos) {
      await query(
        "INSERT INTO projects (title, category, description, icon, technologies, kind, featured, demo) VALUES ($1,$2,$3,$4,$5,$6,TRUE,TRUE)",
        p
      );
    }
  }

  const services = await query("SELECT COUNT(*)::int AS n FROM services");
  if (services.rows[0].n === 0) {
    let position = 1;
    for (const [slug, title, summary, details, icon, price, priceMax, unit] of defaultServices) {
      await query(
        `INSERT INTO services (slug, title, summary, details, icon, starting_price, price_max, price_unit, conditions, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [slug, title, summary, details, icon, price, priceMax, unit, defaultConditions, position++]
      );
    }
  }
  await seedBilingualContent();
}

// Contenu v4 (bilingue, 8 prestations, formules) : ajouté UNE SEULE FOIS, sans jamais écraser vos modifications.
async function seedBilingualContent() {
  const done = await query("SELECT 1 FROM site_settings WHERE key = 'seed_v4'");
  if (done.rowCount) return;

  for (const s of content.services) {
    const found = await query("SELECT id FROM services WHERE slug = $1", [s.slug]);
    if (!found.rowCount) {
      await query(
        `INSERT INTO services (slug, title, summary, details, icon, starting_price, price_max, price_unit, conditions, position,
                               title_en, summary_en, details_en, advantages, advantages_en, technologies, conditions_en)
         VALUES ($1,$2,$3,$4,$5,NULL,NULL,'',$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [s.slug, s.title, s.summary, s.details || "", s.icon, defaultConditions, s.position, s.title_en, s.summary_en,
         s.details_en || "", s.advantages || "", s.advantages_en || "", s.technologies || "", content.conditionsEn]
      );
    } else {
      // Service existant : on ne remplit que les colonnes encore vides (traductions, avantages, technologies) et l'ordre.
      await query(
        `UPDATE services SET
           title_en = CASE WHEN title_en = '' THEN $2 ELSE title_en END,
           summary_en = CASE WHEN summary_en = '' THEN $3 ELSE summary_en END,
           details_en = CASE WHEN details_en = '' THEN $4 ELSE details_en END,
           advantages = CASE WHEN advantages = '' THEN $5 ELSE advantages END,
           advantages_en = CASE WHEN advantages_en = '' THEN $6 ELSE advantages_en END,
           technologies = CASE WHEN technologies = '' THEN $7 ELSE technologies END,
           conditions_en = CASE WHEN conditions_en = '' THEN $8 ELSE conditions_en END,
           position = $9
         WHERE slug = $1`,
        [s.slug, s.title_en, s.summary_en, s.details_en || "", s.advantages || "", s.advantages_en || "",
         s.technologies || "", content.conditionsEn, s.position]
      );
    }
  }

  const plans = await query("SELECT COUNT(*)::int AS n FROM pricing_plans");
  if (plans.rows[0].n === 0) {
    for (const p of content.plans) {
      await query(
        `INSERT INTO pricing_plans (slug, name, name_en, tagline, tagline_en, price_min, price_max, features, features_en, service_slug, highlighted, position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [p.slug, p.name, p.name_en, p.tagline, p.tagline_en, p.price_min, p.price_max, p.features, p.features_en, p.service_slug, p.highlighted, p.position]
      );
    }
  }
  await query("INSERT INTO site_settings (key, value) VALUES ('seed_v4', 'done') ON CONFLICT (key) DO NOTHING");
}

module.exports = { initializeDatabase };
