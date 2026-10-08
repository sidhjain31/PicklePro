import '@fontsource-variable/archivo';
import '@fontsource-variable/big-shoulders';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Admin } from './Admin.jsx';
import { Live } from './Live.jsx';
import './styles.css';

const isAdmin = location.pathname.startsWith('/admin');
createRoot(document.getElementById('root')).render(<StrictMode>{isAdmin ? <Admin /> : <Live />}</StrictMode>);
