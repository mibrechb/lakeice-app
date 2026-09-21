import {CONFIG} from './config.js?v=20260921-3';
import {createEuropeInset} from './inset-map.js';

let selectedLayer = null;
let map = null;
let baseLayer = null;
let labelsLayer = null;
let hillshadeLayer = null;
let lakeLayer = null;
let currentTheme = 'light';

const lakeById = new Map();
const layerById = new Map();

const TILESETS = {
  light: {
    base: 'https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png?key=cb1_3pqz_1_c408f8deacec30a8e28574e4',
    labels: 'https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png?key=cb1_3pqz_1_c408f8deacec30a8e28574e4',
  },
  dark: {
    base: 'https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png?key=cb1_3pqz_1_c408f8deacec30a8e28574e4',
    labels: 'https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}{r}.png?key=cb1_3pqz_1_c408f8deacec30a8e28574e4',
  },
};

const LAKE_STYLE = {
  color: '#38bdf8',
  weight: 2.4,
  fillColor: '#38bdf8',
  fillOpacity: 0.68,
};

const LAKE_HOVER_STYLE = {
  color: '#facc15',
  weight: 3.5,
  fillColor: '#facc15',
  fillOpacity: 0.9,
};

const LAKE_SELECTED_STYLE = {
  color: '#fb923c',
  weight: 4,
  fillColor: '#fb923c',
  fillOpacity: 0.82,
};

const LAKE_UNAVAILABLE_STYLE = {
  color: '#9f1919af',
  weight: 1.4,
  opacity: 0.72,
  fillColor: '#b41e1e',
  fillOpacity: 0.28,
};

const LAKE_UNAVAILABLE_HOVER_STYLE = {
  color: '#66737b',
  weight: 2.2,
  opacity: 0.95,
  fillColor: '#aab3b8',
  fillOpacity: 0.48,
};

let availableLakeIds = null;

function previewEnabled() {
  return CONFIG.preview?.enabled === true;
}

function hasLakeData(id) {
  if (!previewEnabled() || availableLakeIds === null) return true;
  return availableLakeIds.has(String(id).trim());
}

async function loadAvailableLakeIds() {
  if (!previewEnabled()) return null;

  const url = CONFIG.data.timeseriesManifest;
  if (!url) {
    console.warn(
      'CONFIG.data.timeseriesManifest is not configured; lake availability styling is disabled.',
    );
    return null;
  }

  try {
    const response = await fetch(url, {cache:'no-store'});
    if (!response.ok) {
      throw new Error(`${response.status} ${response.statusText}`);
    }

    const payload = await response.json();
    const ids = Array.isArray(payload)
      ? payload
      : payload.availableLakeIds;

    if (!Array.isArray(ids)) {
      throw new Error('manifest must be a JSON array of lake IDs');
    }

    return new Set(
      ids
        .map((id) => String(id).trim())
        .filter(Boolean),
    );
  } catch (error) {
    console.warn(
      `Could not load lake availability manifest (${url}). ` +
      'All lakes will remain selectable until the manifest is generated.',
      error,
    );
    return null;
  }
}

function layerLakeId(layer) {
  return String(layer?.feature?.properties?.OBJECT_ID ?? '').trim();
}

function baseStyleForLayer(layer) {
  return hasLakeData(layerLakeId(layer))
    ? LAKE_STYLE
    : LAKE_UNAVAILABLE_STYLE;
}

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function usableLakeName(value) {
  const name = String(value || '').trim();
  return name && name.toUpperCase() !== 'UNK' ? name : null;
}

function isMobileLayout() {
  return window.matchMedia(
    '(max-width: 760px), (orientation: portrait) and (max-width: 900px)',
  ).matches;
}

function panelWidth() {
  if (isMobileLayout()) return 0;
  const panel = document.querySelector('#panel');
  return panel?.getBoundingClientRect().width || 0;
}

function lakeCenter(layer) {
  const bounds = layer.getBounds();
  return bounds.isValid() ? bounds.getCenter() : map.getCenter();
}

function adjustedCenter(latlng, zoom) {
  const point = map.project(latlng, zoom);
  return map.unproject(point.add(L.point(panelWidth() / 2, 0)), zoom);
}

function setSelectedLayer(layer) {
  if (selectedLayer && selectedLayer !== layer) {
    selectedLayer.setStyle(baseStyleForLayer(selectedLayer));
  }
  selectedLayer = layer;
  selectedLayer?.setStyle(LAKE_SELECTED_STYLE);
  selectedLayer?.bringToFront();
}

export function clearHighlight() {
  if (!selectedLayer) return;
  selectedLayer.setStyle(baseStyleForLayer(selectedLayer));
  selectedLayer = null;
}

function replaceTileLayers(theme) {
  if (!map) return;
  currentTheme = theme;

  if (baseLayer) map.removeLayer(baseLayer);
  if (labelsLayer) map.removeLayer(labelsLayer);

  baseLayer = L.tileLayer(TILESETS[theme].base, {
    pane: 'base',
    maxZoom: 19,
    subdomains: 'abcd',
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(map);

  labelsLayer = L.tileLayer(TILESETS[theme].labels, {
    pane: 'labels',
    maxZoom: 19,
    subdomains: 'abcd',
  }).addTo(map);

  const hillshadePane = map.getPane('hillshade');
  if (hillshadePane) {
    hillshadePane.style.filter = theme === 'dark'
      ? 'brightness(.42) contrast(1.15)'
      : '';
  }
}

export function setMapTheme(theme = 'light') {
  if (theme !== currentTheme) replaceTileLayers(theme);
}

function updateUrl(lakeId) {
  const url = new URL(location.href);
  url.searchParams.set('lake_id', lakeId);
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}

function clearLakeUrl() {
  const url = new URL(location.href);
  url.searchParams.delete('lake_id');
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
}


function unavailableLakePopup(meta, id) {
  const container = document.createElement('div');
  container.className = 'unavailable-lake-popup';

  const title = document.createElement('strong');
  title.textContent = usableLakeName(meta?.NAM) || `Lake ${id}`;

  const message = document.createElement('span');
  message.textContent = 'Lake-ice results for this lake are not currently available.';

  container.append(title, message);
  return container;
}

export async function setupMap(onSelect) {
  const [
    boundary,
    countries,
    lakes,
    lookup,
    manifestLakeIds,
  ] = await Promise.all([
    fetch(CONFIG.data.alpineBoundary).then((response) => response.json()),
    fetch(CONFIG.data.countries).then((response) => response.json()),
    fetch(CONFIG.data.lakes).then((response) => response.json()),
    fetch(CONFIG.data.lakeLookup).then((response) => response.json()),
    loadAvailableLakeIds(),
  ]);

  availableLakeIds = manifestLakeIds;

  const boundaryLayer = L.geoJSON(boundary);
  const bounds = boundaryLayer.getBounds();

  map = L.map('map', {
    zoomControl: true,
    maxBounds: bounds,
    maxBoundsViscosity: 1,
    minZoom: CONFIG.map.minZoom,
    maxZoom: CONFIG.map.maxZoom,
    preferCanvas: true,
  }).fitBounds(bounds);

  createEuropeInset(map, boundary);

  for (const [name, zIndex] of [
    ['base', 200],
    ['hillshade', 250],
    ['countries', 300],
    ['alps', 350],
    ['lakes', 400],
    ['labels', 450],
  ]) {
    map.createPane(name);
    map.getPane(name).style.zIndex = String(zIndex);
  }

  replaceTileLayers(currentTheme);

  hillshadeLayer = L.tileLayer(
    'https://services.arcgisonline.com/arcgis/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}',
    {
      pane: 'hillshade',
      maxZoom: 16,
      opacity: 0.55,
      attribution: 'Tiles &copy; Esri',
    },
  ).addTo(map);

  L.geoJSON(countries, {
    pane: 'countries',
    interactive: false,
    style: {
      color: '#777',
      weight: 1.2,
      opacity: 0.5,
      fillOpacity: 0,
    },
  }).addTo(map);

  boundaryLayer.setStyle({
    pane: 'alps',
    interactive: false,
    color: '#f87171',
    weight: 2.5,
    dashArray: '8,6',
    fill: false,
    opacity: 0.72,
  }).addTo(map);

  async function selectByLayer(layer, {animate = true, updateHistory = true} = {}) {
    const meta = layer.feature.properties;
    const id = String(meta.OBJECT_ID).trim();

    if (!hasLakeData(id)) {
      clearHighlight();
      clearLakeUrl();
      onSelect?.(null, {close: true});

      L.popup({
        className: 'preview-unavailable-popup',
        maxWidth: 280,
        closeButton: true,
      })
        .setLatLng(lakeCenter(layer))
        .setContent(unavailableLakePopup(meta, id))
        .openOn(map);

      return null;
    }

    const zoom = Math.max(map.getZoom(), CONFIG.map.selectedZoom);
    const target = adjustedCenter(lakeCenter(layer), zoom);

    setSelectedLayer(layer);
    if (updateHistory) updateUrl(id);

    await new Promise((resolve) => {
      if (!animate) {
        map.setView(target, zoom, {animate: false});
        resolve();
        return;
      }
      map.once('moveend', resolve);
      map.setView(target, zoom, {animate: true});
    });

    onSelect?.(meta);
    return meta;
  }

  const lookupNameById = new Map(
    lookup.map((lake) => [
      String(lake.OBJECT_ID).trim(),
      usableLakeName(lake.NAM_OSM),
    ]),
  );

  lakeLayer = L.geoJSON(lakes, {
    pane: 'lakes',
    style: (feature) => hasLakeData(feature.properties.OBJECT_ID)
      ? LAKE_STYLE
      : LAKE_UNAVAILABLE_STYLE,
    onEachFeature(feature, layer) {
      const id = String(feature.properties.OBJECT_ID).trim();
      const lutName = lookupNameById.get(id);

      if (!usableLakeName(feature.properties.NAM) && lutName) {
        feature.properties.NAM = lutName;
      }

      lakeById.set(id, feature.properties);
      layerById.set(id, layer);

      const available = hasLakeData(id);

      layer.on({
        mouseover: () => {
          if (selectedLayer === layer) return;
          layer.setStyle(
            available ? LAKE_HOVER_STYLE : LAKE_UNAVAILABLE_HOVER_STYLE,
          );
        },
        mouseout: () => {
          if (selectedLayer !== layer) layer.setStyle(baseStyleForLayer(layer));
        },
        click: (event) => {
          L.DomEvent.stopPropagation(event);
          void selectByLayer(layer);
        },
      });

      const tooltipLabel = available
        ? (feature.properties.NAM || id)
        : `${feature.properties.NAM || id} · data pending`;

      layer.bindTooltip(tooltipLabel, {
        sticky: true,
        direction: 'top',
      });
    },
  }).addTo(map);

  const legend = L.control({position: 'topright'});
  legend.onAdd = () => {
    const element = L.DomUtil.create('div', 'leaflet-control legend');

    const availability = previewEnabled()
      ? `
        <div class="legend-row">
          <span class="legend-lake legend-lake--available"></span>
          <span>Data available</span>
        </div>
        <div class="legend-row">
          <span class="legend-lake legend-lake--pending"></span>
          <span>Data pending</span>
        </div>
      `
      : '';

    element.innerHTML = `
      ${availability}
      <div class="legend-row">
        <span class="legend-line"></span>
        <span>European Alps</span>
      </div>
    `;
    return element;
  };
  legend.addTo(map);

  const searchInput = document.querySelector('#lakeSearch');
  const searchIdByLabel = new Map();

  const searchItems = lookup
    .map((lake) => {
      const id = String(lake.OBJECT_ID).trim();
      if (!layerById.has(id)) return null;

      const label = `${usableLakeName(lake.NAM_OSM) || lakeById.get(id)?.NAM || id} (${id})`;
      searchIdByLabel.set(label, id);
      return label;
    })
    .filter(Boolean);

  new Awesomplete(searchInput, {
    list: searchItems,
    filter: (text, input) => normalize(text).includes(normalize(input)),
    minChars: 1,
    maxItems: 12,
  });

  searchInput.addEventListener('awesomplete-selectcomplete', (event) => {
    const id = searchIdByLabel.get(event.text.value);
    searchInput.value = '';
    if (id) void selectById(id);
  });

  map.on('click', (event) => {
    if (event.originalEvent.target.closest('.leaflet-interactive')) return;
    clearHighlight();
    clearLakeUrl();
    onSelect?.(null, {close: true});
  });

  async function selectById(id, options = {}) {
    const layer = layerById.get(String(id));
    if (!layer) throw new Error(`Lake ${id} is not present in the map layer.`);
    return selectByLayer(layer, options);
  }

  const deepId = new URLSearchParams(location.search).get('lake_id');
  if (deepId && layerById.has(deepId)) {
    requestAnimationFrame(() => void selectById(deepId, {animate: false, updateHistory: false}));
  }

  setTimeout(() => map.invalidateSize(), 0);

  return {
    map,
    selectById,
    hasLake: (id) => layerById.has(String(id)),
    hasLakeData,
    getLake: (id) => lakeById.get(String(id)),
    invalidateSize: () => map.invalidateSize(),
  };
}
