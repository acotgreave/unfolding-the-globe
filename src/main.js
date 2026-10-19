(() => {
  const R = Math.PI / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const SPEED = reduceMotion ? 0.3 : 1;

  /* ---------- Raw projections ---------- */
  const mercRaw = (l, p) => d3.geoMercatorRaw(l, clamp(p, -85 * R, 85 * R));
  const lccBase = d3.geoConicConformalRaw(30 * R, 60 * R);
  const lccRaw = (l, p) => lccBase(l, Math.max(p, -62 * R));
  const homoRaw = d3.geoHomolosineRaw;
  // Goode's lobes (degrees): [west edge, central meridian/pole, east edge]
  const LOBES_DEG = [
    [[[-180, 0], [-100, 90], [-40, 0]], [[-40, 0], [30, 90], [180, 0]]],
    [[[-180, 0], [-160, -90], [-100, 0]], [[-100, 0], [-60, -90], [-20, 0]], [[-20, 0], [20, -90], [80, 0]], [[80, 0], [140, -90], [180, 0]]]
  ];
  const LOBES = LOBES_DEG.map(h => h.map(l => l.map(p => [p[0] * R, p[1] * R])));
  function interruptedRaw(l, p) {
    const sign = p < 0 ? -1 : 1, lobe = LOBES[+(p < 0)];
    let i = 0;
    for (const n = lobe.length - 1; i < n && l > lobe[i][2][0]; ++i);
    const c = lobe[i][1][0];
    const out = homoRaw(l - c, p);
    out[0] += homoRaw(c, sign * p > sign * lobe[i][0][1] ? lobe[i][0][1] : p)[0];
    return out;
  }
  let goodeClip = null;
  function getGoodeClip() {
    if (goodeClip) return goodeClip;
    // Outline of the lobes, pulled a hair inside each lobe, as a spherical clip polygon
    const ring = LOBES_DEG.flatMap((h, i) => {
      const pts = h.flatMap(q => q.map(pt => d3.geoInterpolate(pt, [q[1][0], 0])(1e-9)));
      return i === 0 ? pts : pts.reverse();
    });
    goodeClip = d3.geoClipPolygon({ type: "Polygon", coordinates: [[...ring, ring[0]]] });
    return goodeClip;
  }

  const outline = (s, n) => d3.geoGraticule().extentMajor([[-180, s], [180, n]]).outline();

  /* ---------- The nine projections ---------- */
  const PROJ = [
    { key: "mercator", name: "Mercator", group: "Cylinder", family: "Cylindrical", prop: "conformal", year: "1569 · Gerardus Mercator",
      raw: mercRaw, rotate: [0, 0], cut: "anti", fit: outline(-80, 84), surface: "cylinder",
      how: "Wrap a cylinder around the equator, then stretch each band north–south by exactly as much as it was stretched east–west. That keeps angles true at every point.",
      trade: "Area balloons toward the poles. The poles themselves are infinitely far away and never appear.",
      used: "Nautical charts, and the tiles behind most web maps.",
      wiki: "https://en.wikipedia.org/wiki/Mercator_projection" },
    { key: "gallpeters", name: "Gall–Peters", group: "Cylinder", family: "Cylindrical", prop: "equal", year: "1855 · James Gall; promoted 1973 by Arno Peters",
      raw: d3.geoCylindricalEqualAreaRaw(45 * R), rotate: [0, 0], cut: "anti", fit: { type: "Sphere" }, surface: "cylinder",
      how: "A cylinder that cuts the globe at 45° N and S. Bands are squeezed north–south so every region keeps its true area.",
      trade: "Shapes pay for it: the tropics look tall and thin, high latitudes look flattened.",
      used: "Advocacy and education maps that want to show the true size of the Global South.",
      wiki: "https://en.wikipedia.org/wiki/Gall%E2%80%93Peters_projection" },
    { key: "robinson", name: "Robinson", group: "Ovals & blends", family: "Pseudocylindrical", prop: "compromise", year: "1963 · Arthur Robinson",
      raw: d3.geoRobinsonRaw, rotate: [0, 0], cut: "anti", fit: { type: "Sphere" }, surface: "oval",
      how: "No single formula. Robinson tuned a lookup table of row lengths and spacings by eye until the world looked right.",
      trade: "Nothing is exactly preserved. Poles become lines, and high latitudes are somewhat stretched.",
      used: "National Geographic's world maps, 1988–1998.",
      wiki: "https://en.wikipedia.org/wiki/Robinson_projection" },
    { key: "winkel", name: "Winkel Tripel", group: "Ovals & blends", family: "Modified azimuthal", prop: "compromise", year: "1921 · Oswald Winkel",
      raw: d3.geoWinkel3Raw, rotate: [0, 0], cut: "anti", fit: { type: "Sphere" }, surface: "oval",
      how: "The average of two projections, Aitoff and equirectangular. The name means it balances three errors: area, direction and distance.",
      trade: "Low overall distortion, but meridians curve and no property is exact.",
      used: "National Geographic's world maps since 1998.",
      wiki: "https://en.wikipedia.org/wiki/Winkel_tripel_projection" },
    { key: "mollweide", name: "Mollweide", group: "Ovals & blends", family: "Pseudocylindrical", prop: "equal", year: "1805 · Karl Mollweide",
      raw: d3.geoMollweideRaw, rotate: [0, 0], cut: "anti", fit: { type: "Sphere" }, surface: "oval",
      how: "The world fills a 2:1 ellipse. Parallels are spaced so every band keeps its true area.",
      trade: "Shapes shear badly near the edges of the ellipse.",
      used: "Global distribution maps, and all-sky maps of the cosmic microwave background.",
      wiki: "https://en.wikipedia.org/wiki/Mollweide_projection" },
    { key: "goode", name: "Goode Homolosine", group: "Ovals & blends", family: "Pseudocylindrical, interrupted", prop: "equal", year: "1923 · J. Paul Goode",
      raw: homoRaw, rotate: [0, 0], cut: "anti", fit: { type: "Sphere" }, surface: "oval", carve: true,
      how: "Sinusoidal below 40°44′ and Mollweide above, fused into one. Then the oceans are slit open so each continent gets its own central meridian.",
      trade: "Equal area with good land shapes, but the oceans are torn apart.",
      used: "Atlases, textbooks and global land-cover data.",
      wiki: "https://en.wikipedia.org/wiki/Goode_homolosine_projection" },
    { key: "lambert", name: "Lambert Conformal Conic", group: "Cone", family: "Conic", prop: "conformal", year: "1772 · Johann Lambert",
      raw: lccRaw, rotate: [96, 0], cut: "anti", fit: outline(-30, 90), surface: "cone",
      how: "Set a cone over the globe so it cuts through two standard parallels, here 30° N and 60° N, then unroll the cone into a fan.",
      trade: "True shape everywhere and nearly true scale between the parallels. Far from them, area grows fast and the south pole runs off to infinity.",
      used: "Aeronautical charts and many state plane coordinate zones.",
      wiki: "https://en.wikipedia.org/wiki/Lambert_conformal_conic_projection" },
    { key: "albers", name: "Albers Equal Area", group: "Cone", family: "Conic", prop: "equal", year: "1805 · Heinrich Albers",
      raw: d3.geoConicEqualAreaRaw(29.5 * R, 45.5 * R), rotate: [96, 0], cut: "anti", fit: { type: "Sphere" }, surface: "cone",
      how: "A cone through 29.5° N and 45.5° N, with parallels spaced so area is preserved everywhere.",
      trade: "Shapes bend and stretch away from the standard parallels.",
      used: "USGS and Census Bureau maps of the lower 48 states.",
      wiki: "https://en.wikipedia.org/wiki/Albers_projection" },
    { key: "azeq", name: "Azimuthal Equidistant", group: "Plane", family: "Azimuthal", prop: "equidistant", year: "Ancient; known to al-Bīrūnī by 1000 CE",
      raw: d3.geoAzimuthalEquidistantRaw, rotate: [0, -90], cut: "none", fit: { type: "Sphere" }, surface: "plane",
      how: "Lay a flat plane on the North Pole and peel the globe back onto it like an orange skin. Every point keeps its true distance and direction from the center.",
      trade: "Only distances from the center are right. The far side of the world smears into a ring.",
      used: "The UN emblem, radio and seismic range maps, and flight-distance maps from one city.",
      wiki: "https://en.wikipedia.org/wiki/Azimuthal_equidistant_projection" }
  ];
  const byKey = Object.fromEntries(PROJ.map(p => [p.key, p]));
  const PROP_NAME = { conformal: "Conformal", equal: "Equal-area", compromise: "Compromise", equidistant: "Equidistant" };
  const SURFACE_VERB = { cylinder: "Unrolling onto a cylinder", oval: "Stretching into an oval", cone: "Unrolling onto a cone", plane: "Peeling onto a flat plane" };

  /* ---------- Projection select + detail ---------- */
  const projSel = document.getElementById("projSel");
  const selDot = document.getElementById("selDot");
  const groups = [...new Set(PROJ.map(p => p.group))];
  projSel.innerHTML = groups.map(g => `<optgroup label="${g}">${PROJ.filter(p => p.group === g).map(p => `<option value="${p.key}">${p.name}</option>`).join("")}</optgroup>`).join("");
  document.getElementById("legend").innerHTML = Object.entries(PROP_NAME).map(([k, v]) => `<span class="p-${k}"><span class="dot"></span>${v}</span>`).join("");

  const detail = document.getElementById("detail");
  function renderDetail(p) {
    detail.innerHTML = `
      <h2>${p.name}</h2>
      <div class="meta"><span class="tag p-${p.prop}">${PROP_NAME[p.prop]}</span><span>${p.family}</span><span>·</span><span>${p.year}</span></div>
      <dl class="facts">
        <div><dt>How it's made</dt><dd>${p.how}</dd></div>
        <div><dt>The trade-off</dt><dd>${p.trade}</dd></div>
        <div><dt>Where you'll see it</dt><dd>${p.used}</dd></div>
      </dl>
      <a href="${p.wiki}" target="_blank" rel="noopener">Read more on Wikipedia ↗</a>`;
    projSel.value = p.key;
    selDot.className = "dot p-" + p.prop;
    document.getElementById("hudName").textContent = p.name;
    document.getElementById("endLabel").textContent = p.carve ? "Interrupted map" : "Map";
    cells.forEach(c => c.el.classList.toggle("active", c.p === p));
  }

  /* ---------- Canvas + theme ---------- */
  const canvas = document.getElementById("map");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    for (const k of ["ocean", "land", "grat", "accent", "africa", "tissot", "ink", "muted", "shade", "surface"]) colors[k] = cs.getPropertyValue("--" + k).trim();
    dirty = true;
  }
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);
  new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

  let fitCache = {};
  function resize() {
    const r = canvas.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    dirty = true;
  }
  new ResizeObserver(resize).observe(canvas);

  /* ---------- Fitting each endpoint into pixel space ---------- */
  function fitInfo(raw, rotate, preclip, extent, obj) {
    const p = d3.geoProjection(raw).rotate(rotate).preclip(preclip).fitExtent(extent, obj);
    // d3 recenters on raw(0, 0), so subtract it to get true screen coordinates
    const k = p.scale(), [tx, ty] = p.translate(), c = raw(0, 0);
    return (l, ph) => { const o = raw(l, ph); return [tx + k * (o[0] - c[0]), ty - k * (o[1] - c[1])]; };
  }
  // `top` reserves room for the HUD title in the single view; the grid uses 0
  function getFits(p, w, h, top) {
    const id = `${p.key}|${w}|${h}|${top}`;
    if (fitCache[id]) return fitCache[id];
    const pad = Math.max(6, Math.min(w, h) * 0.04);
    const mapExt = [[pad, pad + top], [w - pad, h - pad]];
    const g = Math.min(w - 2 * pad, h - 2 * pad - top) * 0.96;
    const cx = w / 2, cy = (h + top) / 2;
    const globeExt = [[cx - g / 2, cy - g / 2], [cx + g / 2, cy + g / 2]];
    const endClip = p.cut === "anti" ? d3.geoClipAntimeridian : d3.geoClipCircle((180 - 1e-3) * R);
    const f = {
      globe: fitInfo(d3.geoOrthographicRaw, p.rotate, d3.geoClipCircle(Math.PI / 2), globeExt, { type: "Sphere" }),
      map: fitInfo(p.raw, p.rotate, endClip, mapExt, p.fit)
    };
    if (p.carve) f.carve = fitInfo(interruptedRaw, p.rotate, getGoodeClip(), mapExt, { type: "Sphere" });
    return (fitCache[id] = f);
  }
  const hudTop = () => Math.min(56, H * 0.1) * 0.6;

  /* ---------- State ---------- */
  let cur = byKey.mercator;
  let u = 0;                 // 0 = globe, 1 = finished map
  let rot = [-20, -18, 0];   // current globe rotation (single view)
  let dirty = true;
  let spinning = !reduceMotion;
  let dragging = false;
  let busy = false;          // a scripted transition is running
  let view = "single";
  const CARVE_AT = 0.68;

  function splitU(p, v) {
    if (!p.carve) return { peel: v, carve: 0 };
    return { peel: Math.min(1, v / CARVE_AT), carve: Math.max(0, (v - CARVE_AT) / (1 - CARVE_AT)) };
  }

  function buildProjection(p, v, r, w, h, top) {
    const f = getFits(p, w, h, top);
    const { peel, carve } = splitU(p, v);
    let A, B, t, preclip;
    if (carve > 0) {
      A = f.map; B = f.carve; t = carve; preclip = getGoodeClip();
    } else {
      A = f.globe; B = f.map; t = peel;
      const circle = d3.geoClipCircle((90 + (90 - 1e-3) * t) * R);
      preclip = p.cut === "anti" ? (s => circle(d3.geoClipAntimeridian(s))) : circle;
    }
    const raw = (l, ph) => {
      const a = A(l, ph), b = B(l, ph);
      return [a[0] + (b[0] - a[0]) * t, -(a[1] + (b[1] - a[1]) * t)];
    };
    const c = raw(0, 0);
    return d3.geoProjection(raw).scale(1).translate([c[0], -c[1]]).rotate(r)
      .preclip(preclip).clipExtent([[-4, -4], [w + 4, h + 4]]).precision(0.6);
  }

  /* ---------- Layers ---------- */
  const graticule = d3.geoGraticule().step([15, 15])();
  const tissot = { type: "GeometryCollection", geometries: [] };
  function tissotCenters() { const out = []; for (let lat = -60; lat <= 60; lat += 30) for (let lon = -165; lon < 180; lon += 30) out.push([lon, lat]); return out; }
  tissotCenters().forEach(c => tissot.geometries.push(d3.geoCircle().center(c).radius(4.5).precision(4)()));
  const lyr = { grat: true, tissot: true, size: true };
  const SPHERE = { type: "Sphere" };
  const TRUE_RATIO = d3.geoArea(GEO.africa) / d3.geoArea(GEO.greenland);

  function draw() {
    const p = cur;
    const proj = buildProjection(p, u, rot, W, H, hudTop());
    const path = d3.geoPath(proj, ctx);
    const { peel } = splitU(p, u);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    ctx.beginPath(); path(SPHERE); ctx.fillStyle = colors.ocean; ctx.fill();

    if (lyr.grat) {
      ctx.beginPath(); path(graticule);
      ctx.strokeStyle = colors.grat; ctx.lineWidth = 0.8; ctx.stroke();
    }
    ctx.beginPath(); path(GEO.land); ctx.fillStyle = colors.land; ctx.fill();

    if (lyr.size) {
      ctx.beginPath(); path(GEO.africa); ctx.fillStyle = colors.africa; ctx.fill();
      ctx.beginPath(); path(GEO.greenland); ctx.fillStyle = colors.accent; ctx.fill();
    }
    if (lyr.tissot) {
      ctx.beginPath(); path(tissot);
      ctx.globalAlpha = 0.55; ctx.fillStyle = colors.tissot; ctx.fill();
      ctx.globalAlpha = 1; ctx.strokeStyle = colors.tissot; ctx.lineWidth = 0.8; ctx.stroke();
    }

    // A soft highlight while it is still a sphere
    if (peel < 1) {
      const f = getFits(p, W, H, hudTop());
      const c = f.globe(0, 0), edge = f.globe(Math.PI / 2 - 1e-6, 0);
      const r = Math.abs(edge[0] - c[0]);
      const gx = W / 2 - r * 0.35, gy = (c[1]) - r * 0.4;
      const grad = ctx.createRadialGradient(gx, gy, r * 0.05, W / 2, c[1], r * 1.1);
      grad.addColorStop(0, colors.shade); grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.save(); ctx.beginPath(); path(SPHERE); ctx.clip();
      ctx.globalAlpha = Math.pow(1 - peel, 1.5); ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    // Outline only at rest; mid-morph the cut edges would draw as stray lines
    const settled = peel <= 0.001 || peel >= 0.999;
    if (settled) {
      ctx.beginPath(); path(SPHERE);
      ctx.strokeStyle = colors.ink; ctx.globalAlpha = 0.55; ctx.lineWidth = 1; ctx.stroke(); ctx.globalAlpha = 1;
    }

    updateReadout(proj);
    updatePhase();
  }

  /* ---------- Grid of all nine ---------- */
  const GW = 480, GH = 300;
  const NS = "http://www.w3.org/2000/svg";
  const COUNTRIES = topojson.feature(WORLD, WORLD.objects.countries).features;
  const isAfrica = COUNTRIES.map(c => d3.geoContains(GEO.africa, d3.geoCentroid(c)));
  // Lighter stand-ins (every third vertex, coarser circles) used only while the grid is morphing
  const thin = geo => {
    const ring = r => r.length < 13 ? r : [...r.filter((pt, i) => i % 3 === 0), r[r.length - 1]];
    const poly = p => p.map(ring);
    const g = geo.geometry || geo;
    return { type: g.type, coordinates: g.type === "Polygon" ? poly(g.coordinates) : g.coordinates.map(poly) };
  };
  const LITE = {
    land: { type: "GeometryCollection", geometries: GEO.land.features.map(thin) },
    africa: thin(GEO.africa), greenland: thin(GEO.greenland),
    grat: d3.geoGraticule().step([15, 15]).precision(7.5)(),
    tissot: { type: "GeometryCollection", geometries: tissotCenters().map(c => d3.geoCircle().center(c).radius(4.5).precision(15)()) }
  };
  const gridview = document.getElementById("gridview");
  const gridEl = document.getElementById("grid");
  const hoverName = document.getElementById("hoverName");
  const gridPhase = document.getElementById("gridPhase");
  const byCountry = COUNTRIES.map(() => []);   // country index -> its <path> in every cell
  const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute("class", cls); parent.appendChild(e); return e; };

  const cells = PROJ.map(p => {
    const el = document.createElement("div");
    el.className = "cell";
    el.tabIndex = 0;
    el.setAttribute("role", "button");
    el.setAttribute("aria-label", `${p.name}: open in single view`);
    el.innerHTML = `<div class="cell-head p-${p.prop}"><span class="dot"></span>${p.name}</div>`;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${GW} ${GH}`);
    el.appendChild(svg);
    const sph = mk("path", "sph", svg), grat = mk("path", "grat", svg);
    // While morphing, one merged land shape stands in for the 177 country paths
    const moving = mk("g", null, svg);
    const land = mk("path", "c", moving), af = mk("path", "c af", moving), gl = mk("path", "c gl", moving);
    const g = mk("g", null, svg);
    const cs = COUNTRIES.map((c, i) => {
      const pe = mk("path", "c" + (isAfrica[i] ? " af" : "") + (c.properties.name === "Greenland" ? " gl" : ""), g);
      pe.dataset.i = i;
      byCountry[i].push(pe);
      return pe;
    });
    const tis = mk("path", "tis", svg), out = mk("path", "out", svg);
    gridEl.appendChild(el);
    return { p, el, sph, grat, cs, tis, out, moving, land, af, gl, g, cache: {}, shown: null };
  });

  function drawGrid() {
    // Country paths only change between the two rest states, so cache them there
    const rest = u <= 0.001 ? "globe" : u >= 0.999 ? "map" : null;
    for (const c of cells) {
      const proj = buildProjection(c.p, u, c.p.rotate, GW, GH, 0);
      if (!rest) proj.precision(2);
      const path = d3.geoPath(proj).digits(1);
      const { peel } = splitU(c.p, u);
      c.sph.setAttribute("d", path(SPHERE) || "");
      c.grat.setAttribute("d", lyr.grat ? path(rest ? graticule : LITE.grat) || "" : "");
      if (rest) {
        if (c.shown !== rest) {
          const ds = c.cache[rest] ??= COUNTRIES.map(f => path(f) || "");
          c.cs.forEach((pe, i) => pe.setAttribute("d", ds[i]));
          c.shown = rest;
        }
        c.g.style.display = ""; c.moving.style.display = "none";
      } else {
        c.land.setAttribute("d", path(LITE.land) || "");
        c.af.setAttribute("d", lyr.size ? path(LITE.africa) || "" : "");
        c.gl.setAttribute("d", lyr.size ? path(LITE.greenland) || "" : "");
        c.g.style.display = "none"; c.moving.style.display = "";
      }
      c.tis.setAttribute("d", lyr.tissot ? path(rest ? tissot : LITE.tissot) || "" : "");
      c.out.setAttribute("d", peel <= 0.001 || peel >= 0.999 ? path(SPHERE) || "" : "");
    }
    updateReadout(buildProjection(cur, u, cur.rotate, GW, GH, 0), rest ? 0.1 : 1);
    updatePhase();
  }

  let hovered = -1;
  function setHover(i) {
    if (i === hovered) return;
    if (hovered >= 0) byCountry[hovered].forEach(pe => pe.classList.remove("hl"));
    hovered = i;
    setSubject(i);
    if (i >= 0) {
      byCountry[i].forEach(pe => { pe.classList.add("hl"); pe.parentNode.appendChild(pe); });
      hoverName.textContent = COUNTRIES[i].properties.name;
      hoverName.classList.remove("empty");
    } else {
      hoverName.textContent = "Hover a country to find it in every projection";
      hoverName.classList.add("empty");
    }
  }
  gridEl.addEventListener("pointerover", e => {
    const pe = e.target.closest("path.c[data-i]");
    const was = hovered, prevCur = cur;
    setHover(pe ? +pe.dataset.i : -1);
    const cell = e.target.closest(".cell");
    if (cell && !touring) {
      const p = cells.find(c => c.el === cell).p;
      if (p !== cur) { cur = p; renderDetail(cur); }
    }
    if (hovered !== was || cur !== prevCur) refreshGridReadout();
  });
  gridEl.addEventListener("pointerleave", () => { setHover(-1); refreshGridReadout(); });
  const refreshGridReadout = () => { if (view === "grid") updateReadout(buildProjection(cur, u, cur.rotate, GW, GH, 0)); };
  function openSingle(cell) {
    stopTour();
    cur = cells.find(c => c.el === cell).p;
    renderDetail(cur);
    rot = cur.rotate.slice();
    setView("single");
  }
  gridEl.addEventListener("click", e => { const cell = e.target.closest(".cell"); if (cell) openSingle(cell); });
  gridEl.addEventListener("keydown", e => {
    const cell = e.target.closest(".cell");
    if (cell && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openSingle(cell); }
  });

  const stage = document.getElementById("stage");
  const viewSingle = document.getElementById("viewSingle"), viewGrid = document.getElementById("viewGrid");
  function setView(v) {
    view = v;
    stage.hidden = v !== "single";
    gridview.hidden = v !== "grid";
    viewSingle.setAttribute("aria-pressed", String(v === "single"));
    viewGrid.setAttribute("aria-pressed", String(v === "grid"));
    tourBtn.textContent = touring ? "Stop tour" : (v === "grid" ? "Tour the details" : "Tour all nine");
    setHover(-1);
    dirty = true;
  }

  /* ---------- Size readout: Greenland by default, or the hovered country ---------- */
  const barTrue = document.getElementById("barTrue"), barMap = document.getElementById("barMap");
  const valTrue = document.getElementById("valTrue"), valMap = document.getElementById("valMap");
  const readNote = document.getElementById("readNote"), readoutEl = document.getElementById("readout");
  const subjTitle = document.getElementById("subjTitle"), subjKey = document.getElementById("subjKey");
  const AFRICA_AREA = d3.geoArea(GEO.africa);
  const GREENLAND = { name: "Greenland", geo: GEO.greenland, ratio: TRUE_RATIO };
  let subject = GREENLAND;
  const fmt = r => r < 10 ? r.toFixed(2) : r.toFixed(1);
  // Country : Africa, written so neither side drops below 1
  const pair = r => r >= 1 ? "1 : " + fmt(r) : fmt(1 / r) + " : 1";
  function setSubject(i) {
    if (i >= 0) {
      const f = COUNTRIES[i];
      subject = { name: f.properties.name, geo: f, ratio: AFRICA_AREA / d3.geoArea(f) };
    } else subject = GREENLAND;
    subjTitle.textContent = subjKey.textContent = subject.name;
    readoutEl.classList.toggle("hovering", i >= 0);
    barTrue.style.width = Math.min(100, 100 / subject.ratio).toFixed(2) + "%";
    valTrue.textContent = pair(subject.ratio);
  }
  setSubject(-1);
  function updateReadout(proj, precision = 0.1) {
    proj.precision(precision).clipExtent(null);   // finer sampling so equal-area maps read exactly
    const area = d3.geoPath(proj);
    const { name, geo, ratio: trueRatio } = subject;
    const g = area.area(geo), a = area.area(GEO.africa);
    const vs = trueRatio >= 1 ? `Africa is ${fmt(trueRatio)} times larger than ${name}.` : `${name} is ${fmt(1 / trueRatio)} times larger than Africa.`;
    if (u < 0.02) {
      barMap.style.width = "0%"; valMap.textContent = "—";
      readNote.textContent = `${vs} Unfold a map to see how it treats that ratio.`;
      return;
    }
    if (!(g > 0 && a > 0.5)) { barMap.style.width = "0%"; valMap.textContent = "—"; return; }
    const ratio = a / g;
    barMap.style.width = Math.min(100, 100 / ratio).toFixed(2) + "%";
    valMap.textContent = pair(ratio);
    if (u > 0.98) {
      const off = ratio / trueRatio;
      const big = 1 / off;
      readNote.textContent = (view === "grid" ? cur.name + ": " : "") + (Math.abs(off - 1) < 0.02
        ? `Area is preserved. ${name} draws at its true size relative to Africa.`
        : big > 1
          ? `${name} draws ${big.toFixed(big < 1.1 ? 2 : 1)}× too large relative to Africa.`
          : `${name} draws at ${Math.round(big * 100)}% of its true size relative to Africa.`);
    } else {
      readNote.textContent = `${vs} Watch the bottom bar as the map forms.`;
    }
  }

  const hudPhase = document.getElementById("hudPhase"), hudHint = document.getElementById("hudHint");
  function updatePhase() {
    const { peel, carve } = splitU(cur, u);
    let txt;
    if (u <= 0.001) txt = "Globe";
    else if (carve > 0 && carve < 1) txt = "Carving open the oceans";
    else if (carve >= 1) txt = "Interrupted map";
    else if (peel < 1) txt = SURFACE_VERB[cur.surface];
    else txt = "Flat map";
    hudPhase.textContent = txt;
    gridPhase.textContent = u <= 0.001 ? "Globes" : u >= 0.999 ? "Flat maps" : "Unfolding…";
    hudHint.hidden = u > 0.001;
    playBtn.textContent = u >= 0.999 ? "Fold back" : "Unfold";
    if (!sliderActive) morph.value = Math.round(u * 1000);
  }

  /* ---------- Animation helpers ---------- */
  function tween(ms, fn) {
    return new Promise(res => {
      const t0 = performance.now(), d = Math.max(1, ms * SPEED);
      function step(now) {
        const k = clamp((now - t0) / d, 0, 1);
        fn(ease(k)); dirty = true;
        if (k < 1) requestAnimationFrame(step); else res();
      }
      requestAnimationFrame(step);
    });
  }
  const shortest = (a, b) => { let d = ((b - a) % 360 + 540) % 360 - 180; return a + d; };
  async function rotateTo(target, ms) {
    const from = rot.slice();
    const to = [shortest(from[0], target[0]), target[1], target[2] || 0];
    const dist = Math.hypot(to[0] - from[0], to[1] - from[1]);
    if (dist < 0.5) { rot = to; return; }
    await tween(ms ?? clamp(dist * 9, 500, 1400), k => { rot = from.map((v, i) => v + (to[i] - v) * k); });
  }
  async function setU(target, ms) {
    const from = u;
    if (Math.abs(target - from) < 1e-3) { u = target; dirty = true; return; }
    await tween(ms * Math.abs(target - from), k => { u = from + (target - from) * k; });
  }

  let token = 0;
  async function goTo(key) {
    const my = ++token;
    busy = true;
    if (view === "grid") {
      // All nine are already on screen: just focus this one and make sure they are unfolded
      cur = byKey[key]; renderDetail(cur); rot = cur.rotate.slice(); dirty = true;
      if (u < 0.999) await setU(1, 2000);
      if (my === token) busy = false;
      return;
    }
    if (cur.key !== key && u > 0) await setU(0, 1300);
    if (my !== token) return;
    cur = byKey[key]; renderDetail(cur); dirty = true;
    await rotateTo(cur.rotate);
    if (my !== token) return;
    await setU(1, cur.carve ? 3000 : 2000);
    if (my === token) busy = false;
  }

  /* ---------- Controls ---------- */
  const playBtn = document.getElementById("playBtn");
  const morph = document.getElementById("morph");
  const tourBtn = document.getElementById("tourBtn");
  let sliderActive = false;

  projSel.addEventListener("change", () => { stopTour(); goTo(projSel.value); });
  playBtn.addEventListener("click", async () => {
    stopTour();
    if (u >= 0.999) { const my = ++token; busy = true; await setU(0, 1400); if (my === token) busy = false; }
    else goTo(cur.key);
  });
  morph.addEventListener("pointerdown", () => { sliderActive = true; });
  window.addEventListener("pointerup", () => { sliderActive = false; });
  morph.addEventListener("input", async () => {
    stopTour(); ++token; busy = false;
    const v = morph.value / 1000;
    if (u === 0 && v > 0 && view === "single") {
      // Line the globe up with this projection's center before it opens
      const my = ++token; busy = true;
      await rotateTo(cur.rotate, 450);
      if (my === token) busy = false; else return;
    }
    u = morph.value / 1000; dirty = true;
  });
  morph.addEventListener("change", () => { sliderActive = false; });

  ["Grat", "Tissot", "Size"].forEach(n => {
    const el = document.getElementById("lyr" + n);
    el.addEventListener("change", () => {
      lyr[n.toLowerCase()] = el.checked;
      gridview.classList.toggle("show-size", lyr.size);
      dirty = true;
    });
  });

  viewSingle.addEventListener("click", () => { if (u > 0.001) rot = cur.rotate.slice(); setView("single"); });
  viewGrid.addEventListener("click", () => {
    setView("grid");
    if (u < 0.001 && !touring) { const my = ++token; busy = true; setU(1, 2000).then(() => { if (my === token) busy = false; }); }
  });

  let touring = false;
  function stopTour() { if (touring) { touring = false; tourBtn.setAttribute("aria-pressed", "false"); tourBtn.textContent = view === "grid" ? "Tour the details" : "Tour all nine"; } }
  tourBtn.addEventListener("click", async () => {
    if (touring) { stopTour(); return; }
    touring = true; tourBtn.setAttribute("aria-pressed", "true"); tourBtn.textContent = "Stop tour";
    let i = Math.max(0, PROJ.indexOf(cur));
    if (u >= 0.999) i = (i + 1) % PROJ.length;
    while (touring) {
      await goTo(PROJ[i].key);
      if (!touring) break;
      await new Promise(r => setTimeout(r, (view === "grid" ? 4000 : 2600) * SPEED));
      i = (i + 1) % PROJ.length;
    }
  });

  /* ---------- Drag to spin the globe ---------- */
  let last = null;
  canvas.addEventListener("pointerdown", e => {
    if (u > 0.001 || busy) return;
    dragging = true; last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", e => {
    if (!dragging) return;
    const k = 140 / Math.min(W, H);
    rot = [rot[0] + (e.clientX - last[0]) * k, clamp(rot[1] - (e.clientY - last[1]) * k, -90, 90), rot[2]];
    last = [e.clientX, e.clientY]; dirty = true;
  });
  const endDrag = () => { dragging = false; canvas.classList.remove("dragging"); };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);

  /* ---------- Main loop ---------- */
  let prev = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - prev); prev = now;
    if (view === "single" && spinning && u <= 0.001 && !busy && !dragging && !touring) { rot = [rot[0] + dt * 0.012, rot[1], rot[2]]; dirty = true; }
    if (dirty) {
      if (view === "grid") { dirty = false; drawGrid(); }
      else if (W > 1) { dirty = false; draw(); }
    }
    requestAnimationFrame(frame);
  }

  // test hook
  window.__proj = { set(key, v) { token++; busy = false; cur = byKey[key]; renderDetail(cur); rot = cur.rotate.slice(); u = v; spinning = false; dirty = true; }, view: setView, bench(v) { u = v; const t = performance.now(); drawGrid(); return performance.now() - t; } };

  readColors(); resize(); renderDetail(cur);
  requestAnimationFrame(frame);
})();
