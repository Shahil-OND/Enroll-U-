// components/Header.jsx — Sticky top header with logo and live status pills
import { useState, useEffect } from 'react';
import { getHealth } from '../services/client';

export default function Header() {
  const [backendOk, setBackendOk] = useState(false);

  useEffect(() => {
    const check = () =>
      getHealth().then(() => setBackendOk(true)).catch(() => setBackendOk(false));
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="app-header">
      <div className="header-logo">
        <div className="header-logo-icon">EU</div>
        <div className="header-logo-text">
          Enroll<span>-U</span>
          <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
            Document Intelligence Bridge
          </span>
        </div>
      </div>
      <div className="header-status-bar">
        <div className="status-pill">
          <div className={`status-dot ${backendOk ? 'active' : ''}`} />
          API {backendOk ? 'Connected' : 'Offline'}
        </div>
        <div className="status-pill">
          <div className="status-dot active" style={{ background: 'var(--accent-teal)' }} />
          SQLite
        </div>
        <div className="status-pill">
          <div className="status-dot active" style={{ background: 'var(--secondary)' }} />
          LLM
        </div>
      </div>
    </header>
  );
}
