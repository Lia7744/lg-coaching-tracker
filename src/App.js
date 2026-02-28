import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import TrackerPage from './pages/TrackerPage';
import AdminPage from './pages/AdminPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/client/:slug" element={<TrackerPage />} />
        <Route path="/" element={<AdminPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
