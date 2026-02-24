import test from "node:test";
import assert from "node:assert/strict";
import {
  PROTOCOL_VERSION,
  type BridgeMessage,
  type BridgeResponseEnvelope,
  type JsonValue
} from "@web-native-mcp/protocol";
import { WebBridgeRuntime, type BridgeTransport } from "./runtime.js";

class TestTransport implements BridgeTransport {
  readonly sent: BridgeMessage[] = [];
  private messageListener?: (message: unknown) => void;

  send(message: BridgeMessage): void {
    this.sent.push(message);
  }

  close(): void {}

  onMessage(listener: (message: unknown) => void): void {
    this.messageListener = listener;
  }

  dispatch(message: unknown): void {
    this.messageListener?.(message);
  }
}

test("exposeMethods disposer removes methods for unmounted component", async () => {
  const transport = new TestTransport();
  const runtime = new WebBridgeRuntime({
    sessionId: "session-test",
    gatewayUrl: "ws://127.0.0.1:8787",
    transport
  });
  runtime.start();

  const dispose = runtime.exposeMethods({
    "user.getById": {
      handler: () => ({ id: "u-1", name: "demo" })
    }
  });

  transport.dispatch(createInvokeRequest("req-1", "session-test", "user.getById", ["u-1"]));
  await waitForMicrotask();

  const first = getResponse(transport.sent, "req-1");
  assert.equal(first.success, true);

  dispose();

  transport.dispatch(createInvokeRequest("req-2", "session-test", "user.getById", ["u-1"]));
  await waitForMicrotask();

  const second = getResponse(transport.sent, "req-2");
  assert.equal(second.success, false);
  assert.equal(second.error?.code, "METHOD_NOT_FOUND");
});

test("old disposer does not remove newer re-registered method", async () => {
  const transport = new TestTransport();
  const runtime = new WebBridgeRuntime({
    sessionId: "session-test",
    gatewayUrl: "ws://127.0.0.1:8787",
    transport
  });
  runtime.start();

  const disposeOld = runtime.registerMethod("cart.addItem", {
    handler: () => "old"
  });
  const disposeNew = runtime.registerMethod("cart.addItem", {
    handler: () => "new"
  });

  disposeOld();
  transport.dispatch(createInvokeRequest("req-3", "session-test", "cart.addItem", { sku: "s1" }));
  await waitForMicrotask();

  const third = getResponse(transport.sent, "req-3");
  assert.equal(third.success, true);
  assert.equal((third.payload as { result: string }).result, "new");

  disposeNew();
  transport.dispatch(createInvokeRequest("req-4", "session-test", "cart.addItem", { sku: "s1" }));
  await waitForMicrotask();

  const fourth = getResponse(transport.sent, "req-4");
  assert.equal(fourth.success, false);
  assert.equal(fourth.error?.code, "METHOD_NOT_FOUND");
});

function createInvokeRequest(
  requestId: string,
  sessionId: string,
  method: string,
  args: JsonValue
): BridgeMessage {
  return {
    protocolVersion: PROTOCOL_VERSION,
    kind: "request",
    requestId,
    sessionId,
    timestamp: Date.now(),
    type: "invokeMethod",
    payload: {
      method,
      args
    }
  };
}

function getResponse(messages: BridgeMessage[], requestId: string) {
  const response = messages.find(
    (message): message is BridgeResponseEnvelope<"invokeMethod"> =>
      message.kind === "response" && message.requestId === requestId && message.type === "invokeMethod"
  );

  assert.ok(response, `missing response for request ${requestId}`);
  return response;
}

async function waitForMicrotask(): Promise<void> {
  await Promise.resolve();
}
