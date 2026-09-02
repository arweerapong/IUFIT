const a=`[
 {
  "reSource": "(สแกน|ถ่ายรูปอาหาร|กล้อง|scan|photo|camera)",
  "reFlags": "",
  "titleTh": "สแกนอาหารด้วย AI",
  "titleEn": "AI food scan",
  "th": "แท็บ \\"อาหาร\\" → เลือกมื้อ → ปุ่มกล้อง/สแกน → ถ่ายหรือเลือกรูปจานอาหาร → AI จะเดาเมนูและแคลให้ แล้วกดยืนยันเพื่อบันทึกลงมื้อนั้น",
  "en": "Food tab → pick the meal → the camera/scan button → take or choose a photo of the plate → the AI estimates the menu and calories, then confirm to log it into that meal.",
  "action": "go_food",
  "btnTh": "เปิดหน้าอาหาร",
  "btnEn": "Open Food"
 },
 {
  "reSource": "(บันทึกอาหาร|ลงอาหาร|เพิ่มเมนู|จดอาหาร|logfood|addfood|addameal|logameal|trackfood)",
  "reFlags": "",
  "titleTh": "บันทึกอาหาร",
  "titleEn": "Log food",
  "th": "แท็บ \\"อาหาร\\" → เลือกมื้อ (เช้า/กลางวัน/เย็น/ว่าง) → พิมพ์ชื่อเมนูในช่องค้นหา → กดเพิ่ม\\nแคล/โปรตีนจะรวมให้อัตโนมัติ ปรับจำนวนได้ที่ปุ่ม +/− และดูยอดคงเหลือที่การ์ดสรุปด้านบน",
  "en": "Food tab → pick the meal (breakfast/lunch/dinner/snack) → type the menu name in search → tap add.\\nCalories/protein total automatically, adjust portions with +/−, and the summary card at the top shows what is left.",
  "action": "go_food_log",
  "btnTh": "เปิดบันทึกอาหาร",
  "btnEn": "Open food log"
 },
 {
  "reSource": "(น้ำหนัก|รอบเอว|สัดส่วน|ไขมัน|weight|waist|measurement|bodyfat)",
  "reFlags": "",
  "titleTh": "บันทึกน้ำหนัก/สัดส่วน",
  "titleEn": "Log weight & measurements",
  "th": "แท็บ \\"ผลลัพธ์\\" (ค่าร่างกาย) → ปุ่มเพิ่มบันทึก → ใส่น้ำหนัก และรอบเอว/สัดส่วนถ้ามี → บันทึก\\nพอมี 2 ครั้งขึ้นไป กราฟแนวโน้มกับสรุปการเปลี่ยนแปลงจะขึ้นให้เอง",
  "en": "Results tab (Body) → add-entry button → enter your weight, plus waist/measurements if you have them → save.\\nOnce you have 2+ entries the trend chart and change summary appear automatically.",
  "action": "go_body",
  "btnTh": "เปิดหน้าค่าร่างกาย",
  "btnEn": "Open Body"
 },
 {
  "reSource": "(เป้าหมาย|ตั้งแคล|ตั้งเป้า|มาโคร|target|goal|macro|calorietarget)",
  "reFlags": "",
  "titleTh": "ตั้งเป้าหมายแคล/มาโคร",
  "titleEn": "Set calorie & macro targets",
  "th": "หน้า \\"เป้าหมาย\\" → กรอกเพศ อายุ ส่วนสูง น้ำหนัก ระดับกิจกรรม และเป้าหมาย → ระบบคำนวณ BMR/TDEE/แคลเป้าหมาย/มาโครให้\\nตัวเลขนี้เป็นตัวเดียวกับที่ผมใช้ตอบเรื่องแคลทั้งหมด",
  "en": "Target page → enter sex, age, height, weight, activity level and your goal → it computes BMR/TDEE/target calories/macros.\\nThose are the same numbers I use for every calorie answer I give you.",
  "action": "go_target",
  "btnTh": "เปิดหน้าเป้าหมาย",
  "btnEn": "Open Target"
 },
 {
  "reSource": "(ประวัติ|ปฏิทิน|สตรีค|ย้อนหลัง|history|calendar|streak|pastdays)",
  "reFlags": "",
  "titleTh": "ประวัติ & สตรีค",
  "titleEn": "History & streak",
  "th": "หน้า \\"ประวัติ\\" → ปฏิทินแสดงวันที่บันทึกครบ กดวันไหนก็ได้เพื่อดูย้อนหลัง\\nสตรีคนับจากวันที่มีการบันทึกต่อเนื่อง — บันทึกอะไรก็ได้ในวันนั้นก็ต่อสตรีคแล้ว",
  "en": "History page → the calendar marks the days you logged; tap any day to review it.\\nYour streak counts consecutive days with a log — anything logged that day keeps it alive.",
  "action": "go_history",
  "btnTh": "เปิดประวัติ",
  "btnEn": "Open History"
 },
 {
  "reSource": "(ท่าฝึก|ตารางฝึก|ออกกำลัง|คาร์ดิโอ|workout|training|exercise|cardio)",
  "reFlags": "",
  "titleTh": "บันทึกการฝึก",
  "titleEn": "Log a workout",
  "th": "หน้า「การฝึกวันนี้」→ เลือกท่าจากคลัง หรือเพิ่มเอง → ใส่เซ็ต/ครั้ง/น้ำหนัก (คาร์ดิโอใส่นาที) → กดบันทึกการฝึกวันนี้\\nกิจกรรมจากนาฬิกาจะโผล่ในรายการเดียวกัน แก้ได้เหมือนบันทึกเอง\\nอยากได้ตารางทั้งสัปดาห์ พิมพ์ \\"จัดตารางฝึกให้หน่อย\\" ได้เลยครับ",
  "en": "Today’s workout screen → pick a move from the library or add your own → enter sets/reps/weight (minutes for cardio) → tap Log today’s workout.\\nWatch activities appear in the same list and edit the same way as a manual log.\\nWant a full week plan? Just type \\"build a workout plan\\".",
  "action": "go_workout_log",
  "btnTh": "เปิดบันทึกการฝึก",
  "btnEn": "Open workout log"
 },
 {
  "reSource": "(แชร์|ผลลัพธ์ลง|โพส|resultcard|share|caption|instagram|story)",
  "reFlags": "",
  "titleTh": "แชร์ผลลัพธ์",
  "titleEn": "Share your results",
  "th": "หน้าแชร์จะสร้างการ์ดผลลัพธ์จากข้อมูลจริงของคุณ (น้ำหนักที่เปลี่ยน สตรีค ฯลฯ) ให้บันทึกเป็นรูปได้\\nอยากได้แคปชั่นด้วย พิมพ์ \\"ขอข้อความแชร์ผลลัพธ์\\" ได้เลยครับ",
  "en": "The share page builds a result card from your real data (weight change, streak, …) that you can save as an image.\\nWant a caption too? Type \\"share result text\\".",
  "action": "go_share_card",
  "btnTh": "สร้าง Result Card",
  "btnEn": "Create result card"
 },
 {
  "reSource": "(โค้ช|ลูกเทรน|เทรนเนอร์|coach|client|trainer)",
  "reFlags": "",
  "titleTh": "โหมดโค้ช & ลูกเทรน",
  "titleEn": "Coach mode & clients",
  "th": "เปิดโหมดโค้ชได้ที่หน้าตั้งค่า → จากนั้นจะมีแท็บโค้ช/ลูกเทรน/การบ้านให้\\nลูกเทรนเข้ามาโดยสแกน QR หรือกรอกรหัสโค้ชของคุณ ส่วนคุณสั่งให้ผมสรุปได้ด้วย \\"สรุปลูกเทรน\\"",
  "en": "Turn on coach mode in Settings → you then get the Coach / Clients / Homework tabs.\\nClients join by scanning your QR or entering your coach code. Ask me \\"clients overview\\" for a summary any time.",
  "action": "go_coach",
  "btnTh": "เปิดหน้าโค้ช",
  "btnEn": "Open Coach"
 },
 {
  "reSource": "(อาหารที่แพ้|รายการแพ้|แพ้อาหาร|ตั้งค่าอาหารที่แพ้|foodallerg|setfoodallerg|setallerg|allerg(?:y|ies)settings|allergen)",
  "reFlags": "",
  "titleTh": "ตั้งอาหารที่แพ้",
  "titleEn": "Set food allergies",
  "th": "หน้าโปรไฟล์ → ส่วนอาหารที่แพ้ → เลือกจากรายการ หรือพิมพ์เพิ่มเอง → บันทึก\\nเมนูที่เสี่ยงจะถูกกรองออกจากคำแนะนำอัตโนมัติ (ไม่ใช่คำแนะนำทางการแพทย์ — เป็นแค่ค่าโปรไฟล์ในแอป)",
  "en": "Profile → Food allergies → pick from the list or type your own → save.\\nRisky menus are filtered out of suggestions automatically (profile preference only — not medical advice).",
  "action": "go_profile",
  "btnTh": "เปิดโปรไฟล์",
  "btnEn": "Open profile"
 },
 {
  "reSource": "(สำรองข้อมูล|ส่งออกข้อมูล|ไฟล์สำรอง|แบ็กอัพ|แบคอัพ|backup|exportdata|exportmydata|downloadmydata)",
  "reFlags": "",
  "titleTh": "สำรอง / ส่งออกข้อมูลของคุณ",
  "titleEn": "Back up & export your data",
  "th": "หน้า \\"สำรองข้อมูล\\" → ปุ่มส่งออก → ได้ไฟล์สำรองที่มีบันทึกอาหาร ค่าร่างกาย และการฝึกของคุณทั้งหมด เก็บไว้เองหรือส่งเข้าไดรฟ์/แชตก็ได้\\nไฟล์เดียวกันนี้เอากลับเข้ามาได้ที่ปุ่มนำเข้าในหน้าเดียวกัน",
  "en": "Backup page → the export button → you get a backup file containing all your food logs, body entries and training. Keep it yourself or send it to a drive/chat.\\nThe same file goes back in through the import button on that page.",
  "action": "go_backup",
  "btnTh": "เปิดหน้าสำรองข้อมูล",
  "btnEn": "Open Backup"
 },
 {
  "reSource": "(เชื่อมนาฬิกา|ต่อนาฬิกา|จับคู่นาฬิกา|ผูกนาฬิกา|เชื่อมสมาร์ทวอทช์|pairwatch|connectwatch|connectmywatch|linkwatch)",
  "reFlags": "",
  "titleTh": "เชื่อมนาฬิกา",
  "titleEn": "Connect your watch",
  "th": "หน้า \\"นาฬิกา\\" → ปุ่มเชื่อมต่อ → เลือกนาฬิกาของคุณจากรายการที่เจอ → อนุญาตสิทธิ์ที่เครื่องถาม\\nเชื่อมแล้วกดซิงก์เพื่อดึงก้าว การนอน และชีพจรของวันที่ผ่านมา",
  "en": "Watch page → the connect button → pick your watch from the list → grant the permissions your phone asks for.\\nOnce connected, tap sync to pull in steps, sleep and heart rate from recent days.",
  "action": "go_watch",
  "btnTh": "เปิดหน้านาฬิกา",
  "btnEn": "Open Watch"
 },
 {
  "reSource": "(ยืนยันอีเมล|verifyemail|verifymyemail|confirm(?:my)?email|emailverification)",
  "reFlags": "",
  "titleTh": "ยืนยันอีเมล",
  "titleEn": "Verify your email",
  "th": "ไปที่หน้ายืนยันอีเมล → เปิดลิงก์ในอีเมลที่ระบบส่งให้ หรือขอส่งใหม่ถ้ายังไม่ได้รับ\\nยืนยันครั้งเดียวปลดล็อกเครดิตสแกนฟรีและฟีเจอร์ที่ผูกบัญชี",
  "en": "Open the verify-email screen → tap the link in the email we sent, or request a new one if it never arrived.\\nOne verification unlocks free scan credits and account-tied features.",
  "action": "verify_email",
  "btnTh": "ไปยืนยันอีเมล",
  "btnEn": "Verify email"
 },
 {
  "reSource": "(ลบบัญชี|ปิดบัญชี|ลบข้อมูลทั้งหมด|deleteaccount|deletemyaccount|closemyaccount|eraseallmydata)",
  "reFlags": "",
  "titleTh": "ลบบัญชีและข้อมูลทั้งหมด",
  "titleEn": "Delete your account and data",
  "th": "หน้า \\"ความเป็นส่วนตัว\\" → ส่วนล่างสุดมีปุ่มลบบัญชี → ยืนยันหนึ่งครั้ง\\nการลบเอาข้อมูลของคุณออกทั้งหมดและกู้กลับไม่ได้ ⇒ ถ้าอยากเก็บไว้ ส่งออกไฟล์สำรองก่อนได้ที่หน้าสำรองข้อมูล",
  "en": "Privacy page → the delete-account button at the bottom → confirm once.\\nDeleting removes all of your data and cannot be undone, so export a backup first from the Backup page if you want to keep it.",
  "action": "go_privacy",
  "btnTh": "เปิดหน้าความเป็นส่วนตัว",
  "btnEn": "Open Privacy"
 },
 {
  "reSource": "(ตั้งค่า|โปรไฟล์|เปลี่ยนภาษา|ภาษาอังกฤษ|ธีม|ดาร์ก|settings|profile|language|darkmode|theme)",
  "reFlags": "",
  "titleTh": "ตั้งค่า & โปรไฟล์",
  "titleEn": "Settings & profile",
  "th": "หน้าโปรไฟล์/ตั้งค่า → แก้ข้อมูลส่วนตัว สลับภาษา ไทย/EN เปิดโหมดมืด จัดการความเป็นส่วนตัว และเปิด/ปิดโหมดโค้ช",
  "en": "Profile/Settings → edit your details, switch Thai/EN, turn on dark mode, manage privacy, and toggle coach mode.",
  "action": "go_profile",
  "btnTh": "เปิดโปรไฟล์",
  "btnEn": "Open profile"
 }
]`,n=JSON.parse(a).map(e=>({re:new RegExp(e.reSource,e.reFlags),titleTh:e.titleTh,titleEn:e.titleEn,th:e.th,en:e.en,action:e.action,btnTh:e.btnTh,btnEn:e.btnEn}));function o(e){for(const t of n)if(t.re.test(e))return t;return null}export{o as f};
