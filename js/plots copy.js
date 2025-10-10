import { fetchCSV } from './utils/data.js';

export function safeDisposeEChart(el) {
  /** Safely disposes an ECharts 
   * instance attached to the given DOM element. */
  if (!el || !document.body.contains(el)) return;
  const chart = echarts.getInstanceByDom(el);
  if (chart) {
    try {
      chart.dispose();
    } catch (err) {
      // console.log('Error disposing chart:', err);
    }
  }
}


function cssVar(name, fallback) {
  /** Get CSS variable value. */
  const value = getComputedStyle(document.body).getPropertyValue(name).trim();
  if (!value) {
    console.warn(`CSS variable ${name} is missing, using fallback: ${fallback}`);
  }
  return value || fallback;
}

function computeYearlyStats(ts) {
  /** Compute yearly statistics timeseries data. */
  const byDay = {};
  ts.forEach(r => {
    const date = new Date(r.dt64);
    const doy = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
    if (!byDay[doy]) byDay[doy] = [];
    byDay[doy].push(+r.lic);
  });
  const stats = [];
  for (let doy = 1; doy <= 366; doy++) {
    const vals = byDay[doy] || [];
    if (vals.length === 0) continue;
    vals.sort((a, b) => a - b);
    const p = q => vals[Math.floor(q * vals.length)];
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
    stats.push({
      doy,
      mean,
      min: vals[0],
      max: vals[vals.length - 1],
      p5: p(0.05),
      p25: p(0.25),
      p75: p(0.75),
      p95: p(0.95)
    });
  }
  return stats;
}

function renderYearlyPercentilePlot(el, ts) {
  /** Render aggregated yearly lake ice cover percentile plot. */
  if (!el) return;
  safeDisposeEChart(el);
  const chart = echarts.init(el, null, { renderer: 'canvas' });

  const stats = computeYearlyStats(ts);
  if (!stats.length) return;

  function shiftedDate(doy) {
    if (doy < 214) return new Date(Date.UTC(2000, 0, doy + 365));
    return new Date(Date.UTC(2000, 0, doy));
  }
  const x = stats.map(p => shiftedDate(p.doy));
  let xCats = x.map(d => d.toISOString());

  // Define y-data arrays FIRST
  let mean = stats.map(p => p.mean);
  let min = stats.map(p => p.min);
  let max = stats.map(p => p.max);
  let p5 = stats.map(p => p.p5);
  let p25 = stats.map(p => p.p25);
  let p75 = stats.map(p => p.p75);
  let p95 = stats.map(p => p.p95);

  // Offset xCats so it starts at August 1
  const augIdx = xCats.findIndex(s => {
    const d = new Date(s);
    return d.getUTCMonth() === 7 && d.getUTCDate() === 1;
  });
  if (augIdx > 0) {
    xCats = xCats.slice(augIdx).concat(xCats.slice(0, augIdx));
    // Rotate all y-data arrays to match xCats
    function rotate(arr) {
      return arr.slice(augIdx).concat(arr.slice(0, augIdx));
    }
    mean = rotate(mean);
    min = rotate(min);
    max = rotate(max);
    p5 = rotate(p5);
    p25 = rotate(p25);
    p75 = rotate(p75);
    p95 = rotate(p95);
  }

  const isDark = !document.body.classList.contains('theme-light');
  const axisColor = cssVar('--text');
  const textColor = cssVar('--text');
  const bgColor = cssVar('--boxfill');
  const lineCol = cssVar('--accent');
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const darkGrey = isDark ? '#334155' : '#64748b';
  const lightGrey = isDark ? '#64748b' : '#cbd5e1';

  // Helper for tick/grid/label intervals
  const isFirstOfMonthIdx = (idx) => {
    const d = new Date(xCats[idx]);
    return d.getUTCDate() === 1;
  };

  const xAxisCfg = {
    type: 'category',
    data: xCats,
    boundaryGap: false,
    axisLine: { lineStyle: { color: axisColor } },
    axisLabel: {
      color: textColor,
      hideOverlap: true,
      showMinLabel: true,
      showMaxLabel: false,
      interval: 0, // <-- Show every  label, then filter with formatter
      formatter: (value) => {
        const d = new Date(value);
        return d.getUTCDate() === 1
          ? d.toLocaleString('en-US', { month: 'short' })
          : '';
      }
    },
    axisTick: {
      show: true,
      alignWithLabel: true,
      length: 6,
      interval: (idx) => isFirstOfMonthIdx(idx)
    },
    splitLine: {
      show: true,
      lineStyle: { color: gridColor },
      interval: (idx) => isFirstOfMonthIdx(idx)
    }
  };

  chart.setOption({
    backgroundColor: bgColor,
    title: {
      text: 'Average Ice Year (2016-2025)',
      left: 'center',
      textStyle: { color: textColor, fontSize: 14 }
    },
    legend: {
      top: 25,
      left: 'center',
      orient: 'horizontal',
      textStyle: { color: textColor },
      show: true
    },
    grid: [{ top: 65, right: 10, bottom: 40, left: 52 }],
    xAxis: [xAxisCfg],
    yAxis: [{
      type: 'value',
      name: 'Lake Ice Cover (%)',
      nameLocation: 'middle',
      nameGap: 36,
      min: 0,
      max: 100,
      axisLine: { lineStyle: { color: axisColor } },
      axisLabel: { color: textColor },
      splitLine: { show: true, lineStyle: { color: gridColor } }
    }],
    tooltip: {
      trigger: 'axis',
      valueFormatter: v => (v == null ? '' : Number(v).toFixed(2))
    },
    series: [
      {
        type: 'line',
        name: '5–95%',
        data: p95,
        lineStyle: { width: 0 },
        showSymbol: false,
        areaStyle: { color: lightGrey, opacity: 0.25 },
        z: 0,
        symbol: 'rect',
        showInLegend: true,
        itemStyle: { color: lightGrey }
      },
      {
        type: 'line',
        data: p5,
        lineStyle: { width: 0 },
        showSymbol: false,
        areaStyle: { color: bgColor, opacity: 1 },
        z: 0,
        showInLegend: false
      },
      {
        type: 'line',
        name: '25–75%',
        data: p75,
        lineStyle: { width: 0 },
        showSymbol: false,
        areaStyle: { color: darkGrey, opacity: 0.35 },
        z: 1,
        symbol: 'rect',
        showInLegend: true,
        itemStyle: { color: darkGrey }
      },
      {
        type: 'line',
        data: p25,
        lineStyle: { width: 0 },
        showSymbol: false,
        areaStyle: { color: bgColor, opacity: 1 },
        z: 1,
        showInLegend: false
      },
      {
        type: 'line',
        name: 'Min',
        data: min,
        lineStyle: { width: 1, color: '#000' },
        showSymbol: false,
        z: 2,
        symbol: 'line',
        showInLegend: true,
        itemStyle: { color: '#000' }
      },
      {
        type: 'line',
        name: 'Max',
        data: max,
        lineStyle: { width: 1, color: '#000' },
        showSymbol: false,
        z: 2,
        symbol: 'line',
        showInLegend: true,
        itemStyle: { color: '#000' }
      },
      {
        type: 'line',
        name: 'Mean',
        data: mean,
        lineStyle: { width: 2, color: lineCol },
        showSymbol: false,
        z: 3,
        symbol: 'line',
        showInLegend: true,
        itemStyle: { color: lineCol }
      }
    ],
    toolbox: {
      show: true,
      feature: {
        saveAsImage: { show: true, title: 'Export', pixelRatio: 2 }
      },
      right: 10,
      top: 10
    }
  }, true);

  window.addEventListener('resize', () => chart.resize(), { passive: true });
}

function renderIceCoverPlot(el, ts) {
  /** Render lake ice cover timeseries plot. */
  if (!el) return;
  safeDisposeEChart(el);
  const chart = echarts.init(el, null, { renderer: 'canvas' });

  // Prepare data
  const times = ts.map(r => r.dt64);
  const coverage = ts.map(r => r.lic);
  const sensors = ts.map(r => r.sensor);

  function toUTCTs(d) {
    if (typeof d === 'number') return d;
    if (d instanceof Date) return d.getTime();
    if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
      const [y, m, day] = d.split('-').map(Number);
      return Date.UTC(y, m - 1, day);
    }
    const t = Date.parse(d);
    return Number.isFinite(t) ? t : NaN;
  }

  const rows = [];
  for (let i = 0; i < times.length; i++) {
    const t = toUTCTs(times[i]);
    const v = Number(coverage[i]);
    if (Number.isFinite(t) && Number.isFinite(v)) rows.push([t, v, sensors[i] || null]);
  }
  if (!rows.length) {
    el.innerHTML = '';
    return;
  }
  rows.sort((a, b) => a[0] - b[0]);
  const data = [];
  let lastT;
  for (const r of rows) { if (r[0] !== lastT) { data.push(r); lastT = r[0]; } }

  const minTs = data[0][0], maxTs = data[data.length - 1][0];
  const oneYear = 365 * 24 * 3600 * 1000;
  const windowStart = Math.max(minTs, maxTs - 3*oneYear);

  // Detect theme and get CSS colors
  const isDark = !document.body.classList.contains('theme-light');
  const axisColor = cssVar('--muted');
  const textColor = cssVar('--text');
  const bgColor = cssVar('--boxfill');
  const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const areaLineCol = cssVar('--accent');
  const areaFillCol = isDark ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.18)';
  const sensorColors = {
    'Sentinel-1': isDark ? '#22c55e' : '#16a34a',
    'Sentinel-2': isDark ? '#eab308' : '#d97706',
    'Landsat-7':  isDark ? '#f472b6' : '#db2777',
    'Landsat-8':  isDark ? '#f472b6' : '#db2777',
    'Landsat-9':  isDark ? '#f472b6' : '#db2777'
  };

  // Build scatter series by sensor name
  const by = {};
  for (const [t, v, s] of data) {
    if (s) (by[s] ||= []).push([t, v]);
  }

  const scatterSeries = Object.keys(by).map(name => ({
    type: 'scatter',
    name,
    xAxisIndex: 0,
    yAxisIndex: 0,
    data: by[name],
    symbol: 'circle',
    symbolSize: 6,
    itemStyle: { color: sensorColors[name] || '#64748b' },
    z: 2,
    clip: true
  }));

  chart.setOption({
    backgroundColor: bgColor,
    title: { text: 'Lake Ice Coverage Over Time', left: 'center', textStyle: { color: textColor, fontSize: 14 } },
    legend: {
      top: 25,
      left: 'center',
      orient: 'horizontal',
      textStyle: { color: textColor },
      show: scatterSeries.length > 0
    },
    dataset: [{ source: data }],
    grid: [
      { top: 65, right: 10, bottom: 145, left: 52 },
      { height: 35, left: 52, right: 10, bottom: 75 }
    ],
    xAxis: [
      { type: 'time', gridIndex: 0, boundaryGap: false,
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor },
        splitLine: { show: true, lineStyle: { color: gridColor } } },
      { type: 'time', gridIndex: 1, boundaryGap: false,
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor, formatter: '{yyyy}' },
        splitLine: { show: true, lineStyle: { color: gridColor } } }
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        name: 'Lake Ice Cover (%)',
        nameLocation: 'middle',
        nameGap: 36,
        min: 0,           // <-- fixed minimum
        max: 100,         // <-- fixed maximum
        axisLine: { lineStyle: { color: axisColor } },
        axisLabel: { color: textColor },
        splitLine: { show: true, lineStyle: { color: gridColor } }
      },
      { type: 'value', gridIndex: 1, show: false }
    ],
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      valueFormatter: v => (v == null ? '' : Number(v).toFixed(2))
    },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none',
        startValue: windowStart, endValue: maxTs },
      { type: 'slider', xAxisIndex: 0, height: 28, bottom: 20,
        showDataShadow: false, borderColor: 'transparent',
        backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
        fillerColor: isDark ? 'rgba(56,189,248,0.25)' : 'rgba(14,165,233,0.25)',
        handleSize: 14, textStyle: { color: textColor },
        startValue: windowStart, endValue: maxTs }
    ],
    series: [
      { type: 'line', name: 'Ice cover', xAxisIndex: 0, yAxisIndex: 0,
        showSymbol: false, smooth: false, connectNulls: true, clip: true,
        encode: { x: 0, y: 1 },
        lineStyle: { width: 2, color: areaLineCol },
        areaStyle: { color: areaFillCol },
        z: 1 },
      { id: 'mini-area', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
        showSymbol: false, smooth: false, connectNulls: true, silent: true, clip: true,
        encode: { x: 0, y: 1 },
        lineStyle: { width: 1, color: areaLineCol },
        areaStyle: { color: areaFillCol, opacity: 0.5 },
        legendHoverLink: false, showInLegend: false,
        z: 0 },
      ...scatterSeries
    ],
    toolbox: {
      show: true,
      feature: {
        saveAsImage: { show: true, title: 'Export', pixelRatio: 2 }
      },
      right: 10,
      top: 10
    }
  }, true);

  window.addEventListener('resize', () => chart.resize(), { passive: true });
}

function enableInstantTooltips(tableSelector = '.plot-lip-table') {
  document.querySelectorAll(`${tableSelector} th[title]`).forEach(th => {
    th.addEventListener('mouseenter', function(e) {
      const tip = document.createElement('div');
      tip.className = 'custom-tooltip';
      tip.textContent = th.getAttribute('title');
      document.body.appendChild(tip);
      const rect = th.getBoundingClientRect();
      // Center above the th
      tip.style.left = (rect.left + rect.width / 2 - tip.offsetWidth / 2 + window.scrollX) + 'px';
      tip.style.top = (rect.top + window.scrollY - tip.offsetHeight - 8) + 'px';
      th._customTip = tip;
    });
    th.addEventListener('mouseleave', function(e) {
      if (th._customTip) th._customTip.remove();
      th._customTip = null;
    });
  });
}

export function renderPhenologyTable(el, rows) {
  /** Render lake ice phenology table. */
  el.innerHTML = '<div style="padding:24px;text-align:center;">Loading phenology data...</div>';
  try {
    if (!rows.length) {
      el.innerHTML = '<div style="padding:24px;text-align:center;">No phenology data available.</div>';
      return;
    }
    // Define columns: key, label, tooltip
    const headers = [
      { key: 'lip_year', label: 'Year', desc: 'Year of observation' },
      { key: 'FUS', label: 'FUS', desc: 'Freeze-up Start (YYYY-MM-DD)' },
      { key: 'FUE', label: 'FUE', desc: 'Freeze-up End (YYYY-MM-DD)' },
      { key: 'BUS', label: 'BUS', desc: 'Breakup-up Start (YYYY-MM-DD)' },
      { key: 'BUE', label: 'BUE', desc: 'Breakup-up End (YYYY-MM-DD)' },
      { key: 'ICD', label: 'ICD', desc: 'Incomplete Freeze Duration (days)' },
      { key: 'CFD', label: 'CFD', desc: 'Complete Freeze Duration (days)' }
    ];
    let html = '<table class="plot-lip-table"><thead><tr>' +
      headers.map(h => `<th title="${h.desc}">${h.label}</th>`).join('') +
      '</tr></thead><tbody>' +
      rows.map(row => '<tr>' +
        headers.map(h => {
          let val = row[h.key] ?? '';
          if (['ICD', 'CFD'].includes(h.key) && val !== '') val = parseInt(val, 10);
          return `<td>${val}</td>`;
        }).join('') +
      '</tr>').join('') +
      '</tbody></table>';
    el.innerHTML = `
      <div class="plot-lip-table-container">
        ${html}
      </div>
    `;
  } catch (err) {
    el.innerHTML = `<div style="padding:24px;text-align:center;color:red;">Error loading phenology data.</div>`;
  }
  enableInstantTooltips();
}

export function renderPhenologyScatter(el, rows) {
  /** Render lake ice phenology scatterplot. */
  if (!el) return;
  safeDisposeEChart(el);
  const chart = echarts.init(el, null, { renderer: 'canvas' });

  if (!rows || !rows.length) {
    el.innerHTML = '<div style="padding:24px;text-align:center;">No phenology data available.</div>';
    return;
  }

  // Build categorical x-axis: Aug 1 to July 31
  const start = new Date(Date.UTC(2000, 7, 1)); // Aug 1, 2000
  const xCats = [];
  for (let i = 0; i < 365; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    xCats.push(d.toISOString());
  }

  // Helper: find index in xCats for a given date string (YYYY-MM-DD)
  function dateToCatIdx(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    // Convert to Aug–Aug window (year doesn't matter, just month/day)
    const augYear = 2000 + (d.getUTCMonth() < 7 ? 1 : 0); // If before Aug, use next year
    const ref = new Date(Date.UTC(augYear, d.getUTCMonth(), d.getUTCDate()));
    const iso = ref.toISOString();
    return xCats.indexOf(iso);
  }

  // Build series data: [xIdx, year]
  const fus = [], fue = [], bus = [], bue = [];
  const years = rows.map(r => r.lip_year);
  rows.forEach(r => {
    const y = r.lip_year;
    const fusIdx = dateToCatIdx(r.FUS);
    const fueIdx = dateToCatIdx(r.FUE);
    const busIdx = dateToCatIdx(r.BUS);
    const bueIdx = dateToCatIdx(r.BUE);
    if (fusIdx !== null && fusIdx >= 0) fus.push([fusIdx, y]);
    if (fueIdx !== null && fueIdx >= 0) fue.push([fueIdx, y]);
    if (busIdx !== null && busIdx >= 0) bus.push([busIdx, y]);
    if (bueIdx !== null && bueIdx >= 0) bue.push([bueIdx, y]);
  });

  // Helper for tick/grid/label intervals
  const isFirstOfMonthIdx = (idx) => {
    const d = new Date(xCats[idx]);
    return d.getUTCDate() === 1;
  };

  chart.setOption({
    backgroundColor: cssVar('--boxfill'),
    title: {
      text: 'Lake Ice Phenology Events (Aug–Aug)',
      left: 'center',
      textStyle: {fontSize: 14, color: cssVar('--text')}
    },
    tooltip: {
      trigger: 'item',
      formatter: params => {
        const event = params.seriesName;
        const year = params.value[1];
        const idx = params.value[0];
        const d = new Date(xCats[idx]);
        const date = d.toLocaleDateString('en-US', {month: 'short', day: 'numeric'});
        return `<b>${event}</b><br>Year: ${year}<br>Date: ${date}`;
      }
    },
    legend: {
      top: 30,
      left: 'center',
      data: ['FUS', 'FUE', 'BUS', 'BUE'],
      textStyle: { color: cssVar('--text') }
    },
    grid: {top: 60, right: 20, bottom: 40, left: 60},
    xAxis: {
      type: 'category',
      data: xCats,
      boundaryGap: false,
      axisLine: { lineStyle: { color: cssVar('--muted') } },
      axisLabel: {
        color: cssVar('--text'),
        hideOverlap: true,
        showMinLabel: true,
        showMaxLabel: false,
        interval: 0,
        formatter: (value, idx) => {
          const d = new Date(value);
          return d.getUTCDate() === 1
            ? d.toLocaleString('en-US', { month: 'short' })
            : '';
        }
      },
      axisTick: {
        show: true,
        alignWithLabel: true,
        length: 6,
        interval: (idx) => isFirstOfMonthIdx(idx)
      },
      splitLine: {
        show: true,
        lineStyle: { color: cssVar('--muted') },
        interval: (idx) => isFirstOfMonthIdx(idx)
      }
    },
    yAxis: {
      type: 'category',
      name: 'Year',
      data: years,
      axisLabel: {fontWeight: 600, color: cssVar('--text')},
      axisLine: { lineStyle: { color: cssVar('--muted') } },
      splitLine: { show: true, lineStyle: { color: cssVar('--muted') } }
    },
    series: [
      {
        name: 'FUS',
        type: 'scatter',
        data: fus,
        symbol: 'circle',
        symbolSize: 12,
        itemStyle: {color: '#38bdf8'}
      },
      {
        name: 'FUE',
        type: 'scatter',
        data: fue,
        symbol: 'diamond',
        symbolSize: 12,
        itemStyle: {color: '#fbbf24'}
      },
      {
        name: 'BUS',
        type: 'scatter',
        data: bus,
        symbol: 'rect',
        symbolSize: 12,
        itemStyle: {color: '#22c55e'}
      },
      {
        name: 'BUE',
        type: 'scatter',
        data: bue,
        symbol: 'triangle',
        symbolSize: 12,
        itemStyle: {color: '#db2777'}
      }
    ],
    toolbox: {
      show: true,
      feature: {
        saveAsImage: { show: true, title: 'Export', pixelRatio: 2 }
      },
      right: 10,
      top: 10
    }
  }, true);

  el.style.height = '400px';
  window.addEventListener('resize', () => chart.resize(), { passive: true });
}

export async function renderLicPlots(lakeId) {
  /** Render plots for lake ice cover tab. */
  console.log('Rendering LIC plots for lake:', lakeId);
  try {
    const ts = await fetchCSV(`/data/timeseries/${lakeId}.csv`);
    // console.log('Fetched timeseries:', ts);
    renderIceCoverPlot(document.getElementById('plot-lic-scatter'), ts);
    renderYearlyPercentilePlot(document.getElementById('plot-lic-agg'), ts);
  } catch (err) {
    console.log('Error:', err);
    document.getElementById('plot-lic-scatter').innerHTML =
      '<div style="padding:24px;text-align:center;">No timeseries data available.</div>';
    document.getElementById('plot-lic-agg').innerHTML =
      '<div style="padding:24px;text-align:center;">No timeseries data available.</div>';
  }
}

export async function renderLipPlots(lakeId) {
  /** Render plots for lake ice phenology tab. */
  console.log('Rendering LIPplots for lake:', lakeId);
  try {
    const rows = await fetchCSV(`/data/phenology/${lakeId}.csv`);
    // console.log('Fetched table:', rows);
    renderPhenologyScatter(document.getElementById('plot-lip-scatter'), rows);
    renderPhenologyTable(document.getElementById('plot-lip-table'), rows);
  } catch (err) {
    console.log('Error:', err);
    document.getElementById('plot-lip-scatter').innerHTML =
      '<div style="padding:24px;text-align:center;">No phenology data available.</div>';
    document.getElementById('plot-lip-table').innerHTML =
      '<div style="padding:24px;text-align:center;">No phenology data available.</div>';
  }
}