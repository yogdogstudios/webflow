/**
 * Heading Hierarchy Checker
 * Staging-only tool that validates heading levels and reports issues
 * Requires: data-heading-check="true" on <body>
 * Only runs on .webflow.io staging URLs
 */
if (window.location.hostname.includes(".webflow.io")) {
  document.addEventListener("DOMContentLoaded", () => {
    if (document.body.dataset.headingCheck !== "true") return;

    const headings = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
    const h1Count = document.querySelectorAll("h1").length;
    let prevLevel = 0;
    let hasErrors = false;
    const results = [];

    // Check h1 count
    if (h1Count === 0) {
      results.push({ error: true, msg: "❌ No h1 found on page" });
      hasErrors = true;
    }
    if (h1Count > 1) {
      results.push({
        error: true,
        msg: `❌ Multiple h1s found: ${h1Count}`,
      });
      hasErrors = true;
    }

    // Check hierarchy
    headings.forEach((heading) => {
      const level = parseInt(heading.tagName[1]);
      const text = heading.textContent.trim().slice(0, 60);
      const skipped = prevLevel > 0 && level - prevLevel > 1;

      if (skipped) hasErrors = true;

      results.push({
        error: skipped,
        msg: skipped
          ? `❌ <${heading.tagName.toLowerCase()}> "${text}" — skipped from h${prevLevel}`
          : `✅ <${heading.tagName.toLowerCase()}> "${text}"`,
        el: heading,
      });

      prevLevel = level;
    });

    const label = hasErrors
      ? "❌ Heading Hierarchy — issues found"
      : "✅ Heading Hierarchy — no issues";

    console.groupCollapsed(
      `%c ${label} `,
      `background: ${hasErrors ? "#dc2626" : "#16a34a"}; color: #fff; padding: 4px 8px; border-radius: 4px; font-weight: bold;`
    );
    results.forEach((r) => {
      if (r.el) {
        console[r.error ? "warn" : "log"](r.msg, r.el);
      } else {
        console[r.error ? "warn" : "log"](r.msg);
      }
    });
    console.groupEnd();
  });
}
