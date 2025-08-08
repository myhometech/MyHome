import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadConfig } from "./config";

(async () => {
  await loadConfig();
  const rootEl = document.getElementById("root");
  if (!rootEl) throw new Error('#root not found');
  createRoot(rootEl).render(<App />);
})();
