/**
 * EventAtlas Capture - Site Analyzer Module
 *
 * Orchestrates website analysis from the side panel.
 * Triggers content script analysis, processes results,
 * and renders the analysis UI.
 */

// ============================================================================
// Types
// ============================================================================

export interface AntiBotDetection {
  name: string;
  category: 'antibot' | 'captcha' | 'waf';
  confidence: number;
  evidence: string;
}

export interface TechDetection {
  name: string;
  category: 'framework' | 'cms' | 'ecommerce' | 'analytics' | 'hosting';
  confidence: number;
  evidence: string;
}

export interface InterceptedEndpoint {
  endpoint: string;
  methods: string[];
  count: number;
  sampleUrls: string[];
}

export interface DataDeliveryAnalysis {
  hasStructuredData: boolean;
  structuredDataTypes: string[];
  hasServerRenderedContent: boolean;
  hasSPAIndicators: boolean;
  hasAPIDataInPage: boolean;
  contentSize: {
    html: number;
    text: number;
    ratio: number;
  };
  dataDeliveryMethod: 'server-rendered' | 'spa-api' | 'hybrid' | 'unknown';
  evidence: string[];
}

export interface SiteAnalysisResult {
  antiBotDetections: AntiBotDetection[];
  technologies: TechDetection[];
  dataDelivery: DataDeliveryAnalysis;
  headers: {
    securityHeaders: string[];
    serverInfo: string | null;
    cachePolicy: string | null;
  };
  interceptedRequests: {
    totalRequests: number;
    endpoints: InterceptedEndpoint[];
  };
  windowProperties: Record<string, string>;
  analyzedAt: string;
  url: string;
}

export interface ScrapingRecommendation {
  approach: string;
  difficulty: 'easy' | 'moderate' | 'hard' | 'very-hard';
  details: string[];
  tools: string[];
}

// ============================================================================
// Analysis Logic
// ============================================================================

/**
 * Run site analysis on the current tab
 */
export async function analyzeSite(): Promise<SiteAnalysisResult | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url || tab.url.startsWith('chrome://')) {
      return null;
    }

    const response = await chrome.tabs.sendMessage(tab.id, { action: 'analyzeSite' });
    return response as SiteAnalysisResult;
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
        <span class="sa-value">${recommendation.approach}</span>
      </div>
      <div class="sa-summary-row">
        <span class="sa-label">Difficulty:</span>
        <span class="sa-difficulty" style="color: ${difficultyColors[recommendation.difficulty]}">
          ${difficultyLabels[recommendation.difficulty]}
        </span>
      </div>
      <div class="sa-summary-row">
        <span class="sa-label">Data Delivery:</span>
        <span class="sa-value">${formatDeliveryMethod(result.dataDelivery.dataDeliveryMethod)}</span>
      </div>
    </div>
  `;

  // Anti-bot detections
  if (result.antiBotDetections.length > 0) {
    html += `<div class="sa-section">`;
    html += `<div class="sa-section-title">Anti-Bot &amp; Security</div>`;
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
            <span class="sa-detection-name">${detection.name}</span>
            <span class="sa-detection-meta">${categoryLabel} &middot; ${detection.confidence}% confidence</span>
          </div>
        </div>
      `;
    }
    html += `</div>`;
  }

  // Technologies
  if (result.technologies.length > 0) {
    html += `<div class="sa-section">`;
    html += `<div class="sa-section-title">Technologies</div>`;
    html += `<div class="sa-tech-chips">`;
    for (const tech of result.technologies) {
      const categoryClass = `sa-tech-${tech.category}`;
      html += `<span class="sa-tech-chip ${categoryClass}" title="${tech.evidence}">${tech.name}</span>`;
    }
    html += `</div></div>`;
  }

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

  if (apiEndpoints.length > 0) {
    html += `<div class="sa-section">`;
    html += `<div class="sa-section-title">API Endpoints (${apiEndpoints.length})</div>`;
    for (const ep of apiEndpoints.slice(0, 15)) {
      const methods = ep.methods.join(', ');
      const displayUrl = truncateUrl(ep.endpoint, 60);
      html += `
        <div class="sa-endpoint">
          <span class="sa-endpoint-method">${methods}</span>
          <span class="sa-endpoint-url" title="${escapeHtml(ep.endpoint)}">${escapeHtml(displayUrl)}</span>
          ${ep.count > 1 ? `<span class="sa-endpoint-count">&times;${ep.count}</span>` : ''}
        </div>
      `;
    }
    if (apiEndpoints.length > 15) {
      html += `<div class="sa-more">+${apiEndpoints.length - 15} more endpoints</div>`;
    }
    html += `</div>`;
  }

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

  if (otherEndpoints.length > 0) {
    html += `<div class="sa-section sa-collapsible" data-collapsed="true">`;
    html += `<div class="sa-section-title sa-toggle">Other Requests (${otherEndpoints.length}) <span class="sa-chevron">&#9654;</span></div>`;
    html += `<div class="sa-collapsible-content" style="display: none;">`;
    for (const ep of otherEndpoints.slice(0, 20)) {
      const methods = ep.methods.join(', ');
      const displayUrl = truncateUrl(ep.endpoint, 60);
      html += `
        <div class="sa-endpoint">
          <span class="sa-endpoint-method">${methods}</span>
          <span class="sa-endpoint-url" title="${escapeHtml(ep.endpoint)}">${escapeHtml(displayUrl)}</span>
        </div>
      `;
    }
    if (otherEndpoints.length > 20) {
      html += `<div class="sa-more">+${otherEndpoints.length - 20} more</div>`;
    }
    html += `</div></div>`;
  }

  // Data delivery details
  html += `<div class="sa-section">`;
  html += `<div class="sa-section-title">Data Delivery</div>`;
  for (const ev of result.dataDelivery.evidence) {
    html += `<div class="sa-evidence">${escapeHtml(ev)}</div>`;
  }
  if (result.dataDelivery.hasStructuredData) {
    html += `<div class="sa-evidence sa-positive">JSON-LD: ${result.dataDelivery.structuredDataTypes.join(', ')}</div>`;
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

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
