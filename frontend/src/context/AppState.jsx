import React, { createContext, useReducer, useContext, useEffect, useCallback } from 'react';

const defaultMonitors = [{ id: 'mon-1', name: 'Display 1', width: 1920, height: 1080, backgroundImage: '' }];
const defaultAnimes = [
  {
    id: '1',
    name: '기본 캐릭터',
    monitorId: 'mon-1',
    width: 120,
    x: 100,
    y: 100,
    height: 120,
    states: [
      {
        id: 's1',
        name: '기본',
        spritePath: '',
        duration: 150,
        chats: ['안녕!', '반가워.'],
      },
      {
        id: 's2',
        name: '기쁨',
        spritePath: '',
        duration: 100,
        chats: ['히히!', '오늘 기분 좋아!'],
      },
      { id: 's3', name: '슬픔', spritePath: '', duration: 150, chats: [] },
      { id: 's4', name: '분노', spritePath: '', duration: 150, chats: [] },
    ],
  },
];

const initialState = {
  isDarkMode: true,
  lang: 'ko',
  currentView: 'list',
  selectedAnime: null,
  animes: defaultAnimes,
  monitors: defaultMonitors,
  displays: [],
  loading: true,
  error: null,
};

function appReducer(state, action) {
  switch (action.type) {
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    case 'LOAD_SETTINGS': {
      const payload = action.payload;
      let monitors = payload.monitors ?? state.monitors;
      const displays = payload.displays ?? state.displays ?? [];
      let animes = payload.animes ?? state.animes;
      if (displays.length > 0) {
        const connectedIds = new Set(displays.map((d) => d.id));
        const byId = {};
        monitors.forEach((m) => { byId[m.id] = m; });
        const normalized = [];
        const oldToNewId = {};
        displays.forEach((d, i) => {
          const existing = byId[d.id] ?? byId[`mon-${i + 1}`];
          if (existing?.id && existing.id !== d.id) oldToNewId[existing.id] = d.id;
          normalized.push({
            id: d.id,
            name: existing?.name ?? `Display ${i + 1}`,
            width: d.width,
            height: d.height,
            backgroundImage: existing?.backgroundImage ?? '',
          });
        });
        monitors.forEach((m) => {
          if (!connectedIds.has(m.id)) normalized.push(m);
        });
        monitors = normalized;
        animes = animes.map((a) => {
          const newId = oldToNewId[a.monitorId] ?? (connectedIds.has(a.monitorId) ? a.monitorId : null);
          if (newId) return { ...a, monitorId: newId };
          return a;
        });
      }
      return {
        ...state,
        animes,
        monitors,
        displays,
        lang: payload.language ?? state.lang,
        isDarkMode: payload.darkMode ?? state.isDarkMode,
        loading: false,
        error: null,
      };
    }
    case 'SET_VIEW':
      return { ...state, currentView: action.payload };
    case 'SET_SELECTED_ANIME':
      return { ...state, selectedAnime: action.payload };
    case 'SET_ANIMES':
      return { ...state, animes: action.payload };
    case 'SET_MONITORS':
      return { ...state, monitors: action.payload };
    case 'UPDATE_ANIME':
      return {
        ...state,
        animes: state.animes.map((a) => (a.id === action.payload.id ? action.payload : a)),
        selectedAnime: state.selectedAnime?.id === action.payload.id ? action.payload : state.selectedAnime,
      };
    case 'ADD_ANIME':
      return {
        ...state,
        animes: [...state.animes, action.payload],
        selectedAnime: action.payload,
        currentView: 'edit',
      };
    case 'REMOVE_ANIME':
      return {
        ...state,
        animes: state.animes.filter((a) => a.id !== action.payload),
        selectedAnime: state.selectedAnime?.id === action.payload ? null : state.selectedAnime,
        currentView: 'list',
      };
    case 'UPDATE_MONITOR':
      return {
        ...state,
        monitors: state.monitors.map((m) => (m.id === action.payload.id ? { ...m, ...action.payload } : m)),
      };
    case 'ADD_MONITOR':
      return { ...state, monitors: [...state.monitors, action.payload] };
    case 'REMOVE_MONITOR':
      return {
        ...state,
        monitors: state.monitors.filter((m) => m.id !== action.payload.id),
        animes: state.animes.map((a) =>
          a.monitorId === action.payload.id ? { ...a, monitorId: action.payload.fallbackId } : a
        ),
      };
    case 'SET_DARK_MODE':
      return { ...state, isDarkMode: action.payload };
    case 'SET_LANG':
      return { ...state, lang: action.payload };
    default:
      return state;
  }
}

const AppStateContext = createContext(null);

export function AppStateProvider({ children }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    document.body.className = state.isDarkMode ? 'dark bg-[#010409]' : 'bg-[#f6f8fa]';
  }, [state.isDarkMode]);

  const loadSettings = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      dispatch({ type: 'LOAD_SETTINGS', payload: data });
    } catch (err) {
      dispatch({ type: 'SET_ERROR', payload: err.message });
      dispatch({ type: 'LOAD_SETTINGS', payload: { animes: defaultAnimes, monitors: defaultMonitors } });
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const saveSettings = useCallback(async (overrides = {}) => {
    try {
      const payload = {
        monitors: overrides.monitors ?? state.monitors,
        animes: overrides.animes ?? state.animes,
        language: overrides.language ?? state.lang,
        darkMode: overrides.darkMode ?? state.isDarkMode,
      };
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      dispatch({ type: 'LOAD_SETTINGS', payload: data });
      return null;
    } catch (err) {
      return err.message;
    }
  }, [state.monitors, state.animes, state.lang, state.isDarkMode]);

  const value = { ...state, dispatch, loadSettings, saveSettings };
  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider');
  return ctx;
}
