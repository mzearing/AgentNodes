/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * It initializes the React application.
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './components/App/App';
import './index.global.css';

const container = document.getElementById('root');
if (!container) {
  throw new Error('Root element not found');
}

const root = createRoot(container);
root.render(React.createElement(App));
