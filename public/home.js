(async function () {
  "use strict";
  const servicesBox = document.getElementById("home-services");
  const projectsBox = document.getElementById("home-projects");
  const testimonialsSection = document.getElementById("temoignages");
  const testimonialsBox = document.getElementById("home-testimonials");
  const statsSection = document.getElementById("stats");
  const statsBox = document.getElementById("home-stats");

  async function loadServices() {
    try {
      const { services } = await SD.getJSON("/api/services");
      servicesBox.replaceChildren(...(services.length ? services.slice(0, 6).map((s) => SD.serviceCard(s, "teaser")) : [SD.message(SD.t("noServices"))]));
    } catch { servicesBox.replaceChildren(SD.message(SD.t("loadError"))); }
  }
  async function loadProjects() {
    try {
      const { projects } = await SD.getJSON("/api/projects");
      projectsBox.replaceChildren(...(projects.length ? projects.slice(0, 3).map((p) => SD.projectCard(p)) : [SD.message(SD.t("noProjects"))]));
    } catch { projectsBox.replaceChildren(SD.message(SD.t("loadError"))); }
  }
  // Aucun témoignage n'est affiché tant qu'aucun n'est publié depuis l'administration.
  async function loadTestimonials() {
    try {
      const { testimonials } = await SD.getJSON("/api/testimonials");
      if (!testimonials.length) return;
      testimonialsBox.replaceChildren(...testimonials.slice(0, 6).map((t) => SD.testimonialCard(t)));
      testimonialsSection.hidden = false;
    } catch { /* section simplement masquée */ }
  }
  // Statistiques : uniquement des nombres réels issus de la base, et seulement ceux supérieurs à zéro.
  async function loadStats() {
    try {
      const s = await SD.getJSON("/api/stats");
      const items = [["statProjects", s.projects], ["statReal", s.realProjects], ["statServices", s.services], ["statTestimonials", s.testimonials]].filter(([, n]) => n > 0);
      if (items.length < 2) return;
      statsBox.replaceChildren(...items.map(([label, n]) => SD.h("div", { class: "card stat" }, SD.h("strong", { text: String(n) }), SD.h("span", { text: SD.t(label) }))));
      statsSection.hidden = false;
      if (SD.countUp) SD.countUp(statsBox);
    } catch { /* section simplement masquée */ }
  }

  await Promise.all([loadServices(), loadProjects(), loadTestimonials(), loadStats()]);
  SD.reveal();
})();
