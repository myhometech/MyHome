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

        {/* Purple-Blue Accent */}
        <Card className="p-6 text-center">
          <div className="w-full h-20 bg-accent-purple rounded-lg mb-4"></div>
          <h3 className="font-semibold text-accent-purple">Purple Accent</h3>
          <p className="text-sm text-gray-600">HSL(239, 100%, 56%)</p>
          <p className="text-xs text-gray-500">#1E20FF</p>
          <div className="mt-3 space-y-2">
            <button className="bg-accent-purple text-white px-4 py-2 rounded-md text-sm w-full">
              Purple Button
            </button>
            <p className="text-accent-purple text-sm">Purple Text</p>
            <div className="border-accent-purple border-2 rounded-md p-2 text-sm">
              Purple Border
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
        <h3 className="text-lg font-semibold mb-4">Available CSS Classes</h3>
        <div className="bg-gray-50 p-4 rounded-lg font-mono text-sm">
          <h4 className="font-semibold mb-2">Purple Accent (#1E20FF):</h4>
          <ul className="space-y-1 mb-4">
            <li><code>.text-accent-purple</code> - Purple text color</li>
            <li><code>.bg-accent-purple</code> - Purple background</li>
            <li><code>.border-accent-purple</code> - Purple border</li>
          </ul>
          
          <h4 className="font-semibold mb-2">Cyan Accent (#1EFFFD):</h4>
          <ul className="space-y-1">
            <li><code>.text-accent-cyan</code> - Cyan text color</li>
            <li><code>.bg-accent-cyan</code> - Cyan background</li>
            <li><code>.border-accent-cyan</code> - Cyan border</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ColorPaletteDemo;