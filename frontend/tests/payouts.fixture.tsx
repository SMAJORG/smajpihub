import { createRoot } from 'react-dom/client';
import AdminTestnetPayoutsPage from '../src/pages/admin/AdminTestnetPayoutsPage';
import '../src/design-tokens.css';
import '../src/index.css';
import '../src/i18n';
createRoot(document.getElementById('root')!).render(<AdminTestnetPayoutsPage />);
