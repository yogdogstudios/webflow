/**
 * YogDog DevTools Panel
 * Unified UI shell for staging utility tools.
 * Only active on *.webflow.io domains.
 *
 * Usage:
 *   Load this script before any utility scripts.
 *   Utilities self-register via: window.YogDevTools.register({ id, label, icon, init, destroy })
 *
 * Version: 1.0.0
 */

(function () {
  'use strict';

  if (!location.hostname.endsWith('.webflow.io')) return;
  if (window.YogDevTools) return; // already initialised

  // ─── Storage ──────────────────────────────────────────────────────────────
  const STORAGE_KEY = '__yog_devtools__';

  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
    catch (_) { return {}; }
  }

  function saveState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (_) {}
  }

  // ─── Registry ─────────────────────────────────────────────────────────────
  const tools    = []; // { id, label, icon, init, destroy, action? }
  let   state    = loadState(); // { [id]: boolean }
  let   panelOpen = false;

  // ─── Styles ───────────────────────────────────────────────────────────────
  const DARK  = '#0f172a';
  const BORDER = 'rgba(255,255,255,.1)';
  const ACCENT = '#818cf8';
  const TEXT   = '#e2e8f0';
  const MUTED  = '#64748b';
  const PASS   = '#4ade80';
  const FAIL   = '#f87171';

  const style = document.createElement('style');
  style.textContent = `
    #__yog-trigger {
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%);
      z-index: 2147483645;
      width: 36px;
      height: 36px;
      background: ${DARK};
      border: 1px solid ${BORDER};
      border-right: none;
      border-radius: 8px 0 0 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: -4px 0 16px rgba(0,0,0,.4);
      transition: background .15s ease, width .15s ease;
    }
    #__yog-trigger:hover { background: #1e293b; width: 40px; }
    #__yog-trigger svg { flex-shrink: 0; transition: transform .4s ease; }
    #__yog-trigger.open svg { transform: rotate(60deg); }

    #__yog-panel {
      position: fixed;
      right: 0;
      top: 50%;
      transform: translateY(-50%) translateX(100%);
      z-index: 2147483644;
      width: 260px;
      background: ${DARK};
      border: 1px solid ${BORDER};
      border-right: none;
      border-radius: 12px 0 0 12px;
      box-shadow: -8px 0 32px rgba(0,0,0,.6);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      transition: transform .22s cubic-bezier(.4,0,.2,1);
      overflow: hidden;
    }
    #__yog-panel.open {
      transform: translateY(-50%) translateX(0);
    }

    .__yog-header {
      padding: 10px 14px;
      border-bottom: 1px solid ${BORDER};
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .__yog-header-label {
      font-size: 11px;
      font-weight: 700;
      color: ${TEXT};
      letter-spacing: .06em;
      text-transform: uppercase;
      flex: 1;
    }
    .__yog-header-badge {
      font-size: 9px;
      color: ${ACCENT};
      background: rgba(129,140,248,.12);
      border: 1px solid rgba(129,140,248,.25);
      border-radius: 4px;
      padding: 2px 5px;
      letter-spacing: .04em;
    }

    .__yog-tool-row {
      padding: 10px 14px;
      border-bottom: 1px solid rgba(255,255,255,.05);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .__yog-tool-row:last-child { border-bottom: none; }

    .__yog-tool-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: rgba(255,255,255,.05);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .__yog-tool-info { flex: 1; min-width: 0; }
    .__yog-tool-label {
      font-size: 11px;
      font-weight: 600;
      color: ${TEXT};
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .__yog-tool-desc {
      font-size: 10px;
      color: ${MUTED};
      margin-top: 1px;
    }

    .__yog-tool-actions {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    /* Toggle switch */
    .__yog-toggle {
      position: relative;
      width: 32px;
      height: 18px;
      flex-shrink: 0;
    }
    .__yog-toggle input { opacity: 0; width: 0; height: 0; position: absolute; }
    .__yog-toggle-track {
      position: absolute;
      inset: 0;
      background: rgba(255,255,255,.1);
      border-radius: 9px;
      cursor: pointer;
      transition: background .2s ease;
    }
    .__yog-toggle input:checked + .__yog-toggle-track { background: ${ACCENT}; }
    .__yog-toggle-track::after {
      content: '';
      position: absolute;
      left: 2px;
      top: 2px;
      width: 14px;
      height: 14px;
      background: #fff;
      border-radius: 50%;
      transition: transform .2s ease;
    }
    .__yog-toggle input:checked + .__yog-toggle-track::after { transform: translateX(14px); }

    /* Action button (e.g. "Run") */
    .__yog-action-btn {
      font-size: 10px;
      font-weight: 600;
      color: ${ACCENT};
      background: rgba(129,140,248,.1);
      border: 1px solid rgba(129,140,248,.25);
      border-radius: 4px;
      padding: 3px 8px;
      cursor: pointer;
      white-space: nowrap;
      transition: background .15s ease;
      line-height: 1.4;
    }
    .__yog-action-btn:hover { background: rgba(129,140,248,.2); }
    .__yog-action-btn:disabled { opacity: .4; cursor: default; }

    /* Status dot */
    .__yog-status {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${MUTED};
      flex-shrink: 0;
      transition: background .2s ease;
    }
    .__yog-status.pass { background: ${PASS}; }
    .__yog-status.fail { background: ${FAIL}; }

    .__yog-footer {
      padding: 8px 14px;
      border-top: 1px solid ${BORDER};
      font-size: 9px;
      color: ${MUTED};
      letter-spacing: .04em;
      text-align: center;
    }
  `;
  document.head.appendChild(style);

  // ─── Trigger button ───────────────────────────────────────────────────────
  const trigger = document.createElement('button');
  trigger.id = '__yog-trigger';
  trigger.setAttribute('aria-label', 'YogDog DevTools');
  trigger.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2"/>
    </svg>`;
  document.body.appendChild(trigger);

  // ─── Panel ────────────────────────────────────────────────────────────────
  const panel = document.createElement('div');
  panel.id = '__yog-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'YogDog DevTools');
  document.body.appendChild(panel);

  function renderPanel() {
    const rows = tools.map(tool => {
      const enabled = !!state[tool.id];
      const statusClass = tool._status || '';
      return `
        <div class="__yog-tool-row">
          <div class="__yog-tool-icon">${tool.icon || defaultIcon()}</div>
          <div class="__yog-tool-info">
            <div class="__yog-tool-label">${tool.label}</div>
            ${tool.desc ? `<div class="__yog-tool-desc">${tool.desc}</div>` : ''}
          </div>
          <div class="__yog-tool-actions">
            ${tool.action ? `<button class="__yog-action-btn" data-action="${tool.id}" ${!enabled ? 'disabled' : ''}>${tool.action.label}</button>` : ''}
            <div class="__yog-status ${statusClass}" id="__yog-status-${tool.id}"></div>
            <label class="__yog-toggle" aria-label="Toggle ${tool.label}">
              <input type="checkbox" data-tool="${tool.id}" ${enabled ? 'checked' : ''}>
              <div class="__yog-toggle-track"></div>
            </label>
          </div>
        </div>`;
    }).join('');

    panel.innerHTML = `
      <div class="__yog-header">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        </svg>
        <span class="__yog-header-label">DevTools</span>
        <span class="__yog-header-badge">Staging</span>
      </div>
      ${rows || `<div style="padding:14px;font-size:11px;color:${MUTED};text-align:center;">No tools registered</div>`}
      <div class="__yog-footer">yogdog.com · staging only</div>`;

    // Toggle listeners
    panel.querySelectorAll('input[data-tool]').forEach(input => {
      input.addEventListener('change', () => {
        const id = input.dataset.tool;
        const tool = tools.find(t => t.id === id);
        if (!tool) return;
        state[id] = input.checked;
        saveState(state);
        if (input.checked) {
          tool.init && tool.init();
        } else {
          tool.destroy && tool.destroy();
          setStatus(id, '');
        }
        // Update action button disabled state
        const btn = panel.querySelector(`[data-action="${id}"]`);
        if (btn) btn.disabled = !input.checked;
      });
    });

    // Action button listeners
    panel.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.action;
        const tool = tools.find(t => t.id === id);
        if (tool && tool.action && tool.action.run) tool.action.run();
      });
    });
  }

  function defaultIcon() {
    return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${MUTED}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`;
  }

  // ─── Status API ───────────────────────────────────────────────────────────
  function setStatus(id, status) {
    const dot = document.getElementById(`__yog-status-${id}`);
    if (dot) {
      dot.className = `__yog-status${status ? ' ' + status : ''}`;
    }
    const tool = tools.find(t => t.id === id);
    if (tool) tool._status = status;
  }

  // ─── Toggle panel ─────────────────────────────────────────────────────────
  function togglePanel() {
    panelOpen = !panelOpen;
    if (panelOpen) {
      renderPanel();
      panel.classList.add('open');
      trigger.classList.add('open');
      // Offset trigger to clear panel
      trigger.style.right = '260px';
    } else {
      panel.classList.remove('open');
      trigger.classList.remove('open');
      trigger.style.right = '0';
    }
  }

  trigger.addEventListener('click', togglePanel);

  // Close on outside click
  document.addEventListener('mousedown', function (e) {
    if (panelOpen && !panel.contains(e.target) && e.target !== trigger) {
      panelOpen = false;
      panel.classList.remove('open');
      trigger.classList.remove('open');
      trigger.style.right = '0';
    }
  });

  // ─── Public API ───────────────────────────────────────────────────────────
  window.YogDevTools = {
    /**
     * Register a tool.
     * @param {object} opts
     * @param {string}   opts.id       Unique identifier
     * @param {string}   opts.label    Display name
     * @param {string}   [opts.desc]   Short description
     * @param {string}   [opts.icon]   SVG string for icon
     * @param {Function} [opts.init]   Called when tool is enabled
     * @param {Function} [opts.destroy] Called when tool is disabled
     * @param {object}   [opts.action] { label: string, run: Function } — optional action button
     */
    register(opts) {
      if (tools.find(t => t.id === opts.id)) return; // prevent duplicate registration
      tools.push({ ...opts, _status: '' });
      // Auto-init if previously enabled
      if (state[opts.id] && opts.init) {
        opts.init();
      }
      // Re-render if panel is open
      if (panelOpen) renderPanel();
    },

    /** Set the status dot for a tool: '' | 'pass' | 'fail' */
    setStatus,

    /** Programmatically open or close the panel */
    open()  { if (!panelOpen) togglePanel(); },
    close() { if (panelOpen)  togglePanel(); },
  };

})();
