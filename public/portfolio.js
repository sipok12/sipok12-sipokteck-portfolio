(async function () {
  "use strict";
  const grid = document.getElementById("project-grid");
  const count = document.getElementById("result-count");
  const search = document.getElementById("f-search");
  const category = document.getElementById("f-category");
  const type = document.getElementById("f-type");
  let projects = [];

  const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  function render() {
    const query = normalize(search.value.trim());
    const filtered = projects.filter((p) => {
      if (category.value && p.category !== category.value) return false;
      if (type.value === "real" && p.demo) return false;
      if (type.value === "demo" && !p.demo) return false;
      if (!query) return true;
      return normalize([p.title, p.description, p.category, p.technologies].join(" ")).includes(query);
    });
    count.textContent = projects.length
      ? `${filtered.length} projet${filtered.length > 1 ? "s" : ""} affiché${filtered.length > 1 ? "s" : ""} sur ${projects.length}`
      : "";
    grid.replaceChildren(...(filtered.length
      ? filtered.map((p) => SD.projectCard(p))
      : [SD.message(projects.length ? "Aucun projet ne correspond à votre recherche." : "Les projets seront bientôt ajoutés.")]));
    SD.reveal();
  }

  try {
    ({ projects } = await SD.getJSON("/api/projects"));
    const categories = [...new Set(projects.map((p) => p.category))].sort((a, b) => a.localeCompare(b, "fr"));
    category.append(...categories.map((c) => new Option(c, c)));
  } catch {
    grid.replaceChildren(SD.message("Les projets ne peuvent pas être chargés pour le moment. Réessayez plus tard."));
    return;
  }

  document.getElementById("project-filters").addEventListener("submit", (event) => event.preventDefault());
  search.addEventListener("input", render);
  category.addEventListener("change", render);
  type.addEventListener("change", render);
  render();
})();
