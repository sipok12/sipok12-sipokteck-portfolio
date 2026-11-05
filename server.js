require("dotenv").config();

const fs = require("fs");
const path = require("path");
const express = require("express");
const helmet = require("helmet");
const session = require("express-session");
const PgSession = require("connect-pg-simple")(session);
const { pool, query } = require("./db");
const { asyncRoute } = require("./lib/validate");
const { initializeDatabase } = require("./lib/init");
const { registerPages } = require("./lib/pages");
const publicRoutes = require("./routes/public");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === "production";
const publicDir = path.join(__dirname, "public");

if (isProduction && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)) {
  console.error("SESSION_SECRET manquant ou trop court (32 caractères minimum). Arrêt du serveur.");
  process.exit(1);
}

app.set("trust proxy", isProduction ? 1 : false);
app.disable("x-powered-by");
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      // En développement, le faux stockage de test sert les images en http ; en production : https uniquement.
      imgSrc: ["'self'", "data:", "https:", ...(isProduction ? [] : ["http:"])],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: isProduction ? [] : null
    }
  }
}));
app.use(express.json({ limit: "20kb" }));
app.use(express.urlencoded({ extended: false, limit: "20kb" }));

// Défense CSRF n°1 : une requête qui modifie des données doit venir de notre propre domaine.
app.use("/api", (req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const origin = req.get("origin");
  if (origin) {
    let host = "";
    try { host = new URL(origin).host; } catch { /* origine invalide */ }
    if (host !== req.get("host")) return res.status(403).json({ error: "Origine non autorisée." });
  }
  next();
});

app.use(session({
  name: "sipokteck.sid",
  store: new PgSession({
    pool,
    tableName: "user_sessions",
    createTableIfMissing: true,
    pruneSessionInterval: 15 * 60
  }),
  secret: process.env.SESSION_SECRET || "development-only-change-this-session-secret",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.get("/health", asyncRoute(async (req, res) => {
  await query("SELECT 1");
  res.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
}));

app.use("/api/admin", adminRoutes);
app.use("/api", publicRoutes);

// Pages publiques (gabarit commun), sitemap.xml et robots.txt.
const pagesApi = registerPages(app);

app.get("/admin", (req, res) => {
  res.set("X-Robots-Tag", "noindex, nofollow");
  res.set("Cache-Control", "no-store");
  res.sendFile(path.join(publicDir, "admin.html"));
});

// Fichier de vérification Google Search Console (conservé).
const googleFile = path.join(__dirname, "google840922cc77aec56d.html");
if (fs.existsSync(googleFile)) app.get("/google840922cc77aec56d.html", (req, res) => res.sendFile(googleFile));

app.use(express.static(publicDir, { extensions: ["html"], index: false, maxAge: isProduction ? "1h" : 0 }));

app.use((req, res) => {
  if (req.path.startsWith("/api/") || !["GET", "HEAD"].includes(req.method)) {
    return res.status(404).json({ error: "Ressource introuvable." });
  }
  pagesApi.sendNotFound(req, res);
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  let status = 500;
  let message = "Une erreur serveur est survenue. Réessayez plus tard.";
  if (err.type === "entity.parse.failed") { status = 400; message = "Requête invalide."; }
  else if (err.type === "entity.too.large") { status = 413; message = "Requête trop volumineuse."; }
  else if (err.code === "23505") { status = 409; message = "Cette valeur existe déjà (doublon)."; }
  else console.error("Erreur serveur :", err.message);
  if (req.path.startsWith("/api/")) return res.status(status).json({ error: message });
  res.status(status).type("text/plain; charset=utf-8").send(message);
});

initializeDatabase()
  .then(() => {
    app.listen(PORT, () => console.log(`SIPOKTECH DIGITAL disponible sur http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error("Impossible de démarrer le serveur. Vérifiez DATABASE_URL et schema.sql :", err.message);
    process.exit(1);
  });
