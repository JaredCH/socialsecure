import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FONT_SIZE_LABELS,
  SOCIAL_DESIGN_TEMPLATES,
  SOCIAL_FONT_FAMILIES,
  SOCIAL_FONT_SIZE_TOKENS,
  SOCIAL_LAYOUT_PRESETS,
  SOCIAL_LAYOUT_MODES,
  SOCIAL_PANEL_IDS,
  SOCIAL_PANEL_LABELS,
  SOCIAL_THEME_STYLE_PRESETS,
  SOCIAL_PANEL_SHAPES,
  SOCIAL_PANEL_SHAPE_MASKS,
  normalizeSocialPreferences
} from '../../utils/socialPagePreferences';
import AdvancedColorPicker from './AdvancedColorPicker';

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

const getShapeMask = (shape) => {
  return SOCIAL_PANEL_SHAPE_MASKS[shape] || SOCIAL_PANEL_SHAPE_MASKS.rectangle;
};

const getShapeDimensions = (shape) => {
  const mask = getShapeMask(shape);
  return { width: mask[0].length, height: mask.length };
};

const SocialDesignStudioModal = ({
  isOpen,
  onClose,
  preferences,
  configs,
  activeConfigId,
  sharedDesigns,
  favoriteDesigns,
  layoutPresets,
  onApplyTemplate,
  onApplyLayoutPreset,
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
  successMessage,
  layoutMode,
  onLayoutModeChange,
  onSaveChanges,
  onCancelChanges,
  hasUnsavedChanges
}) => {
  const [activePanelId, setActivePanelId] = useState('');
  const [layoutDraftById, setLayoutDraftById] = useState({});
  const [pointerAction, setPointerAction] = useState(null);
  const [editingPanelId, setEditingPanelId] = useState(null);
  const [expandedThemes, setExpandedThemes] = useState({});
  const gridRef = useRef(null);

  const normalized = useMemo(() => normalizeSocialPreferences(preferences, 'default', layoutMode), [preferences, layoutMode]);
  
  const previewPanels = useMemo(() => {
    const panels = [];
    normalized.sectionOrder.forEach((panelId) => {
      const panel = normalized.effective.panels[panelId];
      if (!panel || panel.visible === false) return;
      
      const draft = layoutDraftById[panelId] || {};
      panels.push({
        ...panel,
        ...draft,
        size: draft.size || panel.size,
        height: draft.height || panel.height,
        gridPlacement: draft.gridPlacement || panel.gridPlacement,
        shape: draft.shape || panel.shape || 'rectangle',
        id: panelId
      });
    });
    return panels;
  }, [normalized, layoutDraftById]);

  const occupiedCells = useMemo(() => {
    const cellMap = new Map();
    previewPanels.forEach((panel) => {
      const width = getPanelWidthUnits(panel);
      const height = getPanelHeightUnits(panel);
      for (let y = panel.gridPlacement.row; y < panel.gridPlacement.row + height; y += 1) {
        for (let x = panel.gridPlacement.col; x < panel.gridPlacement.col + width; x += 1) {
          cellMap.set(`${x}:${y}`, panel.id);
        }
      }
    });
    return cellMap;
  }, [previewPanels]);

  const selectedPanel = activePanelId ? previewPanels.find((panel) => panel.id === activePanelId) : null;

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

  const getPlacementFootprint = (panel, row, col, ignorePanelId = '') => {
    const width = getPanelWidthUnits(panel);
    const height = getPanelHeightUnits(panel);
    const bounds = { min: 0, max: GRID_COLUMNS - 1 };
    
    if (col < bounds.min || (col + width - 1) > bounds.max || row < 0 || (row + height - 1) >= GRID_ROWS) {
      return { valid: false, cells: [] };
    }

    const cells = [];
    let valid = true;
    for (let y = row; y < row + height; y += 1) {
      for (let x = col; x < col + width; x += 1) {
        const occupantId = occupiedCells.get(`${x}:${y}`);
        if (occupantId && occupantId !== panel.id && occupantId !== ignorePanelId) valid = false;
        cells.push(`${x}:${y}`);
      }
    }
    return { valid, cells };
  };

  const getCellFromClientPoint = (clientX, clientY) => {
    if (!gridRef.current) return null;
    const rect = gridRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width - 1));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height - 1));
    const col = Math.floor((x / rect.width) * GRID_COLUMNS);
    const row = Math.floor((y / rect.height) * GRID_ROWS);
    return { row: Math.max(0, Math.min(row, GRID_ROWS - 1)), col: Math.max(0, Math.min(col, GRID_COLUMNS - 1)) };
  };

  useEffect(() => {
    if (!pointerAction) return undefined;

    const handlePointerMove = (event) => {
      const panel = previewPanels.find((item) => item.id === pointerAction.panelId);
      if (!panel) return;
      const cell = getCellFromClientPoint(event.clientX, event.clientY);
      if (!cell) return;

      if (pointerAction.type === 'drag') {
        const width = getPanelWidthUnits(panel);
        const height = getPanelHeightUnits(panel);
        const nextCol = Math.max(0, Math.min(cell.col - pointerAction.offsetCol, GRID_COLUMNS - width));
        const nextRow = Math.max(0, Math.min(cell.row - pointerAction.offsetRow, GRID_ROWS - height));
        const nextFootprint = getPlacementFootprint(panel, nextRow, nextCol, panel.id);
        if (!nextFootprint.valid) return;
        setLayoutDraftById((prev) => ({
          ...prev,
          [panel.id]: {
            ...(prev[panel.id] || {}),
            gridPlacement: { row: nextRow, col: nextCol }
          }
        }));
      }
    };

    const handlePointerUp = () => {
      const panelId = pointerAction.panelId;
      const patch = layoutDraftById[panelId];
      if (patch) {
        updateLayoutPatch(panelId, patch);
      }
      setPointerAction(null);
      setLayoutDraftById((prev) => {
        if (!prev[panelId]) return prev;
        const next = { ...prev };
        delete next[panelId];
        return next;
      });
    };

    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
    };
  }, [pointerAction, previewPanels, layoutDraftById]);

  const handleThemeClick = (theme) => {
    if (theme.design) {
      onApplyTemplate(theme);
    }
  };

  const toggleThemeExpand = (themeId) => {
    setExpandedThemes(prev => ({ ...prev, [themeId]: !prev[themeId] }));
  };

  const handlePanelClick = (panelId) => {
    setActivePanelId(panelId);
    setEditingPanelId(panelId);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2rem] border border-white/10 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-4 text-white">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-100">Design Studio</p>
            <h2 className="text-2xl font-semibold">Social Page Customization</h2>
          </div>
          <div className="flex items-center gap-2">
            {hasUnsavedChanges ? <span className="rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">Draft</span> : null}
            <button type="button" onClick={onCancelChanges} className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Cancel</button>
            <button type="button" disabled={busy || !hasUnsavedChanges} onClick={onSaveChanges} className="rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-100">Save</button>
            <button type="button" onClick={onClose} className="rounded-full border border-white/20 px-4 py-2 text-sm hover:bg-white/10">Close</button>
          </div>
        </div>

        {/* Viewport Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 py-2">
          <div className="flex gap-2">
            {SOCIAL_LAYOUT_MODES.map((mode) => (
              <button
                key={mode}
                onClick={() => onLayoutModeChange(mode)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold capitalize ${layoutMode === mode ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'}`}
              >
                {mode} View
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex flex-1 overflow-hidden">
          {layoutMode === 'desktop' ? (
            <div className="flex flex-1 overflow-hidden">
              {/* Left: Miniature Representation */}
              <div className="flex-1 overflow-auto bg-slate-100 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Live Preview</h3>
                  <p className="text-xs text-slate-500">Click panels to edit</p>
                </div>
                
                <div 
                  ref={gridRef}
                  className="relative mx-auto aspect-[12/20] w-full max-w-md rounded-xl border-4 border-slate-800 bg-white shadow-2xl"
                  style={{ 
                    backgroundColor: normalized.globalStyles.pageBackgroundColor,
                    display: 'grid',
                    gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)`,
                    gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`
                  }}
                >
                  {/* Grid Lines */}
                  {Array.from({ length: GRID_ROWS * GRID_COLUMNS }).map((_, index) => {
                    const col = index % GRID_COLUMNS;
                    const row = Math.floor(index / GRID_COLUMNS);
                    return (
                      <div key={`${col}:${row}`} className="border-[0.5px] border-slate-200/50" />
                    );
                  })}

                  {/* Panels */}
                  {previewPanels.map((panel) => {
                    const width = getPanelWidthUnits(panel);
                    const height = getPanelHeightUnits(panel);
                    const isSelected = activePanelId === panel.id;
                    
                    return (
                      <div
                        key={panel.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => handlePanelClick(panel.id)}
                        onPointerDown={(event) => {
                          if (event.button !== 0) return;
                          const cell = getCellFromClientPoint(event.clientX, event.clientY);
                          if (!cell) return;
                          event.preventDefault();
                          setActivePanelId(panel.id);
                          setPointerAction({
                            type: 'drag',
                            panelId: panel.id,
                            offsetRow: Math.max(0, Math.min(cell.row - panel.gridPlacement.row, height - 1)),
                            offsetCol: Math.max(0, Math.min(cell.col - panel.gridPlacement.col, width - 1))
                          });
                        }}
                        className={`absolute cursor-grab rounded-md border-2 p-1 text-[8px] font-bold shadow-sm transition-all ${isSelected ? 'ring-2 ring-blue-500 z-10' : 'border-black/10 hover:border-blue-300'}`}
                        style={{
                          left: `${(panel.gridPlacement.col / GRID_COLUMNS) * 100}%`,
                          top: `${(panel.gridPlacement.row / GRID_ROWS) * 100}%`,
                          width: `${(width / GRID_COLUMNS) * 100}%`,
                          height: `${(height / GRID_ROWS) * 100}%`,
                          backgroundColor: panel.resolvedStyles?.panelColor,
                          color: panel.resolvedStyles?.fontColor,
                          fontFamily: panel.resolvedStyles?.fontFamily,
                          clipPath: panel.shape && panel.shape !== 'rectangle' 
                            ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' // Simplified for now, could use shape masks
                            : 'none'
                        }}
                      >
                        <span className="line-clamp-2 text-center">{SOCIAL_PANEL_LABELS[panel.id] || panel.id}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right: Controls */}
              <div className="w-96 overflow-auto border-l border-slate-200 bg-white p-6">
                {/* Theme Selection */}
                <section className="mb-6">
                  <h3 className="mb-3 text-lg font-semibold text-slate-900">Themes</h3>
                  <div className="space-y-2">
                    {(SOCIAL_THEME_STYLE_PRESETS || []).map((theme) => (
                      <div key={theme.id} className="rounded-xl border border-slate-200">
                        <button 
                          onClick={() => handleThemeClick(theme)}
                          className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{theme.name}</p>
                            <p className="text-xs text-slate-500">{theme.description}</p>
                          </div>
                          <div className="flex gap-1">
                            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: theme.design?.globalStyles?.panelColor }} />
                            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: theme.design?.globalStyles?.headerColor }} />
                            <div className="h-4 w-4 rounded-full" style={{ backgroundColor: theme.design?.globalStyles?.pageBackgroundColor }} />
                          </div>
                        </button>
                        <div className="border-t border-slate-100 px-4 py-2">
                          <button 
                            onClick={() => toggleThemeExpand(theme.id)}
                            className="text-xs font-semibold text-blue-600 hover:underline"
                          >
                            {expandedThemes[theme.id] ? 'Hide Colors' : 'Customize Colors'}
                          </button>
                          {expandedThemes[theme.id] && (
                            <div className="mt-3 space-y-3">
                              <AdvancedColorPicker 
                                label="Panel Color" 
                                value={normalized.globalStyles.panelColor}
                                onChange={(val) => onGlobalStylesChange({ panelColor: val })}
                              />
                              <AdvancedColorPicker 
                                label="Header Color" 
                                value={normalized.globalStyles.headerColor}
                                onChange={(val) => onGlobalStylesChange({ headerColor: val })}
                              />
                              <AdvancedColorPicker 
                                label="Font Color" 
                                value={normalized.globalStyles.fontColor}
                                onChange={(val) => onGlobalStylesChange({ fontColor: val })}
                              />
                              <AdvancedColorPicker 
                                label="Background" 
                                value={normalized.globalStyles.pageBackgroundColor}
                                onChange={(val) => onGlobalStylesChange({ pageBackgroundColor: val })}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Global Styles */}
                <section className="mb-6">
                  <h3 className="mb-3 text-lg font-semibold text-slate-900">Global Styles</h3>
                  <div className="space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Font Family</label>
                      <select 
                        value={normalized.globalStyles.fontFamily} 
                        onChange={(e) => onGlobalStylesChange({ fontFamily: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        {SOCIAL_FONT_FAMILIES.map((font) => (
                          <option key={font} value={font}>{font}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>

                {/* Panel List */}
                <section>
                  <h3 className="mb-3 text-lg font-semibold text-slate-900">Panels</h3>
                  <div className="space-y-2">
                    {previewPanels.map((panel) => (
                      <button
                        key={panel.id}
                        onClick={() => handlePanelClick(panel.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${activePanelId === panel.id ? 'border-blue-400 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <span className="font-semibold">{SOCIAL_PANEL_LABELS[panel.id] || panel.id}</span>
                      </button>
                    ))}
                  </div>
                </section>
              </div>
            </div>
          ) : (
            // Mobile View
            <div className="flex flex-1 overflow-hidden">
              <div className="flex-1 overflow-auto bg-slate-100 p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-slate-900">Mobile Preview</h3>
                  <p className="text-xs text-slate-500">Vertical stack</p>
                </div>
                
                <div className="mx-auto w-64 rounded-xl border-4 border-slate-800 bg-white shadow-2xl">
                  {previewPanels.map((panel) => (
                    <div 
                      key={panel.id}
                      className="border-b border-slate-100 p-2"
                      style={{ 
                        backgroundColor: panel.resolvedStyles?.panelColor,
                        color: panel.resolvedStyles?.fontColor
                      }}
                    >
                      <p className="text-xs font-bold">{SOCIAL_PANEL_LABELS[panel.id] || panel.id}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="w-96 overflow-auto border-l border-slate-200 bg-white p-6">
                <h3 className="mb-3 text-lg font-semibold text-slate-900">Mobile Settings</h3>
                
                <div className="space-y-4">
                  <AdvancedColorPicker 
                    label="Panel Color" 
                    value={normalized.globalStyles.panelColor}
                    onChange={(val) => onGlobalStylesChange({ panelColor: val })}
                  />
                  <AdvancedColorPicker 
                    label="Header Color" 
                    value={normalized.globalStyles.headerColor}
                    onChange={(val) => onGlobalStylesChange({ headerColor: val })}
                  />
                  <AdvancedColorPicker 
                    label="Font Color" 
                    value={normalized.globalStyles.fontColor}
                    onChange={(val) => onGlobalStylesChange({ fontColor: val })}
                  />
                  
                  <div className="border-t border-slate-200 pt-4">
                    <h4 className="mb-2 font-semibold text-slate-900">Panel Visibility</h4>
                    <div className="space-y-2">
                      {SOCIAL_PANEL_IDS.map((panelId) => {
                        const panel = normalized.panels?.[panelId];
                        return (
                          <label key={panelId} className="flex items-center gap-2">
                            <input 
                              type="checkbox" 
                              checked={panel?.visible !== false}
                              onChange={(e) => onPanelLayoutChange(panelId, { visible: e.target.checked })}
                            />
                            <span className="text-sm">{SOCIAL_PANEL_LABELS[panelId] || panelId}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Panel Editor Popup */}
        {editingPanelId && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white p-6 shadow-2xl">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-xl font-semibold text-slate-900">Edit {SOCIAL_PANEL_LABELS[editingPanelId] || editingPanelId}</h3>
                <button onClick={() => setEditingPanelId(null)} className="text-slate-500 hover:text-slate-700">✕</button>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <AdvancedColorPicker 
                    label="Background"
                    value={selectedPanel?.resolvedStyles?.panelColor}
                    onChange={(val) => onPanelStyleChange(editingPanelId, { panelColor: val })}
                  />
                  <AdvancedColorPicker 
                    label="Header"
                    value={selectedPanel?.resolvedStyles?.headerColor}
                    onChange={(val) => onPanelStyleChange(editingPanelId, { headerColor: val })}
                  />
                  <AdvancedColorPicker 
                    label="Text"
                    value={selectedPanel?.resolvedStyles?.fontColor}
                    onChange={(val) => onPanelStyleChange(editingPanelId, { fontColor: val })}
                  />
                  <AdvancedColorPicker 
                    label="Accent"
                    value={selectedPanel?.resolvedStyles?.accentColor}
                    onChange={(val) => onPanelStyleChange(editingPanelId, { accentColor: val })}
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-700">Font Family</label>
                  <select 
                    value={selectedPanel?.resolvedStyles?.fontFamily || normalized.globalStyles.fontFamily}
                    onChange={(e) => onPanelStyleChange(editingPanelId, { fontFamily: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2"
                  >
                    {SOCIAL_FONT_FAMILIES.map((font) => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <h4 className="mb-2 font-semibold text-slate-900">Size & Shape</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Width</label>
                      <select 
                        value={selectedPanel?.size}
                        onChange={(e) => onPanelLayoutChange(editingPanelId, { size: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <option value="halfCol">Half Column</option>
                        <option value="oneCol">One Column</option>
                        <option value="twoCols">Two Columns</option>
                        <option value="threeCols">Three Columns</option>
                        <option value="fourCols">Four Columns</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-slate-700">Height</label>
                      <select 
                        value={selectedPanel?.height}
                        onChange={(e) => onPanelLayoutChange(editingPanelId, { height: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <option value="halfRow">Half Row</option>
                        <option value="fullRow">Full Row</option>
                        <option value="twoRows">Two Rows</option>
                        <option value="threeRows">Three Rows</option>
                        <option value="fourRows">Four Rows</option>
                      </select>
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="mb-1 block text-xs font-semibold text-slate-700">Shape</label>
                    <div className="grid grid-cols-4 gap-2">
                      {SOCIAL_PANEL_SHAPES.map((shape) => (
                        <button
                          key={shape}
                          onClick={() => onPanelLayoutChange(editingPanelId, { shape })}
                          className={`rounded-lg border px-2 py-2 text-xs font-semibold capitalize ${selectedPanel?.shape === shape ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 hover:bg-slate-50'}`}
                        >
                          {shape}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <button 
                  onClick={() => setEditingPanelId(null)}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

SocialDesignStudioModal.defaultProps = {
  configs: [],
  sharedDesigns: [],
  favoriteDesigns: [],
  layoutPresets: SOCIAL_LAYOUT_PRESETS,
  busy: false,
  error: '',
  successMessage: '',
  onApplyLayoutPreset: () => {},
  layoutMode: 'desktop',
  hasUnsavedChanges: false,
  onLayoutModeChange: () => {},
  onSaveChanges: () => {},
  onCancelChanges: () => {}
};

export default SocialDesignStudioModal;
