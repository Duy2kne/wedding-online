import React, { useState, useEffect } from 'react';
import { X, Puzzle, HelpCircle, Layers, Heart, Timer, CheckCircle2, RotateCcw, Eye } from 'lucide-react';
import confetti from 'canvas-confetti';

interface GamesModalProps {
  initialGame?: string;
  onClose: () => void;
  onSubmitGameScore: (game: string, score: number, details?: any) => void;
}

export const GamesModal: React.FC<GamesModalProps> = ({
  initialGame = 'jigsaw',
  onClose,
  onSubmitGameScore,
}) => {
  const [activeGame, setActiveGame] = useState<string>(initialGame);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[92vh] flex flex-col bg-white rounded-3xl shadow-2xl border-4 border-amber-300 overflow-hidden text-slate-800">
        {/* Top Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-amber-50 via-rose-50 to-pink-50 border-b border-rose-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎮</span>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-800 font-serif">
                Khu Trò Chơi Điểm Hỷ 💗
              </h2>
              <p className="text-xs text-slate-500">
                Chơi game vui nhận điểm Hỷ mua hoa chúc phúc và trang phục đẹp
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-rose-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-2 overflow-x-auto text-xs font-bold">
          {[
            { id: 'jigsaw', label: '🧩 Ghép Hình' },
            { id: 'cards', label: '🃏 Lật Thẻ' },
            { id: 'quiz', label: '❓ Đố Vui' },
            { id: 'hearts', label: '💘 Bắn Tim' },
          ].map((g) => (
            <button
              key={g.id}
              onClick={() => setActiveGame(g.id)}
              className={`py-3 px-4 transition-colors whitespace-nowrap cursor-pointer ${
                activeGame === g.id
                  ? 'text-rose-600 border-b-2 border-rose-500 font-extrabold bg-white'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>

        {/* Active Game Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col items-center">
          {activeGame === 'jigsaw' && (
            <JigsawGame onComplete={(score, details) => onSubmitGameScore('jigsaw', score, details)} />
          )}
          {activeGame === 'cards' && (
            <MemoryCardGame onComplete={(score, details) => onSubmitGameScore('cards', score, details)} />
          )}
          {activeGame === 'quiz' && (
            <WeddingQuizGame onComplete={(score, details) => onSubmitGameScore('quiz', score, details)} />
          )}
          {activeGame === 'hearts' && (
            <HeartPopperGame onComplete={(score) => onSubmitGameScore('hearts', score)} />
          )}
        </div>
      </div>
    </div>
  );
};

// 1. Jigsaw Puzzle Game Component
const JigsawGame: React.FC<{ onComplete: (score: number, details: any) => void }> = ({ onComplete }) => {
  const [gridSize, setGridSize] = useState<number>(3); // 3x3 (Easy), 4x4 (Medium), 5x5 (Hard)
  const [photoUrl, setPhotoUrl] = useState('/media/photos/photo1.svg');
  const [pieces, setPieces] = useState<number[]>([]);
  const [selectedPiece, setSelectedPiece] = useState<number | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [timer, setTimer] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const initGame = (size = gridSize) => {
    const total = size * size;
    const initial = Array.from({ length: total }, (_, i) => i);
    // Shuffle pieces ensuring it's not already solved
    let shuffled = [...initial];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    setPieces(shuffled);
    setSelectedPiece(null);
    setIsCompleted(false);
    setTimer(0);
    setIsPlaying(true);
  };

  useEffect(() => {
    initGame();
  }, [gridSize, photoUrl]);

  useEffect(() => {
    let interval: any;
    if (isPlaying && !isCompleted) {
      interval = setInterval(() => setTimer((t) => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isPlaying, isCompleted]);

  const handlePieceClick = (index: number) => {
    if (isCompleted) return;

    if (selectedPiece === null) {
      setSelectedPiece(index);
    } else {
      // Swap selected and current piece
      const newPieces = [...pieces];
      const temp = newPieces[selectedPiece];
      newPieces[selectedPiece] = newPieces[index];
      newPieces[index] = temp;
      setPieces(newPieces);
      setSelectedPiece(null);

      // Check if solved
      const solved = newPieces.every((val, i) => val === i);
      if (solved) {
        setIsCompleted(true);
        setIsPlaying(false);
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        const baseScore = gridSize === 3 ? 10 : gridSize === 4 ? 20 : 35;
        const speedBonus = timer < 30 ? 10 : timer < 60 ? 5 : 0;
        onComplete(baseScore + speedBonus, { gridSize, time: timer });
      }
    }
  };

  return (
    <div className="w-full flex flex-col items-center max-w-md">
      {/* Controls Bar */}
      <div className="w-full flex items-center justify-between mb-3 text-xs">
        <div className="flex gap-1.5">
          {[3, 4].map((sz) => (
            <button
              key={sz}
              onClick={() => {
                setGridSize(sz);
                initGame(sz);
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all ${
                gridSize === sz ? 'bg-rose-500 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {sz}x{sz} {sz === 3 ? '(Dễ)' : '(Vừa)'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 font-bold text-slate-700">
            <Timer className="w-4 h-4 text-rose-500" />
            <span>{timer}s</span>
          </div>
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
            title="Xem ảnh gốc"
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => initGame()}
            className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600"
            title="Chơi lại"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Jigsaw Board */}
      <div
        className="relative w-full aspect-square max-w-[360px] bg-slate-100 rounded-2xl overflow-hidden shadow-md border-4 border-amber-200"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${gridSize}, 1fr)`,
          gridTemplateRows: `repeat(${gridSize}, 1fr)`,
        }}
      >
        {pieces.map((pieceVal, slotIndex) => {
          const origRow = Math.floor(pieceVal / gridSize);
          const origCol = pieceVal % gridSize;
          const bgX = (origCol / (gridSize - 1)) * 100;
          const bgY = (origRow / (gridSize - 1)) * 100;
          const isSelected = selectedPiece === slotIndex;

          return (
            <div
              key={slotIndex}
              onClick={() => handlePieceClick(slotIndex)}
              className={`relative cursor-pointer border border-white/60 transition-transform ${
                isSelected ? 'scale-95 ring-4 ring-rose-500 z-10' : 'hover:opacity-90'
              }`}
              style={{
                backgroundImage: `url(${photoUrl})`,
                backgroundSize: `${gridSize * 100}%`,
                backgroundPosition: `${bgX}% ${bgY}%`,
              }}
            >
              <span className="absolute top-1 left-1 text-[9px] bg-black/40 text-white px-1 rounded font-mono">
                {pieceVal + 1}
              </span>
            </div>
          );
        })}

        {/* Preview overlay */}
        {showOriginal && (
          <div className="absolute inset-0 z-20 bg-white">
            <img src={photoUrl} alt="Ảnh cưới gốc" className="w-full h-full object-cover" />
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-slate-500 text-center">
        Chạm vào 2 mảnh để hoán đổi vị trí và ghép thành bức ảnh cưới hoàn chỉnh!
      </p>

      {isCompleted && (
        <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center animate-bounce">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1" />
          <h4 className="font-extrabold text-emerald-800 text-sm">
            Ghép hình thành công trong {timer} giây!
          </h4>
          <p className="text-xs text-emerald-600 font-semibold mt-1">
            +{(gridSize === 3 ? 10 : 20) + (timer < 30 ? 10 : 5)} 💗 Điểm Hỷ đã được cộng!
          </p>
        </div>
      )}
    </div>
  );
};

// 2. Memory Card Match Game
const MemoryCardGame: React.FC<{ onComplete: (score: number, details: any) => void }> = ({ onComplete }) => {
  const ICONS = ['💍', '💐', '🎂', '🥂', '💖', '🕊️'];
  const [cards, setCards] = useState<Array<{ id: number; icon: string; matched: boolean }>>([]);
  const [flipped, setFlipped] = useState<number[]>([]);
  const [moves, setMoves] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);

  const initCards = () => {
    const deck = [...ICONS, ...ICONS].map((icon, idx) => ({
      id: idx,
      icon,
      matched: false,
    }));
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    setCards(deck);
    setFlipped([]);
    setMoves(0);
    setIsCompleted(false);
  };

  useEffect(() => {
    initCards();
  }, []);

  const handleCardClick = (index: number) => {
    if (flipped.length === 2 || flipped.includes(index) || cards[index].matched) return;

    const newFlipped = [...flipped, index];
    setFlipped(newFlipped);

    if (newFlipped.length === 2) {
      setMoves((m) => m + 1);
      const [i1, i2] = newFlipped;
      if (cards[i1].icon === cards[i2].icon) {
        // Match!
        setTimeout(() => {
          setCards((prev) =>
            prev.map((c, idx) => (idx === i1 || idx === i2 ? { ...c, matched: true } : c))
          );
          setFlipped([]);
        }, 500);
      } else {
        // No match, flip back
        setTimeout(() => setFlipped([]), 900);
      }
    }
  };

  useEffect(() => {
    if (cards.length > 0 && cards.every((c) => c.matched)) {
      setIsCompleted(true);
      confetti({ particleCount: 70, spread: 60 });
      const score = moves <= 10 ? 25 : moves <= 16 ? 15 : 10;
      onComplete(score, { moves });
    }
  }, [cards]);

  return (
    <div className="w-full flex flex-col items-center max-w-sm">
      <div className="w-full flex justify-between items-center mb-3 text-xs font-bold text-slate-600">
        <span>Số lượt lật: {moves}</span>
        <button onClick={initCards} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200">
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-2.5 w-full">
        {cards.map((c, idx) => {
          const isFlipped = flipped.includes(idx) || c.matched;
          return (
            <button
              key={idx}
              onClick={() => handleCardClick(idx)}
              className={`aspect-square rounded-2xl text-2xl flex items-center justify-center font-bold transition-all transform cursor-pointer ${
                isFlipped
                  ? 'bg-gradient-to-br from-rose-100 to-amber-100 border-2 border-rose-300 shadow-sm'
                  : 'bg-rose-500 text-white shadow-md hover:bg-rose-600'
              }`}
            >
              {isFlipped ? c.icon : '💌'}
            </button>
          );
        })}
      </div>

      {isCompleted && (
        <div className="mt-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center animate-bounce">
          <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-1" />
          <h4 className="font-extrabold text-emerald-800 text-sm">
            Tuyệt vời! Bạn hoàn thành trong {moves} lượt!
          </h4>
          <p className="text-xs text-emerald-600 font-semibold mt-1">
            +{(moves <= 10 ? 25 : 15)} 💗 Điểm Hỷ!
          </p>
        </div>
      )}
    </div>
  );
};

// 3. Wedding Quiz Game Component ("Bạn hiểu Duy & Tâm bao nhiêu?")
const WeddingQuizGame: React.FC<{ onComplete: (score: number, details: any) => void }> = ({ onComplete }) => {
  const [questions, setQuestions] = useState<any[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(15);
  const [isFinished, setIsFinished] = useState(false);

  useEffect(() => {
    fetch('/quiz.json')
      .then((r) => r.json())
      .then((data) => setQuestions(data))
      .catch(() => {});
  }, []);

  // 15 seconds per question
  useEffect(() => {
    if (isFinished || isAnswered || questions.length === 0) return;
    if (timeLeft <= 0) {
      handleAnswer(-1); // timeout
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, isAnswered, isFinished, questions]);

  const handleAnswer = (optionIdx: number) => {
    if (isAnswered) return;
    setSelectedOption(optionIdx);
    setIsAnswered(true);

    const currQ = questions[currentIndex];
    const isCorrect = optionIdx === currQ.answer;
    if (isCorrect) setCorrectCount((c) => c + 1);

    setTimeout(() => {
      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((i) => i + 1);
        setSelectedOption(null);
        setIsAnswered(false);
        setTimeLeft(15);
      } else {
        setIsFinished(true);
        confetti({ particleCount: 70, spread: 60 });
        const finalScore = (correctCount + (isCorrect ? 1 : 0)) * 5;
        onComplete(finalScore, { correctCount: correctCount + (isCorrect ? 1 : 0) });
      }
    }, 1200);
  };

  if (questions.length === 0) {
    return <div className="text-slate-500 text-sm py-8">Đang tải câu đố...</div>;
  }

  if (isFinished) {
    return (
      <div className="w-full text-center py-6">
        <h3 className="text-xl font-extrabold text-rose-800 font-serif">
          Hoàn Thành Đố Vui Tình Yêu!
        </h3>
        <p className="text-sm text-slate-600 mt-2">
          Bạn trả lời đúng <span className="font-extrabold text-rose-600">{correctCount}/10</span> câu!
        </p>
        <p className="text-base font-extrabold text-emerald-600 mt-2">
          +{correctCount * 5} 💗 Điểm Hỷ đã được cộng vào tài khoản!
        </p>
      </div>
    );
  }

  const q = questions[currentIndex];

  return (
    <div className="w-full max-w-md">
      {/* Progress & Timer */}
      <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-600">
        <span>Câu {currentIndex + 1} / {questions.length}</span>
        <div className={`flex items-center gap-1 ${timeLeft <= 5 ? 'text-rose-600 animate-pulse font-extrabold' : ''}`}>
          <Timer className="w-4 h-4" />
          <span>{timeLeft}s</span>
        </div>
      </div>

      {/* Question Card */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50 to-pink-50 border-2 border-rose-200 mb-4 text-center">
        <h4 className="font-bold text-sm sm:text-base text-slate-800">{q.question}</h4>
      </div>

      {/* Options */}
      <div className="space-y-2">
        {q.options.map((opt: string, idx: number) => {
          let btnClass = 'border-slate-200 bg-white hover:border-rose-300';
          if (isAnswered) {
            if (idx === q.answer) {
              btnClass = 'border-emerald-500 bg-emerald-50 text-emerald-800 font-extrabold';
            } else if (idx === selectedOption) {
              btnClass = 'border-rose-500 bg-rose-50 text-rose-800 font-extrabold';
            } else {
              btnClass = 'opacity-50 border-slate-200 bg-white';
            }
          }

          return (
            <button
              key={idx}
              disabled={isAnswered}
              onClick={() => handleAnswer(idx)}
              className={`w-full p-3 rounded-xl border-2 text-left text-xs sm:text-sm font-semibold transition-all cursor-pointer ${btnClass}`}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// 4. Heart Popper Action Game
const HeartPopperGame: React.FC<{ onComplete: (score: number) => void }> = ({ onComplete }) => {
  const [poppedCount, setPoppedCount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [hearts, setHearts] = useState<Array<{ id: number; x: number; y: number; speed: number }>>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const startGame = () => {
    setPoppedCount(0);
    setTimeLeft(30);
    setIsPlaying(true);
    setHearts([]);
  };

  useEffect(() => {
    startGame();
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setIsPlaying(false);
          const score = Math.min(15, Math.floor(poppedCount * 0.8));
          onComplete(score);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, poppedCount]);

  // Spawn hearts
  useEffect(() => {
    if (!isPlaying) return;
    const spawn = setInterval(() => {
      setHearts((prev) => [
        ...prev.slice(-12),
        {
          id: Date.now() + Math.random(),
          x: 10 + Math.random() * 80,
          y: 90,
          speed: 1.5 + Math.random() * 2,
        },
      ]);
    }, 450);
    return () => clearInterval(spawn);
  }, [isPlaying]);

  const popHeart = (id: number) => {
    setHearts((prev) => prev.filter((h) => h.id !== id));
    setPoppedCount((c) => c + 1);
  };

  return (
    <div className="w-full flex flex-col items-center max-w-sm">
      <div className="w-full flex justify-between items-center mb-2 text-xs font-bold text-slate-700">
        <span>Thời gian: {timeLeft}s</span>
        <span>Đã bắn: {poppedCount} ❤️</span>
      </div>

      <div className="relative w-full h-[320px] rounded-2xl bg-gradient-to-b from-rose-950/80 to-purple-950/90 overflow-hidden border-4 border-rose-300 shadow-inner">
        {hearts.map((h) => (
          <button
            key={h.id}
            onClick={() => popHeart(h.id)}
            className="absolute text-3xl transform -translate-x-1/2 -translate-y-1/2 hover:scale-125 transition-transform cursor-pointer animate-float-up"
            style={{
              left: `${h.x}%`,
              bottom: `${100 - h.y}%`,
            }}
          >
            💖
          </button>
        ))}

        {!isPlaying && timeLeft === 0 && (
          <div className="absolute inset-0 bg-black/75 flex flex-col items-center justify-center text-white p-4 text-center">
            <h4 className="font-extrabold text-lg text-rose-300">Hết Giờ!</h4>
            <p className="text-xs mt-1">Bạn đã bắn trúng {poppedCount} trái tim tình yêu!</p>
            <p className="text-sm font-bold text-emerald-400 mt-2">
              +{Math.min(15, Math.floor(poppedCount * 0.8))} 💗 Điểm Hỷ!
            </p>
            <button
              onClick={startGame}
              className="mt-4 px-4 py-2 rounded-xl bg-rose-500 hover:bg-rose-600 font-bold text-xs"
            >
              Chơi Lại
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
