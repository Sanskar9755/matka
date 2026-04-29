/**
 * Centered loading spinner component.
 */
import React from 'react';

interface LoadingSpinnerProps {
  /** Optional size in pixels (default 40) */
  size?: number;
  /** Optional additional class names */
  className?: string;
}

export function LoadingSpinner({ size = 40, className = '' }: LoadingSpinnerProps): React.ReactElement {
  return (
    <div className={`flex items-center justify-center min-h-[200px] ${className}`}>
      <div
        className="animate-spin rounded-full border-4 border-indigo-200 border-t-indigo-600"
        style={{ width: size, height: size }}
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}
