const e=JSON.parse(`{
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
    "มีอะไรให้ช่วยต่ออีกไหมครับ?",
    "อยากให้ช่วยเรื่องไหนต่อ บอกได้เลยครับ"
   ],
   "en": [
    "Anything else I can help with?",
    "Tell me what you'd like to do next."
   ]
  },
  "byIntent": {
   "today_summary": {
    "th": [
     "อยากเจาะมื้อไหนเพิ่ม บอกได้ครับ",
     "อยากดูเมนูหรือฝึกต่อ บอกได้"
    ],
    "en": [
     "Want to zoom in on a meal? Just ask.",
     "Need food or workout ideas next? Ask away."
    ]
   },
   "food_recommend": {
    "th": [
     "กดปุ่มด้านล่างได้เลย หรือพิมพ์ชื่อเมนูที่อยากได้ครับ",
     "อยากสลับเมนู บอกได้เลย"
    ],
    "en": [
     "Use a button below, or type a dish you have in mind.",
     "Want a swap? Just say so."
    ]
   },
   "encourage": {
    "th": [
     " ",
     "ฉันอยู่ตรงนี้ถ้าอยากคุยต่อ"
    ],
    "en": [
     " ",
     "I'm here if you want to talk more."
    ]
   },
   "thanks": {
    "th": [
     " ",
     "มีอะไรให้ช่วยอีกบอกได้เลย"
    ],
    "en": [
     " ",
     "Happy to help anytime."
    ]
   },
   "nutrition_qa": {
    "th": [
     "อยากให้ช่วยดูเป้าของคุณในแอปไหมครับ?",
     "มีคำถามโภชนาการอื่น ถามต่อได้"
    ],
    "en": [
     "Want me to point you at your targets in the app?",
     "More nutrition questions? Fire away."
    ]
   },
   "app_help": {
    "th": [
     "ถ้ายังหาไม่เจอ บอกได้ว่าติดตรงไหนครับ",
     "ฟีเจอร์ไหนยังไม่ชัด บอกชื่อมาได้"
    ],
    "en": [
     "If you're stuck, tell me where you got lost.",
     "Which feature? Name it and I'll guide you."
    ]
   },
   "water_status": {
    "th": [
     "ดื่มต่อได้เลย มีอะไรถามเพิ่มบอกได้",
     "อยากให้เตือนเรื่องน้ำอีก บอกได้"
    ],
    "en": [
     "Keep sipping — ask if you need more.",
     "Want a water reminder later? Just ask."
    ]
   },
   "calc_plan": {
    "th": [
     "ถ้าอยากปรับเป้า บอกได้",
     "อยากดูเมนูตามเป้านี้ บอกได้เลย"
    ],
    "en": [
     "Want to tweak targets? Just ask.",
     "Need meal ideas for these macros? Say the word."
    ]
   },
   "workout_recommend": {
    "th": [
     "อยากดูตารางเต็มหรือบันทึกเซ็ต บอกได้",
     "ฝึกเสร็จแล้วอย่าลืมจดให้ครบ"
    ],
    "en": [
     "Want the full program or to log sets? Ask.",
     "Log your session when you're done."
    ]
   },
   "workout_plan": {
    "th": [
     "อยากปรับตารางหรือบันทึกเซ็ต บอกได้",
     "มีอะไรในโปรแกรมไม่ชัด ถามต่อได้"
    ],
    "en": [
     "Adjust the plan or log a set? Just ask.",
     "Unclear on any exercise? Ask me."
    ]
   },
   "progress_stall": {
    "th": [
     "อยากดูสรุปสัปดาห์หรือปรับแผน บอกได้",
     "ทีละนิดก็ไปได้ มีอะไรถามต่อบอกได้"
    ],
    "en": [
     "Want a weekly view or plan tweak? Ask.",
     "Slow progress is still progress — ask anytime."
    ]
   },
   "result_summary": {
    "th": [
     "อยากข้อความแชร์ผล บอกได้เลย",
     "ถ้าอยากดูแนวโน้มละเอียด ถามต่อได้"
    ],
    "en": [
     "Want share text for your progress? Ask.",
     "Need a deeper trend view? Just say."
    ]
   },
   "log_food": {
    "th": [
     "มื้อถัดไปบอกได้เลย",
     "อยากดูสรุปวันนี้หลังจด บอกได้"
    ],
    "en": [
     "Next meal? Tell me when you're ready.",
     "Want today's summary after logging? Ask."
    ]
   },
   "log_weight": {
    "th": [
     "ชั่งครั้งถัดไปบันทึกต่อได้เลย",
     "อยากดูกราฟแนวโน้ม บอกได้"
    ],
    "en": [
     "Log your next weigh-in anytime.",
     "Want the trend chart? Just ask."
    ]
   },
   "plan_tomorrow": {
    "th": [
     "พรุ่งนี้เริ่มได้เลย มีอะไรปรับบอกได้",
     "อยากเตรียมเมนูล่วงหน้า บอกได้"
    ],
    "en": [
     "Start tomorrow — tweak anytime.",
     "Want meals pre-planned? Ask."
    ]
   },
   "habit_consistency": {
    "th": [
     "วันนี้ทำต่อได้เลย มีอะไรถามเพิ่มบอกได้",
     "นิสัยดีขึ้นทีละนิด ถามต่อได้"
    ],
    "en": [
     "Keep going today — ask if you need help.",
     "Habits build slowly — I'm here."
    ]
   },
   "find_place": {
    "th": [
     "อยากประเภทสถานที่อื่น บอกได้",
     "ไปแล้วอย่าลืมบันทึกการฝึก"
    ],
    "en": [
     "Different place type? Just say.",
     "Log your workout after you go."
    ]
   },
   "budget_menu": {
    "th": [
     "อยากสลับเมนูในงบเดิม บอกได้",
     "จดมื้อหลังทำเสร็จ บอกได้เลย"
    ],
    "en": [
     "Swap within budget? Ask.",
     "Log the meal when you're done."
    ]
   },
   "ingredient_recipe_generate": {
    "th": [
     "มีวัตถุดิบเพิ่ม บอกมาได้",
     "อยากดูแคลในมื้อ จดให้ได้"
    ],
    "en": [
     "More ingredients? List them.",
     "Want calories logged? Tell me the meal."
    ]
   },
   "food_swap": {
    "th": [
     "อยากสลับอย่างอื่น บอกได้",
     "จดมื้อหลังเลือกแล้ว บอกได้เลย"
    ],
    "en": [
     "Another swap? Just ask.",
     "Log it once you've picked."
    ]
   },
   "share_result_text": {
    "th": [
     "อยากปรับโทนข้อความ บอกได้",
     "แชร์เสร็จแล้วมีอะไรถามต่อบอกได้"
    ],
    "en": [
     "Want a different tone? Say how.",
     "Anything else after sharing? Ask."
    ]
   },
   "credits_help": {
    "th": [
     "อยากดูวิธีใช้เครดิตต่อ บอกได้",
     "มีคำถามเรื่องแพ็ก ถามต่อได้"
    ],
    "en": [
     "How credits work? Ask more.",
     "Questions about packs? Just ask."
    ]
   }
  }
 }
}`);export{e as P};
