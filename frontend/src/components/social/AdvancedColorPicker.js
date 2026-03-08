import React, { useState, useEffect, useRef } from 'react';

const AdvancedColorPicker = ({ value, onChange, label = 'Color' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState('hex'); // hex, rgb, hsl
  const [recentColors, setRecentColors] = useState(() => {
    const saved = localStorage.getItem('recentColors');
    return saved ? JSON.parse(saved) : ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'];
  });

  const [hexInput, setHexInput] = useState(value || '#000000');
  const [rgb, setRgb] = useState({ r: 0, g: 0, b: 0 });
  const [hsl, setHsl] = useState({ h: 0, s: 0, l: 0 });
  const [opacity, setOpacity] = useState(100);
  const pickerRef = useRef(null);

  useEffect(() => {
    if (value) {
      setHexInput(value);
      const rgbVal = hexToRgb(value);
      if (rgbVal) setRgb(rgbVal);
      const hslVal = rgbToHsl(rgbVal.r, rgbVal.g, rgbVal.b);
      if (hslVal) setHsl(hslVal);
    }
  }, [value]);

  const hexToRgb = (hex) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };

  const rgbToHex = (r, g, b) => {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  };

  const rgbToHsl = (r, g, b) => {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        default: break;
      }
      h /= 6;
    }
    return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
  };

  const hslToRgb = (h, s, l) => {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  };

  const handleHexChange = (newHex) => {
    setHexInput(newHex);
    if (/^#[0-9A-F]{6}$/i.test(newHex)) {
      const rgbVal = hexToRgb(newHex);
      setRgb(rgbVal);
      setHsl(rgbToHsl(rgbVal.r, rgbVal.g, rgbVal.b));
      updateColor(newHex);
    }
  };

  const handleRgbChange = (channel, val) => {
    const newRgb = { ...rgb, [channel]: Math.min(255, Math.max(0, parseInt(val) || 0)) };
    setRgb(newRgb);
    const hex = rgbToHex(newRgb.r, newRgb.g, newRgb.b);
    setHexInput(hex);
    setHsl(rgbToHsl(newRgb.r, newRgb.g, newRgb.b));
    updateColor(hex);
  };

  const handleHslChange = (channel, val) => {
    const newHsl = { ...hsl, [channel]: Math.min(100, Math.max(0, parseInt(val) || 0)) };
    setHsl(newHsl);
    const rgbVal = hslToRgb(newHsl.h, newHsl.s, newHsl.l);
    setRgb(rgbVal);
    const hex = rgbToHex(rgbVal.r, rgbVal.g, rgbVal.b);
    setHexInput(hex);
    updateColor(hex);
  };

  const updateColor = (hex) => {
    const hexWithOpacity = opacity < 100 ? hex + Math.round((opacity / 100) * 255).toString(16).padStart(2, '0') : hex;
    onChange(hexWithOpacity);
    
    // Add to recent colors
    if (!recentColors.includes(hex)) {
      const newRecent = [hex, ...recentColors.slice(0, 4)];
      setRecentColors(newRecent);
      localStorage.setItem('recentColors', JSON.stringify(newRecent));
    }
  };

  const handleEyedropper = async () => {
    if (!window.EyeDropper) {
      alert('EyeDropper API not supported in this browser');
      return;
    }
    try {
      const result = await window.EyeDropper.open();
      handleHexChange(result.sRGBHex);
    } catch (e) {
      // User cancelled
    }
  };

  return (
    <div className="relative">
      <label className="mb-1 block text-xs font-semibold text-slate-700">{label}</label>
      <div className="flex items-center gap-2">
        <div 
          className="h-8 w-8 cursor-pointer rounded-lg border border-slate-300 shadow-sm"
          style={{ backgroundColor: value }}
          onClick={() => setIsOpen(!isOpen)}
        />
        <input 
          type="text" 
          value={hexInput}
          onChange={(e) => handleHexChange(e.target.value)}
          className="flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-mono uppercase"
        />
      </div>

      {isOpen && (
        <div 
          ref={pickerRef}
          className="absolute z-50 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="mb-3 flex gap-1 border-b border-slate-100 pb-2">
            {['hex', 'rgb', 'hsl'].map(m => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-md px-2 py-1 text-xs font-semibold uppercase ${mode === m ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {m}
              </button>
            ))}
          </div>

          {mode === 'hex' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input 
                  type="text" 
                  value={hexInput}
                  onChange={(e) => handleHexChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs font-mono uppercase"
                />
              </div>
              <div className="grid grid-cols-5 gap-1">
                {recentColors.map((color, i) => (
                  <button 
                    key={i}
                    className="h-6 w-6 rounded border border-slate-200"
                    style={{ backgroundColor: color }}
                    onClick={() => handleHexChange(color)}
                  />
                ))}
              </div>
            </div>
          )}

          {mode === 'rgb' && (
            <div className="space-y-2">
              {['r', 'g', 'b'].map(channel => (
                <div key={channel} className="flex items-center gap-2">
                  <span className="w-4 text-xs font-bold uppercase text-slate-500">{channel}</span>
                  <input 
                    type="range" min="0" max="255" 
                    value={rgb[channel]} 
                    onChange={(e) => handleRgbChange(channel, e.target.value)}
                    className="flex-1"
                  />
                  <input 
                    type="number" min="0" max="255"
                    value={rgb[channel]}
                    onChange={(e) => handleRgbChange(channel, e.target.value)}
                    className="w-12 rounded border border-slate-200 px-1 py-0.5 text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          {mode === 'hsl' && (
            <div className="space-y-2">
              {['h', 's', 'l'].map(channel => (
                <div key={channel} className="flex items-center gap-2">
                  <span className="w-4 text-xs font-bold uppercase text-slate-500">{channel}</span>
                  <input 
                    type="range" 
                    min="0" max={channel === 'h' ? 360 : 100} 
                    value={hsl[channel]} 
                    onChange={(e) => handleHslChange(channel, e.target.value)}
                    className="flex-1"
                  />
                  <input 
                    type="number" 
                    min="0" max={channel === 'h' ? 360 : 100}
                    value={hsl[channel]}
                    onChange={(e) => handleHslChange(channel, e.target.value)}
                    className="w-12 rounded border border-slate-200 px-1 py-0.5 text-xs"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 border-t border-slate-100 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-600">Opacity</span>
              <span className="text-xs text-slate-500">{opacity}%</span>
            </div>
            <input 
              type="range" min="0" max="100" 
              value={opacity} 
              onChange={(e) => setOpacity(parseInt(e.target.value))}
              className="w-full"
            />
          </div>

          <button 
            onClick={handleEyedropper}
            className="mt-2 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100"
          >
            🎯 Pick from screen
          </button>
        </div>
      )}
    </div>
  );
};

export default AdvancedColorPicker;
