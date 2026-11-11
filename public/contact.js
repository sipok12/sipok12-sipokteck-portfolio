(function () {
  "use strict";
  const $ = (selector) => document.querySelector(selector);

  // --- Onglets : devis / question ---
  const tabs = [$("#tab-devis"), $("#tab-message")];
  const panels = [$("#devis"), $("#message-panel")];
  function showTab(index, focus) {
    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
      panels[i].hidden = !active;
    });
    if (focus) tabs[index].focus();
  }
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => showTab(i));
    tab.addEventListener("keydown", (event) => {
      if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        showTab((i + 1) % tabs.length, true);
      }
    });
  });
  if (location.hash === "#message-panel") showTab(1);

  // --- Devis : listes alimentées par le serveur ---
  const serviceSelect = $("#q-service");
  const budgetSelect = $("#q-budget");
  const deadlineSelect = $("#q-deadline");
  let serviceTitles = {};
  let primaryWhatsapp = "22878003599";

  async function setup() {
    const [config, servicesData] = await Promise.all([
      SD.config,
      SD.getJSON("/api/services").catch(() => ({ services: [] }))
    ]);
    if (config) {
      primaryWhatsapp = config.whatsappPrimary || primaryWhatsapp;
      // La valeur envoyée reste la valeur française attendue par le serveur ; seul le libellé change selon la langue.
      const budgetLabels = SD.raw("budgets") || {};
      const deadlineLabels = SD.raw("deadlines") || {};
      budgetSelect.append(...config.quoteOptions.budgets.map((b) => new Option(budgetLabels[b] || b, b)));
      deadlineSelect.append(...config.quoteOptions.deadlines.map((d) => new Option(deadlineLabels[d] || d, d)));
    }
    serviceSelect.replaceChildren(new Option(SD.t("servicePlaceholder"), ""));
    for (const s of servicesData.services) {
      serviceTitles[s.slug] = s.title;
      serviceSelect.append(new Option(s.title, s.slug));
    }
    serviceTitles.autre = SD.t("other");
    serviceSelect.append(new Option(serviceTitles.autre, "autre"));
    const wanted = new URLSearchParams(location.search).get("service");
    if (wanted && serviceTitles[wanted]) serviceSelect.value = wanted;
  }
  setup();

  function setFeedback(el, message, isError) {
    el.textContent = message;
    el.classList.toggle("error", Boolean(isError));
    el.classList.toggle("ok", !isError && Boolean(message));
  }

  // --- Envoi du devis ---
  const quoteForm = $("#quote-form");
  const quoteFeedback = $("#quote-feedback");
  const success = $("#quote-success");

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(quoteFeedback, "");
    if (!quoteForm.reportValidity()) return;
    const button = quoteForm.querySelector("button[type=submit]");
    const form = new FormData(quoteForm);
    const body = Object.fromEntries(form.entries());
    body.consent = $("#q-consent").checked;
    button.disabled = true;
    button.textContent = SD.t("sending");
    try {
      const data = await SD.postJSON("/api/quote", body);
      const label = serviceTitles[body.service] || "";
      $("#quote-success-text").textContent = data.message || "";
      const reference = data.reference ? SD.t("quoteRef", { r: data.reference }) : SD.t("quoteGeneric");
      $("#quote-wa").href = SD.whatsappLink(primaryWhatsapp,
        label ? SD.t("quoteSent", { r: reference, s: label }) : SD.t("quoteSentNoService", { r: reference }));
      quoteForm.hidden = true;
      success.hidden = false;
      success.focus();
      quoteForm.reset();
    } catch (error) {
      setFeedback(quoteFeedback, error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = SD.t("sendQuote");
    }
  });

  $("#quote-again").addEventListener("click", () => {
    success.hidden = true;
    quoteForm.hidden = false;
    setFeedback(quoteFeedback, "");
    serviceSelect.focus();
  });

  // --- Message simple ---
  const contactForm = $("#contact-form");
  const contactFeedback = $("#contact-feedback");
  contactForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setFeedback(contactFeedback, "");
    if (!contactForm.reportValidity()) return;
    const button = contactForm.querySelector("button[type=submit]");
    button.disabled = true;
    button.textContent = SD.t("sending");
    try {
      const data = await SD.postJSON("/api/contact", Object.fromEntries(new FormData(contactForm).entries()));
      setFeedback(contactFeedback, data.message || "", false);
      contactForm.reset();
    } catch (error) {
      setFeedback(contactFeedback, error.message, true);
    } finally {
      button.disabled = false;
      button.textContent = SD.t("sendMessage");
    }
  });
})();
