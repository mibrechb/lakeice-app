import {renderLicPlots, renderLipPlots, safeDisposeEChart} from './plots.js';
import {clearHighlight} from './map.js';

const PLOT_IDS = [
  'plot-lic-scatter',
  'plot-lic-agg',
  'plot-lip-scatter',
  'plot-lip-table',
];

function resizeCharts() {
  for (const id of PLOT_IDS) {
    const element = document.getElementById(id);
    const chart = element && window.echarts?.getInstanceByDom(element);
    chart?.resize();
  }
}

function scheduleChartResize() {
  requestAnimationFrame(() => requestAnimationFrame(resizeCharts));
  setTimeout(resizeCharts, 320);
}

function toTitleCase(value = '') {
  const text = String(value).trim();
  if (text.toUpperCase() === 'UNK') {
    return text;
  }
  return text
    .toLowerCase()
    .replace(/(^|[\s'-])\p{L}/gu, (match) => match.toUpperCase());
}

export function setupPanel() {
  const panel = document.querySelector('#panel');
  const closeButton = document.querySelector('#closeBtn');
  const title = document.querySelector('#panel-title');
  const kicker = document.querySelector('#panel-kicker');
  const metadata = document.querySelector('#lakeMeta');
  const hint = document.querySelector('#hint');
  const bookmarks = [...document.querySelectorAll('.plot-bookmark')];

  let currentMeta = null;
  let activePlot = 'lic';

  function clearUrl() {
    const url = new URL(location.href);
    url.searchParams.delete('lake_id');
    history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }

  function open() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    scheduleChartResize();
  }

  function clear() {
    for (const id of PLOT_IDS) {
      const element = document.getElementById(id);
      safeDisposeEChart(element);
      element.innerHTML = '';
    }
    kicker.textContent = 'Lake identifier';
    title.textContent = 'Lake details';
    metadata.innerHTML = '';
    hint.textContent = '';
    currentMeta = null;
  }

  function close({updateHistory = true} = {}) {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    clear();
    clearHighlight();
    if (updateHistory) clearUrl();
  }

  function showPlotContainers(type) {
    const lic = type === 'lic';
    document.querySelector('#plot-lic-scatter').hidden = !lic;
    document.querySelector('#plot-lic-agg').hidden = !lic;
    document.querySelector('#plot-lip-scatter').hidden = lic;
    document.querySelector('#plot-lip-table').hidden = lic;
  }

  async function renderActivePlot() {
    if (!currentMeta) return;
    const id = currentMeta.OBJECT_ID || currentMeta.lake_id;
    showPlotContainers(activePlot);

    if (activePlot === 'lic') await renderLicPlots(id);
    else await renderLipPlots(id);

    scheduleChartResize();
  }

  function renderMetadata(meta) {
    const fields = [
      ['Country', meta.REX || '-'],
      ['Area', meta.AREA_GEO ? `${(meta.AREA_GEO / 1e6).toFixed(1)} km²` : '-'],
      ['Perimeter', meta.PERIMETER ? `${(meta.PERIMETER / 1e3).toFixed(1)} km` : '-'],
      ['Altitude', meta.ALTITUDE ? `${Number(meta.ALTITUDE).toFixed(1)} m a.s.l.` : '-'],
      [
        'Lake type',
        meta.LKE_TYPE === 'N'
          ? 'Natural'
          : meta.LKE_TYPE === 'R'
            ? 'Reservoir'
            : meta.LKE_TYPE === 'U'
              ? 'Unknown'
              : '-',
      ],
      ['In-/outflows', `${meta.LAKIN} / ${meta.LAKOUT}`],
    ];

    metadata.innerHTML = fields.map(([label, value]) => `
      <div class="meta-card">
        <span>${label}</span>
        <strong>${value}</strong>
      </div>
    `).join('');
  }

  async function render(meta) {
    currentMeta = meta;
    window.currentMeta = meta;
    kicker.textContent = meta.OBJECT_ID || '-';
    title.textContent = toTitleCase(meta.NAM) || '-';
    renderMetadata(meta);
    await renderActivePlot();
  }

  bookmarks.forEach((button) => {
    button.addEventListener('click', async () => {
      activePlot = button.dataset.plot;
      bookmarks.forEach((item) => item.classList.toggle('active', item === button));
      await renderActivePlot();
    });
  });

  closeButton.addEventListener('click', () => close());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && panel.classList.contains('open')) close();
  });
  window.addEventListener('resize', scheduleChartResize);

  return {open, close, clear, render, resize: scheduleChartResize};
}
