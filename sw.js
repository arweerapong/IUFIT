/* IUFIT service worker — Vue build
   ปล่อยอัปเดตแอปทีไร ให้ขยับเลขเวอร์ชันใน CACHE ทุกครั้ง (v1032 -> v1033 ...)
   ไม่ขยับ = เครื่องที่ติดตั้งไว้แล้วจะยังกิน cache ชุดเก่า

   กลยุทธ์ (เหมือน sw.js ของแอปจริง IUFIT-app-deploy/sw.js เป๊ะ):
     HTML/navigate = network-first  (ออนไลน์ได้ตัวล่าสุดเสมอ · ออฟไลน์ค่อยใช้ cache สำรอง)
     asset         = cache-first    (เร็ว · miss แล้วค่อยยิงเน็ตแล้วเก็บลง cache)

   ⚠️ ต่างจากของเดิมตรงเดียว: บิลด์ Vite ตั้งชื่อไฟล์ JS/CSS แบบมี hash (`/assets/xxx-a1b2.js`)
   จึง **precache ล่วงหน้าไม่ได้** เพราะชื่อเปลี่ยนทุกบิลด์ → precache เฉพาะ "เปลือกแอป"
   (index/manifest/icon) ที่ชื่อคงที่ ส่วน bundle ปล่อยให้ cache-first เก็บเองตอนโหลดครั้งแรก
   ผลลัพธ์ปลายทางเท่ากัน: เปิดครั้งแรกออนไลน์ 1 รอบ → ครั้งต่อไปเปิดออฟไลน์ได้

   ⚠️ cache-first ปลอดภัยกับข้อมูลสด เพราะ:
     • ยัดลง cache เฉพาะ response ที่ `sameOrigin` เท่านั้น
     • Firebase RTDB (GET) / worker (POST) เป็น cross-origin → ไม่เคยถูกเก็บ → ได้ของสดเสมอ
     • ไฟล์ที่ hash ในชื่ออยู่แล้ว บิลด์ใหม่ = ชื่อใหม่ = ไม่มีทางกินของเก่า
*/
/* v1033 = บิลด์ที่หั่น bundle ใหม่ (vendor แยกก้อน + IU MATE/ทัวร์ lazy)
   ขยับเวอร์ชันเพื่อให้เครื่องที่ติดตั้งไว้แล้วทิ้ง cache ก้อน index-*.js เดิม (734KB)
   ที่ไม่มีใครขอใช้อีกแล้ว — ชื่อไฟล์ที่มี hash ยังคงถูกเก็บตอน runtime เหมือนเดิม
   (FILES ด้านล่างไม่มี path ที่มี hash เลย จึงไม่ต้องแก้ตามทุกบิลด์) */
/* v1035 = รวมระบบแจ้งเตือน PWA + Capacitor เป็นชุดเดียว (services/push.ts)
   ไฟล์นี้เพิ่ม `pushsubscriptionchange` ซึ่งเป็นโค้ดใหม่ใน SW ⇒ ต้องขยับเวอร์ชัน
   ไม่งั้นเครื่องที่ติดตั้งไว้แล้วจะยังรัน SW ตัวเก่าที่ไม่มี handler นี้ */
/* v1036 = audit fix รอบสุดท้ายก่อน launch: แก้ปุ่ม "ส่งแผน" หน้าท่าฝึก (WorkoutView)
   จาก toast หลอกให้ยิง coach.sendPlan จริง + ลบกับดักคอมเมนต์ pushOn/pushOff
   ขยับเวอร์ชันเพื่อให้เครื่องที่ติดตั้งไว้แล้วรับ bundle ใหม่ */
/* v1037 = UI batch 2569-07-22: ปุ่มกู้บัญชีจัดวางใหม่ · ปฏิทินวันเกิดเปิดโหมดปี+จำกัด 90 ปี ·
   การ์ดทัวร์ใหญ่ขึ้น + แก้ข้อความ (2 ส่วน/นาฬิกา iOS) · IU Mate chat อธิบายปุ่มทีละแท็บ + พาทัวร์ */
/* v1038 = เมนู "ธีม"→"โหมดมืด" · อัปเดตศูนย์ช่วยเหลือ (help.ts) ให้ครบทุกฟีเจอร์จริง
   (เพิ่มแจ้งเตือน/LINE/นาฬิกา/Progress Report/คอร์ส PT/เทมเพลต/CSV) + ตัดข้อความเกินจริง */
/* v1039 = กรอบสแกน QR เป็นสี่เหลี่ยมจัตุรัส · แก้โฟลว์โค้ช onboarding: "ข้ามไปก่อน" บนหน้า
   ยืนยันอีเมล → ไปหน้าจบ (เดิมวนกลับฟอร์มโปรไฟล์โค้ช) · ปุ่มหน้ายินดีต้อนรับไม่ชิดขอบล่าง */
/* v1040 = ปุ่มยินดีต้อนรับไม่ชิดล่างจริง (auto-margin แทน justify-center ที่กิน padding) ·
   ตั้งค่า: ลบแถว "สำรองข้อมูล" ซ้ำ · หน้า /backup: ยืนยันอีเมลเด่น สำรองเองเล็กลง ·
   ไอคอนแท็บ "ลูกเทรน" เปลี่ยนจากคนวิ่งก้าง ๆ → ไอคอนคนเดี่ยวสะอาด */
/* v1041 = ปุ่มชิดล่าง แก้ต้นเหตุจริง: TWA/Android edge-to-edge รายงาน env(safe-area-bottom)=0
   ปุ่มไปอยู่ใต้แถบ gesture ⇒ ใส่ --iu-safe-b-min:24px กลางใน base.css (ทุกหน้า chromeless ได้) ·
   หน้ารับสิทธิ์ Trainer Pro: ตัด "เหมือนผู้ใช้ทั่วไป" + ตัดวงเล็บซ้ำที่นั่ง/ประวัติใน proSkipNote */
/* v1042 = หน้า "ยังไม่ได้เป็นลูกเทรน": ปุ่ม "สแกน QR" เปิดกล้องทันที · "อ่าน QR จากรูป"
   เด้งเลือกรูปทันที (เดิมทั้งสองเปิดชีตให้เลือกซ้ำ) — เพิ่ม prop autoStart ให้ QrScanSheet */
/* v1043 = ออดิตโหมดโค้ชทั้งเซตเทียบต้นฉบับ: ปุ่ม "แชท" เปิดหน้าแชทฮับจริง (ไม่ใช่หน้าลูกเทรน) ·
   "คำนวณ" เป็นชีตบนหน้าโฮม กดบันทึกค้างไว้คำนวณคนต่อไป ปิดแล้วกลับโฮม · "เพิ่มลูกเทรน" QR บนโฮม ·
   การบ้าน "แชทฟีดแบ็ก" เปิดห้องแชทในที่ · แก้ leaderboard ไม่ส่ง code · เพิ่ม back-guard ทุกชีตโค้ช
   ⇒ ทุกหน้าต่าง ปิด/กดกลับ = กลับที่เดิมก่อนเปิด */
/* v1044 = โค้ชเห็นลูกเทรนใหม่ไวขึ้น (poll members ทุก 8 วิ + sync ตอน foreground · ไม่ใช่ SSE) ·
   การ์ดการบ้านรายคน = 1 คนหลายรายการเหมือนต้นฉบับ (กางการ์ดคนที่โฟกัส) ·
   ตัด "· รายงาน" ในป้าย "ดูรายละเอียดทั้งหมด" (สร้าง Progress Report เหลือปุ่มใหญ่ที่เดียว) */
/* v1045 = onboarding โค้ช: กด "ไม่สร้างโปรไฟล์ส่วนตัว" แล้วไปหน้ายืนยันอีเมลตรง ๆ
   เอากล่องที่สอง "ไม่ต้องรีบ ทำทีหลังได้" ออก (รายละเอียดบอกครบแล้วในกล่องคำถามเอง) */
/* v1046 = Result Card เปิดใช้จริง: การ์ดฉลอง 5 แบบ (streak/workout/PR/progress/monthly)
   เด้ง overlay ตอนทำสำเร็จ + มาสคอต bob + confetti + ปุ่มแชร์ PNG · ตัวจับ latch กันเด้งซ้ำ */
/* v1106 = รวมพลังงานสองระบบเป็นถังเดียว: แคลจากนาฬิกาหักเข้าโควตา "คงเหลือ" ได้แล้ว
   (บวกเฉพาะส่วนที่เกินค่ากิจกรรมที่ tdee จ่ายไว้ · นับทางเดียว ไม่ซ้ำกับเซสชันที่บันทึกเอง
   ดู lib/energyBudget.ts) · IU MATE ตอบเลข "เหลือกี่แคล" ชุดเดียวกับการ์ดหน้าแรกแล้ว
   🐛 กู้การ์ดยืนยันกิจกรรมจากนาฬิกาที่หายไปตอนย้ายหน้า /watch ⇒ เซสชันกีฬากลับเข้า user.ex
      (สตรีค/เหรียญ/จำนวนเวิร์กเอาต์กลับมานับ) · แถบนาฬิกาหน้าแรกตามวันที่เลือกแล้ว
   🧹 ลบ ResWatchSlide/ResDrillWatch ที่กลายเป็นไฟล์กำพร้า + เลิก prefetch จอที่กดเข้าไม่ได้
   ✏️ ปุ่ม/ทางเข้ากลับไปใช้คำว่า "เชื่อมนาฬิกา" (มีสองแหล่งแล้ว ไม่ใช่ Health Connect ทางเดียว)
   🤖 IU MATE: ถาม "โปรตีนวันละกี่กรัม" ได้ตัวเลขของตัวเองเลย ไม่ใช่บทความ + ปุ่มให้กดต่อ */
/* v1107 = ⚡ ความเร็วตอนเปิดแอป (ฟีดแบ็ก "ช้ากว่าตอนเป็น vanilla")
   วัดจาก dist จริง: โหลดน้อยกว่า vanilla 3 เท่า (264KB gz เทียบ 853KB) แต่ช้ากว่า
   เพราะต้องผ่าน **5 ชั้นแบบต่อคิว** กว่าจะเห็นหน้าแรก — ปัญหาคือจำนวนรอบ ไม่ใช่ไบต์
     1. HTML: network-first → แคชก่อนแล้วอัปเดตเบื้องหลัง
        (ของเดิมรอเน็ตครบรอบก่อนโค้ดบรรทัดแรกจะรัน ทุกครั้งที่เปิดแอป
         แอป Android ยิ่งหนักเพราะ server.url ชี้ที่ iufit.com)
     2. precache ก้อน /assets ที่ index.html อ้าง ตั้งแต่ตอน install
        (เดิมเก็บแบบ "เจอตอนไหนค่อยเก็บ" ⇒ ครั้งแรกหลังอัปเวอร์ชันต้องยิงทีละก้อนต่อคิว)
     3. modulepreload ก้อนหน้าแรก 17 ไฟล์ ⇒ ยุบ 3 ชั้นเหลือ 1 (ดู scripts/vite-preload-landing.mjs) */
/* v1108 = 🐛 "จับคู่นาฬิกาไว้แล้วแต่ไม่มีให้เชื่อมเรือนเดิม"
   ชีตเลือกแหล่งเรียก startScan() เสมอ ⇒ ทางเดียวที่มีคือไปจับคู่เรือนใหม่
   ตอนนี้เคยจับคู่แล้วจะเจอปุ่ม "เชื่อมนาฬิกาเรือนเดิม" เป็นทางหลัก (เชื่อม+ดึงข้อมูลในคำสั่งเดียว)
   ส่วน "จับคู่เรือนอื่น" ลดชั้นเป็นลิงก์รอง · เชื่อมไม่ติดบอกเหตุผลจริง ไม่เด้งไปสแกนเงียบ ๆ
   ✏️ คำอธิบายแถวตั้งค่าเปลี่ยนเป็น "อุปกรณ์ที่รองรับ: …" บอกยี่ห้อนาฬิกาแทนชื่อแอปตัวกลาง */
/* v1109 = 🐛 "เชื่อมเรือนเดิมแล้วขึ้นว่าไม่พบนาฬิกา" — เชื่อมติดจริงแต่แอปบอกผิด
   `watchSync` คืน 'empty' เมื่อ **เชื่อมได้แต่ยังไม่มีข้อมูล** ส่วนตารางของสายสแกน
   แปล 'empty' ว่า "ไม่พบนาฬิกา" ⇒ ผมใช้ตารางเดียวกันทั้งสองสายเลยแปลผิด
   ตอนนี้สายซิงก์มีตารางของตัวเอง · 'empty' นับเป็นสำเร็จ (บอกว่ายังไม่มีข้อมูลใหม่)
   ⌚ เชื่อมสำเร็จแล้ว **นาฬิกาสั่น 1 ครั้ง** เป็นหลักฐานว่าคุยกับเรือนนั้นได้จริง
      (มีคำสั่งหยุดสั่นใน finally เสมอ — สั่นค้างจนแบตหมดผู้ใช้แก้เองไม่ได้)
   ✏️ ป้าย "กำลังซิงค์…" บอกแหล่งด้วย และ 'iufit-band' แสดงเป็น "IUFIT Band"
      (เดิมโชว์คีย์ดิบ ๆ และไม่บอกว่าซิงก์กับอะไร ⇒ เข้าใจผิดว่าแอบไป Health Connect) */
/* v1110 = 🐛 "ฉลองครบเป้าน้ำไม่เด้ง"
   ตัวเช็กเคยอยู่ใน wrapper ของหน้าแรก ⇒ มีแค่ปุ่มน้ำ 4 ปุ่มบนหน้านั้นที่ทำให้เด้ง
   หน้าน้ำ /water (คนกดมากที่สุด) · การ์ดทำอะไรต่อดี · หน้าประวัติ · IU MATE · LINE ข้ามหมด
   ⇒ ย้ายตัวจับไปที่ `daily.setWater()` ซึ่งเป็นประตูเขียนน้ำเดียวจริง ๆ
      (บทเรียนเดียวกับ wearIngest: ตัวจับอยู่ที่ประตู ไม่ใช่ที่ปุ่ม)
   จับเฉพาะ **ขอบขาขึ้น** (ต่ำกว่าเป้า → ถึงเป้า) ไม่งั้นกดต่อหลังครบจะเด้งซ้ำทุกครั้ง
   หน้าน้ำได้อนิเมชันฉลองด้วยแล้ว (เดิมมีแต่หน้าแรก) + เทส 9 เคสคุมทุกทางเข้า */
const CACHE = 'iufit-v1110-water-celebrate'

/* เปลือกแอปที่ชื่อไฟล์คงที่ (ชื่อ hash ของ /assets/* เก็บตอน runtime แทน)

   path เป็น root-absolute (`/…`) ไม่ใช่ `./…` แบบ sw.js ตัวเดิม เพราะแอปนี้เป็น history-mode
   SPA: เวลา SW ทำงานอยู่ path `./index.html` จะถูก resolve เทียบกับ scope ซึ่งพาไปผิดที่เมื่อ
   ผู้ใช้เปิดจาก URL ลึก ๆ อย่าง /coach/clients — `/index.html` ชี้ที่เดียวเสมอ */
const FILES = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
]

/**
 * ⚡ 2569-07-26 · อ่านชื่อก้อน `/assets/*` จาก index.html แล้ว precache ตั้งแต่ตอน install
 * ══════════════════════════════════════════════════════════════════════════════
 * เดิมก้อนโค้ดถูกแคชแบบ "เจอตอนไหนค่อยเก็บ" ⇒ ครั้งแรกหลังปล่อยเวอร์ชันใหม่ ผู้ใช้ต้อง
 * ยิงเน็ตทีละก้อนแบบต่อคิว (ก้อนหลัก → ก้อนของหน้า → ก้อนที่หน้านั้นเรียกต่อ) กว่าจะเห็นจอ
 *
 * ทำไมอ่านจาก HTML แทนที่จะฮาร์ดโค้ดรายชื่อ: ชื่อไฟล์มี hash ต่อท้ายและเปลี่ยนทุก build
 * รายชื่อที่เขียนมือจะล้าสมัยเงียบ ๆ ในวันที่ลืมอัปเดต แล้วกลายเป็น precache ของที่ไม่มีจริง
 * index.html คือแหล่งความจริงเดียวที่บอกว่า build นี้ต้องใช้ก้อนไหน
 *
 * ⚠️ ดึงเฉพาะก้อนที่ index.html อ้างตรง ๆ (ก้อนหลัก + vendor + css) ไม่ไล่ทั้งกราฟ
 * ก้อนของแต่ละหน้ายังโหลดตอนเข้าหน้านั้น — precache ทั้งแอปจะกินเน็ตผู้ใช้เพื่อหน้าที่เขาไม่เปิด
 */
async function precacheShell(c) {
  try {
    // `cache: 'reload'` — ต้องได้ของสดจากเซิร์ฟเวอร์ ไม่ใช่ของเก่าใน HTTP cache ของเบราว์เซอร์
    const res = await fetch('/index.html', { cache: 'reload' })
    if (!res || !res.ok) return
    const html = await res.clone().text()
    await c.put('/index.html', res.clone())
    await c.put('/', res)
    const urls = [
      ...new Set(
        [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]),
      ),
    ]
    await Promise.allSettled(urls.map((u) => c.add(u)))
  } catch {
    /* เน็ตล่มตอน install = ไม่ต้อง precache · fetch handler ยังเก็บให้ตอนใช้จริงอยู่ดี */
  }
}

/* resilient install: ไฟล์เดียวหาย/404 ต้องไม่ทำให้อัปเดตทั้งชุดพัง (allSettled ไม่ใช่ all) */
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      await Promise.allSettled(FILES.map((f) => c.add(f)))
      await precacheShell(c)
    }),
  )
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)
  const sameOrigin = url.origin === self.location.origin
  /* history-mode SPA: /food, /coach/... มาเป็น mode==='navigate' ทั้งหมด → เข้าทาง network-first
     และตอนออฟไลน์ตกมาที่ ./index.html ให้ router เดินเส้นทางต่อเองฝั่ง client */
  const isHTML =
    e.request.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('index.html')

  /**
   * ⚡ 2569-07-26 · HTML เปลี่ยนจาก network-first → **แคชก่อน แล้วอัปเดตเบื้องหลัง**
   * ══════════════════════════════════════════════════════════════════════════════
   * ของเดิมรอเน็ตครบรอบก่อนโค้ดบรรทัดแรกจะได้รัน — **ทุกครั้งที่เปิดแอป**
   * สมัยเป็นไฟล์เดียว รอบนั้นคุ้ม เพราะมันส่งทั้งแอปมาเลย
   * ตอนนี้ index.html เหลือ 12KB ที่ไม่มีเนื้อหาอะไร รอบนั้นจึงเป็นการรอเปล่า ๆ
   * ก่อนงานจริงจะเริ่ม · แอป Android ยิ่งหนักเพราะ `server.url` ชี้ที่ iufit.com
   * ⇒ เปิดแอปทุกครั้งวิ่งผ่านเน็ต ไม่ได้อ่านจากเครื่อง
   *
   * ทำไมของเก่าไม่ค้าง: index.html กับก้อน `/assets/*` อยู่ใน **แคชชื่อเดียวกัน**
   * และถูกลบพร้อมกันตอน activate ⇒ HTML ที่เสิร์ฟจากแคชอ้างถึงก้อนที่อยู่ในแคชนั้นเสมอ
   * ไม่มีทางเกิดกรณี "HTML เก่าชี้ไปก้อนที่ถูกลบแล้ว"
   * และเมื่อมี SW ใหม่ `skipWaiting + claim` จะยิง controllerchange ให้หน้ารีโหลดเอง
   * (ดู src/pwa.ts) ⇒ อย่างช้าที่สุดคือช้าไปหนึ่งการเปิดแอป แล้วตามทันเอง
   */
  if (isHTML) {
    e.respondWith(
      caches.match('/index.html').then((cached) => {
        const fresh = fetch(e.request)
          .then((n) => {
            if (n && n.ok && sameOrigin) {
              const c1 = n.clone()
              const c2 = n.clone()
              caches.open(CACHE).then((c) => {
                c.put('/index.html', c1)
                c.put('/', c2)
              })
            }
            return n
          })
          .catch(() => null)
        // มีของในแคช = ตอบทันที แล้วปล่อยให้อัปเดตวิ่งต่อเบื้องหลัง
        // `waitUntil` กัน SW ถูกฆ่ากลางคันก่อนเขียนแคชเสร็จ (ไม่งั้นจะไม่มีวันได้ของใหม่)
        if (cached) {
          e.waitUntil(fresh)
          return cached
        }
        return fresh.then((n) => n || caches.match('/index.html'))
      }),
    )
    return
  }

  e.respondWith(
    caches.match(e.request).then(
      (r) =>
        r ||
        fetch(e.request)
          .then((n) => {
            if (n && n.ok && sameOrigin) {
              const cl = n.clone()
              caches.open(CACHE).then((c) => c.put(e.request, cl))
            }
            return n
          })
          .catch(() => caches.match('/index.html')),
    ),
  )
})

/* Web push (FCM) — พอร์ตตรงจาก sw.js ของจริง ห้ามตัดทิ้ง ไม่งั้น noti ที่ส่งอยู่แล้วเงียบหาย */
self.addEventListener('push', function (e) {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch (_) {
    try {
      d = { body: e.data.text() }
    } catch (__) {
      d = {}
    }
  }
  const title = d.title || 'IUFIT 💪'
  const opts = {
    body: d.body || '',
    icon: d.icon || '/icon-192.png',
    badge: '/icon-192.png',
    tag: d.tag || 'iufit',
    renotify: true,
    data: { url: d.url || '/' },
  }
  e.waitUntil(self.registration.showNotification(title, opts))
})

/* ── pushsubscriptionchange — กันแจ้งเตือน "เงียบหายเอง" ────────────────────────────
   เบราว์เซอร์หมุน/ยกเลิก subscription ได้เองโดยที่ผู้ใช้ไม่ได้ทำอะไร (อัปเดตเบราว์เซอร์ ·
   push service เปลี่ยน endpoint ฯลฯ) เมื่อเกิดขึ้น endpoint เดิมบนเซิร์ฟเวอร์กลายเป็นขยะ
   และแจ้งเตือน **เงียบไปตลอดกาลทั้งที่สวิตช์ในแอปยังเขียวอยู่** = ปุ่มหลอกที่เกิดทีหลัง

   SW สมัครใหม่ให้ได้ แต่ **เขียน Firebase เองไม่ได้** (ไม่มี token ผู้ใช้ในนี้) จึงส่งของใหม่
   ไปให้หน้าเว็บเป็นคนบันทึก — ครึ่งหลังอยู่ที่ `installPushSubscriptionSync()` ใน
   services/push.ts · ถ้าตอนนั้นไม่มีแท็บเปิดอยู่ ข้อความจะตกหาย แต่ `pushRefresh()`
   ตอนบูตครั้งถัดไปจะเขียนทะเบียนล่าสุดทับให้เองอยู่แล้ว ⇒ ไม่มีทางค้างถาวร

   ⚠️ ใช้ applicationServerKey ตัวเดิมจาก subscription เก่า — VAPID public key ไม่ถูก
   ฮาร์ดโค้ดซ้ำในไฟล์นี้ (และ private key ไม่เคยอยู่ฝั่ง client อยู่แล้ว) */
self.addEventListener('pushsubscriptionchange', function (e) {
  e.waitUntil(
    (async function () {
      try {
        var old = e.oldSubscription || (await self.registration.pushManager.getSubscription())
        var key = old && old.options && old.options.applicationServerKey
        if (!key) return
        var fresh =
          e.newSubscription ||
          (await self.registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: key,
          }))
        if (!fresh) return
        var j = fresh.toJSON()
        /* คีย์ของทะเบียนเก่า คำนวณด้วยสูตรเดียวกับ blob `_pushKey()` — ต้องส่งไปด้วย
           ไม่งั้นหน้าเว็บลบของเก่าไม่ถูก แล้วตัวส่งจะยิงไป endpoint ที่ตายแล้วตลอดไป */
        var oldKey = null
        if (old && old.endpoint) {
          var h = 0
          for (var i = 0; i < old.endpoint.length; i++) {
            h = ((h << 5) - h + old.endpoint.charCodeAt(i)) | 0
          }
          oldKey = 'k' + (h >>> 0).toString(36)
        }
        var cl = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        for (var n = 0; n < cl.length; n++) {
          cl[n].postMessage({
            type: 'iufit:push-resubscribed',
            endpoint: j.endpoint,
            keys: j.keys || {},
            oldKey: oldKey,
          })
        }
      } catch (_) {
        /* สมัครใหม่ไม่ได้ (สิทธิ์ถูกถอน ฯลฯ) — เงียบไว้ ไม่มีอะไรที่ SW ทำต่อได้
           หน้าเว็บจะเห็นสถานะจริงเองตอนเปิดครั้งถัดไปผ่าน pushRefresh() */
      }
    })(),
  )
})

self.addEventListener('notificationclick', function (e) {
  e.notification.close()
  const target = (e.notification.data && e.notification.data.url) || '/'
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (cl) {
      for (let i = 0; i < cl.length; i++) {
        if (cl[i].url.indexOf(self.location.origin) >= 0) {
          try {
            cl[i].focus()
          } catch (_) {}
          try {
            if (target && target !== '/' && 'navigate' in cl[i]) cl[i].navigate(target)
          } catch (_) {}
          return
        }
      }
      if (clients.openWindow) return clients.openWindow(target)
    }),
  )
})
