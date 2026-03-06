import React, { useMemo, useState } from 'react';
import {
  FONT_SIZE_LABELS,
  SOCIAL_HEIGHT_LABELS,
  SOCIAL_DESIGN_TEMPLATES,
  SOCIAL_FONT_FAMILIES,
  SOCIAL_FONT_SIZE_TOKENS,
  SOCIAL_PANEL_IDS,
  SOCIAL_PANEL_LABELS,
  normalizeSocialPreferences
} from '../../utils/socialPagePreferences';

const Field = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-sm font-semibold text-slate-800">
    <span>{label}</span>
    {children}
  </label>
);

const GRID_COLUMNS = 12;
const GRID_ROWS = 20;

const getPanelWidthUnits = (panel = {}) => {
  if (panel.area === 'sideLeft' || panel.area === 'sideRight') return 2;
  const size = panel.size === 'quarterTile'
    ? 'halfCol'
    : panel.size === 'halfTile'
      ? 'oneCol'
      : panel.size === 'fullTile'
        ? 'twoCols'
        : panel.size;
  if (size === 'halfCol') return 1;
  if (size === 'oneCol') return 2;
  if (size === 'twoCols') return 4;
  if (size === 'threeCols') return 6;
  return 8;
};

const getPanelHeightUnits = (panel = {}) => {
  const height = panel.height || (panel.area === 'sideLeft' || panel.area === 'sideRight' ? 'fullRow' : 'fullRow');
  if (height === 'halfRow') return 1;
  if (height === 'twoRows') return 4;
  if (height === 'threeRows') return 6;
  if (height === 'fourRows') return 8;
  return 2;
};

const getColumnBoundsForArea = (area) => {
  return { min: 0, max: GRID_COLUMNS - 1 };
};

const panelWithPlacement = (panel = {}, row = 0, col = 0) => ({
  ...panel,
  gridPlacement: {
    row: Number.isFinite(Number(panel.gridPlacement?.row)) ? Number(panel.gridPlacement.row) : row,
    col: Number.isFinite(Number(panel.gridPlacement?.col)) ? Number(panel.gridPlacement.col) : col
  }
});

const formatConceptCoordinate = (unit) => `${Math.floor(unit / 2) + 1}${unit % 2 === 1 ? '.5' : ''}`;

const buildPanelLayoutMap = (normalized) => {
  const placed = [];
  const occupied = Array.from({ length: GRID_ROWS }, () => Array.from({ length: GRID_COLUMNS }, () => null));
  const allPanels = [...normalized.sectionOrder]
    .map((panelId) => ({ id: panelId, ...normalized.effective.panels[panelId] }))
    .filter((panel) => panel && panel.visible !== false)
    .sort((a, b) => (a.order || 0) - (b.order || 0));

  const canPlaceAt = (candidate, row, col) => {
    const width = getPanelWidthUnits(candidate);
    const height = getPanelHeightUnits(candidate);
    const bounds = getColumnBoundsForArea(candidate.area);
    if (col < bounds.min || (col + width - 1) > bounds.max || row < 0 || (row + height - 1) >= GRID_ROWS) return false;
    for (let y = row; y < row + height; y += 1) {
      for (let x = col; x < col + width; x += 1) {
        if (occupied[y][x]) return false;
      }
    }
    return true;
  };

  const markPlaced = (candidate) => {
    const width = getPanelWidthUnits(candidate);
    const height = getPanelHeightUnits(candidate);
    const { row, col } = candidate.gridPlacement;
    for (let y = row; y < row + height; y += 1) {
      for (let x = col; x < col + width; x += 1) {
        occupied[y][x] = candidate.id;
      }
    }
    placed.push(candidate);
  };

  allPanels.forEach((panel) => {
    const candidate = panelWithPlacement(panel, 0, getColumnBoundsForArea(panel.area).min);
    if (canPlaceAt(candidate, candidate.gridPlacement.row, candidate.gridPlacement.col)) {
      markPlaced(candidate);
      return;
    }

    const bounds = getColumnBoundsForArea(panel.area);
    let found = false;
    for (let row = 0; row < GRID_ROWS && !found; row += 1) {
      for (let col = bounds.min; col <= bounds.max; col += 1) {
        if (canPlaceAt(candidate, row, col)) {
          candidate.gridPlacement = { row, col };
          markPlaced(candidate);
          found = true;
          break;
        }
      }
    }

    if (!found) {
      candidate.gridPlacement = { row: 0, col: bounds.min };
      placed.push(candidate);
    }
  });

  return { placed, occupied };
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
  onPanelLayoutChange,
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
  const [activePanelId, setActivePanelId] = useState('');
  const [editingPanelId, setEditingPanelId] = useState('');
  const [dragPanelId, setDragPanelId] = useState('');
  const [hoverCell, setHoverCell] = useState(null);
  const [isPlacementMode, setIsPlacementMode] = useState(false);
  const normalized = useMemo(() => normalizeSocialPreferences(preferences), [preferences]);
  const gridLayout = useMemo(() => buildPanelLayoutMap(normalized), [normalized]);
  const selectedPanel = activePanelId ? gridLayout.placed.find((panel) => panel.id === activePanelId) : null;
  const editingPanel = editingPanelId ? gridLayout.placed.find((panel) => panel.id === editingPanelId) : null;

  if (!isOpen) return null;

  const handleDuplicate = (configId, fallbackName) => {
    const name = (duplicateNames[configId] || '').trim() || `${fallbackName} Copy`;
    onDuplicateConfig(configId, name);
  };

  const updateLayoutPatch = (panelId, patch) => {
    const panel = normalized.effective.panels[panelId];
    if (!panel) return;
    onPanelLayoutChange(panelId, {
      ...patch,
      order: Number.isFinite(Number(patch.order))
        ? Number(patch.order)
        : panel.order
    });
  };

  const openPanelEditor = (panelId) => {
    setActivePanelId(panelId);
    setEditingPanelId(panelId);
    setDragPanelId('');
    setIsPlacementMode(false);
    setHoverCell(null);
  };

  const getPlacementFootprint = (panel, row, col) => {
    const width = getPanelWidthUnits(panel);
    const height = getPanelHeightUnits(panel);
    const bounds = getColumnBoundsForArea(panel.area);
    if (col < bounds.min || (col + width - 1) > bounds.max || row < 0 || (row + height - 1) >= GRID_ROWS) {
      return { valid: false, cells: [] };
    }

    const cells = [];
    let valid = true;
    for (let y = row; y < row + height; y += 1) {
      for (let x = col; x < col + width; x += 1) {
        const occupant = gridLayout.occupied[y][x];
        if (occupant && occupant !== panel.id) valid = false;
        cells.push(`${x}:${y}`);
      }
    }
    return { valid, cells };
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-7xl overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-4 text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-100">Design Studio</p>
            <h2 className="text-2xl font-semibold">Social Page Customization</h2>
            <p className="text-sm text-slate-100">Batch edit your live layout, save reusable appearances, and clone shared designs.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Close</button>
        </div>

        <div className="grid max-h-[calc(92vh-5rem)] grid-cols-1 overflow-y-auto xl:grid-cols-[1.2fr_0.9fr]">
          <div className="space-y-6 bg-slate-50 px-6 py-6">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Layout studio</h3>
                  <p className="text-sm text-slate-800">Click a panel to edit shape, then hover and place it on the 6-column by 10-row grid. Green = valid placement, red = blocked.</p>
                </div>
                {busy ? <span className="text-xs font-semibold uppercase tracking-wide text-blue-700">Saving…</span> : null}
              </div>
              <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.4fr)]">
                <div className="rounded-2xl border border-slate-200 p-4">
                  <h4 className="text-sm font-semibold text-slate-900">Panel shape and slot</h4>
                  <p className="mt-1 text-xs text-slate-800">Click a panel to open the editor, adjust shape, click Start placement, then place where it fits.</p>
                  <div className="mt-3 space-y-2">
                    {gridLayout.placed.map((panel) => (
                      <button
                        key={panel.id}
                        type="button"
                        onClick={() => openPanelEditor(panel.id)}
                          className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${activePanelId === panel.id ? 'border-blue-400 bg-blue-50 text-blue-900' : 'border-slate-200 text-slate-800 hover:bg-slate-50'}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">{SOCIAL_PANEL_LABELS[panel.id] || panel.id}</span>
                          <span className="text-xs text-slate-800">r{formatConceptCoordinate(panel.gridPlacement.row)} c{formatConceptCoordinate(panel.gridPlacement.col)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-900">
                    {selectedPanel && isPlacementMode
                      ? `Now hover over the grid and click a green position to place ${SOCIAL_PANEL_LABELS[selectedPanel.id] || selectedPanel.id}.`
                      : 'Pick a panel to begin editing and placement.'}
                  </p>
                </div>
                <div
                  className="relative rounded-2xl border border-slate-200 p-3"
                  style={{ backgroundColor: normalized.globalStyles.pageBackgroundColor }}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!dragPanelId || !hoverCell) return;
                    const panel = gridLayout.placed.find((item) => item.id === dragPanelId);
                    if (!panel) return;
                    const footprint = getPlacementFootprint(panel, hoverCell.row, hoverCell.col);
                    if (!footprint.valid) return;
                    updateLayoutPatch(dragPanelId, { gridPlacement: { row: hoverCell.row, col: hoverCell.col } });
                    setDragPanelId('');
                    setHoverCell(null);
                  }}
                >
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-800">
                    <span>Grid preview</span>
                    <span>6x10 conceptual grid (12x20 internal slots)</span>
                  </div>
                  <div className="relative grid gap-0.5 rounded-lg bg-slate-200/70 p-1" style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 20px))` }}>
                    {Array.from({ length: GRID_ROWS * GRID_COLUMNS }).map((_, index) => {
                      const col = index % GRID_COLUMNS;
                      const row = Math.floor(index / GRID_COLUMNS);
                      const panel = dragPanelId ? gridLayout.placed.find((item) => item.id === dragPanelId) : selectedPanel;
                      const footprint = panel && hoverCell ? getPlacementFootprint(panel, hoverCell.row, hoverCell.col) : null;
                      const key = `${col}:${row}`;
                      const inHoverFootprint = Boolean(footprint?.cells.includes(key));
                      return (
                        <button
                          key={key}
                          type="button"
                          className={`h-4 w-full rounded-[3px] ${inHoverFootprint ? (footprint.valid ? 'bg-emerald-400' : 'bg-rose-400') : 'bg-white/75 hover:bg-blue-100'}`}
                          onMouseEnter={() => setHoverCell({ row, col })}
                          onDragOver={(event) => {
                            event.preventDefault();
                            if (!dragPanelId) return;
                            setHoverCell((current) => (
                              current && current.row === row && current.col === col
                                ? current
                                : { row, col }
                            ));
                          }}
                          onClick={() => {
                            if (!selectedPanel) return;
                            const result = getPlacementFootprint(selectedPanel, row, col);
                            if (!result.valid) return;
                            updateLayoutPatch(selectedPanel.id, { gridPlacement: { row, col } });
                            setIsPlacementMode(false);
                            setHoverCell(null);
                          }}
                          aria-label={`Grid cell row ${row + 1} col ${col + 1}`}
                        />
                      );
                    })}
                    {gridLayout.placed.map((panel) => {
                      const width = getPanelWidthUnits(panel);
                      const height = getPanelHeightUnits(panel);
                      return (
                        <div
                          key={panel.id}
                          draggable
                          onDragStart={() => {
                            setActivePanelId(panel.id);
                            setEditingPanelId('');
                            setIsPlacementMode(true);
                            setDragPanelId(panel.id);
                            setHoverCell(null);
                          }}
                          onDragEnd={() => {
                            setDragPanelId('');
                            setHoverCell(null);
                          }}
                          onClick={() => openPanelEditor(panel.id)}
                          className={`absolute cursor-grab rounded-md border border-black/10 px-1 py-1 text-[10px] font-semibold shadow-sm ${activePanelId === panel.id ? 'ring-2 ring-blue-400' : ''}`}
                          style={{
                            left: `calc(${(panel.gridPlacement.col / GRID_COLUMNS) * 100}% + 4px)`,
                            top: `calc(${(panel.gridPlacement.row / GRID_ROWS) * 100}% + 4px)`,
                            width: `calc(${(width / GRID_COLUMNS) * 100}% - 6px)`,
                            height: `calc(${(height / GRID_ROWS) * 100}% - 6px)`,
                            backgroundColor: panel.resolvedStyles?.panelColor,
                            color: panel.resolvedStyles?.fontColor,
                            fontFamily: panel.resolvedStyles?.fontFamily
                          }}
                        >
                          {SOCIAL_PANEL_LABELS[panel.id] || panel.id}
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800">
                      <p className="font-semibold text-slate-900">Placement</p>
                      <p>Panels can be placed in any lane where their footprint stays in-bounds.</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800">
                      <p className="font-semibold text-slate-900">Widths</p>
                      <p>Main panels support widths from ½ to 4 conceptual columns.</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-2 text-xs text-slate-800">
                      <p className="font-semibold text-slate-900">Rows</p>
                      <p>Rows support ½, 1, 2, 3, and 4 row heights.</p>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Global styling</h3>
                  <p className="text-sm text-slate-800">Apply page-wide panel, header, font, and preset sizing changes.</p>
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
              <p className="text-sm text-slate-800">Keep most panels global, then selectively opt into custom styling.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {SOCIAL_PANEL_IDS.map((panelId) => {
                  const panel = normalized.panels?.[panelId];
                  return (
                    <div key={panelId} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-slate-900">{SOCIAL_PANEL_LABELS[panelId] || panelId}</h4>
                          <p className="text-xs text-slate-800">{panel?.useCustomStyles ? 'Custom override active' : 'Using global style'}</p>
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
                    <p className="text-sm text-slate-800">{template.description}</p>
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
                        <p className="text-xs text-slate-800">{config._id === activeConfigId ? 'Currently applied' : 'Saved draft'}</p>
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
                  <p className="text-sm text-slate-800">No shared designs available for this profile yet.</p>
                ) : sharedDesigns.map((config) => (
                  <div key={config._id} className="rounded-2xl border border-slate-200 p-4">
                    <p className="font-semibold text-slate-900">{config.name}</p>
                    <p className="text-xs text-slate-800">by @{config.owner?.username || 'designer'}</p>
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
                      <p key={config._id} className="text-sm text-slate-800">{config.name} • @{config.owner?.username || 'designer'}</p>
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
      {editingPanel ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-6">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-semibold text-slate-900">Edit panel shape</h4>
                <p className="text-sm text-slate-800">{SOCIAL_PANEL_LABELS[editingPanel.id] || editingPanel.id}</p>
              </div>
              <button type="button" onClick={() => setEditingPanelId('')} className="rounded-lg border border-slate-200 px-3 py-1 text-sm font-medium text-slate-800 hover:bg-slate-50">Close</button>
            </div>
            <p className="mt-3 text-sm text-slate-800">Adjust width and height, then click “Start placement” to hover the grid and place this panel anywhere it fits.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label="Width">
                <select
                  value={editingPanel.size}
                  onChange={(event) => {
                    updateLayoutPatch(editingPanel.id, { size: event.target.value });
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                >
                  {(editingPanel.area === 'sideLeft' || editingPanel.area === 'sideRight'
                    ? ['sidePanelHalfHeight', 'sidePanelFull']
                    : ['halfCol', 'oneCol', 'twoCols', 'threeCols', 'fourCols']
                  ).map((value) => (
                    <option key={value} value={value}>{value === 'sidePanelHalfHeight' ? 'Side panel (compact)' : value === 'sidePanelFull' ? 'Side panel (full)' : value}</option>
                  ))}
                </select>
              </Field>
              <Field label="Height">
                <select
                  value={editingPanel.height || 'fullRow'}
                  onChange={(event) => {
                    updateLayoutPatch(editingPanel.id, { height: event.target.value });
                  }}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900"
                >
                  {(editingPanel.area === 'sideLeft' || editingPanel.area === 'sideRight'
                    ? ['halfRow', 'fullRow', 'twoRows', 'fourRows']
                    : ['halfRow', 'fullRow', 'twoRows', 'threeRows', 'fourRows']
                  ).map((value) => (
                    <option key={value} value={value}>{SOCIAL_HEIGHT_LABELS[value]}</option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsPlacementMode(true);
                  setEditingPanelId('');
                }}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Start placement
              </button>
            </div>
          </div>
        </div>
      ) : null}
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
