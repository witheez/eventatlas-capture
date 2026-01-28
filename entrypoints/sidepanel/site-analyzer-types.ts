/**
 * EventAtlas Capture - Site Analyzer Shared Types
 *
 * Shared type definitions used by both the side panel site-analyzer module
 * and the content scripts (collector + main world).
 */

// ============================================================================
// Detection Types
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

export interface PaginationAnalysis {
  hasNextPrev: boolean;
  hasLoadMore: boolean;
  hasInfiniteScroll: boolean;
  hasPageParams: boolean;
  patterns: string[];
}

export interface AuthenticationAnalysis {
  hasLoginForm: boolean;
  hasPaywall: boolean;
  hasOAuth: boolean;
  indicators: string[];
}

export interface RateLimitHeader {
  name: string;
  value: string;
  source: string;
}

export interface RateLimitingAnalysis {
  detected: boolean;
  headers: RateLimitHeader[];
}

export interface RobotsTxtAnalysis {
  found: boolean;
  fullyBlocked: boolean;
  crawlDelay: number | null;
  sitemapUrls: string[];
  keyDisallows: string[];
}

export interface CookieCategory {
  category: string;
  names: string[];
  count: number;
}

export interface CookieAnalysis {
  total: number;
  categories: CookieCategory[];
  hasSessionCookies: boolean;
  hasAuthCookies: boolean;
  note: string;
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
  pagination: PaginationAnalysis;
  authentication: AuthenticationAnalysis;
  rateLimiting: RateLimitingAnalysis;
  robotsTxt: RobotsTxtAnalysis | null;
  cookies: CookieAnalysis;
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
// Message Types (for communication between scripts)
// ============================================================================

export const SITE_ANALYZER_CHANNEL = 'eventatlas-site-analyzer';

export interface SiteAnalyzerMessage {
  channel: typeof SITE_ANALYZER_CHANNEL;
  action: string;
  data?: unknown;
  requestId?: string;
}
