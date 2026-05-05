import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import App from "./App.js";
import UploadPage from "./pages/Upload.js";
import VerifyPage from "./pages/Verify.js";
import DownloadPage from "./pages/Download.js";
import SettingsPage from "./pages/Settings.js";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App>
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/verify/:sessionId" element={<VerifyPage />} />
          <Route path="/download/:sessionId" element={<DownloadPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </App>
    </BrowserRouter>
  </React.StrictMode>,
);
