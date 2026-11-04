// components/Sidebar.jsx — Collapsible navigation sidebar
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Upload, CheckSquare, Database, FileText, ChevronLeft, ChevronRight } from 'lucide-react';

export default function Sidebar({ pendingCount = 0 }) {
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem('sidebar_collapsed') === 'true');

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      sessionStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      {/* Brand logo & collapse toggle */}
      <div
        className="header-logo"
        style={{
          padding: collapsed ? '12px 10px 16px' : '10px 16px 20px',
          borderBottom: '1px solid var(--border)',
          marginBottom: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'space-between',
          flexDirection: collapsed ? 'column' : 'row',
          gap: collapsed ? 10 : 8
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="header-logo-icon">EU</div>
          {!collapsed && (
            <div className="header-logo-text">
              Enroll<span>-U</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          className="sidebar-toggle-btn"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          style={{
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: 4,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.15s ease'
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {!collapsed && <span className="sidebar-section-title">Main</span>}
      <NavLink
        to="/"
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        end
        title="Dashboard"
      >
        <LayoutDashboard size={18} />
        {!collapsed && <span>Dashboard</span>}
      </NavLink>

      <NavLink
        to="/upload"
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        title="Upload Document"
      >
        <Upload size={18} />
        {!collapsed && <span>Upload Document</span>}
      </NavLink>

      <NavLink
        to="/review"
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        title="Review & Approve"
      >
        <CheckSquare size={18} />
        {!collapsed && <span>Review & Approve</span>}
        {pendingCount > 0 && <span className="sidebar-badge">{pendingCount}</span>}
      </NavLink>

      {!collapsed && <span className="sidebar-section-title" style={{ marginTop: 16 }}>Data</span>}
      <NavLink
        to="/documents"
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        title="All Documents"
      >
        <FileText size={18} />
        {!collapsed && <span>All Documents</span>}
      </NavLink>

      <NavLink
        to="/production"
        className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        title="Production Data"
      >
        <Database size={18} />
        {!collapsed && <span>Production Data</span>}
      </NavLink>
    </nav>
  );
}
