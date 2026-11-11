// Thème clair/sombre : appliqué avant l'affichage de la page pour éviter tout « flash ». Le choix est mémorisé (si le navigateur l'autorise). Sombre par défaut : c'est l'identité de la marque.
(function () {
  "use strict";
  var theme = "dark";
  try {
    var saved = localStorage.getItem("sd-theme");
    if (saved === "light" || saved === "dark") theme = saved;
  } catch (e) { /* stockage indisponible : thème sombre par défaut */ }
  document.documentElement.setAttribute("data-theme", theme);
})();
