"use strict";

const { ensureCoachRunning } = require("./ensure-running.js");

function readNativeMessage() {
  return new Promise((resolve, reject) => {
    const header = Buffer.alloc(4);
    let headerRead = 0;
    let body = null;
    let bodyRead = 0;

    function cleanup() {
      process.stdin.off("data", onData);
      process.stdin.off("error", onError);
      process.stdin.off("end", onEnd);
    }

    function onError(error) {
      cleanup();
      reject(error);
    }

    function onEnd() {
      cleanup();
      if (headerRead === 0 && body === null) {
        resolve({ action: "ensureRunning" });
        return;
      }
      reject(new Error("Native host message ended early."));
    }

    function onData(chunk) {
      let offset = 0;
      if (headerRead < 4) {
        const take = Math.min(4 - headerRead, chunk.length);
        chunk.copy(header, headerRead, 0, take);
        headerRead += take;
        offset = take;
        if (headerRead < 4) {
          return;
        }
        const length = header.readUInt32LE(0);
        if (length <= 0 || length > 1024 * 1024) {
          cleanup();
          reject(new Error("Native host message is invalid."));
          return;
        }
        body = Buffer.alloc(length);
      }

      if (offset < chunk.length && body) {
        const take = Math.min(body.length - bodyRead, chunk.length - offset);
        chunk.copy(body, bodyRead, offset, offset + take);
        bodyRead += take;
      }

      if (body && bodyRead === body.length) {
        cleanup();
        try {
          resolve(JSON.parse(body.toString("utf8")));
        } catch {
          reject(new Error("Native host message must be JSON."));
        }
      }
    }

    process.stdin.resume();
    process.stdin.on("data", onData);
    process.stdin.on("error", onError);
    process.stdin.on("end", onEnd);
  });
}

function writeNativeMessage(value) {
  const json = Buffer.from(JSON.stringify(value), "utf8");
  const header = Buffer.alloc(4);
  header.writeUInt32LE(json.length, 0);
  return new Promise((resolve, reject) => {
    process.stdout.write(Buffer.concat([header, json]), (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const message = await readNativeMessage();
  if (message?.action && message.action !== "ensureRunning") {
    await writeNativeMessage({
      ok: false,
      code: "UNSUPPORTED_ACTION",
      error: "Unsupported native host action.",
    });
    return;
  }

  await writeNativeMessage(await ensureCoachRunning());
}

main()
  .catch(async (error) => {
    try {
      await writeNativeMessage({
        ok: false,
        code: "NATIVE_HOST_ERROR",
        error: error?.message || "Native host failed.",
      });
    } catch {
      console.error(error);
    }
    process.exitCode = 1;
  })
  .finally(() => {
    setTimeout(() => process.exit(process.exitCode || 0), 10);
  });
