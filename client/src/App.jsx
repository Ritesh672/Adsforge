import { useState } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import AdsPage from './pages/AdsPage';
import ProductsPage from './pages/ProductsPage';
import './index.css';
import './App.css';

export default function App() {
  const [syncStatus, setSyncStatus] = useState('idle'); // 'idle' | 'syncing' | 'done' | 'error'

  return (
    <BrowserRouter>
      <div className="app-layout">
        <Sidebar syncStatus={syncStatus} />
        <div className="main-content">
          <Routes>
            <Route path="/"         element={<Dashboard onSyncStatus={setSyncStatus} />} />
            <Route path="/ads"      element={<AdsPage />} />
            <Route path="/products" element={<ProductsPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
