import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { AppDialogProvider } from './components/AppDialogProvider';
import 'leaflet/dist/leaflet.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <AppDialogProvider>
    <App />
  </AppDialogProvider>
);
