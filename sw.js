/* ------------------------------------------------------------------
   ANDROIDE 27 — sw.js  (versión 15)

   Trabaja en segundo plano y hace tres cosas:
     1. Permite que Android trate esto como una app instalable, para
        que aparezca al compartir desde WhatsApp.
     2. Guarda una copia de la app, para que abra sin señal.
     3. Recibe lo que compartes (texto, fotos, audios) y lo deja
        esperando para que la app lo recoja.

   ⚠ El número de abajo es lo que le avisa a tu teléfono que hay una
   versión nueva. Cada vez que te entregue archivos nuevos, sube el
   número: androide27-v15 → androide27-v16, y así.
------------------------------------------------------------------- */

const CACHE = "androide27-v15";
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

/* ---------- Base de datos del teléfono ----------------------------- */
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

/* ---------- Atender peticiones ------------------------------------- */
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

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
