/* IUFIT billing engine (vanilla) — shared by pricing.html / billing.html / my-plan.html
 * อ่านสถานะผู้ใช้จาก localStorage['iufit'] (same-origin) · platform guard · plan data · Omise hook (ภายหลัง)
 */
(function(){
  'use strict';

  // ---------- Platform guard (web / android_play_store / ios_app_store) ----------
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

  // ---------- Omise (เสียบ key ตอนอนุมัติ) ----------
  var OMISE_PUBLIC_KEY='';                 // <-- ใส่ pkey_xxx เมื่อ Omise อนุมัติ
  var OMISE_READY=false;                   // <-- เปลี่ยนเป็น true เมื่อพร้อมรับชำระจริง
  var CHARGE_ENDPOINT='https://iufit-omise.ar-weerapong.workers.dev'; // worker (สร้างภายหลัง)
  var LINE_URL='https://line.me/R/ti/p/@987qyznd';

  // ---------- Plans (ตรงกับ PLANS ในแอป) ----------
  var PLANS=[
    {k:'free',name:'Free',sub:'ผู้ใช้ทั่วไป + เทรนเนอร์ลองระบบ',clients:1,mo:0,yr:0,
     feats:['ลูกเทรน 1 คน','ส่งแผน / รับการบ้านแบบจำกัด','IU MATE Coach 20 ครั้ง/เดือน']},
    {k:'starter',name:'Trainer Starter',sub:'เริ่มดูแลลูกเทรน 5 คนแบบเป็นระบบ',clients:5,mo:299,moWas:399,yr:2990,yrWas:3990,
     feats:['ลูกเทรน 5 คน','ส่งแผนอาหาร / แผนฝึก','รับ-ตรวจการบ้าน','แชทกับลูกเทรน','ดู progress รายคน','IU MATE Coach 100 ครั้ง/เดือน','วิเคราะห์ย้อนหลัง 7 วัน']},
    {k:'pro',name:'Trainer Pro',sub:'สำหรับเทรนเนอร์ที่ใช้งานจริง',hot:1,badge:'แนะนำ',clients:20,mo:599,moWas:899,yr:5990,yrWas:8990,
     feats:['ลูกเทรน 20 คน','ทุกอย่างใน Starter','กลุ่ม + ภารกิจ + leaderboard','สรุปลูกเทรนที่น่าห่วง','สรุปการบ้านหลายรายการ','IU MATE Coach 500 ครั้ง/เดือน','วิเคราะห์ย้อนหลัง 30–90 วัน','Progress report + share card']},
    {k:'growth',name:'Trainer Growth',sub:'สำหรับโค้ชออนไลน์ลูกเทรนเยอะ',clients:50,mo:990,moWas:1490,yr:9900,yrWas:14900,
     feats:['ลูกเทรน 50 คน','ทุกอย่างใน Pro','ผู้ช่วย 1 คน','จัดการกลุ่มได้ถึง 10 กลุ่ม','รายงานลูกเทรนละเอียดขึ้น','ระบบต่ออายุ / Payment Tracker','Priority support']},
    {k:'studio',name:'Studio',sub:'ฟิตเนส สตูดิโอ ทีม หรือองค์กร',contact:1,clients:'100+',
     feats:['หลายเทรนเนอร์ / หลายกลุ่ม','รองรับลูกเทรนจำนวนมาก','Team dashboard','รายงานภาพรวมทีม','ระบบจัดการสิทธิ์แอดมิน','ปรับแพ็กตามการใช้งานจริง']}
  ];
  var ADDON={clients:5,mo:99};
  function getPlan(k){for(var i=0;i<PLANS.length;i++)if(PLANS[i].k===k)return PLANS[i];return null;}
  function price(p,yr){return yr?(p.yr||0):(p.mo||0);}
  function fmt(n){try{return (n||0).toLocaleString('en-US');}catch(e){return ''+n;}}

  // ---------- อ่านสถานะแอป (same-origin localStorage) ----------
  function appState(){try{return JSON.parse(localStorage.getItem('iufit')||'{}')||{};}catch(e){return {};}}
  function today(){var d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
  function accountKey(){var s=appState();try{if(s.lineId)return 'line:'+s.lineId;if(s.fbuid&&(''+s.fbuid).indexOf('email:')===0)return s.fbuid;if(s.emailId)return 'email:'+s.emailId;}catch(e){}return '';}
  function accountLabel(){var s=appState();return s.lineName||s.emailId||(s.users&&s.users[0]&&s.users[0].name)||'';}

  // map S.mem -> plan key (เพื่อแสดงผล ไม่แตะ logic จริงในแอป)
  function currentPlanKey(){
    var s=appState();var m=s.mem;
    if(m&&m.exp&&m.exp>=today()&&m.tier==='pro'){
      var seats=m.seats||0;
      if(seats>=100)return 'studio';if(seats>=50)return 'growth';if(seats>=20)return 'pro';if(seats>=5)return 'starter';return 'starter';
    }
    if(s.trial&&s.trial.start&&trialDaysLeft()>0)return 'pro';      // trial = pro features
    return 'free';
  }
  function planExpiry(){var s=appState();return (s.mem&&s.mem.exp)||'';}
  function trialDaysLeft(){var s=appState();if(!(s.trial&&s.trial.start))return 0;var dl=new Date(s.trial.start+'T00:00');dl.setDate(dl.getDate()+(s.trial.days||30));var ms=dl-new Date(today()+'T00:00');return ms>0?Math.ceil(ms/86400000):0;}
  function trialActive(){var s=appState();return trialDaysLeft()>0&&!(s.mem&&s.mem.exp&&s.mem.exp>=today());}
  function trialExpired(){var s=appState();return !!(s.trial&&s.trial.start)&&trialDaysLeft()<=0&&!(s.mem&&s.mem.exp&&s.mem.exp>=today());}
  function paidActive(){var s=appState();return !!(s.mem&&s.mem.exp&&s.mem.exp>=today()&&s.mem.via!=='seat');}
  function daysUntil(ymd){if(!ymd)return null;var ms=new Date(ymd+'T00:00')-new Date(today()+'T00:00');return Math.round(ms/86400000);}
  // reminder tier: returns 10/7/3/1/0 (0 = none) based on days left to a deadline
  function reminderTier(daysLeft){if(daysLeft==null||daysLeft<0)return 0;if(daysLeft<=1)return 1;if(daysLeft<=3)return 3;if(daysLeft<=7)return 7;if(daysLeft<=10)return 10;return 0;}

  // ---------- helpers ----------
  function qs(name){try{var m=new RegExp('[?&]'+name+'=([^&]+)').exec(location.search);return m?decodeURIComponent(m[1]):'';}catch(e){return '';}}

  window.IUFIT_BILLING={
    PLATFORM:PLATFORM, IS_STORE:IS_STORE,
    OMISE_READY:OMISE_READY, OMISE_PUBLIC_KEY:OMISE_PUBLIC_KEY, CHARGE_ENDPOINT:CHARGE_ENDPOINT,
    LINE_URL:LINE_URL,
    PLANS:PLANS, ADDON:ADDON, getPlan:getPlan, price:price, fmt:fmt,
    appState:appState, accountKey:accountKey, accountLabel:accountLabel,
    currentPlanKey:currentPlanKey, planExpiry:planExpiry,
    trialDaysLeft:trialDaysLeft, trialActive:trialActive, trialExpired:trialExpired,
    paidActive:paidActive, daysUntil:daysUntil, reminderTier:reminderTier, today:today, qs:qs
  };
})();
