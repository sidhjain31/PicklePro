import '@fontsource-variable/archivo';
import '@fontsource-variable/big-shoulders';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Admin } from './Admin.jsx';
import { Live } from './Live.jsx';
import { Screen } from './Screen.jsx';
import { pagePath, useEvent } from './event.js';
import { CupAdmin } from './cup/CupAdmin.jsx';
import { CupLive } from './cup/CupLive.jsx';
import { CupScreen } from './cup/CupScreen.jsx';
import './cup/cup.css';
import './styles.css';
import './audience.css';
import { autoRefresh } from './swUpdate.js';

// After a redeploy, an already-open tab asks for old file names (e.g. the PDF library) that no
// longer exist. Reload once to pick up the new version instead of failing silently.
window.addEventListener('vite:preloadError', event => {
  event.preventDefault();
  try {
    if (sessionStorage.getItem('reloaded-for-update')) return;
    sessionStorage.setItem('reloaded-for-update', '1');
  } catch { /* storage blocked: reload anyway */ }
  window.location.reload();
});
window.addEventListener('load', () => setTimeout(() => { try { sessionStorage.removeItem('reloaded-for-update'); } catch { /* ignore */ } }, 10000));

// The main link is the MATCH DRAW now ("/", "/admin", "/tv"); the team auction (done) lives under
// /auction. Old /fixtures* links still open the match draw.
const path = pagePath().replace(/^\/fixtures(?=\/|$)/, '') || '/';
const sub = p => path === p || path.startsWith(`${p}/`);
const Page = sub('/auction/admin') ? Admin
  : sub('/auction/tv') || sub('/auction/screen') ? Screen
    : sub('/auction') ? Live
      : sub('/admin') ? CupAdmin
        : sub('/tv') || sub('/screen') ? CupScreen
          : CupLive;

// Switching draws remounts the page (new live connection, fresh state) without a page reload,
// so the unlocked audio context survives and sound keeps working in either mode.
function App() {
  const ev = useEvent();
  return <Page key={ev} />;
}
createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
autoRefresh(); // phones that opened the site before switch to the new version by themselves
