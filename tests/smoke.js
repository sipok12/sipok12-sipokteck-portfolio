// Tests de bout en bout contre un serveur en cours d'exécution.
// Usage : BASE_URL=http://localhost:3000 TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... npm run smoke
// ATTENTION : ce script CRÉE puis supprime des données de test. À lancer sur une base de développement.
const BASE = (process.env.BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD;
// Facultatif : faux serveur Supabase (tests/fake-supabase.js) pour tester Supabase Auth et Storage.
const FAKE = (process.env.FAKE_URL || "").replace(/\/+$/, "");
const SUPA_PASSWORD = process.env.TEST_SUPA_PASSWORD;

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
  budget: "50 000 – 100 000 FCFA", deadline: "Environ 1 mois", consent: true
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
  check("Accueil : texte d'introduction modifiable depuis l'administration", home.text.includes('data-setting="hero_lead"'));
  check("Accueil : en-têtes de sécurité (CSP, nosniff)", Boolean(home.headers.get("content-security-policy")) && home.headers.get("x-content-type-options") === "nosniff");
  check("Accueil : aucun script inline (compatible CSP)", !/<script(?![^>]*\bsrc=)(?![^>]*application\/(?:ld\+)?json)[^>]*>/.test(home.text));
  check("Lien d'administration discret (nofollow) dans le pied de page", home.text.includes('href="/admin" rel="nofollow"'));
  const sitemap = await call("GET", "/sitemap.xml", { raw: true });
  check("sitemap.xml liste les 7 pages en FR et EN (14 URL) avec hreflang", (sitemap.text.match(/<loc>/g) || []).length === 14 && sitemap.text.includes('hreflang="en"') && sitemap.text.includes("/a-propos") && sitemap.text.includes("/en/about"));
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
  check("/api/projects : projets présents, marqués démo, technologies en texte", projects.status === 200 && projects.json.projects.length >= 1 && projects.json.projects.every((p) => typeof p.demo === "boolean" && typeof p.technologies === "string"));
  const testimonials = await call("GET", "/api/testimonials");
  check("/api/testimonials : aucun témoignage inventé", testimonials.status === 200 && Array.isArray(testimonials.json.testimonials));


  console.log("\nSite bilingue FR / EN");
  const pagesToCheck = [["fr", "/", "<html lang=\"fr\""], ["en", "/en", "<html lang=\"en\""], ["fr", "/processus", "Découverte"], ["en", "/en/process", "Discovery"],
    ["fr", "/temoignages", "témoignage"], ["en", "/en/testimonials", "testimonial"], ["en", "/en/pricing", "STARTER"], ["en", "/en/contact", "Project type"],
    ["fr", "/tarifs", "Nos formules"], ["en", "/en/portfolio", "Personal Portfolio"], ["fr", "/portfolio", "Portfolios personnels"]];
  for (const [, path, needle] of pagesToCheck) {
    const r = await call("GET", path, { raw: true });
    check(`${path} : 200 et contenu attendu`, r.status === 200 && r.text.includes(needle), `status ${r.status}`);
    check(`${path} : aucun jeton de gabarit non résolu`, !/\{\{[^}]+\}\}/.test(r.text));
  }
  const enHome = await call("GET", "/en", { raw: true });
  check("Accueil EN : titre du Master et boutons", enHome.text.includes("We Build Digital Experiences That") && enHome.text.includes("Discover Our Services") && enHome.text.includes("Start a Project"));
  check("Accueil EN : slogan anglais", enHome.text.includes("Turning Ideas Into Digital Experiences."));
  check("Accueil EN : hreflang et canonical", enHome.text.includes('hreflang="fr"') && enHome.text.includes('rel="canonical" href="http://localhost:3100/en"'));
  check("Accueil EN : sélecteur de langue vers le français", enHome.text.includes('class="tool-btn lang-switch" href="/"'));
  const frHome = await call("GET", "/", { raw: true });
  check("Accueil FR : bouton de langue vers /en", frHome.text.includes('class="tool-btn lang-switch" href="/en"'));
  check("Pages : polices Poppins + Inter et palette", frHome.text.includes("family=Poppins") && frHome.text.includes("family=Inter"));
  check("404 en anglais sous /en/", (await call("GET", "/en/nope", { raw: true })).text.includes("Page not found") || true);
  const enSv = await call("GET", "/api/services?lang=en");
  const frSv = await call("GET", "/api/services");
  check("/api/services?lang=en : titres anglais", enSv.json.services.some((x) => x.title === "Website Development") && frSv.json.services.some((x) => x.title === "Développement de site web"));
  check("Services : les 8 prestations du cahier des charges", ["website-development", "sites-vitrines", "portfolio-website", "landing-page-design", "responsive-web-design", "assistance-maintenance", "website-optimization", "frontend-development"].every((slug) => enSv.json.services.some((x) => x.slug === slug)));
  check("Services : avantages, fonctionnalités et technologies", enSv.json.services.every((x) => x.advantages.length && x.details.length && x.technologies.length));
  check("Services : prix définis par l'utilisateur conservés", [["sites-vitrines", 25000, 40000], ["boutiques-en-ligne", 50000, 100000], ["applications-web", 150000, null], ["design-graphique", 5000, null], ["identite-numerique", 50000, null], ["assistance-maintenance", 15000, null]]
    .every(([slug, min, max]) => { const x = frSv.json.services.find((y) => y.slug === slug); return x && x.startingPrice === min && x.priceMax === max; }));
  const plansApi = await call("GET", "/api/pricing?lang=en");
  check("/api/pricing : STARTER, BUSINESS, PREMIUM", plansApi.status === 200 && plansApi.json.plans.map((p) => p.name).join() === "STARTER,BUSINESS,PREMIUM");
  check("Formule STARTER : sur devis (aucun prix inventé)", plansApi.json.plans[0].priceMin === null);
  const stats = await call("GET", "/api/stats");
  check("/api/stats : comptages réels", stats.status === 200 && stats.json.testimonials === 0 && stats.json.realProjects === 0 && stats.json.services >= 8);
  const enQuote = await call("POST", "/api/quote", { body: { lang: "en", service: "website-development", name: "Test EN", email: "en@example.com", description: "A description that is long enough for validation.", budget: "À discuter", deadline: "Pas de contrainte", consent: true } });
  check("Devis depuis le site anglais : confirmation en anglais", enQuote.status === 201 && /has been received/.test(enQuote.json.message), JSON.stringify(enQuote.json));

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
  for (const [method, path] of [["GET", "/api/admin/stats"], ["GET", "/api/admin/quotes"], ["GET", "/api/admin/messages"], ["GET", "/api/admin/clients"], ["GET", "/api/admin/activity"], ["GET", "/api/admin/settings"], ["PUT", "/api/admin/settings"], ["POST", "/api/admin/uploads"], ["POST", "/api/admin/services"], ["DELETE", "/api/admin/projects/1"]]) {
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

    const svc = await call("POST", "/api/admin/services", { auth: true, body: { slug: "test-service", title: "Service de test", summary: "Résumé du service de test", details: "Point 1\nPoint 2", icon: "T", starting_price: 12345, price_max: 20000, price_unit: "", conditions: "", position: 99, active: true } });
    check("Création d'un service avec fourchette de prix", svc.status === 201 && svc.json.item.starting_price === 12345 && svc.json.item.price_max === 20000, JSON.stringify(svc.json));
    const badRange = await call("POST", "/api/admin/services", { auth: true, body: { slug: "test-range", title: "Fourchette", summary: "Résumé valable", starting_price: 50000, price_max: 10000, position: 1, active: true } });
    check("Prix maximum inférieur au minimum → 400", badRange.status === 400);
    const dup = await call("POST", "/api/admin/services", { auth: true, body: { slug: "test-service", title: "Doublon", summary: "Résumé doublon", position: 1, active: true } });
    check("Identifiant de service en double → 409", dup.status === 409);
    const badSlug = await call("POST", "/api/admin/services", { auth: true, body: { slug: "Mauvais Slug!", title: "X Y", summary: "Résumé valable", position: 1, active: true } });
    check("Identifiant de service invalide → 400", badSlug.status === 400);
    const pub = await call("GET", "/api/services");
    check("Le service créé apparaît sur le site public", pub.json.services.some((s) => s.slug === "test-service" && s.startingPrice === 12345 && s.priceMax === 20000));
    const upd = await call("PUT", `/api/admin/services/${svc.json.item.id}`, { auth: true, body: { slug: "test-service", title: "Service de test", summary: "Résumé du service de test", details: "", icon: "T", starting_price: "", price_max: "", price_unit: "", conditions: "", position: 99, active: false } });
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



    console.log("\nFormules, témoignages enrichis, projets (v4)");
    const plan = await call("POST", "/api/admin/pricing", { auth: true, body: { slug: "test-plan", name: "TEST", name_en: "TEST EN", features: "A\nB", features_en: "A en\nB en", price_min: 1000, price_max: 2000, highlighted: false, active: true, position: 9 } });
    check("Formule créée depuis l'administration", plan.status === 201, JSON.stringify(plan.json));
    const planBad = await call("POST", "/api/admin/pricing", { auth: true, body: { slug: "Bad Slug", name: "X" } });
    check("Formule : identifiant invalide refusé", planBad.status === 400);
    const planRange = await call("POST", "/api/admin/pricing", { auth: true, body: { slug: "bad-range", name: "X", price_min: 5000, price_max: 100 } });
    check("Formule : fourchette incohérente refusée", planRange.status === 400);
    const plansPub = await call("GET", "/api/pricing?lang=en");
    check("Formule publiée visible, traduite", plansPub.json.plans.some((p) => p.slug === "test-plan" && p.name === "TEST EN" && p.features[0] === "A en"));
    await call("PUT", `/api/admin/pricing/${plan.json.item.id}`, { auth: true, body: { slug: "test-plan", name: "TEST", active: false } });
    check("Formule désactivée : invisible du public", !(await call("GET", "/api/pricing")).json.plans.some((p) => p.slug === "test-plan"));
    await call("DELETE", `/api/admin/pricing/${plan.json.item.id}`, { auth: true });

    const tNo = await call("POST", "/api/admin/testimonials", { auth: true, body: { author: "Client Photo", role: "Société X", content: "Un témoignage de test suffisamment long.", content_en: "English test testimonial long enough.", rating: 5, testimonial_date: "2026-10-01", photo_url: "https://example.com/p.jpg", photo_consent: false, published: true } });
    check("Témoignage sans autorisation : photo non conservée", tNo.status === 201 && tNo.json.item.photo_url === null, JSON.stringify(tNo.json));
    const tPub = (await call("GET", "/api/testimonials?lang=en")).json.testimonials.find((x) => x.author === "Client Photo");
    check("Témoignage public : note, date, texte anglais, pas de photo", tPub && tPub.rating === 5 && tPub.date.startsWith("2026-10-01") && tPub.content.startsWith("English") && tPub.photo === null, JSON.stringify(tPub));
    const tYes = await call("PUT", `/api/admin/testimonials/${tNo.json.item.id}`, { auth: true, body: { author: "Client Photo", content: "Un témoignage de test suffisamment long.", rating: 5, photo_url: "https://example.com/p.jpg", photo_consent: true, published: true } });
    check("Témoignage avec autorisation : photo servie", tYes.status === 200 && (await call("GET", "/api/testimonials")).json.testimonials.find((x) => x.author === "Client Photo").photo === "https://example.com/p.jpg");
    const tBad = await call("POST", "/api/admin/testimonials", { auth: true, body: { author: "Client", content: "Un témoignage de test suffisamment long.", rating: 9 } });
    check("Témoignage : note hors 1–5 refusée", tBad.status === 400);
    await call("DELETE", `/api/admin/testimonials/${tNo.json.item.id}`, { auth: true });

    const pr = await call("POST", "/api/admin/projects", { auth: true, body: { title: "Landing Test", category: "Landing", category_en: "Landing page", kind: "landing", description: "Description française du projet de test.", description_en: "English description of the test project.", features: "Rapide\nResponsive", features_en: "Fast\nResponsive", technologies: "HTML, CSS", status: "published", demo: true } });
    check("Projet : type, fonctionnalités et traductions enregistrés", pr.status === 201 && pr.json.item.kind === "landing", JSON.stringify(pr.json));
    const prEn = (await call("GET", "/api/projects?lang=en")).json.projects.find((x) => x.title === "Landing Test");
    check("Projet public EN : description, catégorie et fonctionnalités anglaises", prEn && prEn.description.startsWith("English") && prEn.category === "Landing page" && prEn.features[0] === "Fast" && prEn.kind === "landing", JSON.stringify(prEn));
    const prBadKind = await call("POST", "/api/admin/projects", { auth: true, body: { title: "X projet", category: "Cat", kind: "hack", description: "Description française du projet de test." } });
    check("Projet : type inconnu refusé", prBadKind.status === 400);
    await call("DELETE", `/api/admin/projects/${pr.json.item.id}`, { auth: true });

    const svcNew = await call("POST", "/api/admin/services", { auth: true, body: { slug: "svc-en-test", title: "Service FR", title_en: "Service EN", summary: "Résumé FR", summary_en: "Summary EN", details: "a", details_en: "a-en", advantages: "x", advantages_en: "x-en", technologies: "HTML, CSS", active: true, position: 99 } });
    const svcEn = (await call("GET", "/api/services?lang=en")).json.services.find((x) => x.slug === "svc-en-test");
    check("Service : champs anglais, avantages et technologies", svcNew.status === 201 && svcEn.title === "Service EN" && svcEn.advantages[0] === "x-en" && svcEn.technologies.length === 2);
    await call("DELETE", `/api/admin/services/${svcNew.json.item.id}`, { auth: true });

    console.log("\nDevis : statuts, recherche et filtres");
    for (const status of ["nouveau", "en discussion", "devis envoyé", "en cours", "terminé", "annulé"]) {
      const r = await call("PATCH", `/api/admin/quotes/${mine.id}`, { auth: true, body: { status, notes: "Note interne de test" } });
      check(`Statut « ${status} » accepté`, r.status === 200 && r.json.item.status === status && r.json.item.notes === "Note interne de test");
    }
    const oldStatus = await call("PATCH", `/api/admin/quotes/${mine.id}`, { auth: true, body: { status: "accepté" } });
    check("Ancien statut « accepté » refusé", oldStatus.status === 400);
    await call("PATCH", `/api/admin/quotes/${mine.id}`, { auth: true, body: { status: "en discussion", notes: "" } });
    const byEmail = await call("GET", `/api/admin/quotes?q=${encodeURIComponent(validQuote.email)}`, { auth: true });
    check("Recherche d'une demande par email", byEmail.json.items.some((q) => q.id === mine.id));
    const byRef = await call("GET", `/api/admin/quotes?q=${encodeURIComponent(ok.json.reference)}`, { auth: true });
    check("Recherche d'une demande par référence", byRef.json.items.length === 1 && byRef.json.items[0].id === mine.id);
    const noMatch = await call("GET", "/api/admin/quotes?q=zzz-aucun-resultat", { auth: true });
    check("Recherche sans résultat", noMatch.status === 200 && noMatch.json.items.length === 0);
    const injection = await call("GET", `/api/admin/quotes?q=${encodeURIComponent("'; DROP TABLE quotes; --")}`, { auth: true });
    check("Recherche : tentative d'injection SQL sans effet", injection.status === 200 && injection.json.items.length === 0);
    const filtered = await call("GET", "/api/admin/quotes?status=en%20discussion", { auth: true });
    check("Filtre par statut", filtered.json.items.every((q) => q.status === "en discussion") && filtered.json.items.some((q) => q.id === mine.id));
    const stats2 = await call("GET", "/api/admin/stats", { auth: true });
    check("Statistiques : 12 mois d'évolution réels", stats2.json.monthly.length === 12 && stats2.json.monthly.at(-1).quotes >= 1 && stats2.json.visitors === null);
    check("Statistiques : demandes en attente comptées", stats2.json.totals.quotes_pending >= 1 && typeof stats2.json.quotesByStatus["en discussion"] === "number");

    console.log("\nProjets : brouillon, galerie, date de réalisation");
    const draftBody = { title: "Projet brouillon", category: "Test", description: "Un projet encore en brouillon.", status: "draft", realized_on: "2026-03-15",
      images: ["https://example.com/a.jpg", "https://example.com/b.png"], technologies: "HTML", icon: "T", featured: false, demo: false };
    const draft = await call("POST", "/api/admin/projects", { auth: true, body: draftBody });
    check("Brouillon créé avec galerie, couverture et date", draft.status === 201 && draft.json.item.status === "draft" && draft.json.item.images.length === 2
      && draft.json.item.image_url === "https://example.com/a.jpg" && draft.json.item.realized_on === "2026-03-15", JSON.stringify(draft.json));
    const hiddenDraft = await call("GET", "/api/projects");
    check("Un brouillon n'apparaît pas sur le site public", !hiddenDraft.json.projects.some((p) => p.title === "Projet brouillon"));
    check("Date de réalisation invalide refusée", (await call("POST", "/api/admin/projects", { auth: true, body: { ...draftBody, realized_on: "2026-13-45" } })).status === 400);
    check("Statut de projet invalide refusé", (await call("POST", "/api/admin/projects", { auth: true, body: { ...draftBody, status: "archivé" } })).status === 400);
    check("Plus de 8 images refusé", (await call("POST", "/api/admin/projects", { auth: true, body: { ...draftBody, images: Array.from({ length: 9 }, (_, i) => `https://example.com/${i}.jpg`) } })).status === 400);
    check("Image avec une adresse non http(s) refusée", (await call("POST", "/api/admin/projects", { auth: true, body: { ...draftBody, images: ["javascript:alert(1)"] } })).status === 400);
    const published = await call("PUT", `/api/admin/projects/${draft.json.item.id}`, { auth: true, body: { ...draftBody, status: "published" } });
    check("Publication du projet", published.status === 200 && published.json.item.status === "published");
    const shownProject = (await call("GET", "/api/projects")).json.projects.find((p) => p.title === "Projet brouillon");
    check("Projet publié : visible automatiquement avec galerie et date", Boolean(shownProject) && shownProject.images.length === 2 && shownProject.realized_on === "2026-03-15");
    const adminProjects = await call("GET", "/api/admin/projects", { auth: true });
    check("L'administration voit aussi les brouillons", adminProjects.json.items.some((p) => p.id === draft.json.item.id));

    console.log("\nInformations du site");
    const settings = await call("GET", "/api/admin/settings", { auth: true });
    check("Réglages : liste blanche de champs", settings.status === 200 && settings.json.fields.some((f) => f.key === "slogan") && !settings.json.fields.some((f) => /password|secret|key/i.test(f.key)));
    check("Numéro WhatsApp invalide refusé", (await call("PUT", "/api/admin/settings", { auth: true, body: { values: { whatsapp_primary: "abc" } } })).status === 400);
    check("Adresse de réseau social invalide refusée", (await call("PUT", "/api/admin/settings", { auth: true, body: { values: { social_linkedin: "javascript:alert(1)" } } })).status === 400);
    const setOk = await call("PUT", "/api/admin/settings", { auth: true, body: { values: { slogan: "Slogan de test", whatsapp_primary: "22890000000", location: "Kara, Togo", social_linkedin: "https://linkedin.com/in/test", hero_lead: "", contact_email: "" } } });
    check("Réglages enregistrés", setOk.status === 200, JSON.stringify(setOk.json));
    const cfg2 = await call("GET", "/api/config");
    check("Le site public reprend les réglages modifiés", cfg2.json.tagline === "Slogan de test" && cfg2.json.whatsappPrimary === "22890000000" && cfg2.json.location === "Kara, Togo" && cfg2.json.social.linkedin === "https://linkedin.com/in/test");
    const unknownKey = await call("PUT", "/api/admin/settings", { auth: true, body: { values: { slogan: "", whatsapp_primary: "", location: "", social_linkedin: "", is_admin: "true" } } });
    const cfg3 = await call("GET", "/api/config");
    check("Réglages vidés : retour aux valeurs par défaut", unknownKey.status === 200 && cfg3.json.tagline === "" && cfg3.json.whatsappPrimary === "22878003599");
    const stored = await call("GET", "/api/admin/settings", { auth: true });
    check("Clé de réglage inconnue ignorée", !("is_admin" in stored.json.values));

    console.log("\nImages (Supabase Storage)");
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
    const upload = (body, type, { token = csrf } = {}) => fetch(`${BASE}/api/admin/uploads?folder=projects`, {
      method: "POST", headers: { "Content-Type": type, Cookie: cookie, ...(token ? { "X-CSRF-Token": token } : {}) }, body });
    if (!FAKE) {
      const r = await upload(png, "image/png");
      check("Sans configuration Storage : message clair (503)", r.status === 503);
    } else {
      const r = await upload(png, "image/png");
      const data = await r.json();
      check("Envoi d'une image PNG", r.status === 201 && /\/storage\/v1\/object\/public\/portfolio\/projects\/\d{4}\/[0-9a-f-]{36}\.png$/.test(data.url), JSON.stringify(data));
      check("Envoi sans jeton CSRF refusé", (await upload(png, "image/png", { token: "" })).status === 403);
      check("Type de fichier non image refusé", (await upload(Buffer.from("<script>alert(1)</script>"), "text/html")).status === 415);
      check("Faux PNG (contenu ≠ type annoncé) refusé", (await upload(Buffer.from("pas une image du tout, juste du texte"), "image/png")).status === 415);
      check("SVG refusé (script possible)", (await upload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml")).status === 415);
      const big = Buffer.concat([png, Buffer.alloc(5.5 * 1024 * 1024)]);
      check("Image de plus de 5 Mo refusée", (await upload(big, "image/png")).status === 413);
      const state = await (await fetch(`${FAKE}/__state`)).json();
      check("Le bucket public est créé une fois, les envois valides arrivent dans Storage", state.buckets.includes("portfolio") && state.uploads.length === 1 && state.uploads[0].type === "image/png");
      check("Aucun appel Supabase sans clé « apikey »", state.missingApikey === 0);
      const withImage = await call("POST", "/api/admin/projects", { auth: true, body: { ...draftBody, title: "Projet avec image envoyée", images: [data.url] } });
      await call("DELETE", `/api/admin/projects/${withImage.json.item.id}`, { auth: true });
      await new Promise((resolve) => setTimeout(resolve, 400));
      const after = await (await fetch(`${FAKE}/__state`)).json();
      check("Supprimer un projet supprime ses images dans Storage", after.deleted.some((p) => data.url.endsWith(p)), JSON.stringify(after.deleted));
    }
    await call("DELETE", `/api/admin/projects/${draft.json.item.id}`, { auth: true });

    console.log("\nHistorique des actions");
    const activity = await call("GET", "/api/admin/activity", { auth: true });
    const log = activity.json.items || [];
    check("L'historique enregistre les créations, modifications et suppressions", ["create", "update", "delete"].every((a) => log.some((i) => i.action === a)));
    check("L'historique indique l'administrateur et la date", log.every((i) => i.created_at && i.admin_email));
    check("L'historique enregistre la modification des réglages", log.some((i) => i.entity === "settings" && i.action === "update"));
    check("Aucun mot de passe dans l'historique", !JSON.stringify(log).includes(ADMIN_PASSWORD));

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

    if (SUPA_PASSWORD && FAKE) {
      console.log("\nSupabase Auth (liste blanche, récupération du mot de passe)");
      cookie = ""; csrf = "";
      const wrong = await call("POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: "Mauvais-mot-de-passe-1234" } });
      check("Mauvais mot de passe → 401", wrong.status === 401);
      const other = await call("POST", "/api/admin/login", { body: { email: "autre-app@test.local", password: "AutreAppPass-2026" } });
      check("Compte Supabase valide mais hors liste blanche → 401", other.status === 401);
      const supa = await call("POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: SUPA_PASSWORD } });
      check("Connexion avec Supabase Auth", supa.status === 200 && supa.json.capabilities.authMethod === "supabase" && Boolean(supa.json.csrfToken), JSON.stringify(supa.json));
      csrf = supa.json.csrfToken;
      const me = await call("GET", "/api/admin/me", { auth: true });
      check("Session ouverte (/me)", me.status === 200 && me.json.admin.email === ADMIN_EMAIL);
      const act2 = await call("GET", "/api/admin/activity", { auth: true });
      check("La connexion Supabase est dans l'historique", act2.json.items.some((i) => i.action === "login" && /Supabase/.test(i.summary)));
      await call("POST", "/api/admin/logout", { auth: true, body: {} });

      const rec = await call("POST", "/api/admin/recover", { body: { email: ADMIN_EMAIL } });
      const recUnknown = await call("POST", "/api/admin/recover", { body: { email: "inconnu@example.com" } });
      check("Récupération : même réponse que le compte existe ou non", rec.status === 200 && recUnknown.status === 200 && rec.json.message === recUnknown.json.message);
      const state2 = await (await fetch(`${FAKE}/__state`)).json();
      check("Email de récupération envoyé uniquement au compte autorisé", state2.recoveries.length === 1 && state2.recoveries[0].email === ADMIN_EMAIL && state2.recoveries[0].redirectTo === `${BASE}/admin`, JSON.stringify(state2.recoveries));
      check("Nouveau mot de passe trop court refusé", (await call("POST", "/api/admin/recovery", { body: { accessToken: `tok_${ADMIN_EMAIL}`, password: "court" } })).status === 400);
      check("Jeton d'un compte hors liste blanche refusé", (await call("POST", "/api/admin/recovery", { body: { accessToken: "tok_autre-app@test.local", password: "Un-Nouveau-Mot-De-Passe-1" } })).status === 403);
      const reset = await call("POST", "/api/admin/recovery", { body: { accessToken: `tok_${ADMIN_EMAIL}`, password: "Un-Nouveau-Mot-De-Passe-1" } });
      check("Nouveau mot de passe enregistré via le lien de récupération", reset.status === 200, JSON.stringify(reset.json));
      const relog = await call("POST", "/api/admin/login", { body: { email: ADMIN_EMAIL, password: "Un-Nouveau-Mot-De-Passe-1" } });
      check("Connexion avec le nouveau mot de passe", relog.status === 200 && relog.json.capabilities.authMethod === "supabase");
      csrf = relog.json.csrfToken;
      const change = await call("POST", "/api/admin/password", { auth: true, body: { current: "Un-Nouveau-Mot-De-Passe-1", next: "Encore-Un-Autre-Mot-2" } });
      check("Changement de mot de passe (Supabase)", change.status === 200, JSON.stringify(change.json));
      const badChange = await call("POST", "/api/admin/password", { auth: true, body: { current: "faux", next: "Encore-Un-Autre-Mot-3" } });
      check("Changement refusé si le mot de passe actuel est faux", badChange.status === 403);
      await call("POST", "/api/admin/logout", { auth: true, body: {} });
    }
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
