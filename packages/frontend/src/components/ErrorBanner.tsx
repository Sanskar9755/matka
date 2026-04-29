/**
 * Dismissible error message banner.
 */
import React from 'react';

interface ErrorBannerProps {
  message: string;
  onDismiss?: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps): React.ReactElement {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 bg-red-50 border border-red-200 text-red-800 rounded-lg px-4 py-3 text-sm"
    >
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss error"
          className="flex-shrink-0 text-red-500 hover:text-red-700 min-h-[44px] min-w-[44px] flex items-center justify-center -mr-2 -mt-1"
        >
          ✕
        </button>
      )}
    </div>
  );
}
