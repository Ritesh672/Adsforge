import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import AppLayout from './components/AppLayout';
import Dashboard from './pages/Dashboard';
import AdsPage from './pages/AdsPage';
import ProductsPage from './pages/ProductsPage';
import { getSyncStatus, triggerUnifiedSync } from './api';
import './index.css';
import './App.css';

export default function App() {
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'done' | 'error'
  const [syncToast, setSyncToast] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const updateLastSyncTime = async () => {
    try {
      const response = await getSyncStatus();
      const latestCompleted = (response.data || [])
        .filter((log) => log.status === 'completed' && log.completed_at)
        .sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at))[0];

      if (latestCompleted) setLastSyncedAt(latestCompleted.completed_at);
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    }
  };

  useEffect(() => {
    const timer = window.setTimeout(updateLastSyncTime, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const waitForSyncCompletion = async (startedAt) => {
    const relevantTypes = new Set(['incremental_sync', 'meta_incremental_sync']);
    const startedMs = startedAt.getTime() - 5000;
    const maxAttempts = 150;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const response = await getSyncStatus();
      const logs = (response.data || []).filter((log) => (
        relevantTypes.has(log.sync_type)
        && new Date(log.started_at).getTime() >= startedMs
      ));

      const byType = logs.reduce((acc, log) => {
        if (!acc[log.sync_type]) acc[log.sync_type] = log;
        return acc;
      }, {});

      const shopifyLog = byType.incremental_sync;
      const metaLog = byType.meta_incremental_sync;
      const activeLogs = logs.filter((log) => log.status === 'in_progress');
      const failedLog = logs.find((log) => log.status === 'failed');

      if (failedLog) {
        throw new Error(failedLog.error_message || `${failedLog.sync_type} failed`);
      }

      if (shopifyLog?.status === 'completed' && metaLog?.status === 'completed') {
        return {
          shopifyRecords: shopifyLog.records_synced || 0,
          metaRecords: metaLog.records_synced || 0,
        };
      }

      if (attempt > 4 && logs.length > 0 && activeLogs.length === 0 && shopifyLog && metaLog) {
        return {
          shopifyRecords: shopifyLog.records_synced || 0,
          metaRecords: metaLog.records_synced || 0,
        };
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return null;
  };

  const handleSyncNow = async () => {
    if (syncStatus === 'syncing') return;

    const startedAt = new Date();
    setSyncStatus('syncing');
    setSyncToast(null);

    try {
      await triggerUnifiedSync();
      const result = await waitForSyncCompletion(startedAt);
      setSyncStatus('done');
      setLastSyncedAt(new Date().toISOString());
      setSyncToast({
        type: 'success',
        title: 'Data synced to latest',
        message: result
          ? 'Meta and Shopify are updated. Dashboard is refreshing now.'
          : 'Latest sync has finished. The dashboard is refreshing now.',
      });
      window.dispatchEvent(new CustomEvent('adforge:sync-complete'));
      updateLastSyncTime();
      window.setTimeout(() => setSyncToast(null), 5000);
    } catch (error) {
      console.error('Manual sync failed:', error);
      setSyncStatus('error');
      setSyncToast({
        type: 'error',
        title: 'Sync failed',
        message: error.message || 'Please try again.',
      });
    }
  };

  return (
    <BrowserRouter>
      <AppLayout
        syncStatus={syncStatus}
        syncToast={syncToast}
        lastSyncedAt={lastSyncedAt}
        onSyncNow={handleSyncNow}
      >
          <Routes>
            <Route path="/"         element={<Dashboard />} />
            <Route path="/ads"      element={<AdsPage />} />
            <Route path="/products" element={<ProductsPage />} />
          </Routes>
      </AppLayout>
    </BrowserRouter>
  );
}
