export type GuestGroup = 'groom' | 'bride' | 'friends';
export type Gender = 'male' | 'female';

export type PlayerAction =
  | 'idle'
  | 'walk'
  | 'run'
  | 'sit'
  | 'toast'
  | 'cheer'
  | 'dance'
  | 'kiss'
  | 'wave'
  | 'clap';

export interface PlayerState {
  id: string; // Socket ID
  uid: string; // Persistent browser ID
  name: string;
  group: GuestGroup;
  gender: Gender;
  hairStyle: number;
  hairColor: string;
  outfit: string;
  accessories: string[];
  position: [number, number, number];
  rotation: number;
  action: PlayerAction;
  seatedAt?: {
    tableIndex: number;
    seatIndex: number;
  } | null;
  hallId: string;
  chatBubble?: {
    text: string;
    expiresAt: number;
  } | null;
  lastToastTime?: number;
}

export interface HallInfo {
  id: string;
  name: string;
  theme: 'diamond' | 'sophia';
  playerCount: number;
  maxPlayers: number;
  isCustom?: boolean;
}

export interface WishItem {
  id: string;
  uid: string;
  author: string;
  group: GuestGroup;
  content: string;
  icon: '💐' | '💍' | '🎉';
  hallId: string;
  createdAt: number;
}

export interface FlowerGift {
  id: string;
  uid: string;
  author: string;
  flowerType: 'rose' | 'hydrangea' | 'basket' | 'car';
  flowerName: string;
  position: [number, number, number];
  hallId: string;
  createdAt: number;
  expiresAt: number;
}

export interface UserData {
  uid: string;
  name: string;
  group: GuestGroup;
  gender: Gender;
  hairStyle: number;
  hairColor: string;
  cumulativeScore: number; // Tích luỹ (không giảm khi mua sắm, dùng để xếp hạng)
  availableScore: number;  // Khả dụng (tích luỹ - đã tiêu)
  purchasedItems: string[];
  equippedOutfit: string;
  equippedAccessories: string[];
  todayScores: {
    [gameKey: string]: { date: string; score: number };
  };
  jigsawBestTime?: number;
  quizBestScore?: number;
  bouquetCaughtCount?: number;
}

export interface LeaderboardEntry {
  uid: string;
  name: string;
  group: GuestGroup;
  score: number;
  title: string;
  hallName?: string;
  isOnline?: boolean;
}

export interface BouquetEvent {
  active: boolean;
  tossId: string;
  startPos: [number, number, number];
  targetPos: [number, number, number];
  currentPos: [number, number, number];
  startTime: number;
  duration: number; // milliseconds (e.g. 5000ms)
  winner?: {
    name: string;
    uid: string;
  } | null;
}

export interface WeddingConfig {
  groom: string;
  bride: string;
  date: string;
  time: string;
  venue: string;
  halls: Array<{ id: string; name: string; theme: 'diamond' | 'sophia' }>;
  welcome: string;
  video: {
    mode: 'youtube' | 'file' | 'off';
    youtubeId: string;
    youtubeUrl: string;
    localFile?: string;
  };
  hashtag: string;
  /** Ba mẹ hai họ (hiện trên màn hình bên phải sân khấu) */
  groomParents?: { father: string; mother: string };
  brideParents?: { father: string; mother: string };
}
