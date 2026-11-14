import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import PiAccountLinkPage from '../src/pages/PiAccountLinkPage';
import SignIn from '../src/components/SignIn';
import '../src/index.css';
import '../src/design-tokens.css';
import '../src/i18n';
import '../src/localization/rtl.css';
// Load every application stylesheet without booting unrelated page modules.
import.meta.glob('../src/**/*.css', { eager: true });
createRoot(document.getElementById('root')!).render(<BrowserRouter><PiAccountLinkPage />{new URLSearchParams(location.search).has('dialog') && <SignIn onSignIn={()=>undefined} onModalClose={()=>undefined} />}</BrowserRouter>);
