// Halaman kontrol Hermes — HTML+JS statis, TANPA secret apa pun.
// Kunci UI dimasukkan pengguna dan disimpan di localStorage browser saja.
// Skrip disajikan sebagai file same-origin (/console.js) agar lolos CSP backend.

export const CONSOLE_HTML: string =
  '<!DOCTYPE html>' +
  '<html lang="id">' +
  '<head>' +
  '<meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">' +
  '<title>Hermes Control</title>' +
  '<style>' +
  ':root{color-scheme:light dark}' +
  'body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:16px;background:#0f172a;color:#e2e8f0}' +
  '.wrap{max-width:520px;margin:0 auto}' +
  'h1{font-size:1.6rem;margin:8px 0 0}' +
  '.sub{color:#94a3b8;margin:4px 0 16px}' +
  '.card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px;margin-bottom:12px}' +
  '.card h2{font-size:1rem;margin:0 0 8px;color:#cbd5e1}' +
  'label{display:block;font-size:.85rem;color:#94a3b8;margin-bottom:6px}' +
  'input{width:100%;box-sizing:border-box;padding:12px;border-radius:8px;border:1px solid #475569;background:#0f172a;color:#e2e8f0;font-size:1rem}' +
  '.row{display:flex;gap:8px;margin-top:8px}' +
  'button{flex:1;padding:14px;border:0;border-radius:10px;font-size:1.05rem;font-weight:700;cursor:pointer;background:#22c55e;color:#052e16}' +
  'button:disabled{background:#475569;color:#94a3b8;cursor:not-allowed}' +
  'button.small{flex:0 0 auto;padding:12px 16px;font-size:.95rem;background:#38bdf8;color:#082f49}' +
  '.hint{font-size:.8rem;color:#94a3b8;margin:8px 0 0}' +
  '.mrow{display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid #334155}' +
  '.mrow:first-of-type{border-top:0}' +
  '.dot{width:12px;height:12px;border-radius:50%;background:#64748b;flex:0 0 auto}' +
  '.dot.run{background:#22c55e}.dot.warn{background:#f59e0b}.dot.off{background:#64748b}.dot.work{background:#38bdf8;animation:pulse 1.2s infinite}.dot.err{background:#ef4444}' +
  '@keyframes pulse{50%{opacity:.35}}' +
  '.mname{font-weight:600}.mstate{margin-left:auto;font-size:.85rem;color:#94a3b8}' +
  '#msg{margin:8px 0 0;min-height:1.4em;font-size:.95rem}' +
  '#msg.ok{color:#86efac}#msg.err{color:#fca5a5}#msg.info{color:#7dd3fc}' +
  '#progress{display:flex;align-items:center;gap:10px;margin-top:8px;color:#7dd3fc}' +
  '.spin{width:18px;height:18px;border:3px solid #334155;border-top-color:#38bdf8;border-radius:50%;animation:spin 0.9s linear infinite}' +
  '@keyframes spin{to{transform:rotate(360deg)}}' +
  '</style>' +
  '</head>' +
  '<body><main class="wrap">' +
  '<h1>Hermes Control</h1>' +
  '<p class="sub">Kontrol mesin VPS Hermes</p>' +
  '<section class="card"><h2>Kunci UI</h2>' +
  '<label for="key">Tempel kunci UI (disimpan di HP ini saja)</label>' +
  '<input id="key" type="password" placeholder="••••••••" autocomplete="off">' +
  '<div class="row"><button class="small" id="saveKey" type="button">Simpan</button></div>' +
  '<p class="hint" id="keyState"></p></section>' +
  '<section class="card"><h2>Mesin</h2><div id="machines"><p class="hint">Memuat…</p></div></section>' +
  '<section class="card"><button id="wake" type="button" disabled>Hidupkan Hermes</button>' +
  '<div id="progress" hidden><span class="spin"></span><span id="progressText">Menunggu…</span></div>' +
  '<p id="msg"></p></section>' +
  '</main><script src="./console.js"></script></body></html>';

export const CONSOLE_JS: string =
  '(function(){' +
  '"use strict";' +
  'var LS="hermes_ui_key";' +
  'function $(id){return document.getElementById(id);}' +
  'function esc(s){return String(s).replace(/[&<>"\']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",\'"\':"&quot;","\'":"&#39;"}[c];});}' +
  'function getKey(){return localStorage.getItem(LS)||"";}' +
  'function refreshKeyState(){var has=!!getKey();$("keyState").textContent=has?"Kunci tersimpan di HP ini.":"Belum ada kunci tersimpan.";$("wake").disabled=!has||busy;}' +
  'function api(path,opts){opts=opts||{};var headers={"Content-Type":"application/json"};var k=getKey();if(k){headers["X-API-Key"]=k;}return fetch(path,{method:opts.method||"GET",headers:headers,body:opts.body?JSON.stringify(opts.body):undefined}).then(function(r){return r.json().then(function(b){return{status:r.status,body:b};});});}' +
  'function labelOf(state){var s=String(state||"").toLowerCase();if(s==="running")return["Running","run"];if(s==="suspended"||s==="paused")return["Suspended","warn"];if(s==="stopped")return["Stopped","off"];if(s==="creating"||s==="starting"||s==="stopping"||s==="suspending"||s==="resuming"||s==="deleting")return["Starting","work"];return["Error","err"];}' +
  'function say(text,cls){var m=$("msg");m.textContent=text;m.className=cls||"";}' +
  'var busy=false;var timer=null;' +
  'function setBusy(v,text){busy=v;$("wake").disabled=v||!getKey();var p=$("progress");if(v){p.hidden=false;$("progressText").textContent=text||"Bekerja…";}else{p.hidden=true;}refreshKeyState();}' +
  'function loadMachines(){return api("/api/instabox/machines").then(function(r){if(r.status!==200){say("Gagal memuat mesin: "+((r.body&&r.body.message)||r.status),"err");return;}var list=(r.body&&r.body.data)||[];if(!list.length){$("machines").innerHTML="<p class=\\"hint\\">Tidak ada mesin.</p>";return;}var html="";for(var i=0;i<list.length;i++){var m=list[i];var l=labelOf(m.state);html+="<div class=\\"mrow\\"><span class=\\"dot "+l[1]+"\\"></span><span class=\\"mname\\">"+esc(m.name)+"</span><span class=\\"mstate\\">"+esc(l[0])+"</span></div>";}$("machines").innerHTML=html;});}' +
  'function pollOperation(id){setBusy(true,"Menunggu mesin siap…");function tick(){api("/api/instabox/operations/"+encodeURIComponent(id)).then(function(r){if(r.status!==200){setBusy(false);say("Gagal memantau operasi: "+((r.body&&r.body.message)||r.status),"err");return;}var d=r.body&&r.body.data;if(!d||!d.done){timer=setTimeout(tick,5000);return;}if(timer){clearTimeout(timer);timer=null;}setBusy(false);if(d.error&&d.error.code){say("Operasi gagal ("+d.error.code+").","err");}else{say("Hermes siap digunakan.","ok");}loadMachines();}).catch(function(e){setBusy(false);say("Jaringan bermasalah: "+e.message,"err");});}tick();}' +
  'function wake(){var k=getKey();if(!k){say("Simpan kunci UI dulu.","err");return;}if(busy)return;setBusy(true,"Menghubungi Hermes…");api("/api/instabox/wake",{method:"POST",body:{}}).then(function(r){var d=r.body&&r.body.data;if(r.status===200){setBusy(false);say((r.body&&r.body.message)||"Selesai.","ok");loadMachines();return;}if(r.status===202&&d&&d.operation&&d.operation.id){say((r.body&&r.body.message)||"Operasi diterima.","info");pollOperation(d.operation.id);return;}if(r.status===409&&r.body&&r.body.error&&r.body.error.details&&r.body.error.details.operationId){say((r.body&&r.body.message)||"Operasi berjalan.","info");pollOperation(r.body.error.details.operationId);return;}setBusy(false);if(r.status===401){say("Kunci salah atau belum disimpan.","err");return;}say("Gagal: "+((r.body&&r.body.message)||("HTTP "+r.status)),"err");}).catch(function(e){setBusy(false);say("Jaringan bermasalah: "+e.message,"err");});}' +
  '$("saveKey").addEventListener("click",function(){var v=$("key").value.trim();if(!v){say("Isi kunci dulu.","err");return;}$("key").value="";try{localStorage.setItem(LS,v);}catch(e){say("Browser menolak penyimpanan.","err");return;}refreshKeyState();say("Kunci tersimpan di HP ini.","ok");loadMachines();});' +
  '$("wake").addEventListener("click",wake);' +
  'refreshKeyState();loadMachines();' +
  '})();';
