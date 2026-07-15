/* IUFIT native → web bridge (Capacitor · Health Connect via ubie-oss capacitor-health-connect@0.7.0)
 * ปลั๊กอินนี้รองรับ RecordType จำกัด: Steps, ActiveCaloriesBurned, HeartRateSeries, RestingHeartRate, Weight, BodyFat ...
 * ไม่รองรับ: HeartRate(ใช้ HeartRateSeries), Distance, TotalCaloriesBurned, SleepSession, ExerciseSession
 *   → อ่านได้: ก้าว + แคลอรี(active) + หัวใจ · ระยะทางประมาณจากก้าว · นอน/เวิร์กเอาต์ไม่มีในปลั๊กอินนี้
 * contract: wearIngest({date,steps,dist,kcalOut,actMin,hr:{rest,avg},sleep,workouts,src})
 */
(function () {
  var Cap = window.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  if (!isNative) return;
  var HC = (Cap.Plugins && (Cap.Plugins.HealthConnect || Cap.Plugins.CapacitorHealthConnect)) || null;

  function ymd(dt){ dt = dt || new Date(); return dt.getFullYear()+'-'+('0'+(dt.getMonth()+1)).slice(-2)+'-'+('0'+dt.getDate()).slice(-2); }
  function dayRange(dt){ var s=new Date(dt||Date.now()); s.setHours(0,0,0,0); var e=new Date(s); e.setDate(e.getDate()+1);
    return { type:'between', startTime: s.toISOString(), endTime: e.toISOString() }; }

  // เฉพาะ type ที่ปลั๊กอินรองรับ + มี permission ใน AndroidManifest แล้ว (READ_STEPS/ACTIVE_CALORIES/HEART_RATE)
  var READ = ['Steps', 'ActiveCaloriesBurned', 'HeartRateSeries'];

  function num(v){ v = (v && (v.value!=null ? v.value : v)); v = parseFloat(v); return isNaN(v) ? 0 : v; }
  function energyKcal(e){ if(e==null) return 0; var v=num(e); var u=((e&&e.unit)||'').toLowerCase();
    if(u.indexOf('kilocal')>=0) return v; if(u==='calories') return v/1000; if(u==='joules') return v/4184; if(u==='kilojoules') return v/4.184; return v; }

  async function ensurePerms(){
    if(!HC) return false;
    try{ var a = await HC.checkAvailability();
      if(a && a.availability && a.availability!=='Available'){ console.warn('[wear] HC:', a.availability); return false; } }catch(e){}
    try{ var chk = await HC.checkHealthPermissions({ read: READ, write: [] });
      if(chk && chk.hasAllPermissions) return true; }catch(e){ console.warn('[wear] check err', e); }
    try{ await HC.requestHealthPermissions({ read: READ, write: [] });
      var chk2 = await HC.checkHealthPermissions({ read: READ, write: [] });
      return !!(chk2 && chk2.hasAllPermissions);
    }catch(e){ console.warn('[wear] perm error', e); return false; }
  }

  async function readType(type, range){
    try{ var r = await HC.readRecords({ type: type, timeRangeFilter: range });
      return (r && r.records) || []; }catch(e){ return []; }
  }

  async function readHealth(dt){
    if(!HC) return null;
    var range = dayRange(dt);
    var steps=0, kcalOut=0, hrSum=0, hrN=0, hrMin=999;
    (await readType('Steps', range)).forEach(function(x){ steps += num(x.count); });
    (await readType('ActiveCaloriesBurned', range)).forEach(function(x){ kcalOut += energyKcal(x.energy); });
    (await readType('HeartRateSeries', range)).forEach(function(x){ (x.samples||[]).forEach(function(s){
        var bpm = num(s.beatsPerMinute); if(bpm>0){ hrSum+=bpm; hrN++; if(bpm<hrMin) hrMin=bpm; } }); });
    return {
      steps: Math.round(steps),
      dist: Math.round(steps*0.000762*100)/100,          // ประมาณ กม. จากก้าว (ปลั๊กอินไม่มี Distance)
      kcalOut: Math.round(kcalOut),
      actMin: Math.round(kcalOut>0 ? kcalOut/6 : 0),
      hr: hrN ? { avg: Math.round(hrSum/hrN), rest: (hrMin<999?hrMin:null) } : null,
      sleep: null,      // ปลั๊กอินไม่มี SleepSession
      workouts: []      // ปลั๊กอินไม่มี ExerciseSession
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
  window.addEventListener('iufitWear', function (ev) { try { push(ymd(), ev.detail, 'hband'); } catch (e) {} });

  window.IUFIT_WEAR_BRIDGE = { syncToday: syncToday, readHealth: readHealth, version: 'hc-2' };
  console.log('[wear] Health Connect bridge ready ·', HC ? 'plugin ok' : 'plugin NOT found');
})();
