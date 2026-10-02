function e(i){const r=String(i||"").trim();for(const t of r){if(/[\u0E01-\u0E2E]/.test(t))return t;if(/[A-Za-z0-9]/.test(t))return t.toUpperCase()}return r.slice(0,1)}export{e as i};
