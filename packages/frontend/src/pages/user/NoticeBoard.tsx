/**
 * Notice Board / Rules page — /user/notice-board
 */
import React from 'react';

const rules = [
  'All bets are final once placed. No cancellations allowed.',
  'Bets close 20 minutes before the result declaration time.',
  'Winnings are credited automatically after result declaration.',
  'Minimum bet amount and maximum bet amount are set by your admin.',
  'Withdrawal requests are processed by your admin within 24 hours.',
  'In case of any dispute, the admin\'s decision is final.',
  'Do not share your login credentials with anyone.',
  'This platform is for entertainment purposes only.',
  'Players must be 18 years or older to participate.',
  'The platform is not responsible for any financial losses.',
];

export default function NoticeBoard(): React.ReactElement {
  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-2">Notice Board & Rules</h1>
      <p className="text-sm text-gray-500 mb-6">Please read all rules carefully before playing.</p>

      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-xl p-4 mb-6">
        <p className="text-sm font-bold text-red-700 dark:text-red-400">⚠️ Important Notice</p>
        <p className="text-xs text-red-600 dark:text-red-300 mt-1">
          This is a skill-based game platform. Play responsibly. Set a budget and stick to it.
        </p>
      </div>

      <div className="space-y-3">
        {rules.map((rule, idx) => (
          <div key={idx} className="flex gap-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3">
            <span className="w-6 h-6 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{idx + 1}</span>
            <p className="text-sm text-gray-700 dark:text-gray-300">{rule}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
