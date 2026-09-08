"use strict";

const http = require("node:http");
const { CoachError, requestCoachResponse } = require("./coach.js");

const HOST = process.env.COACH_HOST || "127.0.0.1";
const PORT = Number(process.env.COACH_PORT) || 8787;
const MAX_BODY_BYTES = 128 * 1024;

function isAllowedOrigin(origin) {
  return !origin || /^chrome-extension:\/\/[a-z]{32}$/.test(origin);
}

function responseHeaders(origin) {
  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers.Vary = "Origin";
  }
  return headers;
}

function sendJson(response, statusCode, body, origin) {
  response.writeHead(statusCode, responseHeaders(origin));
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    let size = 0;
    let rejected = false;

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      size += Buffer.byteLength(chunk);
      if (size > MAX_BODY_BYTES && !rejected) {
        rejected = true;
        reject(new CoachError("Request body is too large.", 413, "REQUEST_TOO_LARGE"));
        return;
      }
      if (!rejected) {
        body += chunk;
      }
    });
    request.on("end", () => {
      if (rejected) {
        return;
      }
      if (!body.trim()) {
        reject(new CoachError("Request body is required.", 400, "MALFORMED_REQUEST"));
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new CoachError("Request body must be valid JSON.", 400, "MALFORMED_REQUEST"));
      }
    });
    request.on("error", reject);
  });
}

async function handleRequest(request, response) {
  const origin = request.headers.origin;

  if (!isAllowedOrigin(origin)) {
    sendJson(response, 403, { error: "Origin is not allowed." }, null);
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true, service: "lock-in-coach" }, origin);
    return;
  }

  if (request.method === "OPTIONS" && request.url === "/api/coach") {
    response.writeHead(204, {
      ...responseHeaders(origin),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
    });
    response.end();
    return;
  }

  if (request.method !== "POST" || request.url !== "/api/coach") {
    sendJson(response, 404, { error: "Not found." }, origin);
    return;
  }

  if (!request.headers["content-type"]?.toLowerCase().startsWith("application/json")) {
    sendJson(response, 415, { error: "Content-Type must be application/json." }, origin);
    return;
  }

  try {
    const context = await readJsonBody(request);
    const coaching = await requestCoachResponse(context);
    sendJson(response, 200, { coaching }, origin);
  } catch (error) {
    const isCoachError = error instanceof CoachError;
    const statusCode = isCoachError ? error.statusCode : 500;
    const message = isCoachError ? error.message : "AI Coach failed unexpectedly.";
    const code = isCoachError ? error.code : "INTERNAL_ERROR";

    if (!isCoachError) {
      console.error("AI Coach request failed", error);
    }
    sendJson(response, statusCode, { error: message, code }, origin);
  }
}

function createCoachServer() {
  return http.createServer(handleRequest);
}

if (require.main === module) {
  const server = createCoachServer();
  server.on("error", (error) => {
    console.error("AI Coach failed to listen", error);
    process.exit(1);
  });
  server.listen(PORT, HOST, () => {
    console.log(`LOCK IN AI Coach listening at http://${HOST}:${PORT}`);
  });
}

module.exports = { createCoachServer, handleRequest, isAllowedOrigin, readJsonBody };
