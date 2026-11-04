(async function () {
  "use strict";
  const box = document.getElementById("pricing-grid");
  try {
    const { services } = await SD.getJSON("/api/services");
    box.replaceChildren(...(services.length
      ? services.map((s) => SD.serviceCard(s, "pricing"))
      : [SD.message("Les tarifs seront bientôt publiés. Demandez un devis personnalisé.")]));
  } catch {
    box.replaceChildren(SD.message("Les tarifs ne peuvent pas être chargés pour le moment. Demandez un devis par WhatsApp."));
  }
  SD.reveal();
})();
