/**
 * How to Play page — /user/how-to-play
 */
import React from 'react';

const steps = [
  { num: '1', title: 'Add Funds', desc: 'Go to Funds section and add money to your wallet via UPI. Wait for admin approval.' },
  { num: '2', title: 'Choose a Market', desc: 'Go to Home and select an open market (e.g. Kalyan, Milan Day). Markets close 20 minutes before result.' },
  { num: '3', title: 'Select Bet Type', desc: 'Choose from Single, Jodi, Single Panna, Double Panna, Triple Panna, Half Sangam, or Full Sangam.' },
  { num: '4', title: 'Enter Selection & Points', desc: 'Enter your number/panna and the amount you want to bet. Minimum and maximum limits apply.' },
  { num: '5', title: 'Place Bet', desc: 'Confirm your bet. Points will be deducted from your wallet immediately.' },
  { num: '6', title: 'Wait for Result', desc: 'Results are declared at the scheduled time. Winnings are credited automatically to your wallet.' },
  { num: '7', title: 'Withdraw Winnings', desc: 'Go to Funds → Withdraw to request a withdrawal. Admin will process it.' },
];

const betTypes = [
  { name: 'Single', format: '0-9', multiplier: '9x', example: 'Bet on digit 5' },
  { name: 'Jodi', format: '00-99', multiplier: '90x', example: 'Bet on 56' },
  { name: 'Single Panna', format: '3 diff digits', multiplier: '150x', example: 'Bet on 123' },
  { name: 'Double Panna', format: '2 same digits', multiplier: '300x', example: 'Bet on 112' },
  { name: 'Triple Panna', format: 'All same', multiplier: '600x', example: 'Bet on 111' },
  { name: 'Half Sangam', format: 'Panna-Ank', multiplier: '1000x', example: 'Bet on 123-5' },
  { name: 'Full Sangam', format: 'Panna-Panna', multiplier: '10000x', example: 'Bet on 123-456' },
];

export default function HowToPlay(): React.ReactElement {
  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100 mb-6">How to Play</h1>

      <div className="space-y-4 mb-8">
        {steps.map((step) => (
          <div key={step.num} className="flex gap-4">
            <div className="w-8 h-8 bg-indigo-600 text-white rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 mt-0.5">{step.num}</div>
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100">{step.title}</p>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{step.desc}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">Bet Types</h2>
      <div className="space-y-2">
        {betTypes.map((bt) => (
          <div key={bt.name} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">{bt.name}</p>
              <p className="text-xs text-gray-500">{bt.format} · {bt.example}</p>
            </div>
            <span className="text-green-600 font-bold text-sm">{bt.multiplier}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
