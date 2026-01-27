/**
 * EventAtlas Capture - Site Analyzer Collector (ISOLATED world)
 *
 * Runs in the extension's isolated content script context.
 * Analyzes the DOM for anti-bot signatures, technology indicators,
 * and data delivery patterns. Bridges with the MAIN world script
 * and communicates results to the side panel.
 */

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    const CHANNEL = 'eventatlas-site-analyzer';

    // ========================================================================
    // Anti-Bot Detection Signatures
    // ========================================================================

    interface DetectionSignature {
      name: string;
      category: 'antibot' | 'captcha' | 'waf';
      confidence: number; // 0-100
      evidence: string;
    }

    function detectAntiBotFromCookies(): DetectionSignature[] {
      const detections: DetectionSignature[] = [];
      const cookies = document.cookie;

      const cookieSignatures: Array<{
        pattern: RegExp | string;
        name: string;
        category: 'antibot' | 'captcha' | 'waf';
        confidence: number;
      }> = [
        // Cloudflare
        {
          pattern: '__cf_bm',
          name: 'Cloudflare Bot Management',
          category: 'antibot',
          confidence: 95,
        },
        {
          pattern: 'cf_clearance',
          name: 'Cloudflare Challenge',
          category: 'antibot',
          confidence: 90,
        },
        { pattern: '__cflb', name: 'Cloudflare Load Balancer', category: 'waf', confidence: 60 },

        // Akamai
        { pattern: '_abck', name: 'Akamai Bot Manager', category: 'antibot', confidence: 95 },
        {
          pattern: 'ak_bmsc',
          name: 'Akamai Bot Manager (Session)',
          category: 'antibot',
          confidence: 90,
        },
        { pattern: 'bm_sz', name: 'Akamai Sensor', category: 'antibot', confidence: 85 },
        { pattern: 'bm_sv', name: 'Akamai Bot Manager', category: 'antibot', confidence: 85 },

        // DataDome
        { pattern: 'datadome', name: 'DataDome', category: 'antibot', confidence: 95 },

        // PerimeterX
        { pattern: '_px3', name: 'PerimeterX', category: 'antibot', confidence: 95 },
        { pattern: '_px2', name: 'PerimeterX', category: 'antibot', confidence: 90 },
        { pattern: '_pxhd', name: 'PerimeterX', category: 'antibot', confidence: 85 },
        { pattern: '_pxvid', name: 'PerimeterX', category: 'antibot', confidence: 85 },

        // Imperva/Incapsula
        { pattern: /incap_ses_/, name: 'Imperva/Incapsula', category: 'antibot', confidence: 95 },
        { pattern: /visid_incap_/, name: 'Imperva/Incapsula', category: 'antibot', confidence: 90 },
        { pattern: 'reese84', name: 'Imperva Reese84', category: 'antibot', confidence: 90 },

        // Kasada
        { pattern: 'ct_', name: 'Kasada', category: 'antibot', confidence: 70 },

        // AWS WAF
        { pattern: 'aws-waf-token', name: 'AWS WAF', category: 'waf', confidence: 95 },
      ];

      for (const sig of cookieSignatures) {
        const found =
          typeof sig.pattern === 'string'
            ? cookies.includes(sig.pattern)
            : sig.pattern.test(cookies);

        if (found) {
          detections.push({
            name: sig.name,
            category: sig.category,
            confidence: sig.confidence,
            evidence: `Cookie: ${typeof sig.pattern === 'string' ? sig.pattern : sig.pattern.source}`,
          });
        }
      }

      return detections;
    }

    function detectAntiBotFromDOM(): DetectionSignature[] {
      const detections: DetectionSignature[] = [];

      // Check script sources
      const scripts = document.querySelectorAll('script[src]');
      const scriptSrcs = Array.from(scripts).map((s) => s.getAttribute('src') || '');

      const scriptSignatures: Array<{
        pattern: RegExp;
        name: string;
        category: 'antibot' | 'captcha' | 'waf';
        confidence: number;
      }> = [
        // Cloudflare
        {
          pattern: /cdn-cgi\/challenge-platform/,
          name: 'Cloudflare Challenge Platform',
          category: 'antibot',
          confidence: 95,
        },
        {
          pattern: /challenges\.cloudflare\.com/,
          name: 'Cloudflare Challenge',
          category: 'antibot',
          confidence: 95,
        },
        {
          pattern: /cloudflare\.com\/cdn-cgi/,
          name: 'Cloudflare CDN',
          category: 'waf',
          confidence: 60,
        },

        // reCAPTCHA
        {
          pattern: /recaptcha\/api/,
          name: 'Google reCAPTCHA',
          category: 'captcha',
          confidence: 95,
        },
        {
          pattern: /gstatic\.com\/recaptcha/,
          name: 'Google reCAPTCHA',
          category: 'captcha',
          confidence: 95,
        },

        // hCaptcha
        { pattern: /hcaptcha\.com\/1\/api/, name: 'hCaptcha', category: 'captcha', confidence: 95 },
        { pattern: /js\.hcaptcha\.com/, name: 'hCaptcha', category: 'captcha', confidence: 95 },

        // Turnstile
        {
          pattern: /challenges\.cloudflare\.com\/turnstile/,
          name: 'Cloudflare Turnstile',
          category: 'captcha',
          confidence: 95,
        },

        // DataDome
        { pattern: /js\.datadome\.co/, name: 'DataDome', category: 'antibot', confidence: 95 },

        // PerimeterX
        { pattern: /px-cdn\.net/, name: 'PerimeterX', category: 'antibot', confidence: 90 },
        { pattern: /px-cloud\.net/, name: 'PerimeterX', category: 'antibot', confidence: 90 },

        // Akamai
        { pattern: /\/akam\//, name: 'Akamai', category: 'antibot', confidence: 85 },
        { pattern: /\/akamai\//, name: 'Akamai', category: 'antibot', confidence: 70 },

        // Kasada
        { pattern: /ips\.js/, name: 'Kasada (possible)', category: 'antibot', confidence: 60 },

        // Shape Security / F5
        { pattern: /shape\.com/, name: 'Shape Security', category: 'antibot', confidence: 85 },

        // Sucuri
        { pattern: /sucuri\.net/, name: 'Sucuri WAF', category: 'waf', confidence: 90 },

        // FunCaptcha
        {
          pattern: /arkoselabs\.com/,
          name: 'Arkose Labs / FunCaptcha',
          category: 'captcha',
          confidence: 95,
        },
        { pattern: /funcaptcha\.com/, name: 'FunCaptcha', category: 'captcha', confidence: 95 },

        // GeeTest
        { pattern: /geetest\.com/, name: 'GeeTest', category: 'captcha', confidence: 95 },
      ];

      for (const sig of scriptSignatures) {
        for (const src of scriptSrcs) {
          if (sig.pattern.test(src)) {
            detections.push({
              name: sig.name,
              category: sig.category,
              confidence: sig.confidence,
              evidence: `Script: ${src.substring(0, 80)}`,
            });
            break;
          }
        }
      }

      // Check inline script content for anti-bot signatures
      const inlineScripts = document.querySelectorAll('script:not([src])');
      const inlineContent = Array.from(inlineScripts)
        .map((s) => s.textContent || '')
        .join('\n')
        .substring(0, 50000); // Limit scan size

      const inlineSignatures: Array<{
        pattern: RegExp;
        name: string;
        category: 'antibot' | 'captcha' | 'waf';
        confidence: number;
      }> = [
        {
          pattern: /cf-browser-verification/,
          name: 'Cloudflare Browser Check',
          category: 'antibot',
          confidence: 90,
        },
        {
          pattern: /turnstile\.render/,
          name: 'Cloudflare Turnstile',
          category: 'captcha',
          confidence: 90,
        },
        {
          pattern: /grecaptcha\.execute/,
          name: 'reCAPTCHA v3',
          category: 'captcha',
          confidence: 90,
        },
        {
          pattern: /grecaptcha\.render/,
          name: 'reCAPTCHA v2',
          category: 'captcha',
          confidence: 90,
        },
        { pattern: /bmak\./, name: 'Akamai Bot Manager', category: 'antibot', confidence: 85 },
        {
          pattern: /bazadebezolkohpepadr/,
          name: 'Akamai (obfuscated)',
          category: 'antibot',
          confidence: 95,
        },
        { pattern: /datadome/, name: 'DataDome', category: 'antibot', confidence: 70 },
        { pattern: /_pxAppId/, name: 'PerimeterX', category: 'antibot', confidence: 90 },
      ];

      for (const sig of inlineSignatures) {
        if (sig.pattern.test(inlineContent)) {
          detections.push({
            name: sig.name,
            category: sig.category,
            confidence: sig.confidence,
            evidence: 'Inline script content',
          });
        }
      }

      // Check DOM elements for CAPTCHA indicators
      const captchaDomChecks: Array<{
        selector: string;
        name: string;
        confidence: number;
      }> = [
        { selector: '.g-recaptcha', name: 'Google reCAPTCHA', confidence: 95 },
        { selector: '[data-sitekey]', name: 'CAPTCHA (sitekey)', confidence: 90 },
        { selector: 'iframe[src*="recaptcha"]', name: 'Google reCAPTCHA', confidence: 95 },
        { selector: 'iframe[src*="hcaptcha"]', name: 'hCaptcha', confidence: 95 },
        { selector: '.h-captcha', name: 'hCaptcha', confidence: 95 },
        { selector: 'iframe[src*="turnstile"]', name: 'Cloudflare Turnstile', confidence: 95 },
        { selector: '.cf-turnstile', name: 'Cloudflare Turnstile', confidence: 95 },
      ];

      for (const check of captchaDomChecks) {
        if (document.querySelector(check.selector)) {
          detections.push({
            name: check.name,
            category: 'captcha',
            confidence: check.confidence,
            evidence: `DOM: ${check.selector}`,
          });
        }
      }

      return detections;
    }

    // ========================================================================
    // Technology Detection
    // ========================================================================

    interface TechDetection {
      name: string;
      category: 'framework' | 'cms' | 'ecommerce' | 'analytics' | 'hosting';
      confidence: number;
      evidence: string;
    }

    function detectTechnologies(): TechDetection[] {
      const detections: TechDetection[] = [];
      const html = document.documentElement.outerHTML.substring(0, 100000);
      const metaGenerator =
        document.querySelector('meta[name="generator"]')?.getAttribute('content') || '';

      // Meta generator checks
      if (metaGenerator) {
        if (/wordpress/i.test(metaGenerator)) {
          detections.push({
            name: 'WordPress',
            category: 'cms',
            confidence: 95,
            evidence: `Generator: ${metaGenerator}`,
          });
        }
        if (/drupal/i.test(metaGenerator)) {
          detections.push({
            name: 'Drupal',
            category: 'cms',
            confidence: 95,
            evidence: `Generator: ${metaGenerator}`,
          });
        }
        if (/joomla/i.test(metaGenerator)) {
          detections.push({
            name: 'Joomla',
            category: 'cms',
            confidence: 95,
            evidence: `Generator: ${metaGenerator}`,
          });
        }
        if (/shopify/i.test(metaGenerator)) {
          detections.push({
            name: 'Shopify',
            category: 'ecommerce',
            confidence: 95,
            evidence: `Generator: ${metaGenerator}`,
          });
        }
        if (/wix/i.test(metaGenerator)) {
          detections.push({
            name: 'Wix',
            category: 'cms',
            confidence: 95,
            evidence: `Generator: ${metaGenerator}`,
          });
        }
        if (/squarespace/i.test(metaGenerator)) {
          detections.push({
            name: 'Squarespace',
            category: 'cms',
            confidence: 95,
            evidence: `Generator: ${metaGenerator}`,
          });
        }
      }

      // DOM / HTML pattern checks
      const techPatterns: Array<{
        pattern: RegExp;
        name: string;
        category: TechDetection['category'];
        confidence: number;
        evidence: string;
      }> = [
        // Frameworks
        {
          pattern: /id="__next"/,
          name: 'Next.js',
          category: 'framework',
          confidence: 90,
          evidence: 'DOM: #__next',
        },
        {
          pattern: /id="__nuxt"/,
          name: 'Nuxt.js',
          category: 'framework',
          confidence: 90,
          evidence: 'DOM: #__nuxt',
        },
        {
          pattern: /id="___gatsby"/,
          name: 'Gatsby',
          category: 'framework',
          confidence: 90,
          evidence: 'DOM: #___gatsby',
        },
        {
          pattern: /ng-version=/,
          name: 'Angular',
          category: 'framework',
          confidence: 85,
          evidence: 'DOM: ng-version attribute',
        },
        {
          pattern: /data-reactroot/,
          name: 'React',
          category: 'framework',
          confidence: 80,
          evidence: 'DOM: data-reactroot',
        },
        {
          pattern: /data-v-[a-f0-9]+/,
          name: 'Vue.js',
          category: 'framework',
          confidence: 80,
          evidence: 'DOM: Vue scoped style attributes',
        },
        {
          pattern: /svelte-[a-z0-9]+/,
          name: 'Svelte',
          category: 'framework',
          confidence: 75,
          evidence: 'DOM: Svelte class prefix',
        },

        // CMS
        {
          pattern: /wp-content\//,
          name: 'WordPress',
          category: 'cms',
          confidence: 90,
          evidence: 'URL: wp-content path',
        },
        {
          pattern: /wp-includes\//,
          name: 'WordPress',
          category: 'cms',
          confidence: 90,
          evidence: 'URL: wp-includes path',
        },
        {
          pattern: /sites\/default\/files/,
          name: 'Drupal',
          category: 'cms',
          confidence: 85,
          evidence: 'URL: Drupal default files path',
        },

        // eCommerce
        {
          pattern: /cdn\.shopify\.com/,
          name: 'Shopify',
          category: 'ecommerce',
          confidence: 95,
          evidence: 'URL: Shopify CDN',
        },
        {
          pattern: /woocommerce/,
          name: 'WooCommerce',
          category: 'ecommerce',
          confidence: 85,
          evidence: 'HTML: WooCommerce reference',
        },

        // Event platforms
        {
          pattern: /eventbrite\.com/,
          name: 'Eventbrite',
          category: 'cms',
          confidence: 90,
          evidence: 'URL: Eventbrite domain',
        },
        {
          pattern: /ticketmaster\.com/,
          name: 'Ticketmaster',
          category: 'cms',
          confidence: 90,
          evidence: 'URL: Ticketmaster domain',
        },
      ];

      for (const check of techPatterns) {
        if (check.pattern.test(html)) {
          // Avoid duplicate detections
          if (!detections.some((d) => d.name === check.name)) {
            detections.push({
              name: check.name,
              category: check.category,
              confidence: check.confidence,
              evidence: check.evidence,
            });
          }
        }
      }

      // Check response headers via meta equiv
      const metaEquivs = document.querySelectorAll('meta[http-equiv]');
      metaEquivs.forEach((meta) => {
        const equiv = meta.getAttribute('http-equiv')?.toLowerCase();
        const content = meta.getAttribute('content') || '';
        if (equiv === 'x-powered-by') {
          detections.push({
            name: content,
            category: 'framework',
            confidence: 80,
            evidence: `Header: X-Powered-By: ${content}`,
          });
        }
      });

      return detections;
    }

    // ========================================================================
    // Data Delivery Analysis
    // ========================================================================

    interface DataDeliveryAnalysis {
      hasStructuredData: boolean;
      structuredDataTypes: string[];
      hasServerRenderedContent: boolean;
      hasSPAIndicators: boolean;
      hasAPIDataInPage: boolean;
      contentSize: {
        html: number;
        text: number;
        ratio: number; // text/html ratio - low = lots of JS/framework overhead
      };
      dataDeliveryMethod: 'server-rendered' | 'spa-api' | 'hybrid' | 'unknown';
      evidence: string[];
    }

    function analyzeDataDelivery(): DataDeliveryAnalysis {
      const evidence: string[] = [];
      const html = document.documentElement.outerHTML;
      const text = document.body?.innerText || '';

      // Check structured data
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      const structuredDataTypes: string[] = [];
      jsonLdScripts.forEach((script) => {
        try {
          const data = JSON.parse(script.textContent || '');
          if (data['@type']) structuredDataTypes.push(data['@type']);
          if (Array.isArray(data['@graph'])) {
            data['@graph'].forEach((item: { '@type'?: string }) => {
              if (item['@type']) structuredDataTypes.push(item['@type']);
            });
          }
        } catch {
          /* skip */
        }
      });

      const hasStructuredData = structuredDataTypes.length > 0;
      if (hasStructuredData) {
        evidence.push(`Structured data (JSON-LD): ${structuredDataTypes.join(', ')}`);
      }

      // Check for server-side rendered content
      const hasServerRenderedContent = text.length > 500;
      const hasSPAIndicators =
        !!document.querySelector('#__next, #__nuxt, #app, #root, [data-reactroot]') ||
        !!document.querySelector(
          'script[type="application/json"][id*="props"], script[type="application/json"][id*="state"]'
        );

      // Check for JSON data embedded in page
      const jsonScripts = document.querySelectorAll(
        'script[type="application/json"], script[id*="__NEXT_DATA__"], script[id*="__NUXT"]'
      );
      const hasAPIDataInPage = jsonScripts.length > 0;
      if (hasAPIDataInPage) {
        evidence.push(`Found ${jsonScripts.length} embedded JSON data block(s)`);
      }

      // Content ratio analysis
      const htmlSize = html.length;
      const textSize = text.length;
      const ratio = htmlSize > 0 ? textSize / htmlSize : 0;

      if (ratio < 0.05) {
        evidence.push('Very low text/HTML ratio - heavy framework or minimal server content');
      } else if (ratio < 0.15) {
        evidence.push('Low text/HTML ratio - moderate framework overhead');
      } else {
        evidence.push('Good text/HTML ratio - content is largely server-rendered');
      }

      // Determine delivery method
      let dataDeliveryMethod: DataDeliveryAnalysis['dataDeliveryMethod'] = 'unknown';
      if (hasServerRenderedContent && !hasSPAIndicators) {
        dataDeliveryMethod = 'server-rendered';
        evidence.push('Content appears to be server-rendered (traditional HTML)');
      } else if (hasSPAIndicators && hasServerRenderedContent) {
        dataDeliveryMethod = 'hybrid';
        evidence.push('Hybrid: SPA framework with server-side rendering (SSR/SSG)');
      } else if (hasSPAIndicators && !hasServerRenderedContent) {
        dataDeliveryMethod = 'spa-api';
        evidence.push('Single-Page App: content loaded via client-side JavaScript/API');
      }

      return {
        hasStructuredData,
        structuredDataTypes,
        hasServerRenderedContent,
        hasSPAIndicators,
        hasAPIDataInPage,
        contentSize: { html: htmlSize, text: textSize, ratio },
        dataDeliveryMethod,
        evidence,
      };
    }

    // ========================================================================
    // Response Headers Analysis (from meta tags and link elements)
    // ========================================================================

    interface HeadersAnalysis {
      securityHeaders: string[];
      serverInfo: string | null;
      cachePolicy: string | null;
    }

    function analyzeHeaders(): HeadersAnalysis {
      const securityHeaders: string[] = [];
      let serverInfo: string | null = null;
      let cachePolicy: string | null = null;

      // Content Security Policy via meta
      const cspMeta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      if (cspMeta) {
        securityHeaders.push('Content-Security-Policy (via meta)');
      }

      // X-Frame-Options equivalent check
      const xFrameMeta = document.querySelector('meta[http-equiv="X-Frame-Options"]');
      if (xFrameMeta) {
        securityHeaders.push(`X-Frame-Options: ${xFrameMeta.getAttribute('content')}`);
      }

      // Server info from meta
      const serverMeta = document.querySelector('meta[http-equiv="X-Powered-By"]');
      if (serverMeta) {
        serverInfo = serverMeta.getAttribute('content');
      }

      // Cache control
      const cacheMeta = document.querySelector('meta[http-equiv="Cache-Control"]');
      if (cacheMeta) {
        cachePolicy = cacheMeta.getAttribute('content');
      }

      return { securityHeaders, serverInfo, cachePolicy };
    }

    // ========================================================================
    // Message handling - respond to side panel requests
    // ========================================================================

    // Store data received from MAIN world
    let mainWorldData: {
      interceptedRequests?: unknown;
      windowProperties?: Record<string, string>;
    } = {};

    // Listen for MAIN world messages
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.channel !== CHANNEL) return;

      if (event.data.action === 'interceptedRequests') {
        mainWorldData.interceptedRequests = event.data.data;
      }
      if (event.data.action === 'windowProperties') {
        mainWorldData.windowProperties = event.data.data;
      }
    });

    // Listen for messages from the side panel
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.action === 'analyzeSite') {
        // Reset main world data collection
        mainWorldData = {};

        // Request data from MAIN world
        window.postMessage({ channel: CHANNEL, action: 'getInterceptedRequests' }, '*');
        window.postMessage({ channel: CHANNEL, action: 'getWindowProperties' }, '*');

        // Give MAIN world a moment to respond, then collect everything
        setTimeout(() => {
          const antiBotDetections = [...detectAntiBotFromCookies(), ...detectAntiBotFromDOM()];

          // Deduplicate by name (keep highest confidence)
          const deduped = new Map<string, DetectionSignature>();
          for (const d of antiBotDetections) {
            const existing = deduped.get(d.name);
            if (!existing || d.confidence > existing.confidence) {
              deduped.set(d.name, d);
            }
          }

          const technologies = detectTechnologies();
          const dataDelivery = analyzeDataDelivery();
          const headers = analyzeHeaders();

          sendResponse({
            antiBotDetections: Array.from(deduped.values()),
            technologies,
            dataDelivery,
            headers,
            interceptedRequests: mainWorldData.interceptedRequests || {
              totalRequests: 0,
              endpoints: [],
            },
            windowProperties: mainWorldData.windowProperties || {},
            analyzedAt: new Date().toISOString(),
            url: window.location.href,
          });
        }, 300);

        return true; // Keep channel open for async response
      }
    });

    console.log('[EventAtlas] Site analyzer collector loaded');
  },
});
