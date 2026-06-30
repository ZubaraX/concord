import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the built React client (dist/) into a native Android app (WebView).
// The app talks to the same self-hosted server baked in via VITE_API_URL, which
// is plain HTTP — so cleartext + mixed content must be allowed.
const config: CapacitorConfig = {
  appId: "com.concord.app",
  appName: "Concord",
  webDir: "dist",
  server: {
    androidScheme: "https", // secure context (needed for getUserMedia/WebRTC)
    cleartext: true, // allow http(s) to the self-hosted server
  },
  android: {
    allowMixedContent: true, // https app shell → http API/WebSocket
  },
};

export default config;
