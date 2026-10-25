import type { CapacitorConfig } from "@capacitor/cli";

// The Japa backend is a Qoder Sites Edge Function reached via the same-origin
// path "/functions/v1/app". The Qoder gateway validates the request Origin and
// injects the tenant id (x-instance-id) before the Function runs; a native
// WebView serving bundled files would present a different origin (localhost)
// and receive neither, breaking auth/data/uploads. Loading the published site
// keeps the WebView origin identical to a normal browser session, so every
// existing feature works unchanged with no backend modification.
const config: CapacitorConfig = {
  appId: "appId: 'com.anuragkulkarni.japa',",
  appName: "Japa",
  webDir: "dist",
  server: {
    url: "https://family-japa-k9ha5z4i396.qoder.website",
    cleartext: false,
    androidScheme: "https",
  },
};

export default config;
