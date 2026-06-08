import { useEffect, useRef, useState } from 'react';
import { Header } from './Header.jsx';
import { Sidebar } from './Sidebar.jsx';
import { Toolbar } from './Toolbar.jsx';

const legacyScripts = [
  '/scripts/core/app.js',
  '/scripts/features/admin/admin.js',
  '/scripts/features/executive/executive.js',
];

function resolveBackendOrigin() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, '');
  }

  const apiPort = import.meta.env.VITE_API_PORT || '3231';
  const { protocol, hostname } = window.location;

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${apiPort}`;
  }

  if (hostname.endsWith('.app.github.dev')) {
    return `${protocol}//${hostname.replace(/-\d+\.app\.github\.dev$/, `-${apiPort}.app.github.dev`)}`;
  }

  return '';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-legacy-src="${src}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.legacySrc = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.body.appendChild(script);
  });
}

async function loadLegacyDashboard(host) {
  const response = await fetch('/legacy-dashboard.html');
  if (!response.ok) throw new Error('Failed to load dashboard template');

  const html = await response.text();
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  document.body.className = parsed.body.className || 'login-mode';
  parsed.body.querySelectorAll('script').forEach((script) => script.remove());
  host.innerHTML = parsed.body.innerHTML;
  window.API_BASE_URL = resolveBackendOrigin();

  for (const src of legacyScripts) {
    await loadScript(src);
  }

  if (typeof window.boot === 'function') {
    await window.boot();
  } else {
    document.dispatchEvent(new Event('DOMContentLoaded'));
  }
}

export function DashboardLayout() {
  const hostRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    loadLegacyDashboard(hostRef.current).catch((loadError) => {
      if (mounted) setError(loadError.message || 'Dashboard failed to load');
    });

    return () => {
      mounted = false;
    };
  }, []);

  if (error) {
    return (
      <main className="login" style={{ display: 'flex' }}>
        <div className="empty">{error}</div>
      </main>
    );
  }

  return <div ref={hostRef} />;
}

export { Header, Sidebar, Toolbar };
