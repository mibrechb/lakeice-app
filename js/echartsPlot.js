export function showEChartPlot(title, dates, values, sensors = []) {
  const el = document.getElementById('plot');
  let chart = echarts.getInstanceByDom(el);
  if (!chart) chart = echarts.init(el, null, { renderer:'canvas' });

  // Detect theme
  const isDark = document.body.classList.contains('theme-light') ? false : true;
  const axisColor   = isDark ? '#cbd5e1' : '#334155';
  const gridColor   = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const textColor   = axisColor;
  const bgColor     = isDark ? '#0b1220' : '#ffffff';
  const areaLineCol = isDark ? '#38bdf8' : '#0ea5e9';
  const areaFillCol = isDark ? 'rgba(56,189,248,0.18)' : 'rgba(14,165,233,0.18)';
  const sensorColors = {
    'Sentinel-1': isDark ? '#22c55e' : '#16a34a',
    'Sentinel-2': isDark ? '#eab308' : '#d97706',
    'Landsat':    isDark ? '#f472b6' : '#db2777'
  };

  // Prepare data
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
  for (let i = 0; i < dates.length; i++) {
    const t = toUTCTs(dates[i]);
    const v = Number(values[i]);
    if (Number.isFinite(t) && Number.isFinite(v)) rows.push([t, v, sensors[i] || null]);
  }
  if (!rows.length) return;
  rows.sort((a,b)=>a[0]-b[0]);
  const data = [];
  let lastT;
  for (const r of rows) { if (r[0] !== lastT) { data.push(r); lastT = r[0]; } }

  const minTs = data[0][0], maxTs = data[data.length-1][0];
  const oneYear = 365*24*3600*1000;
  const windowStart = Math.max(minTs, maxTs - oneYear);

  // Sensor scatters
  const by = {};
  for (const [t,v,s] of data) { if (s) (by[s] ||= []).push([t,v]); }
  const scatterSeries = Object.keys(by).map(name => ({
    type:'scatter', name,
    xAxisIndex:0, yAxisIndex:0, data: by[name],
    symbolSize:6, itemStyle:{ color: sensorColors[name] || '#64748b' },
    z:2, clip:true
  }));

  chart.setOption({
    backgroundColor: bgColor,
    title: { text: title, left:'center', textStyle:{ color:textColor, fontSize:14 } },
    legend: { top:6, left:6, textStyle:{ color:textColor }, show: scatterSeries.length>0 },
    dataset: [{ source: data }],
    grid: [
      { top:36, right:10, bottom:92, left:52 },
      { height:46, left:52, right:10, bottom:26 }
    ],
    xAxis: [
      { type:'time', gridIndex:0, boundaryGap:false,
        axisLine:{ lineStyle:{ color:axisColor } },
        axisLabel:{ color:textColor },
        splitLine:{ show:true, lineStyle:{ color:gridColor } } },
      { type:'time', gridIndex:1, boundaryGap:false,
        axisLine:{ lineStyle:{ color:axisColor } },
        axisLabel:{ color:textColor, formatter:'{yyyy}' },
        splitLine:{ show:true, lineStyle:{ color:gridColor } } }
    ],
    yAxis: [
      { type:'value', gridIndex:0,
        axisLine:{ lineStyle:{ color:axisColor } },
        axisLabel:{ color:textColor },
        splitLine:{ show:true, lineStyle:{ color:gridColor } } },
      { type:'value', gridIndex:1, show:false }
    ],
    tooltip: {
      trigger:'axis',
      axisPointer:{ type:'cross' },
      valueFormatter: v => (v==null?'':Number(v).toFixed(2))
    },
    dataZoom: [
      { type:'inside', xAxisIndex:0, filterMode:'none',
        startValue: windowStart, endValue: maxTs },
      { type:'slider', xAxisIndex:0, height:28, bottom:2,
        showDataShadow:false, borderColor:'transparent',
        backgroundColor: isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.04)',
        fillerColor:     isDark?'rgba(56,189,248,0.25)':'rgba(14,165,233,0.25)',
        handleSize:14, textStyle:{ color:textColor },
        startValue: windowStart, endValue: maxTs }
    ],
    brush: {
      toolbox: false,
      xAxisIndex: 1,
      brushMode: 'single',
      brushType: 'lineX',
      transformable: false,
      throttleType: 'debounce', throttleDelay: 40,
      brushStyle: { color: 'rgba(100,100,100,0.18)', borderWidth: 0 }
    },
    series: [
      { type:'line', name:'Ice cover', xAxisIndex:0, yAxisIndex:0,
        showSymbol:false, smooth:false, connectNulls:true, clip:true,
        encode:{ x:0, y:1 },
        lineStyle:{ width:2, color:areaLineCol },
        areaStyle:{ color:areaFillCol },
        z:1 },
      { id:'mini-area', type:'line', name:'Overview', xAxisIndex:1, yAxisIndex:1,
        showSymbol:false, smooth:false, connectNulls:true, silent:true, clip:true,
        encode:{ x:0, y:1 },
        lineStyle:{ width:1, color:areaLineCol },
        areaStyle:{ color:areaFillCol, opacity:0.5 },
        z:0 },
      ...scatterSeries
    ]
  }, true);

  // Brush and zoom sync logic (optional, as in your example)
  function setMainWindow(start, end) {
    chart.dispatchAction({
      type: 'dataZoom',
      xAxisIndex: 0,
      startValue: start,
      endValue: end
    });
  }
  chart.dispatchAction({
    type: 'brush',
    areas: [{
      brushType: 'lineX',
      xAxisIndex: 1,
      coordRange: [windowStart, maxTs]
    }]
  });
  chart.off('brushEnd');
  chart.on('brushEnd', (e) => {
    try {
      const area = (e.batch && e.batch[0] && e.batch[0].areas && e.batch[0].areas[0]);
      if (!area || !area.coordRange) return;
      const [start, end] = area.coordRange;
      setMainWindow(start, end);
    } catch {}
  });
  chart.off('dataZoom');
  chart.on('dataZoom', () => {
    const opt = chart.getOption();
    const dzList = opt.dataZoom || [];
    const dz = dzList.find(z => z.xAxisIndex === 0 || (Array.isArray(z.xAxisIndex) && z.xAxisIndex.includes(0)));
    let start = windowStart, end = maxTs;
    if (dz) {
      if (dz.startValue != null) start = dz.startValue; else if (dz.start != null) start = minTs + (maxTs-minTs)*(dz.start/100);
      if (dz.endValue   != null) end   = dz.endValue;   else if (dz.end   != null) end   = minTs + (maxTs-minTs)*(dz.end/100);
    }
    chart.dispatchAction({
      type: 'brush',
      areas: [{
        brushType: 'lineX',
        xAxisIndex: 1,
        coordRange: [start, end]
      }]
    });
  });

  window.addEventListener('resize', () => chart.resize(), { passive:true });
}