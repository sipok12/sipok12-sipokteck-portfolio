const fs = require("fs");
const path = require("path");
const { query } = require("../db");
const { cleanString, validEmail } = require("./validate");

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
  `);

  const email = cleanString(process.env.ADMIN_EMAIL, 254).toLowerCase();
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
      ["Boutique SIPOKTECH", "E-commerce", "Concept de boutique en ligne pour présenter des vêtements, chaussures et accessoires. Projet de démonstration à personnaliser.", "🛍️", "HTML, CSS, JavaScript"],
      ["Radio web", "Média numérique", "Interface de radio en ligne avec lecteur audio intégré et informations sur la station. Projet de démonstration.", "📻", "HTML, CSS, JavaScript"],
      ["Portfolio SIPOKTECH", "Portfolio", "Portfolio professionnel pour présenter les compétences, les services et les projets. Projet de démonstration.", "💻", "Node.js, Express, PostgreSQL"]
    ];
    for (const p of demos) {
      await query(
        "INSERT INTO projects (title, category, description, icon, technologies, featured, demo) VALUES ($1,$2,$3,$4,$5,TRUE,TRUE)",
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
}

module.exports = { initializeDatabase };
