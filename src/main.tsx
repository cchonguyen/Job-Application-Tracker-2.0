import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { CapturePage } from './components/CapturePage';
import { AuthGate } from './components/AuthGate';
import { isCaptureHash } from './lib/captureBookmarklet';
import './index.css';
import { applyTheme, loadThemePreference } from './lib/theme';

applyTheme(loadThemePreference());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isCaptureHash(window.location.hash) ? (
      <AuthGate capture>
        <CapturePage />
      </AuthGate>
    ) : (
      <AuthGate>
        <App />
      </AuthGate>
    )}
  </StrictMode>,
);
