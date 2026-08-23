import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { normalizePhrase } from "./build-copycat-baseline.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const configPath = resolve(repositoryRoot, "copycat-watch/config.json");
const baselinePath = resolve(repositoryRoot, "copycat-watch/baseline.json");

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function mapLimit(values, limit, worker) {
  const results = new Array(values.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      results[index] = await worker(values[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function scanTargetUrl(url, baseline, fetchImpl = fetch) {
  const response = await fetchImpl(url, {
    headers: { "User-Agent": "ARCANEUM-Copycat-Watch/1.0" },
    redirect: "follow",
  });
  if (!response.ok) return { url, status: "unavailable", http_status: response.status, findings: [] };

  const contentType = response.headers.get("content-type") || "";
  const bytes = Buffer.from(await response.arrayBuffer());
  const text = contentType.includes("text/") || contentType.includes("json") ? bytes.toString("utf8") : "";
  const normalizedText = normalizePhrase(text.replace(/<[^>]+>/g, " "));
  const findings = [];

  for (const phrase of baseline.phrases) {
    if (normalizedText.includes(normalizePhrase(phrase.text))) {
      findings.push({ kind: "signature_phrase", severity: "high", protected_id: phrase.id });
    }
  }
  const digest = sha256(bytes);
  for (const image of baseline.images) {
    if (digest === image.sha256) {
      findings.push({ kind: "exact_image", severity: "high", protected_path: image.path });
    }
  }

  return { url, status: "checked", http_status: response.status, findings };
}

async function resolveDomain(domain) {
  try {
    const response = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=A`, {
      headers: { accept: "application/dns-json" },
    });
    const body = await response.json();
    return body.Status === 0 && Array.isArray(body.Answer) && body.Answer.length > 0
      ? { domain, registered_or_resolving: true, answers: body.Answer.map((answer) => answer.data) }
      : null;
  } catch {
    return null;
  }
}

async function searchGitHubPhrase(phrase, canonicalRepository, token) {
  if (!token) return { status: "skipped", reason: "GITHUB_TOKEN unavailable", findings: [] };
  const query = `\"${phrase.text}\" in:file`;
  const response = await fetch(`https://api.github.com/search/code?q=${encodeURIComponent(query)}&per_page=20`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "user-agent": "ARCANEUM-Copycat-Watch/1.0",
      "x-github-api-version": "2022-11-28",
    },
  });
  if (!response.ok) return { status: "unavailable", http_status: response.status, findings: [] };
  const body = await response.json();
  const findings = (body.items || [])
    .filter((item) => item.repository?.full_name !== canonicalRepository)
    .map((item) => ({
      kind: "repository_phrase_match",
      severity: "high",
      protected_id: phrase.id,
      repository: item.repository?.full_name,
      url: item.html_url,
    }));
  return { status: "checked", findings };
}

function optionValue(prefix) {
  const argument = process.argv.find((value) => value.startsWith(`${prefix}=`));
  return argument ? argument.slice(prefix.length + 1) : null;
}

async function main() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
  const live = process.argv.includes("--live");
  const configuredTargets = [...config.watch_urls];
  const environmentTargets = String(process.env.COPYCAT_WATCH_URLS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const targets = [...new Set([...configuredTargets, ...environmentTargets])];

  const targetResults = await mapLimit(targets, 5, (url) => scanTargetUrl(url, baseline));
  const domainResults = live
    ? (await mapLimit(baseline.lookalike_domains, 8, resolveDomain)).filter(Boolean)
    : [];
  const repositoryResults = live
    ? await mapLimit(baseline.phrases.slice(0, 4), 2, (phrase) =>
        searchGitHubPhrase(phrase, baseline.canonical_repository, process.env.GITHUB_TOKEN),
      )
    : [];

  const findings = [
    ...targetResults.flatMap((result) => result.findings),
    ...domainResults.map((result) => ({ kind: "lookalike_domain", severity: "medium", ...result })),
    ...repositoryResults.flatMap((result) => result.findings),
  ];
  const report = {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    mode: live ? "live" : "offline",
    capabilities: {
      signature_phrase_targets: targets.length > 0,
      exact_image_targets: targets.length > 0,
      lookalike_domain_dns: live,
      public_github_code_search: live && Boolean(process.env.GITHUB_TOKEN),
    },
    targets: targetResults,
    repository_searches: repositoryResults,
    findings,
  };

  const reportPath = optionValue("--report");
  if (reportPath) {
    const absoluteReportPath = resolve(repositoryRoot, reportPath);
    await mkdir(dirname(absoluteReportPath), { recursive: true });
    await writeFile(absoluteReportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Copycat Watch wrote ${reportPath} with ${findings.length} finding(s).`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
