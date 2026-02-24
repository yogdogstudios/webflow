/**
 * External Link Handler
 * Auto-adds target="_blank" and rel="noopener noreferrer" to external links
 * Skips same-domain and subdomain links
 */
document.addEventListener("DOMContentLoaded", () => {
  const domain = window.location.hostname;

  document.querySelectorAll("a[href]").forEach((link) => {
    try {
      const url = new URL(link.href);
      if (
        url.hostname &&
        url.hostname !== domain &&
        !url.hostname.endsWith("." + domain)
      ) {
        link.setAttribute("target", "_blank");
        link.setAttribute("rel", "noopener noreferrer");
      }
    } catch (e) {}
  });
});
