import { setupRouter } from './router.js';
import { setupMap, setMapTheme } from './map.js';
import { setupPanel } from './panel.js';

const router = setupRouter();
const panel = setupPanel();
window.panel = panel;

// Debug logging removed
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
}
if (hamburger) {
  const dropdown = document.querySelector('.mobile-tabs-dropdown');
  hamburger.addEventListener('click', () => {
    if (dropdown) dropdown.style.display = 'block';
  });
}

// Desktop tab handling delegated to router.js (single source of truth)
// Router handles hashchange events
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
    // Let map.js handle theme-specific layer swapping (preserves view)
    const theme = document.body.classList.contains('theme-light') ? 'light' : 'dark';
    try { setMapTheme(theme); } catch (e) { console.warn('setMapTheme failed', e); }

    // Rerender plots
    if (window.panel && typeof window.panel.render === 'function' && window.currentMeta) {
      window.panel.render(window.currentMeta);
    }
  });
}

// Add click handler to logo
const logoDiv = document.querySelector('.logo');
if (logoDiv) {
  logoDiv.style.cursor = 'pointer';
  logoDiv.addEventListener('click', (e) => {
    e.preventDefault();
    if (window.router && typeof window.router.switchTab === 'function') {
      window.router.switchTab('map');
    }
    // Close the panel if open
    if (window.panel && typeof window.panel.close === 'function') {
      window.panel.close();
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
// Router handles tab clicks now (see router.js)