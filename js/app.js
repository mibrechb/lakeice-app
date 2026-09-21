import {CONFIG} from './config.js?v=20260921-3';
import {setupRouter} from './router.js?v=20260921-3';
import {setupMap, setMapTheme} from './map.js?v=20260921-3';
import {setupPanel} from './panel.js';

const panel = setupPanel();
let mapController = null;

function applyPreviewMode() {
  const preview = CONFIG.preview || {};
  const enabled = preview.enabled === true;

  document.body.classList.toggle('preview-mode', enabled);

  document.querySelectorAll('[data-preview-only]').forEach((element) => {
    element.hidden = !enabled;
  });

  document.querySelectorAll('[data-preview-title]').forEach((element) => {
    element.textContent = preview.title || 'Preview';
  });

  document.querySelectorAll('[data-preview-banner-message]').forEach((element) => {
    element.textContent = preview.bannerMessage || '';
  });

  document.querySelectorAll('[data-preview-dialog-message]').forEach((element) => {
    element.textContent = preview.dialogMessage || preview.bannerMessage || '';
  });
}


function preferredTheme() {
  const saved = localStorage.getItem('lakeice-theme');
  if (saved === 'light' || saved === 'dark') return saved;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme, {rerender = false} = {}) {
  document.body.dataset.theme = theme;
  localStorage.setItem('lakeice-theme', theme);

  const logo = document.querySelector('#logoImg');
  logo.src = theme === 'light'
    ? './data/img/logo_light.png'
    : './data/img/logo_dark.png';

  document.querySelector('#themeToggle').setAttribute(
    'aria-label',
    `Switch to ${theme === 'light' ? 'dark' : 'light'} mode`,
  );

  setMapTheme(theme);
  if (rerender && window.currentMeta) panel.render(window.currentMeta);
}

const router = setupRouter({
  onViewChange(view) {
    if (view !== 'map') panel.close({updateHistory: false});
    else requestAnimationFrame(() => mapController?.invalidateSize());
  },
});

applyTheme(preferredTheme());
applyPreviewMode();

document.querySelector('#themeToggle').addEventListener('click', () => {
  const next = document.body.dataset.theme === 'light' ? 'dark' : 'light';
  applyTheme(next, {rerender: true});
});

document.querySelector('#brand-home').addEventListener('click', () => {
  router.show('map');
  panel.close();
});

mapController = await setupMap(async (meta, options) => {
  if (options?.close) {
    panel.close();
    return;
  }
  if (!meta) return;
  panel.open();
  await panel.render(meta);
});

setMapTheme(document.body.dataset.theme);

const welcomeDialog = document.querySelector('#welcome-dialog');
const welcomeLake = document.querySelector('#welcome-lake');

function closeWelcome() {
  if (welcomeDialog.open) welcomeDialog.close();
}

async function openWelcomeLake() {
  const available = CONFIG.welcomeLakes.filter((lake) =>
    mapController.hasLake(lake.id) && mapController.hasLakeData(lake.id),
  );
  if (!available.length) return;

  const lake = available[Math.floor(Math.random() * available.length)];
  closeWelcome();
  await router.show('map');
  await mapController.selectById(lake.id);
}

document.querySelector('#welcome-close').addEventListener('click', closeWelcome);
document.querySelector('#welcome-start').addEventListener('click', closeWelcome);
document.querySelector('#welcome-methods').addEventListener('click', async () => {
  closeWelcome();
  await router.show('methods');
});
welcomeLake.addEventListener('click', () => void openWelcomeLake());

welcomeDialog.addEventListener('click', (event) => {
  if (event.target === welcomeDialog) closeWelcome();
});

welcomeLake.disabled = !CONFIG.welcomeLakes.some((lake) =>
  mapController.hasLake(lake.id) && mapController.hasLakeData(lake.id),
);
requestAnimationFrame(() => welcomeDialog.showModal());
