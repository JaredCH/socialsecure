import React from 'react';
import {
  FONT_SIZE_LABELS,
  SOCIAL_AREA_LABELS,
  SOCIAL_FONT_FAMILIES,
  SOCIAL_FONT_SIZE_TOKENS,
  SOCIAL_HEIGHT_LABELS,
  SOCIAL_LAYOUT_SIZES,
  SOCIAL_PANEL_LABELS,
  SOCIAL_PANEL_SHAPES,
  SOCIAL_PANEL_SHAPE_MASKS,
  SOCIAL_SIZE_LABELS,
  getFontSizeClass,
  getPanelSpanClass
} from '../../utils/socialPagePreferences';

const getAvailableSizes = (area) => {
  if (area === 'sideLeft' || area === 'sideRight') {
    return ['sidePanelFull', 'sidePanelHalfHeight'];
  }
  if (area === 'top') {
    return ['fullTile'];
  }
  return ['halfCol', 'oneCol', 'twoCols', 'threeCols', 'fourCols'];
};

const getAvailableHeights = (area) => {
  if (area === 'sideLeft' || area === 'sideRight') {
    return ['halfRow', 'fullRow', 'twoRows', 'fourRows'];
  }
  if (area === 'top') {
    return ['fullRow'];
  }
  return ['halfRow', 'fullRow', 'twoRows', 'threeRows', 'fourRows'];
};

const getHeaderTextColor = (hex) => {
  if (!hex || hex[0] !== '#') return '#ffffff';
  const value = hex.slice(1);
  const full = value.length === 3 ? value.split('').map((item) => item + item).join('') : value.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000;
  return brightness > 160 ? '#0f172a' : '#ffffff';
};

const getShapeClipPath = (shape) => {
  const mask = SOCIAL_PANEL_SHAPE_MASKS[shape];
  if (!mask || shape === 'rectangle' || shape === 'square' || shape === 'wide' || shape === 'tall') {
    return 'none';
  }

  // Generate polygon points from mask
  // mask is array of rows (y), each row is array of cols (x)
  // 1 means filled
  
  let points = [];
  const rows = mask.length;
  const cols = mask[0].length;

  // Simple approach: trace the outline
  // This is a simplified trace for L, T, Z shapes
  // For more complex shapes, we might need a more robust algorithm
  
  if (shape === 'l-shape') {
    // [[1, 0], [1, 0], [1, 1]]
    return 'polygon(0% 0%, 33.3% 0%, 33.3% 66.6%, 100% 66.6%, 100% 100%, 0% 100%)';
  }
  
  if (shape === 't-shape') {
    // [[1, 1, 1], [0, 1, 0]]
    return 'polygon(0% 0%, 100% 0%, 100% 50%, 66.6% 50%, 66.6% 100%, 33.3% 100%, 33.3% 50%, 0% 50%)';
  }
  
  if (shape === 'z-shape') {
    // [[1, 1, 0], [0, 1, 1]]
    return 'polygon(0% 0%, 66.6% 0%, 66.6% 50%, 100% 50%, 100% 100%, 33.3% 100%, 33.3% 50%, 0% 50%)';
  }

  return 'none';
};

const StyleControl = ({ label, children }) => (
  <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
    <span>{label}</span>
    {children}
  </label>
);

const SocialEditablePanel = ({
  panelId,
  title,
  panel,
  isOwnerEditing,
  isInlineEditing,
  onToggleInlineEdit,
  onPanelChange,
  onMove,
  headerActions,
  children,
  className = '',
  contentClassName = '',
  style = {}
}) => {
  const resolvedStyles = panel?.resolvedStyles || panel?.styles || {};
  const headerTextColor = getHeaderTextColor(resolvedStyles.headerColor);
  const availableSizes = getAvailableSizes(panel?.area);
  const availableHeights = getAvailableHeights(panel?.area);

  const shapeClipPath = getShapeClipPath(panel?.shape);

  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 shadow-sm transition-all ${className}`}
      style={{
        ...style,
        backgroundColor: resolvedStyles.panelColor,
        color: resolvedStyles.fontColor,
        fontFamily: resolvedStyles.fontFamily,
        clipPath: shapeClipPath !== 'none' ? shapeClipPath : undefined,
      }}
      data-social-panel={panelId}
    >
      <div
        className="flex items-start justify-between gap-3 border-b border-black/5 px-4 py-3"
        style={{ backgroundColor: resolvedStyles.headerColor, color: headerTextColor }}
      >
        <div>
          <h3 className={`font-semibold tracking-tight ${getFontSizeClass(resolvedStyles.fontSizes?.header)}`}>
            {title || SOCIAL_PANEL_LABELS[panelId] || panelId}
          </h3>
          <p className={`opacity-90 ${getFontSizeClass(resolvedStyles.fontSizes?.small)}`}>
            {SOCIAL_AREA_LABELS[panel?.area] || panel?.area} • {SOCIAL_SIZE_LABELS[panel?.size] || panel?.size} • {SOCIAL_HEIGHT_LABELS[panel?.height] || panel?.height || '1 row'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          {isOwnerEditing ? (
            <button
              type="button"
              onClick={onToggleInlineEdit}
              className="rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-xs font-semibold hover:bg-white/20"
              aria-label={`Edit ${title || panelId}`}
            >
              ✎
            </button>
          ) : null}
        </div>
      </div>

      {isOwnerEditing && isInlineEditing ? (
        <div className="grid gap-3 border-b border-slate-200 bg-slate-50/90 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <StyleControl label="Panel color">
            <input type="color" value={resolvedStyles.panelColor} onChange={(event) => onPanelChange({ useCustomStyles: true, styles: { panelColor: event.target.value } })} />
          </StyleControl>
          <StyleControl label="Header color">
            <input type="color" value={resolvedStyles.headerColor} onChange={(event) => onPanelChange({ useCustomStyles: true, styles: { headerColor: event.target.value } })} />
          </StyleControl>
          <StyleControl label="Font family">
            <select
              value={resolvedStyles.fontFamily}
              onChange={(event) => onPanelChange({ useCustomStyles: true, styles: { fontFamily: event.target.value } })}
              className="rounded-lg border border-slate-200 px-2 py-1.5"
            >
              {SOCIAL_FONT_FAMILIES.map((fontFamily) => (
                <option key={fontFamily} value={fontFamily}>{fontFamily}</option>
              ))}
            </select>
          </StyleControl>
          <StyleControl label="Font color">
            <input type="color" value={resolvedStyles.fontColor} onChange={(event) => onPanelChange({ useCustomStyles: true, styles: { fontColor: event.target.value } })} />
          </StyleControl>
          {['header', 'subHeader', 'regular', 'small'].map((fontSizeKey) => (
            <StyleControl key={fontSizeKey} label={`${fontSizeKey} size`}>
              <select
                value={resolvedStyles.fontSizes?.[fontSizeKey] || 'base'}
                onChange={(event) => onPanelChange({
                  useCustomStyles: true,
                  styles: { fontSizes: { [fontSizeKey]: event.target.value } }
                })}
                className="rounded-lg border border-slate-200 px-2 py-1.5"
              >
                {SOCIAL_FONT_SIZE_TOKENS.map((token) => (
                  <option key={token} value={token}>{FONT_SIZE_LABELS[token]}</option>
                ))}
              </select>
            </StyleControl>
          ))}
          <StyleControl label="Layout area">
            <select
              value={panel.area}
              onChange={(event) => onPanelChange({ area: event.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-1.5"
            >
              {Object.entries(SOCIAL_AREA_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </StyleControl>
          <StyleControl label="Layout size">
            <select
              value={panel.size}
              onChange={(event) => onPanelChange({ size: event.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-1.5"
            >
              {availableSizes.map((value) => (
                <option key={value} value={value}>{SOCIAL_SIZE_LABELS[value]}</option>
              ))}
            </select>
          </StyleControl>
          <StyleControl label="Layout height">
            <select
              value={panel.height || 'fullRow'}
              onChange={(event) => onPanelChange({ height: event.target.value })}
              className="rounded-lg border border-slate-200 px-2 py-1.5"
            >
              {availableHeights.map((value) => (
                <option key={value} value={value}>{SOCIAL_HEIGHT_LABELS[value]}</option>
              ))}
            </select>
          </StyleControl>
          <div className="flex flex-col gap-2 text-xs font-medium text-slate-600">
            <span>Snapping</span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onMove(-1)} className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-white">↑ Move earlier</button>
              <button type="button" onClick={() => onMove(1)} className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-white">↓ Move later</button>
              <button type="button" onClick={() => onPanelChange({ visible: !(panel.visible !== false) })} className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-white">
                {panel.visible === false ? 'Show panel' : 'Hide panel'}
              </button>
              <button type="button" onClick={() => onPanelChange({ useCustomStyles: false })} className="rounded-lg border border-slate-200 px-2 py-1 hover:bg-white">
                Use global style
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className={`px-4 py-4 ${contentClassName} [&_button]:font-inherit [&_input]:font-inherit [&_select]:font-inherit [&_textarea]:font-inherit [&_p]:!text-inherit [&_span]:!text-inherit [&_li]:!text-inherit [&_a]:!text-inherit [&_h4]:!text-inherit [&_h5]:!text-inherit`}> 
        {children}
      </div>
    </section>
  );
};

export default SocialEditablePanel;
export { getPanelSpanClass };
