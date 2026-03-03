import '@fontsource/inter/400.css';
import './index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const container = document.getElementById('root');
if (!container) throw new Error('Root element #root not found in index.html');

const root = createRoot(container);
root.render(React.createElement(App));
