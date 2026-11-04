// Assemblage des pages HTML : un gabarit commun (layout) + un en-tête et un pied de page partagés
// + le contenu de chaque page. Tout est lu une seule fois au démarrage.
const fs = require("fs");
const path = require("path");
const { absoluteUrl } = require("./site");
const version = require("../package.json").version;

const viewsDir = path.join(__dirname, "..", "views");
const read = (file) => fs.readFileSync(path.join(viewsDir, file), "utf8");

const escapeAttr = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const pages = [
  {
    path: "/", view: "index", nav: "accueil", scripts: ["/home.js"], priority: "1.0",
    title: "SIPOKTECH DIGITAL — Sites web, boutiques en ligne et applications à Lomé, Togo",
    description: "SIPOKTECH DIGITAL accompagne entrepreneurs, commerces et organisations : sites vitrines, boutiques en ligne, applications web, design graphique et maintenance. Devis sur demande."
  },
  {
    path: "/a-propos", view: "a-propos", nav: "a-propos", scripts: [], priority: "0.7",
    title: "À propos — Jean-Paul AHITE | SIPOKTECH DIGITAL",
    description: "Découvrez Jean-Paul AHITE, fondateur de SIPOKTECH DIGITAL à Lomé : sa vision, ses valeurs et sa façon de travailler avec ses clients."
  },
  {
    path: "/services", view: "services", nav: "services", scripts: ["/services-page.js"], priority: "0.9",
    title: "Services — Sites web, boutiques, applications, design | SIPOKTECH DIGITAL",
    description: "Création de sites vitrines, boutiques en ligne, applications web, design graphique, identité numérique, assistance et maintenance."
  },
  {
    path: "/tarifs", view: "tarifs", nav: "tarifs", scripts: ["/tarifs.js"], priority: "0.9",
    title: "Tarifs — Prix de départ en FCFA | SIPOKTECH DIGITAL",
    description: "Prix de départ en FCFA de nos prestations numériques, détails, conditions et demande de devis personnalisé."
  },
  {
    path: "/portfolio", view: "portfolio", nav: "portfolio", scripts: ["/portfolio.js"], priority: "0.8",
    title: "Portfolio — Projets et démonstrations | SIPOKTECH DIGITAL",
    description: "Projets réalisés et démonstrations clairement identifiés, avec technologies utilisées, liens et code source lorsque disponibles."
  },
  {
    path: "/contact", view: "contact", nav: "contact", scripts: ["/contact.js"], priority: "0.9",
    title: "Contact et demande de devis | SIPOKTECH DIGITAL",
    description: "Demandez un devis ou contactez SIPOKTECH DIGITAL par formulaire, WhatsApp ou email."
  }
];

const notFoundPage = {
  path: "/404", view: "404", nav: "", scripts: [], noindex: true,
  title: "Page introuvable | SIPOKTECH DIGITAL",
  description: "Cette page n'existe pas ou a été déplacée."
};

function build(page) {
  const header = read("partials/header.html")
    .replace(new RegExp(`data-nav="${page.nav}"`, "g"), 'aria-current="page"')
    .replace(/\sdata-nav="[^"]*"/g, "");
  const footer = read("partials/footer.html");
  const scripts = ["/app.js", ...page.scripts].map((src) => `<script src="${src}?v=${version}" defer></script>`).join("\n  ");
  const canonicalPath = page.path === "/" || page.path === "/404" ? "/" : page.path;

  return read("layout.html")
    .replaceAll("{{title}}", () => escapeAttr(page.title))
    .replaceAll("{{description}}", () => escapeAttr(page.description))
    .replaceAll("{{robots}}", () => (page.noindex ? "noindex, nofollow" : "index, follow"))
    .replaceAll("{{canonical}}", () => canonicalPath)
    .replaceAll("{{v}}", () => version)
    .replace("{{header}}", () => header)
    .replace("{{footer}}", () => footer)
    .replace("{{scripts}}", () => scripts)
    .replace("{{content}}", () => read(`${page.view}.html`));
}

function registerPages(app) {
  const built = pages.map((page) => ({ ...page, html: build(page) }));
  const notFoundHtml = build(notFoundPage);

  for (const page of built) {
    const routes = page.path === "/" ? ["/", "/index.html"] : [page.path, `${page.path}.html`];
    app.get(routes, (req, res) => {
      res.type("html").send(page.html.replaceAll("__SITE_URL__", absoluteUrl(req)));
    });
  }

  app.get("/sitemap.xml", (req, res) => {
    const base = absoluteUrl(req);
    const lastmod = new Date().toISOString().slice(0, 10);
    const urls = built
      .map((p) => `  <url><loc>${base}${p.path === "/" ? "/" : p.path}</loc><lastmod>${lastmod}</lastmod><changefreq>monthly</changefreq><priority>${p.priority}</priority></url>`)
      .join("\n");
    res.type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
    );
  });

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(
      `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${absoluteUrl(req)}/sitemap.xml\n`
    );
  });

  return {
    sendNotFound(req, res) {
      res.status(404).type("html").send(notFoundHtml.replaceAll("__SITE_URL__", absoluteUrl(req)));
    }
  };
}

module.exports = { registerPages };
