import React, { useState, useEffect, useRef } from 'react';
import {
  Heart,
  Trophy,
  Moon,
  Sun,
  Maximize2,
  Minimize2,
  Volume2,
  VolumeX,
  Music,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Send,
  MessageCircle,
  Video,
  Sparkles,
  Users,
  Camera,
} from 'lucide-react';
import type { UserData, HallInfo, LeaderboardEntry, PlayerAction } from '../shared/types.js';

interface HUDProps {
  user: UserData;
  hall: HallInfo;
  hallsList: HallInfo[];
  leaderboard: LeaderboardEntry[];
  countdownText: string;
  isNight: boolean;
  nearVideo: boolean;
  soundBlocked?: boolean;
  videoAudioOn: boolean;
  activePrompt: string | null;
  debugStats?: { fps: number; drawCalls: number };
  onSwitchHall: (hallId: string) => void;
  onOpenShop: () => void;
  onOpenLeaderboard: () => void;
  onOpenProfileEdit: () => void;
  onOpenGuestbook: () => void;
  onOpenVideoModal: () => void;
  onOpenGames: () => void;
  onOpenPhotoBooth: () => void;
  onToggleNight: () => void;
  onToggleVideoAudio: () => void;
  onPerformAction: (action: PlayerAction) => void;
  onSendChat: (text: string) => void;
  onInteractPrompt: () => void;
  chatMessages: Array<{ name: string; text: string; group: string; time: number }>;
}

export const HUD: React.FC<HUDProps> = ({
  user,
  hall,
  hallsList,
  leaderboard,
  countdownText,
  isNight,
  nearVideo,
  soundBlocked = false,
  videoAudioOn,
  activePrompt,
  debugStats,
  onSwitchHall,
  onOpenShop,
  onOpenLeaderboard,
  onOpenProfileEdit,
  onOpenGuestbook,
  onOpenVideoModal,
  onOpenGames,
  onOpenPhotoBooth,
  onToggleNight,
  onToggleVideoAudio,
  onPerformAction,
  onSendChat,
  onInteractPrompt,
  chatMessages,
}) => {
  const [showHallDropdown, setShowHallDropdown] = useState(false);
  const [chatInput, setChatInput] = useState('');
  const [isChatExpanded, setIsChatExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [top3Collapsed, setTop3Collapsed] = useState(false);
  const actionBarRef = useRef<HTMLDivElement | null>(null);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  const handleSendChat = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim()) return;
    onSendChat(chatInput.trim());
    setChatInput('');
  };

  const scrollActionBar = (dir: 'left' | 'right') => {
    if (actionBarRef.current) {
      actionBarRef.current.scrollBy({ left: dir === 'left' ? -180 : 180, behavior: 'smooth' });
    }
  };

  const quickChatOptions = [
    'Chúc mừng hạnh phúc! 💕',
    'Trăm năm hạnh phúc 💍',
    'Dô! 🥂',
    'Sớm có em bé nha 👶',
  ];

  // Actions list
  const actions: Array<{ id: PlayerAction; label: string; icon: string }> = [
    { id: 'sit', label: 'Ngồi vào bàn', icon: '🪑' },
    { id: 'toast', label: 'Nâng ly', icon: '🥂' },
    { id: 'cheer', label: 'Chúc mừng', icon: '💌' },
    { id: 'clap', label: 'Vỗ tay', icon: '👏' },
    { id: 'dance', label: 'Khiêu vũ', icon: '💃' },
    { id: 'kiss', label: 'Hôn gió', icon: '😘' },
    { id: 'wave', label: 'Vẫy chào', icon: '👋' },
  ];

  const myRank = leaderboard.findIndex((e) => e.uid === user.uid) + 1;
  const top3 = leaderboard.slice(0, 3);

  return (
    <div className="fixed inset-0 pointer-events-none z-30 select-none flex flex-col justify-between p-2 sm:p-4 font-sans text-slate-800">
      {/* Top Bar */}
      <div className="flex items-start justify-between w-full">
        {/* Top-Left: Couple Branding, Hall Switcher, Countdown & Top 3 */}
        <div className="flex flex-col gap-1.5 pointer-events-auto">
          {/* Couple Banner & Hall Pill */}
          <div className="relative">
            <div
              onClick={() => setShowHallDropdown(!showHallDropdown)}
              className="px-3 py-1.5 rounded-2xl bg-white/90 backdrop-blur-md border border-rose-200/80 shadow-md flex items-center gap-2 cursor-pointer hover:bg-white transition-colors"
            >
              <span className="font-extrabold text-sm text-rose-900 font-serif">
                Duy <span className="text-rose-500 font-normal">♥</span> Tâm
              </span>
              <span className="h-3 w-[1px] bg-slate-300" />
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1">
                {hall.theme === 'diamond' ? '💎' : '🌸'} {hall.name}
              </span>
              <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">
                {hall.playerCount}/{hall.maxPlayers}
              </span>
            </div>

            {/* Hall Switch Dropdown */}
            {showHallDropdown && (
              <div className="absolute top-11 left-0 w-64 bg-white/95 backdrop-blur-md rounded-2xl shadow-xl border border-rose-200 p-2 z-50 animate-fade-in">
                <p className="text-[11px] font-bold text-slate-400 uppercase px-2 py-1">
                  Chuyển sang sảnh khác:
                </p>
                <div className="space-y-1">
                  {hallsList.map((h) => {
                    const isCurrent = h.id === hall.id;
                    const isFull = h.playerCount >= h.maxPlayers;
                    return (
                      <button
                        key={h.id}
                        disabled={isCurrent || isFull}
                        onClick={() => {
                          onSwitchHall(h.id);
                          setShowHallDropdown(false);
                        }}
                        className={`w-full p-2 rounded-xl text-left text-xs font-bold flex items-center justify-between transition-colors ${
                          isCurrent
                            ? 'bg-rose-50 text-rose-600 border border-rose-200'
                            : isFull
                            ? 'opacity-50 cursor-not-allowed bg-slate-50 text-slate-400'
                            : 'hover:bg-slate-100 text-slate-700 cursor-pointer'
                        }`}
                      >
                        <span>
                          {h.theme === 'diamond' ? '💎' : '🌸'} {h.name}
                        </span>
                        <span className="text-[11px] font-normal">
                          {isCurrent ? 'Đang ở' : isFull ? 'Đã đủ' : `${h.playerCount}/${h.maxPlayers}`}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Compact Countdown Line */}
          <div className="px-2.5 py-0.5 rounded-full bg-rose-950/60 text-white text-[11px] font-medium backdrop-blur-sm self-start flex items-center gap-1.5">
            <span className="text-amber-300">💍</span>
            <span>{countdownText}</span>
          </div>

          {/* Compact "🏆 TOP 3 + Hạng của bạn" Widget */}
          <div className="bg-white/90 backdrop-blur-md border border-amber-200/80 rounded-2xl p-2 shadow-md w-52 sm:w-60">
            <div
              onClick={() => setTop3Collapsed(!top3Collapsed)}
              className="flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-1.5">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-xs font-extrabold text-slate-800">Bảng Vàng TOP 3</span>
              </div>
              <span className="text-[10px] text-slate-400 font-bold">
                {top3Collapsed ? '▼' : '▲'}
              </span>
            </div>

            {!top3Collapsed && (
              <div className="mt-1.5 space-y-1 text-[11px]">
                {top3.map((e, idx) => (
                  <div key={e.uid} className="flex justify-between items-center text-slate-600">
                    <span className="truncate max-w-[130px]">
                      {idx === 0 ? '🥇' : idx === 1 ? '🥈' : '🥉'} {e.name}
                    </span>
                    <span className="font-extrabold text-rose-600">{e.score} 💗</span>
                  </div>
                ))}
                {top3.length === 0 && (
                  <p className="text-[10px] text-slate-400 italic">Chưa có người chơi</p>
                )}
                <div className="border-t border-slate-200 pt-1 mt-1 text-[11px] font-bold text-rose-700 flex justify-between">
                  <span>Hạng của bạn: #{myRank > 0 ? myRank : '-'}</span>
                  <span>{user.cumulativeScore} 💗</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Top-Right Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {/* Mini-Games Direct Button */}
          <button
            onClick={onOpenGames}
            title="Khu trò chơi đám cưới (Nhận điểm Hỷ)"
            className="px-2.5 sm:px-3 py-1.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white shadow-md flex items-center gap-1.5 font-extrabold text-xs cursor-pointer transition-transform transform active:scale-95"
          >
            <span className="text-sm">🎮</span>
            <span className="font-bold">Trò Chơi</span>
          </button>

          {/* Photo Booth Direct Button */}
          <button
            onClick={onOpenPhotoBooth}
            title="Góc chụp ảnh & Ghép mặt cùng Cô Dâu Chú Rể"
            className="px-2.5 sm:px-3 py-1.5 rounded-2xl bg-gradient-to-r from-pink-500 via-rose-500 to-red-500 hover:from-pink-600 hover:to-red-600 text-white shadow-md flex items-center gap-1.5 font-extrabold text-xs cursor-pointer transition-transform transform active:scale-95"
          >
            <Camera className="w-3.5 h-3.5" />
            <span className="font-bold">Ghép Ảnh</span>
          </button>

          {/* Hỷ Points Badge (Opens Shop) */}
          <button
            onClick={onOpenShop}
            title="Mở Tiệm Hỷ Cưới"
            className="px-3 py-1.5 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 hover:from-rose-600 hover:to-pink-600 text-white shadow-md flex items-center gap-1.5 font-extrabold text-xs cursor-pointer transition-transform transform active:scale-95"
          >
            <Heart className="w-3.5 h-3.5 fill-white animate-pulse" />
            <span>{user.availableScore} 💗</span>
          </button>

          {/* Leaderboard Button */}
          <button
            onClick={onOpenLeaderboard}
            title="Bảng xếp hạng điểm Hỷ"
            className="p-2 rounded-2xl bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200 transition-colors"
          >
            <Trophy className="w-4 h-4 text-amber-500" />
          </button>

          {/* Edit Profile & Outfit */}
          <button
            onClick={onOpenProfileEdit}
            title="Đổi tên và trang phục"
            className="p-2 rounded-2xl bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200 transition-colors"
          >
            <Edit3 className="w-4 h-4 text-purple-500" />
          </button>

          {/* Day / Night Toggle */}
          <button
            onClick={onToggleNight}
            title={isNight ? 'Chuyển sang ban ngày' : 'Chuyển sang ban đêm lung linh'}
            className="p-2 rounded-2xl bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200 transition-colors"
          >
            {isNight ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
          </button>

          {/* Nhạc của sảnh = tiếng video cưới (luôn hiện nút bật/tắt) */}
          <button
            onClick={onToggleVideoAudio}
            title={videoAudioOn && !soundBlocked ? 'Tắt nhạc' : 'Bật nhạc'}
            className={`px-2.5 py-1.5 rounded-2xl text-xs font-bold shadow-md flex items-center gap-1 transition-all ${
              soundBlocked
                ? 'bg-rose-600 text-white animate-pulse'
                : videoAudioOn
                ? 'bg-rose-500 text-white'
                : 'bg-white/95 text-rose-600 border border-rose-300'
            }`}
          >
            {videoAudioOn && !soundBlocked ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className={soundBlocked ? 'inline' : 'hidden sm:inline'}>{soundBlocked ? 'Chạm để bật nhạc' : 'Nhạc video'}</span>
          </button>

          {/* Enlarged 2D Video Modal */}
          <button
            onClick={onOpenVideoModal}
            title="Xem video toàn màn hình"
            className="p-2 rounded-2xl bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200 transition-colors"
          >
            <Video className="w-4 h-4 text-rose-500" />
          </button>

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            title="Toàn màn hình"
            className="p-2 rounded-2xl bg-white/90 hover:bg-white text-slate-700 shadow-md border border-slate-200 transition-colors hidden sm:block"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Proximity Interaction Prompt Center */}
      {activePrompt && (
        <div className="self-center my-auto pointer-events-auto animate-bounce">
          <button
            onClick={onInteractPrompt}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 via-rose-500 to-pink-500 text-white font-extrabold text-sm sm:text-base shadow-2xl border-2 border-white flex items-center gap-2 cursor-pointer transform hover:scale-105 transition-all"
          >
            <Sparkles className="w-5 h-5 text-yellow-200" />
            <span>{activePrompt}</span>
            <span className="text-xs opacity-80">(hoặc nhấn E)</span>
          </button>
        </div>
      )}

      {/* Bottom Area: Chat (Left) & Actions Bar (Center) */}
      <div className="flex flex-col sm:flex-row items-end justify-between gap-3 w-full">
        {/* Chat Box (Bottom-Left) */}
        <div className="w-full sm:w-80 pointer-events-auto">
          {/* Recent Messages Window */}
          <div
            className={`transition-all overflow-hidden rounded-2xl bg-white/85 backdrop-blur-md border border-rose-100 shadow-lg p-2.5 ${
              isChatExpanded ? 'h-48' : 'h-24'
            }`}
          >
            <div className="h-full overflow-y-auto space-y-1 text-xs">
              {chatMessages.length === 0 ? (
                <p className="text-slate-400 text-[11px] italic">Sảnh tiệc đang rộn ràng, hãy gửi lời chào nhé!</p>
              ) : (
                chatMessages.slice(-15).map((m, i) => (
                  <div key={i} className="leading-tight">
                    <span className="font-bold text-slate-800">{m.name}: </span>
                    <span className="text-slate-700">{m.text}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Quick Chat Chips */}
          <div className="flex gap-1 overflow-x-auto py-1 mt-1 text-[11px]">
            {quickChatOptions.map((q, i) => (
              <button
                key={i}
                onClick={() => onSendChat(q)}
                className="whitespace-nowrap px-2.5 py-1 rounded-full bg-white/80 hover:bg-white text-slate-700 border border-slate-200 shadow-sm cursor-pointer"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Chat Input Field */}
          <form onSubmit={handleSendChat} className="flex gap-1.5 mt-1">
            <input
              type="text"
              maxLength={150}
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Nhập tin nhắn chat..."
              className="flex-1 px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-md border border-slate-200 text-xs font-semibold focus:outline-none focus:border-rose-400"
            />
            <button
              type="submit"
              className="p-2 rounded-xl bg-rose-500 hover:bg-rose-600 text-white shadow-md cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>

        {/* Action Bar (Bottom-Center / Bottom-Right) */}
        <div className="relative flex items-center max-w-full pointer-events-auto self-center sm:self-end">
          {/* Mobile Scroll Left button */}
          <button
            onClick={() => scrollActionBar('left')}
            className="sm:hidden p-1.5 rounded-full bg-white/80 shadow text-slate-600 mr-1"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          {/* Scrollable Actions Container */}
          <div
            ref={actionBarRef}
            className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 px-2 rounded-3xl bg-white/85 backdrop-blur-md border border-rose-200 shadow-xl"
          >
            {actions.map((act) => (
              <button
                key={act.id}
                onClick={() => {
                  if (act.id === 'cheer') {
                    onOpenGuestbook();
                  } else {
                    onPerformAction(act.id);
                  }
                }}
                className="flex flex-col items-center justify-center p-2 rounded-2xl hover:bg-rose-50 hover:text-rose-600 text-slate-700 transition-all min-w-[58px] cursor-pointer active:scale-90"
              >
                <span className="text-xl sm:text-2xl">{act.icon}</span>
                <span className="text-[10px] font-bold mt-0.5 whitespace-nowrap">{act.label}</span>
              </button>
            ))}
          </div>

          {/* Mobile Scroll Right button */}
          <button
            onClick={() => scrollActionBar('right')}
            className="sm:hidden p-1.5 rounded-full bg-white/80 shadow text-slate-600 ml-1"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Debug Overlay (?debug=1) */}
      {debugStats && (
        <div className="fixed bottom-2 right-2 p-2 rounded-xl bg-black/80 text-white font-mono text-[11px] pointer-events-none z-50">
          <div>FPS: {debugStats.fps}</div>
          <div>Draw Calls: {debugStats.drawCalls} / 300 max</div>
        </div>
      )}
    </div>
  );
};
