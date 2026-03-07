import React from 'react';

const auditActions = [
  {
    title: 'Keep',
    tone: 'emerald',
    items: [
      'Owner, guest, and live preview workflows already exist in one page context.',
      'Layout presets, theme presets, shared configs, and inline panel overrides provide a strong customization baseline.',
      'The current card language, rounded corners, and Tailwind utility system are worth preserving.'
    ]
  },
  {
    title: 'Improve',
    tone: 'blue',
    items: [
      'Split content concerns from layout concerns so each panel can evolve independently.',
      'Make mobile layout a first-class configuration with its own defaults, ordering, and visibility rules.',
      'Introduce role-aware editing surfaces so owner content editing and editor layout editing stay distinct.'
    ]
  },
  {
    title: 'Replace',
    tone: 'violet',
    items: [
      'Replace the monolithic page renderer with a panel registry and layout engine.',
      'Replace hard-coded area logic with declarative desktop and mobile layout schemas.',
      'Replace one-off style fields with design tokens that cascade from page to panel scope.'
    ]
  },
  {
    title: 'Remove',
    tone: 'rose',
    items: [
      'Remove assumptions that mobile should inherit desktop geometry.',
      'Remove the need to touch core page logic whenever a new panel type is introduced.',
      'Remove hidden coupling between timeline, gallery, chat, and layout editing state.'
    ]
  }
];

const recommendations = [
  'Use a Page Shell + Panel Registry + Layout Engine architecture so the social page behaves like a customizable hub instead of a static route.',
  'Store desktop and mobile layouts separately, each with its own fallback template, visibility rules, and section ordering.',
  'Render Guest View, Owner View, and Editor View from the same normalized page state while gating controls through view-mode capabilities.',
  'Treat themes as editable token bundles so preset themes become starting points instead of fixed skins.'
];

const componentHierarchy = [
  'SocialPageRoute',
  '└─ SocialPageShell',
  '   ├─ ViewModeController',
  '   ├─ ProfileHeaderModule',
  '   ├─ ProfileNavigationModule',
  '   ├─ SocialLayoutEngine',
  '   │  ├─ LayoutSection(top / left / main / right / mobile-drawer)',
  '   │  └─ PanelRenderer(panelInstance)',
  '   ├─ TimelineModule',
  '   ├─ ChatGuestbookModule',
  '   ├─ SidebarModules(about / friends / photos / custom)',
  '   └─ SocialDesignStudio'
];

const panelContract = [
  'PanelDefinition = { type, version, label, icon, defaultData, defaultLayouts, capabilities, render, editor }',
  'PanelInstance = { id, type, dataSource, content, desktopLayout, mobileLayout, styleOverrides, visibilityRules }',
  'LayoutConfig = { version, mode, canvas, sections, items }',
  'ThemeConfig = { presetId, tokens, typography, surface, panelDefaults }'
];

const layoutModel = `{
  "version": 3,
  "viewMode": "owner",
  "layouts": {
    "desktop": {
      "template": "social-balanced",
      "sections": ["top", "sideLeft", "main", "sideRight"],
      "items": [
        { "panelId": "timeline", "section": "main", "x": 0, "y": 4, "w": 8, "h": 6 }
      ]
    },
    "mobile": {
      "template": "social-mobile-stack",
      "sections": ["header", "nav", "content", "bottomSheet"],
      "items": [
        { "panelId": "timeline", "section": "content", "order": 2, "collapsed": false }
      ]
    }
  },
  "theme": {
    "presetId": "midnight",
    "tokens": {
      "pageBackground": "#020617",
      "panelBackground": "#0f172a",
      "panelHeader": "#334155",
      "panelBody": "#111827",
      "textPrimary": "#e2e8f0"
    }
  }
}`;

const uxFlows = [
  {
    title: 'Guest view',
    diagram: 'Guest visitor → normalized profile layout → rendered panels only → timeline filters/chat/privacy-aware actions'
  },
  {
    title: 'Owner view',
    diagram: 'Owner opens profile → sees edit icons on each panel → edits content/media/links inline → saves or exits'
  },
  {
    title: 'Editor view',
    diagram: 'Owner enters studio → drags/resizes/adds/removes panels → style/theme updates preview instantly → publish or cancel draft'
  }
];

const responsiveStrategy = [
  'Desktop uses a dense multi-column canvas with independently placed modules and default desktop template fallback.',
  'Mobile uses its own ordered sections, collapsible chat tray, and stacked content rhythm rather than scaling the desktop grid.',
  'Navigation can switch between top-nav and sidebar placements by layout schema, not by ad-hoc breakpoint conditionals.',
  'Each panel declares min/max sizes and mobile compatibility so the editor can prevent invalid placements.'
];

const performanceConsiderations = [
  'Memoize panel renderers and isolate data fetching per module to reduce full-page re-renders during timeline/chat updates.',
  'Lazy-load heavy modules such as timeline media, gallery grids, and design studio tooling.',
  'Persist layout drafts separately from committed layouts so preview changes remain non-destructive and cancellable.',
  'Normalize configuration once, then feed immutable panel/view models into renderers and editor controls.'
];

const extensibilityStrategy = [
  'Register new panel types through a manifest instead of editing core page switch statements.',
  'Version layout and panel schemas so future panel capabilities can be introduced without breaking saved designs.',
  'Support additional activity types, integrations, and sidebar cards by extending panel definitions rather than rewriting the page shell.',
  'Keep theme tokens and typography tiers shared across guest, owner, and editor previews for consistent accessibility auditing.'
];

const toneClasses = {
  emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
  violet: 'border-violet-200 bg-violet-50 text-violet-900',
  rose: 'border-rose-200 bg-rose-50 text-rose-900'
};

const SectionTitle = ({ eyebrow, title, body }) => (
  <div>
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p>
    <h3 className="mt-1 text-lg font-semibold text-slate-900">{title}</h3>
    <p className="mt-1 text-sm text-slate-700">{body}</p>
  </div>
);

const SocialArchitectureBlueprint = ({
  activePanelCount,
  currentThemePreset,
  currentFontFamily
}) => {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="Social page redesign blueprint">
      <SectionTitle
        eyebrow="Blueprint"
        title="Social Page redesign plan"
        body="A production-ready architecture plan for evolving the current Social Page into a modular social hub with independent desktop and mobile layouts."
      />

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Current snapshot</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{activePanelCount}</p>
          <p className="text-sm text-slate-700">Active panels in the current normalized layout.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Theme baseline</p>
          <p className="mt-2 text-2xl font-semibold capitalize text-slate-900">{currentThemePreset}</p>
          <p className="text-sm text-slate-700">Theme presets should become editable token bundles.</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Typography baseline</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{currentFontFamily}</p>
          <p className="text-sm text-slate-700">Keep semantic tiers: Header, Sub Header, Normal, and Small.</p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-2">
        {auditActions.map((group) => (
          <div key={group.title} className={`rounded-2xl border p-4 ${toneClasses[group.tone]}`}>
            <p className="text-sm font-semibold uppercase tracking-wide">{group.title}</p>
            <ul className="mt-3 space-y-2 text-sm">
              {group.items.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-6">
        <div className="rounded-2xl border border-slate-200 p-4">
          <SectionTitle
            eyebrow="Recommended page architecture"
            title="Page shell + panel registry + layout engine"
            body="The page should be assembled from configurable modules, with layout data, content data, and styling tokens flowing through separate but coordinated layers."
          />
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {recommendations.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">•</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <SectionTitle
              eyebrow="Component hierarchy"
              title="Composable modules"
              body="Profile surfaces, navigation, timeline, chat, and sidebar cards should all render through a shared layout contract."
            />
            <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{componentHierarchy.join('\n')}</pre>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <SectionTitle
              eyebrow="Panel system design"
              title="Add new panels without editing core logic"
              body="Every panel type should declare its own renderer, editor controls, sizing rules, and supported view modes."
            />
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {panelContract.map((item) => (
                <li key={item} className="rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800">{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <SectionTitle
            eyebrow="Layout editor architecture"
            title="Hybrid grid studio with live preview"
            body="Use a constrained grid for predictable responsiveness while keeping drag, resize, add, remove, and section rearrangement instant in the preview."
          />
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">Studio capabilities</p>
              <ul className="mt-2 space-y-1">
                <li>• Drag panels across sections</li>
                <li>• Resize using allowed width/height tokens</li>
                <li>• Add or remove panels from a registry drawer</li>
                <li>• Preview changes immediately before publishing</li>
              </ul>
            </div>
            <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <p className="font-semibold text-slate-900">State strategy</p>
              <ul className="mt-2 space-y-1">
                <li>• Persist draft layout separately from committed layout</li>
                <li>• Keep content editing and styling/layout editing in distinct drawers</li>
                <li>• Publish desktop and mobile layouts independently</li>
                <li>• Allow cancel/revert without destroying live visitor output</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 p-4">
          <SectionTitle
            eyebrow="Data models"
            title="Layouts and themes as versioned configuration"
            body="Configuration should be normalized before rendering so the shell can pick the correct desktop or mobile template, then apply theme tokens and panel overrides."
          />
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{layoutModel}</pre>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <SectionTitle
              eyebrow="UX flow diagrams"
              title="Seamless view-mode switching"
              body="Guest, owner, and editor workflows should share the same page context while exposing different controls."
            />
            <div className="mt-3 space-y-3">
              {uxFlows.map((flow) => (
                <div key={flow.title} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-semibold capitalize text-slate-900">{flow.title}</p>
                  <p className="mt-1 text-sm text-slate-700">{flow.diagram}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <SectionTitle
              eyebrow="Responsive layout strategy"
              title="Independent desktop and mobile layouts"
              body="Mobile must not simply scale down desktop geometry; it should load its own optimized template whenever a saved mobile layout is missing."
            />
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {responsiveStrategy.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-4">
            <SectionTitle
              eyebrow="Performance considerations"
              title="Scale the hub without slowing it down"
              body="The redesign should reduce render blast radius, keep heavy modules lazy, and separate content traffic from design draft traffic."
            />
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {performanceConsiderations.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 p-4">
            <SectionTitle
              eyebrow="Future extensibility"
              title="Ready for new panels, activities, and integrations"
              body="Schema versioning and a registry-based panel contract make the page resilient as the platform grows."
            />
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              {extensibilityStrategy.map((item) => (
                <li key={item} className="flex gap-2">
                  <span aria-hidden="true">•</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SocialArchitectureBlueprint;
