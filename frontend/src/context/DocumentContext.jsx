// context/DocumentContext.jsx — Centralized state and single polling loop
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getDocuments, getStats } from '../services/client';

const DocumentContext = createContext(null);

export function DocumentProvider({ children }) {
  const [documents, setDocuments] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const [docs, st] = await Promise.all([
        getDocuments(),
        getStats().catch(() => null),
      ]);
      setDocuments(docs);
      if (st) setStats(st);
      
      const pending = docs.filter(d => d.status === 'pending_review').length;
      setPendingCount(pending);
    } catch (e) {
      console.error('[DocumentContext] Error fetching documents:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    // Centralized single polling loop: every 10 seconds
    const intervalId = setInterval(refresh, 10000);
    return () => clearInterval(intervalId);
  }, [refresh]);

  return (
    <DocumentContext.Provider
      value={{
        documents,
        pendingCount,
        stats,
        loading,
        refresh,
      }}
    >
      {children}
    </DocumentContext.Provider>
  );
}

export function useDocumentContext() {
  const context = useContext(DocumentContext);
  if (!context) {
    throw new Error('useDocumentContext must be used within a DocumentProvider');
  }
  return context;
}
