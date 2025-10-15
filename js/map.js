let selectedFeature = null;

// Module-level references for theme switching
let _map = null;
let _maplibreLayer = null;
let _rasterBaseLayer = null;
let _hillshadeLayer = null;
let _labelsLayer = null;
let _useMaplibre = false;
let _lightStylePath = './data/style-light.json';
let _darkStylePath = './data/style-dark.json';

export function clearHighlight() {
  if (selectedFeature) {
    selectedFeature.setStyle({ color: '#38bdf8', weight: 1.5 });
    selectedFeature = null;
  }
}

function normalize(str) {
  return str
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // Remove other diacritics
}

export function setupMap(onSelect) {
  fetch('./data/alpineconvention_lightweight.geojson')
    .then(r => r.json())
    .then(geo => {

      // Compute bounds from GeoJSON
      const alpsLayer = L.geoJSON(geo);
      const bounds = alpsLayer.getBounds();

      // Create map centered and limited to alpine convention bounds
      const map = L.map('map', {
        zoomControl: true,
        maxBounds: bounds,           // restrict panning/zoom
        maxBoundsViscosity: 1.0,     // prevent moving outside
        maxZoom: 15,
        minZoom: 7
      }).fitBounds(bounds);
      window.map = map;
      _map = map;

      // Add perimeter layer
      map.createPane('alps');
      map.getPane('alps').style.zIndex = 450;
      alpsLayer.setStyle({
        pane: 'alps',
        interactive: false,
        color: '#f87171',
        weight: 3,
        dashArray: '8,6',
        fill: false,
        opacity: 0.7
      }).addTo(map);
      window.__alpsLayer = alpsLayer;

      // Add tile layer (provider selection: MapLibre -> Mapbox -> CSS variable tiles)
      map.createPane('base');
      map.getPane('base').style.zIndex = 300;

  // Prefer explicit window config for Mapbox (set in index.html) if provided
  const useMaplibre = !!window.USE_MAPLIBRE;
  _useMaplibre = useMaplibre;

      // If the page requested MapLibre (vector style via maplibre-gl-leaflet), use it first
      if (useMaplibre) {
        if (typeof L.maplibreGL === 'undefined') {
          // eslint-disable-next-line no-console
          console.warn('MapLibre GL plugin not available; falling back to raster tiles.');
        } else {
          // Prefer a local style at ./data/style.json when present (works well for local testing or GitHub Pages)
          const lightStyle = './data/style-light.json';
          const darkStyle = './data/style-dark.json';
          // const remoteStyle = window.MAPLIBRE_STYLE || 'https://tiles.openfreemap.org/styles/liberty.json';
          // Try local first; MapLibre will fetch it via HTTP. If it 404s, the console will show the error and developer can set MAPLIBRE_STYLE.
          const maplibreStyle = lightStyle;
          _maplibreLayer = L.maplibreGL({ style: maplibreStyle, pane: 'base', interactive: false }).addTo(map);
          window.maplibreLayer = _maplibreLayer;
        }
      } else {
        // Fallback to CSS variable tile source (existing behavior)
        const mapTileUrl = getComputedStyle(document.body).getPropertyValue('--map-tile').replace(/['"]/g, '');
        _rasterBaseLayer = L.tileLayer(mapTileUrl, {
          pane: 'base',
          interactive: false,
          maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        window.rasterBaseLayer = _rasterBaseLayer;
      }

      // Add ESRI World Hillshade tile layer and labels
      if (!useMaplibre) {
        map.createPane('hillshade');
        map.getPane('hillshade').style.zIndex = 400;
        _hillshadeLayer = L.tileLayer('https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', {
          pane: 'hillshade',
          interactive: false,
          attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA',
          maxZoom: 16,
          opacity: 0.6
        }).addTo(map);
        window.hillshade = _hillshadeLayer;

        // Add labels-only layer (above base and hillshade)
        map.createPane('labels');
        map.getPane('labels').style.zIndex = 600;
        const labelTileUrl = getComputedStyle(document.body).getPropertyValue('--label-tile').replace(/['"]/g, '');
        _labelsLayer = L.tileLayer(labelTileUrl, {
          pane: 'labels',
          interactive: false,
          maxZoom: 19,
          attribution: ''
        }).addTo(map);

        // Add country borders layer (as lines)
        map.createPane('countries');
        map.getPane('countries').style.zIndex = 460;
        fetch('./data/countries_lightweight.geojson')
          .then(r => r.json())
          .then(geo => {
            L.geoJSON(geo, {
              pane: 'countries',
              interactive: false,
              style: {
                color: '#6d6d6dff',
                weight: 1.5,
                fillOpacity: 0,
                opacity: 0.5
              }
            }).addTo(map);
          })
          .catch(err => {
            console.error('Failed to load countries.json', err);
          });
      }

      // Add lakes layer after perimeter
      map.createPane('lakes');
      map.getPane('lakes').style.zIndex = 500;
      const lakesUrl = './data/euhydro_lightweight.geojson';
      fetch(lakesUrl)
        .then(r => r.json())
        .then(geo => {
          const lakesLayer = L.geoJSON(geo, {
            pane: 'lakes',
            style: f => ({ color: '#38bdf8', weight: 3.0, fillColor: '#38bdf8', fillOpacity: 0.75 }),
            onEachFeature: (feature, layer) => {
              layer.on('mouseover', () => {
                layer.setStyle({ color: '#facc15', weight: 4, fillOpacity: 1 });
              });
              layer.on('mouseout', () => {
                // Only reset style if this layer is NOT the selected feature
                if (selectedFeature !== layer) {
                  layer.setStyle({ color: '#38bdf8', weight: 3, fillOpacity: 0.75 });
                }
              });
              layer.on('click', () => {
                clearHighlight();
                layer.setStyle({ color: '#facc15', weight: 4 });
                selectedFeature = layer;
                const bounds = layer.getBounds();

                // Center the lake
                // map.fitBounds(bounds, { maxZoom: 13 });
                // Center with offset to account for side panel
                const lakeCenter = bounds.getCenter(); // Get the bounds and center of the selected lake
                const zoom = Math.min(map.getBoundsZoom(bounds), 13); // Zoom level
                // Calculate offset in pixels
                const panel = document.querySelector('.panel');
                const panelWidth = panel ? panel.offsetWidth : 0;
                const mapWidth = map.getSize().x;
                const offsetX = panelWidth / 2;
                const point = map.project(lakeCenter, zoom); // Project lake center to pixel coordinates at desired zoom
                const newPoint = L.point(point.x + offsetX, point.y); // Offset the point to the left by half the panel width
                const newCenter = map.unproject(newPoint, zoom); // Reproject back to LatLng
                map.setView(newCenter, zoom, { animate: true }); // Set the map view to the new center and zoom

                // Open side panel and update URL
                selectLake(feature.properties.OBJECT_ID, layer, feature.properties);
              });
              layer.bindTooltip(feature.properties.NAM, { sticky: true, direction: 'top' });
            }
          }).addTo(map);
          window.lakesLayer = lakesLayer;

          // Deep-link support ?lake_id=XXX
          const params = new URLSearchParams(location.search);
          const deepId = params.get('lake_id');
          if (deepId) {
            // Find the matching feature and layer
            lakesLayer.eachLayer(layer => {
              const props = layer.feature.properties;
              if (props.OBJECT_ID === deepId) {
                // Highlight and select this lake
                layer.fire('click');
              }
            });
          }
        }).catch(err => {
          console.error('Failed to load euhydro_lightweight.geojson', err);
          alert('Could not load lakes layer. Place your GeoJSON at ' + lakesUrl);
        });

      // Add legend
      const legend = L.control({ position: 'topright' });
      legend.onAdd = function (map) {
        const div = L.DomUtil.create('div', 'leaflet-control legend');
        div.innerHTML = `
            <span class="legend-line"></span>
            <span style="margin-left:8px;">European Alps</span>
          `;
        return div;
      };
      legend.addTo(map);

      // Add lake search
      fetch('./data/euhydro_lut.json')
        .then(r => r.json())
        .then(data => {
          const input = document.getElementById('lakeSearch');
          input.awesomplete = new Awesomplete(input, {
            list: data.map(lake => `${lake.NAM_OSM} (${lake.OBJECT_ID})`),
            filter: function (text, input) {
              return normalize(text).includes(normalize(input));
            }
          });

          input.addEventListener('awesomplete-selectcomplete', function (e) {
            // Extract OBJECT_ID from the selected value
            const match = /\(([^)]+)\)$/.exec(e.text.value);
            const objectId = match ? match[1] : null;
            if (objectId) {
              window.lakesLayer.eachLayer(layer => {
                if (layer.feature && layer.feature.properties.OBJECT_ID === objectId) {
                  layer.fire('click');
                }
              });
            }
            input.value = '';
          });
        });

      async function selectLake(lakeId, layer = null, meta = null) {
        history.replaceState(null, '', `?lake_id=${encodeURIComponent(lakeId)}`);
        if (layer) { layer.bringToFront(); }
        onSelect(meta);
      }

      // Close panel by clicking empty map
      map.on('click', (e) => {
        if (!e.originalEvent.target.closest('.leaflet-interactive')) {
          clearHighlight();
          onSelect(null, { close: true });
        }
      });

      return { map };
    });

}

// Exported helper to set map theme (light|dark) without changing view
export function setMapTheme(theme = 'light') {
  if (!_map) return;
  const isLight = theme === 'light';

  if (_useMaplibre) {
    // swap maplibre style by removing and re-adding layer (preserve view)
    try { if (_maplibreLayer) _map.removeLayer(_maplibreLayer); } catch (e) {}
    const stylePath = isLight ? _lightStylePath : _darkStylePath;
    if (typeof L.maplibreGL !== 'undefined') {
      _maplibreLayer = L.maplibreGL({ style: stylePath, pane: 'base', interactive: false }).addTo(_map);
      window.maplibreLayer = _maplibreLayer;
    }
  } else {
    // Raster: replace base tile layer (reads CSS var for tile URL)
    try { if (_rasterBaseLayer) _map.removeLayer(_rasterBaseLayer); } catch (e) {}
    const mapTileUrl = getComputedStyle(document.body).getPropertyValue('--map-tile').replace(/['"]/g, '');
    _rasterBaseLayer = L.tileLayer(mapTileUrl, { pane: 'base', interactive: false, maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).addTo(_map);
    window.rasterBaseLayer = _rasterBaseLayer;
  }

  // adjust hillshade filter for dark mode
  try {
    const pane = _map.getPane('hillshade');
    if (pane) pane.style.filter = isLight ? '' : 'brightness(0.45) contrast(1.15)';
  } catch (e) {}
}