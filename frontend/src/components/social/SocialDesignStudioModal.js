import React, { useMemo, useState } from 'react';
import {
  FONT_SIZE_LABELS,
  SOCIAL_DESIGN_TEMPLATES,
  SOCIAL_FONT_FAMILIES,
  SOCIAL_FONT_SIZE_TOKENS,
  SOCIAL_PANEL_IDS,
  SOCIAL_PANEL_LABELS,
  getPanelsByArea,
  getPanelSpanClass,
  normalizeSocialPreferences
} from '../../utils/socialPagePreferences';

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-sm font-medium text-slate-700">
    <span>{label}</span>
    {children}
  </label>
);

const PreviewPanel = ({ panelId, panel }) => {
  const styles = panel?.resolvedStyles || {};
  return (
    <div
      className={`rounded-xl border border-black/5 shadow-sm ${getPanelSpanClass(panel)}`}
      style={{ backgroundColor: styles.panelColor, color: styles.fontColor, fontFamily: styles.fontFamily }}
    >
      <div className="rounded-t-xl px-3 py-2 text-xs font-semibold" style={{ backgroundColor: styles.headerColor, color: '#fff' }}>
        {SOCIAL_PANEL_LABELS[panelId] || panelId}
      </div>
      <div className="px-3 py-3 text-xs opacity-80">{panel.size}</div>
    </div>
  );
};

const SocialDesignStudioModal = ({
  isOpen,
  onClose,
  preferences,
  configs,
  activeConfigId,
  sharedDesigns,
  favoriteDesigns,
  onApplyTemplate,
  onGlobalStylesChange,
  onPanelOverrideToggle,
  onPanelStyleChange,
  onCreateConfig,
  onUpdateConfig,
  onApplyConfig,
  onDuplicateConfig,
  onDeleteConfig,
  onFavoriteShared,
  onCloneShared,
  busy,
  error,
  successMessage
}) => {
  const [newConfigName, setNewConfigName] = useState('');
  const [duplicateNames, setDuplicateNames] = useState({});
  const normalized = useMemo(() => normalizeSocialPreferences(preferences), [preferences]);
  const previewPanels = useMemo(() => getPanelsByArea(normalized), [normalized]);

  if (!isOpen) return null;

  const handleDuplicate = (configId, fallbackName) => {
    const name = (duplicateNames[configId] || '').trim() || `${fallbackName} Copy`;
    onDuplicateConfig(configId, name);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-4 text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Design Studio</p>
            <h2 className="text-2xl font-semibold">Social Page Customization</h2>
            <p className="text-sm text-slate-300">Batch edit your live layout, save reusable appearances, and clone shared designs.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Close</button>
        </div>

        <div className="grid max-h-[calc(92vh-5rem)] grid-cols-1 overflow-y-auto xl:grid-cols-[1.2fr_0.9fr]">
          <div className="space-y-6 bg-slate-50 px-6 py-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Live Preview</h3>
                  <p className="text-sm text-slate-500">A compact preview of the current layout and style draft.</p>
                </div>
                {busy ? <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">Saving…</span> : null}
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 p-4" style={{ backgroundColor: normalized.globalStyles.pageBackgroundColor }}>
                <div className="space-y-3">
                  {previewPanels.top.map((panel) => <PreviewPanel key={panel.id} panelId={panel.id} panel={panel} />)}
                </div>
                <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_2fr_1fr]">
                  <div className="space-y-3">{previewPanels.sideLeft.map((panel) => <PreviewPanel key={panel.id} panelId={panel.id} panel={panel} />)}</div>
                  <div className="grid grid-cols-4 gap-3">{previewPanels.main.map((panel) => <PreviewPanel key={panel.id} panelId={panel.id} panel={panel} />)}</div>
                  <div className="space-y-3">{previewPanels.sideRight.map((panel) => <PreviewPanel key={panel.id} panelId={panel.id} panel={panel} />)}</div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Global styling</h3>
                  <p className="text-sm text-slate-500">Apply page-wide panel, header, font, and preset sizing changes.</p>
                </div>
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Panel color"><input type="color" value={normalized.globalStyles.panelColor} onChange={(event) => onGlobalStylesChange({ panelColor: event.target.value })} /></Field>
                <Field label="Header color"><input type="color" value={normalized.globalStyles.headerColor} onChange={(event) => onGlobalStylesChange({ headerColor: event.target.value })} /></Field>
                <Field label="Font color"><input type="color" value={normalized.globalStyles.fontColor} onChange={(event) => onGlobalStylesChange({ fontColor: event.target.value })} /></Field>
                <Field label="Page background"><input type="color" value={normalized.globalStyles.pageBackgroundColor} onChange={(event) => onGlobalStylesChange({ pageBackgroundColor: event.target.value })} /></Field>
                <Field label="Font family">
                  <select value={normalized.globalStyles.fontFamily} onChange={(event) => onGlobalStylesChange({ fontFamily: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2">
                    {SOCIAL_FONT_FAMILIES.map((fontFamily) => <option key={fontFamily} value={fontFamily}>{fontFamily}</option>)}
                  </select>
                </Field>
                {['header', 'subHeader', 'regular', 'small'].map((key) => (
                  <Field key={key} label={`${key} preset`}>
                    <select
                      value={normalized.globalStyles.fontSizes?.[key] || 'base'}
                      onChange={(event) => onGlobalStylesChange({ fontSizes: { [key]: event.target.value } })}
                      className="rounded-xl border border-slate-200 px-3 py-2"
                    >
                      {SOCIAL_FONT_SIZE_TOKENS.map((token) => <option key={token} value={token}>{FONT_SIZE_LABELS[token]}</option>)}
                    </select>
                  </Field>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Panel overrides</h3>
              <p className="text-sm text-slate-500">Keep most panels global, then selectively opt into custom styling.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {SOCIAL_PANEL_IDS.map((panelId) => {
                  const panel = normalized.panels?.[panelId];
                  return (
                    <div key={panelId} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-slate-900">{SOCIAL_PANEL_LABELS[panelId] || panelId}</h4>
                          <p className="text-xs text-slate-500">{panel?.useCustomStyles ? 'Custom override active' : 'Using global style'}</p>
                        </div>
                        <button type="button" onClick={() => onPanelOverrideToggle(panelId, !panel?.useCustomStyles)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">
                          {panel?.useCustomStyles ? 'Use global' : 'Enable override'}
                        </button>
                      </div>
                      {panel?.useCustomStyles ? (
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <Field label="Panel"><input type="color" value={panel.styles?.panelColor || normalized.globalStyles.panelColor} onChange={(event) => onPanelStyleChange(panelId, { panelColor: event.target.value })} /></Field>
                          <Field label="Header"><input type="color" value={panel.styles?.headerColor || normalized.globalStyles.headerColor} onChange={(event) => onPanelStyleChange(panelId, { headerColor: event.target.value })} /></Field>
                          <Field label="Font"><input type="color" value={panel.styles?.fontColor || normalized.globalStyles.fontColor} onChange={(event) => onPanelStyleChange(panelId, { fontColor: event.target.value })} /></Field>
                          <Field label="Font family">
                            <select value={panel.styles?.fontFamily || normalized.globalStyles.fontFamily} onChange={(event) => onPanelStyleChange(panelId, { fontFamily: event.target.value })} className="rounded-xl border border-slate-200 px-3 py-2">
                              {SOCIAL_FONT_FAMILIES.map((fontFamily) => <option key={fontFamily} value={fontFamily}>{fontFamily}</option>)}
                            </select>
                          </Field>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="space-y-6 border-l border-slate-200 bg-white px-6 py-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Instant themes</h3>
              <div className="mt-4 grid gap-3">
                {(SOCIAL_DESIGN_TEMPLATES || []).map((template) => (
                  <button key={template.id} type="button" onClick={() => onApplyTemplate(template)} className="rounded-2xl border border-slate-200 px-4 py-4 text-left hover:border-slate-300 hover:bg-slate-50">
                    <p className="font-semibold text-slate-900">{template.name}</p>
                    <p className="text-sm text-slate-500">{template.description}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Saved configurations</h3>
              <div className="mt-4 flex gap-2">
                <input value={newConfigName} onChange={(event) => setNewConfigName(event.target.value)} placeholder="New config name" className="flex-1 rounded-xl border border-slate-200 px-3 py-2" />
                <button type="button" onClick={() => onCreateConfig(newConfigName)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">Save new</button>
              </div>
              <div className="mt-4 space-y-3">
                {configs.map((config) => (
                  <div key={config._id} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{config.name}</p>
                        <p className="text-xs text-slate-500">{config._id === activeConfigId ? 'Currently applied' : 'Saved draft'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={() => onApplyConfig(config._id)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">Apply</button>
                        <button type="button" onClick={() => onUpdateConfig(config._id, { name: `${config.name}`.trim(), design: normalized })} className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">Save over</button>
                        <button type="button" onClick={() => onUpdateConfig(config._id, { isShared: !config.isShared })} className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">{config.isShared ? 'Unshare' : 'Share'}</button>
                        <button type="button" onClick={() => onDeleteConfig(config._id)} className="rounded-lg border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50">Delete</button>
                      </div>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <input
                        value={duplicateNames[config._id] || ''}
                        onChange={(event) => setDuplicateNames((prev) => ({ ...prev, [config._id]: event.target.value }))}
                        placeholder="Duplicate rename"
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      />
                      <button type="button" onClick={() => handleDuplicate(config._id, config.name)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm hover:bg-slate-50">Duplicate</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Shared designs</h3>
              <div className="mt-4 space-y-3">
                {sharedDesigns.length === 0 ? (
                  <p className="text-sm text-slate-500">No shared designs available for this profile yet.</p>
                ) : sharedDesigns.map((config) => (
                  <div key={config._id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">{config.name}</p>
                    <p className="text-xs text-slate-500">by @{config.owner?.username || 'designer'}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => onFavoriteShared(config)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">{config.isFavorite ? 'Unfavorite' : 'Favorite'}</button>
                      <button type="button" onClick={() => onCloneShared(config, `${config.name} Clone`, false)} className="rounded-lg border border-slate-200 px-3 py-1 text-xs hover:bg-slate-50">Clone</button>
                      <button type="button" onClick={() => onCloneShared(config, `${config.name} Applied`, true)} className="rounded-lg bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800">Clone + apply</button>
                    </div>
                  </div>
                ))}
              </div>
              {favoriteDesigns.length > 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 p-4">
                  <p className="text-sm font-semibold text-slate-900">Favorites</p>
                  <div className="mt-2 space-y-2">
                    {favoriteDesigns.map((config) => (
                      <p key={config._id} className="text-sm text-slate-600">{config.name} • @{config.owner?.username || 'designer'}</p>
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {(error || successMessage) ? (
              <section className={`rounded-2xl border p-4 shadow-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                {error || successMessage}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

SocialDesignStudioModal.defaultProps = {
  configs: [],
  sharedDesigns: [],
  favoriteDesigns: [],
  busy: false,
  error: '',
  successMessage: ''
};

export default SocialDesignStudioModal;
