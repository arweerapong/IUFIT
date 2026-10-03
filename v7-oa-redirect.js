/* v7-oa-redirect.js — หน้า LINE OA เก่า → เข้าแอปทันที · 2026-10-03 (คำตอบเจ้าของ prototype-audit คำถาม 2)
 * ══════════════════════════════════════════════════════════════════════════════════════
 * โหลดต่อจาก v7-web-flags.js บนสุดของ <head> ใน billing · pricing · my-plan · onboarding · open
 * - หน้าขาย v7.5 เปิด (`IUFIT_V7_PACK`) ⇒ `location.replace('/coach/pack[?sheet=credit]')`
 *   แอปตัดสินต่อเอง: โค้ช = หน้าแพ็กใหม่ · ไม่ใช่โค้ช = หน้าแรก · ยังไม่ล็อกอิน = /start
 * - เติมเครดิต (`mode=credit` · `next=billing` · billing.html) ⇒ ชีตเติมเครดิต
 * - ยกเว้นขากลับ Omise (`?ref=` / `?result=`) — ต้องจบรายการที่เริ่มบนเว็บให้ได้
 * - ธงปิด / ไฟล์ธงโหลดไม่ได้ = หน้าเดิม 100%
 * ⚠️ แยกเป็นไฟล์ (ไม่ใช่ inline) โดยตั้งใจ: ด่าน verify-billing-guard ดึง inline script ของหน้าตามลำดับ
 */
(function () {
  try {
    if (window.IUFIT_V7_PACK !== true || typeof window.iufitPackUrl !== 'function') return;
    var q = new URLSearchParams(location.search);
    if (q.get('ref') || q.get('result')) return;
    var credit = q.get('mode') === 'credit' || q.get('next') === 'billing' || /billing\.html$/.test(location.pathname);
    location.replace(window.iufitPackUrl(credit ? 'credit' : ''));
  } catch (e) {
    /* หน้าเดิมทำงานต่อ */
  }
})();
