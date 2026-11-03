import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';
import confetti from 'canvas-confetti';
import { WeddingHall3D } from './scene/hall3D.js';
import { Character3D } from './scene/character3D.js';
import { soundManager } from './audio/soundManager.js';
import { WaitingLobby } from './components/WaitingLobby.js';
import { HUD } from './components/HUD.js';
import { VirtualJoystick } from './components/VirtualJoystick.js';
import { GuestbookModal } from './components/GuestbookModal.js';
import { ShopModal } from './components/ShopModal.js';
import { LeaderboardModal } from './components/LeaderboardModal.js';
import { GamesModal } from './components/GamesModal.js';
import { PhotoSlideshowModal } from './components/PhotoSlideshowModal.js';
import { VideoModal } from './components/VideoModal.js';
import { WeddingPhotoBoothModal } from './components/WeddingPhotoBoothModal.js';
import { ProfileEditModal } from './components/ProfileEditModal.js';
import { AdminModal } from './components/AdminModal.js';
import type {
  PlayerState,
  UserData,
  HallInfo,
  WishItem,
  FlowerGift,
  LeaderboardEntry,
  WeddingConfig,
  PlayerAction,
  GuestGroup,
  Gender,
} from './shared/types.js';

export function App() {
  const [config, setConfig] = useState<WeddingConfig | null>(null);
  const [inLobby, setInLobby] = useState(true);
  const [hallsList, setHallsList] = useState<HallInfo[]>([]);
  const [currentHall, setCurrentHall] = useState<HallInfo | null>(null);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [countdownText, setCountdownText] = useState('');
  const [isNight, setIsNight] = useState(false);
  const [nearVideo, setNearVideo] = useState(false);
  const [videoAudioOn, setVideoAudioOn] = useState(false);
  const [activePrompt, setActivePrompt] = useState<string | null>(null);
  const [debugStats, setDebugStats] = useState<{ fps: number; drawCalls: number } | undefined>(undefined);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modals
  const [showGuestbook, setShowGuestbook] = useState(false);
  const [showShop, setShowShop] = useState(false);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [showGames, setShowGames] = useState<string | null>(null);
  const [showPhotoSlideshow, setShowPhotoSlideshow] = useState<number | null>(null);
  const [showPhotoBooth, setShowPhotoBooth] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  // Persistent data
  const [wishes, setWishes] = useState<WishItem[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [chatMessages, setChatMessages] = useState<Array<{ name: string; text: string; group: string; time: number }>>([]);

  // Refs for 3D & Socket
  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const hall3DRef = useRef<WeddingHall3D | null>(null);
  const localCharRef = useRef<Character3D | null>(null);
  const remoteCharsRef = useRef<Map<string, Character3D>>(new Map());

  // Input & Camera controls
  const keysDown = useRef<Record<string, boolean>>({});
  const joystickVector = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const isMouseDown = useRef(false);
  const mousePrev = useRef({ x: 0, y: 0 });
  const cameraAngle = useRef({ yaw: 0, pitch: 0.22, distance: 5.5 });
  const autoWalkTarget = useRef<THREE.Vector3 | null>(null);
  // Ghế đang đi tới (chỉ giữ ghế khi đã tới nơi)
  const pendingSeat = useRef<{ tableIndex: number; seatIndex: number; position: THREE.Vector3; lookAt: THREE.Vector3 } | null>(null);
  const autoWalkStart = useRef(0);
  const actionStartedAt = useRef(0);
  // Giá trị UI cập nhật từ vòng lặp 3D: so sánh trước khi setState để không render lại 60 lần/giây
  const uiCache = useRef<{ nearVideo: boolean; prompt: string | null }>({ nearVideo: false, prompt: null });
  const isMobile = useRef(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));

  // Get or initialize persistent uid
  const getUid = () => {
    let uid = localStorage.getItem('wedding_guest_uid');
    if (!uid) {
      uid = 'usr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
      localStorage.setItem('wedding_guest_uid', uid);
    }
    return uid;
  };

  // 1. Initial Data Fetching
  useEffect(() => {
    // Check URL params for debug
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      setDebugStats({ fps: 60, drawCalls: 120 });
    }

    // Load config
    fetch('/api/wedding-config')
      .then((r) => r.json())
      .then((data) => {
        setConfig(data);
        const initialHalls: HallInfo[] = (data.halls || []).map((h: any) => ({
          id: h.id,
          name: h.name,
          theme: h.theme,
          playerCount: 1,
          maxPlayers: 50,
        }));
        setHallsList(initialHalls);
      })
      .catch(() => {});

    // Load photos
    fetch('/api/media/photos')
      .then((r) => r.json())
      .then((list) => {
        if (list && list.length > 0) setPhotos(list);
        else {
          setPhotos([
            '/media/photos/photo1.svg',
            '/media/photos/photo2.svg',
            '/media/photos/photo3.svg',
            '/media/photos/photo4.svg',
          ]);
        }
      })
      .catch(() => {});

    // Load wishes
    fetch('/api/wishes')
      .then((r) => r.json())
      .then((list) => setWishes(list))
      .catch(() => {});

    // Load music playlist
    fetch('/api/music')
      .then((r) => r.json())
      .then((tracks) => soundManager.setPlaylist(tracks))
      .catch(() => {});
  }, []);

  // Toast banner helper
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 5000);
  };

  // 2. Socket.IO Connection Setup
  useEffect(() => {
    const socket = io({
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });
    socketRef.current = socket;

    socket.on('halls:list', (list: HallInfo[]) => {
      setHallsList(list);
    });

    socket.on('joined', (data: any) => {
      setUserData(data.user);
      setCurrentHall(data.hall);
      setWishes(data.wishes || []);
      setLeaderboard(data.leaderboard || []);
      setInLobby(false);

      // Start music after user entered (autoplay compliant)
      soundManager.playMusic();

      // Initialize 3D Hall Scene
      if (containerRef.current && config) {
        if (hall3DRef.current) hall3DRef.current.dispose();

        const hallScene = new WeddingHall3D(
          containerRef.current,
          data.hall.theme,
          config
        );
        hall3DRef.current = hallScene;

        // Synchronize initial flowers using separate syncFlowers
        hallScene.syncFlowers(data.flowers || []);

        // Create local player character
        const localChar = new Character3D(data.self, true);
        hallScene.scene.add(localChar.group);
        localCharRef.current = localChar;

        // Populate other players
        (data.players || []).forEach((p: PlayerState) => {
          if (p.id !== data.self.id) {
            const remoteChar = new Character3D(p, false);
            hallScene.scene.add(remoteChar.group);
            remoteCharsRef.current.set(p.id, remoteChar);
          }
        });
      }
    });

    socket.on('player:joined', (p: PlayerState) => {
      if (hall3DRef.current && p.id !== socket.id) {
        if (!remoteCharsRef.current.has(p.id)) {
          const remoteChar = new Character3D(p, false);
          hall3DRef.current.scene.add(remoteChar.group);
          remoteCharsRef.current.set(p.id, remoteChar);
        }
      }
    });

    socket.on('player:left', (id: string) => {
      if (hall3DRef.current && remoteCharsRef.current.has(id)) {
        const char = remoteCharsRef.current.get(id)!;
        hall3DRef.current.scene.remove(char.group);
        char.dispose();
        remoteCharsRef.current.delete(id);
      }
    });

    // High frequency state updates
    socket.on('state', (serverPlayers: PlayerState[]) => {
      serverPlayers.forEach((p) => {
        if (p.id !== socket.id && remoteCharsRef.current.has(p.id)) {
          remoteCharsRef.current.get(p.id)!.updateState(p);
        }
      });
    });

    socket.on('flower:new', (flw: FlowerGift) => {
      // Use separate addFlower method without clearing old flowers!
      if (hall3DRef.current) {
        hall3DRef.current.addFlower(flw);
        hall3DRef.current.triggerNPCThank();
      }
      soundManager.playPointsDing();
    });

    socket.on('flowers:sync', (flws: FlowerGift[]) => {
      if (hall3DRef.current) {
        hall3DRef.current.syncFlowers(flws);
      }
    });

    socket.on('wish:new', (wish: WishItem) => {
      setWishes((prev) => [...prev, wish]);
      soundManager.playPointsDing();
    });

    socket.on('wishes:sync', (allWishes: WishItem[]) => {
      setWishes(allWishes);
    });

    socket.on('photo:new', (newPhoto: { url: string; title: string }) => {
      setPhotos((prev) => [newPhoto.url, ...prev]);
      showToast(`📸 ${newPhoto.title} vừa được treo lên sảnh tiệc!`);
    });

    socket.on('chat:message', (msg: any) => {
      setChatMessages((prev) => [...prev.slice(-30), msg]);
      if (hall3DRef.current) {
        const char = msg.id === socket.id ? localCharRef.current : remoteCharsRef.current.get(msg.id);
        if (char) char.setChatBubble(msg.text);
      }
    });

    socket.on('player:action', (data: { id: string; action: PlayerAction }) => {
      const char = data.id === socket.id ? localCharRef.current : remoteCharsRef.current.get(data.id);
      if (char) char.updateState({ action: data.action });
    });

    socket.on('player:toast', () => {
      soundManager.playToastCheers();
    });

    socket.on('toast:effect', (data: { message: string }) => {
      soundManager.playToastCheers();
      confetti({ particleCount: 50, spread: 60 });
      showToast(data.message);
    });

    socket.on('toast:global', (data: { message: string }) => {
      showToast(data.message);
    });

    socket.on('fireworks:launch', () => {
      soundManager.playConfettiPop();
      confetti({ particleCount: 150, spread: 100, origin: { y: 0.4 } });
    });

    socket.on('bouquet:start', () => {
      showToast('💐 Cô dâu Thiều Tâm chuẩn bị tung hoa cưới! Hãy chạy nhanh về phía sân khấu!');
    });

    socket.on('bouquet:caught', (data: any) => {
      if (data.winnerName) {
        soundManager.playApplause();
        confetti({ particleCount: 100, spread: 80 });
      }
    });

    socket.on('score:updated', (data: { cumulativeScore: number; availableScore: number }) => {
      setUserData((prev) => (prev ? { ...prev, ...data } : null));
    });

    // Đổi trang phục / tên / kiểu tóc: cập nhật ngay nhân vật (cả của mình lẫn người khác)
    const applyLook = (data: { id: string } & Partial<PlayerState>) => {
      const char = data.id === socket.id ? localCharRef.current : remoteCharsRef.current.get(data.id);
      if (!char) return;
      const { id: _id, ...look } = data;
      char.updateState(look);
    };
    socket.on('player:outfit_updated', applyLook);
    socket.on('player:profile_updated', applyLook);

    socket.on('profile:updated', (data: { user: UserData }) => {
      setUserData(data.user);
    });

    socket.on('leaderboard:update', (lb: LeaderboardEntry[]) => {
      setLeaderboard(lb);
      if (hall3DRef.current) {
        hall3DRef.current.updateLeaderboardTexture(lb);
      }
    });

    socket.on('toast', (data: { message: string }) => {
      showToast(data.message);
    });

    return () => {
      socket.disconnect();
    };
  }, [config]);

  // 3. User Joins Room from Lobby
  const handleJoinLobby = (data: {
    name: string;
    group: GuestGroup;
    gender: Gender;
    hairStyle: number;
    hairColor: string;
    outfit: string;
    preferredHall: string;
  }) => {
    if (!socketRef.current) return;
    socketRef.current.emit('join', {
      uid: getUid(),
      name: data.name,
      group: data.group,
      gender: data.gender,
      hairStyle: data.hairStyle,
      hairColor: data.hairColor,
      outfit: data.outfit,
      preferredHall: data.preferredHall,
    });
  };

  // 4. Switch Hall on the fly without reload
  const handleSwitchHall = (targetHallId: string) => {
    if (!socketRef.current) return;
    // Clear remote characters
    if (hall3DRef.current) {
      remoteCharsRef.current.forEach((char) => {
        hall3DRef.current!.scene.remove(char.group);
        char.dispose();
      });
      remoteCharsRef.current.clear();
    }
    socketRef.current.emit('hall:switch', targetHallId);
  };

  // 5. User Input Listeners (Keyboard & Mouse)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      keysDown.current[e.code] = true;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        autoWalkTarget.current = null; // tự di chuyển thì huỷ đi tới ghế
        pendingSeat.current = null;
      }

      if (e.code === 'KeyE') {
        handleInteractWithNearest();
      } else if (e.code === 'Enter') {
        const input = document.querySelector('input[placeholder*="chat"]') as HTMLInputElement;
        if (input) input.focus();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysDown.current[e.code] = false;
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown.current = true;
        mousePrev.current = { x: e.clientX, y: e.clientY };
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (isMouseDown.current) {
        const dx = e.clientX - mousePrev.current.x;
        const dy = e.clientY - mousePrev.current.y;
        mousePrev.current = { x: e.clientX, y: e.clientY };

        cameraAngle.current.yaw -= dx * 0.005;
        cameraAngle.current.pitch = Math.max(0.05, Math.min(1.2, cameraAngle.current.pitch + dy * 0.005));
      }
    };

    const onMouseUp = () => {
      isMouseDown.current = false;
    };

    const onWheel = (e: WheelEvent) => {
      cameraAngle.current.distance = Math.max(3.5, Math.min(18, cameraAngle.current.distance + e.deltaY * 0.01));
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  // 6. Proximity Check & Interactive Prompt Trigger
  const handleInteractWithNearest = () => {
    if (!localCharRef.current || !hall3DRef.current) return;
    const pPos = localCharRef.current.group.position;

    // 1. Reception / Guestbook
    if (pPos.distanceTo(hall3DRef.current.receptionPosition) < 3.2) {
      setShowGuestbook(true);
      return;
    }
    // 2. Shop Counter
    if (pPos.distanceTo(hall3DRef.current.shopPosition) < 3.2) {
      setShowShop(true);
      return;
    }
    // 3. Game Booths
    for (const b of hall3DRef.current.boothLocations) {
      if (pPos.distanceTo(b.position) < b.radius) {
        if (b.id === 'photo_swing') {
          soundManager.playApplause();
          showToast('📸 Bạn đã tạo dáng tuyệt đẹp trên xích đu hoa!');
        } else if (b.id === 'photobooth') {
          setShowPhotoBooth(true);
        } else {
          setShowGames(b.id);
        }
        return;
      }
    }
    // 4. Photo Wall
    for (let i = 0; i < hall3DRef.current.photoWallObjects.length; i++) {
      const obj = hall3DRef.current.photoWallObjects[i];
      if (pPos.distanceTo(obj.mesh.getWorldPosition(new THREE.Vector3())) < 4.0) {
        setShowPhotoSlideshow(i);
        return;
      }
    }
    // 5. Table Chairs
    let closestSeat: any = null;
    let minDist = 2.5;
    hall3DRef.current.tableSeats.forEach((seat) => {
      const dist = pPos.distanceTo(seat.position);
      if (dist < minDist) {
        minDist = dist;
        closestSeat = seat;
      }
    });
    if (closestSeat) {
      handlePerformAction('sit');
    }
  };

  // 7. Actions Handler (Ngồi, Nâng ly, Khiêu vũ, Vỗ tay, etc.)
  const handlePerformAction = (action: PlayerAction) => {
    if (!localCharRef.current || !socketRef.current) return;

    if (action === 'sit') {
      // Tự đi tới ghế trống gần nhất, tới nơi mới ngồi xuống
      if (hall3DRef.current) {
        const pPos = localCharRef.current.group.position;
        let closestSeat: (typeof hall3DRef.current.tableSeats)[number] | null = null;
        let minDist = 999;
        hall3DRef.current.tableSeats.forEach((seat) => {
          const busy = [...remoteCharsRef.current.values()].some(
            (c) => c.state.action === 'sit' && c.group.position.distanceTo(seat.position) < 0.4
          );
          const d = pPos.distanceTo(seat.position);
          if (!busy && d < minDist) {
            minDist = d;
            closestSeat = seat;
          }
        });
        if (closestSeat) {
          const seat = closestSeat as (typeof hall3DRef.current.tableSeats)[number];
          pendingSeat.current = { ...seat };
          if (minDist < 0.45) {
            sitDown();
          } else {
            autoWalkTarget.current = seat.position.clone();
            autoWalkStart.current = performance.now();
          }
        }
      }
      return;
    }

    actionStartedAt.current = performance.now();
    localCharRef.current.updateState({ action });
    socketRef.current.emit('action', action);
  };

  // Ngồi xuống ghế đã đi tới
  const sitDown = () => {
    const seat = pendingSeat.current;
    const char = localCharRef.current;
    if (!seat || !char || !socketRef.current) return;
    pendingSeat.current = null;
    autoWalkTarget.current = null;
    const g = char.group;
    g.position.set(seat.position.x, 0, seat.position.z);
    g.rotation.y = Math.atan2(seat.lookAt.x - seat.position.x, seat.lookAt.z - seat.position.z);
    char.updateState({ action: 'sit', position: [g.position.x, 0, g.position.z], rotation: g.rotation.y });
    socketRef.current.emit('move', { position: [g.position.x, 0, g.position.z], rotation: g.rotation.y, action: 'sit' });
    socketRef.current.emit('seat:take', { tableIndex: seat.tableIndex, seatIndex: seat.seatIndex });
  };

  // Chỉ dùng khi chạy dev để kiểm thử tự động (bị loại khỏi bản build)
  if (import.meta.env.DEV) {
    (window as any).__wed = { hall3DRef, localCharRef, remoteCharsRef, cameraAngle, handlePerformAction };
  }

  // 8. Main Game Loop (RequestAnimationFrame)
  useEffect(() => {
    let animId: number;
    let lastTime = performance.now();
    let frameCount = 0;
    let lastNetworkSend = 0;

    const loop = (time: number) => {
      animId = requestAnimationFrame(loop);
      const delta = Math.min((time - lastTime) / 1000, 0.1);
      lastTime = time;
      frameCount++;

      const hall3D = hall3DRef.current;
      const localChar = localCharRef.current;

      if (hall3D && localChar) {
        const pGroup = localChar.group;
        let moveX = 0;
        let moveZ = 0;

        // PC WASD input
        const keys = keysDown.current;
        if (keys['KeyW'] || keys['ArrowUp']) moveZ -= 1;
        if (keys['KeyS'] || keys['ArrowDown']) moveZ += 1;
        if (keys['KeyA'] || keys['ArrowLeft']) moveX -= 1;
        if (keys['KeyD'] || keys['ArrowRight']) moveX += 1;

        // Mobile touch joystick input
        if (joystickVector.current.dx !== 0 || joystickVector.current.dy !== 0) {
          moveX = joystickVector.current.dx;
          moveZ = joystickVector.current.dy;
        }

        // Auto-walk pathfinding towards target
        if (autoWalkTarget.current) {
          const toTarget = autoWalkTarget.current.clone().sub(pGroup.position);
          toTarget.y = 0;
          const tooLong = performance.now() - autoWalkStart.current > 9000;
          if (toTarget.length() > 0.3 && !tooLong) {
            // Hướng đi tính theo thế giới -> đổi về hệ camera vì bên dưới cộng yaw
            const worldAngle = Math.atan2(toTarget.x, toTarget.z) - cameraAngle.current.yaw;
            moveX = Math.sin(worldAngle);
            moveZ = Math.cos(worldAngle);
          } else {
            autoWalkTarget.current = null;
            if (pendingSeat.current && !tooLong) sitDown();
            else pendingSeat.current = null;
          }
        }

        const isRunning = keys['ShiftLeft'] || keys['ShiftRight'];
        const speed = (isRunning ? 6.8 : 3.8) * delta;

        if (moveX !== 0 || moveZ !== 0) {
          // Relative to camera yaw
          const angle = Math.atan2(moveX, moveZ) + cameraAngle.current.yaw;
          const targetPos = pGroup.position.clone().add(
            new THREE.Vector3(Math.sin(angle) * speed, 0, Math.cos(angle) * speed)
          );

          // Check collisions and stage ascending/descending
          const check = hall3D.checkMovement(pGroup.position, targetPos);
          pGroup.position.copy(check.pos);
          pGroup.rotation.y = angle;

          localChar.updateState({
            action: isRunning ? 'run' : 'walk',
            position: [pGroup.position.x, pGroup.position.y, pGroup.position.z],
            rotation: pGroup.rotation.y,
          });

          // Throttle network move messages ~12 times/sec
          if (time - lastNetworkSend > 80 && socketRef.current) {
            lastNetworkSend = time;
            socketRef.current.emit('move', {
              position: [pGroup.position.x, pGroup.position.y, pGroup.position.z],
              rotation: pGroup.rotation.y,
              action: isRunning ? 'run' : 'walk',
            });
          }
        } else if (
          ['toast', 'cheer', 'dance', 'kiss', 'wave', 'clap'].includes(localChar.state.action) &&
          performance.now() - actionStartedAt.current > (localChar.state.action === 'dance' ? 12000 : 6000)
        ) {
          // Hành động tự kết thúc sau vài giây để nhân vật về tư thế đứng
          localChar.updateState({ action: 'idle' });
          socketRef.current?.emit('move', {
            position: [pGroup.position.x, pGroup.position.y, pGroup.position.z],
            rotation: pGroup.rotation.y,
            action: 'idle',
          });
        } else if (localChar.state.action === 'walk' || localChar.state.action === 'run') {
          localChar.updateState({ action: 'idle' });
          if (socketRef.current) {
            socketRef.current.emit('move', {
              position: [pGroup.position.x, pGroup.position.y, pGroup.position.z],
              rotation: pGroup.rotation.y,
              action: 'idle',
            });
          }
        }

        // Camera Smooth Follow
        const cam = hall3D.camera;
        const camDist = cameraAngle.current.distance;
        const camPitch = cameraAngle.current.pitch;
        const camYaw = cameraAngle.current.yaw;

        const camOffset = new THREE.Vector3(
          Math.sin(camYaw) * Math.cos(camPitch) * camDist,
          Math.sin(camPitch) * camDist + 1.2,
          Math.cos(camYaw) * Math.cos(camPitch) * camDist
        );
        const desiredCamPos = pGroup.position.clone().add(camOffset);
        cam.position.lerp(desiredCamPos, 0.18);
        cam.lookAt(pGroup.position.x, pGroup.position.y + 1.2, pGroup.position.z);

        // Update Characters Animations
        localChar.update(delta);
        remoteCharsRef.current.forEach((rChar) => {
          rChar.update(delta, cam.position);
        });

        // Check proximity to video screen
        const distToStage = pGroup.position.distanceTo(hall3D.stageCenter);
        const near = distToStage < 12.0;
        if (near !== uiCache.current.nearVideo) {
          uiCache.current.nearVideo = near;
          setNearVideo(near);
        }

        // Check proximity prompts
        let foundPrompt: string | null = null;
        if (pGroup.position.distanceTo(hall3D.receptionPosition) < 3.2) {
          foundPrompt = 'Ký Sổ Lưu Bút 💌';
        } else if (pGroup.position.distanceTo(hall3D.shopPosition) < 3.2) {
          foundPrompt = 'Mở Tiệm Hỷ Đổi Quà 💐';
        } else {
          for (const b of hall3D.boothLocations) {
            if (pGroup.position.distanceTo(b.position) < b.radius) {
              foundPrompt = `Chơi ${b.name}`;
              break;
            }
          }
        }
        if (foundPrompt !== uiCache.current.prompt) {
          uiCache.current.prompt = foundPrompt;
          setActivePrompt(foundPrompt);
        }

        // Update Hall 3D (petals, NPCs, countdown texture, shadow, CSS3D)
        hall3D.update(delta, frameCount);

        // Update Debug stats if requested
        if (debugStats && frameCount % 30 === 0) {
          setDebugStats({
            fps: hall3D.lastFps,
            drawCalls: hall3D.lastDrawCalls,
          });
        }
      }
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [debugStats]);

  // Video audio toggle handler
  const handleToggleVideoAudio = () => {
    if (!hall3DRef.current) return;
    const iframe = hall3DRef.current.getYoutubeIframe();
    if (!iframe) return;

    if (!videoAudioOn) {
      // Unmute YouTube video and lower background wedding music
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unMute', args: [] }), '*');
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'setVolume', args: [80] }), '*');
      soundManager.setMusicVolume(0.12);
      setVideoAudioOn(true);
    } else {
      iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'mute', args: [] }), '*');
      soundManager.setMusicVolume(0.5);
      setVideoAudioOn(false);
    }
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-gradient-to-b from-[#fffbf0] via-[#fff5f5] to-[#fef2f2] select-none">
      {/* 3D Scene Viewport Container */}
      <div ref={containerRef} className="absolute inset-0 z-0 overflow-hidden" />

      {/* Waiting Lobby Modal (First Screen) */}
      {inLobby && config && (
        <WaitingLobby
          config={config}
          halls={hallsList}
          onJoin={handleJoinLobby}
          onOpenAdmin={() => setShowAdmin(true)}
        />
      )}

      {/* In-Game HUD */}
      {!inLobby && currentHall && userData && (
        <>
          <HUD
            user={userData}
            hall={currentHall}
            hallsList={hallsList}
            leaderboard={leaderboard}
            countdownText={countdownText}
            isNight={isNight}
            nearVideo={nearVideo}
            videoAudioOn={videoAudioOn}
            activePrompt={activePrompt}
            debugStats={debugStats}
            onSwitchHall={handleSwitchHall}
            onOpenShop={() => setShowShop(true)}
            onOpenLeaderboard={() => setShowLeaderboard(true)}
            onOpenProfileEdit={() => setShowProfileEdit(true)}
            onOpenGuestbook={() => setShowGuestbook(true)}
            onOpenVideoModal={() => setShowVideoModal(true)}
            onOpenGames={() => setShowGames('jigsaw')}
            onOpenPhotoBooth={() => setShowPhotoBooth(true)}
            onToggleNight={() => {
              const next = !isNight;
              setIsNight(next);
              hall3DRef.current?.setNightMode(next);
            }}
            onToggleVideoAudio={handleToggleVideoAudio}
            onPerformAction={handlePerformAction}
            onSendChat={(msg) => socketRef.current?.emit('chat', msg)}
            onInteractPrompt={handleInteractWithNearest}
            chatMessages={chatMessages}
          />

          {/* Virtual Joystick for Mobile Devices */}
          {isMobile.current && (
            <div className="fixed bottom-6 left-6 z-40 pointer-events-auto">
              <VirtualJoystick
                onMove={(dx, dy) => {
                  joystickVector.current = { dx, dy };
                }}
                onStop={() => {
                  joystickVector.current = { dx: 0, dy: 0 };
                }}
              />
            </div>
          )}
        </>
      )}

      {/* Global Toast Banner */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-5 py-2.5 rounded-full bg-slate-900/90 text-white border-2 border-amber-300 shadow-2xl backdrop-blur-md text-xs sm:text-sm font-bold flex items-center gap-2 animate-bounce">
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Guestbook Modal */}
      {showGuestbook && (
        <GuestbookModal
          wishes={wishes}
          onClose={() => setShowGuestbook(false)}
          onSubmitWish={(content, icon) => {
            socketRef.current?.emit('wish:add', { content, icon });
            setShowGuestbook(false);
          }}
        />
      )}

      {/* Shop Modal */}
      {showShop && userData && (
        <ShopModal
          user={userData}
          onClose={() => setShowShop(false)}
          onGiftFlower={(flwId) => {
            socketRef.current?.emit('shop:gift_flower', flwId);
          }}
          onBuyOutfit={(itemId) => {
            socketRef.current?.emit('shop:buy_outfit', itemId);
          }}
          onEquipItem={(itemId) => {
            socketRef.current?.emit('shop:equip', itemId);
          }}
        />
      )}

      {/* Leaderboard Modal */}
      {showLeaderboard && userData && (
        <LeaderboardModal
          entries={leaderboard}
          currentUid={userData.uid}
          currentHallName={currentHall?.name}
          onClose={() => setShowLeaderboard(false)}
        />
      )}

      {/* Mini-Games Modal */}
      {showGames && (
        <GamesModal
          initialGame={showGames}
          onClose={() => setShowGames(null)}
          onSubmitGameScore={(game, score, details) => {
            socketRef.current?.emit('game:submit', { game, score, details });
            soundManager.playPointsDing();
          }}
        />
      )}

      {/* Photo Wall Slideshow Modal */}
      {showPhotoSlideshow !== null && (
        <PhotoSlideshowModal
          photos={photos}
          initialIndex={showPhotoSlideshow}
          onClose={() => setShowPhotoSlideshow(null)}
        />
      )}

      {/* Wedding Photo Booth & Face Swap Modal */}
      {showPhotoBooth && (
        <WeddingPhotoBoothModal
          onClose={() => setShowPhotoBooth(false)}
          defaultGuestName={userData?.name || 'Khách Mời'}
          onPhotoSavedToWall={(url) => {
            setPhotos((prev) => [url, ...prev]);
            showToast('📸 Ảnh kỷ niệm của bạn đã được treo lên tường ảnh sảnh cưới!');
          }}
        />
      )}

      {/* Video Fullscreen Modal */}
      {showVideoModal && config && (
        <VideoModal
          youtubeId={config.video?.youtubeId || 'uIlNkfn6NcA'}
          videoTime={0}
          onClose={() => setShowVideoModal(false)}
        />
      )}

      {/* Profile & Outfit Editor Modal */}
      {showProfileEdit && userData && (
        <ProfileEditModal
          user={userData}
          onClose={() => setShowProfileEdit(false)}
          onUpdateProfile={(data) => {
            socketRef.current?.emit('profile:update', data);
          }}
          onEquipOutfit={(itemId) => {
            socketRef.current?.emit('shop:equip', itemId);
          }}
        />
      )}

      {/* Admin Panel Modal */}
      {showAdmin && (
        <AdminModal
          wishes={wishes}
          halls={hallsList}
          onlineCount={currentHall?.playerCount || 1}
          onClose={() => setShowAdmin(false)}
        />
      )}
    </div>
  );
}
export default App;
