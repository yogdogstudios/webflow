/**
 * Webflow Staging Contrast Checker
 * Only active on *.webflow.io domains.
 *
 * Features:
 * - Hover any element → tooltip with full WCAG contrast report
 * - Solid colour backgrounds: computed directly
 * - CSS gradients: parsed and interpolated at element position
 * - Background images: fetched as blob → drawn to offscreen canvas → pixel-sampled
 * - Stacked backgrounds: composited in correct layer order
 * - Per-row: tag, text preview, FG hex, BG hex, ratio, AA, AAA, text size
 *
 * Version: 2.0.0
 */

(function () {
  'use strict';

  // ─── Guard: staging only ───────────────────────────────────────────────────
  if (!location.hostname.endsWith('.webflow.io')) return;

  // ─── WCAG thresholds ───────────────────────────────────────────────────────
  const WCAG = {
    AA_NORMAL:  4.5,
    AA_LARGE:   3.0,
    AAA_NORMAL: 7.0,
    AAA_LARGE:  4.5,
  };
  const LARGE_PX      = 18.66; // 18pt normal
  const LARGE_BOLD_PX = 14;    // 14pt bold

  // ─── Image cache: url → avg [r,g,b] per bounding rect key ─────────────────
  const imageCache = new Map(); // url → HTMLImageElement (drawn to canvas)

  // ══════════════════════════════════════════════════════════════════════════
  // COLOUR UTILITIES
  // ══════════════════════════════════════════════════════════════════════════

  function parseRgb(str) {
    if (!str || str === 'transparent' || str === 'none') return null;
    const m = str.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
    if (!m) return null;
    return [+m[1], +m[2], +m[3], m[4] !== undefined ? +m[4] : 1];
  }

  function linearise(c) {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }

  function luminance([r, g, b]) {
    return 0.2126 * linearise(r) + 0.7152 * linearise(g) + 0.0722 * linearise(b);
  }

  function contrastRatio(c1, c2) {
    const l1 = luminance(c1), l2 = luminance(c2);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }

  // Alpha-composite fg [r,g,b,a] over bg [r,g,b] → [r,g,b]
  function composite(fg, bg) {
    if (!fg || !bg) return bg || [255, 255, 255];
    const a = fg[3] !== undefined ? fg[3] : 1;
    if (a >= 1) return [fg[0], fg[1], fg[2]];
    return [
      Math.round(fg[0] * a + bg[0] * (1 - a)),
      Math.round(fg[1] * a + bg[1] * (1 - a)),
      Math.round(fg[2] * a + bg[2] * (1 - a)),
    ];
  }

  function toHex([r, g, b]) {
    return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }

  function lerpColor(c1, c2, t) {
    return [
      Math.round(c1[0] + (c2[0] - c1[0]) * t),
      Math.round(c1[1] + (c2[1] - c1[1]) * t),
      Math.round(c1[2] + (c2[2] - c1[2]) * t),
      (c1[3] !== undefined ? c1[3] : 1) + ((c2[3] !== undefined ? c2[3] : 1) - (c1[3] !== undefined ? c1[3] : 1)) * t,
    ];
  }

  // ══════════════════════════════════════════════════════════════════════════
  // GRADIENT PARSING
  // ══════════════════════════════════════════════════════════════════════════

  // Parse a CSS colour string → [r,g,b,a] (handles rgb, rgba, hex, named)
  function parseCssColor(str) {
    str = str.trim();
    // rgb/rgba
    const rgba = parseRgb(str);
    if (rgba) return rgba;
    // hex
    const hex3 = str.match(/^#([0-9a-f]{3})$/i);
    if (hex3) {
      const [, h] = hex3;
      return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16), 1];
    }
    const hex6 = str.match(/^#([0-9a-f]{6})$/i);
    if (hex6) {
      const h = hex6[1];
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), 1];
    }
    const hex8 = str.match(/^#([0-9a-f]{8})$/i);
    if (hex8) {
      const h = hex8[1];
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16), parseInt(h.slice(6,8),16)/255];
    }
    // Named colours via a temporary element
    try {
      const d = document.createElement('div');
      d.style.color = str;
      document.body.appendChild(d);
      const computed = getComputedStyle(d).color;
      document.body.removeChild(d);
      return parseRgb(computed);
    } catch (_) { return null; }
  }

  // Parse stop list from linear-gradient stops string
  // e.g. "red 0%, blue 100%"  or  "#fff, rgba(0,0,0,0.5) 50%"
  function parseGradientStops(stopsStr) {
    // Split by comma but not commas inside parens
    const parts = [];
    let depth = 0, current = '';
    for (const ch of stopsStr) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; }
      else current += ch;
    }
    if (current.trim()) parts.push(current.trim());

    const stops = [];
    parts.forEach((part, i) => {
      // colour + optional position
      const posMatch = part.match(/(\d+(?:\.\d+)?%|\d+(?:\.\d+)?px)$/);
      let pos = null;
      let colourStr = part;
      if (posMatch) {
        colourStr = part.slice(0, posMatch.index).trim();
        pos = posMatch[0].endsWith('%') ? parseFloat(posMatch[0]) / 100 : null; // px positions ignored for now
      }
      const colour = parseCssColor(colourStr);
      if (colour) stops.push({ colour, pos });
    });

    // Fill in missing positions
    stops.forEach((s, i) => {
      if (s.pos === null) {
        if (i === 0) s.pos = 0;
        else if (i === stops.length - 1) s.pos = 1;
      }
    });
    // Interpolate gaps
    let lastKnown = 0;
    for (let i = 1; i < stops.length - 1; i++) {
      if (stops[i].pos === null) {
        let nextKnown = i + 1;
        while (nextKnown < stops.length - 1 && stops[nextKnown].pos === null) nextKnown++;
        const endPos = stops[nextKnown].pos !== null ? stops[nextKnown].pos : 1;
        const startPos = stops[lastKnown].pos;
        const span = nextKnown - lastKnown;
        stops[i].pos = startPos + ((endPos - startPos) / span) * (i - lastKnown);
      } else {
        lastKnown = i;
      }
    }

    return stops;
  }

  // Sample a linear gradient at a fractional position t ∈ [0,1]
  function sampleGradientAtT(stops, t) {
    if (!stops || stops.length === 0) return null;
    if (stops.length === 1) return stops[0].colour;
    if (t <= stops[0].pos) return stops[0].colour;
    if (t >= stops[stops.length - 1].pos) return stops[stops.length - 1].colour;
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i].pos) {
        const prev = stops[i - 1];
        const curr = stops[i];
        const span = curr.pos - prev.pos;
        const local = span === 0 ? 0 : (t - prev.pos) / span;
        return lerpColor(prev.colour, curr.colour, local);
      }
    }
    return stops[stops.length - 1].colour;
  }

  // Parse a single CSS background-image value for a gradient
  // Returns sampled colour at element's centre relative to element rect, or null
  function sampleGradient(bgImageValue, elRect, containerRect) {
    // linear-gradient
    const linMatch = bgImageValue.match(/linear-gradient\((.+)\)$/s);
    if (linMatch) {
      const inner = linMatch[1].trim();
      // Extract angle/direction
      let angle = 180; // default: top to bottom
      let stopsStr = inner;
      const angleMatch = inner.match(/^(-?\d+(?:\.\d+)?deg|to\s+\w+(?:\s+\w+)?)\s*,\s*/i);
      if (angleMatch) {
        const a = angleMatch[1].trim().toLowerCase();
        if (a.endsWith('deg')) {
          angle = parseFloat(a);
        } else {
          const dirMap = {
            'to bottom': 180, 'to top': 0, 'to right': 90, 'to left': 270,
            'to bottom right': 135, 'to bottom left': 225,
            'to top right': 45, 'to top left': 315,
          };
          angle = dirMap[a] !== undefined ? dirMap[a] : 180;
        }
        stopsStr = inner.slice(angleMatch[0].length);
      }

      const stops = parseGradientStops(stopsStr);
      if (!stops.length) return null;

      // Find element centre relative to container
      const cx = elRect.left + elRect.width / 2 - (containerRect ? containerRect.left : 0);
      const cy = elRect.top + elRect.height / 2 - (containerRect ? containerRect.top : 0);
      const cw = containerRect ? containerRect.width  : window.innerWidth;
      const ch = containerRect ? containerRect.height : window.innerHeight;

      // Project centre onto gradient axis
      const rad = (angle - 90) * Math.PI / 180;
      const nx = Math.cos(rad), ny = Math.sin(rad);
      // Gradient line half-length
      const half = (Math.abs(nx) * cw + Math.abs(ny) * ch) / 2;
      const dot  = ((cx - cw / 2) * nx + (cy - ch / 2) * ny);
      const t    = half > 0 ? Math.max(0, Math.min(1, (dot + half) / (2 * half))) : 0.5;

      return sampleGradientAtT(stops, t);
    }

    // radial-gradient (simplified: sample at 50%)
    const radMatch = bgImageValue.match(/radial-gradient\((.+)\)$/s);
    if (radMatch) {
      const inner = radMatch[1].trim();
      // Strip shape/size/position preamble
      const stopsStr = inner.replace(/^(ellipse|circle)?(\s+\w+)?(\s+at\s+[\w\s%]+)?,\s*/i, '');
      const stops = parseGradientStops(stopsStr);
      if (!stops.length) return null;
      // Distance from centre of element to container centre
      const cx = elRect.left + elRect.width / 2 - (containerRect ? containerRect.left : 0);
      const cy = elRect.top + elRect.height / 2 - (containerRect ? containerRect.top : 0);
      const cw = containerRect ? containerRect.width  : window.innerWidth;
      const ch = containerRect ? containerRect.height : window.innerHeight;
      const dx = (cx - cw / 2) / (cw / 2);
      const dy = (cy - ch / 2) / (ch / 2);
      const t  = Math.min(1, Math.sqrt(dx * dx + dy * dy));
      return sampleGradientAtT(stops, t);
    }

    return null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // IMAGE SAMPLING VIA FETCH → CANVAS
  // ══════════════════════════════════════════════════════════════════════════

  // Returns a promise resolving to HTMLImageElement (from blob URL), cached by src URL
  async function fetchImageAsBlob(url) {
    if (imageCache.has(url)) return imageCache.get(url);

    const promise = (async () => {
      const resp = await fetch(url, { mode: 'cors', credentials: 'omit' });
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload  = () => resolve(img);
        img.onerror = reject;
        img.src = objectUrl;
      });
    })();

    imageCache.set(url, promise);
    return promise;
  }

  // Sample average colour of a background image within an element's bounding rect
  // bgImageUrl: the CSS url() value
  // elRect: element's bounding client rect
  // containerRect: the element that has the background-image applied
  async function sampleImageColor(bgImageUrl, elRect, containerEl) {
    const containerRect = containerEl.getBoundingClientRect();
    const img = await fetchImageAsBlob(bgImageUrl);

    const canvas = document.createElement('canvas');
    const SAMPLE = 64; // render at this size for performance
    canvas.width  = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext('2d');

    // Draw the background image covering the container (background-size: cover approximation)
    const iw = img.naturalWidth, ih = img.naturalHeight;
    const cw = containerRect.width, ch = containerRect.height;
    const scale = Math.max(cw / iw, ch / ih);
    const sw = iw * scale, sh = ih * scale;
    const ox = (cw - sw) / 2, oy = (ch - sh) / 2;

    // Normalise the element rect relative to the container
    const relX = elRect.left - containerRect.left;
    const relY = elRect.top  - containerRect.top;
    const relW = elRect.width;
    const relH = elRect.height;

    // Map to image pixels
    const srcX = ((relX - ox) / sw) * iw;
    const srcY = ((relY - oy) / sh) * ih;
    const srcW = (relW / sw) * iw;
    const srcH = (relH / sh) * ih;

    ctx.drawImage(img, srcX, srcY, Math.max(1, srcW), Math.max(1, srcH), 0, 0, SAMPLE, SAMPLE);

    const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;
    let r = 0, g = 0, b = 0, a = 0, count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]; g += data[i+1]; b += data[i+2]; a += data[i+3];
      count++;
    }
    return [Math.round(r/count), Math.round(g/count), Math.round(b/count), a/count/255];
  }

  // Extract URL from CSS url("...") or url(...)
  function extractUrl(str) {
    const m = str.match(/url\(['"]?([^'")\s]+)['"]?\)/);
    return m ? m[1] : null;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BACKGROUND RESOLUTION (async)
  // ══════════════════════════════════════════════════════════════════════════

  // Walk up the DOM, resolving background layers in order.
  // Returns { color: [r,g,b], warning: string|null }
  async function resolveBackground(el) {
    let base   = [255, 255, 255]; // fallback: white
    let warning = null;
    const elRect = el.getBoundingClientRect();

    const nodes = [];
    let node = el;
    while (node && node !== document.documentElement) {
      nodes.push(node);
      node = node.parentElement;
    }

    // Work from outermost inward, building up the composite
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const style = getComputedStyle(n);
      const nRect = n.getBoundingClientRect();

      // 1. Solid background-color
      const bgColor = parseRgb(style.backgroundColor);
      if (bgColor && bgColor[3] > 0) {
        base = composite(bgColor, base);
      }

      // 2. Background images / gradients (can be comma-separated list)
      const bgImage = style.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        // Split layers (outermost first in CSS = rendered last = on top)
        const layers = splitBgLayers(bgImage);
        // CSS layers are listed top-to-bottom, so reverse to composite from bottom up
        for (let j = layers.length - 1; j >= 0; j--) {
          const layer = layers[j].trim();
          if (layer === 'none') continue;

          if (layer.startsWith('linear-gradient') || layer.startsWith('radial-gradient')) {
            const colour = sampleGradient(layer, elRect, nRect);
            if (colour) {
              base = composite(colour, base);
            }
          } else if (layer.startsWith('url(')) {
            const imgUrl = extractUrl(layer);
            if (imgUrl) {
              try {
                const colour = await sampleImageColor(imgUrl, elRect, n);
                base = composite(colour, base);
              } catch (err) {
                if (err && err.message && err.message.includes('CORS')) {
                  warning = '⚠ Image BG: CORS blocked — estimate may be inaccurate';
                } else {
                  warning = '⚠ Image BG: could not sample — estimate may be inaccurate';
                }
              }
            }
          }
        }
      }
    }

    return { color: base, warning };
  }

  // Split CSS background-image layers by comma, respecting parentheses
  function splitBgLayers(str) {
    const layers = [];
    let depth = 0, current = '';
    for (const ch of str) {
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      if (ch === ',' && depth === 0) { layers.push(current.trim()); current = ''; }
      else current += ch;
    }
    if (current.trim()) layers.push(current.trim());
    return layers;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEXT / CONTRAST ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════

  function isLargeText(el) {
    const style = getComputedStyle(el);
    const px    = parseFloat(style.fontSize);
    const bold  = parseInt(style.fontWeight, 10) >= 700;
    return px >= LARGE_PX || (bold && px >= LARGE_BOLD_PX);
  }

  function wcagGrade(ratio, large) {
    const aa  = large ? WCAG.AA_LARGE  : WCAG.AA_NORMAL;
    const aaa = large ? WCAG.AAA_LARGE : WCAG.AAA_NORMAL;
    return {
      aa:    ratio >= aa,
      aaa:   ratio >= aaa,
      pass:  ratio >= aa,
      label: ratio >= aaa ? 'AAA' : ratio >= aa ? 'AA' : 'Fail',
    };
  }

  function getTextElements(root) {
    const results = [];
    const walker  = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    const visit   = (node) => {
      if (!node) return;
      if (node !== root) {
        const s = getComputedStyle(node);
        if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return;
        const hasDirectText = Array.from(node.childNodes).some(
          n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
        );
        if (hasDirectText) results.push(node);
      }
    };
    let node = walker.currentNode;
    while (node) { visit(node); node = walker.nextNode(); }
    const rootHasText = Array.from(root.childNodes).some(
      n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()
    );
    if (rootHasText && !results.includes(root)) results.unshift(root);
    return results;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TOOLTIP UI
  // ══════════════════════════════════════════════════════════════════════════

  function swatch(hex) {
    return `<span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${hex};border:1px solid rgba(255,255,255,.25);margin-right:4px;vertical-align:middle;flex-shrink:0;"></span>`;
  }

  function buildTooltipHTML(reports, globalWarning) {
    if (!reports || reports.length === 0) {
      return `<div style="padding:10px 12px;font-size:11px;color:#94a3b8;">No text elements found in this element.</div>`;
    }

    const passCount = reports.filter(r => r.pass).length;
    const failCount = reports.length - passCount;
    const summaryColor = failCount === 0 ? '#4ade80' : '#f87171';

    const rows = reports.map(r => {
      const ratioColor = r.pass ? '#4ade80' : '#f87171';
      const aaCell  = r.grade.aa  ? `<span style="color:#4ade80">AA ✓</span>`  : `<span style="color:#f87171">AA ✗</span>`;
      const aaaCell = r.grade.aaa ? `<span style="color:#4ade80">AAA ✓</span>` : `<span style="color:#64748b">AAA ✗</span>`;
      return `
        <tr style="border-top:1px solid rgba(255,255,255,.06);">
          <td style="padding:5px 8px;font-size:10px;color:#64748b;white-space:nowrap;font-family:monospace;">&lt;${r.tag}&gt;</td>
          <td style="padding:5px 8px;font-size:10px;color:#cbd5e1;max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${r.text || '—'}</td>
          <td style="padding:5px 8px;white-space:nowrap;">${swatch(r.fgHex)}<span style="font-size:10px;font-family:monospace;color:#e2e8f0;">${r.fgHex}</span></td>
          <td style="padding:5px 8px;white-space:nowrap;">${swatch(r.bgHex)}<span style="font-size:10px;font-family:monospace;color:#e2e8f0;">${r.bgHex}</span></td>
          <td style="padding:5px 8px;text-align:center;font-weight:700;font-size:11px;color:${ratioColor};white-space:nowrap;">${r.ratio}:1</td>
          <td style="padding:5px 8px;text-align:center;font-size:10px;">${aaCell}</td>
          <td style="padding:5px 8px;text-align:center;font-size:10px;">${aaaCell}</td>
          <td style="padding:5px 8px;text-align:center;font-size:10px;color:#64748b;">${r.large ? 'large' : 'normal'}</td>
        </tr>`;
    }).join('');

    const warningHtml = globalWarning
      ? `<div style="padding:5px 8px;font-size:10px;color:#fbbf24;border-top:1px solid rgba(255,255,255,.06);">${globalWarning}</div>`
      : '';

    return `
      <div style="padding:7px 10px 5px;border-bottom:1px solid rgba(255,255,255,.1);display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <span style="font-size:11px;font-weight:700;color:#f8fafc;letter-spacing:.05em;text-transform:uppercase;">Contrast Report</span>
        <span style="font-size:10px;color:${summaryColor};white-space:nowrap;">${passCount} pass · ${failCount} fail</span>
      </div>
      <div style="overflow:auto;max-height:300px;">
        <table style="border-collapse:collapse;width:100%;min-width:540px;">
          <thead>
            <tr>
              ${['Tag','Text','FG','BG','Ratio','AA','AAA','Size'].map(h =>
                `<th style="padding:4px 8px;font-size:9px;color:#475569;text-align:${['Ratio','AA','AAA','Size'].includes(h)?'center':'left'};font-weight:600;text-transform:uppercase;letter-spacing:.06em;white-space:nowrap;">${h}</th>`
              ).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${warningHtml}`;
  }

  // ─── Tooltip element ──────────────────────────────────────────────────────
  const tooltip = document.createElement('div');
  tooltip.setAttribute('id', '__cc-tooltip');
  Object.assign(tooltip.style, {
    position:      'fixed',
    zIndex:        '2147483647',
    background:    '#0f172a',
    border:        '1px solid rgba(255,255,255,.1)',
    borderRadius:  '10px',
    boxShadow:     '0 12px 40px rgba(0,0,0,.7)',
    fontFamily:    '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    pointerEvents: 'none',
    maxWidth:      '680px',
    minWidth:      '340px',
    display:       'none',
    opacity:       '0',
    transition:    'opacity .12s ease',
  });
  document.body.appendChild(tooltip);

  // ─── Loading state ────────────────────────────────────────────────────────
  function showLoading() {
    tooltip.innerHTML = `<div style="padding:12px 14px;font-size:11px;color:#64748b;display:flex;align-items:center;gap:8px;"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;border:2px solid #334155;border-top-color:#818cf8;animation:__cc-spin .6s linear infinite;"></span>Analysing…</div>`;
    if (!document.getElementById('__cc-spin-style')) {
      const s = document.createElement('style');
      s.id = '__cc-spin-style';
      s.textContent = '@keyframes __cc-spin{to{transform:rotate(360deg)}}';
      document.head.appendChild(s);
    }
    tooltip.style.display = 'block';
    tooltip.style.opacity = '1';
  }

  // ─── Outline ──────────────────────────────────────────────────────────────
  let lastOutlined = null;
  function outline(el) {
    if (lastOutlined && lastOutlined !== el) lastOutlined.style.outline = '';
    el.style.outline = '2px solid #818cf8';
    lastOutlined = el;
  }
  function clearOutline() {
    if (lastOutlined) { lastOutlined.style.outline = ''; lastOutlined = null; }
  }

  // ─── Position ────────────────────────────────────────────────────────────
  function positionTooltip(x, y) {
    const pad = 14;
    const tw  = tooltip.offsetWidth  || 540;
    const th  = tooltip.offsetHeight || 200;
    const vw  = window.innerWidth;
    const vh  = window.innerHeight;
    let left  = x + pad;
    let top   = y + pad;
    if (left + tw > vw - pad) left = x - tw - pad;
    if (top  + th > vh - pad) top  = y - th - pad;
    tooltip.style.left = Math.max(pad, left) + 'px';
    tooltip.style.top  = Math.max(pad, top)  + 'px';
  }

  // ─── Events ───────────────────────────────────────────────────────────────
  let hoverTimer   = null;
  let currentEl    = null;
  let abortController = null;

  document.addEventListener('mouseover', function (e) {
    const el = e.target;
    if (!el || el === tooltip || tooltip.contains(el)) return;
    if (el === currentEl) return;

    currentEl = el;
    clearTimeout(hoverTimer);
    if (abortController) abortController.abort();

    hoverTimer = setTimeout(async () => {
      outline(el);
      showLoading();
      positionTooltip(e.clientX, e.clientY);

      abortController = new AbortController();
      const signal = abortController.signal;

      try {
        const targets = getTextElements(el);
        const nodes   = targets.length > 0 ? targets : [el];

        // Resolve background once for the hovered element (shared for all children)
        const { color: bgColor, warning } = await resolveBackground(el);
        if (signal.aborted) return;

        const reports = nodes.map(n => {
          const style = getComputedStyle(n);
          const fgRaw = parseRgb(style.color);
          if (!fgRaw) return null;
          const fg    = composite(fgRaw, bgColor);
          const large = isLargeText(n);
          const ratio = contrastRatio(fg, bgColor);
          const g     = wcagGrade(ratio, large);
          const text  = n.textContent.trim();
          return {
            tag:   n.tagName.toLowerCase(),
            text:  text.slice(0, 45) + (text.length > 45 ? '…' : ''),
            fgHex: toHex(fg),
            bgHex: toHex(bgColor),
            ratio: ratio.toFixed(2),
            large,
            grade: g,
            pass:  g.pass,
          };
        }).filter(Boolean);

        if (signal.aborted) return;

        tooltip.innerHTML = buildTooltipHTML(reports, warning);
        positionTooltip(e.clientX, e.clientY);
      } catch (err) {
        if (signal.aborted) return;
        tooltip.innerHTML = `<div style="padding:10px 12px;font-size:11px;color:#f87171;">Error: ${err.message}</div>`;
      }
    }, 150);
  });

  document.addEventListener('mousemove', function (e) {
    if (tooltip.style.display === 'block') positionTooltip(e.clientX, e.clientY);
  });

  document.addEventListener('mouseout', function (e) {
    clearTimeout(hoverTimer);
    if (abortController) { abortController.abort(); abortController = null; }
    currentEl = null;
    tooltip.style.opacity = '0';
    setTimeout(() => { if (tooltip.style.opacity === '0') tooltip.style.display = 'none'; }, 120);
    clearOutline();
  });

  // ─── Active badge ─────────────────────────────────────────────────────────
  const badge = document.createElement('div');
  badge.textContent = '◈ Contrast Checker';
  Object.assign(badge.style, {
    position:      'fixed',
    bottom:        '16px',
    right:         '16px',
    zIndex:        '2147483646',
    background:    '#0f172a',
    color:         '#818cf8',
    border:        '1px solid rgba(129,140,248,.35)',
    borderRadius:  '6px',
    padding:       '5px 10px',
    fontSize:      '11px',
    fontFamily:    '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    fontWeight:    '600',
    letterSpacing: '.04em',
    pointerEvents: 'none',
    boxShadow:     '0 4px 16px rgba(0,0,0,.5)',
  });
  document.body.appendChild(badge);

})();
