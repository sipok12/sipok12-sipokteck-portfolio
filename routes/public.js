const express = require("express");
const rateLimit = require("express-rate-limit");
const { query } = require("../db");
const { cleanString, readFields, asyncRoute } = require("../lib/validate");
const { notifyQuote, notifyMessage } = require("../lib/mailer");
const { absoluteUrl, quoteReference, BUDGETS, DEADLINES } = require("../lib/site");
const { getSettings } = require("../lib/settings");

const router = express.Router();
const langOf = (req) => (req.query.lang === "en" || (req.body && req.body.lang === "en") ? "en" : "fr");
// Texte anglais si renseigné, sinon texte français (jamais de champ vide affiché).
const pick = (lang, fr, en) => (lang === "en" && en ? en : fr);
const lines = (value) => String(value || "").split("\n").map((line) => line.trim()).filter(Boolean);
const list = (value) => String(value || "").split(",").map((t) => t.trim()).filter(Boolean);

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: "Trop de messages envoyés. Réessayez plus tard." }
});
const quoteLimiter = rateLimit({
  // Seuls les envois acceptés comptent : une erreur de saisie ne bloque pas un visiteur honnête.
  windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false, skipFailedRequests: true,
  message: { error: "Trop de demandes envoyées depuis votre connexion. Réessayez plus tard ou écrivez-nous sur WhatsApp." }
});

// Les réglages modifiés dans l'administration (table site_settings) priment sur les valeurs par défaut / variables d'environnement.
router.get("/config", asyncRoute(async (req, res) => {
  const lang = langOf(req);
  const set = await getSettings().catch(() => ({}));
  const digits = (value, fallback) => String(value || fallback || "").replace(/\D/g, "");
  const social = {
    github: set.social_github || process.env.SOCIAL_GITHUB || "https://github.com/sipok12",
    linkedin: set.social_linkedin || process.env.SOCIAL_LINKEDIN,
    telegram: set.social_telegram || process.env.SOCIAL_TELEGRAM,
    facebook: set.social_facebook || process.env.SOCIAL_FACEBOOK,
    instagram: set.social_instagram || process.env.SOCIAL_INSTAGRAM,
    tiktok: set.social_tiktok || process.env.SOCIAL_TIKTOK,
    x: set.social_x || process.env.SOCIAL_X
  };
  // Les textes ne sont renvoyés que s'ils ont été saisis pour CETTE langue : sinon la page garde son texte par défaut.
  const text = (key) => (lang === "en" ? set[`${key}_en`] : set[key]) || "";
  res.json({
    name: "Jean-Paul AHITE",
    brand: "SIPOKTECH DIGITAL",
    tagline: text("slogan"),
    heroLead: text("hero_lead"),
    aboutIntro: text("about_intro"),
    location: set.location || "Lomé, Togo",
    email: set.contact_email || process.env.CONTACT_EMAIL || "jeanpaulahite35@gmail.com",
    whatsappPrimary: digits(set.whatsapp_primary, process.env.WHATSAPP_PRIMARY || process.env.WHATSAPP_MAIN || "22878003599"),
    whatsappSecondary: digits(set.whatsapp_secondary, process.env.WHATSAPP_SECONDARY || "22871344338"),
    quoteOptions: { budgets: BUDGETS, deadlines: DEADLINES },
    countries: String(set.served_countries || "").split(/[\s,;]+/).map((c) => c.toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)).slice(0, 40),
    social: Object.fromEntries(Object.entries(social).filter(([, url]) => typeof url === "string" && /^https?:\/\//i.test(url)))
  });
}));

router.get("/services", asyncRoute(async (req, res) => {
  const lang = langOf(req);
  const result = await query(
    `SELECT slug, title, title_en, summary, summary_en, details, details_en, advantages, advantages_en, technologies,
            icon, image_url, starting_price, price_max, price_unit, conditions, conditions_en
     FROM services WHERE active ORDER BY position, id`
  );
  res.json({
    services: result.rows.map((s) => ({
      slug: s.slug,
      title: pick(lang, s.title, s.title_en),
      summary: pick(lang, s.summary, s.summary_en),
      details: lines(pick(lang, s.details, s.details_en)),
      advantages: lines(pick(lang, s.advantages, s.advantages_en)),
      technologies: list(s.technologies),
      icon: s.icon,
      imageUrl: s.image_url,
      startingPrice: s.starting_price,
      priceMax: s.price_max,
      priceUnit: s.price_unit,
      conditions: pick(lang, s.conditions, s.conditions_en)
    }))
  });
}));

// Formules tarifaires indicatives (modifiables dans l'administration).
router.get("/pricing", asyncRoute(async (req, res) => {
  const lang = langOf(req);
  const result = await query(
    `SELECT slug, name, name_en, tagline, tagline_en, price_min, price_max, price_unit, features, features_en, service_slug, highlighted
     FROM pricing_plans WHERE active ORDER BY position, id`
  );
  res.json({
    plans: result.rows.map((p) => ({
      slug: p.slug, name: pick(lang, p.name, p.name_en), tagline: pick(lang, p.tagline, p.tagline_en),
      priceMin: p.price_min, priceMax: p.price_max, priceUnit: p.price_unit,
      features: lines(pick(lang, p.features, p.features_en)), serviceSlug: p.service_slug, highlighted: p.highlighted
    }))
  });
}));

// Statistiques publiques : uniquement des comptages réels de la base.
router.get("/stats", asyncRoute(async (req, res) => {
  const r = await query(`SELECT
    (SELECT COUNT(*)::int FROM projects WHERE status = 'published') AS projects,
    (SELECT COUNT(*)::int FROM projects WHERE status = 'published' AND NOT demo) AS real_projects,
    (SELECT COUNT(*)::int FROM services WHERE active) AS services,
    (SELECT COUNT(*)::int FROM testimonials WHERE published) AS testimonials`);
  const row = r.rows[0];
  res.json({ projects: row.projects, realProjects: row.real_projects, services: row.services, testimonials: row.testimonials });
}));

// Seuls les projets « publiés » sont visibles : un brouillon n'apparaît jamais sur le site public.
router.get("/projects", asyncRoute(async (req, res) => {
  const lang = langOf(req);
  const result = await query(
    `SELECT id, title, category, category_en, description, description_en, features, features_en, kind, url, source_url, image_url, images,
            technologies, icon, featured, demo, realized_on, created_at
     FROM projects WHERE status = 'published'
     ORDER BY featured DESC, COALESCE(realized_on, created_at::date) DESC, id DESC`
  );
  // Robustesse : « technologies » est toujours renvoyé sous forme de texte (« A, B, C »).
  res.json({
    projects: result.rows.map((p) => ({
      id: p.id, title: p.title, kind: p.kind,
      category: pick(lang, p.category, p.category_en),
      description: pick(lang, p.description, p.description_en),
      features: lines(pick(lang, p.features, p.features_en)),
      url: p.url, source_url: p.source_url, image_url: p.image_url, icon: p.icon, featured: p.featured, demo: p.demo,
      images: Array.isArray(p.images) ? p.images : [],
      realized_on: p.realized_on instanceof Date ? p.realized_on.toISOString().slice(0, 10) : p.realized_on,
      technologies: Array.isArray(p.technologies) ? p.technologies.join(", ") : String(p.technologies || "")
    }))
  });
}));

router.get("/testimonials", asyncRoute(async (req, res) => {
  const lang = langOf(req);
  const result = await query(
    `SELECT id, author, role, content, content_en, rating, testimonial_date, photo_url, photo_consent
     FROM testimonials WHERE published ORDER BY COALESCE(testimonial_date, created_at::date) DESC, id DESC LIMIT 24`
  );
  res.json({
    testimonials: result.rows.map((t) => ({
      id: t.id, author: t.author, role: t.role, content: pick(lang, t.content, t.content_en), rating: t.rating,
      date: t.testimonial_date,
      // La photo n'est jamais servie sans l'autorisation enregistrée.
      photo: t.photo_consent && t.photo_url ? t.photo_url : null
    }))
  });
}));

router.post("/contact", contactLimiter, asyncRoute(async (req, res) => {
  // Champ piège : invisible pour les humains, rempli par les robots.
  if (cleanString(req.body.company, 100)) return res.status(200).json({ message: "Message reçu." });
  const { data, error } = readFields(req.body, [
    { name: "name", label: "Le nom", type: "string", min: 2, max: 100, required: true },
    { name: "email", label: "L'email", type: "email", max: 254, required: true },
    { name: "subject", label: "Le sujet", type: "string", min: 3, max: 160, required: true },
    { name: "message", label: "Le message", type: "text", min: 10, max: 4000, required: true }
  ]);
  if (error) return res.status(400).json({ error });

  const result = await query(
    "INSERT INTO messages (name, email, subject, message) VALUES ($1,$2,$3,$4) RETURNING id",
    [data.name, data.email, data.subject, data.message]
  );
  res.status(201).json({ message: langOf(req) === "en" ? "Your message has been received. We will reply shortly." : "Votre message a bien été enregistré. Nous vous répondons rapidement.", id: result.rows[0].id });

  notifyMessage(data, `${absoluteUrl(req)}/admin`).catch((e) => console.error("Notification message :", e.message));
}));

router.post("/quote", quoteLimiter, asyncRoute(async (req, res) => {
  const body = req.body || {};
  // Champ piège (le vrai champ « entreprise » s'appelle company ; celui-ci est invisible).
  if (cleanString(body.website, 100)) return res.status(200).json({ message: "Demande reçue." });

  const { data, error } = readFields(body, [
    { name: "name", label: "Le nom", type: "string", min: 2, max: 100, required: true },
    { name: "email", label: "L'email", type: "email", max: 254, required: true },
    { name: "phone", label: "Le numéro de téléphone", type: "string", max: 25,
      pattern: /^[0-9+()\s.-]{6,25}$/, patternMessage: "Le numéro de téléphone est invalide." },
    { name: "company", label: "L'entreprise", type: "string", max: 120 },
    { name: "description", label: "La description du besoin", type: "text", min: 20, max: 3000, required: true },
    { name: "budget", label: "Le budget", type: "enum", options: BUDGETS },
    { name: "deadline", label: "Le délai", type: "enum", options: DEADLINES }
  ]);
  if (error) return res.status(400).json({ error });
  if (body.consent !== true && body.consent !== "true") {
    return res.status(400).json({ error: "Veuillez accepter d'être recontacté au sujet de votre demande." });
  }

  const serviceSlug = cleanString(body.service, 60);
  let serviceTitle = "Autre besoin / projet sur mesure";
  if (serviceSlug && serviceSlug !== "autre") {
    const found = await query("SELECT title FROM services WHERE slug = $1 AND active", [serviceSlug]);
    if (!found.rows[0]) return res.status(400).json({ error: "Prestation inconnue. Choisissez une prestation dans la liste." });
    serviceTitle = found.rows[0].title;
  } else if (!serviceSlug) {
    return res.status(400).json({ error: "Choisissez une prestation." });
  }

  const inserted = await query(
    `INSERT INTO quotes (service_title, name, email, phone, company, description, budget, deadline)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, created_at`,
    [serviceTitle, data.name, data.email, data.phone, data.company, data.description, data.budget, data.deadline]
  );
  const { id, created_at: createdAt } = inserted.rows[0];
  const reference = quoteReference(id, createdAt);

  // La demande est réellement enregistrée en base à ce stade : seulement alors on confirme.
  res.status(201).json({
    reference,
    message: langOf(req) === "en"
      ? `Your request ${reference} has been received. We will reply shortly.`
      : `Votre demande ${reference} a bien été enregistrée. Nous vous répondons sous peu.`
  });

  notifyQuote(reference, { ...data, service_title: serviceTitle }, `${absoluteUrl(req)}/admin`)
    .then((result) => result.sent && query("UPDATE quotes SET email_notified = TRUE WHERE id = $1", [id]))
    .catch((e) => console.error("Notification devis :", e.message));
}));

module.exports = router;
