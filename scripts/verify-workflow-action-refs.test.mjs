import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import { getStatus, verifyWorkflowActionRefs } from "./verify-workflow-action-refs.mjs";

function requestReturning(statusCode, inspectOptions) {
  return (_url, options, callback) => {
    inspectOptions?.(options);
    const request = new EventEmitter();
    request.setTimeout = () => request;
    request.destroy = (error) => request.emit("error", error);
    queueMicrotask(() => callback({ statusCode, resume() {} }));
    return request;
  };
}

test("authenticated requests send the token only in the authorization header", async () => {
  const token = "test-token-that-must-not-be-logged";
  const status = await getStatus("actions/checkout", "refs/tags/v4.3.1", {
    token,
    request: requestReturning(200, ({ headers }) => {
      assert.equal(headers.Authorization, `Bearer ${token}`);
      assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
    }),
  });
  assert.equal(status, 200);
});

test("requests omit authorization when no token is available", async () => {
  const status = await getStatus("actions/checkout", "refs/tags/v4.3.1", {
    token: "",
    request: requestReturning(200, ({ headers }) => {
      assert.equal("Authorization" in headers, false);
    }),
  });
  assert.equal(status, 200);
});

test("all 200 responses pass the verifier", async () => {
  const logs = [];
  const ok = await verifyWorkflowActionRefs({
    refs: [["owner/action", "refs/tags/v1"], ["owner/other", "refs/tags/v2"]],
    statusFor: async () => 200,
    log: (message) => logs.push(message),
    error() {},
  });
  assert.equal(ok, true);
  assert.equal(logs.length, 2);
});

test("200 passes while 404 is reported as a missing ref", async () => {
  const errors = [];
  const ok = await verifyWorkflowActionRefs({
    refs: [["owner/action", "refs/tags/v1"], ["owner/missing", "refs/tags/v2"]],
    statusFor: async (repo) => repo === "owner/action" ? 200 : 404,
    log() {},
    error: (message) => errors.push(message),
  });
  assert.equal(ok, false);
  assert.match(errors[0], /owner\/missing@v2: missing/);
});

test("403 is unavailable rather than missing and remains fail-closed", async () => {
  const errors = [];
  const ok = await verifyWorkflowActionRefs({
    refs: [["owner/action", "refs/tags/v1"]],
    statusFor: async () => 403,
    log() {},
    error: (message) => errors.push(message),
  });
  assert.equal(ok, false);
  assert.match(errors[0], /GitHub API unavailable \(403\)/);
  assert.doesNotMatch(errors.join("\n"), /missing/i);
});

test("network errors remain fail-closed without logging request objects", async () => {
  const errors = [];
  const ok = await verifyWorkflowActionRefs({
    refs: [["owner/action", "refs/tags/v1"]],
    statusFor: async () => { throw new Error("connection reset"); },
    log() {},
    error: (message) => errors.push(message),
  });
  assert.equal(ok, false);
  assert.match(errors[0], /GitHub API unavailable \(connection reset\)/);
  assert.equal(errors.every((entry) => typeof entry === "string"), true);
});

test("request timeout destroys the request and rejects", async () => {
  const pendingRequest = (_url, _options, _callback) => {
    const request = new EventEmitter();
    request.setTimeout = (_timeoutMs, callbackOnTimeout) => {
      queueMicrotask(callbackOnTimeout);
      return request;
    };
    request.destroy = (error) => request.emit("error", error);
    return request;
  };
  await assert.rejects(
    getStatus("owner/action", "refs/tags/v1", { request: pendingRequest, timeoutMs: 25 }),
    /timed out after 25ms/,
  );
});
