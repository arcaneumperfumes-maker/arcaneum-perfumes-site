import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPageViewEvent,
  classifyReferrer,
  getOrCreateIdentity,
  isUuid,
  normalizeCountryCode,
  normalizePath,
  privacySignalEnabled,
  trackPageView,
} from "../analytics.js";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.has(key) ? this.#values.get(key) : null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

test("normalizes paths without query strings or fragments", () => {
  assert.equal(normalizePath("fragrances/vesper-glass/?secret=1#notes"), "/fragrances/vesper-glass/");
  assert.equal(normalizePath(""), "/");
});

test("classifies direct, internal, search, social, and referral traffic", () => {
  const origin = "https://arcaneumperfumes.com";
  assert.deepEqual(classifyReferrer("", origin), { referrerHost: null, referrerSource: "direct" });
  assert.deepEqual(classifyReferrer("https://arcaneumperfumes.com/privacy.html", origin), {
    referrerHost: null,
    referrerSource: "internal",
  });
  assert.equal(classifyReferrer("https://www.google.com/search?q=arcaneum", origin).referrerSource, "search");
  assert.equal(classifyReferrer("https://instagram.com/arcaneum", origin).referrerSource, "social");
  assert.deepEqual(classifyReferrer("https://example.com/article?email=private", origin), {
    referrerHost: "example.com",
    referrerSource: "referral",
  });
});

test("creates persistent visitor and session identifiers without fingerprinting", () => {
  const localStore = new MemoryStorage();
  const sessionStore = new MemoryStorage();
  const first = getOrCreateIdentity(localStore, sessionStore);
  const second = getOrCreateIdentity(localStore, sessionStore);
  assert.ok(isUuid(first.visitorId));
  assert.ok(isUuid(first.sessionId));
  assert.equal(second.visitorId, first.visitorId);
  assert.equal(second.sessionId, first.sessionId);
  assert.equal(first.returningVisit, false);
  assert.equal(second.returningVisit, false);

  const newSession = getOrCreateIdentity(localStore, new MemoryStorage());
  assert.equal(newSession.visitorId, first.visitorId);
  assert.equal(newSession.returningVisit, true);
});

test("builds a privacy-minimized page-view event", () => {
  const event = buildPageViewEvent({
    documentLike: {
      title: "Vesper Glass — The Story | ARCANEUM Perfumes",
      referrer: "https://example.com/story?reader=someone@example.com",
    },
    locationLike: {
      origin: "https://arcaneumperfumes.com",
      pathname: "/fragrances/vesper-glass/",
    },
    visitorId: "11111111-1111-4111-8111-111111111111",
    sessionId: "22222222-2222-4222-8222-222222222222",
    returningVisit: true,
    countryCode: "us",
  });

  assert.equal(event.path, "/fragrances/vesper-glass/");
  assert.equal(event.referrer_host, "example.com");
  assert.equal(event.country_code, "US");
  assert.equal(event.returning_visit, true);
  assert.ok(!JSON.stringify(event).includes("someone@example.com"));
  assert.ok(!Object.keys(event).some((key) => key.includes("ip")));
});

test("honors Global Privacy Control, Do Not Track, and explicit opt-out", () => {
  const storage = new MemoryStorage();
  assert.equal(privacySignalEnabled({ globalPrivacyControl: true }, storage), true);
  assert.equal(privacySignalEnabled({ doNotTrack: "1" }, storage), true);
  storage.setItem("arcaneum_analytics_opt_out", "1");
  assert.equal(privacySignalEnabled({}, storage), true);
});

test("posts one minimized event to the configured preview endpoint", async () => {
  const requests = [];
  const localStorage = new MemoryStorage();
  const sessionStorage = new MemoryStorage();
  const windowLike = {
    __ARCANEUM_ANALYTICS_CONFIG__: {
      endpoint: "https://example.test/rest/v1/arcaneum_page_views",
      publishableKey: "test-key",
    },
    document: {
      title: "ARCANEUM Perfumes",
      referrer: "",
      querySelector: () => null,
    },
    location: {
      hostname: "terminal.local",
      origin: "http://terminal.local:4173",
      pathname: "/",
    },
    navigator: {},
    localStorage,
    sessionStorage,
  };
  const result = await trackPageView({
    windowLike,
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return new Response(null, { status: 201 });
    },
  });

  assert.equal(result.status, "recorded");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://example.test/rest/v1/arcaneum_page_views");
  assert.equal(requests[0].init.headers.apikey, "test-key");
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.path, "/");
  assert.ok(!("raw_ip" in body));
});

test("accepts country codes only when an authoritative two-letter code is available", () => {
  assert.equal(normalizeCountryCode("gb"), "GB");
  assert.equal(normalizeCountryCode("United States"), null);
  assert.equal(normalizeCountryCode(""), null);
});
