/**
 * EventAtlas Capture - Site Analyzer (MAIN world)
 *
 * Runs in the page's JavaScript context to intercept network requests
 * and detect API endpoints. Communicates with the ISOLATED world
 * content script via window.postMessage.
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',

  main() {
    const CHANNEL = 'eventatlas-site-analyzer';

    interface InterceptedRequest {
      method: string;
      url: string;
      type: 'fetch' | 'xhr';
      timestamp: number;
    }

    const interceptedRequests: InterceptedRequest[] = [];
    const MAX_REQUESTS = 200;

    /**
     * Normalize a URL for deduplication (strip query params for grouping)
     */
    function getEndpointBase(url: string): string {
      try {
        const u = new URL(url, window.location.origin);
        // Remove common varying segments (IDs) for grouping
        return u.origin + u.pathname;
      } catch {
        return url;
      }
    }

    /**
     * Check if a URL is worth tracking (skip static assets, analytics, etc.)
     */
    function isRelevantRequest(url: string): boolean {
      try {
        const u = new URL(url, window.location.origin);
        const path = u.pathname.toLowerCase();
        const host = u.hostname.toLowerCase();

        // Skip common non-API resources
        const skipExtensions = [
          '.js',
          '.css',
          '.png',
          '.jpg',
          '.jpeg',
          '.gif',
          '.svg',
          '.ico',
          '.woff',
          '.woff2',
          '.ttf',
          '.eot',
          '.map',
          '.webp',
          '.avif',
        ];
        if (skipExtensions.some((ext) => path.endsWith(ext))) return false;

        // Skip common analytics/tracking domains
        const skipDomains = [
          'google-analytics.com',
          'googletagmanager.com',
          'facebook.net',
          'doubleclick.net',
          'analytics.',
          'cdn.',
          'fonts.googleapis.com',
          'fonts.gstatic.com',
          'sentry.io',
          'hotjar.com',
          'clarity.ms',
          'newrelic.com',
          'segment.io',
          'mixpanel.com',
          'amplitude.com',
        ];
        if (skipDomains.some((d) => host.includes(d))) return false;

        return true;
      } catch {
        return false;
      }
    }

    function addRequest(req: InterceptedRequest): void {
      if (interceptedRequests.length < MAX_REQUESTS) {
        interceptedRequests.push(req);
      }
    }

    // ========================================================================
    // Hook fetch()
    // ========================================================================
    const originalFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
      const input = args[0];
      const init = args[1];
      let method = init?.method?.toUpperCase() || 'GET';
      let url = '';

      if (typeof input === 'string') {
        url = input;
      } else if (input instanceof URL) {
        url = input.href;
      } else if (input instanceof Request) {
        url = input.url;
        method = input.method?.toUpperCase() || method;
      }

      if (url && isRelevantRequest(url)) {
        addRequest({ method, url, type: 'fetch', timestamp: Date.now() });
      }

      return originalFetch.apply(this, args);
    };

    // ========================================================================
    // Hook XMLHttpRequest
    // ========================================================================
    const originalOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ): void {
      (this as XMLHttpRequest & { _eaMethod: string; _eaUrl: string })._eaMethod =
        method.toUpperCase();
      (this as XMLHttpRequest & { _eaMethod: string; _eaUrl: string })._eaUrl =
        typeof url === 'string' ? url : url.toString();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalOpen as any).call(this, method, url, ...rest);
    };

    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (...args: unknown[]): void {
      const xhr = this as XMLHttpRequest & { _eaMethod?: string; _eaUrl?: string };
      if (xhr._eaUrl && isRelevantRequest(xhr._eaUrl)) {
        addRequest({
          method: xhr._eaMethod || 'GET',
          url: xhr._eaUrl,
          type: 'xhr',
          timestamp: Date.now(),
        });
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (originalSend as any).apply(this, args);
    };

    // ========================================================================
    // Listen for analysis requests from ISOLATED world
    // ========================================================================
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.channel !== CHANNEL) return;

      if (event.data.action === 'getInterceptedRequests') {
        // Deduplicate and group by endpoint
        const endpointMap = new Map<
          string,
          { methods: Set<string>; count: number; urls: string[] }
        >();

        for (const req of interceptedRequests) {
          const base = getEndpointBase(req.url);
          const existing = endpointMap.get(base);
          if (existing) {
            existing.methods.add(req.method);
            existing.count++;
            if (existing.urls.length < 3) existing.urls.push(req.url);
          } else {
            endpointMap.set(base, {
              methods: new Set([req.method]),
              count: 1,
              urls: [req.url],
            });
          }
        }

        const endpoints = Array.from(endpointMap.entries())
          .map(([base, data]) => ({
            endpoint: base,
            methods: Array.from(data.methods),
            count: data.count,
            sampleUrls: data.urls,
          }))
          .sort((a, b) => b.count - a.count);

        window.postMessage(
          {
            channel: CHANNEL,
            action: 'interceptedRequests',
            data: {
              totalRequests: interceptedRequests.length,
              endpoints,
            },
          },
          '*'
        );
      }

      if (event.data.action === 'getWindowProperties') {
        // Check for known anti-bot / framework window properties
        const properties: Record<string, string> = {};
        const checks: Record<string, string> = {
          // Anti-bot
          _cf_chl_opt: 'Cloudflare Challenge',
          turnstile: 'Cloudflare Turnstile',
          __cf_chl_ctx: 'Cloudflare Challenge Context',
          grecaptcha: 'Google reCAPTCHA',
          ___grecaptcha_cfg: 'Google reCAPTCHA Config',
          hcaptcha: 'hCaptcha',
          bmak: 'Akamai Bot Manager',
          _pxAppId: 'PerimeterX',
          _Incapsula: 'Imperva/Incapsula',
          datadome: 'DataDome',

          // Frameworks
          __NEXT_DATA__: 'Next.js',
          __NUXT__: 'Nuxt.js',
          __GATSBY: 'Gatsby',
          __remixContext: 'Remix',
          Shopify: 'Shopify',
          Webflow: 'Webflow',
          squarespace: 'Squarespace',
          wp: 'WordPress',
          angular: 'Angular',
          __SVELTE_HMR: 'Svelte',

          // State / data
          __APOLLO_STATE__: 'Apollo GraphQL',
          __RELAY_STORE__: 'Relay GraphQL',
          __INITIAL_STATE__: 'Server-side State',
          __APP_INITIAL_STATE__: 'App Initial State',
          __PRELOADED_STATE__: 'Redux Preloaded State',
        };

        for (const [prop, label] of Object.entries(checks)) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((window as any)[prop] !== undefined) {
              properties[prop] = label;
            }
          } catch {
            // Access denied - skip
          }
        }

        // Check for React DevTools hook (indicates React app)
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).__REACT_DEVTOOLS_GLOBAL_HOOK__) {
            properties['__REACT_DEVTOOLS_GLOBAL_HOOK__'] = 'React';
          }
        } catch {
          /* skip */
        }

        // Check for Vue
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).__VUE__) {
            properties['__VUE__'] = 'Vue.js';
          }
        } catch {
          /* skip */
        }

        window.postMessage(
          {
            channel: CHANNEL,
            action: 'windowProperties',
            data: properties,
          },
          '*'
        );
      }
    });

    console.log('[EventAtlas] Site analyzer (MAIN world) loaded');
  },
});
