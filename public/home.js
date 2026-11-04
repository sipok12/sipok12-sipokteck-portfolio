(async function () {
  "use strict";
  const servicesBox = document.getElementById("home-services");
  const projectsBox = document.getElementById("home-projects");
  const testimonialsSection = document.getElementById("temoignages");
  const testimonialsBox = document.getElementById("home-testimonials");

  async function loadServices() {
    try {
      const { services } = await SD.getJSON("/api/services");
      servicesBox.replaceChildren(...(services.length
        ? services.map((s) => SD.serviceCard(s, "teaser"))
        : [SD.message("Les services seront bientôt publiés.")]));
    } catch { servicesBox.replaceChildren(SD.message("Les services ne peuvent pas être chargés pour le moment. Écrivez-nous sur WhatsApp.")); }
  }

  async function loadProjects() {
    try {
      const { projects } = await SD.getJSON("/api/projects");
      projectsBox.replaceChildren(...(projects.length
        ? projects.slice(0, 3).map((p) => SD.projectCard(p))
        : [SD.message("Les projets seront bientôt ajoutés.")]));
    } catch { projectsBox.replaceChildren(SD.message("Les projets ne peuvent pas être chargés pour le moment.")); }
  }

  // Aucun témoignage n'est affiché tant qu'aucun n'est publié depuis l'administration.
  async function loadTestimonials() {
    try {
      const { testimonials } = await SD.getJSON("/api/testimonials");
      if (!testimonials.length) return;
      testimonialsBox.replaceChildren(...testimonials.map((t) => SD.testimonialCard(t)));
      testimonialsSection.hidden = false;
    } catch { /* section simplement masquée */ }
  }

  await Promise.all([loadServices(), loadProjects(), loadTestimonials()]);
  SD.reveal();
})();
