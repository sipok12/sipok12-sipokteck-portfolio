// Code commun à toutes les pages : navigation, coordonnées, composants (cartes), animations légères.
// Aucune donnée n'est injectée avec innerHTML : tout passe par textContent, donc pas de XSS.
(function () {
  "use strict";
  const SD = (window.SD = {});
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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

  SD.safeUrl = function (value) {
    try {
      const url = new URL(value, location.origin);
      return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };

  SD.formatPrice = (n) => new Intl.NumberFormat("fr-FR").format(n).replace(/[  ]/g, " ");

  SD.getJSON = async function (url) {
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Chargement impossible.");
    return response.json();
  };

  SD.postJSON = async function (url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "L'envoi a échoué. Réessayez ou écrivez-nous sur WhatsApp.");
    return data;
  };

  SD.config = fetch("/api/config").then((r) => (r.ok ? r.json() : null)).catch(() => null);

  SD.message = (text) => h("div", { class: "placeholder", text });

  function formatPhone(digits) {
    if (/^228\d{8}$/.test(digits)) return "+228 " + digits.slice(3).replace(/(\d{2})(?=\d)/g, "$1 ");
    return "+" + digits;
  }
  SD.whatsappLink = (digits, text) => `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

  // --- Composants ---
  SD.serviceCard = function (service, mode) {
    const priceText = service.startingPrice === null || service.startingPrice === undefined
      ? h("strong", { text: "Sur devis" })
      : [h("small", { text: "À partir de" }),
         h("strong", { text: `${SD.formatPrice(service.startingPrice)} FCFA` }),
         service.priceUnit ? h("span", { class: "unit", text: ` ${service.priceUnit}` }) : null];
    const price = h("p", { class: "price" }, priceText);
    const quoteLink = h("a", { class: "button button-ghost button-small", href: `/contact?service=${encodeURIComponent(service.slug)}#devis`, text: "Demander un devis" });
    const list = service.details && service.details.length
      ? h("ul", { class: "checklist" }, service.details.map((d) => h("li", { text: d })))
      : null;

    if (mode === "pricing") {
      return h("article", { class: "card pricing-card", "data-tilt": "" },
        h("h3", { text: service.title }), price,
        h("p", { class: "muted", text: service.summary }), list,
        service.conditions ? h("p", { class: "fineprint", text: service.conditions }) : null,
        h("div", { class: "card-foot" }, quoteLink));
    }
    return h("article", { class: "card", "data-tilt": "" },
      h("span", { class: "icon-badge", "aria-hidden": "true", text: service.icon || "◆" }),
      h("h3", { text: service.title }),
      h("p", { class: "muted", text: service.summary }),
      mode === "detail" ? list : null,
      h("div", { class: "card-foot" }, price, quoteLink));
  };

  SD.projectCard = function (project) {
    const isDemo = Boolean(project.demo);
    const media = h("div", { class: "project-media" });
    const imageUrl = project.image_url ? SD.safeUrl(project.image_url) : null;
    if (imageUrl) {
      const img = h("img", { src: imageUrl, alt: `Aperçu du projet ${project.title}`, loading: "lazy", decoding: "async" });
      img.addEventListener("error", () => { img.remove(); media.append(h("span", { "aria-hidden": "true", text: project.icon || "💻" })); });
      media.append(img);
    } else {
      media.append(h("span", { "aria-hidden": "true", text: project.icon || "💻" }));
    }
    const techs = (project.technologies || "").split(",").map((t) => t.trim()).filter(Boolean);
    const links = [];
    const demoUrl = project.url ? SD.safeUrl(project.url) : null;
    const sourceUrl = project.source_url ? SD.safeUrl(project.source_url) : null;
    if (demoUrl) links.push(h("a", { href: demoUrl, target: "_blank", rel: "noopener noreferrer", text: isDemo ? "Voir la démonstration ↗" : "Voir le projet ↗" }));
    if (sourceUrl) links.push(h("a", { href: sourceUrl, target: "_blank", rel: "noopener noreferrer", text: "Code source ↗" }));

    return h("article", { class: "card project-card", "data-tilt": "" },
      media,
      h("div", { class: "badges" },
        h("span", { class: isDemo ? "badge badge-demo" : "badge badge-real", text: isDemo ? "Démonstration" : "Projet réel" }),
        project.featured ? h("span", { class: "badge badge-star", text: "À la une" }) : null,
        h("span", { class: "badge badge-cat", text: project.category })),
      h("h3", { text: project.title }),
      h("p", { class: "muted", text: project.description }),
      techs.length ? h("ul", { class: "tags" }, techs.map((t) => h("li", { text: t }))) : null,
      links.length ? h("div", { class: "card-foot links" }, links) : null);
  };

  SD.testimonialCard = (t) => h("figure", { class: "card quote-card" },
    h("blockquote", {}, h("p", { text: t.content })),
    h("figcaption", {}, h("strong", { text: t.author }), t.role ? h("span", { text: ` — ${t.role}` }) : null));

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
    document.querySelectorAll(".section-head, .cards > *, .steps li, .cta-band, .panel, .page-head > *").forEach((el) => {
      if (el.dataset.rv) return;
      el.dataset.rv = "1";
      el.classList.add("reveal");
      observer.observe(el);
    });
  };

  // --- Légère inclinaison 3D au survol (souris uniquement) ---
  if (!reducedMotion) {
    let current = null;
    const reset = (el) => { if (el) { el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); } };
    document.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "mouse") return;
      const target = event.target.closest ? event.target.closest("[data-tilt]") : null;
      if (current && current !== target) reset(current);
      current = target;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      const max = target.classList.contains("stage") ? 9 : 5;
      target.style.setProperty("--ry", `${(x * max).toFixed(2)}deg`);
      target.style.setProperty("--rx", `${(-y * max).toFixed(2)}deg`);
    });
    document.addEventListener("pointerleave", () => { reset(current); current = null; });
  }

  // --- Navigation mobile ---
  const toggle = document.getElementById("menu-toggle");
  const nav = document.getElementById("nav-links");
  function setMenu(open) {
    if (!toggle || !nav) return;
    nav.classList.toggle("open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Fermer le menu" : "Ouvrir le menu");
  }
  toggle?.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setMenu(false)));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setMenu(false); });

  // --- Année du pied de page et coordonnées issues du serveur ---
  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  const socialLabels = { github: "GitHub", linkedin: "LinkedIn", facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", x: "X" };
  SD.config.then((config) => {
    if (!config) return;
    const numbers = { primary: config.whatsappPrimary, secondary: config.whatsappSecondary };
    document.querySelectorAll("[data-wa]").forEach((el) => {
      const digits = numbers[el.dataset.wa];
      if (!digits) return;
      el.href = SD.whatsappLink(digits, el.dataset.waText);
      const num = el.querySelector("[data-wa-num]");
      if (num) num.textContent = formatPhone(digits);
    });
    document.querySelectorAll("[data-email]").forEach((el) => {
      el.href = `mailto:${config.email}`;
      const target = el.querySelector("strong") || el;
      target.textContent = config.email;
    });
    document.querySelectorAll("[data-social]").forEach((box) => {
      box.replaceChildren(...Object.entries(config.social || {}).map(([key, url]) => {
        const safe = SD.safeUrl(url);
        return safe ? h("a", { href: safe, target: "_blank", rel: "noopener noreferrer", text: socialLabels[key] || key }) : null;
      }).filter(Boolean));
    });
  });

  SD.reveal();
})();
