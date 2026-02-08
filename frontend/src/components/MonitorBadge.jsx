import React from 'react';

export function MonitorBadge({ name, isDarkMode }) {
  return (
    <div
      className={`text-[10px] px-1.5 py-0.5 rounded border font-bold transition-all shadow-sm ${
        isDarkMode ? 'bg-gray-800 text-blue-400 border-gray-700' : 'bg-blue-600 text-white border-blue-700'
      }`}
    >
      {name}
    </div>
  );
}

export default MonitorBadge;
