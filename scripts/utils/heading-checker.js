/**
 * Heading Hierarchy Checker
 * Validates heading levels and reports issues.
 * Only active on *.webflow.io domains.
 * Registers with YogDevTools panel if available; falls back to auto-init.
 *
 * Outputs:
 * - Console: grouped report with pass/fail per heading (always)
 * - Panel: inline results list in DevTools panel when run via "Run" button
 *
 * Version: 2.0.0
 */

(function () {
  'use strict';

  if (!location.hostname.endsWith('.webflow.io')) return;

  // ══════════════════════════════════════════════════════════════════════════
  // ANALYSIS
  // ══════════════════════════════════════════════════════════════════════════

  function analyse() {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'));
    const h1Count  = document.querySelectorAll('h1').length;
    let prevLevel  = 0;
    let hasErrors  = false;
    const results  = [];

    if (h1Count === 0) {
      results.push({ error: true, msg: 'No h1 found on page', el: null });
      hasErrors = true;
    } else if (h1Count > 1) {
      results.push({ error: true, msg: `Multiple h1s found (${h1Count})`, el: null });
      hasErrors = true;
    }

    headings.forEach(heading => {
      const level   = parseInt(heading.tagName[1], 10);
      const text    = heading.textContent.trim().slice(0, 60);
      const skipped = prevLevel > 0 && level - prevLevel > 1;

      if (skipped) hasErrors = true;

      results.push({
        error: skipped,
        tag:   heading.tagName.toLowerCase(),
        text,
        msg: skipped
          ? `<${heading.tagName.toLowerCase()}> "${text}" — skipped from h${prevLevel}`
          : `<${heading.tagName.toLowerCase()}> "${text}"`,
        el: heading,
      });

      prevLevel = level;
    });

    return { results, hasErrors, total: headings.length };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSOLE OUTPUT
  // ══════════════════════════════════════════════════════════════════════════

  function consoleReport(results, hasErrors) {
    const label = hasErrors
      ? '❌ Heading Hierarchy — issues found'
      : '✅ Heading Hierarchy — all good';

    console.groupCollapsed(
      `%c ${label} `,
      `background:${hasErrors ? '#dc2626' : '#16a34a'};color:#fff;padding:4px 8px;border-radius:4px;font-weight:bold;`
    );
    results.forEach(r => {
      const icon = r.error ? '❌' : '✅';
      if (r.el) {
        console[r.error ? 'warn' : 'log'](`${icon} ${r.msg}`, r.el);
      } else {
        console[r.error ? 'warn' : 'log'](`${icon} ${r.msg}`);
      }
    });
    console.groupEnd();
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PANEL INLINE OUTPUT
  // ══════════════════════════════════════════════════════════════════════════

  let inlineContainer = null;

  function renderInline(results, hasErrors) {
    if (!inlineContainer) return;

    const passColor = '#4ade80';
    const failColor = '#f87171';
    const mutedColor = '#64748b';

    const rows = results.map(r => {
      const color = r.error ? failColor : (r.el ? passColor : failColor);
      const icon  = r.error ? '✗' : (r.el ? '✓' : '✗');
      const tag   = r.tag ? `<span style="font-family:monospace;color:${mutedColor};">&lt;${r.tag}&gt;</span> ` : '';
      return `<div style="display:flex;align-items:baseline;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,.04);">
        <span style="color:${color};font-size:10px;flex-shrink:0;">${icon}</span>
        <span style="font-size:10px;color:#cbd5e1;line-height:1.4;">${tag}${r.text || r.msg}</span>
      </div>`;
    }).join('');

    const summary = hasErrors
      ? `<span style="color:${failColor}">Issues found</span>`
      : `<span style="color:${passColor}">All good</span>`;

    inlineContainer.innerHTML = `
      <div style="padding:8px 14px;border-top:1px solid rgba(255,255,255,.06);">
        <div style="font-size:10px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px;">
          Heading Report · ${summary}
        </div>
        <div style="max-height:180px;overflow-y:auto;">${rows}</div>
      </div>`;
  }

  function clearInline() {
    if (inlineContainer) inlineContainer.innerHTML = '';
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RUN (both outputs)
  // ══════════════════════════════════════════════════════════════════════════

  function run() {
    const { results, hasErrors } = analyse();
    consoleReport(results, hasErrors);
    renderInline(results, hasErrors);
    if (window.YogDevTools) {
      window.YogDevTools.setStatus('heading-checker', hasErrors ? 'fail' : 'pass');
    }
    return { results, hasErrors };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INIT / DESTROY
  // ══════════════════════════════════════════════════════════════════════════

  let active = false;

  function init() {
    if (active) return;
    active = true;
    // Auto-run on init so the panel shows state immediately
    document.addEventListener('DOMContentLoaded', run);
    // If DOM already loaded
    if (document.readyState !== 'loading') run();
  }

  function destroy() {
    active = false;
    clearInline();
    if (window.YogDevTools) window.YogDevTools.setStatus('heading-checker', '');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // REGISTER WITH DEVTOOLS PANEL
  // ══════════════════════════════════════════════════════════════════════════

  const ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#818cf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h10M4 18h6"/></svg>`;

  function register() {
    // Create inline result container that lives inside the panel row
    inlineContainer = document.createElement('div');

    window.YogDevTools.register({
      id:    'heading-checker',
      label: 'Heading Checker',
      desc:  'Hierarchy · console + panel',
      icon:  ICON,
      init,
      destroy,
      action: { label: 'Run', run },
    });

    // Append inline container after the tool row renders
    // Panel re-renders on register, so we inject after a tick
    setTimeout(() => {
      const panel = document.getElementById('__yog-panel');
      if (panel) {
        const row = panel.querySelector('[data-action="heading-checker"]');
        if (row) {
          const toolRow = row.closest('.__yog-tool-row');
          if (toolRow) toolRow.insertAdjacentElement('afterend', inlineContainer);
        }
      }
    }, 50);
  }

  if (window.YogDevTools) {
    register();
  } else {
    // Panel not loaded — auto-init on DOMContentLoaded (legacy behaviour)
    document.addEventListener('DOMContentLoaded', () => {
      run();
    });
    window.addEventListener('yog:devtools:ready', register);
  }

})();
