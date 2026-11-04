(async function () {
  "use strict";
  const box = document.getElementById("services-list");
  try {
    const { services } = await SD.getJSON("/api/services");
    box.replaceChildren(...(services.length
      ? services.map((s) => SD.serviceCard(s, "detail"))
      : [SD.message("Les services seront bientôt publiés.")]));
  } catch {
    box.replaceChildren(SD.message("Les services ne peuvent pas être chargés pour le moment. Écrivez-nous sur WhatsApp."));
  }
  SD.reveal();
})();
