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
var SYN={'กระเพรา':'กะเพรา','กระเพา':'กะเพรา','กะเพา':'กะเพรา','กระเพราะ':'กะเพรา','กวยเตี๋ยว':'ก๋วยเตี๋ยว','ก๊วยเตี๋ยว':'ก๋วยเตี๋ยว','ก่วยเตี๋ยว':'ก๋วยเตี๋ยว','ไก้':'ไก่','อกไก':'อกไก่','ข้าวสวย':'ข้าว','คาดิโอ':'คาร์ดิโอ','คาร์ดิโอ้':'คาร์ดิโอ','แคลอรี่':'แคล','แคลอรี':'แคล','กี่แคล':'กี่แคล','ฟีดแบค':'feedback','ฟีดแบ็ค':'feedback','ฟีดแบ็ก':'feedback','ฟีดแบก':'feedback','ลูกเทน':'ลูกเทรน','ลูกเทรนด์':'ลูกเทรน','โปรตีนสูง':'โปรตีนสูง','ทานข้าว':'กิน','กับข้าว':'อาหาร','ออกกําลัง':'ออกกำลัง','นํ้าหนัก':'น้ำหนัก','ญีปุ่น':'ญี่ปุ่น','ญี่ปุน':'ญี่ปุ่น','ยี่ปุ่น':'ญี่ปุ่น','ตะวันตก':'ฝรั่ง','เซเวน':'เซเว่น','นน.':'น้ำหนัก','สส.':'ส่วนสูง','ชม.':'ชั่วโมง','กม.':'กิโลเมตร','ลดนน.':'ลดน้ำหนัก','ลดนน':'ลดน้ำหนัก','มั้ย':'ไหม','มั๊ย':'ไหม','ไหมม':'ไหม','มั้ยคะ':'ไหม','มั้ยครับ':'ไหม','ป่าว':'เปล่า','ปล่าว':'เปล่า','ยังงัย':'ยังไง','เทาไหร่':'เท่าไหร่','เท่าไร':'เท่าไหร่','กี่โมง':'กี่โมง','กินไร':'กินอะไร','ทานไร':'กินอะไร','ทำไร':'ทำอะไร','มีไร':'มีอะไร','เป็นไร':'เป็นอะไร','จะไร':'จะอะไร','ขอบคุน':'ขอบคุณ','ขอบใจ':'ขอบคุณ','งับ':'ครับ','คับผม':'ครับ','คร้าบ':'ครับ','อาทิด':'อาทิตย์','คาร์โบ':'คาร์บ','คาโบ':'คาร์บ','คาโบไฮเดรต':'คาร์บ','โปทีน':'โปรตีน','โปตีน':'โปรตีน','โปรตีนสูงๆ':'โปรตีนสูง','ผญ':'ผู้หญิง','ผช':'ผู้ชาย','หมูกะทะ':'หมูกระทะ','ชาบูชาบู':'ชาบู','ซิกแพค':'หน้าท้อง','ซิคแพค':'หน้าท้อง','กล้ามท้อง':'หน้าท้อง','หน้าท้องแบน':'หน้าท้อง','ไอเอฟ':'อดอาหารเป็นช่วง','ฟิตหุ่น':'ลดไขมัน','เบิร์น':'เผาผลาญ','นน่ะ':'น้ำหนัก','สูงกี่':'ส่วนสูงกี่'};
var SYN_KEYS=Object.keys(SYN).sort(function(a,b){return b.length-a.length;});
function synNorm(s){ var t=norm(s); for(var i=0;i<SYN_KEYS.length;i++){ var k=SYN_KEYS[i]; if(t.indexOf(k)>=0) t=t.split(k).join(SYN[k]); } return t; }
/* fuzzy: char-trigram coverage of kw inside text (typo/variant tolerance) */
function _bigr(s){ var g=[]; for(var i=0;i<s.length-1;i++) g.push(s.slice(i,i+2)); return g; }
function trigCover(text, kw){ if(!kw) return 0; if(kw.length<4) return text.indexOf(kw)>=0?1:0; var g=_bigr(kw),h=0; for(var i=0;i<g.length;i++){ if(text.indexOf(g[i])>=0) h++; } return h/g.length; }
/* NLU v2 normalization: strip emoji/symbols + squeeze repeated chars (digits kept intact), then synNorm */
var _EMOJI_RE=/[\uD800-\uDFFF\u2600-\u27BF\u2190-\u21FF\u2B00-\u2BFF\uFE0F\u200B-\u200D]/g;
var _REPEAT_RE=/([^\d\s])\1{2,}/g;
function nluNorm(s){ return synNorm((''+(s==null?'':s)).replace(_EMOJI_RE,' ').replace(_REPEAT_RE,'$1')); }

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
  if(p.bf!=null) lines.push(L('มวลกล้าม (LBM)','Lean mass (LBM)')+' ≈ '+CALC.lbm(p.w,p.bf)+L(' กก.',' kg'));
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
function _logFeedback(m, up){ try{ var rep=m.reply||{}; var intent=rep._intent||'unknown'; var input=''; try{ var pm=ST.messages[(m.idx||0)-1]; if(pm&&pm.role==='user') input=(''+pm.text).slice(0,120); }catch(e){} var rec={ ts:Date.now(), intent:intent, rating:up?'helpful':'not_helpful', input:input, title:(rep.title||'').slice(0,80) }; var KEY='iufit_iu_mate_feedback'; var arr=[]; try{ arr=JSON.parse(localStorage.getItem(KEY)||'[]')||[]; }catch(e){} arr.push(rec); if(arr.length>300) arr=arr.slice(-300); try{ localStorage.setItem(KEY, JSON.stringify(arr)); }catch(e){} bumpStat('fb:'+(up?'up':'down')); bumpStat('fbintent:'+intent+':'+(up?'up':'down')); }catch(e){} }
var CONSENT_KEY='iufit_iu_mate_consent';
function loadConsent(){ try{ return JSON.parse(localStorage.getItem(CONSENT_KEY)||'null'); }catch(e){ return null; } }
function hasConsent(){ var c=loadConsent(); return !!(c&&c.accepted); }
function consentCoach(){ var c=loadConsent(); return !!(c&&c.accepted&&c.coachData!==false); }
function saveConsent(coachData){ try{ localStorage.setItem(CONSENT_KEY, JSON.stringify({accepted:true,coachData:coachData!==false,ts:Date.now()})); }catch(e){} }
function revokeConsent(){ try{ localStorage.removeItem(CONSENT_KEY); }catch(e){} }
/* ---- opt-in chat history (default OFF = privacy-first, nothing persisted) ---- */
var KEEPHIST_KEY='iufit_iu_mate_keephist';
var HIST_KEY='iufit_iu_mate_hist';
var HIST_MAX=50;
function keepHist(){ try{ return localStorage.getItem(KEEPHIST_KEY)==='1'; }catch(e){ return false; } }
function setKeepHist(on){ try{ if(on){ localStorage.setItem(KEEPHIST_KEY,'1'); } else { localStorage.removeItem(KEEPHIST_KEY); clearHist(); } }catch(e){} }
function clearHist(){ try{ localStorage.removeItem(HIST_KEY); }catch(e){} }
function _histOK(m){ return !!(m&&(m.role==='user'||m.role==='botText'||(m.role==='bot'&&m.reply))); }
function saveHist(){
  if(!keepHist()||!hasConsent()){ clearHist(); return; }
  try{
    var arr=ST.messages.filter(_histOK);
    if(arr.length>HIST_MAX) arr=arr.slice(-HIST_MAX);
    localStorage.setItem(HIST_KEY, JSON.stringify(arr));
  }catch(e){ clearHist(); }
}
function loadHist(){
  if(!keepHist()||!hasConsent()) return null;
  try{
    var arr=JSON.parse(localStorage.getItem(HIST_KEY)||'null');
    if(!arr||!arr.length) return null;
    arr=arr.filter(_histOK).slice(-HIST_MAX);
    arr.forEach(function(m,i){ if(m.role==='bot'){ m.idx=i; try{ (m.reply.recipes||[]).forEach(function(rc){ if(rc&&rc.id) ST.recipeCache[rc.id]=rc; }); }catch(e){} } });
    return arr.length?arr:null;
  }catch(e){ return null; }
}
function consentBodyHtml(coach){
  function pt(ic,th,en){ return '<div style="display:flex;gap:10px;align-items:flex-start;margin:11px 0"><span style="font-size:19px;flex:none;line-height:1.2">'+ic+'</span><div style="font-size:13.5px;line-height:1.55;color:#28364f">'+esc(L(th,en))+'</div></div>'; }
  return '<div class="iu-mate-card"><div class="ttl">'+sparkInline()+esc(L('ยินดีต้อนรับสู่ IU Mate','Welcome to IU Mate'))+'</div>'+
    '<div class="msg" style="margin-bottom:4px">'+esc(L('ก่อนเริ่ม ขออธิบายเรื่องข้อมูลสั้น ๆ ครับ','Before we start, a quick note about your data:'))+'</div>'+
    pt('🔒','ทำงานในเครื่อง 100% — บทสนทนาไม่ถูกส่งออกนอกเครื่อง จะเก็บไว้ในเครื่องเฉพาะเมื่อคุณเปิด “เก็บประวัติแชท”','100% on-device — conversations never leave your device, and are kept locally only if you turn on “Keep chat history”')+
    pt('📊','IU Mate อ่านข้อมูลในแอปของคุณ (เป้าหมาย อาหาร การฝึก ผลลัพธ์) เพื่อช่วยสรุปและแนะนำเท่านั้น','IU Mate reads your in-app data (goals, food, workouts, results) only to summarize and suggest')+
    pt('🩺','คำแนะนำเป็นข้อมูลทั่วไป ไม่ใช่คำวินิจฉัยหรือคำแนะนำทางการแพทย์','Guidance is general info — not a medical diagnosis or advice')+
    (coach?('<label style="display:flex;gap:9px;align-items:center;margin:14px 0 2px;font-size:13px;color:#28364f;cursor:pointer"><input type="checkbox" id="iuMateCoachConsent" checked style="width:18px;height:18px;flex:none">'+esc(L('อนุญาตให้ IU Mate ใช้ข้อมูลลูกเทรน/กลุ่มในเครื่องเพื่อช่วยสรุป','Let IU Mate use local client/group data to help summarize'))+'</label>'):'')+
    '<label style="display:flex;gap:9px;align-items:center;margin:12px 0 2px;font-size:13px;color:#28364f;cursor:pointer"><input type="checkbox" id="iuMateKeepHist" style="width:18px;height:18px;flex:none">'+esc(L('เก็บประวัติแชทไว้ในเครื่องนี้ (ปิดอยู่ = ไม่บันทึก ประวัติหายเมื่อปิดแชท)','Keep chat history on this device (off = nothing saved, cleared when chat closes)'))+'</label>'+
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
     '<button type="button" class="iu-mate-grab" onclick="IUMate.close()" aria-label="'+L('ย่อหน้าต่าง','Minimize')+'" title="'+L('ย่อหน้าต่าง','Minimize')+'"></button>'+
     '<header class="iu-mate-header">'+
       '<div class="iu-mate-avatar">'+botAvatar()+'</div>'+
       '<div class="iu-mate-title"><strong>IU Mate</strong><small>'+esc(L('ความเป็นส่วนตัว','Privacy & consent'))+'</small></div>'+
       '<span class="iu-mate-local-badge">Local</span>'+
     '</header>'+
     '<div class="iu-mate-messages" style="padding:16px">'+consentBodyHtml(role()==='coach')+'</div>'+
   '</section>';
}

/* ============================ icons ============================ */
function botIcon(){ return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="8" width="16" height="11" rx="3.5"/><path d="M12 8V4.5M12 4.5a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z"/><path d="M9 13h.01M15 13h.01"/><path d="M1.8 12.5v3M22.2 12.5v3"/></svg>'; }
function sparkIcon(){ return '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 4.7L18 8.3l-4.4 1.6L12 14l-1.6-4.1L6 8.3l4.4-1.6L12 2z"/></svg>'; }
function botAvatar(){ return '<svg viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block"><circle cx="28" cy="28" r="25.9" fill="none" stroke="#D8EBFF" stroke-width="1.22"/><circle cx="28" cy="28" r="24.5" fill="#EEF6FF" stroke="#7EB9FF" stroke-width="1.75"/><g transform="scale(0.875)"><circle cx="32" cy="11.6" r="4" fill="#0A84FF"/><circle cx="13.8" cy="29.3" r="3.8" fill="#0A84FF"/><circle cx="50.2" cy="29.3" r="3.8" fill="#0A84FF"/><rect x="17.8" y="19.6" width="28.4" height="17.4" rx="8" fill="#071E4A"/><path d="M23.7 26.6C23.7 25.1 24.9 23.9 26.4 23.9C27.9 23.9 29.1 25.1 29.1 26.6" stroke="#0A84FF" stroke-width="2.2" stroke-linecap="round"/><path d="M34.9 26.6C34.9 25.1 36.1 23.9 37.6 23.9C39.1 23.9 40.3 25.1 40.3 26.6" stroke="#0A84FF" stroke-width="2.2" stroke-linecap="round"/><path d="M28.4 31C29.2 31.8 30.4 32.3 32 32.3C33.6 32.3 34.8 31.8 35.6 31" stroke="#0A84FF" stroke-width="2.2" stroke-linecap="round"/><path d="M32 50.2L25.7 46.45C24 45.44 22.95 43.63 22.95 41.66C22.95 38.53 25.5 35.98 28.64 35.98C30.16 35.98 31.54 36.52 32.55 37.52C33.56 36.52 34.94 35.98 36.46 35.98C39.6 35.98 42.15 38.53 42.15 41.66C42.15 43.63 41.1 45.44 39.4 46.45L32 50.2Z" fill="#0A84FF"/><path d="M27.85 42.5H30.05L31.3 39.9L33.1 44.4L34.55 41.55H37.25" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></g></svg>'; }
function fabOrb(){ return '<svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="IU MATE tinted 56px"> <defs> <linearGradient id="gBlue" x1="15.75" y1="8.75" x2="40.25" y2="47.25" gradientUnits="userSpaceOnUse"> <stop offset="0" stop-color="#20D5FF"/> <stop offset="0.52" stop-color="#0A84FF"/> <stop offset="1" stop-color="#005CFF"/> </linearGradient> </defs> <circle cx="28.0" cy="28.0" r="25.90" fill="none" stroke="#D8EBFF" stroke-width="1.22"/> <circle cx="28.0" cy="28.0" r="24.50" fill="#EEF6FF" stroke="#7EB9FF" stroke-width="1.75"/> <g transform="translate(0.00 0.00) scale(0.87500)"> <circle cx="32" cy="11.6" r="4" fill="url(#gBlue)"/> <circle cx="13.8" cy="29.3" r="3.8" fill="url(#gBlue)"/> <circle cx="50.2" cy="29.3" r="3.8" fill="url(#gBlue)"/> <rect x="17.8" y="19.6" width="28.4" height="17.4" rx="8" fill="#071E4A"/> <path d="M23.7 26.6C23.7 25.1 24.9 23.9 26.4 23.9C27.9 23.9 29.1 25.1 29.1 26.6" stroke="#0A84FF" stroke-width="2.2" stroke-linecap="round"/> <path d="M34.9 26.6C34.9 25.1 36.1 23.9 37.6 23.9C39.1 23.9 40.3 25.1 40.3 26.6" stroke="#0A84FF" stroke-width="2.2" stroke-linecap="round"/> <path d="M28.4 31C29.2 31.8 30.4 32.3 32 32.3C33.6 32.3 34.8 31.8 35.6 31" stroke="#0A84FF" stroke-width="2.2" stroke-linecap="round"/> <path d="M32 50.2L25.7 46.45C24 45.44 22.95 43.63 22.95 41.66C22.95 38.53 25.5 35.98 28.64 35.98C30.16 35.98 31.54 36.52 32.55 37.52C33.56 36.52 34.94 35.98 36.46 35.98C39.6 35.98 42.15 38.53 42.15 41.66C42.15 43.63 41.1 45.44 39.4 46.45L32 50.2Z" fill="#0A84FF"/> <path d="M27.85 42.5H30.05L31.3 39.9L33.1 44.4L34.55 41.55H37.25" stroke="#FFFFFF" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/> </g> </svg>'; }
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
/* ---- Food Graph: auto swap engine (same group + closest macros) + budget intelligence ---- */
function _baseName(s){ return (''+s).replace(/\s*\([^)]*\)\s*/g,' ').trim(); }
var SWAP_EXCLUDE=['ตีน','กึ๋น','เอ็น','ตับ','เครื่องใน','เลือด','ไส้','กระดูก','หนังไก่','ขี้'];
function swapsFor(ing, n){
  if(!ing||!ing.group) return [];
  var ib=_baseName(ing.name); var seen={}, out=[];
  ingredientList().forEach(function(x){ if(x.group!==ing.group) return; if(SWAP_EXCLUDE.some(function(k){return (x.name||'').indexOf(k)>=0;})) return; var b=_baseName(x.name); if(b===ib||seen[b]) return; seen[b]=1; x._b=b; x._sim=Math.abs(x.kcal-(ing.kcal||0))+Math.abs(x.protein-(ing.protein||0))*4; out.push(x); });
  out.sort(function(a,b){ return a._sim-b._sim; });
  return out.slice(0, n||3);
}
var BUDGET_KW=['ไข่','อกไก่','สะโพกไก่','ข้าว','ปลากระป๋อง','ทูน่า','เต้าหู้','ถั่ว','ผักบุ้ง','กะหล่ำ','แครอท','มะเขือเทศ','โอ๊ต','หมูสับ','หมูบด','น้ำเต้าหู้','กล้วย','ฟักทอง','แตงกวา','ถั่วงอก','มันหวาน','มันฝรั่ง','คะน้า','ตำลึง','ฟัก','บวบ'];
function isBudget(ing){ var n=(ing&&ing.name)||''; for(var i=0;i<BUDGET_KW.length;i++){ if(n.indexOf(BUDGET_KW[i])>=0) return true; } return false; }
function budgetPantry(){ var by={}; ingredientList().forEach(function(i){ if(isBudget(i)){ (by[i.group]=by[i.group]||[]).push(i); } }); var p=[]; ['protein','carb','vegetable'].forEach(function(g){ (by[g]||[]).slice(0,2).forEach(function(i){ p.push(i); }); }); return p; }
function swapsBlock(rc){
  try{ var picks=(rc.ingredients||[]).filter(function(i){ return i.group==='protein'||i.group==='carb'; }).slice(0,2);
    var lines=picks.map(function(i){ var sw=swapsFor(i,2); if(!sw.length) return ''; return esc(tFoodName(i.name))+' → '+sw.map(function(x){ return esc(tFoodName(x._b)); }).join(', '); }).filter(Boolean);
    if(!lines.length) return '';
    return '<div class="iu-mate-fit" style="border-top:1px dashed var(--iu-border);padding-top:8px;margin-top:8px">🔄 '+esc(L('เปลี่ยนวัตถุดิบได้','Swap options'))+': '+lines.join(' · ')+'</div>';
  }catch(e){ return ''; }
}
/* schema guard: true only if IUFIT_ING exists and items expose numeric v=[kcal,prot,fat,carb,...] */
function ingDbOk(){ try{ var ing=ING(); var ks=Object.keys(ing); if(!ks.length) return false; for(var i=0;i<ks.length;i++){ var it=ing[ks[i]]; if(it&&it.v){ return Array.isArray(it.v)&&it.v.length>=4&&typeof it.v[0]==='number'; } } return false; }catch(e){ return false; } }
function cantCalcReply(){ return { title:L('ยังคำนวณเมนูไม่ได้','Cannot calculate menus yet'), message:L('ฐานข้อมูลวัตถุดิบยังไม่พร้อมหรือรูปแบบไม่ตรง IU Mate เลยยังคำนวณโภชนาการให้ไม่ได้ ลองรีเฟรชแอปอีกครั้งนะครับ','The ingredient database is not ready or its format does not match, so IU Mate cannot calculate nutrition. Please refresh the app.') }; }
function ingMatchForms(ing){
  // build candidate match strings: full name, alias, base name (strip parens), slash-split parts
  var forms=[]; function add(s){ s=(s||'').trim(); if(s&&s.length>=2) forms.push(s); }
  add(ing.name); if(ing.alias) add(ing.alias);
  var base=ing.name.replace(/\s*\([^)]*\)\s*/g,' ').trim(); add(base);
  var base2=base.replace(/(สุก|ดิบ|ต้ม|นึ่ง|ย่าง|ทอด|ผัด|ลวก|อบ|คั่ว|ปิ้ง|สด|ผง|แห้ง)\s*$/,'').trim(); if(base2&&base2!==base) add(base2);
  base.split(/[\/,]/).forEach(add);
  return forms;
}
function findIngredientsInText(text){
  var t=synNorm(text); var found=[]; var seenName={};
  // longest names first to prefer specific matches; dedup by display name
  var list=ingredientList().slice().sort(function(a,b){ return b.name.length-a.name.length; });
  list.forEach(function(ing){
    if(seenName[ing.name]) return;
    var forms=ingMatchForms(ing), best=0;
    for(var i=0;i<forms.length;i++){ var nf=norm(forms[i]); if(nf.length>=2 && t.indexOf(nf)>=0){ if(nf.length>best) best=nf.length; } }
    if(best>0){ ing._ml=best; found.push(ing); seenName[ing.name]=1; }
  });
  found.sort(function(a,b){ return (b._ml||0)-(a._ml||0); });
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
function _goalEn(th){ return {'ลดไขมัน':'fat loss','เพิ่มกล้าม':'muscle gain','สุขภาพทั่วไป':'general fitness','รักษาน้ำหนัก':'maintenance'}[th]||th; }
function _cuisineEn(th){ return {'ญี่ปุ่น':'Japanese','จีน':'Chinese','ตะวันตก':'Western','สะดวกซื้อ':'convenience-store','ไทย':'Thai'}[th]||th; }
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
function logKP(l){
  /* kcal/protein of one log entry — must match core logNut(): fx wins, else compute from ings */
  try{ if(fn('logNut')){ var n=window.logNut(l)||[]; return [num(n[0]),num(n[1])]; } }catch(e){}
  if(l&&l.fx) return [num(l.fx[0]),num(l.fx[1])];
  var t=[0,0], ing=ING();
  ((l&&l.ings)||[]).forEach(function(p){ var it=ing[p[0]]; if(!it||!it.v) return; var g=num(p[1]); t[0]+=num(it.v[0])*g/100; t[1]+=num(it.v[1])*g/100; });
  return t;
}
function todayCtx(){
  var u=curUser(); if(!u) return {empty:true};
  var d=todayDate(); var t={}; try{ t=window.target?window.target():{}; }catch(e){ t={}; }
  var s=S(); var logs=(s.logs||[]).filter(function(l){return l.user===u.id&&l.date===d;});
  var exs=(s.ex||[]).filter(function(x){return x.user===u.id&&x.date===d;});
  var eatenK=0,eatenP=0; logs.forEach(function(l){ var e=(l.eaten==null?1:l.eaten); var kp=logKP(l); eatenK+=kp[0]*e; eatenP+=kp[1]*e; });
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
  var s=S(); var clients=(s.users||[]).filter(function(u){return u.tr&&!u.removedAt;});
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
  food_swap:['แทนด้วยอะไร','ใช้อะไรแทน','เปลี่ยนเป็นอะไร','แทนได้','สลับวัตถุดิบ','เปลี่ยนวัตถุดิบ','substitute','swap ','replace','alternative'],
  cuisine_menu:['เมนูญี่ปุ่น','อาหารญี่ปุ่น','เมนูจีน','อาหารจีน','เมนูฝรั่ง','อาหารฝรั่ง','อาหารตะวันตก','เมนู 7-11','เมนูสะดวกซื้อ','เซเว่น','7-11','เมนูร้านสะดวกซื้อ','japanese','chinese','western','convenience'],
  budget_menu:['เมนูประหยัด','เมนูถูก','งบน้อย','เมนูงบ','ประหยัดเงิน','ราคาถูก','เมนูราคาประหยัด','cheap menu','budget meal','on a budget'],
  food_recommend:['กินอะไรดี','แนะนำเมนู','เมนูแนะนำ','แคลต่ำ','โปรตีนสูง','ลดไขมัน','หิว','อยากกิน','กินไรดี','เมนูอะไรดี','ขอเมนู','ไม่รู้จะกินอะไร','เบื่ออาหาร','มื้อนี้กินอะไร','ของว่าง','what to eat','recommend menu','low cal','high protein','suggest food','hungry','meal idea','snack idea'],
  food_search:['หาอาหาร','ค้นหาเมนู','มีเมนู','search food','find menu'],
  result_summary:['ผลลัพธ์','น้ำหนักตอนนี้','น้ำหนักลดไป','ดูน้ำหนัก','ลดไปกี่','ความคืบหน้า','กราฟ','รอบเอว','result','progress','my result','waist'],
  workout_recommend:['ออกกำลัง','ท่าฝึก','เล่นอะไร','เวท','คาร์ดิโอ','ดัมเบล','เล่นไรดี','ท่าอะไรดี','เบื่อท่าเดิม','ขอท่า','ลดพุง','ลดต้นขา','บริหาร','เล่นกล้าม','workout','exercise','train','cardio','weight training','move idea','what to train'],
  workout_plan:['จัดตาราง','จัดตารางฝึก','จัดตารางออกกำลัง','จัดตารางออกกำลังกาย','สร้างแผนฝึก','สร้างแผน','แผนฝึก','ตารางฝึก','โปรแกรมฝึก','จัดโปรแกรม','จัดแผนฝึก','ฝึกกี่วัน','กี่วันต่อสัปดาห์','วันต่อสัปดาห์','เริ่มออกกำลังกายยังไง','อยากออกกำลังกาย','ต่อสัปดาห์','แผนให้ลูกเทรน','สร้างแผนให้ลูก','โปรแกรมให้ลูกเทรน','push pull legs','push pull','upper lower','full body','ฟูลบอดี้','อัพเปอร์','พุชพูล','bro split','โบรสปลิต','ทำแผนออกกำลัง','ทำตารางออกกำลัง','ทำโปรแกรมออกกำลัง','ทำแผนฝึก','ทำตารางฝึก','ทำโปรแกรมฝึก','ทำแผนการเทรน','ทำตารางการเทรน','แผนออกกำลัง','ตารางออกกำลัง','โปรแกรมออกกำลัง','แผนการเทรน','แผนเทรน','ตารางเทรน','โปรแกรมเทรน','แผนการฝึก','ตารางการฝึก','วางแผนออกกำลัง','วางแผนฝึก','วางตารางฝึก','ขอตารางฝึก','ขอแผนฝึก','ขอโปรแกรมฝึก','ขอตารางออกกำลัง','อยากได้ตารางฝึก','อยากได้แผนฝึก','ช่วยจัดตาราง','ช่วยวางแผนฝึก','workout plan','training plan','training schedule','make a workout plan','build a plan','exercise plan','build a workout','create a workout','plan my workout','plan my training','workout routine','training program'],
  exercise_alternative:['ท่าแทน','ใช้อะไรแทน','ใช้ท่าอะไรแทน','ไม่มีดัมเบล','ไม่มีอุปกรณ์ใช้ท่า','แทนท่า','ท่าทดแทน','ท่าอื่นแทน','alternative exercise','substitute exercise','replace exercise','no dumbbell'],
  make_plan:['จัดแผนให้','ช่วยวางแผน','วางแผนลด','วางแผนเพิ่มกล้าม','ทำแผนลด','จัดโปรแกรม','จัดแผนอาหาร','วางแผนให้ฉัน','make a plan','help me plan','plan for me','build a plan'],
  calc_plan:['คำนวณแคล','คำนวณโปรตีน','ตั้งแคล','ควรกินกี่แคล','แคลเท่าไร','โปรตีนเท่าไหร่','โปรตีนกี่กรัม','กี่กรัม','มาโคร','macro','tdee','bmr','bmi','calorie target','คำนวณมาโคร','ควรตั้งแคล'],
  coach_workout:['ร่างโปรแกรม','โปรแกรมฝึกให้ลูกเทรน','ร่างโปรแกรมฝึก','จัดโปรแกรมฝึก','ตารางฝึกให้ลูกเทรน','โปรแกรมเวท','draft workout','workout program for','training program for'],
  coach_menu:['ร่างเมนู','จัดเมนูให้ลูกเทรน','เมนูให้ลูกเทรน','แผนอาหารลูกเทรน','ร่างแผนอาหาร','จัดเมนูทั้งวัน','เมนูทั้งวันให้ลูกเทรน','draft menu','meal plan for client','day menu for'],
  coach_progress:['สรุปลูกเทรน','วิเคราะห์ลูกเทรน','ความคืบหน้าลูกเทรน','สรุปลูกเทรนวันนี้','ใครน่าห่วง','ใครเสี่ยงหลุด','ภาพรวมลูกเทรน','progress client','client risk','who is at risk','clients overview'],
  coach_followup:['ติดตามลูกเทรน','ลูกเทรนที่ต้องติดตาม','ใครยังไม่ส่ง','ใครหาย','คนที่ต้องติดตาม','follow up','who to follow','inactive client','who hasn'],
  coach_homework_summary:['สรุปการบ้าน','ตรวจการบ้าน','การบ้านค้าง','ส่งการบ้าน','homework','to review','pending homework'],
  coach_templates:['ข้อความสำเร็จรูป','เทมเพลตข้อความ','ขอข้อความ','ช่วยพิมพ์ข้อความ','พิมพ์ข้อความหาลูกเทรน','ข้อความหาลูกเทรน','message template','templates','draft message'],
  coach_feedback:['เขียน feedback','feedback','ฟีดแบ็ก','คอมเมนต์ลูกเทรน','ชมลูกเทรน','เขียนคำชม','write feedback','give feedback'],
  coach_group_summary:['สรุปกลุ่ม','กิจกรรมกลุ่ม','ภารกิจกลุ่ม','กลุ่มไหน','group summary','group activity','mission'],
  app_help:['ใช้งาน','ทำยังไง','สอน','วิธี','เข้ากลุ่ม','บันทึกอาหาร','how to','how do i','tutorial','guide'],
  setup_help:['ตั้งค่า iu mate','เปิดใช้งาน','โหลดชุดความรู้','setup','settings iu mate'],
  share_result_text:['ข้อความแชร์','แคปชั่น','result card','แชร์ผลลัพธ์','caption','share text','share result'],
  find_place:['หายิม','หาฟิตเนส','หาที่ออกกำลัง','หาที่ออกกำลังกาย','หาสถานที่ออกกำลังกาย','หาสถานที่','หาที่เล่นกีฬา','ที่เล่นกีฬา','สถานที่เล่นกีฬา','ที่ออกกำลังกายใกล้','ที่ออกกำลังใกล้','สถานที่ออกกำลังกายใกล้','สถานที่ออกกำลัง','ที่ออกกำลังกาย','ใกล้ฉัน','ใกล้บ้าน','แถวนี้','แถวบ้าน','ในละแวก','ละแวกนี้','หาสนาม','สนามใกล้','place to work out','where to work out','place to exercise','where to exercise','sports facility','sports facilities','workout place','near me','nearby gym','gym near','gyms near','find a gym','find gym','fitness near','park near','ยิม','โรงยิม','ฟิตเนส','ฟิตเนสเซ็นเตอร์','ฟิตเนสใกล้','gym','fitness','fitness center','fitness centre','สระว่ายน้ำ','สระว่าย','สระ','swimming pool','swimming','pool','ลู่วิ่ง','ที่วิ่ง','สวนวิ่ง','จ๊อกกิ้ง','สวนสาธารณะ','สวนสุขภาพ','ศูนย์กีฬา','สนามกีฬา','สนาม','สเตเดียม','running track','jogging track','park','stadium','sports complex','sports center','sports centre','arena','สนามแบด','คอร์ทแบด','แบดมินตัน','แบด','badminton','badminton court','สนามฟุตบอล','สนามบอล','ฟุตบอล','ฟุตซอล','สนามฟุตซอล','football','futsal','soccer','soccer field','สนามบาส','บาสเกตบอล','บาส','basketball','basketball court','สนามเทนนิส','คอร์ทเทนนิส','เทนนิส','tennis','tennis court','โต๊ะปิงปอง','ปิงปอง','table tennis','สนามวอลเลย์','วอลเลย์บอล','volleyball','volleyball court','ตะกร้อ','สนามตะกร้อ','takraw','คอร์ท','court','ค่ายมวย','ยิมมวย','มวยไทย','ชกมวย','มวย','boxing gym','boxing','muay thai','muaythai','ยูโด','คาราเต้','เทควันโด','ศิลปะป้องกันตัว','judo','karate','taekwondo','martial arts','mma','ยิมเอ็มเอ็มเอ','โยคะ','คลาสโยคะ','สตูดิโอโยคะ','พิลาทิส','yoga','yoga studio','pilates','ครอสฟิต','crossfit','functional training','ปีนผา','ปีนหน้าผา','climbing gym','rock climbing','แอโรบิก','เต้นแอโรบิก','ซุมบ้า','สตูดิโอเต้น','zumba','aerobic','dance studio','สปินนิ่ง','ปั่นจักรยาน','cycling studio','spin class','สนามกอล์ฟ','ไดร์ฟกอล์ฟ','golf course','driving range','ลานสเก็ต','ลานน้ำแข็ง','ice skating','skate park','สวนแทรมโพลีน','แทรมโพลีน','trampoline park','ยิมนาสติก','gymnastics']
};
/* ============================ NLU v2: concept + co-occurrence model ============================ */
/* Concept weights: strong action/domain anchors = 3, domain nouns = 2, weak signals = 1 */
var C_WEIGHT={ MAKE:3,PLAN:3,LOG:3,CALC:3,SWAP:3,SPLIT:3,RESULT:3,PLACE:3,
  WORKOUT:2,FOOD:2,MEAL:2,INGREDIENT:2,CUISINE:2,BUDGET:2,EXERCISE:2,CLIENT:2,PROTEIN:2,CALORIE:2,WEIGHT:2,EQUIPMENT:2,RECOMMEND:2,HELP:2,HUNGRY:2,DAYS:2,
  GOAL_LOSE:1,GOAL_GAIN:1,TODAY:1,QUESTION:1,MORE:1,WANT:1,HAVE:1 };
/* surface form (post-synNorm, spaces removed) -> concept, or array for compounds */
var LEX2C={
  'จัดตาราง':['MAKE','PLAN','WORKOUT'],'ทำแผน':['MAKE','PLAN'],'ทำตาราง':['MAKE','PLAN'],'ทำโปรแกรม':['MAKE','PLAN'],'วางแผน':['MAKE','PLAN'],'วางตาราง':['MAKE','PLAN'],'เซ็ตแผน':['MAKE','PLAN'],'เซ็ตตาราง':['MAKE','PLAN'],'ออกแบบ':'MAKE','จัด':'MAKE','สร้าง':'MAKE','make':'MAKE','build':'MAKE','create':'MAKE','design':'MAKE',
  'แผน':'PLAN','ตาราง':'PLAN','โปรแกรม':'PLAN','plan':'PLAN','program':'PLAN','schedule':'PLAN','routine':'PLAN',
  'ออกกำลัง':'WORKOUT','ฝึก':'WORKOUT','เทรน':'WORKOUT','เวท':'WORKOUT','คาร์ดิโอ':'WORKOUT','บริหาร':'WORKOUT','เล่นกล้าม':'WORKOUT','เล่น':'WORKOUT','วิ่ง':'WORKOUT','workout':'WORKOUT','train':'WORKOUT','exercise':['WORKOUT','EXERCISE'],
  'กิน':'FOOD','อาหาร':'FOOD','เมนู':'FOOD','food':'FOOD','eat':'FOOD','menu':'FOOD',
  'มื้อ':'MEAL','ของว่าง':'MEAL','breakfast':'MEAL','lunch':'MEAL','dinner':'MEAL','snack':'MEAL','meal':['FOOD','MEAL'],
  'วัตถุดิบ':'INGREDIENT','ตู้เย็น':'INGREDIENT','ของที่มี':'INGREDIENT','ของเหลือ':'INGREDIENT','เหลืออะไร':'INGREDIENT','ingredient':'INGREDIENT','fridge':'INGREDIENT',
  'ญี่ปุ่น':'CUISINE','จีน':'CUISINE','ฝรั่ง':'CUISINE','เกาหลี':'CUISINE','อิตาเลียน':'CUISINE','เซเว่น':'CUISINE','สะดวกซื้อ':'CUISINE','japanese':'CUISINE','chinese':'CUISINE','korean':'CUISINE','western':'CUISINE','7-11':'CUISINE',
  'ประหยัด':'BUDGET','งบน้อย':'BUDGET','ราคาถูก':'BUDGET','budget':'BUDGET','cheap':'BUDGET',
  'ท่าฝึก':'EXERCISE','ท่าออกกำลัง':['EXERCISE','WORKOUT'],'ขอท่า':['RECOMMEND','EXERCISE'],'ท่าแทน':['EXERCISE','SWAP'],'ท่าอื่น':['EXERCISE','MORE'],'ท่าไหน':['EXERCISE','QUESTION'],'ท่าอะไร':['EXERCISE','QUESTION'],
  'ลูกเทรน':'CLIENT','ลูกค้า':'CLIENT','client':'CLIENT',
  'โปรตีน':'PROTEIN','เวย์':'PROTEIN','protein':'PROTEIN','whey':'PROTEIN',
  'แคล':'CALORIE','พลังงาน':'CALORIE','kcal':'CALORIE','calorie':'CALORIE',
  'น้ำหนัก':'WEIGHT','กิโล':'WEIGHT','weight':'WEIGHT',
  'บันทึก':'LOG','จด':'LOG','log':'LOG','track':'LOG','record':'LOG',
  'คำนวณ':'CALC','มาโคร':'CALC','tdee':'CALC','bmr':'CALC','bmi':'CALC','macro':'CALC','เหลือกี่แคล':['TODAY','CALORIE','QUESTION'],'กี่แคล':['CALC','CALORIE','QUESTION'],'กี่กรัม':['CALC','QUESTION'],
  'ทดแทน':'SWAP','แทน':'SWAP','สลับ':'SWAP','เปลี่ยนเป็น':'SWAP','swap':'SWAP','replace':'SWAP','substitute':'SWAP','alternative':'SWAP',
  'ppl':'SPLIT','pushpull':'SPLIT','upperlower':'SPLIT','fullbody':'SPLIT','ฟูลบอดี้':'SPLIT','ฟูลบอดี':'SPLIT','อัพเปอร์':'SPLIT','พุชพูล':'SPLIT','ดันดึงขา':'SPLIT','โบรสปลิต':'SPLIT',
  'ผลลัพธ์':'RESULT','ความคืบหน้า':'RESULT','กราฟ':'RESULT','progress':'RESULT','result':'RESULT',
  'ใกล้ฉัน':'PLACE','ใกล้บ้าน':'PLACE','แถวนี้':'PLACE','แถวบ้าน':'PLACE','ใกล้':'PLACE','nearby':'PLACE','nearme':'PLACE','หายิม':['PLACE','WORKOUT'],'หาฟิตเนส':['PLACE','WORKOUT'],
  'ดัมเบล':'EQUIPMENT','บาร์เบล':'EQUIPMENT','บอดี้เวท':'EQUIPMENT','อุปกรณ์':'EQUIPMENT','ยางยืด':'EQUIPMENT','dumbbell':'EQUIPMENT','barbell':'EQUIPMENT','bodyweight':'EQUIPMENT','equipment':'EQUIPMENT',
  'แนะนำ':'RECOMMEND','ขอ':'RECOMMEND','recommend':'RECOMMEND','suggest':'RECOMMEND',
  'วิธี':'HELP','สอน':'HELP','ใช้งาน':'HELP','howto':['HELP','QUESTION'],'tutorial':'HELP',
  'หิว':'HUNGRY','อยากกิน':['HUNGRY','FOOD'],'hungry':'HUNGRY',
  'วันต่อสัปดาห์':'DAYS','ต่อสัปดาห์':'DAYS','สัปดาห์ละ':'DAYS','ต่ออาทิตย์':'DAYS','อาทิตย์ละ':'DAYS','กี่วัน':['DAYS','QUESTION'],'perweek':'DAYS','aweek':'DAYS',
  'ลดไขมัน':'GOAL_LOSE','ลดน้ำหนัก':'GOAL_LOSE','ลดพุง':'GOAL_LOSE','ลดหุ่น':'GOAL_LOSE','ลดความอ้วน':'GOAL_LOSE','คัต':'GOAL_LOSE','fatloss':'GOAL_LOSE','cutting':'GOAL_LOSE',
  'เพิ่มกล้าม':'GOAL_GAIN','สร้างกล้าม':'GOAL_GAIN','เพิ่มน้ำหนัก':'GOAL_GAIN','บัลค์':'GOAL_GAIN','bulk':'GOAL_GAIN','muscle':'GOAL_GAIN',
  'วันนี้':'TODAY','ตอนนี้':'TODAY','today':'TODAY',
  'เพิ่มอีก':'MORE','อีก':'MORE','อื่น':'MORE','ใหม่':'MORE','another':'MORE','more':'MORE',
  'อยาก':'WANT','ต้องการ':'WANT','ช่วย':'WANT','ให้หน่อย':'WANT','want':'WANT',
  'มี':'HAVE','have':'HAVE',
  'คืออะไร':'QUESTION','ยังไง':'QUESTION','อย่างไร':'QUESTION','ทำไม':'QUESTION','ทำไง':'QUESTION','ดีไหม':'QUESTION','ไหม':'QUESTION','เท่าไหร่':'QUESTION','แค่ไหน':'QUESTION','อะไรดี':'QUESTION','ไรดี':'QUESTION','อะไร':'QUESTION','กี่':'QUESTION','ควร':'QUESTION','whatis':'QUESTION','why':'QUESTION','how':'QUESTION','shouldi':'QUESTION'
};

/* ===== English lexicon (near-AI EN NLU): merged into LEX2C (substring match, space-stripped) ===== */
var LEX2C_EN={
  'generate':'MAKE','giveme':['WANT','RECOMMEND'],'setup':['MAKE','PLAN'],'puttogether':['MAKE','PLAN'],
  'gym':'WORKOUT','lift':'WORKOUT','lifting':'WORKOUT','cardio':'WORKOUT','strength':'WORKOUT','hiit':'WORKOUT',
  'benchpress':'EXERCISE','bench':'EXERCISE','squat':'EXERCISE','deadlift':'EXERCISE','pushup':'EXERCISE','pullup':'EXERCISE','plank':'EXERCISE','lunge':'EXERCISE','curl':'EXERCISE','shoulderpress':'EXERCISE','legpress':'EXERCISE','bicep':'EXERCISE','tricep':'EXERCISE','abs':'EXERCISE',
  'diet':'FOOD','nutrition':'FOOD','recipe':'FOOD','dish':'FOOD','calories':'CALORIE','kcals':'CALORIE',
  'ingredients':'INGREDIENT','pantry':'INGREDIENT','leftover':'INGREDIENT','leftovers':'INGREDIENT',
  'italian':'CUISINE','thaifood':'CUISINE','conveniencestore':'CUISINE',
  'affordable':'BUDGET','lowcost':'BUDGET','onabudget':'BUDGET','cheapmeal':['BUDGET','FOOD'],
  'trainee':'CLIENT','trainees':'CLIENT','clients':'CLIENT','myclient':'CLIENT','myclients':'CLIENT','students':'CLIENT','mytrainee':'CLIENT',
  'calculate':'CALC','estimate':'CALC','maintenancecalories':['CALC','CALORIE'],'howmany':['CALC','QUESTION'],'howmuch':['CALC','QUESTION'],
  'journal':'LOG','logmy':'LOG','trackmy':'LOG','recordmy':'LOG',
  'switch':'SWAP','instead':'SWAP','swapout':'SWAP',
  'results':'RESULT','stats':'RESULT','summary':'RESULT','summarize':'RESULT','myprogress':'RESULT','trackprogress':['RESULT','LOG'],
  'gymnearme':['PLACE','WORKOUT'],'findgym':['PLACE','WORKOUT'],'closeby':'PLACE','aroundhere':'PLACE',
  'suggestion':'RECOMMEND','ideas':'RECOMMEND','anyideas':'RECOMMEND','mealideas':['FOOD','RECOMMEND'],'whattoeat':['FOOD','RECOMMEND'],'shouldieat':['FOOD','RECOMMEND'],'whatshouldieat':['FOOD','RECOMMEND'],
  'help':'HELP','howdoi':['HELP','QUESTION'],'howcani':['HELP','QUESTION'],'howto':['HELP','QUESTION'],'teachme':'HELP','showmehow':'HELP','guideme':'HELP','walkthrough':'HELP','walkme':'HELP','learnhow':'HELP','howdoiuse':['HELP','QUESTION'],'thisappdo':['HELP','QUESTION'],'usetheapp':'HELP','usethisapp':'HELP','whatcanthisapp':['HELP','QUESTION'],
  'loseweight':'GOAL_LOSE','losefat':'GOAL_LOSE','weightloss':'GOAL_LOSE','slimdown':'GOAL_LOSE','getlean':'GOAL_LOSE','leanout':'GOAL_LOSE','cutweight':'GOAL_LOSE',
  'gainmuscle':'GOAL_GAIN','buildmuscle':'GOAL_GAIN','gainweight':'GOAL_GAIN','bulking':'GOAL_GAIN','putonmuscle':'GOAL_GAIN','getbig':'GOAL_GAIN','muscles':'GOAL_GAIN',
  'else':'MORE','different':'MORE','other':'MORE',
  'need':'WANT','iwant':'WANT','canyou':'WANT','couldyou':'WANT','lookingfor':'WANT','helpme':['WANT','HELP'],
  'igot':'HAVE','gotsome':'HAVE',
  'whatcan':'QUESTION','whichone':'QUESTION','whatis':'QUESTION'
};
for(var _enk in LEX2C_EN){ if(!LEX2C[_enk]) LEX2C[_enk]=LEX2C_EN[_enk]; }

var LEX_KEYS=Object.keys(LEX2C).sort(function(a,b){ return b.length-a.length; });
/* false-friend guards: skip a lexicon hit when it is really part of another word */
var LEX_SKIP={ 'ขอ':['ของ','ขอบ'], 'กิน':['กินไป','กินแล้ว','กินครบ','กินเกิน'], 'มี':['มีนา'], 'จัด':['จัดการ'] };
function _lexSkip(t,k,idx){
  if(/^[a-z0-9]{1,3}$/.test(k) && idx>0 && /[a-z0-9]/.test(t.charAt(idx-1))) return true;
  var arr=LEX_SKIP[k]; if(arr){ for(var i=0;i<arr.length;i++){ if(t.substr(idx,arr[i].length)===arr[i]) return true; } }
  return false;
}
/* ---- negation ---- */
var NEGATORS=['ไม่เอา','ไม่อยาก','ไม่ต้อง','ไม่ใช่','ไม่ชอบ','ไม่กิน','ยกเลิก','เลิก','งด','หยุด','ห้าม','เว้น','ไม่','dont','not','no','skip','cancel','without','avoid'];
var NEG_EXCEPT=['ไม่รู้','ไม่แน่ใจ','ไม่มี','ไม่ไหว','ไม่ค่อย','notsure','noidea'];
var NEG_WINDOW=7;
function _isNegatedAt(t,idx){
  for(var i=0;i<NEGATORS.length;i++){
    var n=NEGATORS[i]; var p=t.lastIndexOf(n, idx-1);
    while(p>=0){
      var end=p+n.length;
      if(end<=idx){
        if(idx-end<=NEG_WINDOW){
          var blocked=false;
          if(/^[a-z]+$/.test(n)){
            if(p>0 && /[a-z0-9]/.test(t.charAt(p-1))) blocked=true;
            if(n.length<=2 && /[a-z]/.test(t.charAt(end)||'')) blocked=true;
          }
          if(!blocked){
            var exc=false;
            for(var j=0;j<NEG_EXCEPT.length;j++){ var x=NEG_EXCEPT[j]; var st=Math.max(0,p-x.length+1); var q=t.indexOf(x,st); if(q>=0 && q<=p && (q+x.length)>p){ exc=true; break; } }
            if(!exc) return true;
          }
        }
        break;
      }
      p=t.lastIndexOf(n, p-1);
    }
  }
  return false;
}
/* ---- concept extraction (longest-first, span-consuming, negation-aware) ---- */
function extractConcepts(t){
  var map={}, neg={}, used=[], i, k, idx;
  function overlaps(a,b){ for(var j=0;j<used.length;j++){ if(a<used[j][1] && b>used[j][0]) return true; } return false; }
  for(i=0;i<LEX_KEYS.length;i++){
    k=LEX_KEYS[i]; idx=t.indexOf(k);
    while(idx>=0){
      if(!overlaps(idx,idx+k.length) && !_lexSkip(t,k,idx)){
        used.push([idx,idx+k.length]);
        var cs=LEX2C[k]; if(Object.prototype.toString.call(cs)!=='[object Array]') cs=[cs];
        if(_isNegatedAt(t,idx)){ for(var c1=0;c1<cs.length;c1++) neg[cs[c1]]=1; }
        else { for(var c2=0;c2<cs.length;c2++){ var c=cs[c2], w=C_WEIGHT[c]||1; if(!map[c]||w>map[c]) map[c]=w; } }
      }
      idx=t.indexOf(k, idx+Math.max(1,k.length));
    }
  }
  if(Object.keys(map).length<2){ /* concept-level fuzzy only when signal is thin */
    for(i=0;i<LEX_KEYS.length;i++){ k=LEX_KEYS[i]; if(k.length<6) continue;
      var cf=LEX2C[k]; if(Object.prototype.toString.call(cf)!=='[object Array]') cf=[cf];
      if(map[cf[0]]||neg[cf[0]]) continue;
      if(trigCover(t,k)>=0.8){ for(var c3=0;c3<cf.length;c3++){ var cc2=cf[c3], w2=C_WEIGHT[cc2]||1; if(!map[cc2]||w2>map[cc2]) map[cc2]=w2; } if(Object.keys(map).length>=2) break; }
    }
  }
  return { map:map, neg:neg, list:Object.keys(map) };
}
/* ---- unified entity extraction ---- */
function extractEntities(raw){
  raw=(''+(raw==null?'':raw));
  var t=nluNorm(raw), rl=raw.toLowerCase();
  var e={kg:null,cm:null,kcal:null,grams:null,reps:null,minutes:null,days:null,age:null,wdays:[],goal:null,split:null,equip:null,equipIds:[],meal:null,sex:null,foods:[]};
  var m;
  m=t.match(/(\d{2,3}(?:\.\d)?)(กิโลกรัม|กิโล|กก|โล|kg)/); if(m) e.kg=parseFloat(m[1]);
  if(e.kg==null){ m=t.match(/(?:หนัก|น้ำหนัก|weight)(\d{2,3}(?:\.\d)?)/); if(m) e.kg=parseFloat(m[1]); }
  m=t.match(/(\d{2,3})(ซม|เซน|cm)/); if(m) e.cm=parseFloat(m[1]);
  if(e.cm==null){ m=t.match(/(?:ส่วนสูง|สูง|height)(\d{2,3})/); if(m) e.cm=parseFloat(m[1]); }
  m=t.match(/(\d{2,4})(kcal|แคล)/); if(m) e.kcal=parseFloat(m[1]);
  m=t.match(/(\d{1,4})กรัม/); if(m) e.grams=parseFloat(m[1]);
  m=t.match(/(\d{1,2})(ครั้ง|reps|rep)/); if(m) e.reps=parseFloat(m[1]);
  m=t.match(/(\d{1,3})(นาที|min)/); if(m) e.minutes=parseFloat(m[1]);
  m=t.match(/([1-7])(วัน|days|day)/); if(m) e.days=parseFloat(m[1]);
  m=t.match(/อายุ(\d{1,2})/)||t.match(/(\d{1,2})(ปี|ขวบ)/); if(m) e.age=parseFloat(m[1]);
  var _wdp=[['จันทร์',0],['อังคาร',1],['พุธ',2],['พฤหัส',3],['ศุกร์',4],['เสาร์',5],['วันอาทิตย์',6],['monday',0],['tuesday',1],['wednesday',2],['thursday',3],['friday',4],['saturday',5],['sunday',6]];
  for(var wi=0;wi<_wdp.length;wi++){ if(t.indexOf(_wdp[wi][0])>=0 && e.wdays.indexOf(_wdp[wi][1])<0) e.wdays.push(_wdp[wi][1]); }
  e.wdays.sort(function(a,b){return a-b;});
  if(/ลดไขมัน|ลดน้ำหนัก|ลดพุง|ลดหุ่น|ลดความอ้วน|คัต|fatloss|cutting/.test(t)) e.goal='lose';
  else if(/เพิ่มกล้าม|สร้างกล้าม|บัลค์|bulk|muscle|เพิ่มน้ำหนัก/.test(t)) e.goal='gain';
  else if(/รักษาน้ำหนัก|คงน้ำหนัก|maintain/.test(t)) e.goal='keep';
  else if(/ฟิตทั่วไป|สุขภาพ|แข็งแรง|generalfitness/.test(t)) e.goal='fit';
  if(/pushpullleg|ppl|พุชพูล|ดันดึงขา/.test(t)) e.split='ppl';
  else if(/upperlower|อัพเปอร์|บนล่าง/.test(t)) e.split='ul';
  else if(/fullbody|ฟูลบอดี|เล่นทั้งตัว/.test(t)) e.split='full';
  if(/ไม่มี(อุปกรณ์|ดัมเบล|บาร์เบล|เครื่อง|ยิม)|noequipment|บอดี้เวท|bodyweight|มือเปล่า|ที่บ้าน/.test(t)) e.equip='none';
  else if(/ดัมเบล|dumbbell/.test(t)) e.equip='dumbbell';
  else if(/ยิม|ฟิตเนส|gym/.test(t)) e.equip='full_gym';
  if(/มื้อเช้า|ตอนเช้า|อาหารเช้า|breakfast/.test(t)) e.meal='เช้า';
  else if(/กลางวัน|เที่ยง|lunch/.test(t)) e.meal='กลางวัน';
  else if(/มื้อเย็น|ตอนเย็น|อาหารเย็น|มื้อค่ำ|dinner/.test(t)) e.meal='เย็น';
  else if(/ของว่าง|snack/.test(t)) e.meal='ของว่าง';
  if(/ผู้หญิง|หญิง|ผญ|female|woman/.test(t)) e.sex='f';
  else if(/ผู้ชาย|ชาย|ผช/.test(t)||/\b(male|man)\b/.test(rl)) e.sex='m';
  try{ e.foods=findIngredientsInText(raw)||[]; }catch(e1){}
  try{ e.equipIds=_detectEquipIds(raw)||[]; }catch(e2){}
  return e;
}
/* ---- intent rules: any-of concepts + co-occurrence pair bonuses + blockers (halve) ---- */
var INTENT_RULES={
  today_summary:{ any:['TODAY'], pairs:[['TODAY','CALORIE',2],['TODAY','QUESTION',1]] },
  ingredient_recipe_generate:{ any:['INGREDIENT'], pairs:[['INGREDIENT','HAVE',2],['INGREDIENT','MAKE',2],['INGREDIENT','FOOD',2],['HAVE','FOOD',1]] },
  food_swap:{ any:['SWAP'], pairs:[['SWAP','FOOD',3],['SWAP','INGREDIENT',3]], block:['EXERCISE','WORKOUT'] },
  cuisine_menu:{ any:['CUISINE'], pairs:[['CUISINE','FOOD',4],['CUISINE','RECOMMEND',2],['CUISINE','HUNGRY',2]] },
  budget_menu:{ any:['BUDGET'], pairs:[['BUDGET','FOOD',3],['BUDGET','RECOMMEND',2]] },
  food_recommend:{ any:['FOOD','HUNGRY','MEAL'], pairs:[['FOOD','RECOMMEND',4],['FOOD','TODAY',3],['FOOD','QUESTION',1],['MEAL','RECOMMEND',2],['FOOD','GOAL_LOSE',1],['FOOD','GOAL_GAIN',1],['FOOD','PROTEIN',1],['MAKE','FOOD',3],['PLAN','FOOD',3],['WANT','FOOD',1]], block:['SWAP','CUISINE','BUDGET','INGREDIENT','LOG','CALC','CLIENT'] },
  result_summary:{ any:['RESULT'], pairs:[['RESULT','WEIGHT',2],['RESULT','TODAY',1],['WEIGHT','QUESTION',2]] },
  workout_recommend:{ any:['WORKOUT','EXERCISE'], pairs:[['WORKOUT','RECOMMEND',2],['EXERCISE','RECOMMEND',2],['WORKOUT','TODAY',3],['EXERCISE','TODAY',3],['WORKOUT','QUESTION',1],['EXERCISE','QUESTION',1]], block:['MAKE','PLAN','LOG','SWAP','PLACE','CALC','CLIENT'] },
  workout_plan:{ any:['WORKOUT','SPLIT','DAYS'], pairs:[['MAKE','WORKOUT',4],['PLAN','WORKOUT',4],['MAKE','SPLIT',3],['PLAN','SPLIT',3],['DAYS','WORKOUT',3],['PLAN','DAYS',2],['SPLIT','DAYS',2],['WANT','WORKOUT',1]], block:['FOOD','MEAL','SWAP','LOG','PLACE'] },
  exercise_alternative:{ any:[], pairs:[['SWAP','EXERCISE',6],['SWAP','WORKOUT',5],['EXERCISE','EQUIPMENT',3],['SWAP','EQUIPMENT',3]] },
  make_plan:{ any:['MAKE','PLAN'], pairs:[['MAKE','PLAN',1],['MAKE','GOAL_LOSE',3],['PLAN','GOAL_LOSE',3],['MAKE','GOAL_GAIN',3],['PLAN','GOAL_GAIN',3],['PLAN','CALORIE',2],['MAKE','WEIGHT',1]], block:['WORKOUT','FOOD','MEAL','CLIENT','SPLIT','RESULT'] },
  calc_plan:{ any:['CALC'], pairs:[['CALC','CALORIE',3],['CALC','PROTEIN',3],['CALC','WEIGHT',2],['CALC','QUESTION',1],['CALORIE','QUESTION',3],['PROTEIN','QUESTION',3],['CALORIE','GOAL_LOSE',1]] },
  log_food:{ any:['LOG'], pairs:[['LOG','FOOD',3],['LOG','MEAL',3],['LOG','CALORIE',2],['LOG','TODAY',1]], block:['WEIGHT','RESULT','WORKOUT','HELP'] },
  app_help:{ any:['HELP'], pairs:[['HELP','LOG',3],['HELP','FOOD',1],['HELP','WORKOUT',1],['HELP','QUESTION',1]] },
  find_place:{ any:['PLACE'], pairs:[['PLACE','WORKOUT',2],['PLACE','QUESTION',1]] },
  coach_menu:{ any:[], pairs:[['CLIENT','FOOD',4],['CLIENT','MEAL',3]] },
  coach_workout:{ any:[], pairs:[['CLIENT','WORKOUT',4],['CLIENT','PLAN',3],['CLIENT','SPLIT',3]] },
  coach_progress:{ any:[], pairs:[['CLIENT','RESULT',4]] }
};
var NLU_T={ ACCEPT:6, MARGIN:3, CLARIFY_MIN:3, LEGACY_FLIP:4 };
function _entBoost(intent,e){
  var b=0; if(!e) return 0;
  if(intent==='workout_plan'){ if(e.days)b+=1; if(e.split)b+=2; if(e.equip)b+=1; if(e.wdays&&e.wdays.length)b+=1; }
  if(intent==='ingredient_recipe_generate' && e.foods && e.foods.length>=2) b+=5;
  if((intent==='make_plan'||intent==='calc_plan') && e.kg && e.cm) b+=2;
  if(intent==='food_recommend' && e.meal) b+=1;
  return b;
}
function scoreIntentsV2(cc, ents, mode, tab){
  var res={best:'unknown',bestScore:0,second:'unknown',secondScore:0};
  var has=cc.map;
  Object.keys(INTENT_RULES).forEach(function(intent){
    var r=INTENT_RULES[intent], sc=0, i;
    if(r.any){ for(i=0;i<r.any.length;i++){ if(has[r.any[i]]) sc+=C_WEIGHT[r.any[i]]||1; } }
    if(r.pairs){ for(i=0;i<r.pairs.length;i++){ var p=r.pairs[i]; if(has[p[0]]&&has[p[1]]) sc+=p[2]; } }
    if(sc>0 && r.block){ for(i=0;i<r.block.length;i++){ if(has[r.block[i]]){ sc=sc/2; break; } } }
    if(has['HELP']){ if(intent==='app_help'){ sc+=5; } else if(intent!=='setup_help' && sc>0){ sc=sc/2; } }
    if(has['CLIENT'] && intent.indexOf('coach')===0){ sc+=4; }
    if(sc>0 || intent==='ingredient_recipe_generate') sc+=_entBoost(intent,ents);
    if(sc>0){
      if((tab==='food') && intent.indexOf('food')>=0) sc+=1;
      if((tab==='food') && intent==='ingredient_recipe_generate') sc+=1;
      if((tab==='body'||tab==='stats') && intent==='result_summary') sc+=1;
      if(mode==='coach' && intent.indexOf('coach')===0) sc+=2;
    }
    if(sc>res.bestScore){ res.second=res.best; res.secondScore=res.bestScore; res.best=intent; res.bestScore=sc; }
    else if(sc>res.secondScore){ res.second=intent; res.secondScore=sc; }
  });
  return res;
}
/* question detector: informational questions only (recommendation-style "อะไรดี" excluded) */
var _Q_RE=/คืออะไร|คือไร|ยังไง|อย่างไร|ทำไม|ทำไง|ต่างกัน|เทียบ|ดีไหม|ดีหรือไม่|ดีกว่า|ใช่ไหม|จริงไหม|จำเป็นไหม|ควรไหม|ได้ไหม|whatis|whatare|whydo|why|howto|howdo|howmuch|howmany|shouldi|isit|explain/;
var _REC_RE=/อะไรดี|ไรดี|อันไหนดี|ตัวไหนดี|เมนูไหนดี|แบบไหนดี|ท่าไหนดี/;
/* ---- clarify options (chips send a canonical query through the normal pipeline) ---- */
var CLARIFY_OPT={
  workout_plan:{label:L('🏋️ จัดตารางฝึก','🏋️ Build a workout plan'),q:L('จัดตารางฝึกให้หน่อย','build a workout plan')},
  workout_recommend:{label:L('💪 แนะนำท่าออกกำลัง','💪 Workout ideas'),q:L('แนะนำท่าออกกำลังกายหน่อย','recommend a workout')},
  food_recommend:{label:L('🍽️ แนะนำเมนู','🍽️ Menu ideas'),q:L('แนะนำเมนูหน่อย','recommend menu')},
  make_plan:{label:L('🎯 วางแผนแคล/มาโคร','🎯 Plan my calories'),q:L('ช่วยวางแผนแคลให้หน่อย','help me plan for me')},
  calc_plan:{label:L('🧮 คำนวณ TDEE','🧮 Calculate TDEE'),q:L('คำนวณแคลที่ควรกิน','tdee')},
  today_summary:{label:L('📊 สรุปวันนี้','📊 Today summary'),q:L('สรุปวันนี้ให้หน่อย','summary today')},
  result_summary:{label:L('📈 ดูผลลัพธ์','📈 My results'),q:L('ขอดูผลลัพธ์','my result')},
  ingredient_recipe_generate:{label:L('🧺 จัดเมนูจากของที่มี','🧺 Cook from my fridge'),q:L('จัดเมนูจากของที่มี','recipe from what i have')},
  log_food:{label:L('📝 วิธีบันทึกอาหาร','📝 How to log food'),q:L('บันทึกอาหารยังไง','how to log food')}
};
function _defaultClarify(first){
  var base=['workout_plan','food_recommend','calc_plan','today_summary'];
  var out=[]; if(first && CLARIFY_OPT[first]) out.push(first);
  for(var i=0;i<base.length;i++){ if(out.indexOf(base[i])<0) out.push(base[i]); }
  return out.slice(0,4);
}
function buildClarifyReply(list){
  var acts=[]; (list||[]).forEach(function(k){ var o=CLARIFY_OPT[k]; if(o) acts.push({label:o.label,action:'_chip',payload:{q:o.q}}); });
  if(!acts.length){ _defaultClarify(null).forEach(function(k){ var o=CLARIFY_OPT[k]; if(o) acts.push({label:o.label,action:'_chip',payload:{q:o.q}}); }); }
  return { title:L('ให้ช่วยเรื่องไหนดีครับ?','What can I help with?'),
    message:L('ผมยังไม่แน่ใจว่าหมายถึงเรื่องไหน แตะเลือกด้านล่าง หรือพิมพ์รายละเอียดเพิ่มอีกนิดได้เลยครับ','I am not quite sure what you meant — tap an option below, or add a little more detail.'),
    actions:acts, _intent:'clarify' };
}
/* ---- entity -> flow-seed mapping (only fills what the legacy seeders leave empty) ---- */
function _seedMerge(base, extra){ base=base||{}; if(extra){ for(var k in extra){ if(extra[k]!=null && base[k]==null) base[k]=extra[k]; } } return base; }
function _entsToWorkoutSeed(e){ e=e||{}; var s={};
  if(e.goal==='lose') s.goal='fat_loss'; else if(e.goal==='gain') s.goal='muscle_gain'; else if(e.goal==='fit'||e.goal==='keep') s.goal='general_fitness';
  if(e.days) s.days=e.days; if(e.split) s.split=e.split; if(e.equip) s.equip=e.equip;
  if(e.wdays && e.wdays.length) s.wdays=e.wdays.slice();
  return s;
}
function _entsToPlanSeed(e){ e=e||{}; var s={};
  if(e.kg) s.w=e.kg; if(e.cm) s.h=e.cm; if(e.age) s.age=e.age; if(e.sex) s.sex=e.sex;
  if(e.goal==='lose'||e.goal==='gain'||e.goal==='keep') s.goal=e.goal;
  return s;
}
/* ---- legacy keyword scorer (unchanged scoring; now also tracks 2nd-best) ---- */
function _scoreIntentsScored(text, mode, tab, fuzzy){
  var best='unknown', bestScore=0, second='unknown', secondScore=0;
  Object.keys(INTENT_KW).forEach(function(intent){
    var sc=0; INTENT_KW[intent].forEach(function(k){ var kk=synNorm(k); if(text.indexOf(kk)>=0) sc+=2; else if(fuzzy && kk.length>=6 && trigCover(text,kk)>=0.66) sc+=1; });
    if(sc>0){
      if((tab==='food') && intent.indexOf('food')>=0) sc+=1;
      if((tab==='food') && intent==='ingredient_recipe_generate') sc+=1;
      if((tab==='body'||tab==='stats') && intent==='result_summary') sc+=1;
      if(mode==='coach' && intent.indexOf('coach')===0) sc+=2;
    }
    if(sc>bestScore){ second=best; secondScore=bestScore; bestScore=sc; best=intent; }
    else if(sc>secondScore){ second=intent; secondScore=sc; }
  });
  return { best:best, bestScore:bestScore, second:second, secondScore:secondScore };
}
function _scoreIntents(text, mode, tab, fuzzy){ var r=_scoreIntentsScored(text,mode,tab,fuzzy); return r.bestScore>0?r.best:'unknown'; }
/* ---- NLU v2 entry point: merge concept model + legacy floor (LEGACY_FLIP regression guard) ---- */
function detectIntentEx(message){
  var raw=(''+(message==null?'':message));
  var text=nluNorm(raw), mode=role(), tab=window.TAB||'';
  var cc=extractConcepts(text);
  var ents=extractEntities(raw);
  var v2=scoreIntentsV2(cc,ents,mode,tab);
  var lg=_scoreIntentsScored(text,mode,tab,false);
  if(lg.bestScore<=0){ var lf=_scoreIntentsScored(text,mode,tab,true); if(lf.bestScore>0) lg=lf; }
  var intent, score;
  if(lg.bestScore>0 && lg.best!==v2.best){
    /* v2 may override legacy only when confident AND legacy is not overwhelmingly stronger */
    var _coachHold=(mode==='coach' && lg.best.indexOf('coach')===0 && v2.best.indexOf('coach')!==0); /* keep coach drafting flows */
    var _planHold=(lg.best==='workout_plan' && v2.best==='make_plan'); /* ambiguous "สร้างแผน/จัดโปรแกรม" stays a workout plan */
    if(!_coachHold && !_planHold && v2.bestScore>=NLU_T.ACCEPT && lg.bestScore<v2.bestScore+NLU_T.LEGACY_FLIP){ intent=v2.best; score=v2.bestScore; }
    else { intent=lg.best; score=Math.max(lg.bestScore,v2.bestScore); }
  } else if(lg.bestScore>0){ intent=lg.best; score=lg.bestScore+v2.bestScore; }
  else if(v2.bestScore>=NLU_T.CLARIFY_MIN){ intent=v2.best; score=v2.bestScore; }
  else { intent='unknown'; score=v2.bestScore; }
  if(intent==='unknown' && ents.foods && ents.foods.length>=2){ intent='ingredient_recipe_generate'; score=Math.max(score,NLU_T.ACCEPT); } /* bare ingredient list */
  var question=_Q_RE.test(text) && !_REC_RE.test(text);
  var clarify=null;
  if(lg.bestScore<=0 && !(ents.foods && ents.foods.length>=2)){
    if(v2.bestScore>=NLU_T.ACCEPT){
      if(v2.second!=='unknown' && v2.best!==v2.second && (v2.bestScore-v2.secondScore)<NLU_T.MARGIN && CLARIFY_OPT[v2.best] && CLARIFY_OPT[v2.second]) clarify=[v2.best,v2.second];
    } else if(v2.bestScore<NLU_T.CLARIFY_MIN && cc.list.length){ clarify=_defaultClarify(CLARIFY_OPT[v2.best]?v2.best:null); }
  }
  return { intent:intent, score:score, v2score:v2.bestScore, v2intent:v2.best, second:v2.second, legacyScore:lg.bestScore, legacyIntent:lg.best,
    concepts:cc.map, negated:cc.neg, entities:ents, question:question, clarify:clarify };
}
function detectIntent(message){ try{ return detectIntentEx(message).intent; }catch(e){ return 'unknown'; } }

/* ============================ knowledge DB (bilingual) ============================ */
var KNOWLEDGE = [
  { id:'workout_plan_general_intro', cat:'workout', kw:['จัดตารางออกกำลังกาย','ช่วยจัดแผนฝึก','ออกกำลังกายยังไงดี','เริ่มออกกำลังกาย','ตารางฝึก','workout plan','how to start working out'],
    title:L('IU MATE จัดตารางฝึกให้ได้','IU MATE can build a workout plan'),
    answer:L('IU MATE ช่วยสร้างตารางฝึกพื้นฐานจากเป้าหมาย ระดับ อุปกรณ์ และจำนวนวันที่อยากฝึกได้ครับ ลองพิมพ์ "จัดตารางฝึกให้หน่อย" แล้วบอกเป้าหมาย/จำนวนวัน/อุปกรณ์','IU MATE can build a basic workout plan from your goal, level, equipment and training days. Type "build a workout" and tell me your goal/days/equipment.'),
    actions:[{label:L('จัดตารางฝึกให้หน่อย','Build a workout'),action:'_chip',payload:{q:L('จัดตารางฝึกให้หน่อย','build a workout plan')}}] },
  { id:'workout_plan_coach_priority', cat:'workout', kw:['มีโค้ชแล้ว','แผนโค้ช','เปลี่ยนแผน','โค้ชส่งแผน'],
    title:L('แผนจากโค้ชมาก่อน','Coach plan comes first'),
    answer:L('ถ้าคุณมีแผนจากโค้ชอยู่แล้ว IU MATE จะช่วยอธิบายแผนและเตือนวันฝึก แต่จะไม่เปลี่ยนแผนเองโดยไม่ปรึกษาโค้ชก่อนครับ','If you already have a coach plan, IU MATE explains it and reminds training days, but will not change it without asking your coach first.') },
  { id:'workout_plan_safety', cat:'safety', kw:['เจ็บตอนฝึก','ปวดตอนเล่น','ออกกำลังแล้วเจ็บ','บาดเจ็บตอนฝึก'],
    title:L('ความปลอดภัยตอนฝึก','Training safety'),
    answer:L('ถ้ามีอาการเจ็บหรือผิดปกติระหว่างฝึก ให้หยุดท่าที่ทำให้เจ็บก่อน แล้วปรึกษาแพทย์/โค้ช/ผู้เชี่ยวชาญครับ แผนของ IU MATE เป็นคำแนะนำพื้นฐาน ไม่ใช่คำแนะนำทางการแพทย์','If you feel pain or anything unusual during training, stop that move and consult a doctor/coach/professional. IU MATE plans are basic guidance, not medical advice.') },
  { id:'app_overview', cat:'app_help', kw:['ทำอะไรได้บ้าง','มีหน้าอะไร','ฟีเจอร์','แนะนำฟีเจอร์','สอนใช้งานทั้งหมด','สอนใช้แอป','สอนใช้งานแอป','ภาพรวมแอป','แอปมีอะไร','หน้าไหนทำอะไร','what can this app do','features','app overview','all features','use the app','how to use the app','get started','app tour'],
    title:L('IUFIT ทำอะไรได้บ้าง (ภาพรวมทุกหน้า)','What IUFIT can do (all pages)'),
    answer:L('IUFIT มี 5 หน้าหลักที่แถบล่าง แตะเข้าแต่ละหน้าได้เลย:\n\n📊 วันนี้ — สรุปแคล/โปรตีนที่เหลือ, บันทึกน้ำดื่ม, บันทึกน้ำหนัก/สัดส่วน, ทางลัดที่ต้องทำวันนี้\n🍽️ อาหาร — "บันทึกอาหาร" (ลงมื้อที่กิน), "ตารางอาหาร" (วางแผนมื้อรายสัปดาห์), "คลังเมนู" 4,500+ เมนู\n🏋️ ท่าฝึก — "ตารางฝึก" (แผนออกกำลังรายวัน) และ "คลังท่า" (ท่าเวท/คาร์ดิโอพร้อมวิธีเล่น) + บันทึกการฝึก\n📈 ผลลัพธ์ — กราฟน้ำหนัก/รอบเอว/ไขมัน และสร้าง "การ์ดผลลัพธ์" ไว้แชร์\n👥 โค้ช — เข้าเป็นลูกเทรน (สแกน QR โค้ช), รับแผน, ส่งการบ้าน, แชทกับโค้ช\n\n💡 อยากให้สอนหน้าไหนละเอียด พิมพ์ได้เลย เช่น "สอนบันทึกอาหาร" หรือ "สอนใช้ตารางฝึก"','IUFIT has 5 main tabs at the bottom:\n\n📊 Today — remaining calories/protein, log water, log weight/measurements, shortcuts.\n🍽️ Food — "Log food", "Meal plan" (weekly), "Menu library" 4,500+ items.\n🏋️ Workout — "Schedule" (daily plan) and "Move library" (weights/cardio with how-to) + log workouts.\n📈 Results — weight/waist/fat charts and shareable "result card".\n👥 Coach — join a coach (scan QR), get plans, send homework, chat.\n\n💡 Ask me to teach any page, e.g. "how to log food".'),
    actions:[{label:L('เปิดวันนี้','Open Today'),action:'go_today'},{label:L('เปิดอาหาร','Open Food'),action:'go_food'},{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'},{label:L('เปิดผลลัพธ์','Open Results'),action:'go_result'},{label:L('เปิดโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_log_water', cat:'app_help', kw:['ดื่มน้ำ','บันทึกน้ำดื่ม','น้ำดื่ม','เพิ่มน้ำ','water','drink water','hydration'],
    title:L('วิธีบันทึกน้ำดื่ม','How to log water'),
    answer:L('บันทึกน้ำดื่ม:\n1) เปิดหน้า "วันนี้"\n2) ที่การ์ดน้ำดื่ม กดปุ่ม + ทุกครั้งที่ดื่ม 1 แก้ว\n3) เป้าหมาย 8–10 แก้ว/วัน (หลอดจะเต็มขึ้นเรื่อย ๆ)','On Today there\'s a water card — tap + for each glass (goal 8–10/day).'),
    actions:[{label:L('ไปหน้าวันนี้','Open Today'),action:'go_today'}] },
  { id:'how_to_log_body', cat:'app_help', kw:['น้ำหนัก','สัดส่วน','บันทึกร่างกาย','วัดรอบ','body','weight','measurement'],
    title:L('วิธีบันทึกน้ำหนัก/สัดส่วน','How to log weight & measurements'),
    answer:L('บันทึกน้ำหนัก/สัดส่วน:\n1) เปิดหน้า "วันนี้" กดทางลัด "บันทึกร่างกาย"\n2) ใส่น้ำหนัก / รอบเอว / % ไขมัน\n3) กดบันทึก แล้วดูกราฟความก้าวหน้าที่หน้า "ผลลัพธ์"\n💡 แก้ไขรายการเดิมได้จากประวัติในหน้าผลลัพธ์','On the Today page, tap the Log body shortcut to enter weight/waist/body fat, then view your progress charts on Results (edit past entries from the Results history).'),
    actions:[{label:L('ไปหน้าวันนี้','Open Today'),action:'go_today'}] },
  { id:'how_to_result_card', cat:'app_help', kw:['การ์ดผลลัพธ์','สร้างการ์ด','แชร์ผล','การ์ดแชร์','ผลลัพธ์','ดูผลลัพธ์','ดูกราฟ','กราฟ','ความคืบหน้า','result card','make card','share progress','progress card','view results'],
    title:L('วิธีสร้างการ์ดผลลัพธ์','How to make a result card'),
    answer:L('หน้า "ผลลัพธ์" ดูความก้าวหน้า + สร้างการ์ดแชร์:\n1) เปิดแท็บ "ผลลัพธ์" เห็นกราฟน้ำหนัก/รอบเอว/% ไขมัน ตามช่วงเวลา\n2) กด "สร้างการ์ด" เพื่อได้รูปสรุปสวย ๆ\n3) กดแชร์ลงโซเชียลหรือส่งให้โค้ช/เพื่อน\n💡 บันทึกน้ำหนัก/สัดส่วนที่หน้า "วันนี้" กราฟจะอัปเดตให้เอง','On Results, tap make a card to get a shareable progress image.'),
    actions:[{label:L('เปิดผลลัพธ์','Open Results'),action:'go_result'}] },
  { id:'how_to_meal_plan', cat:'app_help', kw:['ตารางอาหาร','วางแผนอาหาร','แผนมื้อ','meal plan','food plan','plan meals','meals','use meal plan','food schedule'],
    title:L('วิธีวางแผนอาหาร','How to plan meals'),
    answer:L('วางแผนมื้อล่วงหน้า — แท็บ "อาหาร" มี 2 มุมมองด้านบน: 📅 "ตารางอาหาร" (แผนรายมื้อ) และ 📚 "คลังเมนู" (4,500+ เมนู)\nวิธีวางแผน:\n1) แตะแท็บ "อาหาร" → เลือกมุมมอง "ตารางอาหาร"\n2) เลือกวัน แล้วแตะมื้อที่จะวางแผน\n3) เพิ่มเมนูจากคลัง — ใช้ช่องค้นหา, ชิปกรองด่วน (ทั้งหมด/เมนูไทย/คลีน-ฟิต/โปรตีนสูง/แคลต่ำ) หรือปุ่ม "ตัวกรอง" กรองละเอียด\n4) ปุ่มลัดในคลังเมนู: เมนูโปรด ❤ · ✨ AI เพิ่มเมนู · 📷 บาร์โค้ด · วัตถุดิบ\n💡 อยากให้ผมจัดเมนูให้เลย พิมพ์ "จัดแผนอาหารลดไขมัน/เพิ่มกล้ามให้หน่อย"','Plan meals ahead — the "Food" tab has 2 views: "Meal plan" and "Menu library" (4,500+). 1) Food → "Meal plan". 2) Pick a day, tap a meal. 3) Add menus via search, quick-filter chips (All/Thai/Clean-fit/High-protein/Low-cal) or the "Filter" button. 4) Library shortcuts: Favorites ❤, ✨ AI add, 📷 barcode, ingredients.'),
    actions:[{label:L('เปิดอาหาร','Open Food'),action:'go_food'},{label:L('✏️ สอนบันทึกอาหารด้วย','Teach logging too'),action:'_chip',payload:{q:L('สอนบันทึกอาหาร','how to log food')}}] },
  { id:'how_to_menu_library', cat:'app_help', kw:['คลังเมนู','เมนูทั้งหมด','ค้นเมนู','เพิ่มเมนู','เพิ่มวัตถุดิบ','ai เมนู','menu library','add menu','add ingredient'],
    title:L('คลังเมนู & เพิ่มเมนูเอง','Menu library & adding menus'),
    answer:L('คลังเมนู & เพิ่มเมนูเอง:\n1) แตะแท็บ "อาหาร" → เลือก "คลังเมนู"\n2) ค้นจากเมนู/วัตถุดิบกว่า 4,500 รายการ (พิมพ์ชื่อ)\n3) แตะเมนูเพื่อดูแคล/โปรตีน แล้วกดเพิ่มเข้ามื้อ\n4) ไม่มีเมนูที่ต้องการ? กด "เพิ่มเมนูเอง" กรอกค่าโภชนาการ หรือให้ AI ช่วยแจกแจงวัตถุดิบ+โภชนาการ','Pick "Menu library" in Food — browse 4,500+ menus & ingredients, or add your own / let AI break them down.'),
    actions:[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] },
  { id:'how_to_missions', cat:'app_help', kw:['ภารกิจ','mission','challenge','ตราสะสม','badge','collection','พิเศษ','special','กรอบ','frame','ความสำเร็จ','milestone','คะแนน','points','fit points','ลีดเดอร์บอร์ด','leaderboard'],
    title:L('ความสำเร็จ · ภารกิจ · คะแนน FIT','Milestones, missions & FIT Points'),
    answer:L('หน้าวันนี้มีการ์ด "ความสำเร็จ" 🏆 ติดตามไมล์สโตนจริง (วันบันทึกต่อเนื่อง ออกกำลังกาย สตรีคดีที่สุด ชั่งน้ำหนัก) ทำต่อเนื่องเพื่อปลดล็อกเป็นขั้น · ในกลุ่มโค้ชมี คะแนน FIT + ลีดเดอร์บอร์ด (ได้แต้มจากภารกิจที่ทำสำเร็จ + กิจกรรมประจำวัน) · ตราสะสม (badge) เป็นของสะสมเสริม 240 แบบ + พิเศษ 30 นำมาทำกรอบรูปโปรไฟล์ได้ · โค้ชสร้างภารกิจให้ลูกเทรนที่แท็บภารกิจ','The Today page has a "Milestones" 🏆 card tracking real milestones (days logged, workouts, best streak, weigh-ins) — stay consistent to unlock tiers. Coach groups have FIT Points + a leaderboard (from completed missions + daily activity). Badges are optional collectibles (240 + 29 Special) you can equip as a profile frame. Coaches create client missions in the Missions tab.'),
    actions:[{label:L('เปิดแท็บโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_join_coach', cat:'app_help', kw:['เข้าร่วมโค้ช','เป็นลูกเทรน','สแกน qr','สแกนคิวอาร์','รหัสโค้ช','เข้ากลุ่มโค้ช','qr จากรูป','อ่าน qr','join coach','scan qr','coach code','become a client','qr from image'],
    title:L('เริ่มเทรนกับโค้ช (สแกน/อ่าน QR)','Start with a coach (scan/read QR)'),
    answer:L('แตะแท็บ โค้ช → ปุ่ม เริ่มเทรนกับโค้ช แล้วสแกน QR ของโค้ช หรือกรอกรหัสโค้ช · ถ้าโค้ชส่ง QR มาเป็นรูปภาพ ใช้ปุ่ม 🖼️ อ่าน QR จากรูปภาพ เพื่อเลือกรูปแล้วเข้าร่วมได้เลย (ไม่ต้องซื้อแพ็กเอง โค้ชให้สิทธิ์ผ่านที่นั่ง)','Tap the Coach tab → Start with a coach, then scan the coach QR or enter the coach code. If the coach sent the QR as an image, use the 🖼️ Read QR from an image button to pick the photo and join — no purchase needed, the coach grants a seat.'),
    actions:[{label:L('เปิดแท็บโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_share_app', cat:'app_help', kw:['แชร์แอป','ชวนเพื่อน','แนะนำแอป','share app','invite friend','tell a friend'],
    title:L('วิธีแชร์แอปให้เพื่อน','How to share IUFIT'),
    answer:L('อยากบอกต่อ ส่งลิงก์ iufit.com ให้เพื่อนได้เลยครับ เพื่อนเปิดลิงก์แล้วเริ่มใช้ฟรีได้ทันที','Want to share IUFIT? Just send the link iufit.com — friends open it and start free right away.'),
    actions:[] },
  { id:'how_to_referral', cat:'app_help', kw:['ชวนเทรนเนอร์','รับโปรฟรี','referral','invite coach','pro ฟรี','วันฟรี'],
    title:L('ชวนเทรนเนอร์ รับ Pro ฟรี','Invite coaches for free Pro'),
    answer:L('โค้ชชวนเพื่อนเทรนเนอร์ได้ที่การ์ด "ชวนเพื่อนเทรนเนอร์" บนหน้าโฮม เมื่อเพื่อนสมัครด้วย Email OTP สร้างบัญชีเทรนเนอร์ ตั้งโปรไฟล์โค้ช และเริ่ม Pro Trial รับสิทธิ์ใช้งานเพิ่ม +7 วันต่อ 1 คน (สูงสุด 4 คน/เดือน สะสมได้ถึง 60 วัน) — ช่วงนี้ยังไม่มีรางวัลจากการที่เพื่อนจ่ายเงิน','Coaches can invite trainer friends from the "Invite coaches" card on Home. When a friend signs up via Email OTP, creates a trainer account, completes their coach profile and starts the Pro trial, you get +7 access days per person (up to 4/month, accumulate up to 60 days). No paid-conversion reward for now.'),
    actions:[{label:L('เปิดหน้าชวนเพื่อน','Open invite page'),action:'open_referral'}] },
  { id:'how_to_upgrade', cat:'app_help', kw:['อัปเกรด','แพ็กเกจ','ราคา','สมัครแพ็ก','upgrade','pricing','package','subscribe','trainer pro'],
    title:L('แพ็กเกจ & อัปเกรด','Plans & upgrading'),
    answer:L('ดูและเลือกแพ็กเกจได้ที่ ตั้งค่า → แพ็กเกจของฉัน มีทั้งฟรี, Trainer Starter, Trainer Pro และ Studio (ทดลอง Pro ฟรี 30 วันได้)','See plans in Settings → My package — Free, Trainer Starter, Trainer Pro and Studio (30-day free Pro trial available).'),
    actions:[{label:L('ดูแพ็กเกจ','See plans'),action:'open_pricing'}] },
  { id:'how_to_settings_profile', cat:'app_help', kw:['ตั้งค่า','โปรไฟล์','แก้โปรไฟล์','เปลี่ยนรูป','settings','profile','edit profile'],
    title:L('แก้โปรไฟล์ & ตั้งค่า','Profile & settings'),
    answer:L('แก้ข้อมูลส่วนตัว รูปโปรไฟล์ เป้าหมาย และภาษา ได้ที่ ตั้งค่า → โปรไฟล์ของฉัน','Edit your info, photo, goal and language in Settings → My profile.'),
    actions:[{label:L('ไปตั้งค่า','Open Settings'),action:'go_settings'}] },
  { id:'how_to_backup', cat:'app_help', kw:['สำรอง','backup','กู้คืน','restore','export','ย้ายเครื่อง'],
    title:L('สำรอง & กู้คืนข้อมูล','Backup & restore'),
    answer:L('ที่ตั้งค่ามีสำรอง/ส่งออกข้อมูล และกู้คืนจากไฟล์ .json รวมถึงแบ็กอัปอัตโนมัติรายวันในเครื่อง','Settings has backup/export, restore from .json, plus daily auto-backups on your device.'),
    actions:[{label:L('ไปตั้งค่า','Open Settings'),action:'go_settings'}] },
  { id:'how_to_tour', cat:'app_help', kw:['ทัวร์','tour','เริ่มทัวร์','แนะนำการใช้งานเบื้องต้น','walkthrough','เริ่มต้นใช้แอป'],
    title:L('ดูทัวร์แนะนำการใช้งาน','Take the app tour'),
    answer:L('ผมพาทัวร์ทีละปุ่มได้เลย หรือดูศูนย์ช่วยเหลือในตั้งค่า มีคำถามอะไรถามผมได้ทุกเมื่อครับ','I can walk you through button by button, or see the Help Center in Settings — ask me anytime!'),
    actions:[{label:L('เริ่มทัวร์','Start tour'),action:'open_tour'}] },
  { id:'coach_overview', cat:'app_help', kw:['สอนใช้ฝั่งโค้ช','ฟีเจอร์โค้ช','โหมดโค้ช','สอนโค้ช','สอนใช้โค้ช','เมนูโค้ช','coach features','coach mode','coach overview'],
    title:L('ภาพรวมโหมดโค้ช (ทุกแท็บ)','Coach mode overview'),
    answer:L('โหมดโค้ชมี 4 แท็บหลัก:\n🏠 โฮม — แดชบอร์ด, แชร์ QR รับลูกเทรน, สร้างภารกิจ, สลับโหมดส่วนตัว↔โค้ช\n👥 ลูกเทรน — ส่งแผนอาหาร/ฝึกรายคน, เปิดคอร์ส PT (นับครั้ง), ติดตามแต่ละคน\n📥 การบ้าน — ลูกเทรนส่งการบ้าน (อาหาร/ฝึก/ร่างกาย/น้ำ) มาที่นี่ ตรวจ+ให้ฟีดแบ็ก\n🏷️ กลุ่ม — สร้างกลุ่ม เชิญด้วย QR/รหัส จัดชาเลนจ์+ลีดเดอร์บอร์ด\n💡 กดปุ่มด้านล่างให้ผมพาทัวร์โหมดโค้ชได้เลย','Coach mode has 4 tabs: 🏠 Home (dashboard, share QR, missions, switch mode), 👥 Clients (send plans, PT courses, track each), 📥 Homework (review & feedback), 🏷️ Groups (create, invite, challenges).'),
    actions:[{label:L('เปิดโหมดโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_coach_clients', cat:'app_help', kw:['สอนใช้แท็บลูกเทรน','วิธีใช้แท็บลูกเทรน','ดูลูกเทรนรายคน','ส่งแผนให้ลูกเทรน','แท็บลูกเทรน','clients tab'],
    title:L('วิธีใช้แท็บลูกเทรน','Using the Clients tab'),
    answer:L('แท็บ "ลูกเทรน" (โหมดโค้ช): แตะชื่อลูกเทรนเพื่อดูข้อมูล/เป้าหมาย/ประวัติ · ส่งแผนอาหารหรือตารางฝึกรายคน · เปิดคอร์ส PT แบบนับครั้ง · ติดตามความคืบหน้าแต่ละคน\n💡 กดปุ่มพาทัวร์เพื่อไฮไลต์บนจอจริง','Clients tab: tap a client to view info/goals/history, send meal or workout plans, open a PT session course, track progress.'),
    actions:[{label:L('เปิดแท็บลูกเทรน','Open Clients'),action:'go_clients'}] },
  { id:'how_to_coach_homework', cat:'app_help', kw:['สอนใช้แท็บการบ้าน','วิธีตรวจการบ้าน','ตรวจการบ้านลูกเทรน','แท็บการบ้าน','ให้ฟีดแบ็กการบ้าน','homework tab','review homework','check homework','homework'],
    title:L('วิธีตรวจการบ้าน (แท็บการบ้าน)','Reviewing homework'),
    answer:L('แท็บ "การบ้าน" (โหมดโค้ช): ลูกเทรนส่งการบ้านรายวัน (อาหาร/ฝึก/ร่างกาย/น้ำ) เข้ามาที่นี่ · แตะเพื่อดู แล้วให้ฟีดแบ็กกลับ · บันทึกเข้าประวัติลูกเทรนอัตโนมัติ\n💡 กดปุ่มพาทัวร์เพื่อดูบนจอจริง','Homework tab: clients send daily homework (food/workout/body/water) — tap to review and reply with feedback.'),
    actions:[{label:L('เปิดแท็บการบ้าน','Open Homework'),action:'go_homework'}] },
  { id:'how_to_coach_invite', cat:'app_help', kw:['เชิญลูกเทรน','รับลูกเทรน','แชร์ qr โค้ช','เพิ่มลูกเทรน','สอนเพิ่มลูกเทรน','qr โค้ช','invite client','coach qr'],
    title:L('เชิญ/รับลูกเทรน (แชร์ QR)','Invite clients (share QR)'),
    answer:L('รับลูกเทรนใหม่ (โหมดโค้ช → แท็บโฮม): กด "แชร์ QR" เพื่อได้ QR/ลิงก์/รหัสโค้ช ส่งให้ลูกเทรน · ลูกเทรนสแกน QR แล้วยืนยันเข้าร่วม (ใช้ที่นั่งของคุณ ไม่ต้องซื้อแพ็กเอง)\n💡 กดปุ่มพาทัวร์เพื่อไฮไลต์ปุ่มแชร์ QR','Get new clients (Coach → Home): tap "Share QR" to get your QR/link/code; the client scans and joins using your seat.'),
    actions:[{label:L('เปิดโหมดโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'coach_send_plan', cat:'app_help', kw:['ส่งแผน','ส่งตาราง','send plan','assign plan'],
    title:L('โค้ช: ส่งแผนให้ลูกเทรน','Coach: send a plan'),
    answer:L('โค้ชเปิดแท็บลูกเทรน เลือกลูกเทรน ตั้งแผนอาหาร/ท่าฝึก/เป้าหมาย แล้วกดส่งแผน (ลูกเทรนต้องสแกน QR โค้ชก่อน)','Coaches open Clients, pick a client, set meal/workout/goal, then send (client must scan your Coach QR first).'),
    actions:[{label:L('เปิดลูกเทรน','Open Clients'),action:'go_clients'}] },
  { id:'coach_course', cat:'app_help', kw:['คอร์ส','นับครั้ง','คอร์สเทรน','session pack','course','count sessions','กี่ครั้ง'],
    title:L('โค้ช: คอร์สนับครั้ง','Coach: training course'),
    answer:L('ในโปรไฟล์ลูกเทรนรายคน กดสร้างคอร์ส ใส่จำนวนครั้งที่ซื้อ แต่ละครั้งกด "บันทึกการเทรน" ลูกเทรนยืนยัน แล้วนับ X/N เห็นทั้งสองฝั่ง · แก้ไข/ลบคอร์สได้จากปุ่มในการ์ด เมื่อครบกดจบคอร์สเพื่อเก็บประวัติ','In a client\'s profile, create a course with total sessions — tap "log session" each time, the client confirms, and X/N shows on both sides. Edit or delete a course from the card buttons; Finish archives a completed one.'),
    actions:[{label:L('เปิดลูกเทรน','Open Clients'),action:'go_clients'}] },
  { id:'coach_profile', cat:'app_help', kw:['โปรไฟล์โค้ช','รูปโค้ช','ชื่อแบรนด์','แบรนด์โค้ช','coach profile','coach photo','brand name'],
    title:L('โปรไฟล์โค้ช (แยกจากส่วนตัว)','Coach profile (separate)'),
    answer:L('ตั้งค่า → โปรไฟล์โค้ช ตั้งรูป ชื่อแบรนด์ ความเชี่ยวชาญ และประสบการณ์ (ปี) แยกจากโปรไฟล์ส่วนตัว ข้อมูลนี้แสดงที่หน้าโฮมโค้ช การ์ดผลลัพธ์ และหน้าคำเชิญที่ลูกเทรนเห็นตอนสแกน QR (ถ้าไม่ตั้ง จะใช้รูป/ชื่อส่วนตัวแทน)','Settings then Coach profile lets you set a brand photo, name, expertise and years of experience separate from your personal profile — shown on the coach home, result cards, and the invite screen clients see when scanning your QR (falls back to personal if unset).'),
    actions:[{label:L('เปิดตั้งค่า','Open Settings'),action:'go_settings'}] },
  { id:'coach_groups', cat:'app_help', kw:['สร้างกลุ่ม','กลุ่มเทรน','create group','group'],
    title:L('โค้ช: สร้างกลุ่ม','Coach: create a group'),
    answer:L('โค้ชสร้างกลุ่มได้ที่แท็บกลุ่ม ดึงลูกเทรนเข้ากลุ่ม ตั้งภารกิจกลุ่ม เปิดแชทกลุ่ม และดูอันดับได้','Coaches create groups in the Groups tab — add clients, set group missions, group chat, and see rankings.'),
    actions:[{label:L('เปิดกลุ่ม','Open Groups'),action:'go_groups'}] },
  { id:'how_to_log_food', cat:'app_help', kw:['บันทึกอาหาร','เพิ่มอาหาร','ลงอาหาร','จดอาหาร','บันทึกมื้อ','สอนบันทึกอาหาร','จำนวนจาน','ปรับปริมาณ','กี่จาน','ปรับจาน','ครึ่งจาน','จานใหญ่','ปริมาณที่กิน','log food','add food','food log','record food','portion','servings'],
    title:L('วิธีบันทึกอาหาร','How to log food'),
    answer:L('บันทึกอาหารที่กินไปแล้ว (อยู่แท็บ "วันนี้"):\n1) ที่มื้อที่ต้องการ (เช้า/กลางวัน/เย็น/ว่าง) กดปุ่ม "+ บันทึก"\n2) หาเมนูได้ 3 ทาง:\n   • ค้นจาก "คลังเมนู" แล้วแตะเมนู = เพิ่มเข้ารายการทันที\n   • กรอกวัตถุดิบ + กรัม เอง แล้วกดปุ่ม ➕\n   • กดปุ่ม ✨ ให้ AI แตกวัตถุดิบ+โภชนาการให้\n3) ปรับปริมาณที่กิน 2 แบบ:\n   • ตามจาน → เลือก "ครึ่งจาน / จานใหญ่ / จำนวนชิ้น"\n   • ตามวัตถุดิบ → แตะรายการที่เพิ่ม แล้วแก้กรัมของวัตถุดิบนั้น\n4) ครบแล้วกด "บันทึก" — แคล/โปรตีนรวมเข้ามื้อ และแถบเทียบเป้าด้านบนอัปเดตเอง','Log food you ate (Today tab): 1) On a meal tap "+ Log". 2) Find it: search "Menu library" (tap to add), or type ingredients+grams and tap ➕, or tap ✨ for AI. 3) Adjust amount 2 ways — by plate ("half/large/pieces") or by ingredient (tap an added item to edit grams). 4) Tap "Save".'),
    actions:[{label:L('เปิดวันนี้','Open Today'),action:'go_today'},{label:L('📋 สอนใช้ตารางอาหารด้วย','Teach meal plan too'),action:'_chip',payload:{q:L('สอนใช้ตารางอาหาร','how to use meal plan')}}] },
  { id:'how_to_join_group', cat:'app_help', kw:['เข้ากลุ่ม','qr','สแกน','join group','scan'],
    title:L('วิธีเข้าเป็นลูกเทรน','How to join a coach'),
    answer:L('เข้าเป็นลูกเทรนของโค้ช:\n1) ขอ QR โค้ด จากโค้ชของคุณ\n2) แตะแท็บ "โค้ช" แล้วสแกน QR (อ่าน QR จากรูปในเครื่องก็ได้)\n3) หน้าคำเชิญจะโชว์โปรไฟล์โค้ช (ชื่อ/รูป/ความเชี่ยวชาญ) — ติ๊กยินยอมให้โค้ชดูข้อมูลสุขภาพ\n4) กดยืนยันเข้าร่วม จากนั้นรับแผนและส่งการบ้านได้','Scanning your coach QR shows an invite screen with the coach profile (name/photo/expertise); tick consent to let the coach view your health data, then confirm — after that you can receive plans and send homework.'),
    actions:[{label:L('เปิดหน้าโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_log_workout', cat:'app_help', kw:['บันทึกท่าฝึก','จดท่าฝึก','บันทึกออกกำลัง','บันทึกการฝึกวันนี้','บันทึกฝึกวันนี้','log workout','log exercise','add workout'],
    title:L('วิธีบันทึกท่าฝึก (หน้าวันนี้)','How to log a workout (Today)'),
    answer:L('บันทึกการฝึกของวันนี้ที่การ์ด "บันทึกวันนี้" บนหน้าแรก:\n1) แตะปุ่ม "ท่าฝึก"\n2) พิมพ์ค้นหาท่า (คลังท่าเด้งขึ้นตามส่วนร่างกาย) หรือเลือกจากคลัง\n3) ใส่ น้ำหนัก × ครั้ง × เซ็ต · ถ้าคาร์ดิโอ ใส่ความเร็ว/เวลา + ปุ่มประมาณแคล\n4) กด ＋ เพิ่มได้หลายท่า แล้วกด "บันทึก"\nรายการจะเข้าหน้าวันนี้ทันที แตะเพื่อแก้ได้','Log today’s workout from the "Log today" card on the home page:\n1) tap "Workout".\n2) search a move (the library pops up by body part) or pick one.\n3) enter weight × reps × sets; for cardio use speed/time + the calorie estimate.\n4) tap ＋ to add more, then Save.\nIt logs to Today instantly — tap to edit.'),
    actions:[{label:L('บันทึกท่าฝึกเลย','Log a workout'),action:'go_today'}] },
  { id:'how_to_workout_plan', cat:'app_help', kw:['ตารางฝึก','ตารางท่าฝึก','ดูตารางฝึก','คลังท่า','จัดตารางฝึก','ทำตารางฝึก','วางแผนฝึก','สอนตารางฝึก','สอนใช้ตารางฝึก','workout schedule','workout plan'],
    title:L('วิธีใช้ตารางฝึก','How to use the workout plan'),
    answer:L('แท็บ "ท่าฝึก" มี 2 ส่วนด้านบน: 📋 "ตารางฝึก" (แผนรายวัน) และ 📚 "คลังท่า"\nจัดตาราง + เพิ่มท่า:\n1) เข้า "ตารางฝึก" — แต่ละวันมีปุ่ม "＋ เพิ่มท่า"\n2) กด "＋ เพิ่มท่า" → คลังท่าเด้งขึ้น พิมพ์ที่ช่อง "ค้นหาท่า..." หรือเลือกตามหมวด · ไม่มีก็ "เพิ่มด่วน" ได้\n3) ที่แต่ละท่า: แตะ ▶ ดูวิดีโอสอน · แตะ ✏️ แก้ "น้ำหนัก × ครั้ง × เซ็ต"\n4) กด "บันทึกลงการฝึกวันนี้" — ทุกท่าในตารางวันนี้เข้ารายการวันนี้อัตโนมัติ (แก้ได้ที่หน้าแรก)','The "Workout" tab has 2 parts: "Schedule" (daily plan) and "Move library". 1) Open "Schedule" — each day has "＋ Add move". 2) Tap it → the library opens; search or pick a category (or quick-add). 3) Per move: tap ▶ for a video, ✏️ to edit weight × reps × sets. 4) Tap "Log today’s workout" — every move in today’s plan is logged to today automatically (editable on the home page).'),
    actions:[{label:L('เปิดตารางฝึก','Open Workout'),action:'go_workout'},{label:L('🗓️ จัดตารางฝึกให้เลย','Build my plan'),action:'_chip',payload:{q:L('จัดตารางฝึกให้หน่อย','build a workout plan')}}] },
  { id:'how_to_formcheck', cat:'app_help', kw:['เช็กฟอร์ม','ส่งคลิป','อัดวิดีโอ','คลิปท่า','ฟอร์ม','form check','check form','send clip','video form'],
    title:L('ส่งคลิปให้โค้ชเช็กฟอร์ม','Send a clip for form check'),
    answer:L('ส่งคลิปหรือรูปท่าฝึกให้โค้ชทางแชทได้เลย — เปิดแชทกับโค้ช แล้วกดปุ่มรูปข้างช่องพิมพ์ โค้ชเปิดดูแล้วให้ฟีดแบ็กกลับได้ (คลิปลบอัตโนมัติใน 24 ชม.)','Send a clip or photo of your form to your coach in chat — open the coach chat and tap the image button next to the input; your coach views it and replies with feedback (clips auto-delete in 24h).'),
    actions:[{label:L('เปิดหน้าโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_chat_media', cat:'app_help', kw:['ส่งรูปในแชท','ส่งวิดีโอในแชท','แนบรูป','แนบวิดีโอ','chat photo','chat video','send image chat'],
    title:L('ส่งรูป/วิดีโอในแชท','Send a photo/video in chat'),
    answer:L('ในแชทมีปุ่มรูปอยู่ข้างช่องพิมพ์ข้อความ แตะเพื่อส่งรูปหรือวิดีโอให้โค้ช/กลุ่มได้ (ไฟล์ลบอัตโนมัติใน 24 ชม.)','In any chat there is an image button next to the message box — tap it to send a photo or video to your coach/group (files auto-delete in 24h).'),
    actions:[{label:L('เปิดหน้าโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_leave_coach', cat:'app_help', kw:['ออกจากโค้ช','เลิกเป็นลูกเทรน','ยกเลิกโค้ช','เลิกติดตามโค้ช','leave coach','unfollow coach','stop coach'],
    title:L('ออกจากการเป็นลูกเทรน','Leave your coach'),
    answer:L('แท็บโค้ช → การ์ด "โค้ชของคุณ" แตะกากบาทสีแดงด้านขวาของปุ่มซิงค์ แล้วยืนยัน — แผน/ตารางที่ได้มาก่อนหน้ายังอยู่กับคุณ','Coach tab, "Your coach" card: tap the red x to the right of Sync and confirm — plans you already received stay with you.'),
    actions:[{label:L('เปิดหน้าโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_equipment', cat:'app_help', kw:['เครื่องยิม','รู้จักเครื่อง','เครื่องออกกำลังกาย','gym equipment','machine','สมิธ','เคเบิล'],
    title:L('จัดตารางจากเครื่องในฟิตเนส','Plan from gym machines'),
    answer:L('บอกผมได้เลยว่าฟิตเนสมีเครื่องอะไร เช่น "มีสมิธแมชชีนกับเคเบิล จัดตารางให้หน่อย" ผมรู้จักเครื่อง 46 ชนิดทั้งชื่อไทย/อังกฤษ จัดตารางจากอุปกรณ์ที่มี และแนะนำท่าแทนเมื่อไม่มีเครื่องได้','Tell me what machines your gym has, e.g. "I have a Smith machine and cable, build me a plan." I know 46 machines in Thai/English, plan around what you have, and suggest substitutes when one is missing.'),
    actions:[{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'}] },
  { id:'food_not_found', cat:'nutrition', kw:['หาเมนูไม่เจอ','ไม่มีเมนู','ไม่เจอเมนู','เพิ่มเมนูเอง','เมนูไม่มีในระบบ','menu not found','cant find food','add custom food'], title:L('หาเมนูไม่เจอ','Menu not found'), answer:L('ถ้ายังไม่พบเมนูนี้ในคลัง ลองเลือกเมนูที่ใกล้เคียง หรือเพิ่มเมนูใหม่โดยกรอกค่าโภชนาการเองได้ครับ (IU Mate ยังไม่ประเมินค่าโภชนาการของเมนูใหม่อัตโนมัติ)','If a menu is not in the library, pick a similar item or add a new one by entering its nutrition manually. (IU Mate does not auto-estimate nutrition for new menus.)'), actions:[{label:L('ไปหน้าอาหาร','Open Food'),action:'go_food'}] },
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
    answer:L('กดปุ่มด้านล่างเพื่อเปิดตัวสร้างการ์ดผลลัพธ์ได้เลย เลือกแบบการ์ด ใส่รูป/ข้อมูล แล้วบันทึกหรือแชร์','Tap below to open the result card builder — pick a template, add photo/data, then save or share.'),
    actions:[{label:L('สร้างการ์ดผลลัพธ์','Create result card'),action:'open_result_card'},{label:L('เปิดผลลัพธ์','Open Results'),action:'go_result'}] },
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
  { id:'cardio_amount', cat:'workout', kw:['คาร์ดิโอแค่ไหน','คาร์ดิโอเท่าไหร่','คาร์ดิโอตอนเช้า','คาร์ดิโอตอนไหน','คาร์ดิโอกี่นาที','คาร์ดิโอดีไหม','how much cardio','morning cardio','when to do cardio'], title:L('คาร์ดิโอควรทำแค่ไหน','How much cardio'), answer:L('ทั่วไป 150 นาที/สัปดาห์ของคาร์ดิโอปานกลาง หรือ 20-30 นาทีต่อครั้ง สลับกับเวท ไม่ต้องมากจนล้า','Around 150 min/week of moderate cardio, or 20-30 min per session alternating with weights — no need to overdo it.') },
  { id:'recovery', cat:'workout', kw:['พักฟื้น','พักผ่อน','recovery','rest day'], title:L('การพักฟื้นสำคัญแค่ไหน','Why recovery matters'), answer:L('กล้ามโตตอนพัก ไม่ใช่ตอนฝึก นอนให้พอ 7-8 ชม. มีวันพัก และกินโปรตีนพอ เพื่อให้ฟื้นตัวและไปต่อได้','Muscle grows during rest, not training. Sleep 7-8h, take rest days, eat enough protein to recover and keep going.') },
  { id:'new_client', cat:'coach', kw:['ลูกเทรนใหม่','เริ่มลูกเทรน','new client','onboard client'], title:L('ลูกเทรนใหม่ควรเริ่มยังไง','Starting a new client'), answer:L('เริ่มจากเก็บข้อมูลพื้นฐานและเป้าหมาย ตั้งแผนง่าย ๆ ที่ทำได้จริง แล้วชวนบันทึก 3-5 วันแรกให้ติดเป็นนิสัย','Start by gathering basics and goals, set a simple realistic plan, then nudge them to log for the first 3-5 days to build the habit.'), actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] },
  { id:'weight_stall', cat:'coach', kw:['น้ำหนักไม่ลง','ตันน้ำหนัก','weight stall','plateau'], title:L('ลูกเทรนน้ำหนักไม่ลงดูอะไร','Client weight not dropping'), answer:L('เช็กความสม่ำเสมอของการบันทึก ปริมาณจริงที่กิน การนอน ความเครียด และน้ำ บางครั้งรอบเอวลดแม้น้ำหนักนิ่ง ใช้หลายตัวชี้วัด','Check logging consistency, true intake, sleep, stress and water. Sometimes waist drops even when weight stalls — use multiple metrics.') },
  { id:'quiet_group', cat:'coach', kw:['กลุ่มเงียบ','กระตุ้นกลุ่ม','quiet group','group engagement'], title:L('กลุ่มเงียบควรทำอะไร','Re-engaging a quiet group'), answer:L('ตั้งภารกิจกลุ่มสั้น ๆ ที่ทำง่าย ชวนแชร์ผลรายสัปดาห์ หรือถามคำถามเปิดในแชทกลุ่ม สร้างจังหวะให้คนกลับมามีส่วนร่วม','Set a short easy group mission, invite weekly result sharing, or ask an open question in group chat to bring people back.'), actions:[{label:L('สร้างภารกิจกลุ่ม','New mission'),action:'go_missions'}] },
  { id:'when_followup', cat:'coach', kw:['ติดตามเมื่อไร','ควรทักเมื่อไหร่','when to follow up'], title:L('ควรติดตามลูกเทรนเมื่อไร','When to follow up'), answer:L('ทักเมื่อขาดบันทึก 2-3 วัน หรือมีการบ้านค้าง ใช้ข้อความสั้น ให้กำลังใจ และถามแบบตอบง่าย อย่ารอจนหลุดแผนไปไกล','Reach out after 2-3 missed log days or pending homework. Keep it short, encouraging and easy to answer — do not wait until they have fully dropped off.'), actions:[{label:L('สร้างข้อความติดตาม','Draft follow-up'),action:'create_followup_message'}] },
   { id:'how_to_log_water', cat:'app_help', kw:['บันทึกน้ำดื่ม','ดื่มน้ำ','เพิ่มน้ำ','log water','track water','add water'], title:L('วิธีบันทึกน้ำดื่ม','How to log water'), answer:L('หน้าวันนี้มีแก้วน้ำ แตะเพื่อเพิ่ม/ลดทีละแก้ว (1 แก้ว = 250 มล. เป้า 10 แก้ว/วัน)','On Today there are water glasses — tap to add or remove one glass (1 glass = 250 ml, goal 10/day).'), actions:[{label:L('เปิดหน้าวันนี้','Open Today'),action:'go_today'}] },
   { id:'how_to_log_weight', cat:'app_help', kw:['บันทึกน้ำหนัก','ลงน้ำหนัก','วัดสัดส่วน','รอบเอว','log weight','body measurement'], title:L('วิธีบันทึกน้ำหนัก/สัดส่วน','How to log weight'), answer:L('หน้าแรก (วันนี้) กดทางลัด บันทึกร่างกาย ใส่น้ำหนัก รอบเอว หรือ % ไขมัน แล้วดูกราฟความคืบหน้าในหน้าผลลัพธ์','On the Today page, tap the Log body shortcut to add weight, waist or body fat, then see your progress chart on Results.'), actions:[{label:L('ไปหน้าวันนี้','Open Today'),action:'go_today'}] },
   { id:'how_to_share_result', cat:'app_help', kw:['แชร์ผลลัพธ์','การ์ดผลลัพธ์','result card','share progress'], title:L('วิธีสร้างการ์ดผลลัพธ์','Make a result card'), answer:L('หน้าผลลัพธ์มีปุ่มสร้างการ์ด เลือกวันและเทมเพลต แล้วบันทึกรูปไปแชร์ได้เลย','On Results, tap create card, pick a date and template, then save the image to share.'), actions:[{label:L('สร้างการ์ดผลลัพธ์','Create result card'),action:'open_result_card'}] },
   { id:'change_language', cat:'app_help', kw:['เปลี่ยนภาษา','ภาษาอังกฤษ','english','switch language'], title:L('เปลี่ยนภาษา','Change language'), answer:L('ไปที่ตั้งค่า แล้วเลือกภาษาไทยหรืออังกฤษ ทั้งแอปจะเปลี่ยนตาม','Go to Settings and choose Thai or English — the whole app switches.') },
   { id:'install_app', cat:'app_help', kw:['ติดตั้งแอป','ลงหน้าจอ','add to home','install','ออฟไลน์','offline'], title:L('ติดตั้งลงหน้าจอ','Install to home screen'), answer:L('เปิดเมนูเบราว์เซอร์แล้วเลือกเพิ่มลงหน้าจอหลัก จะใช้แบบเต็มจอและออฟไลน์ได้','Open the browser menu and choose Add to Home Screen — it runs full-screen and works offline.') },
   { id:'backup_restore', cat:'app_help', kw:['สำรองข้อมูล','กู้คืน','backup','restore','ย้ายเครื่อง'], title:L('สำรอง/กู้คืนข้อมูล','Backup and restore'), answer:L('ในตั้งค่ามีสำรองข้อมูลในเครื่องอัตโนมัติรายวัน และเมื่อยืนยันอีเมลจะสำรอง/กู้คืนบนคลาวด์อัตโนมัติ เพื่อย้ายเครื่องได้','Settings has automatic daily local backup, plus email cloud backup/restore so you can move devices.') },
   { id:'set_goal', cat:'app_help', kw:['ตั้งเป้าหมาย','เปลี่ยนเป้า','set goal','change goal'], title:L('ตั้ง/เปลี่ยนเป้าหมาย','Set or change goal'), answer:L('แก้เป้าหมาย (ลดไขมัน คงไว้ หรือเพิ่มกล้าม) ในโปรไฟล์ แอปจะปรับเป้าแคลและมาโครให้อัตโนมัติ','Change your goal (fat loss, maintain, or muscle gain) in your profile — calorie and macro targets update automatically.'), actions:[{label:L('คำนวณแคล/มาโคร','Calorie & macros'),action:'open_calc'}] },
   { id:'about_iu_mate', cat:'app_help', kw:['iu mate คือ','คุณคือใคร','ผู้ช่วยคือ','who are you','what can you do','ช่วยอะไรได้'], title:L('IU Mate ช่วยอะไรได้บ้าง','What IU Mate can do'), answer:L('ผมเป็นผู้ช่วยในแอป ช่วยสรุปวันนี้ แนะนำเมนู คำนวณแคล/มาโคร หาสถานที่ออกกำลังกาย ดูผลลัพธ์ และพาใช้งานแอปได้เร็วขึ้น','I am your in-app helper — I summarize your day, suggest menus, calculate calories/macros, find places to work out, review results, and help you use the app faster.') },
   { id:'carbs_basic', cat:'nutrition', kw:['คาร์บ','กินคาร์บ','แป้ง','carbs','carbohydrate'], title:L('คาร์โบไฮเดรตควรกินยังไง','Carbs basics'), answer:L('คาร์บเป็นพลังงานหลัก เน้นเชิงซ้อน เช่น ข้าวกล้อง ธัญพืช ผลไม้ ผัก ปรับปริมาณตามกิจกรรมและเป้าหมาย','Carbs are your main energy. Favor complex sources like brown rice, grains, fruit and veg, and adjust the amount to your activity and goal.'), actions:[{label:L('แนะนำเมนู','Menu ideas'),action:'food_recommend'}] },
   { id:'fat_basic', cat:'nutrition', kw:['ไขมันดี','กินไขมัน','fat','healthy fat'], title:L('ไขมันดีคืออะไร','Healthy fats'), answer:L('ไขมันดีจากปลา ถั่ว อะโวคาโด น้ำมันมะกอก จำเป็นต่อฮอร์โมนและการดูดซึม ราว 20-30% ของพลังงานต่อวัน','Healthy fats from fish, nuts, avocado and olive oil support hormones and absorption — about 20-30% of daily energy.') },
   { id:'fiber_basic', cat:'nutrition', kw:['ไฟเบอร์','กากใย','fiber','fibre'], title:L('ไฟเบอร์สำคัญยังไง','Why fiber matters'), answer:L('ไฟเบอร์ราว 25-35 กรัม/วัน จากผัก ผลไม้ ธัญพืชเต็มเมล็ด ช่วยให้อิ่มนาน คุมน้ำตาล และระบบขับถ่ายดี','Aim for 25-35 g/day from veg, fruit and whole grains — it keeps you full, steadies blood sugar and aids digestion.') },
   { id:'water_intake', cat:'nutrition', kw:['ดื่มน้ำเท่าไหร่','น้ำวันละ','how much water','water intake'], title:L('ควรดื่มน้ำวันละเท่าไหร่','How much water per day'), answer:L('ทั่วไปราว 2-2.5 ลิตร/วัน และเพิ่มขึ้นเมื่อออกกำลังกายหรืออากาศร้อน สังเกตสีปัสสาวะให้ใสอ่อน','Generally about 2-2.5 liters/day, more when training or in hot weather — aim for pale-yellow urine.'), actions:[{label:L('บันทึกน้ำวันนี้','Log water'),action:'go_today'}] },
   { id:'cheat_meal', cat:'nutrition', kw:['มื้อนอกแผน','กินนอกแผน','cheat meal','cheat day'], title:L('มื้อนอกแผนทำให้พังไหม','Do cheat meals ruin progress'), answer:L('มื้อพิเศษเป็นครั้งคราวไม่ทำลายผล สิ่งที่สำคัญคือภาพรวมทั้งสัปดาห์ กลับมาทำตามแผนในมื้อถัดไปได้เลย','An occasional treat will not ruin progress — what matters is the weekly picture. Just return to plan at the next meal.') },
   { id:'eating_out', cat:'nutrition', kw:['กินนอกบ้าน','สั่งอาหาร','eating out','restaurant'], title:L('กินนอกบ้านให้คุมแคล','Eating out tips'), answer:L('เลือกโปรตีนแบบไม่ทอด ผักเยอะ ข้าวหรือแป้งพอประมาณ เลี่ยงน้ำหวานและของทอด แล้วบันทึกแบบประมาณการได้','Pick non-fried protein, lots of veg, moderate rice or starch, skip sugary drinks and fried sides — then log an estimate.'), actions:[{label:L('แนะนำเมนู','Menu ideas'),action:'food_recommend'}] },
   { id:'meal_timing', cat:'nutrition', kw:['กินกี่มื้อ','เวลากิน','meal timing','when to eat','มื้อเช้าสำคัญ'], title:L('ควรกินกี่มื้อ เวลาไหน','How many meals and when'), answer:L('จำนวนมื้อไม่สำคัญเท่าพลังงานรวมและโปรตีนทั้งวัน เลือกรูปแบบที่ทำได้สม่ำเสมอที่สุดสำหรับคุณ','Meal count matters less than total daily energy and protein — pick the pattern you can keep most consistently.') },
   { id:'progressive_overload', cat:'workout', kw:['เพิ่มน้ำหนัก','โอเวอร์โหลด','progressive overload','พัฒนากล้าม'], title:L('เพิ่มกล้ามต้องทำยังไง','Progressive overload'), answer:L('ค่อย ๆ เพิ่มน้ำหนัก จำนวนครั้ง หรือเซ็ตทีละนิดในแต่ละสัปดาห์ เพื่อให้กล้ามถูกท้าทายและพัฒนาต่อเนื่อง','Gradually add a little weight, reps or sets each week so the muscle stays challenged and keeps adapting.'), actions:[{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'}] },
   { id:'doms_soreness', cat:'workout', kw:['ปวดกล้าม','เมื่อยหลังเล่น','sore','doms','muscle sore'], title:L('ปวดกล้ามหลังฝึกปกติไหม','Muscle soreness (DOMS)'), answer:L('ปวดกล้ามหลังฝึก (DOMS) มัก 1-2 วันและหายเอง ยืดเบา ๆ นอนพอ กินโปรตีน ถ้าไม่เจ็บข้อ ฝึกเบา ๆ ต่อได้','Post-workout soreness usually lasts 1-2 days and fades. Light stretching, enough sleep and protein help — train lightly if no joint pain.') },
   { id:'steps_neat', cat:'workout', kw:['เดินกี่ก้าว','เดินวันละ','steps','neat','เดินลดไขมัน'], title:L('เดินวันละกี่ก้าวดี','Daily steps'), answer:L('เดิน 7,000-10,000 ก้าว/วัน เป็นการเผาผลาญเสริมนอกห้องฝึก (NEAT) ช่วยลดไขมันได้ดีและทำได้ทุกวัน','Walking 7,000-10,000 steps/day adds calorie burn outside the gym (NEAT) and supports fat loss every day.') },
   { id:'training_frequency', cat:'workout', kw:['เล่นกี่วัน','ความถี่ฝึก','how often train','frequency','ออกกำลังกี่วัน'], title:L('ควรออกกำลังกี่วันต่อสัปดาห์','How often to train'), answer:L('3-5 วัน/สัปดาห์กำลังดี สลับกลุ่มกล้ามเนื้อและมีวันพัก สิ่งสำคัญที่สุดคือความสม่ำเสมอที่ทำได้จริง','3-5 days/week works well — rotate muscle groups and keep rest days. Consistency you can sustain matters most.'), actions:[{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'}] },
   { id:'client_pricing', cat:'coach', kw:['ตั้งราคา','คิดเงินลูกเทรน','pricing','charge client','ค่าเทรน'], title:L('ตั้งราคาลูกเทรนยังไง','Pricing your coaching'), answer:L('ตั้งราคาตามคุณค่าที่ให้ ทั้งแผน การติดตาม และผลลัพธ์ เริ่มจากแพ็กรายเดือนที่ชัดเจน แล้วปรับขึ้นเมื่อผลงานและรีวิวสะสมมากขึ้น','Price on the value you deliver — the plan, follow-up and results. Start with a clear monthly package and raise it as your results and reviews grow.') },
   { id:'client_motivation', cat:'coach', kw:['กระตุ้นลูกเทรน','ให้กำลังใจ','motivate client','engagement'], title:L('กระตุ้นลูกเทรนให้ไปต่อ','Keeping clients motivated'), answer:L('ชมแบบเฉพาะเจาะจง ตั้งเป้าเล็กที่ทำได้ ฉลองความคืบหน้าเล็ก ๆ และใช้ภารกิจหรือกลุ่มสร้างแรงจูงใจร่วมกัน','Give specific praise, set small achievable goals, celebrate small wins, and use missions or groups to build shared motivation.'), actions:[{label:L('สร้างภารกิจ','New mission'),action:'go_missions'}] },
  { id:'if_fasting', cat:'nutrition', kw:['อดอาหารเป็นช่วง','IF','intermittent fasting','16/8','ฟาสติ้ง'], title:L('การกินแบบ IF','Intermittent fasting'), answer:L('IF คือจำกัดช่วงเวลากิน เช่น 16/8 ช่วยคุมแคลรวมได้ง่ายขึ้น ไม่ใช่เวทมนตร์ ที่สำคัญยังเป็นแคลรวมและโปรตีน เลือกแบบที่ทำได้นานไม่ฝืน','IF limits your eating window (e.g. 16/8) which makes total calories easier to control. It is not magic — total calories and protein still matter most. Pick a pattern you can sustain.'), actions:[{label:L('ดูสรุปวันนี้','Today summary'),action:'today_summary'}] },
  { id:'convenience_store', cat:'nutrition', kw:['เซเว่น','7-11','ร้านสะดวกซื้อ','convenience store','ของกินในเซเว่น'], title:L('เลือกของในร้านสะดวกซื้อ','Convenience store picks'), answer:L('เลือกโปรตีนก่อน เช่น อกไก่ ไข่ต้ม นมจืด/นมถั่วเหลืองไม่หวาน กรีกโยเกิร์ต ปลา/ทูน่า เลี่ยงของทอด ขนม น้ำหวาน และดูแคลที่ฉลากเสมอ','Pick protein first: chicken breast, boiled eggs, plain milk or unsweetened soy milk, Greek yogurt, fish or tuna. Avoid fried snacks and sugary drinks, and check the calorie label.') },
  { id:'alcohol_calories', cat:'nutrition', kw:['แอลกอฮอล์','เบียร์','เหล้า','alcohol','ดื่มเหล้า'], title:L('แอลกอฮอล์กับแคลอรี','Alcohol and calories'), answer:L('แอลกอฮอล์ให้ 7 แคลต่อกรัม ดื่มเยอะทำให้เกินแคลง่ายและมักมีของแกล้มตามมา ถ้าจะดื่มเลือกแบบไม่ผสมน้ำหวาน คุมปริมาณ และดื่มน้ำสลับ','Alcohol has 7 kcal per gram and makes it easy to overshoot calories, plus the snacks that come with it. If you drink, skip sugary mixers, keep portions small, and alternate with water.') },
  { id:'veg_vegan', cat:'nutrition', kw:['กินเจ','มังสวิรัติ','vegetarian','vegan','เจ'], title:L('กินเจ/มังสวิรัติให้ได้โปรตีน','Vegetarian protein'), answer:L('โปรตีนจากพืช เช่น เต้าหู้ ถั่วต่าง ๆ เทมเป้ ถั่วเหลือง โปรตีนเกษตร และเวย์พืช จัดให้ครบทุกมื้อ ระวังของทอดและแป้งเยอะในอาหารเจ','Plant protein: tofu, beans, tempeh, soy, textured vegetable protein and plant whey — include some at every meal. Watch out for fried items and heavy refined carbs in veg dishes.'), actions:[{label:L('แนะนำเมนู','Menu ideas'),action:'food_recommend'}] },
  { id:'post_workout_meal', cat:'nutrition', kw:['กินหลังออกกำลังกาย','หลังเล่นเวท','post workout','มื้อหลังฝึก'], title:L('มื้อหลังออกกำลังกาย','Post-workout meal'), answer:L('หลังฝึกกินโปรตีนคู่กับคาร์บภายใน 1-2 ชม. เช่น อกไก่กับข้าว หรือเวย์กับกล้วย ไม่ต้องรีบใน 30 นาที แต่อย่าข้ามมื้อ','After training, have protein with carbs within 1-2 hours, e.g. chicken with rice or whey with a banana. You do not need to rush within 30 minutes, just do not skip the meal.') },
  { id:'budget_protein', cat:'nutrition', kw:['โปรตีนถูก','โปรตีนประหยัด','cheap protein','งบน้อย'], title:L('โปรตีนราคาประหยัด','Budget protein'), answer:L('ไข่ อกไก่ ปลากระป๋อง/ทูน่า เต้าหู้ ถั่ว และนมถั่วเหลือง เป็นโปรตีนที่คุ้มเงินและหาง่าย จัดสลับกันได้ทุกวัน','Eggs, chicken breast, canned fish or tuna, tofu, beans and soy milk are cheap, easy protein sources you can rotate daily.') },
  { id:'sodium_bloat', cat:'nutrition', kw:['บวมน้ำ','โซเดียม','กินเค็ม','water retention','น้ำหนักเด้ง'], title:L('บวมน้ำกับโซเดียม','Sodium and water retention'), answer:L('กินเค็มหรือคาร์บเยอะทำให้ร่างกายอุ้มน้ำ น้ำหนักเด้งขึ้นชั่วคราว ไม่ใช่ไขมัน ดื่มน้ำให้พอ ลดของเค็มจัด และดูแนวโน้มหลายวันแทนการชั่งวันเดียว','Salty or high-carb meals make your body hold water, so the scale jumps temporarily — that is not fat. Drink enough water, ease off very salty food, and judge the trend over several days, not one weigh-in.') },
  { id:'supplements_basic', cat:'nutrition', kw:['เวย์','ครีเอทีน','อาหารเสริม','whey','creatine','supplement'], title:L('เวย์และครีเอทีนเบื้องต้น','Whey and creatine basics'), answer:L('เวย์คือโปรตีนเสริมที่สะดวก ไม่จำเป็นถ้าได้โปรตีนพอจากอาหาร ส่วนครีเอทีน 3-5 กรัมต่อวันปลอดภัยและช่วยเรื่องแรงและกล้าม อาหารเสริมเป็นแค่ตัวเสริม อาหารจริงมาก่อน','Whey is a convenient protein supplement, not required if your food protein is enough. Creatine at 3-5 g per day is safe and helps strength and muscle. Supplements only top up a solid diet.') },
  { id:'muscle_gain_nutrition', cat:'nutrition', kw:['เพิ่มกล้าม','สายเพิ่ม','bulk','กินเพิ่มน้ำหนัก','lean bulk'], title:L('กินเพื่อเพิ่มกล้าม','Eating to build muscle'), answer:L('เพิ่มกล้ามต้องกินเกินแคลเล็กน้อย ราว 200-300 แคล โปรตีน 1.6-2.2 กรัมต่อกิโล และเล่นเวทหนักขึ้นเรื่อย ๆ เพิ่มน้ำหนักช้า ๆ จะได้กล้ามโดยไม่ติดมันมาก','To build muscle, eat a small surplus (around 200-300 kcal), get 1.6-2.2 g protein per kg, and progressively lift heavier. Add weight slowly to gain muscle with minimal fat.'), actions:[{label:L('คำนวณแคล/มาโคร','Calorie & macros'),action:'open_calc'}] },
  { id:'home_workout', cat:'workout', kw:['เล่นที่บ้าน','ไม่มีอุปกรณ์','home workout','บอดี้เวท','bodyweight'], title:L('ออกกำลังกายที่บ้าน','Home workout'), answer:L('ใช้น้ำหนักตัวได้เลย เช่น สควอท วิดพื้น แพลงก์ ลันจ์ และกลูทบริดจ์ เพิ่มจำนวนครั้งหรือทำช้าลงเพื่อเพิ่มความยาก ทำ 3-4 วันต่อสัปดาห์ก็โตได้','Use bodyweight moves: squats, push-ups, planks, lunges and glute bridges. Add reps or slow them down to make them harder. Three to four days a week is enough to progress.'), actions:[{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'},{label:L('บันทึกการฝึก','Log workout'),action:'log_workout'}] },
  { id:'warmup_stretch', cat:'workout', kw:['วอร์มอัพ','ยืดเหยียด','อบอุ่นร่างกาย','warm up','stretch'], title:L('วอร์มอัพและยืดเหยียด','Warm-up and stretching'), answer:L('วอร์ม 5-10 นาทีก่อนเล่น ด้วยคาร์ดิโอเบาและการเคลื่อนไหวข้อต่อ ช่วยลดบาดเจ็บ ส่วนการยืดแบบค้างเก็บไว้ทำหลังเล่นจะเหมาะกว่า','Warm up 5-10 minutes with light cardio and joint movements to cut injury risk. Save long static stretches for after the session.') },
  { id:'training_split', cat:'workout', kw:['จัดโปรแกรม','แบ่งวันเล่น','push pull legs','split','โปรแกรมเล่น','สปลิต','สปลิท','แบ่งวันฝึก','split ไหนดี','เลือก split'],
    title:L('เลือกรูปแบบแบ่งวันฝึก (Training split)','Choosing a training split'),
    answer:L('รูปแบบหลักมี 4 แบบ:\n• Full Body — เล่นทั้งตัวทุกครั้ง เหมาะมือใหม่ / ฝึก 2-3 วัน\n• Upper/Lower — สลับบน-ล่าง เหมาะ 4 วัน\n• Push/Pull/Legs (PPL) — ดัน-ดึง-ขา เหมาะ 3 หรือ 5-6 วัน\n• Bro split — วันละส่วน เหมาะสายเพาะกาย 5 วัน\nหลักคิด: ยิ่งฝึกน้อยวัน ยิ่งควรรวมหลายส่วนต่อครั้ง เพื่อให้แต่ละกล้ามถูกฝึก ~2 ครั้ง/สัปดาห์ · ถามเจาะแต่ละแบบได้ หรือให้ผมจัดตารางให้เลยครับ','4 main splits:\n• Full Body — everything each session, best for beginners / 2-3 days\n• Upper/Lower — alternate halves, great at 4 days\n• Push/Pull/Legs (PPL) — 3 or 5-6 days\n• Bro split — one body part per day, 5 days\nRule of thumb: fewer training days → combine more per session so each muscle gets ~2×/week. Ask about any split, or let me build your plan.'),
    actions:[{label:L('จัดตารางให้เลย','Build my plan'),action:'_chip',payload:{q:L('จัดตารางฝึกให้หน่อย','build a workout plan')}}] },
  { id:'full_body_split', cat:'workout', kw:['full body','ฟูลบอดี้','เล่นทั้งตัว','ฟูลบอดี','full body คือ'],
    title:L('Full Body — เล่นทั้งตัว','Full Body split'),
    answer:L('เหมาะกับ: มือใหม่ คนมีเวลาน้อย ฝึก 2-3 วัน/สัปดาห์ (วันเว้นวัน)\nข้อดี: แต่ละกล้ามถูกฝึกบ่อย (2-3 ครั้ง/สัปดาห์) · พลาดวันเดียวเสียหายน้อย · ได้ซ้อมท่าหลักบ่อย ฟอร์มพัฒนาเร็ว\nข้อเสีย: ต่อครั้งเล่นเจาะลึกทีละส่วนไม่ได้มาก · ถ้าจัดวันติดกันจะล้าสะสม ควรมีวันพักคั่นเสมอ','Best for: beginners and busy people, 2-3 days/week (every other day)\nPros: each muscle trained often (2-3×/week) · missing one day costs little · frequent practice of key lifts = faster technique gains\nCons: less deep focus per muscle each session · needs a rest day between sessions to avoid fatigue.'),
    actions:[{label:L('จัดตาราง Full Body','Build Full Body plan'),action:'_chip',payload:{q:L('จัดตารางฝึก full body ให้หน่อย','build me a full body workout plan')}}] },
  { id:'upper_lower_split', cat:'workout', kw:['upper lower','อัพเปอร์','บน ล่าง','แบ่งบนล่าง','upper/lower'],
    title:L('Upper/Lower — สลับบน-ล่าง','Upper/Lower split'),
    answer:L('เหมาะกับ: ระดับเริ่มต้น-กลาง ที่ฝึกได้ 4 วัน/สัปดาห์ (บน-ล่าง-พัก-บน-ล่าง)\nข้อดี: แต่ละกล้ามได้ 2 ครั้ง/สัปดาห์ (ความถี่กำลังดีตามงานวิจัย) · เวลาต่อครั้งไม่ยาว · ฟื้นตัวดีเพราะสลับส่วน\nข้อเสีย: วันบนมักท่าเยอะ (อก หลัง ไหล่ แขน ในวันเดียว) · ต้องมีวินัยครบ 4 วันถึงได้ผลเต็ม','Best for: beginner-intermediate lifters with 4 days/week\nPros: every muscle hit 2×/week (research sweet spot) · sessions stay short · good recovery from alternating halves\nCons: upper days pack many moves (chest/back/shoulders/arms) · needs all 4 days for full effect.'),
    actions:[{label:L('จัดตาราง Upper/Lower','Build Upper/Lower plan'),action:'_chip',payload:{q:L('จัดตารางฝึก upper lower 4 วัน','build me an upper lower plan 4 days')}}] },
  { id:'ppl_split', cat:'workout', kw:['ppl','push pull legs','พุชพูล','ดันดึงขา','ppl คือ','push pull'],
    title:L('Push/Pull/Legs (PPL)','Push/Pull/Legs (PPL)'),
    answer:L('เหมาะกับ: ระดับกลางขึ้นไป · ฝึก 3 วัน (แต่ละส่วน 1 ครั้ง/สัปดาห์) หรือ 5-6 วัน (วนซ้ำ ~2 ครั้ง/สัปดาห์)\nแบ่งเป็น: Push (อก ไหล่ หลังแขน) · Pull (หลัง หน้าแขน) · Legs (ขา สะโพก แกนกลาง)\nข้อดี: จัดกลุ่มตามการเคลื่อนไหว กล้ามช่วยกันทำงาน ไม่ชนกันข้ามวัน · เจาะ volume ต่อกลุ่มได้เยอะ · ยืดหยุ่น 3-6 วัน\nข้อเสีย: แบบ 3 วัน ความถี่ต่อกล้ามแค่ 1 ครั้ง/สัปดาห์ (มือใหม่ได้ผลช้ากว่า full body) · แบบ 6 วันกินเวลาและฟื้นตัวหนัก','Best for: intermediate+; 3 days (each part 1×/week) or 5-6 days (~2×/week)\nSplit: Push (chest/shoulders/triceps) · Pull (back/biceps) · Legs (legs/glutes/core)\nPros: grouped by movement so muscles don\'t clash across days · high volume per group · flexible 3-6 days\nCons: at 3 days each muscle only 1×/week (slower for beginners than full body) · 6-day version is time- and recovery-hungry.'),
    actions:[{label:L('จัดตาราง PPL','Build PPL plan'),action:'_chip',payload:{q:L('จัดตารางฝึก push pull legs ให้หน่อย','build me a push pull legs plan')}}] },
  { id:'bro_split', cat:'workout', kw:['bro split','โบรสปลิต','โบรสปลิท','วันละส่วน','เล่นวันละกล้าม','อกวันจันทร์'],
    title:L('Bro split — วันละส่วน','Bro split'),
    answer:L('เหมาะกับ: สายเพาะกาย/คนที่ชอบปั๊มทีละกล้าม ฝึกได้ 5 วัน/สัปดาห์สม่ำเสมอ เช่น จ=อก อ=หลัง พ=ไหล่ พฤ=แขน ศ=ขา\nข้อดี: โฟกัสสุดทางทีละส่วน · ความล้ารวมต่อวันต่ำ · สนุก เห็นปั๊มชัด\nข้อเสีย: แต่ละกล้ามถูกฝึกแค่ 1 ครั้ง/สัปดาห์ — งานวิจัยส่วนใหญ่ชี้ว่า 2 ครั้ง/สัปดาห์โตดีกว่าสำหรับคนทั่วไป · พลาดวันเดียว = ส่วนนั้นหายทั้งสัปดาห์ · ไม่แนะนำมือใหม่ (เริ่มจาก Full Body หรือ Upper/Lower ก่อนดีกว่า) · ตอนนี้ตัวจัดตารางของผมรองรับ Full Body / Upper-Lower / PPL ถ้าอยากลอง bro split แนะนำให้เทรนเนอร์ช่วยจัดครับ','Best for: bodybuilding-style lifters who reliably train 5 days/week, e.g. Mon=chest, Tue=back, Wed=shoulders, Thu=arms, Fri=legs\nPros: maximum focus per part · low daily fatigue · fun, big pump\nCons: each muscle only 1×/week — research favors 2×/week for most people · miss a day and that part is skipped all week · not recommended for beginners (start Full Body or Upper/Lower). My generator covers Full Body / Upper-Lower / PPL — for a bro split, a trainer can build it for you.'),
    actions:[{label:L('🤝 หาเทรนเนอร์','🤝 Find a trainer'),action:'find_trainer'}] },
  { id:'reps_goal', cat:'workout', kw:['กี่เซ็ตกี่ครั้ง','reps','เซ็ต','ครั้ง','strength hypertrophy'], title:L('เซ็ตและครั้งตามเป้าหมาย','Reps and sets by goal'), answer:L('แรง 3-6 ครั้งหนัก กล้ามโต 8-12 ครั้ง ความทน 15 ครั้งขึ้นไป พัก 1-3 นาที สิ่งสำคัญสุดคือเพิ่มน้ำหนักหรือจำนวนขึ้นเรื่อย ๆ','Strength 3-6 heavy reps, muscle growth 8-12 reps, endurance 15+ reps, rest 1-3 minutes. The key is progressively adding weight or reps over time.') },
  { id:'train_sick_injured', cat:'workout', kw:['ป่วยเล่นได้ไหม','บาดเจ็บ','เป็นหวัด','train sick','injured'], title:L('ป่วยหรือบาดเจ็บควรเล่นไหม','Training while sick or injured'), answer:L('เป็นหวัดเล็กน้อยแบบเหนือคอเล่นเบา ๆ ได้ แต่ถ้ามีไข้หรือปวดเมื่อยทั้งตัวให้พัก ส่วนบาดเจ็บให้เลี่ยงท่าที่เจ็บแล้วเล่นส่วนอื่นแทน ถ้าเจ็บมากควรปรึกษาแพทย์','Mild above-the-neck cold — light training is okay. Fever or body aches — rest. For an injury, avoid the painful movement and train other areas. See a doctor if pain is significant.') },
  { id:'return_after_break', cat:'workout', kw:['กลับมาเล่น','หยุดนาน','เริ่มใหม่','comeback','detrain'], title:L('กลับมาเล่นหลังหยุดนาน','Returning after a break'), answer:L('หยุดนานกล้ามหายไปบ้างแต่จะกลับมาไวกว่าตอนเริ่มใหม่ เพราะ muscle memory เริ่มที่ 50-70% ของน้ำหนักเดิมแล้วค่อยเพิ่ม อย่าหักโหมในวันแรก','After a long break you lose some muscle but regain it faster thanks to muscle memory. Start around 50-70% of your old weights and build up — do not go all-out on day one.'), actions:[{label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'}] },
  { id:'client_noshow', cat:'coach', kw:['ลูกเทรนเบี้ยว','ไม่มาตามนัด','no show','ยกเลิกนัด'], title:L('รับมือลูกเทรนเบี้ยวนัด','Handling no-shows'), answer:L('ตั้งนโยบายชัดตั้งแต่แรก เช่น ต้องแจ้งล่วงหน้ากี่ชั่วโมงไม่งั้นนับครั้ง เตือนนัดล่วงหน้าเสมอ ถ้าเบี้ยวบ่อยให้คุยหาสาเหตุและปรับเวลาหรือรูปแบบให้เหมาะ','Set a clear policy up front (e.g. cancel X hours ahead or it counts as a session), always send a reminder, and if it keeps happening, talk to find the cause and adjust the time or format.') },
  { id:'client_retention', cat:'coach', kw:['ลูกเทรนเลิก','churn','รักษาลูกค้า','retention','ต่อแพ็ก'], title:L('ลดการเลิกกลางคัน','Keeping clients'), answer:L('ลูกค้าอยู่ต่อเพราะเห็นผลและรู้สึกถูกดูแล ตั้งเป้าสั้น ๆ ที่ทำได้ ฉลองชัยเล็ก ๆ ทักอย่างสม่ำเสมอ และโชว์ความคืบหน้าให้เห็นภาพ','Clients stay when they see results and feel looked after. Set small reachable goals, celebrate wins, check in consistently, and show their progress clearly.'), actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] },
  { id:'social_content', cat:'coach', kw:['ลงคอนเทนต์','โพสต์','social','การตลาด','หาลูกค้า'], title:L('ไอเดียคอนเทนต์โซเชียล','Social content ideas'), answer:L('คอนเทนต์ที่ได้ผลและทำง่าย เช่น ผลลัพธ์ลูกเทรนแบบขออนุญาตแล้ว เคล็ดลับสั้น ๆ เบื้องหลังการเทรน และตอบคำถามที่พบบ่อย ลงสม่ำเสมอดีกว่าลงเยอะแล้วหายไป','Easy, effective content: client results (with permission), quick tips, behind-the-scenes training, and answers to common questions. Posting consistently beats posting a lot then disappearing.') },
  { id:'onboarding_script', cat:'coach', kw:['รับลูกเทรนใหม่','เริ่มต้นลูกค้า','onboarding','สคริปต์เริ่ม'], title:L('สคริปต์รับลูกเทรนใหม่','New client onboarding'), answer:L('นัดแรกถามเป้าหมาย ประวัติสุขภาพ และไลฟ์สไตล์ วัดพื้นฐานเช่นน้ำหนัก รูป และรอบเอว ตั้งเป้าที่ทำได้จริง สอนวิธีบันทึกในแอป แล้วนัดติดตามครั้งถัดไป','First session: ask about goals, health history and lifestyle, take baselines (weight, photos, waist), set a realistic target, teach them to log in the app, and book the next check-in.'), actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] },
  { id:'progress_report', cat:'coach', kw:['รายงานผล','สรุปความคืบหน้า','progress report','รีวิวผล'], title:L('เขียนรายงานความคืบหน้า','Progress reports'), answer:L('สรุปทุก 2-4 สัปดาห์ เช่น น้ำหนัก รอบเอว รูปเทียบ ความสม่ำเสมอของการบันทึก สิ่งที่ดีขึ้น และเป้าถัดไป ใช้การ์ดผลลัพธ์ช่วยให้เห็นภาพชัด','Summarize every 2-4 weeks: weight, waist, photo comparison, logging consistency, what improved and the next goal. Use a result card to make it visual.'), actions:[{label:L('สร้างการ์ดผลลัพธ์','Create result card'),action:'open_result_card'}] },
  { id:'upsell_package', cat:'coach', kw:['ขายแพ็ก','ต่อแพ็ก','upsell','เพิ่มคอร์ส'], title:L('เสนอขายแพ็กเพิ่ม','Upselling packages'), answer:L('เสนอต่อแพ็กตอนลูกค้ากำลังเห็นผลและมีกำลังใจ เชื่อมกับเป้าหมายถัดไปไม่ใช่แค่ขาย และเสนอทางเลือกที่เหมาะกับงบและเป้าของเขา','Offer a renewal when the client is seeing results and feeling motivated. Tie it to their next goal rather than just selling, and give options that fit their budget and aim.') },
  { id:'sleep_weight', cat:'mindset', kw:['นอน','พักผ่อน','อดนอน','sleep','นอนน้อย'], title:L('การนอนกับน้ำหนัก','Sleep and weight'), answer:L('นอนน้อยทำให้หิวมากขึ้น คุมตัวเองยาก และฟื้นตัวแย่ การนอน 7-8 ชั่วโมงช่วยทั้งลดไขมันและสร้างกล้าม สำคัญพอ ๆ กับอาหารและการฝึก','Too little sleep increases hunger, weakens self-control and slows recovery. Getting 7-8 hours helps both fat loss and muscle gain — as important as diet and training.') },
  { id:'stress_eating', cat:'mindset', kw:['กินเพราะเครียด','เครียดแล้วกิน','stress eating','กินจุบจิบ'], title:L('กินเพราะเครียด','Stress eating'), answer:L('ลองสังเกตก่อนว่าหิวจริงหรือแค่เครียดหรือเบื่อ ดื่มน้ำ เดินเล่น หรือหายใจลึก ๆ ก่อน ถ้าจะกินให้เลือกของที่อิ่มและคุมปริมาณ อย่าโทษตัวเอง เริ่มใหม่มื้อถัดไปได้เสมอ','Notice whether you are truly hungry or just stressed or bored. Try water, a short walk or deep breaths first. If you do eat, pick something filling and mind the portion — no self-blame, just reset next meal.') },
  { id:'discipline_lowmotivation', cat:'mindset', kw:['หมดไฟ','ไม่มีแรงจูงใจ','ขี้เกียจ','discipline','motivation'], title:L('วินัยตอนหมดไฟ','Discipline when unmotivated'), answer:L('แรงจูงใจมา ๆ หาย ๆ เป็นเรื่องปกติ ให้พึ่งระบบแทน ตั้งเป้าเล็กที่ทำได้ทุกวัน ทำให้เป็นกิจวัตร ลดแรงเสียดทานเช่นเตรียมชุดหรือเมนูไว้ ทำน้อยยังดีกว่าไม่ทำ','Motivation comes and goes — rely on systems instead. Set a small daily target, make it routine, reduce friction (prep clothes or meals ahead), and remember doing a little beats doing nothing.') },
  { id:'weekend_overeating', cat:'mindset', kw:['วันหยุดกินเยอะ','เสาร์อาทิตย์','weekend','สังสรรค์'], title:L('กินเยอะวันหยุด','Weekend overeating'), answer:L('ทั้งสัปดาห์ทำดีแต่พังวันหยุดทำให้ไม่คืบหน้า วางแผนล่วงหน้า กินโปรตีนและผักก่อนไปงาน เลือกมื้อที่อยากกินจริง ๆ ดื่มน้ำสลับ แล้วกลับเข้าแผนวันจันทร์ทันที','A good week undone by the weekend stalls progress. Plan ahead, eat protein and veg before events, choose the treats you really want, alternate with water, and get back on plan Monday.') },
  { id:'all_or_nothing', cat:'mindset', kw:['พังแล้วพังเลย','ล้มเลิก','สมบูรณ์แบบ','all or nothing'], title:L('เลิกคิดแบบสุดโต่ง','Avoid all-or-nothing'), answer:L('พลาดมื้อเดียวไม่ทำให้ทุกอย่างพัง อย่าเปลี่ยนพลาดนิดเดียวเป็นเลิกทั้งวันหรือทั้งสัปดาห์ กลับเข้าแผนมื้อถัดไปเลย ความสม่ำเสมอ 80% ชนะความสมบูรณ์แบบที่ทำไม่ได้','One off meal does not ruin everything. Do not turn a small slip into quitting for the day or week. Get back on track the next meal — being 80% consistent beats perfection you cannot keep.') },
  { id:'group_announcement', cat:'coach', kw:['ประกาศกลุ่ม','แจ้งสมาชิก','group announcement','ส่งข้อความกลุ่ม'], title:L('ร่างประกาศกลุ่ม','Group announcement'), answer:L('ใช้แชทกลุ่มประกาศภารกิจใหม่ ให้กำลังใจ หรือนัดหมาย เขียนสั้นกระชับและชวนให้มีส่วนร่วม กดปุ่มด้านล่างให้ผมช่วยร่างให้ได้','Use the group chat to announce a new mission, encourage members or set a schedule. Keep it short and engaging — tap below and I can draft one for you.'), actions:[{label:L('ร่างประกาศให้','Draft announcement'),action:'draft_group_announcement'},{label:L('เปิดกลุ่ม','Open groups'),action:'go_groups'}] },
  { id:'thai_streetfood', cat:'nutrition', kw:['สตรีทฟู้ด','ข้าวตามสั่ง','ตามสั่ง','ข้าวแกง','ร้านข้าวแกง','กินข้างนอก','สั่งอะไรดี','street food','rice curry shop'], title:L('กินสตรีทฟู้ด/ตามสั่งให้คุมแคล','Thai street food & rice shops'), answer:L('เลือกโปรตีนไม่ทอด เช่น กะเพราไก่ ไข่น้ำ ต้มยำ ลาบ ไก่ย่าง · ข้าวขอครึ่งจานหรือข้าวกล้อง · เพิ่มผัก/ผักลวก · เลี่ยงของทอด ผัดน้ำมันเยอะ แกงกะทิ และน้ำหวาน · สั่งได้ว่า "ไม่ใส่น้ำมันเยอะ/ข้าวน้อย" · แล้วบันทึกแบบประมาณการในแอป','Pick non-fried protein like basil chicken, tom yum, larb or grilled chicken · ask for half rice or brown rice · add veg · avoid deep-fried, oily stir-fries, coconut curries and sweet drinks · you can ask for less oil / less rice · then log an estimate in the app.'), actions:[{label:L('แนะนำเมนู','Menu ideas'),action:'food_recommend'}] },
  { id:'app_troubleshoot', cat:'app_help', kw:['แผนไม่ขึ้น','ซิงค์ไม่ได้','โหลดไม่ขึ้น','เข้ากลุ่มไม่ได้','สแกนไม่ได้','แอปค้าง','not syncing','cant join','stuck','not loading'], title:L('แอปมีปัญหา/ไม่ซิงค์','App issues / not syncing'), answer:L('ลองตามนี้: 1) เช็กอินเทอร์เน็ต 2) ปิดแล้วเปิดแอปใหม่ (ดึงหน้าจอลงเพื่อรีเฟรช) 3) กดซิงค์ในแท็บโค้ช 4) อัปเดตแอปเป็นเวอร์ชันล่าสุด (เลขใต้โลโก้) · ถ้าเข้ากลุ่ม/สแกน QR ไม่ได้ ให้โค้ชแชร์ QR ใหม่ หรือใช้ "อ่าน QR จากรูปภาพ" · ยังไม่หายทักไลน์ @987qyznd','Try: 1) check your internet 2) close and reopen the app (pull down to refresh) 3) tap Sync in the Coach tab 4) update to the latest version (number under the logo) · if you cannot join or scan a QR, ask your coach to reshare it or use "Read QR from an image" · still stuck? chat LINE @987qyznd.'), actions:[{label:L('เปิดตั้งค่า','Open Settings'),action:'go_settings'}] },
];
function _scoreKnowledge(t, fuzzy){
  return KNOWLEDGE.map(function(item){ var sc=0; item.kw.forEach(function(k){ var kk=synNorm(k); if(t.indexOf(kk)>=0) sc+=2; else if(fuzzy && kk.length>=6 && trigCover(t,kk)>=0.66) sc+=1; }); if(t.indexOf(synNorm(item.title))>=0) sc+=3; return {item:item,score:sc}; })
    .filter(function(x){return x.score>0;}).sort(function(a,b){return b.score-a.score;}).slice(0,3).map(function(x){return x.item;});
}
function searchKnowledge(message){ var t=synNorm(message); var ex=_scoreKnowledge(t,false); return ex.length?ex:_scoreKnowledge(t,true); }

/* ============================ reply builders ============================ */
var MED_KW=['วินิจฉัย','เป็นโรค','โรคประจำ','กินยา','หยุดยา','ฉีดยา','ยารักษา','ยาอะไร','กินยาอะไร','diagnos','disease','medicine','medication','prescription','เบาหวาน','ความดัน','มะเร็ง','ซึมเศร้า','depress'];
function isMedical(message){ var t=synNorm(message); return MED_KW.some(function(k){return t.indexOf(synNorm(k))>=0;}); }
function disclaimer(){ return L('คำแนะนำจาก IU Mate ใช้เพื่อช่วยวางแผนสุขภาพและการออกกำลังกายทั่วไป ไม่ใช่คำวินิจฉัยหรือคำแนะนำทางการแพทย์','IU Mate gives general fitness/nutrition guidance only — not medical diagnosis or advice.'); }
var WPLAN_QUOTA={free:2,free_trainer:10};
var WPLAN_KEY='iufit_iu_mate_wplan';
function _wplanTier(){ try{ return fn('acctPlan')?(''+window.acctPlan()):'free'; }catch(e){ return 'free'; } }
function _wplanLoad(){ try{ return JSON.parse(localStorage.getItem(WPLAN_KEY)||'null')||{mo:'',n:0}; }catch(e){ return {mo:'',n:0}; } }
function wplanQuota(){
  var tier=_wplanTier(); var lim=WPLAN_QUOTA[tier];
  if(lim===undefined) return {ok:true,unlimited:true,tier:tier};
  var mo=todayDate().slice(0,7); var u=_wplanLoad();
  if(u.mo!==mo) u={mo:mo,n:0};
  return {ok:u.n<lim, n:u.n, lim:lim, tier:tier, mo:mo};
}
function wplanQuotaUse(){
  var tier=_wplanTier(); if(WPLAN_QUOTA[tier]===undefined) return;
  var mo=todayDate().slice(0,7); var u=_wplanLoad();
  if(u.mo!==mo) u={mo:mo,n:0};
  u.n++; try{ localStorage.setItem(WPLAN_KEY,JSON.stringify(u)); }catch(e){}
  try{ bumpStat('wplan_gen'); }catch(e){}
}
function wplanQuotaReply(q){
  var coach=(role()==='coach');
  var acts=[{label:L('⭐ อัปเกรดแพ็กเกจ','⭐ Upgrade plan'),action:'open_pricing'}];
  if(!coach) acts.push({label:L('🤝 หาเทรนเนอร์ดูแลเฉพาะตัว','🤝 Find a trainer'),action:'find_trainer'});
  return { title:L('ครบโควต้าจัดตารางของเดือนนี้แล้ว','Monthly plan quota reached'),
    message:L('แพ็กปัจจุบันสร้างตารางฝึกได้ '+q.lim+' ครั้ง/เดือน และเดือนนี้ใช้ครบแล้วครับ โควต้าจะรีเซ็ตต้นเดือนหน้า\n\nระหว่างนี้ยังถามความรู้การฝึก (เช่น PPL คืออะไร) ขอท่าแทน หรือปรึกษาเรื่องอาหารได้ไม่จำกัด · ถ้าอยากได้แผนเฉพาะตัวที่ปรับตามผลจริง เทรนเนอร์ช่วยดูแลต่อเนื่องได้ครับ','Your current plan allows '+q.lim+' generated programs/month and this month\'s quota is used up — it resets next month.\n\nYou can still ask training questions, get move alternatives and nutrition tips, unlimited. For a plan tailored and adjusted to your real results, a trainer can help.'),
    disclaimer:disclaimer(), actions:acts };
}

var RISK_KW=['เจ็บหน้าอก','แน่นหน้าอก','หายใจไม่ออก','หายใจลำบาก','หอบ','เวียนหัว','หน้ามืด','เป็นลม','จะเป็นลม','วูบ','ใจสั่น','ชาแขน','ชาขา','ปวดมาก','เจ็บมาก','บาดเจ็บ','เจ็บเข่า','เจ็บหลัง','เจ็บข้อ','เจ็บข้อมือ','ข้อเท้าพลิก','เคล็ด','ตั้งครรภ์','ท้องอยู่','คนท้อง','chest pain','cant breathe','short of breath','dizzy','faint','passed out','injured','injury','sprain','severe pain','pregnan'];
function isHealthRisk(message){ var t=synNorm(message); return RISK_KW.some(function(k){return t.indexOf(synNorm(k))>=0;}); }
function safetyReply(){ return { title:L('ดูแลความปลอดภัยก่อนนะครับ','Safety first'), message:L('ถ้ามีอาการเจ็บ บาดเจ็บ หรือรู้สึกผิดปกติ (เช่น เจ็บหน้าอก หายใจไม่ออก เวียนหัว หรือเป็นลม) แนะนำให้หยุดออกกำลังกายก่อน แล้วปรึกษาแพทย์หรือผู้เชี่ยวชาญนะครับ · IU Mate ช่วยดูข้อมูลบันทึกทั่วไปในแอปได้ แต่วินิจฉัยหรือรักษาแทนผู้เชี่ยวชาญไม่ได้','If you feel pain, an injury, or anything unusual (chest pain, trouble breathing, dizziness, fainting), please stop exercising first and consult a doctor or professional. IU Mate can read your general logs in the app, but cannot diagnose or treat.'), disclaimer:disclaimer() }; }
/* ============================ Workout Plan Builder (rule-based, no AI) ============================ */
var WORKOUT_TEMPLATES=[
 {id:'beginner_low_impact_2d',title:L('เริ่มต้น Low Impact 2 วัน','Beginner Low Impact 2d'),goalTags:['general_fitness','fat_loss'],level:'beginner',daysPerWeek:2,equipment:['none','bodyweight','treadmill'],sessionDurationMinutes:25,
  days:[
   {dayLabel:'Day 1',focus:L('Full Body แรงกระแทกต่ำ','Full Body Low Impact'),exercises:[{name:'Chair Squat',sets:2,reps:'8-10'},{name:'Wall Push-up',sets:2,reps:'8-12'},{name:'Glute Bridge',sets:2,reps:'10-12'},{name:'Dead Bug',sets:2,reps:'6-8/ข้าง'}],cardio:{durationMinutes:10,intensity:'easy'}},
   {dayLabel:'Day 2',focus:L('Mobility + Full Body','Mobility + Full Body'),exercises:[{name:'Step Touch',sets:2,durationSeconds:120},{name:'Chair Squat',sets:2,reps:'8-10'},{name:'Incline Push-up',sets:2,reps:'6-10'},{name:'Bird Dog',sets:2,reps:'6-8/ข้าง'}],cardio:{durationMinutes:10,intensity:'easy'}}
  ]},
 {id:'general_fitness_low_impact_3d',title:L('สุขภาพทั่วไป Low Impact 3 วัน','General Fitness Low Impact 3d'),goalTags:['general_fitness','fat_loss'],level:'beginner',daysPerWeek:3,equipment:['none','bodyweight','treadmill'],sessionDurationMinutes:30,
  days:[
   {dayLabel:'Day 1',focus:L('Full Body เบา','Full Body easy'),exercises:[{name:'Chair Squat',sets:3,reps:'8-12'},{name:'Wall / Incline Push-up',sets:3,reps:'8-12'},{name:'Glute Bridge',sets:3,reps:'10-15'},{name:'Dead Bug',sets:2,reps:'8/ข้าง'}],cardio:{durationMinutes:12,intensity:'easy'}},
   {dayLabel:'Day 2',focus:L('เดิน + แกนกลาง','Walk + Core'),exercises:[{name:'Bird Dog',sets:3,reps:'8/ข้าง'},{name:'Plank',sets:2,durationSeconds:20},{name:'Step Touch',sets:2,durationSeconds:120}],cardio:{durationMinutes:15,intensity:'easy'}},
   {dayLabel:'Day 3',focus:L('Full Body เบา','Full Body easy'),exercises:[{name:'Step-up (ต่ำ)',sets:3,reps:'8/ข้าง'},{name:'Incline Push-up',sets:3,reps:'8-12'},{name:'Glute Bridge Hold',sets:3,durationSeconds:20},{name:'Side Plank (เข่าลง)',sets:2,durationSeconds:15}],cardio:{durationMinutes:12,intensity:'easy'}}
  ]},
 {id:'fat_loss_low_impact_full_body_3d',title:L('ลดไขมัน Low Impact Full Body 3 วัน','Fat Loss Low Impact Full Body 3d'),goalTags:['fat_loss','weight_control'],level:'beginner',daysPerWeek:3,equipment:['none','bodyweight','treadmill'],sessionDurationMinutes:35,
  days:[
   {dayLabel:'Day 1',focus:L('Full Body + เดิน','Full Body + walk'),exercises:[{name:'Chair Squat',sets:3,reps:'10-12'},{name:'Incline Push-up',sets:3,reps:'8-12'},{name:'Glute Bridge',sets:3,reps:'12-15'},{name:'Dead Bug',sets:3,reps:'8/ข้าง'}],cardio:{durationMinutes:15,intensity:'easy'}},
   {dayLabel:'Day 2',focus:L('เดินต่อเนื่อง + แกนกลาง','Steady walk + Core'),exercises:[{name:'Bird Dog',sets:3,reps:'10/ข้าง'},{name:'Plank',sets:3,durationSeconds:20},{name:'Glute Bridge Hold',sets:2,durationSeconds:25}],cardio:{durationMinutes:20,intensity:'moderate'}},
   {dayLabel:'Day 3',focus:L('Full Body + เดิน','Full Body + walk'),exercises:[{name:'Step-up (ต่ำ)',sets:3,reps:'10/ข้าง'},{name:'Wall / Incline Push-up',sets:3,reps:'8-12'},{name:'Glute Bridge',sets:3,reps:'12-15'},{name:'Side Plank (เข่าลง)',sets:2,durationSeconds:15}],cardio:{durationMinutes:15,intensity:'easy'}}
  ]},
 {id:'beginner_full_body_bodyweight_3d',title:L('มือใหม่ Full Body 3 วัน / ไม่มีอุปกรณ์','Beginner Full Body 3d / Bodyweight'),goalTags:['general_fitness','fat_loss'],level:'beginner',daysPerWeek:3,equipment:['none','bodyweight'],sessionDurationMinutes:30,
  days:[
   {dayLabel:'Day 1',focus:'Full Body A',exercises:[{name:'Bodyweight Squat',sets:3,reps:'8-12'},{name:'Incline Push-up',sets:3,reps:'6-10'},{name:'Glute Bridge',sets:3,reps:'10-15'},{name:'Bird Dog',sets:2,reps:'8-10/ข้าง'},{name:'Plank',sets:2,durationSeconds:20}],cardio:{durationMinutes:10,intensity:'easy'}},
   {dayLabel:'Day 2',focus:'Full Body B',exercises:[{name:'Step-up',sets:3,reps:'8-10/ข้าง'},{name:'Wall Push-up',sets:3,reps:'10-12'},{name:'Hip Hinge Drill',sets:3,reps:'10-12'},{name:'Dead Bug',sets:2,reps:'8-10/ข้าง'}],cardio:{durationMinutes:15,intensity:'moderate'}},
   {dayLabel:'Day 3',focus:'Full Body C',exercises:[{name:'Chair Squat',sets:3,reps:'10-12'},{name:'Incline Push-up',sets:3,reps:'6-10'},{name:'Glute Bridge Hold',sets:3,durationSeconds:25},{name:'Side Plank',sets:2,durationSeconds:15}],cardio:{durationMinutes:10,intensity:'easy'}}
  ]},
 {id:'beginner_full_body_dumbbell_3d',title:L('มือใหม่ Full Body 3 วัน / ดัมเบล','Beginner Full Body 3d / Dumbbell'),goalTags:['general_fitness','muscle_gain','fat_loss'],level:'beginner',daysPerWeek:3,equipment:['dumbbell'],sessionDurationMinutes:35,
  days:[
   {dayLabel:'Day 1',focus:'Full Body A',exercises:[{name:'DB Goblet Squat',sets:3,reps:'8-12'},{name:'DB Floor Press',sets:3,reps:'8-12'},{name:'DB Romanian Deadlift',sets:3,reps:'8-12'},{name:'One-arm DB Row',sets:3,reps:'8-12/ข้าง'},{name:'Plank',sets:2,durationSeconds:25}]},
   {dayLabel:'Day 2',focus:'Full Body B',exercises:[{name:'DB Split Squat',sets:3,reps:'8-10/ข้าง'},{name:'DB Shoulder Press',sets:3,reps:'8-10'},{name:'DB Hip Thrust',sets:3,reps:'10-12'},{name:'DB Row',sets:3,reps:'10-12'},{name:'Dead Bug',sets:2,reps:'8-10/ข้าง'}]},
   {dayLabel:'Day 3',focus:'Full Body C',exercises:[{name:'DB Squat',sets:3,reps:'10-12'},{name:'Push-up / Incline Push-up',sets:3,reps:'6-12'},{name:'DB Romanian Deadlift',sets:3,reps:'8-12'},{name:'One-arm DB Row',sets:3,reps:'8-12/ข้าง'},{name:'Side Plank',sets:2,durationSeconds:20}]}
  ]},
 {id:'fat_loss_full_body_cardio_3d',title:L('ลดไขมัน Full Body + Cardio 3 วัน','Fat Loss Full Body + Cardio 3d'),goalTags:['fat_loss','weight_control'],level:'beginner',daysPerWeek:3,equipment:['bodyweight','dumbbell','treadmill'],sessionDurationMinutes:45,
  days:[
   {dayLabel:'Day 1',focus:L('Full Body + เดินเร็ว','Full Body + brisk walk'),exercises:[{name:'Squat / Goblet Squat',sets:3,reps:'10-12'},{name:'Push-up / Floor Press',sets:3,reps:'8-12'},{name:'Romanian Deadlift',sets:3,reps:'10-12'},{name:'Row',sets:3,reps:'10-12'}],cardio:{durationMinutes:15,intensity:'moderate'}},
   {dayLabel:'Day 2',focus:'Cardio + Core',exercises:[{name:'Dead Bug',sets:3,reps:'8-10/ข้าง'},{name:'Plank',sets:3,durationSeconds:25},{name:'Bird Dog',sets:2,reps:'10/ข้าง'}],cardio:{durationMinutes:25,intensity:'moderate'}},
   {dayLabel:'Day 3',focus:'Full Body + Cardio',exercises:[{name:'Step-up',sets:3,reps:'10/ข้าง'},{name:'Shoulder Press',sets:3,reps:'8-12'},{name:'Glute Bridge',sets:3,reps:'12-15'},{name:'Row',sets:3,reps:'10-12'}],cardio:{durationMinutes:15,intensity:'moderate'}}
  ]},
 {id:'muscle_gain_upper_lower_4d',title:L('เพิ่มกล้าม Upper / Lower 4 วัน','Muscle Gain Upper/Lower 4d'),goalTags:['muscle_gain','strength'],level:'intermediate',daysPerWeek:4,equipment:['dumbbell','full_gym'],sessionDurationMinutes:60,
  days:[
   {dayLabel:'Day 1',focus:'Upper A',exercises:[{name:'Chest Press',sets:4,reps:'6-10'},{name:'Row',sets:4,reps:'8-12'},{name:'Shoulder Press',sets:3,reps:'8-12'},{name:'Lat Pulldown / Assisted Pull',sets:3,reps:'8-12'}]},
   {dayLabel:'Day 2',focus:'Lower A',exercises:[{name:'Squat / Smith Squat',sets:4,reps:'6-10'},{name:'Romanian Deadlift',sets:4,reps:'8-10'},{name:'Split Squat',sets:3,reps:'8-10/ข้าง'},{name:'Plank',sets:3,durationSeconds:30}]},
   {dayLabel:'Day 3',focus:'Upper B',exercises:[{name:'Incline Press',sets:3,reps:'8-12'},{name:'One-arm Row',sets:3,reps:'8-12/ข้าง'},{name:'Lateral Raise',sets:3,reps:'12-15'},{name:'Rear Delt Fly',sets:3,reps:'12-15'}]},
   {dayLabel:'Day 4',focus:'Lower B',exercises:[{name:'Deadlift Variation',sets:3,reps:'5-8'},{name:'Leg Press / Goblet Squat',sets:3,reps:'10-12'},{name:'Hip Thrust',sets:3,reps:'8-12'},{name:'Side Plank',sets:3,durationSeconds:25}]}
  ]}
];
var EXERCISE_ALTERNATIVES={
 squat:{noEquipment:['Chair Squat','Bodyweight Squat','Wall Squat'],dumbbell:['Goblet Squat','Dumbbell Squat'],gym:['Leg Press','Smith Squat']},
 hinge:{noEquipment:['Glute Bridge','Hip Hinge Drill'],dumbbell:['DB Romanian Deadlift','DB Hip Thrust'],gym:['Romanian Deadlift','Hip Thrust Machine']},
 push:{noEquipment:['Wall Push-up','Incline Push-up','Push-up'],dumbbell:['DB Floor Press','DB Shoulder Press'],gym:['Chest Press Machine','Smith Bench Press']},
 pull:{noEquipment:['Band Row','Inverted Row (under-table)'],dumbbell:['One-arm DB Row','DB Row'],gym:['Lat Pulldown','Seated Row']},
 core:{noEquipment:['Dead Bug','Bird Dog','Plank','Side Plank'],dumbbell:['DB Carry','Weighted Dead Bug'],gym:['Cable Pallof Press','Machine Crunch']}
};
function selectWorkoutTemplate(inp){var goal=inp.goal,level=inp.level,days=inp.daysPerWeek,eq=inp.equipment||[];
 var hasGym=eq.indexOf('full_gym')>=0||eq.indexOf('smith_machine')>=0;var hasDb=eq.indexOf('dumbbell')>=0;
 if(goal==='muscle_gain'&&days>=4)return 'muscle_gain_upper_lower_4d';
 if(goal==='fat_loss')return 'fat_loss_full_body_cardio_3d';
 if(level==='beginner'){if(hasDb)return 'beginner_full_body_dumbbell_3d';return 'beginner_full_body_bodyweight_3d';}
 if(hasDb||hasGym)return 'beginner_full_body_dumbbell_3d';
 return 'beginner_full_body_bodyweight_3d';}
function _wpProfile(){try{return (typeof user==='function')?user():(window.user&&window.user());}catch(e){return null;}}
/* ===== IU MATE gym equipment knowledge base (rule-based · local · no external AI) v8.81 =====
   schema EQUIP: {id,th,en,ath[],aen[],cat,pat[],mus[],beg,desc,safe,ex[]}
   schema EX:    {id,th,en,eq[],pat,mus[],lv,sets,reps,rest,alt[],cue[],safe}  */
var MOVEMENT_PATTERNS={squat:L('เข่า/ต้นขา/ก้น','Knee/quads/glutes'),hinge:L('สะโพก/หลังขา/ก้น','Hips/hamstrings/glutes'),push:L('ดัน (อก/ไหล่/หลังแขน)','Push'),pull:L('ดึง (หลัง/หน้าแขน)','Pull'),core:L('แกนกลางลำตัว','Core'),cardio:L('หัวใจ/เผาผลาญ','Cardio'),isolation:L('ท่าแยกเฉพาะส่วน','Isolation'),mobility:L('ยืดเหยียด','Mobility')};
var GYM_EQUIPMENT_DB=[
 {id:'treadmill',th:'ลู่วิ่ง',en:'Treadmill',ath:['ลู่วิ่งไฟฟ้า','เครื่องวิ่ง','สายพานวิ่ง'],aen:['running machine'],cat:'cardio',pat:['cardio'],mus:['หัวใจ','ขา'],beg:1,desc:'เดินเร็ว/วิ่งเบา/วิ่งชัน เพิ่มการเผาผลาญ',safe:'เริ่มความเร็วต่ำ จับราวเฉพาะตอนจำเป็น หยุดถ้าเวียนหัว/เจ็บหน้าอก',ex:['treadmill_walk','incline_walk','light_jog']},
 {id:'upright_bike',th:'จักรยานนั่งปั่น',en:'Upright Bike',ath:['จักรยาน','จักรยานปั่น','จักรยานออกกำลัง'],aen:['stationary bike','bike','cycling'],cat:'cardio',pat:['cardio'],mus:['หัวใจ','ขา'],beg:1,desc:'คาร์ดิโอนั่งปั่น ข้อต่อไม่กระแทก',safe:'ปรับความสูงเบาะให้เข่าไม่งอ/เหยียดเกิน',ex:['bike_steady','bike_intervals']},
 {id:'recumbent_bike',th:'จักรยานเอนปั่น',en:'Recumbent Bike',ath:['จักรยานเอน','จักรยานพิงหลัง'],aen:['recumbent bike'],cat:'cardio',pat:['cardio'],mus:['หัวใจ','ขา'],beg:1,desc:'จักรยานมีพนักพิง เหมาะคนปวดหลัง/น้ำหนักเยอะ',safe:'ปรับเบาะให้เหยียดเข่าได้พอดี',ex:['bike_steady']},
 {id:'spin_bike',th:'จักรยานสปิน',en:'Spin Bike',ath:['สปินไบค์','จักรยานสปินนิ่ง'],aen:['spin bike','spinning'],cat:'cardio',pat:['cardio'],mus:['หัวใจ','ขา'],beg:0,desc:'จักรยานปั่นเข้มข้น เล่นอินเทอร์วัลได้',safe:'ตั้งความหนืดพอดี ไม่ปั่นฝืนจนเข่าเจ็บ',ex:['bike_intervals','bike_steady']},
 {id:'elliptical',th:'เครื่องเดินวงรี',en:'Elliptical',ath:['เครื่องวงรี','ครอสเทรนเนอร์'],aen:['cross trainer','elliptical'],cat:'cardio',pat:['cardio'],mus:['หัวใจ','ขา','แขน'],beg:1,desc:'คาร์ดิโอทั้งตัว ข้อต่อไม่กระแทก',safe:'ยืนตัวตรง ไม่โน้มพิงจอ',ex:['elliptical_cardio']},
 {id:'rowing_machine',th:'เครื่องกรรเชียงบก',en:'Rowing Machine',ath:['เครื่องกรรเชียง','กรรเชียง'],aen:['rower','rowing machine','erg'],cat:'cardio',pat:['cardio','pull'],mus:['หัวใจ','หลัง','ขา'],beg:0,desc:'คาร์ดิโอเต็มตัว ได้ทั้งหลังและขา',safe:'ดันด้วยขาก่อนแล้วค่อยดึง หลังตรงไม่ม้วน',ex:['rowing_erg']},
 {id:'stair_climber',th:'เครื่องขึ้นบันได',en:'Stair Climber',ath:['เครื่องเดินบันได','สเตปเปอร์','สแตร์มาสเตอร์'],aen:['stairmaster','stair climber'],cat:'cardio',pat:['cardio'],mus:['หัวใจ','ขา','ก้น'],beg:1,desc:'เดินขึ้นบันไดต่อเนื่อง เน้นขา/ก้น',safe:'ไม่พิงน้ำหนักลงราวมากเกินไป',ex:['stair_climb']},
 {id:'air_bike',th:'แอร์ไบค์',en:'Air Bike',ath:['จักรยานแอร์ไบค์','assault bike'],aen:['air bike','assault bike'],cat:'cardio',pat:['cardio'],mus:['หัวใจ','ขา','แขน'],beg:0,desc:'จักรยานพัดลม ปั่น+ดันแขน เผาผลาญสูง',safe:'อบอุ่นร่างกายก่อน เริ่มเบา ๆ',ex:['air_bike_intervals']},
 {id:'chest_press_machine',th:'เครื่องดันอก',en:'Chest Press Machine',ath:['เครื่องอก','เครื่องดันหน้าอก'],aen:['chest press','machine chest press'],cat:'upper',pat:['push'],mus:['อก','หลังแขน','ไหล่หน้า'],beg:1,desc:'ฝึกอก ไหล่หน้า หลังแขน คุมแนวง่าย เหมาะมือใหม่',safe:'ปรับเบาะให้มืออยู่ระดับกลางอก ไม่ล็อกศอกสุดแรง',ex:['machine_chest_press']},
 {id:'pec_deck',th:'เครื่องหนีบอก',en:'Pec Deck',ath:['เครื่องบินอก','chest fly machine'],aen:['pec deck','chest fly'],cat:'upper',pat:['isolation'],mus:['อก'],beg:1,desc:'หนีบอกแบบแยกส่วน เก็บรายละเอียดกล้ามอก',safe:'ไม่กางศอกเกินแนวไหล่ คุมจังหวะ',ex:['pec_deck_fly']},
 {id:'reverse_pec_deck',th:'เครื่องเปิดหลังไหล่',en:'Reverse Pec Deck',ath:['เครื่องบินหลัง','rear delt machine'],aen:['reverse pec deck','rear delt'],cat:'upper',pat:['pull'],mus:['ไหล่หลัง','หลังบน'],beg:1,desc:'ฝึกไหล่หลังและหลังบน ช่วยบุคลิก',safe:'คุมจังหวะ ไม่เหวี่ยง',ex:['reverse_pec_deck_fly']},
 {id:'shoulder_press_machine',th:'เครื่องดันไหล่',en:'Shoulder Press Machine',ath:['เครื่องไหล่','เครื่องดันหัวไหล่'],aen:['shoulder press','machine shoulder press'],cat:'upper',pat:['push'],mus:['ไหล่','หลังแขน'],beg:1,desc:'ฝึกหัวไหล่ คุมแนวง่าย',safe:'ไม่แอ่นหลังมาก หยุดถ้าเจ็บไหล่',ex:['machine_shoulder_press']},
 {id:'lat_pulldown_machine',th:'เครื่องดึงหลัง',en:'Lat Pulldown Machine',ath:['เครื่องดึง lat','ดึงหลัง','ดึงบาร์หลัง'],aen:['lat pulldown','pulldown'],cat:'upper',pat:['pull'],mus:['หลัง','ปีกหลัง','หน้าแขน'],beg:1,desc:'ฝึกหลังโดยเฉพาะปีกหลัง สร้างแรงดึงช่วงบน',safe:'ดึงลงด้านหน้าอก ไม่ดึงหลังคอสำหรับมือใหม่',ex:['lat_pulldown','close_grip_pulldown']},
 {id:'seated_row_machine',th:'เครื่องดึงหลังแนวนอน',en:'Seated Row Machine',ath:['เครื่อง row','เครื่องดึงหลังนั่ง'],aen:['seated row','row machine'],cat:'upper',pat:['pull'],mus:['หลังกลาง','ปีกหลัง','หน้าแขน'],beg:1,desc:'ฝึกหลังช่วงกลาง เก็บสะบัก',safe:'นั่งหลังตรง ดึงศอกไปด้านหลัง ไม่แอ่นหลังมาก',ex:['seated_machine_row']},
 {id:'cable_machine',th:'เครื่องเคเบิล',en:'Cable Machine',ath:['เคเบิล','เคเบิลคู่','เครื่องสายเคเบิล','functional trainer'],aen:['cable machine','functional trainer','cable crossover'],cat:'upper',pat:['push','pull','isolation','core'],mus:['หลายส่วน'],beg:0,desc:'เล่นได้หลายส่วน อก หลัง ไหล่ แขน ก้น และแกนกลาง',safe:'เริ่มน้ำหนักเบา ตั้งระดับ pulley ให้เหมาะกับท่า',ex:['cable_chest_fly','cable_row','triceps_pushdown','cable_biceps_curl','face_pull','cable_lateral_raise','cable_woodchop','glute_kickback']},
 {id:'assisted_pullup_machine',th:'เครื่องช่วยดึงข้อ',en:'Assisted Pull-up Machine',ath:['เครื่องช่วยโหน','assisted pull up'],aen:['assisted pull-up','assisted dip'],cat:'upper',pat:['pull'],mus:['หลัง','ปีกหลัง','หน้าแขน'],beg:1,desc:'ช่วยพยุงน้ำหนักให้ดึงข้อ/dip ได้ เหมาะมือใหม่',safe:'เลือกน้ำหนักช่วยให้ทำครบช่วง คุมขาลงช้า',ex:['assisted_pull_up']},
 {id:'biceps_curl_machine',th:'เครื่องเล่นหน้าแขน',en:'Biceps Curl Machine',ath:['เครื่องไบเซป','เครื่องกล้ามหน้าแขน'],aen:['biceps curl machine','preacher machine'],cat:'upper',pat:['isolation'],mus:['หน้าแขน'],beg:1,desc:'ฝึกกล้ามหน้าแขนแบบแยกส่วน',safe:'คุมจังหวะ ไม่เหวี่ยง ไม่ล็อกศอก',ex:['machine_biceps_curl']},
 {id:'triceps_press_machine',th:'เครื่องเล่นหลังแขน',en:'Triceps Press Machine',ath:['เครื่องไตรเซป','เครื่องกล้ามหลังแขน'],aen:['triceps press machine','dip machine'],cat:'upper',pat:['isolation'],mus:['หลังแขน'],beg:1,desc:'ฝึกกล้ามหลังแขนแบบแยกส่วน',safe:'คุมจังหวะ ไม่กระแทกศอก',ex:['machine_triceps_press']},
 {id:'leg_press_machine',th:'เครื่องดันขา',en:'Leg Press Machine',ath:['เครื่องขา','ดันขา'],aen:['leg press'],cat:'lower',pat:['squat'],mus:['ต้นขา','ก้น','หลังขา'],beg:1,desc:'ฝึกต้นขา/ก้น คุมง่ายกว่าสควอตสำหรับมือใหม่บางคน',safe:'อย่าลงลึกจนหลังล่างม้วน ไม่ล็อกเข่าสุดแรง',ex:['machine_leg_press']},
 {id:'hack_squat_machine',th:'เครื่องแฮคสควอท',en:'Hack Squat Machine',ath:['แฮคสควอท','hack squat'],aen:['hack squat'],cat:'lower',pat:['squat'],mus:['ต้นขา','ก้น'],beg:0,desc:'สควอตบนรางเอียง เน้นต้นขาหน้า',safe:'ตั้ง safety ให้เหมาะ ลงลึกพอดีไม่ฝืนเข่า',ex:['hack_squat']},
 {id:'smith_machine',th:'สมิธแมชชีน',en:'Smith Machine',ath:['สมิธ','เครื่องสมิธ','บาร์สมิธ'],aen:['smith','smith machine'],cat:'lower',pat:['squat','push','hinge','pull'],mus:['หลายส่วน'],beg:0,desc:'บาร์วิ่งในราง ใช้ฝึก squat/press/row และอื่น ๆ ปลอดภัยตอนเล่นคนเดียว',safe:'ตั้ง safety stop ให้เหมาะ เรียนแนวการเคลื่อนไหวก่อนเพิ่มน้ำหนัก',ex:['smith_squat','smith_bench_press','smith_incline_press','smith_shoulder_press','smith_row','smith_romanian_deadlift']},
 {id:'leg_extension_machine',th:'เครื่องเหยียดขา',en:'Leg Extension Machine',ath:['เหยียดขา','เครื่องหน้าขา'],aen:['leg extension','quad extension'],cat:'lower',pat:['isolation'],mus:['ต้นขาหน้า'],beg:1,desc:'ฝึกต้นขาด้านหน้าแบบแยกส่วน',safe:'ใช้ความหนักพอดี ไม่เหวี่ยง ระวังถ้าเจ็บเข่า',ex:['machine_leg_extension']},
 {id:'leg_curl_machine',th:'เครื่องงอขา',en:'Leg Curl Machine',ath:['งอขา','เครื่องหลังขา'],aen:['leg curl','hamstring curl'],cat:'lower',pat:['hinge'],mus:['หลังขา'],beg:1,desc:'ฝึกต้นขาด้านหลัง (hamstrings)',safe:'คุมจังหวะขึ้นลง ไม่ดีดน้ำหนัก',ex:['machine_leg_curl']},
 {id:'hip_abductor_machine',th:'เครื่องกางขา',en:'Hip Abductor Machine',ath:['กางขา','เครื่องก้นข้าง'],aen:['hip abductor','abductor'],cat:'lower',pat:['isolation'],mus:['ก้นกลาง','สะโพกข้าง'],beg:1,desc:'ฝึกสะโพกด้านข้างและก้นส่วนกลาง',safe:'ไม่ใช้น้ำหนักเกิน คุมจังหวะ',ex:['machine_hip_abduction']},
 {id:'hip_adductor_machine',th:'เครื่องหุบขา',en:'Hip Adductor Machine',ath:['หุบขา','เครื่องต้นขาด้านใน'],aen:['hip adductor','adductor'],cat:'lower',pat:['isolation'],mus:['ต้นขาด้านใน'],beg:1,desc:'ฝึกต้นขาด้านใน',safe:'ใช้ช่วงการเคลื่อนไหวที่ไม่ฝืนสะโพก',ex:['machine_hip_adduction']},
 {id:'glute_kickback_machine',th:'เครื่องเตะก้น',en:'Glute Kickback Machine',ath:['เตะก้น','เครื่องก้น'],aen:['glute kickback','kickback'],cat:'lower',pat:['hinge'],mus:['ก้น'],beg:1,desc:'ฝึกกล้ามก้นแบบแยกข้าง',safe:'ไม่แอ่นหลังล่าง เกร็งก้นเป็นตัวนำ',ex:['glute_kickback']},
 {id:'standing_calf_machine',th:'เครื่องเขย่งน่อง',en:'Standing Calf Raise Machine',ath:['น่องยืน','เครื่องน่อง'],aen:['standing calf raise'],cat:'lower',pat:['isolation'],mus:['น่อง'],beg:1,desc:'ฝึกน่องท่ายืน',safe:'ลงส้นช้า ๆ เต็มช่วง',ex:['standing_calf_raise']},
 {id:'seated_calf_machine',th:'เครื่องน่องนั่ง',en:'Seated Calf Raise Machine',ath:['น่องนั่ง'],aen:['seated calf raise'],cat:'lower',pat:['isolation'],mus:['น่อง'],beg:1,desc:'ฝึกน่องท่านั่ง เน้นน่องส่วนลึก',safe:'คุมจังหวะเต็มช่วง',ex:['seated_calf_raise']},
 {id:'ab_crunch_machine',th:'เครื่องบริหารหน้าท้อง',en:'Ab Crunch Machine',ath:['เครื่องท้อง','เครื่อง crunch'],aen:['ab crunch machine'],cat:'core',pat:['core'],mus:['หน้าท้อง'],beg:1,desc:'ฝึกหน้าท้องแบบมีแรงต้าน',safe:'งอลำตัวด้วยหน้าท้อง ไม่ดึงคอ',ex:['ab_crunch_machine_ex']},
 {id:'back_extension_bench',th:'ม้านอนหลัง',en:'Back Extension Bench',ath:['โรมันแชร์','roman chair','ม้าหลัง'],aen:['back extension','roman chair','hyperextension'],cat:'core',pat:['hinge'],mus:['หลังล่าง','ก้น','หลังขา'],beg:1,desc:'ฝึกหลังล่าง/ก้น/หลังขา',safe:'ยกขึ้นแค่แนวลำตัวตรง ไม่แอ่นเกิน',ex:['back_extension']},
 {id:'captains_chair',th:'เครื่องยกเข่า',en:"Captain's Chair",ath:['ที่ยกเข่า','captain chair'],aen:["captain's chair","knee raise station"],cat:'core',pat:['core'],mus:['หน้าท้องล่าง'],beg:1,desc:'ยกเข่าฝึกหน้าท้องล่าง',safe:'ยกด้วยหน้าท้อง ไม่เหวี่ยงขา',ex:['hanging_knee_raise']},
 {id:'rotary_torso_machine',th:'เครื่องบิดลำตัว',en:'Rotary Torso Machine',ath:['เครื่องบิดเอว','rotary torso'],aen:['rotary torso','torso twist'],cat:'core',pat:['core'],mus:['เอว','หน้าท้องข้าง'],beg:0,desc:'ฝึกบิดลำตัว/หน้าท้องข้าง',safe:'บิดช่วงพอดี ไม่ฝืนหลังล่าง',ex:['rotary_torso']},
 {id:'dumbbell',th:'ดัมเบล',en:'Dumbbell',ath:['ดัมเบลล์'],aen:['dumbbell','dumbbells'],cat:'free',pat:['push','pull','squat','hinge','isolation'],mus:['ทุกส่วน'],beg:1,desc:'อเนกประสงค์ เล่นได้ทุกส่วน เหมาะบ้านและยิม',safe:'เลือกน้ำหนักที่คุมท่าได้ตลอดช่วง',ex:['dumbbell_bench_press','dumbbell_row','dumbbell_shoulder_press','goblet_squat','dumbbell_curl','bulgarian_split_squat','dumbbell_rdl','lateral_raise']},
 {id:'barbell',th:'บาร์เบล',en:'Barbell',ath:['บาร์เบลล์','คานบาร์'],aen:['barbell'],cat:'free',pat:['squat','hinge','push','pull'],mus:['ทุกส่วน'],beg:0,desc:'ท่าคอมพาวด์หนัก สร้างแรงและกล้ามหลัก',safe:'ฟอร์มต้องแม่นก่อนเพิ่มน้ำหนัก ไม่ยกหนักสุดสำหรับมือใหม่',ex:['barbell_squat','barbell_bench_press','barbell_row','overhead_press','romanian_deadlift','barbell_curl']},
 {id:'ez_bar',th:'บาร์ EZ',en:'EZ Bar',ath:['อีซีบาร์','บาร์ซิกแซก'],aen:['ez bar','ez curl bar'],cat:'free',pat:['isolation'],mus:['หน้าแขน','หลังแขน'],beg:1,desc:'บาร์โค้งถนอมข้อมือ เล่นแขนได้ดี',safe:'จับให้สบายข้อมือ คุมจังหวะ',ex:['barbell_curl']},
 {id:'kettlebell',th:'เคทเทิลเบล',en:'Kettlebell',ath:['เคตเทิลเบล','เคตเบล'],aen:['kettlebell'],cat:'free',pat:['hinge','squat'],mus:['สะโพก','ก้น','ขา','แกนกลาง'],beg:0,desc:'เหมาะท่าเหวี่ยงและคาร์ดิโอแรงต้าน',safe:'เริ่มน้ำหนักเบา เรียนท่า hinge ให้ถูกก่อน',ex:['kettlebell_swing','goblet_squat']},
 {id:'adjustable_bench',th:'ม้านั่งปรับระดับ',en:'Adjustable Bench',ath:['ม้านอนปรับระดับ','ม้านั่ง','เบนช์'],aen:['adjustable bench','bench','flat bench'],cat:'free',pat:['push'],mus:['อก','ไหล่'],beg:1,desc:'ม้านั่งปรับองศา ใช้คู่ดัมเบล/บาร์เบล',safe:'ล็อกองศาให้แน่นก่อนเล่น',ex:['dumbbell_bench_press','barbell_bench_press']},
 {id:'squat_rack',th:'แร็คสควอท',en:'Squat Rack',ath:['พาวเวอร์แร็ค','power rack','แร็ค'],aen:['squat rack','power rack'],cat:'free',pat:['squat','push'],mus:['ขา','ก้น'],beg:0,desc:'ที่วางบาร์สำหรับสควอต/เพรส ปลอดภัยด้วย safety bar',safe:'ตั้ง safety bar ทุกครั้ง',ex:['barbell_squat','overhead_press']},
 {id:'pull_up_bar',th:'บาร์โหน',en:'Pull-up Bar',ath:['โหนบาร์','ราวโหน'],aen:['pull-up bar','pull up bar'],cat:'free',pat:['pull','core'],mus:['หลัง','หน้าแขน','แกนกลาง'],beg:0,desc:'สร้างหลัง/แขนด้วยน้ำหนักตัว',safe:'ถ้ายังโหนไม่ได้ ใช้เครื่องช่วยดึงข้อหรือยางช่วย',ex:['pull_up','chin_up','hanging_knee_raise']},
 {id:'dip_station',th:'ที่เล่น Dip',en:'Dip Station',ath:['บาร์ dip','ราว dip'],aen:['dip station','parallel bars'],cat:'free',pat:['push'],mus:['อก','หลังแขน','ไหล่'],beg:0,desc:'ฝึกอกล่าง/หลังแขนด้วยน้ำหนักตัว',safe:'ลงพอดีช่วงไหล่ ไม่ลงลึกจนเจ็บไหล่',ex:['dip']},
 {id:'resistance_band',th:'ยางยืด',en:'Resistance Band',ath:['แถบยางยืด','เรซิสแบนด์'],aen:['resistance band','band'],cat:'free',pat:['pull','push','isolation'],mus:['ทุกส่วน'],beg:1,desc:'พกพาง่าย เล่นบ้านได้ ข้อต่อไม่กระแทก',safe:'ยึดปลายให้แน่น ระวังยางดีดกลับ',ex:['band_pull_apart','band_row','band_external_rotation']},
 {id:'trx',th:'TRX',en:'TRX',ath:['สายโหน','suspension trainer','ที่อาร์เอ็กซ์'],aen:['trx','suspension trainer'],cat:'free',pat:['pull','push','core'],mus:['ทุกส่วน','แกนกลาง'],beg:0,desc:'สายห้อยใช้น้ำหนักตัว ปรับความยากด้วยมุมตัว',safe:'ยึดจุดแขวนให้มั่นคง คุมแกนกลาง',ex:['trx_row']},
 {id:'step_box',th:'กล่องสเต็ป',en:'Step Box',ath:['บ็อกซ์','step box','plyo box'],aen:['step box','plyo box'],cat:'free',pat:['squat','cardio'],mus:['ขา','ก้น'],beg:1,desc:'ก้าวขึ้น-ลง ฝึกขา/คาร์ดิโอ',safe:'เลือกความสูงพอดี วางเต็มเท้า',ex:['step_up']},
 {id:'medicine_ball',th:'เมดิซีนบอล',en:'Medicine Ball',ath:['ลูกบอลถ่วงน้ำหนัก','เมดบอล'],aen:['medicine ball','med ball'],cat:'free',pat:['core','cardio'],mus:['แกนกลาง','ทั้งตัว'],beg:1,desc:'ลูกบอลถ่วงน้ำหนัก ฝึกแกนกลาง/พลัง',safe:'เริ่มน้ำหนักเบา ระวังหลังตอนเหวี่ยง',ex:['med_ball_slam']},
 {id:'battle_rope',th:'เชือก Battle Rope',ath:['แบทเทิลโรป','เชือกออกกำลัง'],en:'Battle Rope',aen:['battle rope','battling rope'],cat:'free',pat:['cardio','core'],mus:['ไหล่','แขน','แกนกลาง','หัวใจ'],beg:1,desc:'สะบัดเชือก คาร์ดิโอแรงต้านเผาผลาญสูง',safe:'ย่อเข่าเล็กน้อย เกร็งแกนกลาง',ex:['battle_rope_wave']},
 {id:'foam_roller',th:'โฟมโรลเลอร์',en:'Foam Roller',ath:['ลูกกลิ้งโฟม'],aen:['foam roller'],cat:'free',pat:['mobility'],mus:['ฟื้นฟู'],beg:1,desc:'คลายกล้ามเนื้อ/ฟื้นฟูหลังฝึก',safe:'กลิ้งช้า ๆ เลี่ยงกลิ้งทับข้อต่อ/กระดูกโดยตรง',ex:['foam_roll']}
];
var MACHINE_EXERCISE_DB=[
 {id:'treadmill_walk',th:'เดินเร็วบนลู่วิ่ง',en:'Treadmill Walk',eq:['treadmill'],pat:'cardio',mus:['หัวใจ','ขา'],lv:'beginner',sets:1,reps:'10–30 นาที',rest:0,alt:['bike_steady','elliptical_cardio'],cue:['ยืนตัวตรง แกว่งแขนเป็นธรรมชาติ']},
 {id:'incline_walk',th:'เดินชันบนลู่วิ่ง',en:'Incline Walk',eq:['treadmill'],pat:'cardio',mus:['หัวใจ','ขา','ก้น'],lv:'beginner',sets:1,reps:'15–25 นาที',rest:0,alt:['stair_climb'],cue:['ตั้งความชัน 5–10% ไม่จับราว']},
 {id:'light_jog',th:'วิ่งเบาบนลู่วิ่ง',en:'Light Jog',eq:['treadmill'],pat:'cardio',mus:['หัวใจ','ขา'],lv:'intermediate',sets:1,reps:'15–30 นาที',rest:0,alt:['elliptical_cardio'],cue:['ลงกลางเท้า จังหวะสม่ำเสมอ']},
 {id:'bike_steady',th:'ปั่นจักรยานต่อเนื่อง',en:'Steady Bike',eq:['upright_bike','recumbent_bike','spin_bike'],pat:'cardio',mus:['หัวใจ','ขา'],lv:'beginner',sets:1,reps:'15–30 นาที',rest:0,alt:['treadmill_walk','elliptical_cardio'],cue:['ปรับเบาะให้เข่าไม่งอเกิน']},
 {id:'bike_intervals',th:'ปั่นอินเทอร์วัล',en:'Bike Intervals',eq:['spin_bike','upright_bike','air_bike'],pat:'cardio',mus:['หัวใจ','ขา'],lv:'intermediate',sets:1,reps:'10–20 นาที',rest:0,alt:['air_bike_intervals'],cue:['สลับหนัก 30 วิ เบา 60 วิ']},
 {id:'elliptical_cardio',th:'เดินวงรี',en:'Elliptical',eq:['elliptical'],pat:'cardio',mus:['หัวใจ','ขา','แขน'],lv:'beginner',sets:1,reps:'15–30 นาที',rest:0,alt:['treadmill_walk','bike_steady'],cue:['ยืนตรง ดันด้วยส้นเท้า']},
 {id:'rowing_erg',th:'กรรเชียงบก',en:'Rowing Erg',eq:['rowing_machine'],pat:'cardio',mus:['หัวใจ','หลัง','ขา'],lv:'intermediate',sets:1,reps:'10–20 นาที',rest:0,alt:['seated_machine_row'],cue:['ดันขา → เอนตัว → ดึงมือ','หลังตรงไม่ม้วน']},
 {id:'stair_climb',th:'ขึ้นบันได',en:'Stair Climb',eq:['stair_climber'],pat:'cardio',mus:['หัวใจ','ขา','ก้น'],lv:'beginner',sets:1,reps:'10–20 นาที',rest:0,alt:['incline_walk'],cue:['ยืนตรง ไม่พิงราว']},
 {id:'air_bike_intervals',th:'แอร์ไบค์อินเทอร์วัล',en:'Air Bike Intervals',eq:['air_bike'],pat:'cardio',mus:['หัวใจ','ขา','แขน'],lv:'intermediate',sets:1,reps:'8–15 นาที',rest:0,alt:['bike_intervals'],cue:['สลับเร่ง 20 วิ พัก 40 วิ']},
 {id:'machine_chest_press',th:'ดันอกด้วยเครื่อง',en:'Machine Chest Press',eq:['chest_press_machine'],pat:'push',mus:['อก','หลังแขน','ไหล่หน้า'],lv:'beginner',sets:3,reps:'8–12',rest:75,alt:['dumbbell_bench_press','smith_bench_press','dip'],cue:['มืออยู่ระดับกลางอก','ไม่ล็อกศอกสุดแรง']},
 {id:'pec_deck_fly',th:'หนีบอกด้วยเครื่อง',en:'Pec Deck Fly',eq:['pec_deck'],pat:'isolation',mus:['อก'],lv:'beginner',sets:3,reps:'10–15',rest:60,alt:['cable_chest_fly','dumbbell_bench_press'],cue:['บีบอกเป็นตัวนำ คุมจังหวะกลับ']},
 {id:'reverse_pec_deck_fly',th:'เปิดหลังไหล่ด้วยเครื่อง',en:'Reverse Pec Deck',eq:['reverse_pec_deck'],pat:'pull',mus:['ไหล่หลัง','หลังบน'],lv:'beginner',sets:3,reps:'12–15',rest:60,alt:['face_pull','band_pull_apart'],cue:['กางแขนด้วยไหล่หลัง ไม่เหวี่ยง']},
 {id:'machine_shoulder_press',th:'ดันไหล่ด้วยเครื่อง',en:'Machine Shoulder Press',eq:['shoulder_press_machine'],pat:'push',mus:['ไหล่','หลังแขน'],lv:'beginner',sets:3,reps:'8–12',rest:75,alt:['dumbbell_shoulder_press','smith_shoulder_press'],cue:['ไม่แอ่นหลัง ดันขึ้นตรง']},
 {id:'lat_pulldown',th:'ดึงหลัง Lat Pulldown',en:'Lat Pulldown',eq:['lat_pulldown_machine','cable_machine'],pat:'pull',mus:['หลัง','ปีกหลัง','หน้าแขน'],lv:'beginner',sets:3,reps:'8–12',rest:75,alt:['assisted_pull_up','seated_machine_row','dumbbell_row'],cue:['นั่งตัวตรง อกเปิด','ดึงศอกลงข้างลำตัว ไม่ดึงหลังคอ']},
 {id:'close_grip_pulldown',th:'ดึงหลังจับแคบ',en:'Close-grip Pulldown',eq:['lat_pulldown_machine','cable_machine'],pat:'pull',mus:['ปีกหลัง','หน้าแขน'],lv:'beginner',sets:3,reps:'10–12',rest:75,alt:['lat_pulldown','seated_machine_row'],cue:['ดึงลงหน้าอก เก็บสะบัก']},
 {id:'seated_machine_row',th:'ดึงหลังแนวนอนด้วยเครื่อง',en:'Seated Machine Row',eq:['seated_row_machine','cable_machine'],pat:'pull',mus:['หลังกลาง','ปีกหลัง'],lv:'beginner',sets:3,reps:'8–12',rest:75,alt:['lat_pulldown','dumbbell_row','rowing_erg'],cue:['ดึงศอกไปด้านหลัง บีบสะบัก','ไม่แอ่นหลัง']},
 {id:'cable_chest_fly',th:'หนีบอกเคเบิล',en:'Cable Chest Fly',eq:['cable_machine'],pat:'isolation',mus:['อก'],lv:'intermediate',sets:3,reps:'12–15',rest:60,alt:['pec_deck_fly'],cue:['โค้งศอกเล็กน้อย บีบอก']},
 {id:'cable_row',th:'ดึงเคเบิลแถวนอน',en:'Cable Row',eq:['cable_machine'],pat:'pull',mus:['หลังกลาง'],lv:'beginner',sets:3,reps:'10–12',rest:75,alt:['seated_machine_row'],cue:['หลังตรง ดึงศอกชิดลำตัว']},
 {id:'triceps_pushdown',th:'กดหลังแขนเคเบิล',en:'Triceps Pushdown',eq:['cable_machine'],pat:'isolation',mus:['หลังแขน'],lv:'beginner',sets:3,reps:'10–15',rest:60,alt:['machine_triceps_press'],cue:['ศอกชิดลำตัว เหยียดสุดแล้วคุมกลับ']},
 {id:'cable_biceps_curl',th:'เคิร์ลหน้าแขนเคเบิล',en:'Cable Biceps Curl',eq:['cable_machine'],pat:'isolation',mus:['หน้าแขน'],lv:'beginner',sets:3,reps:'10–15',rest:60,alt:['dumbbell_curl','machine_biceps_curl'],cue:['ศอกนิ่ง ไม่เหวี่ยง']},
 {id:'face_pull',th:'ดึงหน้า Face Pull',en:'Face Pull',eq:['cable_machine'],pat:'pull',mus:['ไหล่หลัง','หลังบน'],lv:'intermediate',sets:3,reps:'12–15',rest:60,alt:['reverse_pec_deck_fly','band_pull_apart'],cue:['ดึงเข้าหาหน้าผาก กางศอกออก']},
 {id:'cable_lateral_raise',th:'ยกข้างเคเบิล',en:'Cable Lateral Raise',eq:['cable_machine'],pat:'isolation',mus:['ไหล่ข้าง'],lv:'intermediate',sets:3,reps:'12–15',rest:60,alt:['lateral_raise'],cue:['ยกถึงระดับไหล่ คุมจังหวะลง']},
 {id:'cable_woodchop',th:'สับเฉียงเคเบิล',en:'Cable Woodchop',eq:['cable_machine'],pat:'core',mus:['แกนกลาง','เอว'],lv:'intermediate',sets:3,reps:'10–12/ข้าง',rest:45,alt:['rotary_torso','med_ball_slam'],cue:['หมุนจากลำตัว ไม่ใช้แขนล้วน']},
 {id:'assisted_pull_up',th:'ดึงข้อแบบมีตัวช่วย',en:'Assisted Pull-up',eq:['assisted_pullup_machine'],pat:'pull',mus:['หลัง','ปีกหลัง','หน้าแขน'],lv:'beginner',sets:3,reps:'6–10',rest:90,alt:['lat_pulldown','pull_up'],cue:['ดึงเต็มช่วง คุมลงช้า']},
 {id:'machine_biceps_curl',th:'เคิร์ลหน้าแขนเครื่อง',en:'Machine Biceps Curl',eq:['biceps_curl_machine'],pat:'isolation',mus:['หน้าแขน'],lv:'beginner',sets:3,reps:'10–12',rest:60,alt:['cable_biceps_curl','dumbbell_curl'],cue:['คุมจังหวะ ไม่ล็อกศอก']},
 {id:'machine_triceps_press',th:'กดหลังแขนเครื่อง',en:'Machine Triceps Press',eq:['triceps_press_machine'],pat:'isolation',mus:['หลังแขน'],lv:'beginner',sets:3,reps:'10–12',rest:60,alt:['triceps_pushdown','dip'],cue:['เหยียดสุดแล้วคุมกลับ']},
 {id:'machine_leg_press',th:'ดันขาด้วยเครื่อง',en:'Leg Press',eq:['leg_press_machine'],pat:'squat',mus:['ต้นขา','ก้น'],lv:'beginner',sets:3,reps:'10–12',rest:90,alt:['goblet_squat','smith_squat','hack_squat'],cue:['ลงพอดีไม่ให้หลังล่างม้วน','ไม่ล็อกเข่าสุด']},
 {id:'hack_squat',th:'แฮคสควอท',en:'Hack Squat',eq:['hack_squat_machine'],pat:'squat',mus:['ต้นขาหน้า','ก้น'],lv:'intermediate',sets:3,reps:'8–12',rest:90,alt:['machine_leg_press','smith_squat'],cue:['ลงลึกพอดี เท้าเต็มแผ่น']},
 {id:'smith_squat',th:'สควอตสมิธ',en:'Smith Squat',eq:['smith_machine'],pat:'squat',mus:['ต้นขา','ก้น'],lv:'intermediate',sets:3,reps:'8–12',rest:90,alt:['machine_leg_press','goblet_squat'],cue:['ตั้ง safety ก่อน','เข่าตามแนวปลายเท้า']},
 {id:'smith_bench_press',th:'เบนช์เพรสสมิธ',en:'Smith Bench Press',eq:['smith_machine'],pat:'push',mus:['อก','หลังแขน'],lv:'intermediate',sets:3,reps:'8–12',rest:90,alt:['machine_chest_press','dumbbell_bench_press'],cue:['ลงบาร์ระดับกลางอก คุมจังหวะ']},
 {id:'smith_incline_press',th:'อินไคลน์เพรสสมิธ',en:'Smith Incline Press',eq:['smith_machine'],pat:'push',mus:['อกบน','ไหล่หน้า'],lv:'intermediate',sets:3,reps:'8–12',rest:90,alt:['machine_shoulder_press'],cue:['ตั้งเบาะเอียง 30°']},
 {id:'smith_shoulder_press',th:'ดันไหล่สมิธ',en:'Smith Shoulder Press',eq:['smith_machine'],pat:'push',mus:['ไหล่','หลังแขน'],lv:'intermediate',sets:3,reps:'8–12',rest:90,alt:['machine_shoulder_press','dumbbell_shoulder_press'],cue:['ไม่แอ่นหลังมาก']},
 {id:'smith_row',th:'โรว์สมิธ',en:'Smith Row',eq:['smith_machine'],pat:'pull',mus:['หลังกลาง'],lv:'intermediate',sets:3,reps:'8–12',rest:90,alt:['seated_machine_row','dumbbell_row'],cue:['ก้มตัวหลังตรง ดึงศอกชิดลำตัว']},
 {id:'smith_romanian_deadlift',th:'RDL สมิธ',en:'Smith Romanian Deadlift',eq:['smith_machine'],pat:'hinge',mus:['หลังขา','ก้น','หลังล่าง'],lv:'intermediate',sets:3,reps:'8–12',rest:90,alt:['romanian_deadlift','machine_leg_curl'],cue:['ดันสะโพกไปหลัง หลังตรง']},
 {id:'machine_leg_extension',th:'เหยียดขาด้วยเครื่อง',en:'Leg Extension',eq:['leg_extension_machine'],pat:'isolation',mus:['ต้นขาหน้า'],lv:'beginner',sets:3,reps:'10–15',rest:60,alt:['machine_leg_press','goblet_squat'],cue:['เหยียดสุดแล้วคุมกลับ ไม่เหวี่ยง']},
 {id:'machine_leg_curl',th:'งอขาด้วยเครื่อง',en:'Leg Curl',eq:['leg_curl_machine'],pat:'hinge',mus:['หลังขา'],lv:'beginner',sets:3,reps:'10–15',rest:60,alt:['romanian_deadlift','smith_romanian_deadlift'],cue:['คุมจังหวะขึ้นลง ไม่ดีด']},
 {id:'machine_hip_abduction',th:'กางขาด้วยเครื่อง',en:'Hip Abduction',eq:['hip_abductor_machine'],pat:'isolation',mus:['ก้นกลาง','สะโพกข้าง'],lv:'beginner',sets:3,reps:'12–15',rest:60,alt:['step_up'],cue:['ดันออกด้วยก้น ไม่เอนหลัง']},
 {id:'machine_hip_adduction',th:'หุบขาด้วยเครื่อง',en:'Hip Adduction',eq:['hip_adductor_machine'],pat:'isolation',mus:['ต้นขาด้านใน'],lv:'beginner',sets:3,reps:'12–15',rest:60,alt:['goblet_squat'],cue:['หุบเข้าช้า ๆ คุมจังหวะ']},
 {id:'glute_kickback',th:'เตะก้น',en:'Glute Kickback',eq:['glute_kickback_machine','cable_machine'],pat:'hinge',mus:['ก้น'],lv:'beginner',sets:3,reps:'12–15/ข้าง',rest:60,alt:['machine_leg_curl'],cue:['เกร็งก้นนำ ไม่แอ่นหลังล่าง']},
 {id:'standing_calf_raise',th:'เขย่งน่องยืน',en:'Standing Calf Raise',eq:['standing_calf_machine'],pat:'isolation',mus:['น่อง'],lv:'beginner',sets:3,reps:'12–20',rest:45,alt:['seated_calf_raise'],cue:['ขึ้นสุด ลงส้นช้า ๆ']},
 {id:'seated_calf_raise',th:'เขย่งน่องนั่ง',en:'Seated Calf Raise',eq:['seated_calf_machine'],pat:'isolation',mus:['น่อง'],lv:'beginner',sets:3,reps:'12–20',rest:45,alt:['standing_calf_raise'],cue:['เต็มช่วง คุมจังหวะ']},
 {id:'ab_crunch_machine_ex',th:'ครันช์ด้วยเครื่อง',en:'Machine Crunch',eq:['ab_crunch_machine'],pat:'core',mus:['หน้าท้อง'],lv:'beginner',sets:3,reps:'12–20',rest:45,alt:['cable_woodchop','plank'],cue:['งอด้วยหน้าท้อง ไม่ดึงคอ']},
 {id:'back_extension',th:'ยกหลังล่าง',en:'Back Extension',eq:['back_extension_bench'],pat:'hinge',mus:['หลังล่าง','ก้น','หลังขา'],lv:'beginner',sets:3,reps:'10–15',rest:60,alt:['glute_kickback','machine_leg_curl'],cue:['ยกแค่แนวลำตัวตรง ไม่แอ่นเกิน']},
 {id:'hanging_knee_raise',th:'ยกเข่าห้อยตัว',en:'Hanging Knee Raise',eq:['captains_chair','pull_up_bar'],pat:'core',mus:['หน้าท้องล่าง'],lv:'beginner',sets:3,reps:'10–15',rest:45,alt:['ab_crunch_machine_ex','plank'],cue:['ยกด้วยหน้าท้อง ไม่เหวี่ยงขา']},
 {id:'rotary_torso',th:'บิดลำตัว',en:'Rotary Torso',eq:['rotary_torso_machine'],pat:'core',mus:['เอว','หน้าท้องข้าง'],lv:'intermediate',sets:3,reps:'12–15/ข้าง',rest:45,alt:['cable_woodchop'],cue:['บิดช่วงพอดี ไม่ฝืนหลังล่าง']},
 {id:'plank',th:'แพลงก์',en:'Plank',eq:['none','foam_roller','step_box'],pat:'core',mus:['แกนกลาง'],lv:'beginner',sets:3,reps:'20–45 วินาที',rest:45,alt:['ab_crunch_machine_ex','hanging_knee_raise'],cue:['ตัวตรงเป็นเส้นเดียว เกร็งหน้าท้อง']},
 {id:'dumbbell_bench_press',th:'ดันอกดัมเบล',en:'Dumbbell Bench Press',eq:['dumbbell','adjustable_bench'],pat:'push',mus:['อก','หลังแขน','ไหล่หน้า'],lv:'beginner',sets:3,reps:'8–12',rest:75,alt:['machine_chest_press','smith_bench_press'],cue:['ลงพอดีระดับอก คุมจังหวะ']},
 {id:'dumbbell_row',th:'โรว์ดัมเบล',en:'Dumbbell Row',eq:['dumbbell','adjustable_bench'],pat:'pull',mus:['หลังกลาง','ปีกหลัง'],lv:'beginner',sets:3,reps:'8–12',rest:75,alt:['seated_machine_row','lat_pulldown'],cue:['หลังตรง ดึงศอกชิดลำตัว']},
 {id:'dumbbell_shoulder_press',th:'ดันไหล่ดัมเบล',en:'Dumbbell Shoulder Press',eq:['dumbbell'],pat:'push',mus:['ไหล่','หลังแขน'],lv:'beginner',sets:3,reps:'8–12',rest:75,alt:['machine_shoulder_press','smith_shoulder_press'],cue:['ดันขึ้นตรง ไม่แอ่นหลัง']},
 {id:'goblet_squat',th:'กอเบล็ตสควอต',en:'Goblet Squat',eq:['dumbbell','kettlebell'],pat:'squat',mus:['ต้นขา','ก้น'],lv:'beginner',sets:3,reps:'10–12',rest:75,alt:['machine_leg_press','smith_squat'],cue:['อกตั้ง ลงลึกพอดี เข่าตามปลายเท้า']},
 {id:'dumbbell_curl',th:'เคิร์ลดัมเบล',en:'Dumbbell Curl',eq:['dumbbell','ez_bar'],pat:'isolation',mus:['หน้าแขน'],lv:'beginner',sets:3,reps:'10–12',rest:60,alt:['cable_biceps_curl','machine_biceps_curl'],cue:['ศอกนิ่ง คุมจังหวะลง']},
 {id:'bulgarian_split_squat',th:'บัลแกเรียนสปลิทสควอต',en:'Bulgarian Split Squat',eq:['dumbbell','adjustable_bench'],pat:'squat',mus:['ต้นขา','ก้น'],lv:'intermediate',sets:3,reps:'8–12/ข้าง',rest:75,alt:['goblet_squat','step_up'],cue:['ลงตรง เข่าไม่เลยปลายเท้ามาก']},
 {id:'dumbbell_rdl',th:'RDL ดัมเบล',en:'Dumbbell RDL',eq:['dumbbell'],pat:'hinge',mus:['หลังขา','ก้น','หลังล่าง'],lv:'beginner',sets:3,reps:'8–12',rest:75,alt:['machine_leg_curl','romanian_deadlift'],cue:['ดันสะโพกไปหลัง หลังตรง']},
 {id:'lateral_raise',th:'ยกข้างดัมเบล',en:'Lateral Raise',eq:['dumbbell'],pat:'isolation',mus:['ไหล่ข้าง'],lv:'beginner',sets:3,reps:'12–15',rest:45,alt:['cable_lateral_raise'],cue:['ยกถึงระดับไหล่ ไม่เหวี่ยง']},
 {id:'barbell_squat',th:'บาร์เบลสควอต',en:'Barbell Back Squat',eq:['barbell','squat_rack'],pat:'squat',mus:['ต้นขา','ก้น'],lv:'intermediate',sets:3,reps:'5–8',rest:120,alt:['machine_leg_press','goblet_squat','smith_squat'],cue:['ตั้ง safety bar','เข่าตามปลายเท้า หลังตรง']},
 {id:'barbell_bench_press',th:'บาร์เบลเบนช์เพรส',en:'Barbell Bench Press',eq:['barbell','adjustable_bench'],pat:'push',mus:['อก','หลังแขน','ไหล่หน้า'],lv:'intermediate',sets:3,reps:'5–8',rest:120,alt:['dumbbell_bench_press','machine_chest_press'],cue:['มีคนช่วยถ้าหนัก ลงระดับกลางอก']},
 {id:'barbell_row',th:'บาร์เบลโรว์',en:'Barbell Row',eq:['barbell'],pat:'pull',mus:['หลังกลาง','ปีกหลัง'],lv:'intermediate',sets:3,reps:'6–10',rest:90,alt:['seated_machine_row','dumbbell_row'],cue:['ก้มตัวหลังตรง ดึงศอกชิดลำตัว']},
 {id:'overhead_press',th:'โอเวอร์เฮดเพรส',en:'Overhead Press',eq:['barbell','squat_rack'],pat:'push',mus:['ไหล่','หลังแขน'],lv:'intermediate',sets:3,reps:'5–8',rest:90,alt:['machine_shoulder_press','dumbbell_shoulder_press'],cue:['เกร็งแกนกลาง ดันขึ้นตรง']},
 {id:'romanian_deadlift',th:'โรมาเนียนเดดลิฟต์',en:'Romanian Deadlift',eq:['barbell'],pat:'hinge',mus:['หลังขา','ก้น','หลังล่าง'],lv:'intermediate',sets:3,reps:'6–10',rest:90,alt:['dumbbell_rdl','machine_leg_curl','smith_romanian_deadlift'],cue:['ดันสะโพกไปหลัง หลังตรงตลอด']},
 {id:'barbell_curl',th:'บาร์เบลเคิร์ล',en:'Barbell Curl',eq:['barbell','ez_bar'],pat:'isolation',mus:['หน้าแขน'],lv:'beginner',sets:3,reps:'8–12',rest:60,alt:['dumbbell_curl','cable_biceps_curl'],cue:['ศอกนิ่ง ไม่เหวี่ยงตัว']},
 {id:'kettlebell_swing',th:'เคทเทิลเบลสวิง',en:'Kettlebell Swing',eq:['kettlebell'],pat:'hinge',mus:['สะโพก','ก้น','หลังล่าง'],lv:'intermediate',sets:3,reps:'12–15',rest:60,alt:['romanian_deadlift','dumbbell_rdl'],cue:['ขับด้วยสะโพก ไม่ใช้แขนยก หลังตรง']},
 {id:'pull_up',th:'ดึงข้อ',en:'Pull-up',eq:['pull_up_bar'],pat:'pull',mus:['หลัง','ปีกหลัง','หน้าแขน'],lv:'advanced',sets:3,reps:'5–10',rest:90,alt:['assisted_pull_up','lat_pulldown'],cue:['ดึงเต็มช่วง คุมลงช้า']},
 {id:'chin_up',th:'ชินอัพ',en:'Chin-up',eq:['pull_up_bar'],pat:'pull',mus:['หลัง','หน้าแขน'],lv:'advanced',sets:3,reps:'5–10',rest:90,alt:['assisted_pull_up','lat_pulldown'],cue:['จับหงายมือ ดึงเต็มช่วง']},
 {id:'dip',th:'ดิป',en:'Dip',eq:['dip_station'],pat:'push',mus:['อกล่าง','หลังแขน','ไหล่'],lv:'intermediate',sets:3,reps:'6–12',rest:75,alt:['machine_chest_press','machine_triceps_press'],cue:['ลงพอดีช่วงไหล่ ไม่ลงลึกจนเจ็บ']},
 {id:'band_pull_apart',th:'ดึงยางแยก',en:'Band Pull-apart',eq:['resistance_band'],pat:'pull',mus:['ไหล่หลัง','หลังบน'],lv:'beginner',sets:3,reps:'15–20',rest:45,alt:['face_pull','reverse_pec_deck_fly'],cue:['กางออกด้วยไหล่หลัง บีบสะบัก']},
 {id:'band_row',th:'โรว์ยางยืด',en:'Band Row',eq:['resistance_band'],pat:'pull',mus:['หลังกลาง'],lv:'beginner',sets:3,reps:'12–15',rest:45,alt:['seated_machine_row','dumbbell_row'],cue:['ดึงศอกชิดลำตัว หลังตรง']},
 {id:'band_external_rotation',th:'หมุนไหล่ยางยืด',en:'Band External Rotation',eq:['resistance_band'],pat:'isolation',mus:['ไหล่','หัวไหล่หมุนนอก'],lv:'beginner',sets:2,reps:'12–15',rest:45,alt:['face_pull'],cue:['ศอกชิดลำตัว หมุนช้า ๆ']},
 {id:'trx_row',th:'โรว์ TRX',en:'TRX Row',eq:['trx'],pat:'pull',mus:['หลังกลาง','แกนกลาง'],lv:'beginner',sets:3,reps:'10–15',rest:60,alt:['seated_machine_row','band_row'],cue:['ตัวตรง ดึงอกเข้าหามือ']},
 {id:'step_up',th:'สเต็ปอัพ',en:'Step-up',eq:['step_box','dumbbell'],pat:'squat',mus:['ต้นขา','ก้น'],lv:'beginner',sets:3,reps:'10–12/ข้าง',rest:60,alt:['bulgarian_split_squat','goblet_squat'],cue:['วางเต็มเท้า ดันด้วยส้น']},
 {id:'med_ball_slam',th:'ทุ่มเมดิซีนบอล',en:'Medicine Ball Slam',eq:['medicine_ball'],pat:'core',mus:['แกนกลาง','ทั้งตัว'],lv:'beginner',sets:3,reps:'10–12',rest:45,alt:['cable_woodchop','battle_rope_wave'],cue:['ทุ่มด้วยแกนกลาง ย่อเข่ารับ']},
 {id:'battle_rope_wave',th:'สะบัดเชือก',en:'Battle Rope Wave',eq:['battle_rope'],pat:'cardio',mus:['ไหล่','แขน','แกนกลาง','หัวใจ'],lv:'beginner',sets:4,reps:'20–30 วินาที',rest:40,alt:['air_bike_intervals'],cue:['ย่อเข่าเล็กน้อย สะบัดต่อเนื่อง']},
 {id:'foam_roll',th:'โฟมโรล',en:'Foam Rolling',eq:['foam_roller'],pat:'mobility',mus:['ฟื้นฟู'],lv:'beginner',sets:1,reps:'5–10 นาที',rest:0,alt:[],cue:['กลิ้งช้า ๆ เลี่ยงข้อต่อ/กระดูกตรง ๆ']}
];
/* ---- EN display layer for equipment & machine KB (Thai data untouched; picked at render when LANG==='en') ---- */
var MUS_EN={"หัวใจ":"Cardio","ขา":"Legs","แขน":"Arms","หลัง":"Back","ก้น":"Glutes","อก":"Chest","อกบน":"Upper chest","อกล่าง":"Lower chest","หลังแขน":"Triceps","หน้าแขน":"Biceps","ไหล่":"Shoulders","ไหล่หน้า":"Front delts","ไหล่หลัง":"Rear delts","ไหล่ข้าง":"Side delts","หลังบน":"Upper back","หลังกลาง":"Mid back","หลังล่าง":"Lower back","ปีกหลัง":"Lats","หลายส่วน":"Multiple groups","ต้นขา":"Thighs","ต้นขาหน้า":"Quads","ต้นขาด้านใน":"Inner thighs","หลังขา":"Hamstrings","ก้นกลาง":"Glute medius","สะโพก":"Hips","สะโพกข้าง":"Outer hips","น่อง":"Calves","หน้าท้อง":"Abs","หน้าท้องล่าง":"Lower abs","หน้าท้องข้าง":"Obliques","เอว":"Waist","ทุกส่วน":"Full body","ทั้งตัว":"Whole body","แกนกลาง":"Core","ฟื้นฟู":"Recovery","หัวไหล่หมุนนอก":"Rotator cuff"};
var EQUIP_EN={"treadmill":{d:"Brisk walk, easy jog or incline walk to boost calorie burn",s:"Start at a low speed, hold the rails only when needed; stop if dizzy or you feel chest pain"},"upright_bike":{d:"Seated cycling cardio with low joint impact",s:"Set saddle height so the knee is neither over-bent nor over-extended"},"recumbent_bike":{d:"Bike with a backrest \u2014 good for back pain or heavier users",s:"Adjust the seat so the knee extends comfortably"},"spin_bike":{d:"Intense cycling bike, great for intervals",s:"Set the resistance sensibly; do not grind until the knees hurt"},"elliptical":{d:"Full-body cardio with no joint impact",s:"Stand tall, do not lean on the console"},"rowing_machine":{d:"Full-body cardio that works both back and legs",s:"Drive with the legs first, then pull; keep the back straight, not rounded"},"stair_climber":{d:"Continuous stair climbing, targets legs and glutes",s:"Do not dump your body weight onto the rails"},"air_bike":{d:"Fan bike \u2014 pedal plus arm push, very high calorie burn",s:"Warm up first and start easy"},"chest_press_machine":{d:"Trains chest, front delts and triceps on a guided path \u2014 beginner friendly",s:"Set the seat so the handles sit at mid-chest; do not slam the elbows into lockout"},"pec_deck":{d:"Isolated chest fly to detail the pecs",s:"Do not open the elbows past the shoulder line; control the tempo"},"reverse_pec_deck":{d:"Trains rear delts and upper back \u2014 good for posture",s:"Control the tempo, no swinging"},"shoulder_press_machine":{d:"Trains the shoulders on an easy guided path",s:"Do not over-arch the back; stop if the shoulder hurts"},"lat_pulldown_machine":{d:"Trains the back, especially the lats \u2014 builds upper-body pulling strength",s:"Pull down in front of the chest; beginners should not pull behind the neck"},"seated_row_machine":{d:"Trains the mid back, squeezing the shoulder blades",s:"Sit tall, drive the elbows back, avoid over-arching the back"},"cable_machine":{d:"Works many areas \u2014 chest, back, shoulders, arms, glutes and core",s:"Start light and set the pulley height to suit the exercise"},"assisted_pullup_machine":{d:"Counterweight assist for pull-ups/dips \u2014 great for beginners",s:"Choose enough assist to complete the full range; lower slowly"},"biceps_curl_machine":{d:"Isolated biceps training",s:"Control the tempo, no swinging, do not lock the elbows"},"triceps_press_machine":{d:"Isolated triceps training",s:"Control the tempo, do not jar the elbows"},"leg_press_machine":{d:"Trains quads/glutes \u2014 easier to control than squats for some beginners",s:"Do not go so deep the lower back rounds; never lock the knees hard"},"hack_squat_machine":{d:"Squat on an angled track, quad-focused",s:"Set the safeties; use a depth that does not strain the knees"},"smith_machine":{d:"Bar on rails for squat/press/row and more \u2014 safer when training alone",s:"Set the safety stops and learn the movement path before adding weight"},"leg_extension_machine":{d:"Isolated quadriceps training",s:"Use a sensible load, no swinging; be careful if the knee hurts"},"leg_curl_machine":{d:"Trains the hamstrings",s:"Control the movement up and down, do not bounce the weight"},"hip_abductor_machine":{d:"Trains the outer hips and glute medius",s:"Do not overload; control the tempo"},"hip_adductor_machine":{d:"Trains the inner thighs",s:"Stay within a range that does not strain the hips"},"glute_kickback_machine":{d:"Trains the glutes one side at a time",s:"Do not arch the lower back; lead the move with the glutes"},"standing_calf_machine":{d:"Standing calf training",s:"Lower the heels slowly through a full range"},"seated_calf_machine":{d:"Seated calf training, hits the deeper calf muscle",s:"Full range with a controlled tempo"},"ab_crunch_machine":{d:"Trains the abs with added resistance",s:"Curl with the abs, do not pull on the neck"},"back_extension_bench":{d:"Trains lower back, glutes and hamstrings",s:"Raise only to a straight body line, do not hyperextend"},"captains_chair":{d:"Knee raises for the lower abs",s:"Lift with the abs, do not swing the legs"},"rotary_torso_machine":{d:"Trains torso rotation and obliques",s:"Rotate within a comfortable range, do not force the lower back"},"dumbbell":{d:"Versatile \u2014 trains every body part, at home or in the gym",s:"Pick a weight you can control through the whole range"},"barbell":{d:"Heavy compound lifts that build strength and major muscle",s:"Nail your form before adding weight; beginners should not max out"},"ez_bar":{d:"Curved bar that is easier on the wrists \u2014 great for arm work",s:"Grip where the wrists feel comfortable; control the tempo"},"kettlebell":{d:"Great for swings and resistance cardio",s:"Start light and learn the hip hinge properly first"},"adjustable_bench":{d:"Adjustable-angle bench, pairs with dumbbells or a barbell",s:"Lock the angle securely before lifting"},"squat_rack":{d:"Bar stand for squats/presses \u2014 safe with the safety bars",s:"Always set the safety bars"},"pull_up_bar":{d:"Builds back and arms with body weight",s:"If you cannot do pull-ups yet, use the assisted machine or a band"},"dip_station":{d:"Trains lower chest and triceps with body weight",s:"Descend within a comfortable shoulder range, not painfully deep"},"resistance_band":{d:"Portable, home-friendly, no joint impact",s:"Anchor the ends firmly and watch for snap-back"},"trx":{d:"Suspension straps using body weight \u2014 adjust difficulty with body angle",s:"Anchor the straps securely and brace the core"},"step_box":{d:"Step up and down to train the legs and cardio",s:"Pick a sensible height and plant the whole foot"},"medicine_ball":{d:"Weighted ball for core and power training",s:"Start light; mind the back when swinging"},"battle_rope":{d:"Rope waves \u2014 high-burn resistance cardio",s:"Slight knee bend, brace the core"},"foam_roller":{d:"Releases tight muscles, aids recovery after training",s:"Roll slowly; avoid rolling directly over joints or bones"}};
var EX_CUE_EN={"treadmill_walk":["Stand tall, swing the arms naturally"],"incline_walk":["Set the incline to 5-10%, do not hold the rails"],"light_jog":["Land mid-foot, keep a steady rhythm"],"bike_steady":["Adjust the saddle so the knee is not over-bent"],"bike_intervals":["Alternate 30s hard / 60s easy"],"elliptical_cardio":["Stand tall, push through the heels"],"rowing_erg":["Push with the legs, lean back, then pull", "Back straight, not rounded"],"stair_climb":["Stand tall, do not lean on the rails"],"air_bike_intervals":["Alternate 20s sprint / 40s rest"],"machine_chest_press":["Hands at mid-chest level", "Do not slam the elbows into lockout"],"pec_deck_fly":["Lead with the chest squeeze, control the return"],"reverse_pec_deck_fly":["Open the arms with the rear delts, no swinging"],"machine_shoulder_press":["Do not arch the back, press straight up"],"lat_pulldown":["Sit tall, chest open", "Pull the elbows down to your sides, not behind the neck"],"close_grip_pulldown":["Pull down to the chest, squeeze the shoulder blades"],"seated_machine_row":["Drive the elbows back, squeeze the blades", "Do not over-arch the back"],"cable_chest_fly":["Slight elbow bend, squeeze the chest"],"cable_row":["Back straight, pull the elbows close to the body"],"triceps_pushdown":["Elbows pinned to your sides; extend fully, control the return"],"cable_biceps_curl":["Elbows still, no swinging"],"face_pull":["Pull toward the forehead, elbows flared out"],"cable_lateral_raise":["Raise to shoulder height, control the way down"],"cable_woodchop":["Rotate from the torso, not just the arms"],"assisted_pull_up":["Pull through the full range, lower slowly"],"machine_biceps_curl":["Control the tempo, do not lock the elbows"],"machine_triceps_press":["Extend fully, then control the return"],"machine_leg_press":["Stop before the lower back rounds", "Do not lock the knees"],"hack_squat":["Comfortable depth, feet flat on the plate"],"smith_squat":["Set the safeties first", "Knees track over the toes"],"smith_bench_press":["Lower the bar to mid-chest, control the tempo"],"smith_incline_press":["Set the bench to about 30 degrees"],"smith_shoulder_press":["Do not over-arch the back"],"smith_row":["Hinge with a straight back, pull the elbows close"],"smith_romanian_deadlift":["Push the hips back, keep the back straight"],"machine_leg_extension":["Extend fully and control the return, no swinging"],"machine_leg_curl":["Control up and down, no bouncing"],"machine_hip_abduction":["Push out with the glutes, do not lean back"],"machine_hip_adduction":["Squeeze in slowly with control"],"glute_kickback":["Lead with the glutes, do not arch the lower back"],"standing_calf_raise":["All the way up, lower the heels slowly"],"seated_calf_raise":["Full range, controlled tempo"],"ab_crunch_machine_ex":["Curl with the abs, do not pull the neck"],"back_extension":["Raise only to a straight body line, do not hyperextend"],"hanging_knee_raise":["Lift with the abs, do not swing the legs"],"rotary_torso":["Rotate a comfortable range, do not force the lower back"],"plank":["Body in one straight line, brace the abs"],"dumbbell_bench_press":["Lower to chest level, control the tempo"],"dumbbell_row":["Back straight, pull the elbow close to the body"],"dumbbell_shoulder_press":["Press straight up, do not arch the back"],"goblet_squat":["Chest up, comfortable depth, knees track the toes"],"dumbbell_curl":["Elbows still, control the way down"],"bulgarian_split_squat":["Drop straight down, knee not far past the toes"],"dumbbell_rdl":["Push the hips back, keep the back straight"],"lateral_raise":["Raise to shoulder height, no swinging"],"barbell_squat":["Set the safety bars", "Knees track the toes, back straight"],"barbell_bench_press":["Use a spotter when heavy; lower to mid-chest"],"barbell_row":["Hinge with a straight back, pull the elbows close"],"overhead_press":["Brace the core, press straight up"],"romanian_deadlift":["Push the hips back, back straight throughout"],"barbell_curl":["Elbows still, do not swing the body"],"kettlebell_swing":["Drive with the hips, arms stay relaxed, back straight"],"pull_up":["Pull through the full range, lower slowly"],"chin_up":["Underhand grip, pull through the full range"],"dip":["Descend within a comfortable shoulder range"],"band_pull_apart":["Open with the rear delts, squeeze the blades"],"band_row":["Pull the elbows close, back straight"],"band_external_rotation":["Elbow pinned to your side, rotate slowly"],"trx_row":["Body straight, pull the chest toward the hands"],"step_up":["Plant the whole foot, drive through the heel"],"med_ball_slam":["Slam from the core, bend the knees to catch"],"battle_rope_wave":["Slight knee bend, keep the waves continuous"],"foam_roll":["Roll slowly, avoid joints and bones directly"]};
function _musDisp(m){return (window.LANG==='en')?(MUS_EN[m]||m):m;}
function _repsDisp(r){if(r==null)return r;if(window.LANG!=='en')return ''+r;return (''+r).replace(/วินาที/g,'sec').replace(/นาที/g,'min').replace(/\/ข้าง/g,'/side');}
function _exNameDisp(n){if(window.LANG!=='en')return n;return (''+n).replace('(ต่ำ)','(low)').replace('(เข่าลง)','(knees down)');}
var _EQ_ALIAS=(function(){var m={};for(var i=0;i<GYM_EQUIPMENT_DB.length;i++){var eq=GYM_EQUIPMENT_DB[i];var all=[eq.th,eq.en].concat(eq.ath||[],eq.aen||[]);for(var j=0;j<all.length;j++){if(all[j])m[(''+all[j]).toLowerCase().trim()]=eq.id;}}return m;})();
function normalizeEquipmentName(input){if(!input)return null;var k=(''+input).toLowerCase().trim().replace(/\s+/g,' ');if(_EQ_ALIAS[k])return _EQ_ALIAS[k];var hit=null,hl=0;for(var a in _EQ_ALIAS){if(a.length>2&&k.indexOf(a)>=0&&a.length>hl){hit=_EQ_ALIAS[a];hl=a.length;}}return hit;}
function getEquip(id){for(var i=0;i<GYM_EQUIPMENT_DB.length;i++)if(GYM_EQUIPMENT_DB[i].id===id)return GYM_EQUIPMENT_DB[i];return null;}
function _exById(id){for(var i=0;i<MACHINE_EXERCISE_DB.length;i++)if(MACHINE_EXERCISE_DB[i].id===id)return MACHINE_EXERCISE_DB[i];return null;}
function _lvRank(l){return l==='advanced'?3:l==='intermediate'?2:1;}
function getExercisesByEquipment(ids,opts){opts=opts||{};return MACHINE_EXERCISE_DB.filter(function(ex){if(!ex.eq.some(function(id){return ids.indexOf(id)>=0;}))return false;if(opts.level&&_lvRank(ex.lv)>_lvRank(opts.level))return false;if(opts.movementPattern&&ex.pat!==opts.movementPattern)return false;if(opts.targetMuscle&&(ex.mus||[]).join(',').indexOf(opts.targetMuscle)<0)return false;return true;});}
function getExerciseAlternatives(exId,availIds){var ex=_exById(exId);if(!ex)return [];var direct=(ex.alt||[]).map(_exById).filter(Boolean).filter(function(a){return a.eq.some(function(id){return availIds.indexOf(id)>=0;});});if(direct.length)return direct;return MACHINE_EXERCISE_DB.filter(function(a){return a.id!==ex.id&&a.pat===ex.pat&&a.eq.some(function(id){return availIds.indexOf(id)>=0;});}).slice(0,5);}
/* ---- planner ---- */
function selectPlanType(o){if(o.level==='beginner'&&o.daysPerWeek<=3)return 'full_body';if(o.daysPerWeek<=3)return 'full_body';if(o.daysPerWeek===4)return 'upper_lower';if(o.daysPerWeek>=5&&o.level!=='beginner')return 'push_pull_legs';return 'full_body';}
function getPatternDays(t){if(t==='upper_lower')return [{focus:L('บน A','Upper A'),pats:['push','pull','push','pull','core']},{focus:L('ล่าง A','Lower A'),pats:['squat','hinge','isolation','core']},{focus:L('บน B','Upper B'),pats:['pull','push','pull','isolation']},{focus:L('ล่าง B','Lower B'),pats:['squat','hinge','isolation','cardio']}];if(t==='push_pull_legs')return [{focus:'Push',pats:['push','push','push','isolation']},{focus:'Pull',pats:['pull','pull','pull','isolation']},{focus:L('ขา','Legs'),pats:['squat','hinge','isolation','core']},{focus:L('บน','Upper'),pats:['push','pull','push','pull']},{focus:L('ล่าง+คาร์ดิโอ','Lower+Cardio'),pats:['squat','hinge','cardio','core']}];return [{focus:L('เต็มตัว A','Full Body A'),pats:['squat','push','pull','core','cardio']},{focus:L('เต็มตัว B','Full Body B'),pats:['hinge','push','pull','core','cardio']},{focus:L('เต็มตัว C','Full Body C'),pats:['squat','hinge','push','pull','core']}];}
function buildEquipmentPlan(input){var ids=input.availableEquipmentIds||[];var level=input.level||'beginner';var planType=selectPlanType({goal:input.goal,level:level,daysPerWeek:input.daysPerWeek||3});var pdays=getPatternDays(planType).slice(0,input.daysPerWeek||3);var days=pdays.map(function(d,di){var used={},exs=[];d.pats.forEach(function(p){var cand=getExercisesByEquipment(ids,{level:level,movementPattern:p}).filter(function(x){return !used[x.id];});if(!cand.length)cand=getExercisesByEquipment(ids,{movementPattern:p}).filter(function(x){return !used[x.id];});if(cand.length){var pick=cand[0];used[pick.id]=1;exs.push(pick);}});return {label:L('วันที่ ','Day ')+(di+1),focus:d.focus,exercises:exs};});return {title:input.title||L('แผนฝึกจากอุปกรณ์ที่มี','Plan from your equipment'),planType:planType,level:level,daysPerWeek:input.daysPerWeek||3,equipmentIds:ids,days:days};}
/* ---- IU MATE bot handlers ---- */
function _detectEquipIds(text){var t=(''+text).toLowerCase();var found=[];for(var a in _EQ_ALIAS){if(a.length>2&&t.indexOf(a)>=0&&found.indexOf(_EQ_ALIAS[a])<0)found.push(_EQ_ALIAS[a]);}return found;}
function _detectEquip(text){var ids=_detectEquipIds(text);return ids.length?getEquip(ids[0]):null;}
function _equipExName(ex){return (window.LANG==='en'?(ex.en||ex.th):(ex.th||ex.en));}
function buildEquipReply(firstEq,message){
  var en=(window.LANG==='en');var ids=_detectEquipIds(message);if(!ids.length&&firstEq)ids=[firstEq.id];
  var coach=(role()==='coach');
  var wantPlan=ids.length>=2 || /แผน|ตาราง|จัด|วันนี้|โปรแกรม|plan|today|program|จัดให้/i.test(''+message);
  if(wantPlan){
    var inp=_wpParse(message);var pin={goal:inp.goal==='fat_loss'?'fat_loss':inp.goal==='muscle_gain'?'muscle_gain':'general_fitness',level:inp.level,daysPerWeek:inp.daysPerWeek,availableEquipmentIds:ids};
    var plan;try{plan=buildEquipmentPlan(pin);}catch(e){plan=null;}
    if(!plan||!plan.days.length){ return { title:L('บอกอุปกรณ์เพิ่มหน่อย','Tell me more equipment'), message:L('บอกอุปกรณ์/เครื่องที่มีได้เลยครับ เช่น ลู่วิ่ง ดัมเบล เครื่องดันอก เครื่องดึงหลัง Leg Press สมิธแมชชีน เคเบิล','List the equipment you have — e.g. treadmill, dumbbell, chest press, lat pulldown, leg press, smith machine, cable') }; }
    var eqNames=ids.map(function(id){var q=getEquip(id);return q?(en?q.en:q.th):id;});
    var body=L('อุปกรณ์ที่ใช้: ','Equipment: ')+eqNames.join(', ')+'\n';
    plan.days.forEach(function(d){ body+='\n'+'🗓️ '+d.label+' — '+d.focus+'\n'+d.exercises.map(function(ex,i){return (i+1)+'. '+_equipExName(ex)+' — '+ex.sets+' × '+_repsDisp(ex.reps);}).join('\n')+'\n'; });
    var note=coach?L('สถานะ: ร่าง (Draft) · กรุณาตรวจ/ปรับก่อนส่งให้ลูกเทรน · IU MATE ไม่ส่งอัตโนมัติและไม่เปลี่ยนแผนเดิมของโค้ช','Status: Draft · review/adjust before sending to your client · IU MATE never auto-sends or overrides a coach plan'):L('เลือกน้ำหนักที่คุมท่าได้ เหลือแรงสำรอง 2–3 ครั้ง · มือใหม่ไม่ต้องยกหนักสุด','Pick a load you can control, leave 2–3 reps in reserve · beginners avoid maxing out');
    return { title:(coach?L('ร่างแผนจากอุปกรณ์ (','Draft from equipment ('):L('แผนฝึกจากอุปกรณ์ (','Plan from equipment ('))+ (en?({full_body:'Full Body',upper_lower:'Upper/Lower',push_pull_legs:'PPL'}[plan.planType]):({full_body:'Full Body',upper_lower:'บน/ล่าง',push_pull_legs:'Push/Pull/Legs'}[plan.planType])) +' '+plan.daysPerWeek+L(' วัน)',' d)'),
      message:body.trim(), disclaimer:note,
      actions:[ {label:L('ดูท่าในคลัง','Open Workout'),action:'go_workout'}, {label:L('เปลี่ยนจำนวนวัน','Change days'),action:'_chip',payload:{q:L('จัดตารางจากอุปกรณ์เดิม 4 วัน','same equipment 4 days plan')}} ] };
  }
  // single-equipment query: "เครื่องนี้เล่นอะไรได้บ้าง"
  var k=firstEq||getEquip(ids[0]);if(!k)return null;
  var exs=(k.ex||[]).map(_exById).filter(Boolean);
  var _ke=(en&&EQUIP_EN[k.id])||null;
  var msg=((_ke&&_ke.d)||k.desc||'')+'\n\n'+L('กล้ามเนื้อหลัก: ','Trains: ')+(k.mus||[]).map(_musDisp).join(' · ')+'\n'+L('รูปแบบการเคลื่อนไหว: ','Patterns: ')+(k.pat||[]).map(function(p){return MOVEMENT_PATTERNS[p]||p;}).join(', ');
  if(exs.length){ msg+='\n\n'+L('ท่าที่เล่นได้:','Exercises you can do:')+'\n'+exs.slice(0,7).map(function(ex,i){return (i+1)+'. '+_equipExName(ex)+' ('+ex.sets+'×'+_repsDisp(ex.reps)+')';}).join('\n'); var cues=(exs[0]&&((en&&EX_CUE_EN[exs[0].id])||exs[0].cue))||[];if(cues.length)msg+='\n\n'+L('เคล็ดลับ: ','Tip: ')+cues.join(' · '); }
  if(k.safe)msg+='\n\n⚠️ '+((_ke&&_ke.s)||k.safe);
  return { title:(window.LANG==='en'?k.en:k.th)+L(' เล่นอะไรได้บ้าง','')+(window.LANG==='en'?' — what you can do':''), message:msg,
    disclaimer:L('เริ่ม 3 เซ็ต × 8–12 ใช้น้ำหนักที่คุมท่าได้ · ดูฟอร์มที่แท็บท่าฝึก (▶)','Start 3 sets × 8–12 with a controllable load · see form in the Workout tab (▶)'),
    actions:[ {label:L('จัดตารางจากเครื่องนี้','Make a plan'),action:'_chip',payload:{q:L('จัดตารางฝึกมี'+k.th,'workout plan with '+k.en)}}, {label:L('เปิดคลังท่า','Open Workout'),action:'go_workout'} ] };
}

function _wpParse(message){var t=(''+message).toLowerCase();var u=_wpProfile();
 var goal='general_fitness';
 if(/ลดไขมัน|ลดน้ำหนัก|ลดพุง|fat loss|lose/.test(t))goal='fat_loss';
 else if(/เพิ่มกล้าม|สร้างกล้าม|เพิ่มน้ำหนัก|muscle|gain|bulk|กล้าม/.test(t))goal='muscle_gain';
 else if(/แข็งแรง|strength/.test(t))goal='strength';
 else if(u&&u.goal){goal=(u.goal==='lose'?'fat_loss':u.goal==='gain'?'muscle_gain':'general_fitness');}
 var level='beginner';
 if(/ขั้นสูง|advanced|เล่นหนักมานาน/.test(t))level='advanced';
 else if(/ระดับกลาง|intermediate|เคยฝึก|เล่นมาบ้าง|ฝึกมาบ้าง/.test(t))level='intermediate';
 var days=3;var dm=t.match(/([2-5])\s*วัน/)||t.match(/([2-5])\s*day/);if(dm)days=Math.max(2,Math.min(5,+dm[1]));
 var equipment=['bodyweight'];
 if(/ไม่มีอุปกรณ์|bodyweight|no equipment|ที่บ้านไม่มี/.test(t))equipment=['none','bodyweight'];
 else if(/ยิม|full gym|ฟิตเนส|gym|สมิธ|smith|บาร์เบล|barbell|เคเบิล|cable|เครื่อง|machine|เลกเพรส|leg press|แฮคสควอท|hack squat/.test(t))equipment=['full_gym'];
 else if(/ดัมเบล|dumbbell/.test(t))equipment=['dumbbell'];
 else if(/ยางยืด|band/.test(t))equipment=['resistance_band'];
 return {goal:goal,level:level,daysPerWeek:days,sessionDurationMinutes:30,equipment:equipment};}
function _wpFormat(tpl){
 var goalTh={fat_loss:L('ลดไขมัน','fat loss'),muscle_gain:L('เพิ่มกล้าม','muscle gain'),general_fitness:L('สุขภาพทั่วไป','general fitness'),strength:L('ความแข็งแรง','strength'),weight_control:L('คุมน้ำหนัก','weight control')};
 var eqTh={none:L('ไม่มีอุปกรณ์','no equipment'),bodyweight:L('บอดี้เวท','bodyweight'),dumbbell:L('ดัมเบล','dumbbell'),smith_machine:L('สมิธ','smith'),resistance_band:L('ยางยืด','band'),treadmill:L('ลู่วิ่ง','treadmill'),full_gym:L('ยิม','gym')};
 var lvlTh={beginner:L('มือใหม่','beginner'),intermediate:L('ระดับกลาง','intermediate'),advanced:L('ขั้นสูง','advanced')};
 var ints={easy:L('เบา','easy'),moderate:L('ปานกลาง','moderate'),hard:L('หนัก','hard')};
 var seen={},gt=tpl.goalTags.map(function(g){return goalTh[g]||g;}).filter(function(x){if(seen[x])return false;seen[x]=1;return true;}).slice(0,3).join(' / ');
 var ln=[];
 ln.push((tpl.title));
 ln.push('');
 ln.push(L('เหมาะกับ:','For:'));
 ln.push('• '+L('เป้าหมาย','Goal')+': '+gt);
 ln.push('• '+L('ระดับ','Level')+': '+(lvlTh[tpl.level]||tpl.level));
 ln.push('• '+L('อุปกรณ์','Equipment')+': '+tpl.equipment.map(function(q){return eqTh[q]||q;}).join('/'));
 ln.push('• '+L('เวลา','Time')+': ~'+tpl.sessionDurationMinutes+L(' นาที/ครั้ง',' min/session'));
 ln.push('');
 tpl.days.forEach(function(d){
  ln.push('📅 '+d.dayLabel+': '+d.focus);
  d.exercises.forEach(function(x,i){var detail=(x.sets?x.sets+L(' เซ็ต',' sets'):'')+(x.reps?' × '+_repsDisp(x.reps)+L(' ครั้ง',''):(x.durationSeconds?' × '+x.durationSeconds+L(' วิ',' s'):''));ln.push((i+1)+'. '+_exNameDisp(x.name)+(detail?' — '+detail:''));});
  if(d.cardio)ln.push('🏃 '+L('คาร์ดิโอ','Cardio')+': '+d.cardio.durationMinutes+L(' นาที',' min')+' ('+(ints[d.cardio.intensity]||'')+')');
  ln.push('');
 });
 return ln.join('\n');}
/* ---------- body-based planning (reuses CALC.bmi/bmiCat/lbm; rule-based, no AI) ---------- */
function _bmiClassCode(b){ if(b==null)return 'unknown'; if(b<18.5)return 'underweight'; if(b<23)return 'normal'; if(b<25)return 'overweight'; if(b<30)return 'obese_level_1'; return 'obese_level_2'; }
function _bodyProfile(){ try{ var u=(typeof curUser==='function'?curUser():null)||{}; var h=u.h||null,bf=(u.bf!=null?u.bf:null),w=null;
   try{ w=(typeof fn==='function'&&fn('curW'))?window.curW(u):(u.w0||null); }catch(e){ w=u.w0||null; }
   if(!w||!h)return {bmi:null,bmiClass:'unknown',fatMass:null,leanBodyMass:null,weightKg:w||null,heightCm:h||null,bodyFatPercent:bf};
   var bmi=CALC.bmi(w,h); var fm=(bf!=null)?Math.round(w*(bf/100)*10)/10:null; var lbm=(bf!=null)?CALC.lbm(w,bf):null;
   return {bmi:bmi,bmiClass:_bmiClassCode(bmi),fatMass:fm,leanBodyMass:lbm,weightKg:w,heightCm:h,bodyFatPercent:bf};
 }catch(e){ return {bmi:null,bmiClass:'unknown',fatMass:null,leanBodyMass:null,weightKg:null,heightCm:null,bodyFatPercent:null}; } }
function _wpLimit(m){ var t=(''+m).toLowerCase();
 if(/เข่าไม่|ปวดเข่า|เข่าไม่ดี|\bknee\b/.test(t))return 'knee_pain';
 if(/ปวดหลัง|หลังไม่ดี|back pain/.test(t))return 'back_pain';
 if(/ไหล่ไม่|ปวดไหล่|shoulder pain/.test(t))return 'shoulder_pain';
 if(/ข้อมือไม่|ปวดข้อมือ|wrist pain/.test(t))return 'wrist_pain';
 if(/ไม่เคยออกกำลัง|ไม่ค่อยได้ออกกำลัง|เพิ่งเริ่มออกกำลัง|low fitness/.test(t))return 'low_fitness';
 return 'none'; }
function getTrainingReadiness(o){ o=o||{};
 if(o.limitation&&o.limitation!=='none')return 'caution';
 if(o.bmiClass==='obese_level_1'||o.bmiClass==='obese_level_2')return 'low_impact_start';
 if(o.level==='beginner')return 'beginner_safe';
 if(o.level==='intermediate')return 'standard';
 if(o.level==='advanced')return 'advanced';
 return 'beginner_safe'; }
function selectWorkoutTemplateByBody(input){ input=input||{};
 var goal=input.goal,level=input.level,days=input.daysPerWeek,eq=input.equipment||[],bp=input.bodyProfile||{};
 if(input.hasCoach&&input.hasCoachWorkoutPlan){ return {mode:'coach_plan_priority',templateId:null}; }
 var readiness=getTrainingReadiness({level:level,bmiClass:bp.bmiClass,bodyFatPercent:bp.bodyFatPercent,limitation:input.limitation});
 var hasDumbbell=eq.indexOf('dumbbell')>=0;
 var hasGym=eq.indexOf('full_gym')>=0||eq.indexOf('smith_machine')>=0;
 var noEquipment=eq.indexOf('none')>=0||eq.indexOf('bodyweight')>=0;
 if(readiness==='caution')return {mode:'template',templateId:'beginner_low_impact_2d',safetyLevel:'caution'};
 if(readiness==='low_impact_start'){ if(days<=3)return {mode:'template',templateId:'fat_loss_low_impact_full_body_3d',safetyLevel:'low_impact'}; return {mode:'template',templateId:'general_fitness_low_impact_3d',safetyLevel:'low_impact'}; }
 if(level==='beginner'&&days<=3){ if(noEquipment)return {mode:'template',templateId:'beginner_full_body_bodyweight_3d',safetyLevel:'normal'}; if(hasDumbbell)return {mode:'template',templateId:'beginner_full_body_dumbbell_3d',safetyLevel:'normal'}; if(hasGym)return {mode:'template',templateId:'beginner_full_body_gym_3d',safetyLevel:'normal'}; }
 if(goal==='fat_loss'&&days===3)return {mode:'template',templateId:'fat_loss_full_body_cardio_3d',safetyLevel:'normal'};
 if(goal==='fat_loss'&&days===4)return {mode:'template',templateId:'fat_loss_upper_lower_cardio_4d',safetyLevel:'normal'};
 if(goal==='muscle_gain'&&days===3)return {mode:'template',templateId:'muscle_gain_full_body_3d',safetyLevel:'normal'};
 if(goal==='muscle_gain'&&days>=4)return {mode:'template',templateId:'muscle_gain_upper_lower_4d',safetyLevel:'normal'};
 if(days===5&&level!=='beginner')return {mode:'template',templateId:'intermediate_push_pull_lower_5d',safetyLevel:'normal'};
 return {mode:'template',templateId:'general_fitness_balanced_3d',safetyLevel:'normal'}; }
var _TPL_ALIAS={ beginner_full_body_gym_3d:'beginner_full_body_dumbbell_3d', fat_loss_upper_lower_cardio_4d:'fat_loss_full_body_cardio_3d', muscle_gain_full_body_3d:'beginner_full_body_dumbbell_3d', intermediate_push_pull_lower_5d:'muscle_gain_upper_lower_4d', general_fitness_balanced_3d:'beginner_full_body_bodyweight_3d' };
function getWorkoutTemplateById(id){ if(!id)return null; var rid=_TPL_ALIAS[id]||id,i;
 for(i=0;i<WORKOUT_TEMPLATES.length;i++){ if(WORKOUT_TEMPLATES[i].id===rid)return WORKOUT_TEMPLATES[i]; }
 for(i=0;i<WORKOUT_TEMPLATES.length;i++){ if(WORKOUT_TEMPLATES[i].id===id)return WORKOUT_TEMPLATES[i]; }
 return null; }
function _wpExplain(tpl,bp,inp,safetyLevel){ if(!tpl)return ''; var ln=[];
 ln.push(L('ผมแนะนำแผน “','I suggest the plan “')+tpl.title+L('” ให้ครับ','”.'));
 if(bp&&bp.bmi!=null) ln.push(L('จากข้อมูลปัจจุบัน BMI ประมาณ ','From your current data, BMI ≈ ')+bp.bmi+L(' จึงเลือกแผนที่เริ่มได้ปลอดภัยและไม่หนักเกินไป',' — so I picked a plan that starts safely and not too hard.'));
 if(bp&&bp.leanBodyMass!=null) ln.push(L('มวลไร้ไขมันโดยประมาณ ','Lean body mass ≈ ')+bp.leanBodyMass+L(' กก. ใช้เป็นข้อมูลประกอบการวางเป้าหมายฝึก/โภชนาการได้',' kg — useful for setting training & nutrition targets.'));
 if(inp&&inp.goal==='fat_loss') ln.push(L('แผนนี้เน้นเวทพื้นฐานร่วมกับการเคลื่อนไหว/คาร์ดิโอระดับพอดี เพื่อช่วยสร้างความสม่ำเสมอ','This plan focuses on basic strength + moderate movement/cardio to build consistency.'));
 if(inp&&inp.goal==='muscle_gain') ln.push(L('แผนนี้เน้นกล้ามเนื้อหลักแบบค่อยเป็นค่อยไป และเพิ่มความหนักเมื่อคุมท่าได้ดี','This plan trains main muscles progressively, adding load when your form is solid.'));
 if(safetyLevel==='low_impact') ln.push(L('ผมเลือกแนว Low Impact เพื่อลดแรงกระแทกและเริ่มจากความหนักที่คุมได้ก่อน','I chose a low-impact approach to reduce joint stress and start at a controllable intensity.'));
 if(safetyLevel==='caution') ln.push(L('เพราะมีข้อจำกัดที่แจ้งมา ผมเลือกแผนที่เบาและปลอดภัยเป็นพิเศษ และแนะนำให้เลี่ยงท่าที่ทำให้เจ็บ','Because of the limitation you mentioned, I chose an especially gentle plan and suggest avoiding any move that hurts.'));
 return ln.join('\n'); }
function _riskyMove(en,level){var t=(''+en).toLowerCase();
 if(/plyo|box jump|jump squat|jumping|burpee|sprint|skater|snatch|clean|muscle-up|handstand|ab wheel|pistol/.test(t))return true;
 if(level!=='advanced'&&/deadlift|rack pull|hack squat|sumo deadlift|good morning/.test(t))return true;
 return false;}
function _eqRank(eq,mode){ if(mode==='gym'){ return (eq==='บอดี้เวท'||eq==='ยางยืด')?0:1; } if(mode==='dumbbell'){ return eq==='ดัมเบล'?1:0; } return 0; }
function _safePool(key,equip,used,level){var _pool=shuffleArr(moveCatalog().filter(function(m){
 if(/ผู้สูงอายุ|ออฟฟิศ|คนท้อง|ฟื้นฟู|กีฬา|ยืดเหยียด|คาร์ดิโอ/.test(m.group||''))return false;
 if(!groupMatch(m.group,key))return false;
 if(equip==='home'&&!(m.eq==='บอดี้เวท'||m.eq==='ยางยืด'))return false;
 if(equip==='dumbbell'&&!(m.eq==='บอดี้เวท'||m.eq==='ยางยืด'||m.eq==='ดัมเบล'))return false;
 if(_riskyMove(m.nameEn,level))return false;
 if(used[m.nameEn])return false;return true;}));
 if(equip==='gym'||equip==='dumbbell')_pool.sort(function(a,b){return _eqRank(b.eq,equip)-_eqRank(a.eq,equip);});
 return _pool;}
/* ===== IU MATE workout program builder: split + weekday helpers ===== */
function _autoSplit(days){ days=+days||3; if(days<=3) return 'full'; if(days===4) return 'ul'; return 'ppl'; }
function _splitPattern(split,days){
  days=+days||3;
  if(split==='full'){ var a=[]; for(var i=0;i<days;i++)a.push(['Full Body','full']); return a; }
  if(split==='ul'){ var b=[],nm=['Upper A','Lower A','Upper B','Lower B','Upper C','Lower C']; for(var j=0;j<days;j++)b.push([nm[j]||(j%2?'Lower':'Upper'),(j%2?'lower':'upper')]); return b; }
  if(split==='ppl'){ var seq=[['Push','push'],['Pull','pull'],['Legs','legs']],c=[]; for(var k=0;k<days;k++)c.push(seq[k%3]); return c; }
  return SPLITS[days]||SPLITS[3]||[['Full Body','full']];
}
function _WDNL(){ return (window.LANG==='en')?['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']:['จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์','อาทิตย์']; }
function _defaultWdays(n){ n=+n||3; var map={1:[0],2:[0,3],3:[0,2,4],4:[0,1,3,4],5:[0,1,2,3,4],6:[0,1,2,3,4,5],7:[0,1,2,3,4,5,6]}; return (map[n]||map[3]).slice(0,n); }
function _wdayChoices(){ var w=_WDNL(),out=[]; for(var i=0;i<7;i++)out.push([w[i],''+i]); return out; }
function _parseWdays(v,n){
  if(Array.isArray(v)&&v.length) return v.map(function(x){return +x;}).filter(function(x){return x>=0&&x<7;});
  var t=(''+(v||'')).toLowerCase();
  if(!t||t==='auto') return _defaultWdays(n);
  if(/ต่ออาทิตย์|อาทิตย์ละ|ต่อสัปดาห์|สัปดาห์ละ|per ?week|\/ ?week|a week/.test(t)) return _defaultWdays(n);
  var idx=[],pairs=[['จันทร์|mon',0],['อังคาร|tue',1],['พุธ|wed',2],['พฤหัส|พฤ|thu',3],['ศุกร์|fri',4],['เสาร์|sat',5],['อาทิตย์|อา(?!ห)|sun',6]];
  pairs.forEach(function(p){ if(new RegExp(p[0]).test(t)) idx.push(p[1]); });
  return idx.length?idx.slice(0,n):_defaultWdays(n);
}
function _wSeed(text){
  var t=(''+text).toLowerCase(),s={};
  if(/ลดไขมัน|fat ?loss|ลดน้ำหนัก|ลดพุง|คัต|cut/.test(t))s.goal='fat_loss';
  else if(/เพิ่มกล้าม|สร้างกล้าม|muscle|บัลค์|bulk|เพิ่มน้ำหนัก/.test(t))s.goal='muscle_gain';
  else if(/ฟิต|สุขภาพ|general|fitness|แข็งแรง/.test(t))s.goal='general_fitness';
  var dm=t.match(/([2-6])\s*(วัน|day)/); if(dm)s.days=+dm[1];
  if(/push ?pull ?leg|ppl|พุชพูล|ดันดึงขา|ดัน ?ดึง ?ขา/.test(t))s.split='ppl';
  else if(/upper ?lower|upper\/lower|อัพเปอร์|บนล่าง|บน ?ล่าง/.test(t))s.split='ul';
  else if(/full ?body|ฟูลบอดี|เล่นทั้งตัว/.test(t))s.split='full';
  if(/ไม่มีอุปกรณ์|no equipment|บอดี้เวท|bodyweight|ที่บ้าน/.test(t))s.equip='none';
  else if(/ดัมเบล|dumbbell/.test(t))s.equip='dumbbell';
  else if(/ยิม|gym|ฟิตเนส|full gym/.test(t))s.equip='full_gym';
  return s;
}
/* ===== IU MATE adaptive insights: read-only over window.S, last 28 days, rule-based (no AI) ===== */
function _wDateStr(d){ var m=d.getMonth()+1,dd=d.getDate(); return d.getFullYear()+'-'+(m<10?'0':'')+m+'-'+(dd<10?'0':'')+dd; }
function _wAgo(n){ var d=new Date(); d.setDate(d.getDate()-n); return _wDateStr(d); }
function _wWdIdx(ds){ try{ var d=new Date((''+ds)+'T00:00:00'); if(isNaN(d.getTime()))return null; return (d.getDay()+6)%7; }catch(e){ return null; } }
function _wAdapt(userId){
 var out={hasData:false,sessions28:0,perWeek:0,topWdays:[],adherence:0,wSlope:null};
 try{
  if(userId==null) return out;
  var st=S(),lim=_wAgo(28),exd={},hist=[0,0,0,0,0,0,0];
  (st.ex||[]).forEach(function(e){ if(!e||e.user!==userId||!e.date||e.date<lim)return;
   if(!exd[e.date]){ exd[e.date]=1; var wi=_wWdIdx(e.date); if(wi!=null)hist[wi]++; } });
  var exDates=Object.keys(exd);
  out.sessions28=exDates.length;
  out.perWeek=Math.round(exDates.length/4*10)/10;
  var idx=[0,1,2,3,4,5,6].filter(function(i){return hist[i]>0;});
  idx.sort(function(a,b){ return (hist[b]-hist[a])||(a-b); });
  out.topWdays=idx;
  var act={}; exDates.forEach(function(d){ act[d]=1; });
  (st.logs||[]).forEach(function(l){ if(l&&l.user===userId&&l.date&&l.date>=lim)act[l.date]=1; });
  out.adherence=Math.round(Object.keys(act).length/28*100)/100;
  try{
   if(fn('bodyRecs')){
    var l56=_wAgo(56),rs=(window.bodyRecs({id:userId})||[]).filter(function(r){ return r&&r.date&&r.date>=l56&&(+r.w>0); });
    if(rs.length>=2){ var ra=rs[0],rb=rs[rs.length-1];
     var dd=Math.max(1,(new Date(rb.date+'T00:00:00')-new Date(ra.date+'T00:00:00'))/86400000);
     out.wSlope=Math.round(((+rb.w)-(+ra.w))/dd*7*100)/100; }
   }
  }catch(e2){}
  out.hasData=out.sessions28>=2;
 }catch(e){ out.hasData=false; }
 return out;
}
function _wSlopeStr(v){ return (v>=0?'+':'')+v; }
function _wAdaptText(ad,goal,forCoach,name,usedDays){
 try{
  if(!(ad&&ad.hasData))return '';
  var WDN=_WDNL(),dn=(ad.topWdays||[]).slice(0,4).map(function(i){return WDN[i];}).join('/'),ln=[];
  if(forCoach){
   ln.push('🧠 '+L('จากบันทึก 4 สัปดาห์ล่าสุดของ '+(name||'ลูกเทรน')+': ฝึกจริง '+ad.sessions28+' ครั้ง (เฉลี่ย ~'+ad.perWeek+' วัน/สัปดาห์)','Last 4 weeks of '+(name||'this client')+': trained '+ad.sessions28+' sessions (~'+ad.perWeek+' days/week)'));
   if(dn)ln.push(L('วันที่ฝึกบ่อย: '+dn,'Usual training days: '+dn));
   if(ad.adherence>=0.5)ln.push(L('ความสม่ำเสมอดี เพิ่มความหนัก/วอลุ่มได้','Good consistency — can add load/volume.'));
   else if(ad.adherence<0.2)ln.push(L('ความต่อเนื่องยังน้อย แนะนำเริ่มโปรแกรมที่ทำตามง่ายก่อน','Low consistency — start with an easy-to-follow program.'));
  }else{
   ln.push('🧠 '+L('ผมดูจากประวัติของคุณ 4 สัปดาห์ล่าสุด: ฝึกไป '+ad.sessions28+' ครั้ง (เฉลี่ย ~'+ad.perWeek+' วัน/สัปดาห์)','I looked at your last 4 weeks: '+ad.sessions28+' sessions (~'+ad.perWeek+' days/week)'));
   if(dn&&usedDays)ln.push(L('วันที่คุณฝึกบ่อยคือ '+dn+' ผมเลยจัดตารางให้ลงวันเหล่านี้ก่อนครับ','You usually train on '+dn+' — I scheduled the plan around those days.'));
   else if(dn)ln.push(L('วันที่คุณฝึกบ่อยคือ '+dn,'You usually train on '+dn+'.'));
   if(ad.adherence>=0.5)ln.push(L('ความสม่ำเสมอดีมาก 👍 ถ้าคุมท่าได้ครบทุกเซ็ต ค่อย ๆ เพิ่มความหนักได้เลย','Great consistency 👍 — if your form holds, you can gradually push harder.'));
   else if(ad.adherence<0.2)ln.push(L('ช่วงนี้บันทึกไม่ค่อยต่อเนื่อง ผมเลยเน้นแผนที่ทำตามง่าย สร้างความสม่ำเสมอก่อนครับ','Logging has been sparse lately, so I kept this plan easy to stick to.'));
  }
  if(ad.wSlope!=null){
   if(goal==='fat_loss'&&ad.wSlope>-0.1)ln.push(L('น้ำหนักช่วงหลังค่อนข้างนิ่ง ('+_wSlopeStr(ad.wSlope)+' กก./สัปดาห์) ลองขยับตัว/คาร์ดิโอเบา ๆ เพิ่ม และเช็คแคลอรี่รวมต่อวันดูนะครับ','Weight has been fairly flat ('+_wSlopeStr(ad.wSlope)+' kg/week) — try a bit more movement/light cardio and double-check daily calories.'));
   else if(goal==='fat_loss'&&ad.wSlope<=-0.1)ln.push(L('เทรนด์น้ำหนักกำลังลง ('+_wSlopeStr(ad.wSlope)+' กก./สัปดาห์) มาถูกทางแล้ว รักษาความต่อเนื่องไว้ครับ','Weight trending down ('+_wSlopeStr(ad.wSlope)+' kg/week) — on track, keep it up.'));
   else if(goal==='muscle_gain'&&ad.wSlope<0.05)ln.push(L('น้ำหนักยังไม่ค่อยขยับ ('+_wSlopeStr(ad.wSlope)+' กก./สัปดาห์) โฟกัส progressive overload เพิ่มครั้ง/น้ำหนักทีละนิด และกินโปรตีน/พลังงานให้พอครับ','Weight barely moving ('+_wSlopeStr(ad.wSlope)+' kg/week) — focus on progressive overload and enough protein/energy.'));
  }
  ln.push(L('(ค่าประมาณจากบันทึกในแอป ไม่ใช่คำแนะนำทางการแพทย์)','(Estimated from in-app logs — not medical advice.)'));
  return ln.join('\n');
 }catch(e){ return ''; }
}
var _LAST_WPLAN=null;
function _libWorkoutPlan(inp){
 if(!(window.IUFIT_WORKOUTS&&window.IUFIT_WORKOUTS.length))return null;
 var days=inp.daysPerWeek||3,goal=(inp.goal==='fat_loss'?'lose':inp.goal==='muscle_gain'?'gain':'general'),level=inp.level||'beginner';
 var eq=inp.equipment||[],equip=(eq.indexOf('none')>=0||eq.indexOf('bodyweight')>=0||eq.indexOf('resistance_band')>=0)?'home':(eq.indexOf('dumbbell')>=0?'dumbbell':'gym');
 var splitKey=(inp.split&&['full','ul','ppl'].indexOf(inp.split)>=0)?inp.split:_autoSplit(days);
 var split=_splitPattern(splitKey,days),dayTexts=[],struct=[];
 var wdays=_parseWdays(inp.wdays,days),WDN=_WDNL();
 split.forEach(function(d,di){var used={},tmpl=DAYTMPL[d[1]]||DAYTMPL.full,moves=[];
  tmpl.forEach(function(gp){var pool=_safePool(gp[0],equip,used,level);for(var k=0;k<gp[1]&&k<pool.length;k++){used[pool[k].nameEn]=1;moves.push(pool[k]);}});
  if(goal==='lose'&&splitKey==='full'){var cp=_safePool('คาร์ดิโอ',equip,used,level);if(cp[0]){used[cp[0].nameEn]=1;moves.push(cp[0]);}}
  var lines=moves.map(function(mv){return '• '+(window.LANG==='en'?mv.nameEn:(mv.nameTh||mv.nameEn))+' — '+setsReps(goal,mv.cardio);});
  var wd=(wdays[di]!=null?wdays[di]:null);
  var head='🗓️ '+(wd!=null?WDN[wd]:(L('วันที่ ','Day ')+(di+1)))+' — '+d[0];
  if(lines.length){dayTexts.push(head+'\n'+lines.join('\n'));
   struct.push({wd:(wd!=null?wd:di),label:d[0],moves:moves.map(function(mv){return {n:(mv.nameTh||mv.nameEn),eq:mv.eq||'บอดี้เวท'};})});}});
 if(dayTexts.length<Math.min(days,2)){_LAST_WPLAN=null;return null;}
 _LAST_WPLAN={split:splitKey,days:days,struct:struct};
 return dayTexts.join('\n\n');}
function _libExplain(inp,bp){var ln=[];
 ln.push(L('ผมจัดตารางจากคลังท่าฝึกให้ตามเป้าหมาย ระดับ และอุปกรณ์ของคุณครับ','I built this plan from the move library to match your goal, level and equipment.'));
 if(bp&&bp.bmi!=null)ln.push(L('จากข้อมูล BMI ประมาณ ','From your data, BMI ≈ ')+bp.bmi+L(' ผมเลี่ยงท่ากระแทกสูง/เสี่ยงให้แล้ว',' — high-impact/risky moves were filtered out.'));
 ln.push(L('ทุกท่ามีปุ่ม ▶ ดูคลิปสอนในหน้าท่าฝึก','Each move has a ▶ tutorial in the Workout tab.'));
 return ln.join('\n');}
function _tplToStruct(tpl,inp){
 try{
  if(!tpl||!tpl.days||!tpl.days.length) return null;
  var days=tpl.days.length;
  var wdays=_parseWdays(inp&&inp.wdays,days);
  var struct=[];
  tpl.days.forEach(function(d,di){
   var moves=(d.exercises||[]).map(function(ex){
    var eq=/(\bDB\b|Dumbbell|ดัมเบล)/i.test(ex.name||'')?'ดัมเบล':'บอดี้เวท';
    return {n:(ex.name||''),eq:eq};
   }).filter(function(m){return m.n;});
   if(moves.length) struct.push({wd:(wdays[di]!=null?wdays[di]:di),label:(d.focus||d.dayLabel||''),moves:moves});
  });
  return struct.length?{split:(tpl.id||'tpl'),days:days,struct:struct}:null;
 }catch(e){ return null; }
}
function buildWorkoutPlan(message,inpOverride,limOverride){
 var coach=(role()==='coach');
 try{var S=window.S;
  if(!coach&&S&&S.follow&&S.follow.code){
   var u=_wpProfile();var wp=u&&S.wplan&&S.wplan[u.id];var hasPlan=wp&&Object.keys(wp).some(function(d){return (wp[d]||[]).length;});
   if(hasPlan)return {title:L('คุณมีแผนจากโค้ชอยู่แล้ว','You already have a coach plan'),message:L('ตอนนี้คุณมีแผนจากโค้ชอยู่แล้วครับ ผมจะช่วยอธิบายแผนและเตือนวันฝึกให้ หากต้องการเปลี่ยนแผน แนะนำให้ปรึกษาโค้ชก่อนนะครับ','You already have a plan from your coach. I can explain it and remind training days — to change it, please ask your coach first.'),actions:[{label:L('ดูแผนจากโค้ช','See coach plan'),action:'go_workout'},{label:L('แชทหาโค้ช','Chat coach'),action:'go_coach'}]};
   return {title:L('ยังไม่มีแผนจากโค้ช','No coach plan yet'),message:L('ตอนนี้ยังไม่มีแผนฝึกจากโค้ชครับ คุณสามารถทักโค้ชเพื่อขอแผน หรือให้ IU MATE ช่วยสร้างแผนพื้นฐานชั่วคราวได้','No coach plan yet — you can message your coach to request one, or let me make a temporary basic plan.'),actions:[{label:L('สร้างแผนพื้นฐาน','Make a basic plan'),action:'_chip',payload:{q:L('จัดตารางฝึกพื้นฐานไม่มีอุปกรณ์','make a basic bodyweight plan')}},{label:L('แชทหาโค้ช','Chat coach'),action:'go_coach'}]};
  }
 }catch(e){}
 var _wq=wplanQuota(); if(!_wq.ok) return wplanQuotaReply(_wq);
 var inp=inpOverride||_wpParse(message);var limitation=limOverride||_wpLimit(message);var bp=coach?null:_bodyProfile();
 var _ad=null,_adNote='';
 try{
  if(!coach){ var _au=_wpProfile(); if(_au&&_au.id!=null)_ad=_wAdapt(_au.id); }
  if(_ad&&_ad.hasData){
   var _t=(''+message).toLowerCase(),_wdUsed=false;
   if(!inpOverride&&!/([2-6])\s*(วัน|day)/.test(_t)){
    inp.daysPerWeek=Math.max(2,Math.min(5,Math.round(_ad.perWeek)||2));
   }
   var _wdSaid=/จันทร์|อังคาร|พุธ|พฤหัส|ศุกร์|เสาร์|\b(mon|tue|wed|thu|fri|sat|sun)/.test(_t)||(/อาทิตย์/.test(_t)&&!/ต่ออาทิตย์|อาทิตย์ละ/.test(_t));
   if((inp.wdays==null||inp.wdays==='auto')&&!_wdSaid&&_ad.topWdays.length){
    var _n=inp.daysPerWeek||3,_wd=_ad.topWdays.slice(0,_n);
    _defaultWdays(_n).forEach(function(x){ if(_wd.length<_n&&_wd.indexOf(x)<0)_wd.push(x); });
    _wd.sort(function(a,b){return a-b;});
    inp.wdays=_wd;_wdUsed=true;
   }
   _adNote=_wAdaptText(_ad,inp.goal,false,null,_wdUsed);
  }
 }catch(eA){ _adNote=''; }
 var sel=selectWorkoutTemplateByBody({goal:inp.goal,level:inp.level,daysPerWeek:inp.daysPerWeek,equipment:inp.equipment,limitation:limitation,bodyProfile:bp,hasCoach:false,hasCoachWorkoutPlan:false});
 var tpl=getWorkoutTemplateById(sel.templateId)||WORKOUT_TEMPLATES[0];
 var _libBody=(sel.safetyLevel!=='caution'&&sel.safetyLevel!=='low_impact'&&limitation==='none')?(function(){try{return _libWorkoutPlan(inp);}catch(e){return null;}})():null;
  try{ if(!_libBody){ _LAST_WPLAN=_tplToStruct(tpl,inp)||null; } }catch(_eT){}
 var explain=coach?'':(_libBody?_libExplain(inp,bp):_wpExplain(tpl,bp,inp,sel.safetyLevel));
 var msg=(_adNote?_adNote+'\n\n———\n\n':'')+(explain?explain+'\n\n———\n\n':'')+(_libBody||_wpFormat(tpl))+L('หมายเหตุ: เลือกความหนักที่ยังคุมท่าได้ ไม่ต้องฝืนจนหมดแรง · ถ้าทำได้ครบทุกเซ็ตคุมท่าดี 2 ครั้งติด ค่อยเพิ่มครั้ง/น้ำหนักเล็กน้อย','Note: pick a load you can control, no need to go to failure. If you hit all sets with good form twice, add reps/a little weight.');
 var note=coach?L('นี่คือร่างแผนสำหรับลูกเทรน ตรวจ/แก้ก่อนส่งได้ · IU MATE ไม่ส่งให้ลูกเทรนอัตโนมัติ และไม่เปลี่ยนแผนเดิมโดยไม่ยืนยัน','Draft for your client — review/edit before sending. IU MATE never auto-sends or overrides an active plan.'):L('แผนนี้เป็นแผนพื้นฐาน ปรับได้ตามความพร้อมของร่างกาย หากมีอาการเจ็บหรือโรคประจำตัว ควรปรึกษาผู้เชี่ยวชาญก่อนเริ่มฝึก','This is a basic plan — adjust to your readiness. If you have pain or a health condition, consult a professional first.');
 wplanQuotaUse();
 var _q2=wplanQuota();
 var quotaLine=_q2.unlimited?'':L('\n\n📊 โควต้าจัดตารางเดือนนี้: เหลืออีก '+Math.max(0,_q2.lim-_q2.n)+'/'+_q2.lim+' ครั้ง (รีเซ็ตต้นเดือนหน้า)','\n\n📊 Plan quota this month: '+Math.max(0,_q2.lim-_q2.n)+'/'+_q2.lim+' left (resets next month)');
 var _canSave=(!coach&&_LAST_WPLAN&&_LAST_WPLAN.struct&&_LAST_WPLAN.struct.length);
 var saveHint=_canSave?L('\n\nกด “บันทึกลงตารางฝึก” เพื่อใส่ลงตารางให้อัตโนมัติ แล้วเข้าไปปรับจำนวนครั้ง/เวลาต่อได้ในหน้าตารางฝึกครับ','\n\nTap “Save to my schedule” to add it automatically — then fine-tune reps/time in the Workout tab.'):'';
 var chips=[];
 var _cl=[]; try{ _cl=(typeof coachClientsList==='function')?coachClientsList():[]; }catch(_e){}
 if(coach&&_cl&&_cl.length&&_LAST_WPLAN&&_LAST_WPLAN.struct&&_LAST_WPLAN.struct.length){ try{window._LAST_COACH_WPLAN={cid:null,name:'',struct:_LAST_WPLAN.struct};}catch(_e){} chips.push({label:L('📅 เพิ่มลงตารางลูกเทรน','📅 Add to a client'),action:'coach_wplan_pick'}); }
 if(_canSave) chips.push({label:L('📅 เพิ่มลงตารางสัปดาห์นี้','📅 Add to my week'),action:'wplan_save',payload:{struct:_LAST_WPLAN.struct}});
 chips.push({label:L('🔄 สร้างตารางใหม่','🔄 Regenerate'),action:'workout_redraft'});
 chips.push({label:L('ไม่มีอุปกรณ์','No equipment'),action:'_chip',payload:{q:L('จัดตารางฝึกไม่มีอุปกรณ์','workout plan no equipment')}});
 chips.push({label:L('ไปหน้าตารางฝึก','Open plan'),action:'go_workout'});
 return {title:L('ตารางฝึกแนะนำ','Recommended plan'),message:msg,disclaimer:note+quotaLine+saveHint,actions:chips};}
function buildExerciseAlt(message){var t=(''+message).toLowerCase();var pat='';
 if(/squat|สควอท|ขา/.test(t))pat='squat';else if(/row|pull|ดึง|หลัง/.test(t))pat='pull';else if(/push|press|ดัน|อก|วิดพื้น/.test(t))pat='push';else if(/deadlift|hinge|สะโพก|rdl|หลังล่าง/.test(t))pat='hinge';else if(/core|แกน|ท้อง|plank|แพลงก์/.test(t))pat='core';
 var eqk=/ยิม|gym/.test(t)?'gym':(/ดัมเบล|dumbbell/.test(t)?'dumbbell':'noEquipment');var eqLb={gym:L('ยิม','gym'),dumbbell:L('ดัมเบล','dumbbell'),noEquipment:L('ไม่มีอุปกรณ์','no equipment')};
 if(pat&&EXERCISE_ALTERNATIVES[pat]){var alts=EXERCISE_ALTERNATIVES[pat][eqk]||EXERCISE_ALTERNATIVES[pat].noEquipment;
  return {title:L('ท่าทางเลือก','Alternatives'),message:L('ท่าแทนกลุ่ม ','Alternatives for ')+pat+' ('+eqLb[eqk]+'):\n• '+alts.join('\n• '),disclaimer:L('ถ้าไม่มีอุปกรณ์เลย เลือกท่าที่คุมได้ปลอดภัย หรือข้ามท่านั้นชั่วคราวแล้วถามโค้ชเพิ่ม','If you have no equipment, pick a safe controllable move or skip it and ask your coach.')};}
 return {title:L('หาท่าแทน','Find alternative'),message:L('บอกชื่อท่าหรือกลุ่มกล้าม (สควอท/ดัน/ดึง/สะโพก/แกนกลาง) + อุปกรณ์ที่มี เดี๋ยวแนะนำท่าแทนให้ครับ','Tell me the move or muscle group (squat/push/pull/hinge/core) + your equipment, and I will suggest alternatives.')};}
function buildReply(intent, message, nlu){
  if(isHealthRisk(message)) return safetyReply();
  if(isMedical(message)) return { title:L('เรื่องนี้ควรปรึกษาผู้เชี่ยวชาญ','Please consult a professional'),
    message:L('เรื่องนี้ควรปรึกษาแพทย์หรือผู้เชี่ยวชาญโดยตรงนะครับ IU Mate ช่วยเรื่องการบันทึกอาหาร การฝึก และการติดตามผลทั่วไปได้','This is best discussed with a doctor or specialist. IU Mate can help with logging food, training and general tracking.') };
  var ql=(''+message).toLowerCase();
  var _q=(nlu && nlu.question) || /ยังไง|ยังงัย|อย่างไร|คืออะไร|แค่ไหน|เท่าไห|เท่าไร|ทำไม|ทำไง|ดูอะไร|how |what |why /.test(ql);
  if(_q && intent!=='ingredient_recipe_generate' && intent!=='today_summary' && intent!=='calc_plan' && intent!=='food_swap' && intent!=='budget_menu' && intent!=='cuisine_menu' && intent!=='result_summary' && intent!=='workout_recommend'){ var _kh=searchKnowledge(message); if(_kh.length) return buildKnowledge(message); }
  switch(intent){
    case 'today_summary': return buildToday();
    case 'cuisine_menu': return buildCuisineMenu(message);
    case 'food_swap': return buildSwapReply(message);
    case 'budget_menu': return buildBudgetMenu(message);
    case 'food_recommend': if(/ของว่าง|มื้อว่าง|กินเล่น|snack/.test(ql)) return buildSnackRecommend(message); return buildFoodRecommend(message);
    case 'food_search': return buildFoodSearch(message);
    case 'result_summary': return buildResult();
    case 'workout_recommend': return buildWorkout();
    case 'workout_plan': return buildWorkoutPlan(message);
    case 'coach_workout': return buildWorkoutPlan(message);
    case 'exercise_alternative': return buildExerciseAlt(message);
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
    case 'find_place': return buildFindPlace(message);
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
/* ---- Auto-Tag Engine: tag every menu in the library + recommend from it (cached once) ---- */
var _menuCache=null;
function menuNut(ings){ var ing=ING(); var t=[0,0,0,0,0]; (ings||[]).forEach(function(p){ var it=ing[p[0]]; if(!it||!it.v) return; for(var i=0;i<5;i++) t[i]+=(it.v[i]||0)*p[1]/100; }); return {kcal:Math.round(t[0]),protein:Math.round(t[1]),fat:Math.round(t[2]),carb:Math.round(t[3]),fiber:Math.round(t[4])}; }
function guessCuisine(name){
  if(/ซูชิ|ราเมง|อุด้ง|เทอริยากิ|มิโซะ| ดง|เกี๊ยวซ่า|ทงคัตสึ|กิวด้ง|ซาชิมิ/.test(name)) return 'ญี่ปุ่น';
  if(/ติ่มซำ|หมูแดง|เป็ดย่าง|ซาลาเปา|บะหมี่|เกี๊ยว|ผัดซีอิ๊ว|โจ๊ก|ก๋วยเตี๋ยว|ติ๋ม/.test(name)) return 'จีน';
  if(/สเต๊ก|พาสต้า|พิซซ่า|เบอร์เกอร์|สลัด|แซนวิช|ออมเล็ต|เบคอน|สปาเก|ฮอทดอก/.test(name)) return 'ตะวันตก';
  return 'ไทย';
}
function tagMenu(r){
  var n=menuNut(r.ings); var name=r.n||''; var tags=[];
  if(n.protein>=25) tags.push(L('โปรตีนสูง','High protein'));
  if(n.kcal&&n.kcal<=400) tags.push(L('แคลต่ำ','Low cal'));
  if(n.carb<=25) tags.push(L('คาร์บต่ำ','Low carb'));
  var goalFit=['สุขภาพทั่วไป'];
  if(n.kcal&&n.kcal<=550&&n.protein>=20) goalFit.push('ลดไขมัน');
  if(n.kcal>=550&&n.carb>=50&&n.protein>=25) goalFit.push('เพิ่มกล้าม');
  var cuisine=(r.c&&['ญี่ปุ่น','จีน','ตะวันตก','สะดวกซื้อ'].indexOf(r.c)>=0)?r.c:guessCuisine(name);
  var budget=cuisine==='สะดวกซื้อ' || (r.ings||[]).length>0 && (r.ings||[]).every(function(p){ var it=ING()[p[0]]; return it && isBudget({name:it.n}); });
  var mealFit=['กลางวัน','เย็น'];
  if(/ไข่|ขนมปัง|โอ๊ต|นม|โยเกิร์ต|ซีเรียล|แซนวิช|ปั้น|ข้าวต้ม|โจ๊ก/.test(name)&&n.kcal&&n.kcal<=450) mealFit.push('เช้า');
  if(n.protein>=25&&n.carb>=40) mealFit.push('หลังออกกำลัง');
  if(n.kcal&&n.kcal<=220) mealFit.push('ของว่าง');
  var method=''; ['ทอด','ผัด','ย่าง','ต้ม','นึ่ง','อบ','ปิ้ง','ตุ๋น'].forEach(function(m){ if(name.indexOf(m)>=0) method=m; });
  return { id:r.id, name:name, ic:r.ic, ings:r.ings, nutrition:n, tags:tags, goalFit:goalFit, mealFit:mealFit, cuisine:cuisine, budget:budget, method:method };
}
function menuList(){ if(_menuCache) return _menuCache; try{ var rs=fn('allRecipes')?window.allRecipes():(window.IUFIT_RECIPES||[]); _menuCache=rs.map(tagMenu).filter(function(m){ return m.nutrition.kcal>0; }); }catch(e){ _menuCache=[]; } return _menuCache; }
function menuToCard(m){
  var rc={ id:'lib'+m.id, name:tFoodName(m.name), desc:'', nutrition:m.nutrition, score:0,
    ingredients:(m.ings||[]).map(function(p){ var it=ING()[p[0]]||{}; return {id:p[0],name:it.n||p[0],group:GROUP_MAP[it.g]||'other',amount:p[1],kcal:(it.v&&it.v[0])||0,protein:(it.v&&it.v[1])||0,fat:(it.v&&it.v[2])||0,carb:(it.v&&it.v[3])||0,fiber:(it.v&&it.v[4])||0}; }),
    tags:(m.tags||[]).concat(m.budget?[L('ประหยัด','Budget')]:[]).slice(0,4) };
  ST.recipeCache[rc.id]=rc; return rc;
}
function recommendMenus(opts){
  opts=opts||{}; var goal=opts.goal||goalLabel(), meal=opts.meal||currentMeal();
  var remaining=opts.remaining||(todayCtx().remaining||600);
  var list=menuList().filter(function(m){ if(opts.cuisine&&m.cuisine!==opts.cuisine) return false; if(opts.budget&&!m.budget) return false; return true; });
  list.forEach(function(m){ var sc=0;
    if(m.goalFit.indexOf(goal)>=0) sc+=3;
    if(m.mealFit.indexOf(meal)>=0) sc+=2;
    if(m.nutrition.kcal<=remaining) sc+=2; else sc-=3;
    if(m.nutrition.protein>=25) sc+=1;
    sc+=Math.random()*0.6; m._sc=sc;
  });
  list.sort(function(a,b){ return b._sc-a._sc; });
  return list.slice(0, opts.n||5).map(menuToCard);
}
function buildCuisineMenu(message){
  if(!ingDbOk()) return cantCalcReply();
  var t=synNorm(message), cz=null;
  if(/ญี่ปุ่น|japanese|ซูชิ|ราเมง/.test(t)) cz='ญี่ปุ่น';
  else if(/จีน|chinese|ติ่มซำ|เป็ดย่าง/.test(t)) cz='จีน';
  else if(/ฝรั่ง|ตะวันตก|western|สเต๊ก|พาสต้า|เบอร์เกอร์/.test(t)) cz='ตะวันตก';
  else if(/7-11|เซเว่น|สะดวกซื้อ|convenience/.test(t)) cz='สะดวกซื้อ';
  if(!cz) return buildLibraryRecommend();
  var recs=recommendMenus({ cuisine:cz, goal:goalLabel(), meal:currentMeal(), n:4 });
  if(!recs.length) return buildLibraryRecommend();
  return { title:L('เมนู'+cz, _cuisineEn(cz)+' menus'),
    message:L('เลือกเมนู'+cz+'ที่เข้ากับเป้าหมายและแคลที่เหลือให้ครับ','Picked '+_cuisineEn(cz)+' menus that fit your goal and remaining calories:'),
    recipes:recs.slice(0,3),
    actions:[{label:L('เมนูอื่น','Other menus'),action:'recommend_library'},{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] };
}
function buildSwapReply(message){
  if(!ingDbOk()) return cantCalcReply();
  var ings=findIngredientsInText(message);
  var _sn={}; ings=ings.filter(function(x){ var b=_baseName(x.name); if(_sn[b])return false; _sn[b]=1; return true; }).slice(0,2);
  if(!ings.length) return { title:L('เปลี่ยนวัตถุดิบ','Ingredient swaps'), message:L('พิมพ์ชื่อวัตถุดิบที่อยากเปลี่ยน เช่น "อกไก่แทนด้วยอะไร" หรือ "ไม่มีข้าวกล้องใช้อะไรแทน"','Type an ingredient to swap, e.g. "what can replace chicken breast".'), actions:[{label:L('เลือกวัตถุดิบ','Pick ingredients'),action:'open_ingredient_picker'}] };
  var blocks=ings.slice(0,3).map(function(ing){ var sw=swapsFor(ing,3); if(!sw.length) return tFoodName(ing.name)+': '+L('ยังไม่มีตัวเลือกแทน','no alternative'); return '🔄 '+tFoodName(ing.name)+' → '+sw.map(function(x){ return tFoodName(x._b)+' ('+x.kcal+' kcal/100g)'; }).join(', '); });
  return { title:L('เปลี่ยนวัตถุดิบได้','Ingredient swaps'),
    message:blocks.join('\n')+'\n\n'+L('เลือกตัวที่มาโครใกล้กันเพื่อคุมแคลให้ใกล้เดิมครับ','Pick the closest macros to keep calories similar.'),
    disclaimer:L('ค่าโภชนาการต่อ 100 กรัม เป็นค่าประมาณเพื่อช่วยเลือก','Per-100g nutrition is an estimate to help you choose'),
    actions:[{label:L('สร้างเมนูจากของที่มี','Make a menu'),action:'open_ingredient_picker'}] };
}
function buildBudgetMenu(message){
  if(!ingDbOk()) return cantCalcReply();
  var recs=recommendMenus({ goal:goalLabel(), meal:currentMeal(), budget:true, n:4 });
  if(!recs.length){ var pantry=budgetPantry(); recs=pantry.length?generateRecipes(pantry,{goal:goalLabel(),meal:currentMeal()}):[]; }
  if(!recs.length) return buildLibraryRecommend();
  return { title:L('เมนูประหยัดงบ','Budget-friendly menus'),
    message:L('เลือกเมนูราคาประหยัดที่หาง่าย คำนวณแคลให้แล้วครับ','Budget-friendly, easy-to-find menus — calories already calculated:'),
    recipes:recs.slice(0,3),
    actions:[{label:L('สร้างจากของที่มี','From my ingredients'),action:'open_ingredient_picker'},{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] };
}
/* ---- time+meal aware snack recommender (added v11.09) ---- */
function _snackTimeCtx(message){
  var t=(''+message).toLowerCase();
  if(/ก่อนนอน|ก่อนเข้านอน|ก่อนเข้าน|ดึก|before ?bed|bedtime|late ?night/.test(t)) return 'ก่อนนอน';
  if(/หลังออกกำลัง|หลังเล่น|หลังฟิต|หลังวิ่ง|post.?workout|after ?workout/.test(t)) return 'หลังออกกำลัง';
  if(/ก่อนออกกำลัง|ก่อนเล่น|ก่อนฟิต|ก่อนวิ่ง|pre.?workout|before ?workout/.test(t)) return 'ก่อนออกกำลัง';
  if(/บ่าย|afternoon/.test(t)) return 'บ่าย';
  if(/เย็น|ค่ำ|หัวค่ำ|evening/.test(t)) return 'เย็น';
  if(/ตอนเช้า|มื้อเช้า|ตอนสาย|morning/.test(t)) return 'เช้า';
  if(/เที่ยง|กลางวัน|noon|lunch/.test(t)) return 'บ่าย';
  var h=new Date().getHours();
  if(h>=21||h<5) return 'ก่อนนอน';
  if(h>=17) return 'เย็น';
  if(h>=13) return 'บ่าย';
  if(h>=5&&h<11) return 'เช้า';
  return 'บ่าย';
}
var _SNACK_PROF={
 'บ่าย':{cap:250,lab:['ตอนบ่าย','the afternoon'],
   why:['ของว่างบ่ายควรมีโปรตีนหรือไฟเบอร์พอให้อิ่มถึงมื้อเย็น แต่ไม่หนักเกินไป','An afternoon snack should have some protein or fiber to keep you full until dinner, but stay light.'],
   prefer:/นม|โยเกิร์ต|ถั่ว|ไข่|ผลไม้|กราโนล่า|แซนวิช|เวย์|สลัด|อกไก่/,avoid:/ทอด|เค้ก|โดนัท|น้ำอัดลม|กะทิ/,
   items:[['กรีกโยเกิร์ต + ผลไม้','Greek yogurt + fruit',150],['ไข่ต้ม 1–2 ฟอง','1–2 boiled eggs',140],['ถั่วอัลมอนด์ 1 กำมือ','a handful of almonds',160],['นมโปรตีน/นมถั่วเหลืองไม่หวาน','protein or unsweetened soy milk',120],['แซนวิชอกไก่ชิ้นเล็ก','a small chicken-breast sandwich',210]]},
 'เย็น':{cap:150,lab:['ตอนเย็น','the evening'],
   why:['ตอนเย็นเลือกของว่างเบา ๆ ย่อยง่าย ไม่ให้หนักท้องก่อนมื้อเย็นหรือก่อนพักผ่อน','In the evening pick something light and easy to digest so it wont weigh you down before dinner or rest.'],
   prefer:/ผลไม้|โยเกิร์ต|นม|ผัก|ต้ม|ไข่ต้ม|ฝรั่ง|แอปเปิล|สลัด/,avoid:/ทอด|มัน|เค้ก|ข้าว|เส้น|กะทิ|ผัด|ย่าง/,
   items:[['ผลไม้สด เช่น แอปเปิล/ฝรั่ง/ส้ม','fresh fruit (apple/guava/orange)',80],['โยเกิร์ตไขมันต่ำ','low-fat yogurt',100],['ผักสด/แครอทแท่ง','fresh veggie sticks',60],['นมอุ่นไขมันต่ำ','warm low-fat milk',100],['ไข่ต้ม 1 ฟอง','1 boiled egg',70]]},
 'ก่อนนอน':{cap:120,lab:['ก่อนนอน','before bed'],
   why:['ก่อนนอนเลือกเบามาก โปรตีนที่ย่อยง่ายช่วยได้ เลี่ยงคาเฟอีน น้ำตาล และของทอด','Before bed keep it very light — a little easy-to-digest protein helps; avoid caffeine, sugar and fried food.'],
   prefer:/นม|โยเกิร์ต|กล้วย|ไข่ต้ม|อัลมอนด์|คาโมมายล์/,avoid:/กาแฟ|ชาเขียว|มัทฉะ|ทอด|เค้ก|ช็อกโก|น้ำอัดลม|เผ็ด/,
   items:[['นมอุ่น/นมถั่วเหลืองไม่หวาน','warm milk or unsweetened soy milk',90],['กรีกโยเกิร์ต','Greek yogurt',90],['กล้วยครึ่งลูก','half a banana',50],['อัลมอนด์ 8–10 เม็ด','8–10 almonds',70],['ชาคาโมมายล์ (ไม่มีคาเฟอีน)','chamomile tea (caffeine-free)',5]]},
 'เช้า':{cap:300,lab:['ตอนเช้า','the morning'],
   why:['ของว่างเช้าเน้นให้พลังงาน โปรตีนคู่กับคาร์บเชิงซ้อน','A morning snack should energize you — protein plus some complex carbs.'],
   prefer:/ไข่|โอ๊ต|นม|โยเกิร์ต|ขนมปัง|กล้วย|ซีเรียล|กราโนล่า/,avoid:/ทอด|น้ำอัดลม|เค้ก/,
   items:[['ข้าวโอ๊ต + กล้วย','oatmeal + banana',250],['ไข่ต้ม + ขนมปังโฮลวีต','boiled egg + whole-wheat toast',220],['กรีกโยเกิร์ต + กราโนล่า','Greek yogurt + granola',230],['นม + กล้วย','milk + banana',180]]},
 'ก่อนออกกำลัง':{cap:250,lab:['ก่อนออกกำลังกาย','before your workout'],
   why:['ก่อนออกกำลังเน้นคาร์บย่อยง่ายให้พลังงาน เลี่ยงไขมันและไฟเบอร์สูงที่ทำให้จุก (กินก่อน ~45–60 นาที)','Before training, focus on easy carbs for energy; avoid high fat/fiber that can upset your stomach (eat ~45–60 min before).'],
   prefer:/กล้วย|ข้าว|โอ๊ต|ขนมปัง|น้ำผลไม้|ผลไม้/,avoid:/ทอด|มัน|กะทิ|ครีม|ชีส/,
   items:[['กล้วย 1 ลูก','1 banana',90],['ข้าวโอ๊ต','a bowl of oatmeal',180],['ขนมปังโฮลวีต + น้ำผึ้งนิดหน่อย','whole-wheat toast + a little honey',160],['น้ำผลไม้/สมูทตี้บาง ๆ','light juice or smoothie',150]]},
 'หลังออกกำลัง':{cap:350,lab:['หลังออกกำลังกาย','after your workout'],
   why:['หลังออกกำลังเน้นโปรตีนคู่คาร์บช่วยฟื้นและซ่อมกล้ามเนื้อ (ภายใน ~1–2 ชม.)','After training, pair protein with carbs to recover and repair muscle (within ~1–2 hrs).'],
   prefer:/เวย์|ไข่|นม|อกไก่|ข้าว|กล้วย|โยเกิร์ต|ปลา|ทูน่า/,avoid:/ทอด|เค้ก|น้ำอัดลม/,
   items:[['เวย์โปรตีน + กล้วย','whey protein + banana',220],['อกไก่ + ข้าว','chicken breast + rice',320],['ไข่ต้ม 2 ฟอง + นม','2 boiled eggs + milk',250],['กรีกโยเกิร์ต + ผลไม้','Greek yogurt + fruit',180]]}
};
function buildSnackRecommend(message){
  var ctx=_snackTimeCtx(message), p=_SNACK_PROF[ctx]||_SNACK_PROF['บ่าย'];
  var items=p.items.map(function(it,i){ return (i+1)+'. '+L(it[0],it[1])+' (~'+it[2]+' kcal)'; }).join('\n');
  var msg=L(p.why[0],p.why[1])+'\n\n'+L('ของว่างที่เหมาะ:','Good picks:')+'\n'+items;
  var recs=[];
  try{ if(ingDbOk()){
    var lp=menuList().filter(function(m){ var n=m.nutrition; var nm=m.name||''; return n.kcal>=30&&n.kcal<=p.cap&&p.prefer.test(nm)&&!p.avoid.test(nm); });
    lp.forEach(function(m){ m._ss=(Math.abs(m.nutrition.kcal-(p.cap*0.6))*-1)+Math.random()*20; });
    lp.sort(function(a,b){ return b._ss-a._ss; });
    recs=lp.slice(0,2).map(menuToCard);
  } }catch(e){}
  var r={ _intent:'snack_recommend',
    title:L('ของว่าง'+p.lab[0],'Snack for '+p.lab[1]),
    message:msg,
    disclaimer:L('แคลเป็นค่าประมาณ ปรับตามปริมาณจริง และดูแคลที่เหลือของวันด้วยครับ','Calories are estimates — adjust to your portion and your remaining daily calories.'),
    actions:[{label:L('🍎 เมนูของว่างในคลัง','🍎 Snack menus in library'),action:'recommend_library'},{label:L('บันทึกอาหาร','Log food'),action:'go_food'}] };
  if(recs.length){ r.recipes=recs; r.message+='\n\n'+L('เมนูเบา ๆ จากคลังที่เข้ากับตอนนี้:','Light menus from the library that fit right now:'); }
  return r;
}

function buildFoodRecommend(message){
  if(!ingDbOk()) return cantCalcReply();
  return { title:L('อยากได้เมนูแบบไหนดี?','How would you like menus?'),
    message:L('เลือกได้เลยครับ — จะให้จัดจากวัตถุดิบที่คุณมี หรือเลือกจากคลังเมนูสำเร็จก็ได้','Pick one — build from ingredients you have, or choose from the ready menu library:'),
    actions:[
      {label:L('🧺 สร้างจากวัตถุดิบที่มี','🧺 From my ingredients'),action:'open_ingredient_picker'},
      {label:L('📋 ใช้เมนูจากคลัง','📋 From the menu library'),action:'recommend_library'}
    ] };
}
function _menuSeed(text){var t=(''+text).toLowerCase();var sd={};if(/มื้อเช้า|ตอนเช้า|breakfast/.test(t))sd.meal='เช้า';else if(/กลางวัน|เที่ยง|lunch/.test(t))sd.meal='กลางวัน';else if(/มื้อเย็น|ตอนเย็น|ค่ำ|dinner/.test(t))sd.meal='เย็น';if(/ลดไขมัน|ลดน้ำหนัก|แคลต่ำ|fat ?loss|low.?cal/.test(t))sd.goal='ลดไขมัน';else if(/เพิ่มกล้าม|โปรตีนสูง|muscle|high.?protein/.test(t))sd.goal='เพิ่มกล้าม';return sd;}
function buildLibraryRecommend(opts){opts=opts||{};
  if(!ingDbOk()) return cantCalcReply();
  var _g=opts.goal||goalLabel(),_m=opts.meal||currentMeal();
  var recs=recommendMenus({ goal:_g, meal:_m, n:4 });
  if(!recs.length){ var picks=popularIngredients(),byGroup=groupBy(picks),pantry=[]; ['protein','carb','vegetable'].forEach(function(g){ (byGroup[g]||[]).slice(0,2).forEach(function(i){ pantry.push(i); }); }); recs=generateRecipes(pantry,{goal:_g,meal:_m}); }
  if(!recs.length) return buildKnowledge('');
  return { title:L('เมนู'+_m+'ที่แนะนำ','Recommended menus'),
    message:L('จากคลังเมนู '+menuList().length.toLocaleString()+' รายการ ผมเลือกเมนู'+_m+'ที่เข้ากับเป้าหมาย "'+_g+'" ให้ครับ','From '+menuList().length.toLocaleString()+' menus, here are ones that fit your goal "'+_goalEn(_g)+'" and remaining calories:'),
    recipes:recs.slice(0,3),
    actions:[{label:L('สร้างจากของที่มี','From my ingredients'),action:'open_ingredient_picker'},{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] };
}
function buildFoodSearch(message){
  var acts=[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'},{label:L('สร้างเมนูจากของที่มี','Make from ingredients'),action:'open_ingredient_picker'}];
  var extra='';
  if(!_iuHasAI()){ extra='\n\n'+L('หาเมนูที่ต้องการไม่เจอในคลัง? เปิด AI (Gemini) ให้ช่วยสร้างเมนูใหม่ + คำนวณโภชนาการที่ไม่มีในคลังได้ — ตั้งค่าฟรีใน 1 นาที','Cant find your menu in the library? Turn on AI (Gemini) to generate new recipes with nutrition — free 1-min setup.'); acts.push({label:L('⚡ เปิด AI (ใส่ API key)','⚡ Enable AI (API key)'),action:'open_ai_setup'}); }
  return { title:L('ค้นหาเมนู','Search menus'),
    message:L('เปิดหน้าอาหารแล้วพิมพ์ชื่อเมนูในช่องค้นหาได้เลย คลังมีกว่า 4,500 เมนูพร้อมค่าโภชนาการ','Open Food and type a menu name in search — the library has 4,500+ menus with nutrition.')+extra,
    actions:acts };
}
function buildResult(){
  var r=resultCtx();
  if(r.empty) return { title:L('ยังไม่มีข้อมูลผลลัพธ์','No results yet'), message:L('ยังไม่มีข้อมูลร่างกายพอ ลองบันทึกร่างกาย (น้ำหนัก/สัดส่วน) ที่หน้าแรกก่อนนะครับ','Not enough body data — log your body (weight/measurements) on the Today page first.'),
    actions:[{label:L('ไปหน้าวันนี้','Open Today'),action:'go_today'}] };
  var lines=[];
  if(r.weightChange!=null) lines.push(L('น้ำหนักเปลี่ยน '+(r.weightChange>0?'+':'')+r.weightChange+' กก.','Weight change '+(r.weightChange>0?'+':'')+r.weightChange+' kg'));
  if(r.waistChange!=null) lines.push(L('รอบเอวเปลี่ยน '+(r.waistChange>0?'+':'')+r.waistChange+' ซม.','Waist change '+(r.waistChange>0?'+':'')+r.waistChange+' cm'));
  if(r.muscleChange!=null) lines.push(L('กล้ามเนื้อเปลี่ยน '+(r.muscleChange>0?'+':'')+r.muscleChange+' %','Muscle change '+(r.muscleChange>0?'+':'')+r.muscleChange+' %'));
  if(r.streak>=2) lines.push(L('สตรีคต่อเนื่อง '+r.streak+' วัน','Streak '+r.streak+' days'));
  if(!lines.length) lines.push(L('เริ่มมีข้อมูลแล้ว บันทึกต่อเนื่องเพื่อเห็นแนวโน้มชัดขึ้น','Data is starting to build — keep logging to see clearer trends.'));
  var msg=lines.join('\n')+'\n\n'+L('สรุป: รักษาความสม่ำเสมอต่อไป ผลลัพธ์กำลังมา','Summary: keep it consistent — progress is coming.');
  return { title:L('สรุปผลลัพธ์','Result summary'), message:msg, actions:[
    {label:L('สร้าง Result Card','Create result card'),action:'open_result_card'},
    {label:L('ข้อความแชร์ผล','Share caption'),action:'share_result_text'}
  ] };
}
function buildFindPlace(message){
  var t=synNorm(message||''); var cat='';
  var CATS=[
    [/แบด|badminton/i,'สนามแบดมินตัน','badminton court'],
    [/ฟุตซอล|futsal/i,'สนามฟุตซอล','futsal court'],
    [/ฟุตบอล|สนามบอล|football|soccer/i,'สนามฟุตบอล','football field'],
    [/บาสเก|บาส|basket/i,'สนามบาสเกตบอล','basketball court'],
    [/วอลเล|volley/i,'สนามวอลเลย์บอล','volleyball court'],
    [/เทนนิส|tennis/i,'สนามเทนนิส','tennis court'],
    [/ปิงปอง|เทเบิล|table tennis|ping/i,'โต๊ะปิงปอง','table tennis'],
    [/ตะกร้อ|takraw/i,'สนามตะกร้อ','takraw court'],
    [/มวยไทย|ค่ายมวย|ชกมวย|มวย|boxing|muay/i,'ค่ายมวย','boxing gym'],
    [/ยูโด|คาราเต|เทควัน|judo|karate|taekwondo|martial/i,'ยิมศิลปะป้องกันตัว','martial arts gym'],
    [/mma|เอ็มเอ็มเอ|กรงแปด/i,'ยิม MMA','MMA gym'],
    [/พิลาทิ|พิลาเต|pilates/i,'สตูดิโอพิลาทิส','pilates studio'],
    [/โยคะ|yoga/i,'สตูดิโอโยคะ','yoga studio'],
    [/ครอสฟิต|crossfit/i,'ยิมครอสฟิต','crossfit box'],
    [/ปีนผา|ปีนหน้าผา|climb/i,'ยิมปีนผา','climbing gym'],
    [/แอโรบิก|aerobic|ซุมบ้า|zumba|เต้น|dance/i,'คลาสเต้น/แอโรบิก','dance studio'],
    [/สปิน|ปั่นจักรยาน|จักรยาน|cycling|spin/i,'สตูดิโอปั่นจักรยาน','cycling studio'],
    [/กอล์ฟ|golf|driving range/i,'สนามกอล์ฟ','golf range'],
    [/สเก็ต|skat|ลานน้ำแข็ง|ice rink/i,'ลานสเก็ต','skating rink'],
    [/แทรมโพลีน|trampoline/i,'สวนแทรมโพลีน','trampoline park'],
    [/ยิมนาสติก|gymnastic/i,'ยิมยิมนาสติก','gymnastics gym'],
    [/สระ|ว่ายน้ำ|pool|swim/i,'สระว่ายน้ำ','swimming pool'],
    [/ลู่วิ่ง|ที่วิ่ง|จ๊อก|จอกกิ้ง|jog|running track/i,'ลู่วิ่ง','running track'],
    [/สวนสาธารณะ|สวนสุขภาพ|สวนวิ่ง|park/i,'สวนสาธารณะ','park'],
    [/ฟิตเนส|fitness/i,'ฟิตเนส','fitness center'],
    [/ยิม|gym/i,'ยิม','gym'],
    [/คอร์ท|สนามกีฬา|ศูนย์กีฬา|สเตเดียม|สนาม|court|stadium|arena|sports/i,'สนามกีฬา','sports venue']
  ];
  for(var _ci=0;_ci<CATS.length;_ci++){ if(CATS[_ci][0].test(t)){ cat=L(CATS[_ci][1],CATS[_ci][2]); break; } }
  return {
    title:L('หาสถานที่ออกกำลังกายใกล้ฉัน','Find a place to work out'),
    message:L('พิมพ์ประเภทหรือชื่อสถานที่ แล้วกด "เปิดแผนที่" เพื่อค้นบน Google Maps ใกล้ตำแหน่งของคุณ','Type a place type or name, then tap "Open map" to search Google Maps near you.'),
    placeSearch:true,
    placeQuery:cat,
    placeHolder:L('เช่น ยิม, ฟิตเนส, สวนสาธารณะ + ย่าน','e.g. gym, fitness, park + area'),
    placeChips:[L('ยิม','Gym'),L('ฟิตเนส','Fitness'),L('สวนสาธารณะ','Park'),L('สระว่ายน้ำ','Pool'),L('ลู่วิ่ง','Track')]
  };
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
  var clients=(S().users||[]).filter(function(u){ return u.tr && !u.removedAt; });
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
  var clients=(S().users||[]).filter(function(u){ return u.tr && !u.removedAt; });
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
function topClientName(){ try{ var cs=(S().users||[]).filter(function(u){return u.tr&&!u.removedAt;}); if(!cs.length) return L('ลูกเทรน','your client'); var r=cs.map(analyzeClient).sort(function(a,b){return b.score-a.score;})[0]; return (r&&r.name)||cs[0].name||L('ลูกเทรน','your client'); }catch(e){ return L('ลูกเทรน','your client'); } }
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
var TOUR_ACT={how_to_log_food:'tour_food_log',how_to_meal_plan:'tour_meal_plan',how_to_menu_library:'tour_meal_plan',how_to_food_library:'tour_meal_plan',how_to_make_recipe:'tour_meal_plan',how_to_log_workout:'tour_workout_log',how_to_workout_plan:'tour_workout_plan',how_to_log_water:'tour_water',how_to_log_body:'tour_body_log',how_to_log_weight:'tour_body_log',how_to_result_card:'tour_result_card',how_to_share_result:'tour_result_card',create_result_card:'tour_result_card',how_to_overview:'tour_full',app_overview:'tour_full',how_to_tour:'tour_full',coach_send_plan:'tour_coach_clients',coach_course:'tour_coach_clients',coach_groups:'tour_coach_groups',coach_profile:'tour_coach_home',coach_overview:'tour_coach_full',how_to_coach_clients:'tour_coach_clients',how_to_coach_homework:'tour_coach_homework',how_to_coach_invite:'tour_coach_qr'};
function buildKnowledge(message){
  var hits=searchKnowledge(message);
  if(!hits.length) return buildFallback(message);
  var top=hits[0];
  var acts=(top.actions||[]).slice();
  var ta=TOUR_ACT[top.id];
  if(ta && (typeof window==='undefined'||true)) acts.unshift({label:L('▶️ พาทำทีละขั้น (tutorial)','▶️ Walk me through'),action:ta});
  return { title:top.title, message:top.answer, actions:acts, more:hits.slice(1).map(function(h){return {title:h.title,answer:h.answer};}) };
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
    {label:L('สร้าง Result Card','Create result card'),action:'open_result_card'}
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
  try{ var _kh=_scoreKnowledge(synNorm(message),false); if(_kh&&_kh.length) return buildKnowledge(message); }catch(e){}
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
    [L('ร่างเมนูให้ลูกเทรน','Draft a client menu'),'🍽️'],[L('ร่างโปรแกรมฝึก','Draft a workout'),'🏋️'],[L('สรุปกลุ่ม','Groups'),'🏷️'],[L('คนที่ต้องติดตาม','Who to follow up'),'🔔'],[L('ข้อความสำเร็จรูป','Message templates'),'💬']
  ]:[
    [L('สรุปวันนี้','Today summary'),'📊'],[L('กินอะไรดี','What to eat'),'🍽️'],[L('สร้างเมนูจากของที่มี','Make from ingredients'),'🧺'],[L('เมนูประหยัด','Budget menu'),'💰'],
    [L('จัดแผนให้ฉัน','Build my plan'),'🎯'],[L('จัดตารางฝึกให้หน่อย','Build a workout'),'🗓️'],[L('คำนวณแคล/มาโคร','Calorie & macros'),'🧮'],[L('ดูความคืบหน้า','My progress'),'📈'],[L('วิธีใช้แอป','How to use'),'❓'],[L('หาที่ออกกำลังกาย','Find a place'),'📍']
  ];
  return rankChips(list);
}
function _iuHasAI(){ try{ var st=S(); return !!(st&&st.aiKey&&(''+st.aiKey).trim()); }catch(e){ return false; } }
function _lineWelcome(){ return { message:L('🆕 บันทึกอาหาร/ท่าฝึกผ่าน LINE ได้แล้ว! พิมพ์บอกในไลน์ IUFIT เช่น "มื้อเช้า ไข่ต้ม 2 ฟอง" หรือ "วิ่ง 30 นาที" เดี๋ยวเข้าแอปให้อัตโนมัติ','🆕 You can now log meals & workouts via LINE! Just type in the IUFIT LINE chat (e.g. "breakfast 2 boiled eggs") and it syncs to the app.'), actions:[{label:L('เชื่อม LINE เลย','Connect LINE'),action:'open_line_log'}] }; }
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
    b.innerHTML='<span class="ico">'+cfg.icon+'</span><span class="lbl">'+esc(cfg.label)+'</span><span class="go">'+botAvatar()+'</span>';
    b.addEventListener('click',function(){ IUMate.open(tab); if(hasConsent()){ setTimeout(function(){ IUMate.chip(cfg.q); },260); } });
    view.insertBefore(b, view.firstChild);
  }catch(e){}
}
function renderFab(){
  var fab=document.getElementById('iuMateFab');
  if(!fab){ fab=document.createElement('button'); fab.id='iuMateFab'; fab.className='iu-mate-fab'; fab.type='button'; fab.setAttribute('aria-label',L('เปิด IU Mate','Open IU Mate'));
    fab.innerHTML='<span class="iu-orb">'+fabOrb()+'</span>';
    fab.addEventListener('click',function(){ IUMate.open('global'); });
    document.body.appendChild(fab);
  }
  var rdy=appReady();
  var _nav=document.getElementById('nav');var _navEmpty=!_nav||!_nav.innerHTML.trim();fab.hidden = ST.isOpen || !rdy || _navEmpty || (document.body&&document.body.classList&&document.body.classList.contains('iu-noapp')) || fabModalOpen() || !!document.getElementById('rcOverlay') || !!document.getElementById('scan-ov');
  var dim = rdy && !hasConsent();
  fab.classList.toggle('is-dimmed', !!dim);
  fab.classList.toggle('is-loading', !!ST.busy);
  var unread=false;
  if(rdy && !ST.isOpen && !dim && !ST.busy && !ST._nudgeSeen){ try{ unread=!!proactiveNudge(); }catch(e){ unread=false; } }
  fab.classList.toggle('has-unread', !!unread);
}
function msgHtml(m){
  if(m.role==='user') return '<div class="iu-mate-bubble user">'+esc(m.text)+'</div>';
  if(m.role==='typing') return '<div class="iu-mate-row-bot"><span class="mini">'+botAvatar()+'</span><div class="iu-mate-bubble bot"><span class="iu-mate-typing"><i></i><i></i><i></i></span></div></div>';
  if(m.role==='botText') return '<div class="iu-mate-row-bot"><span class="mini">'+botAvatar()+'</span><div class="iu-mate-bubble bot">'+esc(m.text)+'</div></div>';
  // bot reply object
  var rep=m.reply, idx=m.idx; var h='<div class="iu-mate-row-bot"><span class="mini">'+botAvatar()+'</span><div style="max-width:88%"><div class="iu-mate-card">';
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
  if(rep.placeSearch){
    h+='<div style="margin-top:4px">';
    if(rep.placeChips&&rep.placeChips.length){ h+='<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">'+rep.placeChips.map(function(pc){ return '<button class="iu-mate-chip" onclick="IUMate.placeFill(this.dataset.v)" data-v="'+esc(pc)+'">'+esc(pc)+'</button>'; }).join('')+'</div>'; }
    h+='<div style="display:flex;gap:6px"><input id="iuPlaceInput" value="'+esc(rep.placeQuery||'')+'" placeholder="'+esc(rep.placeHolder||'')+'" style="flex:1;min-width:0;padding:9px 11px;border:1px solid #d8e2f0;border-radius:10px;font-size:13px;outline:none" onkeydown="if(event.key===\'Enter\'){event.preventDefault();IUMate.openPlace();}"><button class="iu-mate-act primary" style="white-space:nowrap" onclick="IUMate.openPlace()">'+esc(L('เปิดแผนที่','Open map'))+'</button></div>';
    h+='</div>';
  }
  if(rep.actions&&rep.actions.length){ h+=_actionsHtml(rep,idx,m); }
  if(rep.disclaimer) h+='<div class="disc">'+esc(rep.disclaimer)+'</div>';
  h+='</div></div></div>';
  return h;
}
function _actionsHtml(rep,idx,m){
  var acts=rep.actions||[];
  var isFlowQ=acts.some(function(a){return a.action==='flow_pick'||a.action==='flow_other'||a.action==='flow_cancel';});
  if(isFlowQ && m && m.picked!==undefined){
    var picks=acts.filter(function(a){return a.action==='flow_pick';});
    var h='<div class="iu-mate-actions">', inList=false;
    picks.forEach(function(a){ var chosen=a.payload&&a.payload.v===m.picked; if(chosen)inList=true;
      h+='<span class="iu-mate-act" style="cursor:default;'+(chosen?'background:#eafaf0;border-color:#18b26b;color:#0f7a44;font-weight:700':'opacity:.4')+'">'+(chosen?'✓ ':'')+esc(a.label)+'</span>'; });
    if(!inList) h+='<span class="iu-mate-act" style="cursor:default;background:#eafaf0;border-color:#18b26b;color:#0f7a44;font-weight:700">✓ '+esc(''+m.picked)+'</span>';
    return h+'</div>';
  }
  return '<div class="iu-mate-actions">'+acts.map(function(a,ai){
    return '<button class="iu-mate-act'+(a.on?' sel':'')+'" onclick="IUMate.act(\''+a.action+'\','+idx+','+ai+')">'+(a.on?'✓ ':'')+esc(a.label)+'</button>';
  }).join('')+'</div>';
}
function _flowOtherPrompt(){ var slot=flowCurSlot(); if(!slot) return; pushBotText(L('พิมพ์คำตอบของคุณได้เลยครับ','Type your own answer below')); setTimeout(function(){ var inp=document.getElementById('iuMateInput'); if(inp){ try{ inp.focus(); }catch(e){} } },60); }
/* ============================ review (star rating on close, rare) ============================ */
var REVIEW_KEY='iufit_iu_mate_review';
function loadReview(){ try{ return JSON.parse(localStorage.getItem(REVIEW_KEY)||'{}')||{}; }catch(e){ return {}; } }
function saveReview(r){ try{ localStorage.setItem(REVIEW_KEY, JSON.stringify(r)); }catch(e){} }
function _reviewStars(n){ n=n||0; var h=''; for(var i=1;i<=5;i++){ h+='<button type="button" onclick="IUMate._rvSet('+i+')" style="background:none;border:none;cursor:pointer;font-size:30px;line-height:1;padding:0 2px;color:'+(i<=n?'#ffb400':'#d4dbe8')+'">'+(i<=n?'★':'☆')+'</button>'; } return h; }
function _reviewClose(){ var w=document.getElementById('iuMateReview'); if(w) w.remove(); }
function _reviewDismiss(){ var rv=loadReview(); rv.dismiss=(rv.dismiss||0)+1; rv.last=Date.now(); saveReview(rv); _reviewClose(); }
function _reviewSubmit(){
  var n=ST.rvStar||0; if(!n) return;
  var t=''; var ta=document.getElementById('iuRvText'); if(ta) t=(''+ta.value).slice(0,600);
  var rec={ rating:n, text:t, role:role(), lang:(EN()?'en':'th'), ts:Date.now(), dev:((window.S&&window.S.devId)||'') };
  try{ if(typeof fbPush==='function') fbPush('/reviews', rec).catch(function(){}); }catch(e){}
  try{ var arr=JSON.parse(localStorage.getItem('iufit_iu_mate_reviews')||'[]')||[]; arr.push(rec); if(arr.length>50)arr=arr.slice(-50); localStorage.setItem('iufit_iu_mate_reviews', JSON.stringify(arr)); }catch(e){}
  var rv=loadReview(); rv.done=true; rv.last=Date.now(); rv.rating=n; saveReview(rv);
  _reviewClose(); try{ appToast(L('ขอบคุณสำหรับรีวิว 🙏','Thanks for your review 🙏')); }catch(e){}
}
function _reviewOpen(){
  ST.rvStar=0;
  var w=document.createElement('div'); w.id='iuMateReview'; w.className='iu-mate-confirm-wrap';
  w.innerHTML='<div class="iu-mate-confirm" style="max-width:380px;width:100%;text-align:center;padding:20px 18px">'+
    '<div style="font-size:15px;font-weight:800;color:#1b2a4a;margin-bottom:4px">'+sparkInline()+esc(L('ให้คะแนน IU Mate','Rate IU Mate'))+'</div>'+
    '<div style="font-size:12.5px;color:#5a6b88;line-height:1.5;margin-bottom:12px">'+esc(L('ประสบการณ์ใช้ IU Mate ของคุณเป็นอย่างไรบ้าง? ช่วยรีวิวเพื่อการนำไปพัฒนา IU Mate ให้ดียิ่งขึ้น','How was your experience with IU Mate? Your review helps us improve it.'))+'</div>'+
    '<div id="iuRvStars" style="display:flex;justify-content:center;gap:4px;margin-bottom:12px">'+_reviewStars(0)+'</div>'+
    '<textarea id="iuRvText" rows="3" placeholder="'+esc(L('เขียนรีวิว (ไม่บังคับ)','Write a review (optional)'))+'" style="width:100%;box-sizing:border-box;border:1px solid #d8e2f0;border-radius:10px;padding:9px 11px;font-size:13px;font-family:inherit;resize:none;outline:none"></textarea>'+
    '<div style="font-size:10px;color:#9aa6bf;margin:7px 0 12px">'+esc(L('ส่งให้ทีม IUFIT เพื่อพัฒนา · ไม่รวมบทสนทนาของคุณ','Sent to the IUFIT team to improve · your chat is not included'))+'</div>'+
    '<button id="iuRvSend" class="go" style="width:100%;opacity:.5" disabled onclick="IUMate._rvSend()">'+esc(L('ส่งรีวิว','Send review'))+'</button>'+
    '<button type="button" onclick="IUMate._rvDismiss()" style="width:100%;margin-top:8px;background:none;border:none;color:#9aa6bf;font-size:12.5px;cursor:pointer;font-family:inherit">'+esc(L('ไว้ทีหลัง','Maybe later'))+'</button>'+
    '</div>';
  w.addEventListener('click',function(ev){ if(ev.target===w) _reviewDismiss(); });
  document.body.appendChild(w);
}
function _reviewMaybe(){
  try{
    if(!hasConsent()) return;
    if(ST.flow) return;
    if(document.getElementById('iuMateReview')) return;
    var rv=loadReview(); if(rv.optout) return;
    var now=Date.now(), DAY=86400000;
    var gap=rv.done?120*DAY:((rv.dismiss||0)>=3?60*DAY:14*DAY);
    if(rv.last && (now-rv.last)<gap) return;
    if(statCount('umsg')<5) return;
    if(Math.random()>0.25) return;
    _reviewOpen();
  }catch(e){}
}
function sparkInline(){ return '<span style="color:#0A84FF;width:16px;height:16px;display:inline-grid;place-items:center">'+sparkIcon()+'</span>'; }
function renderMessages(){
  try{ saveHist(); }catch(e){}
  var box=document.getElementById('iuMateMessages'); if(!box) return;
  box.innerHTML=ST.messages.map(msgHtml).join('');
  box.scrollTop=box.scrollHeight;
}
function setupSheetDrag(){
  var sheet=document.querySelector('.iu-mate-sheet'); if(!sheet) return;
  var startY=0,curY=0,dragging=false,raf=0;
  function applyDrag(){ raf=0; sheet.style.transform='translate3d(0,'+curY+'px,0)'; }
  sheet.addEventListener('touchstart',function(e){var t=e.target; if(!t.closest('.iu-mate-grab')&&!t.closest('.iu-mate-header')){dragging=false;return;} startY=e.touches[0].clientY; curY=0; dragging=true; sheet.style.transition='none'; sheet.style.willChange='transform';},{passive:true});
  sheet.addEventListener('touchmove',function(e){ if(!dragging) return; var dy=e.touches[0].clientY-startY; if(dy<0)dy=dy*0.35; curY=dy; if(!raf)raf=requestAnimationFrame(applyDrag); if(dy>4&&e.cancelable)e.preventDefault();},{passive:false});
  function end(e){ if(!dragging) return; dragging=false; if(raf){cancelAnimationFrame(raf);raf=0;} sheet.style.transition='transform .28s cubic-bezier(.16,1,.3,1)'; sheet.style.willChange=''; if(curY>110){ sheet.style.transform='translate3d(0,100%,0)'; setTimeout(function(){ try{IUMate.close();}catch(_e){} },210); } else { sheet.style.transform='translate3d(0,0,0)'; } if(curY>6&&e.cancelable)e.preventDefault(); }
  sheet.addEventListener('touchend',end,{passive:false});
  sheet.addEventListener('touchcancel',end,{passive:false});
}
function renderSheet(){
  var r=root(); var chips=quickChips();
  var noAnim=!!ST._skipAnim; ST._skipAnim=false; /* already-open sheet re-render: keep it fully open, no entry animation */
  r.innerHTML=
   '<div class="iu-mate-backdrop'+(noAnim?' no-anim':'')+'" onclick="IUMate.close()"></div>'+
   '<section class="iu-mate-sheet'+(ST.full?' full':'')+(noAnim?' no-anim':'')+'" role="dialog" aria-label="IU Mate">'+
     '<button type="button" class="iu-mate-grab" onclick="IUMate.close()" aria-label="'+L('ย่อหน้าต่าง','Minimize')+'" title="'+L('ย่อหน้าต่าง','Minimize')+'"></button>'+
     '<header class="iu-mate-header">'+
       '<button class="iu-mate-close" onclick="IUMate.close()" aria-label="close" title="'+L('ปิด','Close')+'">✕</button>'+
       '<div class="iu-mate-avatar">'+botAvatar()+'</div>'+
       '<div class="iu-mate-title"><strong>IU Mate</strong><small>'+esc(L('ผู้ช่วยส่วนตัวใน IUFIT','Your assistant in IUFIT'))+'</small></div>'+
       '<span class="iu-mate-local-badge">Local</span>'+
       '<button class="iu-mate-expand" onclick="IUMate.close()" aria-label="minimize" title="'+L('ย่อหน้าต่าง','Minimize')+'">⌄</button>'+'<button class="iu-mate-expand" onclick="IUMate.showPrivacy()" aria-label="privacy" title="privacy" style="margin-right:1px">🔒</button>'+'<button class="iu-mate-expand" onclick="IUMate.toggleFull()" aria-label="expand">'+(ST.full?'▢':'⤢')+'</button>'+
     '</header>'+
     '<div class="iu-mate-chip-row">'+chips.map(function(c){ return '<button class="iu-mate-chip" onclick="IUMate.chip(this.dataset.q)" data-q="'+esc(c[0])+'"><span class="e">'+c[1]+'</span>'+esc(c[0])+'</button>'; }).join('')+'</div>'+
     '<div class="iu-mate-messages" id="iuMateMessages"></div>'+
     '<form class="iu-mate-composer" onsubmit="return IUMate.sendFromForm(event)">'+
       '<input id="iuMateInput" placeholder="'+esc(L('ถาม IU Mate...','Ask IU Mate...'))+'" autocomplete="off" enterkeyhint="send">'+
       '<button class="iu-mate-send" type="submit" aria-label="send">'+sendIcon()+'</button>'+
     '</form>'+
     '<div class="iu-mate-privacy-note">'+esc(keepHist()?L('ทำงานในเครื่อง • ประวัติแชทเก็บในเครื่องนี้เท่านั้น ไม่ถูกส่งออก','On-device • chat history stays on this device only'):L('ทำงานในเครื่อง • บทสนทนาไม่ถูกบันทึกหรือส่งออกนอกเครื่อง','On-device • conversations are not saved or sent anywhere'))+'</div>'+
   '</section>';
  renderMessages(); try{ setupSheetDrag(); }catch(e){}
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
function _featTour(name){ ST.isOpen=false; closeNow(); try{ if(fn('iuFeatureTour')){ window.iuFeatureTour(name); } else if(fn('iuTour')){ window.iuTour(true); } }catch(e){} }
function _iuTourAt(sigTest){
  ST.isOpen=false; closeNow();
  if(!fn('iuTour')){ try{ if(fn('go')) window.go('today'); }catch(e){} return; }
  try{ window.iuTour(true); }catch(e){ return; }
  setTimeout(function(){ try{
    var arr=window._tourArr||[], idx=-1;
    for(var i=0;i<arr.length;i++){ if(sigTest(arr[i])){ idx=i; break; } }
    if(idx<0) return;
    if(typeof window._tourGo==='function'){ window._tourI=idx-1; window._tourGo(1); }
    else if(typeof window._tourRender==='function'){ window._tourI=idx; window._tourRender(); }
  }catch(e){} }, 80);
}
function _tsel(x){ return function(st){ return ((st&&st.sel)||'').indexOf(x)>-1; }; }
function _ttab(t){ return function(st){ return st&&st.tab===t; }; }
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
  go_settings:function(){ goTab('more'); },
  open_line_log:function(){ ST.isOpen=false; closeNow(); try{ if(fn('iuLineLogMenu')) window.iuLineLogMenu(); }catch(e){} },
  open_ai_setup:function(){ ST.isOpen=false; closeNow(); try{ if(fn('aiSetup')) window.aiSetup(); }catch(e){} },
  open_share:function(){ ST.isOpen=false; closeNow(); try{ if(fn('shareApp')) window.shareApp(); }catch(e){} },
  open_pricing:function(){ ST.isOpen=false; closeNow(); try{ if(fn('pricingPage')) window.pricingPage(); }catch(e){} },
  open_referral:function(){ ST.isOpen=false; closeNow(); try{ if(fn('referralPage')) window.referralPage(); }catch(e){} },
  open_tour:function(){ ST.isOpen=false; closeNow(); try{ if(fn('iuTour')) window.iuTour(true); }catch(e){} },
  tour_full:function(){ ST.isOpen=false; closeNow(); try{ if(fn('iuTour')) window.iuTour(true); }catch(e){} },
  tour_food_log:function(){ _featTour('food_log'); },
  tour_workout_log:function(){ _featTour('workout_log'); },
  tour_workout_plan:function(){ _featTour('workout_plan'); },
  tour_body_log:function(){ _featTour('body_log'); },
  tour_water:function(){ _featTour('water'); },
  tour_result_card:function(){ _featTour('result_card'); },
  tour_meal_plan:function(){ _featTour('meal_plan'); },
  tour_coach_full:function(){ ST.isOpen=false; closeNow(); try{ if(fn('iuTour')) window.iuTour(true); }catch(e){} },
  tour_coach_home:function(){ _featTour('coach_home'); },
  tour_coach_clients:function(){ _featTour('coach_clients'); },
  tour_coach_homework:function(){ _featTour('coach_homework'); },
  tour_coach_groups:function(){ _featTour('coach_groups'); },
  tour_coach_qr:function(){ _featTour('coach_qr'); },
  open_result_card:function(){ ST.isOpen=false; closeNow(); try{ if(fn('openResultCard')) window.openResultCard(); else if(fn('go')) window.go('body'); }catch(e){} },
  log_workout:function(){ ST.isOpen=false; closeNow(); try{ if(fn('exForm')) window.exForm(); else if(fn('go')) window.go('workout'); }catch(e){} },
  log_weight:function(){ ST.isOpen=false; closeNow(); try{ if(fn('bodyForm')) window.bodyForm(); else if(fn('go')) window.go('today'); }catch(e){} },
  draft_group_announcement:function(){ var tpl=L('สวัสดีทีม IUFIT ทุกคน สัปดาห์นี้มาลุยภารกิจกัน ใครบันทึกอาหารครบทุกวันสู้ ๆ มีอะไรให้โค้ชช่วยทักได้เลยนะครับ','Hi team! Lets make this week count. Log your meals daily and shout if you need anything.'); pushReply({ title:L('ร่างประกาศกลุ่ม','Group announcement'), message:tpl, disclaimer:L('ปรับข้อความให้เข้ากับกลุ่มก่อนส่ง','Edit before sending'), actions:[{label:L('คัดลอกข้อความ','Copy text'),action:'copy_text',payload:{text:tpl}},{label:L('เปิดกลุ่ม','Open groups'),action:'go_groups'}] }); },
  today_summary:function(){ pushReply(buildToday()); },
  food_recommend:function(){ pushReply(buildFoodRecommend('')); },
  recommend_library:function(){ pushReply(buildLibraryRecommend()); },
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
  coach_menu_redraft:function(p){ if(p&&p.id) pushReply(buildCoachDayMenu(findClientById(p.id))); },
  coach_workout_redraft:function(p){ if(p&&p.id) pushReply(buildCoachWorkout(findClientById(p.id), p.days, p.equip)); },
  coach_wplan_pick:function(){ var lc=window._LAST_COACH_WPLAN; if(!lc||!(lc.struct&&lc.struct.length)){ appToast(L('ยังไม่มีแผนให้ใส่','No plan yet')); return; } var chips=[]; try{ var cs=(typeof clientChoices==='function')?clientChoices():[]; (cs||[]).forEach(function(c){ chips.push({label:c[0],action:'coach_wplan_do',payload:{id:c[1]}}); }); }catch(x){} if(!chips.length&&lc.cid){ chips.push({label:(lc.name||L('ลูกเทรน','client')),action:'coach_wplan_do',payload:{id:lc.cid}}); } chips.push({label:L('ยกเลิก','Cancel'),action:'noop'}); pushReply({ title:L('ใส่แผนลงตารางลูกเทรนคนไหน?','Add plan to which client?'), message:L('เลือกลูกเทรนที่จะใส่แผนนี้ลงตารางฝึก · ระบบจะแทนที่ตารางเดิมของคนนั้น (เข้าไปปรับต่อได้ในหน้าลูกเทรน)','Pick a client — this replaces their current schedule (you can edit it in their page).'), actions:chips }); },
  coach_wplan_do:function(p){ var lc=window._LAST_COACH_WPLAN; var cid=p&&p.id; if(!lc||!cid){ appToast(L('ไม่สำเร็จ','Failed')); return; } try{ var Sx=window.S; Sx.wplan=Sx.wplan||{}; var day={}; lc.struct.forEach(function(d){ var arr=[]; d.moves.forEach(function(m){ arr.push({n:m.n,eq:m.eq,s:'-×10×3'}); }); day[d.wd]=arr; }); Sx.wplan[cid]=day; if(fn('save')) window.save(); }catch(x){ appToast(L('บันทึกไม่สำเร็จ','Could not save')); return; } var nm=''; try{ var cu=(window.S.users||[]).filter(function(u){return u.id===cid;})[0]; nm=(cu&&cu.name)||''; }catch(x){} appToast(L('ใส่ลงตาราง '+nm+' แล้ว 📅','Added to '+nm+' 📅')); pushReply({ title:L('ใส่ลงตารางแล้ว ✓','Added to schedule ✓'), message:L('ใส่แผนลงตารางของ '+nm+' เรียบร้อย · จะส่งให้ลูกเทรนเลย หรือเข้าไปปรับก่อนก็ได้ครับ','Added to '+nm+"'s schedule. Send it now, or edit first in their page."), actions:[{label:L('📤 ส่งให้ลูกเทรนเลย','📤 Send to client'),action:'coach_wplan_send',payload:{id:cid}},{label:L('เปิดหน้าลูกเทรน','Open client'),action:'go_clients'}] }); },
  coach_wplan_send:function(p){ var cid=p&&p.id; if(cid&&fn('sendClientPlan')){ try{ window.sendClientPlan(cid); }catch(x){ appToast(L('ส่งไม่สำเร็จ','Send failed')); } } },
  noop:function(){},
  find_trainer:function(){ try{ goTab('coachview'); }catch(e){} },
  workout_redraft:function(){ try{ startFlow('workout'); }catch(e){} },
  wplan_save:function(p){ try{ var u=(fn('curUser')?window.curUser():null); var Sx=window.S; var _st=(p&&p.struct)||(_LAST_WPLAN&&_LAST_WPLAN.struct); if(!u||!Sx||!(_st&&_st.length)){ appToast(L('ไม่มีแผนให้บันทึก','No plan to save')); return; } Sx.wplan=Sx.wplan||{}; Sx.wplan[u.id]=Sx.wplan[u.id]||{}; _st.forEach(function(d){ var arr=[]; d.moves.forEach(function(m){ arr.push({n:m.n,eq:m.eq,s:'-×10×3'}); }); Sx.wplan[u.id][d.wd]=arr; }); if(fn('save')) window.save(); appToast(L('บันทึกลงตารางฝึกแล้ว 📅','Saved to your schedule 📅')); ST.isOpen=false; closeNow(); try{ goTab('workout'); }catch(e){} }catch(e){ appToast(L('บันทึกไม่สำเร็จ','Could not save')); } },
  flow_multi:function(p){ if(!ST.flow)return; ST.flow._msel=ST.flow._msel||{}; var k=(p&&p.v); if(k==null)return; if(ST.flow._msel[k])delete ST.flow._msel[k]; else ST.flow._msel[k]=1; var m=ST.messages[ST.flow.askIdx]; if(m&&m.reply){ m.reply.actions=_wdayMultiActions(); try{renderMessages();}catch(e){} } },
  flow_multi_done:function(){ if(!ST.flow)return; var sel=Object.keys(ST.flow._msel||{}).map(Number).sort(function(a,b){return a-b;}); if(!sel.length){ appToast(L('เลือกวันอย่างน้อย 1 วัน หรือกด “ให้จัดวันให้”','Pick at least 1 day, or tap “Arrange for me”')); return; } ST.flow._msel=null; var slot=flowCurSlot(); if(!slot)return; var ab=_wdayAbbr(); var lbl=sel.map(function(i){var f=ab.filter(function(c){return c[1]===i;})[0];return f?f[0]:(''+i);}).join(' '); if(ST.flow.askIdx!=null&&ST.messages[ST.flow.askIdx]){ ST.messages[ST.flow.askIdx].picked=lbl; try{renderMessages();}catch(e){} } ST.flow.slots[slot.key]=sel; ST.flow.askIdx=null; flowNext(); },
  flow_pick:function(p){ if(p&&p.v!=null) flowAnswer(p.v); },
  flow_other:function(){ _flowOtherPrompt(); },
  flow_cancel:function(){ cancelFlow(); },
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
    '<div class="iu-mate-ing-list">'+ (list.length?list.map(function(i){ return '<div class="iu-mate-ing-item'+(selIds[i.id]?' on':'')+'" onclick="IUMate._ptoggle(\''+i.id+'\')"><span class="cb">'+(selIds[i.id]?checkIcon():'')+'</span><span class="nm">'+esc(tFoodName(i.name))+'</span><span class="kc">'+i.kcal+' kcal/100g</span></div>'; }).join('') : '<div class="sub">'+esc(L('ไม่พบวัตถุดิบ','No ingredient found'))+'</div>'+(_iuHasAI()?'':'<div class="sub" style="margin-top:6px">'+esc(L('ไม่มีในคลัง? เปิด AI ช่วยสร้างเมนูจากของนอกคลังได้ ','Not in the library? Enable AI to build menus from other items '))+'<a onclick="IUMate.act(\'open_ai_setup\',-1,-1)" style="color:#0a84ff;font-weight:800;cursor:pointer">'+esc(L('เปิด AI','Enable AI'))+'</a></div>')) +'</div>'+
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
    swapsBlock(rc)+'<div class="iu-mate-fit">'+esc(L('เหมาะกับ','Good for'))+': '+esc((rc.tags||[]).join(' · '))+'</div>'+
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
/* ============================ multi-turn context / follow-up resolution ============================ */
function macroFollowup(key){
  var tg=null; try{ tg=window.target?window.target():null; }catch(e){}
  if(!tg) return null;
  var map={protein:['prot','โปรตีน','Protein','g'],fat:['fat','ไขมัน','Fat','g'],carb:['carb','คาร์บ','Carbs','g'],fiber:['fib','ใยอาหาร','Fiber','g'],kcal:['kcal','แคลอรี','Calories','kcal']};
  var m=map[key]; var v=tg[m[0]]; if(v==null) return null;
  return { title:L(m[1]+'เป้าหมาย',m[2]+' target'), message:L('เป้าหมาย'+m[1]+'ของคุณคือประมาณ '+Math.round(v)+' '+m[3]+' ต่อวันครับ','Your '+m[2].toLowerCase()+' target is about '+Math.round(v)+' '+m[3]+'/day.') };
}
function resolveFollowup(message){
  if(!ST.ctx) return null;
  var t=synNorm(message); var raw=(''+message).trim(); var shortMsg=raw.length<=20;
  var follow=/แล้ว|ล่ะ|ละ|เท่าไห|เท่าไร|กี่|then|howabout|whatabout|instead/.test(t);
  var recentMacro=['calc_plan','make_plan','today_summary','food_recommend'].indexOf(ST.ctx.intent)>=0;
  // a) macro ellipsis: "แล้วโปรตีนล่ะ"
  if((follow||shortMsg) && (recentMacro||ST.ctx.macro)){
    var mm=[['โปรตีน','protein'],['ไขมัน','fat'],['คาร์โบ','carb'],['คาร์บ','carb'],['ใยอาหาร','fiber'],['ไฟเบอร์','fiber'],['แคล','kcal'],['พลังงาน','kcal']];
    for(var i=0;i<mm.length;i++){ if(t.indexOf(mm[i][0])>=0){ var r=macroFollowup(mm[i][1]); if(r){ ST.ctx.macro=true; return r; } } }
  }
  // b) cuisine switch: "แล้วจีนล่ะ"
  if((ST.ctx.intent==='cuisine_menu'||ST.ctx.lastCuisine) && (follow||shortMsg) && /ญี่ปุ่น|japan|จีน|china|chinese|ฝรั่ง|ตะวันตก|western|สะดวก|7-11|เซเว่น|conven/.test(t)){
    return buildCuisineMenu(message);
  }
  // d) entity-only follow-up after a workout plan: "เพิ่มอีกวัน", "เปลี่ยนเป็น 4 วัน", "แบบ ppl", "ไม่มีอุปกรณ์"
  if(ST.ctx.intent==='workout_plan' && ST.ctx.entities && !/กิน|อาหาร|เมนู|มื้อ|แคล|โปรตีน|eat|food|menu|meal|kcal/.test(t)){
    try{
      var _ne=extractEntities(message);
      var _addDay=/เพิ่ม.{0,4}วัน|อีกวัน|เพิ่มวัน|more day|one more day/.test(t);
      var _hasW=!!(_ne.days||_ne.split||_ne.equip||(_ne.wdays&&_ne.wdays.length));
      if(_hasW||_addDay){
        var _old=ST.ctx.entities||{}, _seed={}, _k;
        for(_k in _old) _seed[_k]=_old[_k];
        for(_k in _ne){ var _v=_ne[_k]; if(_v!=null && !(Object.prototype.toString.call(_v)==='[object Array]' && !_v.length)) _seed[_k]=_v; }
        if(_addDay && !_ne.days) _seed.days=Math.min(6,(+_old.days||3)+1);
        startFlow('workout', _entsToWorkoutSeed(_seed));
        return {_handled:true};
      }
    }catch(e){}
  }
  // c) "more / another" — broadened phrases (menu + workout)
  var moreRe=/อีก|เพิ่มเติม|เพิ่ม|อื่น|อย่างอื่น|ตัวเลือก|ไม่ถูกใจ|ไม่ชอบ|ไม่เอา|เปลี่ยน|ขอใหม่|มีอะไรอีก|more|another|other|next|different|else|not this/;
  if(['food_recommend','cuisine_menu','budget_menu','recommend_library','ingredient_recipe_generate'].indexOf(ST.ctx.intent)>=0 && (shortMsg||follow) && moreRe.test(t)){
    return buildLibraryRecommend();
  }
  if(['workout_plan','workout_recommend','coach_workout'].indexOf(ST.ctx.intent)>=0 && (shortMsg||follow) && moreRe.test(t)){
    try{ return buildWorkoutPlan(message); }catch(e){ return null; }
  }
  return null;
}
/* ============================ proactive nudges (on open) ============================ */
function proactiveNudge(){
  try{
    if(role()==='coach'){
      var cc=coachCtx(); if(cc.denied) return null;
      var risk=(cc.follow||[]).filter(function(f){return f.daysAgo!=null&&f.daysAgo>=3;});
      if(risk.length) return { title:L('มีลูกเทรนที่ควรติดตาม','Clients to check on'),
        message:L('มี '+risk.length+' คนที่เงียบไป 3 วันขึ้นไป อยากให้ผมสรุปและช่วยร่างข้อความติดตามไหมครับ?','There are '+risk.length+' client(s) quiet for 3+ days — want me to summarize and draft a follow-up?'),
        actions:[{label:L('ดูใครบ้าง','See who'),action:'_chip',payload:{q:L('คนที่ต้องติดตาม','who to follow up')}}] };
      return null;
    }
    var c=todayCtx(); if(c.empty) return null; var hr=new Date().getHours();
    if(c.mealsLogged===0 && hr>=11) return { title:L('ยังไม่ได้บันทึกมื้อวันนี้','No meals logged yet'),
      message:L('วันนี้ยังไม่ได้บันทึกมื้อไหนเลย เริ่มมื้อแรกหรือให้ผมแนะนำเมนูดีไหมครับ?','You haven\'t logged any meal today — start your first meal or want a menu idea?'),
      actions:[{label:L('แนะนำเมนู','Suggest a menu'),action:'recommend_library'},{label:L('บันทึกอาหาร','Log food'),action:'go_food'}] };
    if(c.targetProtein && c.eatenProtein < c.targetProtein*0.5 && c.mealsLogged>=1 && hr>=15) return { title:L('โปรตีนวันนี้ยังน้อย','Protein looks low today'),
      message:L('ตอนนี้โปรตีน '+c.eatenProtein+'/'+Math.round(c.targetProtein)+' g อยากได้เมนูโปรตีนสูงเสริมไหมครับ?','Protein is '+c.eatenProtein+'/'+Math.round(c.targetProtein)+' g so far — want a high-protein menu?'),
      actions:[{label:L('เมนูโปรตีนสูง','High-protein menu'),action:'recommend_library'}] };
    if(c.remaining>0 && c.mealsLogged>=2) return { title:L('เช็กอินสั้น ๆ','Quick check-in'),
      message:L('เหลืออีกประมาณ '+fmtN(c.remaining)+' kcal วันนี้ ทำได้ดีมากครับ 👍','About '+fmtN(c.remaining)+' kcal left today — nice work 👍'),
      actions:[{label:L('ดูสรุปเต็ม','Full summary'),action:'today_summary'}] };
    return null;
  }catch(e){ return null; }
}
/* ============================ multi-turn slot-filling flows ============================ */
/* ---- coach drafting tool: full-day menu for a selected trainee (helps coach, coach edits & sends) ---- */
function coachClientsList(){ return (S().users||[]).filter(function(u){ return u.tr && !u.removedAt; }); }
function findClientById(id){ var cs=coachClientsList(); for(var i=0;i<cs.length;i++){ if(cs[i].id===id) return cs[i]; } return null; }
function clientChoices(){ return coachClientsList().slice(0,8).map(function(c){ return [c.name||L('ลูกเทรน','Client'), c.id]; }); }
function goalLabelOf(g){ if(g==='lose') return 'ลดไขมัน'; if(g==='gain') return 'เพิ่มกล้าม'; return 'สุขภาพทั่วไป'; }
function latestClientW(c){ try{ var a=analyzeClient(c); return a.latestW || c.w0 || c.w || null; }catch(e){ return c.w0||c.w||null; } }
function clientTarget(c){
  var w=latestClientW(c), h=c.h||null, sex=c.sex||'m', age=ageOf(c), act=c.act||1.375, goal=c.goal||'lose', kcal;
  if(w&&h){ var tdee=CALC.bmr(sex,w,h,age)*act; kcal= goal==='lose'?tdee-400 : goal==='gain'?tdee+300 : tdee; }
  else { kcal= goal==='lose'?1500 : goal==='gain'?2200 : 1800; }
  kcal=Math.round(kcal/10)*10;
  var prot = w?Math.round(w*1.8):Math.round(kcal*0.3/4);
  return { kcal:kcal, prot:prot, goal:goal, goalLab:goalLabelOf(goal), w:w, h:h, partial:!(w&&h) };
}
function pickMealMenu(kcalTarget, mealName, goalLab, used){
  var list=menuList().filter(function(m){ return !used[m.id] && m.mealFit && m.mealFit.indexOf(mealName)>=0; });
  if(!list.length) list=menuList().filter(function(m){ return !used[m.id]; });
  list.forEach(function(m){ var sc=0; sc-=Math.abs(m.nutrition.kcal-kcalTarget)/50; if(m.goalFit&&m.goalFit.indexOf(goalLab)>=0) sc+=3; if(m.nutrition.protein>=20) sc+=1; sc+=Math.random()*0.8; m._ms=sc; });
  list.sort(function(a,b){ return b._ms-a._ms; });
  var p=list[0]; if(p) used[p.id]=1; return p;
}
function mealEmoji(m){ return m==='เช้า'?'🌅':m==='กลางวัน'?'☀️':m==='เย็น'?'🌙':'🍎'; }
function buildCoachDayMenu(c){
  if(!consentCoach()) return coachDeniedReply();
  if(!c) return { title:L('เลือกลูกเทรนก่อน','Pick a client first'), message:L('ยังไม่พบลูกเทรน','Client not found') };
  if(!ingDbOk()) return cantCalcReply();
  var tg=clientTarget(c);
  var splits=[['เช้า',0.25],['กลางวัน',0.35],['เย็น',0.30],['ว่าง',0.10]];
  var used={}, picks=[], tot={kcal:0,protein:0};
  splits.forEach(function(sp){ var p=pickMealMenu(tg.kcal*sp[1], sp[0], tg.goalLab, used); if(p){ picks.push({meal:sp[0],m:p}); tot.kcal+=p.nutrition.kcal; tot.protein+=p.nutrition.protein; } });
  var mealEN={'เช้า':'Breakfast','กลางวัน':'Lunch','เย็น':'Dinner','ว่าง':'Snack'};
  var lines=picks.map(function(x){ return mealEmoji(x.meal)+' '+L(x.meal,mealEN[x.meal])+': '+tFoodName(x.m.name)+' ('+x.m.nutrition.kcal+' kcal · P'+x.m.nutrition.protein+')'; });
  var head=L('แผนเมนู 1 วัน — '+(c.name||'ลูกเทรน'),'1-day menu — '+(c.name||'client'));
  var tline=L('เป้า ~'+tg.kcal+' kcal/วัน · โปรตีน ~'+tg.prot+' g ('+tg.goalLab+')','Target ~'+tg.kcal+' kcal/day · protein ~'+tg.prot+' g');
  var sumline=L('รวม ~'+Math.round(tot.kcal)+' kcal · โปรตีน ~'+Math.round(tot.protein)+' g','Total ~'+Math.round(tot.kcal)+' kcal · protein ~'+Math.round(tot.protein)+' g');
  var msg=tline+'\n\n'+lines.join('\n')+'\n\n'+sumline;
  var copyText=head+'\n'+msg;
  ST.ctx={intent:'coach_menu', clientId:c.id};
  return { title:head, message:msg,
    disclaimer: tg.partial ? L('ข้อมูลลูกเทรนไม่ครบ ใช้ค่าประมาณ — โค้ชปรับก่อนส่งได้','Client profile incomplete — estimates; adjust before sending')
                           : L('ค่าประมาณเพื่อช่วยร่าง โค้ชตรวจ/แก้ก่อนส่งให้ลูกเทรนได้','Estimates to help you draft — review/edit before sending'),
    actions:[
      {label:L('🔄 ร่างใหม่','🔄 Redraft'),action:'coach_menu_redraft',payload:{id:c.id}},
      {label:L('📋 คัดลอกเป็นข้อความ','📋 Copy as text'),action:'copy_text',payload:{text:copyText}},
      {label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}
    ] };
}
function startCoachMenu(){
  if(!consentCoach()) return pushReply(coachDeniedReply());
  var cs=coachClientsList();
  if(!cs.length) return pushReply({ title:L('ยังไม่มีลูกเทรน','No clients yet'), message:L('ยังไม่มีลูกเทรน แชร์ QR โค้ชให้สแกนเข้ามาก่อนนะครับ','No clients yet — share your Coach QR.'), actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] });
  if(cs.length===1) return pushReply(buildCoachDayMenu(cs[0]));
  startFlow('coach_menu');
}
/* ---- coach drafting tool: workout program from built-in WORKOUTS (+ user S.moves) ---- */
function enToThMove(){ var EN=window.IUFIT_EN||{}, m={}; for(var k in EN){ if(typeof EN[k]==='string') m[norm(EN[k])]=k; } return m; }
function moveCatalog(){
  var W=window.IUFIT_WORKOUTS||[], e2t=enToThMove(), out=[];
  W.forEach(function(g){ var gn=g[0]||''; (g[1]||[]).forEach(function(mv){ if(!mv||!mv[0]) return; var en=mv[0], eq=mv[1]||'บอดี้เวท'; out.push({ nameTh:e2t[norm(en)]||en, nameEn:en, group:gn, eq:eq, cardio:/คาร์ดิโอ/.test(gn), source:'lib' }); }); });
  try{ (S().moves||[]).forEach(function(u){ if(u&&u.n) out.push({ nameTh:u.n, nameEn:u.n, group:u.cat||'', eq:u.eq||'บอดี้เวท', cardio:/คาร์ดิโอ/.test(u.cat||''), source:'custom' }); }); }catch(e){}
  return out;
}
function groupMatch(g, key){ return (g||'').indexOf(key)>=0; }
function shuffleArr(a){ a=a.slice(); for(var i=a.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=a[i];a[i]=a[j];a[j]=t; } return a; }
function movesForGroup(key, equip, used){
  var _p=shuffleArr(moveCatalog().filter(function(m){
    if(!groupMatch(m.group,key)) return false;
    if(equip==='home' && !(m.eq==='บอดี้เวท'||m.eq==='ยางยืด')) return false;
    if(used[m.nameEn]) return false; return true;
  }));
  if(equip==='gym'&&typeof _eqRank==='function')_p.sort(function(a,b){return _eqRank(b.eq,'gym')-_eqRank(a.eq,'gym');});
  return _p;
}
var DAYTMPL={ push:[['อก',2],['ไหล่',1],['แขน',1]], pull:[['หลัง',2],['แขน',1]], legs:[['ขา',3],['ท้อง',1]],
  upper:[['อก',1],['หลัง',1],['ไหล่',1],['แขน',1]], lower:[['ขา',2],['ท้อง',2]], full:[['ขา',1],['อก',1],['หลัง',1],['ท้อง',1]] };
var SPLITS={ 3:[['Push','push'],['Pull','pull'],['Legs','legs']],
  4:[['Upper A','upper'],['Lower A','lower'],['Upper B','upper'],['Lower B','lower']],
  5:[['Push','push'],['Pull','pull'],['Legs','legs'],['Upper','upper'],['Lower','lower']] };
function setsReps(goal, cardio){
  if(cardio) return goal==='lose'?L('15–20 นาที','15–20 min'):L('10–15 นาที','10–15 min');
  if(goal==='lose') return L('3 เซ็ต × 12–15','3 sets × 12–15');
  if(goal==='gain') return L('4 เซ็ต × 8–12','4 sets × 8–12');
  return L('3 เซ็ต × 10–12','3 sets × 10–12');
}
function buildCoachWorkout(c, days, equip){
  if(!consentCoach()) return coachDeniedReply();
  if(!c) return { title:L('ไม่พบลูกเทรน','Client not found'), message:L('ลองเลือกใหม่','Try again') };
  if(!(window.IUFIT_WORKOUTS&&window.IUFIT_WORKOUTS.length)) return { title:L('คลังท่ายังไม่พร้อม','Move library not ready'), message:L('ลองรีเฟรชแอปแล้วเปิด IU Mate อีกครั้งครับ','Please refresh the app and reopen IU Mate.') };
  days=days||3; equip=equip||'gym'; var goal=c.goal||'lose'; var en=(window.LANG==='en');
  var _cq=wplanQuota(); if(!_cq.ok) return wplanQuotaReply(_cq);
  var split=SPLITS[days]||SPLITS[3], dayTexts=[], _cwd=((typeof _defaultWdays==='function')?_defaultWdays(days):[0,2,4,1,3,5,6].slice(0,days)), _cstruct=[];
  split.forEach(function(d, di){
    var used={}, tmpl=DAYTMPL[d[1]]||DAYTMPL.full, moves=[];
    tmpl.forEach(function(gp){ var pool=movesForGroup(gp[0], equip, used); for(var k=0;k<gp[1]&&k<pool.length;k++){ used[pool[k].nameEn]=1; moves.push(pool[k]); } });
    if(goal==='lose'){ var cp=movesForGroup('คาร์ดิโอ', equip, used); if(cp[0]){ used[cp[0].nameEn]=1; moves.push(cp[0]); } }
    var lines=moves.map(function(mv){ return '• '+mv.nameEn+' — '+setsReps(goal,mv.cardio)+(mv.source==='custom'?' ⭐':''); });
    dayTexts.push('🗓️ '+L('วันที่ '+(di+1),'Day '+(di+1))+' — '+d[0]+'\n'+(lines.join('\n')||L('(ไม่มีท่าที่ตรงอุปกรณ์)','(no matching moves)')));
    _cstruct.push({wd:(_cwd[di]!=null?_cwd[di]:di),moves:moves.map(function(mv){return {n:(mv.nameTh||mv.nameEn),eq:mv.eq||'บอดี้เวท'};})});
  });
  try{ window._LAST_COACH_WPLAN={cid:c.id,name:c.name,struct:_cstruct}; }catch(_e){}
  var head=L('โปรแกรมฝึก '+days+' วัน/สัปดาห์ — '+(c.name||'ลูกเทรน'), days+'-day/week program — '+(c.name||'client'));
  var goalLine=L('เป้า: '+goalLabelOf(goal)+' · อุปกรณ์: '+(equip==='home'?'บอดี้เวท (ที่บ้าน)':'ยิม/อุปกรณ์ครบ'),'Goal: '+_goalEn(goalLabelOf(goal))+' · Equipment: '+(equip==='home'?'Bodyweight (home)':'Full gym'));
  var _cNote='';
  try{ var _cad=_wAdapt(c.id); if(_cad&&_cad.hasData)_cNote=_wAdaptText(_cad,(goal==='lose'?'fat_loss':goal==='gain'?'muscle_gain':'general_fitness'),true,c.name,false); }catch(eC){ _cNote=''; }
  var body=(_cNote?_cNote+'\n\n———\n\n':'')+goalLine+'\n\n'+dayTexts.join('\n\n');
  wplanQuotaUse(); var _cq2=wplanQuota(); var _cqL=_cq2.unlimited?'':L(' · เหลือโควต้า '+Math.max(0,_cq2.lim-_cq2.n)+'/'+_cq2.lim+' ครั้ง',' · quota '+Math.max(0,_cq2.lim-_cq2.n)+'/'+_cq2.lim+' left');
  ST.ctx={intent:'coach_workout', clientId:c.id, days:days, equip:equip};
  return { title:head, message:body,
    disclaimer:L('ค่าประมาณเพื่อช่วยร่าง โค้ชปรับท่า/เซ็ต/น้ำหนักก่อนส่งได้ · ⭐ = ท่าที่เพิ่มเอง','Estimates to help you draft — adjust moves/sets/load before sending · ⭐ = your custom move')+_cqL,
    actions:[
      {label:L('🔄 ร่างใหม่','🔄 Redraft'),action:'coach_workout_redraft',payload:{id:c.id,days:days,equip:equip}},
      {label:L('📅 ใส่ลงตารางลูกเทรน','📅 Add to client schedule'),action:'coach_wplan_pick'},
      {label:L('เปิดท่าฝึก','Open Workout'),action:'go_workout'}
    ] };
}
function startCoachWorkout(){
  if(!consentCoach()) return pushReply(coachDeniedReply());
  var cs=coachClientsList();
  if(!cs.length) return pushReply({ title:L('ยังไม่มีลูกเทรน','No clients yet'), message:L('ยังไม่มีลูกเทรน แชร์ QR โค้ชให้สแกนเข้ามาก่อนนะครับ','No clients yet — share your Coach QR.'), actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] });
  startFlow('coach_workout', cs.length===1?{client:cs[0].id}:null);
}
var FLOWS = {
  menu: {
    intro: L('ได้เลยครับ ขอถามสั้น ๆ เพื่อเลือกเมนูให้ตรงใจ (แตะตอบได้เลย)','Sure — quick questions to find the right menus (tap to answer)'),
    slots: [
      { key:'meal', type:'choice', q:L('มื้อไหนดีครับ?','Which meal?'), choices:[[L('มื้อเช้า','Breakfast'),'เช้า'],[L('มื้อกลางวัน','Lunch'),'กลางวัน'],[L('มื้อเย็น','Dinner'),'เย็น'],[L('ของว่าง','Snack'),'ของว่าง']], other:true },
      { key:'goal', type:'choice', q:L('เป้าหมายของมื้อนี้?','Goal for this meal?'), choices:[[L('ลดไขมัน / แคลต่ำ','Fat loss / low-cal'),'ลดไขมัน'],[L('เพิ่มกล้าม / โปรตีนสูง','Muscle / high-protein'),'เพิ่มกล้าม'],[L('สุขภาพทั่วไป','General'),'สุขภาพทั่วไป']], other:true }
    ],
    complete: function(sl){ try{ return buildLibraryRecommend({meal:sl.meal,goal:sl.goal}); }catch(e){ return null; } }
  },
  workout: {
    intro: L('โอเคครับ ขอถามสั้น ๆ เพื่อจัดตารางให้ตรงกับคุณ (แตะปุ่มตอบได้เลย)','Sure — a few quick questions to tailor your plan (tap to answer)'),
    slots: [
      { key:'goal', type:'choice', q:L('เป้าหมายหลักคืออะไรครับ?','What is your main goal?'), choices:[[L('ลดไขมัน','Fat loss'),'fat_loss'],[L('เพิ่มกล้าม','Build muscle'),'muscle_gain'],[L('สุขภาพ/ฟิตทั่วไป','General fitness'),'general_fitness']], other:true },
      { key:'days', type:'choice', q:L('อยากฝึกกี่วันต่อสัปดาห์?','How many days per week?'), choices:[[L('2 วัน','2 days'),2],[L('3 วัน','3 days'),3],[L('4 วัน','4 days'),4],[L('5 วัน','5 days'),5]], other:true },
      { key:'split', type:'choice', q:L('อยากได้รูปแบบแบ่งวันแบบไหนครับ?','Which split would you like?'), choices:[[L('ให้ IU MATE เลือกให้เหมาะ','Let IU MATE choose'),'auto'],[L('Full Body (เล่นทั้งตัว)','Full Body'),'full'],[L('Upper / Lower (บน-ล่าง)','Upper / Lower'),'ul'],[L('Push / Pull / Legs','Push / Pull / Legs'),'ppl']] },
      { key:'wdays', type:'choice', multi:true, q:L('สะดวกฝึกวันไหนบ้างครับ? แตะเลือกได้หลายวัน','Which days can you train? Tap to pick several') },
      { key:'equip', type:'choice', q:L('มีอุปกรณ์แบบไหนครับ?','What equipment do you have?'), choices:[[L('ไม่มี / บอดี้เวท','None / bodyweight'),'none'],[L('ดัมเบล','Dumbbell'),'dumbbell'],[L('ฟิตเนส / ยิม','Full gym'),'full_gym']], other:true }
    ],
    complete: function(sl){ var days=(+sl.days||3); var split=(['full','ul','ppl'].indexOf(sl.split)>=0?sl.split:_autoSplit(days)); var inp={goal:(['fat_loss','muscle_gain','general_fitness'].indexOf(sl.goal)>=0?sl.goal:'general_fitness'),level:'beginner',daysPerWeek:days,sessionDurationMinutes:30,split:split,wdays:(sl.wdays&&sl.wdays!=='auto'?_parseWdays(sl.wdays,days):'auto'),equipment:(sl.equip==='none'?['none','bodyweight']:(['dumbbell','full_gym','bodyweight'].indexOf(sl.equip)>=0?[sl.equip]:['bodyweight'].concat(sl.equip?[sl.equip]:[])))}; try{return buildWorkoutPlan('',inp,'none');}catch(e){return null;} }
  },
  plan: {
    intro: L('โอเคครับ ขอถามนิดหน่อยเพื่อจัดให้พอดีตัวคุณ (ตอบสั้น ๆ ได้เลย)','Sure — a few quick questions to tailor this for you'),
    slots: [
      { key:'sex', type:'choice', q:L('คุณเป็นเพศอะไรครับ?','What is your sex?'), choices:[[L('ชาย','Male'),'m'],[L('หญิง','Female'),'f']] },
      { key:'age', type:'num', min:10, max:100, q:L('อายุเท่าไหร่ครับ? (ปี)','How old are you? (years)') },
      { key:'h', type:'num', min:120, max:220, q:L('ส่วนสูงกี่เซนติเมตรครับ?','Height in cm?') },
      { key:'w', type:'num', min:30, max:250, q:L('น้ำหนักปัจจุบันกี่กิโลครับ?','Current weight in kg?') },
      { key:'goal', type:'choice', q:L('เป้าหมายหลักคืออะไรครับ?','Main goal?'), choices:[[L('ลดไขมัน','Fat loss'),'lose'],[L('เพิ่มกล้าม','Muscle'),'gain'],[L('รักษาน้ำหนัก','Maintain'),'keep']] },
      { key:'act', type:'choice', q:L('ออกกำลังบ่อยแค่ไหนครับ?','How active are you?'), choices:[[L('แทบไม่','Sedentary'),1.2],[L('เบา 1-3 วัน','Light'),1.375],[L('ปานกลาง 3-5 วัน','Moderate'),1.55],[L('หนัก 6-7 วัน','Hard'),1.725]] }
    ],
    prefill: function(sl){ if(role()==='coach') return; try{ var u=curUser()||{}; if(sl.sex==null&&u.sex)sl.sex=u.sex; if(sl.h==null&&u.h)sl.h=u.h; if(sl.w==null){ var w=fn('curW')?window.curW(u):u.w0; if(w)sl.w=w; } if(sl.age==null){ var a=ageOf(u); if(a)sl.age=a; } if(sl.act==null&&u.act)sl.act=u.act; if(sl.goal==null&&u.goal)sl.goal=u.goal; }catch(e){} },
    complete: function(sl){ return planFlowResult(sl); }
  },
  coach_menu: {
    intro: L('จะร่างเมนูทั้งวันให้ลูกเทรนคนไหนดีครับ?','Which client should I draft a full-day menu for?'),
    slots: [ { key:'client', type:'choice', q:L('เลือกลูกเทรน','Pick a client'), choicesFn:clientChoices } ],
    complete: function(sl){ return buildCoachDayMenu(findClientById(sl.client)); }
  },
  coach_workout: {
    intro: L('จะร่างโปรแกรมฝึกให้ลูกเทรนคนไหนดีครับ?','Which client should I draft a workout program for?'),
    slots: [
      { key:'client', type:'choice', q:L('เลือกลูกเทรน','Pick a client'), choicesFn:clientChoices },
      { key:'days', type:'choice', q:L('ฝึกกี่วันต่อสัปดาห์?','How many days per week?'), choices:[[L('3 วัน','3 days'),3],[L('4 วัน','4 days'),4],[L('5 วัน','5 days'),5]], other:true },
      { key:'equip', type:'choice', q:L('ใช้อุปกรณ์แบบไหน?','What equipment?'), choices:[[L('บอดี้เวท (ที่บ้าน)','Bodyweight (home)'),'home'],[L('ยิม/อุปกรณ์ครบ','Full gym'),'gym']], other:true }
    ],
    complete: function(sl){ return buildCoachWorkout(findClientById(sl.client), (+sl.days||3), (['home','gym'].indexOf(sl.equip)>=0?sl.equip:'gym')); }
  }
};
function planFlowResult(sl){
  var rep=calcReply({sex:sl.sex,age:sl.age,h:sl.h,w:sl.w,goal:sl.goal,act:sl.act});
  rep.title=L('แผนของคุณพร้อมแล้ว ✨','Your plan is ready ✨');
  rep.actions=[{label:L('ดูเมนูที่เข้าแผน','Menus that fit'),action:'recommend_library'}].concat(rep.actions||[]);
  return rep;
}
function startFlow(id, seed){
  var def=FLOWS[id]; if(!def) return;
  ST.flow={ id:id, slots:{}, cur:null };
  if(seed){ for(var k in seed){ if(seed[k]!=null) ST.flow.slots[k]=seed[k]; } }
  if(def.prefill) def.prefill(ST.flow.slots);
  if(def.intro) pushBotText(def.intro);
  flowNext();
}
function flowNext(){
  if(!ST.flow) return; var def=FLOWS[ST.flow.id];
  var slot=null; for(var i=0;i<def.slots.length;i++){ if(ST.flow.slots[def.slots[i].key]==null){ slot=def.slots[i]; break; } }
  if(!slot){ var res=null; try{ res=def.complete(ST.flow.slots); }catch(e){} ST.flow=null; if(res) pushReply(res); return; }
  ST.flow.cur=slot.key; askSlot(slot);
}
function slotChoices(slot){ return slot.choices || (slot.choicesFn?slot.choicesFn():[]); }
function _wdayAbbr(){ return (window.LANG==='en')?[['Mon',0],['Tue',1],['Wed',2],['Thu',3],['Fri',4],['Sat',5],['Sun',6]]:[['จ',0],['อ',1],['พ',2],['พฤ',3],['ศ',4],['ส',5],['อา',6]]; }
function _wdayMultiActions(){ var sel=(ST.flow&&ST.flow._msel)||{}; var acts=_wdayAbbr().map(function(c){ return {label:c[0],on:!!sel[c[1]],action:'flow_multi',payload:{v:c[1]}}; }); acts.push({label:L('📅 ให้จัดวันให้','📅 Arrange for me'),action:'flow_pick',payload:{v:'auto'}}); var n=Object.keys(sel).length; acts.push({label:L('ยืนยัน'+(n?' ('+n+' วัน)':''),'Confirm'+(n?' ('+n+')':'')),action:'flow_multi_done'}); acts.push({label:L('ยกเลิก','Cancel'),action:'flow_cancel'}); return acts; }
function askSlot(slot){
  if(slot.multi){ if(ST.flow)ST.flow._msel={}; pushReply({ title:null, message:slot.q+L(' (แตะวันที่ต้องการ แล้วกดยืนยัน)',' (tap days, then Confirm)'), actions:_wdayMultiActions() }); if(ST.flow)ST.flow.askIdx=ST.messages.length-1; return; }
  var acts=[];
  if(slot.type==='choice') acts=slotChoices(slot).map(function(c){ return {label:c[0],action:'flow_pick',payload:{v:c[1]}}; });
  if(slot.other) acts.push({label:L('อื่น ๆ (พิมพ์เอง)','Other (type it)'),action:'flow_other'});
  acts.push({label:L('ยกเลิก','Cancel'),action:'flow_cancel'});
  pushReply({ title:null, message:slot.q+(slot.type==='num'?L(' (พิมพ์ตัวเลข)',' (type a number)'):(slot.other?L(' (แตะเลือก หรือพิมพ์เอง)',' (tap one, or type your own)'):'')), actions:acts });
  if(ST.flow) ST.flow.askIdx=ST.messages.length-1;
}
function flowCurSlot(){ if(!ST.flow) return null; var def=FLOWS[ST.flow.id],r=null; def.slots.forEach(function(s){ if(s.key===ST.flow.cur) r=s; }); return r; }
function flowAnswer(v){ if(!ST.flow) return; var slot=flowCurSlot(); if(!slot) return; if(ST.flow.askIdx!=null && ST.messages[ST.flow.askIdx]){ ST.messages[ST.flow.askIdx].picked=v; renderMessages(); } ST.flow.slots[slot.key]=v; ST.flow.askIdx=null; flowNext(); }
function cancelFlow(){ ST.flow=null; pushBotText(L('ยกเลิกแล้วครับ ถามอย่างอื่นได้เลย','Cancelled — ask me anything else')); }
function flowInput(text){
  var slot=flowCurSlot(); if(!slot){ ST.flow=null; handleMessage(text); return; }
  var t=norm(text);
  if(/^(ยกเลิก|เลิก|cancel|stop|หยุด)/.test(t)){ cancelFlow(); return; }
  if(slot.type==='choice'){
    var m=null; slotChoices(slot).forEach(function(c){ var nc=norm(c[0]); if(nc===t || (''+c[1])===text.trim() || t.indexOf(nc)>=0 || (t.length>=2 && nc.indexOf(t)>=0)) m=c[1]; });
    if(m==null){ if(/ชาย|ผู้ชาย|\bmale\b/.test(t))m='m'; else if(/หญิง|ผู้หญิง|female/.test(t))m='f'; else if(/ลด/.test(t))m='lose'; else if(/เพิ่ม|กล้าม|bulk/.test(t))m='gain'; else if(/รักษา|คงน้ำหนัก|maintain/.test(t))m='keep'; else if(/ปานกลาง|moderate/.test(t))m=1.55; else if(/หนัก|hard/.test(t))m=1.725; else if(/เบา|light/.test(t))m=1.375; else if(/แทบไม่|นั่ง|sedentary/.test(t))m=1.2; }
    if(m==null){ if(slot.other){ flowAnswer(text.trim()); return; } pushBotText(L('เลือกจากตัวเลือกด้านบนได้เลยครับ','Please pick one of the options above')); return; }
    flowAnswer(m);
  } else {
    var mm=(''+text).match(/\d+(\.\d+)?/); var n=mm?parseFloat(mm[0]):NaN;
    if(isNaN(n)){ pushBotText(L('พิมพ์เป็นตัวเลขนะครับ','Please type a number')); return; }
    if(slot.min!=null && (n<slot.min||n>slot.max)){ pushBotText(L('ค่าน่าจะอยู่ระหว่าง '+slot.min+'–'+slot.max+' ลองใหม่นะครับ','Should be '+slot.min+'–'+slot.max+', try again')); return; }
    flowAnswer(n);
  }
}
function _nluLog(msg,nlu){ try{
  var k='iufit_iu_mate_misses', arr=[];
  try{ arr=JSON.parse(localStorage.getItem(k)||'[]')||[]; }catch(e){}
  arr.push({ q:(''+msg).slice(0,140), i:(nlu&&nlu.intent)||'unknown', sc:(nlu&&nlu.score)||0,
    cl:(nlu&&nlu.clarify)?nlu.clarify.slice(0,3):null, cp:(nlu&&nlu.concepts)?Object.keys(nlu.concepts):[],
    ts:Date.now(), lang:(window.LANG||'th') });
  if(arr.length>300) arr=arr.slice(-300);
  localStorage.setItem(k,JSON.stringify(arr));
  try{ if(fn('fbPut')&&window.S&&window.S.devId){ window.fbPut('/nluMisses/'+window.S.devId+'/'+Date.now(), {q:(''+msg).slice(0,140), i:(nlu&&nlu.intent)||'unknown', ts:Date.now()}); } }catch(e){}
}catch(e){} }
function handleMessage(text){
  text=(text||'').trim(); if(!text) return; try{ bumpStat('umsg'); }catch(e){}
  if(ST.flow){ pushUser(text); flowInput(text); return; }
  pushUser(text); pushTyping();
  setTimeout(function(){ popTyping();
    var fu=null; try{ fu=resolveFollowup(text); }catch(e){}
    if(fu && fu._handled) return; /* follow-up already handled (e.g. restarted a flow) */
    if(fu){ pushReply(fu); return; }
    var nlu=null; try{ nlu=detectIntentEx(text); }catch(e){}
    if(!nlu) nlu={intent:'unknown',score:0,v2score:0,legacyScore:0,concepts:{},entities:null,question:false,clarify:null};
    var intent=nlu.intent; try{ bumpStat('intent:'+intent); }catch(e){}
    try{ if(intent==='unknown'||(nlu.clarify&&nlu.clarify.length)) _nluLog(text,nlu); }catch(e){}
    function _setCtx(){ try{ ST.ctx={intent:intent,concepts:nlu.concepts,entities:nlu.entities,ts:Date.now()}; if(intent==='cuisine_menu') ST.ctx.lastCuisine=true; }catch(e){} }
    if(nlu.clarify && !ST.flow && !ST._lastWasClarify){
      var _kh0=[]; try{ _kh0=searchKnowledge(text); }catch(e){}
      if(!_kh0.length){ ST._lastWasClarify=true; try{ bumpStat('clarify'); }catch(e){} pushReply(buildClarifyReply(nlu.clarify)); _setCtx(); return; }
    }
    ST._lastWasClarify=false;
    if(nlu.question && (intent==='workout_plan'||intent==='make_plan'||intent==='food_recommend'||(nlu.v2score<NLU_T.ACCEPT && nlu.legacyScore<=2))){
      var _kq=null; try{ if(searchKnowledge(text).length) _kq=buildKnowledge(text); }catch(e){}
      if(_kq && _kq.title){ try{ _kq._intent=intent; }catch(e){} pushReply(_kq); _setCtx(); return; }
    }
    var _eqk=null; try{ _eqk=_detectEquip(text); }catch(e){} if(_eqk && (typeof isHealthRisk!=='function'||!isHealthRisk(text)) && intent!=='workout_plan' && /ท่า|แผน|ออกกำล|เล่น|วันนี้|แนะนำ|ฝึก|เครื่อง|อุปกรณ์|มี|exercise|workout|plan|train|machine|equipment/i.test(text)){ var _er=null; try{ _er=buildEquipReply(_eqk,text); }catch(e){} if(_er){ pushReply(_er); _setCtx(); return; } }
    if(intent==='make_plan'){ try{ startFlow('plan', _seedMerge(parseProfileFromText(text), _entsToPlanSeed(nlu.entities))); }catch(e){} _setCtx(); return; }
    if(intent==='food_recommend'){ try{ var _ms=_menuSeed(text); if(nlu.entities && nlu.entities.meal && _ms.meal==null) _ms.meal=nlu.entities.meal; startFlow('menu', _ms); }catch(e){} _setCtx(); return; }
    if(intent==='log_food'){ pushReply({ title:L('วิธีบันทึกอาหาร','How to log food'), message:L('ไปที่แท็บอาหาร เลือกวันและมื้อที่ต้องการ แล้วค้นหาเมนูจากคลังหรือสร้างเมนูเองได้เลยครับ ระบบจะคำนวณแคลและมาโครให้อัตโนมัติ','Open the Food tab, pick the day and meal, then search the menu library or create your own — calories and macros are calculated automatically.'), actions:[{label:L('ไปหน้าอาหาร','Open Food'),action:'go_food'}], _intent:'log_food' }); _setCtx(); return; }
    if(intent==='workout_plan'){ var _wt=(''+text).toLowerCase(); var _isQ=/คือ|อะไร|ยังไง|ต่างกัน|เทียบ|vs|difference|what is|explain|ดีกว่า|เลือก.{0,6}ไหน/.test(_wt) && !/จัด|สร้าง|ทำ.{0,4}ตาราง|ขอ.{0,4}ตาราง|build|make|plan for me|ให้หน่อย|ให้ที/.test(_wt); if(_isQ){ var _kr=null; try{ _kr=buildKnowledge(text); }catch(e){} if(_kr){ pushReply(_kr); _setCtx(); return; } } var _pq=wplanQuota(); if(!_pq.ok){ pushReply(wplanQuotaReply(_pq)); _setCtx(); return; } try{ startFlow('workout', _seedMerge(_wSeed(text), _entsToWorkoutSeed(nlu.entities))); }catch(e){} _setCtx(); return; }
    if(intent==='coach_menu' && role()==='coach'){ try{ startCoachMenu(); }catch(e){} _setCtx(); return; }
    if(intent==='coach_workout' && role()==='coach'){ try{ startCoachWorkout(); }catch(e){} _setCtx(); return; }
    var reply; try{ reply=buildReply(intent,text,nlu); }catch(e){ reply=buildFallback(text); } try{ if(reply) reply._intent=intent; }catch(e){}
    _setCtx();
    pushReply(reply);
  }, 320+Math.random()*220);
}

/* ============================ public API ============================ */
function closeNow(){ try{ saveHist(); }catch(e){} try{document.body.classList.remove('iumate-open');}catch(_e){} ST.isOpen=false; var r=root(); r.innerHTML=''; renderFab(); }
function readCalcInputs(){ ST.calc=ST.calc||{}; var a=document.getElementById('iuCalcAge'),h=document.getElementById('iuCalcH'),w=document.getElementById('iuCalcW'),ac=document.getElementById('iuCalcAct'); if(a&&a.value!=='')ST.calc.age=parseFloat(a.value); if(h&&h.value!=='')ST.calc.h=parseFloat(h.value); if(w&&w.value!=='')ST.calc.w=parseFloat(w.value); if(ac&&ac.value)ST.calc.act=parseFloat(ac.value); }
var IUMate = {
  open:function(mode){ if(!appReady()){ appToast(L('เข้าสู่ระบบก่อนใช้ IU Mate','Sign in to use IU Mate')); return; }
    ST.isOpen=true; ST.mode=mode||'global'; try{document.body.classList.add('iumate-open');}catch(_e){}
    if(!hasConsent()){ ST.full=false; renderConsentScreen(); renderFab(); return; }
    if(!ST.messages.length){ var _h=loadHist(); if(_h){ ST.messages=_h; } else { ST.messages.push({role:'botText',text:greeting()}); try{ if(!localStorage.getItem('iufit_iumate_lineintro')){ ST.messages.push({role:'bot',reply:_lineWelcome(),idx:ST.messages.length}); localStorage.setItem('iufit_iumate_lineintro','1'); } }catch(_le){} var _nz=proactiveNudge(); if(_nz){ ST.messages.push({role:'bot',reply:_nz,idx:ST.messages.length}); } } } ST._nudgeSeen=true;
    renderSheet(); renderFab();
    setTimeout(function(){ var inp=document.getElementById('iuMateInput'); /* no autofocus to avoid keyboard jump on open */ }, 50);
  },
  close:function(){ closeNow(); try{ _reviewMaybe(); }catch(e){} },
  toggleFull:function(){ ST.full=!ST.full; renderSheet(); },
  chip:function(q){ try{ bumpStat('chip:'+q); }catch(e){} handleMessage(q); },
  misses:function(){ try{ return JSON.parse(localStorage.getItem('iufit_iu_mate_misses')||'[]')||[]; }catch(e){ return []; } },
  exportMisses:function(){ var a=this.misses(); var t=a.map(function(x){ return (new Date(x.ts)).toISOString().slice(0,16)+' ['+x.i+'] '+x.q; }).join('\n'); try{ navigator.clipboard.writeText(t); }catch(e){} try{ console.log(t); }catch(e){} return a.length+' misses (copied to clipboard)'; },
  clearMisses:function(){ try{ localStorage.removeItem('iufit_iu_mate_misses'); }catch(e){} return 'cleared'; },
  fb:function(idx, up){ try{ var m=ST.messages[idx]; if(!m||m.role!=='bot'||m.fb) return; m.fb=up?'helpful':'not_helpful'; _logFeedback(m, up); renderMessages(); }catch(e){} },
  placeFill:function(v){ var el=document.getElementById('iuPlaceInput'); if(el){ el.value=v; try{ el.focus(); }catch(e){} } },
  openPlace:function(){ var el=document.getElementById('iuPlaceInput'); var q=el?(''+el.value).trim():''; if(!q){ try{ appToast(L('พิมพ์ชื่อสถานที่ก่อน','Type a place first')); }catch(e){} if(el){ try{ el.focus(); }catch(e){} } return; } var hasLoc=/ใกล้|แถว|ย่าน|near|nearby|จังหวัด|อำเภอ|เขต/i.test(q); var fq=hasLoc?q:(q+' '+L('ใกล้ฉัน','near me')); var url='https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(fq); try{ bumpStat('place_open'); }catch(e){} try{ window.open(url,'_blank'); }catch(e){ try{ location.href=url; }catch(_e){} } },
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
  _rvSet:function(n){ ST.rvStar=n; var s=document.getElementById('iuRvStars'); if(s)s.innerHTML=_reviewStars(n); var b=document.getElementById('iuRvSend'); if(b){ b.disabled=false; b.style.opacity='1'; } },
  _rvSend:function(){ _reviewSubmit(); },
  _rvDismiss:function(){ _reviewDismiss(); },
  _amt:function(idx,dir){ previewAmt(idx,dir); },
  _previewAdd:function(rid){ modalClose(); confirmAddRecipe(rid); },
  _sex:function(x){ readCalcInputs(); ST.calc.sex=x; openCalcForm(ST.calc); },
  _goal:function(x){ readCalcInputs(); ST.calc.goal=x; openCalcForm(ST.calc); },
  _calc:function(){ readCalcInputs(); var p=ST.calc||{}; if(p.w==null||p.h==null||p.age==null||p.sex==null){ appToast(L('กรอกเพศ อายุ ส่วนสูง น้ำหนักให้ครบก่อนครับ','Please fill sex, age, height and weight')); return; } if(!(p.age>=10&&p.age<=100)||!(p.h>=120&&p.h<=220)||!(p.w>=30&&p.w<=250)){ appToast(L('ตรวจค่าอีกครั้ง: อายุ 10–100 ปี · สูง 120–220 ซม. · หนัก 30–250 กก.','Check values: age 10–100 · height 120–220 cm · weight 30–250 kg')); return; } modalClose(); if(!ST.isOpen) IUMate.open('global'); pushReply(calcReply(p)); },
  acceptConsent:function(){ ST.flow=null; ST.ctx=null; var coachData=true; var cb=document.getElementById('iuMateCoachConsent'); if(cb) coachData=!!cb.checked; saveConsent(coachData); var kh=document.getElementById('iuMateKeepHist'); setKeepHist(!!(kh&&kh.checked)); ST.messages=[]; ST.messages.push({role:'botText',text:greeting()}); ST.isOpen=true; ST._nudgeSeen=true; ST._skipAnim=true; renderSheet(); renderFab(); },
  declineConsent:function(){ closeNow(); },
  showPrivacy:function(){
    var wrap=document.createElement('div'); wrap.className='iu-mate-confirm-wrap'; wrap.id='iuMateConfirm';
    var kh=keepHist();
    wrap.innerHTML='<div class="iu-mate-confirm"><div class="ci">'+checkIcon()+'</div><h4>'+esc(L('ความเป็นส่วนตัว','Privacy'))+'</h4>'+
      '<p>'+esc(L('IU Mate ทำงานในเครื่อง บทสนทนาไม่ถูกส่งออกนอกเครื่อง และอ่านข้อมูลในแอปเพื่อช่วยสรุปเท่านั้น ประวัติแชทจะถูกเก็บไว้ในเครื่องเฉพาะเมื่อคุณเปิด “เก็บประวัติแชท”','IU Mate runs on-device. Conversations never leave your device, and it only reads your in-app data to help summarize. Chat history is kept on this device only while “Keep chat history” is on.'))+'</p>'+
      '<label style="display:flex;gap:9px;align-items:center;margin:4px 2px 10px;font-size:13px;color:#28364f;cursor:pointer;text-align:left"><input type="checkbox" id="iuMateKeepHistTgl"'+(kh?' checked':'')+' style="width:18px;height:18px;flex:none">'+esc(L('เก็บประวัติแชทไว้ในเครื่องนี้','Keep chat history on this device'))+'</label>'+
      '<button type="button" class="iu-mate-act" id="iuMateClearHist" style="width:100%;margin:0 0 10px'+(kh?'':';display:none')+'">'+esc(L('ล้างประวัติแชท','Clear chat history'))+'</button>'+
      '<div class="row"><button class="no">'+esc(L('ปิด','Close'))+'</button><button class="yes">'+esc(L('เพิกถอนความยินยอม','Withdraw consent'))+'</button></div></div>';
    document.body.appendChild(wrap);
    var tgl=wrap.querySelector('#iuMateKeepHistTgl'), clr=wrap.querySelector('#iuMateClearHist');
    if(tgl) tgl.onchange=function(){ var on=!!tgl.checked; setKeepHist(on); if(on){ try{ saveHist(); }catch(e){} } if(clr) clr.style.display=on?'':'none'; appToast(on?L('จะเก็บประวัติแชทไว้ในเครื่อง','Chat history will be kept on this device'):L('ปิดแล้ว · ลบประวัติที่เก็บไว้แล้ว','Turned off · saved history deleted')); try{ if(ST.isOpen&&hasConsent()){ ST._skipAnim=true; renderSheet(); } }catch(e){} };
    if(clr) clr.onclick=function(){ clearHist(); ST.messages=[]; if(ST.isOpen&&hasConsent()){ ST.messages.push({role:'botText',text:greeting()}); ST._skipAnim=true; renderSheet(); } appToast(L('ล้างประวัติแชทแล้ว','Chat history cleared')); wrap.remove(); };
    wrap.querySelector('.no').onclick=function(){ wrap.remove(); };
    wrap.addEventListener('click',function(e){ if(e.target===wrap) wrap.remove(); });
    wrap.querySelector('.yes').onclick=function(){ wrap.remove(); revokeConsent(); setKeepHist(false); appToast(L('เพิกถอนความยินยอมแล้ว','Consent withdrawn')); closeNow(); };
  },
  _sync:function(){ try{ renderFab(); }catch(e){} try{ injectEntryPoints(); }catch(e){} },
  _nlu:function(m){ try{ return detectIntentEx(m); }catch(e){ return {intent:'error',error:''+e}; } },
  _fu:function(m){ try{ return resolveFollowup(m); }catch(e){ return null; } },
  _state:ST
};
window.IUMate = IUMate;

/* ============================ boot ============================ */
function fabModalOpen(){var a=document.getElementById('mwrap'),b=document.getElementById('mwrap2');return !!((a&&a.classList.contains('show'))||(b&&b.classList.contains('show')));}
function setupFabModalWatch(){['mwrap','mwrap2'].forEach(function(id){var el=document.getElementById(id);if(!el||el.__iuObs)return;el.__iuObs=1;try{new MutationObserver(function(){var f=document.getElementById('iuMateFab');if(!f)return;if(fabModalOpen())f.classList.add('fab-hide');else f.classList.remove('fab-hide');}).observe(el,{attributes:true,attributeFilter:['class']});}catch(e){}});}
function boot(){
  renderFab(); try{ setupFabModalWatch(); }catch(e){}
  try{(function(){var lastY=0,ticking=false;function onS(){var y=window.scrollY||document.documentElement.scrollTop||0;var f=document.getElementById('iuMateFab');if(f){if(y>lastY+6&&y>90)f.classList.add('fab-hide');else if(y<lastY-6&&!fabModalOpen())f.classList.remove('fab-hide');}lastY=y;ticking=false;clearTimeout(window._iuFabIdle);window._iuFabIdle=setTimeout(function(){var ff=document.getElementById('iuMateFab');if(ff&&!fabModalOpen())ff.classList.remove('fab-hide');},700);}window.addEventListener('scroll',function(){if(!ticking){requestAnimationFrame(onS);ticking=true;}},{passive:true});})();}catch(e){}
  // keep FAB visibility + language synced by decorating renderAll (calls original, non-invasive)
  try{ if(fn('renderAll') && !window.renderAll.__iuMateWrapped){ var orig=window.renderAll; window.renderAll=function(){ var r=orig.apply(this,arguments); try{ IUMate._sync(); }catch(e){} return r; }; window.renderAll.__iuMateWrapped=true; } }catch(e){}
  // FAB visibility synced via the renderAll decorator above (covers login + tab change); no polling needed
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
