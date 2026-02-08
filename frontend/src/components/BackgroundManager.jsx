import React, { useState, useEffect } from 'react';
import { Icon } from './Icon';
import { useAppState } from '../context/AppState';

// Build preview CSS url() from backgroundImage (relative path, absolute path, or data URL).
function getPreviewBackgroundUrl(backgroundImage) {
  if (!backgroundImage) return 'none';
  if (backgroundImage.startsWith('data:') || backgroundImage.startsWith('/')) {
    return `url(${backgroundImage})`;
  }
  const base = typeof window !== 'undefined' ? window.location.origin : '';
  return `url(${base}/api/uploads/${backgroundImage})`;
}

export function BackgroundManager({ t }) {
  const { isDarkMode, monitors, displays, dispatch, saveSettings } = useAppState();
  const [wallpaperLoadingId, setWallpaperLoadingId] = useState(null);
  // Draft overrides: only applied on "배경 적용". Keyed by monitor id.
  const [draftOverrides, setDraftOverrides] = useState({});

  useEffect(() => {
    setDraftOverrides({});
  }, [monitors, displays]);

  const connectedIds = new Set((displays || []).map((d) => d.id));
  const monitorById = {};
  monitors.forEach((m) => { monitorById[m.id] = m; });

  const mergedList = [];
  (displays || []).forEach((d) => {
    const mon = monitorById[d.id] || { id: d.id, name: d.id.replace('display-', 'Display '), width: d.width, height: d.height, backgroundImage: '' };
    mergedList.push({
      ...mon,
      width: d.width,
      height: d.height,
      index: d.index,
      connected: true,
    });
  });
  monitors.forEach((m) => {
    if (!connectedIds.has(m.id)) mergedList.push({ ...m, index: -1, connected: false });
  });
  const listToShow = mergedList.length ? mergedList : monitors.map((m) => ({ ...m, index: 0, connected: true }));

  const applyDraft = (mon) => {
    const o = draftOverrides[mon.id];
    if (!o) return mon;
    return { ...mon, ...o };
  };

  const updateDraft = (id, updates) => {
    setDraftOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...updates } }));
  };

  const addMonitor = () => {
    const newId = `mon-${Date.now()}`;
    dispatch({
      type: 'ADD_MONITOR',
      payload: {
        id: newId,
        name: `Display ${monitors.length + 1}`,
        width: 1920,
        height: 1080,
        backgroundImage: '',
      },
    });
  };

  const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB (matches server)
  const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];

  const handleBgUpload = (id, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
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
      if (reader.result) updateDraft(id, { backgroundImage: reader.result });
    };
    reader.onerror = () => alert(reader.error?.message || 'Failed to read file');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleUseCurrentWallpaper = async (mon) => {
    if (!mon.connected || mon.index == null || mon.index < 0) return;
    setWallpaperLoadingId(mon.id);
    try {
      const res = await fetch(`/api/displays/${mon.index}/wallpaper`);
      if (!res.ok) throw new Error(await res.text() || 'Failed to get wallpaper');
      const data = await res.json();
      const applied = applyDraft(mon);
      updateDraft(mon.id, {
        backgroundImage: data.data ?? data.path,
        width: data.width ?? applied.width,
        height: data.height ?? applied.height,
      });
    } catch (err) {
      console.error(err);
      alert(err.message || 'Failed to get wallpaper');
    } finally {
      setWallpaperLoadingId(null);
    }
  };

  const handleApply = async () => {
    const monitorsToSave = monitors.map((m) => ({ ...m, ...draftOverrides[m.id] }));
    const err = await saveSettings({ monitors: monitorsToSave });
    if (err) alert(t.saveError || err);
    else {
      setDraftOverrides({});
      alert(t.saveAlert);
    }
  };

  const removeMonitor = (mon) => {
    const fallback = monitors.find((m) => m.id !== mon.id);
    if (!fallback) return;
    dispatch({ type: 'REMOVE_MONITOR', payload: { id: mon.id, fallbackId: fallback.id } });
  };

  const showAddDisplay = !displays || displays.length === 0;

  return (
    <div className="max-w-5xl mx-auto p-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className={`text-2xl font-bold ${isDarkMode ? 'text-white' : 'text-gray-900'}`}>{t.globalBg}</h1>
          <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>{t.bgResolutionDesc}</p>
        </div>
        {showAddDisplay && (
          <button
            onClick={addMonitor}
            className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-blue-900/20 transition-all active:scale-95"
          >
            <Icon name="Plus" size={16} />
            <span>{t.addDisplay}</span>
          </button>
        )}
      </div>
      <div className="space-y-6">
        {listToShow.map((mon, index) => {
          const applied = applyDraft(mon);
          const isDim = !mon.connected;
          const canRemove = listToShow.length > 1;
          const deleteButton = canRemove && (
            <button
              type="button"
              onClick={() => removeMonitor(mon)}
              className="flex items-center space-x-1 px-3 py-1.5 bg-red-600/10 text-red-500 text-xs font-bold rounded-lg border border-red-500/20 hover:bg-red-600/20 transition-all"
            >
              <Icon name="Trash2" size={14} />
              <span>{t.removeDisplay}</span>
            </button>
          );
          return (
            <div
              key={mon.id}
              className={`p-6 border rounded-2xl transition-colors ${
                isDarkMode
                  ? 'bg-[#0d1117] border-gray-700 text-white shadow-black/20'
                  : 'bg-white border-gray-200 text-gray-900 shadow-sm'
              } ${isDim ? 'opacity-60' : ''}`}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-600/10 text-blue-500 rounded-lg">
                    <Icon name="Monitor" size={18} />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={applied.name}
                      onChange={(e) => updateDraft(mon.id, { name: e.target.value })}
                      className="bg-transparent font-bold outline-none focus:text-blue-500 transition-colors w-40"
                      readOnly={isDim}
                    />
                    <div className="text-[10px] font-mono opacity-40 uppercase">
                      {isDim ? t.disconnected : index === 0 ? t.mainDisplay : `Display #${index + 1}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  {!isDim && (
                    <>
                      <label className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600/10 text-blue-500 text-xs font-bold rounded-lg border border-blue-500/20 cursor-pointer hover:bg-blue-600/20 transition-all">
                        <Icon name="Upload" size={14} />
                        <span>{t.uploadBg}</span>
                        <input type="file" accept="image/png,image/jpeg,image/jpg,image/gif,image/webp" className="hidden" onChange={(e) => handleBgUpload(mon.id, e)} />
                      </label>
                      <button
                        type="button"
                        onClick={() => handleUseCurrentWallpaper(applied)}
                        disabled={wallpaperLoadingId === mon.id}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-green-600/10 text-green-600 text-xs font-bold rounded-lg border border-green-500/20 hover:bg-green-600/20 transition-all disabled:opacity-50"
                      >
                        {wallpaperLoadingId === mon.id ? (
                          <span>{t.loading || '...'}</span>
                        ) : (
                          <>
                            <Icon name="Image" size={14} />
                            <span>{t.useCurrentWallpaper}</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                  {deleteButton}
                </div>
              </div>
              <div className="flex flex-col md:flex-row items-center gap-10">
                <div className="flex-1 grid grid-cols-2 gap-6 w-full">
                  <div className="space-y-2">
                    <label className="text-xs font-bold opacity-50 uppercase tracking-tighter">{t.horRes}</label>
                    <input
                      type="number"
                      value={applied.width}
                      onChange={(e) => updateDraft(mon.id, { width: parseInt(e.target.value) || 1 })}
                      className={`w-full p-3 border rounded-xl bg-transparent outline-none focus:border-blue-500 transition-all font-mono ${
                        isDarkMode ? 'border-gray-700' : 'border-gray-200'
                      }`}
                      readOnly={isDim}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold opacity-50 uppercase tracking-tighter">{t.verRes}</label>
                    <input
                      type="number"
                      value={applied.height}
                      onChange={(e) => updateDraft(mon.id, { height: parseInt(e.target.value) || 1 })}
                      className={`w-full p-3 border rounded-xl bg-transparent outline-none focus:border-blue-500 transition-all font-mono ${
                        isDarkMode ? 'border-gray-700' : 'border-gray-200'
                      }`}
                      readOnly={isDim}
                    />
                  </div>
                </div>
                <div className="flex flex-col items-center shrink-0">
                  <p className={`text-[9px] mb-1.5 w-full text-center ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    {t.uploadLimit}
                  </p>
                  <div className="flex items-start gap-2">
                    <div
                      style={{
                        aspectRatio: `${applied.width}/${applied.height}`,
                        backgroundImage: getPreviewBackgroundUrl(applied.backgroundImage),
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                      }}
                      className={`flex flex-col items-center justify-center rounded-xl border w-40 h-32 overflow-hidden shadow-inner relative ${
                        isDarkMode ? 'bg-black/20 border-gray-800' : 'bg-gray-100 border-gray-200'
                      }`}
                    >
                      {!applied.backgroundImage && (
                        <div className="flex flex-col items-center opacity-30">
                          <p className="text-[8px] uppercase font-bold mb-1">{t.ratioVisualization}</p>
                          <span className="text-[10px] font-mono font-bold">{(applied.width / applied.height).toFixed(2)}</span>
                        </div>
                      )}
                      {applied.backgroundImage && (
                        <div className="absolute top-1 right-1 bg-blue-600 text-white text-[8px] px-1 rounded font-bold shadow-sm">
                          PREVIEW
                        </div>
                      )}
                    </div>
                    {applied.backgroundImage && (
                      <button
                        type="button"
                        onClick={() => updateDraft(mon.id, { backgroundImage: '' })}
                        className="p-1.5 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 mt-0.5"
                        title={t.removeBg}
                      >
                        <Icon name="X" size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-8">
        <button
          onClick={handleApply}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold flex items-center justify-center space-x-2 shadow-lg shadow-blue-900/30 transition-all active:scale-95"
        >
          <Icon name="Save" size={18} />
          <span>{t.applyBg}</span>
        </button>
      </div>
    </div>
  );
}

export default BackgroundManager;
