(async function () {
  "use strict";
  const grid = document.getElementById("project-grid");
  const count = document.getElementById("result-count");
  const buttons = [...document.querySelectorAll("#project-filters .chip-btn")];
  let projects = [];
  let kind = "";

  function render() {
    const filtered = projects.filter((p) => !kind || p.kind === kind);
    count.textContent = projects.length ? SD.t("projectShown", { n: filtered.length }) : "";
    grid.replaceChildren(...(filtered.length ? filtered.map((p) => SD.projectCard(p)) : [SD.message(SD.t(projects.length ? "noMatch" : "noProjects"))]));
    SD.reveal();
  }

  try { ({ projects } = await SD.getJSON("/api/projects")); }
  catch { grid.replaceChildren(SD.message(SD.t("loadError"))); return; }

  buttons.forEach((button) => button.addEventListener("click", () => {
    kind = button.dataset.kind;
    buttons.forEach((b) => { const on = b === button; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
    render();
  }));
  render();
})();
