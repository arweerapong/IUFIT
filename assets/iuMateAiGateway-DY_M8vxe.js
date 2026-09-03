import{h7 as d,h8 as f,eD as y}from"./index-BSKT4YNp.js";import{a as m,E as l,v as T,c as S}from"./responseValidator-DVeHvLXh.js";import"./vendor-DYr8D2id.js";const p={type:"OBJECT",properties:{message:{type:"STRING"},intent:{type:"STRING"},promptVersion:{type:"STRING"},engineVersion:{type:"STRING"},model:{type:"STRING"},warnings:{type:"ARRAY",items:{type:"STRING"}},cards:{type:"ARRAY",items:{type:"OBJECT",properties:{kind:{type:"STRING"},title:{type:"STRING"},body:{type:"STRING"}},required:["kind","title","body"]}}},required:["message","intent","promptVersion"]};function g(e){if(e instanceof y){if(e.code==="no_credits")return"no_credits";if(e.code==="verify_email")return"verify_email";if(e.code==="ai_timeout"||e.code==="timeout")return"ai_timeout"}return"ai_timeout"}function _(e){const o=S(e.locale,[String(e.intent).startsWith("coach_")?"coach-v1":"personal-v1","training-v1","nutrition-v1"]),u=JSON.stringify(e.contextSummary),i=e.consent.sendUserText&&e.userText?`
User message:
${e.userText}`:`
(User text not consented — answer from context only.)`,c=e.recentTurns&&e.recentTurns.length?`
Recent turns:
${e.recentTurns.map(s=>`${s.role}: ${s.text}`).join(`
`)}`:"",t=e.conversationSummary?`
Conversation summary:
${e.conversationSummary}`:"";return`${o}

Return ONLY JSON matching the schema. message must be ${e.locale==="th"?"Thai":"English"}.
promptVersion must be "${e.promptVersion}". engineVersion must be "${l}".
intent should be "${e.intent}".
Context summary JSON:
${u}`+t+c+i}function x(e={}){const o=e.enabled===!0,u=e.modelLabel||"gemini-via-worker";async function i(t){if(!o)return{ok:!1,refused:"disabled_by_flag"};if(t.userText&&!t.consent.sendUserText)return{ok:!1,refused:"no_consent"};const s=_(t);try{const n=e.transport?await e.transport({prompt:s,schema:p}):await d(s,p,f),r=n.json??(n.text?R(n.text):null);if(!r)return{ok:!1,refused:"ai_timeout",errors:["unreadable"]};typeof r.promptVersion!="string"&&(r.promptVersion=t.promptVersion||m),typeof r.engineVersion!="string"&&(r.engineVersion=l),typeof r.model!="string"&&(r.model=u);const a=T(r);return!a.ok||!a.response?{ok:!1,refused:"ai_timeout",errors:a.errors}:{ok:!0,response:a.response}}catch(n){return{ok:!1,refused:g(n)}}}return{id:"mate-gateway-proxy",available(){return o},async run(t){if(!o)return{ok:!1,refused:"disabled_by_flag"};if(t.userText&&!t.consent.sendUserText)return{ok:!1,refused:"no_consent"};const s={intent:"unknown",contextSummary:t.consent.sendHealthFacts?t.facts:{},locale:t.locale,nowIso:t.nowIso,consent:t.consent,userText:t.userText,promptVersion:m,modelTier:"simple"},n=await i(s);return n.ok?{ok:!0,text:n.response.message,proposals:n.response.proposedActions??[]}:{ok:!1,refused:n.refused}},generateStructuredResponse:i}}function R(e){try{return JSON.parse(e)}catch{return null}}const E=x({enabled:!1});export{E as DisabledMateAiGateway,x as createMateAiGateway};
