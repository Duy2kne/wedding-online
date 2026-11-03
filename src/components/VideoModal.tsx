import React from 'react';
import { X, ExternalLink } from 'lucide-react';

interface VideoModalProps {
  youtubeId: string;
  videoTime: number;
  onClose: () => void;
}

export const VideoModal: React.FC<VideoModalProps> = ({
  youtubeId,
  videoTime,
  onClose,
}) => {
  const startSecond = Math.floor(videoTime);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-4xl bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border-2 border-rose-300">
        {/* Modal Header */}
        <div className="p-4 bg-slate-800 text-white flex items-center justify-between border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎬</span>
            <h3 className="font-bold text-sm sm:text-base">
              Video Cưới Hoàng Duy ♥ Thiều Tâm
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={`https://youtu.be/${youtubeId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs font-bold flex items-center gap-1.5"
            >
              <span>Mở trên YouTube</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 16:9 YouTube Player */}
        <div className="relative w-full pb-[56.25%] bg-black">
          <iframe
            className="absolute inset-0 w-full h-full border-0"
            src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&controls=1&cc_load_policy=0&cc_lang_pref=off&hl=vi&start=${startSecond}`}
            title="Video Cưới Duy & Tâm"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    </div>
  );
};
