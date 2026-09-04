import{aN as N,aO as k,aP as g}from"./index-B_KZdB55.js";import"./vendor-BpU7Vbpv.js";const T={type:"OBJECT",properties:{nameTh:{type:"STRING"},nameEn:{type:"STRING"},category:{type:"STRING"},serving:{type:"STRING"},kcal:{type:"NUMBER"},protein:{type:"NUMBER"},fat:{type:"NUMBER"},carb:{type:"NUMBER"},note:{type:"STRING"}},required:["nameTh","kcal","protein","fat","carb"]},o={kcal:[1,3e3],prot:[0,300],fat:[0,300],carb:[0,500]};function i(n){const r=typeof n=="number"?n:Number(String(n??"").replace(/[^\d.]/g,""));return Number.isFinite(r)?r:NaN}function s(n,[r,t]){return Number.isFinite(n)&&n>=r&&n<=t}function h(n,r){return`คุณเป็นฐานข้อมูลโภชนาการ ตอบเป็น JSON ตามสคีมาเท่านั้น ห้ามมีข้อความอื่น
เมนู: "${n}"
ให้ค่าโภชนาการโดยประมาณของ **หนึ่งที่/หนึ่งจานตามที่คนไทยกินจริง** (ไม่ใช่ต่อ 100 กรัม)
kcal · protein · fat · carb เป็นตัวเลขล้วน หน่วยกรัมสำหรับสารอาหาร
nameTh = ชื่อไทยของเมนู · nameEn = ชื่ออังกฤษ (ว่างได้ถ้าไม่มีที่ใช้กันจริง)
category = หมวดสั้น ๆ เช่น "อาหารจานเดียว" "ของหวาน" "เครื่องดื่ม"
serving = ขนาดหนึ่งที่ เช่น "1 จาน (~350 ก.)"
note = ที่มาหรือข้อสังเกตสั้น ๆ ไม่เกินหนึ่งประโยค
`+(r==="en"?`Write nameTh in Thai and note in English.
`:`เขียน note เป็นภาษาไทย
`)+"ถ้าไม่รู้จักเมนูนี้จริง ๆ ให้ kcal = 0"}async function d(n,r="th"){const t=String(n||"").trim();if(!t)return{ok:!1,reason:"no_answer"};let c;try{c=await N(h(t,r),T,k,"simple")}catch(u){return u instanceof g?{ok:!1,reason:"ai_error"}:{ok:!1,reason:"ai_error"}}const e=c.json;if(!e)return{ok:!1,reason:"no_answer"};const p=Math.round(i(e.kcal)),f=Math.round(i(e.protein)*10)/10,m=Math.round(i(e.fat)*10)/10,l=Math.round(i(e.carb)*10)/10;if(!s(p,o.kcal)||!s(f,o.prot)||!s(m,o.fat)||!s(l,o.carb))return{ok:!1,reason:"out_of_range"};const a=(u,y=60)=>String(u??"").trim().slice(0,y);return{ok:!0,model:c.model,draft:{n:a(e.nameTh)||t,ne:a(e.nameEn),c:a(e.category,40)||(r==="en"?"My menu":"เมนูของฉัน"),serving:a(e.serving,40),kcal:p,prot:f,fat:m,carb:l,note:a(e.note,160)}}}export{d as lookupMenuNutrition};
