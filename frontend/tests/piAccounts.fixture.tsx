import {createRoot} from 'react-dom/client';
import {AuthProvider,useAuthContext} from '../src/contexts/AuthContext';
import '../src/index.css';
import '../src/design-tokens.css';
import '../src/i18n';
function Fixture(){const auth=useAuthContext();return <main className="private-page"><h1>Pi account continuity</h1><button data-testid="login" disabled={auth.isPiLoginPending} onClick={()=>void auth.loginWithPi()}>Sign in through Pi</button><output data-testid="profile">{JSON.stringify(auth.user?{uid:auth.user.uid,name:auth.user.displayName,role:auth.user.role,country:auth.user.country,status:auth.user.verificationStatus}:null)}</output>{auth.authFeedback&&<p role="status" data-testid="feedback">{auth.authFeedback.message}</p>}</main>;}
createRoot(document.getElementById('root')!).render(<AuthProvider><Fixture/></AuthProvider>);
