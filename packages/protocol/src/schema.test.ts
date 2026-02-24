import test from "node:test";
import assert from "node:assert/strict";
import { PROTOCOL_VERSION } from "./types.js";
import { validateBridgeMessage, validateMethodDescriptors } from "./schema.js";

test("validateBridgeMessage accepts valid invoke request", () => {
  const result = validateBridgeMessage({
    protocolVersion: PROTOCOL_VERSION,
    kind: "request",
    requestId: "req-1",
    sessionId: "session-1",
    timestamp: Date.now(),
    type: "invokeMethod",
    payload: {
      method: "user.getById",
      args: ["u-1"]
    }
  });

  assert.equal(result.ok, true);
  assert.ok(result.value);
});

test("validateBridgeMessage rejects mismatched protocol", () => {
  const result = validateBridgeMessage({
    protocolVersion: "0.0.0",
    kind: "request",
    requestId: "req-1",
    sessionId: "session-1",
    timestamp: Date.now(),
    type: "listMethods",
    payload: {}
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /protocolVersion mismatch/);
});

test("validateMethodDescriptors checks minimum structure", () => {
  const result = validateMethodDescriptors([
    { name: "cart.addItem", description: "Add product into cart" }
  ]);
  assert.equal(result.ok, true);
});
