import{bz as c,bA as a}from"./index-DJcMc50R.js";/*!
 * IUFIT · lib/iuMateFeedback — 👍/👎 ต่อคำตอบ IU Mate (เก็บในเครื่องเท่านั้น)
 *
 * พอร์ตจาก vanilla `IUMate.fb(idx, up)` → `localStorage['iufit_iu_mate_feedback']`
 * ใช้เป็นตัวอย่างที่มนุษย์รีวิวเพื่อขยาย INTENT/KB — **ไม่ใช่** fine-tune LLM อัตโนมัติ
 *
 * ข้อผูกพันความเป็นส่วนตัวเดียวกับ `iuMateLog.ts`:
 *   · ไม่มี fetch / sendBeacon
 *   · คีย์ขึ้นต้น `iufit_` (ถูกลบพร้อมบัญชี)
 *   · ไม่เข้าไฟล์สำรอง (SIDE_KEYS)
 */const s="iufit_iu_mate_feedback",i=300;function f(t){if(!t||typeof t!="object")return!1;const e=t;return typeof e.msgId=="string"&&typeof e.intent=="string"&&(e.vote==="up"||e.vote==="down")&&typeof e.ts=="number"}function r(){try{const t=c(s);if(!t)return[];const e=JSON.parse(t);return Array.isArray(e)?e.filter(f).slice(-i):[]}catch{return[]}}function u(t){a(s,JSON.stringify(t.slice(-i)))}function l(t){const e=r().filter(o=>o.msgId!==t.msgId),n={msgId:t.msgId,intent:t.intent||"unknown",vote:t.vote,score:typeof t.score=="number"?t.score:void 0,ts:Date.now()};return e.push(n),u(e),n}function y(t){const e=r().find(n=>n.msgId===t);return e?e.vote:null}function g(){return JSON.stringify({v:1,exportedAt:new Date().toISOString(),note:"Local IU Mate reply ratings — opt-in export only; not auto-uploaded.",entries:r()},null,2)}function m(){const t=r();let e=0,n=0;for(const o of t)o.vote==="up"?e+=1:n+=1;return{up:e,down:n,total:t.length}}export{g as e,m as f,y as g,l as s};
