declare global {
  interface Window {
    dataLayer: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const measurementId = (() => {
  const host = window.location.hostname.toLowerCase();
  if (host === 'eks.trumpcard.online') return 'G-7DV0VP26EG';
  if (host === 'trumpcard.online' || host === 'www.trumpcard.online') return 'G-4TPMGJNGMH';
  return null;
})();

export function initAnalytics() {
  if (!measurementId || window.gtag) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = (...args: unknown[]) => window.dataLayer.push(args);
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false });

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

export function trackPageView(path: string) {
  if (!measurementId) return;
  window.gtag?.('event', 'page_view', {
    page_path: path,
    page_location: window.location.href,
    page_title: document.title,
  });
}

export {};
