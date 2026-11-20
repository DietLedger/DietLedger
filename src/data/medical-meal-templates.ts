import type { DaySlot } from '@/lib/types';

export type MedicalDietType = 'DASH' | 'Mediterranean' | 'Renal' | 'Diabetic' | 'LowFODMAP';

export interface MedicalMealTemplate {
  id: string;
  dietType: MedicalDietType;
  name: string;
  description: string;
  macroSplit: { protein: number; carbs: number; fat: number };
  maxSodiumMg?: number;
  maxPotassiumMg?: number;
  maxPhosphorusMg?: number;
  maxSugarG?: number;
  notes: string[];
  days: MedicalDayPlan[];
}

export interface MedicalDayPlan {
  day: 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';
  meals: MedicalMealEntry[];
}

export interface MedicalMealEntry {
  slot: DaySlot;
  suggestions: string[];
  targetCalories?: number;
}

export const MEDICAL_MEAL_TEMPLATES: MedicalMealTemplate[] = [
  {
    id: 'dash-diet',
    dietType: 'DASH',
    name: 'DASH Diet',
    description: 'Dietary Approaches to Stop Hypertension — emphasizes fruits, vegetables, whole grains, lean protein, and low sodium.',
    macroSplit: { protein: 18, carbs: 55, fat: 27 },
    maxSodiumMg: 2300,
    notes: [
      'Limit sodium to 2,300mg/day (1,500mg ideal)',
      'Emphasize potassium-rich foods',
      'Include 4-5 servings fruits, 4-5 servings vegetables daily',
      'Choose whole grains over refined',
      'Limit saturated fat to <6% of calories',
    ],
    days: [
      {
        day: 'Monday',
        meals: [
          { slot: 'morning', suggestions: ['Oatmeal with berries and walnuts', 'Whole wheat toast with avocado'], targetCalories: 400 },
          { slot: 'midMorning', suggestions: ['Apple with almond butter', 'Mixed fruit salad'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Grilled chicken salad with olive oil dressing', 'Whole grain roll', 'Side of steamed broccoli'], targetCalories: 550 },
          { slot: 'afternoon', suggestions: ['Raw vegetables with hummus', 'Unsalted mixed nuts (small handful)'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked salmon with quinoa', 'Roasted sweet potatoes', 'Mixed green salad'], targetCalories: 600 },
        ],
      },
      {
        day: 'Tuesday',
        meals: [
          { slot: 'morning', suggestions: ['Greek yogurt with banana and chia seeds', 'Whole grain cereal with skim milk'], targetCalories: 400 },
          { slot: 'midMorning', suggestions: ['Pear with cottage cheese', 'Celery sticks with peanut butter'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Turkey and spinach wrap (whole wheat)', 'Carrot sticks', 'Lentil soup'], targetCalories: 550 },
          { slot: 'afternoon', suggestions: ['Orange slices', 'Unsalted rice cakes with avocado'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Grilled chicken breast with brown rice', 'Steamed green beans', 'Mixed berry compote'], targetCalories: 600 },
        ],
      },
      {
        day: 'Wednesday',
        meals: [
          { slot: 'morning', suggestions: ['Whole grain pancakes with fresh strawberries', 'Skim milk'], targetCalories: 400 },
          { slot: 'midMorning', suggestions: ['Banana', 'Handful of unsalted almonds'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Tuna salad on whole grain bread', 'Tomato slices', 'Side salad with vinaigrette'], targetCalories: 550 },
          { slot: 'afternoon', suggestions: ['Grape tomatoes with mozzarella', 'Small pear'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Vegetable stir-fry with tofu', 'Brown rice', 'Steamed edamame'], targetCalories: 600 },
        ],
      },
      {
        day: 'Thursday',
        meals: [
          { slot: 'morning', suggestions: ['Scrambled eggs with spinach and tomatoes', 'Whole wheat English muffin'], targetCalories: 400 },
          { slot: 'midMorning', suggestions: ['Mixed fruit smoothie (banana, berries, skim milk)', 'Walnuts'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Grilled vegetable and chickpea salad', 'Whole grain pita', 'Tzatziki'], targetCalories: 550 },
          { slot: 'afternoon', suggestions: ['Apple slices with cinnamon', 'Unsalted sunflower seeds'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked cod with lemon and herbs', 'Quinoa pilaf', 'Roasted Brussels sprouts'], targetCalories: 600 },
        ],
      },
      {
        day: 'Friday',
        meals: [
          { slot: 'morning', suggestions: ['Overnight oats with blueberries and flaxseed', 'Green tea'], targetCalories: 400 },
          { slot: 'midMorning', suggestions: ['Peach with cottage cheese', 'Small handful of pistachios'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Black bean and vegetable soup', 'Whole grain crackers', 'Side salad'], targetCalories: 550 },
          { slot: 'afternoon', suggestions: ['Bell pepper strips with guacamole', 'Grapes'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Herb-crusted chicken breast', 'Mashed sweet potatoes (no salt)', 'Steamed asparagus'], targetCalories: 600 },
        ],
      },
      {
        day: 'Saturday',
        meals: [
          { slot: 'morning', suggestions: ['Veggie omelet (spinach, mushrooms, peppers)', 'Whole grain toast', 'Orange slices'], targetCalories: 400 },
          { slot: 'midMorning', suggestions: ['Yogurt parfait with granola and berries'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Grilled chicken Caesar salad (light dressing)', 'Whole grain breadstick', 'Fresh fruit cup'], targetCalories: 550 },
          { slot: 'afternoon', suggestions: ['Carrot and celery sticks with hummus', 'Handful of unsalted mixed nuts'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked tilapia with dill', 'Wild rice blend', 'Sautéed kale with garlic'], targetCalories: 600 },
        ],
      },
      {
        day: 'Sunday',
        meals: [
          { slot: 'morning', suggestions: ['Whole grain waffles with sliced peaches', 'Skim milk latte'], targetCalories: 400 },
          { slot: 'midMorning', suggestions: ['Fresh melon slices', 'Almonds'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Roasted vegetable and white bean stew', 'Mixed greens with balsamic', 'Whole grain roll'], targetCalories: 550 },
          { slot: 'afternoon', suggestions: ['Apple with peanut butter', 'Rice cakes'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Lemon herb grilled shrimp', 'Couscous with vegetables', 'Steamed zucchini'], targetCalories: 600 },
        ],
      },
    ],
  },
  {
    id: 'mediterranean-diet',
    dietType: 'Mediterranean',
    name: 'Mediterranean Diet',
    description: 'Rich in fruits, vegetables, whole grains, olive oil, fish, and moderate wine — emphasizing plant-based foods and healthy fats.',
    macroSplit: { protein: 15, carbs: 50, fat: 35 },
    notes: [
      'Primary fat source: extra virgin olive oil',
      'Fish/seafood at least 2x per week',
      'Include legumes and nuts daily',
      'Limit red meat to a few times per month',
      'Emphasize seasonal, locally sourced produce',
    ],
    days: [
      {
        day: 'Monday',
        meals: [
          { slot: 'morning', suggestions: ['Greek yogurt with honey, walnuts, and pomegranate', 'Whole grain toast with olive oil and tomato'], targetCalories: 420 },
          { slot: 'midMorning', suggestions: ['Handful of mixed nuts and dried figs', 'Fresh orange'], targetCalories: 180 },
          { slot: 'noon', suggestions: ['Lentil and vegetable soup', 'Whole grain bread with olive oil', 'Mixed salad with feta'], targetCalories: 580 },
          { slot: 'afternoon', suggestions: ['Hummus with cucumber and bell pepper sticks'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Grilled sardines with roasted peppers', 'Bulgar wheat tabbouleh', 'Steamed broccoli with lemon'], targetCalories: 620 },
        ],
      },
      {
        day: 'Tuesday',
        meals: [
          { slot: 'morning', suggestions: ['Shakshuka (eggs poached in tomato sauce)', 'Whole grain pita', 'Black olives'], targetCalories: 420 },
          { slot: 'midMorning', suggestions: ['Fresh figs with goat cheese', 'Almonds'], targetCalories: 180 },
          { slot: 'noon', suggestions: ['Grilled chicken souvlaki', 'Greek salad with olive oil', 'Whole grain rice'], targetCalories: 580 },
          { slot: 'afternoon', suggestions: ['Stuffed grape leaves (dolmas)', 'Tomato slices with oregano'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked sea bass with tomatoes and capers', 'Roasted potatoes with rosemary', 'Sautéed spinach with garlic and lemon'], targetCalories: 620 },
        ],
      },
      {
        day: 'Wednesday',
        meals: [
          { slot: 'morning', suggestions: ['Overnight oats with dates, almonds, and cinnamon', 'Fresh berries'], targetCalories: 420 },
          { slot: 'midMorning', suggestions: ['Pear with ricotta and honey'], targetCalories: 180 },
          { slot: 'noon', suggestions: ['Chickpea and roasted vegetable salad', 'Whole grain bread', 'Tahini dressing'], targetCalories: 580 },
          { slot: 'afternoon', suggestions: ['Mixed olives and sun-dried tomatoes', 'Walnuts'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Herb-roasted chicken thighs', 'Quinoa with pine nuts and herbs', 'Grilled zucchini and eggplant'], targetCalories: 620 },
        ],
      },
      {
        day: 'Thursday',
        meals: [
          { slot: 'morning', suggestions: ['Whole grain toast with avocado, tomato, and feta', 'Olives', 'Herbal tea'], targetCalories: 420 },
          { slot: 'midMorning', suggestions: ['Greek yogurt with honey and pistachios'], targetCalories: 180 },
          { slot: 'noon', suggestions: ['Grilled vegetable and halloumi wrap', 'Tomato cucumber salad', 'Lemon herb quinoa'], targetCalories: 580 },
          { slot: 'afternoon', suggestions: ['Roasted red pepper hummus with carrots', 'Handful of almonds'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Salmon fillet with dill and lemon', 'Roasted sweet potatoes', 'Mediterranean green beans with tomato'], targetCalories: 620 },
        ],
      },
      {
        day: 'Friday',
        meals: [
          { slot: 'morning', suggestions: ['Fruit and nut muesli with Greek yogurt', 'Drizzle of honey'], targetCalories: 420 },
          { slot: 'midMorning', suggestions: ['Fresh apricots', 'Cashews'], targetCalories: 180 },
          { slot: 'noon', suggestions: ['White bean and tuna salad', 'Roasted red peppers', 'Whole grain bread with olive oil'], targetCalories: 580 },
          { slot: 'afternoon', suggestions: ['Baba ganoush with whole wheat pita chips'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Grilled swordfish with olive tapenade', 'Roasted eggplant and tomatoes', 'Couscous with herbs'], targetCalories: 620 },
        ],
      },
      {
        day: 'Saturday',
        meals: [
          { slot: 'morning', suggestions: ['Vegetable frittata (spinach, sun-dried tomato, feta)', 'Whole grain bread', 'Mixed fruit'], targetCalories: 420 },
          { slot: 'midMorning', suggestions: ['Mixed berries with mascarpone'], targetCalories: 180 },
          { slot: 'noon', suggestions: ['Grilled lamb kebabs with vegetables', 'Tzatziki', 'Whole grain pita', 'Greek salad'], targetCalories: 580 },
          { slot: 'afternoon', suggestions: ['Stuffed dates with almond butter'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked branzino with herbed crust', 'Roasted potatoes with oregano', 'Sautéed chard with garlic'], targetCalories: 620 },
        ],
      },
      {
        day: 'Sunday',
        meals: [
          { slot: 'morning', suggestions: ['Pancakes with fresh fruit and ricotta', 'Honey drizzle', 'Coffee'], targetCalories: 420 },
          { slot: 'midMorning', suggestions: ['Grapes and pecorino cheese'], targetCalories: 180 },
          { slot: 'noon', suggestions: ['Pasta with fresh tomato basil sauce', 'Grilled vegetables', 'Mixed greens with olive oil'], targetCalories: 580 },
          { slot: 'afternoon', suggestions: ['Mixed nuts and dried apricots'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Roasted whole chicken with lemon and herbs', 'Farro salad with roasted peppers', 'Braised greens'], targetCalories: 620 },
        ],
      },
    ],
  },
  {
    id: 'renal-diet',
    dietType: 'Renal',
    name: 'Renal Diet',
    description: 'Designed for chronic kidney disease — controls protein, sodium, potassium, and phosphorus to reduce kidney workload.',
    macroSplit: { protein: 12, carbs: 60, fat: 28 },
    maxSodiumMg: 2000,
    maxPotassiumMg: 2000,
    maxPhosphorusMg: 800,
    notes: [
      'Limit sodium to 2,000mg/day',
      'Limit potassium to 2,000-3,000mg/day',
      'Limit phosphorus to 800-1,000mg/day',
      'Moderate protein (0.6-0.8g/kg body weight)',
      'Choose lower-potassium fruits and vegetables',
      'Avoid high-phosphorus foods (dairy, nuts, cola)',
    ],
    days: [
      {
        day: 'Monday',
        meals: [
          { slot: 'morning', suggestions: ['Rice cereal with rice milk', 'White toast with margarine', 'Apple juice'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Fresh strawberries', 'Graham crackers'], targetCalories: 120 },
          { slot: 'noon', suggestions: ['Grilled chicken breast (3oz)', 'White rice', 'Steamed green beans', 'Applesauce'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Rice cakes with jelly', 'Cranberry juice'], targetCalories: 120 },
          { slot: 'evening', suggestions: ['Baked white fish with lemon', 'Buttered egg noodles', 'Steamed cabbage', 'Peach slices'], targetCalories: 550 },
        ],
      },
      {
        day: 'Tuesday',
        meals: [
          { slot: 'morning', suggestions: ['Scrambled egg whites', 'English muffin', 'Grape juice'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Canned pears (drained)', 'Vanilla wafers'], targetCalories: 120 },
          { slot: 'noon', suggestions: ['Turkey sandwich on white bread', 'Lettuce and mustard', 'Apple slices', 'Pretzels (unsalted)'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Popcorn (unsalted, air-popped)', 'Apple cider'], targetCalories: 120 },
          { slot: 'evening', suggestions: ['Beef tips (2oz) with rice', 'Steamed carrots', 'Dinner roll with margarine', 'Mixed fruit cup (drained)'], targetCalories: 550 },
        ],
      },
      {
        day: 'Wednesday',
        meals: [
          { slot: 'morning', suggestions: ['Pancakes with maple syrup', 'Butter patty', 'Pineapple juice'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Blueberries', 'Rice Krispies treat'], targetCalories: 120 },
          { slot: 'noon', suggestions: ['Chicken salad (light mayo) on croissant', 'Cucumber slices', 'Grape jelly sandwich'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Vanilla wafers', 'Apple juice'], targetCalories: 120 },
          { slot: 'evening', suggestions: ['Baked pork chop (3oz)', 'Mashed potatoes (no milk)', 'Steamed corn', 'Angel food cake'], targetCalories: 550 },
        ],
      },
      {
        day: 'Thursday',
        meals: [
          { slot: 'morning', suggestions: ['French toast with syrup', 'Sausage patty (1 small)', 'Apple juice'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Fruit cocktail (drained)', 'Saltine crackers (unsalted)'], targetCalories: 120 },
          { slot: 'noon', suggestions: ['Tuna salad on white bread', 'Coleslaw (vinegar dressing)', 'Pear halves'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Graham crackers', 'Grape juice'], targetCalories: 120 },
          { slot: 'evening', suggestions: ['Roasted chicken thigh', 'Egg noodles', 'Steamed zucchini', 'Rice pudding (rice milk)'], targetCalories: 550 },
        ],
      },
      {
        day: 'Friday',
        meals: [
          { slot: 'morning', suggestions: ['Bagel with cream cheese (small amount)', 'Apple slices', 'Cranberry juice'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Peach slices', 'Rice cakes'], targetCalories: 120 },
          { slot: 'noon', suggestions: ['Egg salad on white bread', 'Baby carrots (small portion)', 'Gelatin cup'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Unsalted pretzels', 'Lemonade'], targetCalories: 120 },
          { slot: 'evening', suggestions: ['Baked cod with herbed breadcrumbs', 'White rice', 'Green beans (canned, drained)', 'Sherbet'], targetCalories: 550 },
        ],
      },
      {
        day: 'Saturday',
        meals: [
          { slot: 'morning', suggestions: ['Waffles with butter and syrup', 'Strawberries', 'Apple juice'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Vanilla wafer cookies', 'Pineapple juice'], targetCalories: 120 },
          { slot: 'noon', suggestions: ['Chicken noodle soup (homemade, low sodium)', 'Saltines', 'Applesauce'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Canned peaches (drained)', 'Graham crackers'], targetCalories: 120 },
          { slot: 'evening', suggestions: ['Meatloaf (3oz, beef/pork)', 'Mashed potatoes', 'Buttered corn', 'Cherry pie slice'], targetCalories: 550 },
        ],
      },
      {
        day: 'Sunday',
        meals: [
          { slot: 'morning', suggestions: ['Cereal with rice milk', 'Toast with margarine and jelly', 'Grape juice'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Apple slices with cinnamon', 'Rice cakes'], targetCalories: 120 },
          { slot: 'noon', suggestions: ['Roast beef sandwich on white bread', 'Cucumber slices', 'Fruit cocktail (drained)'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Popcorn (unsalted)', 'Cranberry juice'], targetCalories: 120 },
          { slot: 'evening', suggestions: ['Baked tilapia', 'Rice pilaf', 'Steamed cauliflower', 'Vanilla pudding (non-dairy)'], targetCalories: 550 },
        ],
      },
    ],
  },
  {
    id: 'diabetic-diet',
    dietType: 'Diabetic',
    name: 'Diabetic Diet',
    description: 'Illustrative sample meal plan; all numerical values are examples, not universal diabetes targets. Personalize with your care team.',
    macroSplit: { protein: 20, carbs: 45, fat: 35 },
    maxSugarG: 25,
    notes: [
      'The macro split, sugar limit and meal calories are illustrative, not individual recommendations.',
      'Individualize carbohydrate amounts and timing with your diabetes care team.',
      'Choose high-fiber whole foods, nonstarchy vegetables and lean proteins.',
      'Limit added sugars, refined grains and sugary drinks.',
    ],
    days: [
      {
        day: 'Monday',
        meals: [
          { slot: 'morning', suggestions: ['Egg white omelet with spinach and mushrooms', 'Whole wheat toast (1 slice)', 'Small apple'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['String cheese', 'Celery sticks with almond butter (1 tbsp)'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Grilled chicken breast salad', 'Quinoa (1/2 cup)', 'Olive oil and vinegar dressing', 'Mixed vegetables'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Greek yogurt (plain, unsweetened)', 'Walnuts (small handful)'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked salmon (4oz)', 'Roasted broccoli', 'Sweet potato (small)', 'Mixed greens'], targetCalories: 550 },
        ],
      },
      {
        day: 'Tuesday',
        meals: [
          { slot: 'morning', suggestions: ['Steel-cut oatmeal with cinnamon', 'Blueberries (1/2 cup)', 'Hard-boiled egg'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Cottage cheese (1/2 cup)', 'Cherry tomatoes'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Turkey and avocado wrap (whole wheat tortilla)', 'Carrot sticks', 'Side salad'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Hummus (2 tbsp) with bell pepper slices', 'Almonds (10)'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Grilled shrimp skewers', 'Brown rice (1/2 cup)', 'Steamed asparagus', 'Mixed green salad'], targetCalories: 550 },
        ],
      },
      {
        day: 'Wednesday',
        meals: [
          { slot: 'morning', suggestions: ['Whole grain cereal with unsweetened almond milk', 'Sliced strawberries', 'Pecans (1 tbsp)'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Apple slices with peanut butter (1 tbsp)'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Lentil soup', 'Mixed greens with grilled chicken', 'Whole grain roll (small)'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Hard-boiled egg', 'Cucumber slices', 'Baby carrots'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Herb-roasted chicken thigh (skinless)', 'Cauliflower mash', 'Steamed green beans', 'Small pear'], targetCalories: 550 },
        ],
      },
      {
        day: 'Thursday',
        meals: [
          { slot: 'morning', suggestions: ['Greek yogurt parfait (plain) with raspberries', 'Ground flaxseed (1 tbsp)', 'Green tea'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Unsalted mixed nuts (small handful)', 'Small orange'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Tuna salad with olive oil and lemon on whole grain bread', 'Mixed greens', 'Cherry tomatoes'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Edamame (1/2 cup shelled)', 'Bell pepper strips'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked chicken breast', 'Quinoa pilaf', 'Roasted Brussels sprouts', 'Side salad'], targetCalories: 550 },
        ],
      },
      {
        day: 'Friday',
        meals: [
          { slot: 'morning', suggestions: ['Veggie scramble (eggs with peppers, onions, spinach)', 'Whole wheat English muffin (1/2)'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['String cheese', 'Small handful of grapes'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Black bean and vegetable bowl', 'Brown rice (1/2 cup)', 'Salsa', 'Sliced avocado (1/4)'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Cottage cheese with cinnamon', 'Walnuts (5)'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Grilled flank steak (3oz)', 'Baked sweet potato (small)', 'Steamed broccoli', 'Mixed greens'], targetCalories: 550 },
        ],
      },
      {
        day: 'Saturday',
        meals: [
          { slot: 'morning', suggestions: ['Whole grain waffle (1) with almond butter', 'Sliced banana (1/2)', 'Cinnamon'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Peach slices', 'Almonds (10)'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Grilled chicken salad with mixed greens', 'Chickpeas (1/4 cup)', 'Olive oil dressing', 'Whole grain crackers'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Celery with cream cheese', 'Small apple'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked cod with tomato sauce', 'Whole wheat pasta (1/2 cup)', 'Steamed spinach', 'Small orange'], targetCalories: 550 },
        ],
      },
      {
        day: 'Sunday',
        meals: [
          { slot: 'morning', suggestions: ['Oat bran with walnuts and blueberries', 'Unsweetened soy milk'], targetCalories: 350 },
          { slot: 'midMorning', suggestions: ['Boiled egg', 'Cucumber and tomato slices'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Turkey meatballs with zucchini noodles', 'Marinara sauce (low sugar)', 'Mixed green salad'], targetCalories: 500 },
          { slot: 'afternoon', suggestions: ['Greek yogurt (plain)', 'Sliced almonds'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Pork tenderloin (3oz)', 'Roasted cauliflower', 'Wild rice (1/2 cup)', 'Steamed kale'], targetCalories: 550 },
        ],
      },
    ],
  },
  {
    id: 'low-fodmap-diet',
    dietType: 'LowFODMAP',
    name: 'Low-FODMAP Diet',
    description: 'For IBS management — eliminates fermentable oligosaccharides, disaccharides, monosaccharides, and polyols in a phased approach.',
    macroSplit: { protein: 20, carbs: 50, fat: 30 },
    notes: [
      'Phase 1: Elimination (2-6 weeks) — strict low-FODMAP',
      'Phase 2: Reintroduction — test one FODMAP group at a time',
      'Phase 3: Personalization — maintain tolerated foods',
      'Avoid: wheat, onions, garlic, apples, milk, beans, honey',
      'Safe: rice, oats, potatoes, lactose-free dairy, hard cheeses',
      'Use garlic-infused olive oil for flavor (FODMAP-free)',
    ],
    days: [
      {
        day: 'Monday',
        meals: [
          { slot: 'morning', suggestions: ['Lactose-free yogurt with blueberries and walnuts', 'Rice cakes'], targetCalories: 380 },
          { slot: 'midMorning', suggestions: ['Banana (firm, slightly green)', 'Almonds (10)'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Grilled chicken with rice', 'Steamed carrots', 'Spinach salad with olive oil and lemon'], targetCalories: 520 },
          { slot: 'afternoon', suggestions: ['Rice crackers with cheddar cheese', 'Kiwi fruit'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Grilled salmon with dill', 'Quinoa', 'Roasted zucchini and bell peppers'], targetCalories: 570 },
        ],
      },
      {
        day: 'Tuesday',
        meals: [
          { slot: 'morning', suggestions: ['Scrambled eggs with spinach and cheddar', 'Sourdough toast', 'Strawberries'], targetCalories: 380 },
          { slot: 'midMorning', suggestions: ['Orange (mandarin)', 'Walnuts'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Turkey and Swiss cheese on sourdough', 'Cucumber slices', 'Tomato (small portion)'], targetCalories: 520 },
          { slot: 'afternoon', suggestions: ['Lactose-free yogurt', 'Pecans'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Beef stir-fry with bell peppers and zucchini', 'Rice noodles', 'Soy sauce (small amount, wheat-free tamari preferred)'], targetCalories: 570 },
        ],
      },
      {
        day: 'Wednesday',
        meals: [
          { slot: 'morning', suggestions: ['Oatmeal with maple syrup and walnuts', 'Blueberries'], targetCalories: 380 },
          { slot: 'midMorning', suggestions: ['Rice cakes with almond butter', 'Banana (1/2)'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Tuna salad (mayo, no onion/garlic) on rice cakes', 'Carrot sticks', 'Mixed greens with olive oil'], targetCalories: 520 },
          { slot: 'afternoon', suggestions: ['Hard cheese (cheddar or Swiss)', 'Rice crackers'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked chicken thighs with paprika and oregano', 'Sweet potato (1/2 medium)', 'Steamed green beans'], targetCalories: 570 },
        ],
      },
      {
        day: 'Thursday',
        meals: [
          { slot: 'morning', suggestions: ['Smoothie: lactose-free milk, banana, strawberries, peanut butter'], targetCalories: 380 },
          { slot: 'midMorning', suggestions: ['Macadamia nuts', 'Cantaloupe (small portion)'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Grilled chicken with rice bowl', 'Edamame (1/2 cup)', 'Cucumber and carrot matchsticks'], targetCalories: 520 },
          { slot: 'afternoon', suggestions: ['Corn tortilla chips with salsa (no onion/garlic)', 'Lactose-free cheese'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Pan-seared white fish with lemon', 'Risotto (arborio rice, no onion — use chives)', 'Steamed spinach'], targetCalories: 570 },
        ],
      },
      {
        day: 'Friday',
        meals: [
          { slot: 'morning', suggestions: ['Omelet with cheddar and tomato', 'Sourdough toast', 'Orange slices'], targetCalories: 380 },
          { slot: 'midMorning', suggestions: ['Dark chocolate (2 squares, ≥70%)', 'Almonds'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Rice bowl with grilled chicken, cucumber, carrot, and tamari glaze'], targetCalories: 520 },
          { slot: 'afternoon', suggestions: ['Lactose-free yogurt with maple syrup'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Pasta (gluten-free) with tomato basil sauce (no garlic/onion)', 'Grilled shrimp', 'Mixed green salad with lemon vinaigrette'], targetCalories: 570 },
        ],
      },
      {
        day: 'Saturday',
        meals: [
          { slot: 'morning', suggestions: ['Pancakes (gluten-free flour)', 'Maple syrup', 'Strawberries', 'Bacon (2 strips)'], targetCalories: 380 },
          { slot: 'midMorning', suggestions: ['Rice pudding (lactose-free milk)'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['BLT on sourdough (lettuce, tomato, bacon, mayo)', 'Cucumber salad'], targetCalories: 520 },
          { slot: 'afternoon', suggestions: ['Rice crackers with almond butter', 'Kiwi'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Grilled lamb chops with rosemary', 'Roasted potato wedges', 'Steamed carrots with chives'], targetCalories: 570 },
        ],
      },
      {
        day: 'Sunday',
        meals: [
          { slot: 'morning', suggestions: ['Breakfast burrito: egg, cheddar, spinach on corn tortilla', 'Orange wedges'], targetCalories: 380 },
          { slot: 'midMorning', suggestions: ['Banana with peanut butter', 'Walnuts'], targetCalories: 150 },
          { slot: 'noon', suggestions: ['Chicken soup (chicken broth, rice, carrots, celery, no onion)', 'Sourdough bread', 'Side salad'], targetCalories: 520 },
          { slot: 'afternoon', suggestions: ['Cheddar cheese cubes', 'Rice crackers', 'Grapes (small portion)'], targetCalories: 150 },
          { slot: 'evening', suggestions: ['Baked salmon with lemon and dill', 'Quinoa with chives', 'Roasted bell peppers and zucchini'], targetCalories: 570 },
        ],
      },
    ],
  },
];
