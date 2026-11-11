// Assemblage des pages HTML bilingues (FR + EN) : un gabarit commun (layout), un en-tête et un pied de page partagés,
// et le contenu de chaque page. Les gabarits contiennent des jetons remplacés au démarrage :
//   {{t.a.b}}  texte traduit      {{p:cle}}  adresse de la page dans la langue courante      {{switch}}  même page dans l'autre langue
// Tout est construit une seule fois au démarrage (une clé de traduction manquante empêche le démarrage : test automatique).
const fs = require("fs");
const path = require("path");
const { absoluteUrl } = require("./site");
const { dictionaries, routes, lookup } = require("./i18n");
const version = require("../package.json").version;

const viewsDir = path.join(__dirname, "..", "views");
const read = (file) => fs.readFileSync(path.join(viewsDir, file), "utf8");
const LANGS = ["fr", "en"];

const escapeAttr = (value) => String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const jsonForHtml = (value) => JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");

// key : identifiant ; view : fichier de views/ ; priority : sitemap ; inSitemap : false = hors plan du site
const pages = [
  { key: "home", view: "index", scripts: ["/home.js"], priority: "1.0" },
  { key: "about", view: "a-propos", scripts: [], priority: "0.7" },
  { key: "services", view: "services", scripts: ["/services-page.js"], priority: "0.9" },
  { key: "process", view: "processus", scripts: [], priority: "0.7" },
  { key: "portfolio", view: "portfolio", scripts: ["/portfolio.js"], priority: "0.8" },
  { key: "pricing", view: "tarifs", scripts: ["/tarifs.js"], priority: "0.9" },
  { key: "testimonials", view: "temoignages", scripts: ["/temoignages.js"], priority: "0.5", inSitemap: false },
  { key: "contact", view: "contact", scripts: ["/contact.js"], priority: "0.9" }
];
const notFoundPage = { key: "notfound", view: "404", scripts: [], noindex: true };

function translate(html, dict) {
  return html.replace(/\{\{t\.([A-Za-z0-9_.]+)\}\}/g, (_, key) => String(lookup(dict, key)));
}
function localizeLinks(html, lang) {
  return html.replace(/\{\{p:([a-z]+)\}\}/g, (_, key) => {
    if (!routes[lang][key]) throw new Error(`Page inconnue dans un gabarit : ${key}`);
    return routes[lang][key];
  });
}

function structuredData(lang, dict) {
  const base = "__SITE_URL__";
  const agency = {
    "@type": "ProfessionalService", "@id": `${base}/#agency`, name: "SIPOKTECH DIGITAL", url: `${base}${routes[lang].home}`,
    slogan: dict.slogan, description: dict.meta.home.description, image: `${base}/og-image.png`,
    areaServed: ["Togo", "Worldwide"], availableLanguage: ["fr", "en"],
    address: { "@type": "PostalAddress", addressLocality: "Lomé", addressCountry: "TG" },
    founder: { "@type": "Person", name: "Jean-Paul AHITE" },
    sameAs: ["https://github.com/sipok12"]
  };
  if (process.env.CONTACT_EMAIL) agency.email = process.env.CONTACT_EMAIL;
  return jsonForHtml({
    "@context": "https://schema.org",
    "@graph": [agency, { "@type": "WebSite", "@id": `${base}/#website`, name: "SIPOKTECH DIGITAL", url: `${base}/`, inLanguage: lang, publisher: { "@id": `${base}/#agency` } }]
  });
}

function build(page, lang) {
  const dict = dictionaries[lang];
  const other = lang === "fr" ? "en" : "fr";
  const own = routes[lang][page.key] || routes[lang].home;
  const alt = routes[other][page.key] || routes[other].home;
  const meta = dict.meta[page.key];

  const header = read("partials/header.html").replace(new RegExp(`data-nav="${page.key}"`, "g"), 'aria-current="page"').replace(/\sdata-nav="[^"]*"/g, "");
  const footer = read("partials/footer.html");
  const clientDict = { lang, routes: routes[lang], ...dict.client };
  const scripts = ["/app.js", ...page.scripts].map((src) => `<script src="${src}?v=${version}" defer></script>`).join("\n  ");
  const alternates = page.noindex ? "" : [
    `<link rel="alternate" hreflang="fr" href="__SITE_URL__${routes.fr[page.key]}">`,
    `<link rel="alternate" hreflang="en" href="__SITE_URL__${routes.en[page.key]}">`,
    `<link rel="alternate" hreflang="x-default" href="__SITE_URL__${routes.fr[page.key]}">`
  ].join("\n  ");

  let html = read("layout.html")
    .replace("{{header}}", () => header)
    .replace("{{footer}}", () => footer)
    .replace("{{content}}", () => read(`${page.view}.html`))
    .replace("{{scripts}}", () => scripts)
    .replace("{{alternates}}", () => alternates)
    .replace("{{jsonld}}", () => structuredData(lang, dict))
    .replace("{{i18n}}", () => jsonForHtml(clientDict))
    .replaceAll("{{title}}", () => escapeAttr(meta.title))
    .replaceAll("{{description}}", () => escapeAttr(meta.description))
    .replaceAll("{{robots}}", () => (page.noindex ? "noindex, nofollow" : "index, follow"))
    .replaceAll("{{canonical}}", () => (page.noindex ? routes[lang].home : own))
    .replaceAll("{{switch}}", () => alt)
    .replaceAll("{{lang}}", () => lang)
    .replaceAll("{{locale}}", () => dict.locale)
    .replaceAll("{{v}}", () => version);
  html = translate(html, dict);
  html = localizeLinks(html, lang);
  return html;
}

function registerPages(app) {
  const built = [];
  for (const lang of LANGS) for (const page of pages) built.push({ ...page, lang, html: build(page, lang) });
  const notFound = Object.fromEntries(LANGS.map((lang) => [lang, build(notFoundPage, lang)]));
  const sendHtml = (req, res, html) => res.type("html").send(html.replaceAll("__SITE_URL__", absoluteUrl(req)));

  for (const page of built) {
    const own = routes[page.lang][page.key];
    // Anciennes adresses « .html » (français) conservées.
    const paths = page.lang === "fr" ? (own === "/" ? ["/", "/index.html"] : [own, `${own}.html`]) : [own];
    app.get(paths, (req, res) => sendHtml(req, res, page.html));
  }

  app.get("/sitemap.xml", (req, res) => {
    const base = absoluteUrl(req);
    const lastmod = new Date().toISOString().slice(0, 10);
    const urls = pages.filter((p) => p.inSitemap !== false).flatMap((p) => LANGS.map((lang) => {
      const alternates = [...LANGS.map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${base}${routes[l][p.key]}"/>`),
        `<xhtml:link rel="alternate" hreflang="x-default" href="${base}${routes.fr[p.key]}"/>`].join("");
      return `  <url><loc>${base}${routes[lang][p.key]}</loc>${alternates}<lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>${p.priority}</priority></url>`;
    })).join("\n");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}\n</urlset>\n`
    );
  });

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${absoluteUrl(req)}/sitemap.xml\n`);
  });

  return {
    sendNotFound(req, res) {
      const lang = /^\/en(\/|$)/.test(req.path) ? "en" : "fr";
      res.status(404);
      sendHtml(req, res, notFound[lang]);
    }
  };
}

module.exports = { registerPages };
