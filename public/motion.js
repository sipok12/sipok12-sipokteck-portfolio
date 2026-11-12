// Motion design léger : barre de progression, entrée du hero, inclinaison 3D des cartes, parallaxe, compteurs.
// Tout est désactivé si l'utilisateur demande moins d'animations (prefers-reduced-motion).
(function () {
  "use strict";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const SD = (window.SD = window.SD || {});

  // Compteur : de 0 à la valeur réelle, au moment où l'élément devient visible.
  SD.countUp = function (root) {
    root.querySelectorAll("strong").forEach((el) => {
      const target = parseInt(el.textContent, 10);
      if (!Number.isFinite(target) || reduced || !("IntersectionObserver" in window)) return;
      el.textContent = "0";
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        const start = performance.now(), duration = 1200;
        (function tick(now) {
          const t = Math.min(1, (now - start) / duration);
          el.textContent = String(Math.round(target * (1 - Math.pow(1 - t, 3))));
          if (t < 1) requestAnimationFrame(tick);
        })(start);
      }, { threshold: 0.4 });
      io.observe(el);
    });
  };
  if (reduced) return;

  document.documentElement.classList.add("motion");

  // Barre de progression de lecture
  const bar = document.createElement("div");
  bar.className = "scroll-progress";
  bar.setAttribute("aria-hidden", "true");
  document.body.append(bar);
  let queued = false;
  function updateBar() {
    queued = false;
    const max = document.documentElement.scrollHeight - innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
  }
  addEventListener("scroll", () => { if (!queued) { queued = true; requestAnimationFrame(updateBar); } }, { passive: true });
  updateBar();

  if (!fine) return;

  // Inclinaison 3D subtile des cartes sous le curseur
  document.addEventListener("pointermove", (event) => {
    const card = event.target.closest && event.target.closest(".card, .plan");
    document.querySelectorAll(".tilting").forEach((el) => { if (el !== card) { el.classList.remove("tilting"); el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); } });
    if (!card) return;
    const r = card.getBoundingClientRect();
    const x = (event.clientX - r.left) / r.width - 0.5, y = (event.clientY - r.top) / r.height - 0.5;
    card.classList.add("tilting");
    card.style.setProperty("--ry", `${(x * 7).toFixed(2)}deg`);
    card.style.setProperty("--rx", `${(-y * 7).toFixed(2)}deg`);
    card.style.setProperty("--mx", `${((x + 0.5) * 100).toFixed(0)}%`);
    card.style.setProperty("--my", `${((y + 0.5) * 100).toFixed(0)}%`);
  }, { passive: true });

  // Parallaxe de l'illustration du hero
  const stage = document.querySelector(".stage");
  if (stage) {
    document.querySelector(".hero")?.addEventListener("pointermove", (event) => {
      const r = stage.getBoundingClientRect();
      stage.style.setProperty("--px", (((event.clientX - r.left) / r.width - 0.5) * 14).toFixed(1) + "px");
      stage.style.setProperty("--py", (((event.clientY - r.top) / r.height - 0.5) * 14).toFixed(1) + "px");
    }, { passive: true });
  }
})();
