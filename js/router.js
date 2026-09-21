import {CONFIG} from './config.js?v=20260921-3';

const VALID_VIEWS = new Set(['map', ...Object.keys(CONFIG.pages)]);
const pageCache = new Map();

function viewFromHash() {
  const value = window.location.hash.replace(/^#/, '');
  return VALID_VIEWS.has(value) ? value : 'map';
}

export function setupRouter({onViewChange} = {}) {
  const mapView = document.querySelector('#map-view');
  const pageView = document.querySelector('#page-view');
  const pageContent = document.querySelector('#page-content');
  const menuButton = document.querySelector('#menu-button');
  const mobileMenu = document.querySelector('#mobile-menu');

  async function loadPage(name) {
    if (pageCache.has(name)) return pageCache.get(name);

    const response = await fetch(CONFIG.pages[name]);
    if (!response.ok) {
      throw new Error(`Could not load ${name} (${response.status}).`);
    }

    const html = await response.text();
    pageCache.set(name, html);
    return html;
  }

  function updateNavigation(name) {
    document.querySelectorAll('[data-view]').forEach((element) => {
      const active = element.dataset.view === name;
      element.classList.toggle('active', active);
      if (element.matches('.tab')) {
        active
          ? element.setAttribute('aria-current', 'page')
          : element.removeAttribute('aria-current');
      }
    });
  }

  function closeMenu() {
    mobileMenu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
  }

  async function show(name, {updateHash = true} = {}) {
    const view = VALID_VIEWS.has(name) ? name : 'map';
    updateNavigation(view);
    closeMenu();

    if (view === 'map') {
      mapView.hidden = false;
      pageView.hidden = true;
      if (updateHash) {
        history.replaceState(null, '', `${location.pathname}${location.search}`);
      }
    } else {
      mapView.hidden = true;
      pageView.hidden = false;
      pageContent.innerHTML = '<div class="page-loading">Loading…</div>';

      try {
        pageContent.innerHTML = await loadPage(view);
      } catch (error) {
        pageContent.innerHTML = `<div class="page-error">${error.message}</div>`;
      }

      if (updateHash && location.hash !== `#${view}`) {
        location.hash = view;
      }
    }

    onViewChange?.(view);
    document.dispatchEvent(new CustomEvent('viewchange', {detail: {name: view}}));
  }

  document.querySelectorAll('[data-view]').forEach((element) => {
    element.addEventListener('click', () => show(element.dataset.view));
  });

  menuButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const opening = mobileMenu.hidden;
    mobileMenu.hidden = !opening;
    menuButton.setAttribute('aria-expanded', String(opening));
  });

  document.addEventListener('click', (event) => {
    if (!event.target.closest('#menu-button, #mobile-menu')) closeMenu();
  });

  window.addEventListener('hashchange', () => show(viewFromHash(), {updateHash: false}));
  show(viewFromHash(), {updateHash: false});

  return {show};
}
