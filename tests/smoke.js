// Tests de bout en bout contre un serveur en cours d'exécution.
// Usage : BASE_URL=http://localhost:3000 TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run smoke
// ATTENTION : ce script CRÉE puis supprime des données de test. À lancer sur une base de développement.
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

let passed = 0;
let failed = 0;
function check(name, condition, detail = "") {
  if (condition) { passed++; console.log(`  PASS  ${name}`); }
  else { failed++; console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`); }
}

let cookie = "";
let csrf = "";
async function call(method, path, { body, auth = false, headers = {}, raw = false } = {}) {
  const response = await fetch(BASE + path, {
    method,
    redirect: "manual",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(auth && cookie ? { Cookie: cookie } : {}),
      ...(auth && csrf && method !== "GET" ? { "X-CSRF-Token": csrf } : {}),
      ...headers
    },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const setCookie = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
  if (setCookie.length) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const text = await response.text();
  let json = null;
  if (!raw) { try { json = JSON.parse(text); } catch { /* HTML ou texte */ } }
  return { status: response.status, text, json, headers: response.headers };
}

const validQuote = {
  service: "sites-vitrines", name: "Client Test", email: "client.test@example.com", phone: "+228 90 00 00 00",
  company: "Test SARL", description: "Je souhaite un site vitrine pour mon commerce à Lomé.",
  budget: "100 000 – 300 000 FCFA", deadline: "Environ 1 mois", consent: true
};

(async () => {
  console.log(`Tests sur ${BASE}\n`);

  console.log("Pages publiques");
  for (const [path, needle] of [["/", "SIPOKTECH DIGITAL"], ["/a-propos", "Jean-Paul AHITE"], ["/services", "Services"], ["/tarifs", "FCFA"], ["/portfolio", "Portfolio"], ["/contact", "devis"]]) {
    const r = await call("GET", path, { raw: true });
    check(`GET ${path} répond 200 et contient « ${needle} »`, r.status === 200 && r.text.includes(needle), `status ${r.status}`);
    check(`GET ${path} a un titre, une description et un canonical`, /<title>[^<]+<\/title>/.test(r.text) && /name="description"/.test(r.text) && /rel="canonical"/.test(r.text));
    check(`GET ${path} sans « __SITE_URL__ » ni « {{ » résiduels`, !r.text.includes("__SITE_URL__") && !r.text.includes("{{"));
  }
  const home = await call("GET", "/", { raw: true });
  check("Accueil : en-têtes de sécurité (CSP, nosniff)", Boolean(home.headers.get("content-security-policy")) && home.headers.get("x-content-type-options") === "nosniff");
  check("Accueil : aucun script inline (compatible CSP)", !/<script(?![^>]*\bsrc=)(?![^>]*application\/ld\+json)[^>]*>/.test(home.text));
  check("Lien d'administration absent des pages publiques", !home.text.includes('href="/admin"'));
  const sitemap = await call("GET", "/sitemap.xml", { raw: true });
  check("sitemap.xml liste les 6 pages", (sitemap.text.match(/<loc>/g) || []).length === 6);
  const robots = await call("GET", "/robots.txt", { raw: true });
  check("robots.txt bloque /admin et /api/", robots.text.includes("Disallow: /admin") && robots.text.includes("Disallow: /api/"));
  const nf = await call("GET", "/page-inexistante", { raw: true });
  check("Page 404 HTML", nf.status === 404 && nf.text.includes("introuvable") && nf.text.includes("noindex"));
  const nfApi = await call("GET", "/api/inexistant");
  check("API 404 en JSON", nfApi.status === 404 && Boolean(nfApi.json && nfApi.json.error));

  console.log("\nAPI publique");
  const health = await call("GET", "/health");
  check("/health : base connectée", health.status === 200 && health.json.database === "connected");
  const cfg = await call("GET", "/api/config");
  check("/api/config : WhatsApp et email", cfg.status === 200 && /^\d{8,15}$/.test(cfg.json.whatsappPrimary) && cfg.json.email.includes("@"));
  const services = await call("GET", "/api/services");
  check("/api/services : 6 services avec prix de départ", services.status === 200 && services.json.services.length >= 6 && services.json.services.every((s) => s.startingPrice === null || Number.isInteger(s.startingPrice)));
  const projects = await call("GET", "/api/projects");
  check("/api/projects : projets présents et marqués démo", projects.status === 200 && projects.json.projects.length >= 1 && projects.json.projects.every((p) => typeof p.demo === "boolean"));
  const testimonials = await call("GET", "/api/testimonials");
  check("/api/testimonials : aucun témoignage inventé", testimonials.status === 200 && Array.isArray(testimonials.json.testimonials));

  console.log("\nSystème de devis (validation serveur)");
  const bad = async (patch, label) => {
    const r = await call("POST", "/api/quote", { body: { ...validQuote, ...patch } });
    check(`Devis refusé : ${label}`, r.status === 400, `status ${r.status}`);
  };
  await bad({ name: "A" }, "nom trop court");
  await bad({ email: "pas-un-email" }, "email invalide");
  await bad({ description: "trop court" }, "description trop courte");
  await bad({ budget: "1 franc" }, "budget hors liste");
  await bad({ deadline: "hier" }, "délai hors liste");
  await bad({ service: "inconnu" }, "prestation inconnue");
  await bad({ phone: "<script>" }, "téléphone invalide");
  await bad({ consent: false }, "consentement absent");
  const spam = await call("POST", "/api/quote", { body: { ...validQuote, website: "http://spam" } });
  check("Champ piège rempli : aucune référence créée", spam.status === 200 && !spam.json.reference);
  const foreign = await call("POST", "/api/quote", { body: validQuote, headers: { Origin: "https://evil.example" } });
  check("Origine étrangère refusée (CSRF)", foreign.status === 403);
  const ok = await call("POST", "/api/quote", { body: validQuote });
  check("Devis valide enregistré avec une référence", ok.status === 201 && /^DV-\d{4}-\d{4}$/.test(ok.json.reference || ""), JSON.stringify(ok.json));
  const msg = await call("POST", "/api/contact", { body: { name: "Visiteur Test", email: "visiteur@example.com", subject: "Question test", message: "Bonjour, ceci est un message de test." } });
  check("Message de contact enregistré", msg.status === 201);
  const badMsg = await call("POST", "/api/contact", { body: { name: "V", email: "x", subject: "", message: "court" } });
  check("Message invalide refusé", badMsg.status === 400);
  const badJson = await fetch(BASE + "/api/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{pas du json" });
  check("JSON malformé : 400 propre", badJson.status === 400);

  console.log("\nAdministration (protection serveur)");
  for (const [method, path] of [["GET", "/api/admin/stats"], ["GET", "/api/admin/quotes"], ["GET", "/api/admin/messages"], ["GET", "/api/admin/clients"], ["POST", "/api/admin/services"], ["DELETE", "/api/admin/projects/1"]]) {
    const r = await call(method, path, { body: method === "GET" ? undefined : {} });
    check(`${method} ${path} sans session → 401`, r.status === 401, `status ${r.status}`);
  }
  const badLogin = await call("POST", "/api/admin/login", { body: { email: "nobody@example.com", password: "mauvais-mot-de-passe" } });
  check("Connexion avec de mauvais identifiants → 401", badLogin.status === 401);

  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    console.log("\n  (TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD absents : tests connectés ignorés)");
  } else {
    console.log("\nAdministration (connecté)");
    const login = await call("POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
    check("Connexion administrateur", login.status === 200 && Boolean(login.json.csrfToken), JSON.stringify(login.json));
    csrf = login.json && login.json.csrfToken;
    const noCsrf = await fetch(BASE + "/api/admin/services", { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie }, body: "{}" });
    check("Écriture sans jeton CSRF → 403", noCsrf.status === 403);

    const stats = await call("GET", "/api/admin/stats", { auth: true });
    check("Statistiques : totaux numériques", stats.status === 200 && Number.isInteger(stats.json.totals.quotes_total) && stats.json.totals.quotes_total >= 1);
    const quotes = await call("GET", "/api/admin/quotes", { auth: true });
    const mine = quotes.json.items.find((q) => q.email === validQuote.email);
    check("Le devis envoyé apparaît dans l'administration", Boolean(mine) && mine.status === "nouveau" && mine.reference === ok.json.reference);
    const patched = await call("PATCH", `/api/admin/quotes/${mine.id}`, { auth: true, body: { status: "en cours", notes: "Rappeler demain" } });
    check("Changement de statut + notes du devis", patched.status === 200 && patched.json.item.status === "en cours");
    const badStatus = await call("PATCH", `/api/admin/quotes/${mine.id}`, { auth: true, body: { status: "inventé" } });
    check("Statut de devis invalide refusé", badStatus.status === 400);
    const client = await call("POST", `/api/admin/quotes/${mine.id}/client`, { auth: true, body: {} });
    check("Fiche client créée depuis un devis", client.status === 201 || client.status === 200);
    const clientAgain = await call("POST", `/api/admin/quotes/${mine.id}/client`, { auth: true, body: {} });
    check("Pas de doublon client (même email)", clientAgain.status === 200 && clientAgain.json.existing === true);

    const svc = await call("POST", "/api/admin/services", { auth: true, body: { slug: "test-service", title: "Service de test", summary: "Résumé du service de test", details: "Point 1\nPoint 2", icon: "T", starting_price: 12345, price_unit: "", conditions: "", position: 99, active: true } });
    check("Création d'un service", svc.status === 201 && svc.json.item.starting_price === 12345, JSON.stringify(svc.json));
    const dup = await call("POST", "/api/admin/services", { auth: true, body: { slug: "test-service", title: "Doublon", summary: "Résumé doublon", position: 1, active: true } });
    check("Identifiant de service en double → 409", dup.status === 409);
    const badSlug = await call("POST", "/api/admin/services", { auth: true, body: { slug: "Mauvais Slug!", title: "X Y", summary: "Résumé valable", position: 1, active: true } });
    check("Identifiant de service invalide → 400", badSlug.status === 400);
    const pub = await call("GET", "/api/services");
    check("Le service créé apparaît sur le site public", pub.json.services.some((s) => s.slug === "test-service" && s.startingPrice === 12345));
    const upd = await call("PUT", `/api/admin/services/${svc.json.item.id}`, { auth: true, body: { slug: "test-service", title: "Service de test", summary: "Résumé du service de test", details: "", icon: "T", starting_price: "", price_unit: "", conditions: "", position: 99, active: false } });
    check("Service masqué + prix vide = « sur devis »", upd.status === 200 && upd.json.item.starting_price === null && upd.json.item.active === false);
    const pub2 = await call("GET", "/api/services");
    check("Un service masqué disparaît du site public", !pub2.json.services.some((s) => s.slug === "test-service"));
    const delSvc = await call("DELETE", `/api/admin/services/${svc.json.item.id}`, { auth: true });
    check("Suppression du service", delSvc.status === 200);

    const proj = await call("POST", "/api/admin/projects", { auth: true, body: { title: "Projet de test", category: "Test", description: "Description du projet de test.", technologies: "Node.js, PostgreSQL", url: "https://example.com", source_url: "", image_url: "", icon: "T", featured: false, demo: false } });
    check("Création d'un projet réel (demo = false)", proj.status === 201 && proj.json.item.demo === false && proj.json.item.source_url === null);
    const badUrl = await call("POST", "/api/admin/projects", { auth: true, body: { title: "Projet X", category: "Test", description: "Description valable.", url: "javascript:alert(1)" } });
    check("URL non http(s) refusée", badUrl.status === 400);
    await call("DELETE", `/api/admin/projects/${proj.json.item.id}`, { auth: true });

    const t = await call("POST", "/api/admin/testimonials", { auth: true, body: { author: "Auteur Test", role: "Gérant", content: "Texte de test pour le témoignage.", published: false } });
    const hidden = await call("GET", "/api/testimonials");
    check("Témoignage non publié : invisible du public", t.status === 201 && !hidden.json.testimonials.some((x) => x.author === "Auteur Test"));
    await call("PUT", `/api/admin/testimonials/${t.json.item.id}`, { auth: true, body: { author: "Auteur Test", role: "Gérant", content: "Texte de test pour le témoignage.", published: true } });
    const shown = await call("GET", "/api/testimonials");
    check("Témoignage publié : visible du public", shown.json.testimonials.some((x) => x.author === "Auteur Test"));
    await call("DELETE", `/api/admin/testimonials/${t.json.item.id}`, { auth: true });

    const notFound = await call("DELETE", "/api/admin/projects/999999", { auth: true });
    check("Suppression d'un élément inexistant → 404", notFound.status === 404);
    const weirdId = await call("DELETE", "/api/admin/projects/abc", { auth: true });
    check("Identifiant non numérique → 400", weirdId.status === 400);

    // Nettoyage des données de test
    const clients = await call("GET", "/api/admin/clients", { auth: true });
    for (const c of clients.json.items.filter((x) => x.email === validQuote.email)) await call("DELETE", `/api/admin/clients/${c.id}`, { auth: true });
    await call("DELETE", `/api/admin/quotes/${mine.id}`, { auth: true });
    const messages = await call("GET", "/api/admin/messages", { auth: true });
    for (const m of messages.json.items.filter((x) => x.email === "visiteur@example.com")) await call("DELETE", `/api/admin/messages/${m.id}`, { auth: true });

    const out = await call("POST", "/api/admin/logout", { auth: true, body: {} });
    check("Déconnexion", out.status === 200);
    const after = await call("GET", "/api/admin/stats", { auth: true });
    check("Après déconnexion : accès refusé", after.status === 401);
  }

  console.log("\nProtection anti-spam (limitation de débit)");
  let limited = false;
  for (let i = 0; i < 10 && !limited; i++) {
    const r = await call("POST", "/api/contact", { body: { name: "Spam Test", email: "spam@example.com", subject: "Spam", message: "message de test anti spam" } });
    if (r.status === 429) limited = true;
  }
  check("Trop de messages → 429", limited);

  console.log(`\nRésultat : ${passed} réussis, ${failed} échoués`);
  process.exit(failed ? 1 : 0);
})().catch((error) => { console.error("Erreur du script de test :", error); process.exit(1); });
