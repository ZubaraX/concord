import type { CapacitorConfig } from "@capacitor/cli";

// Wraps the built React client (dist/) into a native Android app (WebView).
// The app talks to the same self-hosted server baked in via VITE_API_URL, which
// is plain HTTP — so cleartext + mixed content must be allowed.
const config: CapacitorConfig = {
  appId: "com.concord.app",
  appName: "Concord",
  webDir: "dist",
  server: {
    // http so the app shell (http://localhost) is same-scheme as the plain-HTTP
    // server — otherwise images/video/API are blocked as mixed content. localhost
    // is still a secure context, so getUserMedia/WebRTC keep working.
    androidScheme: "http",
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
