/* ------------------------------------------------------------------
   ANDROIDE 27 — sw.js

   Este archivo trabaja en segundo plano y hace tres cosas:

   1. Permite que Android trate esto como una app de verdad, para que
      aparezca en la lista al compartir desde WhatsApp.
   2. Guarda una copia de la app, para que abra aunque no tengas señal.
   3. RECIBE lo que compartes (texto, fotos, audios) y lo deja
      esperando en el teléfono para que la app lo recoja.

   ⚠ Si algún día te entrego una versión nueva de la app, hay que
   cambiar el número de abajo (nucleo-v2 → nucleo-v3, y así). Eso es
   lo que le avisa a tu teléfono que hay algo nuevo que descargar.
------------------------------------------------------------------- */

const CACHE = "androide27-v2";
const ARCHIVOS = ["./", "./index.html", "./manifest.webmanifest",
                  "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ---------- Guardar en la base de datos del teléfono --------------- */
function abrirDB(){
  return new Promise((ok, mal) => {
    const r = indexedDB.open("androide27", 1);
    r.onupgradeneeded = () => {
      const db = r.result;
      if(!db.objectStoreNames.contains("adjuntos"))  db.createObjectStore("adjuntos",  {keyPath:"id"});
      if(!db.objectStoreNames.contains("entrantes")) db.createObjectStore("entrantes", {keyPath:"id"});
    };
    r.onsuccess = () => ok(r.result);
    r.onerror   = () => mal(r.error);
  });
}
async function dejarEntrante(obj){
  const db = await abrirDB();
  return new Promise((ok, mal) => {
    const t = db.transaction("entrantes", "readwrite");
    t.objectStore("entrantes").put(obj);
    t.oncomplete = () => ok();
    t.onerror    = () => mal(t.error);
  });
}

/* ---------- Recibir lo compartido ---------------------------------- */
async function recibirCompartido(request){
  try{
    const datos = await request.formData();
    const texto = [datos.get("title"), datos.get("text"), datos.get("url")]
                    .filter(Boolean).join("\n");
    const archivos = datos.getAll("archivos").filter(f => f && f.size);

    if(archivos.length){
      let n = 0;
      for(const f of archivos){
        await dejarEntrante({
          id: Date.now() + "-" + (n++) + "-" + Math.random().toString(36).slice(2,6),
          texto: n === 1 ? texto : "",
          blob: f, tipo: f.type, nombre: f.name || "archivo"
        });
      }
    } else if(texto){
      await dejarEntrante({
        id: Date.now() + "-" + Math.random().toString(36).slice(2,6),
        texto, blob: null, tipo: "", nombre: ""
      });
    }
  }catch(e){ /* si algo falla, igual abrimos la app */ }

  return Response.redirect("./?compartido=1", 303);
}

/* ---------- Atender las peticiones --------------------------------- */
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // Lo compartido desde WhatsApp llega aquí como un envío POST.
  if(e.request.method === "POST" && url.pathname.endsWith("/share")){
    e.respondWith(recibirCompartido(e.request));
    return;
  }

  if(e.request.mode === "navigate"){
    e.respondWith(fetch(e.request).catch(() => caches.match("./index.html")));
    return;
  }

  if(url.origin !== location.origin) return;

  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
