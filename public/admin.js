// Interface d'administration. Toutes les données sont affichées avec textContent (jamais innerHTML).
// L'authentification, l'autorisation et la validation sont appliquées côté serveur : ce fichier n'est qu'une interface.
(function () {
  "use strict";
  const $ = (selector) => document.querySelector(selector);
  const QUOTE_STATUSES = ["nouveau", "en discussion", "devis envoyé", "en cours", "terminé", "annulé"];
  const MESSAGE_STATUSES = ["nouveau", "lu", "traité"];
  const TITLES = {
    dashboard: "Vue d'ensemble", stats: "Statistiques et évolution", quotes: "Demandes de devis", messages: "Messages",
    projects: "Projets", services: "Services & tarifs", pricing: "Formules tarifaires", testimonials: "Témoignages", clients: "Clients",
    settings: "Informations du site", activity: "Historique des actions", account: "Mon compte"
  };
  let csrfToken = "";
  let caps = { storage: false, supabaseAuth: false, authMethod: "legacy" };

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
  const NS = "http://www.w3.org/2000/svg";
  function svg(tag, attrs, ...children) {
    const el = document.createElementNS(NS, tag);
    for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, String(value));
    for (const child of children) if (child) el.append(child);
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
      if (response.status === 401 && !/\/(login|recover|recovery)$/.test(url)) showLogin();
      throw new Error(data.error || "Une erreur est survenue.");
    }
    return data;
  }

  const formatDate = (value) => new Date(value).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  const fmt = (n) => new Intl.NumberFormat("fr-FR").format(n);
  function feedbackEl() { return h("p", { class: "feedback", role: "status" }); }
  function say(el, message, isError) {
    el.textContent = message;
    el.classList.toggle("error", Boolean(isError));
    el.classList.toggle("ok", !isError && Boolean(message));
  }
  let toastTimer = 0;
  function notify(message, isError) {
    const toast = $("#toast");
    toast.textContent = message;
    toast.classList.toggle("error", Boolean(isError));
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, isError ? 7000 : 3500);
  }
  function waNumber(phone) {
    let digits = String(phone || "").replace(/\D/g, "").replace(/^00/, "");
    if (digits.length === 8) digits = `228${digits}`;
    return digits.length >= 8 ? digits : "";
  }

  // --- Connexion, récupération du mot de passe ---
  const forms = { login: $("#login-form"), recover: $("#recover-form"), reset: $("#reset-form") };
  function showForm(name) { for (const [key, form] of Object.entries(forms)) form.hidden = key !== name; }
  const hideBoot = () => { const boot = $("#boot"); if (boot) boot.hidden = true; };
  function showLogin() { hideBoot(); $("#login-view").hidden = false; $("#app").hidden = true; showForm("login"); }
  function showApp(admin) {
    hideBoot();
    $("#login-view").hidden = true;
    $("#app").hidden = false;
    $("#admin-name").textContent = admin.name || "Administrateur";
    setTab("dashboard");
  }
  async function checkSession() {
    const text = $("#boot-text");
    const retry = $("#boot-retry");
    retry.hidden = true;
    const slow = setTimeout(() => { text.textContent = "Le serveur se réveille, cela peut prendre jusqu'à une minute…"; }, 6000);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 45000));
    try {
      const data = await Promise.race([api("/api/admin/me"), timeout]);
      csrfToken = data.csrfToken || "";
      caps = data.capabilities || caps;
      clearTimeout(slow);
      showApp(data.admin);
    } catch (error) {
      clearTimeout(slow);
      if (error.message === "timeout") {
        text.textContent = "Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.";
        retry.hidden = false;
      } else showLogin();
    }
  }
  $("#boot-retry").addEventListener("click", checkSession);

  forms.login.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = forms.login.querySelector("button[type=submit]");
    const feedback = $("#login-feedback");
    button.disabled = true;
    say(feedback, "Connexion en cours…");
    try {
      const data = await api("/api/admin/login", { method: "POST", body: Object.fromEntries(new FormData(forms.login).entries()) });
      forms.login.reset();
      say(feedback, "");
      csrfToken = data.csrfToken || "";
      caps = data.capabilities || caps;
      showApp(data.admin);
    } catch (error) { say(feedback, error.message, true); }
    finally { button.disabled = false; }
  });
  $("#show-recover").addEventListener("click", () => { showForm("recover"); $("#recover-email").value = $("#login-email").value; $("#recover-email").focus(); });
  document.querySelectorAll("[data-back-login]").forEach((b) => b.addEventListener("click", () => showForm("login")));

  forms.recover.addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedback = $("#recover-feedback");
    const button = forms.recover.querySelector("button[type=submit]");
    button.disabled = true;
    say(feedback, "Envoi en cours…");
    try {
      const data = await api("/api/admin/recover", { method: "POST", body: { email: $("#recover-email").value } });
      say(feedback, data.message);
    } catch (error) { say(feedback, error.message, true); }
    finally { button.disabled = false; }
  });

  // Lien reçu par email : Supabase renvoie vers /admin#access_token=…&type=recovery
  let recoveryToken = "";
  function readRecoveryFromUrl() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (hash.get("type") === "recovery" && hash.get("access_token")) {
      recoveryToken = hash.get("access_token");
      history.replaceState(null, "", window.location.pathname); // retire le jeton de l'adresse
      return true;
    }
    if (hash.get("error_description")) {
      history.replaceState(null, "", window.location.pathname);
      showLogin();
      say($("#login-feedback"), "Ce lien de réinitialisation est invalide ou expiré. Demandez-en un nouveau.", true);
    }
    return false;
  }
  forms.reset.addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedback = $("#reset-feedback");
    const button = forms.reset.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      const data = await api("/api/admin/recovery", { method: "POST", body: { accessToken: recoveryToken, password: $("#reset-password").value } });
      recoveryToken = "";
      forms.reset.reset();
      showForm("login");
      say($("#login-feedback"), data.message);
    } catch (error) { say(feedback, error.message, true); }
    finally { button.disabled = false; }
  });

  $("#logout-button").addEventListener("click", async () => {
    try { await api("/api/admin/logout", { method: "POST" }); } catch { /* session déjà expirée */ }
    csrfToken = "";
    showLogin();
  });

  // --- Navigation (menu latéral, repliable sur mobile) ---
  const sidebar = $("#sidebar");
  function setMenu(open) {
    sidebar.classList.toggle("open", open);
    $("#backdrop").hidden = !open;
    $("#menu-button").setAttribute("aria-expanded", String(open));
  }
  $("#menu-button").addEventListener("click", () => setMenu(!sidebar.classList.contains("open")));
  $("#backdrop").addEventListener("click", () => setMenu(false));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") setMenu(false); });

  const views = {};
  async function refreshCounts() {
    try {
      const { totals } = await api("/api/admin/stats");
      for (const [key, value] of [["quotes", totals.quotes_new], ["messages", totals.messages_new]]) {
        const badge = document.querySelector(`[data-count="${key}"]`);
        if (!badge) continue;
        badge.textContent = value;
        badge.hidden = !value;
      }
    } catch { /* les compteurs sont facultatifs */ }
  }
  let currentTab = "";
  async function setTab(name) {
    currentTab = name;
    setMenu(false);
    document.querySelectorAll(".nav-item").forEach((item) => {
      const active = item.dataset.tab === name;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page"); else item.removeAttribute("aria-current");
    });
    $("#page-title").textContent = TITLES[name] || "";
    document.title = `${TITLES[name] || "Administration"} — SIPOKTECH DIGITAL`;
    const root = $("#view");
    root.replaceChildren(h("p", { class: "muted", text: "Chargement…" }));
    try { await views[name](root); }
    catch (error) { if (currentTab === name) root.replaceChildren(h("p", { class: "feedback error", text: error.message })); }
    refreshCounts();
  }
  document.querySelectorAll(".nav-item").forEach((item) => item.addEventListener("click", () => { setTab(item.dataset.tab); $("#view").focus({ preventScroll: true }); }));

  // --- Graphiques (SVG, sans bibliothèque externe) ---
  const monthLabel = (m) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", timeZone: "UTC" });
  function barChart(title, months, series) {
    const W = 560, H = 210, L = 30, B = 26, T = 10;
    const max = Math.max(1, ...months.flatMap((m) => series.map((s) => m[s.key])));
    const top = Math.max(4, Math.ceil(max / 4) * 4);
    const plotW = W - L - 6, plotH = H - B - T;
    const group = plotW / months.length;
    const barW = Math.min(18, (group * 0.72) / series.length);
    const canvas = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${title} sur les 12 derniers mois` });
    for (let i = 0; i <= 4; i++) {
      const y = T + plotH - (plotH * i) / 4;
      canvas.append(svg("line", { class: i ? "grid" : "axis", x1: L, x2: W - 6, y1: y, y2: y }));
      const label = svg("text", { x: L - 5, y: y + 3, "text-anchor": "end" }); label.textContent = String(Math.round((top * i) / 4));
      canvas.append(label);
    }
    months.forEach((m, i) => {
      const x0 = L + group * i + (group - barW * series.length) / 2;
      series.forEach((s, j) => {
        const value = m[s.key];
        const height = (plotH * value) / top;
        const rect = svg("rect", { class: s.cls, x: x0 + barW * j, y: T + plotH - height, width: barW - 2, height: Math.max(value ? 1.5 : 0, height), rx: 3 });
        const tip = svg("title"); tip.textContent = `${monthLabel(m.month)} ${m.month.slice(0, 4)} — ${s.label} : ${value}`;
        rect.append(tip);
        canvas.append(rect);
      });
      const text = svg("text", { x: L + group * i + group / 2, y: H - 8, "text-anchor": "middle" }); text.textContent = monthLabel(m.month);
      canvas.append(text);
    });
    const total = series.map((s) => `${s.label} : ${months.reduce((sum, m) => sum + m[s.key], 0)}`).join(" · ");
    const table = h("table", {}, h("thead", {}, h("tr", {}, h("th", { text: "Mois" }), series.map((s) => h("th", { text: s.label })))),
      h("tbody", {}, months.map((m) => h("tr", {}, h("td", { text: `${monthLabel(m.month)} ${m.month.slice(0, 4)}` }), series.map((s) => h("td", { text: m[s.key] }))))));
    return h("figure", { class: "chart-card", style: "margin:0" }, h("h3", { text: title }), canvas,
      h("p", { class: "muted", style: "margin:.4rem 0 0;font-size:.85rem", text: `12 derniers mois — ${total}` }),
      h("details", {}, h("summary", { text: "Voir les chiffres" }), table));
  }
  function barRows(rows, max) {
    return rows.map((r) => h("div", { class: "bar-row" },
      h("span", { text: r.label }),
      h("span", { class: "bar-track" }, h("span", { class: "bar-fill", style: `width:${Math.round((r.n / max) * 100)}%` })),
      h("strong", { text: r.n })));
  }
  const tile = (label, value, accent) => h("div", { class: accent ? "tile accent" : "tile" }, h("strong", { text: value }), h("span", { text: label }));
  const empty = (text) => h("p", { class: "muted", text });

  // --- Vue d'ensemble ---
  views.dashboard = async (root) => {
    const stats = await api("/api/admin/stats");
    const t = stats.totals;
    root.replaceChildren(
      h("div", { class: "tiles" },
        tile("Demandes en attente", t.quotes_pending, true), tile("Nouvelles demandes", t.quotes_new), tile("Demandes reçues", t.quotes_total),
        tile("Demandes sur 30 jours", t.quotes_30d), tile("Messages non lus", t.messages_new), tile("Projets publiés", t.projects_published),
        tile("Services actifs", t.services), tile("Clients", t.clients)),
      h("div", { class: "chart-grid" },
        barChart("Demandes reçues par mois", stats.monthly, [{ key: "quotes", label: "Demandes", cls: "bar-cyan" }]),
        barChart("Projets publiés par mois", stats.monthly, [{ key: "projects", label: "Projets", cls: "bar-green" }])),
      h("div", { class: "panel" }, h("h3", { text: "Dernières demandes" }),
        stats.recentQuotes.length
          ? stats.recentQuotes.map((q) => h("p", {}, h("strong", { text: q.reference }), ` — ${q.name} · ${q.service_title} · `, h("span", { class: "muted", text: `${q.status} · ${formatDate(q.created_at)}` })))
          : empty("Aucune demande reçue pour le moment.")),
      h("p", { class: "notice", text: stats.mailConfigured
        ? "Notifications par email : activées."
        : "Notifications par email : non configurées. Les demandes sont enregistrées ici ; ajoutez RESEND_API_KEY pour être aussi prévenu par email." }),
      caps.authMethod === "legacy" && caps.supabaseAuth
        ? h("p", { class: "notice warn", text: "Vous êtes connecté avec l'ancien compte. Créez votre compte dans Supabase Auth (voir le guide) puis reconnectez-vous avec." }) : null,
      !caps.storage ? h("p", { class: "notice", text: "Envoi d'images : non configuré (clé SUPABASE_SERVICE_ROLE_KEY absente). Vous pouvez coller l'adresse d'une image à la place." }) : null);
  };

  // --- Statistiques et évolution (uniquement des données réellement enregistrées) ---
  views.stats = async (root) => {
    const stats = await api("/api/admin/stats");
    const t = stats.totals;
    const statusRows = QUOTE_STATUSES.map((s) => ({ label: s, n: stats.quotesByStatus[s] || 0 }));
    const services = stats.quotesByService.map((s) => ({ label: s.service_title, n: s.n }));
    root.replaceChildren(
      h("div", { class: "tiles" },
        tile("Projets réalisés (réels)", t.projects_real, true), tile("Projets publiés", t.projects_published), tile("Projets en brouillon", t.projects_draft),
        tile("Nouveaux clients (30 jours)", t.clients_30d), tile("Demandes reçues", t.quotes_total),
        tile("Projets en cours", t.quotes_in_progress), tile("Projets terminés", t.quotes_done), tile("Demandes annulées", t.quotes_cancelled)),
      h("div", { class: "chart-grid" },
        barChart("Évolution des demandes", stats.monthly, [{ key: "quotes", label: "Demandes", cls: "bar-cyan" }]),
        barChart("Évolution des projets publiés", stats.monthly, [{ key: "projects", label: "Projets publiés", cls: "bar-green" }]),
        barChart("Nouveaux clients", stats.monthly, [{ key: "clients", label: "Clients", cls: "bar-white" }])),
      h("div", { class: "stat-cols" },
        h("div", { class: "panel" }, h("h3", { text: "Services les plus demandés" }),
          services.length ? barRows(services, Math.max(1, ...services.map((r) => r.n))) : empty("Aucune demande pour le moment.")),
        h("div", { class: "panel" }, h("h3", { text: "Demandes par statut" }), barRows(statusRows, Math.max(1, ...statusRows.map((r) => r.n))))),
      h("p", { class: "notice", text: "« Projets en cours » et « terminés » comptent les demandes de devis au statut correspondant. Les projets réalisés sont les projets publiés qui ne sont pas des démonstrations. Aucune statistique de visites n'est collectée : aucun chiffre n'est estimé ni inventé." }));
  };

  // --- Demandes de devis : recherche + filtre ---
  views.quotes = async (root) => {
    const filter = h("select", { "aria-label": "Filtrer par statut" },
      h("option", { value: "", text: "Tous les statuts" }), QUOTE_STATUSES.map((s) => h("option", { value: s, text: s })));
    const search = h("input", { type: "search", placeholder: "Rechercher : nom, email, téléphone, référence DV-…", "aria-label": "Rechercher une demande", maxlength: 80 });
    const list = h("div", { class: "admin-list" });

    function card(q) {
      const status = h("select", { id: `qs-${q.id}` }, QUOTE_STATUSES.map((s) => h("option", { value: s, text: s, selected: s === q.status })));
      const notes = h("textarea", { id: `qn-${q.id}`, rows: 2, maxlength: 2000, placeholder: "Note interne (jamais visible du client)…" });
      notes.value = q.notes || "";
      const fb = feedbackEl();
      const wa = waNumber(q.phone);
      const save = h("button", { class: "btn primary small", type: "button", text: "Enregistrer" });
      save.addEventListener("click", async () => {
        save.disabled = true;
        try { await api(`/api/admin/quotes/${q.id}`, { method: "PATCH", body: { status: status.value, notes: notes.value } }); say(fb, "Enregistré."); notify("Demande mise à jour."); refreshCounts(); }
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
        try { await api(`/api/admin/quotes/${q.id}`, { method: "DELETE" }); notify("Demande supprimée."); await load(); refreshCounts(); }
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
          h("div", {}, h("label", { for: `qn-${q.id}`, text: "Note interne" }), notes)),
        h("div", { class: "quote-actions" }, save,
          h("a", { class: "btn small", href: `mailto:${q.email}?subject=${encodeURIComponent(`Votre demande de devis ${q.reference}`)}`, text: "Répondre par email" }),
          wa ? h("a", { class: "btn small", href: `https://wa.me/${wa}?text=${encodeURIComponent(`Bonjour ${q.name}, au sujet de votre demande de devis ${q.reference} :`)}`, target: "_blank", rel: "noopener noreferrer", text: "WhatsApp" }) : null,
          toClient, remove),
        fb);
    }

    let seq = 0;
    async function load() {
      const mine = ++seq;
      const params = new URLSearchParams();
      if (filter.value) params.set("status", filter.value);
      if (search.value.trim()) params.set("q", search.value.trim());
      const { items } = await api(`/api/admin/quotes${params.toString() ? `?${params}` : ""}`);
      if (mine !== seq) return; // une recherche plus récente a pris le relais
      list.replaceChildren(...(items.length ? items.map(card) : [h("p", { class: "muted", text: "Aucune demande ne correspond." })]));
    }
    const refreshList = () => load().catch((e) => list.replaceChildren(h("p", { class: "feedback error", text: e.message })));
    let timer = 0;
    search.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(refreshList, 300); });
    filter.addEventListener("change", refreshList);
    root.replaceChildren(
      h("div", { class: "panel-heading" }, h("div", {}, h("h2", { text: "Demandes de devis" }), h("p", { class: "muted", text: "Les 200 plus récentes." }))),
      h("div", { class: "toolbar" }, search, filter), list);
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
        try { await api(`/api/admin/messages/${m.id}`, { method: "PATCH", body: { status: status.value } }); say(fb, "Statut mis à jour."); refreshCounts(); }
        catch (error) { say(fb, error.message, true); }
      });
      const remove = h("button", { class: "btn danger small", type: "button", text: "Supprimer" });
      remove.addEventListener("click", async () => {
        if (!confirm("Supprimer définitivement ce message ?")) return;
        try { await api(`/api/admin/messages/${m.id}`, { method: "DELETE" }); notify("Message supprimé."); await load(); refreshCounts(); }
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

  // --- Envoi d'images (Supabase Storage via le serveur) ---
  const MAX_IMAGE = 5 * 1024 * 1024;
  async function uploadImage(file, folder) {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error(`${file.name} : seuls les formats JPG, PNG et WebP sont acceptés.`);
    if (file.size > MAX_IMAGE) throw new Error(`${file.name} : 5 Mo maximum.`);
    const response = await fetch(`/api/admin/uploads?folder=${encodeURIComponent(folder)}`, {
      method: "POST", headers: { "Content-Type": file.type, "X-CSRF-Token": csrfToken }, body: file
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "L'envoi de l'image a échoué.");
    return data.url;
  }

  function imagePicker({ max, folder }) {
    let urls = [];
    const thumbs = h("div", { class: "thumbs" });
    const feedback = feedbackEl();
    const file = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: max > 1, "aria-label": "Choisir des images à envoyer", disabled: !caps.storage });
    const urlInput = h("input", { type: "url", placeholder: "…ou collez l'adresse d'une image (https://…)", maxlength: 500, "aria-label": "Adresse d'une image" });
    const addUrl = h("button", { class: "btn small", type: "button", text: "Ajouter l'adresse" });

    function render() {
      thumbs.replaceChildren(...urls.map((url, index) => {
        const remove = h("button", { type: "button", "aria-label": "Retirer cette image", text: "✕" });
        remove.addEventListener("click", () => { urls.splice(index, 1); render(); });
        return h("div", { class: "thumb" }, h("img", { src: url, alt: "", loading: "lazy" }), max > 1 && index === 0 ? h("span", { class: "cover", text: "Couverture" }) : null, remove);
      }));
    }
    file.addEventListener("change", async () => {
      const chosen = [...file.files];
      file.value = "";
      for (const item of chosen) {
        if (urls.length >= max) { say(feedback, `${max} image${max > 1 ? "s" : ""} maximum.`, true); break; }
        say(feedback, `Envoi de ${item.name}…`);
        try { urls.push(await uploadImage(item, folder)); render(); say(feedback, "Image envoyée."); }
        catch (error) { say(feedback, error.message, true); }
      }
    });
    addUrl.addEventListener("click", () => {
      const value = urlInput.value.trim();
      if (!value) return;
      if (!/^https?:\/\//i.test(value)) return say(feedback, "L'adresse doit commencer par https://", true);
      if (urls.length >= max) return say(feedback, `${max} image${max > 1 ? "s" : ""} maximum.`, true);
      if (!urls.includes(value)) urls.push(value);
      urlInput.value = "";
      say(feedback, "");
      render();
    });
    const note = caps.storage
      ? `JPG, PNG ou WebP, 5 Mo maximum${max > 1 ? `, ${max} images (la première sert de couverture)` : ""}.`
      : "L'envoi de fichiers n'est pas activé sur ce site : collez l'adresse d'une image.";
    return {
      el: h("div", { class: "picker full" }, thumbs, caps.storage ? file : null, h("p", { class: "muted", style: "margin:.3rem 0", text: note }),
        h("div", { class: "picker-row" }, urlInput, addUrl), feedback),
      get: () => urls.slice(),
      set: (list) => { urls = (Array.isArray(list) ? list : []).filter(Boolean).slice(0, max); render(); }
    };
  }

  // --- Gestionnaire générique (projets, services, témoignages, clients) ---
  function entityView({ endpoint, title, intro, singular, fields, defaults, describe, thumbOf }) {
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
        if (f.type === "images" || f.type === "image") {
          const picker = imagePicker({ max: f.type === "images" ? (f.max || 8) : 1, folder: f.folder || "projects" });
          inputs[f.name] = picker;
          grid.append(h("div", { class: "full" }, h("label", { text: f.label }), picker.el));
          continue;
        }
        let input;
        if (f.type === "textarea") input = h("textarea", { id, rows: f.rows || 3, maxlength: f.max, required: f.required });
        else if (f.type === "checkbox") input = h("input", { id, type: "checkbox" });
        else if (f.type === "select") input = h("select", { id }, f.options.map(([value, text]) => h("option", { value, text })));
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
          if (f.type === "images") {
            // Anciens projets : une seule image_url, sans galerie.
            const gallery = item && Array.isArray(item.images) && item.images.length ? item.images : (item && item.image_url ? [item.image_url] : []);
            inputs[f.name].set(gallery);
          } else if (f.type === "image") inputs[f.name].set(value ? [value] : []);
          else if (f.type === "checkbox") inputs[f.name].checked = Boolean(value);
          else if (f.type === "date") inputs[f.name].value = value ? String(value).slice(0, 10) : "";
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
        const first = fields.find((f) => inputs[f.name] instanceof HTMLElement);
        if (first) inputs[first.name].focus({ preventScroll: true });
      }
      cancel.addEventListener("click", () => { form.hidden = true; });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const body = {};
        for (const f of fields) {
          if (f.type === "images") body[f.name] = inputs[f.name].get();
          else if (f.type === "image") body[f.name] = inputs[f.name].get()[0] || "";
          else body[f.name] = f.type === "checkbox" ? inputs[f.name].checked : inputs[f.name].value;
        }
        submit.disabled = true;
        say(feedback, "Enregistrement…");
        try {
          await api(editingId ? `${endpoint}/${editingId}` : endpoint, { method: editingId ? "PUT" : "POST", body });
          form.hidden = true;
          say(feedback, "");
          notify(editingId ? "Modifications enregistrées." : "Ajouté avec succès.");
          await load();
        } catch (error) { say(feedback, error.message, true); form.scrollIntoView({ block: "nearest" }); }
        finally { submit.disabled = false; }
      });

      function row(item) {
        const d = describe(item);
        const thumb = thumbOf && thumbOf(item);
        const edit = h("button", { class: "btn small", type: "button", text: "Modifier" });
        edit.addEventListener("click", () => open(item));
        const remove = h("button", { class: "btn danger small", type: "button", text: "Supprimer" });
        remove.addEventListener("click", async () => {
          if (!confirm(`Supprimer définitivement « ${d.title} » ? Cette action est irréversible.`)) return;
          try { await api(`${endpoint}/${item.id}`, { method: "DELETE" }); notify("Supprimé."); await load(); }
          catch (error) { say(feedback, error.message, true); }
        });
        return h("article", { class: "admin-item" },
          thumb ? h("img", { class: "admin-thumb", src: thumb, alt: "", loading: "lazy" }) : null,
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
    intro: "Un projet « publié » apparaît automatiquement dans le portfolio ; un brouillon reste invisible.",
    defaults: { icon: "💻", demo: true, featured: false, status: "published", kind: "website" },
    thumbOf: (p) => p.image_url || (Array.isArray(p.images) && p.images[0]) || "",
    fields: [
      { name: "title", label: "Titre", required: true, max: 120 },
      { name: "category", label: "Catégorie (affichée)", required: true, max: 80, placeholder: "Site vitrine, E-commerce…" },
      { name: "category_en", label: "Catégorie en anglais", max: 80, placeholder: "Business website, E-commerce…" },
      { name: "kind", label: "Type (filtre du portfolio)", type: "select", options: [["website", "Sites web"], ["business", "Entreprises"], ["landing", "Landing pages"], ["portfolio", "Portfolio personnel"], ["other", "Autre"]] },
      { name: "status", label: "Statut", type: "select", options: [["published", "Publié (visible sur le site)"], ["draft", "Brouillon (non visible)"]] },
      { name: "realized_on", label: "Date de réalisation", type: "date" },
      { name: "icon", label: "Icône (emoji)", max: 20 },
      { name: "technologies", label: "Technologies", max: 300, help: "séparées par des virgules" },
      { name: "url", label: "Lien du projet / de la démonstration", type: "url", max: 500, placeholder: "https://…" },
      { name: "source_url", label: "Lien du code source", type: "url", max: 500, placeholder: "https://github.com/…" },
      { name: "images", label: "Images", type: "images", max: 8, folder: "projects" },
      { name: "description", label: "Description", type: "textarea", required: true, max: 2000, full: true },
      { name: "description_en", label: "Description en anglais", type: "textarea", max: 2000, full: true },
      { name: "features", label: "Fonctionnalités principales", type: "textarea", rows: 4, max: 1500, full: true, help: "une par ligne" },
      { name: "features_en", label: "Fonctionnalités en anglais", type: "textarea", rows: 4, max: 1500, full: true, help: "une par ligne" },
      { name: "featured", label: "Mettre à la une", type: "checkbox" },
      { name: "demo", label: "Projet de démonstration (décochez pour un projet réel livré à un client)", type: "checkbox" }
    ],
    describe: (p) => ({
      title: `${p.icon || ""} ${p.title}`.trim(),
      badges: [
        [p.status === "draft" ? "Brouillon" : "Publié", p.status === "draft" ? "warn" : "green"],
        [p.demo ? "Démonstration" : "Projet réel", p.demo ? "cyan" : "green"],
        ...(p.featured ? [["À la une", ""]] : [])],
      meta: [p.category, p.realized_on ? `réalisé le ${new Date(`${String(p.realized_on).slice(0, 10)}T00:00:00Z`).toLocaleDateString("fr-FR", { timeZone: "UTC" })}` : "", p.technologies].filter(Boolean).join(" · ")
    })
  });

  views.services = entityView({
    endpoint: "/api/admin/services", title: "Services & tarifs", singular: "Nouveau service",
    intro: "Ces informations alimentent les pages Services, Tarifs et le formulaire de devis.",
    defaults: { icon: "◆", position: 0, active: true, conditions: "Prix indicatif en FCFA. Le tarif final est précisé dans un devis personnalisé après étude de votre besoin." },
    thumbOf: (s) => s.image_url || "",
    fields: [
      { name: "title", label: "Titre", required: true, max: 120 },
      { name: "slug", label: "Identifiant", required: true, max: 60, help: "minuscules, chiffres, tirets" },
      { name: "icon", label: "Icône", max: 20 },
      { name: "position", label: "Ordre d'affichage", type: "number" },
      { name: "starting_price", label: "Prix, ou prix minimum (FCFA)", type: "number", help: "vide = sur devis" },
      { name: "price_max", label: "Prix maximum (FCFA)", type: "number", help: "facultatif, pour une fourchette" },
      { name: "price_unit", label: "Unité", max: 40, placeholder: "/ mois" },
      { name: "image_url", label: "Image du service (facultatif)", type: "image", folder: "services" },
      { name: "title_en", label: "Titre en anglais", max: 120 },
      { name: "technologies", label: "Technologies", max: 300, help: "séparées par des virgules" },
      { name: "summary", label: "Résumé", required: true, max: 300, full: true },
      { name: "summary_en", label: "Résumé en anglais", max: 300, full: true },
      { name: "advantages", label: "Avantages", type: "textarea", rows: 4, max: 1500, full: true, help: "un point par ligne" },
      { name: "advantages_en", label: "Avantages en anglais", type: "textarea", rows: 4, max: 1500, full: true },
      { name: "details", label: "Fonctionnalités incluses", type: "textarea", rows: 5, max: 2000, full: true, help: "un point par ligne" },
      { name: "details_en", label: "Fonctionnalités en anglais", type: "textarea", rows: 5, max: 2000, full: true },
      { name: "conditions", label: "Conditions", type: "textarea", max: 1000, full: true },
      { name: "conditions_en", label: "Conditions en anglais", type: "textarea", max: 1000, full: true },
      { name: "active", label: "Actif (visible sur le site)", type: "checkbox" }
    ],
    describe: (s) => ({
      title: `${s.icon || ""} ${s.title}`.trim(),
      badges: [[s.active ? "Actif" : "Désactivé", s.active ? "green" : "warn"]],
      meta: `${s.starting_price === null ? "Sur devis" : `${s.price_max !== null && s.price_max > s.starting_price ? `${fmt(s.starting_price)} – ${fmt(s.price_max)}` : `À partir de ${fmt(s.starting_price)}`} FCFA ${s.price_unit || ""}`.trim()} · ordre ${s.position} · ${s.slug}`
    })
  });

  views.pricing = entityView({
    endpoint: "/api/admin/pricing", title: "Formules tarifaires", singular: "Nouvelle formule",
    intro: "Les formules STARTER / BUSINESS / PREMIUM de la page Tarifs. Prix vide = « Sur devis ». Les prix sont indicatifs : le tarif définitif est fixé dans le devis.",
    defaults: { position: 0, active: true, highlighted: false },
    fields: [
      { name: "name", label: "Nom", required: true, max: 60 },
      { name: "name_en", label: "Nom en anglais", max: 60 },
      { name: "slug", label: "Identifiant", required: true, max: 40, help: "minuscules, chiffres, tirets" },
      { name: "position", label: "Ordre d'affichage", type: "number" },
      { name: "price_min", label: "Prix, ou prix minimum (FCFA)", type: "number", help: "vide = sur devis" },
      { name: "price_max", label: "Prix maximum (FCFA)", type: "number", help: "facultatif" },
      { name: "price_unit", label: "Unité", max: 40, placeholder: "/ mois" },
      { name: "service_slug", label: "Prestation présélectionnée dans le devis", max: 60, help: "identifiant d'un service" },
      { name: "tagline", label: "Phrase d'accroche", max: 200, full: true },
      { name: "tagline_en", label: "Accroche en anglais", max: 200, full: true },
      { name: "features", label: "Fonctionnalités", type: "textarea", rows: 5, max: 1500, full: true, help: "une par ligne" },
      { name: "features_en", label: "Fonctionnalités en anglais", type: "textarea", rows: 5, max: 1500, full: true },
      { name: "highlighted", label: "Mettre en avant (« Recommandée »)", type: "checkbox" },
      { name: "active", label: "Actif (visible sur le site)", type: "checkbox" }
    ],
    describe: (p) => ({
      title: p.name,
      badges: [[p.active ? "Actif" : "Désactivé", p.active ? "green" : "warn"], ...(p.highlighted ? [["Mise en avant", ""]] : [])],
      meta: `${p.price_min === null ? "Sur devis" : `${p.price_max !== null && p.price_max > p.price_min ? `${fmt(p.price_min)} – ${fmt(p.price_max)}` : `À partir de ${fmt(p.price_min)}`} FCFA ${p.price_unit || ""}`.trim()} · ordre ${p.position}`
    })
  });

  views.testimonials = entityView({
    endpoint: "/api/admin/testimonials", title: "Témoignages", singular: "Nouveau témoignage",
    intro: "N'ajoutez que de vrais avis de clients, avec leur autorisation. Rien n'est affiché tant qu'un témoignage n'est pas publié. La photo n'est affichée que si l'autorisation est cochée.",
    defaults: { published: false, photo_consent: false },
    thumbOf: (t) => (t.photo_consent && t.photo_url) || "",
    fields: [
      { name: "author", label: "Nom du client", required: true, max: 100 },
      { name: "role", label: "Entreprise / fonction", max: 120 },
      { name: "rating", label: "Note (1 à 5, facultatif)", type: "number" },
      { name: "testimonial_date", label: "Date du témoignage", type: "date" },
      { name: "content", label: "Témoignage", type: "textarea", required: true, max: 1000, full: true },
      { name: "content_en", label: "Témoignage en anglais (facultatif)", type: "textarea", max: 1000, full: true },
      { name: "photo_url", label: "Photo (uniquement avec autorisation du client)", type: "image", folder: "testimonials" },
      { name: "photo_consent", label: "Le client a autorisé l'affichage de sa photo", type: "checkbox" },
      { name: "published", label: "Publier sur le site (après vérification et accord du client)", type: "checkbox" }
    ],
    describe: (t) => ({
      title: `${t.author}${t.role ? ` — ${t.role}` : ""}`,
      badges: [[t.published ? "Publié" : "Brouillon", t.published ? "green" : "warn"], ...(t.rating ? [[`${t.rating}/5`, ""]] : [])],
      meta: t.content
    })
  });

  views.clients = entityView({
    endpoint: "/api/admin/clients", title: "Clients", singular: "Nouveau client",
    intro: "Vous pouvez aussi créer une fiche depuis une demande de devis reçue.",
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
      badges: c.quotes_count ? [[`${c.quotes_count} demande${c.quotes_count > 1 ? "s" : ""}`, "cyan"]] : [],
      meta: [c.email, c.phone, c.company].filter(Boolean).join(" · ") || "Aucune coordonnée"
    })
  });

  // --- Informations générales du site ---
  views.settings = async (root) => {
    const { fields, values } = await api("/api/admin/settings");
    const feedback = feedbackEl();
    const groups = [...new Set(fields.map((f) => f.group))];
    const inputs = {};
    const form = h("form", {}, groups.map((group) => h("fieldset", { class: "panel", style: "margin:0 0 1rem" },
      h("legend", { class: "eyebrow", text: group }),
      h("div", { class: "form-grid" }, fields.filter((f) => f.group === group).map((f) => {
        const id = `set-${f.key}`;
        const input = f.type === "text" ? h("textarea", { id, rows: 3, maxlength: f.max }) : h("input", { id, type: f.type === "email" ? "email" : f.type === "url" ? "url" : "text", maxlength: f.max, inputmode: f.type === "phone" ? "numeric" : null });
        input.value = values[f.key] || "";
        inputs[f.key] = input;
        return h("div", { class: f.type === "text" ? "full" : "" }, h("label", { for: id }, f.label, f.help ? h("small", { text: ` — ${f.help}` }) : null), input);
      })))),
      h("div", { class: "editor-actions" }, h("button", { class: "btn primary", type: "submit", text: "Enregistrer les informations" })), feedback);
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        await api("/api/admin/settings", { method: "PUT", body: { values: Object.fromEntries(Object.entries(inputs).map(([k, el]) => [k, el.value])) } });
        say(feedback, "");
        notify("Informations enregistrées : elles s'affichent désormais sur le site.");
      } catch (error) { say(feedback, error.message, true); }
      finally { button.disabled = false; }
    });
    root.replaceChildren(
      h("div", { class: "panel-heading" }, h("div", {}, h("h2", { text: "Informations du site" }),
        h("p", { class: "muted", text: "Un champ laissé vide reprend la valeur par défaut du site. Les tarifs se modifient dans « Services & tarifs »." }))),
      form);
  };

  // --- Historique des actions ---
  views.activity = async (root) => {
    const { items } = await api("/api/admin/activity");
    const labels = { create: "Création", update: "Modification", delete: "Suppression", login: "Connexion", logout: "Déconnexion", password: "Mot de passe", upload: "Image" };
    root.replaceChildren(
      h("div", { class: "panel-heading" }, h("div", {}, h("h2", { text: "Historique des actions" }), h("p", { class: "muted", text: "Les 200 dernières actions de l'administration (aucun mot de passe n'y est enregistré)." }))),
      items.length
        ? h("div", { class: "panel table-wrap" }, h("table", { class: "log-table" },
          h("thead", {}, h("tr", {}, ["Date", "Administrateur", "Action", "Détail"].map((t) => h("th", { text: t })))),
          h("tbody", {}, items.map((a) => h("tr", {}, h("td", { text: formatDate(a.created_at) }), h("td", { text: a.admin_email || "—" }),
            h("td", {}, h("span", { class: "badge", text: labels[a.action] || a.action })), h("td", { text: a.summary }))))))
        : empty("Aucune action enregistrée pour le moment."));
  };

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
        say(feedback, "");
        notify("Mot de passe modifié.");
      } catch (error) { say(feedback, error.message, true); }
    });
    root.replaceChildren(
      h("div", { class: "panel" }, h("h2", { text: "Mon compte" }),
        h("p", { class: "muted", text: caps.authMethod === "supabase" ? "Connexion : Supabase Auth." : "Connexion : ancien compte du site." }), form),
      caps.authMethod !== "supabase" ? h("p", { class: "notice warn", text: caps.supabaseAuth
        ? "Votre compte Supabase Auth n'est pas encore utilisé. Une fois créé (voir le guide), connectez-vous avec lui : la récupération du mot de passe par email fonctionnera alors."
        : "Supabase Auth n'est pas encore configuré sur ce site (variables SUPABASE_URL et SUPABASE_ANON_KEY)." }) : null);
  };

  if (readRecoveryFromUrl()) { showLogin(); showForm("reset"); $("#reset-password").focus(); }
  else checkSession();
})();
