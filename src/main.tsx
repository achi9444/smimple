import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element');
}

const root = createRoot(rootElement);

const renderFatal = (error: unknown) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  root.render(
    <div style={{ padding: '24px', fontFamily: 'Inter, sans-serif', color: '#1A1A1A' }}>
      <h1 style={{ margin: 0, fontSize: '18px' }}>Smimple 啟動失敗</h1>
      <p style={{ marginTop: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{message}</p>
    </div>
  );
};

window.addEventListener('error', (event) => {
  console.error('Global error:', event.error ?? event.message);
  renderFatal(event.error ?? event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  renderFatal(event.reason);
});

void import('./App.tsx')
  .then(({ default: App }) => {
    root.render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  })
  .catch((error) => {
    console.error('Bootstrap error:', error);
    renderFatal(error);
  });
