import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from '../src/contexts/AuthContext';
import StorePage from '../src/pages/private/StorePage';
import '../src/i18n';
import '../src/index.css';
import '../src/design-tokens.css';
import '../src/localization/rtl.css';

const router = createBrowserRouter([{ path: '*', element: <StorePage /> }]);
createRoot(document.getElementById('root')!).render(<AuthProvider><div className="private-shell" style={{ display: 'block', width: '100%', minHeight: '100vh' }}><RouterProvider router={router} /></div></AuthProvider>);
