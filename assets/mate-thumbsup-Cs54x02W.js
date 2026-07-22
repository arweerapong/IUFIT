/*!
 * IUFIT · lib/exportCard — PNG export + native share for the result-card
 * gallery, per result-cards/14-share-flow-spec.md §6-7:
 *   - Export via html2canvas at scale 2× (retina), same as the vanilla app.
 *   - Share via `navigator.share({files:[png]})` (Web Share API Level 2).
 *   - Fallback to a "Save image" (`<a download>`) when file-sharing isn't
 *     supported (desktop / old iOS / some in-app browsers) — §7.2/§7.3.
 *
 * html2canvas is NOT an npm dependency — like BodyChart.vue's Chart.js, it is
 * loaded once, on demand, from cdnjs via a dynamically injected <script> tag
 * (keeps the Vue bundle lean; matches the project's "charts/exports load from
 * CDN" convention). No business logic here — presentation/IO only.
 */const l="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";let o=null;function i(){const t=window;return t.html2canvas?Promise.resolve(t.html2canvas):o||(o=new Promise((a,n)=>{const e=document.createElement("script");e.src=l,e.async=!0,e.crossOrigin="anonymous",e.onload=()=>a(t.html2canvas),e.onerror=()=>n(new Error("html2canvas failed to load")),document.head.appendChild(e)}),o)}async function u(t,a=2){const e=await(await i())(t,{scale:a,useCORS:!0,backgroundColor:null});return await new Promise((s,r)=>{e.toBlob(c=>c?s(c):r(new Error("canvas.toBlob failed")),"image/png")})}function m(){const t=typeof navigator<"u"?navigator:null;if(!t||!t.canShare)return!1;try{const a=new File([""],"test.png",{type:"image/png"});return!!t.canShare({files:[a]})}catch{return!1}}function d(t,a){const n=URL.createObjectURL(t),e=document.createElement("a");e.href=n,e.download=a,document.body.appendChild(e),e.click(),document.body.removeChild(e),setTimeout(()=>URL.revokeObjectURL(n),4e3)}async function f(t,a={}){let n;try{n=await u(t,a.scale??2)}catch{return{ok:!1,reason:"export_failed"}}const e=a.filename??"iufit-result.png",s=new File([n],e,{type:"image/png"});if(m())try{return await navigator.share({files:[s],title:"IUFIT",text:a.text??""}),{ok:!0,method:"share"}}catch(r){if(r&&r.name==="AbortError")return{ok:!1,reason:"cancelled"}}try{return d(n,e),{ok:!0,method:"saved"}}catch{return{ok:!1,reason:"save_failed"}}}const h="/iu-mate/mate-cheering.webp",p="/iu-mate/mate-thumbsup.webp";export{h as _,p as a,f as s};
