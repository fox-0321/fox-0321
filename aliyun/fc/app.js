import http from "node:http";
import OSS from "ali-oss";

const port = Number(process.env.PORT) || 9000;

const server = http.createServer(async (request, response) => {
  try {
    applyCors(response);

    if (request.method === "OPTIONS") {
      response.writeHead(204);
      response.end();
      return;
    }

    const requestUrl = new URL(request.url ?? "/", "http://localhost");

    if (request.method === "GET" && requestUrl.pathname === "/") {
      writeJson(response, 200, {
        ok: true,
        message: "Birthday map photo API is running."
      });
      return;
    }

    if (request.method === "GET" && requestUrl.pathname === "/api/photos/available") {
      const manifest = loadManifest();
      writeJson(response, 200, { slugs: Object.keys(manifest) });
      return;
    }

    if (request.method === "POST" && requestUrl.pathname === "/api/photo-access") {
      const body = await readJsonBody(request);
      const slug = typeof body.slug === "string" ? body.slug.trim() : "";
      const passcode = typeof body.passcode === "string" ? body.passcode.trim() : "";

      if (!slug || !passcode) {
        writeJson(response, 400, { error: "Missing slug or passcode." });
        return;
      }

      const passcodes = loadPasscodes();
      const expectedPasscode = passcodes[slug] ?? process.env.PHOTO_PASSCODE ?? "";

      if (!expectedPasscode) {
        writeJson(response, 500, { error: "Passcode is not configured on the server." });
        return;
      }

      if (passcode !== expectedPasscode) {
        writeJson(response, 401, { error: "Wrong password." });
        return;
      }

      const manifest = loadManifest();
      const objectKey = manifest[slug];

      if (!objectKey) {
        writeJson(response, 404, { error: "No photo configured for this province." });
        return;
      }

      const client = createOssClient();
      const imageUrl = client.signatureUrl(objectKey, { expires: 5 * 60 });

      writeJson(response, 200, {
        imageUrl,
        source: "oss"
      });
      return;
    }

    writeJson(response, 404, { error: "Not found." });
  } catch (error) {
    console.error(error);
    writeJson(response, 500, { error: "Unable to process the request." });
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`FC photo API listening on ${port}`);
});

function applyCors(response) {
  response.setHeader("Access-Control-Allow-Origin", process.env.CORS_ALLOW_ORIGIN || "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function createOssClient() {
  const requiredKeys = ["OSS_REGION", "OSS_BUCKET", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"];

  for (const key of requiredKeys) {
    if (!process.env[key]) {
      throw new Error(`${key} is required.`);
    }
  }

  return new OSS({
    region: process.env.OSS_REGION,
    bucket: process.env.OSS_BUCKET,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    secure: true
  });
}

function loadManifest() {
  const value = process.env.PHOTO_MANIFEST_JSON;

  if (!value) {
    throw new Error("PHOTO_MANIFEST_JSON is required.");
  }

  const parsed = JSON.parse(value);

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("PHOTO_MANIFEST_JSON must be a JSON object.");
  }

  return parsed;
}

function loadPasscodes() {
  const value = process.env.PHOTO_PASSCODE_MAP_JSON;

  if (!value) {
    return {};
  }

  const parsed = JSON.parse(value);

  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("PHOTO_PASSCODE_MAP_JSON must be a JSON object.");
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
