/* JR - OBRAS · Mapa de la parcela: foto aérea (PNOA del IGN) + lindes del Catastro.
   Se toca en el mapa para marcar la linde y calcula metros, m² y postes.
   abrirMapa({refcat, lugar, sep, onUse(res)}) */
(function(){
  const LCSS='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',LJS='https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
  let cargando=null;
  function leaflet(){if(window.L)return Promise.resolve();if(cargando)return cargando;
    cargando=new Promise((ok,ko)=>{const l=document.createElement('link');l.rel='stylesheet';l.href=LCSS;document.head.appendChild(l);
      const s=document.createElement('script');s.src=LJS;s.onload=ok;s.onerror=()=>{cargando=null;ko(new Error('No se pudo cargar el mapa'))};document.head.appendChild(s)});return cargando}
  const fx=n=>(Math.round(n*10)/10).toLocaleString('es-ES'),ent=n=>Math.round(n).toLocaleString('es-ES');
  // Área de un polígono sobre la Tierra (m²)
  function area(pts){if(pts.length<3)return 0;const R=6378137,d=Math.PI/180;let a=0;
    for(let i=0;i<pts.length;i++){const p=pts[i],q=pts[(i+1)%pts.length];a+=(q.lng-p.lng)*d*(2+Math.sin(p.lat*d)+Math.sin(q.lat*d))}return Math.abs(a*R*R/2)}
  // Linde de la parcela desde el Catastro (servicio INSPIRE)
  async function lindeCatastro(ref){
    const u='https://ovc.catastro.meh.es/INSPIRE/wfsCP.aspx?service=wfs&version=2.0.0&request=GetFeature&STOREDQUERIE_ID=GetParcel&srsname=EPSG::4326&refcat='+encodeURIComponent(ref);
    const r=await fetch(u);if(!r.ok)throw new Error('catastro');const x=new DOMParser().parseFromString(await r.text(),'text/xml');
    const pl=[...x.getElementsByTagNameNS('*','posList')];if(!pl.length)throw new Error('sin linde');
    let best=null;pl.forEach(e=>{const v=e.textContent.trim().split(/\s+/).map(Number);const pts=[];
      for(let i=0;i+1<v.length;i+=2){let a=v[i],b=v[i+1];if(Math.abs(b)>Math.abs(a)&&Math.abs(b)>27)[a,b]=[b,a];pts.push(L.latLng(a,b))}
      if(pts.length>2&&pts[0].equals(pts[pts.length-1]))pts.pop();if(!best||area(pts)>area(best))best=pts});
    return best}
  async function centroCatastro(ref){
    const r=await fetch('https://ovc.catastro.meh.es/OVCServWeb/OVCWcfCallejero/COVCCoordenadas.svc/json/Consulta_CPMRC?SRS=EPSG:4326&RefCat='+encodeURIComponent(ref));
    const j=await r.json();const g=JSON.stringify(j).match(/"xcen":"?(-?[\d.]+)"?,"ycen":"?(-?[\d.]+)/);if(!g)throw new Error('sin centro');return L.latLng(+g[2],+g[1])}

  window.abrirMapa=async function(o){o=o||{};
    const ov=document.createElement('div');
    ov.style.cssText='position:fixed;inset:0;z-index:9999;background:#111;display:flex;flex-direction:column;font:15px system-ui,-apple-system,sans-serif';
    ov.innerHTML=`<div id="mp-map" style="flex:1;min-height:0"></div>
     <div style="background:#fff;color:#16202B;padding:10px 12px calc(10px + env(safe-area-inset-bottom,0px));box-shadow:0 -4px 16px rgba(0,0,0,.2);display:grid;gap:8px">
      <div id="mp-msg" style="font-size:13px;color:#56616F">Cargando mapa…</div>
      <div id="mp-res" style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center"></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
       <label style="font-size:13px;font-weight:600">Poste cada <input id="mp-sep" type="number" inputmode="decimal" step="0.1" min="0.5" value="${o.sep||3}" style="width:56px;padding:6px;border:1px solid #ccc;border-radius:8px;font:inherit"> m</label>
       <label style="font-size:13px;font-weight:600"><input id="mp-cer" type="checkbox" checked> Finca cerrada</label>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
       <button data-m="undo" class="mp-b">↶ Deshacer</button><button data-m="clear" class="mp-b">Borrar</button>
       <button data-m="cat" class="mp-b" id="mp-cat" style="display:none">Usar linde del Catastro</button>
       <button data-m="gps" class="mp-b">📍 Estoy aquí</button><button data-m="earth" class="mp-b">Google Earth</button>
      </div>
      <div style="display:flex;gap:6px"><button data-m="close" class="mp-b" style="flex:1">Cerrar</button><button data-m="use" class="mp-b" style="flex:2;background:#E21B12;color:#fff;border-color:#E21B12">Usar en el presupuesto</button></div>
     </div>
     <style>.mp-b{padding:10px 12px;border:1px solid #D5DAE0;background:#F4F6F8;border-radius:10px;font:inherit;font-weight:700;color:#16202B}
      #mp-res div{background:#F4F6F8;border-radius:10px;padding:6px}#mp-res b{display:block;font-size:19px}#mp-res span{font-size:12px;color:#56616F}
      .mp-v{width:14px;height:14px;border-radius:50%;background:#E21B12;border:2px solid #fff;box-shadow:0 0 3px #000}</style>`;
    document.body.appendChild(ov);
    const $=s=>ov.querySelector(s),msg=t=>$('#mp-msg').textContent=t;
    const cerrar=()=>{try{map&&map.remove()}catch(e){}ov.remove()};
    try{await leaflet()}catch(e){msg('No se pudo cargar el mapa. Mira si tienes internet.');ov.querySelector('[data-m=close]').onclick=cerrar;return}
    const map=L.map($('#mp-map'),{zoomControl:true,attributionControl:true,maxZoom:21}).setView([43.36,-5.85],9);
    const pnoa=L.tileLayer('https://www.ign.es/wmts/pnoa-ma?request=GetTile&service=WMTS&version=1.0.0&Format=image/jpeg&layer=OI.OrthoimageCoverage&style=default&tilematrixset=GoogleMapsCompatible&TileMatrix={z}&TileRow={y}&TileCol={x}',{maxZoom:21,maxNativeZoom:19,attribution:'PNOA © IGN'}).addTo(map);
    const esri=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:21,maxNativeZoom:19,attribution:'© Esri'});
    const cat=L.tileLayer.wms('https://ovc.catastro.meh.es/Cartografia/WMS/ServidorWMS.aspx',{layers:'Catastro',format:'image/png',transparent:true,version:'1.1.1',maxZoom:21,attribution:'© Catastro'}).addTo(map);
    L.control.layers({'Foto aérea (IGN)':pnoa,'Satélite (Esri)':esri},{'Lindes del Catastro':cat},{position:'topright'}).addTo(map);

    let pts=[],linde=null;const capa=L.layerGroup().addTo(map);
    const sep=()=>Math.max(0.5,parseFloat(String($('#mp-sep').value).replace(',','.'))||3),cerrada=()=>$('#mp-cer').checked;
    function calc(){const n=pts.length,c=cerrada()&&n>2,lados=[];
      for(let i=0;i<n-1;i++)lados.push(pts[i].distanceTo(pts[i+1]));if(c)lados.push(pts[n-1].distanceTo(pts[0]));
      const m=lados.reduce((a,b)=>a+b,0),s=sep();
      // Un poste de esquina en cada vértice y los de en medio cada «s» metros
      const postes=n<2?0:lados.reduce((a,l)=>a+Math.ceil(l/s),0)+(c?0:1);
      return{m,m2:c?area(pts):0,postes,esquinas:n<2?0:n,lados,sep:s,cerrada:c}}
    function pinta(){capa.clearLayers();const r=calc();
      if(pts.length>1)(r.cerrada?L.polygon(pts,{color:'#FFD400',weight:3,fillOpacity:.15}):L.polyline(pts,{color:'#FFD400',weight:3})).addTo(capa);
      pts.forEach((p,i)=>{const mk=L.marker(p,{draggable:true,icon:L.divIcon({className:'',html:'<div class="mp-v"></div>',iconSize:[18,18],iconAnchor:[9,9]})}).addTo(capa);
        mk.on('drag',e=>{pts[i]=e.target.getLatLng();pinta()})});
      r.lados.forEach((l,i)=>{const a=pts[i],b=pts[(i+1)%pts.length];L.tooltip({permanent:true,direction:'center',className:''}).setLatLng([(a.lat+b.lat)/2,(a.lng+b.lng)/2]).setContent(ent(l)+' m').addTo(capa)});
      $('#mp-res').innerHTML=`<div><b>${ent(r.m)} m</b><span>${r.cerrada?'perímetro':'de cierre'}</span></div><div><b>${r.m2?ent(r.m2):'—'}</b><span>m² finca</span></div><div><b>${r.postes}</b><span>postes (${r.esquinas} esquina)</span></div>`;
      msg(pts.length?'Arrastra los puntos para ajustarlos. Toca el mapa para añadir más.':'Toca el mapa en cada esquina de la finca.')}
    map.on('click',e=>{pts.push(e.latlng);pinta()});
    $('#mp-sep').oninput=pinta;$('#mp-cer').onchange=pinta;
    ov.addEventListener('click',e=>{const b=e.target.closest('[data-m]');if(!b)return;const k=b.dataset.m;
      if(k==='undo'){pts.pop();pinta()}
      else if(k==='clear'){pts=[];pinta()}
      else if(k==='cat'&&linde){pts=linde.slice();$('#mp-cer').checked=true;map.fitBounds(L.latLngBounds(pts),{padding:[30,30]});pinta()}
      else if(k==='gps'){msg('Buscando dónde estás…');map.locate({setView:true,maxZoom:18,enableHighAccuracy:true})}
      else if(k==='earth'){const c=map.getCenter();window.open(`https://earth.google.com/web/@${c.lat.toFixed(6)},${c.lng.toFixed(6)},300a,600d,35y,0h,0t,0r`,'_blank','noopener')}
      else if(k==='close')cerrar();
      else if(k==='use'){const r=calc();if(!r.m){msg('Primero marca la finca en el mapa.');return}if(o.onUse)o.onUse(r);cerrar()}});
    map.on('locationfound',e=>{L.circleMarker(e.latlng,{radius:7,color:'#fff',fillColor:'#1A73E8',fillOpacity:1}).addTo(map);msg('Estás aquí. Toca el mapa en cada esquina de la finca.')});
    map.on('locationerror',()=>msg('No pude saber dónde estás. Activa la ubicación del móvil.'));
    pinta();
    const ref=String(o.refcat||'').replace(/\s/g,'').slice(0,14).toUpperCase();
    if(ref.length===14){msg('Buscando la parcela en el Catastro…');
      try{linde=await lindeCatastro(ref);pts=linde.slice();$('#mp-cat').style.display='';map.fitBounds(L.latLngBounds(pts),{padding:[30,30]});pinta();
        msg('Esta es la linde del Catastro. Mueve los puntos o borra y marca solo la parte a cerrar.')}
      catch(e){try{map.setView(await centroCatastro(ref),18);msg('Ahí está la parcela (línea del Catastro). Toca en cada esquina.')}
        catch(e2){msg('El Catastro no responde. Pulsa «Estoy aquí» o busca la finca y toca en cada esquina.')}}}
    else msg(o.lugar?'Pon la referencia catastral para ir a la finca, o pulsa «Estoy aquí».':'Pulsa «Estoy aquí» o busca la finca. Luego toca en cada esquina.');
    setTimeout(()=>map.invalidateSize(),200)};
})();
