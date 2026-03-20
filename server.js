import http from "node:http";
import { createReadStream, existsSync, readFileSync, statSync, promises as fs } from "node:fs";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { extname, join, normalize, relative } from "node:path";

loadDotEnv();

const port = Number(process.env.PORT) || 4000;
const root = process.cwd();
const imageCandidates = ["photo.jpg", "photo.jpeg", "photo.png", "photo.webp"];
const photoSource = process.env.PHOTO_SOURCE ?? "local";
const photoPasscode = process.env.PHOTO_PASSCODE ?? "";
const tokenSecret = process.env.TOKEN_SECRET ?? randomBytes(32).toString("hex");
const manifestPath = process.env.PHOTO_MANIFEST_PATH ?? join(root, "server-data", "photo-manifest.json");
const passcodeMapPath = process.env.PHOTO_PASSCODE_MAP_PATH ?? join(root, "server-data", "photo-passcodes.json");
const protectedPrefixes = ["/.git", "/server-data", "/photos"];

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const pathname = decodeURIComponent(requestUrl.pathname);

  try {
    if (pathname === "/api/photos/available" && request.method === "GET") {
      await handleAvailablePhotos(response);
      return;
    }

    if (pathname === "/api/photo-access" && request.method === "POST") {
      await handlePhotoAccess(request, response);
      return;
    }

    if (pathname === "/api/photo-file" && request.method === "GET") {
      await handleProtectedPhoto(requestUrl, response);
      return;
    }

    if (isProtectedPath(pathname)) {
      writeJson(response, 404, { error: "Not found" });
      return;
    }

    serveStaticFile(pathname, response);
  } catch (error) {
    console.error("Server error", error);
    writeJson(response, 500, { error: "Server error" });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Birthday map server running at http://localhost:${port}`);
});

async function handleAvailablePhotos(response) {
  const slugs = photoSource === "oss" ? await getManifestSlugs() : await getLocalAvailableSlugs();
  writeJson(response, 200, { slugs });
}

async function handlePhotoAccess(request, response) {
  const body = await readJsonBody(request);
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const passcode = typeof body.passcode === "string" ? body.passcode.trim() : "";

  if (!slug || !passcode) {
    writeJson(response, 400, { error: "Missing slug or passcode." });
    return;
  }

  const passcodes = await loadPasscodes();
  const expectedPasscode = passcodes[slug] ?? photoPasscode;

  if (!expectedPasscode) {
    writeJson(response, 500, {
      error: "PHOTO_PASSCODE or PHOTO_PASSCODE_MAP_PATH is not configured on the server."
    });
    return;
  }

  if (!matchesSecret(passcode, expectedPasscode)) {
    writeJson(response, 401, { error: "Wrong password." });
    return;
  }

  if (photoSource === "oss") {
    const imageUrl = await createOssSignedUrl(slug);

    if (!imageUrl) {
      writeJson(response, 404, { error: "No photo configured for this province." });
      return;
    }

    writeJson(response, 200, {
      imageUrl,
      source: "oss"
    });
    return;
  }

  const photoPath = await findLocalPhoto(slug);

  if (!photoPath) {
    writeJson(response, 404, { error: "No photo configured for this province." });
    return;
  }

  const token = signPhotoToken({
    slug,
    path: photoPath,
    exp: Date.now() + 5 * 60 * 1000
  });

  writeJson(response, 200, {
    imageUrl: `/api/photo-file?token=${encodeURIComponent(token)}`,
    source: "local"
  });
}

async function handleProtectedPhoto(requestUrl, response) {
  const token = requestUrl.searchParams.get("token");

  if (!token) {
    writeJson(response, 401, { error: "Missing token." });
    return;
  }

  const payload = verifyPhotoToken(token);

  if (!payload) {
    writeJson(response, 401, { error: "Invalid or expired token." });
    return;
  }

  const filePath = join(root, payload.path);

  if (!existsSync(filePath) || statSync(filePath).isDirectory()) {
    writeJson(response, 404, { error: "Photo not found." });
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "private, max-age=60"
  });

  createReadStream(filePath).pipe(response);
}

function serveStaticFile(pathname, response) {
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  let filePath = join(root, safePath === "\\" || safePath === "/" ? "index.html" : safePath);

  if (existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = join(filePath, "index.html");
  }

  if (!existsSync(filePath)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  response.writeHead(200, {
    "Content-Type": mimeTypes[extname(filePath).toLowerCase()] ?? "application/octet-stream",
    "Cache-Control": "no-cache"
  });

  createReadStream(filePath).pipe(response);
}

function isProtectedPath(pathname) {
  return protectedPrefixes.some((prefix) => pathname.startsWith(prefix));
}

async function getLocalAvailableSlugs() {
  const slugs = [];

  for (const entry of await fs.readdir(join(root, "photos"), { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }

    const photoPath = await findLocalPhoto(entry.name);

    if (photoPath) {
      slugs.push(entry.name);
    }
  }

  return slugs;
}

async function findLocalPhoto(slug) {
  for (const candidate of imageCandidates) {
    const relativePath = join("photos", slug, candidate);
    const absolutePath = join(root, relativePath);

    if (existsSync(absolutePath) && statSync(absolutePath).isFile()) {
      return relative(root, absolutePath).replace(/\\/g, "/");
    }
  }

  return null;
}

async function getManifestSlugs() {
  const manifest = await loadManifest();
  return Object.keys(manifest);
}

async function createOssSignedUrl(slug) {
  const manifest = await loadManifest();
  const objectKey = manifest[slug];

  if (!objectKey) {
    return null;
  }

  const client = await createOssClient();

  return client.signatureUrl(objectKey, {
    expires: 5 * 60
  });
}

async function loadManifest() {
  const raw = await fs.readFile(manifestPath, "utf8");
  const parsed = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("PHOTO_MANIFEST_PATH must point to a JSON object mapping province slugs to OSS object keys.");
  }

  return parsed;
}

async function loadPasscodes() {
  if (process.env.PHOTO_PASSCODE_MAP_JSON) {
    return parseObjectJson(
      process.env.PHOTO_PASSCODE_MAP_JSON,
      "PHOTO_PASSCODE_MAP_JSON must be a JSON object mapping province slugs to passcodes."
    );
  }

  if (existsSync(passcodeMapPath)) {
    const raw = await fs.readFile(passcodeMapPath, "utf8");
    return parseObjectJson(
      raw,
      "PHOTO_PASSCODE_MAP_PATH must point to a JSON object mapping province slugs to passcodes."
    );
  }

  return {};
}

async function createOssClient() {
  const required = ["OSS_REGION", "OSS_BUCKET", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"];

  for (const key of required) {
    if (!process.env[key]) {
      throw new Error(`${key} is required for PHOTO_SOURCE=oss.`);
    }
  }

  const { default: OSS } = await import("ali-oss");

  return new OSS({
    region: process.env.OSS_REGION,
    bucket: process.env.OSS_BUCKET,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    secure: true
  });
}

function signPhotoToken(payload) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = createHmac("sha256", tokenSecret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

function verifyPhotoToken(token) {
  const [encodedPayload, signature] = token.split(".");

  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = createHmac("sha256", tokenSecret).update(encodedPayload).digest("base64url");

  if (!matchesSecret(signature, expectedSignature)) {
    return null;
  }

  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

  if (!payload?.path || typeof payload.exp !== "number" || payload.exp < Date.now()) {
    return null;
  }

  return payload;
}

function matchesSecret(input, expected) {
  const inputBuffer = Buffer.from(input, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  if (inputBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

function parseObjectJson(raw, errorMessage) {
  const parsed = JSON.parse(raw);

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(errorMessage);
  }

  return parsed;
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

function writeJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(body));
}

function loadDotEnv() {
  const envPath = join(process.cwd(), ".env");

  if (!existsSync(envPath)) {
    return;
  }

  const raw = readFileSync(envPath, "utf8");

  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();

    if (key && !(key in process.env)) {
      process.env[key] = value;
    }
  });
}
