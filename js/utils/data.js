export async function fetchJSON(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(url+': '+r.status);
  return r.json();
}
export async function fetchCSV(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error(url+': '+r.status);
  const txt = await r.text();
  return parseCSV(txt);
}
export function parseCSV(txt){
  const rows = txt.trim().split(/\r?\n/).map(r=>r.split(','));
  const [hdr,...data] = rows;
  const idx = Object.fromEntries(hdr.map((h,i)=>[h.trim(), i]));
  return data.map(r=>Object.fromEntries(Object.entries(idx).map(([k,i])=>[k, r[i]??''])));
}
