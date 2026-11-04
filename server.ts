import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import type {
  PlayerState,
  HallInfo,
  WishItem,
  FlowerGift,
  UserData,
  LeaderboardEntry,
  BouquetEvent,
  WeddingConfig,
} from './src/shared/types.js';
import { ALL_SHOP_ITEMS, getUserTitle } from './src/shared/shop.js';
import { maskProfanity } from './src/shared/profanity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_PER_HALL = parseInt(process.env.MAX_PER_HALL || '50', 10);
const MAX_HALLS = parseInt(process.env.MAX_HALLS || '6', 10);
// Không có ADMIN_PASSWORD thì tạo mật khẩu ngẫu nhiên (in ra log) thay vì dùng mật khẩu mặc định ai cũng biết
const ADMIN_PASSWORD =
  process.env.ADMIN_PASSWORD ||
  (() => {
    const pw = Math.random().toString(36).slice(2, 10);
    console.warn(`⚠️  Chưa đặt ADMIN_PASSWORD. Mật khẩu /admin tạm thời: ${pw}`);
    return pw;
  })();
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'wedding.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Read wedding configuration
const CONFIG_PATH = path.join(__dirname, 'public', 'wedding.config.json');
let weddingConfig: WeddingConfig = {
  groom: 'Hoàng Duy',
  bride: 'Thiều Tâm',
  date: '2026-11-29',
  time: '18:00',
  venue: 'Online · Sảnh Diamond & Sảnh Sophia',
  halls: [
    { id: 'diamond', name: 'Sảnh Diamond', theme: 'diamond' },
    { id: 'sophia', name: 'Sảnh Sophia', theme: 'sophia' },
  ],
  welcome: 'Cảm ơn bạn đã đến chung vui cùng Duy & Tâm 💕',
  video: {
    mode: 'youtube',
    youtubeId: 'uIlNkfn6NcA',
    youtubeUrl: 'https://youtu.be/uIlNkfn6NcA',
  },
  hashtag: '#DuyTamWedding',
  groomParents: { father: 'Võ Đình Dũng', mother: 'Huỳnh Thị Kim Sự' },
  brideParents: { father: 'Thiều Quang Tuệ', mother: 'Lường Thị Liên' },
};

if (fs.existsSync(CONFIG_PATH)) {
  try {
    weddingConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) {
    console.error('Error reading wedding.config.json:', e);
  }
}

// Lọc từ tục: danh sách từ cấm nằm ở src/shared/profanity.ts
function sanitizeText(input: string, maxLen = 200): string {
  if (!input || typeof input !== 'string') return '';
  const clean = input.normalize('NFC').replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, maxLen);
  return maskProfanity(clean);
}

// Persistent Storage Model
interface StoredData {
  users: Record<string, UserData>;
  wishes: WishItem[];
  flowers: FlowerGift[];
  seats: Record<string, Record<string, { uid: string; name: string }>>; // hallId -> seatKey -> user
}

let storedData: StoredData = {
  users: {},
  wishes: [],
  flowers: [],
  seats: {},
};

if (fs.existsSync(DATA_FILE)) {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    storedData = {
      users: parsed.users || {},
      wishes: parsed.wishes || [],
      flowers: parsed.flowers || [],
      seats: parsed.seats || {},
    };
    console.log(`Loaded persisted data: ${Object.keys(storedData.users).length} users, ${storedData.wishes.length} wishes.`);
  } catch (e) {
    console.error('Could not load data file, starting fresh:', e);
  }
}

function saveDatabase() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(storedData, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to write database file:', e);
  }
}

// Auto-save every 15 seconds
setInterval(saveDatabase, 15000);

// Hall Management State
interface ServerHall {
  id: string;
  name: string;
  theme: 'diamond' | 'sophia';
  isCustom: boolean;
  emptySince: number | null;
}

const hallsMap = new Map<string, ServerHall>();
// Initialize primary halls
hallsMap.set('diamond', { id: 'diamond', name: 'Sảnh Diamond', theme: 'diamond', isCustom: false, emptySince: null });
hallsMap.set('sophia', { id: 'sophia', name: 'Sảnh Sophia', theme: 'sophia', isCustom: false, emptySince: null });

// Players in memory
const players = new Map<string, PlayerState>(); // socketId -> PlayerState
const socketToUid = new Map<string, string>();
const uidToSocket = new Map<string, string>();
const disconnectedUids = new Map<string, { timer: NodeJS.Timeout; hallId: string; lastState: PlayerState }>();

// Queue management
const waitingQueue: Array<{ socketId: string; uid: string; preferredHall?: string }> = [];

// Video sync state
let videoStartTime = Date.now();
let videoHealthStatus: 'ok' | 'embed_disabled' | 'not_found' = 'ok';

// Bouquet toss event state per hall
const bouquetEvents = new Map<string, BouquetEvent>();

// Rate limiting in-memory maps
const lastActionTimes = new Map<string, number>();
const lastChatTimes = new Map<string, number>();
const lastWishTimes = new Map<string, number>();

// Server startup check for YouTube video via oEmbed
async function checkYouTubeVideo() {
  const ytid = weddingConfig.video?.youtubeId;
  if (!ytid) return;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${ytid}&format=json`);
    if (res.status === 200) {
      videoHealthStatus = 'ok';
    } else if (res.status === 401 || res.status === 403) {
      videoHealthStatus = 'embed_disabled';
    } else if (res.status === 404) {
      videoHealthStatus = 'not_found';
    }
  } catch {
    videoHealthStatus = 'ok';
  }
  console.log(`YouTube video check (${ytid}): ${videoHealthStatus}`);
}
checkYouTubeVideo();

const VALID_ACTIONS = new Set(['idle', 'walk', 'run', 'sit', 'toast', 'cheer', 'dance', 'kiss', 'wave', 'clap']);

// Express & Socket.IO App
const app = express();
app.use(cors());
app.use(express.json({ limit: '9mb' }));
app.use(express.urlencoded({ limit: '1mb', extended: true }));

// Content Security Policy for YouTube iframe
app.use((req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' blob: data: https: wss:; " +
      "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com; " +
      "img-src 'self' data: blob: https://i.ytimg.com https://images.unsplash.com https:; " +
      "connect-src 'self' https: wss: ws:; " +
      "worker-src 'self' blob:;"
  );
  next();
});

const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Helper: Get counts per hall
function getHallPlayerCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hallId of hallsMap.keys()) {
    counts[hallId] = 0;
  }
  for (const p of players.values()) {
    counts[p.hallId] = (counts[p.hallId] || 0) + 1;
  }
  return counts;
}

function getHallsList(): HallInfo[] {
  const counts = getHallPlayerCounts();
  const list: HallInfo[] = [];
  for (const hall of hallsMap.values()) {
    list.push({
      id: hall.id,
      name: hall.name,
      theme: hall.theme,
      playerCount: counts[hall.id] || 0,
      maxPlayers: MAX_PER_HALL,
      isCustom: hall.isCustom,
    });
  }
  return list;
}

// Check dynamic hall expansion & closing
function checkDynamicHalls() {
  const counts = getHallPlayerCounts();
  // Check if all active halls are full
  let allFull = true;
  for (const hall of hallsMap.values()) {
    if ((counts[hall.id] || 0) < MAX_PER_HALL) {
      allFull = false;
      break;
    }
  }

  if (allFull && hallsMap.size < MAX_HALLS) {
    // Open new auxiliary hall
    const num = Math.floor(hallsMap.size / 2) + 1;
    const theme: 'diamond' | 'sophia' = hallsMap.size % 2 === 0 ? 'diamond' : 'sophia';
    const id = `${theme}-${num}`;
    const name = theme === 'diamond' ? `Sảnh Diamond ${num}` : `Sảnh Sophia ${num}`;
    hallsMap.set(id, { id, name, theme, isCustom: true, emptySince: null });
    io.emit('halls:list', getHallsList());
  }

  // Check if custom halls are empty for > 5 minutes
  const now = Date.now();
  for (const [id, hall] of hallsMap.entries()) {
    if (hall.isCustom) {
      const count = counts[id] || 0;
      if (count === 0) {
        if (!hall.emptySince) {
          hall.emptySince = now;
        } else if (now - hall.emptySince > 5 * 60 * 1000) {
          // Close hall
          hallsMap.delete(id);
          delete storedData.seats[id];
          io.emit('halls:list', getHallsList());
        }
      } else {
        hall.emptySince = null;
      }
    }
  }
}

// Helper: Find best hall
function findBestHall(preferredId?: string): string | null {
  const counts = getHallPlayerCounts();
  if (preferredId && hallsMap.has(preferredId)) {
    if ((counts[preferredId] || 0) < MAX_PER_HALL) {
      return preferredId;
    }
    // Preferred is full, check sister hall with same theme
    const prefHall = hallsMap.get(preferredId)!;
    for (const [id, hall] of hallsMap.entries()) {
      if (hall.theme === prefHall.theme && (counts[id] || 0) < MAX_PER_HALL) {
        return id;
      }
    }
  }

  // Otherwise pick the fullest hall that still has room (per requirement to group guests together)
  let bestHall: string | null = null;
  let highestCount = -1;
  for (const [id] of hallsMap.entries()) {
    const c = counts[id] || 0;
    if (c < MAX_PER_HALL && c > highestCount) {
      highestCount = c;
      bestHall = id;
    }
  }

  return bestHall;
}

// User Persistence Helpers
function getOrCreateUser(uid: string, initialName?: string, group?: string, gender?: string): UserData {
  if (!storedData.users[uid]) {
    storedData.users[uid] = {
      uid,
      name: sanitizeText(initialName || 'Khách mời', 40),
      group: (group as any) || 'friends',
      gender: (gender as any) || 'female',
      hairStyle: 0,
      hairColor: '#3d2314',
      cumulativeScore: 0,
      availableScore: 0,
      purchasedItems: [],
      equippedOutfit: gender === 'male' ? 'suit_black' : 'dress_pink',
      equippedAccessories: [],
      todayScores: {},
    };
  }
  return storedData.users[uid];
}

// ---------- Sao lưu điểm trên máy khách (chống mất điểm khi server khởi động lại) ----------
// Render bản miễn phí xoá ổ đĩa mỗi lần server ngủ/khởi động lại -> wedding.json mất.
// Server gửi cho khách 1 "phiếu" có chữ ký HMAC; khách cất trong localStorage và gửi lại khi vào tiệc.
// Chữ ký dùng ADMIN_PASSWORD (hoặc SCORE_SECRET) nên khách không tự sửa điểm được.
const BACKUP_SECRET = process.env.SCORE_SECRET || process.env.ADMIN_PASSWORD || ADMIN_PASSWORD;

function makeBackup(u: UserData): string {
  const payload = {
    v: 1,
    uid: u.uid,
    name: u.name,
    group: u.group,
    gender: u.gender,
    hairStyle: u.hairStyle,
    hairColor: u.hairColor,
    cumulativeScore: u.cumulativeScore,
    availableScore: u.availableScore,
    purchasedItems: u.purchasedItems,
    equippedOutfit: u.equippedOutfit,
    equippedAccessories: u.equippedAccessories,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', BACKUP_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function readBackup(token: unknown, uid: string): Partial<UserData> | null {
  if (typeof token !== 'string' || token.length > 8000) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expect = crypto.createHmac('sha256', BACKUP_SECRET).update(body).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (data?.uid !== uid) return null;
    return data;
  } catch {
    return null;
  }
}

function sendBackup(socket: Socket, u: UserData | undefined) {
  if (u) socket.emit('backup', makeBackup(u));
}

// Leaderboard compute
function getLeaderboard(): LeaderboardEntry[] {
  const onlineUids = new Set(Array.from(players.values()).map((p) => p.uid));
  const uidToHall = new Map<string, string>();
  for (const p of players.values()) {
    const hall = hallsMap.get(p.hallId);
    if (hall) uidToHall.set(p.uid, hall.name);
  }

  const entries: LeaderboardEntry[] = Object.values(storedData.users)
    .map((u) => ({
      uid: u.uid,
      name: u.name,
      group: u.group,
      score: u.cumulativeScore,
      title: getUserTitle(u.cumulativeScore),
      hallName: uidToHall.get(u.uid),
      isOnline: onlineUids.has(u.uid),
    }))
    .sort((a, b) => b.score - a.score);

  return entries;
}

// Clean expired flowers (older than 30 mins)
function cleanExpiredFlowers() {
  const now = Date.now();
  const initialLen = storedData.flowers.length;
  storedData.flowers = storedData.flowers.filter((f) => f.expiresAt > now);
  if (storedData.flowers.length !== initialLen) {
    io.emit('flowers:sync', storedData.flowers);
  }
}
setInterval(cleanExpiredFlowers, 60000);

// Bouquet Toss scheduler: every 10 minutes, bride tosses bouquet in all halls
function triggerBouquetToss(hallId?: string) {
  const targetHalls = hallId ? [hallId] : Array.from(hallsMap.keys());
  const tossId = 'toss_' + Date.now();
  const startTime = Date.now() + 2000; // 2s anticipation countdown

  for (const hId of targetHalls) {
    // Stage is at [0, 1.2, -18], dance floor is centered at [0, 0, -4]
    // Random landing spot on the dance floor
    const targetX = (Math.random() - 0.5) * 8;
    const targetZ = -5 + (Math.random() - 0.5) * 6;
    const evt: BouquetEvent = {
      active: true,
      tossId,
      startPos: [0, 2.2, -16],
      targetPos: [targetX, 0.4, targetZ],
      currentPos: [0, 2.2, -16],
      startTime,
      duration: 5000,
      winner: null,
    };
    bouquetEvents.set(hId, evt);
    io.to(hId).emit('bouquet:start', evt);

    // After toss finishes, find player closest to landing spot
    setTimeout(() => {
      const activeEvt = bouquetEvents.get(hId);
      if (!activeEvt || activeEvt.tossId !== tossId) return;

      let closestPlayer: PlayerState | null = null;
      let minDistance = 6.0; // Within 6 meters

      for (const p of players.values()) {
        if (p.hallId === hId) {
          const dx = p.position[0] - targetX;
          const dz = p.position[2] - targetZ;
          const dist = Math.sqrt(dx * dx + dz * dz);
          if (dist < minDistance) {
            minDistance = dist;
            closestPlayer = p;
          }
        }
      }

      if (closestPlayer) {
        const u = storedData.users[closestPlayer.uid];
        if (u) {
          u.cumulativeScore += 30;
          u.availableScore += 30;
          u.bouquetCaughtCount = (u.bouquetCaughtCount || 0) + 1;
        }
        activeEvt.winner = { name: closestPlayer.name, uid: closestPlayer.uid };
        activeEvt.active = false;
        io.to(hId).emit('bouquet:caught', {
          winnerName: closestPlayer.name,
          winnerUid: closestPlayer.uid,
          points: 30,
        });
        io.emit('toast:global', {
          type: 'bouquet',
          message: `💐 ${closestPlayer.name} vừa bắt được bó hoa cưới từ cô dâu Thiều Tâm! (+30 💗)`,
        });
        io.emit('leaderboard:update', getLeaderboard().slice(0, 10));
      } else {
        activeEvt.active = false;
        io.to(hId).emit('bouquet:caught', { winnerName: null, points: 0 });
      }
    }, 7200);
  }
}
setInterval(() => triggerBouquetToss(), 10 * 60 * 1000);

// Socket.IO event handlers
io.on('connection', (socket: Socket) => {
  let currentUid = '';
  let currentHallId = '';

  // Join Hall
  socket.on('join', (data: {
    uid: string;
    name: string;
    group: 'groom' | 'bride' | 'friends';
    gender: 'male' | 'female';
    hairStyle?: number;
    hairColor?: string;
    outfit?: string;
    preferredHall?: string;
    backup?: string;
  }) => {
    currentUid = data.uid || socket.id;
    socketToUid.set(socket.id, currentUid);
    uidToSocket.set(currentUid, socket.id);

    // Cancel reconnect hold if exists
    if (disconnectedUids.has(currentUid)) {
      const held = disconnectedUids.get(currentUid)!;
      clearTimeout(held.timer);
      disconnectedUids.delete(currentUid);
    }

    // Server mất dữ liệu (khởi động lại) mà khách còn phiếu sao lưu hợp lệ -> khôi phục điểm & đồ đã mua
    const restored = readBackup(data.backup, currentUid);
    const known = storedData.users[currentUid];
    const user = getOrCreateUser(currentUid, data.name, data.group, data.gender);
    if (restored && (!known || (restored.cumulativeScore || 0) > known.cumulativeScore)) {
      user.cumulativeScore = Math.max(0, Number(restored.cumulativeScore) || 0);
      user.availableScore = Math.max(0, Math.min(user.cumulativeScore, Number(restored.availableScore) || 0));
      if (Array.isArray(restored.purchasedItems)) user.purchasedItems = restored.purchasedItems.filter((x) => typeof x === 'string').slice(0, 50);
      if (typeof restored.equippedOutfit === 'string') user.equippedOutfit = restored.equippedOutfit;
      if (Array.isArray(restored.equippedAccessories)) user.equippedAccessories = restored.equippedAccessories.filter((x) => typeof x === 'string').slice(0, 10);
      console.log(`[Backup] Khôi phục điểm cho ${currentUid}: ${user.cumulativeScore}`);
    }
    user.name = sanitizeText(data.name || user.name, 40);
    user.group = data.group || user.group;
    user.gender = data.gender || user.gender;
    if (data.hairStyle !== undefined) user.hairStyle = data.hairStyle;
    if (data.hairColor) user.hairColor = data.hairColor;

    checkDynamicHalls();
    const assignedHall = findBestHall(data.preferredHall);

    if (!assignedHall) {
      // Put in queue
      waitingQueue.push({ socketId: socket.id, uid: currentUid, preferredHall: data.preferredHall });
      socket.emit('queue:status', { inQueue: true, position: waitingQueue.length });
      return;
    }

    currentHallId = assignedHall;
    socket.join(currentHallId);

    // Vị trí xuất hiện: ngay trước cổng hoa (cổng ở z = 18)
    const spawnX = (Math.random() - 0.5) * 4;
    const spawnZ = 21.5 + Math.random() * 2; // đứng trước cổng hoa nhìn vào sảnh

    const playerState: PlayerState = {
      id: socket.id,
      uid: currentUid,
      name: user.name,
      group: user.group,
      gender: user.gender,
      hairStyle: user.hairStyle,
      hairColor: user.hairColor,
      outfit: user.equippedOutfit,
      accessories: user.equippedAccessories,
      position: [spawnX, 0, spawnZ],
      rotation: Math.PI, // Facing entrance towards stage
      action: 'idle',
      hallId: currentHallId,
      chatBubble: null,
    };

    players.set(socket.id, playerState);

    // Send join acknowledgement with full room context
    const hallPlayers = Array.from(players.values()).filter((p) => p.hallId === currentHallId);
    const hallFlowers = storedData.flowers.filter((f) => f.hallId === currentHallId);
    const hallSeats = storedData.seats[currentHallId] || {};

    socket.emit('joined', {
      self: playerState,
      user,
      hall: hallsMap.get(currentHallId),
      halls: getHallsList(),
      players: hallPlayers,
      flowers: hallFlowers,
      seats: hallSeats,
      wishes: storedData.wishes.slice(-20), // Recent 20 wishes for 3D board
      videoTime: ((Date.now() - videoStartTime) / 1000),
      leaderboard: getLeaderboard().slice(0, 10),
    });
    sendBackup(socket, user);

    // Notify other players in this hall
    socket.to(currentHallId).emit('player:joined', playerState);

    // Broadcast updated hall occupancy to all
    io.emit('halls:list', getHallsList());
  });

  // Switch Hall
  socket.on('hall:switch', (targetHallId: string) => {
    if (!players.has(socket.id) || !hallsMap.has(targetHallId)) return;
    const counts = getHallPlayerCounts();
    if ((counts[targetHallId] || 0) >= MAX_PER_HALL) {
      socket.emit('toast', { type: 'error', message: 'Sảnh này hiện đã đủ khách!' });
      return;
    }

    const p = players.get(socket.id)!;
    const oldHall = p.hallId;

    // Leave seat if seated
    if (p.seatedAt) {
      const seatKey = `${p.seatedAt.tableIndex}_${p.seatedAt.seatIndex}`;
      if (storedData.seats[oldHall]) {
        delete storedData.seats[oldHall][seatKey];
        io.to(oldHall).emit('seat:update', { hallId: oldHall, seats: storedData.seats[oldHall] });
      }
      p.seatedAt = null;
    }

    socket.leave(oldHall);
    socket.to(oldHall).emit('player:left', socket.id);

    currentHallId = targetHallId;
    p.hallId = targetHallId;
    p.position = [(Math.random() - 0.5) * 4, 0, 21.5 + Math.random() * 2]; // trước cổng hoa
    p.action = 'idle';
    socket.join(targetHallId);

    const hallPlayers = Array.from(players.values()).filter((item) => item.hallId === currentHallId);
    const hallFlowers = storedData.flowers.filter((f) => f.hallId === currentHallId);
    const hallSeats = storedData.seats[currentHallId] || {};

    socket.emit('hall:switched', {
      self: p,
      hall: hallsMap.get(currentHallId),
      players: hallPlayers,
      flowers: hallFlowers,
      seats: hallSeats,
    });

    socket.to(targetHallId).emit('player:joined', p);
    io.emit('halls:list', getHallsList());
  });

  // Movement update (throttled ~12-15 times/sec on client)
  socket.on('move', (data: { position: [number, number, number]; rotation: number; action: string }) => {
    const p = players.get(socket.id);
    if (!p) return;

    // If moving, stand up from seat
    if (p.seatedAt && (data.action === 'walk' || data.action === 'run')) {
      const seatKey = `${p.seatedAt.tableIndex}_${p.seatedAt.seatIndex}`;
      if (storedData.seats[p.hallId]) {
        delete storedData.seats[p.hallId][seatKey];
        io.to(p.hallId).emit('seat:update', { hallId: p.hallId, seats: storedData.seats[p.hallId] });
      }
      p.seatedAt = null;
    }

    if (!Array.isArray(data?.position) || data.position.length !== 3 || !data.position.every(Number.isFinite)) return;
    p.position = [
      Math.max(-60, Math.min(60, data.position[0])),
      Math.max(-1, Math.min(5, data.position[1])),
      Math.max(-60, Math.min(60, data.position[2])),
    ];
    p.rotation = Number.isFinite(data.rotation) ? data.rotation : p.rotation;
    p.action = VALID_ACTIONS.has(data.action) ? (data.action as any) : 'idle';
  });

  // Action (toast, dance, clap, wave, kiss, cheer)
  socket.on('action', (actionType: string) => {
    const now = Date.now();
    const lastAction = lastActionTimes.get(socket.id) || 0;
    if (now - lastAction < 800) return; // 0.8s rate limit
    lastActionTimes.set(socket.id, now);

    const p = players.get(socket.id);
    if (!p || !VALID_ACTIONS.has(actionType)) return;

    p.action = actionType as any;

    if (actionType === 'toast') {
      p.lastToastTime = now;
      p.chatBubble = { text: 'Một, hai, ba... DÔ! 🥂', expiresAt: now + 5000 };
      io.to(p.hallId).emit('player:toast', { id: socket.id, position: p.position });

      // Check if others at the same table (or nearby < 3m) are toasting within 5 seconds for collective toast bonus!
      let collectiveToast = false;
      for (const other of players.values()) {
        if (other.id !== socket.id && other.hallId === p.hallId && other.lastToastTime && now - other.lastToastTime <= 5000) {
          const dx = other.position[0] - p.position[0];
          const dz = other.position[2] - p.position[2];
          if (Math.sqrt(dx * dx + dz * dz) < 3.5) {
            collectiveToast = true;
            break;
          }
        }
      }

      const u = storedData.users[p.uid];
      if (u) {
        const bonus = collectiveToast ? 3 : 1;
        u.cumulativeScore += bonus;
        u.availableScore += bonus;
        socket.emit('score:updated', { cumulativeScore: u.cumulativeScore, availableScore: u.availableScore });
        sendBackup(socket, u);
      }

      if (collectiveToast) {
        io.to(p.hallId).emit('toast:effect', {
          pos: p.position,
          message: '🥂 Cụng ly chung thành công! (+3 💗)',
        });
      }
    } else if (actionType === 'kiss') {
      p.chatBubble = { text: '😘 Gửi triệu trái tim tới Duy & Tâm!', expiresAt: now + 4000 };
      io.to(p.hallId).emit('kiss:effect', { fromId: socket.id, position: p.position });
    }

    io.to(p.hallId).emit('player:action', { id: socket.id, action: actionType });
  });

  // Seat: take seat
  socket.on('seat:take', (data: { tableIndex: number; seatIndex: number }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const hallSeats = storedData.seats[p.hallId] || (storedData.seats[p.hallId] = {});
    const seatKey = `${data.tableIndex}_${data.seatIndex}`;

    // If seat taken by someone else
    if (hallSeats[seatKey] && hallSeats[seatKey].uid !== p.uid) {
      socket.emit('toast', { type: 'info', message: 'Ghế này đã có người ngồi!' });
      return;
    }

    hallSeats[seatKey] = { uid: p.uid, name: p.name };
    p.seatedAt = { tableIndex: data.tableIndex, seatIndex: data.seatIndex };
    p.action = 'sit';

    io.to(p.hallId).emit('seat:update', { hallId: p.hallId, seats: hallSeats });
    io.to(p.hallId).emit('player:seated', { id: socket.id, tableIndex: data.tableIndex, seatIndex: data.seatIndex });
  });

  // Chat message
  socket.on('chat', (message: string) => {
    const now = Date.now();
    const lastChat = lastChatTimes.get(socket.id) || 0;
    if (now - lastChat < 600) return; // 0.6s rate limit
    lastChatTimes.set(socket.id, now);

    const clean = sanitizeText(message, 150);
    if (!clean) return;

    const p = players.get(socket.id);
    if (!p) return;

    p.chatBubble = { text: clean, expiresAt: now + 6000 };

    io.to(p.hallId).emit('chat:message', {
      id: socket.id,
      uid: p.uid,
      name: p.name,
      group: p.group,
      text: clean,
      time: now,
    });
  });

  // Submit Wedding Wish
  socket.on('wish:add', (data: { content: string; icon?: '💐' | '💍' | '🎉' }) => {
    const p = players.get(socket.id);
    if (!p) return;

    const now = Date.now();
    const lastWish = lastWishTimes.get(p.uid) || 0;
    if (now - lastWish < 120000) {
      // 2 mins limit
      socket.emit('toast', { type: 'warning', message: 'Bạn vừa gửi lời chúc rồi, hãy chờ một chút nhé!' });
      return;
    }
    lastWishTimes.set(p.uid, now);

    const cleanContent = sanitizeText(data.content, 200);
    if (!cleanContent) return;

    const newWish: WishItem = {
      id: 'wish_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      uid: p.uid,
      author: p.name,
      group: p.group,
      content: cleanContent,
      icon: data.icon || '💐',
      hallId: p.hallId,
      createdAt: now,
    };

    storedData.wishes.push(newWish);

    // Reward points for wishing
    const u = storedData.users[p.uid];
    if (u) {
      u.cumulativeScore += 5;
      u.availableScore += 5;
      socket.emit('score:updated', { cumulativeScore: u.cumulativeScore, availableScore: u.availableScore });
      sendBackup(socket, u);
    }

    // Add to all halls with separate addWish (never clearing old wishes)
    io.emit('wish:new', newWish);
    io.emit('toast:global', {
      type: 'wish',
      message: `💌 ${p.name} vừa gửi lời chúc: "${cleanContent.slice(0, 60)}..."`,
    });
    io.emit('leaderboard:update', getLeaderboard().slice(0, 10));
  });

  // Shop: Purchase and gift flower
  socket.on('shop:gift_flower', (flowerId: string) => {
    const p = players.get(socket.id);
    if (!p) return;
    const u = storedData.users[p.uid];
    if (!u) return;

    const item = ALL_SHOP_ITEMS.find((i) => i.id === flowerId && i.category === 'flower');
    if (!item) return;

    if (u.availableScore < item.price) {
      socket.emit('toast', { type: 'error', message: 'Bạn chưa đủ điểm Hỷ 💗 để tặng món này!' });
      return;
    }

    // Deduct available score (cumulative score stays intact!)
    u.availableScore -= item.price;

    // Stage coordinates: [x, 1.2, -18]
    // Generate flower position on or around stage
    const hallFlowers = storedData.flowers.filter((f) => f.hallId === p.hallId);
    if (hallFlowers.length >= 60) {
      // Remove oldest in this hall
      const oldestIdx = storedData.flowers.findIndex((f) => f.hallId === p.hallId);
      if (oldestIdx !== -1) storedData.flowers.splice(oldestIdx, 1);
    }

    const stageSlot = hallFlowers.length % 20;
    const row = Math.floor(stageSlot / 10);
    const col = stageSlot % 10;
    const posX = -4.5 + col * 1.0 + (Math.random() - 0.5) * 0.2;
    const posZ = -15.5 + row * 0.8;

    const newFlower: FlowerGift = {
      id: 'flw_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      uid: p.uid,
      author: p.name,
      flowerType: item.id as any,
      flowerName: item.name,
      position: [posX, 1.25, posZ],
      hallId: p.hallId,
      createdAt: Date.now(),
      expiresAt: Date.now() + 30 * 60 * 1000, // 30 minutes
    };

    storedData.flowers.push(newFlower);

    // Notify user of new score
    socket.emit('score:updated', { cumulativeScore: u.cumulativeScore, availableScore: u.availableScore });
    sendBackup(socket, u);

    // Broadcast new flower item ONLY (using addFlower, not wiping old ones)
    io.to(p.hallId).emit('flower:new', newFlower);
    io.emit('toast:global', {
      type: 'flower',
      message: `💐 ${p.name} vừa tặng "${item.name}" lên sân khấu cho Duy & Tâm!`,
    });
  });

  // Shop: Purchase outfit/accessory
  socket.on('shop:buy_outfit', (itemId: string) => {
    const p = players.get(socket.id);
    if (!p) return;
    const u = storedData.users[p.uid];
    if (!u) return;

    const item = ALL_SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return;

    if (u.purchasedItems.includes(itemId)) {
      socket.emit('toast', { type: 'info', message: 'Bạn đã sở hữu trang phục này rồi!' });
      return;
    }

    if (u.availableScore < item.price) {
      socket.emit('toast', { type: 'error', message: 'Không đủ điểm Hỷ để mua trang phục này!' });
      return;
    }

    u.availableScore -= item.price;
    u.purchasedItems.push(itemId);

    // Automatically equip
    if (item.category === 'outfit') {
      u.equippedOutfit = itemId;
      p.outfit = itemId;
    } else if (item.category === 'accessory') {
      if (!u.equippedAccessories.includes(itemId)) {
        u.equippedAccessories.push(itemId);
      }
      p.accessories = [...u.equippedAccessories];
    }

    socket.emit('score:updated', { cumulativeScore: u.cumulativeScore, availableScore: u.availableScore });

    sendBackup(socket, u);
    socket.emit('profile:updated', { user: u });
    sendBackup(socket, u);
    io.to(p.hallId).emit('player:outfit_updated', {
      id: socket.id,
      outfit: p.outfit,
      accessories: p.accessories,
    });
  });

  // Equip / unequip owned item
  socket.on('shop:equip', (itemId: string) => {
    const p = players.get(socket.id);
    if (!p) return;
    const u = storedData.users[p.uid];
    if (!u) return;

    const item = ALL_SHOP_ITEMS.find((i) => i.id === itemId);
    if (!item) return;

    if (item.price > 0 && !u.purchasedItems.includes(itemId)) {
      socket.emit('toast', { type: 'error', message: 'Bạn chưa mua món đồ này!' });
      return;
    }

    if (item.category === 'outfit') {
      u.equippedOutfit = itemId;
      p.outfit = itemId;
    } else if (item.category === 'accessory') {
      if (u.equippedAccessories.includes(itemId)) {
        u.equippedAccessories = u.equippedAccessories.filter((id) => id !== itemId);
      } else {
        u.equippedAccessories.push(itemId);
      }
      p.accessories = [...u.equippedAccessories];
    }

    socket.emit('profile:updated', { user: u });

    sendBackup(socket, u);
    io.to(p.hallId).emit('player:outfit_updated', {
      id: socket.id,
      outfit: p.outfit,
      accessories: p.accessories,
    });
  });

  // Update profile in-game without reload
  socket.on('profile:update', (data: { name?: string; group?: string; gender?: string; hairStyle?: number; hairColor?: string }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const u = storedData.users[p.uid];
    if (!u) return;

    if (data.name) {
      const clean = sanitizeText(data.name, 40);
      if (clean) {
        u.name = clean;
        p.name = clean;
      }
    }
    if (data.group) {
      u.group = data.group as any;
      p.group = data.group as any;
    }
    if (data.gender) {
      u.gender = data.gender as any;
      p.gender = data.gender as any;
    }
    if (data.hairStyle !== undefined) {
      u.hairStyle = data.hairStyle;
      p.hairStyle = data.hairStyle;
    }
    if (data.hairColor) {
      u.hairColor = data.hairColor;
      p.hairColor = data.hairColor;
    }

    socket.emit('profile:updated', { user: u });

    sendBackup(socket, u);
    io.to(p.hallId).emit('player:profile_updated', {
      id: socket.id,
      name: p.name,
      group: p.group,
      gender: p.gender,
      hairStyle: p.hairStyle,
      hairColor: p.hairColor,
    });
  });

  // Mini-Games score submissions with server validation
  socket.on('game:submit', (data: { game: string; score: number; details?: any }) => {
    const p = players.get(socket.id);
    if (!p) return;
    const u = storedData.users[p.uid];
    if (!u) return;

    const today = new Date().toISOString().slice(0, 10);
    const gameRecord = u.todayScores[data.game] || { date: today, score: 0 };
    if (gameRecord.date !== today) {
      gameRecord.date = today;
      gameRecord.score = 0;
    }

    // Daily cap 100 points per game to prevent farming
    const remainingCap = Math.max(0, 100 - gameRecord.score);
    if (remainingCap <= 0) {
      socket.emit('toast', { type: 'info', message: 'Bạn đã đạt giới hạn điểm hôm nay cho trò chơi này!' });
      return;
    }

    let earnedScore = Math.min(Math.max(0, data.score), remainingCap);

    // Validate jigsaw game results
    if (data.game === 'jigsaw') {
      const gridSize = data.details?.gridSize || 3;
      const basePoints = gridSize === 3 ? 10 : gridSize === 4 ? 20 : 35;
      const elapsed = data.details?.time || 60;
      const speedBonus = elapsed < 30 ? 10 : elapsed < 60 ? 5 : 0;
      earnedScore = Math.min(basePoints + speedBonus, remainingCap);
      if (!u.jigsawBestTime || elapsed < u.jigsawBestTime) {
        u.jigsawBestTime = elapsed;
      }
    } else if (data.game === 'quiz') {
      const correctCount = Math.min(10, Math.max(0, data.details?.correctCount || 0));
      earnedScore = Math.min(correctCount * 5, remainingCap);
      if (!u.quizBestScore || earnedScore > u.quizBestScore) {
        u.quizBestScore = earnedScore;
      }
    } else if (data.game === 'cards') {
      const moves = data.details?.moves || 20;
      const earned = moves <= 12 ? 25 : moves <= 18 ? 15 : 10;
      earnedScore = Math.min(earned, remainingCap);
    } else if (data.game === 'hearts') {
      earnedScore = Math.min(Math.min(15, data.score), remainingCap);
    }

    gameRecord.score += earnedScore;
    u.todayScores[data.game] = gameRecord;
    u.cumulativeScore += earnedScore;
    u.availableScore += earnedScore;

    socket.emit('score:updated', { cumulativeScore: u.cumulativeScore, availableScore: u.availableScore });

    sendBackup(socket, u);
    socket.emit('toast', { type: 'success', message: `🎉 Tuyệt vời! Bạn nhận được +${earnedScore} 💗 điểm Hỷ!` });

    // Broadcast top 10 if rank updated
    io.emit('leaderboard:update', getLeaderboard().slice(0, 10));
  });

  // Handle Disconnection
  socket.on('disconnect', () => {
    const p = players.get(socket.id);
    if (p) {
      const hallId = p.hallId;
      // Free seat
      if (p.seatedAt && storedData.seats[hallId]) {
        const seatKey = `${p.seatedAt.tableIndex}_${p.seatedAt.seatIndex}`;
        delete storedData.seats[hallId][seatKey];
        io.to(hallId).emit('seat:update', { hallId, seats: storedData.seats[hallId] });
      }

      // Reconnection grace hold: 30 seconds
      const timer = setTimeout(() => {
        disconnectedUids.delete(p.uid);
      }, 30000);
      disconnectedUids.set(p.uid, { timer, hallId, lastState: p });

      players.delete(socket.id);
      socketToUid.delete(socket.id);
      if (uidToSocket.get(p.uid) === socket.id) {
        uidToSocket.delete(p.uid);
      }

      socket.to(hallId).emit('player:left', socket.id);
      checkDynamicHalls();
      io.emit('halls:list', getHallsList());

      // Check if queue has waiting guests
      if (waitingQueue.length > 0) {
        const next = waitingQueue.shift()!;
        const assigned = findBestHall(next.preferredHall);
        if (assigned) {
          io.to(next.socketId).emit('queue:ready', { hallId: assigned });
        } else {
          waitingQueue.unshift(next);
        }
      }
    }
  });
});

// Periodic state broadcast (every 80ms, volatile to ensure smooth interpolation without backlog)
setInterval(() => {
  for (const hallId of hallsMap.keys()) {
    const hallPlayers = Array.from(players.values()).filter((p) => p.hallId === hallId);
    if (hallPlayers.length > 0) {
      io.to(hallId).volatile.emit('state', hallPlayers);
    }
  }
}, 80);

// REST APIs
app.get('/health', (req, res) => {
  res.json({
    ok: true,
    uptime: process.uptime(),
    players: players.size,
    halls: getHallPlayerCounts(),
    queue: waitingQueue.length,
    video: videoHealthStatus,
  });
});

app.get('/api/wedding-config', (req, res) => {
  res.json(weddingConfig);
});

// Ảnh cưới chính thức nằm ở public/media/photos (đi kèm bản build).
// Ảnh khách ghép ở Photo Booth lưu trong DATA_DIR/guest-photos để không mất khi chạy bản production (dist/).
const GUEST_PHOTO_DIR = path.join(DATA_DIR, 'guest-photos');
if (!fs.existsSync(GUEST_PHOTO_DIR)) fs.mkdirSync(GUEST_PHOTO_DIR, { recursive: true });
app.use('/media/guest', express.static(GUEST_PHOTO_DIR, { maxAge: '7d' }));

function listWeddingPhotos(): string[] {
  const photosDir = path.join(__dirname, 'public', 'media', 'photos');
  if (!fs.existsSync(photosDir)) return [];
  return fs
    .readdirSync(photosDir)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()
    .map((f) => `/media/photos/${f}`);
}

function listGuestPhotos(): string[] {
  if (!fs.existsSync(GUEST_PHOTO_DIR)) return [];
  return fs
    .readdirSync(GUEST_PHOTO_DIR)
    .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
    .sort()
    .reverse()
    .slice(0, 30)
    .map((f) => `/media/guest/${f}`);
}

app.get('/api/media/photos', (req, res) => {
  res.json([...listWeddingPhotos(), ...listGuestPhotos()]);
});

// Photo Booth Upload: lưu ảnh ghép của khách & phát cho mọi người
const lastUploadByIp = new Map<string, number>();
app.post('/api/media/photos/upload', (req, res) => {
  const { dataUrl, title } = req.body;
  if (!dataUrl || typeof dataUrl !== 'string') {
    res.status(400).json({ error: 'Dữ liệu ảnh không hợp lệ!' });
    return;
  }
  // Chỉ nhận ảnh raster (không nhận SVG để tránh chèn mã)
  const matches = dataUrl.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!matches) {
    res.status(400).json({ error: 'Chỉ nhận ảnh PNG, JPG hoặc WEBP!' });
    return;
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '');
  const now = Date.now();
  if (now - (lastUploadByIp.get(ip) || 0) < 15000) {
    res.status(429).json({ error: 'Bạn vừa gửi ảnh, đợi vài giây rồi gửi lại nhé!' });
    return;
  }

  try {
    const buffer = Buffer.from(matches[2], 'base64');
    if (buffer.length > 6 * 1024 * 1024) {
      res.status(413).json({ error: 'Ảnh quá lớn (tối đa 6MB)!' });
      return;
    }
    lastUploadByIp.set(ip, now);
    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const filename = `guest_${now}.${ext}`;
    fs.writeFileSync(path.join(GUEST_PHOTO_DIR, filename), buffer);

    // Giữ tối đa 60 ảnh khách để không đầy ổ đĩa
    const all = fs.readdirSync(GUEST_PHOTO_DIR).filter((f) => f.startsWith('guest_')).sort();
    all.slice(0, Math.max(0, all.length - 60)).forEach((f) => {
      try { fs.unlinkSync(path.join(GUEST_PHOTO_DIR, f)); } catch {}
    });

    const publicUrl = `/media/guest/${filename}`;
    const photoTitle = sanitizeText(title || 'Kỷ Niệm Cưới · Hoàng Duy ♥ Thiều Tâm', 40);

    io.emit('photo:new', { url: publicUrl, title: photoTitle });
    console.log(`[PhotoBooth] New photo saved: ${publicUrl}`);

    res.json({ ok: true, url: publicUrl, title: photoTitle });
  } catch (err) {
    console.error('Error saving uploaded photo:', err);
    res.status(500).json({ error: 'Lỗi khi lưu ảnh lên máy chủ!' });
  }
});

// List available face cutouts
app.get('/api/media/cutouts', (req, res) => {
  const cutoutsDir = path.join(__dirname, 'public', 'media', 'cutouts');
  if (fs.existsSync(cutoutsDir)) {
    const files = fs
      .readdirSync(cutoutsDir)
      .filter((f) => /\.(jpg|jpeg|png|webp|svg)$/i.test(f))
      .map((f) => ({
        id: path.basename(f, path.extname(f)),
        label: path.basename(f, path.extname(f)).replace(/[-_]/g, ' '),
        url: `/media/cutouts/${f}`,
      }));
    res.json(files);
  } else {
    res.json([]);
  }
});

app.get('/api/media/videos', (req, res) => {
  const vidDir = path.join(__dirname, 'public', 'media', 'video');
  if (fs.existsSync(vidDir)) {
    const files = fs
      .readdirSync(vidDir)
      .filter((f) => /\.(mp4|webm)$/i.test(f))
      .map((f) => `/media/video/${f}`);
    res.json(files);
  } else {
    res.json([]);
  }
});

app.get('/api/music', (req, res) => {
  const musicDir = path.join(__dirname, 'public', 'music');
  if (fs.existsSync(musicDir)) {
    const files = fs
      .readdirSync(musicDir)
      .filter((f) => /\.(mp3|ogg|wav|m4a)$/i.test(f))
      .map((f) => ({
        title: path.basename(f, path.extname(f)).replace(/[-_]/g, ' '),
        url: `/music/${f}`,
      }));
    res.json(files);
  } else {
    res.json([]);
  }
});

app.get('/api/wishes', (req, res) => {
  res.json(storedData.wishes);
});

// CSV Export for wedding wishes
app.get('/api/wishes/export.csv', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="loi-chuc-cuoi-duy-tam.csv"');
  let csv = '\uFEFF"STT","Thời gian","Người gửi","Nhóm khách","Lời chúc","Biểu tượng"\n';
  storedData.wishes.forEach((w, idx) => {
    const dateStr = new Date(w.createdAt).toLocaleString('vi-VN');
    const author = (w.author || '').replace(/"/g, '""');
    const groupName = w.group === 'groom' ? 'Nhà trai' : w.group === 'bride' ? 'Nhà gái' : 'Bạn bè';
    const content = (w.content || '').replace(/"/g, '""');
    csv += `"${idx + 1}","${dateStr}","${author}","${groupName}","${content}","${w.icon || '💐'}"\n`;
  });
  res.send(csv);
});

// Admin verify & controls
app.post('/api/admin/verify', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true });
  } else {
    res.status(401).json({ ok: false, error: 'Mật khẩu quản trị không đúng!' });
  }
});

app.post('/api/admin/action', (req, res) => {
  const { password, action, payload } = req.body;
  if (password !== ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (action === 'toss_bouquet') {
    triggerBouquetToss(payload?.hallId);
    res.json({ ok: true, message: 'Đã tung hoa cưới!' });
  } else if (action === 'reset_video') {
    videoStartTime = Date.now();
    io.emit('video:sync', { videoTime: 0 });
    res.json({ ok: true, message: 'Đã phát lại video cưới từ đầu!' });
  } else if (action === 'fireworks') {
    io.emit('fireworks:launch');
    res.json({ ok: true, message: 'Đã bắn pháo hoa toàn sảnh!' });
  } else if (action === 'delete_wish') {
    const wishId = payload?.wishId;
    storedData.wishes = storedData.wishes.filter((w) => w.id !== wishId);
    io.emit('wishes:sync', storedData.wishes);
    res.json({ ok: true, message: 'Đã xoá lời chúc' });
  } else if (action === 'announce_winner') {
    const top3 = getLeaderboard().slice(0, 3);
    io.emit('toast:global', {
      type: 'winner',
      message: `🏆 Vinh danh TOP 3 Điểm Hỷ xuất sắc: 🥇 ${top3[0]?.name || ''} · 🥈 ${top3[1]?.name || ''} · 🥉 ${top3[2]?.name || ''}!`,
    });
    io.emit('fireworks:launch');
    res.json({ ok: true, top3 });
  } else if (action === 'list_users') {
    // Danh sách toàn bộ khách (kể cả đã rời tiệc) để admin cộng / trừ điểm
    const online = new Set(Array.from(players.values()).map((p) => p.uid));
    const users = Object.values(storedData.users)
      .map((u) => ({
        uid: u.uid,
        name: u.name,
        group: u.group,
        cumulativeScore: u.cumulativeScore,
        availableScore: u.availableScore,
        isOnline: online.has(u.uid),
      }))
      .sort((a, b) => Number(b.isOnline) - Number(a.isOnline) || b.cumulativeScore - a.cumulativeScore);
    res.json({ ok: true, users });
  } else if (action === 'adjust_score') {
    // Admin cộng (số dương) hoặc trừ (số âm) điểm Hỷ cho 1 khách, không bị giới hạn điểm/ngày của trò chơi
    const uid = typeof payload?.uid === 'string' ? payload.uid : '';
    const delta = Math.trunc(Number(payload?.delta));
    const u = storedData.users[uid];
    if (!u) {
      res.status(404).json({ error: 'Không tìm thấy khách này' });
      return;
    }
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) {
      res.status(400).json({ error: 'Số điểm không hợp lệ (từ -100000 đến 100000, khác 0)' });
      return;
    }
    const reason = sanitizeText(typeof payload?.reason === 'string' ? payload.reason : '', 80);
    u.cumulativeScore = Math.max(0, u.cumulativeScore + delta);
    u.availableScore = Math.max(0, Math.min(u.cumulativeScore, u.availableScore + delta));
    saveDatabase();
    console.log(`[Admin] ${delta > 0 ? '+' : ''}${delta} điểm cho ${u.name} (${uid}) -> ${u.cumulativeScore}${reason ? ` | ${reason}` : ''}`);

    // Báo ngay cho khách nếu đang online (có thể mở nhiều tab)
    for (const [sid, p] of players) {
      if (p.uid !== uid) continue;
      const s = io.sockets.sockets.get(sid);
      if (!s) continue;
      s.emit('score:updated', { cumulativeScore: u.cumulativeScore, availableScore: u.availableScore });
      sendBackup(s, u);
      s.emit('toast', {
        type: delta > 0 ? 'success' : 'info',
        message:
          delta > 0
            ? `🎁 Cô dâu chú rể tặng bạn +${delta} 💗 điểm Hỷ!${reason ? ` (${reason})` : ''}`
            : `Điểm Hỷ của bạn được điều chỉnh ${delta} 💗${reason ? ` (${reason})` : ''}`,
      });
    }
    io.emit('leaderboard:update', getLeaderboard().slice(0, 10));
    res.json({
      ok: true,
      message: `Đã ${delta > 0 ? 'cộng' : 'trừ'} ${Math.abs(delta)} điểm cho ${u.name} (còn ${u.cumulativeScore} điểm)`,
      user: { uid: u.uid, cumulativeScore: u.cumulativeScore, availableScore: u.availableScore },
    });
  } else {
    res.status(400).json({ error: 'Unknown action' });
  }
});

// Vite middleware in dev or static files in production
async function setupViteOrStatic() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}

setupViteOrStatic().then(() => {
  httpServer.listen(PORT, HOST, () => {
    console.log(`💒 Tiệc Cưới Online Duy ♥ Tâm server running at http://${HOST}:${PORT}`);
    startKeepAlive();
  });
});

// ---------- Giữ server luôn thức (Render bản miễn phí ngủ sau 15 phút không có ai truy cập) ----------
// Cứ 10 phút server tự gọi vào địa chỉ public của chính nó (đi qua Render nên được tính là có người truy cập).
// Render tự cung cấp RENDER_EXTERNAL_URL; có thể đặt KEEP_ALIVE_URL để chỉ định địa chỉ khác.
// Tắt bằng biến môi trường KEEP_ALIVE=off (vd: khi đã lên gói trả phí).
function startKeepAlive() {
  const base = (process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, '');
  if (!base || process.env.KEEP_ALIVE === 'off') return;
  const url = `${base}/health`;
  const ping = async () => {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'wedding-keep-alive' }, signal: AbortSignal.timeout(20000) });
      if (!res.ok) console.warn(`[KeepAlive] ${url} -> ${res.status}`);
    } catch (e: any) {
      console.warn(`[KeepAlive] Không gọi được ${url}: ${e?.message || e}`);
    }
  };
  setInterval(ping, 10 * 60 * 1000);
  console.log(`[KeepAlive] Tự gọi ${url} mỗi 10 phút để server không ngủ`);
}

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Saving database and closing server...');
  saveDatabase();
  httpServer.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received. Saving database and closing server...');
  saveDatabase();
  httpServer.close(() => {
    process.exit(0);
  });
});
