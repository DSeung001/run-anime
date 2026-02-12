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
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const canvasRef = useRef(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialRect = useRef({ x: 0, y: 0, w: 0, h: 0 });
  
  // Helper function to check if spritePath is a GIF
  // Handles both uploaded files (data:image/gif) and saved files (anime/anime-xxx.gif)
  const isGIFFile = (spritePath) => {
    if (!spritePath) return false;
    const lower = spritePath.toLowerCase().trim();
    // Check for data URL with GIF mime type
    if (lower.startsWith('data:image/gif')) return true;
    // Check for file extension (handles both .gif and .GIF)
    if (lower.endsWith('.gif')) return true;
    // Check for GIF in path (handles paths like anime/anime-xxx.gif or /api/uploads/anime/anime-xxx.gif)
    if (lower.includes('/gif') || lower.includes('\\gif')) return true;
    // Check for image/gif mime type in any part of the string
    if (lower.includes('image/gif')) return true;
    return false;
  };

  useEffect(() => {
    setTempAnime(selectedAnime);
    setSelectedStateId(selectedAnime?.states?.[0]?.id);
  }, [selectedAnime]);

  if (!tempAnime) return null;

  const activeState = tempAnime.states.find((s) => s.id === selectedStateId);
  const currentMonitor = monitors.find((m) => m.id === tempAnime.monitorId) || monitors[0];

  const toPxW = (val) => Math.round((val / 1000) * (currentMonitor?.width || 1920));
  const toPxH = (val) => Math.round((val / 1000) * (currentMonitor?.height || 1080));

  // Get position for the active state (or anime if state doesn't have position)
  const getStatePosition = () => {
    if (!activeState) {
      return { x: tempAnime.x, y: tempAnime.y, width: tempAnime.width, height: tempAnime.height };
    }
    return {
      x: activeState.x || tempAnime.x || 0,
      y: activeState.y || tempAnime.y || 0,
      width: activeState.width || tempAnime.width || 120,
      height: activeState.height || tempAnime.height || 120,
    };
  };

  const statePos = getStatePosition();

  const updateState = useCallback((stateId, updates) => {
    setTempAnime((prev) => {
      const newStates = prev.states.map((s) => {
        if (s.id !== stateId) return s;
        return { ...s, ...updates };
      });
      return { ...prev, states: newStates };
    });
  }, []);

  const updateStatePosition = useCallback((x, y, width, height) => {
    if (!selectedStateId || !tempAnime) return;
    const currentActiveState = tempAnime.states.find((s) => s.id === selectedStateId);
    if (!currentActiveState) return;
    updateState(selectedStateId, { x, y, width, height });
  }, [selectedStateId, tempAnime, updateState]);

  const handleMouseMove = useCallback(
    (e) => {
      if ((!isDragging && !isResizing) || !canvasRef.current) return;
      const currentActiveState = tempAnime?.states?.find((s) => s.id === selectedStateId);
      if (!currentActiveState) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const deltaX = ((e.clientX - rect.left - dragStart.current.x) / rect.width) * 1000;
      const deltaY = ((e.clientY - rect.top - dragStart.current.y) / rect.height) * 1000;
      if (isDragging) {
        const newX = Math.max(0, Math.min(1000 - initialRect.current.w, Math.round(initialRect.current.x + deltaX)));
        const newY = Math.max(0, Math.min(1000 - initialRect.current.h, Math.round(initialRect.current.y + deltaY)));
        updateStatePosition(newX, newY, initialRect.current.w, initialRect.current.h);
      } else {
        const newWidth = Math.max(20, Math.min(1000 - initialRect.current.x, Math.round(initialRect.current.w + deltaX)));
        const newHeight = Math.max(20, Math.min(1000 - initialRect.current.y, Math.round(initialRect.current.h + deltaY)));
        updateStatePosition(initialRect.current.x, initialRect.current.y, newWidth, newHeight);
      }
    },
    [isDragging, isResizing, tempAnime, selectedStateId, updateStatePosition]
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

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB (matches server)
  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

  const handleSpriteUpload = async (e) => {
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
    // Convert file to base64 data URL for temporary storage
    // Actual upload will happen when save button is clicked
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataURL = event.target.result;
        const updates = { spritePath: dataURL };
        // If it's a GIF and gifDisposal doesn't exist, initialize with default
        if (file.type === 'image/gif' && (!activeState.gifDisposal || activeState.gifDisposal.length === 0)) {
          // Will be set properly by backend on save, but initialize here for UI
          updates.gifDisposal = [0]; // Default to DisposalNone
        }
        updateState(activeState.id, updates);
      };
      reader.onerror = () => {
        alert('Failed to read file');
      };
      reader.readAsDataURL(file);
    } catch (err) {
      alert(err.message || 'Failed to read file');
    }
    e.target.value = '';
  };

  const startOp = (e, type) => {
    if (!canvasRef.current || !activeState) return;
    const rect = canvasRef.current.getBoundingClientRect();
    if (type === 'drag') setIsDragging(true);
    else setIsResizing(true);
    dragStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    initialRect.current = { x: statePos.x, y: statePos.y, w: statePos.width, h: statePos.height };
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

  const handleDeleteAnime = async () => {
    if (!window.confirm(t.confirmDelete)) return;
    
    // Calculate updated animes array before state update
    const updatedAnimes = animes.filter((a) => a.id !== tempAnime.id);
    
    // Save to backend
    const err = await saveSettings({ animes: updatedAnimes });
    if (err) {
      alert(t.saveError || err);
      return;
    }
    
    // Update state and switch UI after successful save
    dispatch({ type: 'REMOVE_ANIME', payload: tempAnime.id });
    dispatch({ type: 'SET_VIEW', payload: 'list' });
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
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                        {t.uploadImg}
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
                    {/* GIF Disposal Settings - Always show if GIF file */}
                    {activeState.spritePath && isGIFFile(activeState.spritePath) && (
                      <div className="space-y-3">
                        <label className="text-[10px] font-bold opacity-40 uppercase tracking-widest">
                          {t.gifDisposal}
                        </label>
                        <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                          {t.gifDisposalDesc}
                        </p>
                        <select
                          value={activeState.gifDisposal && activeState.gifDisposal.length > 0 ? activeState.gifDisposal[0] : 0}
                          onChange={async (e) => {
                            const selectedValue = parseInt(e.target.value, 10);
                            let frameCount = activeState.gifDisposal?.length || 0;
                            
                            // If gifDisposal doesn't exist, try to get frame count from the GIF file
                            if (frameCount === 0) {
                              try {
                                const imageUrl = activeState.spritePath.startsWith('data:') || activeState.spritePath.startsWith('/')
                                  ? activeState.spritePath
                                  : `/api/uploads/${activeState.spritePath}`;
                                
                                // Create an image element to check if it's a GIF
                                const img = new Image();
                                img.src = imageUrl;
                                
                                // For GIFs, we can't easily get frame count from frontend
                                // So we'll use a default frame count and let backend update it
                                // Or we can make an API call to get frame count
                                // For now, use a reasonable default (will be updated by backend on save)
                                frameCount = 1; // Default, will be corrected by backend
                              } catch (err) {
                                console.error('Failed to get GIF frame count:', err);
                                frameCount = 1; // Fallback to 1 frame
                              }
                            }
                            
                            // Apply selected disposal method to all frames
                            const newDisposal = new Array(frameCount).fill(selectedValue);
                            updateState(activeState.id, { gifDisposal: newDisposal });
                          }}
                          className={`w-full p-2 mt-1 rounded bg-transparent border text-sm outline-none focus:ring-1 focus:ring-blue-500 ${
                            isDarkMode ? 'border-gray-800 text-white' : 'border-gray-200 text-gray-900 bg-white'
                          }`}
                        >
                          <option value={0} className={isDarkMode ? 'bg-[#0d1117]' : 'bg-white'}>
                            {t.disposalNone}
                          </option>
                          <option value={1} className={isDarkMode ? 'bg-[#0d1117]' : 'bg-white'}>
                            {t.disposalBackground}
                          </option>
                          <option value={2} className={isDarkMode ? 'bg-[#0d1117]' : 'bg-white'}>
                            {t.disposalPrevious}
                          </option>
                        </select>
                        {activeState.gifDisposal && activeState.gifDisposal.length > 0 && (
                          <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {activeState.gifDisposal.length} {lang === 'ko' ? '프레임' : 'frames'}
                          </p>
                        )}
                        {(!activeState.gifDisposal || activeState.gifDisposal.length === 0) && (
                          <p className={`text-[10px] ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                            {lang === 'ko' ? '저장 시 프레임 수가 자동으로 업데이트됩니다.' : 'Frame count will be updated automatically on save.'}
                          </p>
                        )}
                      </div>
                    )}
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
                  minHeight: 200,
                  backgroundImage: currentMonitor?.backgroundImage ? `url(${currentMonitor.backgroundImage})` : 'none',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
                className={`relative w-full border rounded-lg overflow-hidden select-none shadow-inner transition-colors ${
                  isDarkMode ? 'border-gray-800 bg-black/40' : 'border-gray-200 bg-gray-100'
                }`}
                title={lang === 'ko' ? '크기·위치는 모니터 기준(0–1000)이며 실제 오버레이와 동일합니다.' : 'Size and position use monitor scale (0–1000) and match the overlay.'}
              >
                {!currentMonitor?.backgroundImage && (
                  <div className="absolute inset-0 grid grid-cols-12 grid-rows-6 opacity-10 pointer-events-none">
                    {[...Array(72)].map((_, i) => (
                      <div key={i} className={`border-[0.5px] ${isDarkMode ? 'border-gray-500' : 'border-gray-300'}`} />
                    ))}
                  </div>
                )}
                {activeState && (
                  <div
                    onMouseDown={(e) => startOp(e, 'drag')}
                    style={{
                      left: `${statePos.x / 10}%`,
                      top: `${statePos.y / 10}%`,
                      width: `${statePos.width / 10}%`,
                      height: `${statePos.height / 10}%`,
                    }}
                    className="absolute bg-blue-500/30 border-2 border-blue-500 flex items-center justify-center cursor-move shadow-xl group transition-transform active:scale-[0.99]"
                  >
                    <Icon name="User" size={24} className="text-blue-500 opacity-60" />
                    <div
                      onMouseDown={(e) => startOp(e, 'resize')}
                      className="absolute -bottom-1 -right-1 w-4 h-4 bg-blue-600 rounded-sm cursor-nwse-resize border border-white/20 shadow-md transition-transform hover:scale-125"
                    />
                  </div>
                )}
              </div>
              {activeState && (
                <>
                  <div className="grid grid-cols-2 gap-8 pt-4">
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline">
                        <label className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.horPos}</label>
                        <span className="font-mono text-blue-500 font-bold">{toPxW(statePos.x)}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1000"
                        value={statePos.x}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updateStatePosition(val, statePos.y, statePos.width, statePos.height);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline">
                        <label className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.verPos}</label>
                        <span className="font-mono text-blue-500 font-bold">{toPxH(statePos.y)}px</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="1000"
                        value={statePos.y}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updateStatePosition(statePos.x, val, statePos.width, statePos.height);
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-8 pt-4">
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline">
                        <label className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.width}</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="20"
                            max="1000"
                            value={statePos.width}
                            onChange={(e) => {
                              const val = Math.max(20, Math.min(1000, parseInt(e.target.value) || 20));
                              updateStatePosition(statePos.x, statePos.y, val, statePos.height);
                            }}
                            className={`w-20 p-1.5 rounded bg-transparent border text-sm text-right font-mono ${
                              isDarkMode ? 'border-gray-700 text-white' : 'border-gray-200 text-gray-900'
                            }`}
                          />
                          <span className="font-mono text-blue-500 font-bold text-xs">{toPxW(statePos.width)}px</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="1000"
                        value={statePos.width}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updateStatePosition(statePos.x, statePos.y, val, statePos.height);
                        }}
                        className="w-full"
                      />
                    </div>
                    <div className="space-y-4">
                      <div className="flex justify-between items-baseline">
                        <label className="text-xs font-bold opacity-50 uppercase tracking-widest">{t.height}</label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="number"
                            min="20"
                            max="1000"
                            value={statePos.height}
                            onChange={(e) => {
                              const val = Math.max(20, Math.min(1000, parseInt(e.target.value) || 20));
                              updateStatePosition(statePos.x, statePos.y, statePos.width, val);
                            }}
                            className={`w-20 p-1.5 rounded bg-transparent border text-sm text-right font-mono ${
                              isDarkMode ? 'border-gray-700 text-white' : 'border-gray-200 text-gray-900'
                            }`}
                          />
                          <span className="font-mono text-blue-500 font-bold text-xs">{toPxH(statePos.height)}px</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="1000"
                        value={statePos.height}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          updateStatePosition(statePos.x, statePos.y, statePos.width, val);
                        }}
                        className="w-full"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Editor;
