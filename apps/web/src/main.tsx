import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import { AppProviders } from "./app/providers";
import { AppRouterProvider } from "./app/router";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppProviders>
      <AppRouterProvider />
    </AppProviders>
  </StrictMode>,
);
