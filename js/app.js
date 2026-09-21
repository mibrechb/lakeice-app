import {CONFIG} from './config.js';
import {setupRouter} from './router.js';
import {setupMap, setMapTheme} from './map.js';
import {setupPanel} from './panel.js';

const panel = setupPanel();
let mapController = null;

function preferredTheme() {
  const saved = localStorage.getItem('lakeice-theme');
  return saved === 'dark' ? 'dark' : 'light';
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
  const available = CONFIG.welcomeLakes.filter((lake) => mapController.hasLake(lake.id));
  if (!available.length) return;

  const lake = available[Math.floor(Math.random() * available.length)];
  closeWelcome();
  await router.show('map');
  await mapController.selectById(lake.id);
}

document.querySelector('#welcome-close').addEventListener('click', closeWelcome);
document.querySelector('#welcome-start').addEventListener('click', closeWelcome);
welcomeLake.addEventListener('click', () => void openWelcomeLake());

welcomeDialog.addEventListener('click', (event) => {
  if (event.target === welcomeDialog) closeWelcome();
});

welcomeLake.disabled = !CONFIG.welcomeLakes.some((lake) => mapController.hasLake(lake.id));
requestAnimationFrame(() => welcomeDialog.showModal());
