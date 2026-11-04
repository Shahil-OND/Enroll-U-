// App.jsx — Main router with authentication & sidebar layout
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DocumentProvider, useDocumentContext } from './context/DocumentContext';
import Sidebar        from './components/Sidebar';
import LoginPage      from './pages/LoginPage';
import Dashboard      from './pages/Dashboard';
import UploadPage     from './pages/UploadPage';
import ReviewPage     from './pages/ReviewPage';
import DocumentsPage  from './pages/DocumentsPage';
import ProductionPage from './pages/ProductionPage';
import './index.css';

// Route protector: redirects to /login if unauthenticated
function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}

function AppContent() {
  const location = useLocation();
  const { pendingCount } = useDocumentContext();
  const { isAuthenticated } = useAuth();
  const isLoginPage = location.pathname === '/login';
  const isReviewRoute = location.pathname.startsWith('/review');

  if (isLoginPage) {
    return (
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      </Routes>
    );
  }

  return (
    <ProtectedRoute>
      <div className="app-shell">
        <Sidebar pendingCount={pendingCount} />
        <main className="main-content">
          {isReviewRoute ? (
            <div className="page-body-full">
              <Routes>
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/review/:documentId" element={<ReviewPage />} />
              </Routes>
            </div>
          ) : (
            <div className="page-body">
              <div className="page-body-inner">
                <Routes>
                  <Route path="/"           element={<Dashboard />} />
                  <Route path="/upload"     element={<UploadPage />} />
                  <Route path="/documents"  element={<DocumentsPage />} />
                  <Route path="/production" element={<ProductionPage />} />
                  <Route path="*"           element={<Navigate to="/" replace />} />
                </Routes>
              </div>
            </div>
          )}
        </main>
      </div>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DocumentProvider>
          <AppContent />
        </DocumentProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
