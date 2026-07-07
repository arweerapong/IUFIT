/*! IUFIT food-icon-normalizer — normalizeFoodName()  (deterministic, no AI/API)
 * ทำความสะอาดชื่อเมนู: ช่องว่าง, ตัวพิมพ์, ตัวคูณ/ขนาด/จำนวน, คำขยาย, รวมสะกดหลายแบบ
 * ห้ามลบคำที่มีผลต่อ "ตระกูลอาหาร" หรือ "โปรตีน"
 */
(function (root) {
  'use strict';

  // คำสะกดผิด/หลายแบบ → รูปเดียว (char/word-level, ปลอดภัยต่อ substring)
  var SPELL = [
    ['กระเพรา', 'กะเพรา'], ['กะเพา', 'กะเพรา'], ['กระเพา', 'กะเพรา'],
    ['เกียมอี๋', 'เกี๊ยมอี๋'], ['ก๋วยเตี้ยว', 'ก๋วยเตี๋ยว'], ['กวยเตี๋ยว', 'ก๋วยเตี๋ยว'],
    ['เส้นหมี', 'เส้นหมี่'], ['หมี่กรอบ', 'หมี่กรอบ'],
    ['สปาเก็ตตี้', 'สปาเกตตี'], ['สปาเกตตี้', 'สปาเกตตี'], ['สปาเก็ตตี', 'สปาเกตตี'],
    ['ผัดไท', 'ผัดไทย'], ['โจ๊ก', 'โจ๊ก'],
    ['ต้มยํา', 'ต้มยำ'], ['ต้มยัม', 'ต้มยำ'],
    ['สมตำ', 'ส้มตำ'], ['ส้มตํา', 'ส้มตำ'], ['ตําไทย', 'ตำไทย'],
    ['ชานมไข่มุก', 'ชานมไข่มุก'], ['ชาไข่มุก', 'ชานมไข่มุก'],
    ['เฟรนช์ฟราย', 'เฟรนช์ฟรายส์'], ['เฟรนฟราย', 'เฟรนช์ฟรายส์'],
    ['แซลม่อน', 'แซลมอน'], ['แซลมอลน', 'แซลมอน'], ['ซัลม่อน', 'แซลมอน'],
    ['ไข่เจียว', 'ไข่เจียว'], ['เจียว', 'เจียว'],
    ['อโวคาโด', 'อะโวคาโด'], ['อาโวคาโด', 'อะโวคาโด'], ['อโวคาโด้', 'อะโวคาโด'],
    ['โปรตีนเชค', 'โปรตีนเชค'], ['เวย์เชค', 'เวย์โปรตีนเชค'],
    ['ลาเต้', 'ลาเต้'], ['อเมริกาโน่', 'อเมริกาโน'], ['คาปูชิโน่', 'คาปูชิโน'],
    ['มัทฉะ', 'มัทฉะ'], ['มัชฉะ', 'มัทฉะ'], ['มัจฉะ', 'มัทฉะ']
  ];

  // คำขยาย/รส/ปริมาณ ที่ตัดออกได้ (ไม่กระทบตระกูล/โปรตีน)
  // NB: เย็น/ร้อน/ปั่น เก็บไว้ (matcher จัดการ) เพราะบางเมนูใช้เป็นสัญญาณเครื่องดื่ม
  var MODIFIERS = [
    'พิเศษ', 'ธรรมดา', 'เพิ่มพิเศษ', 'จัดเต็ม', 'เมนูแนะนำ',
    'อร่อย', 'เด็ด', 'ต้นตำรับ', 'สูตรโบราณ', 'โฮมเมด', 'สไตล์',
    'ไม่หวาน', 'หวานน้อย', 'หวานปกติ', 'ลดหวาน', 'ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดมาก',
    'ไซส์', 'ขนาด', 'จานใหญ่', 'จานเล็ก', 'ถ้วยใหญ่', 'ถ้วยเล็ก', 'แก้วใหญ่', 'แก้วเล็ก'
  ];
  // ขนาด S/M/L, ตัวคูณ, จำนวน
  var RE_SIZE = /\b(size\s*)?(s|m|l|xl)\b/gi;
  var RE_MULT = /[x×]\s*\d+/gi;
  var RE_QTY = /\d+\s*(ชิ้น|แก้ว|จาน|ถ้วย|ที่|อัน|กล่อง|ถุง|ลูก|ฟอง|ห่อ)/g;
  var RE_TRAILNUM = /\s*\(?\s*\d+(\.\d+)?\s*(กรัม|g|ml|ซีซี|cc|กิโล|กก)?\s*\)?\s*$/gi;

  function normalizeFoodName(name) {
    var s = String(name == null ? '' : name);
    // 1) unify whitespace + trim
    s = s.replace(/[ \t\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
    // 2) latin → lower (Thai unaffected)
    s = s.replace(/[A-Z]+/g, function (m) { return m.toLowerCase(); });
    // 3) spelling merge (before token strip)
    for (var i = 0; i < SPELL.length; i++) {
      if (s.indexOf(SPELL[i][0]) > -1) s = s.split(SPELL[i][0]).join(SPELL[i][1]);
    }
    // 4) strip qty/size/mult
    s = s.replace(RE_QTY, ' ').replace(RE_MULT, ' ').replace(RE_SIZE, ' ').replace(RE_TRAILNUM, ' ');
    // 5) strip modifier words
    for (var j = 0; j < MODIFIERS.length; j++) {
      if (s.indexOf(MODIFIERS[j]) > -1) s = s.split(MODIFIERS[j]).join(' ');
    }
    // 6) normalize separators "+" and "/" keep as space-joined tokens (base additions matter)
    s = s.replace(/\s*\+\s*/g, ' ').replace(/\s{2,}/g, ' ').trim();
    return s;
  }

  var api = { normalizeFoodName: normalizeFoodName };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IUFIT_normalizeFoodName = normalizeFoodName; root.IUFIT_foodNormalizer = api; }
})(typeof window !== 'undefined' ? window : this);
