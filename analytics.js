const SUPABASE_URL = "https://xfefiwmzzvuacnxfoyrq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_DbNhTV5AwiAWvZqDsGILGw_3swtoHsQ";
const VISITOR_KEY = "arcaneum_visitor_v1";
const SESSION_KEY = "arcaneum_session_v1";
const OPT_OUT_KEY = "arcaneum_analytics_opt_out";

const SEARCH_HOSTS = [
  "bing.com",
  "duckduckgo.com",
  "google.com",
  "search.brave.com",
  "yahoo.com",
  "yandex.com",
];

const SOCIAL_HOSTS = [
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "pinterest.com",
  "reddit.com",
  "t.co",
  "threads.net",
  "tiktok.com",
  "x.com",
  "youtube.com",
];

export function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function createUuid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function safeStorage(storage) {
  try {
    const probe = "__arcaneum_storage_probe__";
    storage.setItem(probe, "1");
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
}

export function getOrCreateIdentity(localStore, sessionStore) {
  const storedVisitor = localStore?.getItem(VISITOR_KEY) || "";
  const storedSession = sessionStore?.getItem(SESSION_KEY) || "";
  const visitorId = isUuid(storedVisitor) ? storedVisitor : createUuid();
  const sessionId = isUuid(storedSession) ? storedSession : createUuid();

  if (!isUuid(storedVisitor)) localStore?.setItem(VISITOR_KEY, visitorId);
  if (!isUuid(storedSession)) sessionStore?.setItem(SESSION_KEY, sessionId);

  return {
    visitorId,
    sessionId,
    returningVisit: isUuid(storedVisitor) && !isUuid(storedSession),
  };
}

export function normalizePath(pathname) {
  const raw = String(pathname || "/").split(/[?#]/, 1)[0] || "/";
  const withLeadingSlash = raw.startsWith("/") ? raw : `/${raw}`;
  return withLeadingSlash.slice(0, 300);
}

function hostnameMatches(hostname, knownHost) {
  return hostname === knownHost || hostname.endsWith(`.${knownHost}`);
}

export function classifyReferrer(referrer, currentOrigin) {
  if (!referrer) return { referrerHost: null, referrerSource: "direct" };

  try {
    const referrerUrl = new URL(referrer);
    const currentUrl = new URL(currentOrigin);
    const hostname = referrerUrl.hostname.toLowerCase().replace(/^www\./, "");
    const currentHostname = currentUrl.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === currentHostname) {
      return { referrerHost: null, referrerSource: "internal" };
    }
    if (SEARCH_HOSTS.some((host) => hostnameMatches(hostname, host))) {
      return { referrerHost: hostname, referrerSource: "search" };
    }
    if (SOCIAL_HOSTS.some((host) => hostnameMatches(hostname, host))) {
      return { referrerHost: hostname, referrerSource: "social" };
    }
    return { referrerHost: hostname.slice(0, 253), referrerSource: "referral" };
  } catch {
    return { referrerHost: null, referrerSource: "other" };
  }
}

export function normalizeCountryCode(value) {
  const code = String(value || "").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}

export function buildPageViewEvent({
  documentLike,
  locationLike,
  visitorId,
  sessionId,
  returningVisit,
  countryCode,
}) {
  const referrer = classifyReferrer(documentLike.referrer, locationLike.origin);
  return {
    event_id: createUuid(),
    visitor_id: visitorId,
    session_id: sessionId,
    path: normalizePath(locationLike.pathname),
    page_title: String(documentLike.title || "").slice(0, 200) || null,
    referrer_host: referrer.referrerHost,
    referrer_source: referrer.referrerSource,
    country_code: normalizeCountryCode(countryCode),
    returning_visit: Boolean(returningVisit),
  };
}

export function privacySignalEnabled(navigatorLike, localStore) {
  return (
    navigatorLike?.globalPrivacyControl === true ||
    navigatorLike?.doNotTrack === "1" ||
    localStore?.getItem(OPT_OUT_KEY) === "1"
  );
}

function runtimeConfig(windowLike) {
  const productionHost = /^(www\.)?arcaneumperfumes\.com$/i.test(windowLike.location.hostname);
  const override = productionHost ? null : windowLike.__ARCANEUM_ANALYTICS_CONFIG__;
  return {
    endpoint:
      override?.endpoint || `${SUPABASE_URL}/rest/v1/arcaneum_page_views`,
    publishableKey: override?.publishableKey || SUPABASE_PUBLISHABLE_KEY,
  };
}

export async function trackPageView({ windowLike = window, fetchImpl = fetch } = {}) {
  const documentLike = windowLike.document;
  const localStore = safeStorage(windowLike.localStorage);
  const sessionStore = safeStorage(windowLike.sessionStorage);

  if (windowLike.ARCANEUM_DISABLE_ANALYTICS === true) return { status: "disabled" };
  if (privacySignalEnabled(windowLike.navigator, localStore)) return { status: "opted_out" };
  if (!localStore || !sessionStore) return { status: "storage_unavailable" };

  const identity = getOrCreateIdentity(localStore, sessionStore);
  const metaCountry = documentLike.querySelector('meta[name="arcaneum-country"]')?.content;
  const event = buildPageViewEvent({
    documentLike,
    locationLike: windowLike.location,
    ...identity,
    countryCode: windowLike.ARCANEUM_COUNTRY_CODE || metaCountry,
  });
  const config = runtimeConfig(windowLike);

  try {
    const response = await fetchImpl(config.endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: config.publishableKey,
        Prefer: "return=minimal",
      },
      body: JSON.stringify(event),
      credentials: "omit",
      keepalive: true,
      referrerPolicy: "strict-origin-when-cross-origin",
    });
    return { status: response.ok ? "recorded" : "rejected", httpStatus: response.status, event };
  } catch {
    return { status: "unavailable", event };
  }
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  queueMicrotask(() => {
    trackPageView().catch(() => {});
  });
}
