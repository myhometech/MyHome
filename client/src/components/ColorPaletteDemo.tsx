import React from 'react';
import { Card } from './ui/card';

export const ColorPaletteDemo = () => {
  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-semibold mb-4">Extended Color Palette</h2>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Main Blue */}
        <Card className="p-6 text-center">
          <div className="w-full h-20 bg-primary rounded-lg mb-4"></div>
          <h3 className="font-semibold text-primary">Primary Blue</h3>
          <p className="text-sm text-gray-600">HSL(207, 90%, 54%)</p>
          <p className="text-xs text-gray-500">#1E90FF</p>
          <div className="mt-3 space-y-2">
            <button className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-sm w-full">
              Primary Button
            </button>
            <p className="text-primary text-sm">Primary Text</p>
          </div>
        </Card>

        {/* Primary Dashboard Dark */}
        <Card className="p-6 text-center">
          <div className="w-full h-20 bg-accent-purple-400 rounded-lg mb-4"></div>
          <h3 className="font-semibold text-accent-purple-400">Primary Dashboard</h3>
          <p className="text-sm text-gray-600">Primary Dark Purple</p>
          <p className="text-xs text-gray-500">#5A189A</p>
          <div className="mt-3 space-y-2">
            <button className="bg-accent-purple-400 text-white px-4 py-2 rounded-md text-sm w-full">
              Dashboard Button
            </button>
            <p className="text-accent-purple-400 text-sm">Dashboard Text</p>
            <div className="border-accent-purple-400 border-2 rounded-md p-2 text-sm">
              Dashboard Border
            </div>
          </div>
        </Card>

        {/* Cyan Accent */}
        <Card className="p-6 text-center">
          <div className="w-full h-20 bg-accent-cyan rounded-lg mb-4"></div>
          <h3 className="font-semibold text-accent-cyan">Cyan Accent</h3>
          <p className="text-sm text-gray-600">HSL(180, 100%, 56%)</p>
          <p className="text-xs text-gray-500">#1EFFFD</p>
          <div className="mt-3 space-y-2">
            <button className="bg-accent-cyan text-black px-4 py-2 rounded-md text-sm w-full">
              Cyan Button
            </button>
            <p className="text-accent-cyan text-sm">Cyan Text</p>
            <div className="border-accent-cyan border-2 rounded-md p-2 text-sm">
              Cyan Border
            </div>
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <h3 className="text-lg font-semibold mb-4">Complete Purple Palette Gradient</h3>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-6">
          <div className="bg-accent-purple-50 h-16 rounded-lg flex items-end p-2">
            <span className="text-xs font-mono text-accent-purple-400">#E0AAFF</span>
          </div>
          <div className="bg-accent-purple-100 h-16 rounded-lg flex items-end p-2">
            <span className="text-xs font-mono text-accent-purple-400">#C77DFF</span>
          </div>
          <div className="bg-accent-purple-200 h-16 rounded-lg flex items-end p-2">
            <span className="text-xs font-mono text-accent-purple-400">#9D4EDD</span>
          </div>
          <div className="bg-accent-purple-300 h-16 rounded-lg flex items-end p-2">
            <span className="text-xs font-mono text-accent-purple-400">#7B2CBF</span>
          </div>
          <div className="bg-accent-purple-400 h-16 rounded-lg flex items-end p-2">
            <span className="text-xs font-mono text-white">#5A189A</span>
          </div>
          <div className="bg-accent-purple-500 h-16 rounded-lg flex items-end p-2">
            <span className="text-xs font-mono text-white">#3C096C</span>
          </div>
          <div className="bg-accent-purple-600 h-16 rounded-lg flex items-end p-2 ring-2 ring-yellow-400">
            <span className="text-xs font-mono text-white font-bold">#240046</span>
          </div>
          <div className="bg-accent-purple-700 h-16 rounded-lg flex items-end p-2">
            <span className="text-xs font-mono text-white">#10002B</span>
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg font-mono text-sm">
          <h4 className="font-semibold mb-2">Purple Palette Classes (50-700):</h4>
          <ul className="space-y-1 mb-4">
            <li><code>.text-accent-purple-400</code> - Primary color text (#5A189A)</li>
            <li><code>.bg-accent-purple-400</code> - Primary color background (#5A189A)</li>
            <li><code>.border-accent-purple-400</code> - Primary color border (#5A189A)</li>
            <li><code>.from-accent-purple-400</code> - Gradient start with primary color</li>
          </ul>

          <h4 className="font-semibold mb-2">Available Shades:</h4>
          <p className="text-xs text-gray-600">50 (lightest) → 100 → 200 → 300 → <strong>400+ (primary #5A189A)</strong></p>
        </div>
      </div>
    </div>
  );
};

export default ColorPaletteDemo;