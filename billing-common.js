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

  var OMISE_PUBLIC_KEY='';
  var OMISE_READY=false;
  var CHARGE_ENDPOINT='https://iufit-omise.ar-weerapong.workers.dev';
  var LINE_URL='https://line.me/R/ti/p/@987qyznd';
  /* ===== ข้อมูลติดต่อผู้ให้บริการ (Omise requires public contact) — แก้ค่าให้เป็นข้อมูลจริงก่อนยื่น =====
     TODO(กรอกจริง): name = ชื่อ-นามสกุลผู้สมัคร (บุคคลธรรมดา, ต้องตรงกับบัตร ปชช./บัญชีธนาคาร)
                     addr = ที่อยู่ตามที่ใช้ยืน Omise · phone = เบอร์ติดต่อจริง */
  var CONTACT={
    name:'วีระพงศ์ แซ่เอี๊ยว',
    addr:'9 รามคำแหง 170 แยก 8 ถนนรามคำแหง แขวงมีนบุรี เขตมีนบุรี กรุงเทพฯ 10510',
    phone:'099-395-9266',
    email:'support@iufit.com',
    line:'@987qyznd'
  };
  function contactRowsHtml(){
    return '<div class="crow"><span>'+t('c_name')+'</span><b>'+CONTACT.name+'</b></div>'+
      '<div class="crow"><span>'+t('c_addr')+'</span><b>'+CONTACT.addr+'</b></div>'+
      '<div class="crow"><span>'+t('c_phone')+'</span><b><a class="blue" href="tel:'+CONTACT.phone.replace(/[^0-9+]/g,'')+'">'+CONTACT.phone+'</a></b></div>'+
      '<div class="crow"><span>'+t('c_email')+'</span><b><a class="blue" href="mailto:'+CONTACT.email+'">'+CONTACT.email+'</a></b></div>'+
      '<div class="crow"><span>'+t('c_line')+'</span><b><a class="blue" href="'+LINE_URL+'" target="_blank" rel="noopener">'+CONTACT.line+'</a></b></div>';
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
      trial_hero_t:'ทดลอง Trainer Pro ฟรี 30 วัน',trial_hero_m:'ไม่ต้องใส่บัตร · ยกเลิกได้ทุกเมื่อ · เริ่มใช้ได้ทันทีในแอป',trial_hero_cta:'เปิดแอปเพื่อทดลองฟรี →',
      trust_pay:'ชำระเงินปลอดภัย Omise',trust_pp:'รองรับ PromptPay',trust_ssl:'เข้ารหัส SSL',
      why_title:'ทำไมเทรนเนอร์เลือก IUFIT',why1_t:'ครบในแอปเดียว',why1_m:'ส่งแผนอาหาร/ฝึก รับ-ตรวจการบ้าน แชท และติดตามผลลูกเทรน',why2_t:'IU MATE ช่วยลดงาน',why2_m:'ร่างเมนู/โปรแกรมฝึก สรุปการบ้าน และคนที่ต้องตามให้',why3_t:'ลูกเทรนไม่ต้องจ่าย',why3_m:'เชิญด้วย QR เข้าใช้ผ่านที่นั่งของคุณ ไม่ต้องซื้อแพ็กเอง',
      faq_title:'คำถามที่พบบ่อย',faq1_q:'จ่ายเงินยังไงบ้าง?',faq1_a:'เลือกแพ็ก → ชำระผ่านบัตรเครดิต/เดบิต หรือ PromptPay ผ่าน Omise ที่ปลอดภัย → เปิดแอปด้วยบัญชีเดิม แพ็กปลดล็อกอัตโนมัติ',faq2_q:'ทำไมในแอปไม่มีปุ่มซื้อ?',faq2_a:'ตามนโยบาย Google Play การสมัครแพ็กซอฟต์แวร์ทำผ่านเว็บนี้ (นอกแอป) · ส่วนค่าคอร์สเทรนตัวต่อตัว (บริการจริงระหว่างคุณกับลูกเทรน) จ่าย PromptPay ในแอปได้ปกติ',faq3_q:'ต่ออายุ / ยกเลิกยังไง?',faq3_a:'ต่ออายุที่หน้านี้เมื่อใกล้หมดอายุ (มีแจ้งเตือนล่วงหน้า) · ยกเลิกได้ทุกเมื่อ ไม่มีสัญญาผูกมัด · ข้อมูลลูกเทรนไม่หายแม้ลดแพ็ก',faq4_q:'1 แพ็กใช้ได้กี่เครื่อง?',faq4_a:'ใช้ได้ตามจำนวนที่กำหนดต่อแพ็ก · ย้ายเครื่องได้โดยติดต่อทีมงาน',faq5_q:'มีรับประกันคืนเงินไหม?',faq5_a:'มีทดลองฟรี 30 วันให้ลองเต็มระบบก่อน · เมื่อชำระแล้วเป็นแบบไม่คืนเงิน (ดูนโยบายคืนเงิน)',
      launch:'✨ ราคาเปิดตัวสำหรับเทรนเนอร์กลุ่มแรก · ทดลอง Trainer Pro ฟรี 30 วันในแอป (ไม่ต้องใส่บัตร)',
      monthly:'รายเดือน',yearly:'รายปี · ประหยัด 2 เดือน',launch_price:'ราคาเปิดตัว',per_mo:'/เดือน',per_yr:'/ปี',
      current_plan:'แพ็กปัจจุบัน',choose_plan:'เลือกแพ็กนี้',contact:'ติดต่อสอบถาม',manage_web:'จัดการแพ็กผ่านเว็บ/ไลน์',
      addon_title:'➕ Add-on · เพิ่มลูกเทรน',addon_desc:'ขยายจำนวนลูกเทรนได้โดยไม่ต้องเปลี่ยนแพ็ก (Starter & Pro)',addon_price:'+5 ลูกเทรน = ฿99/เดือน',addon_eg:'เช่น Pro ฿599 + add-on ฿99 = ฿698/เดือน ดูแลได้ 25 คน',
      how_title:'เริ่มยังไง',how1:'<b>ทดลองฟรีในแอป</b> — เปิดแอป IUFIT → ตั้งค่า → ทดลอง Trainer Pro ฟรี 30 วัน (ไม่ต้องใส่บัตร)',how2:'<b>พร้อมสมัครจริง</b> — กด “สมัคร” เลือกแพ็ก/รอบบิล แล้วชำระเงิน (หรือทักไลน์)',how3:'<b>ปลดล็อกอัตโนมัติ</b> — เปิดแอปด้วยบัญชีเดิม แพ็กจะเปิดให้เอง ลูกเทรนและข้อมูลอยู่ครบ',
      note_soft:'ค่าแพ็กเป็นการสมัครใช้ซอฟต์แวร์ IUFIT ผ่านเว็บไซต์ · ค่าเทรนระหว่างลูกเทรนกับโค้ชโอนตรงผ่าน PromptPay ของโค้ช (IUFIT ไม่ถือเงินแทน)',
      store_note_t:'เปิดในแอป',store_note_m:'การสมัคร/ชำระเงินทำผ่านเว็บไซต์หรือ LINE · ในแอปกดทดลองฟรีและดูสถานะแพ็กได้',
      billing_title:'สมัครแพ็ก',acct_prefix:'บัญชี: ',acct_bind:' · แพ็กจะผูกกับบัญชีนี้',acct_login:'เข้าสู่ระบบในแอปด้วยอีเมล/LINE เพื่อให้แพ็กปลดล็อกอัตโนมัติ',
      pick_plan:'เลือกแพ็ก',clients_unit:' คน',pay_method:'วิธีชำระเงิน',pm_card:'💳 บัตรเครดิต/เดบิต',pm_pp:'📱 PromptPay',
      card_name:'ชื่อบนบัตร',card_name_ph:'ชื่อ-สกุล',card_num:'หมายเลขบัตร',card_exp:'หมดอายุ (ดด/ปป)',card_cvv:'CVV',pay_btn:'ชำระเงิน',
      secure_note:'🔒 ข้อมูลบัตรถูกเข้ารหัสและส่งตรงให้ Omise · IUFIT ไม่เก็บเลขบัตร',
      omise_soon_t:'ระบบชำระออนไลน์กำลังเปิดให้บริการ',omise_soon_m:'จองราคาเปิดตัวไว้ก่อนได้ — ราคานี้จะถูกล็อกให้คุณ แล้วแอดมินช่วยเปิดแพ็กให้ทันที',
      book_line:'💬 จองราคา & สมัครทาง LINE',reserve_local:'🔖 จองราคานี้ไว้ในเครื่อง',
      order_total:'ยอดชำระ',equiv:'เทียบเท่า',
      store_guard_t:'สมัครผ่านเว็บหรือ LINE',store_guard_m:'การชำระเงินทำนอกแอป · เปิด iufit.com/billing.html ในเบราว์เซอร์ หรือทักไลน์เพื่อสมัคร — เปิดแอปด้วยบัญชีเดิมแล้วแพ็กจะปลดล็อกให้อัตโนมัติ',
      line_btn:'💬 ทักไลน์ @987qyznd',
      res_success_t:'ชำระเงินสำเร็จ',res_success_m:'แพ็กของคุณเปิดใช้งานแล้ว · เปิดแอป IUFIT ด้วยบัญชีเดิม แพ็กจะปลดล็อกอัตโนมัติภายในไม่กี่วินาที',
      res_pending_t:'รอการยืนยันการชำระ',res_pending_m:'เรากำลังรอผลการชำระเงิน (เช่น PromptPay) · เมื่อสำเร็จ แพ็กจะเปิดให้อัตโนมัติ',
      res_failed_t:'ชำระเงินไม่สำเร็จ',res_failed_m:'ยังไม่มีการตัดเงิน · ลองใหม่อีกครั้ง หรือทักไลน์ให้เราช่วย',
      go_myplan:'ไปหน้าแพ็กของฉัน',retry:'ลองชำระอีกครั้ง',line_help:'ทักไลน์ขอความช่วยเหลือ',
      myplan_title:'แพ็กของฉัน',acct_hint:'เปิดหน้านี้บนอุปกรณ์เดียวกับที่ใช้แอป เพื่อดูสถานะแพ็กของคุณ',
      cur_label:'แพ็กปัจจุบัน',trial_left:'ทดลองฟรี · เหลือ {d} วัน · ไม่ต้องใส่บัตร',expires_on:'หมดอายุ {date}',days_more:' · อีก {d} วัน',one_client:'ดูแลลูกเทรนได้ 1 คน',
      pill_trial:'TRIAL',pill_active:'ACTIVE',pill_free:'FREE',trial_name:'Trainer Pro (ทดลอง)',free_name:'Trainer Free',
      rem_trial_soon:'⚠️ ทดลองใกล้หมด',rem_trial:'⏳ แจ้งเตือนทดลองใช้งาน',rem_trial_m:'เหลืออีก {d} วัน · สมัครต่อเพื่อคงสิทธิ์ Trainer Pro และลูกเทรนทั้งหมด',
      rem_exp_t:'หมดช่วงทดลองแล้ว',rem_exp_m:'ตอนนี้เป็น Trainer Free · ข้อมูลอยู่ครบ · อัปเกรดเพื่อปลดล็อกลูกเทรนและฟีเจอร์ Pro กลับมา',
      rem_paid_t:'⏰ แพ็กใกล้หมดอายุ',rem_paid_m:'อีก {d} วัน ({date}) · ต่ออายุเพื่อคงลูกเทรนและฟีเจอร์ไว้',
      know_title:'เมื่อสมาชิกหมดอายุ',know1:'เมื่อแพ็ก/ช่วงทดลองหมดอายุ <b>ข้อมูลไม่หาย</b> — กลับเป็น Trainer Free (ดูแลลูกเทรนได้ 1 คน)',know2:'ลูกเทรนที่เกินสิทธิ์จะถูกล็อกเป็น <b>อ่านอย่างเดียว</b> ชั่วคราว (ไม่ถูกลบ) — อัปเกรดเมื่อไรก็กลับมาใช้ได้ครบ',know3:'อัปเกรด/ต่ออายุได้ทุกเมื่อ แพ็กจะปลดล็อกในแอปอัตโนมัติ',
      act_store_t:'จัดการแพ็กผ่านเว็บ/LINE',act_store_m:'เปิด iufit.com/billing.html ในเบราว์เซอร์ หรือทักไลน์เพื่อสมัคร/ต่ออายุ — แพ็กจะปลดล็อกในแอปอัตโนมัติ',
      act_sub_keep:'สมัครต่อ · คงสิทธิ์ Pro',act_see_all:'ดูแพ็กทั้งหมด',act_renew:'🔄 ต่ออายุแพ็กนี้',act_change:'เปลี่ยน/อัปเกรดแพ็ก',act_upgrade:'อัปเกรดเป็น Trainer Pro',
      nav_refund:'คืนเงิน',nav_contact:'ติดต่อ',
      refund_title:'นโยบายการยกเลิกและคืนเงิน',refund_sub:'สำหรับบริการสมาชิกซอฟต์แวร์ IUFIT (บริการดิจิทัลแบบสมัครสมาชิก)',
      refund_p1:'<b>ทดลองใช้ฟรี 30 วัน</b> ก่อนชำระเงินทุกแพ็ก — โปรดทดลองใช้ให้แน่ใจก่อนสมัคร',
      refund_p2:'<b>ไม่มีการคืนเงิน (No refund)</b> เมื่อชำระค่าบริการแล้วทุกกรณี เนื่องจากเป็นบริการดิจิทัลที่เปิดใช้งานให้ทันที',
      refund_p3:'<b>การยกเลิก:</b> ยกเลิกการต่ออายุอัตโนมัติได้ทุกเมื่อ จะไม่ถูกเรียกเก็บเงินรอบถัดไป และยังใช้งานได้จนครบรอบที่ชำระไว้',
      refund_p4:'<b>กรณีพิเศษ:</b> หากมีการคืนเงินตามดุลยพินิจของผู้ให้บริการ จะคืนผ่าน<b>ช่องทางการชำระเงินเดิมเท่านั้น</b> ภายใน 7–14 วันทำการ',
      refund_p5:'มีคำถามหรือต้องการความช่วยเหลือ ติดต่อเราตามช่องทางด้านล่างได้ทุกเมื่อ',
      consent_refund:'ฉันได้อ่านและยอมรับนโยบายไม่คืนเงินและข้อกำหนดการใช้บริการ',
      consent_req:'กรุณายอมรับนโยบายคืนเงินก่อนชำระเงิน',
      contact_title:'ข้อมูลติดต่อผู้ให้บริการ',c_name:'ชื่อผู้ประกอบการ',c_addr:'ที่อยู่',c_phone:'โทรศัพท์',c_email:'อีเมล',c_line:'LINE'
    },
    en:{
      nav_pricing:'Pricing',nav_billing:'Subscribe',nav_myplan:'My plan',
      pricing_title:'Trainer plans',pricing_sub:'Coach clients systematically — send plans, collect homework, track results, and let IU MATE cut your daily work.',
      trial_hero_t:'Try Trainer Pro free · 30 days',trial_hero_m:'No card · cancel anytime · start instantly in the app',trial_hero_cta:'Open the app to start free →',
      trust_pay:'Secure payments by Omise',trust_pp:'PromptPay supported',trust_ssl:'SSL encrypted',
      why_title:'Why coaches choose IUFIT',why1_t:'All in one app',why1_m:'Send meal/workout plans, review homework, chat, and track clients',why2_t:'IU MATE cuts your work',why2_m:'Draft menus/programs, summarize homework and at-risk clients',why3_t:'Clients pay nothing',why3_m:'Invite by QR — they join on your seats, no purchase needed',
      faq_title:'FAQ',faq1_q:'How do I pay?',faq1_a:'Pick a plan → pay by card or PromptPay via secure Omise → open the app with the same account and your plan unlocks automatically.',faq2_q:'Why is there no buy button in the app?',faq2_a:'Per Google Play policy, software plans are purchased on this website (outside the app). One-on-one PT fees (a real service between you and your client) can still be paid via PromptPay inside the app.',faq3_q:'How do I renew / cancel?',faq3_a:'Renew here when your plan is about to expire (you get reminders) · cancel anytime, no contract · client data is never lost even if you downgrade.',faq4_q:'How many devices per plan?',faq4_a:'Each plan allows a set number of devices · contact us to move devices.',faq5_q:'Is there a refund guarantee?',faq5_a:'A 30-day free trial lets you test the full system first · once paid it is non-refundable (see refund policy).',
      launch:'✨ Launch price for the first coaches · Try Trainer Pro free 30 days in the app (no card).',
      monthly:'Monthly',yearly:'Yearly · save 2 months',launch_price:'Launch price',per_mo:'/mo',per_yr:'/yr',
      current_plan:'Current plan',choose_plan:'Choose this plan',contact:'Contact us',manage_web:'Manage on web / LINE',
      addon_title:'➕ Add-on · more clients',addon_desc:'Expand your client limit without changing plan (Starter & Pro).',addon_price:'+5 clients = ฿99/mo',addon_eg:'e.g. Pro ฿599 + add-on ฿99 = ฿698/mo for 25 clients',
      how_title:'How to start',how1:'<b>Try free in the app</b> — open IUFIT → Settings → Try Trainer Pro free 30 days (no card).',how2:'<b>Ready to subscribe</b> — tap “Subscribe”, pick a plan & cycle, then pay (or chat on LINE).',how3:'<b>Auto-unlock</b> — open the app with the same account; your plan activates automatically, clients & data intact.',
      note_soft:'Plan fees are a subscription to IUFIT software via the website · Client↔coach payments transfer directly via the coach PromptPay (IUFIT does not hold funds).',
      store_note_t:'Opened in the app',store_note_m:'Subscription/payment is done on the website or LINE · in the app you can start the free trial and view plan status.',
      billing_title:'Subscribe',acct_prefix:'Account: ',acct_bind:' · your plan links to this account',acct_login:'Sign in inside the app with email/LINE so your plan unlocks automatically.',
      pick_plan:'Choose a plan',clients_unit:' clients',pay_method:'Payment method',pm_card:'💳 Credit/Debit card',pm_pp:'📱 PromptPay',
      card_name:'Name on card',card_name_ph:'Full name',card_num:'Card number',card_exp:'Expiry (MM/YY)',card_cvv:'CVV',pay_btn:'Pay',
      secure_note:'🔒 Card details are encrypted and sent directly to Omise · IUFIT never stores your card.',
      omise_soon_t:'Online payment is opening soon',omise_soon_m:'Reserve the launch price now — it will be locked for you and our team activates your plan right away.',
      book_line:'💬 Reserve & subscribe on LINE',reserve_local:'🔖 Reserve this price on device',
      order_total:'Total',equiv:'Equivalent',
      store_guard_t:'Subscribe on web or LINE',store_guard_m:'Payment happens outside the app · open iufit.com/billing.html in a browser or chat on LINE — open the app with the same account and your plan unlocks automatically.',
      line_btn:'💬 Chat on LINE @987qyznd',
      res_success_t:'Payment successful',res_success_m:'Your plan is active · open IUFIT with the same account and it unlocks automatically within seconds.',
      res_pending_t:'Awaiting payment confirmation',res_pending_m:'We are waiting for the payment result (e.g. PromptPay) · once done, your plan activates automatically.',
      res_failed_t:'Payment failed',res_failed_m:'No charge was made · try again, or chat on LINE for help.',
      go_myplan:'Go to My plan',retry:'Try paying again',line_help:'Chat on LINE for help',
      myplan_title:'My plan',acct_hint:'Open this page on the same device as the app to see your plan status.',
      cur_label:'Current plan',trial_left:'Free trial · {d} days left · no card',expires_on:'Expires {date}',days_more:' · {d} days left',one_client:'1 client',
      pill_trial:'TRIAL',pill_active:'ACTIVE',pill_free:'FREE',trial_name:'Trainer Pro (trial)',free_name:'Trainer Free',
      rem_trial_soon:'⚠️ Trial ending soon',rem_trial:'⏳ Trial reminder',rem_trial_m:'{d} days left · subscribe to keep Trainer Pro and all your clients.',
      rem_exp_t:'Trial ended',rem_exp_m:'You are now on Trainer Free · data is safe · upgrade to unlock clients and Pro features again.',
      rem_paid_t:'⏰ Plan expiring soon',rem_paid_m:'{d} days left ({date}) · renew to keep your clients and features.',
      know_title:'When your membership expires',know1:'When your plan or trial expires <b>your data is safe</b> — you return to Trainer Free (1 client).',know2:'Clients over the limit become <b>read-only</b> temporarily (never deleted) — upgrade anytime to restore full access.',know3:'Upgrade/renew anytime; your plan unlocks in the app automatically.',
      act_store_t:'Manage on web / LINE',act_store_m:'Open iufit.com/billing.html in a browser or chat on LINE to subscribe/renew — your plan unlocks in the app automatically.',
      act_sub_keep:'Subscribe · keep Pro',act_see_all:'See all plans',act_renew:'🔄 Renew this plan',act_change:'Change / upgrade plan',act_upgrade:'Upgrade to Trainer Pro',
      nav_refund:'Refunds',nav_contact:'Contact',
      refund_title:'Cancellation & Refund Policy',refund_sub:'For IUFIT software membership (a digital subscription service)',
      refund_p1:'<b>30-day free trial</b> on every plan before any payment — please try it first to make sure it fits.',
      refund_p2:'<b>No refund</b> once a subscription fee has been paid, in all cases, as this is a digital service activated immediately.',
      refund_p3:'<b>Cancellation:</b> you can cancel auto-renewal anytime; you will not be charged for the next cycle and keep access until the end of the paid period.',
      refund_p4:'<b>Exceptions:</b> if a refund is granted at the provider’s discretion, it will be returned <b>only to the original payment method</b> within 7–14 business days.',
      refund_p5:'Questions or need help? Contact us via the channels below anytime.',
      consent_refund:'I have read and accept the no-refund policy and the terms of service.',
      consent_req:'Please accept the refund policy before paying.',
      contact_title:'Service provider contact',c_name:'Business owner',c_addr:'Address',c_phone:'Phone',c_email:'Email',c_line:'LINE'
    }
  };
  function t(k){return (T[LANG]&&T[LANG][k])||T.th[k]||k;}

  var PLANS=[
    {k:'free',name:'Free',sub:'ผู้ใช้ทั่วไป + เทรนเนอร์ลองระบบ',subEn:'General users & trial coaches',clients:1,mo:0,yr:0,
     feats:['ลูกเทรน 1 คน','ส่งแผน / รับการบ้านแบบจำกัด','IU MATE Coach 20 ครั้ง/เดือน'],featsEn:['1 client','Limited plans & homework','IU MATE Coach 20/mo']},
    {k:'starter',name:'Trainer Starter',sub:'เริ่มดูแลลูกเทรน 5 คนแบบเป็นระบบ',subEn:'Coach up to 5 clients',clients:5,mo:299,moWas:399,yr:2990,yrWas:3990,
     feats:['ลูกเทรน 5 คน','ส่งแผนอาหาร / แผนฝึก','รับ-ตรวจการบ้าน','แชทกับลูกเทรน','ดู progress รายคน','IU MATE Coach 100 ครั้ง/เดือน','วิเคราะห์ย้อนหลัง 7 วัน'],
     featsEn:['5 clients','Send meal & workout plans','Receive & review homework','Chat with clients','Per-client progress','IU MATE Coach 100/mo','7-day history']},
    {k:'pro',name:'Trainer Pro',sub:'สำหรับเทรนเนอร์ที่ใช้งานจริง',subEn:'For working coaches',hot:1,badge:'แนะนำ',badgeEn:'Recommended',clients:20,mo:599,moWas:899,yr:5990,yrWas:8990,
     feats:['ลูกเทรน 20 คน','ทุกอย่างใน Starter','กลุ่ม + ภารกิจ + leaderboard','สรุปลูกเทรนที่น่าห่วง','สรุปการบ้านหลายรายการ','IU MATE Coach 500 ครั้ง/เดือน','วิเคราะห์ย้อนหลัง 30–90 วัน','Progress report + share card'],
     featsEn:['20 clients','Everything in Starter','Groups + missions + leaderboard','At-risk client summary','Batch homework summary','IU MATE Coach 500/mo','30–90 day history','Progress report + share card']},
    {k:'growth',name:'Trainer Growth',sub:'สำหรับโค้ชออนไลน์ลูกเทรนเยอะ',subEn:'For online coaches with many clients',clients:50,mo:990,moWas:1490,yr:9900,yrWas:14900,
     feats:['ลูกเทรน 50 คน','ทุกอย่างใน Pro','ผู้ช่วย 1 คน (เร็ว ๆ นี้)','จัดการกลุ่มได้ถึง 10 กลุ่ม','รายงานลูกเทรนละเอียดขึ้น','ระบบต่ออายุ / Payment Tracker','Priority support'],
     featsEn:['50 clients','Everything in Pro','1 assistant seat (soon)','Up to 10 groups','Detailed client reports','Renewal / Payment Tracker','Priority support']},
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
    PLANS:PLANS, ADDON:ADDON, getPlan:getPlan, price:price, fmt:fmt,
    planSub:planSub, planFeats:planFeats, planBadge:planBadge,
    appState:appState, accountKey:accountKey, accountLabel:accountLabel,
    currentPlanKey:currentPlanKey, planExpiry:planExpiry,
    trialDaysLeft:trialDaysLeft, trialActive:trialActive, trialExpired:trialExpired,
    paidActive:paidActive, daysUntil:daysUntil, reminderTier:reminderTier, today:today, qs:qs,
    CONTACT:CONTACT, contactRowsHtml:contactRowsHtml, footerHtml:footerHtml
  };
})();
