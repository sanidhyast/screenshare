import React from 'react';

interface LaserPointerProps {
  normX: number; // 0.0 to 1.0
  normY: number; // 0.0 to 1.0
  visible: boolean;
}

export const LaserPointer: React.FC<LaserPointerProps> = ({ normX, normY, visible }) => {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute z-50 transition-[left,top] duration-[25ms] ease-out will-change-[left,top]"
      style={{
        left: `${Math.max(0, Math.min(1, normX)) * 100}%`,
        top: `${Math.max(0, Math.min(1, normY)) * 100}%`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      {/* Outer ripple glow */}
      <div className="absolute -inset-3 rounded-full bg-red-500/30 animate-ping opacity-75" />

      {/* Mid glow aura */}
      <div className="absolute -inset-2 rounded-full bg-red-600/60 blur-sm" />

      {/* Main vibrant laser dot */}
      <div className="relative w-4 h-4 rounded-full bg-red-500 shadow-[0_0_12px_#ff0033,0_0_24px_#ff0033] flex items-center justify-center border border-white/90">
        {/* Intense hot white center */}
        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_4px_#ffffff]" />
      </div>
    </div>
  );
};
