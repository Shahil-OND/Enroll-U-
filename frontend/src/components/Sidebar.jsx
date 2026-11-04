// components/Sidebar.jsx — Collapsible navigation sidebar
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Upload, CheckSquare, Database, FileText, ChevronLeft, ChevronRight, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Sidebar({ pendingCount = 0 }) {
  const { user, logout } = useAuth();
  const [collapsed, setCollapsed] = useState(() => sessionStorage.getItem('sidebar_collapsed') === 'true');

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      sessionStorage.setItem('sidebar_collapsed', String(next));
      return next;
    });
  };

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} style={{ display: 'flex', flexDirection: 'column' }}>
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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
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
      </div>

      {/* User profile & logout footer */}
      {user && (
        <div style={{
          padding: collapsed ? '12px 6px' : '14px 12px',
          borderTop: '1px solid var(--border)',
          marginTop: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}>
          {!collapsed ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px' }}>
              <div style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                background: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 12,
                flexShrink: 0
              }}>
                {user.name ? user.name.slice(0, 2).toUpperCase() : <User size={16} />}
              </div>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {user.name || 'Operator'}
                  </span>
                  <span style={{
                    fontSize: 10,
                    padding: '1px 6px',
                    borderRadius: 4,
                    background: user.role === 'Administrator' ? 'rgba(108, 92, 231, 0.15)' : 'rgba(13, 110, 253, 0.12)',
                    color: user.role === 'Administrator' ? '#6c5ce7' : 'var(--primary)',
                    fontWeight: 700,
                    flexShrink: 0
                  }}>
                    {user.role || 'Operator'}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user.email}
                </div>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            onClick={logout}
            title="Log Out"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: collapsed ? 'center' : 'flex-start',
              gap: 8,
              width: '100%',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border)',
              background: 'var(--surface-alt)',
              color: 'var(--status-rejected)',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            <LogOut size={15} />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      )}
    </nav>
  );
}
