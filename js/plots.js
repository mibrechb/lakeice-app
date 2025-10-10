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

function toUTC(dt) {
  // Accepts a date string or Date object, returns UTC timestamp (ms)
  if (!dt) return NaN;
  const d = typeof dt === 'string' ? new Date(dt) : dt;
  return Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate(),
    d.getUTCHours(),
    d.getUTCMinutes(),
    d.getUTCSeconds(),
    d.getUTCMilliseconds()
  );
}

function renderYearlyPercentilePlot(el, ts, opts={}) {
  /** Render aggregated yearly lake ice cover percentile plot. */
  if (!el) return;
  safeDisposeEChart(el);
  const chart = echarts.init(el, null, { renderer: 'canvas' });

  const stats = computeYearlyStats(ts);
  if (!stats.length) return;
  const years = ts.map(r => new Date(r.dt64).getUTCFullYear());

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
      text: `Average Ice Year (${Math.min(...years)}–${Math.max(...years)})`,
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
      // {
      //   type: 'line',
      //   name: '5–95%',
      //   data: p95,
      //   lineStyle: { width: 0 },
      //   showSymbol: false,
      //   areaStyle: { color: lightGrey, opacity: 0.25 },
      //   z: 0,
      //   symbol: 'rect',
      //   showInLegend: true,
      //   itemStyle: { color: lightGrey }
      // },
      // {
      //   type: 'line',
      //   data: p5,
      //   lineStyle: { width: 0 },
      //   showSymbol: false,
      //   areaStyle: { color: bgColor, opacity: 1 },
      //   z: 0,
      //   showInLegend: false
      // },
      // {
      //   type: 'line',
      //   name: '25–75%',
      //   data: p75,
      //   lineStyle: { width: 0 },
      //   showSymbol: false,
      //   areaStyle: { color: darkGrey, opacity: 0.35 },
      //   z: 1,
      //   symbol: 'rect',
      //   showInLegend: true,
      //   itemStyle: { color: darkGrey }
      // },
      // {
      //   type: 'line',
      //   data: p25,
      //   lineStyle: { width: 0 },
      //   showSymbol: false,
      //   areaStyle: { color: bgColor, opacity: 1 },
      //   z: 1,
      //   showInLegend: false
      // },
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
        saveAsImage: {
          show: true,
          title: 'Export',
          pixelRatio: 3,
          name: `lic_avg_${opts.lakeId}`
        }
      },
      right: 10,
      top: 10
    },
  }, true);

  window.addEventListener('resize', () => chart.resize(), { passive: true });
}

function renderIceCoverPlot(el, ts, opts={}) {
  if (!el) return;
  safeDisposeEChart(el);
  const chart = echarts.init(el, null, { renderer: 'canvas' });

  // Prepare data with sensortype
  const sensortype = r => r.sensor === 'Sentinel-1' ? 'radar' : 'optical/thermal';
  const data = ts.map(r => [
    toUTC(r.dt64),
    Number(r.lic),
    r.sensor,
    sensortype(r)
  ]).filter(row => Number.isFinite(row[0]) && Number.isFinite(row[1]));
  data.sort((a, b) => a[0] - b[0]);
  console.log('Data points:', data.length);

  // Find years and timestamps for initial zoom
  const years = ts.map(r => new Date(r.dt64).getUTCFullYear());
  const maxYear = Math.max(...years);
  const minYear = maxYear - 2;
  const allTimestamps = data.map(row => row[0]);
  const minZoomTs = allTimestamps.find(ts => {
    const y = new Date(ts).getUTCFullYear();
    return y >= minYear;
  }) ?? allTimestamps[0];
  const maxZoomTs = allTimestamps[allTimestamps.length - 1];

  chart.setOption({
    backgroundColor: cssVar('--boxfill'),
    title: { text: `Lake Ice Coverage (${Math.min(...years)}–${maxYear})`, left: 'center', textStyle: { color: cssVar('--text'), fontSize: 14 } },
    legend: {
      top: 25,
      left: 'center',
      orient: 'horizontal',
      textStyle: { color: cssVar('--text') },
      show: true
    },
    dataset: [{
      dimensions: ['timestamp', 'value', 'sensor', 'sensortype'],
      source: data
    }],
    grid: [
      { top: 65, right: 10, bottom: 145, left: 52 },
      { height: 35, left: 52, right: 10, bottom: 75 }
    ],
    xAxis: [
      { type: 'time', gridIndex: 0, boundaryGap: false,
        axisLine: { lineStyle: { color: cssVar('--muted') } },
        axisLabel: { color: cssVar('--text') },
        splitLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.08)' } } },
      { type: 'time', gridIndex: 1, boundaryGap: false,
        axisLine: { lineStyle: { color: cssVar('--muted') } },
        axisLabel: { color: cssVar('--text'), formatter: '{yyyy}' },
        splitLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.08)' } } }
    ],
    yAxis: [
      {
        type: 'value',
        gridIndex: 0,
        name: 'Lake Ice Cover (%)',
        nameLocation: 'middle',
        nameGap: 36,
        min: 0,
        max: 100.1,
        axisLine: { lineStyle: { color: cssVar('--muted') } },
        axisLabel: { color: cssVar('--text') },
        splitLine: { show: true, lineStyle: { color: 'rgba(0,0,0,0.08)' } }
      },
      { type: 'value', gridIndex: 1, show: false }
    ],
    tooltip: {
      trigger: 'item',
      formatter: function(params) {
        // params.data: [timestamp, value, sensor, sensortype]
        const date = echarts.format.formatTime('yyyy-MM-dd', params.data[0]);
        const value = params.data[1];
        const sensor = params.data[2];
        return `
          <b>${params.seriesName}</b><br>
          Sensor: ${sensor}<br>
          Date: ${date}<br>
          Ice Cover: ${value.toFixed(2)}%
        `;
      }
    },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        filterMode: 'none',
        startValue: minZoomTs,
        endValue: maxZoomTs
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 28,
        bottom: 20,
        showDataShadow: false,
        borderColor: 'transparent',
        backgroundColor: 'rgba(0,0,0,0.04)',
        fillerColor: 'rgba(14,165,233,0.25)',
        handleSize: 14,
        textStyle: { color: cssVar('--text') },
        startValue: minZoomTs,
        endValue: maxZoomTs
      }
    ],
    series: [
      {
        type: 'line',
        name: 'Ice cover',
        xAxisIndex: 0,
        yAxisIndex: 0,
        symbol: 'line',
        showSymbol: false,
        smooth: false,
        connectNulls: true,
        clip: true,
        encode: { x: 'timestamp', y: 'value' },
        lineStyle: { width: 2, color: cssVar('--accent') },
        areaStyle: { color: !document.body.classList.contains('theme-light') ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.18)' },
        z: 1
      },
      {
        type: 'scatter',
        name: 'radar',
        xAxisIndex: 0,
        yAxisIndex: 0,
        encode: { x: 'timestamp', y: 'value', tooltip: ['sensor', 'timestamp', 'value'] },
        datasetIndex: 0,
        symbol: 'diamond',
        symbolSize: 4,
        borderColor: cssVar('--border'),
        borderWidth: 1,
        itemStyle: { 
          color: !document.body.classList.contains('theme-light') ? 'black' : 'white',
          borderColor: cssVar('--text'),
          borderWidth: 1
        },        
        z: 2,
        clip: true,
        data: data.filter(row => row[3] === 'radar')
      },
      {
        type: 'scatter',
        name: 'optical/thermal',
        xAxisIndex: 0,
        yAxisIndex: 0,
        encode: { x: 'timestamp', y: 'value', tooltip: ['sensor', 'timestamp', 'value'] },
        datasetIndex: 0,
        symbol: 'circle',
        symbolSize: 4,
        itemStyle: { 
          color: !document.body.classList.contains('theme-light') ? 'black' : 'white',
          borderColor: cssVar('--text'),
          borderWidth: 1
        },
        z: 2,
        clip: true,
        data: data.filter(row => row[3] === 'optical/thermal')
      },
      // Miniview area plot
      {
        type: 'line',
        xAxisIndex: 1,
        yAxisIndex: 1,
        symbol: 'none',
        showSymbol: false,
        showInLegend: false, // Hide from legend
        legendHoverLink: false, // Prevent hover effect in legend
        smooth: true,
        connectNulls: true,
        clip: true,
        encode: { x: 'timestamp', y: 'value' },
        lineStyle: { width: 1, color: cssVar('--accent') },
        areaStyle: { color: cssVar('--accent'), opacity: 0.18 },
        z: 0
      }
    ],
    toolbox: {
      show: true,
      feature: {
        saveAsImage: {
          show: true,
          title: 'Export',
          pixelRatio: 3,
          name: `lic_${opts.lakeId}`
        }
      },
      right: 10,
      top: 10
    },
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

export function renderPhenologyTable(el, rows, opts={}) {
  /** Render lake ice phenology table. */
  el.innerHTML = '<div style="padding:24px;text-align:center;">Loading phenology data...</div>';
  try {
    if (!rows.length) {
      el.innerHTML = '<div style="padding:24px;text-align:center;">No phenology data available.</div>';
      return;
    }
    // Sort rows by year descending
    rows = [...rows].sort((a, b) => b.lip_year - a.lip_year);

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

export function renderPhenologyIntervals(el, rows, opts={}) {
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
    xCats.push(new Date(start.getTime() + i * 86400000).toISOString());
  }
  const years = rows.map(r => r.lip_year);

  function dateToCatIdx(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const augYear = 2000 + (d.getUTCMonth() < 7 ? 1 : 0);
    const ref = new Date(Date.UTC(augYear, d.getUTCMonth(), d.getUTCDate()));
    return xCats.indexOf(ref.toISOString());
  }

  // Prepare interval data for each year
  const fudBars = [], fdBars = [], budBars = [];
  const eventDots = [];
  rows.forEach(r => {
    const yIdx = years.indexOf(r.lip_year);
    const fusIdx = dateToCatIdx(r.FUS);
    const fueIdx = dateToCatIdx(r.FUE);
    const busIdx = dateToCatIdx(r.BUS);
    const bueIdx = dateToCatIdx(r.BUE);

    if (fusIdx !== null && fueIdx !== null && fusIdx < fueIdx) fudBars.push([yIdx, fusIdx, fueIdx]);
    if (fueIdx !== null && busIdx !== null && fueIdx < busIdx) fdBars.push([yIdx, fueIdx, busIdx]);
    if (busIdx !== null && bueIdx !== null && busIdx < bueIdx) budBars.push([yIdx, busIdx, bueIdx]);

    if (fusIdx !== null && fusIdx >= 0) eventDots.push({name: 'FUS', value: [fusIdx, yIdx]});
    if (fueIdx !== null && fueIdx >= 0) eventDots.push({name: 'FUE', value: [fueIdx, yIdx]});
    if (busIdx !== null && busIdx >= 0) eventDots.push({name: 'BUS', value: [busIdx, yIdx]});
    if (bueIdx !== null && bueIdx >= 0) eventDots.push({name: 'BUE', value: [bueIdx, yIdx]});
  });

  // Diagonal hatch decal generator
  function makeDiagonalHatch(bgColor) {
    return {
      symbol: 'line',
      dashArrayX: [4, 2],
      dashArrayY: [4, 2],
      color: 'black',
      backgroundColor: bgColor,
      rotation: Math.PI / 4
    };
  }

  function makeBarSeries(name, data, color, hatch = null, markLine = null) {
    const series = {
      name,
      type: 'custom',
      renderItem: function(params, api) {
        const yIdx = api.value(0);
        const xStart = api.value(1);
        const xEnd = api.value(2);
        const y = api.coord([0, yIdx])[1];
        const x0 = api.coord([xStart, yIdx])[0];
        const x1 = api.coord([xEnd, yIdx])[0];
        const barHeight = 18;
        return {
          type: 'rect',
          shape: {
            x: x0,
            y: y - barHeight / 2,
            width: x1 - x0,
            height: barHeight
          },
          style: {
            fill: color,
            opacity: 1,
            decal: hatch ? hatch : undefined
          }
        };
      },
      encode: { x: [1, 2], y: 0 },
      data
    };
    if (markLine) series.markLine = markLine;
    return series;
  }

  // Legend icons
  const hatchedLegendIcon =
    'path://' +
    // rectangle
    'M2 2 H14 V14 H2 Z ' +
    // 45° parallel hatches (all slope = 1)
    'M2 2 L14 14 ' +   // main
    'M6 2 L14 10 ' +
    'M10 2 L14 6 ' +
    'M2 6 L10 14 ' +
    'M2 10 L6 14';


  chart.setOption({
    backgroundColor: cssVar('--boxfill'),
    title: {
      text: 'Lake Ice Phenology',
      left: 'center',
      textStyle: { fontSize: 14, color: cssVar('--text') }
    },
    legend: {
      top: 30,
      left: 'center',
      data: [
        {
          name: 'Freeze-up',
          icon: hatchedLegendIcon,
          itemStyle: { color: 'lightgrey', borderColor: 'black', borderWidth:1}
        },
        {
          name: 'Frozen',
          icon: 'path://M2,2 h10 v10 h-10 Z',
          itemStyle: { color: cssVar('--accent') }
        },
        {
          name: 'Break-up',
          icon: hatchedLegendIcon,
          itemStyle: { color: 'lightgrey', borderColor: 'black', borderWidth:1}
        },
        {
          name: 'Event',
          icon: 'circle',
        }
      ],
      textStyle: { color: cssVar('--text') }
    },
    grid: { top: 60, right: 20, bottom: 40, left: 60 },
    tooltip: {
      trigger: 'item',
      formatter: function(params) {
        if (params.seriesType === 'scatter' && params.seriesName === 'Event') {
          const idx = params.value[0];
          const yearIdx = params.value[1];
          const year = years[yearIdx];
          const d = new Date(xCats[idx]);
          const dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const eventType = (() => {
            const dot = eventDots.find(e => e.value[0] === idx && e.value[1] === yearIdx);
            return dot ? dot.name : '';
          })();
          return `<b>${eventType}</b><br>Year: ${year}<br>Date: ${dateStr}`;
        }
        return null;
      }
    },
    xAxis: {
      type: 'category',
      data: xCats,
      boundaryGap: false,
      axisLabel: {
        color: cssVar('--text'),
        interval: 0, // Show all, then filter with formatter
        formatter: function(value, idx) {
          const d = new Date(value);
          // Only show month label for the 1st of each month
          return d.getUTCDate() === 1
            ? d.toLocaleString('en-US', { month: 'short' })
            : '';
        }
      },
      axisTick: {
        show: true,
        alignWithLabel: true,
        length: 6,
        interval: function(idx) {
          // Only show tick for the 1st of each month
          const d = new Date(xCats[idx]);
          return d.getUTCDate() === 1;
        }
      },
      splitLine: {
        show: true,
        lineStyle: { color: cssVar('--muted') },
        interval: function(idx) {
          // Only show grid line for the 1st of each month
          const d = new Date(xCats[idx]);
          return d.getUTCDate() === 1;
        }
      }
    },
    yAxis: {
      type: 'category',
      name: 'Year',
      data: years,
      axisLabel: { fontWeight: 600, color: cssVar('--text') },
      axisLine: { lineStyle: { color: cssVar('--muted') } },
      axisTick: {
        show: true,
        alignWithLabel: true // <-- This ensures ticks are at the category labels
      }
    },
    series: [
      makeBarSeries('Freeze-up', fudBars, 'lightgrey', makeDiagonalHatch('lightgrey')),
      makeBarSeries('Frozen', fdBars, cssVar('--accent'), null),
      makeBarSeries('Break-up', budBars, 'lightgrey', makeDiagonalHatch('lightgrey')),
      {
        name: 'Event',
        type: 'scatter',
        data: eventDots.map(d => d.value),
        symbol: 'circle',
        symbolSize: 8,
        itemStyle: { color: 'white', borderColor: 'black', borderWidth: 1.5 },
        z: 10
      }
    ],
    toolbox: {
      show: true,
      feature: {
        saveAsImage: {
          show: true,
          title: 'Export',
          pixelRatio: 3,
          name: `lip_${opts.lakeId}`
        }
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
    console.log('Fetched timeseries:', ts);
    renderIceCoverPlot(document.getElementById('plot-lic-scatter'), ts, {lakeId});
    renderYearlyPercentilePlot(document.getElementById('plot-lic-agg'), ts, {lakeId});
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
    renderPhenologyIntervals(document.getElementById('plot-lip-scatter'), rows, {lakeId});
    renderPhenologyTable(document.getElementById('plot-lip-table'), rows, {lakeId});
  } catch (err) {
    console.log('Error:', err);
    document.getElementById('plot-lip-scatter').innerHTML =
      '<div style="padding:24px;text-align:center;">No phenology data available.</div>';
    document.getElementById('plot-lip-table').innerHTML =
      '<div style="padding:24px;text-align:center;">No phenology data available.</div>';
  }
}