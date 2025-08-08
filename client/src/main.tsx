import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { loadConfig } from "./config";

(async () => {
  try {
    // Much shorter timeout for config loading
    const configPromise = loadConfig();
    const timeoutPromise = new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Config loading timeout')), 3000)
    );
    
    await Promise.race([configPromise, timeoutPromise]);
    
    const rootEl = document.getElementById("root");
    if (!rootEl) throw new Error('#root not found');
    
    createRoot(rootEl).render(<App />);
    console.log('✅ App rendered successfully');
  } catch (error) {
    console.error('❌ Config loading failed, rendering with fallback:', error);
    
    // Always render the app, even if config fails
    const rootEl = document.getElementById("root");
    if (rootEl) {
      createRoot(rootEl).render(<App />);
      console.log('🔄 App rendered with fallback configuration');
    } else {
      console.error('❌ Root element not found, cannot render app');
    }
  }
})();
