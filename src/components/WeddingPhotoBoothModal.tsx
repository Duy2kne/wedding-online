import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Upload,
  Download,
  Image as ImageIcon,
  RotateCw,
  FlipHorizontal,
  Trash2,
  Sparkles,
  Share2,
  Check,
  Plus,
  Sliders,
  Camera,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface StickerItem {
  id: string;
  src: string;
  label: string;
  x: number; // percentage 0..100
  y: number; // percentage 0..100
  scale: number; // 0.4 .. 2.5
  rotation: number; // -180 .. 180 degrees
  flipped: boolean;
  opacity: number; // 0.3 .. 1.0
}

interface WeddingPhotoBoothModalProps {
  onClose: () => void;
  onPhotoSavedToWall?: (photoUrl: string) => void;
  defaultGuestName?: string;
}

const PRESET_BACKGROUNDS = [
  { id: 'bg1', name: 'Phông Kem Ấm 🤍', url: '/media/backdrops/phong_kem.webp' },
  { id: 'bg2', name: 'Phông Đỏ Song Hỷ 囍', url: '/media/backdrops/phong_do.webp' },
  { id: 'bg3', name: 'Phông Hồng Phấn 🌸', url: '/media/backdrops/phong_hong.webp' },
  { id: 'bg4', name: 'Ảnh Cưới Duy ♥ Tâm 💍', url: '/media/photos/anh01.webp' },
];

const DEFAULT_CUTOUTS = [
  { id: 'couple1', label: 'Duy ♥ Tâm · Vest trắng', src: '/media/cutouts/capdoi1.webp', icon: '🤍' },
  { id: 'couple2', label: 'Duy ♥ Tâm · Cầm hoa', src: '/media/cutouts/capdoi2.webp', icon: '💐' },
  { id: 'couple3', label: 'Duy ♥ Tâm · Áo dài', src: '/media/cutouts/capdoi3.webp', icon: '🏮' },
  { id: 'bouquet', label: 'Hoa Cưới Cầm Tay', src: '/media/cutouts/bouquet_prop.svg', icon: '💐' },
];

export const WeddingPhotoBoothModal: React.FC<WeddingPhotoBoothModalProps> = ({
  onClose,
  onPhotoSavedToWall,
  defaultGuestName = 'Khách Mời',
}) => {
  const [bgSourceType, setBgSourceType] = useState<'upload' | 'preset'>('preset');
  const [bgImageUrl, setBgImageUrl] = useState<string>(PRESET_BACKGROUNDS[0].url);
  const [stickersList, setStickersList] = useState<typeof DEFAULT_CUTOUTS>(DEFAULT_CUTOUTS);
  const [activeStickers, setActiveStickers] = useState<StickerItem[]>([
    {
      id: 'init_couple',
      src: '/media/cutouts/capdoi2.webp',
      label: 'Duy ♥ Tâm · Cầm hoa',
      x: 66,
      y: 58,
      scale: 1.35,
      rotation: 0,
      flipped: false,
      opacity: 1,
    },
  ]);
  const [selectedStickerId, setSelectedStickerId] = useState<string | null>('init_couple');
  const [filterStyle, setFilterStyle] = useState<'none' | 'warm' | 'rose' | 'vintage' | 'bw'>('warm');
  const [watermarkText, setWatermarkText] = useState('Hoàng Duy ♥ Thiều Tâm · 29/11/2026');
  const [guestCaption, setGuestCaption] = useState(`Ảnh kỷ niệm cùng Duy & Tâm · ${defaultGuestName}`);
  const [showWatermark, setShowWatermark] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [toastText, setToastText] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<{ mouseX: number; mouseY: number; startX: number; startY: number }>({
    mouseX: 0,
    mouseY: 0,
    startX: 0,
    startY: 0,
  });

  const selectedSticker = activeStickers.find((s) => s.id === selectedStickerId) || null;

  // Handle User Photo Upload
  const handleUserPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        setBgImageUrl(event.target.result);
        setBgSourceType('upload');
        showToast('Đã tải ảnh lên! Hãy kéo Duy ♥ Tâm đứng cạnh bạn nhé.');
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Custom Face Cutout Upload (as requested by user)
  const handleCustomCutoutUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      if (typeof event.target?.result === 'string') {
        const newCutout = {
          id: 'custom_' + Date.now(),
          label: file.name.replace(/\.[^/.]+$/, '').slice(0, 15) || 'Mặt Cắt Mới',
          src: event.target.result,
          icon: '✨',
        };
        setStickersList((prev) => [newCutout, ...prev]);
        addSticker(newCutout.src, newCutout.label);
        showToast('Đã thêm ảnh cắt mặt mới vào kho sticker!');
      }
    };
    reader.readAsDataURL(file);
  };

  const showToast = (msg: string) => {
    setToastText(msg);
    setTimeout(() => setToastText(null), 3500);
  };

  // Add Sticker to Canvas
  const addSticker = (src: string, label: string) => {
    const newId = 'stk_' + Date.now();
    const newSticker: StickerItem = {
      id: newId,
      src,
      label,
      x: 50,
      y: 50,
      scale: 1,
      rotation: 0,
      flipped: false,
      opacity: 1,
    };
    setActiveStickers((prev) => [...prev, newSticker]);
    setSelectedStickerId(newId);
  };

  // Update selected sticker property
  const updateSelectedSticker = (key: keyof StickerItem, val: any) => {
    if (!selectedStickerId) return;
    setActiveStickers((prev) =>
      prev.map((s) => (s.id === selectedStickerId ? { ...s, [key]: val } : s))
    );
  };

  // Remove selected sticker
  const removeSelectedSticker = () => {
    if (!selectedStickerId) return;
    setActiveStickers((prev) => prev.filter((s) => s.id !== selectedStickerId));
    setSelectedStickerId(null);
  };

  // Pointer drag handling for canvas sticker movement
  const handlePointerDown = (id: string, e: React.PointerEvent) => {
    e.stopPropagation();
    setSelectedStickerId(id);
    isDraggingRef.current = true;
    const st = activeStickers.find((s) => s.id === id);
    if (!st || !workspaceRef.current) return;
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      startX: st.x,
      startY: st.y,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current || !selectedStickerId || !workspaceRef.current) return;
    const rect = workspaceRef.current.getBoundingClientRect();
    const deltaX = ((e.clientX - dragStartRef.current.mouseX) / rect.width) * 100;
    const deltaY = ((e.clientY - dragStartRef.current.mouseY) / rect.height) * 100;

    const newX = Math.max(5, Math.min(95, dragStartRef.current.startX + deltaX));
    const newY = Math.max(5, Math.min(95, dragStartRef.current.startY + deltaY));

    setActiveStickers((prev) =>
      prev.map((s) => (s.id === selectedStickerId ? { ...s, x: newX, y: newY } : s))
    );
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {}
    }
  };

  // Render Full Composite to High-Res HTML5 Canvas for Export
  const generateCompositeCanvas = async (): Promise<HTMLCanvasElement> => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200;
    canvas.height = 900;
    const ctx = canvas.getContext('2d')!;

    // 1. Draw Background Image
    const loadImg = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Failed to load image: ' + url));
        img.src = url;
      });

    try {
      const bgImg = await loadImg(bgImageUrl);
      ctx.drawImage(bgImg, 0, 0, 1200, 900);
    } catch {
      ctx.fillStyle = '#fce7f3';
      ctx.fillRect(0, 0, 1200, 900);
    }

    // 2. Draw Active Stickers in order
    for (const stk of activeStickers) {
      try {
        const stkImg = await loadImg(stk.src);
        const px = (stk.x / 100) * 1200;
        const py = (stk.y / 100) * 900;
        const w = 320 * stk.scale;
        const h = (320 * stk.scale * stkImg.height) / (stkImg.width || 1);

        ctx.save();
        ctx.globalAlpha = stk.opacity;
        ctx.translate(px, py);
        ctx.rotate((stk.rotation * Math.PI) / 180);
        if (stk.flipped) {
          ctx.scale(-1, 1);
        }
        ctx.drawImage(stkImg, -w / 2, -h / 2, w, h);
        ctx.restore();
      } catch {}
    }

    // 3. Apply Filter
    if (filterStyle === 'warm') {
      ctx.fillStyle = 'rgba(251, 191, 36, 0.12)';
      ctx.fillRect(0, 0, 1200, 900);
    } else if (filterStyle === 'rose') {
      ctx.fillStyle = 'rgba(244, 63, 94, 0.10)';
      ctx.fillRect(0, 0, 1200, 900);
    } else if (filterStyle === 'vintage') {
      ctx.fillStyle = 'rgba(180, 83, 9, 0.15)';
      ctx.fillRect(0, 0, 1200, 900);
    } else if (filterStyle === 'bw') {
      const imgData = ctx.getImageData(0, 0, 1200, 900);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const avg = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
        d[i] = avg;
        d[i + 1] = avg;
        d[i + 2] = avg;
      }
      ctx.putImageData(imgData, 0, 0);
    }

    // 4. Draw Romantic Wedding Watermark
    if (showWatermark) {
      // Bottom banner gradient
      const grad = ctx.createLinearGradient(0, 780, 0, 900);
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      grad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 780, 1200, 120);

      // Gold Border Frame
      ctx.strokeStyle = '#d4af37';
      ctx.lineWidth = 14;
      ctx.strokeRect(7, 7, 1186, 886);

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(20, 20, 1160, 860);

      // Names & Date
      ctx.fillStyle = '#fef08a';
      ctx.font = 'bold 36px "Playfair Display", Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(watermarkText, 600, 840);

      // Guest Caption
      if (guestCaption.trim()) {
        ctx.fillStyle = '#ffffff';
        ctx.font = 'italic 20px "Segoe UI", sans-serif';
        ctx.fillText(guestCaption.trim(), 600, 875);
      }
    }

    return canvas;
  };

  // Download Composite Photo
  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const canvas = await generateCompositeCanvas();
      const link = document.createElement('a');
      link.download = `Anh-Cuoi-Duy-Tam-${Date.now()}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      confetti({ particleCount: 60, spread: 70, origin: { y: 0.7 } });
      showToast('Đã tải ảnh về thiết bị của bạn thành công!');
    } catch {
      showToast('Có lỗi khi xuất ảnh, vui lòng thử lại.');
    } finally {
      setIsExporting(false);
    }
  };

  // Save to Wedding Hall Photo Wall
  const handleSaveToWall = async () => {
    setIsExporting(true);
    try {
      const canvas = await generateCompositeCanvas();
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

      const res = await fetch('/api/media/photos/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl,
          title: guestCaption || 'Kỷ Niệm Cưới · Hoàng Duy ♥ Thiều Tâm',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        confetti({ particleCount: 100, spread: 90, origin: { y: 0.6 } });
        showToast('🎉 Tuyệt vời! Ảnh đã được treo lên tường ảnh sảnh cưới!');
        if (onPhotoSavedToWall && data.url) {
          onPhotoSavedToWall(data.url);
        }
      } else {
        showToast('Không thể lưu lên sảnh cưới lúc này.');
      }
    } catch {
      showToast('Lỗi kết nối khi lưu ảnh.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in text-slate-800">
      <div className="relative w-full max-w-5xl max-h-[96vh] flex flex-col bg-white rounded-3xl shadow-2xl border-4 border-amber-300 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 bg-gradient-to-r from-amber-50 via-rose-50 to-pink-50 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-2xl p-1.5 rounded-2xl bg-rose-100 text-rose-600">📸</span>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900 font-serif flex items-center gap-2">
                Góc Chụp Ảnh Cùng Cô Dâu Chú Rể
                <span className="text-[11px] font-bold text-rose-600 bg-rose-100 px-2 py-0.5 rounded-full">
                  Duy ♥ Tâm
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Tải ảnh của bạn lên hoặc chọn phông nền, thêm Duy & Tâm vào ảnh, chỉnh vị trí rồi tải về máy!
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-rose-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 flex flex-col lg:flex-row gap-4">
          {/* Left Canvas Preview Area */}
          <div className="flex-1 flex flex-col items-center justify-center min-h-[340px] sm:min-h-[440px]">
            {/* Interactive Workspace */}
            <div
              ref={workspaceRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className={`relative w-full max-w-[640px] aspect-[4/3] rounded-2xl shadow-xl overflow-hidden border-2 border-amber-200 bg-slate-900 select-none ${
                filterStyle === 'warm'
                  ? 'brightness-105 sepia-[0.15]'
                  : filterStyle === 'rose'
                  ? 'hue-rotate-[-10deg] brightness-105'
                  : filterStyle === 'vintage'
                  ? 'sepia-[0.45] contrast-105'
                  : filterStyle === 'bw'
                  ? 'grayscale'
                  : ''
              }`}
            >
              {/* Background Base Image */}
              <img
                src={bgImageUrl}
                alt="Khung ảnh cưới"
                className="w-full h-full object-cover pointer-events-none"
              />

              {/* Active Draggable Stickers */}
              {activeStickers.map((stk) => {
                const isSelected = stk.id === selectedStickerId;
                return (
                  <div
                    key={stk.id}
                    onPointerDown={(e) => handlePointerDown(stk.id, e)}
                    style={{
                      left: `${stk.x}%`,
                      top: `${stk.y}%`,
                      transform: `translate(-50%, -50%) scale(${stk.scale}) rotate(${stk.rotation}deg) scaleX(${
                        stk.flipped ? -1 : 1
                      })`,
                      opacity: stk.opacity,
                    }}
                    className={`absolute cursor-move touch-none p-1 transition-shadow ${
                      isSelected
                        ? 'ring-2 ring-rose-500 ring-offset-2 rounded-xl shadow-2xl bg-white/10'
                        : 'hover:ring-1 hover:ring-white/60'
                    }`}
                  >
                    <img
                      src={stk.src}
                      alt={stk.label}
                      className="w-36 sm:w-44 h-auto pointer-events-none drop-shadow-lg"
                    />
                    {isSelected && (
                      <div className="absolute -top-3 -right-3 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs shadow-md">
                        ✓
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Watermark Overlay Preview */}
              {showWatermark && (
                <div className="absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-slate-950/80 to-transparent pointer-events-none text-center">
                  <p className="text-amber-200 text-xs sm:text-sm font-serif font-bold tracking-wider drop-shadow-md">
                    {watermarkText}
                  </p>
                  {guestCaption && (
                    <p className="text-white/90 text-[11px] sm:text-xs italic drop-shadow-sm">
                      {guestCaption}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Canvas Hint */}
            <p className="mt-2 text-[11px] text-slate-500 italic text-center">
              💡 Chạm hoặc kéo để di chuyển ảnh Duy & Tâm. Chọn ảnh để chỉnh kích thước và góc xoay.
            </p>
          </div>

          {/* Right Controls Panel */}
          <div className="w-full lg:w-80 flex flex-col gap-3.5 bg-slate-50 p-3.5 sm:p-4 rounded-2xl border border-slate-200 text-xs">
            {/* 1. Background Source Selection */}
            <div>
              <span className="font-extrabold text-slate-700 block mb-1.5 uppercase text-[10px] tracking-wider">
                1. Chọn hoặc tải ảnh nền của bạn
              </span>
              <div className="flex gap-2">
                <label className="flex-1 p-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold flex items-center justify-center gap-1.5 cursor-pointer text-center transition-colors">
                  <Upload className="w-4 h-4" />
                  <span>Tải ảnh của bạn</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleUserPhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Preset Backgrounds */}
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {PRESET_BACKGROUNDS.map((bg) => (
                  <button
                    key={bg.id}
                    onClick={() => {
                      setBgImageUrl(bg.url);
                      setBgSourceType('preset');
                    }}
                    title={bg.name}
                    className={`aspect-video rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${
                      bgImageUrl === bg.url && bgSourceType === 'preset'
                        ? 'border-rose-500 scale-105 shadow-md'
                        : 'border-slate-200 opacity-70 hover:opacity-100'
                    }`}
                  >
                    <img src={bg.url} alt={bg.name} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Face Cutouts Tray */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-extrabold text-slate-700 uppercase text-[10px] tracking-wider">
                  2. Thêm ảnh Duy & Tâm
                </span>
                <label className="text-[10px] text-rose-600 hover:text-rose-800 font-bold flex items-center gap-1 cursor-pointer">
                  <Plus className="w-3 h-3" />
                  <span>Tải ảnh cắt mặt ✂️</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleCustomCutoutUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                {stickersList.map((cut) => (
                  <button
                    key={cut.id}
                    onClick={() => addSticker(cut.src, cut.label)}
                    className="p-1.5 rounded-xl border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-300 text-left flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span className="text-base">{cut.icon}</span>
                    <span className="truncate font-semibold text-[11px] text-slate-700">
                      {cut.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* 3. Selected Sticker Adjustments */}
            {selectedSticker && (
              <div className="p-2.5 rounded-xl bg-white border border-rose-200 shadow-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-rose-700 truncate max-w-[170px]">
                    Điều chỉnh: {selectedSticker.label}
                  </span>
                  <button
                    onClick={removeSelectedSticker}
                    title="Xóa sticker này"
                    className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Scale Slider */}
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-medium mb-0.5">
                    <span>Kích thước</span>
                    <span>{Math.round(selectedSticker.scale * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.4"
                    max="2.5"
                    step="0.05"
                    value={selectedSticker.scale}
                    onChange={(e) => updateSelectedSticker('scale', parseFloat(e.target.value))}
                    className="w-full accent-rose-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Rotation Slider */}
                <div>
                  <div className="flex justify-between text-[10px] text-slate-500 font-medium mb-0.5">
                    <span>Xoay góc</span>
                    <span>{selectedSticker.rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    step="5"
                    value={selectedSticker.rotation}
                    onChange={(e) => updateSelectedSticker('rotation', parseInt(e.target.value))}
                    className="w-full accent-rose-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                  />
                </div>

                {/* Flip & Opacity */}
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100">
                  <button
                    onClick={() => updateSelectedSticker('flipped', !selectedSticker.flipped)}
                    className={`flex-1 py-1 px-2 rounded-lg border text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer ${
                      selectedSticker.flipped
                        ? 'bg-rose-100 text-rose-700 border-rose-300'
                        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                    }`}
                  >
                    <FlipHorizontal className="w-3.5 h-3.5" />
                    <span>Lật ngang</span>
                  </button>

                  <div className="flex-1 flex items-center gap-1.5">
                    <span className="text-[10px] text-slate-500">Mờ:</span>
                    <input
                      type="range"
                      min="0.3"
                      max="1"
                      step="0.05"
                      value={selectedSticker.opacity}
                      onChange={(e) => updateSelectedSticker('opacity', parseFloat(e.target.value))}
                      className="w-full accent-rose-500 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 4. Color Filters & Text */}
            <div>
              <span className="font-extrabold text-slate-700 block mb-1 uppercase text-[10px] tracking-wider">
                3. Bộ lọc màu ảnh
              </span>
              <div className="grid grid-cols-5 gap-1 text-[10px] font-bold text-center">
                {[
                  { id: 'none', label: 'Tự nhiên' },
                  { id: 'warm', label: 'Ấm áp ☀️' },
                  { id: 'rose', label: 'Hồng 🌸' },
                  { id: 'vintage', label: 'Cổ điển' },
                  { id: 'bw', label: 'Trắng đen' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterStyle(f.id as any)}
                    className={`py-1.5 rounded-lg border cursor-pointer ${
                      filterStyle === f.id
                        ? 'bg-rose-500 text-white border-rose-500 font-extrabold'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 5. Watermark & Caption */}
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer text-[11px] font-bold text-slate-700">
                <input
                  type="checkbox"
                  checked={showWatermark}
                  onChange={(e) => setShowWatermark(e.target.checked)}
                  className="rounded accent-rose-500"
                />
                <span>Khung viền vàng & chữ kỷ niệm cưới</span>
              </label>

              {showWatermark && (
                <input
                  type="text"
                  value={guestCaption}
                  onChange={(e) => setGuestCaption(e.target.value)}
                  placeholder="Lời nhắn ghi lên ảnh..."
                  maxLength={50}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-xs focus:outline-none focus:border-rose-400"
                />
              )}
            </div>

            {/* 6. Export Actions */}
            <div className="pt-2 flex flex-col gap-2 mt-auto">
              <button
                disabled={isExporting}
                onClick={handleDownload}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-600 hover:to-rose-600 text-white font-extrabold shadow-md flex items-center justify-center gap-2 cursor-pointer transition-transform active:scale-98 disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                <span>{isExporting ? 'Đang xuất ảnh...' : 'Tải Ảnh Về Máy 💾'}</span>
              </button>

              <button
                disabled={isExporting}
                onClick={handleSaveToWall}
                className="w-full py-2 rounded-xl bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Treo Lên Tường Ảnh Sảnh Cưới 🖼️</span>
              </button>
            </div>
          </div>
        </div>

        {/* Toast Alert */}
        {toastText && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-slate-900/95 text-white text-xs font-bold shadow-xl border border-amber-300 flex items-center gap-2 animate-bounce z-50">
            <span>{toastText}</span>
          </div>
        )}
      </div>
    </div>
  );
};
