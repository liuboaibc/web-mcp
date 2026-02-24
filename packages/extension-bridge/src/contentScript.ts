import { PROTOCOL_VERSION } from "@web-native-mcp/protocol";

declare const chrome: any;

const BRIDGE_SOURCE = "web-native-mcp-extension";
let activeChannelSecret = "";

export interface GlobalMethodBinding {
  name: string;
  path: string;
  description?: string;
  namespace?: string;
}

export interface ExtensionBridgeConfig {
  gatewayUrl: string;
  sessionId: string;
  authToken?: string;
  globalMethods: GlobalMethodBinding[];
  eventTopics?: string[];
}

export function startExtensionBridge(config: ExtensionBridgeConfig): () => void {
  const channelSecret = createChannelSecret();
  activeChannelSecret = channelSecret;
  injectPageRuntime(config, channelSecret);

  const onPageMessage = (event: MessageEvent) => {
    if (event.source !== window) {
      return;
    }
    if (event.origin !== window.location.origin) {
      return;
    }
    const data = event.data;
    if (
      !data ||
      data.source !== BRIDGE_SOURCE ||
      data.channel !== "toExtension" ||
      data.channelSecret !== channelSecret
    ) {
      return;
    }
    chrome.runtime.sendMessage({
      type: "bridge:toGateway",
      payload: data.message
    });
  };
  window.addEventListener("message", onPageMessage);

  const onBackgroundMessage = (message: any) => {
    if (!message || message.type !== "bridge:fromGateway") {
      return;
    }
    window.postMessage(
      {
        source: BRIDGE_SOURCE,
        channel: "toPage",
        channelSecret,
        message: message.payload
      },
      window.location.origin
    );
  };
  chrome.runtime.onMessage.addListener(onBackgroundMessage);

  chrome.runtime.sendMessage({
    type: "bridge:init",
    payload: {
      gatewayUrl: config.gatewayUrl,
      sessionId: config.sessionId,
      authToken: config.authToken
    }
  });

  return () => {
    window.removeEventListener("message", onPageMessage);
    chrome.runtime.onMessage.removeListener(onBackgroundMessage);
    chrome.runtime.sendMessage({ type: "bridge:disconnect" });
  };
}

export function updateGlobalMethods(globalMethods: GlobalMethodBinding[]): void {
  if (!activeChannelSecret) {
    return;
  }
  window.postMessage(
    {
      source: BRIDGE_SOURCE,
      channel: "configure",
      channelSecret: activeChannelSecret,
      payload: {
        globalMethods
      }
    },
    window.location.origin
  );
}

function injectPageRuntime(config: ExtensionBridgeConfig, channelSecret: string): void {
  const marker = "__WEB_NATIVE_MCP_INJECTED__";
  if ((window as unknown as Record<string, unknown>)[marker]) {
    updateGlobalMethods(config.globalMethods);
    return;
  }

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.textContent = buildInjectedRuntimeSource(config, channelSecret);
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function buildInjectedRuntimeSource(config: ExtensionBridgeConfig, channelSecret: string): string {
  const configLiteral = JSON.stringify({
    globalMethods: config.globalMethods,
    eventTopics: config.eventTopics ?? []
  });
  const protocolVersionLiteral = JSON.stringify(PROTOCOL_VERSION);
  const channelSecretLiteral = JSON.stringify(channelSecret);

  return `
  (function () {
    const marker = "__WEB_NATIVE_MCP_INJECTED__";
    if (window[marker]) {
      return;
    }
    window[marker] = true;

    const BRIDGE_SOURCE = "web-native-mcp-extension";
    const channelSecret = ${channelSecretLiteral};
    const targetOrigin = window.location.origin;
    const protocolVersion = ${protocolVersionLiteral};
    const state = {
      methods: new Map(),
      subscriptions: new Map(),
      eventTopics: new Set()
    };

    function safeJson(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function createRequestId() {
      if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
      }
      return Date.now() + "-" + Math.random().toString(16).slice(2);
    }

    function resolvePath(path) {
      const parts = path.split(".");
      let context = window;
      for (let i = 0; i < parts.length - 1; i += 1) {
        context = context?.[parts[i]];
      }
      const key = parts[parts.length - 1];
      return {
        context: context,
        value: context?.[key]
      };
    }

    function toQualifiedName(name, namespace) {
      if (!namespace || name.includes(".")) {
        return name;
      }
      return namespace + "." + name;
    }

    function publish(message) {
      window.postMessage(
        {
          source: BRIDGE_SOURCE,
          channel: "toExtension",
          channelSecret,
          message
        },
        targetOrigin
      );
    }

    function hasTopic(topic) {
      for (const subscription of state.subscriptions.values()) {
        if (subscription.topics.has(topic)) {
          return true;
        }
      }
      return false;
    }

    function installMethods(methods) {
      state.methods.clear();
      for (const method of methods) {
        const name = toQualifiedName(method.name, method.namespace);
        state.methods.set(name, method);
      }
    }

    function ensureEventBridges(topics) {
      for (const topic of topics) {
        if (state.eventTopics.has(topic)) {
          continue;
        }
        state.eventTopics.add(topic);
        window.addEventListener(topic, function (event) {
          if (!hasTopic(topic)) {
            return;
          }
          publish({
            protocolVersion,
            kind: "event",
            requestId: createRequestId(),
            sessionId: "extension-session",
            timestamp: Date.now(),
            type: "event",
            topic,
            payload: safeJson(event?.detail ?? null)
          });
        });
      }
    }

    const initialConfig = ${configLiteral};
    installMethods(initialConfig.globalMethods || []);
    ensureEventBridges(initialConfig.eventTopics || []);

    window.addEventListener("message", async function (event) {
      if (event.source !== window) {
        return;
      }
      const data = event.data;
      if (!data || data.source !== BRIDGE_SOURCE || data.channelSecret !== channelSecret) {
        return;
      }

      if (data.channel === "configure") {
        if (data.payload?.globalMethods) {
          installMethods(data.payload.globalMethods);
        }
        if (data.payload?.eventTopics) {
          ensureEventBridges(data.payload.eventTopics);
        }
        return;
      }

      if (data.channel !== "toPage") {
        return;
      }

      const request = data.message;
      if (!request || request.kind !== "request" || request.protocolVersion !== protocolVersion) {
        return;
      }

      try {
        if (request.type === "listMethods") {
          const namespace = request.payload?.namespace;
          const methods = [...state.methods.entries()]
            .filter(([methodName]) => {
              if (!namespace) {
                return true;
              }
              return methodName.startsWith(namespace + ".");
            })
            .map(([name, method]) => ({
              name,
              description: method.description,
              namespace: method.namespace
            }));

          publish({
            protocolVersion,
            kind: "response",
            requestId: request.requestId,
            sessionId: request.sessionId,
            timestamp: Date.now(),
            type: "listMethods",
            success: true,
            payload: { methods }
          });
          return;
        }

        if (request.type === "invokeMethod") {
          const methodName = request.payload?.method;
          const binding = state.methods.get(methodName);
          if (!binding) {
            publish({
              protocolVersion,
              kind: "response",
              requestId: request.requestId,
              sessionId: request.sessionId,
              timestamp: Date.now(),
              type: "invokeMethod",
              success: false,
              error: {
                code: "METHOD_NOT_FOUND",
                message: "Method not found: " + methodName
              }
            });
            return;
          }

          const target = resolvePath(binding.path);
          if (typeof target.value !== "function") {
            publish({
              protocolVersion,
              kind: "response",
              requestId: request.requestId,
              sessionId: request.sessionId,
              timestamp: Date.now(),
              type: "invokeMethod",
              success: false,
              error: {
                code: "METHOD_NOT_CALLABLE",
                message: "Target is not callable: " + binding.path
              }
            });
            return;
          }

          const callArgs = request.payload?.args;
          const result = Array.isArray(callArgs)
            ? await target.value.apply(target.context, callArgs)
            : await target.value.call(target.context, callArgs);
          publish({
            protocolVersion,
            kind: "response",
            requestId: request.requestId,
            sessionId: request.sessionId,
            timestamp: Date.now(),
            type: "invokeMethod",
            success: true,
            payload: {
              method: methodName,
              result: safeJson(result)
            }
          });
          return;
        }

        if (request.type === "subscribeEvent") {
          const subscriptionId = createRequestId();
          state.subscriptions.set(subscriptionId, {
            topics: new Set(request.payload?.topics || [])
          });
          publish({
            protocolVersion,
            kind: "response",
            requestId: request.requestId,
            sessionId: request.sessionId,
            timestamp: Date.now(),
            type: "subscribeEvent",
            success: true,
            payload: {
              subscriptionId,
              acceptedTopics: request.payload?.topics || []
            }
          });
          return;
        }

        if (request.type === "unsubscribeEvent") {
          state.subscriptions.delete(request.payload?.subscriptionId);
          publish({
            protocolVersion,
            kind: "response",
            requestId: request.requestId,
            sessionId: request.sessionId,
            timestamp: Date.now(),
            type: "unsubscribeEvent",
            success: true,
            payload: { ok: true }
          });
          return;
        }

        publish({
          protocolVersion,
          kind: "response",
          requestId: request.requestId,
          sessionId: request.sessionId,
          timestamp: Date.now(),
          type: "ping",
          success: true,
          payload: {
            value: "pong",
            at: Date.now()
          }
        });
      } catch (error) {
        publish({
          protocolVersion,
          kind: "response",
          requestId: request.requestId,
          sessionId: request.sessionId,
          timestamp: Date.now(),
          type: request.type,
          success: false,
          error: {
            code: "EXTENSION_RUNTIME_ERROR",
            message: String(error)
          }
        });
      }
    });
  })();
  `;
}

function createChannelSecret(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}
