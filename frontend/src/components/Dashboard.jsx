import React from 'react';
import { Icon } from './Icon';
import { Badge } from './Badge';
import { MonitorBadge } from './MonitorBadge';
import { useAppState } from '../context/AppState';

export function Dashboard({ t, getTranslatedName }) {
  const { isDarkMode, animes, monitors, dispatch } = useAppState();

  const handleAddAnime = () => {
    const defaultStateNames = t.defaultStateNames || ['기본', '기쁨', '슬픔', '분노'];
    const newAnime = {
      id: Date.now().toString(),
      name: t.newAnime,
      monitorId: monitors[0]?.id || 'mon-1',
      width: 150,
      height: 150,
      x: 425,
      y: 425,
      states: defaultStateNames.map((name, idx) => ({
        id: `state-${Date.now()}-${idx}`,
        name,
        spritePath: '',
        rows: 1,
        cols: 1,
        duration: 150,
        frameDurations: [150],
        chats: [],
      })),
    };
    dispatch({ type: 'ADD_ANIME', payload: newAnime });
  };

  return (
    <div className="max-w-6xl mx-auto p-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-end mb-8">
        <div>
          <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t.animeList}</h1>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.animeDesc}</p>
        </div>
        <button
          onClick={handleAddAnime}
          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-semibold transition-all shadow-lg shadow-blue-900/20"
        >
          <Icon name="Plus" size={18} />
          <span>{t.addAnime}</span>
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {animes.map((anime) => {
          const mon = monitors.find((m) => m.id === anime.monitorId) || monitors[0];
          return (
            <div
              key={anime.id}
              onClick={() => {
                dispatch({ type: 'SET_SELECTED_ANIME', payload: anime });
                dispatch({ type: 'SET_VIEW', payload: 'edit' });
              }}
              className={`group p-5 border rounded-xl cursor-pointer transition-all ${
                isDarkMode
                  ? 'bg-[#161b22] border-gray-700 hover:border-blue-500 shadow-lg shadow-black/20'
                  : 'bg-white border-gray-200 hover:border-blue-400 shadow-sm hover:shadow-md'
              }`}
            >
              <div className="flex justify-between items-start mb-4">
                <div
                  className={`w-12 h-12 rounded-lg flex items-center justify-center border transition-colors ${
                    isDarkMode ? 'bg-blue-500/10 border-blue-500/20' : 'bg-blue-50 border-blue-100'
                  }`}
                >
                  <Icon name="User" size={24} className="text-blue-500" />
                </div>
                <div className="flex items-center space-x-2">
                  {mon?.backgroundImage && (
                    <div
                      className="w-4 h-4 rounded-full border border-blue-500 bg-center bg-cover"
                      style={{ backgroundImage: `url(${mon.backgroundImage})` }}
                    />
                  )}
                  <MonitorBadge name={mon?.name || 'Display'} isDarkMode={isDarkMode} />
                </div>
              </div>
              <h3 className={`font-bold text-xl mb-2 ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
                {getTranslatedName(anime.name, 'anime')}
              </h3>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {anime.states.slice(0, 4).map((s) => (
                  <Badge key={s.id} isDarkMode={isDarkMode}>
                    {getTranslatedName(s.name, 'state')}
                  </Badge>
                ))}
              </div>
              <p
                className={`pt-2 mt-3 border-t uppercase tracking-tighter font-mono text-[10px] ${
                  isDarkMode ? 'border-gray-800 text-gray-500' : 'border-gray-100 text-gray-400'
                }`}
              >
                {t.coord}: {Math.round((anime.x / 1000) * (mon?.width || 1920))}x,{' '}
                {Math.round((anime.y / 1000) * (mon?.height || 1080))}y
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default Dashboard;
