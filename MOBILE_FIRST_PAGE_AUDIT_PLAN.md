# Mobile-first page audit and redesign plan

## Scope

This audit covers every routed page type in `frontend/src/App.js` **except**:

- `/social` (`frontend/src/pages/Social.js`)
- `/control-panel` / `/moderation` (`frontend/src/pages/ModerationDashboard.js`)

The review is based on the current page shells, layout classes, form structures, tables, navigation patterns, and component composition in the existing React/Tailwind implementation. Tailwind is using the default breakpoint system (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px) because `frontend/tailwind.config.js` does not override `screens`.

## Cross-page findings

### Shared layout behavior

- `RouteMain` gives `/chat` and `/maps` full-width shells, `/calendar` a tighter container with internal overflow handling, and most other routes a centered container with `mt-8` and internal vertical scrolling (`frontend/src/App.js:55-70`).
- This means the product already has **three layout modes**, but they do not share a common mobile system for page headers, sticky actions, drawers, or section navigation.

### Common mobile issues seen across multiple pages

1. **Desktop-first layout switches happen late**  
   Many complex pages stay single-column until `lg`, then jump straight into sidebars or multi-panel layouts. The reverse problem also appears: some pages keep desktop sidebars at all widths (`Maps`) or keep dense tab rows without a mobile wrapper (`Market`, `Discovery`, `Calendar`).

2. **Touch targets are inconsistent**  
   Buttons range from comfortable `py-2.5` actions to cramped `text-xs` controls and icon-like inline actions. Pages with dense utilities (`Chat`, `Maps`, `Refer Friend`, `Notification Settings`) need a 44px minimum touch target rule.

3. **Tables and calendar grids are not mobile-native**  
   `ReferFriend` and `NotificationSettings` rely on horizontal table overflow. `Calendar` keeps a 7-column month grid with 72px day cells that quickly become too small on phones.

4. **Information hierarchy is often too flat on smaller screens**  
   Long forms and dashboards present all controls at once. Mobile users need prioritized summaries, collapsible advanced controls, and step-based flows before seeing secondary actions.

5. **Media-heavy pages need better mobile loading strategy**  
   `Market`, `News`, `Discovery`, and `ResumePublic` depend on images or large content blocks but do not consistently prioritize aspect ratio control, progressive image loading, or content-first layouts on narrow screens.

## Page-by-page audit

### 1. Home (`/`)
- **Evidence:** `frontend/src/pages/Home.js:81-260`
- **Current layout**
  - Marketing page with a hero, feature cards, platform capability cards, trust/social-proof blocks, and a final CTA.
  - Typography is strong and readable, with the hero scaling from `text-3xl` to `md:text-5xl`.
  - Primary CTA buttons already use roomy padding and wrap when needed.
- **Where mobile degrades**
  - **< 640px:** hero content is still readable, but the combination of large headline, three CTA buttons, and trust bullets creates a long first screen with diluted focus.
  - **640px-767px:** card grids are safe, but sections feel equally weighted, so the strongest value proposition is buried after the hero.
- **Mobile-first redesign**
  - Reduce the hero to one primary CTA and one secondary action on phones; move “Learn more” into an inline text link.
  - Reorder the first mobile screen to: value proposition, proof points, primary CTA, one supporting card.
  - Tighten vertical spacing between sections on phones and reserve larger whitespace for tablet/desktop.
  - Convert trust indicators into an icon list with larger line-height for easier scanning.
- **Reasoning**
  - Mobile visitors need instant clarity and one obvious next step rather than three equal CTAs.
- **Implementation priority**
  - **Medium**
- **Dependencies**
  - Shared marketing-section spacing tokens and CTA hierarchy patterns.

### 2. Login (`/login`)
- **Evidence:** `frontend/src/pages/Login.js:36-87`
- **Current layout**
  - Single-column auth card in `max-w-md`.
  - Very simple structure: heading, two fields, password strength text, primary action, footer link.
- **Where mobile degrades**
  - **< 360px:** the card padding plus outer container margin can feel cramped.
  - Field inputs use generic `p-2`, which is serviceable but not visibly designed for finger-first comfort.
- **Mobile-first redesign**
  - Use full-width auth layout on phones with reduced outer chrome and a larger vertical rhythm.
  - Increase input/button height to a consistent 44-48px system.
  - Keep the password strength hint collapsible or visually quieter on very small screens.
- **Reasoning**
  - Auth is a high-frequency entry point; the smallest screen version should feel simpler, not boxed in.
- **Implementation priority**
  - **High**, because auth friction blocks the rest of the product.
- **Dependencies**
  - Shared mobile auth card pattern, shared input/button sizing tokens.

### 3. Register (`/register`)
- **Evidence:** `frontend/src/pages/Register.js:86-240`
- **Current layout**
  - Single-column form in `max-w-xl`, with one `lg:grid-cols-2` row for country/ZIP.
  - Password requirements add useful guidance but lengthen the form considerably.
- **Where mobile degrades**
  - **< 640px:** password requirements plus required fields create a tall initial viewport before the submit action appears.
  - **640px-1023px:** there is enough room for paired fields, but the layout waits until `lg`, so medium devices still get a long stacked form.
- **Mobile-first redesign**
  - Break the flow into short grouped sections: identity, login credentials, location, optional referral.
  - Keep password requirements behind an expandable “Show password rules” pattern or a condensed checklist.
  - Move country and ZIP to a `sm:grid-cols-2` layout so medium phones and small tablets reduce scroll depth.
  - Add sticky submit/footer action on mobile when the keyboard is closed.
- **Reasoning**
  - Registration abandonment is driven more by perceived effort than absolute field count.
- **Implementation priority**
  - **High**
- **Dependencies**
  - Shared auth layout system from Login; shared inline validation styling.

### 4. Post-registration welcome (`/welcome`)
- **Evidence:** `frontend/src/pages/PostRegistrationWelcome.js:25-56`
- **Current layout**
  - Fixed modal overlay with a single card, short intro copy, bullet list, and one CTA.
- **Where mobile degrades**
  - **< 640px:** acceptable overall, but the centered dialog competes with mobile keyboard/safe-area expectations and can feel like a desktop modal placed on a phone.
- **Mobile-first redesign**
  - Convert the mobile presentation to a bottom sheet or full-height intro card with safe-area padding.
  - Shorten the bullet list to three items and use icon-led rows.
  - Keep the primary CTA fixed to the bottom on phones.
- **Reasoning**
  - This is an onboarding bridge, so it should feel native to the mobile flow instead of modal-heavy.
- **Implementation priority**
  - **Low to medium**
- **Dependencies**
  - Shared sheet/modal component for onboarding and create/edit flows.

### 5. Onboarding (`/onboarding`)
- **Evidence:** `frontend/src/pages/OnboardingPage.js:11-20`, `frontend/src/components/OnboardingWizard.js:364-585`
- **Current layout**
  - Wrapper is minimal; most of the UX lives in `OnboardingWizard`.
  - Wizard uses a centered `max-w-2xl` card with progress, inputs, generated key content, QR display, and step actions.
- **Where mobile degrades**
  - **< 640px:** secure setup flows can become visually dense because copy, generated secrets, QR UI, and action buttons all share one card.
  - Multi-step content swaps happen inside the same card, which can cause large vertical jumps.
- **Mobile-first redesign**
  - Treat each step as its own mobile-first screen with clear progress, shorter copy, and one primary action at a time.
  - Move generated key / seed / QR content into expandable panels with explicit copy/download actions.
  - Use sticky previous/next/footer actions on mobile.
- **Reasoning**
  - Security onboarding already has cognitive load; mobile should reduce simultaneous decisions.
- **Implementation priority**
  - **High**
- **Dependencies**
  - Shared stepper, sheet/panel patterns, and mobile-safe handling for long sensitive text blocks.

### 6. User Settings (`/settings`)
- **Evidence:** `frontend/src/pages/UserSettings.js:534-860`
- **Current layout**
  - Large gradient header, then `lg:grid-cols-[240px_minmax(0,1fr)]`.
  - Left navigation lists settings sections; main area stacks many full forms and status panels.
  - Typography is clear, but the page is visually dense because nearly every section uses the same card weight and spacing.
- **Where mobile degrades**
  - **< 1024px:** the sidebar drops above the content, leaving a long section list followed by every settings panel rendered in sequence.
  - **< 768px:** multi-column forms collapse correctly, but the page becomes extremely tall and hash-based section navigation loses utility.
  - PGP and encryption areas include long text inputs and sensitive actions that are hard to manage inline on small screens.
- **Mobile-first redesign**
  - Replace the persistent sidebar with a segmented mobile section picker or bottom sheet section menu.
  - Convert each settings section into a discrete panel with collapsed summaries; open only one at a time on phones.
  - Prioritize section order on mobile: Account, Security, Profile, Notifications, Recovery, advanced PGP tools last.
  - Add sticky save actions per section instead of one long scroll-dependent flow.
- **Reasoning**
  - This is the most complex settings surface outside the excluded control panel; mobile users need chunked tasks rather than an all-in-one dashboard.
- **Implementation priority**
  - **Highest**
- **Dependencies**
  - Shared mobile settings navigation, section card summaries, form control sizing, validation messaging.

### 7. Notification Settings (`/notification-settings`)
- **Evidence:** `frontend/src/pages/NotificationSettings.js:99-170`
- **Current layout**
  - Centered card with an overflow table for notification channels, followed by realtime preference toggles.
  - Content hierarchy is understandable on desktop but table-first on mobile.
- **Where mobile degrades**
  - **< 768px:** the table forces horizontal scrolling, which hides channel context and makes checkbox scanning tedious.
  - Checkbox rows are functional but not finger-optimized.
- **Mobile-first redesign**
  - Replace the matrix table on phones with stacked preference cards: notification type as header, channels as toggle rows.
  - Keep the table for `md+` if desired, but derive both views from the same data model.
  - Group realtime settings into a dedicated card with clearer toggle descriptions and larger hit areas.
- **Reasoning**
  - Mobile settings should not require side-scrolling to answer a yes/no question.
- **Implementation priority**
  - **High**
- **Dependencies**
  - Shared settings card system with User Settings.

### 8. Calendar (`/calendar`)
- **Evidence:** `frontend/src/pages/Calendar.js:341-640`
- **Current layout**
  - Two-panel desktop layout at `lg`: sidebar + main calendar.
  - Main area supports month, week, and agenda views.
  - Month view uses a seven-column grid with `min-h-[72px]` day cells; week view becomes seven columns at `md`.
- **Where mobile degrades**
  - **< 1024px:** sidebar stacks above the main calendar, increasing scroll before users reach the actual schedule.
  - **< 768px:** the month grid remains seven columns, so day cells become too small for event density and finger accuracy.
  - **768px-1023px:** week view becomes seven columns at `md`, which is still too dense for many tablets in portrait.
- **Mobile-first redesign**
  - Make **agenda** the default mobile view, **week** the default tablet view, and keep **month** as desktop-first or opt-in on phones.
  - Convert the sidebar into an off-canvas sheet or summary accordion.
  - Collapse top controls into a two-row mobile header with a compact date switcher.
  - Introduce per-day drawers/cards on phone tap rather than relying on tiny month cells.
- **Reasoning**
  - Calendars are inherently dense; mobile should expose time and action clarity first, not parity with desktop grid density.
- **Implementation priority**
  - **Highest**
- **Dependencies**
  - Shared mobile sheet pattern, compact segmented controls, reusable event card component.

### 9. Resume Builder (`/resume`)
- **Evidence:** `frontend/src/pages/ResumeBuilder.js:328-590`
- **Current layout**
  - Top action bar, then a two-column editor/preview split at `xl`.
  - Sections are card-based and readable, but there are many repeated subforms with move/remove actions and multiline textareas.
- **Where mobile degrades**
  - **< 1280px:** preview drops below the editor, which is correct, but the page still behaves like a full desktop editor with many simultaneous sections.
  - **< 768px:** repeated “move up / move down / remove” action rows and multiline bullet editors become visually noisy.
  - The top control row wraps, but save/preview/delete are still presented as peers even on the smallest screens.
- **Mobile-first redesign**
  - Convert the builder into a true step-by-step editor on phones: Basics, Summary, Experience, Education, Skills, Optional Sections, Preview.
  - Move reorder/delete controls into overflow menus or per-item action sheets.
  - Keep a single sticky primary action (“Save section” or “Continue”) instead of three global actions competing at the top.
  - Render preview as a separate route or slide-over on mobile instead of an inline long page.
- **Reasoning**
  - Long-form composition tools need reduced editing scope per screen on mobile.
- **Implementation priority**
  - **Highest**
- **Dependencies**
  - Shared stepper pattern with onboarding; card/action-sheet primitives; form and textarea sizing rules.

### 10. Resume Public (`/resume/:username`)
- **Evidence:** `frontend/src/pages/ResumePublic.js:53-153`
- **Current layout**
  - Centered article with generous `p-6 md:p-10`, strong typography, print actions, and section blocks.
  - More mobile-friendly than the builder because it is read-only.
- **Where mobile degrades**
  - **< 640px:** header action row can wrap awkwardly if “Print”, “View Profile”, and “Manage Resume” all appear.
  - Long date/title rows use `flex flex-wrap`, which helps, but dense resume entries can still feel text-heavy.
- **Mobile-first redesign**
  - Reframe the mobile header as a stacked summary card with a single primary action and an overflow menu for secondary actions.
  - Increase spacing between resume items and lighten metadata contrast so titles remain dominant.
  - Keep print affordances hidden or deprioritized on phones.
- **Reasoning**
  - Public resume viewing is mostly reading; the mobile design should optimize scannability and action restraint.
- **Implementation priority**
  - **Medium**
- **Dependencies**
  - Shared resume typography scale from Resume Builder preview refresh.

### 11. Discovery (`/discover`)
- **Evidence:** `frontend/src/pages/Discovery.js:17-157`, `frontend/src/pages/Discovery.js:263-380`
- **Current layout**
  - Centered container with a two-tab switcher, people cards, post cards, empty states, and load-more actions.
  - Cards are compact and functional.
- **Where mobile degrades**
  - **< 640px:** tab buttons are small relative to other app actions.
  - User cards place content and action side-by-side, which can squeeze names, bios, and add-friend actions on narrow screens.
  - Post media thumbnails stay in a two-column grid even on phones, which is acceptable but visually busy for mixed aspect ratios.
- **Mobile-first redesign**
  - Increase tab target height and make the active tab more prominent.
  - Stack card actions below the user identity block on small screens.
  - Reduce bio and “why suggested” text until after the primary relationship context is shown.
  - Consider progressive disclosure for post media beyond the first image.
- **Reasoning**
  - Discovery should feel light and browseable; currently it works, but it is not optimized for one-handed scanning.
- **Implementation priority**
  - **Medium**
- **Dependencies**
  - Shared mobile tabs and person/content card primitives.

### 12. News (`/news`)
- **Evidence:** `frontend/src/pages/News.js:402-518`, `frontend/src/pages/News.js:793-889`
- **Current layout**
  - Multi-row header, scope/category filters, horizontally scrolling pills, responsive article cards, and a right-hand aside at `lg`.
  - The content model is strong, but the filter system is visually busy.
- **Where mobile degrades**
  - **< 640px:** multiple control rows compete for first-screen space; pills require sideways scrolling before articles appear.
  - **640px-1023px:** article cards become cleaner because of `sm:flex-row`, but filter complexity still dominates the top.
  - The desktop right rail becomes a lower-page block, which can bury useful secondary content.
- **Mobile-first redesign**
  - Reduce mobile filters to one compact primary scope selector and one “More filters” sheet.
  - Keep the first article visible above the fold by shortening header/filter depth.
  - Make article cards content-first on phones: headline, source/meta, then optional image.
  - Lazy-load or defer noncritical side-rail content and low-priority filters.
- **Reasoning**
  - Mobile news reading should privilege reading momentum, not a desktop-equivalent control surface.
- **Implementation priority**
  - **High**
- **Dependencies**
  - Shared pill/filter sheet component, responsive media treatment.

### 13. Market (`/market`)
- **Evidence:** `frontend/src/pages/Market.js:1202-1470`, `frontend/src/pages/Market.js:325-331`, `frontend/src/pages/Market.js:531-531`
- **Current layout**
  - Marketplace header with tabs, desktop browse layout using a fixed-width sidebar plus main content, search/filter bar, card grid, and several modal flows.
  - Category browsing, price filters, and listing cards are all desktop-oriented.
- **Where mobile degrades**
  - **< 640px:** the browse tab still relies on a side-by-side desktop composition (`w-56` sidebar + content), which is a major failure on phones.
  - Top tabs and filter/search controls can wrap into a crowded header.
  - Listing cards and listing modals can surface too many peer actions at once.
- **Mobile-first redesign**
  - Replace the browse sidebar with a filter sheet/drawer triggered from a sticky toolbar.
  - Rebuild listing cards around one primary action and a secondary overflow menu.
  - Treat image galleries as swipeable carousels with fixed aspect ratios and low-bandwidth placeholders.
  - Split “Browse”, “My Listings”, and “Transactions” into mobile-friendly tab panels with compact counts.
- **Reasoning**
  - The current browse layout is the clearest example of a desktop page that does not recompose for mobile.
- **Implementation priority**
  - **Highest**
- **Dependencies**
  - Shared filter drawer, media carousel treatment, commerce card action hierarchy.

### 14. Maps (`/maps`)
- **Evidence:** `frontend/src/pages/Maps.js:431-649`
- **Current layout**
  - Full-width page with a header plus a three-column body: left controls (`w-72`), center map, right friends panel (`w-64`).
  - Dense control content, map overlays, and contextual lists all compete simultaneously.
- **Where mobile degrades**
  - **Any width below ~900px:** two fixed sidebars plus the map body leave insufficient room for usable map interaction.
  - **< 640px:** the header buttons, layer toggles, spotlight controls, and nearby friends list are all present but none are mobile-optimized.
  - Marker and reaction affordances are too small to be reliably finger-friendly.
- **Mobile-first redesign**
  - Make the map canvas the default mobile screen; move filters, layers, spotlights, and nearby friends into bottom sheets or edge drawers.
  - Collapse the header to a compact title + one main action + one utility menu.
  - Increase tap target size for markers and list actions; prefer sheet-based details over tiny inline affordances.
  - Delay nonessential overlays on slow connections and progressively load nearby datasets.
- **Reasoning**
  - Maps must preserve interaction area first. The current layout sacrifices the map to keep desktop side panels visible.
- **Implementation priority**
  - **Highest**
- **Dependencies**
  - Shared map overlay controls, mobile sheet framework, data-loading prioritization.

### 15. Chat (`/chat`)
- **Evidence:** `frontend/src/pages/Chat.js:384-579`
- **Current layout**
  - Full-width shell with a header and `lg:grid-cols-12` three-panel body.
  - Left side handles channel/room discovery, middle is conversation, right side shows room users.
  - Strong nostalgic structure, but dense for mobile.
- **Where mobile degrades**
  - **< 1024px:** the three panels stack vertically, so users must scroll through navigation before reaching messages and then scroll again to reach room members.
  - Search suggestions, room lists, and message panes all create nested scroll contexts.
  - Composer actions are acceptable, but context switching is not.
- **Mobile-first redesign**
  - Adopt a mobile conversation model: screen 1 = channel/room picker, screen 2 = conversation, screen 3 = room details/users.
  - Keep channel and room selection in drill-in screens or drawers instead of stacked permanent panels.
  - Preserve the composer at the bottom with larger send affordances and safe-area padding.
  - Reduce header copy and move theme selection into an overflow/settings entry on phones.
- **Reasoning**
  - Chat needs persistent conversation focus; stacked desktop panels create too much pre-message friction on mobile.
- **Implementation priority**
  - **Highest**
- **Dependencies**
  - Shared drawer/navigation patterns with Maps and Calendar; shared sticky composer/footer treatment.

### 16. Refer Friend (`/refer`)
- **Evidence:** `frontend/src/pages/ReferFriend.js:176-369`
- **Current layout**
  - Search card, invite card, stats grid, and referral history table.
  - Content is understandable, but history relies on a five-column table with many per-row actions.
- **Where mobile degrades**
  - **< 768px:** the stats grid is manageable, but the history table becomes cumbersome even with horizontal overflow.
  - Search and invite forms stack well, yet the referral result block includes long token/link strings that can dominate small screens.
- **Mobile-first redesign**
  - Convert history rows into stacked mobile cards with status, milestones, reward summary, and a compact action menu.
  - Put referral link/token content behind “Show details” disclosure after invite creation.
  - Promote the search-or-invite decision at the top with segmented actions rather than rendering both flows in sequence when possible.
- **Reasoning**
  - Horizontal table scrolling is a fallback, not a mobile design.
- **Implementation priority**
  - **Medium to high**
- **Dependencies**
  - Shared data-card replacement for tables; overflow action menu pattern.

## Recommended implementation order

### Phase 1: shared mobile primitives
1. Define shared mobile tokens for page padding, heading spacing, minimum touch targets, sticky action areas, and safe-area handling.
2. Build reusable mobile primitives:
   - drawer/bottom sheet
   - segmented tabs
   - overflow action menu
   - stacked settings/data cards
   - compact filter toolbar

**Why first:** nearly every high-risk page needs these components.

### Phase 2: highest-risk task flows
1. `User Settings`
2. `Notification Settings`
3. `Login`
4. `Register`
5. `Onboarding`

**Why next:** these are account-critical flows with the greatest functional cost when mobile UX is poor.

### Phase 3: highest-risk immersive layouts
1. `Maps`
2. `Chat`
3. `Calendar`
4. `Market`
5. `Resume Builder`

**Why next:** these pages have the clearest structural mobile failures and the largest layout shifts.

### Phase 4: content discovery and public browsing
1. `News`
2. `Discovery`
3. `Refer Friend`
4. `Resume Public`
5. `Home`

**Why next:** these pages are usable today but need polish, hierarchy cleanup, and better mobile pacing.

### Phase 5: final polish and bridge flows
1. `Post-registration welcome`
2. Any remaining modal and empty-state refinements

## Page dependencies that should influence sequencing

- **User Settings + Notification Settings** should be redesigned together so section navigation, toggle cards, and save patterns stay consistent.
- **Login + Register + Onboarding + Welcome** should share one mobile auth/onboarding system.
- **Maps + Chat + Calendar** should share the same mobile drawer/sheet and sticky footer patterns.
- **Market + News + Discovery** should share card spacing, media treatment, tab systems, and filter-sheet behavior.
- **Resume Builder + Resume Public** should share typography, section spacing, and print/mobile content hierarchy rules.

## Mobile-first implementation principles to enforce across all pages

1. Start with a **320px-390px wide phone layout** as the primary design target.
2. Promote only one primary action per screen region.
3. Keep all interactive controls at **44px minimum tap size**.
4. Replace horizontal table scrolling with stacked cards where the task is transactional.
5. Default to content-first layouts on mobile; move advanced filters/settings into sheets.
6. Load media progressively and prefer fixed aspect ratios to reduce reflow.
7. Defer secondary panels and desktop-only chrome until `md` or `lg`, depending on task complexity.

## Optional cleanup after the redesign plan

`frontend/src/pages/Discover.js`, `Feed.js`, `Profile.js`, and `SecurityCenter.js` are not currently routed from `App.js`. They are not part of this audit scope, but their status should be reviewed before any wider mobile redesign work to avoid duplicating effort across obsolete page variants.
