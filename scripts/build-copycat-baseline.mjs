import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const configPath = join(repositoryRoot, "copycat-watch", "config.json");
const baselinePath = join(repositoryRoot, "copycat-watch", "baseline.json");
const FINGERPRINT_EXTENSIONS = new Set([".css", ".html", ".js", ".svg", ".webp"]);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizePhrase(value) {
  return String(value)
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function generateLookalikeDomains(canonicalDomain, tlds, limit = 80) {
  const [label] = canonicalDomain.toLowerCase().split(".");
  const variants = new Set();

  for (let index = 0; index < label.length; index += 1) {
    variants.add(label.slice(0, index) + label.slice(index + 1));
    variants.add(label.slice(0, index) + label[index] + label.slice(index));
    if (index < label.length - 1 && label[index] !== label[index + 1]) {
      variants.add(
        label.slice(0, index) + label[index + 1] + label[index] + label.slice(index + 2),
      );
    }
  }

  for (let index = 1; index < label.length; index += 1) {
    variants.add(`${label.slice(0, index)}-${label.slice(index)}`);
  }

  const substitutions = new Map([
    ["a", ["e", "o"]],
    ["e", ["a", "i"]],
    ["i", ["e", "l"]],
    ["o", ["a", "0"]],
    ["u", ["v"]],
    ["m", ["n"]],
    ["n", ["m"]],
  ]);
  for (let index = 0; index < label.length; index += 1) {
    for (const replacement of substitutions.get(label[index]) || []) {
      variants.add(label.slice(0, index) + replacement + label.slice(index + 1));
    }
  }

  variants.delete(label);
  return [...variants]
    .filter((variant) => variant.length > 2 && !variant.startsWith("-") && !variant.endsWith("-"))
    .flatMap((variant) => tlds.map((tld) => `${variant}.${tld}`))
    .filter((domain) => domain !== canonicalDomain)
    .slice(0, limit);
}

async function collectFingerprintFiles(rootPath) {
  const info = await stat(rootPath);
  if (info.isFile()) return FINGERPRINT_EXTENSIONS.has(extname(rootPath)) ? [rootPath] : [];

  const files = [];
  for (const entry of await readdir(rootPath, { withFileTypes: true })) {
    const entryPath = join(rootPath, entry.name);
    if (entry.isDirectory()) files.push(...(await collectFingerprintFiles(entryPath)));
    else if (FINGERPRINT_EXTENSIONS.has(extname(entry.name))) files.push(entryPath);
  }
  return files;
}

export async function buildBaseline(config, root = repositoryRoot) {
  const phrases = config.protected_phrases.map(({ id, text }) => ({
    id,
    text,
    normalized_sha256: sha256(normalizePhrase(text)),
  }));

  const images = [];
  for (const imagePath of config.protected_images) {
    const bytes = await readFile(join(root, imagePath));
    images.push({ path: imagePath, sha256: sha256(bytes), bytes: bytes.byteLength });
  }

  const fingerprintFiles = (
    await Promise.all(
      config.repository_fingerprint_roots.map((entry) => collectFingerprintFiles(join(root, entry))),
    )
  )
    .flat()
    .sort();
  const fileDigests = [];
  for (const filePath of fingerprintFiles) {
    const path = relative(root, filePath).replaceAll("\\", "/");
    fileDigests.push({ path, sha256: sha256(await readFile(filePath)) });
  }
  const repositorySha256 = sha256(
    fileDigests.map(({ path, sha256: digest }) => `${path}\0${digest}`).join("\n"),
  );

  return {
    schema_version: 1,
    canonical_domain: config.brand.canonical_domain,
    canonical_repository: config.brand.canonical_repository,
    phrases,
    images,
    repository: {
      sha256: repositorySha256,
      files: fileDigests,
    },
    lookalike_domains: generateLookalikeDomains(
      config.brand.canonical_domain,
      config.lookalike_domains.tlds,
      config.lookalike_domains.maximum_candidates,
    ),
  };
}

async function main() {
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const baseline = await buildBaseline(config);
  const serialized = `${JSON.stringify(baseline, null, 2)}\n`;

  if (process.argv.includes("--check")) {
    const existing = await readFile(baselinePath, "utf8").catch(() => "");
    if (existing !== serialized) {
      console.error("Copycat Watch baseline is stale. Run npm run copycat:baseline.");
      process.exitCode = 1;
      return;
    }
    console.log("Copycat Watch baseline is current.");
    return;
  }

  const { writeFile } = await import("node:fs/promises");
  await writeFile(baselinePath, serialized);
  console.log(`Wrote ${relative(repositoryRoot, baselinePath)}.`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
