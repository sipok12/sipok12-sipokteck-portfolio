// Interface d'administration. Toutes les données sont affichées avec textContent (jamais innerHTML).
// L'authentification, l'autorisation et la validation sont appliquées côté serveur : ce fichier n'est qu'une interface.
(function () {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const QUOTE_STATUSES = ["nouveau", "en cours", "devis envoyé", "accepté", "refusé"];
  const MESSAGE_STATUSES = ["nouveau", "lu", "traité"];
  let csrfToken = "";

  function h(tag, attrs, ...children) {
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
  }

  async function api(url, { method = "GET", body } = {}) {
    const response = await fetch(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(method !== "GET" && csrfToken ? { "X-CSRF-Token": csrfToken } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && !url.includes("/login")) showLogin();
      throw new Error(data.error || "Une erreur est survenue.");
    }
    return data;
  }

  const formatDate = (value) => new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  function feedbackEl() { return h("p", { class: "feedback", role: "status" }); }
  function say(el, message, isError) {
    el.textContent = message;
    el.classList.toggle("error", Boolean(isError));
    el.classList.toggle("ok", !isError && Boolean(message));
  }
  function waNumber(phone) {
    let digits = String(phone || "").replace(/\D/g, "").replace(/^00/, "");
    if (digits.length === 8) digits = `228${digits}`;
    return digits.length >= 8 ? digits : "";
  }

  // --- Connexion ---
  function showLogin() { $("#login-view").hidden = false; $("#dashboard").hidden = true; }
  function showDashboard(admin) {
    $("#login-view").hidden = true;
    $("#dashboard").hidden = false;
    $("#admin-name").textContent = admin.name || "Administrateur";
    setTab("dashboard");
  }
  async function checkSession() {
    try {
      const data = await api("/api/admin/me");
      csrfToken = data.csrfToken || "";
      showDashboard(data.admin);
    } catch { showLogin(); }
  }
  $("#login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector("button");
    const feedback = $("#login-feedback");
    button.disabled = true;
    say(feedback, "Connexion en cours…");
    try {
      const data = await api("/api/admin/login", { method: "POST", body: Object.fromEntries(new FormData(form).entries()) });
      form.reset();
      say(feedback, "");
      csrfToken = data.csrfToken || "";
      showDashboard(data.admin);
    } catch (error) { say(feedback, error.message, true); }
    finally { button.disabled = false; }
  });
  $("#logout-button").addEventListener("click", async () => {
    try { await api("/api/admin/logout", { method: "POST" }); } catch { /* session déjà expirée */ }
    csrfToken = "";
    showLogin();
  });

  // --- Onglets ---
  const views = {};
  async function setTab(name) {
    document.querySelectorAll(".tab").forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    const root = $("#view");
    root.replaceChildren(h("p", { class: "muted", text: "Chargement…" }));
    try { await views[name](root); }
    catch (error) { root.replaceChildren(h("p", { class: "feedback error", text: error.message })); }
  }
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => setTab(tab.dataset.tab)));

  // --- Vue d'ensemble ---
  function barRows(rows, labelKey, max) {
    return rows.map((r) => h("div", { class: "bar-row" },
      h("span", { text: r[labelKey] }),
      h("span", { class: "bar-track" }, h("span", { class: "bar-fill", style: `width:${Math.round((r.n / max) * 100)}%` })),
      h("strong", { text: r.n })));
  }
  views.dashboard = async (root) => {
    const stats = await api("/api/admin/stats");
    const t = stats.totals;
    const tile = (label, value, accent) => h("div", { class: accent ? "tile accent" : "tile" }, h("strong", { text: value }), h("span", { text: label }));
    const statusRows = QUOTE_STATUSES.map((s) => ({ label: s, n: stats.quotesByStatus[s] || 0 }));
    const maxStatus = Math.max(1, ...statusRows.map((r) => r.n));
    const months = stats.quotesByMonth.map((m) => ({ label: m.month, n: m.n }));
    const maxMonth = Math.max(1, ...months.map((r) => r.n));
    const services = stats.quotesByService.map((s) => ({ label: s.service_title, n: s.n }));
    const maxService = Math.max(1, ...services.map((r) => r.n));
    const empty = (text) => h("p", { class: "muted", text });

    root.replaceChildren(
      h("div", { class: "tiles" },
        tile("Nouveaux devis", t.quotes_new, true), tile("Devis sur 30 jours", t.quotes_30d), tile("Devis au total", t.quotes_total),
        tile("Messages non lus", t.messages_new), tile("Projets", t.projects), tile("Services actifs", t.services),
        tile("Clients", t.clients), tile("Témoignages publiés", t.testimonials_published)),
      h("div", { class: "stat-cols" },
        h("div", {}, h("h3", { text: "Devis par statut" }), barRows(statusRows, "label", maxStatus)),
        h("div", {}, h("h3", { text: "Devis par mois" }), months.length ? barRows(months, "label", maxMonth) : empty("Aucun devis pour le moment.")),
        h("div", {}, h("h3", { text: "Prestations les plus demandées" }), services.length ? barRows(services, "label", maxService) : empty("Aucune donnée pour le moment.")),
        h("div", {}, h("h3", { text: "Dernières demandes" }),
          stats.recentQuotes.length
            ? stats.recentQuotes.map((q) => h("p", {}, h("strong", { text: q.reference }), ` — ${q.name} · ${q.service_title} · `, h("span", { class: "muted", text: formatDate(q.created_at) })))
            : empty("Aucune demande reçue."))),
      h("p", { class: "notice", text: stats.mailConfigured
        ? "Notifications par email : activées."
        : "Notifications par email : non configurées. Les demandes sont enregistrées ici ; ajoutez RESEND_API_KEY pour être aussi prévenu par email." }),
      h("p", { class: "notice", text: "Ces chiffres viennent uniquement des demandes et messages enregistrés. Aucune statistique de visites n'est collectée." }));
  };

  // --- Devis ---
  views.quotes = async (root) => {
    const filter = h("select", { "aria-label": "Filtrer par statut" },
      h("option", { value: "", text: "Tous les statuts" }), QUOTE_STATUSES.map((s) => h("option", { value: s, text: s })));
    const list = h("div", { class: "admin-list" });

    function card(q) {
      const status = h("select", { id: `qs-${q.id}` }, QUOTE_STATUSES.map((s) => h("option", { value: s, text: s, selected: s === q.status })));
      const notes = h("textarea", { id: `qn-${q.id}`, rows: 2, maxlength: 2000, placeholder: "Notes internes (non visibles du client)…" });
      notes.value = q.notes || "";
      const fb = feedbackEl();
      const wa = waNumber(q.phone);
      const save = h("button", { class: "btn primary small", type: "button", text: "Enregistrer" });
      save.addEventListener("click", async () => {
        save.disabled = true;
        try { await api(`/api/admin/quotes/${q.id}`, { method: "PATCH", body: { status: status.value, notes: notes.value } }); say(fb, "Enregistré."); }
        catch (error) { say(fb, error.message, true); }
        finally { save.disabled = false; }
      });
      const toClient = h("button", { class: "btn small", type: "button", text: "Créer la fiche client" });
      toClient.addEventListener("click", async () => {
        try {
          const data = await api(`/api/admin/quotes/${q.id}/client`, { method: "POST", body: {} });
          say(fb, data.existing ? "Ce client existe déjà dans la liste." : "Fiche client créée.");
        } catch (error) { say(fb, error.message, true); }
      });
      const remove = h("button", { class: "btn danger small", type: "button", text: "Supprimer" });
      remove.addEventListener("click", async () => {
        if (!confirm(`Supprimer définitivement la demande ${q.reference} ?`)) return;
        try { await api(`/api/admin/quotes/${q.id}`, { method: "DELETE" }); await load(); }
        catch (error) { say(fb, error.message, true); }
      });
      return h("article", { class: q.status === "nouveau" ? "quote-card is-new" : "quote-card" },
        h("header", {}, h("h3", { text: `${q.reference} — ${q.service_title}` }), h("span", { class: "muted", text: formatDate(q.created_at) })),
        h("div", { class: "quote-meta" },
          h("span", { text: `Client : ${q.name}${q.company ? ` (${q.company})` : ""}` }),
          h("span", { text: `Email : ${q.email}` }),
          h("span", { text: `Téléphone : ${q.phone || "—"}` }),
          h("span", { text: `Budget : ${q.budget}` }),
          h("span", { text: `Délai : ${q.deadline}` }),
          h("span", { text: q.email_notified ? "Email de notification envoyé" : "Email de notification non envoyé" })),
        h("div", { class: "quote-body", text: q.description }),
        h("div", { class: "quote-controls" },
          h("div", {}, h("label", { for: `qs-${q.id}`, text: "Statut" }), status),
          h("div", {}, h("label", { for: `qn-${q.id}`, text: "Notes" }), notes)),
        h("div", { class: "quote-actions" }, save,
          h("a", { class: "btn small", href: `mailto:${q.email}?subject=${encodeURIComponent(`Votre demande de devis ${q.reference}`)}`, text: "Répondre par email" }),
          wa ? h("a", { class: "btn small", href: `https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour ${q.name}, au sujet de votre demande de devis ${q.reference} :`)}`, target: "_blank", rel: "noopener noreferrer", text: "WhatsApp" }) : null,
          toClient, remove),
        fb);
    }

    async function load() {
      const { items } = await api(`/api/admin/quotes${filter.value ? `?status=${encodeURIComponent(filter.value)}` : ""}`);
      list.replaceChildren(...(items.length ? items.map(card) : [h("p", { class: "muted", text: "Aucune demande de devis." })]));
    }
    filter.addEventListener("change", () => load().catch((e) => list.replaceChildren(h("p", { class: "feedback error", text: e.message }))));
    root.replaceChildren(h("div", { class: "panel-heading" }, h("div", {}, h("h2", { text: "Demandes de devis" }), h("p", { class: "muted", text: "Les 200 plus récentes." })), filter), list);
    await load();
  };

  // --- Messages ---
  views.messages = async (root) => {
    const list = h("div", { class: "admin-list" });
    const refresh = h("button", { class: "btn small", type: "button", text: "Actualiser" });
    function row(m) {
      const status = h("select", { "aria-label": `Statut du message de ${m.name}` }, MESSAGE_STATUSES.map((s) => h("option", { value: s, text: s, selected: s === m.status })));
      const fb = feedbackEl();
      status.addEventListener("change", async () => {
        try { await api(`/api/admin/messages/${m.id}`, { method: "PATCH", body: { status: status.value } }); say(fb, "Statut mis à jour."); }
        catch (error) { say(fb, error.message, true); }
      });
      const remove = h("button", { class: "btn danger small", type: "button", text: "Supprimer" });
      remove.addEventListener("click", async () => {
        if (!confirm("Supprimer définitivement ce message ?")) return;
        try { await api(`/api/admin/messages/${m.id}`, { method: "DELETE" }); await load(); }
        catch (error) { say(fb, error.message, true); }
      });
      return h("article", { class: "admin-item" },
        h("div", { class: "admin-item-main" },
          h("h3", { text: m.subject }),
          h("p", { class: "muted", text: `${m.name} · ${m.email} · ${formatDate(m.created_at)}` }),
          h("p", { text: m.message }), fb),
        h("div", { class: "admin-item-actions" }, status,
          h("a", { class: "btn small", href: `mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject}`)}`, text: "Répondre" }), remove));
    }
    async function load() {
      const { items } = await api("/api/admin/messages");
      list.replaceChildren(...(items.length ? items.map(row) : [h("p", { class: "muted", text: "Aucun message reçu." })]));
    }
    refresh.addEventListener("click", () => load().catch(() => {}));
    root.replaceChildren(h("div", { class: "panel-heading" }, h("div", {}, h("h2", { text: "Boîte de réception" }), h("p", { class: "muted", text: "Les 100 messages les plus récents." })), refresh), list);
    await load();
  };

  // --- Gestionnaire générique (projets, services, témoignages, clients) ---
  function entityView({ endpoint, title, intro, singular, fields, defaults, describe }) {
    return async (root) => {
      let editingId = null;
      const inputs = {};
      const feedback = feedbackEl();
      const list = h("div", { class: "admin-list" });
      const formTitle = h("h3", { text: `Ajouter : ${singular}` });
      const grid = h("div", { class: "form-grid" });
      const checks = h("div", {});

      for (const f of fields) {
        const id = `f-${endpoint.split("/").pop()}-${f.name}`;
        let input;
        if (f.type === "textarea") input = h("textarea", { id, rows: f.rows || 3, maxlength: f.max, required: f.required });
        else if (f.type === "checkbox") input = h("input", { id, type: "checkbox" });
        else input = h("input", { id, type: f.type || "text", maxlength: f.max, required: f.required, min: f.type === "number" ? 0 : null, placeholder: f.placeholder });
        inputs[f.name] = input;
        if (f.type === "checkbox") checks.append(h("div", { class: "check-row" }, input, h("label", { for: id, text: f.label })));
        else grid.append(h("div", { class: f.full ? "full" : "" }, h("label", { for: id }, f.label, f.help ? h("small", { text: ` — ${f.help}` }) : null), input));
      }

      const submit = h("button", { class: "btn primary", type: "submit", text: "Enregistrer" });
      const cancel = h("button", { class: "btn", type: "button", text: "Annuler" });
      const form = h("form", { class: "editor", hidden: true }, formTitle, grid, checks, h("div", { class: "editor-actions" }, submit, cancel));

      function fill(item) {
        for (const f of fields) {
          const value = item ? item[f.name] : defaults[f.name];
          if (f.type === "checkbox") inputs[f.name].checked = Boolean(value);
          else inputs[f.name].value = value === null || value === undefined ? "" : value;
        }
      }
      function open(item) {
        editingId = item ? item.id : null;
        formTitle.textContent = item ? `Modifier : ${singular}` : `Ajouter : ${singular}`;
        fill(item);
        say(feedback, "");
        form.hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
        inputs[fields[0].name].focus({ preventScroll: true });
      }
      cancel.addEventListener("click", () => { form.hidden = true; });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = {};
        for (const f of fields) body[f.name] = f.type === "checkbox" ? inputs[f.name].checked : inputs[f.name].value;
        submit.disabled = true;
        try {
          await api(editingId ? `${endpoint}/${editingId}` : endpoint, { method: editingId ? "PUT" : "POST", body });
          form.hidden = true;
          say(feedback, "Enregistré.");
          await load();
        } catch (error) { say(feedback, error.message, true); }
        finally { submit.disabled = false; }
      });

      function row(item) {
        const d = describe(item);
        const edit = h("button", { class: "btn small", type: "button", text: "Modifier" });
        edit.addEventListener("click", () => open(item));
        const remove = h("button", { class: "btn danger small", type: "button", text: "Supprimer" });
        remove.addEventListener("click", async () => {
          if (!confirm(`Supprimer définitivement « ${d.title} » ?`)) return;
          try { await api(`${endpoint}/${item.id}`, { method: "DELETE" }); await load(); }
          catch (error) { say(feedback, error.message, true); }
        });
        return h("article", { class: "admin-item" },
          h("div", { class: "admin-item-main" },
            h("h3", { text: d.title }),
            (d.badges || []).map(([text, tone]) => h("span", { class: `badge ${tone || ""}`, text })),
            h("p", { class: "muted", text: d.meta })),
          h("div", { class: "admin-item-actions" }, edit, remove));
      }

      async function load() {
        const { items } = await api(endpoint);
        list.replaceChildren(...(items.length ? items.map(row) : [h("p", { class: "muted", text: "Rien pour le moment." })]));
      }

      const add = h("button", { class: "btn primary", type: "button", text: `+ ${singular}` });
      add.addEventListener("click", () => open(null));
      root.replaceChildren(
        h("div", { class: "panel-heading" }, h("div", {}, h("h2", { text: title }), h("p", { class: "muted", text: intro })), add),
        form, feedback, list);
      await load();
    };
  }

  views.projects = entityView({
    endpoint: "/api/admin/projects", title: "Projets", singular: "Nouveau projet",
    intro: "Distinguez les projets réels des démonstrations : le site affiche le type automatiquement.",
    defaults: { icon: "💻", demo: true, featured: false },
    fields: [
      { name: "title", label: "Titre", required: true, max: 120 },
      { name: "category", label: "Catégorie", required: true, max: 80, placeholder: "Site vitrine, E-commerce…" },
      { name: "icon", label: "Icône (emoji)", max: 20 },
      { name: "technologies", label: "Technologies", max: 300, help: "séparées par des virgules" },
      { name: "url", label: "Lien de démonstration / du projet", type: "url", max: 500, placeholder: "https://…" },
      { name: "source_url", label: "Lien du code source", type: "url", max: 500, placeholder: "https://github.com/…" },
      { name: "image_url", label: "Image (URL)", type: "url", max: 500, full: true },
      { name: "description", label: "Description", type: "textarea", required: true, max: 2000, full: true },
      { name: "featured", label: "Mettre à la une", type: "checkbox" },
      { name: "demo", label: "Projet de démonstration (décochez pour un projet réel livré à un client)", type: "checkbox" }
    ],
    describe: (p) => ({
      title: `${p.icon || ""} ${p.title}`.trim(),
      badges: [[p.demo ? "Démonstration" : "Projet réel", p.demo ? "cyan" : "green"], ...(p.featured ? [["À la une", ""]] : [])],
      meta: [p.category, p.technologies].filter(Boolean).join(" · ")
    })
  });

  views.services = entityView({
    endpoint: "/api/admin/services", title: "Services & tarifs", singular: "Nouveau service",
    intro: "Ces informations alimentent les pages Services, Tarifs et le formulaire de devis.",
    defaults: { icon: "◆", position: 0, active: true, conditions: "Prix de départ indicatif en FCFA. Le tarif final est précisé dans un devis personnalisé après étude de votre besoin." },
    fields: [
      { name: "title", label: "Titre", required: true, max: 120 },
      { name: "slug", label: "Identifiant", required: true, max: 60, help: "minuscules, chiffres, tirets" },
      { name: "icon", label: "Icône", max: 20 },
      { name: "position", label: "Ordre d'affichage", type: "number" },
      { name: "starting_price", label: "Prix de départ (FCFA)", type: "number", help: "vide = sur devis" },
      { name: "price_unit", label: "Unité", max: 40, placeholder: "/ mois" },
      { name: "summary", label: "Résumé", required: true, max: 300, full: true },
      { name: "details", label: "Contenu inclus", type: "textarea", rows: 5, max: 2000, full: true, help: "un point par ligne" },
      { name: "conditions", label: "Conditions", type: "textarea", max: 1000, full: true },
      { name: "active", label: "Visible sur le site", type: "checkbox" }
    ],
    describe: (s) => ({
      title: `${s.icon || ""} ${s.title}`.trim(),
      badges: [[s.active ? "Visible" : "Masqué", s.active ? "green" : ""]],
      meta: `${s.starting_price === null ? "Sur devis" : `À partir de ${new Intl.NumberFormat("fr-FR").format(s.starting_price)} FCFA ${s.price_unit || ""}`.trim()} · ordre ${s.position} · ${s.slug}`
    })
  });

  views.testimonials = entityView({
    endpoint: "/api/admin/testimonials", title: "Témoignages", singular: "Nouveau témoignage",
    intro: "N'ajoutez que de vrais avis de clients, avec leur accord. Rien n'est affiché tant qu'un témoignage n'est pas publié.",
    defaults: { published: false },
    fields: [
      { name: "author", label: "Auteur", required: true, max: 100 },
      { name: "role", label: "Fonction / entreprise", max: 120 },
      { name: "content", label: "Témoignage", type: "textarea", required: true, max: 1000, full: true },
      { name: "published", label: "Publier sur le site", type: "checkbox" }
    ],
    describe: (t) => ({
      title: `${t.author}${t.role ? ` — ${t.role}` : ""}`,
      badges: [[t.published ? "Publié" : "Brouillon", t.published ? "green" : ""]],
      meta: t.content
    })
  });

  views.clients = entityView({
    endpoint: "/api/admin/clients", title: "Clients", singular: "Nouveau client",
    intro: "Vous pouvez aussi créer une fiche depuis un devis reçu.",
    defaults: {},
    fields: [
      { name: "name", label: "Nom", required: true, max: 100 },
      { name: "email", label: "Email", type: "email", max: 254 },
      { name: "phone", label: "Téléphone / WhatsApp", type: "tel", max: 25 },
      { name: "company", label: "Entreprise", max: 120 },
      { name: "notes", label: "Notes", type: "textarea", max: 2000, full: true }
    ],
    describe: (c) => ({
      title: c.name,
      badges: c.quotes_count ? [[`${c.quotes_count} devis`, "cyan"]] : [],
      meta: [c.email, c.phone, c.company].filter(Boolean).join(" · ") || "Aucune coordonnée"
    })
  });

  // --- Mon compte ---
  views.account = async (root) => {
    const feedback = feedbackEl();
    const form = h("form", {},
      h("label", { for: "pw-current", text: "Mot de passe actuel" }), h("input", { id: "pw-current", type: "password", required: true, autocomplete: "current-password" }),
      h("label", { for: "pw-next" }, "Nouveau mot de passe ", h("small", { text: "(12 caractères minimum)" })), h("input", { id: "pw-next", type: "password", required: true, minlength: 12, autocomplete: "new-password" }),
      h("div", { class: "editor-actions" }, h("button", { class: "btn primary", type: "submit", text: "Changer le mot de passe" })), feedback);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        await api("/api/admin/password", { method: "POST", body: { current: $("#pw-current").value, next: $("#pw-next").value } });
        form.reset();
        say(feedback, "Mot de passe modifié.");
      } catch (error) { say(feedback, error.message, true); }
    });
    root.replaceChildren(h("h2", { text: "Mon compte" }), h("p", { class: "muted", text: "Choisissez un mot de passe long et unique." }), form);
  };

  checkSession();
})();
