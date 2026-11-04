const express = require("express");
const rateLimit = require("express-rate-limit");
const { query } = require("../db");
const { cleanString, readFields, asyncRoute } = require("../lib/validate");
const { notifyQuote, notifyMessage } = require("../lib/mailer");
const { absoluteUrl, quoteReference, BUDGETS, DEADLINES } = require("../lib/site");

const router = express.Router();

const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: "Trop de messages envoyés. Réessayez plus tard." }
});
const quoteLimiter = rateLimit({
  // Seuls les envois acceptés comptent : une erreur de saisie ne bloque pas un visiteur honnête.
  windowMs: 60 * 60 * 1000, limit: 6, standardHeaders: true, legacyHeaders: false, skipFailedRequests: true,
  message: { error: "Trop de demandes envoyées depuis votre connexion. Réessayez plus tard ou écrivez-nous sur WhatsApp." }
});

router.get("/config", (req, res) => {
  res.json({
    name: "Jean-Paul AHITE",
    brand: "SIPOKTECH DIGITAL",
    tagline: "Votre vision, notre créativité, le numérique comme solution.",
    location: "Lomé, Togo",
    email: process.env.CONTACT_EMAIL || "jeanpaulahite35@gmail.com",
    whatsappPrimary: (process.env.WHATSAPP_PRIMARY || process.env.WHATSAPP_MAIN || "22878003599").replace(/\D/g, ""),
    whatsappSecondary: (process.env.WHATSAPP_SECONDARY || "22871344338").replace(/\D/g, ""),
    quoteOptions: { budgets: BUDGETS, deadlines: DEADLINES },
    social: Object.fromEntries(Object.entries({
      github: process.env.SOCIAL_GITHUB || "https://github.com/sipok12",
      linkedin: process.env.SOCIAL_LINKEDIN,
      facebook: process.env.SOCIAL_FACEBOOK,
      instagram: process.env.SOCIAL_INSTAGRAM,
      tiktok: process.env.SOCIAL_TIKTOK,
      x: process.env.SOCIAL_X
    }).filter(([, url]) => typeof url === "string" && /^https?:\/\//i.test(url)))
  });
});

router.get("/services", asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT slug, title, summary, details, icon, starting_price, price_unit, conditions
     FROM services WHERE active ORDER BY position, id`
  );
  res.json({
    services: result.rows.map((s) => ({
      slug: s.slug,
      title: s.title,
      summary: s.summary,
      details: s.details.split("\n").map((line) => line.trim()).filter(Boolean),
      icon: s.icon,
      startingPrice: s.starting_price,
      priceUnit: s.price_unit,
      conditions: s.conditions
    }))
  });
}));

router.get("/projects", asyncRoute(async (req, res) => {
  const result = await query(
    `SELECT id, title, category, description, url, source_url, image_url, technologies, icon, featured, demo, created_at
     FROM projects ORDER BY featured DESC, created_at DESC`
  );
  // Robustesse : « technologies » est toujours renvoyé sous forme de texte (« A, B, C »).
  res.json({
    projects: result.rows.map((p) => ({
      ...p,
      technologies: Array.isArray(p.technologies) ? p.technologies.join(", ") : String(p.technologies || "")
    }))
  });
}));

router.get("/testimonials", asyncRoute(async (req, res) => {
  const result = await query(
    "SELECT id, author, role, content FROM testimonials WHERE published ORDER BY created_at DESC LIMIT 12"
  );
  res.json({ testimonials: result.rows });
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
  res.status(201).json({ message: "Votre message a bien été enregistré. Nous vous répondons rapidement.", id: result.rows[0].id });

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
    message: `Votre demande ${reference} a bien été enregistrée. Nous vous répondons sous peu.`
  });

  notifyQuote(reference, { ...data, service_title: serviceTitle }, `${absoluteUrl(req)}/admin`)
    .then((result) => result.sent && query("UPDATE quotes SET email_notified = TRUE WHERE id = $1", [id]))
    .catch((e) => console.error("Notification devis :", e.message));
}));

module.exports = router;
