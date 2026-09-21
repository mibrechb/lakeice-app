export const CONFIG = {
  // Data sources
  data: {
    alpineBoundary: './data/alpineconvention_lightweight.geojson',
    countries: './data/countries_lightweight.geojson',
    lakes: './data/euhydro_lightweight.geojson',
    lakeLookup: './data/euhydro_lut.json',
    timeseriesManifest: './data/timeseries/available.json',
  },


  // Pages configuration
  pages: {
    about: './pages/about.html',
    methods: './pages/methods.html',
  },

  // Temporary data-availability preview
  preview: {
    enabled: true,
    title: 'Data preview',
    bannerMessage:
      'Lake ice outputs are currently being ingested. Data availability is subject to change.',
    dialogMessage:
      'Lake ice outputs are currently being ingested and availability will change as processing continues. Lakes shown in grey do not currently have lake-ice results available.',
  },

  // Map configuration
  map: {
    minZoom: 7,
    maxZoom: 15,
    selectedZoom: 12,
  },

  // Cureated lake list
  welcomeLakes: [
    {
      id: 'IW35016644',
      name: 'Lej da Segl',
      lat: 46.4204,
      lon: 9.7294,
      zoom: 17,
    },
  ],

  // Inset map configuration
  insetMap: {
    enabled: true,
    position: 'bottomleft',
    width: 210,
    height: 155,
    padding: 10,

    // Fixed inset extent: [[west, south], [east, north]]
  bounds: [
    [-5, 32],
    [32, 58],
  ],
    landUrl:'https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json',
    countriesUrl:'https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json',
  },

};