import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Icon } from './Icon';
import { Badge } from './Badge';
import { MonitorBadge } from './MonitorBadge';
import { useAppState } from '../context/AppState';

export function Editor({ t, getTranslatedName }) {
  const { isDarkMode, lang, monitors, animes, selectedAnime, dispatch, saveSettings } = useAppState();
  const [activeTab, setActiveTab] = useState('settings');
  const [tempAnime, setTempAnime] = useState(selectedAnime);
  const [selectedStateId, setSelectedStateId] = useState(selectedAnime?.states?.[0]?.id);
  const [rowsStr, setRowsStr] = useState('');
  const [colsStr, setColsStr] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const canvasRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialRect = useRef({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    setTempAnime(selectedAnime);
    setSelectedStateId(selectedAnime?.states?.[0]?.id);
  }, [selectedAnime]);

  const handleMouseMove = useCallback(
    (e) => {
      if ((!isDragging && !isResizing) || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const deltaX = ((e.clientX - rect.left - dragStart.current.x) / rect.width) * 1000;
      const deltaY = ((e.clientY - rect.top - dragStart.current.y) / rect.height) * 1000;
      if (isDragging) {
        setTempAnime((p) => ({
          ...p,
          x: Math.max(0, Math.min(1000 - p.width, Math.round(initialRect.current.x + deltaX))),
          y: Math.max(0, Math.min(1000 - p.height, Math.round(initialRect.current.y + deltaY))),
        }));
      } else {
        setTempAnime((p) => ({
          ...p,
          width: Math.max(20, Math.min(1000 - p.x, Math.round(initialRect.current.w + deltaX))),
          height: Math.max(20, Math.min(1000 - p.y, Math.round(initialRect.current.h + deltaY))),
        }));
      }
    },
    [isDragging, isResizing]
  );

  useEffect(() => {
    const end = () => {
      setIsDragging(false);
      setIsResizing(false);
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', end);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', end);
    };
  }, [handleMouseMove]);

  const stateForSync = tempAnime?.states?.find((s) => s.id === selectedStateId);
  useEffect(() => {
    if (stateForSync) {
      setRowsStr(String(stateForSync.rows));
      setColsStr(String(stateForSync.cols));
    }
  }, [selectedStateId, stateForSync?.rows, stateForSync?.cols]);

  if (!tempAnime) return null;

  const activeState = tempAnime.states.find((s) => s.id === selectedStateId);
  const currentMonitor = monitors.find((m) => m.id === tempAnime.monitorId) || monitors[0];

  const toPxW = (val) => Math.round((val / 1000) * (currentMonitor?.width || 1920));
  const toPxH = (val) => Math.round((val / 1000) * (currentMonitor?.height || 1080));

  const updateState = (stateId, updates) => {
    const newStates = tempAnime.states.map((s) => {
      if (s.id !== stateId) return s;
      const newState = { ...s, ...updates };
      if (updates.rows !== undefined || updates.cols !== undefined) {
        const newCount = (updates.rows ?? s.rows) * (updates.cols ?? s.cols);
        const newDurations = [...(newState.frameDurations || [])];
        while (newDurations.length < newCount) newDurations.push(newState.duration || 150);
        if (newDurations.length > newCount) newDurations.length = newCount;
        newState.frameDurations = newDurations;
      }
      return newState;
    });
    setTempAnime({ ...tempAnime, states: newStates });
  };

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB (matches server)
  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

  const handleSpriteUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeState) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      alert(t.uploadTooLarge || 'File is too large.');
      e.target.value = '';
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert(t.uploadInvalidType || 'Unsupported format.');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result) updateState(activeState.id, { spritePath: reader.result });
    };
    reader.onerror = () => alert(reader.error?.message || 'Failed to read file');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startOp = (e, type) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (type === 'drag') setIsDragging(true);
    else setIsResizing(true);
    dragStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    initialRect.current = { x: tempAnime.x, y: tempAnime.y, w: tempAnime.width, h: tempAnime.height };
    e.stopPropagation();
  };

  const handleSave = async () => {
    const nextAnimes = animes.map((a) => (a.id === tempAnime.id ? tempAnime : a));
    const err = await saveSettings({ animes: nextAnimes });
    if (err) {
      alert(t.saveError || err);
      return;
    }
    dispatch({ type: 'UPDATE_ANIME', payload: tempAnime });
    dispatch({ type: 'SET_VIEW', payload: 'list' });
    alert(t.saveAlert);
  };

  const handleDeleteAnime = () => {
    if (!window.confirm(t.confirmDelete)) return;
    dispatch({ type: 'REMOVE_ANIME', payload: tempAnime.id });
    saveSettings();
  };

  const stateSettingsLabel =
    lang === 'ko' ? t.stateSettingsLabelKo || '상태 설정' : t.stateSettingsLabelEn || 'Settings';

  return (
    <div className="max-w-6xl mx-auto p-8 animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => dispatch({ type: 'SET_VIEW', payload: 'list' })}
            className={`p-2 rounded-lg transition-colors ${isDarkMode ? 'hover:bg-gray-700/20 text-white' : 'hover:bg-gray-100 text-gray-900'}`}
          >
            <Icon name="ArrowLeft" />
          </button>
          <div>
            <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>
              {getTranslatedName(tempAnime.name, 'anime')}
            </h1>
            <p className={`text-xs ${isDarkMode ? 'opacity-50' : 'text-gray-500'}`}>{t.generalSettings}</p>
          </div>
        </div>
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-bold flex items-center space-x-2 shadow-lg transition-all active:scale-95"
        >
          <Icon name="Save" size={18} />
          <span>{t.save}</span>
        </button>
      </div>
      <div className="flex flex-col lg:flex-row gap-8">
        <div className="lg:w-64 space-y-1 shrink-0">
          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'settings'
                ? 'bg-blue-600 text-white shadow-md'
                : isDarkMode
                  ? 'text-gray-400 hover:opacity-100'
                  : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Icon name="Settings" />
            <span>{t.generalSettings}</span>
          </button>
          <button
            onClick={() => setActiveTab('preview')}
            className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'preview'
                ? 'bg-blue-600 text-white shadow-md'
                : isDarkMode
                  ? 'text-gray-400 hover:opacity-100'
                  : 'text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Icon name="Layout" />
            <span>{t.preview}</span>
          </button>
          <div className={`pt-4 border-t mt-4 ${isDarkMode ? 'border-gray-800' : 'border-gray-200'}`}>
            <button
              onClick={handleDeleteAnime}
              className="w-full flex items-center space-x-2 p-2.5 text-red-500 hover:bg-red-500/10 rounded-lg text-sm font-medium"
            >
              <Icon name="Trash2" />
              <span>{t.deleteAnime}</span>
            </button>
          </div>
        </div>
        <div
          className={`flex-1 p-8 border rounded-xl transition-colors ${
            isDarkMode ? 'bg-[#0d1117] border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900 shadow-sm'
          }`}
        >
          {activeTab === 'settings' ? (
            <div className="space-y-10 animate-in fade-in duration-300">
              <div
                className={`grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b ${isDarkMode ? 'border-gray-800/30' : 'border-gray-100'}`}
              >
                <div>
                  <label className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.animeName}</label>
                  <input
                    type="text"
                    value={tempAnime.name}
                    onChange={(e) => setTempAnime({ ...tempAnime, name: e.target.value })}
                    className={`w-full p-2.5 mt-2 rounded-lg bg-transparent border outline-none focus:ring-1 focus:ring-blue-500 ${
                      isDarkMode ? 'border-gray-700 text-white' : 'border-gray-200 text-gray-900'
                    }`}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.selectDisplay}</label>
                  <select
                    value={tempAnime.monitorId}
                    onChange={(e) => setTempAnime({ ...tempAnime, monitorId: e.target.value })}
                    className={`w-full p-2.5 mt-2 rounded-lg bg-transparent border text-sm ${isDarkMode ? 'border-gray-700' : 'border-gray-200'}`}
                  >
                    {monitors.map((m) => (
                      <option key={m.id} value={m.id} className={isDarkMode ? 'bg-[#0d1117]' : 'bg-white'}>
                        {m.name} ({m.width}x{m.height})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <section className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-blue-500 uppercase tracking-widest">{t.stateMgmt}</h3>
                  <button
                    onClick={() => {
                      const id = `state-${Date.now()}`;
                      setTempAnime({
                        ...tempAnime,
                        states: [
                          ...tempAnime.states,
                          {
                            id,
                            name: t.newState,
                            spritePath: '',
                            rows: 1,
                            cols: 1,
                            duration: 150,
                            frameDurations: [150],
                            chats: [],
                          },
                        ],
                      });
                      setSelectedStateId(id);
                    }}
                    className="text-xs bg-blue-600/10 text-blue-500 px-3 py-1.5 rounded-lg border border-blue-500/20 font-bold hover:bg-blue-600/20 transition-all"
                  >
                    +{t.addState}
                  </button>
                </div>
                <div
                  className={`flex flex-wrap gap-2 p-1.5 rounded-xl border ${
                    isDarkMode ? 'border-gray-800 bg-gray-900/30' : 'border-gray-100 bg-gray-50'
                  }`}
                >
                  {tempAnime.states.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStateId(s.id)}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                        selectedStateId === s.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : isDarkMode
                            ? 'opacity-40 hover:opacity-80'
                            : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      {getTranslatedName(s.name, 'state')}
                    </button>
                  ))}
                </div>
                {activeState && (
                  <div
                    className={`space-y-8 animate-in slide-in-from-top-2 duration-300 p-6 rounded-2xl border ${
                      isDarkMode ? 'bg-[#161b22]/50 border-gray-800/50' : 'bg-blue-50/20 border-blue-100/50'
                    }`}
                  >
                    <div className="flex justify-between items-center pb-4 border-b border-gray-700/20">
                      <h4 className="font-bold text-sm tracking-tight">
                        {getTranslatedName(activeState.name, 'state')} {stateSettingsLabel}
                      </h4>
                      <button
                        onClick={() => {
                          if (tempAnime.states.length <= 1) return;
                          if (!window.confirm(t.confirmDelete)) return;
                          setTempAnime({
                            ...tempAnime,
                            states: tempAnime.states.filter((s) => s.id !== activeState.id),
                          });
                          setSelectedStateId(tempAnime.states[0]?.id);
                        }}
                        className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-bold text-red-500 hover:bg-red-500/10 rounded-lg transition-all border border-red-500/20"
                      >
                        <Icon name="Trash2" size={14} />
                        <span>{t.deleteState}</span>
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div>
                        <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                          {t.stateName}
                        </label>
                        <input
                          type="text"
                          value={activeState.name}
                          onChange={(e) => updateState(activeState.id, { name: e.target.value })}
                          className={`w-full p-2 mt-1 rounded bg-transparent border text-sm outline-none focus:ring-1 focus:ring-blue-500 ${
                            isDarkMode ? 'border-gray-800' : 'border-gray-200 bg-white'
                          }`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{t.rows}</label>
                        <input
                          type="number"
                          min="1"
                          value={rowsStr}
                          onChange={(e) => setRowsStr(e.target.value)}
                          onBlur={() => {
                            const n = parseInt(rowsStr, 10);
                            const v = Number.isNaN(n) || n < 1 ? 1 : n;
                            updateState(activeState.id, { rows: v });
                            setRowsStr(String(v));
                          }}
                          className={`w-full p-2 mt-1 rounded bg-transparent border text-sm outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'border-gray-800' : 'border-gray-200 bg-white'}`}
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">{t.cols}</label>
                        <input
                          type="number"
                          min="1"
                          value={colsStr}
                          onChange={(e) => setColsStr(e.target.value)}
                          onBlur={() => {
                            const n = parseInt(colsStr, 10);
                            const v = Number.isNaN(n) || n < 1 ? 1 : n;
                            updateState(activeState.id, { cols: v });
                            setColsStr(String(v));
                          }}
                          className={`w-full p-2 mt-1 rounded bg-transparent border text-sm outline-none focus:ring-1 focus:ring-blue-500 ${isDarkMode ? 'border-gray-800' : 'border-gray-200 bg-white'}`}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-[1fr_1.4fr] gap-8">
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                          {t.uploadSprite}
                        </label>
                        <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {t.uploadLimit}
                        </p>
                        <div
                          className={`relative h-48 rounded-xl border-2 border-dashed flex flex-col items-center justify-center space-y-2 overflow-hidden sprite-preview-grid group transition-all hover:border-blue-500/50 ${
                            isDarkMode
                              ? 'border-gray-800 dark-grid'
                              : 'border-blue-100 light-grid bg-white shadow-inner'
                          }`}
                        >
                          {activeState.spritePath ? (
                            <img
                              src={
                                activeState.spritePath.startsWith('data:') || activeState.spritePath.startsWith('/')
                                  ? activeState.spritePath
                                  : `/api/uploads/${activeState.spritePath}`
                              }
                              className="h-full object-contain z-10 p-2"
                              alt="Sprite preview"
                            />
                          ) : (
                            <div className="flex flex-col items-center opacity-30 group-hover:opacity-100 group-hover:text-blue-500 transition-all">
                              <Icon name="Image" size={32} />
                              <span className="text-[11px] font-bold mt-2 uppercase">{t.selectFile}</span>
                            </div>
                          )}
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                            onChange={handleSpriteUpload}
                            className="absolute inset-0 opacity-0 cursor-pointer z-20"
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                            {t.frameTiming}
                          </label>
                          <Badge isDarkMode={isDarkMode}>{activeState.rows * activeState.cols} Frames</Badge>
                        </div>
                        {activeState.spritePath ? (
                          <div
                            className={`border rounded-xl p-3 overflow-y-auto dark-scrollbar ${
                              isDarkMode ? 'bg-black/20 border-gray-800/50' : 'bg-white border-gray-100 shadow-inner'
                            }`}
                            style={{ maxHeight: '320px' }}
                          >
                            <div
                              className="grid grid-cols-3 gap-3 w-full"
                            >
                              {activeState.frameDurations.map((dur, i) => {
                                const spriteUrl =
                                  activeState.spritePath.startsWith('data:') ||
                                  activeState.spritePath.startsWith('/')
                                    ? activeState.spritePath
                                    : `/api/uploads/${activeState.spritePath}`;
                                const col = i % activeState.cols;
                                const row = Math.floor(i / activeState.cols);
                                const x =  `${col * (100 / (activeState.cols > 1 ? activeState.cols - 1 : 1))}%`
                                const y = `${row * (100 / (activeState.rows > 1 ? activeState.rows - 1 : 1))}%`
                                const bgSize = `${activeState.cols * 100}% ${activeState.rows * 100}%`;
                                const bgPos = `${x} ${y}`;
                                return (
                                  <div
                                    key={i}
                                    className={`flex flex-col rounded-lg border overflow-hidden transition-shadow hover:shadow-md ${
                                      isDarkMode ? 'bg-gray-800/40 border-gray-700/50' : 'bg-gray-50 border-gray-200'
                                    }`}
                                  >
                                    <div
                                      className="w-full bg-gray-900/30 bg-no-repeat bg-top-left"
                                      style={{
                                        aspectRatio: `${activeState.cols} / ${activeState.rows}`,
                                        backgroundImage: `url(${spriteUrl})`,
                                        backgroundSize: bgSize,
                                        backgroundPosition: bgPos,
                                      }}
                                      title={`Frame ${i + 1}`}
                                    />
                                    <div className="p-1.5 flex items-center gap-1.5 border-t border-gray-700/30">
                                      <span className="text-[9px] font-mono opacity-50 shrink-0">#{i + 1}</span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={dur}
                                        onChange={(e) => {
                                          const newDurs = [...activeState.frameDurations];
                                          newDurs[i] = parseInt(e.target.value, 10) || 0;
                                          updateState(activeState.id, { frameDurations: newDurs });
                                        }}
                                        className={`flex-1 min-w-0 text-[11px] font-mono font-bold rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-500 ${
                                          isDarkMode
                                            ? 'bg-gray-800 text-blue-400'
                                            : 'bg-white border border-gray-200 text-blue-600'
                                        }`}
                                      />
                                      <span className="text-[9px] opacity-40 shrink-0">ms</span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div
                            className={`max-h-48 overflow-y-auto dark-scrollbar border rounded-xl p-3 grid grid-cols-2 gap-2 ${
                              isDarkMode ? 'bg-black/20 border-gray-800/50' : 'bg-white border-gray-100 shadow-inner'
                            }`}
                          >
                            {activeState.frameDurations.map((dur, i) => (
                              <div
                                key={i}
                                className={`flex items-center space-x-2 p-1.5 rounded border transition-shadow hover:shadow-sm ${
                                  isDarkMode ? 'bg-gray-800/40 border-gray-700/50' : 'bg-gray-50 border-gray-100'
                                }`}
                              >
                                <span className="text-[9px] font-mono opacity-40 w-4">#{i + 1}</span>
                                <input
                                  type="number"
                                  value={dur}
                                  onChange={(e) => {
                                    const newDurs = [...activeState.frameDurations];
                                    newDurs[i] = parseInt(e.target.value) || 0;
                                    updateState(activeState.id, { frameDurations: newDurs });
                                  }}
                                  className="bg-transparent text-[11px] font-mono outline-none w-full text-blue-500 font-bold"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>
          ) : (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-sm font-bold text-blue-500 uppercase tracking-widest">
                  {currentMonitor?.name} Preview
                </h3>
                <MonitorBadge
                  name={`${currentMonitor?.width || 0}x${currentMonitor?.height || 0}`}
                  isDarkMode={isDarkMode}
                />
              </div>
              <div
                ref={canvasRef}
                style={{
                  aspectRatio: `${currentMonitor?.width || 16}/${currentMonitor?.height || 9}`,
                  backgroundImage: currentMonitor?.backgroundImage ? `url(${currentMonitor.backgroundImage})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                className={`relative w-full border rounded-lg overflow-hidden select-none shadow-inner transition-colors ${
                  isDarkMode ? 'border-gray-800 bg-black/40' : 'border-gray-200 bg-gray-100'
                }`}
              >
                {!currentMonitor?.backgroundImage && (
                  <div className="absolute inset-0 grid grid-cols-12 grid-rows-6 opacity-10 pointer-events-none">
                    {[...Array(72)].map((_, i) => (
                      <div key={i} className={`border-[0.5px] ${isDarkMode ? 'border-gray-500' : 'border-gray-300'}`} />
                    ))}
                  </div>
                )}
                <div
                  onMouseDown={(e) => startOp(e, 'drag')}
                  style={{
                    left: `${tempAnime.x / 10}%`,
                    top: `${tempAnime.y / 10}%`,
                    width: `${tempAnime.width / 10}%`,
                    height: `${tempAnime.height / 10}%`,
                  }}
                  className="absolute bg-blue-500/30 border-2 border-blue-500 flex items-center justify-center cursor-move shadow-xl group transition-transform active:scale-[0.99]"
                >
                  <Icon name="User" size={24} className="text-blue-500 opacity-60" />
                  <div
                    onMouseDown={(e) => startOp(e, 'resize')}
                    className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-600 rounded-sm cursor-nwse-resize border border-white/20 shadow-md transition-transform hover:scale-125"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-8 pt-4">
                <div className="space-y-4">
                  <div className="flex justify-between items-baseline">
                    <label className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.horPos}</label>
                    <span className="font-mono text-blue-500 font-bold">{toPxW(tempAnime.x)}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={tempAnime.x}
                    onChange={(e) => setTempAnime({ ...tempAnime, x: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-baseline">
                    <label className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.verPos}</label>
                    <span className="font-mono text-blue-500 font-bold">{toPxH(tempAnime.y)}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    value={tempAnime.y}
                    onChange={(e) => setTempAnime({ ...tempAnime, y: parseInt(e.target.value) })}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Editor;
