import { renderLicPlots, renderLipPlots } from './plots.js';
import { clearHighlight } from './map.js';
import { safeDisposeEChart } from './plots.js';

export function setupPanel(){
  const panel = document.getElementById('panel');
  const closeBtn = document.getElementById('closeBtn');

  function open(){ panel.classList.add('open'); panel.focus(); }
  function close(){ panel.classList.remove('open'); clear(); clearHighlight(); history.replaceState(null,'',location.pathname); }

  closeBtn.addEventListener('click', close);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') close(); });

  function clear(){
    safeDisposeEChart(document.getElementById('plot-lic-scatter'));
    safeDisposeEChart(document.getElementById('plot-lic-agg'));
    safeDisposeEChart(document.getElementById('plot-lip-scatter'));
    safeDisposeEChart(document.getElementById('plot-lip-table'));
    document.getElementById('panel-title').textContent = 'Lake details';
    document.getElementById('lakeMeta').innerHTML = '';
    document.getElementById('hint').textContent = '';
    document.getElementById('plot-lic-scatter').innerHTML = '';
    document.getElementById('plot-lic-agg').innerHTML = '';
    document.getElementById('plot-lip-scatter').innerHTML = '';
    document.getElementById('plot-lip-table').innerHTML = '';
  }

  function render(meta){
    window.currentMeta = meta;
    document.getElementById('panel-title').textContent = `${meta.NAM || meta.name || meta.lake_id || '-'}`;
    const lakeMeta = document.getElementById('lakeMeta');
    lakeMeta.innerHTML = '';
    const fields = [
      ['Lake Name', meta.NAM || '-'],
      ['Country', meta.REX || '-'],
      ['Lake Identifier (EU-Hydro)', meta.OBJECT_ID || '-'],
      ['Area (km²)', meta.AREA_GEO ? (meta.AREA_GEO / 1e6).toFixed(1) : '-'],
      ['Altitude (m a.s.l.)', meta.ALTITUDE ? Number(meta.ALTITUDE).toFixed(1) : '-'],
      ['Lake Type', meta.LKE_TYPE === 'N' ? 'Natural' : meta.LKE_TYPE === 'R' ? 'Reservoir' : meta.LKE_TYPE === 'U' ? 'Unknown' : '-']
    ];
    for(const [k,v] of fields){
      const div = document.createElement('div');
      div.className = 'card';
      div.innerHTML = `<div style="font-size:.78rem;color:var(--muted)">${k}</div><div style="font-weight:500">${v ?? '-'}</div>`;
      lakeMeta.appendChild(div);
    }

    // --- FIX: Use active bookmark to determine plot type ---
    const activeBtn = document.querySelector('.plot-bookmark.active');
    const plotType = activeBtn ? activeBtn.dataset.plot : 'lic';

    if (plotType === 'lic') {
      document.getElementById('plot-lic-scatter').style.display = '';
      document.getElementById('plot-lic-agg').style.display = '';
      document.getElementById('plot-lip-table').style.display = 'none';
      document.getElementById('plot-lip-scatter').style.display = 'none';
      renderLicPlots(meta.OBJECT_ID || meta.lake_id);
    } else if (plotType === 'lip') {
      document.getElementById('plot-lic-scatter').style.display = 'none';
      document.getElementById('plot-lic-agg').style.display = 'none';
      document.getElementById('plot-lip-table').style.display = '';
      document.getElementById('plot-lip-scatter').style.display = '';
      renderLipPlots(meta.OBJECT_ID || meta.lake_id);
    }

    // Bookmark click logic (attach ONCE, outside render if possible)
    document.querySelectorAll('.plot-bookmark').forEach(btn => {
      btn.onclick = async () => {
        document.querySelectorAll('.plot-bookmark').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (btn.dataset.plot === 'lic') {
          document.getElementById('plot-lic-scatter').style.display = '';
          document.getElementById('plot-lic-agg').style.display = '';
          document.getElementById('plot-lip-table').style.display = 'none';
          document.getElementById('plot-lip-scatter').style.display = 'none';
          await renderLicPlots(meta.OBJECT_ID || meta.lake_id);
        } else if (btn.dataset.plot === 'lip') {
          document.getElementById('plot-lic-scatter').style.display = 'none';
          document.getElementById('plot-lic-agg').style.display = 'none';
          document.getElementById('plot-lip-scatter').style.display = '';
          document.getElementById('plot-lip-table').style.display = '';
          await renderLipPlots(meta.OBJECT_ID || meta.lake_id);
        }
      };
    });

    const links = [];
    if(meta.dataset_url){ links.push(`<a href="${meta.dataset_url}" target="_blank" rel="noopener">Dataset</a>`); }
    if(meta.method_url){ links.push(`<a href="${meta.method_url}" target="_blank" rel="noopener">Methodology</a>`); }
  }

  return { open, close, clear, render };
}
