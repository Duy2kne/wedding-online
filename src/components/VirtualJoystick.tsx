import React, { useRef, useState, useEffect } from 'react';

interface VirtualJoystickProps {
  onMove: (dx: number, dy: number) => void;
  onStop: () => void;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({ onMove, onStop }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [knobPos, setKnobPos] = useState({ x: 0, y: 0 });
  const [isActive, setIsActive] = useState(false);
  const activeTouchId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });

  const radius = 50;

  const handleTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    if (activeTouchId.current !== null) return;
    const touch = e.changedTouches[0];
    activeTouchId.current = touch.identifier;
    setIsActive(true);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      origin.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId.current) {
        const dx = touch.clientX - origin.current.x;
        const dy = touch.clientY - origin.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const clampedDist = Math.min(dist, radius);
        const kx = Math.cos(angle) * clampedDist;
        const ky = Math.sin(angle) * clampedDist;
        setKnobPos({ x: kx, y: ky });

        // Normalize movement vector between -1 and 1
        onMove(kx / radius, ky / radius);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === activeTouchId.current) {
        activeTouchId.current = null;
        setIsActive(false);
        setKnobPos({ x: 0, y: 0 });
        onStop();
        break;
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className="relative w-32 h-32 rounded-full bg-black/35 backdrop-blur-sm border-2 border-white/40 flex items-center justify-center touch-none select-none"
    >
      {/* Outer directional arrows */}
      <div className="absolute top-1.5 text-white/50 text-[10px] font-bold">▲</div>
      <div className="absolute bottom-1.5 text-white/50 text-[10px] font-bold">▼</div>
      <div className="absolute left-1.5 text-white/50 text-[10px] font-bold">◀</div>
      <div className="absolute right-1.5 text-white/50 text-[10px] font-bold">▶</div>

      {/* Center knob */}
      <div
        className={`w-14 h-14 rounded-full bg-gradient-to-br from-rose-500 to-pink-600 border-2 border-white/80 shadow-lg transition-transform ${
          isActive ? 'scale-110' : ''
        }`}
        style={{
          transform: `translate(${knobPos.x}px, ${knobPos.y}px)`,
        }}
      />
    </div>
  );
};
