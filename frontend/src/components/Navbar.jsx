import React from 'react';
import { Icon } from './Icon';
import { useAppState } from '../context/AppState';

export function Navbar({ t }) {
  const { isDarkMode, lang, currentView, dispatch, saveSettings } = useAppState();

  return (
    <nav
      className={`flex items-center justify-between px-6 py-3 border-b sticky top-0 z-50 transition-colors ${
        isDarkMode ? 'bg-[#0d1117] border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'
      }`}
    >
      <div className="flex items-center space-x-4">
        <div className="p-1.5 bg-blue-600 rounded-md">
          <Icon name="Monitor" size={20} className="text-white" />
        </div>
        <span className="font-semibold text-lg tracking-tight">run-anime</span>
        <div className="hidden md:flex space-x-1 ml-4">
          <button
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'list' })}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              currentView === 'list'
                ? 'bg-blue-600 text-white shadow-sm'
                : isDarkMode
                  ? 'hover:bg-gray-700/40 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            {t.dashboard}
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'background' })}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              currentView === 'background'
                ? 'bg-blue-600 text-white shadow-sm'
                : isDarkMode
                  ? 'hover:bg-gray-700/40 text-gray-400'
                  : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            {t.bgSettings}
          </button>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => {
            const newLang = lang === 'ko' ? 'en' : 'ko';
            dispatch({ type: 'SET_LANG', payload: newLang });
            saveSettings({ language: newLang });
          }}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-md text-xs font-bold transition-colors ${
            isDarkMode
              ? 'hover:bg-gray-800 text-gray-400 border border-gray-700'
              : 'hover:bg-gray-100 text-gray-600 border border-gray-200'
          }`}
        >
          <Icon name="Globe" size={14} />
          <span>{lang.toUpperCase()}</span>
        </button>
        <button
          onClick={() => {
            const newDark = !isDarkMode;
            dispatch({ type: 'SET_DARK_MODE', payload: newDark });
            saveSettings({ darkMode: newDark });
          }}
          className={`p-2 rounded-full transition-all duration-300 ${
            isDarkMode ? 'hover:bg-gray-800 text-yellow-400 rotate-12' : 'hover:bg-gray-100 text-gray-600 rotate-0'
          }`}
        >
          {isDarkMode ? <Icon name="Sun" /> : <Icon name="Moon" />}
        </button>
      </div>
    </nav>
  );
}

export default Navbar;
