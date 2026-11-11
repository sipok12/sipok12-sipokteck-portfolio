// API d'administration : toutes les routes (sauf /login) exigent une session administrateur
// ET, pour toute écriture, un jeton CSRF. Aucune donnée n'est lue ou écrite sans validation serveur.
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const rateLimit = require("express-rate-limit");
const { query } = require("../db");
const { cleanString, validEmail, readFields, asyncRoute } = require("../lib/validate");
const { quoteReference, absoluteUrl, QUOTE_STATUSES, PENDING_QUOTE_STATUSES } = require("../lib/site");
const supa = require("../lib/supabase");
const { logActivity } = require("../lib/activity");
const { SETTING_FIELDS, getSettings } = require("../lib/settings");

const router = express.Router();
const isProduction = process.env.NODE_ENV === "production";
// Pendant la migration vers Supabase Auth, l'ancien compte reste utilisable. Mettre ADMIN_LEGACY_LOGIN=false pour le désactiver.
const legacyLoginEnabled = process.env.ADMIN_LEGACY_LOGIN !== "false";

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: true, legacyHeaders: false,
  message: { error: "Trop de tentatives. Réessayez dans 15 minutes." }
});

const recoveryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: true, legacyHeaders: false,
  message: { error: "Trop de demandes. Réessayez dans une heure." }
});
const uploadLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false,
  message: { error: "Trop d'envois d'images. Patientez quelques minutes." }
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

// --- Connexion et récupération (seules routes publiques de ce routeur) ---
async function findProfile(email) {
  const result = await query("SELECT id, name, email FROM admin_profiles WHERE email = $1 AND active", [email]);
  return result.rows[0] || null;
}

router.post("/login", loginLimiter, asyncRoute(async (req, res) => {
  const email = cleanString(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!validEmail(email) || password.length < 1 || password.length > 200) {
    return res.status(400).json({ error: "Email ou mot de passe invalide." });
  }

  let admin = null;
  // 1) Supabase Auth, puis vérification que le compte figure dans la liste blanche admin_profiles.
  if (supa.authConfigured) {
    try {
      const signedIn = await supa.signIn(email, password);
      if (signedIn) {
        const profile = await findProfile(String(signedIn.user.email || "").toLowerCase());
        if (profile) admin = { id: profile.id, name: profile.name, email: profile.email, method: "supabase" };
      }
    } catch (error) {
      console.error("Connexion Supabase :", error.message);
      if (!legacyLoginEnabled) return res.status(503).json({ error: "Service de connexion momentanément indisponible. Réessayez." });
    }
  }
  // 2) Ancien compte (bcrypt), tant qu'il n'est pas désactivé.
  if (!admin && legacyLoginEnabled) {
    const result = await query("SELECT id, name, email, password_hash FROM admins WHERE email = $1", [email]);
    const legacy = result.rows[0];
    const matches = legacy ? await bcrypt.compare(password, legacy.password_hash) : false;
    if (matches) admin = { id: legacy.id, name: legacy.name, email: legacy.email, method: "legacy" };
  }
  if (!admin) return res.status(401).json({ error: "Identifiants incorrects ou compte non autorisé." });

  await new Promise((resolve, reject) => req.session.regenerate(err => err ? reject(err) : resolve()));
  req.session.adminId = admin.id;
  req.session.adminName = admin.name;
  req.session.adminEmail = admin.email;
  req.session.authMethod = admin.method;
  await logActivity(req, "login", "session", null, `Connexion (${admin.method === "supabase" ? "Supabase Auth" : "ancien compte"})`);
  res.json({ admin: { name: admin.name, email: admin.email }, csrfToken: ensureCsrfToken(req), capabilities: capabilities(req) });
}));

// Mot de passe oublié : Supabase envoie un lien à usage unique. Réponse identique que le compte existe ou non.
router.post("/recover", recoveryLimiter, asyncRoute(async (req, res) => {
  const email = cleanString(req.body.email, 254).toLowerCase();
  if (!supa.authConfigured) {
    return res.status(503).json({ error: "La récupération par email n'est pas configurée sur ce site." });
  }
  if (validEmail(email) && await findProfile(email)) {
    await supa.sendRecovery(email, `${absoluteUrl(req)}/admin`).catch((e) => console.error("Récupération :", e.message));
  }
  res.json({ message: "Si ce compte existe, un email contenant un lien de réinitialisation vient d'être envoyé." });
}));

// Choix du nouveau mot de passe après clic sur le lien reçu par email (le jeton vient de Supabase).
router.post("/recovery", recoveryLimiter, asyncRoute(async (req, res) => {
  const token = typeof req.body.accessToken === "string" ? req.body.accessToken.slice(0, 4000) : "";
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (!supa.authConfigured || !token) return res.status(400).json({ error: "Lien de réinitialisation invalide." });
  if (password.length < 12 || password.length > 200) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 12 caractères." });
  }
  const user = await supa.getUser(token);
  const profile = user && await findProfile(String(user.email).toLowerCase());
  if (!profile) return res.status(403).json({ error: "Lien expiré ou compte non autorisé. Demandez un nouveau lien." });
  try { await supa.updatePassword(token, password); }
  catch (error) { return res.status(400).json({ error: error.message }); }
  req.session.adminEmail = profile.email;
  await logActivity(req, "password", "session", null, "Mot de passe réinitialisé par email");
  res.json({ message: "Mot de passe modifié. Vous pouvez vous connecter." });
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

function capabilities(req) {
  return {
    storage: supa.storageConfigured,
    supabaseAuth: supa.authConfigured,
    authMethod: req.session.authMethod || "legacy",
    legacyLogin: legacyLoginEnabled
  };
}

router.get("/me", (req, res) => {
  res.json({ admin: { name: req.session.adminName, email: req.session.adminEmail }, csrfToken: ensureCsrfToken(req), capabilities: capabilities(req) });
});

router.post("/logout", asyncRoute(async (req, res, next) => {
  await logActivity(req, "logout", "session", null, "Déconnexion");
  req.session.destroy(err => {
    if (err) return next(err);
    res.clearCookie("sipokteck.sid", { httpOnly: true, sameSite: "lax", secure: isProduction });
    res.json({ message: "Déconnexion effectuée." });
  });
}));

router.post("/password", asyncRoute(async (req, res) => {
  const current = typeof req.body.current === "string" ? req.body.current : "";
  const next = typeof req.body.next === "string" ? req.body.next : "";
  if (next.length < 12 || next.length > 200) {
    return res.status(400).json({ error: "Le nouveau mot de passe doit contenir au moins 12 caractères." });
  }
  if (req.session.authMethod === "supabase") {
    const signedIn = await supa.signIn(req.session.adminEmail, current).catch(() => null);
    if (!signedIn) return res.status(403).json({ error: "Mot de passe actuel incorrect." });
    try { await supa.updatePassword(signedIn.accessToken, next); }
    catch (error) { return res.status(400).json({ error: error.message }); }
  } else {
    const result = await query("SELECT password_hash FROM admins WHERE id = $1", [req.session.adminId]);
    const ok = result.rows[0] ? await bcrypt.compare(current, result.rows[0].password_hash) : false;
    if (!ok) return res.status(403).json({ error: "Mot de passe actuel incorrect." });
    await query("UPDATE admins SET password_hash = $1 WHERE id = $2", [await bcrypt.hash(next, 12), req.session.adminId]);
  }
  await logActivity(req, "password", "session", null, "Mot de passe modifié");
  res.json({ message: "Mot de passe modifié." });
}));

// --- Statistiques : uniquement des données réellement présentes en base ---
router.get("/stats", asyncRoute(async (req, res) => {
  const totals = await query(`
    SELECT
      (SELECT COUNT(*)::int FROM quotes) AS quotes_total,
      (SELECT COUNT(*)::int FROM quotes WHERE status = 'nouveau') AS quotes_new,
      (SELECT COUNT(*)::int FROM quotes WHERE status = ANY($1)) AS quotes_pending,
      (SELECT COUNT(*)::int FROM quotes WHERE status = 'en cours') AS quotes_in_progress,
      (SELECT COUNT(*)::int FROM quotes WHERE status = 'terminé') AS quotes_done,
      (SELECT COUNT(*)::int FROM quotes WHERE status = 'annulé') AS quotes_cancelled,
      (SELECT COUNT(*)::int FROM quotes WHERE created_at > NOW() - INTERVAL '30 days') AS quotes_30d,
      (SELECT COUNT(*)::int FROM messages) AS messages_total,
      (SELECT COUNT(*)::int FROM messages WHERE status = 'nouveau') AS messages_new,
      (SELECT COUNT(*)::int FROM projects WHERE status = 'published') AS projects_published,
      (SELECT COUNT(*)::int FROM projects WHERE status = 'draft') AS projects_draft,
      (SELECT COUNT(*)::int FROM projects WHERE status = 'published' AND NOT demo) AS projects_real,
      (SELECT COUNT(*)::int FROM services WHERE active) AS services,
      (SELECT COUNT(*)::int FROM clients) AS clients,
      (SELECT COUNT(*)::int FROM clients WHERE created_at > NOW() - INTERVAL '30 days') AS clients_30d,
      (SELECT COUNT(*)::int FROM testimonials WHERE published) AS testimonials_published`, [PENDING_QUOTE_STATUSES]);
  const byStatus = await query("SELECT status, COUNT(*)::int AS n FROM quotes GROUP BY status");
  const byService = await query(
    "SELECT service_title, COUNT(*)::int AS n FROM quotes GROUP BY service_title ORDER BY n DESC, service_title LIMIT 6"
  );
  // 12 derniers mois, mois sans activité inclus (valeur 0). Projets : date de réalisation, sinon date de création.
  const monthly = await query(`
    SELECT to_char(m, 'YYYY-MM') AS month,
      (SELECT COUNT(*)::int FROM quotes q WHERE date_trunc('month', q.created_at) = m) AS quotes,
      (SELECT COUNT(*)::int FROM projects p WHERE p.status = 'published'
         AND date_trunc('month', COALESCE(p.realized_on::timestamptz, p.created_at)) = m) AS projects,
      (SELECT COUNT(*)::int FROM clients c WHERE date_trunc('month', c.created_at) = m) AS clients
    FROM generate_series(date_trunc('month', NOW()) - INTERVAL '11 months', date_trunc('month', NOW()), INTERVAL '1 month') AS m
    ORDER BY m`);
  const recent = await query(
    "SELECT id, service_title, name, status, created_at FROM quotes ORDER BY created_at DESC LIMIT 5"
  );
  res.json({
    totals: totals.rows[0],
    quotesByStatus: Object.fromEntries(QUOTE_STATUSES.map(
      (status) => [status, (byStatus.rows.find(r => r.status === status) || { n: 0 }).n])),
    quotesByService: byService.rows,
    monthly: monthly.rows,
    recentQuotes: recent.rows.map(q => ({ ...q, reference: quoteReference(q.id, q.created_at) })),
    visitors: null, // aucun outil de statistiques de visites n'est configuré : on n'invente aucun chiffre
    mailConfigured: Boolean(process.env.RESEND_API_KEY)
  });
}));

// --- Historique des actions ---
router.get("/activity", asyncRoute(async (req, res) => {
  const result = await query(
    "SELECT id, admin_email, action, entity, entity_id, summary, created_at FROM activity_log ORDER BY created_at DESC, id DESC LIMIT 200"
  );
  res.json({ items: result.rows });
}));

// --- Informations générales du site ---
router.get("/settings", asyncRoute(async (req, res) => {
  res.json({ fields: SETTING_FIELDS, values: await getSettings() });
}));

router.put("/settings", asyncRoute(async (req, res) => {
  const { data, error } = readFields(req.body && req.body.values, SETTING_FIELDS.map((f) => ({
    name: f.key, label: f.label, type: f.type === "phone" ? "string" : f.type, max: f.max,
    pattern: f.type === "phone" ? /^[0-9]{8,15}$/ : undefined,
    patternMessage: `${f.label} : chiffres uniquement, avec l'indicatif (ex. 22878003599).`
  })));
  if (error) return res.status(400).json({ error });
  for (const [key, value] of Object.entries(data)) {
    await query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    );
  }
  await logActivity(req, "update", "settings", null, "Informations générales du site modifiées");
  res.json({ values: await getSettings(), message: "Informations enregistrées." });
}));

// --- Images (Supabase Storage) : le fichier transite par le serveur, qui contrôle le contenu réel ---
const IMAGE_TYPES = {
  "image/jpeg": { ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  "image/png": { ext: "png", test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  "image/webp": { ext: "webp", test: (b) => b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP" }
};

router.post("/uploads", uploadLimiter,
  express.raw({ type: Object.keys(IMAGE_TYPES), limit: "5mb" }),
  asyncRoute(async (req, res) => {
    if (!supa.storageConfigured) {
      return res.status(503).json({ error: "L'envoi d'images n'est pas configuré (clé Supabase Storage absente). Vous pouvez coller l'adresse d'une image à la place." });
    }
    const type = IMAGE_TYPES[req.get("content-type")];
    const folder = ["projects", "services", "testimonials"].includes(req.query.folder) ? req.query.folder : "projects";
    if (!type || !Buffer.isBuffer(req.body) || !req.body.length) {
      return res.status(415).json({ error: "Format refusé. Envoyez une image JPG, PNG ou WebP de 5 Mo maximum." });
    }
    if (!type.test(req.body)) return res.status(415).json({ error: "Le contenu du fichier ne correspond pas à une image valide." });
    const objectPath = `${folder}/${new Date().getUTCFullYear()}/${crypto.randomUUID()}.${type.ext}`;
    const url = await supa.uploadImage(objectPath, req.body, req.get("content-type"));
    await logActivity(req, "upload", "image", null, `Image envoyée (${folder})`);
    res.status(201).json({ url });
  }));

// --- Devis ---
function quoteSearchClause(term, params) {
  if (!term) return "";
  const reference = /^DV-\d{4}-(\d{1,9})$/i.exec(term);
  if (reference) { params.push(Number(reference[1])); return `id = $${params.length}`; }
  params.push(`%${term.replace(/[\\%_]/g, "\\$&")}%`);
  const n = params.length;
  return `(name ILIKE $${n} OR email ILIKE $${n} OR company ILIKE $${n} OR phone ILIKE $${n} OR service_title ILIKE $${n} OR description ILIKE $${n})`;
}

router.get("/quotes", asyncRoute(async (req, res) => {
  const status = cleanString(req.query.status, 20);
  const term = cleanString(req.query.q, 80);
  const where = [];
  const params = [];
  if (QUOTE_STATUSES.includes(status)) { params.push(status); where.push(`status = $${params.length}`); }
  const search = quoteSearchClause(term, params);
  if (search) where.push(search);
  const result = await query(
    `SELECT * FROM quotes ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC LIMIT 200`, params
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
  await logActivity(req, "update", "quote", id, `Demande ${quoteReference(q.id, q.created_at)} : statut « ${status} »`);
  res.json({ item: { ...q, reference: quoteReference(q.id, q.created_at) } });
}));

router.delete("/quotes/:id", asyncRoute(async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: "Identifiant invalide." });
  const result = await query("DELETE FROM quotes WHERE id = $1 RETURNING id, created_at", [id]);
  if (!result.rowCount) return res.status(404).json({ error: "Demande introuvable." });
  await logActivity(req, "delete", "quote", id, `Demande ${quoteReference(id, result.rows[0].created_at)} supprimée`);
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
  await logActivity(req, "create", "client", created.rows[0].id, `Fiche client créée : ${q.name}`);
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
  await logActivity(req, "update", "message", id, `Message n°${id} : statut « ${status} »`);
  res.json({ item: result.rows[0] });
}));

router.delete("/messages/:id", asyncRoute(async (req, res) => {
  const id = parseId(req);
  if (!id) return res.status(400).json({ error: "Identifiant invalide." });
  const result = await query("DELETE FROM messages WHERE id = $1 RETURNING id", [id]);
  if (!result.rowCount) return res.status(404).json({ error: "Message introuvable." });
  await logActivity(req, "delete", "message", id, `Message n°${id} supprimé`);
  res.json({ message: "Message supprimé." });
}));

// --- CRUD générique : projets, services, témoignages, clients ---
// `table`, `order` et les noms de champs viennent uniquement de ce fichier (jamais de la requête).
// `storageFields` : colonnes contenant des images Supabase Storage, nettoyées quand elles sont retirées ou supprimées.
const toStorageUrls = (row, names) => names.flatMap((n) => Array.isArray(row[n]) ? row[n] : (row[n] ? [row[n]] : []));

function mountCrud(name, { table, fields, order, listSql, label, validate, storageFields = [] }) {
  const cols = fields.map(f => f.name);
  const titleOf = (row) => String(row.title || row.author || row.name || `n°${row.id}`).slice(0, 80);
  const valuesOf = (data) => cols.map((c, i) => fields[i].type === "urls" ? JSON.stringify(data[c]) : data[c]);

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
      valuesOf(data)
    );
    await logActivity(req, "create", name, result.rows[0].id, `${label} ajouté : ${titleOf(result.rows[0])}`);
    res.status(201).json({ item: result.rows[0] });
  }));

  router.put(`/${name}/:id`, asyncRoute(async (req, res) => {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Identifiant invalide." });
    const { data, error } = readFields(req.body, fields);
    if (error) return res.status(400).json({ error });
    const problem = validate && validate(data);
    if (problem) return res.status(400).json({ error: problem });
    const before = storageFields.length ? (await query(`SELECT * FROM ${table} WHERE id = $1`, [id])).rows[0] : null;
    const result = await query(
      `UPDATE ${table} SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(", ")}, updated_at = NOW()
       WHERE id = $${cols.length + 1} RETURNING *`,
      [...valuesOf(data), id]
    );
    if (!result.rowCount) return res.status(404).json({ error: `${label} introuvable.` });
    if (before) {
      const kept = new Set(toStorageUrls(result.rows[0], storageFields));
      supa.deleteImages(toStorageUrls(before, storageFields).filter((u) => !kept.has(u)))
        .catch((e) => console.error("Nettoyage images :", e.message));
    }
    await logActivity(req, "update", name, id, `${label} modifié : ${titleOf(result.rows[0])}`);
    res.json({ item: result.rows[0] });
  }));

  router.delete(`/${name}/:id`, asyncRoute(async (req, res) => {
    const id = parseId(req);
    if (!id) return res.status(400).json({ error: "Identifiant invalide." });
    const result = await query(`DELETE FROM ${table} WHERE id = $1 RETURNING *`, [id]);
    if (!result.rowCount) return res.status(404).json({ error: `${label} introuvable.` });
    if (storageFields.length) {
      supa.deleteImages(toStorageUrls(result.rows[0], storageFields)).catch((e) => console.error("Nettoyage images :", e.message));
    }
    await logActivity(req, "delete", name, id, `${label} supprimé : ${titleOf(result.rows[0])}`);
    res.json({ message: `${label} supprimé.` });
  }));
}

mountCrud("projects", {
  table: "projects", label: "Projet", order: "featured DESC, COALESCE(realized_on, created_at::date) DESC, id DESC",
  storageFields: ["image_url", "images"],
  validate: (d) => {
    // La première image de la galerie sert de couverture.
    if (d.images.length) d.image_url = d.images[0];
    return null;
  },
  fields: [
    { name: "title", label: "Le titre", type: "string", min: 2, max: 120, required: true },
    { name: "category", label: "La catégorie", type: "string", min: 2, max: 80, required: true },
    { name: "category_en", label: "La catégorie (anglais)", type: "string", max: 80 },
    { name: "kind", label: "Le type de projet", type: "enum", options: ["website", "business", "landing", "portfolio", "other"], default: "website" },
    { name: "description", label: "La description", type: "text", min: 10, max: 2000, required: true },
    { name: "description_en", label: "La description (anglais)", type: "text", max: 2000 },
    { name: "features", label: "Les fonctionnalités", type: "text", max: 1500 },
    { name: "features_en", label: "Les fonctionnalités (anglais)", type: "text", max: 1500 },
    { name: "technologies", label: "Les technologies", type: "string", max: 300 },
    { name: "url", label: "Le lien du projet", type: "url", max: 500, nullable: true },
    { name: "source_url", label: "Le lien du code source", type: "url", max: 500, nullable: true },
    { name: "image_url", label: "L'image", type: "url", max: 500, nullable: true },
    { name: "images", label: "Les images", type: "urls", max: 500, maxItems: 8 },
    { name: "status", label: "Le statut", type: "enum", options: ["draft", "published"], default: "published" },
    { name: "realized_on", label: "La date de réalisation", type: "date" },
    { name: "icon", label: "L'icône", type: "string", max: 20, default: "💻" },
    { name: "featured", type: "bool" },
    { name: "demo", type: "bool" }
  ]
});

mountCrud("services", {
  table: "services", label: "Service", order: "position, id",
  storageFields: ["image_url"],
  validate: (d) => {
    if (d.price_max !== null && d.starting_price === null) return "Indiquez aussi le prix minimum pour une fourchette.";
    if (d.price_max !== null && d.price_max < d.starting_price) return "Le prix maximum doit être supérieur ou égal au prix minimum.";
    return null;
  },
  fields: [
    { name: "slug", label: "L'identifiant", type: "string", min: 2, max: 60, required: true,
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, patternMessage: "L'identifiant ne peut contenir que des minuscules, chiffres et tirets." },
    { name: "title", label: "Le titre", type: "string", min: 2, max: 120, required: true },
    { name: "title_en", label: "Le titre (anglais)", type: "string", max: 120 },
    { name: "summary", label: "Le résumé", type: "string", min: 5, max: 300, required: true },
    { name: "summary_en", label: "Le résumé (anglais)", type: "string", max: 300 },
    { name: "details", label: "Les fonctionnalités", type: "text", max: 2000 },
    { name: "details_en", label: "Les fonctionnalités (anglais)", type: "text", max: 2000 },
    { name: "advantages", label: "Les avantages", type: "text", max: 1500 },
    { name: "advantages_en", label: "Les avantages (anglais)", type: "text", max: 1500 },
    { name: "technologies", label: "Les technologies", type: "string", max: 300 },
    { name: "icon", label: "L'icône", type: "string", max: 20, default: "◆" },
    { name: "image_url", label: "L'image", type: "url", max: 500, nullable: true },
    { name: "starting_price", label: "Le prix (ou prix minimum)", type: "int", min: 0, max: 100000000 },
    { name: "price_max", label: "Le prix maximum", type: "int", min: 0, max: 100000000 },
    { name: "price_unit", label: "L'unité de prix", type: "string", max: 40 },
    { name: "conditions", label: "Les conditions", type: "text", max: 1000 },
    { name: "conditions_en", label: "Les conditions (anglais)", type: "text", max: 1000 },
    { name: "position", label: "La position", type: "int", min: 0, max: 1000, default: 0 },
    { name: "active", type: "bool" }
  ]
});

mountCrud("testimonials", {
  table: "testimonials", label: "Témoignage", order: "created_at DESC",
  storageFields: ["photo_url"],
  validate: (d) => {
    // Pas d'autorisation = pas de photo conservée (elle ne doit jamais être exposée).
    if (!d.photo_consent) d.photo_url = null;
    return null;
  },
  fields: [
    { name: "author", label: "L'auteur", type: "string", min: 2, max: 100, required: true },
    { name: "role", label: "L'entreprise ou la fonction", type: "string", max: 120 },
    { name: "content", label: "Le témoignage", type: "text", min: 10, max: 1000, required: true },
    { name: "content_en", label: "Le témoignage (anglais)", type: "text", max: 1000 },
    { name: "rating", label: "La note", type: "int", min: 1, max: 5 },
    { name: "testimonial_date", label: "La date", type: "date" },
    { name: "photo_url", label: "La photo", type: "url", max: 500, nullable: true },
    { name: "photo_consent", type: "bool" },
    { name: "published", type: "bool" }
  ]
});

mountCrud("pricing", {
  table: "pricing_plans", label: "Formule", order: "position, id",
  validate: (d) => {
    if (d.price_max !== null && d.price_min === null) return "Indiquez aussi le prix minimum pour une fourchette.";
    if (d.price_max !== null && d.price_max < d.price_min) return "Le prix maximum doit être supérieur ou égal au prix minimum.";
    return null;
  },
  fields: [
    { name: "slug", label: "L'identifiant", type: "string", min: 2, max: 40, required: true,
      pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, patternMessage: "L'identifiant ne peut contenir que des minuscules, chiffres et tirets." },
    { name: "name", label: "Le nom", type: "string", min: 2, max: 60, required: true },
    { name: "name_en", label: "Le nom (anglais)", type: "string", max: 60 },
    { name: "tagline", label: "La phrase d'accroche", type: "string", max: 200 },
    { name: "tagline_en", label: "La phrase d'accroche (anglais)", type: "string", max: 200 },
    { name: "price_min", label: "Le prix (ou prix minimum)", type: "int", min: 0, max: 100000000 },
    { name: "price_max", label: "Le prix maximum", type: "int", min: 0, max: 100000000 },
    { name: "price_unit", label: "L'unité de prix", type: "string", max: 40 },
    { name: "features", label: "Les fonctionnalités", type: "text", max: 1500 },
    { name: "features_en", label: "Les fonctionnalités (anglais)", type: "text", max: 1500 },
    { name: "service_slug", label: "La prestation présélectionnée", type: "string", max: 60 },
    { name: "highlighted", type: "bool" },
    { name: "position", label: "La position", type: "int", min: 0, max: 1000, default: 0 },
    { name: "active", type: "bool" }
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
