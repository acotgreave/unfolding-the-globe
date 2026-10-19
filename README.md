# Unfolding the Globe

Nine ways to flatten the Earth, for How To Speak Data.

Every flat map is a globe that has been cut, stretched or squeezed. The page
opens on all nine projections side by side. Hover a region and it lights up on
every map, while the chart on the right shows its share of the world's land on
each one against its true share on the globe. Click **Unfold** on any map to
watch the globe turn into it in the single view.

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
data/countries-110m.js     WORLD: Natural Earth 1:110m countries as TopoJSON
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

### Regions

`REGION_MEMBERS` in `src/main.js` sorts every country into ten regions: North
America (with Central America and the Caribbean), Greenland, South America,
Antarctica (with the French Southern Lands), Europe, Africa, Southeast Asia,
Russia, Australasia (with the Pacific islands), and "Middle East to Japan",
which collects every country not named elsewhere. France's shape includes French
Guiana, so that piece is split off into South America.

### The grid

The grid draws all nine finished maps as SVG, one `<path>` per region, so a
hovered region can be highlighted on every map at once. Clicking a region pins
it; the Region dropdown does the same without a mouse.

### The size chart

For the highlighted region, each row is its share of all the land drawn on that
map; the Globe row (`d3.geoArea`) is the true share, repeated as a dashed line.
Equal-area projections land on the line. The row for the projection under the
mouse is marked. Shares are measured once per projection and cached.
