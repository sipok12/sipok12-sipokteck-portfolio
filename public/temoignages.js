(async function () {
  "use strict";
  const box = document.getElementById("testimonials-grid");
  try {
    const { testimonials } = await SD.getJSON("/api/testimonials");
    box.replaceChildren(...(testimonials.length ? testimonials.map((t) => SD.testimonialCard(t)) : [SD.message(document.documentElement.lang === "en"
      ? "The first client reviews will be published here, with their consent. Meanwhile, explore our projects and demos."
      : "Les premiers avis de clients seront publiés ici, avec leur accord. En attendant, découvrez nos projets et nos démonstrations.")]));
  } catch { box.replaceChildren(SD.message(SD.t("loadError"))); }
  SD.reveal();
})();
