# Lake Ice Application

Static web app to visualize lake ice cover on a Leaflet basemap with Apache ECharts charts.
All data is loaded from static CSV/JSON/GeoJSON files.

## Folder structure
```
lakeice-app/
  index.html
  css/styles.css
  js/
    app.js           # wires router, map, panel
    map.js           # Leaflet map, vector layers, lake selection
    panel.js         # lake data panel rendering
    plots.js         # Apache ECharts charts
    router.js        # routing between map and pages
    utils/data.js    # data loaders
  data/              # datasets, images
```
