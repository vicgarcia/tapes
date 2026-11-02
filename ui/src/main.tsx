import ReactDOM from 'react-dom/client'
import App from '@app/components/App';
import { InstallOfferProvider } from '@app/hooks/usePWA';

import './styles/base.css';
import './styles/shell.css';
import './styles/cameras.css';

ReactDOM.createRoot(document.getElementById('root')!).render(<InstallOfferProvider><App /></InstallOfferProvider>);
