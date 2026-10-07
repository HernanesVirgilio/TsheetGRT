import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { supabaseConfigError } from './lib/supabase/client';
import './index.css';

const ConfigurationErrorScreen = ({ message }: { message: string }) => (
  <main className="flex min-h-screen items-center justify-center bg-background px-4">
    <div role="alert" className="max-w-lg rounded-lg border border-danger/30 bg-danger-soft px-6 py-5 text-sm text-text">
      <p className="font-semibold text-danger">Configuração em falta</p>
      <p className="mt-1">{message}</p>
    </div>
  </main>
);

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Elemento #root não encontrado em index.html.');
}

createRoot(rootElement).render(
  supabaseConfigError ? <ConfigurationErrorScreen message={supabaseConfigError} /> : <App />
);
