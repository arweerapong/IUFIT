/* เวลาอัปเดตแอป ให้เปลี่ยนเลขเวอร์ชัน v122 -> v123 ...
   HTML = network-first (ออนไลน์ได้ตัวล่าสุดเสมอ, ออฟไลน์ใช้ cache สำรอง)
   asset = cache-first (เร็ว) */
const CACHE='iufit-v151-modern-ui';
const FILES=['./','./index.html','./manifest.json','./icon-192.png','./icon-512.png','./iufit-modern-theme.css'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k))))); self.clients.claim()});
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 const sameOrigin=url.origin===self.location.origin;
 const isHTML=e.request.mode==='navigate'||url.pathname.endsWith('/')||url.pathname.endsWith('index.html');
 if(isHTML){
  e.respondWith(
   fetch(e.request).then(n=>{
    if(n&&n.ok&&sameOrigin){caches.open(CACHE).then(c=>{c.put('./index.html',n.clone());c.put('./',n.clone())})}
    return n;
   }).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))
  );
  return;
 }
 e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(n=>{
  if(n&&n.ok&&sameOrigin){const cl=n.clone();caches.open(CACHE).then(c=>c.put(e.request,cl))}
  return n}).catch(()=>caches.match('./index.html'))));
});
