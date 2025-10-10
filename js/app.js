import { setupRouter } from './router.js';
import { setupMap } from './map.js';
import { setupPanel } from './panel.js';

const router = setupRouter();
const panel = setupPanel();
window.panel = panel;
const map = setupMap((meta, opts) => {
  if (opts?.close) { panel.close(); return; }
  if (meta) { panel.render(meta); panel.open(); }
});

// hide side-panel when switching tab
document.addEventListener('tabchange', (e) => {
  if (e.detail?.name !== 'map') panel.close();
});

// Hamburger menu logic (no DOMContentLoaded needed in modules)
const hamburger = document.querySelector('.hamburger');
const dropdown = document.querySelector('.mobile-tabs-dropdown');

if (hamburger && dropdown) {
  hamburger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown) {
      dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hamburger') && !e.target.closest('.mobile-tabs-dropdown')) {
      dropdown.style.display = 'none';
    }
  });

  dropdown.querySelectorAll('.dropdown-item').forEach(item => {
    item.addEventListener('click', () => {
      // Switch tab using your router
      if (window.router && typeof window.router.switchTab === 'function') {
        window.router.switchTab(item.dataset.tab);
      }
      dropdown.style.display = 'none';
    });
  });
}

if (hamburger) {
  const dropdown = document.querySelector('.mobile-tabs-dropdown');
  hamburger.addEventListener('click', () => {
    if (dropdown) dropdown.style.display = 'block';
  });
}

// Desktop tab button logic
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    window.router?.switchTab(tab.dataset.tab);
  });
});

const themeToggle = document.getElementById('themeToggle');
const logoImg = document.getElementById('logoImg');
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('theme-light');
    // Switch logo based on theme
    if (document.body.classList.contains('theme-light')) {
      logoImg.src = './data/img/logo_light.png';
    } else {
      logoImg.src = './data/img/logo_dark.png';
    }
    // Update map tiles for new theme
    if (window.map && window.map.eachLayer) {
      window.map.eachLayer(layer => {
        if (layer instanceof L.TileLayer) {
          window.map.removeLayer(layer);
        }
      });
      // Basemap
      const mapTileUrl = getComputedStyle(document.body).getPropertyValue('--map-tile').replace(/['"]/g, '');
      L.tileLayer(mapTileUrl, {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(window.map);

      // Hillshade
      if (window.hillshade) {
        window.hillshade.addTo(window.map);
        // Directly set filter for dark mode
        const pane = window.map.getPane('hillshade');
        const isDark = !document.body.classList.contains('theme-light');
        if (pane) {
          // pane.style.filter = isDark ? 'invert(1) brightness(0.5)' : '';
          pane.style.filter = isDark ? 'brightness(0.4) contrast(1.5)' : '';
        }
      }

      // Labels
      const labelTileUrl = getComputedStyle(document.body).getPropertyValue('--label-tile').replace(/['"]/g, '');
      window.labelLayer = L.tileLayer(labelTileUrl, {
        pane: 'labels',
        maxZoom: 19,
        attribution: ''
      }).addTo(window.map);
    }

    // Rerender plots
    if (window.panel && typeof window.panel.render === 'function' && window.currentMeta) {
      window.panel.render(window.currentMeta);
    }
  });
}

document.body.classList.add('theme-light');

if (logoImg) {
  logoImg.src = document.body.classList.contains('theme-light')
    ? './data/img/logo_light.png'
    : './data/img/logo_dark.png';
}

function showStaticPage(pageId) {
  document.getElementById('map-container').style.display = 'none';
  document.getElementById('panel').style.display = 'none';
  document.querySelectorAll('.static-page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}

function showMapView() {
  document.getElementById('map-container').style.display = '';
  document.getElementById('panel').style.display = '';
  document.querySelectorAll('.static-page').forEach(p => p.classList.remove('active'));
}

// Example tab click handler:
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', e => {
    const page = tab.getAttribute('data-tab');
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    if (page === 'map') {
      showMapView();
    } else {
      showStaticPage(page);
    }
  });
});