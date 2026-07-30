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
  var OMISE_TEST_MODE=true;

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

  /* Cloudflare Worker `iufit-omise` — สร้าง charge ฝั่ง server (ที่เก็บ secret key)
     ⚠️ ซอร์สของ worker **ไม่อยู่ในโปรเจกต์นี้** อยู่ที่ Cloudflare Dashboard → Workers & Pages
        ⇒ แก้ 3DS/webhook ต้องไปแก้ที่นั่น หรือเอาซอร์สเข้ามาเก็บในรีโปให้ตรวจได้ */
  var CHARGE_ENDPOINT='https://iufit-omise.ar-weerapong.workers.dev';
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
  function footerHtml(){
    return '<div class="ftcontact"><b>'+t('contact_title')+'</b>'+
      '<div>'+CONTACT.name+'</div>'+
      '<div>'+t('c_email')+': <a class="blue" href="mailto:'+CONTACT.email+'">'+CONTACT.email+'</a> · LINE: <a class="blue" href="'+LINE_URL+'" target="_blank" rel="noopener">'+CONTACT.line+'</a></div>'+
      '<div style="margin-top:6px"><a class="blue" href="pricing.html?lang='+LANG+'">'+t('nav_pricing')+'</a> · <a class="blue" href="refund.html?lang='+LANG+'">'+t('nav_refund')+'</a> · <a class="blue" href="terms.html">'+(LANG==='en'?'Terms':'ข้อกำหนด')+'</a> · <a class="blue" href="privacy.html">'+(LANG==='en'?'Privacy':'ความเป็นส่วนตัว')+'</a> · <a class="blue" href="contact.html?lang='+LANG+'">'+t('nav_contact')+'</a></div>'+
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
      nav_pricing:'ราคา',nav_billing:'สมัคร',nav_myplan:'แพ็กของฉัน',
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
      faq_title:'คำถามที่พบบ่อย',faq1_q:'จ่ายเงินยังไงบ้าง?',faq1_a:'เลือกแพ็ก → ชำระผ่านบัตรเครดิต/เดบิตด้วยระบบ Omise ที่ปลอดภัย → เปิดแอปด้วยบัญชีเดิม แพ็กปลดล็อกอัตโนมัติ',faq2_q:'ทำไมในแอปไม่มีปุ่มซื้อ?',faq2_a:'ตามนโยบาย Google Play การสมัครแพ็กซอฟต์แวร์ทำผ่านเว็บนี้ (นอกแอป) · ส่วนค่าคอร์สเทรนตัวต่อตัว (บริการจริงระหว่างคุณกับลูกเทรน) จ่าย PromptPay ในแอปได้ปกติ',faq3_q:'ต่ออายุ / ยกเลิกยังไง?',faq3_a:'ต่ออายุที่หน้านี้เมื่อใกล้หมดอายุ (มีแจ้งเตือนล่วงหน้า) · ยกเลิกได้ทุกเมื่อ ไม่มีสัญญาผูกมัด · ข้อมูลลูกเทรนไม่หายแม้ลดแพ็ก',faq4_q:'1 แพ็กใช้ได้กี่เครื่อง?',faq4_a:'ใช้ได้ตามจำนวนที่กำหนดต่อแพ็ก · ย้ายเครื่องได้โดยติดต่อทีมงาน',faq5_q:'มีรับประกันคืนเงินไหม?',faq5_a:'เนื่องจากเป็นบริการดิจิทัลที่เปิดใช้ทันที เมื่อชำระแล้วโดยหลักจะไม่คืนเงิน · <b>ยกเว้นชำระผิดพลาดหรือซ้ำซ้อน ขอคืนได้ภายใน 7 วัน</b> นับจากวันที่ชำระ (ดูนโยบายการยกเลิกและคืนเงิน)',
      launch:'🎉 ช่วงเปิดตัว: ทุกแพ็กใช้ฟรีถึง 31 ธ.ค. 2026 · ราคาด้านล่างเป็นราคาหลังช่วงเปิดตัว · สนใจแพ็กทักไลน์ได้เลย',
      monthly:'รายเดือน',yearly:'รายปี · ประหยัด 2 เดือน',launch_price:'ฟรีถึง 31 ธ.ค. 2026',per_mo:'/เดือน',per_yr:'/ปี',
      current_plan:'แพ็กปัจจุบัน',choose_plan:'เลือกแพ็กนี้',contact:'ติดต่อสอบถาม',manage_web:'จัดการแพ็กผ่านเว็บ/ไลน์',cta_line:'สนใจแพ็ก → ทักไลน์',
      addon_title:'➕ Add-on · เพิ่มลูกเทรน',addon_desc:'ขยายจำนวนลูกเทรนได้โดยไม่ต้องเปลี่ยนแพ็ก (Starter & Pro)',addon_price:'+5 ลูกเทรน = ฿99/เดือน',addon_eg:'เช่น Pro ฿599 + add-on ฿99 = ฿698/เดือน ดูแลได้ 25 คน',
      /* ⭐ 2569-07-30 · how1 เดิมโฆษณา "ทดลองฟรี 30 วัน" ซึ่งยกเลิกแล้ว · คีย์ถูกเรียกที่ pricing.html T('hw-1','how1') ⇒ เปลี่ยนข้อความ */
      how_title:'เริ่มยังไง',how1:'<b>เริ่มใช้ในแอป</b> — เปิดแอป IUFIT → เปิดโหมดโค้ช → ยืนยันอีเมลเพื่อรับ Coach Pro ในช่วงเปิดตัว (ไม่ต้องใส่บัตร)',how2:'<b>พร้อมสมัครจริง</b> — กด “สมัคร” เลือกแพ็ก/รอบบิล แล้วชำระเงิน (หรือทักไลน์)',how3:'<b>ปลดล็อกอัตโนมัติ</b> — เปิดแอปด้วยบัญชีเดิม แพ็กจะเปิดให้เอง ลูกเทรนและข้อมูลอยู่ครบ',
      note_soft:'ค่าแพ็กเป็นการสมัครใช้ซอฟต์แวร์ IUFIT ผ่านเว็บไซต์ · ค่าเทรนระหว่างลูกเทรนกับโค้ชโอนตรงผ่าน PromptPay ของโค้ช (IUFIT ไม่ถือเงินแทน)',
      store_note_t:'เปิดในแอป',store_note_m:'การสมัคร/ชำระเงินทำผ่านเว็บไซต์หรือ LINE · ในแอปดูสถานะแพ็กของคุณได้',
      billing_title:'สมัครแพ็ก',acct_prefix:'บัญชี: ',acct_bind:' · แพ็กจะผูกกับบัญชีนี้',acct_login:'เข้าสู่ระบบในแอปด้วยอีเมล/LINE เพื่อให้แพ็กปลดล็อกอัตโนมัติ',
      pick_plan:'เลือกแพ็ก',clients_unit:' คน',pay_method:'วิธีชำระเงิน',pm_card:'💳 บัตรเครดิต/เดบิต',pm_pp:'📱 PromptPay',pm_pp_soon:'เร็ว ๆ นี้',
      card_name:'ชื่อบนบัตร',card_name_ph:'ชื่อ-สกุล',card_num:'หมายเลขบัตร',card_exp:'หมดอายุ (ดด/ปป)',card_cvv:'CVV',pay_btn:'ชำระเงิน',
      secure_note:'🔒 ข้อมูลบัตรถูกเข้ารหัสและส่งตรงให้ Omise · IUFIT ไม่เก็บเลขบัตร',
      omise_soon_t:'ระบบชำระออนไลน์กำลังเปิดให้บริการ',omise_soon_m:'จองราคาเปิดตัวไว้ก่อนได้ — ราคานี้จะถูกล็อกให้คุณ แล้วแอดมินช่วยเปิดแพ็กให้ทันที',
      /* ⭐ 2569-07-30 · ถอด book_line / reserve_local ออก — ไม่มีปุ่มเรียกแล้ว
         (มีไว้ตอนยังไม่มีช่องทางจ่ายจริง · ตอนนี้เหลือทางเดียวคือชำระผ่าน Omise) */
      order_total:'ยอดชำระ',equiv:'เทียบเท่า',
      store_guard_t:'สมัครผ่านเว็บหรือ LINE',store_guard_m:'การชำระเงินทำนอกแอป · เปิด iufit.com/billing.html ในเบราว์เซอร์ หรือทักไลน์เพื่อสมัคร — เปิดแอปด้วยบัญชีเดิมแล้วแพ็กจะปลดล็อกให้อัตโนมัติ',
      line_btn:'💬 ทักไลน์ @987qyznd',
      res_success_t:'ชำระเงินสำเร็จ',res_success_m:'แพ็กของคุณเปิดใช้งานแล้ว · เปิดแอป IUFIT ด้วยบัญชีเดิม แพ็กจะปลดล็อกอัตโนมัติภายในไม่กี่วินาที',
      res_pending_t:'รอการยืนยันการชำระ',res_pending_m:'เรากำลังรอผลการชำระเงิน (เช่น การยืนยัน 3-D Secure กับธนาคารของคุณ) · เมื่อสำเร็จ แพ็กจะเปิดให้อัตโนมัติ',
      res_failed_t:'ชำระเงินไม่สำเร็จ',res_failed_m:'ยังไม่มีการตัดเงิน · ลองใหม่อีกครั้ง หรือทักไลน์ให้เราช่วย',
      go_myplan:'ไปหน้าแพ็กของฉัน',retry:'ลองชำระอีกครั้ง',line_help:'ทักไลน์ขอความช่วยเหลือ',
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
      testmode_t:'⚠️ โหมดทดสอบ — ไม่มีการตัดเงินจริง',
      testmode_m:'หน้านี้กำลังใช้คีย์ทดสอบของ Omise · รับได้เฉพาะบัตรทดสอบเท่านั้น บัตรจริงจะถูกปฏิเสธ · ถ้าคุณเห็นข้อความนี้บนเว็บจริง กรุณาแจ้งเราทาง LINE'
    },
    en:{
      nav_pricing:'Pricing',nav_billing:'Subscribe',nav_myplan:'My plan',
      pricing_title:'Trainer plans',pricing_sub:'Coach clients systematically — send plans, collect homework, track results, and let IU MATE cut your daily work.',
      personal_title:'For individuals',personal_sub:'Not a coach? Personal is 100% free · AI runs on credits (10 free to start · add-on packs available).',
      /* ⭐ 2569-07-30 · 30-day free trial was cancelled — keep the keys (pricing.html calls them), change the copy */
      trial_hero_t:'Turn on coach mode + verify your email = Coach Pro',trial_hero_m:'No card · during the launch period, verify your email in the app and Coach Pro is yours',trial_hero_cta:'Open the app to start →',
      trust_pay:'Secure payments by Omise',trust_pp:'Credit/debit cards accepted',trust_ssl:'SSL encrypted',
      why_title:'Why coaches choose IUFIT',why1_t:'All in one app',why1_m:'Send meal/workout plans, review homework, chat, and track clients',why2_t:'IU MATE cuts your work',why2_m:'Draft menus/programs, summarize homework and at-risk clients',why3_t:'Clients pay nothing',why3_m:'Invite by QR — they join on your seats, no purchase needed',
      why4_t:'Never miss a renewal',why4_m:'Reminders before your plan expires, plus a “My plan” page to check status and renew yourself',
      faq_title:'FAQ',faq1_q:'How do I pay?',faq1_a:'Pick a plan → pay by credit/debit card via secure Omise → open the app with the same account and your plan unlocks automatically.',faq2_q:'Why is there no buy button in the app?',faq2_a:'Per Google Play policy, software plans are purchased on this website (outside the app). One-on-one PT fees (a real service between you and your client) can still be paid via PromptPay inside the app.',faq3_q:'How do I renew / cancel?',faq3_a:'Renew here when your plan is about to expire (you get reminders) · cancel anytime, no contract · client data is never lost even if you downgrade.',faq4_q:'How many devices per plan?',faq4_a:'Each plan allows a set number of devices · contact us to move devices.',faq5_q:'Is there a refund guarantee?',faq5_a:'Because this is a digital service activated immediately, fees are generally non-refundable once paid · <b>except for incorrect or duplicate payments, which you can claim within 7 days</b> of the payment date (see the cancellation &amp; refund policy).',
      launch:'🎉 Launch period: all plans are free through 31 Dec 2026 · prices below apply after launch · chat on LINE if interested.',
      monthly:'Monthly',yearly:'Yearly · save 2 months',launch_price:'Free until 31 Dec 2026',per_mo:'/mo',per_yr:'/yr',
      current_plan:'Current plan',choose_plan:'Choose this plan',contact:'Contact us',manage_web:'Manage on web / LINE',cta_line:'Interested? Chat on LINE',
      addon_title:'➕ Add-on · more clients',addon_desc:'Expand your client limit without changing plan (Starter & Pro).',addon_price:'+5 clients = ฿99/mo',addon_eg:'e.g. Pro ฿599 + add-on ฿99 = ฿698/mo for 25 clients',
      how_title:'How to start',how1:'<b>Start in the app</b> — open IUFIT → turn on coach mode → verify your email to get Coach Pro during the launch period (no card).',how2:'<b>Ready to subscribe</b> — tap “Subscribe”, pick a plan & cycle, then pay (or chat on LINE).',how3:'<b>Auto-unlock</b> — open the app with the same account; your plan activates automatically, clients & data intact.',
      note_soft:'Plan fees are a subscription to IUFIT software via the website · Client↔coach payments transfer directly via the coach PromptPay (IUFIT does not hold funds).',
      store_note_t:'Opened in the app',store_note_m:'Subscription/payment is done on the website or LINE · in the app you can view your plan status.',
      billing_title:'Subscribe',acct_prefix:'Account: ',acct_bind:' · your plan links to this account',acct_login:'Sign in inside the app with email/LINE so your plan unlocks automatically.',
      pick_plan:'Choose a plan',clients_unit:' clients',pay_method:'Payment method',pm_card:'💳 Credit/Debit card',pm_pp:'📱 PromptPay',pm_pp_soon:'coming soon',
      card_name:'Name on card',card_name_ph:'Full name',card_num:'Card number',card_exp:'Expiry (MM/YY)',card_cvv:'CVV',pay_btn:'Pay',
      secure_note:'🔒 Card details are encrypted and sent directly to Omise · IUFIT never stores your card.',
      omise_soon_t:'Online payment is opening soon',omise_soon_m:'Reserve the launch price now — it will be locked for you and our team activates your plan right away.',

      order_total:'Total',equiv:'Equivalent',
      store_guard_t:'Subscribe on web or LINE',store_guard_m:'Payment happens outside the app · open iufit.com/billing.html in a browser or chat on LINE — open the app with the same account and your plan unlocks automatically.',
      line_btn:'💬 Chat on LINE @987qyznd',
      res_success_t:'Payment successful',res_success_m:'Your plan is active · open IUFIT with the same account and it unlocks automatically within seconds.',
      res_pending_t:'Awaiting payment confirmation',res_pending_m:'We are waiting for the payment result (e.g. 3-D Secure confirmation with your bank) · once done, your plan activates automatically.',
      res_failed_t:'Payment failed',res_failed_m:'No charge was made · try again, or chat on LINE for help.',
      go_myplan:'Go to My plan',retry:'Try paying again',line_help:'Chat on LINE for help',
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
  function getPlan(k){for(var i=0;i<PLANS.length;i++)if(PLANS[i].k===k)return PLANS[i];return null;}
  function planSub(p){return (LANG==='en'&&p.subEn)?p.subEn:p.sub;}
  function planFeats(p){return (LANG==='en'&&p.featsEn)?p.featsEn:p.feats;}
  function planBadge(p){return (LANG==='en'&&p.badgeEn)?p.badgeEn:p.badge;}
  function price(p,yr){return yr?(p.yr||0):(p.mo||0);}
  function fmt(n){try{return (n||0).toLocaleString('en-US');}catch(e){return ''+n;}}

  function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function accountKey(){var s=appState();try{if(s.lineId)return 'line:'+s.lineId;if(s.fbuid&&(''+s.fbuid).indexOf('email:')===0)return s.fbuid;if(s.emailId)return 'email:'+s.emailId;}catch(e){}return '';}
  function accountLabel(){var s=appState();return s.lineName||s.emailId||(s.users&&s.users[0]&&s.users[0].name)||'';}
  function currentPlanKey(){
    var s=appState();var m=s.mem;
    if(s.lic&&s.lic.n&&s.lic.c)return 'personal_pro';
    if(m&&m.via==='seat')return 'free';
    if(m&&m.exp&&m.exp>=today()&&m.tier==='pro'){
      var seats=m.seats||0;
      if(seats>=100)return 'studio';if(seats>=50)return 'growth';if(seats>=20)return 'pro';if(seats>=5)return 'starter';return 'starter';
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

  window.IUFIT_BILLING={
    PLATFORM:PLATFORM, IS_STORE:IS_STORE, LANG:LANG, t:t, setLang:setLang,
    OMISE_READY:OMISE_READY, OMISE_PUBLIC_KEY:OMISE_PUBLIC_KEY, CHARGE_ENDPOINT:CHARGE_ENDPOINT, LINE_URL:LINE_URL,
    YEARLY_OPEN:YEARLY_OPEN, OMISE_TEST_MODE:OMISE_TEST_MODE,
    PLANS:PLANS, ADDON:ADDON, getPlan:getPlan, price:price, fmt:fmt,
    planSub:planSub, planFeats:planFeats, planBadge:planBadge,
    appState:appState, accountKey:accountKey, accountLabel:accountLabel,
    currentPlanKey:currentPlanKey, planExpiry:planExpiry,
    trialDaysLeft:trialDaysLeft, trialActive:trialActive, trialExpired:trialExpired,
    paidActive:paidActive, daysUntil:daysUntil, reminderTier:reminderTier, today:today, qs:qs,
    CONTACT:CONTACT, contactRowsHtml:contactRowsHtml, footerHtml:footerHtml
  };
})();
