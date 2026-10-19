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

  /* ---------- Regions ---------- */
  // Ten regions that between them cover every country in the dataset
  const REGION_MEMBERS = {
    na: ["Canada", "United States of America", "Mexico", "Guatemala", "Belize", "Honduras", "El Salvador", "Nicaragua", "Costa Rica", "Panama",
      "Cuba", "Bahamas", "Jamaica", "Haiti", "Dominican Rep.", "Puerto Rico", "Trinidad and Tobago"],
    greenland: ["Greenland"],
    sa: ["Colombia", "Venezuela", "Guyana", "Suriname", "Ecuador", "Peru", "Brazil", "Bolivia", "Paraguay", "Chile", "Argentina", "Uruguay", "Falkland Is."],
    antarctica: ["Antarctica", "Fr. S. Antarctic Lands"],
    europe: ["Iceland", "Norway", "Sweden", "Finland", "Denmark", "United Kingdom", "Ireland", "Netherlands", "Belgium", "Luxembourg", "France", "Germany",
      "Switzerland", "Austria", "Italy", "Spain", "Portugal", "Poland", "Czechia", "Slovakia", "Hungary", "Slovenia", "Croatia", "Bosnia and Herz.",
      "Serbia", "Montenegro", "Kosovo", "Albania", "Macedonia", "Greece", "Bulgaria", "Romania", "Moldova", "Ukraine", "Belarus", "Lithuania", "Latvia", "Estonia"],
    africa: ["Morocco", "W. Sahara", "Algeria", "Tunisia", "Libya", "Egypt", "Mauritania", "Mali", "Niger", "Chad", "Sudan", "S. Sudan", "Eritrea", "Djibouti",
      "Ethiopia", "Somalia", "Somaliland", "Senegal", "Gambia", "Guinea-Bissau", "Guinea", "Sierra Leone", "Liberia", "Côte d'Ivoire", "Burkina Faso",
      "Ghana", "Togo", "Benin", "Nigeria", "Cameroon", "Central African Rep.", "Eq. Guinea", "Gabon", "Congo", "Dem. Rep. Congo", "Uganda", "Kenya",
      "Rwanda", "Burundi", "Tanzania", "Angola", "Zambia", "Malawi", "Mozambique", "Zimbabwe", "Botswana", "Namibia", "South Africa", "Lesotho",
      "eSwatini", "Madagascar"],
    sea: ["Myanmar", "Thailand", "Laos", "Cambodia", "Vietnam", "Malaysia", "Brunei", "Indonesia", "Philippines", "Timor-Leste"],
    russia: ["Russia"],
    asia: null,   // everything not named elsewhere: the Middle East, Central, South and East Asia
    australasia: ["Australia", "New Zealand", "Papua New Guinea", "Solomon Is.", "Vanuatu", "New Caledonia", "Fiji"]
  };
  const REGION_NAMES = {
    na: "North America", greenland: "Greenland", sa: "South America", antarctica: "Antarctica", europe: "Europe",
    africa: "Africa", sea: "Southeast Asia", russia: "Russia", asia: "Middle East to Japan", australasia: "Australasia"
  };
  const COUNTRY_GEOMS = WORLD.objects.countries.geometries;
  const regionOf = {};
  for (const [k, names] of Object.entries(REGION_MEMBERS)) if (names) names.forEach(n => regionOf[n] = k);
  const pieces = Object.fromEntries(Object.keys(REGION_MEMBERS).map(k => [k, []]));
  for (const g of COUNTRY_GEOMS) {
    const k = regionOf[g.properties.name] || "asia";
    if (g.properties.name === "France") {
      // France's shape includes French Guiana, which belongs with South America
      for (const arcs of g.arcs) {
        const part = { type: "Polygon", arcs };
        const [lon] = d3.geoCentroid(topojson.feature(WORLD, part));
        pieces[lon < -20 ? "sa" : "europe"].push(part);
      }
    } else pieces[k].push(g);
  }
  const REGIONS = Object.keys(REGION_MEMBERS).map(key => ({ key, name: REGION_NAMES[key], geo: topojson.merge(WORLD, pieces[key]) }));
  const regionByKey = Object.fromEntries(REGIONS.map(r => [r.key, r]));
  const LAND = topojson.merge(WORLD, COUNTRY_GEOMS);
  const BORDERS = topojson.mesh(WORLD, WORLD.objects.countries, (a, b) => a !== b);
  const LAND_AREA = d3.sum(REGIONS, r => d3.geoArea(r.geo));
  REGIONS.forEach(r => r.trueShare = d3.geoArea(r.geo) / LAND_AREA);

  let pinned = regionByKey.greenland;   // the region shown when nothing is hovered
  let hoverRegion = null;
  const subject = () => hoverRegion || pinned;

  /* ---------- Projection select + detail ---------- */
  const projSel = document.getElementById("projSel");
  const selDot = document.getElementById("selDot");
  const groups = [...new Set(PROJ.map(p => p.group))];
  projSel.innerHTML = groups.map(g => `<optgroup label="${g}">${PROJ.filter(p => p.group === g).map(p => `<option value="${p.key}">${p.name}</option>`).join("")}</optgroup>`).join("");
  const regionSel = document.getElementById("regionSel");
  regionSel.innerHTML = REGIONS.map(r => `<option value="${r.key}">${r.name}</option>`).join("");
  regionSel.value = pinned.key;
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
    for (const k of ["ocean", "land", "grat", "hl", "tissot", "ink", "muted", "shade", "surface"]) colors[k] = cs.getPropertyValue("--" + k).trim();
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
  let u = 0;                 // single view: 0 = globe, 1 = finished map (the grid always shows finished maps)
  let rot = [-20, -18, 0];   // current globe rotation (single view)
  let dirty = true;
  let spinning = !reduceMotion;
  let dragging = false;
  let busy = false;          // a scripted transition is running
  let view = "grid";
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
  for (let lat = -60; lat <= 60; lat += 30) for (let lon = -165; lon < 180; lon += 30)
    tissot.geometries.push(d3.geoCircle().center([lon, lat]).radius(4.5).precision(4)());
  const lyr = { grat: true, tissot: true };
  const SPHERE = { type: "Sphere" };

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
    ctx.beginPath(); path(LAND); ctx.fillStyle = colors.land; ctx.fill();
    ctx.beginPath(); path(pinned.geo); ctx.fillStyle = colors.hl; ctx.fill();

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

    updatePhase();
  }

  /* ---------- Grid of all nine ---------- */
  const GW = 480, GH = 300;
  const NS = "http://www.w3.org/2000/svg";
  const gridEl = document.getElementById("grid");
  const gridview = document.getElementById("gridview");
  const hoverName = document.getElementById("hoverName");
  const mk = (tag, cls, parent) => { const e = document.createElementNS(NS, tag); if (cls) e.setAttribute("class", cls); parent.appendChild(e); return e; };

  const cells = PROJ.map(p => {
    const el = document.createElement("div");
    el.className = "cell";
    el.innerHTML = `<div class="cell-head p-${p.prop}"><span class="dot"></span><span class="nm">${p.name}</span>` +
      `<button type="button" class="cell-open" aria-label="Unfold ${p.name} from the globe">Unfold ↗</button></div>`;
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("viewBox", `0 0 ${GW} ${GH}`);
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `World map, ${p.name} projection`);
    el.appendChild(svg);
    const sph = mk("path", "sph", svg), grat = mk("path", "grat", svg);
    const regs = REGIONS.map(r => { const pe = mk("path", "rg", svg); pe.dataset.r = r.key; return pe; });
    const borders = mk("path", "borders", svg), edge = mk("path", "rg-edge", svg);
    const tis = mk("path", "tis", svg), out = mk("path", "out", svg);
    gridEl.appendChild(el);
    return { p, el, sph, grat, regs, borders, edge, tis, out, path: null };
  });

  // Every grid map is a finished map, so its projection never changes once built
  function gridPath(c) {
    return c.path ??= d3.geoPath(buildProjection(c.p, 1, c.p.rotate, GW, GH, 0)).digits(1);
  }
  function drawGrid() {
    for (const c of cells) {
      const path = gridPath(c);
      if (!c.drawn) {
        c.sph.setAttribute("d", path(SPHERE) || "");
        c.regs.forEach((pe, i) => pe.setAttribute("d", path(REGIONS[i].geo) || ""));
        c.borders.setAttribute("d", path(BORDERS) || "");
        c.out.setAttribute("d", path(SPHERE) || "");
        c.drawn = true;
      }
      c.grat.setAttribute("d", lyr.grat ? (c.gratD ??= path(graticule) || "") : "");
      c.tis.setAttribute("d", lyr.tissot ? (c.tisD ??= path(tissot) || "") : "");
    }
    paintSubject();
  }
  function paintSubject() {
    const s = subject();
    for (const c of cells) {
      c.regs.forEach(pe => pe.classList.toggle("hl", pe.dataset.r === s.key));
      c.edge.setAttribute("d", c.regs.find(pe => pe.dataset.r === s.key).getAttribute("d") || "");
    }
    hoverName.textContent = s.name;
    hoverName.classList.toggle("pinned", !hoverRegion);
  }

  gridEl.addEventListener("pointerover", e => {
    const pe = e.target.closest("path.rg");
    const r = pe ? regionByKey[pe.dataset.r] : null;
    const cell = e.target.closest(".cell");
    if (cell) { const p = cells.find(c => c.el === cell).p; if (p !== cur) { cur = p; renderDetail(cur); } }
    if (r !== hoverRegion) { hoverRegion = r; paintSubject(); }
    renderChart();
  });
  gridEl.addEventListener("pointerleave", () => { hoverRegion = null; paintSubject(); renderChart(); });
  gridEl.addEventListener("click", e => {
    const open = e.target.closest(".cell-open");
    if (open) { openSingle(cells.find(c => c.el === open.closest(".cell")).p); return; }
    const pe = e.target.closest("path.rg");
    if (pe) pinRegion(pe.dataset.r);
  });
  function pinRegion(key) {
    pinned = regionByKey[key]; regionSel.value = key;
    hoverRegion = null; paintSubject(); renderChart(); dirty = true;
  }
  regionSel.addEventListener("change", () => pinRegion(regionSel.value));

  function openSingle(p) {
    stopTour();
    setView("single");
    if (p !== cur || u > 0.001) { u = 0; cur = p; renderDetail(cur); }
    goTo(p.key);
  }

  const stage = document.getElementById("stage");
  const toolbar = document.getElementById("toolbar");
  const viewSingle = document.getElementById("viewSingle"), viewGrid = document.getElementById("viewGrid");
  function setView(v) {
    if (v === "grid") stopTour();
    view = v;
    toolbar.dataset.view = v;
    stage.hidden = v !== "single";
    gridview.hidden = v !== "grid";
    viewSingle.setAttribute("aria-pressed", String(v === "single"));
    viewGrid.setAttribute("aria-pressed", String(v === "grid"));
    hoverRegion = null;
    if (v === "grid") paintSubject();
    renderChart();
    dirty = true;
  }

  /* ---------- Size chart: every projection's share of land for one region ---------- */
  const rowsEl = document.getElementById("rows");
  const subjTitle = document.getElementById("subjTitle");
  const callout = document.getElementById("callout");
  const ROWS = [{ key: "globe", name: "Globe (true size)" }, ...PROJ];
  rowsEl.innerHTML = ROWS.map(r => `
    <div class="row${r.key === "globe" ? " globe" : ""}" data-key="${r.key}">
      <span class="nm">${r.prop ? `<span class="dot p-${r.prop}"></span>` : ""}${r.name}</span>
      <span class="trk"><span class="bar"></span><span class="ref"></span></span>
      <span class="val"></span>
    </div>`).join("");
  const rowEls = Object.fromEntries([...rowsEl.children].map(el => [el.dataset.key, el]));

  // Projected area of every region on each finished map, measured once per projection
  const shareCache = {};
  function shares(p) {
    if (shareCache[p.key]) return shareCache[p.key];
    const proj = buildProjection(p, 1, p.rotate, GW, GH, 0).precision(0.2).clipExtent(null);
    const path = d3.geoPath(proj);
    const areas = REGIONS.map(r => path.area(r.geo));
    const total = d3.sum(areas);
    return (shareCache[p.key] = Object.fromEntries(REGIONS.map((r, i) => [r.key, areas[i] / total])));
  }
  const pct = v => v >= 0.1 ? (v * 100).toFixed(0) + "%" : v >= 0.01 ? (v * 100).toFixed(1) + "%" : (v * 100).toFixed(2) + "%";
  const times = x => "×" + (x >= 10 ? x.toFixed(0) : x.toFixed(2));

  function indicated() {
    if (view === "grid") return cur.key;
    if (u <= 0.001) return "globe";
    return u >= 0.999 ? cur.key : null;
  }
  let lastChart = "";
  function renderChart() {
    const s = subject(), on = indicated();
    const sig = `${s.key}|${on}|${view}`;
    if (sig === lastChart) return;
    lastChart = sig;
    subjTitle.textContent = s.name;
    const vals = { globe: s.trueShare };
    PROJ.forEach(p => vals[p.key] = shares(p)[s.key]);
    const max = Math.max(...Object.values(vals));
    for (const r of ROWS) {
      const el = rowEls[r.key], v = vals[r.key];
      el.querySelector(".bar").style.width = (100 * v / max).toFixed(2) + "%";
      el.querySelector(".ref").style.left = (100 * s.trueShare / max).toFixed(2) + "%";
      el.querySelector(".val").textContent = r.key === "globe" ? pct(v) : times(v / s.trueShare);
      el.title = r.key === "globe"
        ? `${s.name} is ${pct(v)} of the world's land`
        : `${r.name}: ${pct(v)} of the land on the map, ${times(v / s.trueShare)} its true share`;
      el.classList.toggle("on", r.key === on);
    }
    if (on === "globe") {
      callout.innerHTML = `On the globe, <b>${s.name}</b> is <b>${pct(s.trueShare)}</b> of the world's land.`;
    } else if (on) {
      const p = byKey[on], x = vals[on] / s.trueShare;
      callout.innerHTML = Math.abs(x - 1) < 0.02
        ? `<b>${p.name}</b> draws ${s.name} at its true size.`
        : x > 1
          ? `<b>${p.name}</b> draws ${s.name} <b>${times(x).slice(1)}×</b> too big.`
          : `<b>${p.name}</b> draws ${s.name} at <b>${Math.round(x * 100)}%</b> of its true size.`;
    } else {
      callout.textContent = "Unfolding…";
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
    hudHint.hidden = u > 0.001;
    playBtn.textContent = u >= 0.999 ? "Fold back" : "Unfold";
    if (!sliderActive) morph.value = Math.round(u * 1000);
    renderChart();
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
    if (u === 0 && v > 0) {
      // Line the globe up with this projection's center before it opens
      const my = ++token; busy = true;
      await rotateTo(cur.rotate, 450);
      if (my === token) busy = false; else return;
    }
    u = morph.value / 1000; dirty = true;
  });
  morph.addEventListener("change", () => { sliderActive = false; });

  ["Grat", "Tissot"].forEach(n => {
    const el = document.getElementById("lyr" + n);
    el.addEventListener("change", () => { lyr[n.toLowerCase()] = el.checked; dirty = true; });
  });

  viewGrid.addEventListener("click", () => setView("grid"));
  viewSingle.addEventListener("click", () => { if (u > 0.001) rot = cur.rotate.slice(); setView("single"); });

  let touring = false;
  function stopTour() { if (touring) { touring = false; tourBtn.setAttribute("aria-pressed", "false"); tourBtn.textContent = "Tour all nine"; } }
  tourBtn.addEventListener("click", async () => {
    if (touring) { stopTour(); return; }
    touring = true; tourBtn.setAttribute("aria-pressed", "true"); tourBtn.textContent = "Stop tour";
    let i = Math.max(0, PROJ.indexOf(cur));
    if (u >= 0.999) i = (i + 1) % PROJ.length;
    while (touring) {
      await goTo(PROJ[i].key);
      if (!touring) break;
      await new Promise(r => setTimeout(r, 2600 * SPEED));
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
  window.__proj = {
    set(key, v) { token++; busy = false; cur = byKey[key]; renderDetail(cur); rot = cur.rotate.slice(); u = v; spinning = false; dirty = true; },
    view: setView, pin: pinRegion,
    shares: () => Object.fromEntries(REGIONS.map(r => [r.key, { true: r.trueShare, ...Object.fromEntries(PROJ.map(p => [p.key, shares(p)[r.key]])) }])),
    regions: () => Object.fromEntries(Object.entries(pieces).map(([k, v]) => [k, v.map(g => g.properties ? g.properties.name : "France (part)")]))
  };

  readColors(); resize(); renderDetail(cur); setView("grid");
  requestAnimationFrame(frame);
})();
