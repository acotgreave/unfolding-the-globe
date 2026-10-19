# Unfolding the Globe

Nine ways to flatten the Earth, for How To Speak Data.

Every flat map is a globe that has been cut, stretched or squeezed. Pick a
projection and watch the sphere unfold into it, drag the slider to stop
halfway, or switch to **Show grid** to see all nine side by side. Hover a
country in the grid and it lights up in every projection, and the size test
on the right reports how each map treats it.

## Running it

**Double-click `run.bat`.** It starts a local server and opens your browser at
http://localhost:8080. Close the window to stop it. If port 8080 is busy, pass
another one: `run.bat 3000`.

You can also just open `index.html` directly. There is nothing to install and
no build step; Node.js is only needed for `run.bat` / `npm start`.

```bash
npm start
```

Any static host works for deployment — copy everything except `tools/`.

## How it's put together

```
index.html                 page markup: toolbar, map stage, grid, info panel
app.css                    styles, with light and dark themes as CSS variables
src/main.js                projections, the globe-to-map morph, grid view and readout
data/land.js               GEO: land, Africa and Greenland outlines (single view, size test)
data/countries-110m.js     WORLD: Natural Earth 1:110m countries as TopoJSON (grid view)
tools/serve.mjs            zero-dependency static server used by run.bat
```

Libraries load from CDNs: d3 7.9.0, d3-geo-projection 4.0.0, d3-geo-polygon
2.0.1 and topojson-client 3.1.0.

### The projections

The nine projections are defined in the `PROJ` array in `src/main.js`. Each
entry carries its d3 raw projection, centre rotation, fit outline and the copy
shown in the info panel (`how`, `trade`, `used`, `wiki`).

### The morph

Each frame blends two fitted projections point by point: an orthographic globe
and the finished map (`buildProjection`). The clip circle widens from 90° to
180° as the blend runs, so the far side of the globe peels open. Goode
Homolosine has a second stage that blends the uninterrupted map into the
interrupted one.

### The grid

The grid draws all nine as SVG, with one `<path>` per country so hover can
highlight the same country in every cell. While the grid is morphing it swaps
in a thinned land outline (`LITE`) to keep the frame rate up; the per-country
paths are cached once the maps come to rest.

### The size test

Greenland against Africa by default, or whichever country is hovered in the
grid. It compares the true area ratio on the sphere (`d3.geoArea`) with the
projected area ratio on the current map.
