// API d'administration : toutes les routes (sauf /login) exigent une session administrateur
// ET, pour toute écriture, un jeton CSRF. Aucune donnée n'est lue ou écrite sans validation serveur.
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { query } = require("../db");
const { cleanString, validEmail, readFields, asyncRoute } = require("../lib/validate");
const { quoteReference, QUOTE_STATUSES } = require("../lib/site");

const router = express.Router();
const isProduction = process.env.NODE_ENV === "production";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." }
});

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(32).toString("hex");
  return req.session.csrfToken;
}

// Défense CSRF n°2 : jeton lié à la session, renvoyé dans l'en-tête X-CSRF-Token.
function requireCsrf(req, res, next) {
  const expected = Buffer.from(req.session.csrfToken || "");
  const received = Buffer.from(req.get("x-csrf-token") || "");
  if (!expected.length || expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    return res.status(403).json({ error: "Jeton de sécurité invalide. Rechargez la page." });
  }
  next();
}

function parseId(req) {
  const id = Number.parseInt(req.params.id, 10);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// --- Connexion (seule route publique de ce routeur) ---
router.post("/login", loginLimiter, asyncRoute(async (req, res) => {
  const email = cleanString(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!validEmail(email) || password.length < 1 || password.length > 200) {
    return res.status(400).json({ error: "Email ou mot de passe invalide." });
  }
  const result = await query("SELECT id, name, email, password_hash FROM admins WHERE email = $1", [email]);
  const admin = result.rows[0];
  const matches = admin ? await bcrypt.compare(password, admin.password_hash) : false;
  if (!matches) return res.status(401).json({ error: "Identifiants incorrects." });

  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.adminId = admin.id;
  req.session.adminName = admin.name;
  req.session.adminEmail = admin.email;
  res.json({ admin: { name: admin.name, email: admin.email }, csrfToken: ensureCsrfToken(req) });
}));

// --- Tout ce qui suit est protégé côté serveur ---
router.use((req, res, next) => {
  if (!req.session || !req.session.adminId) return res.status(401).json({ error: "Authentification requise." });
  next();
});
router.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  requireCsrf(req, res, next);
});

router.get("/me", (req, res) => {
  res.json({ admin: { name: req.session.adminName, email: req.session.adminEmail }, csrfToken: ensureCsrfToken(req) });
});

router.post("/logout", (req, res, next) => {
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("sipokteck.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
    res.json({ message: "Déconnexion effectuée." });
  });
});

router.post("/password", asyncRoute(async (req, res) => {
  const current = typeof req.body.current === "string" ? req.body.current : "";
  const next = typeof req.body.next === "string" ? req.body.next : "";
  if (next.length < 12 || next.length > 200) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 12 caractères." });
  }
  const result = await query("SELECT password_hash FROM admins WHERE id = $1", [req.session.adminId]);
  const ok = result.rows[0] ? await bcrypt.compare(current, result.rows[0].password_hash) : false;
  if (!ok) return res.status(403).json({ error: "Mot de passe actuel incorrect." });
  await query("UPDATE admins SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(next, 12), req.session.adminId]);
  res.json({ message: "Mot de passe modifié." });
}));

// --- Statistiques : uniquement des données réellement présentes en base ---
router.get("/stats", asyncRoute(async (req, res) => {
  const totals = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM quotes) AS quotes_total,
      (SELECT COUNT(*)::int FROM quotes WHERE status = 'nouveau') AS quotes_new,
      (SELECT COUNT(*)::int FROM quotes WHERE created_at > NOW() - INTERVAL '30 days') AS quotes_30d,
      (SELECT COUNT(*)::int FROM messages) AS messages_total,
      (SELECT COUNT(*)::int FROM messages WHERE status = 'nouveau') AS messages_new,
      (SELECT COUNT(*)::int FROM projects) AS projects,
      (SELECT COUNT(*)::int FROM services WHERE active) AS services,
      (SELECT COUNT(*)::int FROM clients) AS clients,
      (SELECT COUNT(*)::int FROM testimonials WHERE published) AS testimonials_published`);
  const byStatus = await query("SELECT status, COUNT(*)::int AS n FROM quotes GROUP BY status");
  const byService = await query(
    "SELECT service_title, COUNT(*)::int AS n FROM quotes GROUP BY service_title ORDER BY n DESC, service_title LIMIT 6"
  );
  const byMonth = await query(`
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, COUNT(*)::int AS n
    FROM quotes WHERE created_at > date_trunc('month', NOW()) - INTERVAL '5 months'
    GROUP BY 1 ORDER BY 1`);
  const recent = await query(
    "SELECT id, service_title, name, status, created_at FROM quotes ORDER BY created_at DESC LIMIT 5"
  );
  res.json({
    totals: totals.rows[0],
    quotesByStatus: Object.fromEntries(QUOTE_STATUSES.map(s => [s, 0])
      .map(([s]) => [s, (byStatus.rows.find(r => r.status === s) || { n: 0 }).n])),
    quotesByService: byService.rows,
    quotesByMonth: byMonth.rows,
    recentQuotes: recent.rows.map(q => ({ ...q, reference: quoteReference(q.id, q.created_at) })),
    mailConfigured: Boolean(process.env.RESEND_API_KEY)
  });
}));

// --- Devis ---
router.get("/quotes", asyncRoute(async (req, res) => {
  const status = cleanString(req.query.status, 20);
  const filter = QUOTE_STATUSES.includes(status);
  const result = await query(
    `SELECT * FROM quotes ${filter ? "WHERE status = $1" : ""} ORDER BY created_at DESC LIMIT 200`,
    filter ? [status] : []
  );
  res.json({ items: result.rows.map(q => ({ ...q, reference: quoteReference(q.id, q.created_at) })) });
}));

router.patch("/quotes/:id", asyncRoute(async (req, res) => {
  const id = parseId(req);
  const status = cleanString(req.body.status, 20);
  const notes = cleanString(req.body.notes, 2000);
  if (!id || !QUOTE_STATUSES.includes(status)) return res.status(400).json({ error: "Identifiant ou statut invalide." });
  const result = await query(
    "UPDATE quotes SET status = $1, notes = $2, updated_at = NOW() WHERE id = $3 RETURNING *",
    [status, notes, id]
  );
  if (!result.rowCount) return res.status(404).json({ error: "Demande introuvable." });
  const q = result.rows[0];
  res.json({ item: { ...q, reference: quoteReference(q.id, q.created_at) } });
}));

router.delete("/quotes/:id", asyncRoute(async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: "Identifiant invalide." });
  const result = await query("DELETE FROM quotes WHERE id = $1 RETURNING id", [id]);
  if (!result.rowCount) return res.status(404).json({ error: "Demande introuvable." });
  res.json({ message: "Demande supprimée." });
}));

// Crée une fiche client à partir d'une demande de devis (sans doublon d'email).
router.post("/quotes/:id/client", asyncRoute(async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: "Identifiant invalide." });
  const found = await query("SELECT name, email, phone, company FROM quotes WHERE id = $1", [id]);
  const q = found.rows[0];
  if (!q) return res.status(404).json({ error: "Demande introuvable." });
  const existing = await query("SELECT * FROM clients WHERE email = $1 LIMIT 1", [q.email]);
  if (existing.rows[0]) return res.json({ item: existing.rows[0], existing: true });
  const created = await query(
    "INSERT INTO clients (name, email, phone, company) VALUES ($1,$2,$3,$4) RETURNING *",
    [q.name, q.email, q.phone, q.company]
  );
  res.status(201).json({ item: created.rows[0], existing: false });
}));

// --- Messages ---
router.get("/messages", asyncRoute(async (req, res) => {
  const result = await query(
    "SELECT id, name, email, subject, message, status, created_at FROM messages ORDER BY created_at DESC LIMIT 100"
  );
  res.json({ items: result.rows });
}));

router.patch("/messages/:id", asyncRoute(async (req, res) => {
  const id = parseId(req);
  const status = cleanString(req.body.status, 20);
  if (!id || !["nouveau", "lu", "traité"].includes(status)) {
    return res.status(400).json({ error: "Identifiant ou statut invalide." });
  }
  const result = await query("UPDATE messages SET status = $1 WHERE id = $2 RETURNING id, status", [status, id]);
  if (!result.rowCount) return res.status(404).json({ error: "Message introuvable." });
  res.json({ item: result.rows[0] });
}));

router.delete("/messages/:id", asyncRoute(async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: "Identifiant invalide." });
  const result = await query("DELETE FROM messages WHERE id = $1 RETURNING id", [id]);
  if (!result.rowCount) return res.status(404).json({ error: "Message introuvable." });
  res.json({ message: "Message supprimé." });
}));

// --- CRUD générique : projets, services, témoignages, clients ---
// `table`, `order` et les noms de champs viennent uniquement de ce fichier (jamais de la requête).
function mountCrud(name, { table, fields, order, listSql, label, validate }) {
  const cols = fields.map(f => f.name);

  router.get(`/${name}`, asyncRoute(async (req, res) => {
    const result = await query(listSql || `SELECT * FROM ${table} ORDER BY ${order}`);
    res.json({ items: result.rows });
  }));

  router.post(`/${name}`, asyncRoute(async (req, res) => {
    const { data, error } = readFields(req.body, fields);
    if (error) return res.status(400).json({ error });
    const problem = validate && validate(data);
    if (problem) return res.status(400).json({ error: problem });
    const result = await query(
      `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(", ")}) RETURNING *`,
      cols.map(c => data[c])
    );
    res.status(201).json({ item: result.rows[0] });
  }));

  router.put(`/${name}/:id`, asyncRoute(async (req, res) => {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Identifiant invalide." });
    const { data, error } = readFields(req.body, fields);
    if (error) return res.status(400).json({ error });
    const problem = validate && validate(data);
    if (problem) return res.status(400).json({ error: problem });
    const result = await query(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}, updated_at = NOW()
       WHERE id = $${cols.length + 1} RETURNING *`,
      [...cols.map(c => data[c]), id]
    );
    if (!result.rowCount) return res.status(404).json({ error: `${label} introuvable.` });
    res.json({ item: result.rows[0] });
  }));

  router.delete(`/${name}/:id`, asyncRoute(async (req, res) => {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Identifiant invalide." });
    const result = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING id`, [id]);
    if (!result.rowCount) return res.status(404).json({ error: `${label} introuvable.` });
    res.json({ message: `${label} supprimé.` });
  }));
}

mountCrud("projects", {
  table: "projects", label: "Projet", order: "featured DESC, created_at DESC",
  fields: [
    { name: "title", label: "Le titre", type: "string", min: 2, max: 120, required: true },
    { name: "category", label: "La catégorie", type: "string", min: 2, max: 80, required: true },
    { name: "description", label: "La description", type: "text", min: 10, max: 2000, required: true },
    { name: "technologies", label: "Les technologies", type: "string", max: 300 },
    { name: "url", label: "Le lien de démonstration", type: "url", max: 500, nullable: true },
    { name: "source_url", label: "Le lien du code source", type: "url", max: 500, nullable: true },
    { name: "image_url", label: "L'image", type: "url", max: 500, nullable: true },
    { name: "icon", label: "L'icône", type: "string", max: 20, default: "💻" },
    { name: "featured", type: "bool" },
    { name: "demo", type: "bool" }
  ]
});

mountCrud("services", {
  table: "services", label: "Service", order: "position, id",
  validate: (d) => {
    if (d.price_max !== null && d.starting_price === null) return "Indiquez aussi le prix minimum pour une fourchette.";
    if (d.price_max !== null && d.price_max < d.starting_price) return "Le prix maximum doit être supérieur ou égal au prix minimum.";
    return null;
  },
  fields: [
    { name: "slug", label: "L'identifiant", type: "string", min: 2, max: 60, required: true,
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, patternMessage: "L'identifiant ne peut contenir que des minuscules, chiffres et tirets." },
    { name: "title", label: "Le titre", type: "string", min: 2, max: 120, required: true },
    { name: "summary", label: "Le résumé", type: "string", min: 5, max: 300, required: true },
    { name: "details", label: "Les détails", type: "text", max: 2000 },
    { name: "icon", label: "L'icône", type: "string", max: 20, default: "◆" },
    { name: "starting_price", label: "Le prix (ou prix minimum)", type: "int", min: 0, max: 100000000 },
    { name: "price_max", label: "Le prix maximum", type: "int", min: 0, max: 100000000 },
    { name: "price_unit", label: "L'unité de prix", type: "string", max: 40 },
    { name: "conditions", label: "Les conditions", type: "text", max: 1000 },
    { name: "position", label: "La position", type: "int", min: 0, max: 1000, default: 0 },
    { name: "active", type: "bool" }
  ]
});

mountCrud("testimonials", {
  table: "testimonials", label: "Témoignage", order: "created_at DESC",
  fields: [
    { name: "author", label: "L'auteur", type: "string", min: 2, max: 100, required: true },
    { name: "role", label: "La fonction", type: "string", max: 120 },
    { name: "content", label: "Le témoignage", type: "text", min: 10, max: 1000, required: true },
    { name: "published", type: "bool" }
  ]
});

mountCrud("clients", {
  table: "clients", label: "Client", order: "created_at DESC",
  listSql: `SELECT c.*, (SELECT COUNT(*)::int FROM quotes q WHERE c.email <> '' AND q.email = c.email) AS quotes_count
            FROM clients c ORDER BY c.created_at DESC`,
  fields: [
    { name: "name", label: "Le nom", type: "string", min: 2, max: 100, required: true },
    { name: "email", label: "L'email", type: "email", max: 254 },
    { name: "phone", label: "Le téléphone", type: "string", max: 25,
      pattern: /^[0-9+()\s.-]{6,25}$/, patternMessage: "Le numéro de téléphone est invalide." },
    { name: "company", label: "L'entreprise", type: "string", max: 120 },
    { name: "notes", label: "Les notes", type: "text", max: 2000 }
  ]
});

module.exports = router;
