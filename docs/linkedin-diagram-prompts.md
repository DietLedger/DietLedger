# LinkedIn Diagram Generation Prompts for DietLedger

Use these prompts in ChatGPT image generation or another professional diagram tool. Each prompt is written to produce a clean LinkedIn-friendly image. Recommended format: 16:9, high contrast, minimal text, modern technical style.

---

## Visual style to reuse

Copy this style paragraph into every image prompt if you want a consistent series:

> Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional. 

---

## 1. System context diagram

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a professional system context diagram for a product named DietLedger, a hosted nutrition platform. Show actors on the left: Authenticated User, Anonymous Visitor, Administrator. Show a central boundary labeled DietLedger containing Next.js Web Application, Go REST API, and PostgreSQL. Show an external dependency on the right labeled USDA FoodData Central API. Show arrows: users access Next.js; Next.js forwards /api calls to Go REST API; Go API reads/writes PostgreSQL; Go API optionally calls USDA for live food search fallback. Emphasize trust boundaries: browser is outside, DietLedger system boundary is inside, USDA is external. Use concise labels only.
```

---

## 2. Container/deployment topology

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a deployment architecture diagram for DietLedger running on a single Docker host. Show a host boundary labeled Operator-selected Remote Docker Host. Inside it show three containers: dietledger-web running Next.js standalone on port 3000, dietledger-api running Go API on port 8080, and dietledger-postgres running PostgreSQL 17 with a pg-data Docker volume. Show the browser reaching host port 3000, the web container calling API_URL=http://dietledger-api:8080, and the API container using DATABASE_URL to PostgreSQL. Include healthcheck icons for web and API. Make it look like a clean production topology diagram.
```

---

## 3. Major component responsibilities

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a layered architecture diagram for DietLedger with four horizontal layers from top to bottom: Browser UI, Next.js Frontend, Go API, PostgreSQL. For each layer include a short responsibility: Browser UI = user interaction only; Next.js = presentation, routing, API proxy; Go API = validation, business rules, authorization; PostgreSQL = authoritative persistent data. Add a side note: React Query owns server-state cache; Zustand owns transient UI state only. Use downward arrows to show authority flows toward PostgreSQL and upward arrows to show data returned to the UI.
```

---

## 4. Request and data flow sequence

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a clean sequence-style architecture diagram showing a DietLedger authenticated read/write request. Participants from left to right: Browser React Component, GoApiClient, Next.js /api Proxy, Go API Handler, PostgreSQL. Flow: user action; fetch /api with Bearer token; proxy forwards to API_URL; API validates JWT/API key; API checks ownership and validates input; API reads/writes PostgreSQL; API returns JSON; React Query caches or invalidates and UI updates. Use numbered arrows and short labels.
```

---

## 5. Food search and USDA fallback flow

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a professional data flow diagram for DietLedger food search. Show user searching foods in the UI. The request goes to Go API /api/foods/search. First branch queries PostgreSQL food_items with full-text search. If results exist, return local results. If no local results and page is 1, load the user's encrypted USDA API key from user_secrets, decrypt it, call USDA FoodData Central API, map nutrients to DietLedger's canonical 15-nutrient model, cache results in PostgreSQL food_items, then return results. Emphasize local-first search with live fallback and shared cache.
```

---

## 6. Data architecture / domain model

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a simplified entity relationship diagram for DietLedger. Center the User entity. Connect User to Recipes, Nutrition Profiles, Meal Plans, Recipe Books, Custom Foods, Settings, Secrets, and Shared Recipes. Connect Recipes to Ingredients. Connect Nutrition Profiles to Food Log Entries and Weight Entries. Connect Meal Plans to Day Plan Entries and Grocery Checklists. Connect Recipe Books to Chapters and Pages. Show Food Items as a shared reference/cache table used by Ingredients and Food Search. Use readable labels and avoid showing every column.
```

---

## 7. Security architecture

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a security architecture diagram for DietLedger. Show Browser outside the trust boundary storing access and refresh tokens in localStorage. Show Next.js as a same-origin API proxy. Show Go API inside the trusted backend boundary with modules: requireAuth, optionalAuth, requireAdmin, input validation, ownership checks, rate limiter. Show PostgreSQL storing user-owned data, bcrypt password hashes, API key hashes, and AES-GCM encrypted user secrets. Show USDA API as external and accessed only with a per-user encrypted API key. Include labels: browser not trusted, Go API enforces authorization, PostgreSQL is source of truth.
```

---

## 8. Architecture drivers and constraints

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create an executive architecture drivers diagram for DietLedger. Put DietLedger Architecture in the center. Around it show key drivers as labeled nodes: Nutrition Accuracy, PostgreSQL Source of Truth, Server-Authoritative Go API, Solo Developer Maintainability, AI-Assisted Development, REST Simplicity, Docker Compose Deployment, Low Operational Burden, USDA Food Data Integration, Multi-User Ownership. Connect each driver to the center with clean lines. Make it presentation-quality for a LinkedIn architecture post.
```

---

## 9. Performance and scalability posture

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a performance and scalability architecture diagram for DietLedger. Show the current simple single-instance path: Browser -> Next.js -> Go API -> PostgreSQL. Add callouts: React Query cache 60s stale time, PostgreSQL connection pool max 25, food full-text search GIN index, pagination capped at 100 per page, API read timeout 30s and write timeout 120s, in-memory rate limiting, background USDA seed importer. Add a footer note: scale vertically and optimize queries before adding distributed infrastructure.
```

---

## 10. AI-assisted development workflow

```text
Use a professional software architecture diagram style suitable for LinkedIn. Use a clean dark navy or white background, DietLedger accent colors in green and blue, rounded rectangles, thin connector arrows, simple icons, readable labels, no tiny text, no code blocks, no screenshots, no fake company logos, and a polished SaaS/product architecture aesthetic. Output as a 16:9 landscape image. Use DietLedger’s Olive Botanical color scheme: olive green primary, linen cream background, dark umber text, pale botanical green accents, warm khaki borders, and muted sage neutrals. Approximate palette: linen cream #FAF9F0, warm white cards #FDFCF6,  primary olive #70782C, pale botanical green #DFE2BC, sage linen #ECE8DD, warm khaki border #DDD7CA, dark umber text #171103, secondary olive #5A7F2B, straw ochre #A98A55, umber #6B4F2F. Keep the design earthy, botanical, calm, natural, and professional.  Create a professional process diagram for AI-assisted architecture maintenance in DietLedger. Show a left-to-right workflow: Read AGENTS.md -> Use CodeGraph to discover source -> Check architecture/domain docs -> Write or update spec -> Add focused failing test -> Implement smallest change -> Run verification -> Update docs. Add guardrails underneath: PostgreSQL authoritative, Go API owns business logic, browser is not authoritative, keep scope tight. Make it look like a modern engineering workflow diagram for LinkedIn.
```

---

# Suggested LinkedIn post series

1. **Post 1 — Why DietLedger uses a server-authoritative architecture**  
   Diagram: System context or layered responsibilities.

2. **Post 2 — Clear ownership beats clever sync**  
   Diagram: Component responsibilities or authority flow.

3. **Post 3 — How food search works with local cache + USDA fallback**  
   Diagram: Food search and USDA fallback.

4. **Post 4 — Data model for an integrated nutrition workflow**  
   Diagram: Simplified ER/domain model.

5. **Post 5 — Security boundaries in a nutrition app**  
   Diagram: Security architecture.

6. **Post 6 — Simple deployment for a solo-maintained product**  
   Diagram: Docker deployment topology.

7. **Post 7 — Designing software for AI-assisted maintenance**  
   Diagram: AI-assisted development workflow.
