/* IUFIT native → web bridge (Capacitor · Health Connect via @capgo/capacitor-health v8)
 * รองรับครบ: steps, distance, calories, heartRate, sleep (+ workouts เพิ่มทีหลังได้)
 * ทำงานเฉพาะในแอป native (Capacitor) · เบราว์เซอร์ข้าม
 * contract: wearIngest({date,steps,dist,kcalOut,actMin,hr:{rest,avg},sleep:{min,score},workouts,src})
 */
(function () {
  var Cap = window.Capacitor;
  var isNative = !!(Cap && Cap.isNativePlatform && Cap.isNativePlatform());
  if (!isNative) return;

  var P = (Cap.Plugins) || {};
  var HC = null;
  ['Health', 'CapacitorHealth', 'HealthPlugin'].forEach(function (n) {
    if (!HC && P[n] && (P[n].requestAuthorization || P[n].readSamples)) HC = P[n];
  });
  if (!HC) { Object.keys(P).forEach(function (k) { if (!HC && P[k] && P[k].requestAuthorization && P[k].readSamples) HC = P[k]; }); }

  function ymd(dt) { dt = dt || new Date(); return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); }
  function dayISO(dt) { var s = new Date(dt || Date.now()); s.setHours(0, 0, 0, 0); var e = new Date(s); e.setDate(e.getDate() + 1); return { start: s.toISOString(), end: e.toISOString() }; }

  var READ = ['steps', 'distance', 'calories', 'heartRate', 'sleep', 'workouts'];

  async function ensurePerms() {
    if (!HC) return false;
    try { var a = await HC.isAvailable(); if (a && a.available === false) { console.warn('[wear] HC unavailable:', a.reason); return false; } } catch (e) {}
    try {
      var st = null;
      try { st = await HC.checkAuthorization({ read: READ, write: [] }); } catch (e) {}
      var have = (st && st.readAuthorized) || [];
      var need = READ.filter(function (t) { return have.indexOf(t) < 0; });
      // ขอสิทธิ์เฉพาะตอนที่ยังไม่ได้ครบ (Android จำกัดจำนวนครั้งที่ขอได้)
      if (!st || need.length) { st = await HC.requestAuthorization({ read: READ, write: [] }); }
      var ok = (st && st.readAuthorized) || [];
      console.log('[wear] auth granted:', ok.join(',') || '(none)');
      return ok.length > 0;
    } catch (e) { console.warn('[wear] auth err', e); return false; }
  }

  async function aggSum(type, r) {
    try { var o = await HC.queryAggregated({ dataType: type, startDate: r.start, endDate: r.end, bucket: 'day', aggregation: 'sum' });
      return ((o && o.samples) || []).reduce(function (a, x) { return a + (+x.value || 0); }, 0); } catch (e) { return 0; }
  }
  async function aggAvg(type, r) {
    try { var o = await HC.queryAggregated({ dataType: type, startDate: r.start, endDate: r.end, bucket: 'day', aggregation: 'average' });
      var s = (o && o.samples) || []; return s.length ? (s.reduce(function (a, x) { return a + (+x.value || 0); }, 0) / s.length) : 0; } catch (e) { return 0; }
  }
  async function sleepMin(r) {
    try { var o = await HC.readSamples({ dataType: 'sleep', startDate: r.start, endDate: r.end });
      return ((o && o.samples) || []).reduce(function (a, x) { return a + (+x.value || 0); }, 0); } catch (e) { return 0; }
  }
  async function readWk(r) {
    try { var o = await HC.queryWorkouts({ startDate: r.start, endDate: r.end, limit: 50 });
      return ((o && o.workouts) || []).map(function (w) {
        return { type: String(w.workoutType || 'other'), min: Math.round((+w.duration || 0) / 60), kcal: Math.round(+w.totalEnergyBurned || 0), ts: new Date(w.startDate).getTime() };
      }); } catch (e) { return []; }
  }

  async function readHealth(dt) {
    if (!HC) return null;
    var r = dayISO(dt);
    var steps = await aggSum('steps', r);
    var distM = await aggSum('distance', r);
    var kcal  = await aggSum('calories', r);
    var hrAvg = await aggAvg('heartRate', r);
    var slp   = await sleepMin(r);
    var wk    = await readWk(r);
    return {
      steps: Math.round(steps),
      dist: Math.round(distM / 100) / 10,
      kcalOut: Math.round(kcal),
      actMin: Math.round(kcal > 0 ? kcal / 6 : 0),
      hr: hrAvg > 0 ? { avg: Math.round(hrAvg), rest: null } : null,
      sleep: slp > 0 ? { min: Math.round(slp), score: null } : null,
      workouts: wk
    };
  }

  function push(dateStr, data, src) {
    if (!data || typeof window.wearIngest !== 'function') return;
    window.wearIngest({ date: dateStr, steps: data.steps, dist: data.dist, kcalOut: data.kcalOut,
      actMin: data.actMin, hr: data.hr, sleep: data.sleep, workouts: data.workouts || [], src: src || 'healthconnect' });
  }

  var _busy = false;
  async function syncToday() {
    if (_busy || !HC) return; _busy = true;
    try { var okp = await ensurePerms(); if (okp) { var h = await readHealth(new Date()); if (h) { console.log('[wear] read', JSON.stringify({ steps: h.steps, dist: h.dist, kcal: h.kcalOut, hr: h.hr, sleep: h.sleep, wk: (h.workouts || []).length })); push(ymd(), h, 'healthconnect'); } } }
    catch (e) {}
    _busy = false;
  }

  window.addEventListener('load', function () { setTimeout(syncToday, 1500); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) syncToday(); });
  window.addEventListener('iufitWear', function (ev) { try { push(ymd(), ev.detail, 'hband'); } catch (e) {} });

  window.IUFIT_WEAR_BRIDGE = { syncToday: syncToday, readHealth: readHealth, version: 'capgo-1' };
  console.log('[wear] Health bridge (capgo) ready ·', HC ? 'plugin ok' : 'plugin NOT found');
})();
