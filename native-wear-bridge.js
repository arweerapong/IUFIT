/* IUFIT native → web bridge (Capacitor · Health Connect)
 * วาง <script src="native-wear-bridge.js"></script> ในหน้าแอป · ทำงานเฉพาะเมื่อรันใน Capacitor native
 * หน้าที่: ขอ permission Health Connect → อ่าน steps/dist/calories/hr/sleep/workouts ของวันนี้ → window.wearIngest()
 *
 * ⚠️ VERIFY: ชื่อ method/record อิงปลั๊กอิน `capacitor-health-connect` (ubie-oss)
 *    community plugin เปลี่ยนบ่อย — เทียบกับ README เวอร์ชันที่ install จริง ตรงจุด // VERIFY
 * contract แอปรับ: wearIngest({date,steps,kcalOut,actMin,hr:{rest,avg},sleep:{min,score},workouts:[{type,min,kcal,ts}],dist,src})
 */
(function () {
  var Cap = window.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  if (!isNative) return;
  var HC = (Cap.Plugins && (Cap.Plugins.HealthConnect || Cap.Plugins.CapacitorHealthConnect)) || null; // VERIFY plugin name

  function ymd(dt){ dt = dt || new Date(); return dt.getFullYear()+'-'+('0'+(dt.getMonth()+1)).slice(-2)+'-'+('0'+dt.getDate()).slice(-2); }
  function dayRange(dt){ var s=new Date(dt||Date.now()); s.setHours(0,0,0,0); var e=new Date(s); e.setDate(e.getDate()+1);
    return { startTime: s.toISOString(), endTime: e.toISOString() }; }

  // exerciseType (Health Connect) → key ที่ _WEAR_SPORTS รู้จัก  // VERIFY: HC ส่ง exerciseType เป็นอะไร
  var SPORT = { running:'run', walking:'walk', hiking:'hike', biking:'cycle', biking_stationary:'cycle',
    swimming_pool:'swim', swimming_open_water:'swim', badminton:'badminton', football_soccer:'football',
    basketball:'basketball', yoga:'yoga', strength_training:'strength', weightlifting:'strength',
    rope_skipping:'rope', elliptical:'cardio', pilates:'yoga', dancing:'cardio' };
  function sportKey(t){ return SPORT[String(t||'').toLowerCase()] || 'other'; }

  var READ = ['Steps','Distance','TotalCaloriesBurned','ActiveCaloriesBurned','HeartRate','SleepSession','ExerciseSession'];

  async function ensurePerms(){
    if(!HC) return false;
    try{ var a = await HC.checkAvailability();  // VERIFY {availability:'Available'|'NotInstalled'|'NotSupported'}
      if(a && a.availability && a.availability!=='Available'){ console.warn('[wear] HC:', a.availability); return false; } }catch(e){}
    try{ var chk = await HC.checkHealthPermissions({ read: READ, write: [] }); // VERIFY
      if(chk && chk.hasAllPermissions) return true; }catch(e){}
    try{ await HC.requestHealthPermissions({ read: READ, write: [] }); // VERIFY (แสดง UI ขอสิทธิ์)
      var chk2 = await HC.checkHealthPermissions({ read: READ, write: [] });
      return !!(chk2 && chk2.hasAllPermissions);
    }catch(e){ console.warn('[wear] perm error', e); return false; }
  }

  async function readType(type, range){
    try{ var r = await HC.readRecords({ type: type, timeRangeFilter: { type:'between', startTime: range.startTime, endTime: range.endTime } }); // VERIFY
      return (r && r.records) || []; }catch(e){ return []; }
  }
  function num(v){ v = (v && (v.value!=null ? v.value : v)); v = parseFloat(v); return isNaN(v) ? 0 : v; }

  // อ่าน Health Connect ของวัน → object contract // VERIFY field: count/energy/distance/beatsPerMinute
  async function readHealth(dt){
    if(!HC) return null;
    var range = dayRange(dt);
    var steps=0, dist=0, kcalOut=0, actCal=0, hrSum=0, hrN=0, hrMin=999, sleepMin=0, workouts=[];
    (await readType('Steps', range)).forEach(function(x){ steps += num(x.count); });
    (await readType('Distance', range)).forEach(function(x){ dist += num(x.distance); });          // meters
    (await readType('TotalCaloriesBurned', range)).forEach(function(x){ kcalOut += num(x.energy); }); // kcal
    (await readType('ActiveCaloriesBurned', range)).forEach(function(x){ actCal += num(x.energy); });
    (await readType('HeartRate', range)).forEach(function(x){ (x.samples||[]).forEach(function(s){
        var bpm = num(s.beatsPerMinute); if(bpm>0){ hrSum+=bpm; hrN++; if(bpm<hrMin) hrMin=bpm; } }); });
    (await readType('SleepSession', range)).forEach(function(x){
        var s=new Date(x.startTime), e=new Date(x.endTime); if(e>s) sleepMin += Math.round((e-s)/60000); });
    (await readType('ExerciseSession', range)).forEach(function(x){
        var s=new Date(x.startTime), e=new Date(x.endTime); var min = (e>s)?Math.round((e-s)/60000):0;
        workouts.push({ type: sportKey(x.exerciseType), min: min, kcal: 0, ts: s.getTime() }); });
    return {
      steps: Math.round(steps),
      dist: Math.round(dist/100)/10,                 // m → km
      kcalOut: Math.round(kcalOut || actCal),
      actMin: Math.round(actCal>0 ? actCal/6 : 0),   // ประมาณ (ปรับสูตรได้)
      hr: hrN ? { avg: Math.round(hrSum/hrN), rest: (hrMin<999?hrMin:null) } : null,
      sleep: sleepMin ? { min: sleepMin, score: null } : null,
      workouts: workouts
    };
  }

  function push(dateStr, data, src){
    if (!data || typeof window.wearIngest !== 'function') return;
    window.wearIngest({ date: dateStr, steps: data.steps, dist: data.dist, kcalOut: data.kcalOut,
      actMin: data.actMin, hr: data.hr, sleep: data.sleep, workouts: data.workouts || [], src: src || 'healthconnect' });
  }

  var _busy = false;
  async function syncToday(){
    if(_busy || !HC) return; _busy = true;
    try{ var okp = await ensurePerms(); if(okp){ var h = await readHealth(new Date()); if(h) push(ymd(), h, 'healthconnect'); } }
    catch(e){ /* เงียบ ไม่ให้แอปพัง */ }
    _busy = false;
  }

  window.addEventListener('load', function(){ setTimeout(syncToday, 1500); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) syncToday(); });
  // ชั้น 3: HBand BLE ตรง (custom plugin ยิง event 'iufitWear')
  window.addEventListener('iufitWear', function (ev) { try { push(ymd(), ev.detail, 'hband'); } catch (e) {} });

  window.IUFIT_WEAR_BRIDGE = { syncToday: syncToday, readHealth: readHealth, version: 'hc-1' };
  console.log('[wear] Health Connect bridge ready ·', HC ? 'plugin ok' : 'plugin NOT found');
})();
