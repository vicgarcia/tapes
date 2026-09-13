import ReactDOM from 'react-dom/client'
import App from '@app/components/App';
import { registerSW } from 'virtual:pwa-register';

import './main.scss'
import 'bootstrap-icons/font/bootstrap-icons.css';

// Register service worker with auto-update
registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
