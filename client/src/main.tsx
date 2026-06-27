import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App";
import Overlay from "./components/Overlay";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root")!);

// The always-on-top speaking overlay is the same bundle loaded with #overlay; it
// renders a bare, transparent participant list instead of the full app.
const isOverlay = window.location.hash.replace(/^#\/?/, "").startsWith("overlay");

if (isOverlay) {
  document.documentElement.style.background = "transparent";
  document.body.style.background = "transparent";
  const el = document.getElementById("root");
  if (el) el.style.background = "transparent";
  root.render(<Overlay />);
} else {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
  });
  root.render(
    <React.StrictMode>
      <QueryClientProvider client={queryClient}>
        <HashRouter>
          <App />
        </HashRouter>
      </QueryClientProvider>
    </React.StrictMode>
  );
}
