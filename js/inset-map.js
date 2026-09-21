import {CONFIG} from './config.js';

function svgElement(name, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, String(value));
  });
  return element;
}

function themeColors() {
  const style = getComputedStyle(document.body);
  const value = (name, fallback) =>
    style.getPropertyValue(name).trim() || fallback;

  return {
    ocean:value('--surface-soft', '#f5f7f8'),
    land:value('--muted', '#7f8d96'),
    border:value('--border', '#dfe6ea'),
    accent:value('#ff0000', '#ff0000'), //('--accent-strong', '#08769e'),
    surface:value('--surface', '#ffffff'),
  };
}

function validateOptions(options) {
  if (!options || typeof options !== 'object') {
    throw new Error('CONFIG.insetMap is required.');
  }

  const requiredNumbers = ['width', 'height', 'padding'];
  for (const key of requiredNumbers) {
    if (!Number.isFinite(options[key])) {
      throw new Error(`CONFIG.insetMap.${key} must be a number.`);
    }
  }

  const bounds = options.bounds;
  const validBounds =
    Array.isArray(bounds) &&
    bounds.length === 2 &&
    bounds.every(
      (corner) =>
        Array.isArray(corner) &&
        corner.length === 2 &&
        corner.every(Number.isFinite),
    );

  if (!validBounds) {
    throw new Error(
      'CONFIG.insetMap.bounds must be [[west, south], [east, north]].',
    );
  }

  const [[west, south], [east, north]] = bounds;
  if (west >= east || south >= north) {
    throw new Error(
      'CONFIG.insetMap.bounds must have west < east and south < north.',
    );
  }

  if (!options.position || !options.landUrl || !options.countriesUrl) {
    throw new Error(
      'CONFIG.insetMap.position, landUrl, and countriesUrl are required.',
    );
  }
}

function projectedViewportPoints(projection, bounds) {
  const corners = [
    [bounds.getWest(), bounds.getNorth()],
    [bounds.getEast(), bounds.getNorth()],
    [bounds.getEast(), bounds.getSouth()],
    [bounds.getWest(), bounds.getSouth()],
  ];

  return corners
    .map((coordinate) => projection(coordinate))
    .filter(Boolean)
    .map(([x, y]) => `${x},${y}`)
    .join(' ');
}

export function createEuropeInset(map) {
  const options = CONFIG.insetMap;

  if (options?.enabled === false) return null;
  validateOptions(options);

  const {d3, topojson} = window;
  if (!d3 || !topojson) {
    throw new Error(
      'Europe inset requires D3 and topojson-client to be loaded.',
    );
  }

  const control = L.control({position:options.position});

  let container;
  let svg;
  let clipRect;
  let projection;
  let path;
  let graticule;
  let land;
  let countryBorders;
  let viewport;
  let landFeature = null;
  let countryBorderMesh = null;
  let resizeObserver = null;
  let themeObserver = null;

  function buildProjection() {
    const width = container.clientWidth || options.width;
    const height = container.clientHeight || options.height;
    const [[west, south], [east, north]] = options.bounds;

    const baseProjection = d3.geoMercator()
      .scale(1)
      .translate([0, 0]);

    const northWest = baseProjection([west, north]);
    const southEast = baseProjection([east, south]);

    const projectedWidth = southEast[0] - northWest[0];
    const projectedHeight = southEast[1] - northWest[1];
    const availableWidth = width - 2 * options.padding;
    const availableHeight = height - 2 * options.padding;
    const scale = Math.min(
      availableWidth / projectedWidth,
      availableHeight / projectedHeight,
    );

    const centerX = (northWest[0] + southEast[0]) / 2;
    const centerY = (northWest[1] + southEast[1]) / 2;

    projection = d3.geoMercator()
      .scale(scale)
      .translate([
        width / 2 - scale * centerX,
        height / 2 - scale * centerY,
      ])
      .precision(.2);

    path = d3.geoPath(projection);
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    clipRect.setAttribute('width', width);
    clipRect.setAttribute('height', height);
  }

  function setPath(element, geometry) {
    const value = geometry ? path(geometry) : null;
    if (value) {
      element.setAttribute('d', value);
      element.removeAttribute('hidden');
    } else {
      element.setAttribute('hidden', '');
    }
  }

  function render() {
    if (!container || !svg) return;

    buildProjection();
    const colors = themeColors();

    container.style.background = colors.ocean;

    setPath(graticule, d3.geoGraticule10());
    graticule.setAttribute('stroke', colors.border);

    setPath(land, landFeature);
    land.setAttribute('fill', colors.land);
    land.setAttribute('stroke', colors.surface);

    setPath(countryBorders, countryBorderMesh);
    countryBorders.setAttribute('stroke', colors.surface);

    const points = projectedViewportPoints(projection, map.getBounds());
    if (points) {
      viewport.setAttribute('points', points);
      viewport.setAttribute('stroke', colors.accent);
      viewport.setAttribute('fill', colors.accent);
      viewport.removeAttribute('hidden');
    } else {
      viewport.setAttribute('hidden', '');
    }
  }

  async function loadBasemap() {
    const [landResponse, countriesResponse] = await Promise.all([
      fetch(options.landUrl),
      fetch(options.countriesUrl),
    ]);

    if (!landResponse.ok) {
      throw new Error(`Inset land request failed with ${landResponse.status}.`);
    }
    if (!countriesResponse.ok) {
      throw new Error(
        `Inset country request failed with ${countriesResponse.status}.`,
      );
    }

    const [landTopology, countriesTopology] = await Promise.all([
      landResponse.json(),
      countriesResponse.json(),
    ]);

    landFeature = topojson.feature(
      landTopology,
      landTopology.objects.land,
    );

    countryBorderMesh = topojson.mesh(
      countriesTopology,
      countriesTopology.objects.countries,
      (a, b) => a !== b,
    );

    render();
  }

  control.onAdd = () => {
    container = L.DomUtil.create('div', 'leaflet-control europe-inset');
    container.style.setProperty(
      '--europe-inset-width',
      `${options.width}px`,
    );
    container.style.setProperty(
      '--europe-inset-height',
      `${options.height}px`,
    );
    container.setAttribute('role', 'img');
    container.setAttribute(
      'aria-label',
      'Web Mercator overview map showing the current map extent',
    );

    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);

    svg = svgElement('svg', {
      class:'europe-inset-svg',
      'aria-hidden':'true',
    });

    const defs = svgElement('defs');
    const clipPath = svgElement('clipPath', {id:'europe-inset-clip'});
    clipRect = svgElement('rect', {x:0, y:0});
    clipPath.append(clipRect);
    defs.append(clipPath);

    const mapGroup = svgElement('g', {
      'clip-path':'url(#europe-inset-clip)',
    });

    graticule = svgElement('path', {
      class:'europe-inset-graticule',
      fill:'none',
    });
    land = svgElement('path', {class:'europe-inset-land'});
    countryBorders = svgElement('path', {
      class:'europe-inset-country-borders',
      fill:'none',
    });
    viewport = svgElement('polygon', {
      class:'europe-inset-viewport',
    });

    mapGroup.append(graticule, land, countryBorders, viewport);
    svg.append(defs, mapGroup);
    container.append(svg);

    resizeObserver = new ResizeObserver(render);
    resizeObserver.observe(container);

    themeObserver = new MutationObserver(render);
    themeObserver.observe(document.body, {
      attributes:true,
      attributeFilter:['data-theme'],
    });

    map.on('move zoom resize', render);

    void loadBasemap().catch((error) => {
      console.error(error);
      container.classList.add('europe-inset--error');
    });

    render();
    return container;
  };

  control.onRemove = () => {
    map.off('move zoom resize', render);
    resizeObserver?.disconnect();
    themeObserver?.disconnect();
  };

  control.addTo(map);

  return {
    control,
    render,
    remove:() => control.remove(),
  };
}
