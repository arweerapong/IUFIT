/* เวลาอัปเดตแอป ให้เปลี่ยนเลขเวอร์ชัน v157 -> v158 ...
   HTML = network-first (ออนไลน์ได้ตัวล่าสุดเสมอ, ออฟไลน์ใช้ cache สำรอง)
   asset = cache-first (เร็ว) */
const CACHE='iufit-v918-coachtour';
const FILES=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./iufit-modern-theme.css','./food-db.js','./resultcard.html','./iufit-iu-mate.css','./iufit-iu-mate.js','./iufit-icons.js','./iufit-workout-icons.js','./iufit-master-icons.js','./food-icon-normalizer.js','./food-icon-matcher.js','./food-icon-menu-mapping.js'];
/* resilient install: a single missing/404 file must NOT block the whole update */
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>Promise.allSettled(FILES.map(function(f){return c.add(f)}))));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim()});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 const sameOrigin=url.origin===self.location.origin;
 const isHTML=e.request.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('index.html');
 if(isHTML){
  e.respondWith(
   fetch(e.request).then(n=>{
    if(n&&n.ok&&sameOrigin){var c1=n.clone(),c2=n.clone();caches.open(CACHE).then(c=>{c.put('./index.html',c1);c.put('./',c2)})}
    return n;
   }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
  );
  return;
 }
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{
  if(n&&n.ok&&sameOrigin){const cl=n.clone();caches.open(CACHE).then(c=>c.put(e.request,cl))}
  return n}).catch(()=>caches.match('./index.html'))));
