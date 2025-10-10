import { fetchJSON, fetchCSV } from './utils/data.js';

let selectedFeature = null;

export function clearHighlight() {
  if (selectedFeature) {
    selectedFeature.setStyle({ color:'#38bdf8', weight:1.5 });
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

export function setupMap(onSelect){
  fetch('./data/alpineconvention.geojson')
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

      // Add country borders layer (as lines)
      map.createPane('countries');
      map.getPane('countries').style.zIndex = 460;
      fetch('./data/countries.json')
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

      // Add tile layer
      map.createPane('base');
      map.getPane('base').style.zIndex = 300;
      const mapTileUrl = getComputedStyle(document.body).getPropertyValue('--map-tile').replace(/['"]/g, '');
      L.tileLayer(mapTileUrl, {
        pane: 'base',
        interactive: false,
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      // // Custom hillshade layer using Terrarium elevation tiles
      // const hillShadeTileUrl = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
      // const TerrariumHillshade = L.GridLayer.extend({
      //   options: {
      //     pane: 'hillshade',
      //     opacity: 0.6,
      //     azimuth: 315,
      //     altitude: 45,
      //     exaggeration: 1.5,
      //     slopeAlpha: 1.0,
      //     mode: 'light'
      //   },
      //   setParams(params) { Object.assign(this.options, params); this.redraw(); },
      //   createTile: function(coords, done) {
      //     const tile = document.createElement('canvas');
      //     tile.width = tile.height = 256;
      //     const ctx = tile.getContext('2d');
      //     const img = new Image();
      //     img.crossOrigin = 'anonymous';
      //     img.onload = () => {
      //       try {
      //         const o = document.createElement('canvas');
      //         o.width = o.height = 256;
      //         const octx = o.getContext('2d');
      //         octx.drawImage(img, 0, 0);
      //         const src = octx.getImageData(0, 0, 256, 256);
      //         const dst = ctx.createImageData(256, 256);
      //         const elev = new Float32Array(256 * 256);
      //         const data = src.data;
      //         for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      //           const R = data[i], G = data[i+1], B = data[i+2];
      //           elev[p] = (R * 256 + G + B / 256) - 32768;
      //         }
      //         const latRad = Math.atan(Math.sinh(Math.PI - 2 * Math.PI * (coords.y + 0.5) / Math.pow(2, coords.z)));
      //         const mpp = (156543.03392804097 * Math.cos(latRad)) / Math.pow(2, coords.z);
      //         const zf = this.options.exaggeration;
      //         const az = this.options.azimuth * Math.PI / 180;
      //         const alt = this.options.altitude * Math.PI / 180;
      //         const cosAlt = Math.cos(alt), sinAlt = Math.sin(alt);
      //         for (let y = 0; y < 256; y++) {
      //           for (let x = 0; x < 256; x++) {
      //             const i = y * 256 + x;
      //             const xm = Math.max(x-1, 0), xp = Math.min(x+1, 255);
      //             const ym = Math.max(y-1, 0), yp = Math.min(y+1, 255);
      //             const dzdx = ((elev[y*256 + xp] - elev[y*256 + xm]) / (2 * mpp)) * zf;
      //             const dzdy = ((elev[yp*256 + x] - elev[ym*256 + x]) / (2 * mpp)) * zf;
      //             const slope = Math.atan(Math.sqrt(dzdx*dzdx + dzdy*dzdy));
      //             const aspect = Math.atan2(dzdy, -dzdx);
      //             let hs = cosAlt * Math.cos(slope) + sinAlt * Math.sin(slope) * Math.cos(az - aspect);
      //             hs = Math.max(0, Math.min(1, hs));
      //             const slopeAlpha = this.options.slopeAlpha * (Math.sin(slope));
      //             let r, g, b, a;
      //             if (this.options.mode === 'dark') {
      //               r = g = b = 255;
      //               a = hs * slopeAlpha * this.options.opacity;
      //             } else {
      //               r = g = b = 0;
      //               a = (1 - hs) * slopeAlpha * this.options.opacity;
      //             }
      //             // --- Mask out ocean/bathymetry: transparent if elevation < 0 ---
      //             if (elev[i] < 0) a = 0;
      //             const k = i * 4;
      //             dst.data[k]   = r;
      //             dst.data[k+1] = g;
      //             dst.data[k+2] = b;
      //             dst.data[k+3] = Math.max(0, Math.min(255, Math.round(a * 255)));
      //           }
      //         }
      //         ctx.putImageData(dst, 0, 0);
      //         done(null, tile);
      //       } catch (err) {
      //         console.error('Hillshade tile error:', err);
      //         done(err, tile);
      //       }
      //     };
      //     img.onerror = () => done(new Error('Terrarium tile load error'), tile);
      //     img.src = L.Util.template(hillShadeTileUrl, coords);
      //     return tile;
      //   }
      // });

      // // --- Add hillshade pane and layer ---
      // map.createPane('hillshade');
      // map.getPane('hillshade').style.zIndex = 400;
      // const hillshade = new TerrariumHillshade({ opacity: 0.6, mode: 'light', pane: 'hillshade' }).addTo(map);
      // window.hillshade = hillshade;

      // Add ESRI World Hillshade tile layer
      map.createPane('hillshade');
      map.getPane('hillshade').style.zIndex = 400;
      const hillshade = L.tileLayer('https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', {
        pane: 'hillshade',
        interactive: false,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, USGS, NOAA',
        maxZoom: 16,
        opacity: 0.6
      }).addTo(map);
      hillshade.addTo(map);
      window.hillshade = hillshade;

      // Add labels-only layer (above base and hillshade)
      map.createPane('labels');
      map.getPane('labels').style.zIndex = 600;
      const labelTileUrl = getComputedStyle(document.body).getPropertyValue('--label-tile').replace(/['"]/g, '');
      L.tileLayer(labelTileUrl, {
        pane: 'labels',
        interactive: false,
        maxZoom: 19,
        attribution: ''
      }).addTo(map);

      // Add lakes layer after perimeter
      map.createPane('lakes');
      map.getPane('lakes').style.zIndex = 500;
      const lakesUrl = './data/euhydro.geojson';
      fetch(lakesUrl)
        .then(r => r.json())
        .then(geo => {
          const lakesLayer = L.geoJSON(geo, {
            pane: 'lakes',
            style: f => ({ color:'#38bdf8', weight:3.0, fillColor:'#38bdf8', fillOpacity:0.75}),
            onEachFeature: (feature, layer) => {
              layer.on('mouseover', () => {
                layer.setStyle({ color:'#facc15', weight:4, fillOpacity:1 });
              });
              layer.on('mouseout', () => {
                // Only reset style if this layer is NOT the selected feature
                if (selectedFeature !== layer) {
                  layer.setStyle({ color:'#38bdf8', weight:3, fillOpacity:0.75 });
                }
              });
              layer.on('click', () => {
                clearHighlight();
                layer.setStyle({ color:'#facc15', weight:4 });
                selectedFeature = layer;

                const bounds = layer.getBounds();
                map.fitBounds(bounds, { maxZoom: 13 });

                selectLake(feature.properties.OBJECT_ID, layer, feature.properties);
              });
              layer.bindTooltip(feature.properties.NAM, {sticky:true, direction:'top'});
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
        }).catch(err=>{
          console.error('Failed to load euhydro.geojson', err);
          alert('Could not load lakes layer. Place your GeoJSON at '+lakesUrl);
        });

        // Add legend
        const legend = L.control({ position: 'topright' });
        legend.onAdd = function(map) {
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
              filter: function(text, input) {
                return normalize(text).includes(normalize(input));
              }
            });

            input.addEventListener('awesomplete-selectcomplete', function(e) {
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

      async function selectLake(lakeId, layer=null, meta=null) {
        history.replaceState(null, '', `?lake_id=${encodeURIComponent(lakeId)}`);
        if (layer) { layer.bringToFront(); }
        onSelect(meta);
      }

      // Close panel by clicking empty map
      map.on('click', (e)=>{
        if(!e.originalEvent.target.closest('.leaflet-interactive')) {
          clearHighlight(); // <-- Add this line
          onSelect(null, {close:true});
        }
      });

      return { map };
    });

}