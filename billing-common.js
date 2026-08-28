/* IUFIT billing engine (vanilla) — shared by pricing.html / billing.html / my-plan.html
 * อ่านสถานะผู้ใช้จาก localStorage['iufit'] (same-origin) · platform guard · plan data · i18n TH/EN · Omise hook
 */
(function(){
  'use strict';

  function detectPlatform(){
    try{
      var p=localStorage.getItem('iufit_plat');
      if(p==='twa')return 'android_play_store';
      if(p==='ios')return 'ios_app_store';
      if(/[?&]twa=1/.test(location.search||''))return 'android_play_store';
      if((document.referrer||'').indexOf('android-app://')===0)return 'android_play_store';
    }catch(e){}
    return 'web';
  }
  var PLATFORM=detectPlatform();
  var IS_STORE=(PLATFORM==='android_play_store'||PLATFORM==='ios_app_store');

  /* ⭐ 2569-07-30 · ใส่ public key ตัว live แล้ว
     public key ออกแบบมาให้เปิดเผยได้ (ใช้สร้างโทเคนบัตรฝั่งเบราว์เซอร์เท่านั้น)
     🔴 secret key (`skey_…`) **ห้ามอยู่ในไฟล์นี้เด็ดขาด** — โฟลเดอร์ `line-oa/` ถูก deploy
        ขึ้นเว็บสาธารณะทั้งโฟลเดอร์ · ใครเปิด iufit.com/billing-common.js ก็อ่านได้ทันที
        secret key ต้องอยู่เป็น Cloudflare secret ของ worker `iufit-omise` เท่านั้น */
  /* 🔴 สวิตช์โหมดทดสอบ — **ต้องเป็น false ก่อนปล่อยขึ้นจริงทุกครั้ง**
     ═════════════════════════════════════════════════════════════════════════
     ความพลาดที่เจอบ่อยที่สุดของระบบรับเงินคือ "ปล่อยขึ้นจริงทั้งที่ยังเป็นคีย์ test"
     ⇒ ลูกค้ากดจ่าย เห็นว่าสำเร็จ แต่ไม่มีเงินเข้าเลยสักบาท และไม่มีใครรู้จนกว่าจะปิดบัญชี

     กันด้วยสองชั้น:
       1. ตัวแปรนี้เป็น **จุดเดียว** ที่สลับ — ไม่ต้องไปแก้คีย์ทีละที่แล้วลืมบางที่
       2. เมื่อเป็น true จะขึ้น **แถบสีส้มเต็มความกว้างบนหน้าชำระเงิน** (ดู billing.html)
          ⇒ ปล่อยขึ้นจริงโดยลืมปิด = เห็นทันทีตั้งแต่วินาทีแรกที่เปิดหน้า

     ⚠️ secret key ฝั่ง worker ต้องสลับให้ตรงกันด้วย ไม่งั้นคีย์คนละโหมดจะคุยกันไม่รู้เรื่อง
        `npx wrangler secret put OMISE_SECRET_KEY` (test ↔ live)
     ⚠️ webhook ของ Omise แยกคนละชุดระหว่าง test/live — ต้องตั้ง endpoint ทั้งสองโหมด */
  /* ⭐ 2569-07-31 · สลับเป็น live แล้ว
     ทดสอบครบก่อนสลับ: จ่ายสำเร็จ · บัตรถูกปฏิเสธ 4 แบบ · ยกเลิกกลาง 3DS · ปิดแท็บกลาง 3DS
     · แพ็กโค้ชเขียน entitlement ลง Firebase · แพ็กเครดิตเติมเข้ากระเป๋า iufit-gym
     · ด่านรายปี 4 ชั้น · ด่าน account · `/status` วนถามผล

     🔴 สลับกลับเป็น test ต้องทำ **สามอย่างพร้อมกัน** ไม่งั้นคีย์คนละโหมดคุยกันไม่รู้เรื่อง:
        1. ตัวแปรนี้         2. `wrangler secret put OMISE_SECRET_KEY`   3. webhook ใน Dashboard */
  var OMISE_TEST_MODE=false;

  /* public key ทั้งสองโหมด — เปิดเผยได้ทั้งคู่ (ใช้สร้างโทเคนบัตรฝั่งเบราว์เซอร์เท่านั้น) */
  var OMISE_PUBLIC_KEY = OMISE_TEST_MODE
    ? 'pkey_test_682il8abjyfta9ozpf9'
    : 'pkey_68iiiho57jpa67tnqzq';

  /* 🔴 ยังเป็น false โดย**เจตนา** — ห้ามเปลี่ยนเป็น true จนกว่าจะรองรับ 3DS ครบ
     ═════════════════════════════════════════════════════════════════════════
     บัญชี Omise ของเราถูกบังคับ **3-D Secure ทุกรายการ** ⇒ ผลของ `POST /charges`
     จะไม่ใช่ `successful` ทันที แต่เป็น `status:'pending'` + `authorize_uri`
     (หน้ายืนยัน OTP/แอปธนาคารของผู้ถือบัตร)

     แต่ `payNow()` ใน billing.html ตอนนี้เห็น `pending` แล้ว**พาไปหน้า "รอดำเนินการ" เฉย ๆ**
     ไม่เคยพาผู้ใช้ไป `authorize_uri` ⇒ ผู้ใช้ไม่มีโอกาสยืนยัน ⇒ charge ค้างแล้วหมดอายุ
     ⇒ **เงินไม่เข้าเลย 100% ของรายการ** และลูกค้าเข้าใจว่าจ่ายแล้ว = เรื่องใหญ่กว่าปิดไว้

     เปิดเป็น true ได้เมื่อครบ 3 ข้อ (ดู `01-เอกสาร-แผน-dev/เปิด-Omise-live-ขั้นตอน.md`):
       1. worker ส่ง `return_uri` ตอนสร้าง charge และตอบ `authorize_uri` กลับมา
       2. `payNow()` redirect ทั้งหน้าไป `authorize_uri` (ห้าม popup — ธนาคารหลายแห่งบล็อก)
       3. worker มี webhook `charge.complete` เป็น**แหล่งความจริงเดียว**ของการจ่ายเงิน
          (ห้ามเชื่อหน้าที่เบราว์เซอร์เด้งกลับ — ผู้ใช้ปิดแท็บกลางทางหรือแก้ URL เองได้)

     ⭐ 2569-07-30 · เปิดเป็น true แล้ว เพราะครบทั้ง 3 ข้อ:
        1. worker `iufit-omise` deploy แล้ว (`/health` ตอบ configured:true · kv:true)
        2. `payNow()` redirect ไป `authorize_uri` แล้ว
        3. webhook ตั้งใน Omise Dashboard ชี้มาที่ `/webhook` แล้ว
        ⚠️ แต่ **ยังไม่เคยมีใครเดินผ่านเส้นทาง 3DS จริงสักครั้ง** ⇒ ต้องอยู่โหมด test
           จนกว่าจะทดสอบครบ 4 เส้นทาง (สำเร็จ · ถูกปฏิเสธ · ยกเลิกกลางทาง · ปิดแท็บกลาง 3DS) */
  var OMISE_READY=true;

  /* 🔴 2569-07-30 · ปิดทางขาย "รายปี" ชั่วคราว — เจ้าของตัดสิน: ขายรายเดือนก่อน
     ═════════════════════════════════════════════════════════════════════════
     Omise จำกัด **3,000 บาท/รายการ** (ข้อจำกัดที่ยังไม่ปลด) แต่ราคารายปีคือ
       Starter 3,990 · Pro 5,990 · Growth 7,990  ⇒ **เกินเพดานทุกตัว**
     ปล่อยไว้ = ลูกค้ากดจ่ายรายปีแล้วถูกปฏิเสธ ไม่รู้สาเหตุ และเราเสียโอกาสขาย

     ⚠️ ห้ามแก้ด้วยการ "แบ่งเก็บเป็นหลายรายการ" — ผู้ออกบัตรมองว่าเป็นการเลี่ยงเพดาน

     ⭐ 2569-07-30 (รอบสอง) · เจ้าของปรับวิธี: **ให้ดูราคารายปีได้ แต่จ่ายไม่ได้**
        ปุ่มสลับ "รายปี · ประหยัด 2 เดือน" คงข้อความเดิม กดสลับดูราคาได้ตามปกติ
        แต่เมื่อเลือกรายปีจะ: ขึ้นการ์ดแจ้งเหนือรายการแพ็ก · ฟอร์มบัตรกรอกไม่ได้ · ปุ่มจ่ายกดไม่ได้

     🔴 ด่านกันยอดเกินเพดานจึงย้ายไปอยู่ **3 ชั้น** (ไม่ใช่ที่ตัวสลับรอบแล้ว):
        1. `renderPay()` — ล็อกฟอร์มบัตร + ปุ่มจ่าย เมื่อ `YR && !YEARLY_OPEN`
        2. `payNow()`    — ปฏิเสธตั้งแต่บรรทัดแรก (กันคนปลด disabled ใน devtools)
        3. **worker**    — `MAX_THB_PER_CHARGE = 3000` ปฏิเสธฝั่ง server (ด่านจริง)
        ⇒ ชั้น 1-2 คือ UX · ชั้น 3 คือความปลอดภัย · ห้ามถอดชั้นไหนออกโดยคิดว่าซ้ำซ้อน

     เปิดคืนเมื่อ Omise ปลดเพดานแล้ว: เปลี่ยนเป็น true ที่นี่ที่เดียว
     (และอย่าลืมขยับ `MAX_THB_PER_CHARGE` ใน `workers/iufit-omise/src/index.js` ให้สอดคล้อง) */
  var YEARLY_OPEN=false;

  /* 🔴 2569-08-01 · **แพ็กโค้ชยังไม่เปิดขาย — แต่เครดิต AI ซื้อได้** (คำสั่งเจ้าของ)
     ═══════════════════════════════════════════════════════════════════════════
     เหตุผล: หน้าขายประกาศไว้ว่า **"ฟรีถึง 31 ธ.ค. 2026 · ราคาด้านล่างเป็นราคาหลังจากนั้น"**
     ถ้าเก็บเงินค่าแพ็กตอนนี้ = เก็บเงินสวนกับสิ่งที่ประกาศเอง ⇒ ลูกค้าขอเงินคืนได้เต็ม ๆ

     ⭐ เจ้าของเลือก **ไม่แก้ข้อความหน้าขาย** แต่ปิดที่ปุ่มแทน — คำประกาศจึงยังเป็นจริงอยู่

     ทำไมเครดิต AI ยังขายได้: มันเป็น **คนละสินค้า** ที่ไม่เคยอยู่ในคำสัญญา "ฟรีถึงสิ้นปี"
     (คำสัญญานั้นพูดถึงแพ็กโค้ชเท่านั้น) · เครดิตซื้อครั้งเดียวจบ ไม่มีรอบบิล ไม่มี autopay

     🔴 ปิด 3 ชั้นเหมือนด่านรายปี — ห้ามถอดชั้นไหนโดยคิดว่าซ้ำซ้อน:
        1. `renderPay()` — ล็อกฟอร์มบัตร + ปุ่มจ่าย เมื่อ `KIND==='plan'`
        2. `payNow()`    — ปฏิเสธตั้งแต่บรรทัดแรก (กันคนปลด disabled ใน devtools)
        3. **worker**    — `/charge` ปฏิเสธ `kind!=='credit'` (ด่านจริง · ยิง API ตรงข้ามหน้าเว็บได้)

     เปิดขายเมื่อไหร่: เปลี่ยนเป็น true ที่นี่ **และ** ปลดด่านใน worker พร้อมกัน
     ถ้าเปลี่ยนแค่ที่นี่ ปุ่มจะกดได้แต่ server ปฏิเสธ ⇒ ผู้ใช้เห็น "ชำระเงินไม่สำเร็จ" */
  var PLANS_OPEN=false;

  /* ⭐ 2569-08-28 · พร้อมเพย์บนหน้าซื้อเครดิต = Omise PromptPay
     worker สร้าง source ด้วยยอดจากตารางราคา → คืน QR → webhook เติมเครดิต
     (โอนตรงเข้าเบอร์ IUFIT เลิกใช้บนหน้านี้แล้ว เพราะ worker จับยอดไม่ได้)
     `PROMPTPAY_OPEN` ยังเป็นสวิตช์ปิดปุ่มได้ · เบอร์ตั้งต้นยังใช้ที่ศูนย์แอดมิน/คอร์ส PT */
  var PROMPTPAY_OPEN=true;
  var PROMPTPAY_DEFAULT='0993959266';

  /* Cloudflare Worker `iufit-omise` — สร้าง charge ฝั่ง server (ที่เก็บ secret key)
     ⭐ 2569-07-31 · ซอร์สอยู่ในรีโปแล้วที่ `workers/iufit-omise/src/index.js`
        (คอมเมนต์เดิมเขียนว่า "ไม่อยู่ในโปรเจกต์นี้" ซึ่งล้าสมัยไปแล้ว) */
  var CHARGE_ENDPOINT='https://iufit-omise.ar-weerapong.workers.dev';

  /* Firebase Web API key — **สาธารณะโดยการออกแบบ** (Google เรียกว่า "ตัวระบุโปรเจกต์")
     ค่าเดียวกับ `src/config/runtime.ts` → `IUFIT_FB_KEY` ซึ่งอยู่ใน bundle ของแอปที่
     เสิร์ฟบน iufit.com อยู่แล้ว ⇒ ไม่ใช่ความลับ และซ่อนที่นี่ก็ไม่ได้เพิ่มอะไร
     🔴 ต่างจาก secret key ของ Omise (`skey_…`) โดยสิ้นเชิง — **ตัวนั้นห้ามอยู่ในไฟล์นี้เด็ดขาด**
     ใช้ทำอย่างเดียว: ต่ออายุ id token ของผู้ใช้เพื่อเอาไปยืนยันตัวตนกับ worker */
  var FB_KEY='AIzaSyBX7njtAb7n6uN1JG_e5QSq2Gkor8Ji4cc';
  var FB_DB='https://iufit-9dea7-default-rtdb.asia-southeast1.firebasedatabase.app';
  var LINE_URL='https://line.me/R/ti/p/@987qyznd';
  /* ===== ข้อมูลติดต่อผู้ให้บริการ (แสดงต่อสาธารณะ) =====
     ⭐ 2569-07-30 · เจ้าของตัดสินใจใหม่ (เพื่อปลดข้อจำกัดบัญชี Omise: โอนยอดถูกระงับ / บังคับ 3DS / จำกัด 3,000 บ.)
       แทนที่นโยบายเดิม "ไม่แสดงที่อยู่บ้าน + เบอร์ส่วนตัวเลย" ด้วย:
       · เบอร์โทร = **แสดงเสมอ เห็นได้ทันที** (Omise ต้องเห็นเบอร์ติดต่อบนหน้าเว็บ)
       · ที่อยู่   = **ซ่อนหลังตัวกดเปิด `<details>`** — ตรวจสอบได้ แต่ไม่โผล่ให้ bot/คนทั่วไปเก็บไปโดยไม่จำเป็น
       · เวลาทำการ = แสดงคู่กับเบอร์ เพื่อไม่ให้ผู้ซื้อโทรนอกเวลาแล้วเข้าใจว่าติดต่อไม่ได้

     ⭐ ค่าจริงจากเจ้าของ 2569-07-30 — **ห้าม agent แก้ค่าเหล่านี้เอง**
        ถ้าต้องเปลี่ยน ให้เจ้าของเป็นผู้ให้ค่าใหม่เท่านั้น (เป็นข้อมูลที่ยื่นให้ Omise แล้ว) */
  var CONTACT={
    name:'วีระพงศ์ แซ่เอี๊ยว',
    phone:'099-395-9266',
    /* ลำดับเดิมที่เจ้าของส่งมาเขียน "เขตมีนบุรี แขวงมีนบุรี" — เรียงใหม่เป็น แขวง→เขต
       ตามรูปแบบที่อยู่มาตรฐานไทย (ตัวชื่อไม่เปลี่ยน ทั้งสองคำเป็น "มีนบุรี" อยู่แล้ว) */
    address:'9 ซอยรามคำแหง 170 ถนนรามคำแหง แขวงมีนบุรี เขตมีนบุรี กรุงเทพมหานคร 10510',
    hours:'จันทร์ – ศุกร์ 10.00–16.00 น.',
    hoursEn:'Monday – Friday, 10:00–16:00 (ICT)',
    email:'support@iufit.com',
    line:'@987qyznd'
  };
  function isTodo(v){return /^__/.test(''+v);}
  function contactRowsHtml(){
    /* เบอร์โทร: ถ้ายังเป็นตัวยึดให้แสดงเป็นข้อความล้วน (ไม่ทำ tel: ที่ชี้ไปไหนไม่ได้) */
    var phoneCell=isTodo(CONTACT.phone)?CONTACT.phone
      :('<a class="blue" href="tel:'+CONTACT.phone.replace(/[^0-9+]/g,'')+'">'+CONTACT.phone+'</a>');
    return '<div class="crow"><span>'+t('c_name')+'</span><b>'+CONTACT.name+'</b></div>'+
      '<div class="crow"><span>'+t('c_phone')+'</span><b>'+phoneCell+'</b></div>'+
      /* เวลาทำการ — แสดงคู่กับเบอร์ ไม่ให้ผู้ซื้อโทรนอกเวลาแล้วคิดว่าติดต่อไม่ได้ */
      '<div class="crow"><span>'+t('c_hours')+'</span><b>'+(LANG==='en'?CONTACT.hoursEn:CONTACT.hours)+'</b></div>'+
      '<div class="crow"><span>'+t('c_email')+'</span><b><a class="blue" href="mailto:'+CONTACT.email+'">'+CONTACT.email+'</a></b></div>'+
      '<div class="crow"><span>'+t('c_line')+'</span><b><a class="blue" href="'+LINE_URL+'" target="_blank" rel="noopener">'+CONTACT.line+'</a></b></div>'+
      /* ที่อยู่ = ต้องกดดูอีกที (billing.css ไม่ได้อยู่ในสโคปแก้ ⇒ ใช้ inline style) */
      '<details style="margin-top:4px"><summary style="cursor:pointer;font-weight:700;font-size:13px;color:var(--blue);padding:8px 0">'+t('c_addr_show')+'</summary>'+
      '<div class="crow" style="border-bottom:none"><span>'+t('c_addr')+'</span><b style="white-space:pre-line">'+CONTACT.address+'</b></div></details>';
  }
  /* ⭐ 2569-08-08 · terms/privacy ในฟุตเตอร์เคยเป็น **สองลิงก์ที่หลุดจากกลไก `?lang=`**
     ═══════════════════════════════════════════════════════════════════════════
     ทุกลิงก์ที่นี่ส่ง `?lang=` ต่อให้หน้าถัดไปอยู่แล้ว (pricing · refund · contact ·
     billing · my-plan) เพราะหน้าเหล่านั้น **โหลดไฟล์นี้** แล้ววาดข้อความจาก `T.th`/`T.en`
     ⇒ พารามิเตอร์นั้นมีความหมายกับมันจริง (ดู `detectLang()`)

     แต่ `terms.html` · `privacy.html` เป็น **HTML นิ่งที่ไม่โหลดไฟล์นี้เลย** — ไม่มี
     `<script src="billing-common.js">` ไม่มี `T` ไม่มี `detectLang()` ⇒ ต่อ `?lang=en`
     ไปก็ไม่เกิดอะไรขึ้น ผู้ใช้ EN ยังได้เอกสาร `<html lang="th">` เหมือนเดิม
     ⇒ กลไก `?lang=` **แก้เคสนี้ไม่ได้โดยธรรมชาติของหน้าปลายทาง** ไม่ใช่เพราะใครลืมต่อ

     ทางที่ได้ผลจริงคือสลับ **ชื่อไฟล์** ไปที่ฉบับอังกฤษที่มีอยู่จริงบนเว็บแล้ว
     (`line-oa/{privacy,terms}.en.html` · ตรงกับที่ `src/components/LegalSheet.vue` ทำ)

     ⚠️ ห้ามเปลี่ยนชื่อไฟล์ฉบับไทย — `privacy.html` คือ URL ที่ผูกไว้ใน Google Play Console
        และ `terms.html`/`privacy.html` คือชุดที่ยื่นให้ Omise ตรวจ
     ด่าน: §F ใน `scripts/verify-legal.mjs` */
  var DOC_EN=(LANG==='en');
  /** ที่อยู่เอกสารสัญญาตามภาษา — **ตัวเดียวของทั้งโฟลเดอร์** (export ไว้ท้ายไฟล์)
      `pricing.html` มีลิงก์ terms/privacy ชุดที่สองอยู่ (id `l-terms` / `l-priv`) ซึ่งวันนี้
      สลับแค่ **ข้อความ** ไม่ได้สลับ `href` ⇒ ผู้ใช้ EN บนหน้าราคายังตกไปเอกสารไทย
      ⇒ แก้ที่นั้นด้วย `el.href=B.docHref('terms')` แทนการก๊อป ternary มาเป็นสำเนาที่สาม */
  function docHref(which){return (which==='terms'?'terms':'privacy')+(DOC_EN?'.en':'')+'.html';}
  function footerHtml(){
    return '<div class="ftcontact"><b>'+t('contact_title')+'</b>'+
      '<div>'+CONTACT.name+'</div>'+
      '<div>'+t('c_email')+': <a class="blue" href="mailto:'+CONTACT.email+'">'+CONTACT.email+'</a> · LINE: <a class="blue" href="'+LINE_URL+'" target="_blank" rel="noopener">'+CONTACT.line+'</a></div>'+
      '<div style="margin-top:6px"><a class="blue" href="pricing.html?lang='+LANG+'">'+t('nav_pricing')+'</a> · <a class="blue" href="refund.html?lang='+LANG+'">'+t('nav_refund')+'</a> · <a class="blue" href="'+docHref('terms')+'">'+(DOC_EN?'Terms':'ข้อกำหนด')+'</a> · <a class="blue" href="'+docHref('privacy')+'">'+(DOC_EN?'Privacy':'ความเป็นส่วนตัว')+'</a> · <a class="blue" href="contact.html?lang='+LANG+'">'+t('nav_contact')+'</a></div>'+
      '</div><div class="ftcopy">© 2026 IUFIT · <a class="blue" href="https://iufit.com">iufit.com</a></div>';
  }

  function appState(){try{return JSON.parse(localStorage.getItem('iufit')||'{}')||{};}catch(e){return {};}}
  function detectLang(){
    try{
      var q=new RegExp('[?&]lang=(th|en)').exec(location.search||'');if(q)return q[1];
      var l=localStorage.getItem('iufit_biller_lang');if(l==='th'||l==='en')return l;
      var s=appState();if(s.lang==='en'||s.lang==='th')return s.lang;
      if((navigator.language||'').slice(0,2)==='en')return 'en';
    }catch(e){}
    return 'th';
  }
  var LANG=detectLang();
  function setLang(l){try{localStorage.setItem('iufit_biller_lang',l);}catch(e){}location.reload();}
  var T={
    th:{
      nav_pricing:'เครดิต',nav_billing:'ซื้อเครดิต',nav_myplan:'ยอดของฉัน',
      pricing_title:'แพ็กเทรนเนอร์',pricing_sub:'ดูแลลูกเทรนเป็นระบบ — ส่งแผน รับการบ้าน ติดตามผล และให้ IU MATE ช่วยลดงานทุกวัน',
      personal_title:'สำหรับผู้ใช้ทั่วไป',personal_sub:'ไม่ใช่เทรนเนอร์? Personal ใช้ฟรี 100% · AI เป็นเครดิต (แจกฟรี 10 ครั้งแรก · ซื้อแพ็กเสริมได้)',
      /* ⭐ 2569-07-30 · ยกเลิก "ทดลองฟรี 30 วัน" แล้ว (ตรงกับ src/views/PricingView.vue: ยืนยันอีเมล → รับ Coach Pro)
         คีย์ trial_hero_* ยังถูกเรียกจาก pricing.html (T('th-t'/'th-m'/'th-cta')) ⇒ เปลี่ยนข้อความ ห้ามลบคีย์ */
      trial_hero_t:'เปิดโหมดโค้ช + ยืนยันอีเมล = ได้ Coach Pro',trial_hero_m:'ไม่ต้องใส่บัตร · ในช่วงเปิดตัว ยืนยันอีเมลในแอปแล้วใช้ Coach Pro ได้เลย',trial_hero_cta:'เปิดแอปเพื่อเริ่มใช้ →',
      trust_pay:'ชำระเงินปลอดภัย Omise',trust_pp:'รับบัตรเครดิต/เดบิต',trust_ssl:'เข้ารหัส SSL',
      why_title:'ทำไมเทรนเนอร์เลือก IUFIT',why1_t:'ครบในแอปเดียว',why1_m:'ส่งแผนอาหาร/ฝึก รับ-ตรวจการบ้าน แชท และติดตามผลลูกเทรน',why2_t:'IU MATE ช่วยลดงาน',why2_m:'ร่างเมนู/โปรแกรมฝึก สรุปการบ้าน และคนที่ต้องตามให้',why3_t:'ลูกเทรนไม่ต้องจ่าย',why3_m:'เชิญด้วย QR เข้าใช้ผ่านที่นั่งของคุณ ไม่ต้องซื้อแพ็กเอง',
      /* why4_* ถูกเรียกจาก pricing.html บรรทัด T('w4t','why4_t') แต่เดิม "ไม่มีคีย์" ⇒ หน้าเว็บโชว์คำว่า why4_t/why4_m ดิบ ๆ
         ข้อความด้านล่างอ้างฟีเจอร์ที่มีจริงเท่านั้น (my-plan.html: แจ้งเตือนก่อนหมดอายุ rem_paid_* + หน้าแพ็กของฉัน) */
      why4_t:'ต่ออายุไม่หลุด',why4_m:'มีแจ้งเตือนก่อนแพ็กหมดอายุ และหน้า “แพ็กของฉัน” ให้ดูสถานะ/ต่ออายุได้เอง',
      faq_title:'คำถามที่พบบ่อย',faq1_q:'จ่ายเงินยังไงบ้าง?',faq1_a:'เลือกแพ็ก → จ่ายด้วยบัตรเครดิต/เดบิต หรือสแกน PromptPay ผ่าน Omise · เครดิตเข้าอัตโนมัติเมื่อโอนสำเร็จ',faq2_q:'ทำไมในแอปไม่มีปุ่มซื้อ?',faq2_a:'ตามนโยบาย Google Play การสมัครแพ็กซอฟต์แวร์ทำผ่านเว็บนี้ (นอกแอป) · ส่วนค่าคอร์สเทรนตัวต่อตัว (บริการจริงระหว่างคุณกับลูกเทรน) จ่าย PromptPay ในแอปได้ปกติ',faq3_q:'ต่ออายุ / ยกเลิกยังไง?',faq3_a:'ต่ออายุที่หน้านี้เมื่อใกล้หมดอายุ (มีแจ้งเตือนล่วงหน้า) · ยกเลิกได้ทุกเมื่อ ไม่มีสัญญาผูกมัด · ข้อมูลลูกเทรนไม่หายแม้ลดแพ็ก',faq4_q:'1 แพ็กใช้ได้กี่เครื่อง?',faq4_a:'ใช้ได้ตามจำนวนที่กำหนดต่อแพ็ก · ย้ายเครื่องได้โดยติดต่อทีมงาน',faq5_q:'มีรับประกันคืนเงินไหม?',faq5_a:'เนื่องจากเป็นบริการดิจิทัลที่เปิดใช้ทันที เมื่อชำระแล้วโดยหลักจะไม่คืนเงิน · <b>ยกเว้นชำระผิดพลาดหรือซ้ำซ้อน ขอคืนได้ภายใน 7 วัน</b> นับจากวันที่ชำระ (ดูนโยบายการยกเลิกและคืนเงิน)',
      launch:'🎉 ช่วงเปิดตัว: ทุกแพ็กใช้ฟรีถึง 31 ธ.ค. 2026 · ราคาด้านล่างเป็นราคาหลังช่วงเปิดตัว · สนใจแพ็กทักไลน์ได้เลย',
      monthly:'รายเดือน',yearly:'รายปี · ประหยัด 2 เดือน',launch_price:'ฟรีถึง 31 ธ.ค. 2026',per_mo:'/เดือน',per_yr:'/ปี',
      current_plan:'แพ็กปัจจุบัน',choose_plan:'เลือกแพ็กนี้',contact:'ติดต่อสอบถาม',manage_web:'จัดการแพ็กผ่านเว็บ/ไลน์',cta_line:'สนใจแพ็ก → ทักไลน์',
      addon_title:'➕ Add-on · เพิ่มลูกเทรน',addon_desc:'ขยายจำนวนลูกเทรนได้โดยไม่ต้องเปลี่ยนแพ็ก (Starter & Pro)',addon_price:'+5 ลูกเทรน = ฿99/เดือน',addon_eg:'เช่น Pro ฿599 + add-on ฿99 = ฿698/เดือน ดูแลได้ 25 คน',
      /* ⭐ 2569-07-30 · how1 เดิมโฆษณา "ทดลองฟรี 30 วัน" ซึ่งยกเลิกแล้ว · คีย์ถูกเรียกที่ pricing.html T('hw-1','how1') ⇒ เปลี่ยนข้อความ */
      how_title:'เริ่มยังไง',how1:'<b>เริ่มใช้ในแอป</b> — เปิดแอป IUFIT → เปิดโหมดโค้ช → ยืนยันอีเมลเพื่อรับ Coach Pro ในช่วงเปิดตัว (ไม่ต้องใส่บัตร)',how2:'<b>พร้อมสมัครจริง</b> — กด “สมัคร” เลือกแพ็ก/รอบบิล แล้วชำระเงิน (หรือทักไลน์)',how3:'<b>ปลดล็อกอัตโนมัติ</b> — เปิดแอปด้วยบัญชีเดิม แพ็กจะเปิดให้เอง ลูกเทรนและข้อมูลอยู่ครบ',
      note_soft:'ค่าแพ็กเป็นการสมัครใช้ซอฟต์แวร์ IUFIT ผ่านเว็บไซต์ · ค่าเทรนระหว่างลูกเทรนกับโค้ชโอนตรงผ่าน PromptPay ของโค้ช (IUFIT ไม่ถือเงินแทน)',
      store_note_t:'เปิดในแอป',store_note_m:'การสมัคร/ชำระเงินทำผ่านเว็บไซต์หรือ LINE · ในแอปดูสถานะแพ็กของคุณได้',
      billing_title:'ซื้อเครดิต AI',acct_prefix:'บัญชี: ',acct_bind:' · เครดิตจะผูกกับบัญชีอีเมลที่ยืนยันแล้ว',acct_login:'เข้าสู่ระบบในแอปด้วยอีเมล/LINE แล้วกลับมาที่หน้านี้',
      pick_plan:'เลือกแพ็ก',clients_unit:' คน',pay_method:'วิธีชำระเงิน',pm_card:'💳 บัตรเครดิต/เดบิต',pm_pp:'📱 PromptPay',pm_pp_soon:'เร็ว ๆ นี้',
      pp_btn:'สร้าง QR พร้อมเพย์',
      pp_hint:'สแกน QR PromptPay ผ่าน Omise · เมื่อโอนสำเร็จ เครดิตเข้าอัตโนมัติ ไม่ต้องทักไลน์',
      pp_wait_t:'สแกน QR เพื่อโอนพร้อมเพย์',
      pp_wait_m:'เปิดแอปธนาคารแล้วสแกน · เมื่อโอนสำเร็จ เครดิตเข้ากระเป๋าให้อัตโนมัติ',
      pp_expire:'QR ระบุยอดแล้ว · เปิดหน้านี้ไว้จนกว่าจะขึ้นว่าสำเร็จ · ปิดไปได้ เครดิตยังเข้าเมื่อโอนครบ',
      pp_ref:'รหัสอ้างอิง',
      pp_line_after:'ทักไลน์ถ้าเครดิตไม่เข้าใน 5 นาที',
      pp_direct_note:'จ่ายผ่าน Omise · เครดิตเข้าอัตโนมัติหลังโอนสำเร็จ',
      pp_copy:'คัดลอกรหัส',
      pp_copy_ok:'คัดลอกรหัสแล้ว',
      pp_back:'เลือกวิธีจ่ายใหม่',
      pp_poll:'กำลังรอการโอน · เครดิตจะเข้าเมื่อโอนสำเร็จ',
      card_name:'ชื่อบนบัตร',card_name_ph:'ชื่อ-สกุล',card_num:'หมายเลขบัตร',card_exp:'หมดอายุ (ดด/ปป)',card_cvv:'CVV',pay_btn:'ชำระเงิน',
      secure_note:'🔒 ข้อมูลบัตรถูกเข้ารหัสและส่งตรงให้ Omise · IUFIT ไม่เก็บเลขบัตร',
      secure_note_pp:'🔒 QR ออกโดย Omise · IUFIT ไม่เห็นเลขบัญชีธนาคารของคุณ · เครดิตเข้าอัตโนมัติเมื่อโอนสำเร็จ',
      omise_soon_t:'ระบบชำระออนไลน์กำลังเปิดให้บริการ',omise_soon_m:'จองราคาเปิดตัวไว้ก่อนได้ — ราคานี้จะถูกล็อกให้คุณ แล้วแอดมินช่วยเปิดแพ็กให้ทันที',
      /* ⭐ 2569-07-30 · ถอด book_line / reserve_local ออก — ไม่มีปุ่มเรียกแล้ว
         (มีไว้ตอนยังไม่มีช่องทางจ่ายจริง · ตอนนี้เหลือทางเดียวคือชำระผ่าน Omise) */
      order_total:'ยอดชำระ',equiv:'เทียบเท่า',
      store_guard_t:'สมัครผ่านเว็บหรือ LINE',store_guard_m:'การชำระเงินทำนอกแอป · เปิด iufit.com/billing.html ในเบราว์เซอร์ หรือทักไลน์เพื่อสมัคร — เปิดแอปด้วยบัญชีเดิมแล้วแพ็กจะปลดล็อกให้อัตโนมัติ',
      line_btn:'💬 ทักไลน์ @987qyznd',
      res_success_t:'ชำระเงินสำเร็จ',/* ⭐ 2569-07-30 (รอบสอง) · คืนข้อความ "อัตโนมัติ" แล้ว — ตอนนี้**เป็นจริง**
   worker เขียน entitlement ลง Firebase `/entitlements/{key}` ทันทีที่ webhook ยืนยันว่าจ่ายสำเร็จ
   ทดสอบจริงแล้วได้ `{plan:'starter',exp:'2026-08-30',status:'active',autopay:true}`

   🔴 กฎ: ข้อความนี้ผูกกับความสามารถจริงของระบบ — ถ้าวันไหนถอด `writeEntitlement()` ออก
      ต้องแก้ข้อความนี้ด้วย ห้ามปล่อยให้สัญญาสิ่งที่ทำไม่ได้ */
res_success_m:'แพ็กของคุณเปิดใช้งานแล้ว · เปิดแอป IUFIT ด้วยบัญชีเดิม แพ็กจะปลดล็อกอัตโนมัติภายในไม่กี่วินาที',
      res_pending_t:'รอการยืนยันการชำระ',res_pending_m:'เรากำลังรอผลการชำระเงิน (เช่น การยืนยัน 3-D Secure กับธนาคารของคุณ) · เมื่อสำเร็จ แพ็กจะเปิดให้อัตโนมัติ',
      res_failed_t:'ชำระเงินไม่สำเร็จ',res_failed_m:'ยังไม่มีการตัดเงิน · ลองใหม่อีกครั้ง หรือทักไลน์ให้เราช่วย',
      /* 🔴 2569-08-04 · "ไม่ทราบผล" ≠ "ไม่สำเร็จ" — ใช้เมื่อคำขอถูกส่งออกไปแล้วแต่คำตอบไม่กลับมา
         (เน็ตหลุด · worker ตอบ 5xx · ก้อน JSON อ่านไม่ออก) ⇒ เงินอาจถูกตัดไปแล้วจริง ๆ
         ห้ามมีคำว่า "ไม่สำเร็จ" และห้ามชวนให้จ่ายซ้ำเด็ดขาด — หน้านี้จึงไม่มีปุ่มลองใหม่ */
      res_unknown_t:'ยังไม่ทราบผลการชำระเงิน',res_unknown_m:'คำขอถูกส่งออกไปแล้วแต่คำตอบไม่กลับมา · เงินอาจถูกตัดไปแล้ว 🔴 กรุณาอย่าเพิ่งกดจ่ายซ้ำ — ทักไลน์มาแจ้งเรา เราตรวจให้ได้ทันทีและคืนเงินให้ถ้าซ้ำ',
      go_myplan:'ดูยอดเครดิต',retry:'ลองชำระอีกครั้ง',line_help:'ทักไลน์ขอความช่วยเหลือ',
      myplan_title:'แพ็กของฉัน',acct_hint:'เปิดหน้านี้บนอุปกรณ์เดียวกับที่ใช้แอป เพื่อดูสถานะแพ็กของคุณ',
      cur_label:'แพ็กปัจจุบัน',trial_left:'ทดลองฟรี · เหลือ {d} วัน · ไม่ต้องใส่บัตร',expires_on:'หมดอายุ {date}',days_more:' · อีก {d} วัน',one_client:'ดูแลลูกเทรนได้ 3 คน',
      pill_trial:'TRIAL',pill_active:'ACTIVE',pill_free:'FREE',trial_name:'Trainer Pro (ทดลอง)',free_name:'Trainer Free',
      rem_trial_soon:'⚠️ ทดลองใกล้หมด',rem_trial:'⏳ แจ้งเตือนทดลองใช้งาน',rem_trial_m:'เหลืออีก {d} วัน · สมัครต่อเพื่อคงสิทธิ์ Trainer Pro และลูกเทรนทั้งหมด',
      rem_exp_t:'หมดช่วงทดลองแล้ว',rem_exp_m:'ตอนนี้เป็น Trainer Free · ข้อมูลอยู่ครบ · อัปเกรดเพื่อปลดล็อกลูกเทรนและฟีเจอร์ Pro กลับมา',
      rem_paid_t:'⏰ แพ็กใกล้หมดอายุ',rem_paid_m:'อีก {d} วัน ({date}) · ต่ออายุเพื่อคงลูกเทรนและฟีเจอร์ไว้',
      know_title:'เมื่อสมาชิกหมดอายุ',know1:'เมื่อแพ็ก/ช่วงทดลองหมดอายุ <b>ข้อมูลไม่หาย</b> — กลับเป็น Trainer Free (ดูแลลูกเทรนได้ 3 คน)',know2:'ลูกเทรนที่เกินสิทธิ์จะถูกล็อกเป็น <b>อ่านอย่างเดียว</b> ชั่วคราว (ไม่ถูกลบ) — อัปเกรดเมื่อไรก็กลับมาใช้ได้ครบ',know3:'อัปเกรด/ต่ออายุได้ทุกเมื่อ แพ็กจะปลดล็อกในแอปอัตโนมัติ',
      act_store_t:'จัดการแพ็กผ่านเว็บ/LINE',act_store_m:'เปิด iufit.com/billing.html ในเบราว์เซอร์ หรือทักไลน์เพื่อสมัคร/ต่ออายุ — แพ็กจะปลดล็อกในแอปอัตโนมัติ',
      act_sub_keep:'สมัครต่อ · คงสิทธิ์ Pro',act_see_all:'ดูแพ็กทั้งหมด',act_renew:'🔄 ต่ออายุแพ็กนี้',act_change:'เปลี่ยน/อัปเกรดแพ็ก',act_upgrade:'อัปเกรดเป็น Trainer Pro',
      nav_refund:'คืนเงิน',nav_contact:'ติดต่อ',
      refund_title:'นโยบายการยกเลิกและคืนเงิน',refund_sub:'สำหรับบริการสมาชิกซอฟต์แวร์ IUFIT (บริการดิจิทัลแบบสมัครสมาชิก)',
      /* ⭐ 2569-07-30 · นโยบายคืนเงินฉบับที่ยืน — ต้องตรงกับ terms.html ข้อ 4 เป๊ะ ๆ
         "โดยหลักไม่คืนเงิน · ยกเว้นชำระผิดพลาด/ซ้ำซ้อน ขอได้ภายใน 7 วัน"
         เลิกใช้ถ้อยคำ "ไม่คืนเงินทุกกรณี" + "ตามดุลยพินิจ" (ขัด กม.คุ้มครองผู้บริโภค / ไม่มีเกณฑ์ชัด) */
      refund_p1:'<b>เป็นบริการดิจิทัลแบบสมัครสมาชิก</b> — แพ็กซอฟต์แวร์ IUFIT เปิดใช้งานให้ทันทีหลังชำระเงิน ดังนั้น<b>โดยหลักจะไม่มีการคืนเงิน</b>เมื่อชำระแล้ว',
      refund_p2:'<b>ข้อยกเว้น — ชำระผิดพลาดหรือซ้ำซ้อน:</b> หากถูกเรียกเก็บเงินซ้ำ เรียกเก็บเกินจำนวน หรือเกิดข้อผิดพลาดในการชำระเงิน คุณขอคืนเงินได้<b>ภายใน 7 วัน</b> นับจากวันที่ชำระ',
      refund_p3:'<b>วิธีคืนเงิน:</b> เมื่อได้รับอนุมัติ จะคืนผ่าน<b>ช่องทางการชำระเงินเดิมเท่านั้น</b> ภายใน 7–14 วันทำการ',
      refund_p4:'<b>การยกเลิก:</b> ยกเลิกการต่ออายุอัตโนมัติได้ทุกเมื่อ มีผลกับรอบบิลถัดไป จะไม่ถูกเรียกเก็บเงินอีก และยังใช้งานได้จนครบรอบที่ชำระไว้แล้ว',
      refund_p5:'<b>ช่องทางขอคืนเงิน/สอบถาม:</b> อีเมล <a class="blue" href="mailto:support@iufit.com">support@iufit.com</a> หรือ LINE OA <a class="blue" href="https://line.me/R/ti/p/@987qyznd" target="_blank" rel="noopener">@987qyznd</a> · ทั้งนี้นโยบายนี้<b>ไม่กระทบสิทธิของผู้บริโภคตามที่กฎหมายไทยกำหนด</b>',
      consent_refund:'ฉันได้อ่านและยอมรับนโยบายการยกเลิก/คืนเงิน และข้อกำหนดการใช้บริการ',
      consent_req:'กรุณายอมรับนโยบายคืนเงินก่อนชำระเงิน',
      contact_title:'ข้อมูลติดต่อผู้ให้บริการ',c_name:'ชื่อผู้ประกอบการ',c_addr:'ที่อยู่',c_addr_show:'▾ ดูที่อยู่ผู้ประกอบการ',c_phone:'โทรศัพท์',c_hours:'เวลาทำการ',c_email:'อีเมล',c_line:'LINE',
      /* การ์ดแจ้งว่ารายปียังไม่เปิด — ขึ้นเหนือรายการแพ็กใน billing.html และใต้ตัวสลับใน pricing.html
         ⚠️ วันที่นี้เป็น **คำสัญญาต่อสาธารณะ** ถ้าจะเลื่อน ต้องแก้ที่นี่ที่เดียวและแจ้งลูกค้า */
      yr_soon_t:'ระบบชำระรายปียังไม่เปิดให้บริการ ',
      yr_soon_m:'จะเปิดให้บริการวันที่ 1 มกราคม 2570 · ระหว่างนี้เลือกชำระแบบรายเดือนได้ตามปกติ',
      /* แพ็กโค้ชยังไม่เปิดขาย — ต้องบอก "ยังไม่ต้องจ่าย" ไม่ใช่ "ระบบขัดข้อง"
         เพราะสิ่งที่เกิดขึ้นคือของฟรี ไม่ใช่ความผิดพลาด */
      pl_free_t:'ตอนนี้ยังไม่ต้องจ่าย ',
      pl_free_m:'ทุกแพ็กใช้ฟรีถึง 31 ธ.ค. 2569 · ราคาที่เห็นคือราคาหลังจากนั้น เราจะแจ้งล่วงหน้าก่อนเริ่มเก็บเงิน',
      pl_free_btn:'ใช้ฟรีอยู่แล้ว ไม่ต้องชำระเงิน',
      pl_free_cr:'ถ้าต้องการเครดิต AI เพิ่ม เลือกแท็บ "เครดิต AI" ด้านบนได้เลย',
      cr_title:'แพ็กเครดิต AI',
      cr_sub:'สำหรับสแกนอาหารด้วยภาพและวิเคราะห์ด้วย AI · ซื้อครั้งเดียว ไม่มีรายเดือน',
      cr_scan:'สแกนอาหาร',
      cr_analyze:'วิเคราะห์',
      cr_unit:'ครั้ง',
      cr_pick:'เลือกแพ็กเครดิต',
      cr_once:'ชำระครั้งเดียว',
      cr_need_email_t:'แพ็กเครดิตต้องใช้บัญชีที่ยืนยันอีเมลแล้ว',
      cr_need_email_m:'เครดิตผูกกับบัญชีอีเมล · กรุณาเข้าสู่ระบบด้วยอีเมลและยืนยันอีเมลในแอปก่อน แล้วกลับมาที่หน้านี้',
      cr_tab_plan:'แพ็กโค้ช',
      cr_tab_credit:'เครดิต AI',
      /* ข้อความหน้าสำเร็จของ "เครดิต" ต้องต่างจาก "แพ็ก" — คนละสินค้า คนละสิ่งที่ได้รับ
         เดิมใช้ข้อความเดียวกัน ⇒ ซื้อเครดิตแล้วขึ้นว่า "แพ็กของคุณเปิดใช้งานแล้ว" ซึ่งไม่จริง */
      cr_success_m:'เครดิตถูกเติมเข้าบัญชีของคุณแล้ว · เปิดแอป IUFIT ด้วยบัญชีเดิม ยอดเครดิตจะอัปเดตอัตโนมัติ',
      wal_title:'เครดิต AI คงเหลือ',
      wal_loading:'กำลังอ่านยอด…',
      wal_no_acct:'ยังไม่พบบัญชีที่ผูกกับ LINE OA — เปิดแอป IUFIT ล็อกอินด้วย LINE หรืออีเมลก่อน',
      wal_scan:'สแกนอาหารเหลือ',
      wal_analyze:'วิเคราะห์เหลือ',
      wal_unlimited:'ไม่จำกัด',
      wal_locked:'ยังอ่านยอดไม่ได้ — ยืนยันอีเมลในแอปเพื่อปลดล็อกเครดิต AI',
      wal_unavailable:'อ่านยอดเครดิตไม่ได้ตอนนี้ — ลองใหม่ในอีกสักครู่',
      need_login_t:'ต้องเข้าสู่ระบบก่อนชำระเงิน',
      need_login_m:'เราต้องรู้ว่าจะเติมเครดิตให้บัญชีไหน · กรุณาเปิดแอป IUFIT แล้วเข้าสู่ระบบ จากนั้นกลับมาที่หน้านี้อีกครั้ง',
      pay_checking:'กำลังตรวจสอบผลการชำระเงิน…',
      pay_paid_t:'ชำระเงินสำเร็จ',
      pay_paid_m:'แพ็กของคุณเปิดใช้งานแล้ว',
      pay_failed_t:'การชำระเงินไม่สำเร็จ',
      pay_failed_m:'ไม่มีการตัดเงินจากบัตรของคุณ · ลองใหม่อีกครั้งหรือทักไลน์หาเราได้เลย',
      pay_slow:'ผลยังไม่กลับมาภายในเวลาที่คาดไว้ · ไม่ต้องกังวล ถ้าเงินถูกตัดจริงระบบจะเปิดแพ็กให้อัตโนมัติ · ตรวจสอบได้ที่หน้าแพ็กของฉัน หรือทักไลน์หาเรา',
      /* ═══════════════════════════════════════════════════════════════════════════════
         🔴 2569-08-02 · "เงินถูกตัดแล้ว แต่เปิดสิทธิ์ยังไม่ได้" — คนละเรื่องกับ "ยังไม่รู้ผล"
         ═══════════════════════════════════════════════════════════════════════════════
         worker คืน `state:'pending'` + `charged:true` ในเคสนี้ (ถูกแล้ว — ยังไม่จบจริง)
         แต่เดิมหน้าเว็บพูดเหมือน "ยังไม่รู้ผล" ทุกประการ แล้ววนถามครบ 20 ครั้งก็ขึ้น
         `pay_slow` ที่ขึ้นต้นว่า "ผลยังไม่กลับมา" + "**ถ้า**เงินถูกตัดจริง"
         ⇒ ลูกค้าอ่านว่า "จ่ายไม่ผ่าน" แล้วไปกดจ่ายซ้ำ = ถูกตัดเงินรอบสองของจริง
         ⛔ ห้ามใช้คำที่มีเงื่อนไข ("ถ้า" / "อาจ") ในสองคีย์นี้ — เรารู้แน่แล้วว่าเงินออกไปแล้ว
         ⛔ ห้ามพูดว่า "สำเร็จ" เช่นกัน — ของยังไม่ถึงมือเขา */
      pay_charged_t:'เงินถูกตัดแล้ว · กำลังเปิดสิทธิ์ให้',
      pay_charged_m:'การชำระเงินของคุณสำเร็จเรียบร้อยแล้ว — ระบบกำลังเปิดสิทธิ์ให้อยู่ · **ไม่ต้องกดจ่ายซ้ำ** กรุณารอสักครู่ในหน้านี้',
      pay_slow_paid:'เงินถูกตัดจากบัตรของคุณเรียบร้อยแล้ว · ระบบกำลังเปิดสิทธิ์ให้และจะเสร็จเองอัตโนมัติ · **กรุณาอย่ากดจ่ายซ้ำ** — ตรวจสอบได้ที่หน้าแพ็กของฉัน หรือทักไลน์หาเราพร้อมแจ้งเวลาที่จ่าย',
      /* ===== ยกเลิก / เปิดการต่ออายุอัตโนมัติ (my-plan.html) ===========================
         🔴 ถ้อยคำต้องตรงกับสิ่งที่โค้ดทำจริงเป๊ะ ๆ — worker `/autopay` แตะแค่ฟิลด์ `autopay`
            **ไม่แตะ `exp` เลย** ⇒ ที่เขียนว่า "ใช้งานได้ถึงวันที่ …" เป็นความจริง ไม่ใช่คำปลอบ
            ถ้าวันไหนมีใครแก้ให้ตัดสิทธิ์ทันที ต้องมาแก้ข้อความชุดนี้ด้วย */
      ap_title:'การต่ออายุอัตโนมัติ',
      ap_loading:'กำลังตรวจสอบสถานะการต่ออายุ…',
      ap_working:'กำลังดำเนินการ…',
      ap_on:'<b>เปิดอยู่</b> — เมื่อถึงวันหมดอายุ ({date}) ระบบจะเรียกเก็บเงินจากบัตรที่บันทึกไว้ เพื่อต่อรอบถัดไปให้อัตโนมัติ',
      ap_off:'<b>ปิดแล้ว</b> — จะไม่มีการเรียกเก็บเงินอีก และคุณ<b>ยังใช้งานแพ็กได้ตามปกติจนถึงวันที่ {date}</b>',
      ap_off_nocard:'<b>ปิดอยู่</b> — ไม่มีการเรียกเก็บเงินอัตโนมัติสำหรับแพ็กนี้ · ต่ออายุเองได้ที่หน้าสมัคร',
      ap_cancel:'ยกเลิกการต่ออายุอัตโนมัติ',
      ap_resume:'เปิดการต่ออายุอัตโนมัติอีกครั้ง',
      ap_confirm:'ยกเลิกการต่ออายุอัตโนมัติใช่ไหม?\n\n• บัตรของคุณจะไม่ถูกเรียกเก็บเงินอีก\n• แพ็ก {plan} ยังใช้งานได้ตามปกติจนถึงวันที่ {date} — ไม่ถูกตัดสิทธิ์ทันที\n• เปิดการต่ออายุกลับได้ทุกเมื่อที่หน้านี้',
      ap_confirm_on:'เปิดการต่ออายุอัตโนมัติอีกครั้งใช่ไหม?\n\n• เมื่อถึงวันที่ {date} ระบบจะเรียกเก็บเงินจากบัตรที่บันทึกไว้เพื่อต่อรอบถัดไป\n• ยกเลิกได้ทุกเมื่อที่หน้านี้',
      ap_done_t:'ยกเลิกการต่ออายุอัตโนมัติแล้ว',
      ap_done_m:'จะไม่มีการเรียกเก็บเงินอีก · แพ็กของคุณใช้งานได้ถึงวันที่ {date}',
      ap_res_t:'เปิดการต่ออายุอัตโนมัติแล้ว',
      ap_res_m:'ระบบจะต่อรอบถัดไปให้อัตโนมัติเมื่อถึงวันที่ {date}',
      ap_login_t:'ต้องเข้าสู่ระบบก่อนจัดการการต่ออายุ',
      ap_login_m:'เพื่อความปลอดภัย เราต้องยืนยันก่อนว่าคุณเป็นเจ้าของบัญชีนี้จริง · กรุณาเปิดแอป IUFIT เข้าสู่ระบบด้วยอีเมล แล้วกลับมาที่หน้านี้อีกครั้ง',
      ap_line_t:'ยกเลิกผ่านทีมงาน',
      ap_line_m:'บัญชีนี้ยังจัดการการต่ออายุจากหน้าเว็บไม่ได้ · ทักไลน์แจ้งว่า “ขอยกเลิกการต่ออายุอัตโนมัติ” ทีมงานจะปิดให้ในเวลาทำการ และสิทธิ์ของคุณจะอยู่จนครบรอบที่ชำระไว้แล้ว',
      /* 🔴 2569-08-01 · แยกคนละสถานการณ์ ไม่ใช้ ap_fail ก้อนเดียวทุกกรณี
         `ap_fail`     = ผู้ใช้กดปุ่มแล้วไม่สำเร็จ
         `ap_read`     = เปิดหน้ามาแล้วอ่านสถานะไม่ได้ (ผู้ใช้ยังไม่ได้ทำอะไร)
         `ap_mismatch` = บัญชีในเครื่องไม่ตรงกับบัญชีที่ล็อกอิน (ด่านทำงานถูก ไม่ใช่ระบบพัง) */
      ap_read_t:'ยังดูสถานะการต่ออายุไม่ได้ตอนนี้ ',
      ap_read_m:'แพ็กของคุณไม่ได้รับผลกระทบ · ลองรีเฟรชหน้านี้อีกครั้ง ถ้ายังไม่ได้ทักไลน์มาได้เลย',
      ap_mismatch_t:'บัญชีในเครื่องนี้ไม่ตรงกับบัญชีที่เข้าสู่ระบบ ',
      ap_mismatch_m:'เพื่อความปลอดภัย เราจะไม่แสดงหรือแก้ข้อมูลการเงินของบัญชีอื่น · เข้าสู่ระบบด้วยบัญชีที่ซื้อแพ็กไว้ในแอป แล้วเปิดหน้านี้อีกครั้ง',
      ap_fail_t:'ยังทำรายการไม่สำเร็จ',
      ap_fail_m:'ยังไม่มีการเปลี่ยนแปลงใด ๆ กับแพ็กของคุณ · ลองใหม่อีกครั้ง หรือทักไลน์ให้เราช่วยยกเลิกให้',
      /* ===== กันกดจ่ายซ้ำ / ยิงถี่เกิน (billing.html) ================================ */
      pay_processing:'กำลังดำเนินการ…',
      pay_dup_t:'มีรายการที่กำลังดำเนินการอยู่แล้ว',
      pay_dup_m:'คุณเพิ่งเริ่มชำระแพ็กนี้ไปเมื่อสักครู่ · เพื่อไม่ให้ถูกตัดเงินซ้ำ ระบบจึงยังไม่สร้างรายการใหม่ · ตรวจที่หน้า “แพ็กของฉัน” ก่อน หรือรอสักครู่แล้วลองใหม่',
      pay_rate_t:'ลองบ่อยเกินไป',
      pay_rate_m:'เพื่อความปลอดภัยของระบบชำระเงิน กรุณารอสักครู่แล้วลองใหม่อีกครั้ง · ยังไม่มีการตัดเงินจากบัตรของคุณ',
      /* 🔴 2569-08-02 · คนละเรื่องกับ `pay_dup_*` โดยสิ้นเชิง — ต้องแยกข้อความ
         `pay_dup_*`    = ยังไม่รู้ผล มีรายการค้างอยู่   ⇒ "รอดูผลก่อน"
         `pay_recent_*` = **จ่ายสำเร็จไปแล้ว** เมื่อครู่นี้ ⇒ "คุณได้ของแล้ว ไม่ต้องจ่ายซ้ำ"
         ถ้าใช้ข้อความเดียวกัน คนที่จ่ายสำเร็จแล้วจะนึกว่ายังไม่สำเร็จแล้วไปลองบัตรใบอื่น */
      pay_recent_t:'ชำระเงินรายการนี้สำเร็จไปแล้วเมื่อครู่นี้',
      pay_recent_m:'เราจึงไม่สร้างรายการใหม่ให้ เพื่อไม่ให้คุณถูกตัดเงินซ้ำ · ตรวจสอบได้ที่หน้า “แพ็กของฉัน” · ถ้าคิดว่ามีอะไรผิดพลาด ทักไลน์หาเราได้เลย',
      testmode_t:'⚠️ โหมดทดสอบ — ไม่มีการตัดเงินจริง',
      testmode_m:'หน้านี้กำลังใช้คีย์ทดสอบของ Omise · รับได้เฉพาะบัตรทดสอบเท่านั้น บัตรจริงจะถูกปฏิเสธ · ถ้าคุณเห็นข้อความนี้บนเว็บจริง กรุณาแจ้งเราทาง LINE'
    },
    en:{
      nav_pricing:'Credits',nav_billing:'Buy credits',nav_myplan:'My balance',
      pricing_title:'Trainer plans',pricing_sub:'Coach clients systematically — send plans, collect homework, track results, and let IU MATE cut your daily work.',
      personal_title:'For individuals',personal_sub:'Not a coach? Personal is 100% free · AI runs on credits (10 free to start · add-on packs available).',
      /* ⭐ 2569-07-30 · 30-day free trial was cancelled — keep the keys (pricing.html calls them), change the copy */
      trial_hero_t:'Turn on coach mode + verify your email = Coach Pro',trial_hero_m:'No card · during the launch period, verify your email in the app and Coach Pro is yours',trial_hero_cta:'Open the app to start →',
      trust_pay:'Secure payments by Omise',trust_pp:'Credit/debit cards accepted',trust_ssl:'SSL encrypted',
      why_title:'Why coaches choose IUFIT',why1_t:'All in one app',why1_m:'Send meal/workout plans, review homework, chat, and track clients',why2_t:'IU MATE cuts your work',why2_m:'Draft menus/programs, summarize homework and at-risk clients',why3_t:'Clients pay nothing',why3_m:'Invite by QR — they join on your seats, no purchase needed',
      why4_t:'Never miss a renewal',why4_m:'Reminders before your plan expires, plus a “My plan” page to check status and renew yourself',
      faq_title:'FAQ',faq1_q:'How do I pay?',faq1_a:'Pick a plan → pay by credit/debit card or scan PromptPay via Omise · credits are added automatically when the transfer succeeds.',faq2_q:'Why is there no buy button in the app?',faq2_a:'Per Google Play policy, software plans are purchased on this website (outside the app). One-on-one PT fees (a real service between you and your client) can still be paid via PromptPay inside the app.',faq3_q:'How do I renew / cancel?',faq3_a:'Renew here when your plan is about to expire (you get reminders) · cancel anytime, no contract · client data is never lost even if you downgrade.',faq4_q:'How many devices per plan?',faq4_a:'Each plan allows a set number of devices · contact us to move devices.',faq5_q:'Is there a refund guarantee?',faq5_a:'Because this is a digital service activated immediately, fees are generally non-refundable once paid · <b>except for incorrect or duplicate payments, which you can claim within 7 days</b> of the payment date (see the cancellation &amp; refund policy).',
      launch:'🎉 Launch period: all plans are free through 31 Dec 2026 · prices below apply after launch · chat on LINE if interested.',
      monthly:'Monthly',yearly:'Yearly · save 2 months',launch_price:'Free until 31 Dec 2026',per_mo:'/mo',per_yr:'/yr',
      current_plan:'Current plan',choose_plan:'Choose this plan',contact:'Contact us',manage_web:'Manage on web / LINE',cta_line:'Interested? Chat on LINE',
      addon_title:'➕ Add-on · more clients',addon_desc:'Expand your client limit without changing plan (Starter & Pro).',addon_price:'+5 clients = ฿99/mo',addon_eg:'e.g. Pro ฿599 + add-on ฿99 = ฿698/mo for 25 clients',
      how_title:'How to start',how1:'<b>Start in the app</b> — open IUFIT → turn on coach mode → verify your email to get Coach Pro during the launch period (no card).',how2:'<b>Ready to subscribe</b> — tap “Subscribe”, pick a plan & cycle, then pay (or chat on LINE).',how3:'<b>Auto-unlock</b> — open the app with the same account; your plan activates automatically, clients & data intact.',
      note_soft:'Plan fees are a subscription to IUFIT software via the website · Client↔coach payments transfer directly via the coach PromptPay (IUFIT does not hold funds).',
      store_note_t:'Opened in the app',store_note_m:'Subscription/payment is done on the website or LINE · in the app you can view your plan status.',
      billing_title:'Buy AI credits',acct_prefix:'Account: ',acct_bind:' · credits link to your verified e-mail',acct_login:'Sign in inside the app with e-mail/LINE, then return here.',
      pick_plan:'Choose a plan',clients_unit:' clients',pay_method:'Payment method',pm_card:'💳 Credit/Debit card',pm_pp:'📱 PromptPay',pm_pp_soon:'coming soon',
      pp_btn:'Create PromptPay QR',
      pp_hint:'Scan the Omise PromptPay QR · credits are added automatically when the transfer succeeds — no LINE message needed.',
      pp_wait_t:'Scan to pay with PromptPay',
      pp_wait_m:'Open your bank app and scan · credits land in your wallet automatically after the transfer.',
      pp_expire:'The QR already includes the amount · keep this page open until it says paid · you can close it; credits still arrive when the transfer completes.',
      pp_ref:'Reference',
      pp_line_after:'Message LINE if credits have not arrived in 5 minutes',
      pp_direct_note:'Paid via Omise · credits are added automatically after a successful transfer',
      pp_copy:'Copy reference',
      pp_copy_ok:'Reference copied',
      pp_back:'Choose another payment method',
      pp_poll:'Waiting for the transfer · credits will be added when it succeeds',
      card_name:'Name on card',card_name_ph:'Full name',card_num:'Card number',card_exp:'Expiry (MM/YY)',card_cvv:'CVV',pay_btn:'Pay',
      secure_note:'🔒 Card details are encrypted and sent directly to Omise · IUFIT never stores your card.',
      secure_note_pp:'🔒 QR issued by Omise · IUFIT never sees your bank account number · credits are added automatically when the transfer succeeds',
      omise_soon_t:'Online payment is opening soon',omise_soon_m:'Reserve the launch price now — it will be locked for you and our team activates your plan right away.',

      order_total:'Total',equiv:'Equivalent',
      store_guard_t:'Subscribe on web or LINE',store_guard_m:'Payment happens outside the app · open iufit.com/billing.html in a browser or chat on LINE — open the app with the same account and your plan unlocks automatically.',
      line_btn:'💬 Chat on LINE @987qyznd',
      res_success_t:'Payment successful',res_success_m:'Your plan is active · open IUFIT with the same account and it unlocks automatically within seconds.',
      res_pending_t:'Awaiting payment confirmation',res_pending_m:'We are waiting for the payment result (e.g. 3-D Secure confirmation with your bank) · once done, your plan activates automatically.',
      res_failed_t:'Payment failed',res_failed_m:'No charge was made · try again, or chat on LINE for help.',
      /* คู่ภาษาอังกฤษของ `res_unknown_*` — ความหมายต้องตรงกันเป๊ะ: ไม่ทราบผล ไม่ใช่ล้มเหลว */
      res_unknown_t:'Payment result unknown',res_unknown_m:'Your request was sent but no answer came back · your card may already have been charged. 🔴 Please do not pay again — message us on LINE and we will check right away and refund any duplicate.',
      go_myplan:'View credit balance',retry:'Try paying again',line_help:'Chat on LINE for help',
      myplan_title:'My plan',acct_hint:'Open this page on the same device as the app to see your plan status.',
      cur_label:'Current plan',trial_left:'Free trial · {d} days left · no card',expires_on:'Expires {date}',days_more:' · {d} days left',one_client:'3 clients',
      pill_trial:'TRIAL',pill_active:'ACTIVE',pill_free:'FREE',trial_name:'Trainer Pro (trial)',free_name:'Trainer Free',
      rem_trial_soon:'⚠️ Trial ending soon',rem_trial:'⏳ Trial reminder',rem_trial_m:'{d} days left · subscribe to keep Trainer Pro and all your clients.',
      rem_exp_t:'Trial ended',rem_exp_m:'You are now on Trainer Free · data is safe · upgrade to unlock clients and Pro features again.',
      rem_paid_t:'⏰ Plan expiring soon',rem_paid_m:'{d} days left ({date}) · renew to keep your clients and features.',
      know_title:'When your membership expires',know1:'When your plan or trial expires <b>your data is safe</b> — you return to Trainer Free (3 clients).',know2:'Clients over the limit become <b>read-only</b> temporarily (never deleted) — upgrade anytime to restore full access.',know3:'Upgrade/renew anytime; your plan unlocks in the app automatically.',
      act_store_t:'Manage on web / LINE',act_store_m:'Open iufit.com/billing.html in a browser or chat on LINE to subscribe/renew — your plan unlocks in the app automatically.',
      act_sub_keep:'Subscribe · keep Pro',act_see_all:'See all plans',act_renew:'🔄 Renew this plan',act_change:'Change / upgrade plan',act_upgrade:'Upgrade to Trainer Pro',
      nav_refund:'Refunds',nav_contact:'Contact',
      refund_title:'Cancellation & Refund Policy',refund_sub:'For IUFIT software membership (a digital subscription service)',
      /* ⭐ 2569-07-30 · must stay word-for-word consistent with terms.html section 4 */
      refund_p1:'<b>This is a digital subscription service</b> — IUFIT software plans are activated immediately after payment, so fees are <b>generally non-refundable</b> once paid.',
      refund_p2:'<b>Exception — incorrect or duplicate payment:</b> if you were charged twice, charged the wrong amount, or a payment error occurred, you may request a refund <b>within 7 days</b> of the payment date.',
      refund_p3:'<b>How refunds are made:</b> once approved, the amount is returned <b>only to the original payment method</b>, within 7–14 business days.',
      refund_p4:'<b>Cancellation:</b> you can cancel auto-renewal anytime; it takes effect from the next billing cycle, you will not be charged again, and you keep access until the end of the cycle you already paid for.',
      refund_p5:'<b>To request a refund or ask a question:</b> email <a class="blue" href="mailto:support@iufit.com">support@iufit.com</a> or LINE OA <a class="blue" href="https://line.me/R/ti/p/@987qyznd" target="_blank" rel="noopener">@987qyznd</a> · This policy <b>does not affect your statutory rights as a consumer under Thai law</b>.',
      consent_refund:'I have read and accept the cancellation &amp; refund policy and the terms of service.',
      consent_req:'Please accept the refund policy before paying.',
      contact_title:'Service provider contact',c_name:'Business owner',c_addr:'Address',c_addr_show:'▾ Show business address',c_phone:'Phone',c_hours:'Business hours',c_email:'Email',c_line:'LINE',
      yr_soon_t:'Yearly billing is not available yet ',
      yr_soon_m:'It opens on 1 January 2027. In the meantime, monthly billing works as usual.',
      pl_free_t:'No payment needed right now ',
      pl_free_m:'Every plan is free through 31 Dec 2026. The prices shown apply after that — we will tell you before any charge begins.',
      pl_free_btn:'Already free — no payment needed',
      pl_free_cr:'Need more AI credits? Switch to the "AI credits" tab above.',
      cr_title:'AI credit packs',
      cr_sub:'For photo food scanning and AI analysis · one-time purchase, no subscription',
      cr_scan:'Food scans',
      cr_analyze:'Analyses',
      cr_unit:'',
      cr_pick:'Choose a credit pack',
      cr_once:'One-time payment',
      cr_need_email_t:'Credit packs require an e-mail verified account',
      cr_need_email_m:'Credits are tied to your e-mail account. Please sign in with e-mail and verify it in the app, then come back to this page.',
      cr_tab_plan:'Coach plans',
      cr_tab_credit:'AI credits',
      cr_success_m:'Your credits have been added · open IUFIT with the same account and the balance updates automatically.',
      wal_title:'AI credit balance',
      wal_loading:'Loading balance…',
      wal_no_acct:'No LINE OA–linked account found — open IUFIT and sign in with LINE or e-mail first',
      wal_scan:'Food scans left',
      wal_analyze:'Analyses left',
      wal_unlimited:'Unlimited',
      wal_locked:'Balance locked — verify your e-mail in the app to unlock AI credits',
      wal_unavailable:'Can’t read your credit balance right now — try again in a moment',
      need_login_t:'Please sign in before paying',
      need_login_m:'We need to know which account to credit. Open the IUFIT app, sign in, then come back to this page.',
      pay_checking:'Checking your payment…',
      pay_paid_t:'Payment successful',
      pay_paid_m:'Your plan is now active.',
      pay_failed_t:'Payment was not completed',
      pay_failed_m:'Your card was not charged. Please try again or message us on LINE.',
      pay_slow:'We have not received the result yet. Don’t worry — if the payment went through, your plan will activate automatically. Check My plan, or message us on LINE.',
      /* 🔴 see th — "charged but not yet delivered" is NOT "result unknown".
         No conditional words ("if" / "may") here: we already know the money left. */
      pay_charged_t:'Payment taken — activating your access',
      pay_charged_m:'Your payment went through. We are activating your access right now — **do not pay again.** Please stay on this page for a moment.',
      pay_slow_paid:'Your card has been charged successfully. We are still activating your access and it will complete automatically. **Please do not pay again** — check My plan, or message us on LINE with the time you paid.',
      /* ===== cancel / resume auto-renewal (my-plan.html) ============================= */
      ap_title:'Auto-renewal',
      ap_loading:'Checking your auto-renewal status…',
      ap_working:'Working…',
      ap_on:'<b>On</b> — on your expiry date ({date}) we charge the saved card to renew the next cycle automatically.',
      ap_off:'<b>Off</b> — you will not be charged again, and <b>you keep full access until {date}</b>.',
      ap_off_nocard:'<b>Off</b> — no automatic charges for this plan · you can renew yourself on the Subscribe page.',
      ap_cancel:'Cancel auto-renewal',
      ap_resume:'Turn auto-renewal back on',
      ap_confirm:'Cancel auto-renewal?\n\n• Your card will not be charged again\n• Your {plan} plan keeps working until {date} — access is NOT cut off now\n• You can turn it back on anytime on this page',
      ap_confirm_on:'Turn auto-renewal back on?\n\n• On {date} we will charge your saved card for the next cycle\n• You can cancel again anytime on this page',
      ap_done_t:'Auto-renewal cancelled',
      ap_done_m:'You will not be charged again · your plan stays active until {date}.',
      ap_res_t:'Auto-renewal is on',
      ap_res_m:'We will renew the next cycle automatically on {date}.',
      ap_login_t:'Please sign in to manage renewal',
      ap_login_m:'For your security we must confirm you own this account · open the IUFIT app, sign in with your email, then come back to this page.',
      ap_line_t:'Cancel via our team',
      ap_line_m:'This account cannot manage renewal from the website yet · message us on LINE saying “please cancel auto-renewal”. We will switch it off during business hours, and your access stays until the end of the cycle you already paid for.',
      ap_read_t:'Cannot show renewal status right now ',
      ap_read_m:'Your plan is unaffected. Try refreshing this page — if it keeps happening, message us on LINE.',
      ap_mismatch_t:'This device is signed in to a different account ',
      ap_mismatch_m:'For your safety we never show or change another account\'s billing. Sign in with the account that bought the plan, then reopen this page.',
      ap_fail_t:'That did not go through',
      ap_fail_m:'Nothing about your plan was changed · try again, or message us on LINE and we will cancel it for you.',
      /* ===== duplicate / too-many payment attempts (billing.html) ==================== */
      pay_processing:'Working…',
      pay_dup_t:'A payment is already in progress',
      pay_dup_m:'You started paying for this plan moments ago · to avoid charging you twice we did not create a second one · check My plan first, or wait a moment and try again.',
      pay_rate_t:'Too many attempts',
      pay_rate_m:'For payment security, please wait a moment and try again · your card has not been charged.',
      pay_recent_t:'This payment already went through moments ago',
      pay_recent_m:'So we did not create a second one — you will not be charged twice · check My plan to confirm · if something looks wrong, message us on LINE.',
      testmode_t:'⚠️ Test mode — no real charges',
      testmode_m:'This page is using Omise test keys. Only test cards are accepted; real cards will be declined. If you see this on the live site, please let us know on LINE.'
    }
  };
  function t(k){return (T[LANG]&&T[LANG][k])||T.th[k]||k;}

  var PLANS=[
    {k:'free',name:'Free',sub:'ผู้ใช้ทั่วไป + เทรนเนอร์ลองระบบ',subEn:'General users & trial coaches',clients:3,mo:0,yr:0,
     feats:['ลูกเทรน 3 คน','เครื่องมือโค้ชเต็ม (จำกัดแค่จำนวน)','IU MATE ฟรีไม่อั้น','เครดิต AI 10 ครั้ง (ครั้งเดียว)'],featsEn:['3 clients','Full coach tools (limited by count)','IU MATE free unlimited','AI credits 10 (one-time)']},
    {k:'personal_pro',name:'Personal',sub:'ผู้ใช้ทั่วไป — ฟรี 100%',subEn:'For individuals — 100% free',badge:'ฟรี',badgeEn:'Free',clients:0,mo:0,yr:0,
     feats:['ใช้ฟรีทุกฟีเจอร์หลัก','IU MATE ฟรีไม่อั้น','เครดิต AI แจกฟรี 10 ครั้งแรก','ซื้อเครดิตเพิ่มได้'],featsEn:['All core features free','IU MATE free unlimited','10 free AI credits to start','Buy more credit packs']},
    {k:'starter',name:'Trainer Starter',sub:'เริ่มดูแลลูกเทรน 10 คนแบบเป็นระบบ',subEn:'Coach up to 10 clients',clients:10,mo:399,yr:3990,
     feats:['ลูกเทรน 10 คน','ส่งแผนอาหาร / แผนฝึก','รับ-ตรวจการบ้าน','แชทกับลูกเทรน','ดู progress รายคน','IU MATE ฟรีไม่อั้น','เครื่องมือโค้ชเต็ม (จำกัดแค่จำนวน)','สแกนอาหาร AI ใช้เครดิต (ฟรี 10 ครั้งตอนสมัคร)'],
     featsEn:['10 clients','Send meal & workout plans','Receive & review homework','Chat with clients','Per-client progress','IU MATE free unlimited','Full coach tools (limited by count)','AI food scan uses credits (10 free on signup)']},
    {k:'pro',name:'Trainer Pro',sub:'สำหรับเทรนเนอร์ที่ใช้งานจริง',subEn:'For working coaches',hot:1,badge:'แนะนำ',badgeEn:'Recommended',clients:20,mo:599,yr:5990,
     feats:['ลูกเทรน 20 คน','ทุกอย่างใน Starter','กลุ่ม + ภารกิจ + leaderboard','สรุปลูกเทรนที่น่าห่วง','สรุปการบ้านหลายรายการ','IU MATE ฟรีไม่อั้น','ประวัติ/รายงานเต็ม (ไม่ gate)','Progress report + share card'],
     featsEn:['20 clients','Everything in Starter','Groups + missions + leaderboard','At-risk client summary','Batch homework summary','IU MATE free unlimited','Full history/reports (no gate)','Progress report + share card']},
    {k:'growth',name:'Trainer Growth',sub:'สำหรับโค้ชออนไลน์ลูกเทรนเยอะ',subEn:'For online coaches with many clients',clients:30,mo:799,yr:7990,
     feats:['ลูกเทรน 30 คน','ทุกอย่างใน Pro','ผู้ช่วย 1 คน (เร็ว ๆ นี้)','จัดการกลุ่มได้ถึง 10 กลุ่ม','รายงานลูกเทรนละเอียดขึ้น','ระบบต่ออายุ / Payment Tracker','Priority support'],
     featsEn:['30 clients','Everything in Pro','1 assistant seat (soon)','Up to 10 groups','Detailed client reports','Renewal / Payment Tracker','Priority support']},
    {k:'studio',name:'Studio',sub:'ฟิตเนส สตูดิโอ ทีม หรือองค์กร',subEn:'Gyms, studios, teams & orgs',contact:1,clients:'100+',
     feats:['หลายเทรนเนอร์ / หลายกลุ่ม','รองรับลูกเทรนจำนวนมาก','Team dashboard','รายงานภาพรวมทีม','ระบบจัดการสิทธิ์แอดมิน','ปรับแพ็กตามการใช้งานจริง'],
     featsEn:['Multiple coaches / groups','Many clients','Team dashboard','Team-wide reports','Admin role management','Custom to your usage']}
  ];
  var ADDON={clients:5,mo:99};
  /* ===== แพ็กเครดิต AI — ซื้อครั้งเดียวจบ ไม่มีรอบบิล =====
     ⚠️ ตัวเลขต้องตรงกับ **3 ที่**: `core/pricing/pricing.js` · `workers/iufit-omise` (PRICES)
        และ `CR_PACKS` ใน worker `iufit-gym` ซึ่งเป็นคนเติมยอดจริง
        ⇒ แก้ราคาหรือจำนวนต้องไล่ครบทั้งสาม ไม่งั้นยอดที่โชว์กับที่ได้จริงไม่ตรงกัน

     🔴 ซื้อได้เฉพาะบัญชีที่ยืนยันอีเมลแล้ว — `iufit-gym` ผูกกระเป๋ากับ uid รูป `email:…`
        บัญชี LINE ล้วนเติมไม่เข้า ⇒ ต้องกันตั้งแต่หน้าเว็บ ไม่ใช่ตัดเงินแล้วค่อยรู้ */
  var CREDIT_PACKS=[
    {k:'credit_s',name:'S',price:159,scan:100,analyze:100},
    {k:'credit_m',name:'M',price:289,scan:250,analyze:300},
    {k:'credit_l',name:'L',price:549,scan:500,analyze:600}
  ];
  function getCredit(k){for(var i=0;i<CREDIT_PACKS.length;i++)if(CREDIT_PACKS[i].k===k)return CREDIT_PACKS[i];return null;}
  function isCredit(k){return !!getCredit(k);}
  function getPlan(k){for(var i=0;i<PLANS.length;i++)if(PLANS[i].k===k)return PLANS[i];return null;}
  function planSub(p){return (LANG==='en'&&p.subEn)?p.subEn:p.sub;}
  function planFeats(p){return (LANG==='en'&&p.featsEn)?p.featsEn:p.feats;}
  function planBadge(p){return (LANG==='en'&&p.badgeEn)?p.badgeEn:p.badge;}
  function price(p,yr){return yr?(p.yr||0):(p.mo||0);}
  function fmt(n){try{return (n||0).toLocaleString('en-US');}catch(e){return ''+n;}}

  function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function accountKey(){var s=appState();try{if(s.lineId)return 'line:'+s.lineId;if(s.fbuid&&(''+s.fbuid).indexOf('email:')===0)return s.fbuid;if(s.emailId)return 'email:'+s.emailId;}catch(e){}return '';}
  /**
   * uid สำหรับกระเป๋าเครดิต AI — ต้องเป็น `email:<sha256>` (iufit-gym)
   * ใช้เฉพาะ `S.fbuid` ที่ขึ้นต้น `email:` · ห้าม `email:`+อีเมลดิบ · ห้าม devId/anon
   */
  function walletUid(){
    var s=appState();
    try{
      if(s.fbuid&&(''+s.fbuid).indexOf('email:')===0)return s.fbuid;
    }catch(e){}
    return '';
  }
  /** บัญชีที่ใช้ตอนซื้อเครดิต — เหมือน walletUid (ห้ามส่ง line: ไป /charge) */
  function creditAccountKey(){return walletUid();}
  var GYM_ENDPOINT='https://iufit-gym.ar-weerapong.workers.dev';
  /** อ่านยอดเครดิตจาก gym worker — cb({ok,scan,analyze,locked}) */
  function fetchWallet(cb){
    var uid=walletUid();
    if(!uid){cb({ok:false,locked:true,scan:0,analyze:0});return;}
    fetch(GYM_ENDPOINT+'/credit/wallet',{
      method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({uid:uid})
    }).then(function(r){return r.json();}).then(function(j){
      if(!j||j.verified===false){cb({ok:false,locked:true,scan:0,analyze:0});return;}
      var b=j.bal||j;
      var scan=0,analyze=0;
      if(typeof b.scan==='number'||typeof b.analyze==='number'){
        scan=Number(b.scan)||0;analyze=Number(b.analyze)||0;
      }else{
        var free=b.free||{},paid=b.paid||{};
        scan=(Number(free.scan)||0)+(Number(paid.scan)||0);
        analyze=(Number(free.analyze)||0)+(Number(paid.analyze)||0);
      }
      var unlimited=b.unlimited===true||b.unlimited===1||b.unlimited==='true'||j.unlimited===true||j.unlimited===1||j.unlimited==='true';
      cb({ok:true,locked:false,scan:scan,analyze:analyze,unlimited:unlimited});
    }).catch(function(){cb({ok:false,locked:false,scan:0,analyze:0});});
  }
  function creditShow(n, unlimited){
    return unlimited ? t('wal_unlimited') : String(n||0);
  }

  /* ===== ยืนยันตัวตนกับ worker (ใช้ session ที่แอปสร้างไว้แล้ว) =====================
     ⭐ 2569-07-31 · ต่อกับ **ระบบล็อกอินเดิม** ไม่ได้ประดิษฐ์กลไกใหม่
       แอปยืนยันอีเมลด้วย OTP → ได้ Firebase session → เก็บที่ localStorage['iufit']
       คีย์ `_fbtok` (id token) · `_fbrt` (refresh token) · `_fbexp` (หมดอายุ, ms)
       หน้านี้อยู่โดเมนเดียวกับแอป จึงอ่านได้ตรง ๆ เหมือนที่ `appState()` ทำอยู่แล้ว
       และ uid ของ session (`s.fbuid`) **คือค่าเดียวกับ `accountKey()`** ⇒ worker เทียบตรงได้

     🔴 ทำไมต้องต่ออายุโทเคนเอง: id token อายุ 1 ชั่วโมง แต่คนเปิดหน้า "แพ็กของฉัน"
        ทีหลังเป็นวัน ⇒ ถ้าใช้ `_fbtok` ดิบ ๆ ปุ่มยกเลิกจะพังเกือบทุกครั้ง = ฟีเจอร์หลอกตา

     🔴 **ไม่เขียนกลับลง localStorage** โดยตั้งใจ — เก็บในหน่วยความจำของหน้านี้เท่านั้น
        ถ้าเขียนกลับ เราต้อง read-modify-write ก้อน `iufit` ทั้งก้อน ซึ่งถ้าแอปเปิดอยู่
        อีกแท็บแล้วเขียนชนกัน = ข้อมูลผู้ใช้หายทั้งก้อน · แลกกับการยิงต่ออายุ 1 ครั้ง
        ต่อการเปิดหน้า ซึ่งถูกกว่ามาก */
  var _tok='',_tokExp=0;
  function authToken(cb){
    var s=appState();
    if(_tok&&Date.now()<_tokExp-60000){cb(_tok);return;}
    var tok=s._fbtok||'',exp=+(s._fbexp||0);
    if(tok&&Date.now()<exp-60000){_tok=tok;_tokExp=exp;cb(tok);return;}
    var rt=s._fbrt||'';
    if(!rt){cb('');return;}
    fetch('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(FB_KEY),{
      method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:'grant_type=refresh_token&refresh_token='+encodeURIComponent(rt)
    }).then(function(r){return r.json();}).then(function(j){
      if(j&&j.id_token){_tok=j.id_token;_tokExp=Date.now()+((+j.expires_in||3600)*1000);cb(_tok);}
      else cb('');
    }).catch(function(){cb('');});
  }
  /* จัดการแพ็กเองบนเว็บได้ไหม — ต้องเป็นบัญชีอีเมลที่มี Firebase session อยู่จริง
     บัญชี LINE ล้วนไม่มี session แบบนี้ ⇒ ต้องไปทางแอดมิน (ทักไลน์) และหน้าเว็บต้องบอกตรง ๆ */
  function canSelfServe(){var s=appState();return accountKey().indexOf('email:')===0&&!!(s._fbtok||s._fbrt);}
  function accountLabel(){var s=appState();return s.lineName||s.emailId||(s.users&&s.users[0]&&s.users[0].name)||'';}
  /* ══════════════════════════════════════════════════════════════════════════════════
     🔴 2569-08-03 (F3) · เกณฑ์ตัดชั้นจากจำนวนที่นั่ง — **ต้องมาจากจำนวนที่นั่งที่ขายจริง**
     ══════════════════════════════════════════════════════════════════════════════════
     ของเดิม: `>=100 studio · >=50 growth · >=20 pro · >=5 starter`
     ซึ่ง **ไม่ตรงกับ `PLANS` ที่อยู่ในไฟล์เดียวกันนี้เอง** (starter 10 · pro 20 · growth 30)
     ⇒ ลูกค้า Trainer Growth ที่จ่าย ฿799 มี 30 ที่นั่ง ตกเกณฑ์ `>=20` ⇒ ถูกอ่านเป็น 'pro'
       · `my-plan.html` โชว์ "แพ็กปัจจุบัน = Trainer Pro ฿599"
       · `pricing.html` ติดป้าย "แพ็กปัจจุบัน" ผิดการ์ด
     **นี่คือของจริงที่ลูกค้าที่จ่ายเงินแล้วเห็นผิดอยู่ทุกวัน ไม่ใช่ความเสี่ยงในอนาคต**

     ค่าใหม่ **ไม่ได้ตั้งใหม่** — ยกมาจาก `acctPlan()` ใน `src/core/entitlements.ts` ทั้งชุด
     ซึ่งตรงกับของที่ขายจริงทุกตัว (ตรวจกับ `core/pricing` + `SEATS_BY_PLAN` มาแล้ว):
       · 10 → Starter · 20 → Pro · 30 → Growth (฿799)
       · 50 → **ยิมแพ็ก S (50 ลูกค้า)** ⇒ เส้น `studio` อยู่ที่ 50 ไม่ใช่ 100
         (`clients:'100+'` บนการ์ด Studio เป็นข้อความขาย ไม่ใช่เกณฑ์ตัดชั้น)
     ⇒ `>=50 studio · >=30 growth · >=20 pro · ที่เหลือ starter`
     (`>=5 starter` เดิมถูกตัดทิ้ง — สาขานั้นกับสาขาสุดท้ายคืนค่าเดียวกันอยู่แล้ว)

     ⚠️ **ต้องเท่ากับ `acctPlan()` ทุกตัวเลข** — คนเดียวกันเปิดแอปกับเปิดหน้าเว็บต้องเห็น
        ชั้นเดียวกัน · `scripts/verify-seats.mjs` §5 execute ไฟล์นี้จริงแล้วเรียกฟังก์ชันนี้
        เทียบกับแอป **ทุกจำนวนที่นั่ง 0-120** · ขยับที่ไหนที่เดียวแล้วด่านแดงทันที
     ══════════════════════════════════════════════════════════════════════════════════ */
  function currentPlanKey(){
    var s=appState();var m=s.mem;
    if(s.lic&&s.lic.n&&s.lic.c)return 'personal_pro';
    if(m&&m.via==='seat')return 'free';
    if(m&&m.exp&&m.exp>=today()&&m.tier==='pro'){
      var seats=m.seats||0;
      if(seats>=50)return 'studio';if(seats>=30)return 'growth';if(seats>=20)return 'pro';return 'starter';
    }
    if(s.trial&&s.trial.start&&trialDaysLeft()>0)return 'pro';
    return 'free';
  }
  function planExpiry(){var s=appState();return (s.mem&&s.mem.exp)||'';}
  function trialDaysLeft(){var s=appState();if(!(s.trial&&s.trial.start))return 0;var dl=new Date(s.trial.start+'T00:00');dl.setDate(dl.getDate()+(s.trial.days||30));var ms=dl-new Date(today()+'T00:00');return ms>0?Math.ceil(ms/86400000):0;}
  function trialActive(){var s=appState();return trialDaysLeft()>0&&!(s.mem&&s.mem.exp&&s.mem.exp>=today());}
  function trialExpired(){var s=appState();return !!(s.trial&&s.trial.start)&&trialDaysLeft()<=0&&!(s.mem&&s.mem.exp&&s.mem.exp>=today());}
  function paidActive(){var s=appState();return !!(s.mem&&s.mem.exp&&s.mem.exp>=today()&&s.mem.via!=='seat');}
  function daysUntil(ymd){if(!ymd)return null;var ms=new Date(ymd+'T00:00')-new Date(today()+'T00:00');return Math.round(ms/86400000);}
  function reminderTier(daysLeft){if(daysLeft==null||daysLeft<0)return 0;if(daysLeft<=1)return 1;if(daysLeft<=3)return 3;if(daysLeft<=7)return 7;if(daysLeft<=10)return 10;return 0;}
  function qs(name){try{var m=new RegExp('[?&]'+name+'=([^&]+)').exec(location.search);return m?decodeURIComponent(m[1]):'';}catch(e){return '';}}

  /* ══════════════════════════════════════════════════════════════════════════════════
     🔴 2569-08-02 · หนีอักขระ HTML — **ตัวเดียวของทั้งโฟลเดอร์ line-oa/**
     ══════════════════════════════════════════════════════════════════════════════════
     ทุกหน้าในโฟลเดอร์นี้ประกอบ DOM ด้วยการต่อสตริงแล้วยัด `innerHTML` และหน้าเหล่านี้อยู่
     **origin เดียวกับแอป** ซึ่ง `localStorage['iufit']` เก็บ `_fbtok` และ `_fbrt`
     (refresh token ที่ต่ออายุ session ได้ไม่จำกัด — ดู `authToken()` ข้างบน)
     ⇒ JS ที่รันได้บน origin นี้หนึ่งบรรทัด = ยึดบัญชีถาวร ไม่ใช่แค่ขโมย session ชั่วคราว

     ครอบ `'` ด้วยแม้ค่าที่ใส่จะอยู่ใน `"…"` เสมอ — วันหน้าใครเขียน attribute ด้วย single
     quote จะได้ไม่กลายเป็นช่องโหว่ใหม่เงียบ ๆ · `esc(0)` ต้องได้ `'0'` ไม่ใช่ `''` จึงเช็ก
     null/undefined แยกแทนการใช้ `||` */
  function esc(s){
    return (''+(s===null||s===undefined?'':s)).replace(/[&<>"']/g,function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ══════════════════════════════════════════════════════════════════════════════════
     🔴 2569-08-02 · `?plan=` ต้องเป็นรหัสที่เรารู้จักเท่านั้น (allow-list)
     ══════════════════════════════════════════════════════════════════════════════════
     ค่านี้เดินทางไกลกว่าที่เห็น: ลงไปถึง `href` ของปุ่ม "ลองใหม่" ในหน้าผลลัพธ์ (`showResult`)
     และถูกส่งต่อไปยัง `/charge` ฝั่ง worker · การหนีอักขระอย่างเดียวยังเหลือชั้นที่ผิดพลาดได้
     (ใครเพิ่มจุดที่ใช้ `PLAN` ใหม่แล้วลืม `esc()`) ⇒ **ตัดที่ต้นทาง**: ค่าที่ไม่อยู่ในลิสต์
     ถูกโยนทิ้งตั้งแต่บรรทัดแรก เหลือแต่รหัสที่ประกอบจาก `PLANS`/`CREDIT_PACKS` ของเราเอง

     ผลพลอยได้: `?plan=อะไรก็ไม่รู้` เดิมทำให้ `getPlan()` คืน null แล้ว `renderPay()` โยน
     TypeError จนการ์ดชำระเงินหายทั้งใบแบบเงียบ ๆ — ตอนนี้ตกกลับเป็นค่าตั้งต้นแทน */
  function planKeyOf(raw,fallback){
    var k=''+(raw||'');
    if(getPlan(k)||getCredit(k))return k;
    return fallback||'credit_m';
  }

  /* PromptPay EMVCo — สูตรเดียวกับ `services/courseTrack.ts` `promptPayPayload`
     เบอร์ 10 หลัก / บัตร 13 / e-Wallet 15 เท่านั้นที่แอปธนาคารโอนได้ */
  function ppDigits(s){return String(s||'').replace(/[^0-9]/g,'');}
  function ppValid(s){var n=ppDigits(s).length;return n===10||n===13||n===15;}
  function ppTLV(id,v){var x=''+v;return id+('00'+x.length).slice(-2)+x;}
  function ppCRC(x){
    var crc=0xffff,i,j;
    for(i=0;i<x.length;i++){
      crc^=(x.charCodeAt(i)&0xff)<<8;
      for(j=0;j<8;j++)crc=crc&0x8000?((crc<<1)^0x1021)&0xffff:(crc<<1)&0xffff;
    }
    return ('000'+crc.toString(16).toUpperCase()).slice(-4);
  }
  function ppTarget(id){
    var s=ppDigits(id);
    if(s.length>=15)return ppTLV('03',s);
    if(s.length>=13)return ppTLV('02',s);
    if(s.charAt(0)==='0')s=s.slice(1);
    return ppTLV('01','0066'+s);
  }
  function promptPayPayload(id,amount){
    var dyn=+amount>0;
    var m=ppTLV('00','A000000677010111')+ppTarget(id);
    var p=ppTLV('00','01')+ppTLV('01',dyn?'12':'11')+ppTLV('29',m)+ppTLV('53','764')+(dyn?ppTLV('54',(+amount).toFixed(2)):'')+ppTLV('58','TH')+'6304';
    return p+ppCRC(p);
  }

  var _merchant={open:PROMPTPAY_OPEN,number:PROMPTPAY_DEFAULT};
  function merchantPay(){return {open:!!_merchant.open,number:ppDigits(_merchant.number)};}
  function merchantPayOpen(){var m=merchantPay();return PROMPTPAY_OPEN&&m.open&&ppValid(m.number);}
  /** ปุ่ม PromptPay บนหน้าซื้อเครดิต — ผ่าน Omise · แอดมินปิดได้ที่ `/ops/billing` */
  function omisePpOpen(){return OMISE_READY&&PROMPTPAY_OPEN&&!!_merchant.open;}
  function applyBillingOps(j){
    if(!j||typeof j!=='object')return;
    if(typeof j.promptpayOn==='boolean')_merchant.open=j.promptpayOn;
    if(typeof j.promptpay==='string'&&ppValid(j.promptpay))_merchant.number=ppDigits(j.promptpay);
  }
  function loadMerchantPay(cb){
    fetch(FB_DB+'/ops/billing.json',{cache:'no-store'})
      .then(function(r){return r.json();})
      .then(function(j){applyBillingOps(j);if(cb)cb(merchantPay());})
      .catch(function(){if(cb)cb(merchantPay());});
  }

  window.IUFIT_BILLING={
    PLATFORM:PLATFORM, IS_STORE:IS_STORE, LANG:LANG, t:t, setLang:setLang,
    OMISE_READY:OMISE_READY, OMISE_PUBLIC_KEY:OMISE_PUBLIC_KEY, CHARGE_ENDPOINT:CHARGE_ENDPOINT, LINE_URL:LINE_URL,
    YEARLY_OPEN:YEARLY_OPEN, PLANS_OPEN:PLANS_OPEN, OMISE_TEST_MODE:OMISE_TEST_MODE,
    PROMPTPAY_OPEN:PROMPTPAY_OPEN, PROMPTPAY_DEFAULT:PROMPTPAY_DEFAULT,
    PLANS:PLANS, ADDON:ADDON, getPlan:getPlan, price:price, fmt:fmt,
    CREDIT_PACKS:CREDIT_PACKS, getCredit:getCredit, isCredit:isCredit,
    planSub:planSub, planFeats:planFeats, planBadge:planBadge,
    appState:appState, accountKey:accountKey, accountLabel:accountLabel,
    walletUid:walletUid, creditAccountKey:creditAccountKey, fetchWallet:fetchWallet, creditShow:creditShow,
    authToken:authToken, canSelfServe:canSelfServe,
    currentPlanKey:currentPlanKey, planExpiry:planExpiry,
    trialDaysLeft:trialDaysLeft, trialActive:trialActive, trialExpired:trialExpired,
    paidActive:paidActive, daysUntil:daysUntil, reminderTier:reminderTier, today:today, qs:qs,
    esc:esc, planKeyOf:planKeyOf,
    ppDigits:ppDigits, ppValid:ppValid, promptPayPayload:promptPayPayload,
    merchantPay:merchantPay, merchantPayOpen:merchantPayOpen, loadMerchantPay:loadMerchantPay,
    omisePpOpen:omisePpOpen,
    CONTACT:CONTACT, contactRowsHtml:contactRowsHtml, footerHtml:footerHtml, docHref:docHref
  };
})();
