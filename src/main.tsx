import { createRoot } from 'react-dom/client';
import 'bootstrap-icons/font/bootstrap-icons.css';
import App from './App';
import { useStore } from './store';
import './styles.css';

const dark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;
const applyTheme = () => { document.documentElement.dataset.theme = (localStorage.getItem('mc-theme') || (dark() ? 'dark' : 'light')); };
applyTheme();
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
(window as any).__mc = { useStore };

createRoot(document.getElementById('root')!).render(<App />);
