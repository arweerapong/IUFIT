/* เวลาอัปเดตแอป ให้เปลี่ยน v1 -> v2 -> v3 ... ผู้ใช้จะได้ตัวใหม่อัตโนมัติ */
const CACHE='iufit-v45';
const FILES=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim()});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{
  if(n&&n.ok&&e.request.url.startsWith(self.location.origin)){const cl=n.clone();caches.open(CACHE).then(c=>c.put(e.request,cl))}
  return n}).catch(()=>caches.match('./index.html'))))});
