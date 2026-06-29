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
function _logFeedback(m, up){ try{ var rep=m.reply||{}; var intent=rep._intent||'unknown'; var input=''; try{ var pm=ST.messages[(m.idx||0)-1]; if(pm&&pm.role==='user') input=(''+pm.text).slice(0,120); }catch(e){} var rec={ ts:Date.now(), intent:intent, rating:up?'helpful':'not_helpful', input:input, title:(rep.title||'').slice(0,80) }; var KEY='iufit_iu_mate_feedback'; var arr=[]; try{ arr=JSON.parse(localStorage.getItem(KEY)||'[]')||[]; }catch(e){} arr.push(rec); if(arr.length>300) arr=arr.slice(-300); try{ localStorage.setItem(KEY, JSON.stringify(arr)); }catch(e){} bumpStat('fb:'+(up?'up':'down')); bumpStat('fbintent:'+intent+':'+(up?'up':'down')); }catch(e){} }
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
  food_swap:['แทนด้วยอะไร','ใช้อะไรแทน','เปลี่ยนเป็นอะไร','แทนได้','สลับวัตถุดิบ','เปลี่ยนวัตถุดิบ','substitute','swap ','replace','alternative'],
  cuisine_menu:['เมนูญี่ปุ่น','อาหารญี่ปุ่น','เมนูจีน','อาหารจีน','เมนูฝรั่ง','อาหารฝรั่ง','อาหารตะวันตก','เมนู 7-11','เมนูสะดวกซื้อ','เซเว่น','7-11','เมนูร้านสะดวกซื้อ','japanese','chinese','western','convenience'],
  budget_menu:['เมนูประหยัด','เมนูถูก','งบน้อย','เมนูงบ','ประหยัดเงิน','ราคาถูก','เมนูราคาประหยัด','cheap menu','budget meal','on a budget'],
  food_recommend:['กินอะไรดี','แนะนำเมนู','เมนูแนะนำ','แคลต่ำ','โปรตีนสูง','ลดไขมัน','what to eat','recommend menu','low cal','high protein','suggest food'],
  food_search:['หาอาหาร','ค้นหาเมนู','มีเมนู','search food','find menu'],
  result_summary:['ผลลัพธ์','น้ำหนักตอนนี้','น้ำหนักลดไป','ดูน้ำหนัก','ลดไปกี่','ความคืบหน้า','กราฟ','รอบเอว','result','progress','my result','waist'],
  workout_recommend:['ออกกำลัง','ท่าฝึก','เล่นอะไร','เวท','คาร์ดิโอ','ดัมเบล','workout','exercise','train','cardio','weight training'],
  workout_plan:['จัดตาราง','จัดตารางฝึก','จัดตารางออกกำลัง','จัดตารางออกกำลังกาย','สร้างแผนฝึก','สร้างแผน','แผนฝึก','ตารางฝึก','โปรแกรมฝึก','จัดโปรแกรม','จัดแผนฝึก','ฝึกกี่วัน','กี่วันต่อสัปดาห์','วันต่อสัปดาห์','เริ่มออกกำลังกายยังไง','อยากออกกำลังกาย','ต่อสัปดาห์','แผนให้ลูกเทรน','สร้างแผนให้ลูก','โปรแกรมให้ลูกเทรน','workout plan','training plan','training schedule','make a workout plan','build a plan'],
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
function _scoreIntents(text, mode, tab, fuzzy){
  var best='unknown', bestScore=0;
  Object.keys(INTENT_KW).forEach(function(intent){
    var sc=0; INTENT_KW[intent].forEach(function(k){ var kk=synNorm(k); if(text.indexOf(kk)>=0) sc+=2; else if(fuzzy && kk.length>=6 && trigCover(text,kk)>=0.66) sc+=1; });
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
function detectIntent(message){
  var text=synNorm(message), mode=role(), tab=window.TAB||'';
  var ex=_scoreIntents(text,mode,tab,false); if(ex!=='unknown') return ex;  // pass 1: exact (high precision)
  var fz=_scoreIntents(text,mode,tab,true); if(fz!=='unknown') return fz;   // pass 2: fuzzy (typo/variant)
  try{ var igs=findIngredientsInText(message); if(igs && igs.length>=2) return 'ingredient_recipe_generate'; }catch(e){} // pass 3: bare ingredient list
  return 'unknown';
}

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
  { id:'how_to_log_water', cat:'app_help', kw:['น้ำ','ดื่มน้ำ','บันทึกน้ำ','water','drink water','hydration'],
    title:L('วิธีบันทึกน้ำดื่ม','How to log water'),
    answer:L('ที่หน้าวันนี้ มีการ์ดน้ำดื่ม แตะปุ่ม + ทุกครั้งที่ดื่ม 1 แก้ว (เป้าหมาย 8–10 แก้ว/วัน)','On Today there\'s a water card — tap + for each glass (goal 8–10/day).'),
    actions:[{label:L('ไปหน้าวันนี้','Open Today'),action:'go_today'}] },
  { id:'how_to_log_body', cat:'app_help', kw:['น้ำหนัก','สัดส่วน','บันทึกร่างกาย','วัดรอบ','body','weight','measurement'],
    title:L('วิธีบันทึกน้ำหนัก/สัดส่วน','How to log weight & measurements'),
    answer:L('หน้าแรก (วันนี้) กดทางลัด บันทึกร่างกาย ใส่น้ำหนัก/รอบเอว/% ไขมัน แล้วดูกราฟความก้าวหน้าในหน้าผลลัพธ์ (แก้ไขรายการเดิมได้จากประวัติในหน้าผลลัพธ์)','On the Today page, tap the Log body shortcut to enter weight/waist/body fat, then view your progress charts on Results (edit past entries from the Results history).'),
    actions:[{label:L('ไปหน้าวันนี้','Open Today'),action:'go_today'}] },
  { id:'how_to_result_card', cat:'app_help', kw:['การ์ดผลลัพธ์','แชร์ผล','การ์ดแชร์','result card','share progress','progress card'],
    title:L('วิธีสร้างการ์ดผลลัพธ์','How to make a result card'),
    answer:L('ที่หน้าผลลัพธ์ กดสร้างการ์ด จะได้รูปสรุปความก้าวหน้าสวย ๆ ไว้แชร์ให้เพื่อนหรือลงโซเชียล','On Results, tap make a card to get a shareable progress image.'),
    actions:[{label:L('เปิดผลลัพธ์','Open Results'),action:'go_result'}] },
  { id:'how_to_meal_plan', cat:'app_help', kw:['ตารางอาหาร','วางแผนอาหาร','แผนมื้อ','meal plan','plan meals'],
    title:L('วิธีวางแผนอาหาร','How to plan meals'),
    answer:L('แท็บอาหารแบ่ง 2 ส่วน เลือก "ตารางอาหาร" เพื่อวางแผนมื้อของแต่ละวันในสัปดาห์','The Food tab has 2 parts — pick "Meal plan" to plan meals for each day of the week.'),
    actions:[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] },
  { id:'how_to_menu_library', cat:'app_help', kw:['คลังเมนู','เมนูทั้งหมด','ค้นเมนู','เพิ่มเมนู','เพิ่มวัตถุดิบ','ai เมนู','menu library','add menu','add ingredient'],
    title:L('คลังเมนู & เพิ่มเมนูเอง','Menu library & adding menus'),
    answer:L('เลือก "คลังเมนู" ในแท็บอาหาร ดูเมนู/วัตถุดิบกว่า 4,500 รายการ ค้นหาได้ และเพิ่มเมนูเองหรือให้ AI แจกแจงวัตถุดิบ+โภชนาการให้','Pick "Menu library" in Food — browse 4,500+ menus & ingredients, or add your own / let AI break them down.'),
    actions:[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] },
  { id:'how_to_missions', cat:'app_help', kw:['ภารกิจ','mission','challenge','ตราสะสม','badge','collection','พิเศษ','special','กรอบ','frame','ความสำเร็จ','milestone','คะแนน','points','fit points','ลีดเดอร์บอร์ด','leaderboard'],
    title:L('ความสำเร็จ · ภารกิจ · คะแนน FIT','Milestones, missions & FIT Points'),
    answer:L('หน้าวันนี้มีการ์ด "ความสำเร็จ" 🏆 ติดตามไมล์สโตนจริง (วันบันทึกต่อเนื่อง ออกกำลังกาย สตรีคดีที่สุด ชั่งน้ำหนัก) ทำต่อเนื่องเพื่อปลดล็อกเป็นขั้น · ในกลุ่มโค้ชมี คะแนน FIT + ลีดเดอร์บอร์ด (ได้แต้มจากภารกิจที่ทำสำเร็จ + กิจกรรมประจำวัน) · ตราสะสม (badge) เป็นของสะสมเสริม 240 แบบ + พิเศษ 30 นำมาทำกรอบรูปโปรไฟล์ได้ · โค้ชสร้างภารกิจให้ลูกเทรนที่แท็บภารกิจ','The Today page has a "Milestones" 🏆 card tracking real milestones (days logged, workouts, best streak, weigh-ins) — stay consistent to unlock tiers. Coach groups have FIT Points + a leaderboard (from completed missions + daily activity). Badges are optional collectibles (240 + 30 Special) you can equip as a profile frame. Coaches create client missions in the Missions tab.'),
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
  { id:'how_to_upgrade', cat:'app_help', kw:['อัปเกรด','แพ็กเกจ','ราคา','สมัครแพ็ก','upgrade','pricing','plan','subscribe'],
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
  { id:'how_to_tour', cat:'app_help', kw:['สอนใช้','ทัวร์','วิธีใช้','tutorial','tour','how to use','guide','สอน'],
    title:L('ดูทัวร์แนะนำการใช้งาน','Take the app tour'),
    answer:L('ผมพาทัวร์ทีละปุ่มได้เลย หรือดูศูนย์ช่วยเหลือในตั้งค่า มีคำถามอะไรถามผมได้ทุกเมื่อครับ','I can walk you through button by button, or see the Help Center in Settings — ask me anytime!'),
    actions:[{label:L('เริ่มทัวร์','Start tour'),action:'open_tour'}] },
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
  { id:'how_to_log_food', cat:'app_help', kw:['บันทึกอาหาร','เพิ่มอาหาร','ลงอาหาร','log food','add food'],
    title:L('วิธีบันทึกอาหาร','How to log food'),
    answer:L('ไปที่หน้าอาหาร เลือกมื้อที่ต้องการ ค้นหาเมนูจากคลังหรือเพิ่มเอง แล้วกดบันทึก','Go to Food, pick a meal, search the library or add your own, then save.'),
    actions:[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] },
  { id:'how_to_join_group', cat:'app_help', kw:['เข้ากลุ่ม','qr','สแกน','join group','scan'],
    title:L('วิธีเข้าเป็นลูกเทรน','How to join a coach'),
    answer:L('สแกน QR ของโค้ช จะมีหน้าคำเชิญแสดงโปรไฟล์โค้ช (ชื่อ/รูป/ความเชี่ยวชาญ) ติ๊กยินยอมให้โค้ชดูข้อมูลสุขภาพ แล้วกดยืนยันเข้าร่วม จากนั้นรับแผนและส่งการบ้านได้','Scanning your coach QR shows an invite screen with the coach profile (name/photo/expertise); tick consent to let the coach view your health data, then confirm — after that you can receive plans and send homework.'),
    actions:[{label:L('เปิดหน้าโค้ช','Open Coach'),action:'go_coach'}] },
  { id:'how_to_log_workout', cat:'app_help', kw:['บันทึกท่าฝึก','ออกกำลัง','log workout','add workout'],
    title:L('วิธีบันทึกการออกกำลังกาย','How to log a workout'),
    answer:L('ไปที่หน้าท่าฝึก กดบันทึก เลือกเวทเทรนนิ่งหรือคาร์ดิโอ แล้วใส่ค่าจากคลังท่า','Go to Workout, tap log, choose weight training or cardio, then fill from the move library.'),
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
  { id:'cardio_amount', cat:'workout', kw:['คาร์ดิโอแค่ไหน','คาร์ดิโอเท่าไหร่','how much cardio'], title:L('คาร์ดิโอควรทำแค่ไหน','How much cardio'), answer:L('ทั่วไป 150 นาที/สัปดาห์ของคาร์ดิโอปานกลาง หรือ 20-30 นาทีต่อครั้ง สลับกับเวท ไม่ต้องมากจนล้า','Around 150 min/week of moderate cardio, or 20-30 min per session alternating with weights — no need to overdo it.') },
  { id:'recovery', cat:'workout', kw:['พักฟื้น','พักผ่อน','recovery','rest day'], title:L('การพักฟื้นสำคัญแค่ไหน','Why recovery matters'), answer:L('กล้ามโตตอนพัก ไม่ใช่ตอนฝึก นอนให้พอ 7-8 ชม. มีวันพัก และกินโปรตีนพอ เพื่อให้ฟื้นตัวและไปต่อได้','Muscle grows during rest, not training. Sleep 7-8h, take rest days, eat enough protein to recover and keep going.') },
  { id:'new_client', cat:'coach', kw:['ลูกเทรนใหม่','เริ่มลูกเทรน','new client','onboard client'], title:L('ลูกเทรนใหม่ควรเริ่มยังไง','Starting a new client'), answer:L('เริ่มจากเก็บข้อมูลพื้นฐานและเป้าหมาย ตั้งแผนง่าย ๆ ที่ทำได้จริง แล้วชวนบันทึก 3-5 วันแรกให้ติดเป็นนิสัย','Start by gathering basics and goals, set a simple realistic plan, then nudge them to log for the first 3-5 days to build the habit.'), actions:[{label:L('เปิดหน้าลูกเทรน','Open Clients'),action:'go_clients'}] },
  { id:'weight_stall', cat:'coach', kw:['น้ำหนักไม่ลง','ตันน้ำหนัก','weight stall','plateau'], title:L('ลูกเทรนน้ำหนักไม่ลงดูอะไร','Client weight not dropping'), answer:L('เช็กความสม่ำเสมอของการบันทึก ปริมาณจริงที่กิน การนอน ความเครียด และน้ำ บางครั้งรอบเอวลดแม้น้ำหนักนิ่ง ใช้หลายตัวชี้วัด','Check logging consistency, true intake, sleep, stress and water. Sometimes waist drops even when weight stalls — use multiple metrics.') },
  { id:'quiet_group', cat:'coach', kw:['กลุ่มเงียบ','กระตุ้นกลุ่ม','quiet group','group engagement'], title:L('กลุ่มเงียบควรทำอะไร','Re-engaging a quiet group'), answer:L('ตั้งภารกิจกลุ่มสั้น ๆ ที่ทำง่าย ชวนแชร์ผลรายสัปดาห์ หรือถามคำถามเปิดในแชทกลุ่ม สร้างจังหวะให้คนกลับมามีส่วนร่วม','Set a short easy group mission, invite weekly result sharing, or ask an open question in group chat to bring people back.'), actions:[{label:L('สร้างภารกิจกลุ่ม','New mission'),action:'go_missions'}] },
  { id:'when_followup', cat:'coach', kw:['ติดตามเมื่อไร','ควรทักเมื่อไหร่','when to follow up'], title:L('ควรติดตามลูกเทรนเมื่อไร','When to follow up'), answer:L('ทักเมื่อขาดบันทึก 2-3 วัน หรือมีการบ้านค้าง ใช้ข้อความสั้น ให้กำลังใจ และถามแบบตอบง่าย อย่ารอจนหลุดแผนไปไกล','Reach out after 2-3 missed log days or pending homework. Keep it short, encouraging and easy to answer — do not wait until they have fully dropped off.'), actions:[{label:L('สร้างข้อความติดตาม','Draft follow-up'),action:'create_followup_message'}] },
   { id:'how_to_log_water', cat:'app_help', kw:['บันทึกน้ำ','ดื่มน้ำ','เพิ่มน้ำ','log water','track water','add water'], title:L('วิธีบันทึกน้ำดื่ม','How to log water'), answer:L('หน้าวันนี้มีแก้วน้ำ แตะเพื่อเพิ่ม/ลดทีละแก้ว (1 แก้ว = 250 มล. เป้า 10 แก้ว/วัน)','On Today there are water glasses — tap to add or remove one glass (1 glass = 250 ml, goal 10/day).'), actions:[{label:L('เปิดหน้าวันนี้','Open Today'),action:'go_today'}] },
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
  { id:'training_split', cat:'workout', kw:['จัดโปรแกรม','แบ่งวันเล่น','push pull legs','split','โปรแกรมเล่น'], title:L('จัดโปรแกรมแบ่งวันเล่น','Training split'), answer:L('มือใหม่เล่นทั้งตัว full body 3 วันต่อสัปดาห์ก็พอ พอเล่นบ่อยขึ้นค่อยขยับเป็น upper/lower หรือ push/pull/legs เน้นฟอร์มและความสม่ำเสมอก่อนเสมอ','Beginners do fine with full-body sessions three days a week. As you train more often, move to upper/lower or push/pull/legs. Form and consistency come first.') },
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
 pull:{noEquipment:['Band Row','Inverted Row (โหนใต้โต๊ะ)'],dumbbell:['One-arm DB Row','DB Row'],gym:['Lat Pulldown','Seated Row']},
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
 else if(/ยิม|full gym|ฟิตเนส|gym/.test(t))equipment=['full_gym'];
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
  d.exercises.forEach(function(x,i){var detail=(x.sets?x.sets+L(' เซ็ต',' sets'):'')+(x.reps?' × '+x.reps+L(' ครั้ง',''):(x.durationSeconds?' × '+x.durationSeconds+L(' วิ',' s'):''));ln.push((i+1)+'. '+x.name+(detail?' — '+detail:''));});
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
function buildWorkoutPlan(message){
 var coach=(role()==='coach');
 try{var S=window.S;
  if(!coach&&S&&S.follow&&S.follow.code){
   var u=_wpProfile();var wp=u&&S.wplan&&S.wplan[u.id];var hasPlan=wp&&Object.keys(wp).some(function(d){return (wp[d]||[]).length;});
   if(hasPlan)return {title:L('คุณมีแผนจากโค้ชอยู่แล้ว','You already have a coach plan'),message:L('ตอนนี้คุณมีแผนจากโค้ชอยู่แล้วครับ ผมจะช่วยอธิบายแผนและเตือนวันฝึกให้ หากต้องการเปลี่ยนแผน แนะนำให้ปรึกษาโค้ชก่อนนะครับ','You already have a plan from your coach. I can explain it and remind training days — to change it, please ask your coach first.'),actions:[{label:L('ดูแผนจากโค้ช','See coach plan'),action:'go_workout'},{label:L('แชทหาโค้ช','Chat coach'),action:'go_coach'}]};
   return {title:L('ยังไม่มีแผนจากโค้ช','No coach plan yet'),message:L('ตอนนี้ยังไม่มีแผนฝึกจากโค้ชครับ คุณสามารถทักโค้ชเพื่อขอแผน หรือให้ IU MATE ช่วยสร้างแผนพื้นฐานชั่วคราวได้','No coach plan yet — you can message your coach to request one, or let me make a temporary basic plan.'),actions:[{label:L('สร้างแผนพื้นฐาน','Make a basic plan'),action:'_chip',payload:{q:L('จัดตารางฝึกพื้นฐานไม่มีอุปกรณ์','make a basic bodyweight plan')}},{label:L('แชทหาโค้ช','Chat coach'),action:'go_coach'}]};
  }
 }catch(e){}
 var inp=_wpParse(message);var limitation=_wpLimit(message);var bp=coach?null:_bodyProfile();
 var sel=selectWorkoutTemplateByBody({goal:inp.goal,level:inp.level,daysPerWeek:inp.daysPerWeek,equipment:inp.equipment,limitation:limitation,bodyProfile:bp,hasCoach:false,hasCoachWorkoutPlan:false});
 var tpl=getWorkoutTemplateById(sel.templateId)||WORKOUT_TEMPLATES[0];
 var explain=coach?'':_wpExplain(tpl,bp,inp,sel.safetyLevel);
 var msg=(explain?explain+'\n\n———\n\n':'')+_wpFormat(tpl)+L('หมายเหตุ: เลือกความหนักที่ยังคุมท่าได้ ไม่ต้องฝืนจนหมดแรง · ถ้าทำได้ครบทุกเซ็ตคุมท่าดี 2 ครั้งติด ค่อยเพิ่มครั้ง/น้ำหนักเล็กน้อย','Note: pick a load you can control, no need to go to failure. If you hit all sets with good form twice, add reps/a little weight.');
 var note=coach?L('นี่คือร่างแผนสำหรับลูกเทรน ตรวจ/แก้ก่อนส่งได้ · IU MATE ไม่ส่งให้ลูกเทรนอัตโนมัติ และไม่เปลี่ยนแผนเดิมโดยไม่ยืนยัน','Draft for your client — review/edit before sending. IU MATE never auto-sends or overrides an active plan.'):L('แผนนี้เป็นแผนพื้นฐาน ปรับได้ตามความพร้อมของร่างกาย หากมีอาการเจ็บหรือโรคประจำตัว ควรปรึกษาผู้เชี่ยวชาญก่อนเริ่มฝึก','This is a basic plan — adjust to your readiness. If you have pain or a health condition, consult a professional first.');
 var chips=[
  {label:L('ลดไขมัน 3 วัน','Fat loss 3d'),action:'_chip',payload:{q:L('จัดตารางฝึกลดไขมัน 3 วัน','fat loss workout plan 3 days')}},
  {label:L('เพิ่มกล้าม 4 วัน','Muscle 4d'),action:'_chip',payload:{q:L('จัดตารางฝึกเพิ่มกล้าม 4 วัน','muscle gain workout plan 4 days')}},
  {label:L('ไม่มีอุปกรณ์','No equipment'),action:'_chip',payload:{q:L('จัดตารางฝึกไม่มีอุปกรณ์','workout plan no equipment')}},
  {label:L('มีดัมเบล','Dumbbell'),action:'_chip',payload:{q:L('จัดตารางฝึกใช้ดัมเบล','workout plan with dumbbell')}},
  {label:L('ไปจัดตารางฝึก','Open plan'),action:'go_workout'}
 ];
 return {title:L('ตารางฝึกแนะนำ','Recommended plan'),message:msg,disclaimer:note,actions:chips};}
function buildExerciseAlt(message){var t=(''+message).toLowerCase();var pat='';
 if(/squat|สควอท|ขา/.test(t))pat='squat';else if(/row|pull|ดึง|หลัง/.test(t))pat='pull';else if(/push|press|ดัน|อก|วิดพื้น/.test(t))pat='push';else if(/deadlift|hinge|สะโพก|rdl|หลังล่าง/.test(t))pat='hinge';else if(/core|แกน|ท้อง|plank|แพลงก์/.test(t))pat='core';
 var eqk=/ยิม|gym/.test(t)?'gym':(/ดัมเบล|dumbbell/.test(t)?'dumbbell':'noEquipment');var eqLb={gym:L('ยิม','gym'),dumbbell:L('ดัมเบล','dumbbell'),noEquipment:L('ไม่มีอุปกรณ์','no equipment')};
 if(pat&&EXERCISE_ALTERNATIVES[pat]){var alts=EXERCISE_ALTERNATIVES[pat][eqk]||EXERCISE_ALTERNATIVES[pat].noEquipment;
  return {title:L('ท่าทางเลือก','Alternatives'),message:L('ท่าแทนกลุ่ม ','Alternatives for ')+pat+' ('+eqLb[eqk]+'):\n• '+alts.join('\n• '),disclaimer:L('ถ้าไม่มีอุปกรณ์เลย เลือกท่าที่คุมได้ปลอดภัย หรือข้ามท่านั้นชั่วคราวแล้วถามโค้ชเพิ่ม','If you have no equipment, pick a safe controllable move or skip it and ask your coach.')};}
 return {title:L('หาท่าแทน','Find alternative'),message:L('บอกชื่อท่าหรือกลุ่มกล้าม (สควอท/ดัน/ดึง/สะโพก/แกนกลาง) + อุปกรณ์ที่มี เดี๋ยวแนะนำท่าแทนให้ครับ','Tell me the move or muscle group (squat/push/pull/hinge/core) + your equipment, and I will suggest alternatives.')};}
function buildReply(intent, message){
  if(isHealthRisk(message)) return safetyReply();
  if(isMedical(message)) return { title:L('เรื่องนี้ควรปรึกษาผู้เชี่ยวชาญ','Please consult a professional'),
    message:L('เรื่องนี้ควรปรึกษาแพทย์หรือผู้เชี่ยวชาญโดยตรงนะครับ IU Mate ช่วยเรื่องการบันทึกอาหาร การฝึก และการติดตามผลทั่วไปได้','This is best discussed with a doctor or specialist. IU Mate can help with logging food, training and general tracking.') };
  var ql=(''+message).toLowerCase();
  if(/ยังไง|ยังงัย|อย่างไร|คืออะไร|แค่ไหน|เท่าไห|เท่าไร|ทำไม|ทำไง|ดูอะไร|how |what |why /.test(ql) && intent!=='ingredient_recipe_generate' && intent!=='today_summary' && intent!=='calc_plan' && intent!=='food_swap' && intent!=='budget_menu' && intent!=='cuisine_menu' && intent!=='result_summary' && intent!=='workout_recommend'){ var _kh=searchKnowledge(message); if(_kh.length) return buildKnowledge(message); }
  switch(intent){
    case 'today_summary': return buildToday();
    case 'cuisine_menu': return buildCuisineMenu(message);
    case 'food_swap': return buildSwapReply(message);
    case 'budget_menu': return buildBudgetMenu(message);
    case 'food_recommend': return buildFoodRecommend(message);
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
  var method=''; ['ทอด','ผัด','ย่าง','ต้ม','นึ่ง','อบ','ปิ้ง','ตุ๋น'].forEach(function(m){ if(name.indexOf(m)>=0) method=m; });
  return { id:r.id, name:name, ic:r.ic, ings:r.ings, nutrition:n, tags:tags, goalFit:goalFit, mealFit:mealFit, cuisine:cuisine, budget:budget, method:method };
}
function menuList(){ if(_menuCache) return _menuCache; try{ var rs=fn('allRecipes')?window.allRecipes():(window.IUFIT_RECIPES||[]); _menuCache=rs.map(tagMenu).filter(function(m){ return m.nutrition.kcal>0; }); }catch(e){ _menuCache=[]; } return _menuCache; }
function menuToCard(m){
  var rc={ id:'lib'+m.id, name:m.name, desc:'', nutrition:m.nutrition, score:0,
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
  return { title:L('เมนู'+cz, cz+' menus'),
    message:L('เลือกเมนู'+cz+'ที่เข้ากับเป้าหมายและแคลที่เหลือให้ครับ','Picked '+cz+' menus that fit your goal and remaining calories:'),
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
function buildFoodRecommend(message){
  if(!ingDbOk()) return cantCalcReply();
  return { title:L('อยากได้เมนูแบบไหนดี?','How would you like menus?'),
    message:L('เลือกได้เลยครับ — จะให้จัดจากวัตถุดิบที่คุณมี หรือเลือกจากคลังเมนูสำเร็จก็ได้','Pick one — build from ingredients you have, or choose from the ready menu library:'),
    actions:[
      {label:L('🧺 สร้างจากวัตถุดิบที่มี','🧺 From my ingredients'),action:'open_ingredient_picker'},
      {label:L('📋 ใช้เมนูจากคลัง','📋 From the menu library'),action:'recommend_library'}
    ] };
}
function buildLibraryRecommend(){
  if(!ingDbOk()) return cantCalcReply();
  var recs=recommendMenus({ goal:goalLabel(), meal:currentMeal(), n:4 });
  if(!recs.length){ var picks=popularIngredients(),byGroup=groupBy(picks),pantry=[]; ['protein','carb','vegetable'].forEach(function(g){ (byGroup[g]||[]).slice(0,2).forEach(function(i){ pantry.push(i); }); }); recs=generateRecipes(pantry,{goal:goalLabel(),meal:currentMeal()}); }
  if(!recs.length) return buildKnowledge(message);
  return { title:L('เมนูที่เหมาะกับวันนี้','Menus that fit today'),
    message:L('จากคลังเมนู '+menuList().length.toLocaleString()+' รายการ ผมเลือกที่เข้ากับเป้าหมาย "'+goalLabel()+'" และแคลที่เหลือให้ครับ','From '+menuList().length.toLocaleString()+' menus, here are ones that fit your goal "'+goalLabel()+'" and remaining calories:'),
    recipes:recs.slice(0,3),
    actions:[{label:L('สร้างจากของที่มี','From my ingredients'),action:'open_ingredient_picker'},{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'}] };
}
function buildFoodSearch(message){
  return { title:L('ค้นหาเมนู','Search menus'),
    message:L('เปิดหน้าอาหารแล้วพิมพ์ชื่อเมนูในช่องค้นหาได้เลย คลังมีกว่า 4,500 เมนูพร้อมค่าโภชนาการ','Open Food and type a menu name in search — the library has 4,500+ menus with nutrition.'),
    actions:[{label:L('เปิดหน้าอาหาร','Open Food'),action:'go_food'},{label:L('สร้างเมนูจากของที่มี','Make from ingredients'),action:'open_ingredient_picker'}] };
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
  if(rep.actions&&rep.actions.length){ h+='<div class="iu-mate-actions">'+rep.actions.map(function(a,ai){
    return '<button class="iu-mate-act'+(ai===0?' primary':'')+'" onclick="IUMate.act(\''+a.action+'\','+idx+','+ai+')">'+esc(a.label)+'</button>';
  }).join('')+'</div>'; }
  if(rep.disclaimer) h+='<div class="disc">'+esc(rep.disclaimer)+'</div>';
  if(idx!=null && rep && !rep.noFeedback && !rep.placeSearch){ h+= m.fb ? ('<div class="iu-mate-fbk" style="margin-top:9px;font-size:11px;color:#15a05a">'+esc(L('ขอบคุณสำหรับฟีดแบ็ก 🙏','Thanks for the feedback 🙏'))+'</div>') : ('<div class="iu-mate-fbk" style="display:flex;align-items:center;gap:7px;margin-top:9px"><span style="font-size:10.5px;color:#9aa6bf">'+esc(L('คำตอบนี้ช่วยได้ไหม?','Was this helpful?'))+'</span><button type="button" onclick="IUMate.fb('+idx+',1)" style="border:1px solid #dbe5f5;background:#fff;border-radius:8px;padding:2px 9px;cursor:pointer;font-size:12px">👍 '+esc(L('มีประโยชน์','Helpful'))+'</button><button type="button" onclick="IUMate.fb('+idx+',0)" style="border:1px solid #dbe5f5;background:#fff;border-radius:8px;padding:2px 9px;cursor:pointer;font-size:12px">👎 '+esc(L('ยังไม่ตรง','Not quite'))+'</button></div>'); }
  h+='</div></div></div>';
  return h;
}
function sparkInline(){ return '<span style="color:#0A84FF;width:16px;height:16px;display:inline-grid;place-items:center">'+sparkIcon()+'</span>'; }
function renderMessages(){
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
  r.innerHTML=
   '<div class="iu-mate-backdrop" onclick="IUMate.close()"></div>'+
   '<section class="iu-mate-sheet'+(ST.full?' full':'')+'" role="dialog" aria-label="IU Mate">'+
     '<button type="button" class="iu-mate-grab" onclick="IUMate.close()" aria-label="'+L('ย่อหน้าต่าง','Minimize')+'" title="'+L('ย่อหน้าต่าง','Minimize')+'"></button>'+
     '<header class="iu-mate-header">'+
       '<button class="iu-mate-close" onclick="IUMate.close()" aria-label="close">←</button>'+
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
     '<div class="iu-mate-privacy-note">'+esc(L('ทำงานในเครื่อง • บทสนทนาไม่ถูกบันทึกหรือส่งออกนอกเครื่อง','On-device • conversations are not saved or sent anywhere'))+'</div>'+
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
  open_share:function(){ ST.isOpen=false; closeNow(); try{ if(fn('shareApp')) window.shareApp(); }catch(e){} },
  open_pricing:function(){ ST.isOpen=false; closeNow(); try{ if(fn('pricingPage')) window.pricingPage(); }catch(e){} },
  open_referral:function(){ ST.isOpen=false; closeNow(); try{ if(fn('referralPage')) window.referralPage(); }catch(e){} },
  open_tour:function(){ ST.isOpen=false; closeNow(); try{ if(fn('iuTour')) window.iuTour(true); }catch(e){} },
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
  flow_pick:function(p){ if(p&&p.v!=null) flowAnswer(p.v); },
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
  // c) "more / another"
  if(['food_recommend','cuisine_menu','budget_menu','recommend_library','ingredient_recipe_generate'].indexOf(ST.ctx.intent)>=0 && shortMsg && /อีก|เพิ่ม|อื่น|more|another|other|next/.test(t)){
    return buildLibraryRecommend();
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
function coachClientsList(){ return (S().users||[]).filter(function(u){ return u.tr; }); }
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
  var lines=picks.map(function(x){ return mealEmoji(x.meal)+' '+L(x.meal,mealEN[x.meal])+': '+x.m.name+' ('+x.m.nutrition.kcal+' kcal · P'+x.m.nutrition.protein+')'; });
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
  return shuffleArr(moveCatalog().filter(function(m){
    if(!groupMatch(m.group,key)) return false;
    if(equip==='home' && !(m.eq==='บอดี้เวท'||m.eq==='ยางยืด')) return false;
    if(used[m.nameEn]) return false; return true;
  }));
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
  var split=SPLITS[days]||SPLITS[3], dayTexts=[];
  split.forEach(function(d, di){
    var used={}, tmpl=DAYTMPL[d[1]]||DAYTMPL.full, moves=[];
    tmpl.forEach(function(gp){ var pool=movesForGroup(gp[0], equip, used); for(var k=0;k<gp[1]&&k<pool.length;k++){ used[pool[k].nameEn]=1; moves.push(pool[k]); } });
    if(goal==='lose'){ var cp=movesForGroup('คาร์ดิโอ', equip, used); if(cp[0]){ used[cp[0].nameEn]=1; moves.push(cp[0]); } }
    var lines=moves.map(function(mv){ return '• '+mv.nameEn+' — '+setsReps(goal,mv.cardio)+(mv.source==='custom'?' ⭐':''); });
    dayTexts.push('🗓️ '+L('วันที่ '+(di+1),'Day '+(di+1))+' — '+d[0]+'\n'+(lines.join('\n')||L('(ไม่มีท่าที่ตรงอุปกรณ์)','(no matching moves)')));
  });
  var head=L('โปรแกรมฝึก '+days+' วัน/สัปดาห์ — '+(c.name||'ลูกเทรน'), days+'-day/week program — '+(c.name||'client'));
  var goalLine=L('เป้า: '+goalLabelOf(goal)+' · อุปกรณ์: '+(equip==='home'?'บอดี้เวท (ที่บ้าน)':'ยิม/อุปกรณ์ครบ'),'Goal: '+goalLabelOf(goal)+' · Equipment: '+(equip==='home'?'Bodyweight (home)':'Full gym'));
  var body=goalLine+'\n\n'+dayTexts.join('\n\n');
  ST.ctx={intent:'coach_workout', clientId:c.id, days:days, equip:equip};
  return { title:head, message:body,
    disclaimer:L('ค่าประมาณเพื่อช่วยร่าง โค้ชปรับท่า/เซ็ต/น้ำหนักก่อนส่งได้ · ⭐ = ท่าที่เพิ่มเอง','Estimates to help you draft — adjust moves/sets/load before sending · ⭐ = your custom move'),
    actions:[
      {label:L('🔄 ร่างใหม่','🔄 Redraft'),action:'coach_workout_redraft',payload:{id:c.id,days:days,equip:equip}},
      {label:L('📋 คัดลอกเป็นข้อความ','📋 Copy as text'),action:'copy_text',payload:{text:head+'\n'+body}},
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
      { key:'days', type:'choice', q:L('ฝึกกี่วันต่อสัปดาห์?','How many days per week?'), choices:[[L('3 วัน','3 days'),3],[L('4 วัน','4 days'),4],[L('5 วัน','5 days'),5]] },
      { key:'equip', type:'choice', q:L('ใช้อุปกรณ์แบบไหน?','What equipment?'), choices:[[L('บอดี้เวท (ที่บ้าน)','Bodyweight (home)'),'home'],[L('ยิม/อุปกรณ์ครบ','Full gym'),'gym']] }
    ],
    complete: function(sl){ return buildCoachWorkout(findClientById(sl.client), sl.days, sl.equip); }
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
function askSlot(slot){
  var acts=[];
  if(slot.type==='choice') acts=slotChoices(slot).map(function(c){ return {label:c[0],action:'flow_pick',payload:{v:c[1]}}; });
  acts.push({label:L('ยกเลิก','Cancel'),action:'flow_cancel'});
  pushReply({ title:null, message:slot.q+(slot.type==='num'?L(' (พิมพ์ตัวเลข)',' (type a number)'):''), actions:acts });
}
function flowCurSlot(){ if(!ST.flow) return null; var def=FLOWS[ST.flow.id],r=null; def.slots.forEach(function(s){ if(s.key===ST.flow.cur) r=s; }); return r; }
function flowAnswer(v){ if(!ST.flow) return; var slot=flowCurSlot(); if(!slot) return; ST.flow.slots[slot.key]=v; flowNext(); }
function cancelFlow(){ ST.flow=null; pushBotText(L('ยกเลิกแล้วครับ ถามอย่างอื่นได้เลย','Cancelled — ask me anything else')); }
function flowInput(text){
  var slot=flowCurSlot(); if(!slot){ ST.flow=null; handleMessage(text); return; }
  var t=norm(text);
  if(/^(ยกเลิก|เลิก|cancel|stop|หยุด)/.test(t)){ cancelFlow(); return; }
  if(slot.type==='choice'){
    var m=null; slotChoices(slot).forEach(function(c){ var nc=norm(c[0]); if(nc===t || (''+c[1])===text.trim() || t.indexOf(nc)>=0 || (t.length>=2 && nc.indexOf(t)>=0)) m=c[1]; });
    if(m==null){ if(/ชาย|ผู้ชาย|\bmale\b/.test(t))m='m'; else if(/หญิง|ผู้หญิง|female/.test(t))m='f'; else if(/ลด/.test(t))m='lose'; else if(/เพิ่ม|กล้าม|bulk/.test(t))m='gain'; else if(/รักษา|คงน้ำหนัก|maintain/.test(t))m='keep'; else if(/ปานกลาง|moderate/.test(t))m=1.55; else if(/หนัก|hard/.test(t))m=1.725; else if(/เบา|light/.test(t))m=1.375; else if(/แทบไม่|นั่ง|sedentary/.test(t))m=1.2; }
    if(m==null){ pushBotText(L('เลือกจากตัวเลือกด้านบนได้เลยครับ','Please pick one of the options above')); return; }
    flowAnswer(m);
  } else {
    var mm=(''+text).match(/\d+(\.\d+)?/); var n=mm?parseFloat(mm[0]):NaN;
    if(isNaN(n)){ pushBotText(L('พิมพ์เป็นตัวเลขนะครับ','Please type a number')); return; }
    if(slot.min!=null && (n<slot.min||n>slot.max)){ pushBotText(L('ค่าน่าจะอยู่ระหว่าง '+slot.min+'–'+slot.max+' ลองใหม่นะครับ','Should be '+slot.min+'–'+slot.max+', try again')); return; }
    flowAnswer(n);
  }
}
function handleMessage(text){
  text=(text||'').trim(); if(!text) return;
  if(ST.flow){ pushUser(text); flowInput(text); return; }
  pushUser(text); pushTyping();
  setTimeout(function(){ popTyping();
    var fu=null; try{ fu=resolveFollowup(text); }catch(e){}
    if(fu){ pushReply(fu); return; }
    var intent=detectIntent(text); try{ bumpStat('intent:'+intent); }catch(e){}
    if(intent==='make_plan'){ try{ startFlow('plan', parseProfileFromText(text)); }catch(e){} ST.ctx={intent:'make_plan'}; return; }
    if(intent==='coach_menu' && role()==='coach'){ try{ startCoachMenu(); }catch(e){} return; }
    if(intent==='coach_workout' && role()==='coach'){ try{ startCoachWorkout(); }catch(e){} return; }
    var reply; try{ reply=buildReply(intent,text); }catch(e){ reply=buildFallback(text); } try{ if(reply) reply._intent=intent; }catch(e){}
    try{ ST.ctx={intent:intent}; if(intent==='cuisine_menu') ST.ctx.lastCuisine=true; }catch(e){}
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
    if(!ST.messages.length){ ST.messages.push({role:'botText',text:greeting()}); var _nz=proactiveNudge(); if(_nz){ ST.messages.push({role:'bot',reply:_nz,idx:ST.messages.length}); } } ST._nudgeSeen=true;
    renderSheet(); renderFab();
    setTimeout(function(){ var inp=document.getElementById('iuMateInput'); /* no autofocus to avoid keyboard jump on open */ }, 50);
  },
  close:function(){ closeNow(); },
  toggleFull:function(){ ST.full=!ST.full; renderSheet(); },
  chip:function(q){ try{ bumpStat('chip:'+q); }catch(e){} handleMessage(q); },
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
  _amt:function(idx,dir){ previewAmt(idx,dir); },
  _previewAdd:function(rid){ modalClose(); confirmAddRecipe(rid); },
  _sex:function(x){ readCalcInputs(); ST.calc.sex=x; openCalcForm(ST.calc); },
  _goal:function(x){ readCalcInputs(); ST.calc.goal=x; openCalcForm(ST.calc); },
  _calc:function(){ readCalcInputs(); var p=ST.calc||{}; if(p.w==null||p.h==null||p.age==null||p.sex==null){ appToast(L('กรอกเพศ อายุ ส่วนสูง น้ำหนักให้ครบก่อนครับ','Please fill sex, age, height and weight')); return; } if(!(p.age>=10&&p.age<=100)||!(p.h>=120&&p.h<=220)||!(p.w>=30&&p.w<=250)){ appToast(L('ตรวจค่าอีกครั้ง: อายุ 10–100 ปี · สูง 120–220 ซม. · หนัก 30–250 กก.','Check values: age 10–100 · height 120–220 cm · weight 30–250 kg')); return; } modalClose(); if(!ST.isOpen) IUMate.open('global'); pushReply(calcReply(p)); },
  acceptConsent:function(){ ST.flow=null; ST.ctx=null; var coachData=true; var cb=document.getElementById('iuMateCoachConsent'); if(cb) coachData=!!cb.checked; saveConsent(coachData); ST.messages=[]; ST.messages.push({role:'botText',text:greeting()}); renderSheet(); renderFab(); },
  declineConsent:function(){ closeNow(); },
  showPrivacy:function(){ showConfirm({ title:L('ความเป็นส่วนตัว','Privacy'), body:L('IU Mate ทำงานในเครื่อง บทสนทนาไม่ถูกบันทึกหรือส่งออกนอกเครื่อง และอ่านข้อมูลในแอปเพื่อช่วยสรุปเท่านั้น','IU Mate runs on-device. Conversations are not saved or sent anywhere, and it only reads your in-app data to help summarize.'), yes:L('เพิกถอนความยินยอม','Withdraw consent'), onYes:function(){ revokeConsent(); appToast(L('เพิกถอนความยินยอมแล้ว','Consent withdrawn')); closeNow(); } }); },
  _sync:function(){ try{ renderFab(); }catch(e){} try{ injectEntryPoints(); }catch(e){} },
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