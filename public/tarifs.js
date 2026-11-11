(async function () {
  "use strict";
  const plansBox = document.getElementById("plans-grid");
  const box = document.getElementById("pricing-grid");
  const [plans, services] = await Promise.all([
    SD.getJSON("/api/pricing").catch(() => null),
    SD.getJSON("/api/services").catch(() => null)
  ]);
  plansBox.replaceChildren(...(plans ? (plans.plans.length ? plans.plans.map((p) => SD.planCard(p)) : [SD.message(SD.t("noPlans"))]) : [SD.message(SD.t("loadError"))]));
  box.replaceChildren(...(services ? (services.services.length ? services.services.map((s) => SD.serviceCard(s, "pricing")) : [SD.message(SD.t("noServices"))]) : [SD.message(SD.t("loadError"))]));
  SD.reveal();
})();
