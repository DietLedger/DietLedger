# NutriLabel Feature Proposals

Features organized by monetization potential and implementation effort.

---

## Tier 1: High-Monetization, High Demand

### 1. Cloud Sync & Multi-Device Access (SaaS)

**Sell as:** Subscription ($3-5/month or $30/year)

Users sync recipes, meal plans, nutrition logs, and books across devices via a hosted sync server. This is the single most requested feature for any personal tool — users want their data everywhere.

- Background sync on open, on change, and at configurable intervals
- Multiple sync server support (self-hosted or NutriLabel Cloud)
- Conflict resolution with last-write-wins + manual merge UI
- End-to-end encryption option for self-hosted servers

**Why it sells:** Converts a one-time tool into recurring revenue. Essential for any user with more than one device.

---

### 2. Recipe Sharing & Community Hub

**Sell as:** Freemium — free to receive, paid to publish ($2/month or one-time unlock)

Users share recipes via public links or QR codes. A community recipe browser lets users discover and import recipes from others.

- Public recipe links with nutrition labels (great for dietitians, fitness influencers)
- QR code generation for printed recipe cards
- Import from shared link (one-click)
- Community gallery with search, categories, and ratings
- "Verified Nutritionist" badges for professionals

**Why it sells:** Creates network effects. Bloggers, dietitians, and fitness coaches will pay to share their recipes professionally. Free users become potential paying customers when they want to publish.

---

### 3. AI-Powered Recipe Assistant

**Sell as:** Subscription add-on ($2-4/month)

Integrate an LLM to help users in the kitchen and with meal planning.

- "What can I make with these ingredients?" — searches recipes by pantry contents
- Automatic recipe scaling ("scale this to serve 8")
- Substitution suggestions ("I don't have buttermilk")
- Generate shopping list from selected recipes
- Nutritional goal optimization ("plan my week under 2000 cal/day with 150g protein")
- Recipe description/instruction generation from ingredient list

**Why it sells:** High perceived value, trendy, and directly useful. Can be gated behind API usage limits on a free tier.

---

## Tier 2: Strong Value-Add Features

### 4. Family / Household Accounts

**Sell as:** Family plan ($5-7/month, up to 6 profiles)

Extend the existing `PersonProfile` system into full household management.

- Shared recipe library across family members
- Combined grocery lists (deduped ingredients with summed quantities)
- Per-person nutrition tracking with family dashboard
- Parental controls (restrict editing for children)
- "Who's cooking tonight" assignment in meal plans

**Why it sells:** Captures the household budget rather than individual. Most recipe apps are single-user — this differentiates NutriLabel.

---

### 5. Barcode Scanner & Smart Import

**Sell as:** One-time unlock ($5) or Pro tier

Use the device camera to scan product barcodes and auto-populate nutrition data from the FDA database (already integrated).

- Barcode scan → auto-fill ingredient nutrition from `FoodItem` / FDA API
- Photo-to-recipe: scan a handwritten recipe card, OCR the text, auto-structure it
- URL import: paste a recipe URL, auto-extract ingredients and instructions
- Import from Paprika, MyFitnessPal, Pepperplate, CopyMeThat (common migration paths)

**Why it sells:** Reduces friction to zero. The #1 reason users don't switch recipe apps is "I don't want to re-enter everything." This solves that.

---

### 6. Advanced Nutrition & Health Tracking

**Sell as:** Pro tier ($4/month)

Build on the existing `FoodLogEntry`, `WeightEntry`, and `PersonProfile` models.

- Daily/weekly/monthly nutrition dashboards with charts (Recharts already installed)
- Macro & micronutrient goal tracking with progress rings
- Weight trend analysis with projections toward goal date
- Allergen flagging and dietary restriction filters (gluten-free, keto, vegan, etc.)
- Blood sugar / blood pressure logging (expand health tracking)
- Export nutrition reports as PDF for doctor visits
- Integration with Apple Health / Google Fit / Samsung Health

**Why it sells:** Competes directly with MyFitnessPal premium but with the recipe-first approach. Health-conscious users pay consistently for tracking tools.

---

## Tier 3: Professional & Niche Features

### 7. Recipe Scaling Engine

**Sell as:** Free core (2x, 0.5x), Pro unlock for custom scaling ($2 one-time)

- Scale any recipe by servings, multiplier, or target calorie count
- Smart unit conversion (tablespoons → cups when scaling up)
- Ingredient-aware scaling (don't scale salt linearly, adjust spices proportionally)
- Batch cooking mode ("I'm making this for 50 people")

**Why it sells:** Simple but universally needed. The free tier demonstrates value, the paid tier unlocks power use.

---

### 8. Print Studio & Professional Templates

**Sell as:** Template packs ($2-3 each) or Pro tier

Expand the existing template system into a full print studio.

- Custom recipe card designs (seasonal, holiday, wedding, etc.)
- Full cookbook PDF export with table of contents, page numbers, and index
- Brand kit support (logo, colors, fonts) for professionals
- Recipe card packs (seasonal, minimalist, rustic, modern)
- Zine / booklet format for small batch printing

**Why it sells:** Users creating gifts (wedding recipe books, family heirloom cookbooks) will pay for professional output. Professionals (dietitians, chefs) need branded materials.

---

### 9. Grocery Delivery Integration

**Sell as:** Affiliate revenue (free for users)

Connect meal plans and grocery lists to delivery services.

- Generate cart links for Instacart, Walmart Grocery, Amazon Fresh
- Store preference selection for ingredient sources
- Price comparison across stores
- "Buy now" button on recipe ingredient lists

**Why it sells:** Zero-cost feature that generates affiliate revenue per order. Also makes the app stickier.

---

### 10. Dietary Compliance Mode

**Sell as:** Pro tier feature

For users with medical dietary requirements.

- FDA allergen auto-flagging (top 9 allergens) on recipes
- Custom dietary profiles (renal diet, low-FODMAP, diabetic exchange lists)
- Nutrient threshold alerts ("this recipe exceeds your daily sodium target")
- Medical meal plan templates (DASH diet, Mediterranean, etc.)
- Printable compliance reports for dietitians

**Why it sells:** Medical necessity users are the least price-sensitive. A renal diet patient or diabetic will pay $10+/month for a tool that keeps them safe.

---

## Tier 4: Ecosystem & Platform

### 11. Recipe Widget / Embed

**Sell as:** Free for basic, Pro for branded ($3/month)

Embeddable recipe cards for blogs and websites.

- JavaScript embed widget with nutrition label
- WordPress plugin
- Auto-generated schema.org / JSON-LD structured data for SEO
- Customizable colors and layout

**Why it sells:** Food bloggers are a massive market. They pay for tools that improve their SEO and presentation.

---

### 12. Cooking Mode & Voice Control

**Sell as:** Free feature (acquisition driver)

A hands-free cooking mode optimized for kitchen use.

- Step-by-step full-screen mode with large text
- Voice commands: "next step", "repeat", "set timer for 5 minutes"
- Built-in timer with voice alerts
- Keep screen awake option
- Convert units on the fly ("convert tablespoons to ml")

**Why it sells:** Not directly monetizable but dramatically increases daily active usage. Users who cook with the app are users who convert to paid.

---

### 13. Tauri Desktop App Distribution

**Sell as:** One-time purchase ($10-15) or included with subscription

The Tauri config already exists. Polish and distribute.

- Native desktop app (Windows, macOS, Linux) via Tauri
- Offline-first with local SQLite (already works)
- Auto-update mechanism
- System tray integration for quick recipe lookup
- Global hotkey to add ingredient from clipboard

**Why it sells:** Desktop users prefer native apps. One-time purchase captures users who resist subscriptions.

---

## Implementation Priority Matrix

| Feature | Revenue Potential | Dev Effort | Priority |
|---------|------------------|------------|----------|
| Cloud Sync | Very High | High | P0 |
| Barcode Scanner / Import | High | Medium | P0 |
| AI Recipe Assistant | Very High | Medium | P1 |
| Recipe Sharing | High | Medium | P1 |
| Advanced Nutrition Tracking | High | Medium | P1 |
| Family Accounts | High | High | P2 |
| Cooking Mode | Low (indirect) | Low | P2 |
| Print Studio | Medium | Medium | P2 |
| Recipe Scaling | Medium | Low | P3 |
| Grocery Delivery | Medium (affiliate) | Medium | P3 |
| Dietary Compliance | Medium | Medium | P3 |
| Recipe Widget | Medium | Low | P3 |
| Desktop App | Medium | Low | P3 |

## Recommended Launch Sequence

1. **Phase 1 (Month 1-2):** Cloud Sync + Barcode Scanner + Cooking Mode
   - Sync enables subscription model
   - Scanner removes migration friction
   - Cooking mode drives daily engagement

2. **Phase 2 (Month 3-4):** AI Assistant + Recipe Sharing + Advanced Nutrition
   - AI is the marquee feature
   - Sharing creates network effects
   - Nutrition tracking adds stickiness

3. **Phase 3 (Month 5-6):** Family Accounts + Print Studio + Desktop App
   - Household expansion
   - Professional use cases
   - Platform completeness

## Pricing Model Recommendation

- **Free Tier:** 50 recipes, single device, basic templates, cooking mode
- **Pro ($4/month or $36/year):** Unlimited recipes, cloud sync, AI assistant, advanced nutrition, all templates
- **Family ($7/month or $60/year):** Pro + 6 profiles, shared library, combined grocery lists
- **Lifetime ($99):** One-time Pro features without cloud sync, desktop app included
- **Professional ($12/month):** Family + branded templates, recipe embed, priority support
