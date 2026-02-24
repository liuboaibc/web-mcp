import { createWebMcpBridge } from "@web-native-mcp/web-bridge-sdk";
import { startExtensionBridge } from "@web-native-mcp/extension-bridge";

window.legacyApi = {
  account: {
    getProfile(userId) {
      return { id: userId, name: "demo-user" };
    }
  },
  cart: {
    addItem({ sku, quantity }) {
      return { ok: true, sku, quantity };
    }
  }
};

// SDK mode: add a tiny bootstrap file and explicitly expose methods.
const sdkBridge = createWebMcpBridge({
  sessionId: "vanilla-sdk-demo",
  gatewayUrl: "ws://127.0.0.1:8787"
});

sdkBridge.exposeMethods({
  "account.getProfile": {
    description: "Get account profile from legacy API.",
    handler(args) {
      return window.legacyApi.account.getProfile(args);
    }
  },
  "cart.addItem": {
    description: "Add item to cart in legacy API.",
    handler(args) {
      return window.legacyApi.cart.addItem(args);
    }
  }
});

sdkBridge.start();

// Extension mode: almost zero business-code changes via global path mapping.
startExtensionBridge({
  gatewayUrl: "ws://127.0.0.1:8787",
  sessionId: "vanilla-extension-demo",
  globalMethods: [
    {
      name: "account.getProfile",
      path: "legacyApi.account.getProfile",
      description: "Get account profile through extension bridge."
    },
    {
      name: "cart.addItem",
      path: "legacyApi.cart.addItem",
      description: "Add cart item through extension bridge."
    }
  ],
  eventTopics: ["cart:updated"]
});
