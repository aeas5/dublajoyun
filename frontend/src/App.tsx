import { useState } from "react";

import User from "./pages/User";
import Admin from "./pages/Admin.tsx";

import "./App.css";

export default function App() {
  const [adminOpen, setAdminOpen] =
    useState(false);

  return (
    <div className="app">
      {/* =====================================================
          HEADER
          ===================================================== */}

      <header className="app-header">
        <div className="app-brand">
          <div className="logo">
            D
          </div>

          <div>
            <h1>Dublaj</h1>

            <span>
              Seslendirme platformu
            </span>
          </div>
        </div>

        <button
          className="admin-toggle"
          onClick={() =>
            setAdminOpen(
              (previous) =>
                !previous
            )
          }
        >
          {adminOpen
            ? "✕ Yönetimi Kapat"
            : "⚙ Yönetim"}
        </button>
      </header>

      {/* =====================================================
          MAIN USER APP
          ===================================================== */}

      <main className="app-main">
        <User />
      </main>

      {/* =====================================================
          ADMIN PANEL
          ===================================================== */}

      {adminOpen && (
        <div className="admin-overlay">
          <div className="admin-panel-wrapper">
            <div className="admin-panel-header">
              <div>
                <span>
                  YÖNETİM
                </span>

                <h2>
                  İçerik Yönetimi
                </h2>
              </div>

              <button
                onClick={() =>
                  setAdminOpen(false)
                }
              >
                ✕
              </button>
            </div>

            <Admin />
          </div>
        </div>
      )}
    </div>
  );
}