// App.jsx — Main router with sidebar layout
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { DocumentProvider, useDocumentContext } from './context/DocumentContext';
import Sidebar     from './components/Sidebar';
import Dashboard   from './pages/Dashboard';
import UploadPage  from './pages/UploadPage';
import ReviewPage  from './pages/ReviewPage';
import DocumentsPage from './pages/DocumentsPage';
import ProductionPage from './pages/ProductionPage';
import './index.css';

function AppContent() {
  const location = useLocation();
  const { pendingCount } = useDocumentContext();
  const isReviewRoute = location.pathname.startsWith('/review');

  return (
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
              </Routes>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <DocumentProvider>
        <AppContent />
      </DocumentProvider>
    </BrowserRouter>
  );
}
