/*! IUFIT — IU Mate · local-first in-app assistant (Phase 1-3 + ingredient recipe generator)
   Standalone: does NOT modify app logic. Reads global app state (var S/LANG/MODE/TODAY_DATE,
   window.IUFIT_ING, allRecipes()) and global functions (user, target, go, toast, save, addWater...).
   No external API. No network calls. Bilingual TH/EN via window.LANG. */
(function(){
'use strict';
if(window.IUMate) return;
/* SECTIONS: 1) utils  2) synonym/normalize  3) calc engine (BMR/TDEE/macros/BMI)  4) ingredient model + recipe engine  5) context engine (local data)  6) INTENTS (detectIntent + INTENT_KW)  7) KNOWLEDGE base  8) reply builders  9) chips/greeting  10) rendering (FAB/sheet/cards)  11) confirm + ACTIONS  12) recipe/ingredient/calc UI  13) message flow  14) public API + consent  15) boot */

/* ============================ tiny utils ============================ */
function EN(){ return window.LANG==='en'; }
function L(th,en){ return EN()?en:th; }
function uid(){ return 'iu'+Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
function esc(s){ s=(s==null?'':''+s); return s.replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function norm(s){ return (s==null?'':(''+s)).toLowerCase().replace(/\s+/g,''); }
var SYN={'กระเพรา':'กะเพรา','กระเพา':'กะเพรา','กะเพา':'กะเพรา','กระเพราะ':'กะเพรา','กวยเตี๋ยว':'ก๋วยเตี๋ยว','ก๊วยเตี๋ยว':'ก๋วยเตี๋ยว','ก่วยเตี๋ยว':'ก๋วยเตี๋ยว','ไก้':'ไก่','อกไก':'อกไก่','ข้าวสวย':'ข้าว','คาดิโอ':'คาร์ดิโอ','คาร์ดิโอ้':'คาร์ดิโอ','แคลอรี่':'แคล','แคลอรี':'แคล','กี่แคล':'กี่แคล','ฟีดแบค':'feedback','ฟีดแบ็ค':'feedback','ฟีดแบ็ก':'feedback','ฟีดแบก':'feedback','ลูกเทน':'ลูกเทรน','ลูกเทรนด์':'ลูกเทรน','โปรตีนสูง':'โปรตีนสูง','ทานข้าว':'กิน','กับข้าว':'อาหาร','ออกกําลัง':'ออกกำลัง','นํ้าหนัก':'น้ำหนัก'};
var SYN_KEYS=Object.keys(SYN).sort(function(a,b){return b.length-a.length;});
function synNorm(s){ var t=norm(s); for(var i=0;i<SYN_KEYS.length;i++){ var k=SYN_KEYS[i]; if(t.indexOf(k)>=0) t=t.split(k).join(SYN[k]); } return t; }

/* ============================ calculation engine (estimates for planning) ============================ */
var ACT_OPTS=[[1.2,L('นั่งทำงาน แทบไม่ออกกำลัง','Sedentary')],[1.375,L('ออกกำลังเบา 1-3 วัน/สัปดาห์','Light 1-3 d/wk')],[1.55,L('ปานกลาง 3-5 วัน/สัปดาห์','Moderate 3-5 d/wk')],[1.725,L('หนัก 6-7 วัน/สัปดาห์','Hard 6-7 d/wk')],[1.9,L('นักกีฬา/งานหนักมาก','Athlete/very hard')]];
var CALC={
  bmr:function(sex,w,h,age){ return sex==='f' ? 10*w+6.25*h-5*age-161 : 10*w+6.25*h-5*age+5; },
  bmi:function(w,h){ var m=h/100; return Math.round(w/(m*m)*10)/10; },
  bmiCat:function(b){ if(b<18.5)return L('น้ำหนักน้อย','Underweight'); if(b<23)return L('ปกติ','Normal'); if(b<25)return L('ท้วม','Overweight'); if(b<30)return L('อ้วนระดับ 1','Obese I'); return L('อ้วนระดับ 2','Obese II'); },
  lbm:function(w,bf){ return Math.round(w*(1-bf/100)*10)/10; },
  plan:function(p){
    var act=p.act||1.375, goal=p.goal||'keep';
    var bmr=CALC.bmr(p.sex,p.w,p.h,p.age), tdee=bmr*act;
    var loK,hiK;
    if(goal==='lose'){ loK=tdee*0.80; hiK=tdee*0.90; }
    else if(goal==='gain'){ loK=tdee*1.05; hiK=tdee*1.10; }
    else { loK=tdee*0.97; hiK=tdee*1.03; }
    var midK=(loK+hiK)/2;
    var pLo,pHi; if(goal==='keep'){ pLo=p.w*1.4; pHi=p.w*1.8; } else { pLo=p.w*1.6; pHi=p.w*2.2; }
    var pMid=(pLo+pHi)/2, fat=p.w*0.9, fatK=fat*9, carb=Math.max(0,(midK-pMid*4-fatK)/4);
    return { bmr:Math.round(bmr), tdee:Math.round(tdee), kcalLo:Math.round(loK), kcalHi:Math.round(hiK), kcalMid:Math.round(midK),
      pLo:Math.round(pLo), pHi:Math.round(pHi), pMid:Math.round(pMid), fat:Math.round(fat), carb:Math.round(carb),
      bmi:p.h?CALC.bmi(p.w,p.h):null };
  }
};
function ageOf(u){ try{ if(fn('ageY')) { var a=window.ageY(u); if(a) return a; } }catch(e){} return (u&&u.age)||30; }
function parseProfileFromText(msg){
  var lo=(''+msg).toLowerCase().replace(/,/g,''); var o={};
  var mw=lo.match(/(\d{2,3}(?:\.\d)?)\s*(kg|กก|กิโล|โล)/); if(mw) o.w=parseFloat(mw[1]);
  if(o.w==null){ var mw2=lo.match(/(?:หนัก|น้ำหนัก|weight)\s*(\d{2,3}(?:\.\d)?)/); if(mw2) o.w=parseFloat(mw2[1]); }
  var mh=lo.match(/(\d{2,3})\s*(cm|ซม|เซน)/); if(mh) o.h=parseFloat(mh[1]);
  if(o.h==null){ var mh2=lo.match(/(?:สูง|ส่วนสูง|height)\s*(\d{2,3})/); if(mh2) o.h=parseFloat(mh2[1]); }
  var ma=lo.match(/(\d{1,2})\s*(ปี|yo|ขวบ)/); if(ma) o.age=parseFloat(ma[1]);
  if(o.age==null){ var ma2=lo.match(/(?:อายุ|age)\s*(\d{1,2})/); if(ma2) o.age=parseFloat(ma2[1]); }
  if(/หญิง|ผู้หญิง|female|woman|ผญ/.test(lo)) o.sex='f';
  else if(/ชาย|ผู้ชาย|\bmale\b|\bman\b|ผช/.test(lo)) o.sex='m';
  if(/ลดไขมัน|ลดน้ำหนัก|ลดความอ้วน|\bcut\b|fat loss|\blose\b/.test(lo)) o.goal='lose';
  else if(/เพิ่มกล้าม|เพิ่มน้ำหนัก|บัลค์|\bbulk\b|\bgain\b|build muscle/.test(lo)) o.goal='gain';
  else if(/รักษา|maintain|\bkeep\b/.test(lo)) o.goal='keep';
  if(/ปานกลาง|moderate/.test(lo)) o.act=1.55; else if(/หนักมาก|นักกีฬา|athlete|very (hard|active)/.test(lo)) o.act=1.9; else if(/หนัก|hard|6-7/.test(lo)) o.act=1.725; else if(/เบา|light|1-3/.test(lo)) o.act=1.375; else if(/นั่งทำงาน|แทบไม่|sedentary|ไม่ออกกำลัง/.test(lo)) o.act=1.2;
  var bf=lo.match(/(?:ไขมัน|body fat|bf)\s*(\d{1,2}(?:\.\d)?)\s*%?/); if(bf) o.bf=parseFloat(bf[1]);
  return o;
}
function calcReply(p){
  var r=CALC.plan(p), en=EN();
  var goalT={lose:L('ลดไขมัน','fat loss'),gain:L('เพิ่มกล้าม','muscle gain'),keep:L('รักษาน้ำหนัก','maintenance')}[p.goal||'keep'];
  var head=L((p.sex==='f'?'หญิง':'ชาย')+' · '+fmtN(p.w)+' กก. · '+p.h+' ซม. · '+p.age+' ปี · เป้า '+goalT,(p.sex==='f'?'Female':'Male')+' · '+fmtN(p.w)+' kg · '+p.h+' cm · '+p.age+' y · '+goalT);
  var lines=[head,
    'BMR ≈ '+fmtN(r.bmr)+' kcal/'+L('วัน','day'),
    'TDEE ≈ '+fmtN(r.tdee)+' kcal/'+L('วัน','day'),
    L('แคลเป้าหมาย','Target') +' ≈ '+fmtN(r.kcalLo)+'–'+fmtN(r.kcalHi)+' kcal/'+L('วัน','day'),
    L('โปรตีน','Protein')+' ≈ '+fmtN(r.pLo)+'–'+fmtN(r.pHi)+' g · '+L('ไขมัน','Fat')+' ≈ '+fmtN(r.fat)+' g · '+L('คาร์บ','Carb')+' ≈ '+fmtN(r.carb)+' g'];
  if(r.bmi!=null) lines.push('BMI ≈ '+r.bmi+' ('+CALC.bmiCat(r.bmi)+') — '+L('เป็นตัวชี้วัดคร่าว ๆ ไม่เหมาะกับคนกล้ามเยอะ','rough indicator, not ideal for very muscular people'));
  if(p.bf!=null) lines.push(L('มวลกล้าม (LBM)','Lean mass (LBM)')+' ≈ '+CALC.lbm(p.w,p.bf)+' กก.');
  return { title:L('ค่าประมาณแคลอรี & มาโคร','Calorie & macro estimate'),
    message:lines.join('\n'),
    disclaimer:L('เป็นค่าประมาณเพื่อช่วยวางแผน ไม่ใช่คำตัดสินตายตัว — ปรับตามการตอบสนองจริงทุก 2-3 สัปดาห์ และไม่ใช่คำแนะนำทางการแพทย์','Estimates to help planning, not fixed rules — adjust to the real 2-3 week response. Not medical advice.'),
    actions:[{label:L('แก้ตัวเลข','Edit values'),action:'open_calc'},{label:L('ดูสรุปวันนี้','Today'),action:'today_summary'}] };
}
function buildCalcPlan(message){
  var p=parseProfileFromText(message);
  if(role()!=='coach'){ var u=curUser()||{};
    if(p.sex==null&&u.sex) p.sex=u.sex;
    if(p.h==null&&u.h) p.h=u.h;
    if(p.w==null){ try{ p.w=fn('curW')?window.curW(u):u.w0; }catch(e){} }
    if(p.age==null) p.age=ageOf(u);
    if(p.act==null&&u.act) p.act=u.act;
    if(p.goal==null&&u.goal) p.goal=u.goal;
  }
  if(p.w==null||p.h==null||p.age==null||p.sex==null){ ST.calc=p; openCalcForm(p);
    return { title:L('คำนวณแคลอรี & มาโคร','Calorie & macro estimate'), message:L('ขอข้อมูลอีกนิดเพื่อประมาณให้แม่นขึ้นครับ กรอกในฟอร์มสั้น ๆ ได้เลย','I need a bit more info — fill the quick form to get your estimate.'), actions:[{label:L('เปิดเครื่องคำนวณ','Open calculator'),action:'open_calc'}] }; }
  return calcReply(p);
}
function openCalcForm(p){
  p=p||ST.calc||{}; ST.calc=p; var sexM=(p.sex!=='f');
  function inp(id,ph,val){ return '<input class="search" id="'+id+'" inputmode="numeric" placeholder="'+esc(ph)+'" value="'+(val!=null?val:'')+'" style="margin-bottom:8px">'; }
  var acts=ACT_OPTS.map(function(a){ var sel=(p.act?Math.abs(p.act-a[0])<0.01:a[0]===1.375); return '<option value="'+a[0]+'"'+(sel?' selected':'')+'>'+esc(a[1])+'</option>'; }).join('');
  var goal=p.goal||'lose';
  var h='<div class="iu-mate-ip"><h3>'+esc(L('เครื่องคำนวณแคลอรี','Calorie calculator'))+'</h3>'+
    '<div class="sub">'+esc(L('กรอกข้อมูลเพื่อประมาณแคลและมาโคร (ค่าประมาณเพื่อวางแผน)','Enter details to estimate calories & macros (planning estimate)'))+'</div>'+
    '<div class="iu-mate-grp-chips">'+
      '<button class="iu-mate-grp-chip'+(sexM?' on':'')+'" id="iuSexM" onclick="IUMate._sex(\'m\')">'+esc(L('ชาย','Male'))+'</button>'+
      '<button class="iu-mate-grp-chip'+(!sexM?' on':'')+'" id="iuSexF" onclick="IUMate._sex(\'f\')">'+esc(L('หญิง','Female'))+'</button>'+
    '</div>'+
    inp('iuCalcAge',L('อายุ (ปี)','Age (years)'),p.age)+
    inp('iuCalcH',L('ส่วนสูง (ซม.)','Height (cm)'),p.h)+
    inp('iuCalcW',L('น้ำหนัก (กก.)','Weight (kg)'),p.w)+
    '<select class="search" id="iuCalcAct" style="margin-bottom:8px">'+acts+'</select>'+
    '<div class="iu-mate-grp-chips">'+
      '<button class="iu-mate-grp-chip'+(goal==='lose'?' on':'')+'" id="iuGoalLose" onclick="IUMate._goal(\'lose\')">'+esc(L('ลดไขมัน','Fat loss'))+'</button>'+
      '<button class="iu-mate-grp-chip'+(goal==='keep'?' on':'')+'" id="iuGoalKeep" onclick="IUMate._goal(\'keep\')">'+esc(L('รักษา','Maintain'))+'</button>'+
      '<button class="iu-mate-grp-chip'+(goal==='gain'?' on':'')+'" id="iuGoalGain" onclick="IUMate._goal(\'gain\')">'+esc(L('เพิ่มกล้าม','Muscle'))+'</button>'+
    '</div>'+
    '<button class="go" style="margin-top:10px" onclick="IUMate._calc()">'+esc(L('คำนวณ','Calculate'))+'</button></div>';
  modalOpen(h);
}

function fn(name){ return typeof window[name]==='function'; }
function call(name){ try{ if(fn(name)) return window[name].apply(null,Array.prototype.slice.call(arguments,1)); }catch(e){} return undefined; }
function S(){ return (window.S&&typeof window.S==='object')?window.S:{}; }
function ING(){ return window.IUFIT_ING||{}; }
function curUser(){ try{ return fn('user')?window.user():null; }catch(e){ return null; } }
function todayDate(){ try{ return window.TODAY_DATE || call('dstr') || new Date().toISOString().slice(0,10); }catch(e){ return new Date().toISOString().slice(0,10); } }
function role(){ try{ if(window.MODE) return window.MODE==='coach'?'coach':'user'; if(fn('isTrainer')&&window.isTrainer()) return 'coach'; }catch(e){} return 'user'; }
function appReady(){ try{ return fn('acctOK')?(window.acctOK()&&S().users&&S().users.length>0):(S().users&&S().users.length>0); }catch(e){ return false; } }
function tFoodName(n){ try{ return (EN()&&fn('tFood'))?window.tFood(n):n; }catch(e){ return n; } }
function fmtN(n){ try{ return fn('fmt')?window.fmt(n):(''+Math.round(n)); }catch(e){ return ''+Math.round(n); } }
function num(v){ v=Number(v); return isFinite(v)?v:0; }

/* ============================ state ============================ */
var ST = { isOpen:false, full:false, messages:[], pendingAction:null, recipeCache:{}, pickerSel:[], pickerGrp:'all', busy:false };
var SETTINGS_KEY='iufit_iu_mate_settings';
function loadSettings(){ try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'null'); }catch(e){ return null; } }
function saveSettings(s){ try{ localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }catch(e){} }
function settings(){ return loadSettings()||{enabled:true,answerStyle:'supportive_short',useCoachData:true,knowledgeInstalled:true}; }
/* local feedback loop: usage stats kept on-device only (localStorage), never sent */
var STATS_KEY='iufit_iu_mate_stats';
function loadStats(){ try{ return JSON.parse(localStorage.getItem(STATS_KEY)||'{}')||{}; }catch(e){ return {}; } }
function bumpStat(k){ try{ var st=loadStats(); st[k]=(st[k]||0)+1; localStorage.setItem(STATS_KEY, JSON.stringify(st)); }catch(e){} }
function statCount(k){ try{ return loadStats()[k]||0; }catch(e){ return 0; } }
var CONSENT_KEY='iufit_iu_mate_consent';
function loadConsent(){ try{ return JSON.parse(localStorage.getItem(CONSENT_KEY)||'null'); }catch(e){ return null; } }
function hasConsent(){ var c=loadConsent(); return !!(c&&c.accepted); }
function consentCoach(){ var c=loadConsent(); return !!(c&&c.accepted&&c.coachData!==false); }
function saveConsent(coachData){ try{ localStorage.setItem(CONSENT_KEY, JSON.stringify({accepted:true,coachData:coachData!==false,ts:Date.now()})); }catch(e){} }
function revokeConsent(){ try{ localStorage.removeItem(CONSENT_KEY); }catch(e){} }
function consentBodyHtml(coach){
  function pt(ic,th,en){ return '<div style="display:flex;gap:10px;align-items:flex-start;margin:11px 0"><span style="font-size:19px;flex:none;line-height:1.2">'+ic+'</span><div style="font-size:13.5px;line-height:1.55;color:#28364f">'+esc(L(th,en))+'</div></div>'; }
  return '<div class="iu-mate-card"><div class="ttl">'+sparkInline()+esc(L('ยินดีต้อนรับสู่ IU Mate','Welcome to IU Mate'))+'</div>'+
    '<div class="msg" style="margin-bottom:4px">'+esc(L('ก่อนเริ่ม ขออธิบายเรื่องข้อมูลสั้น ๆ ครับ','Before we start, a quick note about your data:'))+'</div>'+
    pt('🔒','ทำงานในเครื่อง 100% — บทสนทนาไม่ถูกบันทึกและไม่ถูกส่งออกนอกเครื่อง','100% on-device — conversations are not saved and never leave your device')+
    pt('📊','IU Mate อ่านข้อมูลในแอปของคุณ (เป้าหมาย อาหาร การฝึก ผลลัพธ์) เพื่อช่วยสรุปและแนะนำเท่านั้น','IU Mate reads your in-app data (goals, food, workouts, results) only to summarize and suggest')+
    pt('🩺','คำแนะนำเป็นข้อมูลทั่วไป ไม่ใช่คำวินิจฉัยหรือคำแนะนำทางการแพทย์','Guidance is general info — not a medical diagnosis or advice')+
    (coach?('<label style="display:flex;gap:9px;align-items:center;margin:14px 0 2px;font-size:13px;color:#28364f;cursor:pointer"><input type="checkbox" id="iuMateCoachConsent" checked style="width:18px;height:18px;flex:none">'+esc(L('อนุญาตให้ IU Mate ใช้ข้อมูลลูกเทรน/กลุ่มในเครื่องเพื่อช่วยสรุป','Let IU Mate use local client/group data to help summarize'))+'</label>'):'')+
    '<div class="iu-mate-actions" style="margin-top:16px">'+
      '<button class="iu-mate-act" onclick="IUMate.declineConsent()">'+esc(L('ไม่ใช่ตอนนี้','Not now'))+'</button>'+
      '<button class="iu-mate-act primary" onclick="IUMate.acceptConsent()">'+esc(L('ยอมรับและเริ่มใช้','Accept & start'))+'</button>'+
    '</div>'+
    '<div class="disc">'+esc(L('ยกเลิกความยินยอมได้ทุกเมื่อจากปุ่ม 🔒 ด้านบนของหน้าต่าง IU Mate','You can withdraw consent anytime via the 🔒 button at the top of IU Mate'))+'</div>'+
  '</div>';
}
function renderConsentScreen(){
  var r=root();
  r.innerHTML='<div class="iu-mate-backdrop" onclick="IUMate.close()"></div>'+
   '<section class="iu-mate-sheet" role="dialog" aria-label="IU Mate">'+
     '<div class="iu-mate-grab"></div>'+
     '<header class="iu-mate-header">'+
       '<div class="iu-mate-avatar">'+botIcon()+'</div>'+
       '<div class="iu-mate-title"><strong>IU Mate</strong><small>'+esc(L('ความเป็นส่วนตัว','Privacy & consent'))+'</small></div>'+
       '<span class="iu-mate-local-badge">Local</span>'+
     '</header>'+
     '<div class="iu-mate-messages" style="padding:16px">'+consentBodyHtml(role()==='coach')+'</div>'+
   '</section>';
}

/* ============================ icons ============================ */
function botIcon(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3.5"/><path d="M12 8V4.5M12 4.5a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z"/><path d="M9 13h.01M15 13h.01"/><path d="M1.8 12.5v3M22.2 12.5v3"/></svg>'; }
function sparkIcon(){ return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 4.7L18 8.3l-4.4 1.6L12 14l-1.6-4.1L6 8.3l4.4-1.6L12 2z"/></svg>'; }
function sendIcon(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12l16-7-7 16-2.5-6.5L4 12z"/></svg>'; }
function checkIcon(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>'; }

/* ============================ ingredient model (mapped from real ING DB) ============================ */
var GROUP_MAP = {
  'โปรตีน':'protein','แป้ง/ธัญพืช':'carb','คาร์โบไฮเดรต':'carb','ผัก':'vegetable','เห็ด':'vegetable',
  'ไขมัน':'fat','ไขมันดี':'fat','ถั่ว/เมล็ด':'fat','ผลไม้':'fruit','ปรุงรส':'sauce','เครื่องปรุง':'sauce'
};
var DEF_AMT = { protein:120, carb:150, vegetable:100, fat:15, fruit:120, sauce:10, other:100 };
var _ingCache=null;
function ingredientList(){
  if(_ingCache) return _ingCache;
  var out=[]; var ing=ING();
  for(var id in ing){ if(!Object.prototype.hasOwnProperty.call(ing,id)) continue;
    var it=ing[id]; if(!it||!it.v) continue;
    var g=GROUP_MAP[it.g]; if(!g) continue; // only usable groups
    out.push({ id:id, name:it.n, group:g,
      kcal:num(it.v[0]), protein:num(it.v[1]), fat:num(it.v[2]), carb:num(it.v[3]), fiber:num(it.v[4]),
      defaultAmount:DEF_AMT[g]||100, alias:it.a||'' });
  }
  _ingCache=out; return out;
}
/* schema guard: true only if IUFIT_ING exists and items expose numeric v=[kcal,prot,fat,carb,...] */
function ingDbOk(){ try{ var ing=ING(); var ks=Object.keys(ing); if(!ks.length) return false; for(var i=0;i<ks.length;i++){ var it=ing[ks[i]]; if(it&&it.v){ return Array.isArray(it.v)&&it.v.length>=4&&typeof it.v[0]==='number'; } } return false; }catch(e){ return false; } }
function cantCalcReply(){ return { title:L('ยังคำนวณเมนูไม่ได้','Cannot calculate menus yet'), message:L('ฐานข้อมูลวัตถุดิบยังไม่พร้อมหรือรูปแบบไม่ตรง IU Mate เลยยังคำนวณโภชนาการให้ไม่ได้ ลองรีเฟรชแอปอีกครั้งนะครับ','The ingredient database is not ready or its format does not match, so IU Mate cannot calculate nutrition. Please refresh the app.') }; }
function ingMatchForms(ing){
  // build candidate match strings: full name, alias, base name (strip parens), slash-split parts
  var forms=[]; function add(s){ s=(s||'').trim(); if(s&&s.length>=2) forms.push(s); }
  add(ing.name); if(ing.alias) add(ing.alias);
  var base=ing.name.replace(/\s*\([^)]*\)\s*/g,' ').trim(); add(base);
  base.split(/[\/,]/).forEach(add);
  return forms;
}
function findIngredientsInText(text){
  var t=synNorm(text); var found=[]; var seenName={};
  // longest names first to prefer specific matches; dedup by display name
  var list=ingredientList().slice().sort(function(a,b){ return b.name.length-a.name.length; });
  list.forEach(function(ing){
    if(seenName[ing.name]) return;
    var forms=ingMatchForms(ing);
    for(var i=0;i<forms.length;i++){ if(t.indexOf(norm(forms[i]))>=0){ found.push(ing); seenName[ing.name]=1; break; } }
  });
  return found;
}
function popularIngredients(){
  // representative staples by group if present, else first of group
  var byGroup={}; ingredientList().forEach(function(i){ (byGroup[i.group]=byGroup[i.group]||[]).push(i); });
  var picks=[]; ['protein','carb','vegetable','fat','fruit'].forEach(function(g){
    var arr=byGroup[g]||[]; arr.slice(0,3).forEach(function(i){ picks.push(i); });
  });
  return picks;
}

/* ============================ recipe templates ============================ */
var TEMPLATES = [
  { id:'clean_plate', name:L('เมนูคลีนจานเดียว','Clean one-plate'), requiredGroups:['protein','carb','vegetable'], optionalGroups:['sauce'], mealFit:['กลางวัน','เย็น'], goalFit:['ลดไขมัน','สุขภาพทั่วไป'], maxKcal:680, desc:L('อิ่มนาน โปรตีนดี เหมาะกับมื้อหลัก','Filling, high protein, great for a main meal') },
  { id:'low_cal', name:L('เมนูแคลต่ำ','Low-cal plate'), requiredGroups:['protein','vegetable'], optionalGroups:['sauce'], mealFit:['เย็น'], goalFit:['ลดไขมัน'], maxKcal:460, desc:L('เบา อิ่ม และไม่หนักเกินไป','Light, filling, easy on calories') },
  { id:'muscle_gain', name:L('เมนูเพิ่มกล้าม','Muscle gain'), requiredGroups:['protein','carb'], optionalGroups:['fat','vegetable'], mealFit:['กลางวัน','เย็น','หลังออกกำลัง'], goalFit:['เพิ่มกล้าม'], maxKcal:820, desc:L('ให้พลังงานและโปรตีนเหมาะกับการซ้อม','Energy + protein to support training') },
  { id:'breakfast_easy', name:L('มื้อเช้าง่าย ๆ','Easy breakfast'), requiredGroups:['protein','carb'], optionalGroups:['fruit','fat'], mealFit:['เช้า'], goalFit:['ลดไขมัน','เพิ่มกล้าม','สุขภาพทั่วไป'], maxKcal:560, desc:L('เริ่มวันแบบง่ายและคุมพลังงานได้','Simple start, controlled calories') },
  { id:'post_workout', name:L('เมนูหลังออกกำลัง','Post-workout'), requiredGroups:['protein','carb'], optionalGroups:['fruit'], mealFit:['หลังออกกำลัง'], goalFit:['เพิ่มกล้าม','ลดไขมัน'], maxKcal:700, desc:L('ช่วยเติมพลังหลังออกกำลังกาย','Refuel after a workout') }
];
function goalLabel(){ var u=curUser()||{}; if(u.goal==='lose') return 'ลดไขมัน'; if(u.goal==='gain') return 'เพิ่มกล้าม'; return 'สุขภาพทั่วไป'; }
function currentMeal(){ var h=new Date().getHours(); if(h<10) return 'เช้า'; if(h<15) return 'กลางวัน'; if(h<21) return 'เย็น'; return 'เย็น'; }
function groupBy(list){ var g={}; list.forEach(function(i){ (g[i.group]=g[i.group]||[]).push(i); }); return g; }
function cartesian(lists){ return lists.reduce(function(acc,list){ var out=[]; acc.forEach(function(a){ list.forEach(function(b){ out.push(a.concat([b])); }); }); return out; }, [[]]); }
function buildCombos(ings, tpl){
  var groups=groupBy(ings);
  // cap each group to avoid combinatorial explosion when user has many of one type
  for(var g in groups){ if(groups[g].length>4) groups[g]=groups[g].slice(0,4); }
  var req=tpl.requiredGroups.map(function(g){ return groups[g]||[]; });
  if(req.some(function(l){ return l.length===0; })) return [];
  var combos=[]; cartesian(req).forEach(function(base){ var combo=base.slice();
    (tpl.optionalGroups||[]).forEach(function(g){ var opt=(groups[g]||[])[0]; if(opt && !combo.some(function(x){return x.id===opt.id;})) combo.push(opt); });
    combos.push(combo);
  });
  return combos;
}
function calcNutrition(combo){ return combo.reduce(function(s,ing){ var amt=ing.selectedAmount||ing.defaultAmount||100; var r=amt/100;
  s.kcal+=ing.kcal*r; s.protein+=ing.protein*r; s.carb+=ing.carb*r; s.fat+=ing.fat*r; s.fiber+=(ing.fiber||0)*r; return s;
}, {kcal:0,protein:0,carb:0,fat:0,fiber:0}); }
function roundNut(n){ return {kcal:Math.round(n.kcal),protein:Math.round(n.protein*10)/10,carb:Math.round(n.carb*10)/10,fat:Math.round(n.fat*10)/10,fiber:Math.round(n.fiber*10)/10}; }
function scoreRecipe(combo, tpl, nut, ctx){ var sc=0; var gs=combo.map(function(i){return i.group;});
  if(gs.indexOf('protein')>=0) sc+=3; if(gs.indexOf('carb')>=0) sc+=2; if(gs.indexOf('vegetable')>=0) sc+=2;
  if(tpl.goalFit.indexOf(ctx.goal)>=0) sc+=3; if(tpl.mealFit.indexOf(ctx.meal)>=0) sc+=2;
  if(nut.kcal<=ctx.remaining) sc+=2; else sc-=2;
  if(nut.protein>=25) sc+=2; if(nut.protein>=40) sc+=1;
  var fatN=combo.filter(function(i){return i.group==='fat';}).length; if(fatN>1) sc-=2;
  var sauceN=combo.filter(function(i){return i.group==='sauce';}).length; if(sauceN>1) sc-=1;
  return sc;
}
function recipeName(combo, tpl){
  var p=combo.filter(function(i){return i.group==='protein';})[0]; var c=combo.filter(function(i){return i.group==='carb';})[0]; var v=combo.filter(function(i){return i.group==='vegetable';})[0];
  function nm(i){ return i?tFoodName(i.name):''; }
  if(tpl.id==='clean_plate') return (nm(c)+' '+nm(p)).trim()+(v?L(' + ','+ ')+nm(v):'');
  if(tpl.id==='low_cal') return nm(p)+' + '+nm(v);
  if(tpl.id==='breakfast_easy') return L('มื้อเช้า ','Breakfast ')+nm(p)+' + '+nm(c);
  if(tpl.id==='post_workout') return L('หลังซ้อม ','Post-workout ')+nm(p)+' + '+nm(c);
  if(tpl.id==='muscle_gain') return nm(c)+' '+nm(p);
  return combo.map(function(i){return nm(i);}).join(' + ');
}
function recipeTags(combo, tpl, ctx){ var tags=[]; var gs=combo.map(function(i){return i.group;});
  var nut=roundNut(calcNutrition(combo));
  if(nut.protein>=30) tags.push(L('โปรตีนสูง','High protein'));
  if(nut.kcal<=450) tags.push(L('แคลต่ำ','Low cal'));
  if(ctx.goal==='ลดไขมัน') tags.push(L('ลดไขมัน','Fat loss'));
  if(ctx.goal==='เพิ่มกล้าม') tags.push(L('เพิ่มกล้าม','Muscle'));
  if(gs.indexOf('vegetable')>=0) tags.push(L('มีผัก','With veg'));
  return tags.slice(0,4);
}
function generateRecipes(ings, ctx){
  ctx=ctx||{}; var goal=ctx.goal||goalLabel(); var meal=ctx.meal||currentMeal();
  var remaining=ctx.remaining|| (todayCtx().remaining||600);
  var cands=[]; var seenName={};
  TEMPLATES.forEach(function(tpl){ buildCombos(ings, tpl).forEach(function(combo){
    var nut=roundNut(calcNutrition(combo)); var sc=scoreRecipe(combo, tpl, nut, {goal:goal,meal:meal,remaining:remaining});
    if(sc<=0) return; var name=recipeName(combo,tpl); if(seenName[name]) return; seenName[name]=1;
    var rid='gen'+uid();
    cands.push({ id:rid, templateId:tpl.id, name:name, desc:tpl.desc, ingredients:combo.map(function(i){return {id:i.id,name:i.name,group:i.group,amount:i.selectedAmount||i.defaultAmount,kcal:i.kcal,protein:i.protein,fat:i.fat,carb:i.carb,fiber:i.fiber};}), nutrition:nut, score:sc, tags:recipeTags(combo,tpl,{goal:goal,meal:meal}) });
  }); });
  cands.sort(function(a,b){return b.score-a.score;});
  var top=cands.slice(0,5); top.forEach(function(r){ ST.recipeCache[r.id]=r; });
  return top;
}

/* ============================ context engine (local data) ============================ */
function todayCtx(){
  var u=curUser(); if(!u) return {empty:true};
  var d=todayDate(); var t={}; try{ t=window.target?window.target():{}; }catch(e){ t={}; }
  var s=S(); var logs=(s.logs||[]).filter(function(l){return l.user===u.id&&l.date===d;});
  var exs=(s.ex||[]).filter(function(x){return x.user===u.id&&x.date===d;});
  var eatenK=0,eatenP=0; logs.forEach(function(l){ var e=(l.eaten==null?1:l.eaten); eatenK+=num(l.fx&&l.fx[0])*e; eatenP+=num(l.fx&&l.fx[1])*e; });
  var burn=exs.reduce(function(a,x){return a+num(x.kcal);},0);
  var water=0; try{ water=num((s.water||{})[u.id+'|'+d]); }catch(e){}
  var streak=0; try{ streak=window.streakOf?window.streakOf():0; }catch(e){}
  var goalK=num(t.kcal)||2000;
  return { empty:false, goal:u.goal, goalKcal:goalK, eatenKcal:Math.round(eatenK), eatenProtein:Math.round(eatenP),
    burn:Math.round(burn), remaining:Math.max(0,Math.round(goalK-eatenK)), net:Math.round(eatenK-burn),
    targetProtein:num(t.prot), water:water, waterGoal:8, mealsLogged:logs.length, workoutsLogged:exs.length, streak:streak };
}
function resultCtx(){
  var u=curUser(); if(!u) return {empty:true}; var s=S();
  var body=(s.body||[]).filter(function(b){return b.user===u.id;}).slice().sort(function(a,b){return a.date<b.date?-1:1;});
  if(!body.length) return {empty:true};
  var monthPrefix=todayDate().slice(0,7);
  var month=body.filter(function(b){return (b.date||'').slice(0,7)===monthPrefix;});
  var set=month.length>=2?month:body.slice(-6);
  var first=set[0], last=set[set.length-1];
  function ch(k){ if(first[k]==null||last[k]==null) return null; return Math.round((last[k]-first[k])*10)/10; }
  return { empty:false, curWeight:last.w, weightChange:ch('w'), waistChange:ch('waist'), fatChange:ch('fat'), muscleChange:ch('mus'),
    goalWeight:(u.gw!=null?u.gw:null), streak:(function(){try{return window.streakOf?window.streakOf():0;}catch(e){return 0;}})() };
}
function coachCtx(){
  if(!consentCoach()) return {clients:0,follow:[],groups:0,groupNames:[],sentToday:0,denied:true};
  var s=S(); var clients=(s.users||[]).filter(function(u){return u.tr;});
  var today=todayDate();
  // last activity per client from saved notes (cnote) or homework cache
  var follow=[]; var cn=s.cnote||{};
  clients.forEach(function(c){
    var notes=cn[c.id]||[]; var last=notes.length?notes[0].d:null;
    var daysAgo=last?Math.round((Date.parse(today)-Date.parse(last))/86400000):null;
    follow.push({ name:c.name||'-', last:last, daysAgo:daysAgo });
  });
  follow.sort(function(a,b){ var da=(a.daysAgo==null?999:a.daysAgo), db=(b.daysAgo==null?999:b.daysAgo); return db-da; });
  var groups=(s.rooms||[]).filter(function(r){return !r.personal;});
  var pendingHw=0; try{ var hs=window._hwSubs||{}; for(var k in hs){ /* cached pending */ } }catch(e){}
  var sentToday=0; try{ sentToday=(s.planLog&&s.planLog[today])?Object.keys(s.planLog[today]).length:0; }catch(e){}
  return { clients:clients.length, follow:follow.slice(0,6), groups:groups.length, groupNames:groups.map(function(g){return g.name||'-';}).slice(0,5), sentToday:sentToday };
}

/* ============================ intent detection (TH + EN) ============================ */
var INTENT_KW = {
  today_summary:['สรุปวันนี้','วันนี้','เหลือกี่แคล','ต้องทำอะไร','แนะนำวันนี้','today','summary today','remaining','what should i'],
  ingredient_recipe_generate:['มีอะไร','มีวัตถุดิบ','ทำอะไรได้','จับคู่เมนู','สร้างเมนู','ของที่มี','ในตู้เย็น','เหลืออะไร','จัดเมนูจาก','ทำเมนู','what can i make','ingredient','from what i have','fridge','recipe from'],
  food_recommend:['กินอะไรดี','แนะนำเมนู','เมนูแนะนำ','แคลต่ำ','โปรตีนสูง','ลดไขมัน','what to eat','recommend menu','low cal','high protein','suggest food'],
  food_search:['หาอาหาร','ค้นหาเมนู','มีเมนู','search food','find menu'],
  result_summary:['ผลลัพธ์','น้ำหนัก','ลดไป','ความคืบหน้า','กราฟ','รอบเอว','result','progress','weight','waist','my result'],
  workout_recommend:['ออกกำลัง','ท่าฝึก','เล่นอะไร','เวท','คาร์ดิโอ','ดัมเบล','workout','exercise','train','cardio','weight training'],
  calc_plan:['คำนวณแคล','คำนวณโปรตีน','ตั้งแคล','ควรกินกี่แคล','แคลเท่าไร','โปรตีนเท่าไหร่','โปรตีนกี่กรัม','กี่กรัม','มาโคร','macro','tdee','bmr','bmi','calorie target','คำนวณมาโคร','ควรตั้งแคล'],
  coach_progress:['สรุปลูกเทรน','วิเคราะห์ลูกเทรน','ความคืบหน้าลูกเทรน','สรุปลูกเทรนวันนี้','ใครน่าห่วง','ใครเสี่ยงหลุด','ภาพรวมลูกเทรน','progress client','client risk','who is at risk','clients overview'],
  coach_followup:['ติดตามลูกเทรน','ลูกเทรนที่ต้องติดตาม','ใครยังไม่ส่ง','ใครหาย','คนที่ต้องติดตาม','follow up','who to follow','inactive client','who hasn'],
  coach_homework_summary:['สรุปการบ้าน','ตรวจการบ้าน','การบ้านค้าง','ส่งการบ้าน','homework','to review','pending homework'],
  coach_templates:['ข้อความสำเร็จรูป','เทมเพลตข้อความ','ขอข้อความ','ช่วยพิมพ์ข้อความ','พิมพ์ข้อความหาลูกเทรน','ข้อความหาลูกเทรน','message template','templates','draft message'],
  coach_feedback:['เขียน feedback','feedback','ฟีดแบ็ก','คอมเมนต์ลูกเทรน','ชมลูกเทรน','เขียนคำชม','write feedback','give feedback'],
  coach_group_summary:['สรุปกลุ่ม','กิจกรรมกลุ่ม','ภารกิจกลุ่ม','กลุ่มไหน','group summary','group activity','mission'],
  app_help:['ใช้งาน','ทำยังไง','สอน','วิธี','เข้ากลุ่ม','บันทึกอาหาร','how to','how do i','tutorial','guide'],
  setup_help:['ตั้งค่า iu mate','เปิดใช้งาน','โหลดชุดความรู้','setup','settings iu mate'],
  share_result_text:['ข้อความแชร์','แคปชั่น','result card','แชร์ผลลัพธ์','caption','share text','share result']
};
function detectIntent(message){
  var text=synNorm(message); var mode=role(); var tab=window.TAB||'';
  var best='unknown', bestScore=0;
  Object.keys(INTENT_KW).forEach(function(intent){
    var sc=0; INTENT_KW[intent].forEach(function(k){ if(text.indexOf(synNorm(k))>=0) sc+=2; });
    if(sc>0){
      if((tab==='food') && intent.indexOf('food')>=0) sc+=1;
      if((tab==='food') && intent==='ingredient_recipe_generate') sc+=1;
      if((tab==='body'||tab==='stats') && intent==='result_summary') sc+=1;
      if(mode==='coach' && intent.indexOf('coach')===0) sc+=2;
    }
    if(sc>bestScore){ bestScore=sc; best=intent; }
  });
  return bestScore>0?best:'unknown';
}

/* ============================ knowledge DB (bilingual) ============================ */
var KNOWLEDGE = [
  { id:'how_to_log_food', cat:'app_help', kw:['บันทึกอาหาร','เพิ่มอาหาร','ลงอาหาร','log food','add food'],
    title:L('วิธีบันทึกอาหาร','How to log food'),
    answer:L('ไปที่หน้าอาหาร เลือกมื้อที่ต้องการ ค้นหาเมนูจากคลังหรือเพิ่มเอง แล้วกดบันทึก','Go to Food, pick a meal, search the library or add your own, then save.'),
    actions:[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] },
  { id:'how_to_join_group', cat:'app_help', kw:['เข้ากลุ่ม','qr','สแกน','join group','scan'],
    title:L('วิธีเข้าเป็นลูกเทรน','How to join a coach'),
    answer:L('สแกน QR ของโค้ช แล้วยืนยันเข้าร่วมใน IUFIT จากนั้นจะรับแผนและส่งการบ้านได้','Scan your coach\'s QR and confirm in IUFIT — then you can receive plans and send homework.'),
    actions:[{label:L('เปิดหน้าโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_log_workout', cat:'app_help', kw:['บันทึกท่าฝึก','ออกกำลัง','log workout','add workout'],
    title:L('วิธีบันทึกการออกกำลังกาย','How to log a workout'),
    answer:L('ไปที่หน้าท่าฝึก กดบันทึก เลือกเวทเทรนนิ่งหรือคาร์ดิโอ แล้วใส่ค่าจากคลังท่า','Go to Workout, tap log, choose weight training or cardio, then fill from the move library.'),
    actions:[{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'}] },
  { id:'nutrition_weight_loss', cat:'nutrition', kw:['ลดน้ำหนัก','ลดไขมัน','แคล','fat loss','weight loss','calorie'],
    title:L('หลักการลดไขมันเบื้องต้น','Fat loss basics'),
    answer:L('ลดไขมันเน้นภาพรวมพลังงาน กินโปรตีนพอ ออกกำลังสม่ำเสมอ และติดตามผล ไม่ควรลดแคลมากเกินไป','Fat loss is about overall energy balance, enough protein, consistent training and tracking — don\'t cut calories too hard.'),
    actions:[{label:L('ดูสรุปวันนี้','Today summary'),action:'today_summary'}] },
  { id:'protein_basic', cat:'nutrition', kw:['โปรตีน','กินโปรตีนเท่าไหร่','protein','how much protein'],
    title:L('โปรตีนควรกินเท่าไหร่','How much protein'),
    answer:L('ทั่วไปราว 1.4–2.0 กรัมต่อน้ำหนักตัว 1 กก./วัน เพิ่มกล้ามใช้ค่าสูง ลดไขมันก็ควรกินโปรตีนให้พอเพื่อรักษากล้าม','Roughly 1.4–2.0 g per kg bodyweight/day. Higher when building muscle; keep it adequate during fat loss to preserve muscle.'),
    actions:[{label:L('สร้างเมนูโปรตีนสูง','High-protein menu'),action:'food_recommend'}] },
  { id:'coach_followup_tip', cat:'coach', kw:['วิธีติดตาม','ติดตามยังไง','ไม่ส่งการบ้าน','follow up'],
    title:L('การติดตามลูกเทรน','Following up with clients'),
    answer:L('ติดตามแบบให้กำลังใจ สั้น ชัด และใช้คำถามปลายปิด เช่น "วันนี้สะดวกบันทึกมื้อเย็นไหมครับ"','Keep follow-ups short, encouraging and specific, e.g. "Can you log dinner today?"'),
    actions:[{label:L('สร้างข้อความติดตาม','Draft follow-up'),action:'create_followup_message'}] },
  { id:'create_result_card', cat:'app_help', kw:['result card','การ์ดผลลัพธ์','แชร์ผล','share result'],
    title:L('สร้างการ์ดผลลัพธ์','Create a result card'),
    answer:L('ไปหน้าผลลัพธ์ แล้วกดสร้างการ์ดผลลัพธ์ เลือกแบบการ์ด ใส่รูป/ข้อมูล แล้วบันทึกหรือแชร์','Go to Results and create a result card — pick a template, add photo/data, then save or share.'),
    actions:[{label:L('เปิดผลลัพธ์','Open Results'),action:'go_result'}] },
  { id:'how_to_make_recipe', cat:'app_help', kw:['สร้างเมนูเอง','เพิ่มเมนู','custom recipe','create menu'], title:L('สร้างเมนูเอง','Create your own menu'), answer:L('หน้าอาหาร > เพิ่มเมนู ใส่ชื่อและวัตถุดิบจากคลัง ระบบคำนวณแคลให้ หรือให้ IU Mate สร้างจากวัตถุดิบที่มีก็ได้','On Food > add menu, enter a name and pick ingredients — calories are auto-calculated. Or let IU Mate build one from your ingredients.'), actions:[{label:L('สร้างจากของที่มี','From ingredients'),action:'open_ingredient_picker'}] },
  { id:'how_to_food_library', cat:'app_help', kw:['คลังเมนู','ค้นเมนู','food library','search menu'], title:L('ใช้คลังเมนู','Using the food library'), answer:L('หน้าอาหาร แตะช่องค้นหาแล้วพิมพ์ชื่อเมนู คลังมี 4,500+ เมนูพร้อมค่าโภชนาการ เลือกแล้วกดบันทึกลงมื้อ','On Food, tap search and type a menu name — 4,500+ menus with nutrition. Pick one and save it to a meal.'), actions:[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] },
  { id:'how_to_see_plan', cat:'app_help', kw:['ดูแผน','แผนจากโค้ช','my plan','coach plan'], title:L('ดูแผนจากโค้ช','See your coach plan'), answer:L('เมื่อโค้ชส่งแผนจะมีแจ้งเตือน เปิดหน้าโค้ชเพื่อดูแผนอาหาร/ฝึก/เป้าหมาย และทำตามได้เลย','When your coach sends a plan you get a notification — open the Coach page to view meal/workout/goal plans and follow them.'), actions:[{label:L('เปิดหน้าโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_submit_hw', cat:'app_help', kw:['ส่งการบ้าน','submit homework','send homework'], title:L('ส่งการบ้านให้โค้ช','Send homework to coach'), answer:L('บันทึกอาหาร/การฝึก/สัดส่วนตามปกติ ระบบจะส่งให้โค้ชเห็นในแท็บการบ้านของโค้ชอัตโนมัติ','Just log your food/workout/measurements as usual — it shows up in your coach Homework tab automatically.') },
  { id:'iu_mate_privacy', cat:'app_help', kw:['ความเป็นส่วนตัว','privacy','เก็บข้อมูล','ข้อมูลปลอดภัย'], title:L('ความเป็นส่วนตัวของ IU Mate','IU Mate privacy'), answer:L('IU Mate ทำงานในเครื่อง บทสนทนาไม่ถูกบันทึกหรือส่งออกนอกเครื่อง และอ่านข้อมูลในแอปเพื่อช่วยสรุปเท่านั้น เพิกถอนความยินยอมได้ที่ปุ่ม 🔒','IU Mate runs on-device — conversations are not saved or sent, and it only reads in-app data to summarize. Withdraw consent via the 🔒 button.'), actions:[{label:L('ดูความเป็นส่วนตัว','View privacy'),action:'show_privacy'}] },
  { id:'calorie_control', cat:'nutrition', kw:['คุมแคล','พลังงาน','calorie','deficit'], title:L('หลักการคุมแคลอรี','Calorie control basics'), answer:L('ลดไขมัน = ใช้พลังงานมากกว่ากินเล็กน้อยอย่างสม่ำเสมอ เน้นโปรตีนพอ ผักเยอะ คุมของทอด/น้ำตาล ไม่ต้องอดจนทรมาน','Fat loss = a small consistent calorie deficit. Keep protein adequate, veg high, limit fried food/sugar — no need to starve.'), actions:[{label:L('ดูสรุปวันนี้','Today summary'),action:'today_summary'}] },
  { id:'carb_timing', cat:'nutrition', kw:['คาร์บตอนไหน','กินคาร์บ','carb timing','คาร์บ'], title:L('คาร์บควรกินตอนไหน','When to eat carbs'), answer:L('กระจายคาร์บได้ทั้งวัน แต่ช่วงก่อน/หลังออกกำลังกายจะใช้พลังงานดี เลือกคาร์บเชิงซ้อน เช่น ข้าวกล้อง มันหวาน โอ๊ต','Spread carbs through the day, but around workouts they are used well. Prefer complex carbs like brown rice, sweet potato, oats.') },
  { id:'healthy_fat', cat:'nutrition', kw:['ไขมันดี','healthy fat','ไขมัน'], title:L('ไขมันดีคืออะไร','What are healthy fats'), answer:L('ไขมันดีมาจากอะโวคาโด ถั่ว งา ปลา น้ำมันมะกอก ช่วยฮอร์โมนและความอิ่ม กินพอดี ไม่ต้องกลัวไขมัน แต่คุมปริมาณ','Healthy fats come from avocado, nuts, seeds, fish, olive oil — good for hormones and satiety. Do not fear fat, just watch portions.') },
  { id:'water_importance', cat:'nutrition', kw:['ดื่มน้ำ','ทำไมต้องดื่มน้ำ','water','hydration'], title:L('ทำไมต้องดื่มน้ำ','Why drink water'), answer:L('น้ำช่วยเผาผลาญ ควบคุมความหิว และการฟื้นตัว ตั้งเป้า ~8 แก้ว/วัน จิบบ่อย ๆ ทั้งวัน','Water supports metabolism, appetite control and recovery. Aim for ~8 glasses/day, sipping throughout.'), actions:[{label:L('ดื่มน้ำ +1','Water +1'),action:'add_water',confirm:true,payload:{amount:1}}] },
  { id:'consistency', cat:'nutrition', kw:['บันทึกต่อเนื่อง','ทำไมต้องบันทึก','consistency','สม่ำเสมอ'], title:L('ทำไมต้องบันทึกต่อเนื่อง','Why log consistently'), answer:L('การบันทึกสม่ำเสมอทำให้เห็นแนวโน้มจริง ปรับแผนได้แม่น และสร้างวินัย เริ่มจากทำให้ครบทุกวันก่อน ผลจะตามมาเอง','Consistent logging reveals real trends, sharpens your plan and builds discipline. Aim for a full week first — results follow.') },
  { id:'beginner_start', cat:'workout', kw:['มือใหม่','เริ่มออกกำลัง','beginner','start workout'], title:L('มือใหม่ควรเริ่มยังไง','How beginners should start'), answer:L('เริ่ม 3 วัน/สัปดาห์ ผสมเวทพื้นฐานกับคาร์ดิโอเบา ๆ ท่าละ 2-3 เซ็ต เน้นฟอร์มถูกก่อนเพิ่มน้ำหนัก','Start 3 days/week mixing basic weights and light cardio, 2-3 sets per move. Master form before adding load.'), actions:[{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'}] },
  { id:'what_is_weight', cat:'workout', kw:['เวทคืออะไร','เวทเทรนนิ่ง','weight training','strength'], title:L('เวทเทรนนิ่งคืออะไร','What is weight training'), answer:L('การฝึกด้วยแรงต้าน (ดัมเบล บาร์เบล เครื่อง) เพื่อสร้างกล้ามและเผาผลาญ เหมาะทั้งลดไขมันและเพิ่มกล้าม','Resistance training (dumbbells, barbells, machines) to build muscle and boost metabolism — great for fat loss and muscle gain.') },
  { id:'cardio_amount', cat:'workout', kw:['คาร์ดิโอแค่ไหน','คาร์ดิโอเท่าไหร่','how much cardio'], title:L('คาร์ดิโอควรทำแค่ไหน','How much cardio'), answer:L('ทั่วไป 150 นาที/สัปดาห์ของคาร์ดิโอปานกลาง หรือ 20-30 นาทีต่อครั้ง สลับกับเวท ไม่ต้องมากจนล้า','Around 150 min/week of moderate cardio, or 20-30 min per session alternating with weights — no need to overdo it.') },
  { id:'recovery', cat:'workout', kw:['พักฟื้น','พักผ่อน','recovery','rest day'], title:L('การพักฟื้นสำคัญแค่ไหน','Why recovery matters'), answer:L('กล้ามโตตอนพัก ไม่ใช่ตอนฝึก นอนให้พอ 7-8 ชม. มีวันพัก และกินโปรตีนพอ เพื่อให้ฟื้นตัวและไปต่อได้','Muscle grows during rest, not training. Sleep 7-8h, take rest days, eat enough protein to recover and keep going.') },
  { id:'new_client', cat:'coach', kw:['ลูกเทรนใหม่','เริ่มลูกเทรน','new client','onboard client'], title:L('ลูกเทรนใหม่ควรเริ่มยังไง','Starting a new client'), answer:L('เริ่มจากเก็บข้อมูลพื้นฐานและเป้าหมาย ตั้งแผนง่าย ๆ ที่ทำได้จริง แล้วชวนบันทึก 3-5 วันแรกให้ติดเป็นนิสัย','Start by gathering basics and goals, set a simple realistic plan, then nudge them to log for the first 3-5 days to build the habit.'), actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] },
  { id:'weight_stall', cat:'coach', kw:['น้ำหนักไม่ลง','ตันน้ำหนัก','weight stall','plateau'], title:L('ลูกเทรนน้ำหนักไม่ลงดูอะไร','Client weight not dropping'), answer:L('เช็กความสม่ำเสมอของการบันทึก ปริมาณจริงที่กิน การนอน ความเครียด และน้ำ บางครั้งรอบเอวลดแม้น้ำหนักนิ่ง ใช้หลายตัวชี้วัด','Check logging consistency, true intake, sleep, stress and water. Sometimes waist drops even when weight stalls — use multiple metrics.') },
  { id:'quiet_group', cat:'coach', kw:['กลุ่มเงียบ','กระตุ้นกลุ่ม','quiet group','group engagement'], title:L('กลุ่มเงียบควรทำอะไร','Re-engaging a quiet group'), answer:L('ตั้งภารกิจกลุ่มสั้น ๆ ที่ทำง่าย ชวนแชร์ผลรายสัปดาห์ หรือถามคำถามเปิดในแชทกลุ่ม สร้างจังหวะให้คนกลับมามีส่วนร่วม','Set a short easy group mission, invite weekly result sharing, or ask an open question in group chat to bring people back.'), actions:[{label:L('สร้างภารกิจกลุ่ม','New mission'),action:'go_missions'}] },
  { id:'when_followup', cat:'coach', kw:['ติดตามเมื่อไร','ควรทักเมื่อไหร่','when to follow up'], title:L('ควรติดตามลูกเทรนเมื่อไร','When to follow up'), answer:L('ทักเมื่อขาดบันทึก 2-3 วัน หรือมีการบ้านค้าง ใช้ข้อความสั้น ให้กำลังใจ และถามแบบตอบง่าย อย่ารอจนหลุดแผนไปไกล','Reach out after 2-3 missed log days or pending homework. Keep it short, encouraging and easy to answer — do not wait until they have fully dropped off.'), actions:[{label:L('สร้างข้อความติดตาม','Draft follow-up'),action:'create_followup_message'}] }
];
function searchKnowledge(message){
  var t=synNorm(message);
  return KNOWLEDGE.map(function(item){ var sc=0; item.kw.forEach(function(k){ if(t.indexOf(synNorm(k))>=0) sc+=2; }); if(t.indexOf(synNorm(item.title))>=0) sc+=3; return {item:item,score:sc}; })
    .filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score;}).slice(0,3).map(function(x){return x.item;});
}

/* ============================ reply builders ============================ */
var MED_KW=['วินิจฉัย','เป็นโรค','โรคประจำ','กินยา','หยุดยา','ฉีดยา','ยารักษา','ยาอะไร','กินยาอะไร','diagnos','disease','medicine','medication','prescription','เบาหวาน','ความดัน','มะเร็ง','ซึมเศร้า','depress'];
function isMedical(message){ var t=synNorm(message); return MED_KW.some(function(k){return t.indexOf(synNorm(k))>=0;}); }
function disclaimer(){ return L('คำแนะนำจาก IU Mate ใช้เพื่อช่วยวางแผนสุขภาพและการออกกำลังกายทั่วไป ไม่ใช่คำวินิจฉัยหรือคำแนะนำทางการแพทย์','IU Mate gives general fitness/nutrition guidance only — not medical diagnosis or advice.'); }

function buildReply(intent, message){
  if(isMedical(message)) return { title:L('เรื่องนี้ควรปรึกษาผู้เชี่ยวชาญ','Please consult a professional'),
    message:L('เรื่องนี้ควรปรึกษาแพทย์หรือผู้เชี่ยวชาญโดยตรงนะครับ IU Mate ช่วยเรื่องการบันทึกอาหาร การฝึก และการติดตามผลทั่วไปได้','This is best discussed with a doctor or specialist. IU Mate can help with logging food, training and general tracking.') };
  var ql=(''+message).toLowerCase();
  if(/ยังไง|ยังงัย|อย่างไร|คืออะไร|แค่ไหน|เท่าไห|เท่าไร|ทำไม|ทำไง|ดูอะไร|how |what |why /.test(ql) && intent!=='ingredient_recipe_generate' && intent!=='today_summary' && intent!=='calc_plan'){ var _kh=searchKnowledge(message); if(_kh.length) return buildKnowledge(message); }
  switch(intent){
    case 'today_summary': return buildToday();
    case 'food_recommend': return buildFoodRecommend(message);
    case 'food_search': return buildFoodSearch(message);
    case 'result_summary': return buildResult();
    case 'workout_recommend': return buildWorkout();
    case 'calc_plan': return buildCalcPlan(message);
    case 'ingredient_recipe_generate': return buildRecipeReply(message);
    case 'coach_progress': return buildCoachProgress();
    case 'coach_followup': return buildCoachFollowup();
    case 'coach_homework_summary': return buildCoachHomework();
    case 'coach_templates': return buildCoachTemplates();
    case 'coach_feedback': return buildCoachFeedback();
    case 'coach_group_summary': return buildCoachGroup();
    case 'app_help': return buildKnowledge(message);
    case 'setup_help': return buildKnowledge(message);
    case 'share_result_text': return buildShareText();
    default: return buildKnowledge(message);
  }
}
function buildToday(){
  var c=todayCtx();
  if(c.empty) return { title:L('ยังไม่มีข้อมูลวันนี้','No data yet'), message:L('ยังไม่มีข้อมูลพอสำหรับสรุปวันนี้ ลองบันทึกอาหารหรือผลลัพธ์ก่อนนะครับ','Not enough data yet — try logging some food or results first.'),
    actions:[{label:L('บันทึกอาหาร','Log food'),action:'go_food'}] };
  var lines=[];
  lines.push(L('วันนี้กินไป '+fmtN(c.eatenKcal)+' kcal เหลือประมาณ '+fmtN(c.remaining)+' kcal','Eaten '+fmtN(c.eatenKcal)+' kcal today, about '+fmtN(c.remaining)+' kcal left'));
  if(c.eatenProtein) lines.push(L('โปรตีน '+c.eatenProtein+' g','Protein '+c.eatenProtein+' g'));
  if(c.streak>=2) lines.push(L('สตรีคต่อเนื่อง '+c.streak+' วัน 🔥','Streak '+c.streak+' days 🔥'));
  var todo=[];
  if(c.water<c.waterGoal) todo.push(L('ดื่มน้ำเพิ่มอีก '+(c.waterGoal-c.water)+' แก้ว','Drink '+(c.waterGoal-c.water)+' more glasses of water'));
  if(c.mealsLogged<3) todo.push(L('บันทึกมื้อถัดไป','Log your next meal'));
  if(c.workoutsLogged===0) todo.push(L('ถ้ามีเวลา ลองบันทึกการฝึก 20–30 นาที','If you have time, log a 20–30 min workout'));
  var msg=lines.join('\n');
  if(todo.length) msg+='\n\n'+L('สิ่งที่ควรทำต่อ:','Next steps:')+'\n'+todo.map(function(t,i){return (i+1)+'. '+t;}).join('\n');
  return { title:L('สรุปวันนี้','Today summary'), message:msg, actions:[
    {label:L('บันทึกอาหาร','Log food'),action:'go_food'},
    {label:L('ดื่มน้ำ +1','Water +1'),action:'add_water',confirm:true,payload:{amount:1}},
    {label:L('เปิดท่าฝึก','Open workout'),action:'go_workout'}
  ] };
}
function buildFoodRecommend(message){
  if(!ingDbOk()) return cantCalcReply();
  // reuse the recipe engine with a sensible staple pantry from real ING
  var picks=popularIngredients();
  var byGroup=groupBy(picks);
  var pantry=[];
  ['protein','carb','vegetable'].forEach(function(g){ (byGroup[g]||[]).slice(0,2).forEach(function(i){ pantry.push(i); }); });
  var recipes=generateRecipes(pantry, { goal:goalLabel(), meal:currentMeal() });
  if(!recipes.length) return buildKnowledge(message);
  return { title:L('เมนูที่เหมาะกับวันนี้','Menus that fit today'),
    message:L('เพราะเป้าหมายของคุณคือ "'+goalLabel()+'" ผมเลือกเมนูที่คำนวณแคลจากคลังวัตถุดิบให้ครับ','Based on your goal "'+goalLabel()+'", here are menus with calories computed from the ingredient library:'),
    recipes:recipes.slice(0,3),
    actions:[{label:L('สร้างจากของที่มี','From my ingredients'),action:'open_ingredient_picker'},{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] };
}
function buildFoodSearch(message){
  return { title:L('ค้นหาเมนู','Search menus'),
    message:L('เปิดหน้าอาหารแล้วพิมพ์ชื่อเมนูในช่องค้นหาได้เลย คลังมีกว่า 4,500 เมนูพร้อมค่าโภชนาการ','Open Food and type a menu name in search — the library has 4,500+ menus with nutrition.'),
    actions:[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'},{label:L('สร้างเมนูจากของที่มี','Make from ingredients'),action:'open_ingredient_picker'}] };
}
function buildResult(){
  var r=resultCtx();
  if(r.empty) return { title:L('ยังไม่มีข้อมูลผลลัพธ์','No results yet'), message:L('ยังไม่มีข้อมูลร่างกายพอ ลองบันทึกน้ำหนัก/สัดส่วนที่หน้าผลลัพธ์ก่อนนะครับ','Not enough body data — log weight/measurements on the Results page first.'),
    actions:[{label:L('เปิดผลลัพธ์','Open Results'),action:'go_result'}] };
  var lines=[];
  if(r.weightChange!=null) lines.push(L('น้ำหนักเปลี่ยน '+(r.weightChange>0?'+':'')+r.weightChange+' กก.','Weight change '+(r.weightChange>0?'+':'')+r.weightChange+' kg'));
  if(r.waistChange!=null) lines.push(L('รอบเอวเปลี่ยน '+(r.waistChange>0?'+':'')+r.waistChange+' ซม.','Waist change '+(r.waistChange>0?'+':'')+r.waistChange+' cm'));
  if(r.muscleChange!=null) lines.push(L('กล้ามเนื้อเปลี่ยน '+(r.muscleChange>0?'+':'')+r.muscleChange+' %','Muscle change '+(r.muscleChange>0?'+':'')+r.muscleChange+' %'));
  if(r.streak>=2) lines.push(L('สตรีคต่อเนื่อง '+r.streak+' วัน','Streak '+r.streak+' days'));
  if(!lines.length) lines.push(L('เริ่มมีข้อมูลแล้ว บันทึกต่อเนื่องเพื่อเห็นแนวโน้มชัดขึ้น','Data is starting to build — keep logging to see clearer trends.'));
  var msg=lines.join('\n')+'\n\n'+L('สรุป: รักษาความสม่ำเสมอต่อไป ผลลัพธ์กำลังมา','Summary: keep it consistent — progress is coming.');
  return { title:L('สรุปผลลัพธ์','Result summary'), message:msg, actions:[
    {label:L('สร้าง Result Card','Create result card'),action:'go_result'},
    {label:L('ข้อความแชร์ผล','Share caption'),action:'share_result_text'}
  ] };
}
function buildWorkout(){
  return { title:L('แนะนำการฝึกวันนี้','Workout idea'),
    message:L('ถ้ายังไม่ได้ฝึกวันนี้ ลองเริ่มจาก 20–30 นาที สลับเวทเทรนนิ่งกับคาร์ดิโอเบา ๆ แล้วบันทึกที่หน้าท่าฝึกเพื่อให้สตรีคต่อเนื่อง','If you haven\'t trained today, start with 20–30 min mixing weight training and light cardio, then log it on the Workout page to keep your streak.'),
    actions:[{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'}] };
}
function coachDeniedReply(){ return { title:L('ต้องเปิดสิทธิ์ข้อมูลโค้ชก่อน','Enable coach data first'), message:L('IU Mate ยังไม่ได้รับอนุญาตให้ใช้ข้อมูลลูกเทรน/กลุ่มในเครื่อง เปิดสิทธิ์ได้ที่ปุ่ม 🔒 ด้านบน','IU Mate isn\'t allowed to use local client/group data yet. Enable it via the 🔒 button at the top.') }; }
/* ---- coach progress + risk scoring (from local cnote: {d,k,p,wt}) ---- */
function analyzeClient(c){
  var cn=(S().cnote||{})[c.id]||[]; var today=todayDate();
  function days(d){ return Math.round((Date.parse(today)-Date.parse(d))/86400000); }
  var last=cn.length?cn[0].d:null; var daysAgo=last?days(last):null;
  var win=cn.filter(function(e){ return days(e.d)<=14; });
  var compliance=Math.round(Math.min(win.length,14)/14*100);
  var wts=cn.filter(function(e){ return e.wt>0; });
  var latestW=wts.length?wts[0].wt:null;
  var wChange=wts.length>=2?Math.round((wts[0].wt-wts[wts.length-1].wt)*10)/10:null;
  var recentW=wts.filter(function(e){ return days(e.d)<=21; }).map(function(e){ return e.wt; });
  var stall=recentW.length>=3 && (Math.max.apply(null,recentW)-Math.min.apply(null,recentW))<=0.5;
  var pTarget=latestW?latestW*1.6:null;
  var pMiss=pTarget?win.filter(function(e){ return (e.p||0)<pTarget*0.8; }).length:0;
  var score=0, reasons=[];
  if(daysAgo==null){ score+=2; reasons.push(L('ยังไม่มีบันทึก','no records')); }
  else if(daysAgo>=3){ score+=3; reasons.push(L('ไม่ส่งบันทึก '+daysAgo+' วัน','no log '+daysAgo+'d')); }
  else if(daysAgo>=2){ score+=1; reasons.push(L('ค้าง '+daysAgo+' วัน','idle '+daysAgo+'d')); }
  if(stall && compliance>=70){ score+=3; reasons.push(L('น้ำหนักนิ่งแต่ทำตามดี','stalled but compliant')); }
  if(pTarget && pMiss>=4){ score+=2; reasons.push(L('โปรตีนไม่ถึง '+pMiss+' วัน','protein low '+pMiss+'d')); }
  if(daysAgo!=null && daysAgo<=1 && compliance>=80 && !stall){ score-=2; reasons.push(L('ทำได้ดีสม่ำเสมอ','on track')); }
  return { name:c.name||'-', daysAgo:daysAgo, compliance:compliance, latestW:latestW, wChange:wChange, stall:stall, pMiss:pMiss, score:score, reasons:reasons };
}
function buildCoachProgress(){
  if(!consentCoach()) return coachDeniedReply();
  var clients=(S().users||[]).filter(function(u){ return u.tr; });
  if(!clients.length) return { title:L('ยังไม่มีลูกเทรน','No clients yet'), message:L('ยังไม่มีลูกเทรน แชร์ QR โค้ชให้สแกนเข้ามาก่อนนะครับ','No clients yet — share your Coach QR.'), actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] };
  var rows=clients.map(analyzeClient).sort(function(a,b){ return b.score-a.score; });
  var risky=rows.filter(function(r){ return r.score>=2; });
  var msg=L('สรุป: ดูแลลูกเทรน '+clients.length+' คน','Summary: '+clients.length+' clients');
  if(risky.length){ msg+='\n\n'+L('ควรดูก่อน:','Watch first:')+'\n'+risky.slice(0,5).map(function(r,i){ return (i+1)+'. '+r.name+' — '+(r.reasons[0]||'')+(r.score>0?' ('+L('เสี่ยง','risk')+' '+r.score+')':''); }).join('\n'); }
  else msg+='\n\n'+L('ภาพรวมดี ไม่มีใครเสี่ยงหลุดจากข้อมูลในเครื่อง','All good — no high-risk clients from local data.');
  var planIssue=rows.filter(function(r){ return r.stall && r.compliance>=70; });
  var compIssue=rows.filter(function(r){ return r.compliance<70 && r.daysAgo!=null; });
  var ins=[];
  if(planIssue.length) ins.push(L(planIssue.length+' คนทำตามดีแต่ผลนิ่ง → พิจารณาปรับแคล/คาร์ดิโอ/โวลุ่ม',planIssue.length+' compliant but stalled → consider adjusting calories/cardio/volume'));
  if(compIssue.length) ins.push(L(compIssue.length+' คน compliance ต่ำ → แก้ความสม่ำเสมอก่อนปรับแผน',compIssue.length+' low compliance → fix consistency before changing the plan'));
  if(ins.length) msg+='\n\n'+L('ข้อสังเกต:','Insight:')+'\n'+ins.map(function(x){ return '• '+x; }).join('\n');
  msg+='\n\n'+L('ทำต่อ: ติดตามคนเสี่ยงสูงก่อน แล้วชมคนที่ทำได้ดี','Next: follow up the highest-risk first, then praise those on track');
  return { title:L('สรุปลูกเทรนวันนี้','Clients overview'), message:msg,
    disclaimer:L('อิงข้อมูลในเครื่อง (การบ้านที่ตรวจแล้ว) อาจไม่รวมกิจกรรมล่าสุด — เป็นค่าประมาณเพื่อช่วยจัดลำดับ ไม่ใช่คำตัดสิน','Based on local saved data; may miss latest activity — estimates to help prioritize, not verdicts'),
    actions:[{label:L('เขียนข้อความติดตาม','Draft follow-up'),action:'create_followup_message'},{label:L('เปิดหน้าลูกเทรน','Clients'),action:'go_clients'},{label:L('เขียน feedback','Feedback'),action:'create_feedback'}] };
}
function buildCoachFollowup(){
  if(!consentCoach()) return coachDeniedReply();
  var clients=(S().users||[]).filter(function(u){ return u.tr; });
  if(!clients.length) return { title:L('ยังไม่มีลูกเทรน','No clients yet'), message:L('ยังไม่มีลูกเทรน แชร์ QR โค้ชให้สแกนเข้ามาก่อนนะครับ','No clients yet — share your Coach QR for them to scan.'),
    actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] };
  var rows=clients.map(analyzeClient).filter(function(r){ return r.score>=2; }).sort(function(a,b){ return b.score-a.score; });
  var msg;
  if(!rows.length){ msg=L('เยี่ยม! ตอนนี้ยังไม่มีใครเสี่ยงหลุดจากข้อมูลในเครื่อง','Great — no one is at risk based on local data.'); }
  else{ msg=L('ลูกเทรนที่ควรติดตามก่อน (เรียงตามความเสี่ยง):','Clients to follow up first (by risk):')+'\n'+
    rows.slice(0,5).map(function(r,i){ return (i+1)+'. '+r.name+' — '+r.reasons.slice(0,2).join(', '); }).join('\n'); }
  return { title:L('ลูกเทรนที่ต้องติดตาม','Clients to follow up'), message:msg, disclaimer:L('อิงข้อมูลที่บันทึกในเครื่อง อาจไม่รวมกิจกรรมล่าสุดที่ยังไม่ซิงก์ — เป็นค่าประมาณเพื่อจัดลำดับ','Based on local data; may miss latest activity — estimates to prioritize.'), actions:[
    {label:L('เขียนข้อความติดตาม','Draft follow-up'),action:'create_followup_message'},
    {label:L('สรุปภาพรวมลูกเทรน','Overview'),action:'_chip',payload:{q:L('สรุปลูกเทรน','clients overview')}},
    {label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}
  ] };
}
function buildCoachHomework(){
  return { title:L('สรุปการบ้าน','Homework summary'),
    message:L('เปิดแท็บการบ้านเพื่อดูการบ้านที่รอตรวจ เปิดดูแล้วกดบันทึกลงโปรไฟล์ลูกเทรนเพื่อย้ายไป "ตรวจแล้ว"','Open the Homework tab to see items to review — view then save to the client profile to move them to "Reviewed".'),
    actions:[{label:L('เปิดการบ้าน','Open Homework'),action:'go_homework'},{label:L('เขียน feedback','Write feedback'),action:'create_feedback'}] };
}
/* ---- coach communication templates (11) — data-driven, {name}=client ---- */
var MSG_TEMPLATES=[
  {id:'welcome', label:L('ทักลูกเทรนใหม่','Welcome new client'),
    th:'สวัสดีครับ {name} ยินดีต้อนรับเข้าโปรแกรม! เริ่มจากบันทึกอาหารและน้ำหนัก 3-5 วันแรกให้ครบนะครับ มีอะไรสงสัยถามโค้ชได้ตลอด เดี๋ยวเราค่อย ๆ ปรับให้เข้ากับไลฟ์สไตล์ของคุณ 💪',
    en:'Hi {name}, welcome to the program! Start by logging your meals and weight for the first 3-5 days. Ask me anything anytime — we will fine-tune everything to fit your lifestyle 💪'},
  {id:'follow_nohw', label:L('ติดตามคนไม่ส่งการบ้าน','Follow up (no homework)'),
    th:'สวัสดีครับ {name} ช่วงนี้ติดอะไรตรงไหนไหมครับ? วันนี้สะดวกบันทึกมื้ออาหารหรือส่งการบ้านไหมครับ ส่งมาได้เลย เดี๋ยวโค้ชช่วยดูให้ 🙌',
    en:'Hi {name}, anything getting in the way lately? Can you log a meal or send homework today? Just send it over and I will take a look 🙌'},
  {id:'praise', label:L('ชมคนทำดี','Praise'),
    th:'เยี่ยมมากครับ {name}! ทำได้สม่ำเสมอแบบนี้เห็นผลแน่นอน รักษาจังหวะนี้ไว้นะครับ ภูมิใจในตัวคุณ 👏',
    en:'Awesome, {name}! Staying this consistent will absolutely show results. Keep the rhythm going — proud of you 👏'},
  {id:'comfort', label:L('ปลอบคนหลุดแผน','Re-engage'),
    th:'ไม่เป็นไรเลยครับ {name} ทุกคนมีช่วงที่ชีวิตวุ่นได้ ไม่ต้องโทษตัวเอง กลับมาเริ่มใหม่จากบันทึกอาหารแค่ 1 มื้อวันนี้ก่อนก็พอ เดี๋ยวเราไปต่อด้วยกัน 🤝',
    en:'No worries at all, {name} — everyone has busy stretches, no need to blame yourself. Just restart with logging one meal today. We will pick it back up together 🤝'},
  {id:'adjust', label:L('ปรับแผนไม่ให้รู้สึกผิด','Adjust plan (gentle)'),
    th:'{name} ครับ จากที่ดูข้อมูล โค้ชขอปรับแผนนิดหน่อยให้เหมาะกับคุณมากขึ้น ไม่ใช่เพราะทำได้ไม่ดีนะครับ แต่เพื่อให้ก้าวต่อได้ลื่นขึ้น ลองทำตามแบบใหม่ 1 สัปดาห์แล้วบอกโค้ชว่าเป็นยังไงครับ',
    en:'{name}, looking at your data I would like to tweak the plan a little to fit you better — not because you did anything wrong, but to keep progress smooth. Try the new version for a week and let me know how it feels.'},
  {id:'request', label:L('ขอน้ำหนัก/รูป/รอบเอว','Request data'),
    th:'รบกวน {name} ส่งน้ำหนักล่าสุด + รอบเอว (และรูปถ้าสะดวก) ให้โค้ชหน่อยนะครับ จะได้ดูแนวโน้มและปรับแผนให้แม่นขึ้น ขอบคุณครับ 🙏',
    en:'Could you send me your latest weight + waist (and a photo if you are comfortable), {name}? It helps me track the trend and fine-tune your plan. Thank you 🙏'},
  {id:'weekly', label:L('สรุปรายสัปดาห์','Weekly summary'),
    th:'สรุปสัปดาห์นี้ของ {name} ครับ 👏 ความสม่ำเสมอโอเค สิ่งที่อยากให้โฟกัสสัปดาห์หน้าคือ [จุดที่ต้องปรับ] ทำต่อแบบนี้เราไปได้สวยแน่นอนครับ',
    en:'Here is your week recap, {name} 👏 Consistency looks good. Next week, let us focus on [area to improve]. Keep this up and we are on a great track.'},
  {id:'group_mission', label:L('แจ้งภารกิจกลุ่ม','Group mission'),
    th:'ประกาศภารกิจกลุ่มสัปดาห์นี้ 🎯 บันทึกอาหารอย่างน้อย 2 มื้อ/วัน + ดื่มน้ำให้ถึงเป้า 3 วัน ใครทำครบมาแชร์ในกลุ่มได้เลย มาลุยด้วยกันนะครับทุกคน 💪',
    en:'This week group mission 🎯 Log at least 2 meals/day + hit your water goal for 3 days. Share when you complete it. Let us go, team 💪'},
  {id:'quiet_group', label:L('กระตุ้นกลุ่มเงียบ','Re-engage group'),
    th:'ทักหน่อยครับชาวกลุ่ม 👋 ช่วงนี้เป็นยังไงกันบ้าง? ใครมีคำถามหรืออยากให้โค้ชช่วยปรับอะไรพิมพ์มาได้เลย มาแชร์ผลสัปดาห์นี้กันหน่อยครับ',
    en:'Hey team 👋 How is everyone doing? Any questions or things you want me to adjust — drop them here. Let us share this week wins!'},
  {id:'tired', label:L('ตอบคนบ่นเหนื่อย','Reply: tired'),
    th:'เข้าใจเลยครับ {name} เหนื่อยได้เป็นเรื่องปกติ ลองพักให้พอ นอนให้ครบ แล้ววันนี้ทำแค่เบา ๆ ก็พอ ไม่ต้องฝืน ค่อย ๆ ไปครับ สุขภาพระยะยาวสำคัญกว่าความเร็ว 🌱',
    en:'Totally understand, {name} — feeling tired is normal. Rest enough, sleep well, and keep today light. No need to push. Long-term health matters more than speed 🌱'},
  {id:'weight_stall', label:L('ตอบคนน้ำหนักไม่ลง','Reply: weight stall'),
    th:'{name} ครับ น้ำหนักนิ่งช่วงนี้เป็นเรื่องปกติของการลดไขมัน อย่าเพิ่งท้อนะครับ ขอดูบันทึกอาหาร 3-4 วันกับการนอน/น้ำ แล้วโค้ชจะช่วยปรับให้ บางทีรอบเอวลดแม้น้ำหนักยังไม่ขยับครับ',
    en:'{name}, a weight stall is a normal part of fat loss — do not get discouraged. Send me 3-4 days of food logs plus sleep/water and I will help adjust. Sometimes the waist drops even when the scale does not.'}
];
function topClientName(){ try{ var cs=(S().users||[]).filter(function(u){return u.tr;}); if(!cs.length) return L('ลูกเทรน','your client'); var r=cs.map(analyzeClient).sort(function(a,b){return b.score-a.score;})[0]; return (r&&r.name)||cs[0].name||L('ลูกเทรน','your client'); }catch(e){ return L('ลูกเทรน','your client'); } }
function buildCoachTemplates(){
  if(!consentCoach()) return coachDeniedReply();
  return { title:L('ข้อความสำเร็จรูปสำหรับโค้ช','Coach message templates'),
    message:L('เลือกแบบข้อความ IU Mate จะร่างให้ (เติมชื่อลูกเทรนอัตโนมัติ) แล้วคัดลอกไปปรับต่อได้ครับ','Pick a message type — IU Mate drafts it (auto-fills the client name) for you to copy and tweak.'),
    actions: MSG_TEMPLATES.map(function(t){ return {label:t.label, action:'msg_tpl', payload:{id:t.id}}; }) };
}
function buildCoachFeedback(){
  var c=coachCtx(); if(c.denied) return coachDeniedReply();
  var name=(c.follow&&c.follow[0]&&c.follow[0].name)||L('ลูกเทรน','your client');
  var tpl=L('ทำได้ดีมากครับ '+name+'! เห็นความตั้งใจชัดเจน จุดที่อยากให้โฟกัสต่อคือความสม่ำเสมอของมื้ออาหารและการพักผ่อน สัปดาห์หน้าลองทำให้ครบทุกวันนะครับ เป็นกำลังใจให้ 👏','Great work, '+name+'! Your effort really shows. Next, focus on meal consistency and recovery — aim for a full week. Keep it up 👏');
  return { title:L('ข้อความ feedback','Feedback message'), message:tpl, disclaimer:L('ปรับชื่อ/รายละเอียดให้ตรงลูกเทรนก่อนส่งได้เลย','Edit the name/details to fit your client before sending'), actions:[{label:L('คัดลอกข้อความ','Copy text'),action:'copy_text',payload:{text:tpl}},{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] };
}
function buildCoachGroup(){
  var c=coachCtx(); if(c.denied) return coachDeniedReply();
  var msg=c.groups?L('คุณมี '+c.groups+' กลุ่ม: '+c.groupNames.join(', '),'You have '+c.groups+' groups: '+c.groupNames.join(', ')):L('ยังไม่มีกลุ่ม สร้างกลุ่มเพื่อส่งภารกิจและแชทรวมได้','No groups yet — create one to send missions and group chat.');
  if(c.sentToday) msg+='\n'+L('วันนี้ส่งแผนไปแล้ว '+c.sentToday+' รายการ','Sent '+c.sentToday+' plans today.');
  return { title:L('สรุปกลุ่ม','Group summary'), message:msg, actions:[{label:L('เปิดหน้ากลุ่ม','Open Groups'),action:'go_groups'},{label:L('สร้างภารกิจกลุ่ม','New mission'),action:'go_missions'}] };
}
function buildKnowledge(message){
  var hits=searchKnowledge(message);
  if(!hits.length) return buildFallback(message);
  var top=hits[0];
  return { title:top.title, message:top.answer, actions:(top.actions||[]).slice(), more:hits.slice(1).map(function(h){return {title:h.title,answer:h.answer};}) };
}
function buildShareText(){
  var r=resultCtx(); var t=todayCtx();
  var parts=[L('เดือนนี้ฉันกำลังสร้างเวอร์ชันที่ดีขึ้นของตัวเอง 💪','Building a better version of myself this month 💪')];
  if(!r.empty && r.weightChange!=null) parts.push(L('น้ำหนักเปลี่ยน '+r.weightChange+' กก.','Weight change '+r.weightChange+' kg'));
  if(!t.empty && t.streak>=2) parts.push(L('ทำต่อเนื่อง '+t.streak+' วัน','On a '+t.streak+'-day streak'));
  parts.push(L('บันทึกและติดตามผลกับ IUFIT','Tracked with IUFIT'));
  var caption=parts.join('\n');
  return { title:L('ข้อความสำหรับแชร์ผลลัพธ์','Share caption'), message:caption, actions:[
    {label:L('คัดลอกข้อความ','Copy text'),action:'copy_text',payload:{text:caption}},
    {label:L('สร้าง Result Card','Create result card'),action:'go_result'}
  ] };
}
function buildRecipeReply(message){
  if(!ingDbOk()) return cantCalcReply();
  var ings=findIngredientsInText(message);
  if(!ings.length) return { title:L('สร้างเมนูจากวัตถุดิบ','Make a menu from ingredients'),
    message:L('ลองพิมพ์วัตถุดิบที่มี เช่น "มีอกไก่ ไข่ ข้าวกล้อง" หรือเลือกจากรายการด้านล่าง','Type the ingredients you have, e.g. "chicken breast, egg, brown rice", or pick from the list below.'),
    actions:[{label:L('เลือกวัตถุดิบ','Pick ingredients'),action:'open_ingredient_picker'},{label:L('ดูวัตถุดิบยอดนิยม','Popular ingredients'),action:'open_ingredient_picker'}] };
  var recipes=generateRecipes(ings, { goal:goalLabel(), meal:currentMeal() });
  if(!recipes.length) return { title:L('ยังจับคู่เมนูไม่ได้','Couldn\'t build a menu yet'),
    message:L('วัตถุดิบที่มีอาจยังไม่ครบ ลองเพิ่มแหล่งโปรตีน คาร์บ หรือผักอีกอย่างครับ','Ingredients may be incomplete — try adding a protein, carb or vegetable.'),
    actions:[{label:L('เพิ่มวัตถุดิบ','Add ingredients'),action:'open_ingredient_picker'},{label:L('ดูเมนูในคลัง','Browse menus'),action:'go_food'}] };
  return { title:L('เมนูที่ IU Mate จัดให้','Menus IU Mate built'),
    message:L('ผมจับคู่วัตถุดิบที่คุณมีให้แล้ว ได้ '+recipes.length+' เมนูที่เหมาะกับวันนี้','I matched your ingredients into '+recipes.length+' menus that fit today:'),
    recipes:recipes, actions:[{label:L('ปรับวัตถุดิบ','Adjust ingredients'),action:'open_ingredient_picker'}] };
}
function buildFallback(message){
  return { title:null, message:L('ตอนนี้ IU Mate ยังตอบเรื่องนี้ไม่ได้โดยตรง แต่ช่วยได้เรื่อง: สรุปวันนี้ แนะนำเมนู ดูผลลัพธ์ วิธีใช้แอป และงานของโค้ช','I can\'t answer that directly yet, but I can help with: today summary, menu ideas, results, app help, and coach tasks.'),
    actions: role()==='coach'
      ? [{label:L('สรุปลูกเทรน','Clients'),action:'_chip',payload:{q:L('สรุปลูกเทรน','clients to follow up')}},{label:L('สรุปการบ้าน','Homework'),action:'_chip',payload:{q:L('สรุปการบ้าน','homework summary')}}]
      : [{label:L('สรุปวันนี้','Today'),action:'_chip',payload:{q:L('สรุปวันนี้','today summary')}},{label:L('กินอะไรดี','What to eat'),action:'_chip',payload:{q:L('กินอะไรดี','what to eat')}}] };
}

/* ============================ chips ============================ */
function rankChips(list){ try{ return list.slice().sort(function(a,b){ return statCount('chip:'+b[0]) - statCount('chip:'+a[0]); }); }catch(e){ return list; } }
function quickChips(){
  var list=(role()==='coach')?[
    [L('สรุปลูกเทรน','Clients to follow'),'👥'],[L('สรุปการบ้าน','Homework'),'📥'],[L('เขียน feedback','Write feedback'),'✍️'],
    [L('สรุปกลุ่ม','Groups'),'🏷️'],[L('คนที่ต้องติดตาม','Who to follow up'),'🔔'],[L('ข้อความสำเร็จรูป','Message templates'),'💬']
  ]:[
    [L('สรุปวันนี้','Today summary'),'📊'],[L('กินอะไรดี','What to eat'),'🍽️'],[L('สร้างเมนูจากของที่มี','Make from ingredients'),'🧺'],
    [L('คำนวณแคล/มาโคร','Calorie & macros'),'🧮'],[L('ดูความคืบหน้า','My progress'),'📈'],[L('วิธีใช้แอป','How to use'),'❓']
  ];
  return rankChips(list);
}
function greeting(){
  return role()==='coach'
    ? L('สวัสดีโค้ช วันนี้ให้ IU Mate ช่วยสรุปลูกเทรน การบ้าน หรือกลุ่มไหนดี?','Hi Coach! Want IU Mate to summarize clients, homework, or a group today?')
    : L('สวัสดีครับ ผมคือ IU Mate ช่วยสรุปวันนี้ หาเมนู ดูผลลัพธ์ และพาใช้งานแอปได้เร็วขึ้น','Hi, I\'m IU Mate — I help summarize your day, find menus, review results, and use the app faster.');
}

/* ============================ rendering ============================ */
function root(){ var r=document.getElementById('iuMateRoot'); if(!r){ r=document.createElement('div'); r.id='iuMateRoot'; document.body.appendChild(r); } return r; }
function injectEntryPoints(){
  try{
    if(!appReady()){ var e0=document.getElementById('iuMateEntry'); if(e0)e0.remove(); return; }
    var tab=window.TAB||''; var view=document.getElementById('view'); if(!view) return;
    var old=document.getElementById('iuMateEntry'); if(old) old.remove();
    var cfg=null;
    if(tab==='food') cfg={icon:'🧺',label:L('สร้างเมนูจากวัตถุดิบกับ IU Mate','Build a menu from ingredients with IU Mate'),q:L('สร้างเมนูจากของที่มี','make a menu from my ingredients')};
    else if(tab==='coach') cfg={icon:'📊',label:L('สรุปลูกเทรนวันนี้ ด้วย IU Mate','Clients overview with IU Mate'),q:L('สรุปลูกเทรน','clients overview')};
    else if(tab==='body') cfg={icon:'✨',label:L('อธิบายผลลัพธ์ของฉัน ด้วย IU Mate','Explain my results with IU Mate'),q:L('ดูความคืบหน้า','my progress')};
    if(!cfg) return;
    var b=document.createElement('button'); b.id='iuMateEntry'; b.className='iu-mate-entry'; b.type='button';
    b.innerHTML='<span class="ico">'+cfg.icon+'</span><span class="lbl">'+esc(cfg.label)+'</span><span class="go">'+botIcon()+'</span>';
    b.addEventListener('click',function(){ IUMate.open(tab); if(hasConsent()){ setTimeout(function(){ IUMate.chip(cfg.q); },260); } });
    view.insertBefore(b, view.firstChild);
  }catch(e){}
}
function renderFab(){
  var r=root(); var fab=document.getElementById('iuMateFab');
  if(!fab){ fab=document.createElement('button'); fab.id='iuMateFab'; fab.className='iu-mate-fab'; fab.type='button';
    fab.innerHTML='<span class="iu-ic">'+botIcon()+'<span class="iu-spark">'+sparkIcon()+'</span></span><span class="iu-lbl">IU Mate</span>';
    fab.addEventListener('click',function(){ IUMate.open('global'); });
    document.body.appendChild(fab);
  }
  fab.hidden = ST.isOpen || !appReady();
}
function msgHtml(m){
  if(m.role==='user') return '<div class="iu-mate-bubble user">'+esc(m.text)+'</div>';
  if(m.role==='typing') return '<div class="iu-mate-row-bot"><span class="mini">'+botIcon()+'</span><div class="iu-mate-bubble bot"><span class="iu-mate-typing"><i></i><i></i><i></i></span></div></div>';
  if(m.role==='botText') return '<div class="iu-mate-row-bot"><span class="mini">'+botIcon()+'</span><div class="iu-mate-bubble bot">'+esc(m.text)+'</div></div>';
  // bot reply object
  var rep=m.reply, idx=m.idx; var h='<div class="iu-mate-row-bot"><span class="mini">'+botIcon()+'</span><div style="max-width:88%"><div class="iu-mate-card">';
  if(rep.title) h+='<div class="ttl">'+sparkInline()+esc(rep.title)+'</div>';
  if(rep.message) h+='<div class="msg">'+esc(rep.message)+'</div>';
  (rep.recipes||[]).forEach(function(rc){
    h+='<div class="iu-mate-recipe-card"><div class="iu-mate-recipe-title">'+esc(rc.name)+'</div>'+
      '<div class="iu-mate-recipe-meta">'+rc.nutrition.kcal+' kcal · P '+rc.nutrition.protein+'g · C '+rc.nutrition.carb+'g · F '+rc.nutrition.fat+'g</div>'+
      '<div class="iu-mate-recipe-ings">'+esc(rc.ingredients.map(function(i){return tFoodName(i.name)+' '+i.amount+'g';}).join(' · '))+'</div>'+
      (rc.tags&&rc.tags.length?'<div class="iu-mate-recipe-tags">'+rc.tags.map(function(t){return '<span class="iu-mate-recipe-tag">'+esc(t)+'</span>';}).join('')+'</div>':'')+
      '<div class="iu-mate-actions">'+
        '<button class="iu-mate-act" onclick="IUMate.act(\'preview_generated_recipe\','+idx+',\''+rc.id+'\')">'+L('ดูรายละเอียด','Details')+'</button>'+
        '<button class="iu-mate-act primary" onclick="IUMate.act(\'add_generated_recipe_to_meal\','+idx+',\''+rc.id+'\')">'+L('เพิ่มลงมื้อ','Add to meal')+'</button>'+
      '</div></div>';
  });
  (rep.more||[]).forEach(function(mo){ h+='<div class="iu-mate-subcard"><div class="st">'+esc(mo.title)+'</div><div class="sm">'+esc(mo.answer)+'</div></div>'; });
  if(rep.actions&&rep.actions.length){ h+='<div class="iu-mate-actions">'+rep.actions.map(function(a,ai){
    return '<button class="iu-mate-act'+(ai===0?' primary':'')+'" onclick="IUMate.act(\''+a.action+'\','+idx+','+ai+')">'+esc(a.label)+'</button>';
  }).join('')+'</div>'; }
  if(rep.disclaimer) h+='<div class="disc">'+esc(rep.disclaimer)+'</div>';
  h+='</div></div></div>';
  return h;
}
function sparkInline(){ return '<span style="color:#0A84FF;width:16px;height:16px;display:inline-grid;place-items:center">'+sparkIcon()+'</span>'; }
function renderMessages(){
  var box=document.getElementById('iuMateMessages'); if(!box) return;
  box.innerHTML=ST.messages.map(msgHtml).join('');
  box.scrollTop=box.scrollHeight;
}
function renderSheet(){
  var r=root(); var chips=quickChips();
  r.innerHTML=
   '<div class="iu-mate-backdrop" onclick="IUMate.close()"></div>'+
   '<section class="iu-mate-sheet'+(ST.full?' full':'')+'" role="dialog" aria-label="IU Mate">'+
     '<div class="iu-mate-grab"></div>'+
     '<header class="iu-mate-header">'+
       '<button class="iu-mate-close" onclick="IUMate.close()" aria-label="close">←</button>'+
       '<div class="iu-mate-avatar">'+botIcon()+'</div>'+
       '<div class="iu-mate-title"><strong>IU Mate</strong><small>'+esc(L('ผู้ช่วยส่วนตัวใน IUFIT','Your assistant in IUFIT'))+'</small></div>'+
       '<span class="iu-mate-local-badge">Local</span>'+
       '<button class="iu-mate-expand" onclick="IUMate.showPrivacy()" aria-label="privacy" title="privacy" style="margin-right:1px">🔒</button>'+'<button class="iu-mate-expand" onclick="IUMate.toggleFull()" aria-label="expand">'+(ST.full?'▢':'⤢')+'</button>'+
     '</header>'+
     '<div class="iu-mate-chip-row">'+chips.map(function(c){ return '<button class="iu-mate-chip" onclick="IUMate.chip(this.dataset.q)" data-q="'+esc(c[0])+'"><span class="e">'+c[1]+'</span>'+esc(c[0])+'</button>'; }).join('')+'</div>'+
     '<div class="iu-mate-messages" id="iuMateMessages"></div>'+
     '<form class="iu-mate-composer" onsubmit="return IUMate.sendFromForm(event)">'+
       '<input id="iuMateInput" placeholder="'+esc(L('ถาม IU Mate...','Ask IU Mate...'))+'" autocomplete="off" enterkeyhint="send">'+
       '<button class="iu-mate-send" type="submit" aria-label="send">'+sendIcon()+'</button>'+
     '</form>'+
     '<div class="iu-mate-privacy-note">'+esc(L('ทำงานในเครื่อง • บทสนทนาไม่ถูกบันทึกหรือส่งออกนอกเครื่อง','On-device • conversations are not saved or sent anywhere'))+'</div>'+
   '</section>';
  renderMessages();
}

/* ============================ confirm dialog ============================ */
function showConfirm(opts){
  var wrap=document.createElement('div'); wrap.className='iu-mate-confirm-wrap'; wrap.id='iuMateConfirm';
  wrap.innerHTML='<div class="iu-mate-confirm"><div class="ci">'+checkIcon()+'</div><h4>'+esc(opts.title||L('ยืนยัน','Confirm'))+'</h4><p>'+esc(opts.body||'')+'</p><div class="row"><button class="no">'+L('ยกเลิก','Cancel')+'</button><button class="yes">'+esc(opts.yes||L('ยืนยัน','Confirm'))+'</button></div></div>';
  document.body.appendChild(wrap);
  wrap.querySelector('.no').onclick=function(){ wrap.remove(); };
  wrap.addEventListener('click',function(e){ if(e.target===wrap) wrap.remove(); });
  wrap.querySelector('.yes').onclick=function(){ wrap.remove(); try{ opts.onYes&&opts.onYes(); }catch(e){} };
}

/* ============================ actions ============================ */
function appToast(m){ try{ if(fn('toast')) window.toast(m); else console.log('[IUMate]',m); }catch(e){} }
function goTab(t){ ST.isOpen=false; closeNow(); try{ if(fn('go')) window.go(t); }catch(e){} }
var ACTIONS = {
  go_today:function(){ goTab('today'); },
  go_food:function(){ goTab('food'); },
  go_workout:function(){ goTab('workout'); },
  go_result:function(){ goTab('body'); },
  go_coach:function(){ goTab('coachview'); },
  go_clients:function(){ goTab(role()==='coach'?'cclients':'coachview'); },
  go_homework:function(){ goTab('chwk'); },
  go_groups:function(){ goTab('cgroups'); },
  go_missions:function(){ goTab('chmis'); },
  today_summary:function(){ pushReply(buildToday()); },
  food_recommend:function(){ pushReply(buildFoodRecommend('')); },
  share_result_text:function(){ pushReply(buildShareText()); },
  add_water:function(p){ showConfirm({ title:L('ดื่มน้ำ +'+(p&&p.amount||1),'Water +'+(p&&p.amount||1)), body:L('บันทึกน้ำดื่มเพิ่มในวันนี้','Add water to today\'s log'), yes:L('บันทึก','Save'), onYes:function(){ try{ if(fn('addWater')) window.addWater(p&&p.amount||1); }catch(e){} appToast(L('บันทึกน้ำแล้ว 💧','Water logged 💧')); pushBotText(L('บันทึกน้ำเพิ่มแล้วครับ 💧','Added water to today 💧')); } }); },
  create_followup_message:function(){ var c=coachCtx(); var name=(c.follow[0]&&c.follow[0].name)||L('ลูกเทรน','client'); var tpl=L('สวัสดีครับ '+name+' วันนี้สะดวกบันทึกมื้ออาหารหรือส่งการบ้านไหมครับ? มีอะไรให้โค้ชช่วยปรับแผนบอกได้เลยครับ 💪','Hi '+name+', can you log your meals or send homework today? Let me know if you\'d like to adjust the plan 💪'); pushReply({ title:L('ข้อความติดตาม','Follow-up message'), message:tpl, actions:[{label:L('คัดลอกข้อความ','Copy text'),action:'copy_text',payload:{text:tpl}},{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] }); },
  create_feedback:function(){ var tpl=L('ทำได้ดีมากครับ! เห็นความตั้งใจชัดเจน จุดที่อยากให้โฟกัสต่อคือความสม่ำเสมอของมื้ออาหารและการพักผ่อน สัปดาห์หน้าลองทำให้ครบทุกวันนะครับ เป็นกำลังใจให้ 👏','Great work! Your effort really shows. Next, focus on meal consistency and recovery — aim for a full week next time. Keep it up 👏'); pushReply({ title:L('ข้อความ feedback','Feedback message'), message:tpl, actions:[{label:L('คัดลอกข้อความ','Copy text'),action:'copy_text',payload:{text:tpl}}] }); },
  msg_tpl:function(p){ var t=null; for(var i=0;i<MSG_TEMPLATES.length;i++){ if(MSG_TEMPLATES[i].id===(p&&p.id)){ t=MSG_TEMPLATES[i]; break; } } if(!t) return; try{ bumpStat('tpl:'+t.id); }catch(e){} var nm=topClientName(); var txt=(EN()?t.en:t.th).replace(/\{name\}/g,nm); pushReply({ title:t.label, message:txt, disclaimer:L('ปรับชื่อ/รายละเอียดให้ตรงลูกเทรนก่อนส่งได้เลย','Edit the name/details to fit your client before sending'), actions:[{label:L('คัดลอกข้อความ','Copy text'),action:'copy_text',payload:{text:txt}},{label:L('เลือกข้อความอื่น','More templates'),action:'_chip',payload:{q:L('ข้อความสำเร็จรูป','message templates')}}] }); },
  copy_text:function(p){ var txt=(p&&p.text)||''; try{ navigator.clipboard.writeText(txt); }catch(e){} appToast(L('คัดลอกแล้ว ✓','Copied ✓')); },
  open_ingredient_picker:function(){ openIngredientPicker(); },
  open_calc:function(){ openCalcForm(ST.calc||{}); },
  preview_generated_recipe:function(p){ openRecipePreview(p&&p.recipeId); },
  add_generated_recipe_to_meal:function(p){ confirmAddRecipe(p&&p.recipeId); },
  save_generated_recipe:function(p){ confirmSaveRecipe(p&&p.recipeId); },
  show_privacy:function(){ try{ IUMate.showPrivacy(); }catch(e){} },
  _chip:function(p){ if(p&&p.q) IUMate.chip(p.q); }
};
function runAction(name, payload){ var f=ACTIONS[name]; if(f){ f(payload); } else { /* unknown action: no-op */ } }

/* ============================ recipe action helpers ============================ */
function mealKeyFromTime(){ var h=new Date().getHours(); if(h<10) return 'br'; if(h<15) return 'lu'; if(h<21) return 'di'; return 'sn'; }
function mealLabel(k){ return ({br:L('มื้อเช้า','Breakfast'),lu:L('มื้อกลางวัน','Lunch'),di:L('มื้อเย็น','Dinner'),sn:L('ของว่าง','Snack')})[k]||k; }
function confirmAddRecipe(rid){
  var rc=ST.recipeCache[rid]; if(!rc){ appToast(L('ไม่พบเมนู','Recipe not found')); return; }
  var mk=mealKeyFromTime();
  showConfirm({ title:L('เพิ่มลง'+mealLabel(mk),'Add to '+mealLabel(mk)), body:rc.name+' · '+rc.nutrition.kcal+' kcal', yes:L('เพิ่ม','Add'), onYes:function(){
    try{ var u=curUser(); var s=S(); s.logs=s.logs||[]; var _ings=rc.ingredients.map(function(i){return [i.id,i.amount];}).filter(function(p){return ING()[p[0]];}); if(!_ings.length){ appToast(L('เพิ่มเมนูไม่ได้ (วัตถุดิบไม่ตรงฐานข้อมูล)','Cannot add (ingredients not in DB)')); return; } /* store ings only: IUFIT logNut() computes full kcal/protein/carb/fat/fiber from ings via nutOf(); adding fx would zero-out carb/fat */ s.logs.push({ id:uid(), user:(u&&u.id)||window.S.active, date:todayDate(), meal:mk, name:rc.name, ings:_ings, eaten:1, src:'iu_mate' });
      if(fn('save')) window.save();
      if((window.TAB==='today'||window.TAB==='food') && (fn('renderToday')||fn('renderFood'))){ try{ if(window.TAB==='today'&&fn('renderToday'))window.renderToday(); else if(fn('renderFood'))window.renderFood(); }catch(e){} }
    }catch(e){}
    appToast(L('เพิ่มลง'+mealLabel(mk)+'แล้ว ✓','Added to '+mealLabel(mk)+' ✓'));
    pushBotText(L('เพิ่ม "'+rc.name+'" ลง'+mealLabel(mk)+'แล้วครับ ✓','Added "'+rc.name+'" to '+mealLabel(mk)+' ✓'));
  } });
}
function confirmSaveRecipe(rid){
  var rc=ST.recipeCache[rid]; if(!rc){ appToast(L('ไม่พบเมนู','Recipe not found')); return; }
  showConfirm({ title:L('บันทึกเป็นเมนูของฉัน','Save as my menu'), body:rc.name, yes:L('บันทึก','Save'), onYes:function(){
    try{ var s=S(); s.recipes=s.recipes||[]; s.recipes.push({ id:'u'+uid(), n:rc.name, c:'', ic:'i-star', ings:rc.ingredients.map(function(i){return [i.id,i.amount];}), steps:[], src:'iu_mate_generated', tags:rc.tags });
      if(fn('save')) window.save();
    }catch(e){}
    appToast(L('บันทึกเมนูแล้ว ⭐','Menu saved ⭐'));
    pushBotText(L('บันทึก "'+rc.name+'" ลงเมนูของคุณแล้วครับ ⭐','Saved "'+rc.name+'" to your menus ⭐'));
  } });
}

/* ============================ ingredient picker + recipe preview (use app modal2 if available) ============================ */
function modalOpen(html){ showSimpleModal(html); }
function modalClose(){ var m=document.getElementById('iuMateSimpleModal'); if(m) m.remove(); }
function showSimpleModal(html){ var ex=document.getElementById('iuMateSimpleModal'); if(ex) ex.remove(); var w=document.createElement('div'); w.id='iuMateSimpleModal'; w.className='iu-mate-confirm-wrap'; w.innerHTML='<div class="iu-mate-confirm" style="max-width:440px;width:100%;max-height:90vh;overflow:auto;text-align:left;padding:18px">'+html+'</div>'; w.addEventListener('click',function(e){ if(e.target===w) w.remove(); }); document.body.appendChild(w); }
function ingGroupsForPicker(){ return [['all',L('ทั้งหมด','All')],['protein',L('โปรตีน','Protein')],['carb',L('คาร์บ','Carb')],['vegetable',L('ผัก','Veg')],['fat',L('ไขมันดี','Fat')],['fruit',L('ผลไม้','Fruit')]]; }
function openIngredientPicker(){
  if(!ingDbOk()){ appToast(L('ฐานวัตถุดิบยังไม่พร้อม','Ingredient DB not ready')); return; }
  ST.pickerQuery=''; if(!ST.pickerSel) ST.pickerSel=[];
  modalOpen('<div class="iu-mate-ip" id="iuMateIp"></div>'); renderPicker();
}
function renderPicker(){
  var host=document.getElementById('iuMateIp'); if(!host) return;
  var q=norm(ST.pickerQuery||''); var grp=ST.pickerGrp||'all';
  var list=ingredientList().filter(function(i){ if(grp!=='all'&&i.group!==grp) return false; if(q && norm(i.name).indexOf(q)<0 && norm(tFoodName(i.name)).indexOf(q)<0) return false; return true; });
  // dedupe by name, cap
  var seen={}; list=list.filter(function(i){ var k=i.name; if(seen[k]) return false; seen[k]=1; return true; }).slice(0,120);
  var selIds={}; ST.pickerSel.forEach(function(i){ selIds[i.id]=1; });
  var h='<h3>'+esc(L('สร้างเมนูจากวัตถุดิบ','Make a menu from ingredients'))+'</h3>'+
    '<div class="sub">'+esc(L('เลือกของที่มี แล้วให้ IU Mate จัดเป็นเมนูพร้อมคำนวณแคลให้','Pick what you have and IU Mate will build menus with calculated calories.'))+'</div>'+
    '<input class="search" placeholder="'+esc(L('ค้นหาวัตถุดิบ...','Search ingredient...'))+'" value="'+esc(ST.pickerQuery||'')+'" oninput="IUMate._pq(this.value)">'+
    '<div class="iu-mate-grp-chips">'+ingGroupsForPicker().map(function(g){ return '<button class="iu-mate-grp-chip'+(grp===g[0]?' on':'')+'" onclick="IUMate._pg(\''+g[0]+'\')">'+esc(g[1])+'</button>'; }).join('')+'</div>'+
    '<div class="iu-mate-selected">'+ST.pickerSel.map(function(i){ return '<span class="iu-mate-selected-pill" onclick="IUMate._ptoggle(\''+i.id+'\')">'+esc(tFoodName(i.name))+' ✕</span>'; }).join('')+'</div>'+
    '<div class="iu-mate-ing-list">'+ (list.length?list.map(function(i){ return '<div class="iu-mate-ing-item'+(selIds[i.id]?' on':'')+'" onclick="IUMate._ptoggle(\''+i.id+'\')"><span class="cb">'+(selIds[i.id]?checkIcon():'')+'</span><span class="nm">'+esc(tFoodName(i.name))+'</span><span class="kc">'+i.kcal+' kcal/100g</span></div>'; }).join('') : '<div class="sub">'+esc(L('ไม่พบวัตถุดิบ','No ingredient found'))+'</div>') +'</div>'+
    '<button class="go" '+(ST.pickerSel.length?'':'disabled')+' onclick="IUMate._pgo()">'+esc(L('ให้ IU Mate จัดเมนู','Build menus'))+(ST.pickerSel.length?' ('+ST.pickerSel.length+')':'')+'</button>';
  host.innerHTML=h;
}
function pickerToggle(id){ var ing=ingredientList().filter(function(i){return i.id===id;})[0]; if(!ing) return; var i=ST.pickerSel.map(function(x){return x.id;}).indexOf(id); if(i>=0) ST.pickerSel.splice(i,1); else ST.pickerSel.push(ing); renderPicker(); }
function pickerGo(){ if(!ST.pickerSel.length) return; var sel=ST.pickerSel.slice(); modalClose();
  if(!ST.isOpen) IUMate.open('food');
  pushUser(L('มี ','I have ')+sel.map(function(i){return tFoodName(i.name);}).join(', '));
  var recipes=generateRecipes(sel, { goal:goalLabel(), meal:currentMeal() });
  if(!recipes.length){ pushReply({ title:L('ยังจับคู่เมนูไม่ได้','Couldn\'t build a menu'), message:L('ลองเพิ่มแหล่งโปรตีน คาร์บ หรือผักอีกอย่างครับ','Try adding a protein, carb or vegetable.'), actions:[{label:L('เลือกวัตถุดิบ','Pick ingredients'),action:'open_ingredient_picker'}] }); return; }
  pushReply({ title:L('เมนูที่ IU Mate จัดให้','Menus IU Mate built'), message:L('จากวัตถุดิบที่เลือก ได้ '+recipes.length+' เมนู','From your ingredients, here are '+recipes.length+' menus:'), recipes:recipes, actions:[{label:L('ปรับวัตถุดิบ','Adjust'),action:'open_ingredient_picker'}] });
}
function openRecipePreview(rid){
  var rc=ST.recipeCache[rid]; if(!rc){ appToast(L('ไม่พบเมนู','Recipe not found')); return; }
  ST.previewId=rid; renderPreview();
}
function recomputePreview(rc){ var combo=rc.ingredients.map(function(i){ return {kcal:i.kcal,protein:i.protein,fat:i.fat,carb:i.carb,fiber:i.fiber,selectedAmount:i.amount,defaultAmount:i.amount}; }); rc.nutrition=roundNut(calcNutrition(combo)); }
function renderPreview(){
  var rc=ST.recipeCache[ST.previewId]; if(!rc) return;
  var n=rc.nutrition;
  var h='<div class="iu-mate-ip"><h3>'+esc(rc.name)+'</h3><div class="sub">IU Mate · '+esc(L('คำนวณจากวัตถุดิบ','computed from ingredients'))+'</div>'+
    '<div class="iu-mate-nutrition-grid">'+
      '<div class="iu-mate-nutrition-item"><b>'+n.kcal+'</b><span>kcal</span></div>'+
      '<div class="iu-mate-nutrition-item"><b>'+n.protein+'</b><span>P (g)</span></div>'+
      '<div class="iu-mate-nutrition-item"><b>'+n.carb+'</b><span>C (g)</span></div>'+
      '<div class="iu-mate-nutrition-item"><b>'+n.fat+'</b><span>F (g)</span></div>'+
    '</div>'+
    '<div class="sub" style="margin:4px 0 2px">'+esc(L('วัตถุดิบ (ปรับปริมาณได้)','Ingredients (adjustable)'))+'</div>'+
    rc.ingredients.map(function(i,idx){ return '<div class="iu-mate-amt-row"><span class="nm">'+esc(tFoodName(i.name))+'</span><button onclick="IUMate._amt('+idx+',-1)">−</button><span class="amt">'+i.amount+' g</span><button onclick="IUMate._amt('+idx+',1)">＋</button></div>'; }).join('')+
    '<div class="iu-mate-fit">'+esc(L('เหมาะกับ','Good for'))+': '+esc((rc.tags||[]).join(' · '))+'</div>'+
    '<div style="display:flex;gap:8px;margin-top:12px">'+
      '<button class="go" style="background:#eef2f7;color:#37496b" onclick="IUMate.act(\'save_generated_recipe\',-1,\''+rc.id+'\')">'+esc(L('บันทึกเมนู','Save menu'))+'</button>'+
      '<button class="go" onclick="IUMate._previewAdd(\''+rc.id+'\')">'+esc(L('เพิ่มลงมื้อ','Add to meal'))+'</button>'+
    '</div></div>';
  modalOpen(h);
}
function previewAmt(idx,dir){ var rc=ST.recipeCache[ST.previewId]; if(!rc) return; var i=rc.ingredients[idx]; if(!i) return; var step=(i.group==='sauce'||i.group==='fat')?5:(i.group==='fruit'||i.group==='vegetable'?25:25); i.amount=Math.max(0,(i.amount||0)+dir*step); recomputePreview(rc); renderPreview(); }

/* ============================ message flow ============================ */
function pushUser(text){ ST.messages.push({role:'user',text:text}); renderMessages(); }
function pushBotText(text){ ST.messages.push({role:'botText',text:text}); renderMessages(); }
function pushReply(reply){ var idx=ST.messages.length; ST.messages.push({role:'bot',reply:reply,idx:idx}); renderMessages(); }
function pushTyping(){ ST.messages.push({role:'typing'}); renderMessages(); }
function popTyping(){ for(var i=ST.messages.length-1;i>=0;i--){ if(ST.messages[i].role==='typing'){ ST.messages.splice(i,1); break; } } }
function handleMessage(text){
  text=(text||'').trim(); if(!text) return;
  pushUser(text); pushTyping();
  setTimeout(function(){ popTyping();
    var intent=detectIntent(text); try{ bumpStat('intent:'+intent); }catch(e){}
    var reply; try{ reply=buildReply(intent,text); }catch(e){ reply=buildFallback(text); }
    pushReply(reply);
  }, 320+Math.random()*220);
}

/* ============================ public API ============================ */
function closeNow(){ ST.isOpen=false; var r=root(); r.innerHTML=''; renderFab(); }
function readCalcInputs(){ ST.calc=ST.calc||{}; var a=document.getElementById('iuCalcAge'),h=document.getElementById('iuCalcH'),w=document.getElementById('iuCalcW'),ac=document.getElementById('iuCalcAct'); if(a&&a.value!=='')ST.calc.age=parseFloat(a.value); if(h&&h.value!=='')ST.calc.h=parseFloat(h.value); if(w&&w.value!=='')ST.calc.w=parseFloat(w.value); if(ac&&ac.value)ST.calc.act=parseFloat(ac.value); }
var IUMate = {
  open:function(mode){ if(!appReady()){ appToast(L('เข้าสู่ระบบก่อนใช้ IU Mate','Sign in to use IU Mate')); return; }
    ST.isOpen=true; ST.mode=mode||'global';
    if(!hasConsent()){ ST.full=false; renderConsentScreen(); renderFab(); return; }
    if(!ST.messages.length){ ST.messages.push({role:'botText',text:greeting()}); }
    renderSheet(); renderFab();
    setTimeout(function(){ var inp=document.getElementById('iuMateInput'); /* no autofocus to avoid keyboard jump on open */ }, 50);
  },
  close:function(){ closeNow(); },
  toggleFull:function(){ ST.full=!ST.full; renderSheet(); },
  chip:function(q){ try{ bumpStat('chip:'+q); }catch(e){} handleMessage(q); },
  send:function(text){ handleMessage(text); },
  sendFromForm:function(ev){ if(ev&&ev.preventDefault) ev.preventDefault(); var inp=document.getElementById('iuMateInput'); if(inp){ var v=inp.value; inp.value=''; handleMessage(v); } return false; },
  act:function(action, idx, ai){
    var payload=null;
    if(typeof ai==='string'){ // recipe action: ai is recipeId
      payload={recipeId:ai};
    } else if(typeof idx==='number' && idx>=0 && ST.messages[idx] && ST.messages[idx].reply){
      var acts=ST.messages[idx].reply.actions||[]; var a=acts[ai]; if(a){ action=a.action; payload=a.payload||null; }
    }
    runAction(action, payload);
  },
  _pq:function(v){ ST.pickerQuery=v; if(ST._pqT)clearTimeout(ST._pqT); ST._pqT=setTimeout(function(){ renderPicker(); var el=document.querySelector('#iuMateIp .search'); if(el){ try{ el.focus(); var n=(''+el.value).length; el.setSelectionRange(n,n); }catch(e){} } }, 260); },
  _pg:function(g){ ST.pickerGrp=g; renderPicker(); },
  _ptoggle:function(id){ pickerToggle(id); },
  _pgo:function(){ pickerGo(); },
  _amt:function(idx,dir){ previewAmt(idx,dir); },
  _previewAdd:function(rid){ modalClose(); confirmAddRecipe(rid); },
  _sex:function(x){ readCalcInputs(); ST.calc.sex=x; openCalcForm(ST.calc); },
  _goal:function(x){ readCalcInputs(); ST.calc.goal=x; openCalcForm(ST.calc); },
  _calc:function(){ readCalcInputs(); var p=ST.calc||{}; if(p.w==null||p.h==null||p.age==null||p.sex==null){ appToast(L('กรอกเพศ อายุ ส่วนสูง น้ำหนักให้ครบก่อนครับ','Please fill sex, age, height and weight')); return; } if(!(p.age>=10&&p.age<=100)||!(p.h>=120&&p.h<=220)||!(p.w>=30&&p.w<=250)){ appToast(L('ตรวจค่าอีกครั้ง: อายุ 10–100 ปี · สูง 120–220 ซม. · หนัก 30–250 กก.','Check values: age 10–100 · height 120–220 cm · weight 30–250 kg')); return; } modalClose(); if(!ST.isOpen) IUMate.open('global'); pushReply(calcReply(p)); },
  acceptConsent:function(){ var coachData=true; var cb=document.getElementById('iuMateCoachConsent'); if(cb) coachData=!!cb.checked; saveConsent(coachData); ST.messages=[]; ST.messages.push({role:'botText',text:greeting()}); renderSheet(); renderFab(); },
  declineConsent:function(){ closeNow(); },
  showPrivacy:function(){ showConfirm({ title:L('ความเป็นส่วนตัว','Privacy'), body:L('IU Mate ทำงานในเครื่อง บทสนทนาไม่ถูกบันทึกหรือส่งออกนอกเครื่อง และอ่านข้อมูลในแอปเพื่อช่วยสรุปเท่านั้น','IU Mate runs on-device. Conversations are not saved or sent anywhere, and it only reads your in-app data to help summarize.'), yes:L('เพิกถอนความยินยอม','Withdraw consent'), onYes:function(){ revokeConsent(); appToast(L('เพิกถอนความยินยอมแล้ว','Consent withdrawn')); closeNow(); } }); },
  _sync:function(){ try{ renderFab(); }catch(e){} try{ injectEntryPoints(); }catch(e){} },
  _state:ST
};
window.IUMate = IUMate;

/* ============================ boot ============================ */
function boot(){
  renderFab();
  // keep FAB visibility + language synced by decorating renderAll (calls original, non-invasive)
  try{ if(fn('renderAll') && !window.renderAll.__iuMateWrapped){ var orig=window.renderAll; window.renderAll=function(){ var r=orig.apply(this,arguments); try{ IUMate._sync(); }catch(e){} return r; }; window.renderAll.__iuMateWrapped=true; } }catch(e){}
  // FAB visibility synced via the renderAll decorator above (covers login + tab change); no polling needed
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();

})();
