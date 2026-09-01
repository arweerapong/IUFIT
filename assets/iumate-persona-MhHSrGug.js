const n=JSON.parse(`{
 "openings": {
  "default": {
   "th": [
    "ครับ",
    "นะครับ —",
    "มาดูกันครับ —"
   ],
   "en": [
    "",
    " —",
    "Let's look at this —"
   ]
  },
  "byIntent": {
   "today_summary": {
    "th": [
     "สรุปให้นะครับ —",
     "มาดูภาพรวมวันนี้กันครับ —",
     "ดูวันนี้ —"
    ],
    "en": [
     "Here's your day —",
     "Quick summary for today —",
     "Today's overview —"
    ]
   },
   "food_recommend": {
    "th": [
     "เรื่องเมนูนะครับ —",
     "มาช่วยเลือกเมนูกันครับ —",
     "หาเมนูให้ —"
    ],
    "en": [
     "On food —",
     "Let me suggest something —",
     "Meal ideas —"
    ]
   },
   "encourage": {
    "th": [
     " ",
     "ฟังนะ — "
    ],
    "en": [
     " ",
     "Hey — "
    ]
   },
   "thanks": {
    "th": [
     "ยินดีครับ — ",
     "ด้วยความยินดี — "
    ],
    "en": [
     "You're welcome — ",
     "Happy to help — "
    ]
   },
   "greeting": {
    "th": [
     "สวัสดีครับ ",
     "หวัดดีครับ "
    ],
    "en": [
     "Hi — ",
     "Hello — "
    ]
   },
   "smalltalk": {
    "th": [
     "สวัสดีครับ ",
     "หวัดดีครับ "
    ],
    "en": [
     "Hi — ",
     "Hello — "
    ]
   },
   "nutrition_qa": {
    "th": [
     "เรื่องนี้ตอบแบบหลักการนะครับ —",
     "คำถามดีครับ —",
     "เรื่องโภชนาการ —"
    ],
    "en": [
     "On that topic —",
     "Good question —",
     "Nutrition-wise —"
    ]
   },
   "fallback": {
    "th": [
     "เรื่องนี้ผมช่วยตรง ๆ ยังไม่ครบครับ —",
     "ขออธิบายแบบนี้ก่อนนะครับ —"
    ],
    "en": [
     "I'm not fully set up for that yet —",
     "Let me point you this way —"
    ]
   },
   "water_status": {
    "th": [
     "เรื่องน้ำนะครับ —",
     "เช็กน้ำให้ —",
     "ดูน้ำวันนี้ —"
    ],
    "en": [
     "On hydration —",
     "Water check —",
     "Let's see your water —"
    ]
   },
   "calc_plan": {
    "th": [
     "เรื่องเป้าแคลนะครับ —",
     "มาดูแผนโภชนาการ —",
     "คำนวณเป้าให้ —"
    ],
    "en": [
     "On your targets —",
     "Let's look at your plan —",
     "Macro check —"
    ]
   },
   "workout_recommend": {
    "th": [
     "เรื่องออกกำลังวันนี้ —",
     "ฝึกวันนี้ —",
     "แนะนำการฝึก —"
    ],
    "en": [
     "On today's workout —",
     "Training today —",
     "Workout suggestion —"
    ]
   },
   "workout_plan": {
    "th": [
     "เรื่องตารางฝึก —",
     "ดูโปรแกรมให้ —",
     "แผนออกกำลัง —"
    ],
    "en": [
     "On your program —",
     "Let's see your plan —",
     "Training schedule —"
    ]
   },
   "progress_stall": {
    "th": [
     "เรื่องผลลัพธ์ช่วงนี้ —",
     "ดูแนวโน้มให้ —",
     "ช่วงที่ทรงตัว —"
    ],
    "en": [
     "On your progress —",
     "Let's look at the trend —",
     "About the plateau —"
    ]
   },
   "result_summary": {
    "th": [
     "สรุปผลให้นะครับ —",
     "ดูความคืบหน้า —",
     "ผลช่วงนี้ —"
    ],
    "en": [
     "Here's your progress —",
     "Result summary —",
     "How you're doing —"
    ]
   },
   "log_food": {
    "th": [
     "เรื่องบันทึกมื้อ —",
     "จดอาหาร —",
     "ลงมื้อให้ —"
    ],
    "en": [
     "On logging food —",
     "Meal log —",
     "Let's log that —"
    ]
   },
   "log_weight": {
    "th": [
     "เรื่องชั่งน้ำหนัก —",
     "บันทึกน้ำหนัก —",
     "ลงน้ำหนัก —"
    ],
    "en": [
     "On weigh-in —",
     "Weight log —",
     "Recording weight —"
    ]
   },
   "plan_tomorrow": {
    "th": [
     "เรื่องพรุ่งนี้ —",
     "วางแผนพรุ่งนี้ —",
     "เตรียมวันถัดไป —"
    ],
    "en": [
     "On tomorrow —",
     "Planning ahead —",
     "Tomorrow's plan —"
    ]
   },
   "habit_consistency": {
    "th": [
     "เรื่องความต่อเนื่อง —",
     "ดูนิสัยให้ —",
     "ต่อเนื่องกี่วัน —"
    ],
    "en": [
     "On consistency —",
     "Habit check —",
     "Your streak —"
    ]
   },
   "watch_explain": {
    "th": [
     "เรื่องข้อมูลจากนาฬิกา —",
     "อ่านตัวเลขนาฬิกา —",
     "ดูข้อมูลสุขภาพ —"
    ],
    "en": [
     "From your watch —",
     "Watch data —",
     "Health metrics —"
    ]
   },
   "app_help": {
    "th": [
     "เรื่องใช้แอป —",
     "ช่วยใช้แอป —",
     "แนะนำฟีเจอร์ —"
    ],
    "en": [
     "App help —",
     "How to use —",
     "Feature guide —"
    ]
   },
   "setup_help": {
    "th": [
     "เรื่องตั้งค่า —",
     "ช่วยตั้งค่า —",
     "เริ่มต้นใช้งาน —"
    ],
    "en": [
     "Setup help —",
     "Getting started —",
     "Configuration —"
    ]
   },
   "find_place": {
    "th": [
     "หาสถานที่ใกล้ ๆ ให้ —",
     "เรื่องสถานที่ออกกำลัง —",
     "ค้นหาที่ฝึก —"
    ],
    "en": [
     "Finding places nearby —",
     "Workout spots —",
     "Location search —"
    ]
   },
   "make_plan": {
    "th": [
     "เรื่องวางแผน —",
     "ช่วยวางแผน —",
     "สร้างแผน —"
    ],
    "en": [
     "On planning —",
     "Let's make a plan —",
     "Plan builder —"
    ]
   },
   "budget_menu": {
    "th": [
     "เรื่องเมนูประหยัด —",
     "หาเมนูงบน้อย —",
     "อาหารราคาไม่แพง —"
    ],
    "en": [
     "Budget meals —",
     "Affordable food —",
     "Cheap meal ideas —"
    ]
   },
   "ingredient_recipe_generate": {
    "th": [
     "จากของที่มี —",
     "ดูสูตรจากวัตถุดิบ —",
     "ทำอะไรจากของในตู้เย็น —"
    ],
    "en": [
     "From what you have —",
     "Pantry recipe —",
     "Use your ingredients —"
    ]
   },
   "food_swap": {
    "th": [
     "เรื่องสลับเมนู —",
     "หาทางเลือกให้ —",
     "แทนที่เมนู —"
    ],
    "en": [
     "Food swap —",
     "Alternatives —",
     "Substitute ideas —"
    ]
   },
   "share_result_text": {
    "th": [
     "ข้อความแชร์ผล —",
     "ร่าง caption ให้ —",
     "แชร์ความคืบหน้า —"
    ],
    "en": [
     "Share text —",
     "Progress caption —",
     "Result post —"
    ]
   },
   "credits_help": {
    "th": [
     "เรื่องเครดิต AI —",
     "ดูเครดิตให้ —",
     "เครดิตคงเหลือ —"
    ],
    "en": [
     "AI credits —",
     "Credit balance —",
     "About credits —"
    ]
   }
  }
 },
 "closings": {
  "default": {
   "th": [
    "\\\\n\\\\nมีอะไรให้ช่วยต่ออีกไหมครับ?",
    "\\\\n\\\\nอยากให้ช่วยเรื่องไหนต่อ บอกได้เลยครับ"
   ],
   "en": [
    "\\\\n\\\\nAnything else I can help with?",
    "\\\\n\\\\nTell me what you'd like to do next."
   ]
  },
  "byIntent": {
   "today_summary": {
    "th": [
     "\\\\n\\\\nอยากเจาะมื้อไหนเพิ่ม บอกได้ครับ",
     "\\\\n\\\\nอยากดูเมนูหรือฝึกต่อ บอกได้"
    ],
    "en": [
     "\\\\n\\\\nWant to zoom in on a meal? Just ask.",
     "\\\\n\\\\nNeed food or workout ideas next? Ask away."
    ]
   },
   "food_recommend": {
    "th": [
     "\\\\n\\\\nกดปุ่มด้านล่างได้เลย หรือพิมพ์ชื่อเมนูที่อยากได้ครับ",
     "\\\\n\\\\nอยากสลับเมนู บอกได้เลย"
    ],
    "en": [
     "\\\\n\\\\nUse a button below, or type a dish you have in mind.",
     "\\\\n\\\\nWant a swap? Just say so."
    ]
   },
   "encourage": {
    "th": [
     " ",
     "\\\\n\\\\nฉันอยู่ตรงนี้ถ้าอยากคุยต่อ"
    ],
    "en": [
     " ",
     "\\\\n\\\\nI'm here if you want to talk more."
    ]
   },
   "thanks": {
    "th": [
     " ",
     "\\\\n\\\\nมีอะไรให้ช่วยอีกบอกได้เลย"
    ],
    "en": [
     " ",
     "\\\\n\\\\nHappy to help anytime."
    ]
   },
   "nutrition_qa": {
    "th": [
     "\\\\n\\\\nอยากให้ช่วยดูเป้าของคุณในแอปไหมครับ?",
     "\\\\n\\\\nมีคำถามโภชนาการอื่น ถามต่อได้"
    ],
    "en": [
     "\\\\n\\\\nWant me to point you at your targets in the app?",
     "\\\\n\\\\nMore nutrition questions? Fire away."
    ]
   },
   "app_help": {
    "th": [
     "\\\\n\\\\nถ้ายังหาไม่เจอ บอกได้ว่าติดตรงไหนครับ",
     "\\\\n\\\\nฟีเจอร์ไหนยังไม่ชัด บอกชื่อมาได้"
    ],
    "en": [
     "\\\\n\\\\nIf you're stuck, tell me where you got lost.",
     "\\\\n\\\\nWhich feature? Name it and I'll guide you."
    ]
   },
   "water_status": {
    "th": [
     "\\\\n\\\\nดื่มต่อได้เลย มีอะไรถามเพิ่มบอกได้",
     "\\\\n\\\\nอยากให้เตือนเรื่องน้ำอีก บอกได้"
    ],
    "en": [
     "\\\\n\\\\nKeep sipping — ask if you need more.",
     "\\\\n\\\\nWant a water reminder later? Just ask."
    ]
   },
   "calc_plan": {
    "th": [
     "\\\\n\\\\nถ้าอยากปรับเป้า บอกได้",
     "\\\\n\\\\nอยากดูเมนูตามเป้านี้ บอกได้เลย"
    ],
    "en": [
     "\\\\n\\\\nWant to tweak targets? Just ask.",
     "\\\\n\\\\nNeed meal ideas for these macros? Say the word."
    ]
   },
   "workout_recommend": {
    "th": [
     "\\\\n\\\\nอยากดูตารางเต็มหรือบันทึกเซ็ต บอกได้",
     "\\\\n\\\\nฝึกเสร็จแล้วอย่าลืมจดให้ครบ"
    ],
    "en": [
     "\\\\n\\\\nWant the full program or to log sets? Ask.",
     "\\\\n\\\\nLog your session when you're done."
    ]
   },
   "workout_plan": {
    "th": [
     "\\\\n\\\\nอยากปรับตารางหรือบันทึกเซ็ต บอกได้",
     "\\\\n\\\\nมีอะไรในโปรแกรมไม่ชัด ถามต่อได้"
    ],
    "en": [
     "\\\\n\\\\nAdjust the plan or log a set? Just ask.",
     "\\\\n\\\\nUnclear on any exercise? Ask me."
    ]
   },
   "progress_stall": {
    "th": [
     "\\\\n\\\\nอยากดูสรุปสัปดาห์หรือปรับแผน บอกได้",
     "\\\\n\\\\nทีละนิดก็ไปได้ มีอะไรถามต่อบอกได้"
    ],
    "en": [
     "\\\\n\\\\nWant a weekly view or plan tweak? Ask.",
     "\\\\n\\\\nSlow progress is still progress — ask anytime."
    ]
   },
   "result_summary": {
    "th": [
     "\\\\n\\\\nอยากข้อความแชร์ผล บอกได้เลย",
     "\\\\n\\\\nถ้าอยากดูแนวโน้มละเอียด ถามต่อได้"
    ],
    "en": [
     "\\\\n\\\\nWant share text for your progress? Ask.",
     "\\\\n\\\\nNeed a deeper trend view? Just say."
    ]
   },
   "log_food": {
    "th": [
     "\\\\n\\\\nมื้อถัดไปบอกได้เลย",
     "\\\\n\\\\nอยากดูสรุปวันนี้หลังจด บอกได้"
    ],
    "en": [
     "\\\\n\\\\nNext meal? Tell me when you're ready.",
     "\\\\n\\\\nWant today's summary after logging? Ask."
    ]
   },
   "log_weight": {
    "th": [
     "\\\\n\\\\nชั่งครั้งถัดไปบันทึกต่อได้เลย",
     "\\\\n\\\\nอยากดูกราฟแนวโน้ม บอกได้"
    ],
    "en": [
     "\\\\n\\\\nLog your next weigh-in anytime.",
     "\\\\n\\\\nWant the trend chart? Just ask."
    ]
   },
   "plan_tomorrow": {
    "th": [
     "\\\\n\\\\nพรุ่งนี้เริ่มได้เลย มีอะไรปรับบอกได้",
     "\\\\n\\\\nอยากเตรียมเมนูล่วงหน้า บอกได้"
    ],
    "en": [
     "\\\\n\\\\nStart tomorrow — tweak anytime.",
     "\\\\n\\\\nWant meals pre-planned? Ask."
    ]
   },
   "habit_consistency": {
    "th": [
     "\\\\n\\\\nวันนี้ทำต่อได้เลย มีอะไรถามเพิ่มบอกได้",
     "\\\\n\\\\nนิสัยดีขึ้นทีละนิด ถามต่อได้"
    ],
    "en": [
     "\\\\n\\\\nKeep going today — ask if you need help.",
     "\\\\n\\\\nHabits build slowly — I'm here."
    ]
   },
   "find_place": {
    "th": [
     "\\\\n\\\\nอยากประเภทสถานที่อื่น บอกได้",
     "\\\\n\\\\nไปแล้วอย่าลืมบันทึกการฝึก"
    ],
    "en": [
     "\\\\n\\\\nDifferent place type? Just say.",
     "\\\\n\\\\nLog your workout after you go."
    ]
   },
   "budget_menu": {
    "th": [
     "\\\\n\\\\nอยากสลับเมนูในงบเดิม บอกได้",
     "\\\\n\\\\nจดมื้อหลังทำเสร็จ บอกได้เลย"
    ],
    "en": [
     "\\\\n\\\\nSwap within budget? Ask.",
     "\\\\n\\\\nLog the meal when you're done."
    ]
   },
   "ingredient_recipe_generate": {
    "th": [
     "\\\\n\\\\nมีวัตถุดิบเพิ่ม บอกมาได้",
     "\\\\n\\\\nอยากดูแคลในมื้อ จดให้ได้"
    ],
    "en": [
     "\\\\n\\\\nMore ingredients? List them.",
     "\\\\n\\\\nWant calories logged? Tell me the meal."
    ]
   },
   "food_swap": {
    "th": [
     "\\\\n\\\\nอยากสลับอย่างอื่น บอกได้",
     "\\\\n\\\\nจดมื้อหลังเลือกแล้ว บอกได้เลย"
    ],
    "en": [
     "\\\\n\\\\nAnother swap? Just ask.",
     "\\\\n\\\\nLog it once you've picked."
    ]
   },
   "share_result_text": {
    "th": [
     "\\\\n\\\\nอยากปรับโทนข้อความ บอกได้",
     "\\\\n\\\\nแชร์เสร็จแล้วมีอะไรถามต่อบอกได้"
    ],
    "en": [
     "\\\\n\\\\nWant a different tone? Say how.",
     "\\\\n\\\\nAnything else after sharing? Ask."
    ]
   },
   "credits_help": {
    "th": [
     "\\\\n\\\\nอยากดูวิธีใช้เครดิตต่อ บอกได้",
     "\\\\n\\\\nมีคำถามเรื่องแพ็ก ถามต่อได้"
    ],
    "en": [
     "\\\\n\\\\nHow credits work? Ask more.",
     "\\\\n\\\\nQuestions about packs? Just ask."
    ]
   }
  }
 }
}`);export{n as P};
