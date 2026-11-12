// Globe terrestre animé (canvas 2D, sans bibliothèque) : points de terre, Lomé (Togo) en base, arcs vers les pays réellement servis.
// Les pays viennent de l'administration (Informations du site → « Pays où vous avez réellement travaillé ») : rien n'est inventé.
(function () {
  "use strict";
  const canvas = document.getElementById("globe");
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext("2d");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const RAD = Math.PI / 180;
  const LOME = { lat: 6.13, lon: 1.22 };

  // Centres approximatifs [latitude, longitude] des pays
  const C = { TG: [8.6, 0.8], BJ: [9.3, 2.3], GH: [7.9, -1.0], NG: [9.1, 8.7], CI: [7.5, -5.5], SN: [14.5, -14.5], ML: [17.6, -4], BF: [12.2, -1.6], NE: [17.6, 8.1], GN: [9.9, -9.7], CM: [7.4, 12.4], GA: [-0.8, 11.6], CG: [-0.2, 15.8], CD: [-4, 21.8], CF: [6.6, 20.9], TD: [15.5, 18.7],
    MA: [31.8, -7.1], DZ: [28, 1.7], TN: [33.9, 9.5], EG: [26.8, 30.8], KE: [0.2, 37.9], ET: [9.1, 40.5], TZ: [-6.4, 34.9], UG: [1.4, 32.3], RW: [-1.9, 29.9], ZA: [-30.6, 22.9], AO: [-11.2, 17.9], MG: [-18.8, 46.9], MU: [-20.3, 57.6],
    FR: [46.6, 2.2], BE: [50.6, 4.7], CH: [46.8, 8.2], DE: [51.2, 10.4], GB: [54, -2.5], IE: [53.2, -8], ES: [40.2, -3.6], PT: [39.6, -8], IT: [42.8, 12.5], NL: [52.2, 5.3], LU: [49.8, 6.1], SE: [62, 15], NO: [64.5, 11.5], FI: [64, 26], PL: [52, 19.4], RU: [61.5, 99], TR: [39, 35],
    US: [39.8, -98.6], CA: [56.1, -106.3], MX: [23.6, -102.5], BR: [-10.8, -52.9], AR: [-34.6, -64.2], CL: [-35.7, -71.5], CO: [4.6, -74.3], HT: [19, -72.4],
    CN: [35.9, 104.2], IN: [21, 78], JP: [36.2, 138.3], KR: [36.5, 127.9], SG: [1.35, 103.8], AE: [24, 54.3], SA: [24, 45], IL: [31, 34.9], LB: [33.9, 35.9], ID: [-2.5, 118], VN: [16, 107.8], TH: [15.9, 100.9], PH: [12.9, 121.8],
    AU: [-25.3, 133.8], NZ: [-41, 174] };

  const settings = { countries: [] };
  let land = null;
  let rotation = 0; // longitude au centre (en degrés)
  const tilt = 14 * RAD;
  let spin = true, dragging = false, lastX = 0, visible = true, frame = 0;
  let colors = {};

  function readColors() {
    const s = getComputedStyle(document.documentElement);
    const light = document.documentElement.getAttribute("data-theme") === "light";
    colors = { land: light ? "rgba(11,31,54,.55)" : "rgba(170,183,196,.55)", sphereA: light ? "#EAF4FA" : "#0B1F36", sphereB: light ? "#CFE3EE" : "#07111F", rim: "rgba(0,217,255,.55)", accent: "#00D9FF", marker: light ? "#006F86" : "#00D9FF" };
    void s;
  }
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  readColors();

  function fit() {
    const size = Math.min(canvas.parentElement.clientWidth, 440);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = canvas.style.height = size + "px";
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    canvas.dataset.size = String(size);
  }

  // Projection orthographique : renvoie [x, y, profondeur] (profondeur > 0 = face visible)
  function project(lat, lon, radius, cx, cy) {
    const phi = lat * RAD, lam = (lon - rotation) * RAD;
    const cosc = Math.sin(tilt) * Math.sin(phi) + Math.cos(tilt) * Math.cos(phi) * Math.cos(lam);
    const x = Math.cos(phi) * Math.sin(lam);
    const y = Math.cos(tilt) * Math.sin(phi) - Math.sin(tilt) * Math.cos(phi) * Math.cos(lam);
    return [cx + x * radius, cy - y * radius, cosc];
  }

  function arcPoints(a, b, steps) {
    const toV = ([lat, lon]) => [Math.cos(lat * RAD) * Math.cos(lon * RAD), Math.cos(lat * RAD) * Math.sin(lon * RAD), Math.sin(lat * RAD)];
    const A = toV(a), B = toV(b);
    const dot = Math.max(-1, Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
    const omega = Math.acos(dot) || 1e-6, pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, k1 = Math.sin((1 - t) * omega) / Math.sin(omega), k2 = Math.sin(t * omega) / Math.sin(omega);
      let v = [k1 * A[0] + k2 * B[0], k1 * A[1] + k2 * B[1], k1 * A[2] + k2 * B[2]];
      const lift = 1 + 0.22 * Math.sin(Math.PI * t) * Math.min(1, omega / 1.2);
      const len = Math.hypot(...v);
      v = v.map((c) => (c / len) * lift);
      pts.push({ lat: Math.asin(v[2] / lift) / RAD, lon: Math.atan2(v[1], v[0]) / RAD, lift });
    }
    return pts;
  }

  function draw(time) {
    const size = Number(canvas.dataset.size) || 440, cx = size / 2, cy = size / 2, radius = size * 0.42;
    ctx.clearRect(0, 0, size, size);

    // halo + sphère
    const halo = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.3);
    halo.addColorStop(0, "rgba(0,217,255,.22)"); halo.addColorStop(1, "rgba(0,217,255,0)");
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(cx, cy, radius * 1.3, 0, 7); ctx.fill();
    const sphere = ctx.createRadialGradient(cx - radius * 0.35, cy - radius * 0.4, radius * 0.1, cx, cy, radius);
    sphere.addColorStop(0, colors.sphereA); sphere.addColorStop(1, colors.sphereB);
    ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, 7); ctx.fill();
    ctx.strokeStyle = colors.rim; ctx.lineWidth = 1.2; ctx.stroke();

    // terres (points)
    if (land) {
      const { step, lat0, lon0, rows } = land;
      ctx.fillStyle = colors.land;
      for (let r = 0; r < rows.length; r++) {
        const lat = lat0 - r * step, row = rows[r];
        for (let c = 0; c < row.length; c++) {
          if (row.charCodeAt(c) !== 49) continue;
          const [x, y, depth] = project(lat, lon0 + c * step + step / 2, radius, cx, cy);
          if (depth <= 0.02) continue;
          ctx.globalAlpha = 0.25 + 0.75 * depth;
          ctx.fillRect(x - 1.2, y - 1.2, 2.6, 2.6);
        }
      }
      ctx.globalAlpha = 1;
    }

    const pulse = reduced ? 0.5 : (time / 1600) % 1;
    const base = [LOME.lat, LOME.lon];
    const targets = settings.countries.filter((code) => code !== "TG" && C[code]);

    // arcs depuis Lomé
    ctx.lineWidth = 1.4;
    targets.forEach((code, i) => {
      const pts = arcPoints(base, C[code], 48);
      ctx.strokeStyle = colors.accent; ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        const [x, y, depth] = project(p.lat, p.lon, radius * p.lift, cx, cy);
        if (depth > 0) { ctx.globalAlpha = 0.65; pen ? ctx.lineTo(x, y) : ctx.moveTo(x, y); pen = true; } else pen = false;
      }
      ctx.stroke();
      if (!reduced) { // petite lumière qui voyage le long de l'arc
        const p = pts[Math.floor(((time / 2600 + i * 0.23) % 1) * (pts.length - 1))];
        const [x, y, depth] = project(p.lat, p.lon, radius * p.lift, cx, cy);
        if (depth > 0) { ctx.globalAlpha = 1; ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, 2.2, 0, 7); ctx.fill(); }
      }
    });
    ctx.globalAlpha = 1;

    // repères : pays servis puis Lomé (base)
    const marker = (lat, lon, big) => {
      const [x, y, depth] = project(lat, lon, radius, cx, cy);
      if (depth <= 0) return;
      ctx.fillStyle = colors.marker; ctx.beginPath(); ctx.arc(x, y, big ? 4.6 : 3.4, 0, 7); ctx.fill();
      ctx.strokeStyle = colors.marker; ctx.globalAlpha = 1 - pulse; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, (big ? 5 : 4) + pulse * (big ? 16 : 11), 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
    };
    targets.forEach((code) => marker(C[code][0], C[code][1], false));
    marker(LOME.lat, LOME.lon, true);
  }

  function loop(time) {
    if (visible && !document.hidden) {
      if (spin && !dragging && !reduced) rotation = (rotation + 0.12) % 360;
      draw(time);
    }
    frame = requestAnimationFrame(loop);
  }

  // Rotation par glisser (souris, doigt ou clavier)
  canvas.style.touchAction = "pan-y";
  canvas.addEventListener("pointerdown", (e) => { dragging = true; lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener("pointermove", (e) => { if (!dragging) return; rotation -= (e.clientX - lastX) * 0.4; lastX = e.clientX; if (reduced) draw(performance.now()); });
  ["pointerup", "pointercancel"].forEach((n) => canvas.addEventListener(n, () => { dragging = false; }));
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") rotation -= 10; else if (e.key === "ArrowRight") rotation += 10; else return;
    e.preventDefault(); if (reduced) draw(performance.now());
  });

  if ("IntersectionObserver" in window) new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; }, { threshold: 0.05 }).observe(canvas);

  async function init() {
    fit();
    rotation = LOME.lon - 10; // Afrique de l'Ouest au centre au départ
    addEventListener("resize", () => { fit(); if (reduced) draw(performance.now()); });
    try { land = await (await fetch("/land.json")).json(); } catch { /* globe sans continents */ }

    const config = await SD.config;
    settings.countries = ((config && config.countries) || []).filter((c) => C[c]);
    const list = document.getElementById("globe-list"), note = document.getElementById("globe-note");
    const names = new Intl.DisplayNames([SD.lang], { type: "region" });
    const name = (code) => { try { return names.of(code); } catch { return code; } };
    const items = [SD.h("li", { text: `📍 ${SD.t("globeBase")} : ${name("TG")} (Lomé)` })];
    const served = settings.countries.filter((c) => c !== "TG");
    served.forEach((c) => items.push(SD.h("li", { text: name(c) })));
    list.replaceChildren(...items);
    note.textContent = served.length ? `${SD.t("globeServed")} : ${served.map(name).join(", ")}.` : SD.t("globeNone");

    if (reduced) draw(performance.now()); else frame = requestAnimationFrame(loop);
  }
  if (window.SD) init();
})();
