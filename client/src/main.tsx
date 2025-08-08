import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadConfig } from "./config";

(async () => {
  try {
    // Load config with timeout
    const configPromise = loadConfig();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Config loading timeout')), 10000)
    );
    
    await Promise.race([configPromise, timeoutPromise]);
    
    const rootEl = document.getElementById("root");
    if (!rootEl) throw new Error('#root not found');
    
    createRoot(rootEl).render(<App />);
    console.log('✅ App rendered successfully');
  } catch (error) {
    console.error('❌ Failed to start app:', error);
    
    // Still try to render the app with fallback config
    const rootEl = document.getElementById("root");
    if (rootEl) {
      createRoot(rootEl).render(<App />);
      console.log('🔄 App rendered with fallback configuration');
    }
  }
})();
