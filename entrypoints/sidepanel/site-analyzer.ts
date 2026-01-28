/**
 * EventAtlas Capture - Site Analyzer Module
 *
 * Orchestrates website analysis from the side panel.
 * Triggers content script analysis, processes results,
 * and renders the analysis UI.
 *
 * The MAIN world script auto-injects on every page to intercept requests.
 * The collector script is injected on-demand when analysis is triggered.
 */

import type {
  SiteAnalysisResult,
  ScrapingRecommendation,
  RobotsTxtAnalysis,
} from './site-analyzer-types';

// Re-export types for consumers
export type { SiteAnalysisResult, ScrapingRecommendation };

// ============================================================================
// Analysis Logic
// ============================================================================

/**
 * Run site analysis on the current tab.
 * Injects content scripts on-demand, then triggers analysis.
 */
export async function analyzeSite(): Promise<SiteAnalysisResult | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) {
      return null;
    }

    const tabId = tab.id;

    // Inject the ISOLATED world collector script on-demand
    // (MAIN world script is auto-injected on every page at document_start)
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content-scripts/site-analyzer-collector.js'],
    });

    // Brief delay for collector to initialize, then trigger analysis
    await new Promise((resolve) => setTimeout(resolve, 50));

    const response = await chrome.tabs.sendMessage(tabId, { action: 'analyzeSite' });
    const result = response as SiteAnalysisResult;

    // Fetch robots.txt in parallel (non-blocking)
    try {
      const robotsUrl = new URL('/robots.txt', tab.url).href;
      const robotsResponse = await fetch(robotsUrl);
      if (robotsResponse.ok) {
        const robotsText = await robotsResponse.text();
        result.robotsTxt = parseRobotsTxt(robotsText);
      }
    } catch {
      /* skip - robots.txt fetch is best-effort */
    }

    return result;
  } catch (error) {
    console.error('[EventAtlas] Site analysis failed:', error);
    return null;
  }
}

/**
 * Generate scraping recommendations based on analysis results
 */
export function generateRecommendations(result: SiteAnalysisResult): ScrapingRecommendation {
  const details: string[] = [];
  const tools: string[] = [];
  let difficultyScore = 0; // 0 = easy, higher = harder

  // Anti-bot impact
  const highConfidenceAntiBot = result.antiBotDetections.filter(
    (d) => d.category === 'antibot' && d.confidence >= 80
  );
  const captchas = result.antiBotDetections.filter((d) => d.category === 'captcha');
  const wafs = result.antiBotDetections.filter((d) => d.category === 'waf');

  if (highConfidenceAntiBot.length > 0) {
    const names = [...new Set(highConfidenceAntiBot.map((d) => d.name))];
    details.push(`Anti-bot protection detected: ${names.join(', ')}`);
    difficultyScore += 3;

    if (names.some((n) => /cloudflare/i.test(n))) {
      tools.push('Cloudflare bypass (e.g., cloudscraper, FlareSolverr)');
    }
    if (names.some((n) => /akamai/i.test(n))) {
      tools.push('Akamai bypass / residential proxies');
      difficultyScore += 1;
    }
    if (names.some((n) => /datadome/i.test(n))) {
      tools.push('DataDome bypass / undetected browser');
      difficultyScore += 2;
    }
    if (names.some((n) => /perimeterx/i.test(n))) {
      tools.push('PerimeterX bypass / stealth browser');
      difficultyScore += 2;
    }
  }

  if (captchas.length > 0) {
    const names = [...new Set(captchas.map((d) => d.name))];
    details.push(`CAPTCHA detected: ${names.join(', ')}`);
    difficultyScore += 2;
    tools.push('CAPTCHA solving service (e.g., 2captcha, anti-captcha)');
  }

  if (wafs.length > 0) {
    const names = [...new Set(wafs.map((d) => d.name))];
    details.push(`WAF detected: ${names.join(', ')}`);
    difficultyScore += 1;
  }

  // Data delivery impact
  const delivery = result.dataDelivery;
  if (delivery.dataDeliveryMethod === 'server-rendered') {
    details.push('Content is server-rendered HTML - direct HTTP requests should work');
    tools.push('HTTP client (requests/httpx) + HTML parser (BeautifulSoup/lxml)');
  } else if (delivery.dataDeliveryMethod === 'spa-api') {
    details.push('SPA detected - content loaded via JavaScript/API calls');
    difficultyScore += 1;

    const apiEndpoints = result.interceptedRequests.endpoints.filter(
      (e) => e.endpoint.includes('/api/') || e.endpoint.includes('/graphql')
    );
    if (apiEndpoints.length > 0) {
      details.push(
        `Found ${apiEndpoints.length} API endpoint(s) - consider calling these directly`
      );
      tools.push('Direct API calls (faster, more reliable than browser automation)');
    } else {
      tools.push('Headless browser (Playwright/Puppeteer) for JS rendering');
    }
  } else if (delivery.dataDeliveryMethod === 'hybrid') {
    details.push('Hybrid SSR/SPA - initial content in HTML, dynamic parts via API');
    tools.push('HTTP client for static content, API calls for dynamic data');
  }

  // Structured data
  if (delivery.hasStructuredData) {
    details.push(
      `Structured data available (${delivery.structuredDataTypes.join(', ')}) - extract from JSON-LD`
    );
    tools.push('JSON-LD extraction (easiest data source)');
  }

  // API endpoints
  const jsonEndpoints = result.interceptedRequests.endpoints.filter((e) => {
    const url = e.endpoint.toLowerCase();
    return (
      url.includes('/api/') ||
      url.includes('/graphql') ||
      url.includes('.json') ||
      url.includes('/v1/') ||
      url.includes('/v2/') ||
      url.includes('/rest/')
    );
  });

  if (jsonEndpoints.length > 0 && !details.some((d) => d.includes('API endpoint'))) {
    details.push(`${jsonEndpoints.length} potential API endpoint(s) detected`);
  }

  // Window properties (framework data)
  const windowProps = result.windowProperties;
  if (windowProps['__NEXT_DATA__']) {
    details.push('Next.js page data available in __NEXT_DATA__ - parse for structured content');
  }
  if (windowProps['__NUXT__']) {
    details.push('Nuxt.js state available in __NUXT__ - parse for structured content');
  }
  if (windowProps['__APOLLO_STATE__'] || windowProps['__RELAY_STORE__']) {
    details.push('GraphQL cache available in page - extract pre-fetched data');
  }
  if (windowProps['__INITIAL_STATE__'] || windowProps['__PRELOADED_STATE__']) {
    details.push('Server-side state embedded in page - extract from script tags');
  }

  // Technology-specific advice
  const techs = result.technologies;
  if (techs.some((t) => t.name === 'WordPress')) {
    details.push('WordPress site - check for REST API at /wp-json/wp/v2/');
    tools.push('WordPress REST API');
  }
  if (techs.some((t) => t.name === 'Shopify')) {
    details.push('Shopify site - products may be available via /products.json');
  }

  // Determine difficulty
  let difficulty: ScrapingRecommendation['difficulty'];
  if (difficultyScore <= 1) difficulty = 'easy';
  else if (difficultyScore <= 3) difficulty = 'moderate';
  else if (difficultyScore <= 5) difficulty = 'hard';
  else difficulty = 'very-hard';

  // Determine approach
  let approach: string;
  if (difficultyScore === 0 && delivery.dataDeliveryMethod === 'server-rendered') {
    approach = 'Simple HTTP scraping';
  } else if (jsonEndpoints.length > 0 && highConfidenceAntiBot.length === 0) {
    approach = 'Direct API consumption';
  } else if (difficultyScore <= 2) {
    approach = delivery.hasSPAIndicators
      ? 'Headless browser scraping'
      : 'HTTP scraping with session handling';
  } else {
    approach = 'Advanced scraping with anti-bot bypass';
  }

  if (details.length === 0) {
    details.push('No significant obstacles detected - standard scraping should work');
    tools.push('HTTP client + HTML parser');
  }

  return { approach, difficulty, details, tools };
}

// ============================================================================
// UI Rendering
// ============================================================================

/**
 * Escape HTML to prevent XSS when interpolating into innerHTML.
 * Uses regex-based approach for efficiency (M2 fix).
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Render the analysis results into the given container
 */
export function renderAnalysisResults(container: HTMLElement, result: SiteAnalysisResult): void {
  const recommendation = generateRecommendations(result);

  let html = '';

  // Recommendation summary
  const difficultyColors: Record<string, string> = {
    easy: '#22c55e',
    moderate: '#f59e0b',
    hard: '#ef4444',
    'very-hard': '#991b1b',
  };
  const difficultyLabels: Record<string, string> = {
    easy: 'Easy',
    moderate: 'Moderate',
    hard: 'Hard',
    'very-hard': 'Very Hard',
  };

  html += `
    <div class="sa-summary">
      <div class="sa-summary-row">
        <span class="sa-label">Approach:</span>
        <span class="sa-value">${escapeHtml(recommendation.approach)}</span>
      </div>
      <div class="sa-summary-row">
        <span class="sa-label">Difficulty:</span>
        <span class="sa-difficulty" style="color: ${difficultyColors[recommendation.difficulty] || '#6b7280'}">
          ${difficultyLabels[recommendation.difficulty] || 'Unknown'}
        </span>
      </div>
      <div class="sa-summary-row">
        <span class="sa-label">Data Delivery:</span>
        <span class="sa-value">${escapeHtml(formatDeliveryMethod(result.dataDelivery.dataDeliveryMethod))}</span>
      </div>
    </div>
  `;

  // Anti-bot detections
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Anti-Bot &amp; Security</div>`;
  if (result.antiBotDetections.length > 0) {
    for (const detection of result.antiBotDetections) {
      const icon =
        detection.category === 'captcha'
          ? '&#9888;'
          : detection.category === 'waf'
            ? '&#128737;'
            : '&#9940;';
      const categoryLabel =
        detection.category === 'captcha'
          ? 'CAPTCHA'
          : detection.category === 'waf'
            ? 'WAF'
            : 'Anti-Bot';
      html += `
        <div class="sa-detection">
          <span class="sa-detection-icon">${icon}</span>
          <div class="sa-detection-info">
            <span class="sa-detection-name">${escapeHtml(detection.name)}</span>
            <span class="sa-detection-meta">${escapeHtml(categoryLabel)} &middot; ${detection.confidence}% confidence</span>
            <span class="sa-detection-evidence">${escapeHtml(detection.evidence)}</span>
          </div>
        </div>
      `;
    }
  } else {
    html += `<div class="sa-evidence sa-empty">None detected</div>`;
  }
  html += `</div>`;

  // Technologies
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Technologies</div>`;
  if (result.technologies.length > 0) {
    html += `<div class="sa-tech-chips">`;
    for (const tech of result.technologies) {
      const categoryClass = `sa-tech-${escapeHtml(tech.category)}`;
      html += `<span class="sa-tech-chip ${categoryClass}" title="${escapeHtml(tech.evidence)}">${escapeHtml(tech.name)}</span>`;
    }
    html += `</div>`;
  } else {
    html += `<div class="sa-evidence sa-empty">None detected</div>`;
  }
  html += `</div>`;

  // API Endpoints
  const apiEndpoints = result.interceptedRequests.endpoints.filter((e) => {
    const url = e.endpoint.toLowerCase();
    return (
      url.includes('/api/') ||
      url.includes('/graphql') ||
      url.includes('.json') ||
      url.includes('/v1/') ||
      url.includes('/v2/') ||
      url.includes('/rest/') ||
      e.methods.includes('POST')
    );
  });

  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">API Endpoints (${apiEndpoints.length})</div>`;
  if (apiEndpoints.length > 0) {
    for (const ep of apiEndpoints.slice(0, 15)) {
      const methods = escapeHtml(ep.methods.join(', '));
      const displayUrl = truncateUrl(ep.endpoint, 60);
      html += `
        <div class="sa-endpoint">
          <span class="sa-endpoint-method">${methods}</span>
          <a class="sa-endpoint-url" href="${escapeHtml(ep.endpoint)}" target="_blank" rel="noopener" title="${escapeHtml(ep.endpoint)}">${escapeHtml(displayUrl)}</a>
          ${ep.count > 1 ? `<span class="sa-endpoint-count">&times;${ep.count}</span>` : ''}
        </div>
      `;
    }
    if (apiEndpoints.length > 15) {
      html += `<div class="sa-more">+${apiEndpoints.length - 15} more endpoints</div>`;
    }
  } else {
    html += `<div class="sa-evidence sa-empty">No API endpoints captured</div>`;
  }
  html += `</div>`;

  // Other network requests (non-API)
  const otherEndpoints = result.interceptedRequests.endpoints.filter((e) => {
    const url = e.endpoint.toLowerCase();
    return !(
      url.includes('/api/') ||
      url.includes('/graphql') ||
      url.includes('.json') ||
      url.includes('/v1/') ||
      url.includes('/v2/') ||
      url.includes('/rest/') ||
      e.methods.includes('POST')
    );
  });

  html += `<div class="sa-section sa-collapsible" data-collapsed="true">`;
  html += `<div class="sa-section-title sa-toggle">Other Requests (${otherEndpoints.length}) <span class="sa-chevron">&#9654;</span></div>`;
  html += `<div class="sa-collapsible-content" style="display: none;">`;
  if (otherEndpoints.length > 0) {
    for (const ep of otherEndpoints.slice(0, 20)) {
      const methods = escapeHtml(ep.methods.join(', '));
      const displayUrl = truncateUrl(ep.endpoint, 60);
      html += `
        <div class="sa-endpoint">
          <span class="sa-endpoint-method">${methods}</span>
          <a class="sa-endpoint-url" href="${escapeHtml(ep.endpoint)}" target="_blank" rel="noopener" title="${escapeHtml(ep.endpoint)}">${escapeHtml(displayUrl)}</a>
        </div>
      `;
    }
    if (otherEndpoints.length > 20) {
      html += `<div class="sa-more">+${otherEndpoints.length - 20} more</div>`;
    }
  } else {
    html += `<div class="sa-evidence sa-empty">No other requests captured</div>`;
  }
  html += `</div></div>`;

  // Pagination section
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Pagination</div>`;
  if (result.pagination.patterns.length > 0) {
    for (const pattern of result.pagination.patterns) {
      html += `<div class="sa-evidence">${escapeHtml(pattern)}</div>`;
    }
  } else {
    html += `<div class="sa-evidence sa-empty">No pagination patterns detected</div>`;
  }
  html += `</div>`;

  // Authentication section
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Authentication &amp; Access</div>`;
  if (result.authentication.indicators.length > 0) {
    for (const indicator of result.authentication.indicators) {
      html += `<div class="sa-evidence sa-warning">${escapeHtml(indicator)}</div>`;
    }
  } else {
    html += `<div class="sa-evidence sa-empty">No authentication requirements detected</div>`;
  }
  html += `</div>`;

  // Rate Limiting section
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Rate Limiting</div>`;
  if (result.rateLimiting.detected) {
    for (const header of result.rateLimiting.headers) {
      html += `
        <div class="sa-endpoint">
          <span class="sa-endpoint-method">${escapeHtml(header.name)}</span>
          <span class="sa-endpoint-url">${escapeHtml(header.value)} (from ${escapeHtml(truncateUrl(header.source, 50))})</span>
        </div>
      `;
    }
  } else {
    html += `<div class="sa-evidence sa-empty">No rate limit headers detected</div>`;
  }
  html += `</div>`;

  // robots.txt section
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">robots.txt</div>`;
  if (result.robotsTxt?.found) {
    if (result.robotsTxt.fullyBlocked) {
      html += `<div class="sa-evidence sa-negative">Crawling fully blocked (Disallow: /)</div>`;
    } else {
      html += `<div class="sa-evidence sa-positive">Crawling allowed</div>`;
    }
    if (result.robotsTxt.crawlDelay !== null) {
      html += `<div class="sa-evidence">Crawl-delay: ${escapeHtml(String(result.robotsTxt.crawlDelay))}s</div>`;
    }
    if (result.robotsTxt.keyDisallows.length > 0 && !result.robotsTxt.fullyBlocked) {
      const disallowsToShow = result.robotsTxt.keyDisallows.slice(0, 10);
      for (const path of disallowsToShow) {
        html += `<div class="sa-evidence sa-warning">Disallow: ${escapeHtml(path)}</div>`;
      }
      if (result.robotsTxt.keyDisallows.length > 10) {
        html += `<div class="sa-more">+${result.robotsTxt.keyDisallows.length - 10} more rules</div>`;
      }
    }
  } else {
    html += `<div class="sa-evidence sa-empty">Not found or not accessible</div>`;
  }
  html += `</div>`;

  // Sitemaps section
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Sitemaps</div>`;
  if (result.robotsTxt?.sitemapUrls && result.robotsTxt.sitemapUrls.length > 0) {
    for (const sitemapUrl of result.robotsTxt.sitemapUrls) {
      html += `
        <div class="sa-endpoint">
          <a class="sa-endpoint-url" href="${escapeHtml(sitemapUrl)}" target="_blank" rel="noopener" title="${escapeHtml(sitemapUrl)}">${escapeHtml(truncateUrl(sitemapUrl, 60))}</a>
        </div>
      `;
    }
  } else {
    html += `<div class="sa-evidence sa-empty">No sitemaps found in robots.txt</div>`;
  }
  html += `</div>`;

  // Cookie Overview section
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Cookies (${result.cookies.total})</div>`;
  if (result.cookies.total > 0) {
    for (const cat of result.cookies.categories) {
      const names = cat.names.slice(0, 5).join(', ');
      const more = cat.names.length > 5 ? ` +${cat.names.length - 5} more` : '';
      html += `<div class="sa-evidence">${escapeHtml(cat.category)}: ${escapeHtml(names)}${escapeHtml(more)}</div>`;
    }
  } else {
    html += `<div class="sa-evidence">No cookies visible to JavaScript</div>`;
  }
  html += `<div class="sa-evidence" style="font-style: italic; opacity: 0.7">${escapeHtml(result.cookies.note)}</div>`;
  html += `</div>`;

  // Data delivery details
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Data Delivery</div>`;
  for (const ev of result.dataDelivery.evidence) {
    html += `<div class="sa-evidence">${escapeHtml(ev)}</div>`;
  }
  if (result.dataDelivery.hasStructuredData) {
    html += `<div class="sa-evidence sa-positive">JSON-LD: ${escapeHtml(result.dataDelivery.structuredDataTypes.join(', '))}</div>`;
  }
  html += `</div>`;

  // Recommendations
  html += `<div class="sa-section sa-recommendations">`;
  html += `<div class="sa-section-title">Recommendations</div>`;
  for (const detail of recommendation.details) {
    html += `<div class="sa-rec-item">${escapeHtml(detail)}</div>`;
  }
  if (recommendation.tools.length > 0) {
    html += `<div class="sa-tools-title">Suggested Tools:</div>`;
    for (const tool of recommendation.tools) {
      html += `<div class="sa-tool-item">${escapeHtml(tool)}</div>`;
    }
  }
  html += `</div>`;

  // Show reload hint if intercepted requests are empty (MAIN world may not have been present)
  if (result.interceptedRequests.totalRequests === 0) {
    html += `
      <div class="sa-reload-hint">
        <span class="sa-reload-icon">&#x1f504;</span>
        <span class="sa-reload-text">Reload the page and re-analyze to capture API endpoints and network requests. The request interceptor needs to be present from page load.</span>
      </div>
    `;
  }

  container.innerHTML = html;

  // Add collapsible toggle handlers
  container.querySelectorAll('.sa-toggle').forEach((toggle) => {
    toggle.addEventListener('click', () => {
      const section = toggle.closest('.sa-collapsible');
      if (!section) return;
      const content = section.querySelector('.sa-collapsible-content') as HTMLElement;
      const chevron = toggle.querySelector('.sa-chevron') as HTMLElement;
      const collapsed = section.getAttribute('data-collapsed') === 'true';
      section.setAttribute('data-collapsed', collapsed ? 'false' : 'true');
      content.style.display = collapsed ? 'block' : 'none';
      if (chevron) chevron.innerHTML = collapsed ? '&#9660;' : '&#9654;';
    });
  });
}

// ============================================================================
// Helpers
// ============================================================================

function formatDeliveryMethod(method: string): string {
  switch (method) {
    case 'server-rendered':
      return 'Server-Rendered HTML';
    case 'spa-api':
      return 'Single-Page App (API)';
    case 'hybrid':
      return 'Hybrid (SSR + API)';
    default:
      return 'Unknown';
  }
}

function truncateUrl(url: string, maxLen: number): string {
  if (url.length <= maxLen) return url;
  return url.substring(0, maxLen - 3) + '...';
}

/**
 * Parse robots.txt content into a structured summary.
 */
function parseRobotsTxt(text: string): RobotsTxtAnalysis {
  const lines = text.split('\n').map((l) => l.trim());
  const sitemapUrls: string[] = [];
  const keyDisallows: string[] = [];
  let crawlDelay: number | null = null;
  let fullyBlocked = false;
  let inWildcardAgent = false;

  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || !line) continue;

    const lower = line.toLowerCase();

    // Sitemap directives (global)
    if (lower.startsWith('sitemap:')) {
      const url = line.substring(8).trim();
      if (url) sitemapUrls.push(url);
      continue;
    }

    // Track User-agent blocks
    if (lower.startsWith('user-agent:')) {
      const agent = line.substring(11).trim();
      inWildcardAgent = agent === '*';
      continue;
    }

    // Only process rules under User-agent: *
    if (!inWildcardAgent) continue;

    if (lower.startsWith('disallow:')) {
      const path = line.substring(9).trim();
      if (path === '/') {
        fullyBlocked = true;
      }
      if (path) {
        keyDisallows.push(path);
      }
    }

    if (lower.startsWith('crawl-delay:')) {
      const val = parseFloat(line.substring(12).trim());
      if (!isNaN(val)) {
        crawlDelay = val;
      }
    }
  }

  return {
    found: true,
    fullyBlocked,
    crawlDelay,
    sitemapUrls,
    keyDisallows: keyDisallows.slice(0, 20), // Limit to 20 key paths
  };
}
