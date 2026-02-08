import React, { useMemo, useCallback } from 'react';
import { AppStateProvider, useAppState } from './context/AppState';
import { Navbar } from './components/Navbar';
import { Dashboard } from './components/Dashboard';
import { Editor } from './components/Editor';
import { BackgroundManager } from './components/BackgroundManager';
import ko from './locales/ko.json';
import en from './locales/en.json';

const translations = { ko, en };

function getTranslatedName(lang, t, name, type = 'state') {
  const koNames = translations.ko.defaultStateNames || [];
  const enNames = translations.en.defaultStateNames || [];
  if (type === 'anime') {
    if (name === translations.ko.defaultAnimeName || name === translations.en.defaultAnimeName)
      return t.defaultAnimeName;
    return name;
  }
  const koIdx = koNames.indexOf(name);
  const enIdx = enNames.indexOf(name);
  if (koIdx !== -1) return t.defaultStateNames[koIdx];
  if (enIdx !== -1) return t.defaultStateNames[enIdx];
  return name;
}

function AppContent() {
  const { isDarkMode, lang, currentView, loading, error, selectedAnime } = useAppState();
  const t = useMemo(() => translations[lang] || translations.ko, [lang]);
  const getTranslatedNameBound = useCallback((name, type) => getTranslatedName(lang, t, name, type), [lang, t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#010409] text-white">
        <p>Loading...</p>
      </div>
    );
  }

  return (
    <div className={`min-h-screen transition-colors duration-500 ${isDarkMode ? 'bg-[#010409]' : 'bg-[#f6f8fa]'}`}>
      <Navbar t={t} />
      {error && (
        <div className="bg-amber-900/30 border-b border-amber-600/50 text-amber-200 px-6 py-2 text-sm">
          {error} — using default settings.
        </div>
      )}
      <main className="pb-24">
        {currentView === 'list' && <Dashboard t={t} getTranslatedName={getTranslatedNameBound} />}
        {currentView === 'edit' && selectedAnime && <Editor t={t} getTranslatedName={getTranslatedNameBound} />}
        {currentView === 'background' && <BackgroundManager t={t} />}
      </main>
      <Footer />
    </div>
  );
}

function Footer() {
  const { isDarkMode, monitors } = useAppState();
  return (
    <footer
      className={`fixed bottom-0 w-full px-6 py-2.5 border-t text-[10px] flex justify-between items-center z-50 backdrop-blur-md transition-colors ${
        isDarkMode ? 'bg-[#0d1117]/90 border-gray-800 text-gray-500' : 'bg-white/90 border-gray-200 text-gray-400'
      }`}
    >
      <div className="flex items-center space-x-5">
        <div className="flex items-center space-x-1.5 font-bold tracking-tight">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
          <span>RUN-ANIME ONLINE</span>
        </div>
        <span className="opacity-50 uppercase tracking-widest font-mono">Displays: {monitors.length} Active</span>
      </div>
      <div className="flex items-center space-x-3 font-mono">
        <span
          className={`px-2 py-0.5 rounded border transition-colors ${
            isDarkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'
          }`}
        >
          BUILD: UI_REFINED
        </span>
        <span className="font-bold">v1.3.4-STABLE</span>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <AppStateProvider>
      <AppContent />
    </AppStateProvider>
  );
}
