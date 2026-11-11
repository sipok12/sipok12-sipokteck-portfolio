(async function () {
  "use strict";
  const box = document.getElementById("services-list");
  try {
    const { services } = await SD.getJSON("/api/services");
    box.replaceChildren(...(services.length ? services.map((s) => SD.serviceCard(s, "detail")) : [SD.message(SD.t("noServices"))]));
  } catch { box.replaceChildren(SD.message(SD.t("loadError"))); }
  SD.reveal();
})();
