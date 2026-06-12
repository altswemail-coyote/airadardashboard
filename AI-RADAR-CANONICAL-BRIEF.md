# AI Radar — Canonical Product Brief

**Status**: Canonical strategic brief for refocusing the extension and guiding the live-site transition  
**Scope**: Product direction, feature priority, launch positioning, and a keep/cut/later matrix grounded in the current codebase  
**Prepared**: April 5, 2026

---

## 1. Core Decision

AI Radar is not three separate products.

It is one product with one job:

**AI Radar helps a user understand what changed in AI, why it matters to their role or brand, and what actions to take next.**

That means the product should be organized around a single intelligence workflow:

**scan -> focus -> interpret -> track -> deliver**

Everything in the app should support that workflow. If a feature does not make that workflow faster, sharper, or more valuable, it should be reduced, postponed, or removed.

---

## 2. Product Thesis

Most people who care about AI are overwhelmed by volume, repetition, hype, and fragmented tools.

They do not need “more AI news.”
They need:

- A high-signal feed of what matters now
- A way to connect that signal to their job, client, team, or study area
- A persistent system for monitoring topics over time
- A daily output that tells them what changed and what to do next

**AI Radar wins when it feels like a personal intelligence analyst, not a dashboard full of features.**

---

## 3. Ideal User

### Primary user

A knowledge worker who needs to stay current on AI and connect developments to real decisions.

Examples:

- Strategists
- Agency owners
- Marketers
- Consultants
- Product leads
- Researchers
- Students with a professional or academic focus

### High-value paid user

A user with recurring information needs tied to outcomes.

Examples:

- Someone tracking AI for a client account
- Someone monitoring competitor behavior
- Someone watching a niche workflow or industry trend
- Someone who wants an intelligence email every weekday without having to do a manual scan

---

## 4. The Canonical Product Structure

AI Radar should be understood as three layers of one system:

### Layer 1: Command

The daily AI news dashboard.

Purpose:

- Show what changed in AI today
- Let the user search specific themes
- Let the user save, brief, and prompt from individual signals

This is the habit-forming entry point.

Current implementation anchors:

- `dashboard.html`
- `dashboard.js`
- `exa-engine.js`

### Layer 2: Tracked Topics

Persistent topic monitoring tied to user context.

Purpose:

- Turn a user’s interests into structured monitoring topics
- Track those topics over time
- Maintain beliefs and confidence changes
- Surface when a topic is active, cooling, or stale

This is the core paid-value layer.

Current implementation anchors:

- `tracker.html`
- `tracker.js`
- `belief-analysis.js`

### Layer 3: Delivery

The automated intelligence output.

Purpose:

- Deliver a morning briefing without requiring the user to open the app
- Summarize tracked-topic changes, confidence movement, actions, and evolving topics
- Eventually become the “must-pay-for” habit product

This is the clearest recurring revenue feature.

Current implementation anchors:

- `background.js`
- newsletter and dispatch flows in `tracker.js`

---

## 5. What AI Radar Is Not

To refocus the product, AI Radar should **not** be treated as:

- A generic “AI tools” playground
- A demo vehicle for every LLM capability you can imagine
- A broad research workbench for every possible workflow
- A feature collection where dashboard beliefs, tracker beliefs, history, exports, briefs, newsletters, and prompts all compete equally for attention

The product should feel opinionated.

---

## 6. Canonical User Promise

### Free promise

**Use AI Radar every day to get a high-signal view of the latest AI developments and instantly explore why they matter.**

### Paid promise

**Let AI Radar monitor the exact topics you care about and deliver a daily intelligence briefing with confidence shifts, actions, and topic evolution.**

That is the monetizable product.

---

## 7. Keep / Cut / Later Matrix

This matrix is based on the current implementation, not abstract brainstorming.

### KEEP

#### 1. Command dashboard as the default home

Reason:

- This is the clearest habit loop in the product
- It matches the original vision
- It is already functional and differentiated by Exa search + prompt actions

Keep the following:

- Exa-powered search and scan
- Ranked feed
- Filters and sorting
- Saved articles / briefing drawer
- Page Brief / Intelligence Brief
- Prompt-to-LLM actions

Current code anchors:

- `dashboard.js`
- `exa-engine.js`
- `dashboard.html`

#### 2. Power prompts

Reason:

- This is one of the most differentiated interaction layers in the app
- It turns an article from “something to read” into “something to act on”
- It supports the “AI Radar as analyst” position

Keep, but simplify the framing around three user outcomes:

- Understand the signal
- Apply it to my context
- Decide what to watch or do next

Current code anchors:

- dashboard prompt routing in `dashboard.js`
- tracker prompt generation in `tracker.js`

#### 3. Tracked Topics

Reason:

- This is the strongest paid feature in the product
- It gives the app persistence beyond daily browsing
- It creates a reason to return and a reason to subscribe

Keep the following:

- Topic generation from the 4-field profile
- Boards / tab sets
- Per-topic article caches
- Belief tracking
- Topic health
- Evolve recommendations

Current code anchors:

- `tracker.js`

#### 4. Belief system in Tracked Topics

Reason:

- It is the unique “intelligence layer” of the paid product
- It creates continuity over time
- It can power the newsletter and morning updates

Keep beliefs only where they serve persistent tracked monitoring.

Current code anchors:

- `tracker.js`
- `belief-analysis.js`

#### 5. Daily intelligence newsletter

Reason:

- This is likely the strongest recurring value feature
- It converts the product from a dashboard into an ongoing service
- It is the easiest premium story to explain and sell

Keep the newsletter as a paid outcome layer.

Current code anchors:

- newsletter generation and scheduling UI in `tracker.js`
- monitor timing in `background.js`

---

### CUT OR DE-EMPHASIZE

#### 1. Dashboard belief system as a core feature

Reason:

- It overlaps conceptually with tracked beliefs
- It muddies the distinction between “today’s scan” and “persistent monitoring”
- The current implementation appears half-active and half-hidden

Decision:

- Remove it from the product story
- Either retire it technically later or leave it dormant until cleanup
- Beliefs should belong to Tracked Topics only

Current code anchors:

- session belief logic in `dashboard.js`
- hidden dashboard belief UI stubs in `dashboard.html`

#### 2. Competitive Strike / countermove as a lead feature

Reason:

- It is interesting, but not central to the main user promise
- It distracts from the core loop unless repositioned as an advanced analysis action

Decision:

- Keep it only as a secondary advanced tool
- Do not market the product around it

Current code anchors:

- `dashboard.js`

#### 3. Excessive model-specific behavior

Reason:

- The value is not “supports many models”
- The value is “turns a signal into useful thinking quickly”
- Model-routing complexity should not dominate the product story

Decision:

- Keep user choice of LLM target
- Reduce the importance of connector-style behavior in product messaging

Current code anchors:

- `dashboard.js`
- `tracker.js`
- content scripts

#### 4. Scheduling as a major setup burden

Reason:

- Paid users mostly want reliability, not scheduling complexity
- A default weekday morning email is easier to understand than a deep scheduling experience

Decision:

- Default paid delivery should be automatic weekday morning briefing
- Scheduling can remain as an optional advanced setting, not the center of the value proposition

Current code anchors:

- dispatch scheduling UI in `tracker.js`

---

### LATER

#### 1. Team or shared workspace features

Good future revenue path, but not needed to prove the product.

Examples:

- Shared boards
- Shared tracked topics
- Team digests
- Client-facing reports

#### 2. Full web app migration

This is important, but it is not the first refocus step.

The extension can still validate the product if the feature set is clarified.

#### 3. Server-side article hydration and backend orchestration

Needed for scale, durability, and secure production operations.

But this should follow product tightening, not precede it.

#### 4. Cross-device sync and account system

Important for launch-grade product quality, but secondary to nailing the actual offer.

---

## 8. Product Navigation Model

The product should be framed in the UI as:

### 1. Command

Home for latest AI developments.

Core actions:

- Scan latest AI news
- Search a theme
- Save an item
- Brief an item
- Prompt an item

### 2. Tracked Topics

Home for what matters to the user personally.

Core actions:

- Generate topics from user profile
- Scan topics
- Review beliefs
- See health and confidence movement
- Evolve topics when they cool

### 3. Morning Brief

Home for passive delivery.

Core actions:

- Enable daily delivery
- Choose included topics
- Review generated briefing
- Optionally edit cadence later

This simplifies the story without throwing away the best features.

---

## 9. Recommended Beta Positioning

For beta, the simplest and strongest message is:

**AI Radar is your personal AI intelligence system.**

It helps you:

- Stay current on the latest AI developments
- Track the topics that matter to your role or brand
- Receive a daily briefing with changes, insights, and next actions

Avoid trying to explain every underlying capability in the first sentence.

---

## 10. Pricing Logic

### Free

- Daily AI dashboard
- Search
- Save articles
- Prompt to LLM
- Basic article brief

### Pro

- Tracked Topics
- Topic generation from profile
- Persistent beliefs and confidence shifts
- Topic health and evolve suggestions
- Morning intelligence newsletter
- Multiple boards

### Later: Team

- Shared boards
- Shared intelligence digests
- Client/team delivery
- Role-based summaries

The paid story should be about **ongoing intelligence coverage**, not feature count.

---

## 11. Canonical Product Rules

These rules should guide cleanup and future development.

### Rule 1

If a feature does not clearly strengthen one of these three pillars, it should not lead the experience:

- Daily signal discovery
- Persistent tracked intelligence
- Morning delivery

### Rule 2

Dashboard features should help the user understand today.
Tracked Topic features should help the user understand over time.
Do not blur those layers without a strong reason.

### Rule 3

The belief system belongs to persistent monitoring, not to every surface in the app.

### Rule 4

Every premium feature should answer this question:

**“Why would a user keep paying every month?”**

If the answer is weak, the feature is secondary.

### Rule 5

The newsletter is not an extra. It is one of the main premium outputs.

---

## 12. Immediate Refocus Priorities

### Priority 1: Product clarity

Define the app publicly and internally as:

- Command for daily AI signal discovery
- Tracked Topics for persistent monitoring
- Morning Brief for paid delivery

### Priority 2: Technical cleanup aligned to product truth

Clean up areas where the code and product story diverge:

- Dashboard belief overlap
- Demo fallback behavior
- stale docs and missing-file references
- inconsistent key handling
- half-wired highlight and deep-link behavior

### Priority 3: Premium outcome quality

Make the paid path excellent:

- topic generation quality
- belief quality
- health and evolve clarity
- newsletter usefulness and consistency

### Priority 4: Launch path

After the product is coherent, move toward:

- server-side key management
- scheduled scans
- account system
- durable storage

---

## 13. What Success Looks Like

A successful AI Radar product should feel like this:

- In the morning, the user gets a clear intelligence email without doing work
- When they open the app, they immediately understand what changed in AI
- Their tracked topics feel personal and useful, not generic
- Beliefs feel understandable and actionable, not mysterious
- The app tells them when a topic is losing signal and what to do next
- The premium tier feels like a real service, not a locked tab

---

## 14. Final Product Statement

**AI Radar is a personal AI intelligence system that helps users discover important AI developments, monitor the topics that matter to them, and receive a daily briefing with confidence shifts, actions, and evolving signals.**

That is the product.

Everything else is support.

---

## 15. Phase 1 Cleanup Backlog

This backlog is the first execution layer for bringing the codebase back in line with the product.

### Now

- [x] Create one canonical product brief and use it as the source of truth
- [x] Define the product around three layers: Command, Tracked Topics, Morning Brief
- [x] De-emphasize dashboard beliefs in the product story
- [x] Remove fake/demo fallback from the Command feed so beta shows only live signals
- [x] Fix background-to-dashboard highlight behavior so monitor notifications resolve to a real signal
- [x] Normalize beta key lookup across dashboard, tracker, and background paths

### Next

- [x] Remove the dashboard-facing belief surface and retire hidden dashboard belief stubs
- [x] Update stale setup docs so they stop referencing missing or retired systems
- [x] Tighten the paid-path experience around topic generation, belief clarity, and morning-brief usefulness
- [x] Default the paid delivery story to weekday mornings while keeping scheduling available

### Later

- [ ] Move scheduled scans and newsletter delivery server-side
- [ ] Move secrets out of the client for production
- [ ] Add accounts, sync, and durable storage
- [ ] Explore team/shared intelligence workflows only after the solo premium offer is strong
