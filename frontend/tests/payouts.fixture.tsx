import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import AdminLayout from '../src/layouts/AdminLayout';
import AdminTestnetPayoutsPage from '../src/pages/admin/AdminTestnetPayoutsPage';
import TestnetAdminAccessPage from '../src/pages/admin/TestnetAdminAccessPage';
import '../src/design-tokens.css';
import '../src/index.css';
import '../src/i18n';
createRoot(document.getElementById('root')!).render(new URLSearchParams(location.search).has('standalone')
  ? <TestnetAdminAccessPage />
  : <BrowserRouter><AuthProvider><AdminLayout><AdminTestnetPayoutsPage /></AdminLayout></AuthProvider></BrowserRouter>);
