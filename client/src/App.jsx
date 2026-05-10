import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import AdsPage from './pages/AdsPage';
import ProductsPage from './pages/ProductsPage';
import { triggerUnifiedSync } from './api';
import './index.css';
import './App.css';

export default function App() {
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'done' | 'error'

  const handleSyncNow = async () => {
    if (syncStatus === 'syncing') return;

    setSyncStatus('syncing');
    try {
      await triggerUnifiedSync();
      setSyncStatus('done');
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncStatus('error');
    }
  };

  return (
    <BrowserRouter>
      <AppLayout syncStatus={syncStatus} onSyncNow={handleSyncNow}>
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/ads"      element={<AdsPage />} />
            <Route path="/products" element={<ProductsPage />} />
          </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
