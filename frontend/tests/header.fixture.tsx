import { createRoot } from 'react-dom/client';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import Header from '../src/components/Header';
import '../src/index.css';
import '../src/design-tokens.css';
import '../src/localization/rtl.css';
import '../src/i18n';

function Fixture() {
  const location = useLocation();
  return <><Header /><main id="header-test-content" style={{ padding: 32 }}>
    <h1>Public header regression checks</h1><output data-testid="route">{location.pathname}</output>
    <button type="button" id="outside" style={{ display: 'block', marginBlockStart: 360 }}>Outside the navigation</button>
  </main></>;
}
createRoot(document.getElementById('root')!).render(<AuthProvider><BrowserRouter><Fixture /></BrowserRouter></AuthProvider>);
