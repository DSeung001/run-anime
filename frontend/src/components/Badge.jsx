import React from 'react';

export function Badge({ children, isDarkMode }) {
  return (
    <span
      className={`text-[10px] px-2 py-0.5 rounded border font-medium transition-colors ${
        isDarkMode ? 'bg-gray-800 text-gray-300 border-gray-700' : 'bg-blue-50 text-blue-600 border-blue-100'
      }`}
    >
      {children}
    </span>
  );
}

export default Badge;
