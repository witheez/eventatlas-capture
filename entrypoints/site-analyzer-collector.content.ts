/**
 * EventAtlas Capture - Site Analyzer Collector (ISOLATED world)
 *
 * Runs in the extension's isolated content script context.
 * Analyzes the DOM for anti-bot signatures, technology indicators,
 * and data delivery patterns. Bridges with the MAIN world script
 * and communicates results to the side panel.
 *
 * NOT auto-injected: registration is 'runtime' so this only runs
 * when explicitly injected via chrome.scripting.executeScript().
 */

import type {
  AntiBotDetection,
  TechDetection,
  DataDeliveryAnalysis,
} from './sidepanel/site-analyzer-types';
import { SITE_ANALYZER_CHANNEL } from './sidepanel/site-analyzer-types';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  registration: 'runtime',

  main() {
    const CHANNEL = SITE_ANALYZER_CHANNEL;

    // Guard against double-injection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).__EA_SITE_ANALYZER_COLLECTOR__) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__EA_SITE_ANALYZER_COLLECTOR__ = true;

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

    function detectTechnologies(): TechDetection[] {
      const detections: TechDetection[] = [];
      // H3 fix: Read outerHTML once and reuse for all pattern checks
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

    function analyzeDataDelivery(): DataDeliveryAnalysis {
      const evidence: string[] = [];
      // H3 fix: Read body text via innerText (no outerHTML needed here)
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

      // H3 fix: Compute HTML size from documentElement.outerHTML length
      // only once, using the same string for ratio calculation
      const htmlSize = document.documentElement.outerHTML.length;
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
    // Pagination Detection
    // ========================================================================

    function detectPagination(): {
      hasNextPrev: boolean;
      hasLoadMore: boolean;
      hasInfiniteScroll: boolean;
      hasPageParams: boolean;
      patterns: string[];
    } {
      const patterns: string[] = [];
      let hasNextPrev = false;
      let hasLoadMore = false;
      let hasInfiniteScroll = false;
      let hasPageParams = false;

      // Check <link rel="next"> / <link rel="prev"> in head
      const linkNext = document.querySelector('link[rel="next"]');
      const linkPrev = document.querySelector('link[rel="prev"]');
      if (linkNext) {
        hasNextPrev = true;
        patterns.push('rel=next link found in head');
      }
      if (linkPrev) {
        hasNextPrev = true;
        patterns.push('rel=prev link found in head');
      }

      // Check <a> elements with rel="next"/"prev"
      const aRelNext = document.querySelector('a[rel="next"]');
      const aRelPrev = document.querySelector('a[rel="prev"]');
      if (aRelNext) {
        hasNextPrev = true;
        patterns.push('Anchor with rel=next found');
      }
      if (aRelPrev) {
        hasNextPrev = true;
        patterns.push('Anchor with rel=prev found');
      }

      // Check for text-based pagination links
      const allAnchors = document.querySelectorAll('a');
      const paginationTextPatterns = /^(next|previous|prev|load\s*more|show\s*more|view\s*more)$/i;
      for (const a of allAnchors) {
        const text = (a.textContent || '').trim();
        if (paginationTextPatterns.test(text)) {
          if (/load\s*more|show\s*more|view\s*more/i.test(text)) {
            hasLoadMore = true;
            patterns.push(`Load more button detected ("${text}")`);
          } else {
            hasNextPrev = true;
            patterns.push(`Pagination link detected ("${text}")`);
          }
          break; // Only report once
        }
      }

      // Check for page number links (buttons/anchors with just numbers)
      const pageNumberLinks = document.querySelectorAll(
        'nav a, .pagination a, [class*="pager"] a, [class*="pagina"] a'
      );
      let pageNumberCount = 0;
      for (const link of pageNumberLinks) {
        const text = (link.textContent || '').trim();
        if (/^\d+$/.test(text)) pageNumberCount++;
      }
      if (pageNumberCount >= 3) {
        hasNextPrev = true;
        patterns.push(`Page number links detected (${pageNumberCount} found)`);
      }

      // Check URL patterns
      const currentUrl = window.location.href;
      if (/[?&]page=/.test(currentUrl)) {
        hasPageParams = true;
        patterns.push('?page= parameter in URL');
      }
      if (/[?&]offset=/.test(currentUrl)) {
        hasPageParams = true;
        patterns.push('?offset= parameter in URL');
      }
      if (/[?&]cursor=/.test(currentUrl)) {
        hasPageParams = true;
        patterns.push('?cursor= parameter in URL');
      }
      if (/\/page\/\d+/.test(currentUrl)) {
        hasPageParams = true;
        patterns.push('/page/ pattern in URL');
      }

      // Check for infinite scroll indicators
      const infiniteScrollSelectors = [
        '[data-infinite-scroll]',
        '[data-next-page]',
        '.infinite-scroll',
        '.infinite-scroll-component',
        '[class*="InfiniteScroll"]',
        '[class*="infinite-loader"]',
        '.waypoint',
      ];
      for (const selector of infiniteScrollSelectors) {
        if (document.querySelector(selector)) {
          hasInfiniteScroll = true;
          patterns.push(`Infinite scroll element detected (${selector})`);
          break;
        }
      }

      // Check for load more buttons (by class/id)
      const loadMoreSelectors = [
        '[class*="load-more"]',
        '[class*="loadMore"]',
        '[id*="load-more"]',
        '[id*="loadMore"]',
        'button[class*="show-more"]',
        'button[class*="showMore"]',
      ];
      for (const selector of loadMoreSelectors) {
        if (document.querySelector(selector)) {
          hasLoadMore = true;
          patterns.push(`Load more element detected (${selector})`);
          break;
        }
      }

      return { hasNextPrev, hasLoadMore, hasInfiniteScroll, hasPageParams, patterns };
    }

    // ========================================================================
    // Authentication Detection
    // ========================================================================

    function detectAuthentication(): {
      hasLoginForm: boolean;
      hasPaywall: boolean;
      hasOAuth: boolean;
      indicators: string[];
    } {
      const indicators: string[] = [];
      let hasLoginForm = false;
      let hasPaywall = false;
      let hasOAuth = false;

      // Check for login forms
      const forms = document.querySelectorAll('form');
      for (const form of forms) {
        const hasPassword = form.querySelector('input[type="password"]');
        const action = (form.getAttribute('action') || '').toLowerCase();
        const actionMatches = /login|signin|sign-in|auth|authenticate/.test(action);

        if (hasPassword) {
          hasLoginForm = true;
          indicators.push('Login form detected (password field found)');
          break;
        }
        if (actionMatches) {
          hasLoginForm = true;
          indicators.push(`Login form detected (action: ${action.substring(0, 60)})`);
          break;
        }
      }

      // Check for paywall elements
      const paywallSelectors = [
        '[class*="paywall"]',
        '[id*="paywall"]',
        '[class*="subscribe-wall"]',
        '[class*="premium-content"]',
        '[class*="login-wall"]',
        '[class*="loginWall"]',
        '[class*="premium-gate"]',
        '[class*="subscriber-only"]',
        '[data-paywall]',
      ];
      for (const selector of paywallSelectors) {
        const el = document.querySelector(selector);
        if (el) {
          hasPaywall = true;
          indicators.push(`Paywall element found (${selector})`);
          break;
        }
      }

      // Check for auth-related meta tags
      const robotsMeta = document.querySelector('meta[name="robots"]');
      if (robotsMeta) {
        const content = (robotsMeta.getAttribute('content') || '').toLowerCase();
        if (content.includes('noindex')) {
          // Only flag if the page seems to have content (not just a blank page)
          const bodyText = (document.body?.innerText || '').length;
          if (bodyText > 200) {
            indicators.push('noindex meta tag on content page (possible auth-gated content)');
          }
        }
      }

      // Check for OAuth buttons
      const oauthProviders = [
        { pattern: /accounts\.google\.com|googleapis\.com\/auth/, name: 'Google' },
        { pattern: /facebook\.com\/v\d+|facebook\.com\/dialog\/oauth/, name: 'Facebook' },
        { pattern: /github\.com\/login\/oauth/, name: 'GitHub' },
        { pattern: /api\.twitter\.com\/oauth|twitter\.com\/i\/oauth/, name: 'Twitter' },
        { pattern: /login\.microsoftonline\.com|microsoft\.com\/oauth/, name: 'Microsoft' },
        { pattern: /appleid\.apple\.com\/auth/, name: 'Apple' },
      ];

      const allLinks = document.querySelectorAll('a[href], button');
      for (const el of allLinks) {
        const href = el.getAttribute('href') || '';
        const text = (el.textContent || '').toLowerCase();
        for (const provider of oauthProviders) {
          if (
            provider.pattern.test(href) ||
            (text.includes('sign in with') && text.includes(provider.name.toLowerCase()))
          ) {
            hasOAuth = true;
            indicators.push(`OAuth detected: ${provider.name}`);
            break;
          }
        }
        if (hasOAuth) break;
      }

      return { hasLoginForm, hasPaywall, hasOAuth, indicators };
    }

    // ========================================================================
    // Cookie Analysis
    // ========================================================================

    function analyzeCookies(): {
      total: number;
      categories: Array<{ category: string; names: string[]; count: number }>;
      hasSessionCookies: boolean;
      hasAuthCookies: boolean;
      note: string;
    } {
      const cookieString = document.cookie;
      if (!cookieString.trim()) {
        return {
          total: 0,
          categories: [],
          hasSessionCookies: false,
          hasAuthCookies: false,
          note: 'HttpOnly cookies are not visible to JavaScript',
        };
      }

      const cookies = cookieString
        .split(';')
        .map((c) => c.trim().split('=')[0].trim())
        .filter(Boolean);
      const total = cookies.length;

      const categoryDefs: Array<{
        category: string;
        patterns: RegExp[];
      }> = [
        {
          category: 'Session',
          patterns: [
            /^PHPSESSID$/i,
            /^JSESSIONID$/i,
            /^ASP\.NET_SessionId$/i,
            /^connect\.sid$/i,
            /^session/i,
            /^sid$/i,
            /^sess_/i,
          ],
        },
        {
          category: 'Auth',
          patterns: [
            /token/i,
            /^jwt$/i,
            /^auth/i,
            /^access_token$/i,
            /^refresh_token$/i,
            /^remember/i,
            /^login/i,
            /^user_session/i,
          ],
        },
        {
          category: 'Consent',
          patterns: [
            /cookie.?consent/i,
            /gdpr/i,
            /^cc_/i,
            /^cookielaw/i,
            /^CookieConsent/i,
            /^euconsent/i,
          ],
        },
        {
          category: 'Tracking',
          patterns: [
            /^_ga$/i,
            /^_gid$/i,
            /^_gat$/i,
            /^_fbp$/i,
            /^_fbc$/i,
            /^_gcl_/i,
            /^_hjid$/i,
            /^_clck$/i,
            /^_clsk$/i,
            /^mp_/i,
            /^amplitude/i,
            /^ajs_/i,
          ],
        },
      ];

      const categorized: Array<{ category: string; names: string[]; count: number }> = [];
      const assignedCookies = new Set<string>();

      for (const def of categoryDefs) {
        const names: string[] = [];
        for (const cookie of cookies) {
          if (assignedCookies.has(cookie)) continue;
          for (const pattern of def.patterns) {
            if (pattern.test(cookie)) {
              names.push(cookie);
              assignedCookies.add(cookie);
              break;
            }
          }
        }
        if (names.length > 0) {
          categorized.push({ category: def.category, names, count: names.length });
        }
      }

      // Other category for unassigned
      const otherNames = cookies.filter((c) => !assignedCookies.has(c));
      if (otherNames.length > 0) {
        categorized.push({ category: 'Other', names: otherNames, count: otherNames.length });
      }

      const hasSessionCookies = categorized.some((c) => c.category === 'Session');
      const hasAuthCookies = categorized.some((c) => c.category === 'Auth');

      return {
        total,
        categories: categorized,
        hasSessionCookies,
        hasAuthCookies,
        note: 'HttpOnly cookies are not visible to JavaScript',
      };
    }

    // ========================================================================
    // Message handling - respond to side panel requests
    // H1 fix: Use promise-based approach with request IDs and longer timeout
    // ========================================================================

    // Store data received from MAIN world, keyed by request ID
    let pendingRequestId: string | null = null;
    let mainWorldData: {
      interceptedRequests?: unknown;
      windowProperties?: Record<string, string>;
      rateLimitHeaders?: Array<{ name: string; value: string; source: string }>;
    } = {};
    let mainWorldResponseCount = 0;
    let mainWorldResolve: (() => void) | null = null;

    // Listen for MAIN world messages
    window.addEventListener('message', (event) => {
      if (event.source !== window) return;
      if (event.data?.channel !== CHANNEL) return;

      // Only accept responses matching our current request ID
      if (pendingRequestId && event.data.requestId === pendingRequestId) {
        if (event.data.action === 'interceptedRequests') {
          mainWorldData.interceptedRequests = event.data.data;
          mainWorldResponseCount++;
        }
        if (event.data.action === 'windowProperties') {
          mainWorldData.windowProperties = event.data.data;
          mainWorldResponseCount++;
        }
        if (event.data.action === 'rateLimitHeaders') {
          mainWorldData.rateLimitHeaders = event.data.data;
          mainWorldResponseCount++;
        }

        // Resolve when we have all 3 responses
        if (mainWorldResponseCount >= 3 && mainWorldResolve) {
          mainWorldResolve();
          mainWorldResolve = null;
        }
      }
    });

    /**
     * Wait for MAIN world responses with a unique request ID and timeout.
     * Returns a promise that resolves when both responses arrive or times out.
     */
    function waitForMainWorld(requestId: string, timeoutMs: number): Promise<void> {
      return new Promise<void>((resolve) => {
        pendingRequestId = requestId;
        mainWorldData = {};
        mainWorldResponseCount = 0;
        mainWorldResolve = resolve;

        // Request data from MAIN world with the request ID
        window.postMessage({ channel: CHANNEL, action: 'getInterceptedRequests', requestId }, '*');
        window.postMessage({ channel: CHANNEL, action: 'getWindowProperties', requestId }, '*');
        window.postMessage({ channel: CHANNEL, action: 'getRateLimitInfo', requestId }, '*');

        // Timeout fallback -- proceed with whatever data we have
        setTimeout(() => {
          if (mainWorldResolve) {
            mainWorldResolve();
            mainWorldResolve = null;
          }
        }, timeoutMs);
      });
    }

    // Listen for messages from the side panel
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      if (request.action === 'analyzeSite') {
        // Generate a unique request ID to prevent stale data (H1 fix)
        const requestId = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

        // Wait for MAIN world with 3-second timeout (H1 fix: was 300ms)
        waitForMainWorld(requestId, 3000).then(() => {
          const antiBotDetections: AntiBotDetection[] = [
            ...detectAntiBotFromCookies(),
            ...detectAntiBotFromDOM(),
          ];

          // Deduplicate by name (keep highest confidence)
          const deduped = new Map<string, AntiBotDetection>();
          for (const d of antiBotDetections) {
            const existing = deduped.get(d.name);
            if (!existing || d.confidence > existing.confidence) {
              deduped.set(d.name, d);
            }
          }

          const technologies = detectTechnologies();
          const dataDelivery = analyzeDataDelivery();
          const headers = analyzeHeaders();
          const pagination = detectPagination();
          const authentication = detectAuthentication();
          const cookies = analyzeCookies();

          const rateLimitData = mainWorldData.rateLimitHeaders || [];
          const rateLimiting = {
            detected: rateLimitData.length > 0,
            headers: rateLimitData,
          };

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
            pagination,
            authentication,
            rateLimiting,
            robotsTxt: null, // Fetched by side panel
            cookies,
            analyzedAt: new Date().toISOString(),
            url: window.location.href,
          });
        });

        return true; // Keep channel open for async response
      }
    });

    console.log('[EventAtlas] Site analyzer collector loaded');
  },
});
