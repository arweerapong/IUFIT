/*! IUFIT food-icon-matcher — matchFoodIcon()  (deterministic, explainable, no AI/API at runtime)
 * ลำดับ: override > exact > alias > dish_family(+protein) > family+method > family > category > generic
 * ใช้ข้อมูล 3 ทาง: ชื่อ(normalized) + ings(protein/base จากวัตถุดิบจริง) + หมวด(category)
 * กฎ: ห้ามใช้ไอคอนวัตถุดิบเป็นตัวเลือกแรกของเมนูปรุงสำเร็จ
 */
(function (root) {
  'use strict';
  var norm = (root && root.IUFIT_normalizeFoodName)
    || (typeof require !== 'undefined' ? require('./food-icon-normalizer.js').normalizeFoodName : function (x) { return String(x || ''); });

  // ---------- ingredient attribute derivation (จาก window.IUFIT_ING) ----------
  var PROTEIN_KW = [
    ['ไก่', 'chicken'], ['หมู', 'pork'], ['เนื้อวัว', 'beef'], ['เนื้อ', 'beef'], ['วัว', 'beef'],
    ['กุ้ง', 'shrimp'], ['ปลาหมึก', 'squid'], ['หมึก', 'squid'], ['ปูอัด', 'crab'], ['ปู', 'crab'], ['ทะเล', 'shrimp'],
    ['แซลมอน', 'salmon'], ['ทูน่า', 'fish'], ['ปลา', 'fish'], ['ไข่', 'egg'], ['เต้าหู้', 'tofu']
  ];
  function _proteinOf(name) {
    for (var i = 0; i < PROTEIN_KW.length; i++) if (name.indexOf(PROTEIN_KW[i][0]) > -1) return PROTEIN_KW[i][1];
    return null;
  }
  function deriveFromIngs(ings) {
    var out = { proteins: {}, base: null };
    var ING = root && root.IUFIT_ING;
    if (!ings || !ings.length || !ING) return out;
    var riceG = 0, noodleG = 0, breadG = 0;
    for (var i = 0; i < ings.length; i++) {
      var k = ings[i][0], g = ings[i][1] || 0, it = ING[k];
      if (!it) continue;
      var nm = it.n || '', grp = it.g || '';
      if (grp === 'โปรตีน') { var p = _proteinOf(nm); if (p) out.proteins[p] = (out.proteins[p] || 0) + g; }
      if (grp === 'แป้ง/ธัญพืช' || grp === 'คาร์โบไฮเดรต') {
        if (nm.indexOf('ข้าว') > -1 && nm.indexOf('ข้าวโพด') < 0 && nm.indexOf('โอ๊ต') < 0) riceG += g;
        else if (/เส้น|ก๋วยเตี๋ยว|บะหมี่|พาสต้า|สปาเก|วุ้นเส้น|มักกะโรนี|หมี่/.test(nm)) noodleG += g;
        else if (nm.indexOf('ขนมปัง') > -1) breadG += g;
      }
    }
    if (riceG >= noodleG && riceG >= breadG && riceG > 0) out.base = 'rice';
    else if (noodleG >= breadG && noodleG > 0) out.base = 'noodle';
    else if (breadG > 0) out.base = 'bread';
    return out;
  }
  function dominantProtein(deriv, normName) {
    var best = null, bg = 0;
    for (var p in deriv.proteins) if (deriv.proteins[p] > bg) { bg = deriv.proteins[p]; best = p; }
    if (best) return best;
    return _proteinOf(normName);
  }

  // ---------- dish families (specific-first; longest key wins) ----------
  var FAMILIES = [
    // noodles
    { fam: 'pad_thai', keys: ['ผัดไทย'], icon: 'pad_thai_plate', prot: { shrimp: 'pad_thai_shrimp' }, cat: 'noodle' },
    { fam: 'rat_na', keys: ['ราดหน้า'], icon: 'stir_fried_noodles', cat: 'noodle' },
    { fam: 'pad_see_ew', keys: ['ผัดซีอิ๊ว', 'ผัดซีอิ้ว'], icon: 'stir_fried_noodles', cat: 'noodle' },
    { fam: 'pad_mee', keys: ['ผัดหมี่', 'หมี่กรอบ', 'ผัดวุ้นเส้น', 'ผัดมักกะโรนี'], icon: 'stir_fried_noodles', cat: 'noodle' },
    { fam: 'yen_ta_fo', keys: ['เย็นตาโฟ'], icon: 'noodle_soup_bowl', cat: 'noodle' },
    { fam: 'boat_noodle', keys: ['ก๋วยเตี๋ยวเรือ', 'เรือ'], icon: 'noodle_soup_bowl', cat: 'noodle' },
    { fam: 'kuay_jab', keys: ['ก๋วยจั๊บ'], icon: 'rice_porridge', cat: 'noodle' },
    { fam: 'ramen', keys: ['ราเมง', 'ราเมน'], icon: 'tonkotsu_ramen', cat: 'japanese' },
    { fam: 'pho', keys: ['เฝอ'], icon: 'beef_pho', cat: 'noodle' },
    { fam: 'udon', keys: ['อูด้ง', 'อุด้ง'], icon: 'noodle_soup_bowl', cat: 'japanese' },
    { fam: 'spaghetti', keys: ['สปาเกตตี', 'พาสต้า', 'สปาเกต'], icon: 'spaghetti_bolognese', cat: 'western' },
    { fam: 'macaroni', keys: ['มักกะโรนี'], icon: 'spaghetti_bolognese', cat: 'western' },
    { fam: 'suki', keys: ['สุกี้'], icon: 'tofu_soup', cat: 'noodle' },
    { fam: 'noodle_generic', keys: ['ก๋วยเตี๋ยว', 'บะหมี่', 'เส้นเล็ก', 'เส้นใหญ่', 'เส้นหมี่', 'ขนมจีน', 'วุ้นเส้น'], icon: 'noodle_soup_bowl', cat: 'noodle' },
    // rice dishes
    { fam: 'krapao', keys: ['กะเพรา'], icon: 'pad_krapao_moo_kai_dao', prot: { chicken: 'stir_fried_basil_chicken', shrimp: 'stir_fried_basil_seafood', squid: 'stir_fried_basil_seafood', crab: 'stir_fried_basil_seafood', fish: 'stir_fried_basil_seafood' }, cat: 'thai_rice_dish' },
    { fam: 'fried_rice', keys: ['ข้าวผัด', 'ข้าวคลุก'], icon: 'egg_fried_rice', prot: { crab: 'crab_fried_rice' }, kw: { 'สับปะรด': 'pineapple_fried_rice_set', 'ปู': 'crab_fried_rice' }, cat: 'thai_rice_dish' },
    { fam: 'khao_man_kai', keys: ['ข้าวมันไก่'], icon: 'khao_man_gai', cat: 'thai_rice_dish' },
    { fam: 'khao_moo_daeng', keys: ['ข้าวหมูแดง', 'ข้าวหมูกรอบ', 'ข้าวหน้าเป็ด', 'ข้าวขาหมู', 'ข้าวเป็ด'], icon: 'roasted_duck_rice', cat: 'thai_rice_dish' },
    { fam: 'khao_kai_jeaw', keys: ['ข้าวไข่เจียว', 'ไข่เจียว'], icon: 'thai_omelette', cat: 'thai_rice_dish' },
    { fam: 'khao_na', keys: ['ข้าวหน้า', 'ข้าวราดแกง', 'ข้าวราด'], icon: 'rice_and_curry_set', cat: 'thai_rice_dish' },
    { fam: 'khao_kluk_kapi', keys: ['ข้าวคลุกกะปิ'], icon: 'thai_spicy_rice_salad', cat: 'thai_rice_dish' },
    { fam: 'khao_tom', keys: ['ข้าวต้ม'], icon: 'rice_porridge', cat: 'soup' },
    { fam: 'jok', keys: ['โจ๊ก'], icon: 'rice_porridge', cat: 'soup' },
    { fam: 'khao_niew_mamuang', keys: ['ข้าวเหนียวมะม่วง'], icon: 'mango_sticky_rice', cat: 'dessert' },
    // soup / curry
    { fam: 'tom_yum', keys: ['ต้มยำ', 'ต้มแซ่บ', 'ต้มโคล้ง'], icon: 'tom_yum_goong', cat: 'soup' },
    { fam: 'tom_kha', keys: ['ต้มข่า'], icon: 'tom_kha_gai', cat: 'soup' },
    { fam: 'tom_jued', keys: ['ต้มจืด', 'แกงจืด'], icon: 'vegetable_soup', cat: 'soup' },
    { fam: 'green_curry', keys: ['แกงเขียวหวาน', 'เขียวหวาน'], icon: 'green_curry_chicken', cat: 'curry' },
    { fam: 'red_curry', keys: ['แกงเผ็ด', 'แกงแดง', 'พะแนง', 'แพนง'], icon: 'red_curry_chicken', cat: 'curry' },
    { fam: 'gaeng_som', keys: ['แกงส้ม'], icon: 'gaeng_som_fish', cat: 'curry' },
    { fam: 'massaman', keys: ['มัสมั่น'], icon: 'massaman_curry', cat: 'curry' },
    { fam: 'curry_yellow', keys: ['แกงกะหรี่', 'กะหรี่'], icon: 'yellow_curry_fish_balls', cat: 'curry' },
    { fam: 'curry_generic', keys: ['แกง'], icon: 'assorted_curry_bowls', cat: 'curry' },
    { fam: 'soup_generic', keys: ['ซุป', 'สตูว์', 'สตู', 'ต้มเลือดหมู', 'ต้มกระดูก', 'ต้ม'], icon: 'vegetable_soup', cat: 'soup' },
    { fam: 'egg_pan', keys: ['ไข่กระทะ', 'ไข่ตุ๋น', 'ไข่ตุ๋นทรงเครื่อง'], icon: 'scrambled_egg_and_omelette_set', cat: 'thai_dish' },
    // salad / yum
    { fam: 'som_tam', keys: ['ส้มตำ', 'ตำไทย', 'ตำปู', 'ตำปลาร้า', 'ตำถาด', 'ตำมั่ว', 'ตำซั่ว', 'ตำป่า', 'ตำโคราช'], icon: 'som_tam_thai', kw: { 'ไข่เค็ม': 'som_tam_with_salted_egg' }, cat: 'salad' },
    { fam: 'larb', keys: ['ลาบ'], icon: 'larb_moo', cat: 'salad' },
    { fam: 'nam_tok', keys: ['น้ำตก'], icon: 'nam_tok_moo', cat: 'salad' },
    { fam: 'yum_woonsen', keys: ['ยำวุ้นเส้น'], icon: 'yum_woon_sen', cat: 'salad' },
    { fam: 'yum_seafood', keys: ['ยำทะเล', 'ยำรวมมิตร'], icon: 'spicy_seafood_salad', cat: 'salad' },
    { fam: 'salad', keys: ['สลัด'], icon: 'green_salad', prot: { chicken: 'grilled_chicken_salad', salmon: 'grilled_salmon_set' }, cat: 'salad' },
    { fam: 'yum_generic', keys: ['ยำ'], icon: 'thai_salad_set', cat: 'salad' },
    // grilled / fried protein dishes
    { fam: 'fried_chicken', keys: ['ไก่ทอด', 'ไก่กรอบ'], icon: 'thai_fried_chicken', cat: 'thai_dish' },
    { fam: 'roast_chicken', keys: ['ไก่ย่าง', 'ไก่อบ'], icon: 'roast_chicken', cat: 'thai_dish' },
    { fam: 'moo_ping', keys: ['หมูปิ้ง', 'หมูสะเต๊ะ', 'หมูย่าง'], icon: 'moo_satay_with_peanut_sauce', cat: 'thai_dish' },
    { fam: 'moo_krob', keys: ['หมูกรอบ', 'คะน้าหมูกรอบ'], icon: 'crispy_pork_with_morning_glory', cat: 'thai_dish' },
    { fam: 'steak', keys: ['สเต๊ก', 'สเต็ก', 'สเตค'], icon: 'grilled_steak', cat: 'western' },
    { fam: 'grilled_fish', keys: ['ปลาเผา', 'ปลาย่าง', 'ปลานึ่ง', 'ปลาทอด', 'ปลาราดพริก'], icon: 'fish_meal_set', prot: { salmon: 'grilled_salmon_steak' }, cat: 'thai_dish' },
    { fam: 'sausage', keys: ['ไส้กรอกอีสาน', 'ไส้กรอก', 'แหนม'], icon: 'sai_krok_isan', cat: 'thai_dish' },
    { fam: 'tod_mun', keys: ['ทอดมัน'], icon: 'tod_mun_pla', cat: 'thai_dish' },
    { fam: 'satay', keys: ['สะเต๊ะ'], icon: 'moo_satay_with_peanut_sauce', cat: 'thai_dish' },
    // stir fry
    { fam: 'stir_morning_glory', keys: ['ผัดผักบุ้ง', 'ผักบุ้งไฟแดง'], icon: 'crispy_pork_with_morning_glory', cat: 'thai_dish' },
    { fam: 'stir_tofu', keys: ['ผัดเต้าหู้', 'เต้าหู้ผัด'], icon: 'stir_fried_tofu_with_vegetables', cat: 'thai_dish' },
    { fam: 'stir_black_pepper', keys: ['พริกไทยดำ', 'ผัดพริกไทยดำ'], icon: 'stir_fried_beef_black_pepper', cat: 'thai_dish' },
    { fam: 'stir_shrimp', keys: ['ผัดกุ้ง', 'กุ้งผัด'], icon: 'stir_fried_shrimp_with_vegetables', cat: 'thai_dish' },
    { fam: 'stir_veg', keys: ['ผัดผัก', 'ผัดพริกแกง', 'ผัดเปรี้ยวหวาน', 'ผัดขิง', 'ผัดกระเทียม', 'ผัดน้ำมันหอย', 'คะน้า'], icon: 'mixed_vegetable_stir_fry', cat: 'thai_dish' },
    // japanese / korean / intl
    { fam: 'sushi', keys: ['ซูชิ', 'มากิ', 'นิกิริ', 'นิงิริ'], icon: 'sushi', cat: 'japanese' },
    { fam: 'sashimi', keys: ['ซาชิมิ', 'ซาซิมิ'], icon: 'salmon_nigiri', cat: 'japanese' },
    { fam: 'onigiri', keys: ['โอนิกิริ', 'ข้าวปั้น'], icon: 'salmon_onigiri', cat: 'japanese' },
    { fam: 'bento', keys: ['เบนโตะ', 'ข้าวกล่อง'], icon: 'japanese_bento_box', cat: 'japanese' },
    { fam: 'donburi', keys: ['ข้าวหน้าปลาไหล', 'คัตสึด้ง', 'กิวด้ง'], icon: 'japanese_bento_box', cat: 'japanese' },
    { fam: 'jp_curry', keys: ['แกงกะหรี่ญี่ปุ่น', 'คาเรราสึ'], icon: 'japanese_curry_rice', cat: 'japanese' },
    { fam: 'kimchi', keys: ['กิมจิ'], icon: 'kimchi', cat: 'korean' },
    { fam: 'burger', keys: ['เบอร์เกอร์', 'เบอเกอร์', 'แฮมเบอร์เกอร์'], icon: 'cheeseburger', cat: 'western' },
    { fam: 'pizza', keys: ['พิซซ่า', 'พิซซา'], icon: 'pepperoni_pizza', cat: 'western' },
    { fam: 'taco', keys: ['ทาโก้', 'เบอร์ริโต', 'เบอริโต้'], icon: 'taco', cat: 'western' },
    { fam: 'sandwich', keys: ['แซนด์วิช', 'แซนวิช', 'ครัวซองต์'], icon: 'club_sandwich', cat: 'western' },
    { fam: 'hotdog', keys: ['ฮอทดอก', 'ฮอตดอก'], icon: 'hot_dog', cat: 'western' },
    { fam: 'fries', keys: ['เฟรนช์ฟราย', 'มันฝรั่งทอด', 'เฟรนฟราย'], icon: 'french_fries_box', cat: 'western' },
    // breakfast
    { fam: 'omelette_set', keys: ['ออมเล็ต', 'สแครมเบิล'], icon: 'scrambled_egg_and_omelette_set', cat: 'breakfast' },
    { fam: 'pancake', keys: ['แพนเค้ก'], icon: 'pancakes_with_butter', cat: 'breakfast' },
    { fam: 'waffle', keys: ['วาฟเฟิล'], icon: 'waffle_plate', cat: 'breakfast' },
    { fam: 'cereal', keys: ['ซีเรียล', 'กราโนล่า', 'คอนเฟลก'], icon: 'breakfast_cereal_set', cat: 'breakfast' },
    { fam: 'oatmeal', keys: ['โอ๊ตมีล', 'ข้าวโอ๊ต', 'โอ้ตมีล', 'โอ๊ตนม', 'ข้าวโอ้ต'], icon: 'oatmeal', cat: 'breakfast' },
    { fam: 'toast', keys: ['ปังปิ้ง', 'ขนมปังปิ้ง', 'ขนมปังเนย', 'อโวคาโดโทสต์', 'อะโวคาโดโทสต์', 'โทสต์'], icon: 'buttered_toast', cat: 'breakfast' },
    { fam: 'boiled_egg', keys: ['ไข่ต้ม', 'ไข่ลวก'], icon: 'soft_boiled_egg', cat: 'breakfast' },
    // drinks
    { fam: 'bubble_tea', keys: ['ชานมไข่มุก', 'ไข่มุก', 'บับเบิล'], icon: 'bubble_milk_tea', cat: 'drink' },
    { fam: 'thai_tea', keys: ['ชาไทย', 'ชานม', 'ชาเย็น', 'ชาดำเย็น'], icon: 'thai_milk_tea', cat: 'drink' },
    { fam: 'matcha', keys: ['มัทฉะ', 'ชาเขียว'], icon: 'matcha_latte', cat: 'drink' },
    { fam: 'coffee', keys: ['กาแฟ', 'ลาเต้', 'อเมริกาโน', 'คาปูชิโน', 'เอสเพรสโซ', 'มอคค่า', 'โอเลี้ยง', 'เอสเพรสโซ่'], icon: 'cafe_latte', cat: 'drink' },
    { fam: 'tea_plain', keys: ['ชาร้อน', 'ชาดำ', 'ชาอู่หลง', 'ชาสมุนไพร', 'ชาคาโมมายล์'], icon: 'black_tea', cat: 'drink' },
    { fam: 'cocoa', keys: ['โกโก้', 'ช็อกโกแลตร้อน', 'ช็อกโกแลตเย็น', 'ช็อคโกแลต'], icon: 'iced_chocolate', cat: 'drink' },
    { fam: 'protein_shake', keys: ['โปรตีนเชค', 'เวย์โปรตีนเชค', 'เวย์'], icon: 'chocolate_protein_shake', cat: 'drink' },
    { fam: 'smoothie', keys: ['สมูทตี้', 'น้ำปั่น', 'ปั่น'], icon: 'green_detox_smoothie', cat: 'drink' },
    { fam: 'juice', keys: ['น้ำผลไม้', 'น้ำส้ม', 'น้ำแอปเปิล', 'น้ำองุ่น', 'น้ำมะพร้าว'], icon: 'fresh_orange_juice', cat: 'drink' },
    { fam: 'soda', keys: ['น้ำอัดลม', 'โซดา', 'สปาร์คกลิ้ง'], icon: 'sparkling_water_can', cat: 'drink' },
    { fam: 'milk', keys: ['นมสด', 'นมจืด', 'นมวัว', 'นมช็อก', 'นมเปรี้ยว'], icon: 'milk_glass', cat: 'drink' },
    { fam: 'water', keys: ['น้ำเปล่า', 'น้ำแร่'], icon: 'drinking_water', cat: 'drink' },
    // dessert
    { fam: 'ice_cream', keys: ['ไอศกรีม', 'ไอศครีม', 'ไอติม'], icon: 'ice_cream_cone', cat: 'dessert' },
    { fam: 'cake', keys: ['เค้ก', 'ชีสเค้ก', 'บราวนี่'], icon: 'chocolate_cake_slice', cat: 'dessert' },
    { fam: 'donut', keys: ['โดนัท'], icon: 'strawberry_donut', cat: 'dessert' },
    { fam: 'cookie', keys: ['คุกกี้'], icon: 'chocolate_chip_cookie', cat: 'dessert' },
    { fam: 'bua_loy', keys: ['บัวลอย'], icon: 'bua_loy', cat: 'dessert' },
    { fam: 'tubtim', keys: ['ทับทิมกรอบ'], icon: 'tub_tim_grob', cat: 'dessert' },
    { fam: 'thai_dessert', keys: ['ขนมครก', 'ขนมชั้น', 'ขนมถ้วย', 'ทองหยิบ', 'ทองหยอด', 'ฝอยทอง', 'ลอดช่อง', 'ครองแครง', 'ตะโก้', 'สังขยา', 'วุ้นกะทิ', 'วุ้นมะพร้าว', 'ขนมไทย', 'ลูกชุบ', 'ขนมเบื้อง', 'แกงบวด', 'บวชชี'], icon: 'thai_coconut_dessert_set', cat: 'dessert' },
    { fam: 'chocolate_bar', keys: ['ช็อกโกแลตบาร์', 'ช็อกโกแลตแท่ง'], icon: 'chocolate_bar', cat: 'dessert' }
  ];

  var CAT_MAP = {
    'เครื่องดื่ม': 'drink', 'ของหวาน': 'dessert', 'ขนม': 'dessert', 'ผลไม้': 'fruit',
    'ผัก': 'veg', 'เนื้อสัตว์': 'protein', 'ญี่ปุ่น': 'japanese', 'เกาหลี': 'korean',
    'ตะวันตก': 'western', 'จีน': 'chinese', 'เวียดนาม': 'noodle', 'อาหารทะเล': 'seafood',
    'ของว่าง': 'snack', 'มื้อเช้า': 'breakfast', 'มื้อเช้า/ว่าง': 'breakfast', 'สะดวกซื้อ': 'snack'
  };
  var BUCKET_ICON = {
    drink: 'thai_milk_tea', dessert: 'dessert_ice_cream_bowl', fruit: 'fresh_fruit_bowl',
    veg: 'mixed_vegetable_stir_fry', protein: 'grilled_beef_steak_plate', japanese: 'japanese_bento_box',
    korean: 'kimchi', western: 'grilled_steak', chinese: 'stir_fried_noodles', seafood: 'spicy_seafood_salad',
    snack: 'mixed_thai_snack_set', breakfast: 'breakfast_cereal_set', rice: 'rice_bowl', noodle: 'noodle_soup_bowl'
  };
  var PROTEIN_ICON = { chicken: 'chicken_breast', pork: 'pork_chop', beef: 'beef_steak', shrimp: 'shrimp', squid: 'raw_squid', crab: 'crab', salmon: 'salmon_fillet', fish: 'white_fish_fillet', egg: 'fried_egg', tofu: 'tofu' };
  var FRUIT_MAP = [['ส้มโอ', 'pomelo_half'], ['สาลี่', 'pear'], ['มะนาว', 'lime'], ['มะม่วง', 'mango'], ['กล้วย', 'banana'], ['ส้ม', 'orange'], ['แอปเปิล', 'apple'], ['แตงโม', 'watermelon'], ['สับปะรด', 'pineapple'], ['ทุเรียน', 'durian_piece'], ['เงาะ', 'rambutan'], ['ลำไย', 'longan'], ['ลองกอง', 'longan'], ['องุ่น', 'grapes'], ['ฝรั่ง', 'guava_half'], ['มังคุด', 'jackfruit_and_mangosteen'], ['ชมพู่', 'rose_apple'], ['ลิ้นจี่', 'lychee'], ['แก้วมังกร', 'coconut_and_dragon_fruit_set'], ['สตรอ', 'strawberry'], ['บลูเบอร์', 'blueberries'], ['มะละกอ', 'papaya_half'], ['แคนตาลูป', 'cantaloupe_melon'], ['เมลอน', 'honeydew_melon'], ['พีช', 'peach'], ['เชอร์รี', 'cherry'], ['กีวี', 'kiwi'], ['อะโวคาโด', 'avocado'], ['มะพร้าว', 'coconut']];
  var FRUIT_EXCLUDE = ['มันฝรั่ง', 'หน่อไม้ฝรั่ง', 'เม็ดมะม่วง', 'นึ่งมะนาว', 'น้ำมะนาว', 'ยำ', 'ตำ', 'ผัด', 'ทอด', 'แกง', 'พริก', 'อบไก่', 'สตูว์'];

  var OVERRIDES = (root && root.IUFIT_FOOD_ICON_OVERRIDES) || {};
  // ไอคอน "เซ็ต/หลายชิ้นในกรอบเดียว" -> ชิ้นเดียวที่สะอาด (กัน 2 รูปในอันเดียว)
  var SET_REMAP = {
    assorted_curry_bowls: 'red_curry_chicken', assorted_thai_curry_set: 'red_curry_chicken', assorted_noodle_bowls: 'noodle_soup_bowl',
    assorted_thai_soup_set: 'vegetable_soup', assorted_congee_set: 'rice_porridge', assorted_thai_salad_set: 'green_salad',
    assorted_thai_food_set: 'healthy_meal_plate', assorted_salad_set: 'green_salad', assorted_drink_and_fruit_set: 'fresh_fruit_bowl',
    rice_and_curry_set: 'roasted_duck_rice', fish_meal_set: 'grilled_salmon_steak', fish_and_shrimp_bowl_set: 'shrimp_salad_bowl',
    breakfast_cereal_set: 'oatmeal', waffle_and_cereal_set: 'waffle_plate', mixed_thai_snack_set: 'curry_puff',
    mixed_fried_snacks_set: 'curry_puff', thai_salad_set: 'spicy_seafood_salad', grilled_chicken_and_fruit_set: 'roast_chicken',
    ham_sausage_and_cheese_set: 'grilled_sausage', scrambled_egg_and_omelette_set: 'thai_omelette',
    thai_dessert_and_meal_set: 'bua_loy', thai_dessert_and_drink_set: 'thai_milk_tea', thai_coconut_dessert_set: 'bua_loy',
    mango_sticky_rice: 'mango', grilled_salmon_set: 'grilled_salmon_steak', shrimp_tempura_seafood_set: 'shrimp',
    dim_sum_and_meatballs_set: 'shrimp_dim_sum', roti_and_crepe_set: 'thai_omelette', thai_street_food_set: 'curry_puff',
    small_thai_condiment_set: 'thai_chili_paste', spicy_thai_relish_set: 'thai_chili_paste', grilled_squid_and_fried_chicken_set: 'thai_fried_chicken',
    honey_tea_snack_set: 'black_tea', coffee_jam_peanut_butter_set: 'cafe_latte', soda_and_snack_set: 'sparkling_water_can',
    granola_bar_and_drink: 'oatmeal', protein_bar_and_milk: 'chocolate_protein_shake', water_bottle_and_juice_box: 'drinking_water',
    cashew_and_pineapple_set: 'pineapple', coconut_and_dragon_fruit_set: 'coconut', tropical_fruit_pair: 'mango',
    juice_pair: 'fresh_orange_juice', smoothie_pair: 'green_detox_smoothie', dessert_cupcake_set: 'chocolate_cake_slice',
    thai_meal_set_with_green_drink: 'healthy_meal_plate', bao_and_coffee_set: 'cafe_latte', dip_and_sauce_set: 'thai_chili_paste',
    steamed_bun_and_fruit_bowl: 'fresh_fruit_bowl', wrap_and_quesadilla_set: 'veggie_wrap', meat_and_wrap_set: 'veggie_wrap',
    roast_chicken_and_wrap_set: 'roast_chicken', sushi_and_ramen_set: 'sushi', mac_and_cheese_lasagna_set: 'spaghetti_bolognese',
    stew_and_beans_set: 'vegetable_soup', salad_and_spinach_set: 'green_salad', chickpeas_beans_and_kale_set: 'green_salad',
    bean_and_bell_pepper_set: 'mixed_vegetable_stir_fry', vegetable_soup_set: 'vegetable_soup', cauliflower_and_mushroom_set: 'mixed_vegetable_stir_fry',
    cucumber_and_bamboo_shoot_set: 'mixed_vegetable_stir_fry', egg_noodle_and_glass_noodle_bundle: 'noodle_soup_bowl',
    grass_jelly_and_longan_drinks: 'thai_milk_tea', foi_thong_and_thong_yip_set: 'bua_loy', thong_yod_and_saku_set: 'bua_loy',
    banana_snack_and_coconut_sweet_set: 'bua_loy', taco_and_thai_custard_set: 'taco', thai_layer_cake_set: 'bua_loy',
    thai_dessert_and_meal: 'bua_loy', jackfruit_and_mangosteen: 'longan'
  };

  function pickFruit(n) { for (var i = 0; i < FRUIT_MAP.length; i++) if (n.indexOf(FRUIT_MAP[i][0]) > -1) return FRUIT_MAP[i][1]; return 'apple'; }
  function hasFruit(n) {
    for (var e = 0; e < FRUIT_EXCLUDE.length; e++) if (n.indexOf(FRUIT_EXCLUDE[e]) > -1) return false;
    for (var i = 0; i < FRUIT_MAP.length; i++) if (n.indexOf(FRUIT_MAP[i][0]) > -1) return true;
    return false;
  }
  function longestKeyMatch(n) {
    var best = null, bestLen = 0;
    for (var i = 0; i < FAMILIES.length; i++) {
      var f = FAMILIES[i];
      for (var j = 0; j < f.keys.length; j++) {
        var key = f.keys[j];
        if (key.length > bestLen && n.indexOf(key) > -1) { best = f; bestLen = key.length; }
      }
    }
    return best;
  }
  function drinkByName(n) {
    if (/ไข่มุก/.test(n)) return 'bubble_milk_tea';
    if (/ชาไทย|ชานม|ชาเย็น/.test(n)) return 'thai_milk_tea';
    if (/มัทฉะ|ชาเขียว/.test(n)) return 'matcha_latte';
    if (/กาแฟ|ลาเต้|อเมริกาโน|คาปูชิโน|โอเลี้ยง|มอคค่า/.test(n)) return 'cafe_latte';
    if (/โกโก้|ช็อกโก|ช็อคโก/.test(n)) return 'iced_chocolate';
    if (/โปรตีนเชค|เวย์/.test(n)) return 'chocolate_protein_shake';
    if (/สมูทตี้|ปั่น/.test(n)) return 'green_detox_smoothie';
    if (/น้ำส้ม|น้ำผลไม้|น้ำองุ่น|น้ำแอปเปิล/.test(n)) return 'fresh_orange_juice';
    if (/โซดา|น้ำอัดลม/.test(n)) return 'sparkling_water_can';
    if (/นม/.test(n)) return 'milk_glass';
    if (/ชา/.test(n)) return 'black_tea';
    if (/น้ำเปล่า|น้ำแร่/.test(n)) return 'drinking_water';
    return 'thai_milk_tea';
  }
  function res(iconKey, confidence, matchType, reason, alternatives) {
    if (SET_REMAP[iconKey]) iconKey = SET_REMAP[iconKey];
    return { iconKey: iconKey || 'healthy_meal_plate', confidence: +confidence.toFixed(2), matchType: matchType, reason: reason, alternatives: alternatives || [], review: confidence < 0.55 };
  }

  function matchFoodIcon(input) {
    input = input || {};
    var nameTh = input.nameTh != null ? input.nameTh : (input.n || '');
    var menuId = input.menuId || input.id || null;
    var category = input.category || input.c || '';
    var ings = input.ings || null;
    var n = norm(nameTh);
    var deriv = deriveFromIngs(ings);
    var protein = dominantProtein(deriv, n);

    if (menuId && OVERRIDES[menuId]) return res(OVERRIDES[menuId].icon_key || OVERRIDES[menuId], 1.0, 'override', 'manual override', []);

    var fam = longestKeyMatch(n);
    if (fam && fam.cat === 'salad' && n.indexOf('ต้มยำ') > -1) return res('tom_yum_goong', 0.8, 'dish_family', 'ตระกูล tom_yum', []);
    if (fam) {
      var icon = fam.icon, mtype = 'dish_family', conf = 0.80, reason = 'ตระกูล ' + fam.fam;
      if (fam.kw) { for (var kw in fam.kw) { if (n.indexOf(kw) > -1) { icon = fam.kw[kw]; mtype = 'dish_family_variant'; conf = 0.9; reason += ' + ' + kw; break; } } }
      if (fam.prot && protein && fam.prot[protein]) { icon = fam.prot[protein]; mtype = 'dish_family_protein'; conf = 0.92; reason += ' + โปรตีน ' + protein; }
      var alts = fam.prot ? [{ iconKey: fam.icon, confidence: 0.7 }] : [];
      return res(icon, conf, mtype, reason, alts);
    }

    var noIngProtein = !Object.keys(deriv.proteins).length;
    if (noIngProtein && hasFruit(n)) return res(pickFruit(n), 0.6, 'fruit', 'ผลไม้ (จากชื่อ)', []);

    var bucket = CAT_MAP[category] || null;
    if (bucket === 'fruit') return res(pickFruit(n), 0.6, 'category', 'หมวดผลไม้', []);
    if (bucket === 'drink') return res(drinkByName(n), 0.55, 'category', 'หมวดเครื่องดื่ม', []);
    if (bucket === 'dessert') return res('dessert_ice_cream_bowl', 0.55, 'category', 'หมวดของหวาน', []);
    if (bucket === 'protein' && protein) return res(PROTEIN_ICON[protein], 0.6, 'ingredient', 'วัตถุดิบโปรตีน (หมวดเนื้อสัตว์)', []);
    if (bucket === 'veg') return res('mixed_vegetable_stir_fry', 0.55, 'category', 'หมวดผัก', []);
    if (bucket === 'japanese') return res('japanese_bento_box', 0.5, 'category', 'หมวดญี่ปุ่น', []);
    if (bucket === 'western') return res('grilled_steak', 0.5, 'category', 'หมวดตะวันตก', []);
    if (bucket && BUCKET_ICON[bucket]) return res(BUCKET_ICON[bucket], 0.5, 'category', 'หมวด ' + category, []);

    if (deriv.base === 'noodle') return res('noodle_soup_bowl', 0.55, 'base', 'ฐานเส้น (จากส่วนผสม)', []);
    if (deriv.base === 'rice') return res('rice_bowl', 0.55, 'base', 'ฐานข้าว (จากส่วนผสม)', []);
    if (deriv.base === 'bread') return res('sandwich_triangles', 0.5, 'base', 'ฐานขนมปัง', []);

    return res('healthy_meal_plate', 0.2, 'generic', 'ไม่พบตระกูล/หมวดชัดเจน', []);
  }

  var api = { matchFoodIcon: matchFoodIcon, _deriveFromIngs: deriveFromIngs, FAMILIES: FAMILIES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) { root.IUFIT_matchFoodIcon = matchFoodIcon; root.IUFIT_foodMatcher = api; }
})(typeof window !== 'undefined' ? window : this);
