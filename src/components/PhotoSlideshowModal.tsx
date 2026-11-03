import React, { useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

interface PhotoSlideshowModalProps {
  photos: string[];
  initialIndex?: number;
  onClose: () => void;
}

export const PhotoSlideshowModal: React.FC<PhotoSlideshowModalProps> = ({
  photos,
  initialIndex = 0,
  onClose,
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  const prev = () => {
    setCurrentIndex((i) => (i - 1 + photos.length) % photos.length);
  };

  const next = () => {
    setCurrentIndex((i) => (i + 1) % photos.length);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-5 right-5 p-2 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors z-20 cursor-pointer"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Main Image View */}
      <div className="relative max-w-4xl max-h-[85vh] flex flex-col items-center">
        <img
          src={photos[currentIndex]}
          alt={`Ảnh cưới ${currentIndex + 1}`}
          className="max-h-[75vh] max-w-full rounded-2xl shadow-2xl object-contain border-4 border-amber-300/80"
        />

        {/* Counter & Caption */}
        <div className="mt-3 text-white text-xs font-semibold bg-black/50 px-4 py-1.5 rounded-full">
          {currentIndex + 1} / {photos.length} • Khoảnh Khắc Hạnh Phúc · Hoàng Duy ♥ Thiều Tâm
        </div>

        {/* Navigation arrows */}
        {photos.length > 1 && (
          <>
            <button
              onClick={prev}
              className="absolute left-[-20px] sm:left-[-50px] top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              onClick={next}
              className="absolute right-[-20px] sm:right-[-50px] top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/20 hover:bg-white/40 text-white transition-colors cursor-pointer"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
