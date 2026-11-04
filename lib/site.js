const siteUrl = (process.env.SITE_URL || "").trim().replace(/\/+$/, "");

// Adresse publique du site. En production, définissez SITE_URL (ex. https://sipokteck-portfolio.onrender.com).
function absoluteUrl(req) {
  return siteUrl || `${req.protocol}://${req.get("host")}`;
}

// Référence lisible d'une demande de devis, ex. DV-2026-0007.
function quoteReference(id, createdAt) {
  const year = new Date(createdAt || Date.now()).getUTCFullYear();
  return `DV-${year}-${String(id).padStart(4, "0")}`;
}

const BUDGETS = [
  "Moins de 25 000 FCFA",
  "25 000 – 50 000 FCFA",
  "50 000 – 100 000 FCFA",
  "100 000 – 200 000 FCFA",
  "Plus de 200 000 FCFA",
  "À discuter"
];

const DEADLINES = [
  "Urgent (moins de 2 semaines)",
  "Environ 1 mois",
  "2 à 3 mois",
  "Pas de contrainte"
];

const QUOTE_STATUSES = ["nouveau", "en cours", "devis envoyé", "accepté", "refusé"];

module.exports = { absoluteUrl, quoteReference, BUDGETS, DEADLINES, QUOTE_STATUSES };
