export {
  isPrivateIp,
  unwrapWebVpnUrl,
  assertPublicHttpUrl,
  normalizeUrl,
  type UnwrapWebVpnResult,
} from "./utils/ssrf.js";

export {
  DomainRateLimiter,
  defaultRateLimiter,
  type RateLimiterOptions,
} from "./fetchers/rate-limiter.js";

export { detectCmsFingerprint } from "./fetchers/cms-detector.js";

export {
  DEFAULT_CRAWLER_UA,
  politeFetchHtml,
  politeFetchText,
  validateImageUrl,
  type PoliteFetchOptions,
  type FetchedHtmlResult,
} from "./fetchers/http-fetcher.js";

export {
  CN_UNIVERSITY_DOMAINS,
  type KnownUniversityMeta,
} from "./data/cn-university-domains.js";

export {
  fetchSoftScienceTop100,
  syncSoftScienceToDb,
  type SoftScienceUniversityItem,
} from "./adapters/softscience.js";

export {
  probeUniversity,
  type ProbedSubdomainHit,
  type ProbedCollegeCandidate,
  type ProbeUniversityResult,
} from "./adapters/university-probe.js";

export {
  extractFacultyListFromHtml,
  extractAdvisorDetailFromHtml,
  extractNoticesFromHtml,
  extractNoticesFromRssXml,
  type FacultyListCandidate,
  type FacultyListExtractResult,
  type ExtractedAdvisorDetail,
  type ExtractedNoticeItem,
  type NoticeExtractResult,
  type DictionarySets,
} from "./extractors/rules.js";

export { mergeWithLockedFields } from "./merger/field-lock.js";

export {
  LocalDiskStorage,
  createStorageAdapter,
  type StorageAdapter,
  type StoragePutResult,
} from "./storage/adapter.js";

export {
  crawlCollegeRuleFirst,
  type CrawlCollegeRunResult,
} from "./pipelines/crawl-college.js";
