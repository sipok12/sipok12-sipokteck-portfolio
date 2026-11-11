// Code commun à toutes les pages : navigation, thème, langue, coordonnées, composants (cartes), animations légères.
// Aucune donnée n'est injectée avec innerHTML : tout passe par textContent / createElement, donc pas de XSS.
(function () {
  "use strict";
  const SD = (window.SD = {});
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // --- Textes de la langue courante (injectés par le serveur dans <script type="application/json" id="i18n">) ---
  let dict = {};
  try { dict = JSON.parse(document.getElementById("i18n").textContent); } catch { dict = {}; }
  SD.lang = dict.lang || "fr";
  SD.t = (key, vars) => {
    let text = dict[key];
    if (typeof text !== "string") return key;
    for (const [name, value] of Object.entries(vars || {})) text = text.replace(`{${name}}`, value);
    return text;
  };
  SD.raw = (key) => dict[key];
  SD.path = (key) => (dict.routes && dict.routes[key]) || "/";

  // --- Utilitaires ---
  SD.h = function (tag, attrs, ...children) {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else el.setAttribute(key, value === true ? "" : value);
    }
    for (const child of children.flat()) {
      if (child === null || child === undefined || child === false) continue;
      el.append(child.nodeType ? child : document.createTextNode(String(child)));
    }
    return el;
  };
  const h = SD.h;
  const SVGNS = "http://www.w3.org/2000/svg";
  SD.icon = function (name, extraClass) {
    const svg = document.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", `icon${extraClass ? ` ${extraClass}` : ""}`);
    svg.setAttribute("aria-hidden", "true");
    const use = document.createElementNS(SVGNS, "use");
    use.setAttribute("href", `#i-${name}`);
    svg.append(use);
    return svg;
  };
  const KNOWN_ICONS = ["code", "briefcase", "user", "rocket", "smartphone", "wrench", "gauge", "layout", "cart", "layers", "palette", "badge"];
  const SLUG_ICONS = {
    "website-development": "code", "sites-vitrines": "briefcase", "portfolio-website": "user", "landing-page-design": "rocket",
    "responsive-web-design": "smartphone", "assistance-maintenance": "wrench", "website-optimization": "gauge", "frontend-development": "layout",
    "boutiques-en-ligne": "cart", "applications-web": "layers", "design-graphique": "palette", "identite-numerique": "badge"
  };

  SD.safeUrl = function (value) {
    try {
      const url = new URL(value, location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  const numberLocale = SD.lang === "en" ? "en-US" : "fr-FR";
  SD.formatPrice = (n) => new Intl.NumberFormat(numberLocale).format(n).replace(/[  ]/g, " ");

  const withLang = (url) => url + (url.includes("?") ? "&" : "?") + "lang=" + SD.lang;
  SD.getJSON = async function (url) {
    const response = await fetch(withLang(url), { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error(SD.t("loadError"));
    return response.json();
  };

  SD.postJSON = async function (url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ...body, lang: SD.lang })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      // Les messages d'erreur du serveur sont en français : sur le site anglais, on affiche un message anglais.
      throw new Error(SD.lang === "en" ? (response.status === 429 ? "Too many requests. Please try again later or write to us on WhatsApp." : SD.t("formError")) : (data.error || "L'envoi a échoué. Réessayez ou écrivez-nous sur WhatsApp."));
    }
    return data;
  };

  SD.config = fetch(withLang("/api/config")).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  SD.message = (text) => h("div", { class: "placeholder", text });

  function formatPhone(digits) {
    if (/^228\d{8}$/.test(digits)) return "+228 " + digits.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ");
    return "+" + digits;
  }
  SD.whatsappLink = (digits, text) => `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
  const lines = (value) => (Array.isArray(value) ? value : []).filter(Boolean);

  // --- Composants ---
  SD.priceBlock = function (min, max, unit) {
    const hasPrice = min !== null && min !== undefined;
    const isRange = hasPrice && max !== null && max !== undefined && max > min;
    const unitText = unit ? (dict.unit && dict.unit[unit]) || unit : "";
    const unitEl = unitText ? h("span", { class: "unit", text: ` ${unitText}` }) : null;
    if (!hasPrice) return h("p", { class: "price" }, h("strong", { text: SD.t("quoteOnRequest") }));
    return h("p", { class: "price" },
      h("small", { text: SD.t(isRange ? "between" : "from") }),
      h("strong", { text: isRange ? `${SD.formatPrice(min)} – ${SD.formatPrice(max)} FCFA` : `${SD.formatPrice(min)} FCFA` }), unitEl);
  };

  const checklist = (items) => (items.length ? h("ul", { class: "checklist" }, items.map((d) => h("li", { text: d }))) : null);

  // mode : "teaser" (accueil), "detail" (page services), "pricing" (prix par prestation)
  SD.serviceCard = function (service, mode) {
    const quoteLink = h("a", { class: "button button-ghost button-small", href: `${SD.path("contact")}?service=${encodeURIComponent(service.slug)}#devis`, text: SD.t("requestQuote") });
    const iconName = SLUG_ICONS[service.slug] || (KNOWN_ICONS.includes(service.icon) ? service.icon : null);
    const badge = h("span", { class: "icon-badge", "aria-hidden": "true" }, iconName ? SD.icon(iconName) : (service.icon || "◆"));
    const price = SD.priceBlock(service.startingPrice, service.priceMax, service.priceUnit);

    if (mode === "pricing") {
      return h("article", { class: "card" },
        h("h3", { text: service.title }), price,
        h("p", { class: "muted", text: service.summary }),
        service.conditions ? h("p", { class: "fineprint", text: service.conditions }) : null,
        h("div", { class: "card-foot" }, quoteLink));
    }
    const features = lines(service.details);
    const advantages = lines(service.advantages);
    const techs = lines(service.technologies);
    return h("article", { class: "card service-card" },
      badge,
      service.imageUrl && SD.safeUrl(service.imageUrl) ? h("img", { src: SD.safeUrl(service.imageUrl), alt: "", loading: "lazy", decoding: "async", style: "width:100%;border-radius:12px;margin-bottom:1rem" }) : null,
      h("h3", { text: service.title }),
      h("p", { class: "muted", text: service.summary }),
      mode === "detail" && advantages.length ? [h("h4", { text: SD.t("advantages") }), checklist(advantages)] : null,
      mode === "detail" && features.length ? [h("h4", { text: SD.t("features") }), checklist(features)] : null,
      mode === "detail" && techs.length ? [h("h4", { text: SD.t("technologies") }), h("ul", { class: "tags" }, techs.map((t) => h("li", { text: t })))] : null,
      h("div", { class: "card-foot" }, price, quoteLink));
  };

  SD.planCard = function (plan) {
    return h("article", { class: `card plan${plan.highlighted ? " featured" : ""}` },
      plan.highlighted ? h("span", { class: "plan-flag", text: SD.t("popular") }) : null,
      h("h3", { text: plan.name }),
      h("p", { class: "muted", text: plan.tagline }),
      SD.priceBlock(plan.priceMin, plan.priceMax, plan.priceUnit),
      checklist(lines(plan.features)),
      h("a", { class: `button ${plan.highlighted ? "button-primary" : "button-ghost"}`, href: `${SD.path("contact")}${plan.serviceSlug ? `?service=${encodeURIComponent(plan.serviceSlug)}` : ""}#devis`, text: SD.t("choosePlan") }));
  };

  SD.projectCard = function (project) {
    const isDemo = Boolean(project.demo);
    const media = h("div", { class: "project-media" });
    const imageUrl = project.image_url ? SD.safeUrl(project.image_url) : null;
    if (imageUrl) {
      const img = h("img", { src: imageUrl, alt: SD.t("preview", { t: project.title }), loading: "lazy", decoding: "async", width: "640", height: "400" });
      img.addEventListener("error", () => { img.remove(); media.append(h("span", { "aria-hidden": "true", text: project.icon || "💻" })); });
      media.append(img);
    } else {
      media.append(h("span", { "aria-hidden": "true", text: project.icon || "💻" }));
    }
    const gallery = (Array.isArray(project.images) ? project.images : []).slice(1, 6).map((src) => {
      const safe = SD.safeUrl(src);
      return safe ? h("a", { href: safe, target: "_blank", rel: "noopener noreferrer", "aria-label": SD.t("enlarge", { t: project.title }) },
        h("img", { src: safe, alt: "", loading: "lazy", decoding: "async" })) : null;
    }).filter(Boolean);
    const when = project.realized_on && /^\d{4}-\d{2}-\d{2}$/.test(project.realized_on)
      ? new Date(`${project.realized_on}T00:00:00Z`).toLocaleDateString(numberLocale, { month: "long", year: "numeric", timeZone: "UTC" })
      : "";
    const rawTechs = Array.isArray(project.technologies) ? project.technologies : String(project.technologies || "").split(",");
    const techs = rawTechs.map((t) => String(t).trim()).filter(Boolean);
    const features = lines(project.features);
    const links = [];
    const demoUrl = project.url ? SD.safeUrl(project.url) : null;
    const sourceUrl = project.source_url ? SD.safeUrl(project.source_url) : null;
    if (demoUrl) links.push(h("a", { class: "button button-ghost button-small", href: demoUrl, target: "_blank", rel: "noopener noreferrer", text: SD.t("viewProject") + " ↗" }));
    if (sourceUrl) links.push(h("a", { href: sourceUrl, target: "_blank", rel: "noopener noreferrer", text: SD.t("source") + " ↗" }));

    return h("article", { class: "card project-card" },
      media,
      gallery.length ? h("div", { class: "project-gallery" }, gallery) : null,
      h("div", { class: "badges" },
        h("span", { class: isDemo ? "badge badge-demo" : "badge badge-real", text: SD.t(isDemo ? "demo" : "real") }),
        project.featured ? h("span", { class: "badge badge-star", text: SD.t("featured") }) : null,
        project.category ? h("span", { class: "badge badge-cat", text: project.category }) : null),
      h("h3", { text: project.title }),
      when ? h("p", { class: "fineprint", text: SD.t("doneIn", { d: when }) }) : null,
      h("p", { class: "muted", text: project.description }),
      features.length ? [h("h4", { text: SD.t("mainFeatures") }), checklist(features)] : null,
      techs.length ? h("ul", { class: "tags" }, techs.map((t) => h("li", { text: t }))) : null,
      links.length ? h("div", { class: "card-foot links" }, links) : null);
  };

  SD.testimonialCard = function (t) {
    const rating = Number.isInteger(t.rating) && t.rating >= 1 && t.rating <= 5 ? t.rating : 0;
    const photo = t.photo ? SD.safeUrl(t.photo) : null;
    const date = t.date && /^\d{4}-\d{2}-\d{2}/.test(t.date)
      ? new Date(`${t.date.slice(0, 10)}T00:00:00Z`).toLocaleDateString(numberLocale, { month: "long", year: "numeric", timeZone: "UTC" }) : "";
    return h("figure", { class: "card quote-card" },
      rating ? h("div", { class: "stars", role: "img", "aria-label": SD.t("stars", { n: rating }) },
        [1, 2, 3, 4, 5].map((n) => SD.icon("star", n > rating ? "off" : ""))) : null,
      h("blockquote", {}, h("p", { text: t.content })),
      h("figcaption", {},
        photo ? h("img", { src: photo, alt: "", loading: "lazy", width: "48", height: "48" }) : null,
        h("div", {}, h("strong", { text: t.author }), t.role ? h("span", { class: "muted", text: ` — ${t.role}` }) : null, date ? h("div", { class: "fineprint", text: date }) : null)));
  };

  // --- Apparition au défilement (désactivée si l'utilisateur préfère moins d'animations) ---
  let observer = null;
  if (!reducedMotion && "IntersectionObserver" in window) {
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
      }
    }, { threshold: 0.12 });
  }
  SD.reveal = function () {
    if (!observer) return;
    document.querySelectorAll(".section-head, .cards > *, .plans > *, .stats > *, .timeline li, .cta-band, .panel, .page-head > *").forEach((el) => {
      if (el.dataset.rv) return;
      el.dataset.rv = "1";
      el.classList.add("reveal");
      observer.observe(el);
    });
  };

  // --- Navigation mobile ---
  const toggle = document.getElementById("menu-toggle");
  const nav = document.getElementById("nav-links");
  function setMenu(open) {
    if (!toggle || !nav) return;
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", SD.t(open ? "menuClose" : "menuOpen"));
  }
  toggle?.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setMenu(false); });

  // --- Thème clair / sombre ---
  const themeButton = document.getElementById("theme-toggle");
  function syncThemeLabel() {
    const light = document.documentElement.getAttribute("data-theme") === "light";
    themeButton?.setAttribute("aria-label", SD.t(light ? "themeDark" : "themeLight"));
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", light ? "#F4F8FC" : "#07111F");
  }
  themeButton?.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("sd-theme", next); } catch { /* facultatif */ }
    syncThemeLabel();
  });
  syncThemeLabel();

  // --- Année du pied de page et coordonnées issues du serveur ---
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  SD.config.then((config) => {
    if (!config) return;
    const numbers = { primary: config.whatsappPrimary, secondary: config.whatsappSecondary };
    document.querySelectorAll("[data-wa]").forEach((el) => {
      const digits = numbers[el.dataset.wa];
      if (!digits) return;
      el.href = SD.whatsappLink(digits, el.dataset.waText || SD.t("whatsappText"));
      const num = el.querySelector("[data-wa-num]");
      if (num) num.textContent = formatPhone(digits);
    });
    document.querySelectorAll("[data-email]").forEach((el) => {
      el.href = `mailto:${config.email}`;
      const target = el.querySelector("strong") || el;
      target.textContent = config.email;
    });
    // Textes modifiables depuis l'administration (le texte par défaut reste affiché si le champ est vide).
    const texts = { slogan: config.tagline, hero_lead: config.heroLead, about_intro: config.aboutIntro };
    document.querySelectorAll("[data-setting]").forEach((el) => {
      const value = texts[el.dataset.setting];
      if (value) el.textContent = value;
    });
    document.querySelectorAll("[data-social]").forEach((box) => {
      box.replaceChildren(...Object.entries(config.social || {}).map(([key, url]) => {
        const safe = SD.safeUrl(url);
        return safe ? h("a", { href: safe, target: "_blank", rel: "noopener noreferrer", text: (dict.social && dict.social[key]) || key }) : null;
      }).filter(Boolean));
    });
  });

  SD.reveal();
})();
