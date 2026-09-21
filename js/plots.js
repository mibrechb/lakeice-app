import { fetchCSV } from './utils/data.js';

const DAY_MS = 86400000;
const INITIAL_LIC_WINDOW_DAYS = 730;

const LIC_MODEL_GROUPS = [
  {
    key:'s1',
    label:'Sentinel-1',
    symbol:'diamond',
    color:'#5f7fd3',
  },
  {
    key:'s2',
    label:'Sentinel-2',
    symbol:'circle',
    color:'#8ccc7c',
  },
  {
    key:'landsat',
    label:'Landsat',
    symbol:'triangle',
    color:'#f2c45e',
  },
  {
    key:'ecostress',
    label:'ECOSTRESS',
    symbol:'rect',
    color:'#ef7474',
  },
];

const LIC_MARKER_SIZE = 9;
const resizeObservers = new WeakMap();

export function safeDisposeEChart(el) {
  /** Safely dispose an ECharts instance and its ResizeObserver. */
  if (!el) return;

  resizeObservers.get(el)?.disconnect();
  resizeObservers.delete(el);

  const chart = echarts.getInstanceByDom(el);
  if (chart) {
    try {
      chart.dispose();
    } catch (_) {
      // The panel DOM may already have been replaced.
    }
  }
}

function observeChartResize(el, chart) {
  resizeObservers.get(el)?.disconnect();

  const observer = new ResizeObserver(() => {
    if (!chart.isDisposed()) chart.resize();
  });
  observer.observe(el);
  resizeObservers.set(el, observer);
}

function cssVar(name, fallback = '') {
  const style = getComputedStyle(document.body);
  let value = style.getPropertyValue(name).trim();

  // Compatibility with older plotting code.
  if (!value && name === '--boxfill') {
    value = style.getPropertyValue('--chart-bg').trim();
  }

  return value || fallback;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function dateToUTC(value) {
  if (!value) return NaN;

  const timestamp = Date.parse(
    `${String(value).slice(0, 10)}T00:00:00Z`,
  );
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function percent(value, digits = 1) {
  return Number.isFinite(value)
    ? `${value.toFixed(digits)}%`
    : '—';
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return null;
  if (sortedValues.length === 1) return sortedValues[0];

  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sortedValues[lower];

  const fraction = position - lower;
  return (
    sortedValues[lower] +
    (sortedValues[upper] - sortedValues[lower]) * fraction
  );
}

function normalizeLicData(rows) {
  /**
   * Convert the wide Stage-1 / Stage-2 CSV into plotting-oriented data.
   *
   * Stage 1 = sparse satellite-observation estimates.
   * Stage 2 = daily harmonized/interpolated estimate.
   */
  const observations = Object.fromEntries(
    LIC_MODEL_GROUPS.map(({key}) => [key, []]),
  );
  const harmonized = [];
  const harmonizedByTimestamp = new Map();

  for (const row of rows) {
    const timestamp = dateToUTC(row.date);
    if (!Number.isFinite(timestamp)) continue;

    for (const model of LIC_MODEL_GROUPS) {
      const cover = numberOrNull(
        row[`${model.key}_ice_cover`],
      );
      if (cover === null) continue;

      observations[model.key].push({
        value:[timestamp, cover],
        timestamp,
        cover,
        probability:numberOrNull(
          row[`${model.key}_ice_probability`],
        ),
        coverage:numberOrNull(
          row[`${model.key}_data_coverage`],
        ),
        modelKey:model.key,
        modelLabel:model.label,
      });
    }

    const stage2Cover = numberOrNull(row.stage2_ice_cover);
    if (stage2Cover !== null) {
      const point = {
        value:[timestamp, stage2Cover],
        timestamp,
        cover:stage2Cover,
        probability:numberOrNull(
          row.stage2_ice_probability,
        ),
        coverage:numberOrNull(
          row.stage2_data_coverage,
        ),
      };

      harmonized.push(point);
      harmonizedByTimestamp.set(timestamp, point);
    }
  }

  for (const points of Object.values(observations)) {
    points.sort((a, b) => a.timestamp - b.timestamp);
  }
  harmonized.sort((a, b) => a.timestamp - b.timestamp);

  return {
    observations,
    harmonized,
    harmonizedByTimestamp,
  };
}

function licTimeExtent(data) {
  const timestamps = [
    ...data.harmonized.map(point => point.timestamp),
    ...LIC_MODEL_GROUPS.flatMap(
      model =>
        data.observations[model.key].map(
          point => point.timestamp,
        ),
    ),
  ].filter(Number.isFinite);

  if (!timestamps.length) return null;

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);

  return {
    min,
    max,
    initialMin:Math.max(
      min,
      max - INITIAL_LIC_WINDOW_DAYS * DAY_MS,
    ),
  };
}

function licGridColor() {
  return document.body.dataset.theme === 'dark'
    ? 'rgba(255,255,255,.09)'
    : 'rgba(0,0,0,.08)';
}

function formatStage1Tooltip(point, data) {
  const date = echarts.format.formatTime(
    'yyyy-MM-dd',
    point.timestamp,
  );
  const harmonized =
    data.harmonizedByTimestamp.get(point.timestamp);

  let html = `
    <b>${point.modelLabel}</b>
    <span style="opacity:.7">Stage 1</span><br>
    ${date}<br>
    Ice cover: <b>${percent(point.cover)}</b><br>
    Ice probability: ${percent(point.probability)}<br>
    Data coverage: ${percent(point.coverage)}
  `;

  if (harmonized) {
    html += `
      <div style="
        margin-top:7px;
        padding-top:6px;
        border-top:1px solid rgba(127,127,127,.35);
      ">
        <b>Harmonized daily</b>
        <span style="opacity:.7">Stage 2</span><br>
        Ice cover: <b>${percent(harmonized.cover)}</b><br>
        Ice probability: ${percent(harmonized.probability)}
      </div>
    `;
  }

  return html;
}

function formatStage2Tooltip(point) {
  const date = echarts.format.formatTime(
    'yyyy-MM-dd',
    point.timestamp,
  );

  return `
    <b>Harmonized daily</b>
    <span style="opacity:.7">Stage 2</span><br>
    ${date}<br>
    Ice cover: <b>${percent(point.cover)}</b><br>
    Ice probability: ${percent(point.probability)}<br>
    Data coverage: ${percent(point.coverage)}
  `;
}

function buildStage2Climatology(harmonized) {
  /**
   * Pool Stage-2 daily values by seasonal calendar day.
   * The seasonal axis runs Sep 1 -> Aug 31.
   *
   * A leap-year reference is used so Feb 29 has its own slot.
   */
  const byMonthDay = new Map();

  for (const point of harmonized) {
    const date = new Date(point.timestamp);
    const key = [
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');

    if (!byMonthDay.has(key)) byMonthDay.set(key, []);
    byMonthDay.get(key).push(point.cover);
  }

  // Sep 1, 1999 -> Aug 31, 2000 includes Feb 29.
  const start = Date.UTC(1999, 8, 1);
  const end = Date.UTC(2000, 7, 31);

  const days = [];
  for (
    let timestamp = start;
    timestamp <= end;
    timestamp += DAY_MS
  ) {
    const date = new Date(timestamp);
    const key = [
      String(date.getUTCMonth() + 1).padStart(2, '0'),
      String(date.getUTCDate()).padStart(2, '0'),
    ].join('-');

    const values = [...(byMonthDay.get(key) || [])]
      .filter(Number.isFinite)
      .sort((a, b) => a - b);

    days.push({
      key,
      timestamp,
      count:values.length,
      p05:quantile(values, .05),
      p25:quantile(values, .25),
      median:quantile(values, .50),
      p75:quantile(values, .75),
      p95:quantile(values, .95),
    });
  }

  return days;
}

function renderIceCoverPlot(el, data, opts = {}) {
  if (!el) return null;

  safeDisposeEChart(el);
  const chart = echarts.init(
    el,
    null,
    {renderer:'canvas'},
  );
  const extent = licTimeExtent(data);

  if (!extent || !data.harmonized.length) {
    chart.dispose();
    el.innerHTML =
      '<div style="padding:24px;text-align:center;">No lake ice cover data available.</div>';
    return null;
  }

  const axisColor = cssVar('--muted', '#6d7b84');
  const textColor = cssVar('--text', '#25323b');
  const bgColor = cssVar('--chart-bg', '#ffffff');
  const iceFill = cssVar('--accent', '#1597c5');
  const iceStroke = cssVar(
    '--panel-lake-icon-color',
    cssVar('--accent-strong', '#08769e'),
  );

  const legendData = [
    {
      name:'Harmonized daily',
      icon:'path://M0 4 H24 V6 H0 Z',
    },
    ...LIC_MODEL_GROUPS.map(model => ({
      name:model.label,
      icon:model.symbol,
    })),
  ];

  const stage1Series = LIC_MODEL_GROUPS.map(model => ({
    name:model.label,
    type:'scatter',
    xAxisIndex:0,
    yAxisIndex:0,
    data:data.observations[model.key],
    symbol:model.symbol,
    symbolSize:LIC_MARKER_SIZE,
    itemStyle:{
      color:model.color,
      borderColor:bgColor,
      borderWidth:1.25,
      opacity:.96,
    },
    emphasis:{
      scale:1.45,
      itemStyle:{
        borderColor:textColor,
        borderWidth:1.5,
      },
    },
    z:6,
    clip:true,
  }));

  chart.setOption({
    backgroundColor:bgColor,
    animation:false,
    legend:{
      top:8,
      left:'center',
      orient:'horizontal',
      itemWidth:LIC_MARKER_SIZE,
      itemHeight:LIC_MARKER_SIZE,
      itemGap:14,
      textStyle:{color:textColor},
      data:legendData,
    },
    grid:{
      top:44,
      right:14,
      bottom:72,
      left:54,
    },
    xAxis:{
      type:'time',
      boundaryGap:false,
      min:extent.min,
      max:extent.max,
      axisLine:{
        lineStyle:{color:axisColor},
      },
      axisLabel:{color:textColor},
      splitLine:{
        show:true,
        lineStyle:{color:licGridColor()},
      },
    },
    yAxis:{
      type:'value',
      name:'Lake Ice Cover (%)',
      nameLocation:'middle',
      nameGap:38,
      min:0,
      max:100,
      axisLine:{
        lineStyle:{color:axisColor},
      },
      axisLabel:{color:textColor},
      splitLine:{
        show:true,
        lineStyle:{color:licGridColor()},
      },
    },
    tooltip:{
      trigger:'item',
      confine:true,
      formatter(params) {
        if (params.seriesName === 'Harmonized daily') {
          return formatStage2Tooltip(params.data);
        }
        return formatStage1Tooltip(params.data, data);
      },
    },
    dataZoom:[
      {
        type:'inside',
        xAxisIndex:0,
        filterMode:'none',
        startValue:extent.initialMin,
        endValue:extent.max,
      },
      {
        type:'slider',
        xAxisIndex:0,
        height:24,
        bottom:18,
        filterMode:'none',
        showDataShadow:false,
        borderColor:'transparent',
        backgroundColor:'rgba(127,127,127,.08)',
        fillerColor:'rgba(21,151,197,.22)',
        handleSize:13,
        textStyle:{color:textColor},
        startValue:extent.initialMin,
        endValue:extent.max,
      },
    ],
    series:[
      {
        name:'Harmonized daily',
        type:'line',
        data:data.harmonized,
        symbol:'none',
        showSymbol:false,
        connectNulls:false,
        smooth:false,
        clip:true,
        lineStyle:{
          width:2.5,
          color:iceStroke,
        },
        itemStyle:{color:iceStroke},
        areaStyle:{
          color:iceFill,
          opacity:.18,
        },
        z:2,
      },
      ...stage1Series,
    ],
    toolbox:{
      show:true,
      feature:{
        saveAsImage:{
          show:true,
          title:'export',
          pixelRatio:3,
          name:`lic_${opts.lakeId}`,
        },
      },
      right:8,
      top:2,
    },
  }, true);

  observeChartResize(el, chart);
  return chart;
}

function renderStage2ClimatologyPlot(el, data, opts = {}) {
  if (!el) return null;

  safeDisposeEChart(el);
  const chart = echarts.init(
    el,
    null,
    {renderer:'canvas'},
  );

  const climatology = buildStage2Climatology(
    data.harmonized,
  );

  if (!climatology.some(day => day.count > 0)) {
    chart.dispose();
    el.innerHTML =
      '<div style="padding:24px;text-align:center;">No harmonized climatology available.</div>';
    return null;
  }

  const textColor = cssVar('--text', '#25323b');
  const axisColor = cssVar('--muted', '#6d7b84');
  const bgColor = cssVar('--chart-bg', '#ffffff');
  const iceFill = cssVar('--accent', '#1597c5');
  const iceStroke = cssVar(
    '--panel-lake-icon-color',
    cssVar('--accent-strong', '#08769e'),
  );

  const categories = climatology.map(day =>
    new Date(day.timestamp).toISOString(),
  );

  const p05 = climatology.map(day => day.p05);
  const p25 = climatology.map(day => day.p25);
  const median = climatology.map(day => day.median);
  const p75MinusP25 = climatology.map(day =>
    day.p25 === null || day.p75 === null
      ? null
      : day.p75 - day.p25,
  );
  const p95MinusP05 = climatology.map(day =>
    day.p05 === null || day.p95 === null
      ? null
      : day.p95 - day.p05,
  );

  function monthLabel(value) {
    const date = new Date(value);
    return date.getUTCDate() === 1
      ? date.toLocaleString(
          'en-US',
          {month:'short', timeZone:'UTC'},
        )
      : '';
  }

  function isMonthStart(index) {
    const date = new Date(categories[index]);
    return date.getUTCDate() === 1;
  }

  chart.setOption({
    backgroundColor:bgColor,
    animation:false,
    legend:{
      top:8,
      left:'center',
      itemWidth:10,
      itemHeight:8,
      itemGap:18,
      textStyle:{color:textColor},
      data:[
        {
          name:'Median',
          icon:'path://M0 4 H24 V6 H0 Z',
        },
        {
          name:'25–75%',
          icon:'rect',
        },
        {
          name:'5–95%',
          icon:'rect',
        },
      ],
    },
    grid:{
      top:44,
      right:14,
      bottom:38,
      left:54,
    },
    xAxis:{
      type:'category',
      data:categories,
      boundaryGap:false,
      axisLine:{
        lineStyle:{color:axisColor},
      },
      axisLabel:{
        color:textColor,
        interval:0,
        formatter:monthLabel,
      },
      axisTick:{
        show:true,
        alignWithLabel:true,
        interval:index => isMonthStart(index),
      },
      splitLine:{
        show:true,
        interval:index => isMonthStart(index),
        lineStyle:{color:licGridColor()},
      },
    },
    yAxis:{
      type:'value',
      name:'Lake Ice Cover (%)',
      nameLocation:'middle',
      nameGap:38,
      min:0,
      max:100,
      axisLine:{
        lineStyle:{color:axisColor},
      },
      axisLabel:{color:textColor},
      splitLine:{
        show:true,
        lineStyle:{color:licGridColor()},
      },
    },
    tooltip:{
      trigger:'axis',
      confine:true,
      formatter(params) {
        if (!params.length) return '';

        const index = params[0].dataIndex;
        const day = climatology[index];
        const date = new Date(day.timestamp);
        const label = date.toLocaleDateString(
          'en-US',
          {
            month:'short',
            day:'numeric',
            timeZone:'UTC',
          },
        );

        return `
          <b>${label}</b><br>
          Median: <b>${percent(day.median)}</b><br>
          25–75%: ${percent(day.p25)} – ${percent(day.p75)}<br>
          5–95%: ${percent(day.p05)} – ${percent(day.p95)}<br>
          Seasons contributing: ${day.count}
        `;
      },
    },
    series:[
      // Invisible lower boundary for the 5–95% stacked band.
      {
        name:'__p05',
        type:'line',
        stack:'outer-band',
        data:p05,
        symbol:'none',
        showSymbol:false,
        silent:true,
        lineStyle:{width:0, opacity:0},
        areaStyle:{opacity:0},
        tooltip:{show:false},
        z:0,
      },
      {
        name:'5–95%',
        type:'line',
        stack:'outer-band',
        data:p95MinusP05,
        symbol:'none',
        showSymbol:false,
        silent:true,
        lineStyle:{width:0, opacity:0},
        areaStyle:{
          color:iceFill,
          opacity:.10,
        },
        itemStyle:{color:iceFill},
        tooltip:{show:false},
        z:0,
      },

      // Invisible lower boundary for the 25–75% stacked band.
      {
        name:'__p25',
        type:'line',
        stack:'inner-band',
        data:p25,
        symbol:'none',
        showSymbol:false,
        silent:true,
        lineStyle:{width:0, opacity:0},
        areaStyle:{opacity:0},
        tooltip:{show:false},
        z:1,
      },
      {
        name:'25–75%',
        type:'line',
        stack:'inner-band',
        data:p75MinusP25,
        symbol:'none',
        showSymbol:false,
        silent:true,
        lineStyle:{width:0, opacity:0},
        areaStyle:{
          color:iceFill,
          opacity:.24,
        },
        itemStyle:{color:iceFill},
        tooltip:{show:false},
        z:1,
      },
      {
        name:'Median',
        type:'line',
        data:median,
        symbol:'none',
        showSymbol:false,
        connectNulls:false,
        lineStyle:{
          width:2.5,
          color:iceStroke,
        },
        itemStyle:{color:iceStroke},
        z:3,
      },
    ],
    toolbox:{
      show:true,
      feature:{
        saveAsImage:{
          show:true,
          title:'Export',
          pixelRatio:3,
          name:`lic_climatology_${opts.lakeId}`,
        },
      },
      right:8,
      top:2,
    },
  }, true);

  observeChartResize(el, chart);
  return chart;
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
    backgroundColor: cssVar('--chart-bg', '#ffffff'),
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
  /** Render Stage-1 observations and Stage-2 lake-ice products. */
  console.log('Rendering LIC plots for lake:', lakeId);

  const mainEl = document.getElementById('plot-lic-scatter');
  const climatologyEl = document.getElementById('plot-lic-agg');

  try {
    const rows = await fetchCSV(
      `./data/timeseries/${lakeId}.csv`,
    );
    const data = normalizeLicData(rows);

    renderIceCoverPlot(mainEl, data, {lakeId});
    renderStage2ClimatologyPlot(
      climatologyEl,
      data,
      {lakeId},
    );
  } catch (err) {
    console.error('Error rendering LIC plots:', err);

    if (mainEl) {
      mainEl.innerHTML =
        '<div style="padding:24px;text-align:center;">No timeseries data available.</div>';
    }
    if (climatologyEl) {
      climatologyEl.innerHTML =
        '<div style="padding:24px;text-align:center;">No timeseries data available.</div>';
    }
  }
}

export async function renderLipPlots(lakeId) {
  /** Render plots for lake ice phenology tab. */
  console.log('Rendering LIP plots for lake:', lakeId);
  try {
    const rows = await fetchCSV(`./data/phenology/${lakeId}.csv`);
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