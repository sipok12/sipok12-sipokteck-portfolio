// Informations générales du site modifiables depuis l'administration (table site_settings).
// Liste blanche : seules ces clés peuvent être lues ou écrites. Une valeur vide = valeur par défaut du site.
const { query } = require("../db");

const SETTING_FIELDS = [
  { key: "slogan", label: "Slogan", group: "Présentation", type: "string", max: 160 },
  { key: "slogan_en", label: "Slogan (anglais)", group: "Présentation", type: "string", max: 160, help: "vide = texte anglais par défaut" },
  { key: "hero_lead", label: "Texte d'introduction de l'accueil", group: "Présentation", type: "text", max: 400 },
  { key: "hero_lead_en", label: "Texte d'introduction de l'accueil (anglais)", group: "Présentation", type: "text", max: 400 },
  { key: "about_intro", label: "Texte de présentation (page À propos)", group: "Présentation", type: "text", max: 600 },
  { key: "about_intro_en", label: "Texte de présentation (anglais)", group: "Présentation", type: "text", max: 600 },
  { key: "contact_email", label: "Email de contact", group: "Contact", type: "email", max: 254 },
  { key: "whatsapp_primary", label: "WhatsApp principal (avec l'indicatif)", group: "Contact", type: "phone", max: 20, help: "ex. 22878003599" },
  { key: "whatsapp_secondary", label: "WhatsApp secondaire (avec l'indicatif)", group: "Contact", type: "phone", max: 20 },
  { key: "location", label: "Localisation", group: "Contact", type: "string", max: 120 },
  { key: "social_github", label: "GitHub", group: "Réseaux sociaux", type: "url", max: 300 },
  { key: "social_linkedin", label: "LinkedIn", group: "Réseaux sociaux", type: "url", max: 300 },
  { key: "social_telegram", label: "Telegram", group: "Réseaux sociaux", type: "url", max: 300, help: "ex. https://t.me/votre_nom" },
  { key: "social_facebook", label: "Facebook", group: "Réseaux sociaux", type: "url", max: 300 },
  { key: "social_instagram", label: "Instagram", group: "Réseaux sociaux", type: "url", max: 300 },
  { key: "social_tiktok", label: "TikTok", group: "Réseaux sociaux", type: "url", max: 300 },
  { key: "social_x", label: "X (Twitter)", group: "Réseaux sociaux", type: "url", max: 300 }
];
const KEYS = new Set(SETTING_FIELDS.map((f) => f.key));

async function getSettings() {
  const result = await query("SELECT key, value FROM site_settings");
  const values = {};
  for (const row of result.rows) if (KEYS.has(row.key)) values[row.key] = row.value;
  return values;
}

module.exports = { SETTING_FIELDS, getSettings };
