/* v7-web-flags.js — ธงของแอปที่หน้าเว็บ LINE OA (นอกแอป Vue) ต้องรู้ · 2026-10-02
 * ══════════════════════════════════════════════════════════════════════════════════════
 * คำตัดสินเจ้าของ: "หน้าแพ็กใช้ลิงก์เดิมทั้งหมด" ⇒ ลิงก์เก่า (my-plan · open.html?next=billing ·
 * billing.html · pricing.html · onboarding.html) ต้องพาโค้ชไปหน้าแพ็กใหม่ของแอป **เมื่อหน้าขาย v7.5 เปิด**
 *
 * ⚠️ ค่าในไฟล์ต้นทางนี้ = false เสมอ (ปลอดภัย = หน้าเว็บทำงานแบบเดิม 100%)
 *    `scripts/copy-line-oa.mjs` เขียนค่าจริงลง dist ตอน build จาก `src/config/v7Flags.ts`
 *    (= `V7_GATE_ON && V7_COACH_ME_ON` ตาราง REQUIRES) — ห้ามแก้ค่าในไฟล์นี้ด้วยมือ
 * ⚠️ สวิตช์ปิดฉุกเฉินระยะไกล (`/ops/v7kill`) ไม่มีผลกับหน้าเว็บนี้ — ปิดถาวร = แก้ธง → build → UP-WEB
 * ไฟล์โหลดไม่ขึ้น = ไม่มี `IUFIT_V7_PACK` ⇒ หน้าเว็บถือว่า "ปิด" (เดิม)
 */
window.IUFIT_V7_PACK = false;
/** ลิงก์หน้าแพ็กใหม่ในแอป (ลิงก์เดิมของแอป · `sheet=credit|seats` เปิดชีตตามเดิม) */
window.iufitPackUrl = function (sheet) {
  return '/coach/pack' + (sheet === 'credit' || sheet === 'seats' ? '?sheet=' + sheet : '');
};
