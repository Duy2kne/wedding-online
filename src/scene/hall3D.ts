import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { HALL_THEMES, type HallThemeConfig } from './hallThemes.js';
import { Character3D } from './character3D.js';
import type { FlowerGift, LeaderboardEntry, WeddingConfig, PlayerState } from '../shared/types.js';

// Ảnh cưới treo trong sảnh (thứ tự trùng với /api/media/photos để mở slideshow đúng ảnh)
export const WEDDING_PHOTOS = [
  { file: 'anh01', title: 'Lời Hẹn Ước' },
  { file: 'anh02', title: 'Dịu Dàng' },
  { file: 'anh03', title: 'Bên Nhau' },
  { file: 'anh04', title: 'Khoảnh Khắc' },
  { file: 'anh05', title: 'Hạnh Phúc' },
  { file: 'anh06', title: 'Tay Trong Tay' },
  { file: 'anh07', title: 'Niềm Vui' },
  { file: 'anh08', title: 'Trọn Đời' },
  { file: 'anh09', title: 'Áo Dài Ngày Cưới' },
];

const SCRIPT_FONT = '"Great Vibes", "Playfair Display", Georgia, serif';
const SERIF_FONT = '"Playfair Display", Georgia, serif';
const SANS_FONT = '"Be Vietnam Pro", "Segoe UI", sans-serif';

export interface TableSeatLocation {
  tableIndex: number;
  seatIndex: number;
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
}

export interface CollisionBox {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  height: number;
  isStairs?: boolean;
}

interface CollisionCircle {
  x: number;
  z: number;
  r: number;
}

// Hoa trang trí: gom mọi bông vào 1 InstancedMesh (1 draw call)
interface FlowerInstance {
  pos: THREE.Vector3;
  scale: number;
  color: number;
}

function colorGeom(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

function shade(hex: number, k: number) {
  const c = new THREE.Color(hex).multiplyScalar(k);
  return new THREE.Color(Math.min(1, c.r), Math.min(1, c.g), Math.min(1, c.b)).getHex();
}

function mergeColored(parts: THREE.BufferGeometry[]) {
  const ready = parts.map((g) => {
    const x = g.index ? g.toNonIndexed() : g;
    for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) x.deleteAttribute(k);
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    return x;
  });
  return BufferGeometryUtils.mergeGeometries(ready, false)!;
}

export class WeddingHall3D {
  public scene: THREE.Scene;
  public cssScene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public cssRenderer: CSS3DRenderer;
  public container: HTMLElement;
  public theme: HallThemeConfig;
  public config: WeddingConfig;

  public tableSeats: TableSeatLocation[] = [];
  public collisionObstacles: CollisionBox[] = [];
  private collisionCircles: CollisionCircle[] = [];
  public photoWallObjects: Array<{ mesh: THREE.Mesh; url: string; title: string }> = [];
  public boothLocations: Array<{ id: string; name: string; position: THREE.Vector3; radius: number }> = [];
  public receptionPosition = new THREE.Vector3(7.5, 0, 14);
  public shopPosition = new THREE.Vector3(-8.5, 0, 14);
  public stageCenter = new THREE.Vector3(0, 1.2, -18);

  private flowerGroup: THREE.Group;
  private decoFlowers: FlowerInstance[] = [];
  private decoLeaves: FlowerInstance[] = [];
  private npcGroom?: Character3D;
  private npcBride?: Character3D;
  private fallingPetalsMesh!: THREE.InstancedMesh;
  private petalCount = 70;
  private petalData: Array<{ x: number; y: number; z: number; vy: number; rotX: number; rotY: number }> = [];
  private petalDummy = new THREE.Object3D();
  // Bóng bay lơ lửng (có lắc nhẹ) + kim tuyến lấp lánh
  private floatBalloons: Array<{ mesh: THREE.InstancedMesh; idx: number; base: THREE.Vector3; phase: number; s: THREE.Vector3 }> = [];
  private balloonMeshes: THREE.InstancedMesh[] = [];
  private glitter?: THREE.Points;
  private glitterData: Array<{ vy: number; phase: number; speed: number; base: THREE.Color }> = [];
  private glitterTime = 0;

  private countdownCanvas!: HTMLCanvasElement;
  private countdownTexture!: THREE.CanvasTexture;
  private leaderboardCanvas!: HTMLCanvasElement;
  private leaderboardTexture!: THREE.CanvasTexture;
  private lastLeaderboard: LeaderboardEntry[] = [];
  private lastCountdownSecond = -1;
  private mainVideoHoleMesh!: THREE.Mesh;
  private youtubeCssObject?: CSS3DObject;
  private youtubeIframe?: HTMLIFrameElement;
  private redrawers: Array<() => void> = [];
  private onYoutubeMessage?: (e: MessageEvent) => void;
  private ytSend?: (func: string, args?: unknown[]) => void;
  private ytReady = false;
  private videoSoundWanted = false;
  private lastSoundApply = 0;
  private ytState = -1; // -1 chưa chạy, 0 hết, 1 đang phát, 2 tạm dừng, 3 đang tải, 5 chờ
  private ytMuted = true;
  private soundCheckTimer?: ReturnType<typeof setInterval>;
  private soundBlocked = false;
  private keepAliveTimer?: ReturnType<typeof setInterval>;
  private onUserGesture?: () => void;
  /** Gọi khi trình duyệt không cho phát tiếng video (cần khách bấm nút) */
  public onSoundBlocked?: () => void;
  /** Gọi khi video lỗi (bị xoá / tắt nhúng) để chuyển sang nhạc nền dự phòng */
  public onVideoError?: (code: number) => void;
  /** Gọi khi đã bật được tiếng video */
  public onSoundOk?: () => void;

  private hemiLight!: THREE.HemisphereLight;
  private ambientLight!: THREE.AmbientLight;
  private mainDirectionalLight!: THREE.DirectionalLight;
  private chandelierPointLights: THREE.PointLight[] = [];
  private pointBase: number[] = [];
  private glowMaterials: THREE.MeshStandardMaterial[] = [];
  private isNight = false;

  private npcAnimTime = 0;
  private npcThankTimer = 0;

  public lastDrawCalls = 0;
  public lastFps = 60;
  private fpsFrames = 0;
  private fpsLastTime = performance.now();
  private onResize: () => void;
  private texLoader = new THREE.TextureLoader();

  constructor(container: HTMLElement, themeId: 'diamond' | 'sophia' = 'diamond', config: WeddingConfig) {
    this.container = container;
    this.theme = HALL_THEMES[themeId] || HALL_THEMES.diamond;
    this.config = config;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(this.theme.wallColor, 38, 80);
    this.cssScene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.2, 200);
    this.camera.position.set(0, 3.2, 25);

    // alpha: true để "đục lỗ" cho iframe YouTube phía sau
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = false;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    Object.assign(this.renderer.domElement.style, { position: 'absolute', top: '0', left: '0', zIndex: '2' });
    container.appendChild(this.renderer.domElement);

    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.setSize(width, height);
    Object.assign(this.cssRenderer.domElement.style, { position: 'absolute', top: '0', left: '0', zIndex: '1', pointerEvents: 'none' });
    container.appendChild(this.cssRenderer.domElement);

    this.flowerGroup = new THREE.Group();
    this.scene.add(this.flowerGroup);

    this.buildScene();
    this.setupYoutubeVideo();

    this.onResize = () => {
      const w = this.container.clientWidth || window.innerWidth;
      const h = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.cssRenderer.setSize(w, h);
    };
    window.addEventListener('resize', this.onResize);

    // Font chữ (Great Vibes, Playfair) có thể tải xong sau khi vẽ canvas -> vẽ lại
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => this.redrawers.forEach((f) => f()));
      Promise.all([
        document.fonts.load(`64px "Great Vibes"`),
        document.fonts.load(`600 40px "Playfair Display"`),
        document.fonts.load(`600 30px "Be Vietnam Pro"`),
      ])
        .then(() => this.redrawers.forEach((f) => f()))
        .catch(() => {});
    }
  }

  private buildScene() {
    this.setupLighting();
    this.buildArchitecture();
    this.buildChandeliers();
    this.buildStage();
    this.buildDiningTables();
    this.buildEntranceAndAisle();
    this.buildBoothsAndStalls();
    this.buildPhotoDisplays();
    this.buildGardenCorner();
    this.buildStageFlowers();
    this.buildBalloons();
    this.buildDecorFlowers();
    this.buildPetals();
    this.buildGlitter();
    this.renderer.shadowMap.needsUpdate = true;
  }

  // ---------------- ÁNH SÁNG ----------------
  private setupLighting() {
    this.hemiLight = new THREE.HemisphereLight(0xfff4e6, 0x6b5444, 0.85);
    this.scene.add(this.hemiLight);

    this.ambientLight = new THREE.AmbientLight(this.theme.ambientColor, this.theme.ambientIntensity);
    this.scene.add(this.ambientLight);

    this.mainDirectionalLight = new THREE.DirectionalLight(this.theme.primaryLightColor, 1.45);
    this.mainDirectionalLight.position.set(8, 24, 12);
    this.mainDirectionalLight.castShadow = true;
    const sh = this.mainDirectionalLight.shadow;
    sh.mapSize.set(2048, 2048);
    sh.camera.near = 5;
    sh.camera.far = 70;
    sh.camera.left = -26;
    sh.camera.right = 26;
    sh.camera.top = 28;
    sh.camera.bottom = -28;
    sh.bias = -0.0004;
    sh.normalBias = 0.03;
    this.scene.add(this.mainDirectionalLight);

    const fill = new THREE.DirectionalLight(0xffe6d2, 0.3);
    fill.position.set(-12, 14, 26);
    this.scene.add(fill);

    // Đèn điểm suy giảm thật (decay 2) -> sáng ấm quanh đèn chùm, không cháy trắng
    const mk = (color: number, intensity: number, x: number, y: number, z: number) => {
      const l = new THREE.PointLight(color, intensity, 0, 2);
      l.position.set(x, y, z);
      this.scene.add(l);
      this.chandelierPointLights.push(l);
      this.pointBase.push(intensity);
    };
    mk(this.theme.accentLightColor, 26, -6, 7.4, 1);
    mk(this.theme.accentLightColor, 26, 6, 7.4, 1);
    mk(0xffe9d2, 34, 0, 7.2, -15); // sân khấu
    mk(0xffd9cc, 14, 0, 4.8, 18); // cổng hoa
  }

  // ---------------- KIẾN TRÚC ----------------
  private makeFloorTexture() {
    const S = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = this.theme.floorBase;
    ctx.fillRect(0, 0, S, S);

    // Vân đá mềm
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    ctx.filter = 'blur(1.5px)';
    for (let i = 0; i < 14; i++) {
      ctx.strokeStyle = this.theme.floorVein;
      ctx.lineWidth = 1 + rnd() * 3;
      ctx.beginPath();
      let x = rnd() * S;
      let y = rnd() * S;
      ctx.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        const nx = x + (rnd() - 0.3) * 320;
        const ny = y + (rnd() - 0.5) * 320;
        ctx.quadraticCurveTo((x + nx) / 2 + (rnd() - 0.5) * 120, (y + ny) / 2 + (rnd() - 0.5) * 120, nx, ny);
        x = nx;
        y = ny;
      }
      ctx.stroke();
    }
    ctx.filter = 'none';
    // Sắc độ nhẹ giữa các viên đá
    for (let tx = 0; tx < 2; tx++)
      for (let ty = 0; ty < 2; ty++) {
        ctx.fillStyle = (tx + ty) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(120,90,60,0.035)';
        ctx.fillRect(tx * 512, ty * 512, 512, 512);
      }
    // Ron gạch
    ctx.strokeStyle = this.theme.floorGrout;
    ctx.lineWidth = 2;
    for (let i = 0; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 512, 0);
      ctx.lineTo(i * 512, S);
      ctx.moveTo(0, i * 512);
      ctx.lineTo(S, i * 512);
      ctx.stroke();
    }
    // Hoa văn kim cương nhỏ ở góc gạch
    ctx.fillStyle = 'rgba(176, 146, 92, 0.55)';
    for (const [sx, sy] of [[0, 0], [512, 0], [0, 512], [512, 512], [1024, 0], [0, 1024], [1024, 1024], [512, 1024], [1024, 512]]) {
      ctx.beginPath();
      ctx.moveTo(sx, sy - 12);
      ctx.lineTo(sx + 12, sy);
      ctx.lineTo(sx, sy + 12);
      ctx.lineTo(sx - 12, sy);
      ctx.closePath();
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    return tex;
  }

  // Tấm rèm có nếp gấp (dùng chung cho mọi rèm)
  private makeDrapeGeometry(w: number, h: number, folds: number, depth: number) {
    const g = new THREE.PlaneGeometry(w, h, folds * 6, 4);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const t = (h / 2 - y) / h; // 0 trên, 1 dưới
      pos.setZ(i, Math.sin((x / w) * Math.PI * 2 * folds) * depth * (0.6 + t * 0.6));
    }
    g.computeVertexNormals();
    return g;
  }

  private buildArchitecture() {
    const t = this.theme;
    // Sàn đá trong sảnh (44 x 56m)
    const floorTex = this.makeFloorTexture();
    floorTex.repeat.set(44 / 4, 56 / 4);
    const floorMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(44, 56),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.04 })
    );
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, 4);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // Trần + dầm trần
    const ceilMat = new THREE.MeshStandardMaterial({ color: t.ceilingColor, roughness: 0.95 });
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(44, 56), ceilMat);
    ceil.position.set(0, 10, 4);
    ceil.rotation.x = Math.PI / 2;
    this.scene.add(ceil);
    const beams: THREE.BufferGeometry[] = [];
    for (const z of [-14, -6, 2, 10, 18, 26]) {
      const b = new THREE.BoxGeometry(40, 0.45, 0.5);
      b.translate(0, 9.78, z);
      beams.push(b);
    }
    for (const x of [-12, 0, 12]) {
      const b = new THREE.BoxGeometry(0.5, 0.45, 52);
      b.translate(x, 9.78, 4);
      beams.push(b);
    }
    this.scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(beams)!, new THREE.MeshStandardMaterial({ color: t.wainscotColor, roughness: 0.8 })));

    // Đèn hắt trần (dải phát sáng nhẹ quanh trần)
    const coveMat = new THREE.MeshStandardMaterial({ color: 0xfff1dc, emissive: 0xffd9a8, emissiveIntensity: 0.55 });
    this.glowMaterials.push(coveMat);
    const coves: THREE.BufferGeometry[] = [];
    for (const [w, d, x, z] of [[40, 0.12, 0, -21.6], [40, 0.12, 0, 29.6], [0.12, 51, -19.6, 4], [0.12, 51, 19.6, 4]] as const) {
      const g = new THREE.BoxGeometry(w || 0.12, 0.08, d);
      g.translate(x, 9.35, z);
      coves.push(g);
    }
    this.scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(coves)!, coveMat));

    // Tường
    const wallMat = new THREE.MeshStandardMaterial({ color: t.wallColor, roughness: 0.9 });
    const walls: Array<[number, number, number, number, number]> = [
      [48, 0, 5, -22, 0],
      [56, -20, 5, 4, Math.PI / 2],
      [56, 20, 5, 4, -Math.PI / 2],
      [48, 0, 5, 30, Math.PI],
    ];
    const wallGeoms = walls.map(([w, x, y, z, ry]) => {
      const g = new THREE.PlaneGeometry(w, 10);
      g.rotateY(ry);
      g.translate(x, y, z);
      return g;
    });
    const wallMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(wallGeoms)!, wallMat);
    wallMesh.receiveShadow = true;
    this.scene.add(wallMesh);

    // Ốp chân tường + nẹp chỉ vàng
    const wain: THREE.BufferGeometry[] = [];
    const rail: THREE.BufferGeometry[] = [];
    const addRun = (len: number, x: number, z: number, alongX: boolean) => {
      const w = new THREE.BoxGeometry(alongX ? len : 0.12, 1.15, alongX ? 0.12 : len);
      w.translate(x, 0.575, z);
      wain.push(w);
      const r = new THREE.BoxGeometry(alongX ? len : 0.16, 0.06, alongX ? 0.16 : len);
      r.translate(x, 1.18, z);
      rail.push(r);
    };
    addRun(40, 0, -21.94, true);
    addRun(40, 0, 29.94, true);
    addRun(52, -19.94, 4, false);
    addRun(52, 19.94, 4, false);
    this.scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(wain)!, new THREE.MeshStandardMaterial({ color: t.wainscotColor, roughness: 0.75 })));
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8a565, metalness: 0.7, roughness: 0.35 });
    this.scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(rail)!, goldMat));

    // Cột cổ điển (thân + chân đế + đầu cột gộp 1 mesh)
    const colParts: THREE.BufferGeometry[] = [];
    for (const x of [-19, 19])
      for (const z of [-16, -8, 0, 8, 16, 24]) {
        const shaft = new THREE.CylinderGeometry(0.36, 0.4, 8.8, 16);
        shaft.translate(x, 4.9, z);
        const base = new THREE.BoxGeometry(1.0, 0.5, 1.0);
        base.translate(x, 0.25, z);
        const cap = new THREE.BoxGeometry(1.0, 0.4, 1.0);
        cap.translate(x, 9.5, z);
        colParts.push(shaft, base, cap);
      }
    const cols = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(colParts)!, new THREE.MeshStandardMaterial({ color: 0xf1e9dd, roughness: 0.5 }));
    cols.receiveShadow = true;
    this.scene.add(cols);

    // Rèm vải: 2 tấm buông 2 bên mỗi khoang tường + rèm xếp nếp sau sân khấu
    const drapeMat = new THREE.MeshStandardMaterial({ color: t.drapeColor, roughness: 0.95, side: THREE.DoubleSide });
    const sideDrape = this.makeDrapeGeometry(1.3, 8.4, 3, 0.09);
    const drapeSpots: THREE.Matrix4[] = [];
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const side of [-1, 1])
      for (const zc of [-12, -4, 4, 12, 20])
        for (const off of [-2.7, 2.7]) {
          q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), side < 0 ? Math.PI / 2 : -Math.PI / 2);
          m4.compose(new THREE.Vector3(side * 19.75, 5.4, zc + off), q, new THREE.Vector3(1, 1, 1));
          drapeSpots.push(m4.clone());
        }
    const drapes = new THREE.InstancedMesh(sideDrape, drapeMat, drapeSpots.length);
    drapeSpots.forEach((m, i) => drapes.setMatrixAt(i, m));
    this.scene.add(drapes);

    const backDrape = new THREE.Mesh(this.makeDrapeGeometry(40, 9.2, 40, 0.12), drapeMat);
    backDrape.position.set(0, 5.1, -21.75);
    this.scene.add(backDrape);

    // Tường cửa vào: rèm 2 bên + cửa đôi có vòm
    for (const x of [-12, 12]) {
      const fd = new THREE.Mesh(this.makeDrapeGeometry(14, 9.2, 14, 0.12), drapeMat);
      fd.position.set(x, 5.1, 29.75);
      fd.rotation.y = Math.PI;
      this.scene.add(fd);
    }
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xf3ece2, roughness: 0.55 });
    const doorGold = new THREE.MeshStandardMaterial({ color: 0xc8a565, metalness: 0.65, roughness: 0.35 });
    const doorFrame = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries([
        new THREE.BoxGeometry(0.5, 5.2, 0.4).translate(-2.6, 2.6, 0),
        new THREE.BoxGeometry(0.5, 5.2, 0.4).translate(2.6, 2.6, 0),
        new THREE.BoxGeometry(5.7, 0.5, 0.4).translate(0, 5.45, 0),
      ])!,
      doorMat
    );
    doorFrame.position.set(0, 0, 29.7);
    this.scene.add(doorFrame);
    for (const sx of [-1, 1]) {
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(2.3, 5.0, 0.08), doorMat);
      leaf.position.set(sx * 1.17, 2.55, 29.75);
      this.scene.add(leaf);
      for (const [py, ph] of [[3.6, 1.8], [1.4, 1.6]] as const) {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(1.6, ph, 0.04), doorGold);
        panel.position.set(sx * 1.17, py, 29.7);
        this.scene.add(panel);
      }
    }
    const transom = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 32, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xfff1dc, emissive: 0xffd8a8, emissiveIntensity: 0.5, roughness: 0.4 })
    );
    this.glowMaterials.push(transom.material as THREE.MeshStandardMaterial);
    transom.position.set(0, 5.7, 29.68);
    transom.rotation.y = Math.PI;
    this.scene.add(transom);

    this.collisionObstacles.push(
      { minX: -21, maxX: 21, minZ: -23, maxZ: -21.6, height: 10 },
      { minX: -21, maxX: -19.2, minZ: -22, maxZ: 31, height: 10 },
      { minX: 19.2, maxX: 21, minZ: -22, maxZ: 31, height: 10 },
      { minX: -21, maxX: 21, minZ: 29.4, maxZ: 31, height: 10 }
    );
  }

  // Đèn chùm pha lê / đèn dây (gom instanced)
  private buildChandeliers() {
    const spots = [
      [-6, 8.3, 1],
      [6, 8.3, 1],
      [-6, 8.3, 13],
      [6, 8.3, 13],
      [-6, 8.3, -9],
      [6, 8.3, -9],
    ];
    const gold = new THREE.MeshStandardMaterial({ color: 0xc9a764, metalness: 0.75, roughness: 0.3 });
    const ringParts: THREE.BufferGeometry[] = [];
    const drops: THREE.Vector3[] = [];
    const bulbs: THREE.Vector3[] = [];
    spots.forEach(([x, y, z], idx) => {
      const big = idx < 2;
      const r1 = big ? 1.25 : 0.9;
      for (const [rr, yy] of [[r1, 0], [r1 * 0.62, 0.45]] as const) {
        const ring = new THREE.TorusGeometry(rr, 0.035, 6, 36);
        ring.rotateX(Math.PI / 2);
        ring.translate(x, y + yy, z);
        ringParts.push(ring);
      }
      const rod = new THREE.CylinderGeometry(0.03, 0.03, 10 - y, 6);
      rod.translate(x, y + (10 - y) / 2, z);
      ringParts.push(rod);
      const n = big ? 22 : 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        drops.push(new THREE.Vector3(x + Math.cos(a) * r1, y - 0.28 - (i % 2) * 0.16, z + Math.sin(a) * r1));
        if (i % 2 === 0) drops.push(new THREE.Vector3(x + Math.cos(a) * r1 * 0.62, y + 0.15, z + Math.sin(a) * r1 * 0.62));
        if (i % 3 === 0) bulbs.push(new THREE.Vector3(x + Math.cos(a) * r1, y + 0.1, z + Math.sin(a) * r1));
      }
      drops.push(new THREE.Vector3(x, y - 0.6, z));
    });
    this.scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(ringParts)!, gold));

    const fairy = this.theme.chandelierStyle === 'fairy';
    const dropGeom = fairy ? new THREE.SphereGeometry(0.06, 8, 6) : new THREE.OctahedronGeometry(0.075, 0);
    if (!fairy) dropGeom.scale(1, 1.8, 1);
    const dropMat = new THREE.MeshStandardMaterial({
      color: fairy ? 0xfff0d6 : 0xf6f2ec,
      emissive: fairy ? 0xffc98a : 0xfff0dc,
      emissiveIntensity: fairy ? 1.1 : 0.45,
      roughness: 0.15,
      metalness: 0.2,
    });
    this.glowMaterials.push(dropMat);
    const dropMesh = new THREE.InstancedMesh(dropGeom, dropMat, drops.length);
    const m = new THREE.Matrix4();
    drops.forEach((p, i) => dropMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    this.scene.add(dropMesh);

    const bulbMat = new THREE.MeshStandardMaterial({ color: 0xfff3dd, emissive: 0xffd49a, emissiveIntensity: 1.6 });
    this.glowMaterials.push(bulbMat);
    const bulbMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 8, 6), bulbMat, bulbs.length);
    bulbs.forEach((p, i) => bulbMesh.setMatrixAt(i, m.makeTranslation(p.x, p.y, p.z)));
    this.scene.add(bulbMesh);
  }

  // ---------------- SÂN KHẤU ----------------
  private buildStage() {
    const t = this.theme;
    const stageMat = new THREE.MeshStandardMaterial({ color: 0xefe6da, roughness: 0.55 });
    const stageMesh = new THREE.Mesh(new THREE.BoxGeometry(18, 1.2, 8), stageMat);
    stageMesh.position.set(0, 0.6, -18);
    stageMesh.receiveShadow = true;
    this.scene.add(stageMesh);

    // Mặt sân khấu trải thảm
    const top = new THREE.Mesh(new THREE.PlaneGeometry(17.4, 7.6), new THREE.MeshStandardMaterial({ color: t.carpetColor, roughness: 0.85 }));
    top.rotation.x = -Math.PI / 2;
    top.position.set(0, 1.205, -18);
    top.receiveShadow = true;
    this.scene.add(top);

    // Váy sân khấu xếp nếp
    const skirt = new THREE.Mesh(
      this.makeDrapeGeometry(18, 1.2, 36, 0.05),
      new THREE.MeshStandardMaterial({ color: t.drapeColor, roughness: 0.95 })
    );
    skirt.position.set(0, 0.6, -13.96);
    this.scene.add(skirt);

    // Bậc thang
    const stepMat = new THREE.MeshStandardMaterial({ color: t.carpetColor, roughness: 0.85 });
    const steps: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 4; i++) {
      const g = new THREE.BoxGeometry(4.5, 0.3, 0.4);
      g.translate(0, 0.15 + i * 0.3, -14.2 - i * 0.3);
      steps.push(g);
    }
    const stepMesh = new THREE.Mesh(BufferGeometryUtils.mergeGeometries(steps)!, stepMat);
    stepMesh.receiveShadow = true;
    this.scene.add(stepMesh);

    this.collisionObstacles.push(
      { minX: -9.2, maxX: -2.3, minZ: -22, maxZ: -14, height: 1.2 },
      { minX: 2.3, maxX: 9.2, minZ: -22, maxZ: -14, height: 1.2 },
      { minX: -9, maxX: 9, minZ: -22.2, maxZ: -21.6, height: 1.2 },
      { minX: -2.3, maxX: 2.3, minZ: -15.4, maxZ: -14.0, height: 1.2, isStairs: true }
    );

    // Phông nền: tên cô dâu chú rể phía trên màn hình
    const bc = document.createElement('canvas');
    bc.width = 2048;
    bc.height = 400;
    const backdropTex = new THREE.CanvasTexture(bc);
    backdropTex.colorSpace = THREE.SRGBColorSpace;
    const drawBackdrop = () => {
      const ctx = bc.getContext('2d')!;
      ctx.clearRect(0, 0, 2048, 400);
      const g = ctx.createLinearGradient(0, 0, 0, 400);
      g.addColorStop(0, 'rgba(255,250,243,0.0)');
      g.addColorStop(0.25, 'rgba(255,250,243,0.92)');
      g.addColorStop(1, 'rgba(250,242,232,0.92)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(260, 40, 1528, 330, 160);
      ctx.fill();
      ctx.strokeStyle = 'rgba(190,160,100,0.8)';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.fillStyle = '#7a2a38';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `150px ${SCRIPT_FONT}`;
      ctx.fillText(`${this.config.groom}  &  ${this.config.bride}`, 1024, 170);
      ctx.fillStyle = '#9a7a4a';
      ctx.font = `600 40px ${SANS_FONT}`;
      const [y, mo, d] = (this.config.date || '2026-11-29').split('-');
      ctx.fillText(`· ${d} . ${mo} . ${y} ·`, 1024, 300);
      backdropTex.needsUpdate = true;
    };
    drawBackdrop();
    this.redrawers.push(drawBackdrop);
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(16, 3.125),
      new THREE.MeshStandardMaterial({ map: backdropTex, transparent: true, roughness: 0.8 })
    );
    backdrop.position.set(0, 8.25, -21.6);
    this.scene.add(backdrop);

    // Bánh cưới 3 tầng
    const cake = new THREE.Group();
    cake.position.set(-6.2, 1.2, -17.5);
    const cakeMat = new THREE.MeshStandardMaterial({ color: 0xfaf4ea, roughness: 0.55 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xd4b57a, roughness: 0.4, metalness: 0.4 });
    const table = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.75, 24), new THREE.MeshStandardMaterial({ color: t.tableClothColor, roughness: 0.8 }));
    table.position.y = 0.375;
    cake.add(table);
    [
      { r: 0.55, h: 0.42, y: 0.96 },
      { r: 0.42, h: 0.38, y: 1.36 },
      { r: 0.3, h: 0.34, y: 1.72 },
    ].forEach((tier) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(tier.r, tier.r, tier.h, 28), cakeMat);
      m.position.y = tier.y;
      m.castShadow = true;
      const tr = new THREE.Mesh(new THREE.TorusGeometry(tier.r, 0.025, 6, 28), trimMat);
      tr.rotation.x = Math.PI / 2;
      tr.position.y = tier.y - tier.h / 2 + 0.02;
      cake.add(m, tr);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + tier.r;
        this.addFlowerAt(new THREE.Vector3(-6.2 + Math.cos(a) * tier.r, 1.2 + tier.y + tier.h / 2, -17.5 + Math.sin(a) * tier.r), 0.06, i % 2 ? t.flowerPalette.secondary : t.flowerPalette.primary);
      }
    });
    this.scene.add(cake);
    this.collisionCircles.push({ x: -6.2, z: -17.5, r: 1.2 });

    // Tháp ly champagne
    const champ = new THREE.Group();
    champ.position.set(6.2, 1.2, -17.5);
    const ct = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.75, 24), new THREE.MeshStandardMaterial({ color: t.tableClothColor, roughness: 0.8 }));
    ct.position.y = 0.375;
    champ.add(ct);
    const glassGeom = new THREE.CylinderGeometry(0.08, 0.035, 0.14, 10);
    const glassMat = new THREE.MeshStandardMaterial({ color: 0xf3e3b5, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.7 });
    const glassPos: THREE.Vector3[] = [];
    for (let lvl = 0; lvl < 4; lvl++) {
      const n = 4 - lvl;
      for (let gx = 0; gx < n; gx++)
        for (let gz = 0; gz < n; gz++) glassPos.push(new THREE.Vector3((gx - (n - 1) / 2) * 0.17, 0.82 + lvl * 0.15, (gz - (n - 1) / 2) * 0.17));
    }
    const glasses = new THREE.InstancedMesh(glassGeom, glassMat, glassPos.length);
    const mm = new THREE.Matrix4();
    glassPos.forEach((p, i) => glasses.setMatrixAt(i, mm.makeTranslation(p.x, p.y, p.z)));
    champ.add(glasses);
    this.scene.add(champ);
    this.collisionCircles.push({ x: 6.2, z: -17.5, r: 1.1 });

    this.buildNPCs();
    this.buildCountdownScreen();
    this.buildVideoHoleMesh();
    this.buildFamilyScreen();
    this.buildLeaderboardScreen();
  }

  private buildNPCs() {
    const base = (id: string, name: string, gender: 'male' | 'female', outfit: string, x: number): PlayerState => ({
      id,
      uid: id,
      name,
      group: gender === 'male' ? 'groom' : 'bride',
      gender,
      hairStyle: gender === 'male' ? 3 : 2, // chú rể: side part Hàn Quốc; cô dâu: búi tóc
      hairColor: gender === 'male' ? '#24170f' : '#3a2418',
      outfit,
      accessories: gender === 'male' ? ['watch'] : ['tiara', 'gold_necklace'],
      position: [x, 1.2, -16.6],
      rotation: 0,
      action: 'idle',
      hallId: 'npc',
    });
    // Chú rể mặc vest trắng quần đen (giống ảnh cưới)
    this.npcGroom = new Character3D(base('npc_groom', this.config.groom, 'male', 'suit_white', -0.55), true, { label: 'Chú rể' });
    this.npcBride = new Character3D(base('npc_bride', this.config.bride, 'female', 'bride_gown', 0.55), true, { label: 'Cô dâu' });
    this.npcBride.holdBouquet();
    this.npcGroom.group.scale.setScalar(1.12);
    this.npcBride.group.scale.setScalar(1.12);
    this.scene.add(this.npcGroom.group, this.npcBride.group);
    this.collisionCircles.push({ x: 0, z: -16.6, r: 1.2 });
  }

  public triggerNPCThank() {
    this.npcThankTimer = 4.0;
  }

  private makeScreenFrame(w: number, h: number, x: number, y: number) {
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xb9975a, metalness: 0.65, roughness: 0.35 })
    );
    frame.position.set(x, y, -20.25);
    this.scene.add(frame);
  }

  // Màn hình chính: đục lỗ để lộ iframe YouTube
  private buildVideoHoleMesh() {
    this.makeScreenFrame(8.7, 5.1, 0, 4.4);
    const holeMat = new THREE.MeshBasicMaterial({ color: 0x000000, opacity: 0, transparent: true, blending: THREE.NoBlending });
    this.mainVideoHoleMesh = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 4.6), holeMat);
    this.mainVideoHoleMesh.position.set(0, 4.4, -20.08);
    this.scene.add(this.mainVideoHoleMesh);
  }

  private buildCountdownScreen() {
    this.makeScreenFrame(4.3, 3.3, -6.8, 4.5);
    this.countdownCanvas = document.createElement('canvas');
    this.countdownCanvas.width = 768;
    this.countdownCanvas.height = 576;
    this.countdownTexture = new THREE.CanvasTexture(this.countdownCanvas);
    this.countdownTexture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.0), new THREE.MeshBasicMaterial({ map: this.countdownTexture, toneMapped: false, color: 0xe6e0da }));
    mesh.position.set(-6.8, 4.5, -20.14);
    this.scene.add(mesh);
    this.updateCountdownTexture();
    this.redrawers.push(() => this.updateCountdownTexture());
  }

  private screenBackground(ctx: CanvasRenderingContext2D, W: number, H: number) {
    const t = this.theme;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, t.screenBg);
    g.addColorStop(1, '#1a1114');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = t.screenAccent;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, W - 36, H - 36);
    ctx.globalAlpha = 0.35;
    ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.globalAlpha = 1;
  }

  public updateCountdownTexture() {
    const W = 768;
    const H = 576;
    const t = this.theme;
    const ctx = this.countdownCanvas.getContext('2d')!;
    this.screenBackground(ctx, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.screenAccent;
    ctx.font = `600 30px ${SANS_FONT}`;
    ctx.fillText('ĐẾM NGƯỢC NGÀY VUI', W / 2, 80);
    ctx.fillStyle = t.screenText;
    ctx.font = `76px ${SCRIPT_FONT}`;
    ctx.fillText(`${this.config.groom.split(' ').pop()} & ${this.config.bride.split(' ').pop()}`, W / 2, 158);

    const target = new Date(`${this.config.date}T${this.config.time || '18:00'}:00+07:00`).getTime();
    const diff = target - Date.now();
    if (diff <= 0) {
      ctx.fillStyle = t.screenText;
      ctx.font = `600 46px ${SERIF_FONT}`;
      ctx.fillText('Hôn lễ đang diễn ra', W / 2, 300);
      ctx.fillStyle = t.screenAccent;
      ctx.font = `500 30px ${SANS_FONT}`;
      ctx.fillText('Trăm năm hạnh phúc 💍', W / 2, 370);
    } else {
      const units = [
        [Math.floor(diff / 86400000), 'NGÀY'],
        [Math.floor((diff / 3600000) % 24), 'GIỜ'],
        [Math.floor((diff / 60000) % 60), 'PHÚT'],
        [Math.floor((diff / 1000) % 60), 'GIÂY'],
      ] as const;
      units.forEach(([v, label], i) => {
        const cx = 120 + i * 176;
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.beginPath();
        ctx.roundRect(cx - 74, 236, 148, 150, 18);
        ctx.fill();
        ctx.fillStyle = t.screenText;
        ctx.font = `700 74px ${SERIF_FONT}`;
        ctx.fillText(String(v).padStart(2, '0'), cx, 302);
        ctx.fillStyle = t.screenAccent;
        ctx.font = `600 22px ${SANS_FONT}`;
        ctx.fillText(label, cx, 362);
      });
    }
    const [y, mo, d] = (this.config.date || '2026-11-29').split('-');
    ctx.fillStyle = 'rgba(243,231,214,0.7)';
    ctx.font = `500 26px ${SANS_FONT}`;
    ctx.fillText(`${this.config.time || '18:00'} · ${d}/${mo}/${y} · Sảnh Diamond & Sophia`, W / 2, 480);
    this.countdownTexture.needsUpdate = true;
  }

  // Màn hình bên phải sân khấu: tên ba mẹ hai họ + cô dâu chú rể
  private buildFamilyScreen() {
    this.makeScreenFrame(4.3, 3.3, 6.8, 4.5);
    const c = document.createElement('canvas');
    c.width = 768;
    c.height = 576;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const draw = () => {
      const W = 768;
      const H = 576;
      const t = this.theme;
      const ctx = c.getContext('2d')!;
      this.screenBackground(ctx, W, H);
      const gp = this.config.groomParents || { father: 'Võ Đình Dũng', mother: 'Huỳnh Thị Kim Sự' };
      const bp = this.config.brideParents || { father: 'Thiều Quang Tuệ', mother: 'Lường Thị Liên' };
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = t.screenAccent;
      ctx.font = `600 28px ${SANS_FONT}`;
      ctx.fillText('L Ễ   T H À N H   H Ô N', W / 2, 70);
      ctx.strokeStyle = t.screenAccent;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(150, 100);
      ctx.lineTo(W - 150, 100);
      ctx.moveTo(W / 2, 130);
      ctx.lineTo(W / 2, 250);
      ctx.stroke();
      ctx.globalAlpha = 1;

      // chữ tự thu nhỏ nếu tên dài
      const fit = (text: string, x: number, y: number, maxW: number, size: number, weight: string, font: string) => {
        let s = size;
        ctx.font = `${weight} ${s}px ${font}`;
        while (ctx.measureText(text).width > maxW && s > 14) {
          s -= 1;
          ctx.font = `${weight} ${s}px ${font}`;
        }
        ctx.fillText(text, x, y);
      };
      // 2 cột dùng chung 1 cỡ chữ (lấy cỡ vừa với tên dài nhất)
      const lines = [`Ông  ${gp.father}`, `Bà  ${gp.mother}`, `Ông  ${bp.father}`, `Bà  ${bp.mother}`];
      let nameSize = 28;
      ctx.font = `600 ${nameSize}px ${SANS_FONT}`;
      while (nameSize > 16 && lines.some((l) => ctx.measureText(l).width > 320)) {
        nameSize -= 1;
        ctx.font = `600 ${nameSize}px ${SANS_FONT}`;
      }
      const col = (x: number, title: string, father: string, mother: string) => {
        ctx.fillStyle = t.screenAccent;
        ctx.font = `700 24px ${SANS_FONT}`;
        ctx.fillText(title, x, 145);
        ctx.fillStyle = t.screenText;
        ctx.font = `600 ${nameSize}px ${SANS_FONT}`;
        ctx.fillText(`Ông  ${father}`, x, 195);
        ctx.fillText(`Bà  ${mother}`, x, 237);
      };
      col(W / 4 + 8, 'NHÀ TRAI', gp.father, gp.mother);
      col((W * 3) / 4 - 8, 'NHÀ GÁI', bp.father, bp.mother);

      // Cô dâu chú rể
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(60, 290, W - 120, 170, 24);
      ctx.fill();
      ctx.fillStyle = t.screenAccent;
      ctx.font = `600 22px ${SANS_FONT}`;
      ctx.fillText('CHÚ RỂ', W / 4 + 8, 322);
      ctx.fillText('CÔ DÂU', (W * 3) / 4 - 8, 322);
      ctx.fillStyle = t.screenText;
      fit(this.config.groom, W / 4 + 8, 395, 300, 70, '400', SCRIPT_FONT);
      fit(this.config.bride, (W * 3) / 4 - 8, 395, 300, 70, '400', SCRIPT_FONT);
      ctx.fillStyle = t.screenAccent;
      ctx.font = `46px ${SCRIPT_FONT}`;
      ctx.fillText('&', W / 2, 392);

      const [y, mo, d] = (this.config.date || '2026-11-29').split('-');
      ctx.fillStyle = 'rgba(243,231,214,0.7)';
      ctx.font = `500 24px ${SANS_FONT}`;
      ctx.fillText(`Trân trọng báo tin · ${d}.${mo}.${y}`, W / 2, 505);
      tex.needsUpdate = true;
    };
    draw();
    this.redrawers.push(draw);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.0), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, color: 0xe6e0da }));
    mesh.position.set(6.8, 4.5, -20.14);
    this.scene.add(mesh);
  }

  // Bảng vàng điểm Hỷ: treo ở tường trái, cạnh khu trò chơi (không nằm trên sân khấu)
  private buildLeaderboardScreen() {
    const g = new THREE.Group();
    g.position.set(-19.45, 3.9, -12);
    g.rotation.y = Math.PI / 2; // quay mặt vào giữa sảnh
    const frame = new THREE.Mesh(
      new THREE.BoxGeometry(4.3, 3.3, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xb9975a, metalness: 0.65, roughness: 0.35 })
    );
    g.add(frame);
    this.leaderboardCanvas = document.createElement('canvas');
    this.leaderboardCanvas.width = 768;
    this.leaderboardCanvas.height = 576;
    this.leaderboardTexture = new THREE.CanvasTexture(this.leaderboardCanvas);
    this.leaderboardTexture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.0), new THREE.MeshBasicMaterial({ map: this.leaderboardTexture, toneMapped: false, color: 0xe6e0da }));
    mesh.position.z = 0.09;
    g.add(mesh);
    // cúp vàng nhỏ trên nóc bảng
    const cupMat = new THREE.MeshStandardMaterial({ color: 0xe2bd62, metalness: 0.25, roughness: 0.35, emissive: 0x6a4a10, emissiveIntensity: 0.35 });
    const cup = new THREE.Mesh(
      BufferGeometryUtils.mergeGeometries([
        new THREE.CylinderGeometry(0.2, 0.09, 0.28, 20).translate(0, 0.2, 0),
        new THREE.CylinderGeometry(0.03, 0.04, 0.12, 10).translate(0, 0.0, 0),
        new THREE.CylinderGeometry(0.11, 0.13, 0.05, 16).translate(0, -0.07, 0),
        new THREE.TorusGeometry(0.08, 0.018, 6, 16).translate(-0.21, 0.22, 0),
        new THREE.TorusGeometry(0.08, 0.018, 6, 16).translate(0.21, 0.22, 0),
      ])!,
      cupMat
    );
    cup.position.set(0, 1.83, 0.05);
    g.add(cup);
    this.scene.add(g);
    this.updateLeaderboardTexture([]);
    this.redrawers.push(() => this.updateLeaderboardTexture(this.lastLeaderboard));
  }

  public updateLeaderboardTexture(entries: LeaderboardEntry[]) {
    this.lastLeaderboard = entries;
    const W = 768;
    const H = 576;
    const t = this.theme;
    const ctx = this.leaderboardCanvas.getContext('2d')!;
    this.screenBackground(ctx, W, H);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.screenAccent;
    ctx.font = `600 30px ${SANS_FONT}`;
    ctx.fillText('BẢNG VÀNG ĐIỂM HỶ', W / 2, 72);
    ctx.fillStyle = 'rgba(243,231,214,0.55)';
    ctx.font = `500 20px ${SANS_FONT}`;
    ctx.fillText('Top 10 khách chơi game giỏi nhất', W / 2, 108);

    const top = entries.slice(0, 10);
    if (top.length === 0) {
      ctx.fillStyle = t.screenText;
      ctx.font = `500 28px ${SANS_FONT}`;
      ctx.fillText('Chơi trò chơi để ghi danh lên bảng vàng!', W / 2, 300);
      this.leaderboardTexture.needsUpdate = true;
      return;
    }
    const medals = ['#e6c27a', '#d3d6db', '#d9a27a'];
    top.forEach((e, i) => {
      const col = i < 5 ? 0 : 1;
      const row = i % 5;
      const x0 = 60 + col * 336;
      const y = 168 + row * 74;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(x0, y - 30, 312, 60, 14);
      ctx.fill();
      ctx.fillStyle = medals[i] || 'rgba(243,231,214,0.35)';
      ctx.beginPath();
      ctx.arc(x0 + 32, y, 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = i < 3 ? '#2a1d22' : t.screenText;
      ctx.font = `700 22px ${SANS_FONT}`;
      ctx.fillText(String(i + 1), x0 + 32, y + 1);
      ctx.textAlign = 'left';
      ctx.fillStyle = t.screenText;
      // tên dài: thu nhỏ chữ trước, quá dài mới cắt "…"
      const scoreW = (ctx.font = `700 24px ${SANS_FONT}`, ctx.measureText(String(e.score)).width);
      const maxNameW = 312 - 62 - scoreW - 26;
      let fs = 24;
      ctx.font = `600 ${fs}px ${SANS_FONT}`;
      while (fs > 15 && ctx.measureText(e.name).width > maxNameW) {
        fs -= 1;
        ctx.font = `600 ${fs}px ${SANS_FONT}`;
      }
      let name = e.name;
      if (ctx.measureText(name).width > maxNameW) {
        while (name.length > 1 && ctx.measureText(name + '…').width > maxNameW) name = name.slice(0, -1);
        name += '…';
      }
      ctx.fillText(name, x0 + 62, y + 1);
      ctx.textAlign = 'right';
      ctx.fillStyle = t.screenAccent;
      ctx.font = `700 24px ${SANS_FONT}`;
      ctx.fillText(String(e.score), x0 + 298, y + 1);
      ctx.textAlign = 'center';
    });
    this.leaderboardTexture.needsUpdate = true;
  }

  private setupYoutubeVideo() {
    const ytid = this.config.video?.youtubeId || 'uIlNkfn6NcA';
    const iframe = document.createElement('iframe');
    iframe.width = '820';
    iframe.height = '460';
    iframe.style.border = '0';
    iframe.style.pointerEvents = 'none';
    const origin = window.location.origin;
    iframe.src = `https://www.youtube-nocookie.com/embed/${ytid}?autoplay=1&mute=1&controls=0&disablekb=1&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&cc_load_policy=0&cc_lang_pref=off&hl=vi&enablejsapi=1&loop=1&playlist=${ytid}&origin=${encodeURIComponent(origin)}`;
    iframe.allow = 'autoplay; encrypted-media';
    iframe.id = 'wedding-yt-player';
    this.youtubeIframe = iframe;
    const disableCaptions = () => {
      try {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'unloadModule', args: ['captions'] }), '*');
      } catch {}
    };
    // Dự phòng lặp video: nghe trạng thái từ YouTube, hết video (state 0) thì tua về đầu và phát lại
    const send = (func: string, args: unknown[] = []) => {
      try {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), '*');
      } catch {}
    };
    this.ytSend = send;
    this.onYoutubeMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || typeof e.data !== 'string') return;
      try {
        const msg = JSON.parse(e.data);
        // Trình phát đã sẵn sàng -> áp trạng thái tiếng mong muốn (bật nhạc video)
        if (!this.ytReady && msg.event === 'onReady') {
          this.ytReady = true;
          this.applyVideoSound();
        }
        if (msg.event === 'onError') this.onVideoError?.(Number(msg.info));
        if (msg.event === 'onStateChange' && typeof msg.info === 'number') this.ytState = msg.info;
        if (msg.event === 'infoDelivery' && msg.info) {
          if (typeof msg.info.playerState === 'number') this.ytState = msg.info.playerState;
          if (typeof msg.info.muted === 'boolean') this.ytMuted = msg.info.muted;
        }
        // Đang phát và có tiếng -> báo đã bật được nhạc
        if (this.videoSoundWanted && this.soundBlocked && this.ytState === 1 && !this.ytMuted) {
          this.soundBlocked = false;
          this.onSoundOk?.();
        }
        const ended =
          (msg.event === 'onStateChange' && msg.info === 0) ||
          (msg.event === 'infoDelivery' && msg.info && msg.info.playerState === 0);
        if (ended) {
          send('seekTo', [0, true]);
          send('playVideo');
        }
      } catch {}
    };
    window.addEventListener('message', this.onYoutubeMessage);

    // Lần chạm/bấm tiếp theo của khách (kể cả joystick) -> thử bật tiếng lại.
    // Điện thoại chỉ cho video có tiếng khi có thao tác của người dùng.
    // Chỉ tự thử 1 lần (tránh video khựng mỗi lần chạm joystick trên iPhone); sau đó dùng nút "Bật nhạc"
    let gestureRetried = false;
    this.onUserGesture = () => {
      if (gestureRetried || !this.ytReady) return;
      if (this.videoSoundWanted && this.soundBlocked) {
        gestureRetried = true;
        this.applyVideoSound();
      }
    };
    window.addEventListener('pointerdown', this.onUserGesture, true);
    window.addEventListener('touchend', this.onUserGesture, true);

    // Giữ video luôn chạy: nếu bị dừng (do trình duyệt chặn tiếng, mất mạng...) thì phát tiếp
    this.keepAliveTimer = setInterval(() => {
      if (!this.ytReady) return;
      if (this.ytState === 2 || this.ytState === -1 || this.ytState === 5) {
        if (this.videoSoundWanted && !this.ytMuted) this.ytSend?.('mute');
        this.ytSend?.('playVideo');
      }
    }, 3000);
    iframe.addEventListener('load', () => {
      disableCaptions();
      setTimeout(disableCaptions, 1500);
      // Đăng ký nhận sự kiện từ trình phát YouTube
      try {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'wedding-yt-player' }), '*');
      } catch {}
      setTimeout(() => {
        if (!this.ytReady) {
          this.ytReady = true;
          this.applyVideoSound();
        }
      }, 5000);
    });
    const cssObj = new CSS3DObject(iframe);
    cssObj.scale.set(0.01, 0.01, 0.01);
    cssObj.position.set(0, 4.4, -20.12);
    this.cssScene.add(cssObj);
    this.youtubeCssObject = cssObj;
  }

  public getYoutubeIframe(): HTMLIFrameElement | undefined {
    return this.youtubeIframe;
  }

  /** Bật/tắt tiếng video: tiếng video chính là nhạc của cả sảnh */
  public setVideoSound(on: boolean) {
    this.videoSoundWanted = on;
    this.applyVideoSound();
  }

  private applyVideoSound() {
    if (!this.ytSend) return;
    this.lastSoundApply = Date.now();
    if (this.soundCheckTimer) clearInterval(this.soundCheckTimer);
    if (this.videoSoundWanted) {
      this.ytSend('unMute');
      this.ytSend('setVolume', [85]);
      this.ytSend('playVideo');
      if (!this.ytReady) return; // chưa sẵn sàng: sẽ thử lại khi YouTube báo onReady
      // Theo dõi vài giây: điện thoại chặn tiếng thì video bị DỪNG hoặc vẫn tắt tiếng
      // -> quay về tắt tiếng để video vẫn chạy, báo khách bấm nút để bật nhạc
      const started = Date.now();
      const blocked = () => {
        if (this.soundCheckTimer) clearInterval(this.soundCheckTimer);
        this.ytSend?.('mute');
        this.ytSend?.('playVideo');
        this.soundBlocked = true;
        this.onSoundBlocked?.();
      };
      this.soundCheckTimer = setInterval(() => {
        if (!this.videoSoundWanted) {
          clearInterval(this.soundCheckTimer);
          return;
        }
        const elapsed = Date.now() - started;
        if (this.ytState === 1 && !this.ytMuted) {
          clearInterval(this.soundCheckTimer);
          this.soundBlocked = false;
          this.onSoundOk?.();
        } else if (this.ytState === 2 && elapsed > 600) {
          blocked(); // bị dừng vì bật tiếng không được phép
        } else if (this.ytState === 1 && this.ytMuted && elapsed > 3000) {
          blocked(); // vẫn chạy nhưng không bỏ tắt tiếng được
        } else if (elapsed > 8000) {
          // mạng chậm, video còn đang tải: không kết luận là bị chặn (keepAlive sẽ tự phát tiếp)
          clearInterval(this.soundCheckTimer);
        }
      }, 400);
    } else {
      this.ytSend('mute');
      this.ytSend('playVideo');
    }
  }

  // ---------------- BÀN TIỆC ----------------
  private createChiavariFrameGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const legGeom = new THREE.CylinderGeometry(0.016, 0.012, 0.44, 6);
    for (const [lx, lz] of [[-0.18, 0.18], [0.18, 0.18], [-0.18, -0.18], [0.18, -0.18]]) {
      const g = legGeom.clone();
      g.translate(lx, 0.22, lz);
      parts.push(g);
    }
    for (const [w, d, x, z] of [[0.36, 0.024, 0, 0.18], [0.36, 0.024, 0, -0.18], [0.024, 0.36, -0.18, 0], [0.024, 0.36, 0.18, 0]]) {
      const b = new THREE.BoxGeometry(w, 0.024, d);
      b.translate(x, 0.42, z);
      parts.push(b);
    }
    const upright = new THREE.CylinderGeometry(0.015, 0.014, 0.48, 6);
    for (const x of [-0.18, 0.18]) {
      const u = upright.clone();
      u.translate(x, 0.66, -0.18);
      parts.push(u);
    }
    const topRail = new THREE.CylinderGeometry(0.018, 0.018, 0.38, 6);
    topRail.rotateZ(Math.PI / 2);
    topRail.translate(0, 0.9, -0.18);
    parts.push(topRail);
    const spindle = new THREE.CylinderGeometry(0.009, 0.009, 0.42, 5);
    for (const sx of [-0.09, 0, 0.09]) {
      const s = spindle.clone();
      s.translate(sx, 0.66, -0.18);
      parts.push(s);
    }
    return BufferGeometryUtils.mergeGeometries(parts, false)!;
  }

  private createChairBowGeometry(): THREE.BufferGeometry {
    const sash = new THREE.BoxGeometry(0.4, 0.09, 0.025);
    sash.translate(0, 0.7, -0.19);
    const knot = new THREE.SphereGeometry(0.04, 8, 6);
    knot.translate(0, 0.7, -0.21);
    const tailL = new THREE.BoxGeometry(0.06, 0.26, 0.01);
    tailL.rotateZ(0.15);
    tailL.translate(-0.04, 0.55, -0.21);
    const tailR = new THREE.BoxGeometry(0.06, 0.26, 0.01);
    tailR.rotateZ(-0.15);
    tailR.translate(0.04, 0.55, -0.21);
    const parts = [sash, knot, tailL, tailR].map((g) => (g.index ? g.toNonIndexed() : g));
    return BufferGeometryUtils.mergeGeometries(parts, false)!;
  }

  private buildDiningTables() {
    const t = this.theme;
    const tableCoords = [
      { x: -9, z: -7 },
      { x: 9, z: -7 },
      { x: -9, z: 2 },
      { x: 9, z: 2 },
      { x: -9, z: 11 },
      { x: 9, z: 11 },
    ];

    // Thảm tròn dưới bàn (tông trầm, không chói)
    const mc = document.createElement('canvas');
    mc.width = 512;
    mc.height = 512;
    const m = mc.getContext('2d')!;
    m.beginPath();
    m.arc(256, 256, 250, 0, Math.PI * 2);
    m.fillStyle = t.rugColor;
    m.fill();
    m.strokeStyle = t.rugRing;
    m.lineWidth = 6;
    m.beginPath();
    m.arc(256, 256, 238, 0, Math.PI * 2);
    m.stroke();
    m.lineWidth = 2;
    m.beginPath();
    m.arc(256, 256, 222, 0, Math.PI * 2);
    m.stroke();
    m.globalAlpha = 0.35;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      m.beginPath();
      m.ellipse(256 + Math.cos(a) * 205, 256 + Math.sin(a) * 205, 10, 4, a, 0, Math.PI * 2);
      m.fillStyle = t.rugRing;
      m.fill();
    }
    m.globalAlpha = 1;
    const rugTex = new THREE.CanvasTexture(mc);
    rugTex.colorSpace = THREE.SRGBColorSpace;
    const rugMat = new THREE.MeshStandardMaterial({ map: rugTex, transparent: true, roughness: 0.95 });
    const rugGeom = new THREE.CircleGeometry(3.4, 48);

    const clothMat = new THREE.MeshStandardMaterial({ color: t.tableClothColor, roughness: 0.85 });
    const runnerMat = new THREE.MeshStandardMaterial({ color: t.tableOverlayColor, roughness: 0.5, metalness: 0.25 });
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xfbf8f2, roughness: 0.3 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8a565, metalness: 0.75, roughness: 0.3 });
    const candleMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffb866, emissiveIntensity: 0.9 });
    this.glowMaterials.push(candleMat);

    const clothGeom = new THREE.CylinderGeometry(1.62, 1.72, 0.76, 32, 1, false);
    const runnerGeom = new THREE.CylinderGeometry(1.0, 1.0, 0.012, 32);
    const plateGeom = new THREE.CylinderGeometry(0.15, 0.13, 0.018, 16);
    const standGeom = BufferGeometryUtils.mergeGeometries([
      new THREE.CylinderGeometry(0.16, 0.2, 0.03, 16).translate(0, 0.775, 0),
      new THREE.CylinderGeometry(0.025, 0.035, 0.5, 8).translate(0, 1.02, 0),
      new THREE.CylinderGeometry(0.2, 0.06, 0.06, 16).translate(0, 1.28, 0),
    ])!;
    const candleGeom = new THREE.CylinderGeometry(0.035, 0.035, 0.12, 8);

    const nT = tableCoords.length;
    const cloth = new THREE.InstancedMesh(clothGeom, clothMat, nT);
    const runner = new THREE.InstancedMesh(runnerGeom, runnerMat, nT);
    const stand = new THREE.InstancedMesh(standGeom, goldMat, nT);
    const plates = new THREE.InstancedMesh(plateGeom, plateMat, nT * 8);
    const candles = new THREE.InstancedMesh(candleGeom, candleMat, nT * 3);
    cloth.castShadow = true;
    cloth.receiveShadow = true;

    const chairFrame = new THREE.InstancedMesh(
      this.createChiavariFrameGeometry(),
      new THREE.MeshStandardMaterial({ color: t.chairFrameColor, metalness: 0.7, roughness: 0.32 }),
      nT * 8
    );
    const cushionGeom = new THREE.BoxGeometry(0.42, 0.07, 0.42);
    cushionGeom.translate(0, 0.455, 0);
    const chairCushion = new THREE.InstancedMesh(cushionGeom, new THREE.MeshStandardMaterial({ color: t.chairClothColor, roughness: 0.85 }), nT * 8);
    const chairBow = new THREE.InstancedMesh(this.createChairBowGeometry(), new THREE.MeshStandardMaterial({ color: t.chairBowColor, roughness: 0.6 }), nT * 8);
    chairFrame.castShadow = true;
    chairCushion.castShadow = true;

    const dummy = new THREE.Object3D();
    let ci = 0;
    tableCoords.forEach((c, ti) => {
      const rug = new THREE.Mesh(rugGeom, rugMat);
      rug.rotation.x = -Math.PI / 2;
      rug.position.set(c.x, 0.012, c.z);
      rug.receiveShadow = true;
      this.scene.add(rug);

      dummy.rotation.set(0, 0, 0);
      dummy.position.set(c.x, 0.38, c.z);
      dummy.updateMatrix();
      cloth.setMatrixAt(ti, dummy.matrix);
      dummy.position.set(c.x, 0.765, c.z);
      dummy.updateMatrix();
      runner.setMatrixAt(ti, dummy.matrix);
      dummy.position.set(c.x, 0, c.z);
      dummy.updateMatrix();
      stand.setMatrixAt(ti, dummy.matrix);

      // Hoa cắm trên chân nến vàng giữa bàn
      const center = new THREE.Vector3(c.x, 1.36, c.z);
      this.addFlowerDome(center, 0.32, 26, [t.flowerPalette.primary, t.flowerPalette.secondary, t.flowerPalette.primary]);

      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * Math.PI * 2 + 0.5;
        dummy.position.set(c.x + Math.cos(a) * 0.55, 0.83, c.z + Math.sin(a) * 0.55);
        dummy.updateMatrix();
        candles.setMatrixAt(ti * 3 + k, dummy.matrix);
      }

      this.collisionCircles.push({ x: c.x, z: c.z, r: 1.85 });

      for (let s = 0; s < 8; s++) {
        const angle = (s / 8) * Math.PI * 2;
        dummy.rotation.set(0, 0, 0);
        dummy.position.set(c.x + Math.cos(angle) * 1.32, 0.775, c.z + Math.sin(angle) * 1.32);
        dummy.updateMatrix();
        plates.setMatrixAt(ti * 8 + s, dummy.matrix);

        const cx = c.x + Math.cos(angle) * 2.25;
        const cz = c.z + Math.sin(angle) * 2.25;
        dummy.position.set(cx, 0, cz);
        // ghế quay mặt vào bàn (mặt trước ghế là +Z cục bộ)
        dummy.rotation.y = Math.atan2(c.x - cx, c.z - cz);
        dummy.updateMatrix();
        chairFrame.setMatrixAt(ci, dummy.matrix);
        chairCushion.setMatrixAt(ci, dummy.matrix);
        chairBow.setMatrixAt(ci, dummy.matrix);
        ci++;

        this.tableSeats.push({
          tableIndex: ti,
          seatIndex: s,
          position: new THREE.Vector3(cx, 0, cz),
          lookAt: new THREE.Vector3(c.x, 0.75, c.z),
        });
      }
    });
    this.scene.add(cloth, runner, stand, plates, candles, chairFrame, chairCushion, chairBow);
  }

  // ---------------- LỐI ĐI & CỔNG HOA ----------------
  private buildEntranceAndAisle() {
    const t = this.theme;
    const carpet = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 33), new THREE.MeshStandardMaterial({ color: t.carpetColor, roughness: 0.9 }));
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(0, 0.015, 2.5);
    carpet.receiveShadow = true;
    this.scene.add(carpet);
    const trimMat = new THREE.MeshStandardMaterial({ color: t.carpetBorderColor, metalness: 0.4, roughness: 0.45 });
    for (const x of [-1.72, 1.72]) {
      const tr = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 33), trimMat);
      tr.rotation.x = -Math.PI / 2;
      tr.position.set(x, 0.02, 2.5);
      this.scene.add(tr);
    }

    // Trụ hoa dọc lối đi
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xf2ebe0, roughness: 0.5 });
    const pillarGeom = BufferGeometryUtils.mergeGeometries([
      new THREE.CylinderGeometry(0.18, 0.24, 0.08, 16).translate(0, 0.04, 0),
      new THREE.CylinderGeometry(0.09, 0.12, 1.0, 12).translate(0, 0.55, 0),
      new THREE.CylinderGeometry(0.22, 0.12, 0.12, 16).translate(0, 1.1, 0),
    ])!;
    const pillarSpots: THREE.Vector3[] = [];
    for (const z of [12, 6, 0, -6, -11]) for (const x of [-2.25, 2.25]) pillarSpots.push(new THREE.Vector3(x, 0, z));
    const pillars = new THREE.InstancedMesh(pillarGeom, pillarMat, pillarSpots.length);
    const mm = new THREE.Matrix4();
    pillarSpots.forEach((p, i) => {
      pillars.setMatrixAt(i, mm.makeTranslation(p.x, 0, p.z));
      this.addFlowerDome(new THREE.Vector3(p.x, 1.22, p.z), 0.26, 16, [t.flowerPalette.primary, t.flowerPalette.secondary]);
      this.collisionCircles.push({ x: p.x, z: p.z, r: 0.3 });
    });
    this.scene.add(pillars);

    // Cổng hoa: khung vòm + phủ lá xanh và hoa
    const archGroup = new THREE.Group();
    archGroup.position.set(0, 0, 18);
    const archR = 3.0;
    const frame = new THREE.Mesh(new THREE.TorusGeometry(archR, 0.08, 8, 40, Math.PI), new THREE.MeshStandardMaterial({ color: 0xc8a565, metalness: 0.6, roughness: 0.35 }));
    frame.position.y = 2.6;
    archGroup.add(frame);
    for (const x of [-archR, archR]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.6, 10), frame.material);
      post.position.set(x, 1.3, 0);
      archGroup.add(post);
    }
    this.scene.add(archGroup);
    // Hoa dày ở 2 chân vòm và giữa đỉnh, thưa dần ở 2 vai -> giống cổng hoa thật
    for (let i = 0; i <= 70; i++) {
      const a = (i / 70) * Math.PI;
      const p = new THREE.Vector3(Math.cos(a) * archR, 2.6 + Math.sin(a) * archR, 18);
      const nearTop = Math.abs(a - Math.PI / 2) < 0.45;
      const nearBase = a < 0.7 || a > Math.PI - 0.7;
      if (nearTop || nearBase || i % 3 === 0) {
        this.addFlowerDome(p, nearTop || nearBase ? 0.24 : 0.17, 3, [t.flowerPalette.primary, t.flowerPalette.secondary, t.flowerPalette.primary, t.flowerPalette.accent]);
      }
      for (let k = 0; k < 2; k++)
        this.decoLeaves.push({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 0.3)), scale: 0.1, color: t.flowerPalette.leaf });
    }
    for (const x of [-archR, archR])
      for (let y = 0.15; y < 2.6; y += 0.2) {
        if (y < 0.9 || Math.random() < 0.5) this.addFlowerDome(new THREE.Vector3(x, y, 18), 0.17, 2, [t.flowerPalette.primary, t.flowerPalette.secondary]);
        this.decoLeaves.push({ pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.25, y, 18 + (Math.random() - 0.5) * 0.25), scale: 0.11, color: t.flowerPalette.leaf });
      }
    this.collisionCircles.push({ x: -archR, z: 18, r: 0.35 }, { x: archR, z: 18, r: 0.35 });

    // Bảng tên trên cổng
    const sc = document.createElement('canvas');
    sc.width = 1024;
    sc.height = 300;
    const signTex = new THREE.CanvasTexture(sc);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const drawSign = () => {
      const ctx = sc.getContext('2d')!;
      ctx.clearRect(0, 0, 1024, 300);
      ctx.fillStyle = 'rgba(252,247,240,0.96)';
      ctx.beginPath();
      ctx.roundRect(20, 20, 984, 260, 130);
      ctx.fill();
      ctx.strokeStyle = '#c4a467';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#9a7a4a';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `600 30px ${SANS_FONT}`;
      ctx.fillText('WELCOME TO OUR WEDDING', 512, 80);
      ctx.fillStyle = '#7a2a38';
      ctx.font = `110px ${SCRIPT_FONT}`;
      ctx.fillText(`${this.config.groom.split(' ').pop()} & ${this.config.bride.split(' ').pop()}`, 512, 180);
      signTex.needsUpdate = true;
    };
    drawSign();
    this.redrawers.push(drawSign);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.82), new THREE.MeshStandardMaterial({ map: signTex, transparent: true, roughness: 0.7, side: THREE.DoubleSide }));
    sign.position.set(0, 4.55, 18.1);
    this.scene.add(sign);

    // Standee cô dâu chú rể 2 bên cổng (ảnh tách nền)
    this.addStandee('/media/cutouts/capdoi1_3d.webp', new THREE.Vector3(-5.0, 0, 18.6), 0.25, 1.95);
    this.addStandee('/media/cutouts/capdoi2_3d.webp', new THREE.Vector3(5.0, 0, 18.6), -0.25, 1.95);
  }

  private addStandee(url: string, pos: THREE.Vector3, rotY: number, height: number) {
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = rotY;
    const mat = new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.4, roughness: 0.75, side: THREE.DoubleSide });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    plane.castShadow = true;
    group.add(plane);
    this.texLoader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      mat.map = tex;
      mat.needsUpdate = true;
      const img = tex.image as HTMLImageElement;
      const aspect = img.width / img.height;
      plane.scale.set(height * aspect, height, 1);
      plane.position.y = height / 2 + 0.06;
      this.renderer.shadowMap.needsUpdate = true;
    });
    // đế đứng
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.45), new THREE.MeshStandardMaterial({ color: 0xc8a565, metalness: 0.6, roughness: 0.35 }));
    base.position.y = 0.03;
    group.add(base);
    this.scene.add(group);
    this.collisionCircles.push({ x: pos.x, z: pos.z, r: 0.6 });
  }

  // ---------------- QUẦY & KHU TRÒ CHƠI ----------------
  private makeSignCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const redraw = () => {
      const ctx = c.getContext('2d')!;
      ctx.clearRect(0, 0, w, h);
      draw(ctx);
      tex.needsUpdate = true;
    };
    redraw();
    this.redrawers.push(redraw);
    return tex;
  }

  private buildBoothsAndStalls() {
    const t = this.theme;
    const ivory = new THREE.MeshStandardMaterial({ color: 0xf1e8dc, roughness: 0.6 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xc8a565, metalness: 0.6, roughness: 0.35 });

    // Bàn lễ tân (sổ lưu bút + thùng mừng cưới)
    const recep = new THREE.Group();
    recep.position.copy(this.receptionPosition);
    const desk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.85, 1.0), ivory);
    desk.position.y = 0.425;
    desk.castShadow = true;
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 1.1), gold);
    deskTop.position.y = 0.87;
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.36), new THREE.MeshStandardMaterial({ color: 0x7a2a38, roughness: 0.6 }));
    book.position.set(-0.45, 0.92, 0);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.45, 0.4), new THREE.MeshStandardMaterial({ color: 0x9e2a35, roughness: 0.5 }));
    box.position.set(0.5, 1.12, 0);
    const boxLid = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.06, 0.44), gold);
    boxLid.position.set(0.5, 1.37, 0);
    recep.add(desk, deskTop, book, box, boxLid);
    const recepSign = this.makeSignCanvas(512, 200, (ctx) => {
      ctx.fillStyle = '#fbf6ef';
      ctx.beginPath();
      ctx.roundRect(8, 8, 496, 184, 24);
      ctx.fill();
      ctx.strokeStyle = '#c4a467';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7a2a38';
      ctx.font = `60px ${SCRIPT_FONT}`;
      ctx.fillText('Sổ Lưu Bút', 256, 90);
      ctx.fillStyle = '#8a6a3a';
      ctx.font = `500 24px ${SANS_FONT}`;
      ctx.fillText('Nhấn E để gửi lời chúc', 256, 150);
    });
    const rs = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.47), new THREE.MeshStandardMaterial({ map: recepSign, transparent: true, roughness: 0.7 }));
    rs.position.set(0, 0.45, 0.51);
    recep.add(rs);
    this.scene.add(recep);
    this.collisionObstacles.push({ minX: this.receptionPosition.x - 1.3, maxX: this.receptionPosition.x + 1.3, minZ: this.receptionPosition.z - 0.6, maxZ: this.receptionPosition.z + 0.6, height: 1.2 });

    // Quầy hỷ (cửa hàng)
    const shop = new THREE.Group();
    shop.position.copy(this.shopPosition);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.9, 1.0), ivory);
    counter.position.y = 0.45;
    counter.castShadow = true;
    const ctop = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.05, 1.1), gold);
    ctop.position.y = 0.92;
    shop.add(counter, ctop);
    const shopSign = this.makeSignCanvas(512, 200, (ctx) => {
      ctx.fillStyle = '#fbf6ef';
      ctx.beginPath();
      ctx.roundRect(8, 8, 496, 184, 24);
      ctx.fill();
      ctx.strokeStyle = '#c4a467';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7a2a38';
      ctx.font = `60px ${SCRIPT_FONT}`;
      ctx.fillText('Tiệm Hỷ', 256, 90);
      ctx.fillStyle = '#8a6a3a';
      ctx.font = `500 24px ${SANS_FONT}`;
      ctx.fillText('Đổi điểm lấy hoa & trang phục', 256, 150);
    });
    const ss = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.47), new THREE.MeshStandardMaterial({ map: shopSign, transparent: true, roughness: 0.7 }));
    ss.position.set(0, 0.45, 0.51);
    shop.add(ss);
    this.scene.add(shop);
    this.addFlowerDome(new THREE.Vector3(this.shopPosition.x - 0.8, 1.05, this.shopPosition.z), 0.2, 10, [t.flowerPalette.primary, t.flowerPalette.secondary]);
    this.addFlowerDome(new THREE.Vector3(this.shopPosition.x + 0.8, 1.05, this.shopPosition.z), 0.2, 10, [t.flowerPalette.secondary, t.flowerPalette.accent]);
    this.collisionObstacles.push({ minX: this.shopPosition.x - 1.35, maxX: this.shopPosition.x + 1.35, minZ: this.shopPosition.z - 0.6, maxZ: this.shopPosition.z + 0.6, height: 1.2 });

    // Khu trò chơi (bên trái)
    const marquee = this.makeSignCanvas(1024, 128, (ctx) => {
      ctx.fillStyle = t.screenBg;
      ctx.beginPath();
      ctx.roundRect(4, 4, 1016, 120, 30);
      ctx.fill();
      ctx.strokeStyle = t.screenAccent;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = t.screenText;
      ctx.font = `600 38px ${SANS_FONT}`;
      ctx.fillText('KHU TRÒ CHƠI · NHẬN ĐIỂM HỶ', 512, 62);
      ctx.fillStyle = t.screenAccent;
      ctx.font = `500 22px ${SANS_FONT}`;
      ctx.fillText('Chơi game, tích điểm, tặng hoa cho cô dâu chú rể', 512, 100);
    });
    const marqueeMesh = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.5), new THREE.MeshStandardMaterial({ map: marquee, roughness: 0.6, transparent: true }));
    marqueeMesh.rotation.y = Math.PI / 2;
    marqueeMesh.position.set(-16.8, 3.6, 2.5);
    this.scene.add(marqueeMesh);

    const boothsData = [
      { id: 'jigsaw', title: 'Ghép Hình Cưới', icon: '🧩', reward: '+10 ~ +35 điểm', desc: 'Ghép ảnh cưới Duy ♥ Tâm', color: '#c97a8e', pos: new THREE.Vector3(-14, 0, -5) },
      { id: 'cards', title: 'Lật Thẻ Trí Nhớ', icon: '🃏', reward: '+10 ~ +25 điểm', desc: 'Tìm các cặp thẻ giống nhau', color: '#8e7fb3', pos: new THREE.Vector3(-14, 0, 0) },
      { id: 'quiz', title: 'Đố Vui Tình Yêu', icon: '❓', reward: '+5 ~ +50 điểm', desc: 'Bạn hiểu Duy & Tâm bao nhiêu?', color: '#c59a55', pos: new THREE.Vector3(-14, 0, 5) },
      { id: 'hearts', title: 'Bắt Tim Hạnh Phúc', icon: '💘', reward: '+15 điểm', desc: 'Hứng tim gửi lời chúc phúc', color: '#b8606a', pos: new THREE.Vector3(-14, 0, 10) },
    ];
    const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x4a3328, roughness: 0.55 });
    boothsData.forEach((b) => {
      const g = new THREE.Group();
      g.position.copy(b.pos);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(1.0, 1.5, 40),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color), transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.02;
      g.add(ring);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.95, 1.5), cabinetMat);
      cab.position.y = 0.475;
      cab.castShadow = true;
      g.add(cab);
      const tex = this.makeSignCanvas(512, 400, (ctx) => {
        ctx.fillStyle = '#fbf6ef';
        ctx.beginPath();
        ctx.roundRect(6, 6, 500, 388, 28);
        ctx.fill();
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.roundRect(6, 6, 500, 86, [28, 28, 0, 0]);
        ctx.fill();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.font = `600 26px ${SANS_FONT}`;
        ctx.fillText('MINI GAME', 256, 50);
        ctx.font = `64px "Segoe UI Emoji", sans-serif`;
        ctx.fillText(b.icon, 256, 150);
        ctx.fillStyle = '#4a2a2e';
        ctx.font = `700 38px ${SANS_FONT}`;
        ctx.fillText(b.title, 256, 222);
        ctx.fillStyle = '#7a6a60';
        ctx.font = `500 22px ${SANS_FONT}`;
        ctx.fillText(b.desc, 256, 266);
        ctx.fillStyle = b.color;
        ctx.font = `700 26px ${SANS_FONT}`;
        ctx.fillText(b.reward, 256, 312);
        ctx.fillStyle = '#9a8a80';
        ctx.font = `500 20px ${SANS_FONT}`;
        ctx.fillText('Nhấn E hoặc chạm để chơi', 256, 354);
      });
      const screenMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.1), screenMat);
      screen.position.set(0.52, 1.55, 0);
      screen.rotation.y = Math.PI / 2;
      g.add(screen);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.25, 1.55), cabinetMat);
      back.position.set(0.46, 1.55, 0);
      g.add(back);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshStandardMaterial({ color: new THREE.Color(b.color), emissive: new THREE.Color(b.color), emissiveIntensity: 0.6, roughness: 0.3 }));
      lamp.position.set(0.5, 2.35, 0);
      g.add(lamp);
      this.scene.add(g);
      this.boothLocations.push({ id: b.id, name: `${b.icon} ${b.title}`, position: b.pos, radius: 2.8 });
      this.collisionObstacles.push({ minX: b.pos.x - 0.6, maxX: b.pos.x + 0.6, minZ: b.pos.z - 0.85, maxZ: b.pos.z + 0.85, height: 2.2 });
    });

    // Góc chụp ảnh ghép cùng cô dâu chú rể
    const pb = new THREE.Group();
    pb.position.set(14.5, 0, 14);
    const mat = new THREE.Mesh(new THREE.CircleGeometry(1.6, 40), new THREE.MeshStandardMaterial({ color: t.carpetColor, roughness: 0.9 }));
    mat.rotation.x = -Math.PI / 2;
    mat.position.y = 0.015;
    pb.add(mat);
    const kiosk = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 0.9), ivory);
    kiosk.position.set(0, 0.5, -0.6);
    kiosk.castShadow = true;
    pb.add(kiosk);
    const pbTex = this.makeSignCanvas(512, 300, (ctx) => {
      ctx.fillStyle = '#fbf6ef';
      ctx.beginPath();
      ctx.roundRect(6, 6, 500, 288, 26);
      ctx.fill();
      ctx.strokeStyle = '#c4a467';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.fillStyle = '#7a2a38';
      ctx.font = `66px ${SCRIPT_FONT}`;
      ctx.fillText('Photo Booth', 256, 100);
      ctx.fillStyle = '#4a2a2e';
      ctx.font = `600 26px ${SANS_FONT}`;
      ctx.fillText('Chụp ảnh cùng Duy & Tâm', 256, 170);
      ctx.fillStyle = '#9a8a80';
      ctx.font = `500 22px ${SANS_FONT}`;
      ctx.fillText('Nhấn E hoặc chạm để mở', 256, 230);
    });
    const pbSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.82), new THREE.MeshStandardMaterial({ map: pbTex, roughness: 0.7 }));
    pbSign.position.set(0, 1.5, -0.6);
    pb.add(pbSign);
    const camBody = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.24), new THREE.MeshStandardMaterial({ color: 0x2b2420, roughness: 0.4 }));
    camBody.position.set(0, 2.1, -0.6);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.12, 16), gold);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(0, 2.1, -0.45);
    pb.add(camBody, lens);
    this.scene.add(pb);
    this.addStandee('/media/cutouts/capdoi3_3d.webp', new THREE.Vector3(16.6, 0, 15.6), -0.9, 1.9);
    this.boothLocations.push({ id: 'photobooth', name: '📸 Góc Chụp Ảnh Cùng Cô Dâu Chú Rể', position: new THREE.Vector3(14.5, 0, 14), radius: 3.0 });
    this.collisionObstacles.push({ minX: 13.8, maxX: 15.2, minZ: 13.0, maxZ: 13.9, height: 2.2 });
  }

  // ---------------- ẢNH CƯỚI ----------------
  private makePhotoFrame(url: string, title: string, w: number, h: number) {
    const group = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xc4a265, metalness: 0.6, roughness: 0.38 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.22, h + 0.22, 0.08), frameMat);
    frame.castShadow = true;
    const mat = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.08, h + 0.08), new THREE.MeshStandardMaterial({ color: 0xf7f1e7, roughness: 0.9 }));
    mat.position.z = 0.042;
    const picMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 });
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(w, h), picMat);
    pic.position.z = 0.045;
    group.add(frame, mat, pic);
    this.texLoader.load(url, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      picMat.map = tex;
      picMat.needsUpdate = true;
    });
    this.photoWallObjects.push({ mesh: pic, url, title });
    return group;
  }

  private buildPhotoDisplays() {
    const thumb = (f: string) => `/media/photos/thumb/${f}.webp`;
    // 5 ảnh lớn treo tường phải, giữa các khoang rèm
    const wallZ = [-12, -4, 4, 12, 20];
    WEDDING_PHOTOS.slice(0, 5).forEach((p, i) => {
      const fr = this.makePhotoFrame(thumb(p.file), p.title, 2.0, 3.0);
      fr.position.set(19.55, 3.7, wallZ[i]);
      fr.rotation.y = -Math.PI / 2;
      this.scene.add(fr);
      // đèn rọi tranh (chỉ là chụp đèn phát sáng, không thêm đèn thật)
    });

    // 4 ảnh trên giá vẽ (easel) dọc lối đi gần cổng và sân khấu
    const easelMat = new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.7 });
    const legGeom = new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6);
    const easels = [
      { x: -3.6, z: 15.2, ry: 0.5 },
      { x: 3.6, z: 15.2, ry: -0.5 },
      { x: -11.2, z: -11.0, ry: 0.75 },
      { x: 11.2, z: -11.0, ry: -0.75 },
    ];
    WEDDING_PHOTOS.slice(5, 9).forEach((p, i) => {
      const e = easels[i];
      const g = new THREE.Group();
      g.position.set(e.x, 0, e.z);
      g.rotation.y = e.ry;
      for (const [lx, lz, rz, rx] of [[-0.35, 0.08, -0.12, 0.08], [0.35, 0.08, 0.12, 0.08], [0, -0.35, 0, -0.32]]) {
        const leg = new THREE.Mesh(legGeom, easelMat);
        leg.position.set(lx, 1.02, lz);
        leg.rotation.set(rx, 0, rz);
        g.add(leg);
      }
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.12), easelMat);
      shelf.position.set(0, 0.62, 0.14);
      g.add(shelf);
      const fr = this.makePhotoFrame(thumb(p.file), p.title, 0.85, 1.28);
      fr.position.set(0, 1.36, 0.16);
      fr.rotation.x = -0.1;
      g.add(fr);
      this.scene.add(g);
      this.collisionCircles.push({ x: e.x, z: e.z, r: 0.5 });
    });
  }

  private buildGardenCorner() {
    // Xích đu hoa trong góc sảnh
    const t = this.theme;
    const sw = new THREE.Group();
    sw.position.set(14, 0, 26);
    const wood = new THREE.MeshStandardMaterial({ color: 0xe9dfd2, roughness: 0.6 });
    for (const x of [-1.2, 1.2]) {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 3.4, 10), wood);
      p.position.set(x, 1.7, 0);
      sw.add(p);
      this.addFlowerDome(new THREE.Vector3(14 + x, 3.3, 26), 0.3, 8, [t.flowerPalette.primary, t.flowerPalette.secondary]);
    }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 2.6, 10), wood);
    bar.rotation.z = Math.PI / 2;
    bar.position.y = 3.35;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.07, 0.45), new THREE.MeshStandardMaterial({ color: t.chairClothColor, roughness: 0.8 }));
    seat.position.y = 0.8;
    for (const x of [-0.55, 0.55]) {
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 2.55, 4), wood);
      rope.position.set(x, 2.08, 0);
      sw.add(rope);
    }
    sw.add(bar, seat);
    this.scene.add(sw);
    for (let x = -1.1; x <= 1.1; x += 0.25) {
      this.addFlowerAt(new THREE.Vector3(14 + x, 3.42, 26 + (Math.random() - 0.5) * 0.1), 0.07, x > 0 ? t.flowerPalette.primary : t.flowerPalette.secondary);
      this.decoLeaves.push({ pos: new THREE.Vector3(14 + x, 3.35, 26.1), scale: 0.12, color: t.flowerPalette.leaf });
    }
    this.boothLocations.push({ id: 'photo_swing', name: '🌸 Xích Đu Hoa', position: new THREE.Vector3(14, 0, 26), radius: 2.6 });
  }

  // ---------------- HOA TRANG TRÍ (instanced) ----------------
  private addFlowerAt(pos: THREE.Vector3, scale: number, color: number) {
    this.decoFlowers.push({ pos, scale, color });
  }

  // Cụm hoa hình vòm (cắm bàn, trụ, cổng)
  private addFlowerDome(center: THREE.Vector3, radius: number, count: number, colors: number[]) {
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / Math.max(1, count - 1)) * 0.9; // nửa cầu trên
      const r = Math.sqrt(1 - y * y);
      const th = golden * i;
      const p = new THREE.Vector3(Math.cos(th) * r * radius, y * radius * 0.75, Math.sin(th) * r * radius).add(center);
      this.decoFlowers.push({ pos: p, scale: radius * (0.32 + Math.random() * 0.1), color: colors[i % colors.length] });
      if (i % 3 === 0) {
        const lp = new THREE.Vector3(Math.cos(th) * radius * 1.05, -radius * 0.05, Math.sin(th) * radius * 1.05).add(center);
        this.decoLeaves.push({ pos: lp, scale: radius * 0.4, color: this.theme.flowerPalette.leaf });
      }
    }
  }

  private buildDecorFlowers() {
    const roseGeom = new THREE.IcosahedronGeometry(1, 1);
    roseGeom.scale(1, 0.8, 1);
    const fMat = new THREE.MeshStandardMaterial({ roughness: 0.75 });
    const flowers = new THREE.InstancedMesh(roseGeom, fMat, this.decoFlowers.length);
    const d = new THREE.Object3D();
    const c = new THREE.Color();
    this.decoFlowers.forEach((f, i) => {
      d.position.copy(f.pos);
      d.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
      d.scale.setScalar(f.scale);
      d.updateMatrix();
      flowers.setMatrixAt(i, d.matrix);
      flowers.setColorAt(i, c.setHex(f.color));
    });
    this.scene.add(flowers);

    const leafGeom = new THREE.SphereGeometry(1, 6, 4);
    leafGeom.scale(0.55, 0.18, 1);
    const leaves = new THREE.InstancedMesh(leafGeom, new THREE.MeshStandardMaterial({ roughness: 0.8 }), this.decoLeaves.length);
    this.decoLeaves.forEach((f, i) => {
      d.position.copy(f.pos);
      d.rotation.set(Math.random() * 1.2 - 0.6, Math.random() * Math.PI * 2, Math.random() * 0.8 - 0.4);
      d.scale.setScalar(f.scale);
      d.updateMatrix();
      leaves.setMatrixAt(i, d.matrix);
      leaves.setColorAt(i, c.setHex(f.color).multiplyScalar(0.8 + Math.random() * 0.3));
    });
    this.scene.add(leaves);
  }

  private buildPetals() {
    const petalGeom = new THREE.CircleGeometry(0.06, 6);
    petalGeom.scale(1, 1.4, 1);
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.25, transparent: true, opacity: 0.9 });
    this.fallingPetalsMesh = new THREE.InstancedMesh(petalGeom, petalMat, this.petalCount);
    // 50% cánh hoa hồng, 25% kim tuyến vàng, 25% kim tuyến bạc
    const pc = new THREE.Color();
    for (let i = 0; i < this.petalCount; i++) {
      this.fallingPetalsMesh.setColorAt(i, pc.setHex(i % 4 === 0 ? 0xe8c46a : i % 4 === 1 ? 0xdfe3e8 : i % 2 ? 0xf0c4c8 : 0xfbeef0));
    }
    for (let i = 0; i < this.petalCount; i++) {
      this.petalData.push({
        x: (Math.random() - 0.5) * 14,
        y: 0.5 + Math.random() * 8,
        z: -14 + Math.random() * 32,
        vy: 0.35 + Math.random() * 0.45,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
      });
    }
    this.scene.add(this.fallingPetalsMesh);
  }

  // ---------------- HOA SÂN KHẤU (trắng & hồng) ----------------
  private buildStageFlowers() {
    const W = 0xfbf7f2; // trắng kem
    const P1 = 0xf2c4cc; // hồng phấn
    const P2 = 0xe7a0b0; // hồng đậm hơn
    const mix = [W, P1, W, P2, W, P1];
    const leaf = this.theme.flowerPalette.leaf;

    // 1. Viền hoa dọc mép trước sân khấu (chừa lối cầu thang giữa)
    for (let x = -8.7; x <= 8.7; x += 0.42) {
      if (Math.abs(x) < 2.5) continue;
      this.addFlowerDome(new THREE.Vector3(x, 1.22, -14.25), 0.24, 5, mix);
    }
    // 2 cụm lớn ở 2 bên đầu cầu thang
    for (const x of [-2.65, 2.65]) this.addFlowerDome(new THREE.Vector3(x, 1.25, -14.4), 0.5, 26, mix);

    // 2. Hàng hoa dưới chân màn hình chính
    for (let x = -4.3; x <= 4.3; x += 0.36) {
      this.addFlowerDome(new THREE.Vector3(x, 1.3, -19.9), 0.3, 6, mix);
      if (Math.abs(x) > 3.2) this.addFlowerDome(new THREE.Vector3(x, 1.75, -19.95), 0.26, 4, mix);
    }

    // 3. Hai trụ hoa cao 2 bên màn hình
    const standMat = new THREE.MeshStandardMaterial({ color: 0xf3ece2, roughness: 0.4 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xc8a565, metalness: 0.7, roughness: 0.3 });
    for (const x of [-4.95, 4.95]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.4, 16), standMat);
      col.position.set(x, 1.9, -19.4);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.18, 0.18, 20), goldMat);
      bowl.position.set(x, 2.65, -19.4);
      this.scene.add(col, bowl);
      this.addFlowerDome(new THREE.Vector3(x, 2.72, -19.4), 0.62, 46, mix);
      // hoa rủ xuống 2 bên
      for (let k = 0; k < 6; k++) {
        const side = k % 2 ? 1 : -1;
        this.addFlowerAt(new THREE.Vector3(x + side * (0.45 + k * 0.03), 2.55 - k * 0.12, -19.25), 0.09, k % 3 ? W : P1);
        this.decoLeaves.push({ pos: new THREE.Vector3(x + side * 0.5, 2.5 - k * 0.12, -19.3), scale: 0.1, color: leaf });
      }
      this.collisionCircles.push({ x, z: -19.4, r: 0.6 });
    }

    // 4. Bốn góc sân khấu: lẵng hoa lớn
    for (const [x, z] of [[-8.4, -14.8], [8.4, -14.8], [-8.4, -21.2], [8.4, -21.2]]) {
      this.addFlowerDome(new THREE.Vector3(x, 1.25, z), 0.55, 30, mix);
      this.collisionCircles.push({ x, z, r: 0.6 });
    }

    // 5. Dải hoa vắt ngang phía trên khung màn hình chính
    for (let i = 0; i <= 26; i++) {
      const t = i / 26;
      const x = -4.4 + t * 8.8;
      const y = 6.95 + Math.sin(t * Math.PI) * 0.18;
      this.addFlowerDome(new THREE.Vector3(x, y, -20.05), 0.2, 3, mix);
      if (i % 2 === 0) this.decoLeaves.push({ pos: new THREE.Vector3(x, y - 0.12, -19.98), scale: 0.09, color: leaf });
    }
  }

  // ---------------- BÓNG BAY GOLD & BẠC ----------------
  private buildBalloons() {
    // Môi trường phản chiếu để bóng kim loại sáng bóng (chỉ áp cho bóng bay)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const geo = new THREE.SphereGeometry(1, 20, 14);
    geo.scale(1, 1.15, 1);
    const knot = new THREE.ConeGeometry(0.12, 0.18, 8);
    knot.translate(0, -1.2, 0);
    const balloonGeom = BufferGeometryUtils.mergeGeometries([geo.toNonIndexed(), knot.toNonIndexed()])!;

    const gold = new THREE.MeshStandardMaterial({ color: 0xe7c36a, metalness: 1, roughness: 0.2, envMap: envTex, envMapIntensity: 1.1 });
    const silver = new THREE.MeshStandardMaterial({ color: 0xe6e9ee, metalness: 1, roughness: 0.16, envMap: envTex, envMapIntensity: 1.1 });
    const pearl = new THREE.MeshStandardMaterial({ color: 0xfbf3f0, metalness: 0.35, roughness: 0.25, envMap: envTex, envMapIntensity: 0.8 });

    type B = { pos: THREE.Vector3; r: number; float?: boolean };
    const lists: Record<'gold' | 'silver' | 'pearl', B[]> = { gold: [], silver: [], pearl: [] };
    const pick = (i: number): 'gold' | 'silver' | 'pearl' => (i % 3 === 0 ? 'gold' : i % 3 === 1 ? 'silver' : 'pearl');
    const strings: number[] = [];

    // 1. Hai cột bóng đứng dưới sàn, 2 bên mép trước sân khấu (chồng nhiều tầng, mỗi tầng 4 quả)
    const colZ = -14.4;
    for (const x of [-10.1, 10.1]) {
      for (let lvl = 0; lvl < 10; lvl++) {
        const y = 0.3 + lvl * 0.34;
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + lvl * 0.4;
          lists[pick(lvl + k)].push({ pos: new THREE.Vector3(x + Math.cos(a) * 0.22, y, colZ + Math.sin(a) * 0.22), r: 0.2 });
        }
      }
      // chùm trên đỉnh cột
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = k === 6 ? 0 : 0.3;
        lists[pick(k)].push({ pos: new THREE.Vector3(x + Math.cos(a) * rr, 3.85 + (k % 2) * 0.15 + (k === 6 ? 0.3 : 0), colZ + Math.sin(a) * rr), r: 0.25 });
      }
      this.collisionCircles.push({ x, z: colZ, r: 0.5 });
    }

    // 2. Chùm bóng bay lơ lửng có dây: 2 góc trước sân khấu + 2 bên cổng hoa
    const bunches: Array<[number, number, number, number]> = [
      [-7.2, 1.2, -15.2, 9],
      [7.2, 1.2, -15.2, 9],
      [-4.2, 0, 19.0, 7],
      [4.2, 0, 19.0, 7],
    ];
    for (const [bx, by, bz, n] of bunches) {
      for (let k = 0; k < n; k++) {
        const a = k * 2.399;
        const rr = 0.25 + (k % 3) * 0.15;
        const top = new THREE.Vector3(bx + Math.cos(a) * rr, by + 2.6 + (k % 4) * 0.28, bz + Math.sin(a) * rr);
        lists[pick(k)].push({ pos: top, r: 0.26, float: true });
        // dây buộc xuống quả tạ
        strings.push(bx, by + 0.15, bz, top.x, top.y - 0.32, top.z);
      }
      // quả tạ giữ bóng
      const weight = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), gold);
      weight.position.set(bx, by + 0.1, bz);
      this.scene.add(weight);
    }

    const dummy = new THREE.Object3D();
    (Object.keys(lists) as Array<'gold' | 'silver' | 'pearl'>).forEach((k) => {
      const arr = lists[k];
      const mat = k === 'gold' ? gold : k === 'silver' ? silver : pearl;
      const mesh = new THREE.InstancedMesh(balloonGeom, mat, arr.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      arr.forEach((b, i) => {
        dummy.position.copy(b.pos);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(b.r);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        if (b.float) this.floatBalloons.push({ mesh, idx: i, base: b.pos.clone(), phase: Math.random() * Math.PI * 2, s: new THREE.Vector3(b.r, b.r, b.r) });
      });
      mesh.castShadow = false;
      this.scene.add(mesh);
      this.balloonMeshes.push(mesh);
    });

    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(strings, 3));
    this.scene.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0xf3ece2, transparent: true, opacity: 0.7 })));

    for (const [bx, , bz] of bunches) this.collisionCircles.push({ x: bx, z: bz, r: 0.35 });
  }

  // ---------------- KIM TUYẾN LẤP LÁNH ----------------
  private buildGlitter() {
    // Hạt lấp lánh hình ngôi sao 4 cánh, cộng sáng (additive) -> lung linh, nhất là ban đêm
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.15)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.moveTo(32, 2);
    ctx.lineTo(35, 29);
    ctx.lineTo(62, 32);
    ctx.lineTo(35, 35);
    ctx.lineTo(32, 62);
    ctx.lineTo(29, 35);
    ctx.lineTo(2, 32);
    ctx.lineTo(29, 29);
    ctx.closePath();
    ctx.fill();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;

    const N = 420;
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const palette = [0xf2d48a, 0xe7c36a, 0xf6f2ea, 0xdfe3ea, 0xf3c9d2];
    for (let i = 0; i < N; i++) {
      // 60% quanh sân khấu, 40% dọc lối đi
      const onStage = i < N * 0.6;
      pos[i * 3] = onStage ? (Math.random() - 0.5) * 18 : (Math.random() - 0.5) * 7;
      pos[i * 3 + 1] = 1.3 + Math.random() * 7.5;
      pos[i * 3 + 2] = onStage ? -21 + Math.random() * 8 : -13 + Math.random() * 31;
      const base = new THREE.Color(palette[i % palette.length]);
      this.glitterData.push({ vy: 0.08 + Math.random() * 0.22, phase: Math.random() * Math.PI * 2, speed: 2 + Math.random() * 5, base });
      col[i * 3] = base.r;
      col[i * 3 + 1] = base.g;
      col[i * 3 + 2] = base.b;
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geom.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: 0.13,
      map: tex,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });
    this.glitter = new THREE.Points(geom, mat);
    this.glitter.frustumCulled = false;
    this.scene.add(this.glitter);
  }

  private updateGlitterAndBalloons(delta: number) {
    this.glitterTime += delta;
    const t = this.glitterTime;
    if (this.glitter) {
      const pos = this.glitter.geometry.attributes.position as THREE.BufferAttribute;
      const col = this.glitter.geometry.attributes.color as THREE.BufferAttribute;
      for (let i = 0; i < this.glitterData.length; i++) {
        const d = this.glitterData[i];
        let y = pos.getY(i) - d.vy * delta;
        if (y < 0.6) y = 8.8;
        pos.setY(i, y);
        pos.setX(i, pos.getX(i) + Math.sin(t * 0.6 + d.phase) * delta * 0.05);
        // nhấp nháy: lúc sáng loé, lúc mờ
        const tw = Math.pow(0.5 + 0.5 * Math.sin(t * d.speed + d.phase), 3);
        const k = 0.25 + tw * 1.1;
        col.setXYZ(i, d.base.r * k, d.base.g * k, d.base.b * k);
      }
      pos.needsUpdate = true;
      col.needsUpdate = true;
    }
    if (this.floatBalloons.length) {
      const dummy = this.petalDummy;
      for (const b of this.floatBalloons) {
        dummy.position.set(b.base.x + Math.sin(t * 0.7 + b.phase) * 0.05, b.base.y + Math.sin(t * 1.1 + b.phase) * 0.07, b.base.z);
        dummy.rotation.set(Math.sin(t * 0.8 + b.phase) * 0.08, 0, Math.cos(t * 0.6 + b.phase) * 0.08);
        dummy.scale.copy(b.s);
        dummy.updateMatrix();
        b.mesh.setMatrixAt(b.idx, dummy.matrix);
      }
      this.balloonMeshes.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    }
  }

  // ---------------- QUÀ KHÁCH TẶNG (dưới chân sân khấu, 2 bên thảm đỏ) ----------------
  private giftGeomCache = new Map<string, THREE.BufferGeometry>();
  private giftMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  private giftLabelCache = new Map<string, THREE.Mesh>();
  // chiều cao (đặt bảng tên người tặng) & bán kính va chạm của từng món
  private static GIFT_SCALE = 1.3; // phóng to toàn bộ quà
  private static GIFT_INFO: Record<string, { h: number; r: number; s?: number }> = {
    rose: { h: 1.08, r: 0.32 },
    envelope: { h: 1.18, r: 0.4 },
    hydrangea: { h: 0.92, r: 0.42 },
    noodles: { h: 0.82, r: 0.42 },
    detergent: { h: 0.74, r: 0.36 },
    piggy: { h: 0.66, r: 0.4 },
    gift_box: { h: 0.86, r: 0.42 },
    teddy: { h: 1.12, r: 0.45 },
    rice_cooker: { h: 0.66, r: 0.38 },
    diapers: { h: 0.66, r: 0.36 },
    washing_machine: { h: 0.88, r: 0.44 },
    car: { h: 0.98, r: 0.62, s: 1.12 }, // xe hoa to hơn nữa
  };

  private giftGeometry(type: string) {
    const hit = this.giftGeomCache.get(type);
    if (hit) return hit;
    const parts: THREE.BufferGeometry[] = [];
    const P = (g: THREE.BufferGeometry, hex: number) => parts.push(colorGeom(g, hex));
    const sph = (rx: number, ry: number, rz: number, x: number, y: number, z: number, hex: number, seg = 16) =>
      P(new THREE.SphereGeometry(1, seg, Math.max(6, Math.round(seg * 0.6))).scale(rx, ry, rz).translate(x, y, z), hex);
    const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) =>
      P(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);
    const cyl = (rt: number, rb: number, h: number, x: number, y: number, z: number, hex: number, seg = 20) =>
      P(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y, z), hex);
    const up = new THREE.Vector3(0, 1, 0);
    const rod = (a: THREE.Vector3, b: THREE.Vector3, r: number, hex: number) => {
      const dir = b.clone().sub(a);
      const g = new THREE.CylinderGeometry(r, r, dir.length(), 8).translate(0, dir.length() / 2, 0);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
      P(g.translate(a.x, a.y, a.z), hex);
    };
    // bông hồng: nụ + vòng cánh ngoài
    const rose = (x: number, y: number, z: number, r: number, hex: number) => {
      P(new THREE.IcosahedronGeometry(r * 0.75, 1).translate(x, y + r * 0.1, z), hex);
      P(new THREE.TorusGeometry(r * 0.72, r * 0.38, 6, 12).rotateX(Math.PI / 2).translate(x, y - r * 0.12, z), shade(hex, 0.86));
    };
    // nơ (hướng ra phía trước +z)
    const bow = (x: number, y: number, z: number, s: number, hex: number) => {
      P(new THREE.TorusGeometry(0.075 * s, 0.028 * s, 6, 14).scale(1, 0.7, 0.6).rotateZ(0.45).translate(x - 0.075 * s, y + 0.01 * s, z), hex);
      P(new THREE.TorusGeometry(0.075 * s, 0.028 * s, 6, 14).scale(1, 0.7, 0.6).rotateZ(-0.45).translate(x + 0.075 * s, y + 0.01 * s, z), hex);
      P(new THREE.BoxGeometry(0.03 * s, 0.11 * s, 0.02 * s).rotateZ(0.35).translate(x - 0.035 * s, y - 0.07 * s, z), hex);
      P(new THREE.BoxGeometry(0.03 * s, 0.11 * s, 0.02 * s).rotateZ(-0.35).translate(x + 0.035 * s, y - 0.07 * s, z), hex);
      sph(0.038 * s, 0.038 * s, 0.03 * s, x, y, z + 0.005 * s, shade(hex, 0.9), 10);
    };
    const GOLD = 0xd6b067;
    const RED = 0xc0263f;
    const PINK = 0xf0a5b5;
    const WHITE = 0xfbf6ee;
    const LEAF = 0x5e7f4f;

    if (type === 'rose') {
      // Bình hoa hồng
      cyl(0.13, 0.11, 0.05, 0, 0.025, 0, GOLD);
      cyl(0.16, 0.11, 0.4, 0, 0.25, 0, 0xf4efe6);
      cyl(0.11, 0.16, 0.1, 0, 0.5, 0, 0xf4efe6);
      P(new THREE.TorusGeometry(0.155, 0.012, 6, 24).rotateX(Math.PI / 2).translate(0, 0.43, 0), GOLD);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        P(new THREE.SphereGeometry(1, 8, 5).scale(0.13, 0.02, 0.05).rotateY(-a).rotateZ(0.5 * Math.cos(a)).translate(Math.cos(a) * 0.13, 0.6, Math.sin(a) * 0.13), LEAF);
      }
      const spots: Array<[number, number, number]> = [[0, 0.96, 0]];
      for (let i = 0; i < 6; i++) spots.push([Math.cos(i * 1.047) * 0.12, 0.86, Math.sin(i * 1.047) * 0.12]);
      for (let i = 0; i < 8; i++) spots.push([Math.cos(i * 0.785 + 0.4) * 0.22, 0.73, Math.sin(i * 0.785 + 0.4) * 0.22]);
      spots.forEach(([x, y, z], i) => rose(x, y, z, 0.075, i % 3 === 2 ? 0xd8475e : RED));
      bow(0, 0.34, 0.165, 1.1, 0xe7c6cf);
    } else if (type === 'hydrangea') {
      // Chậu cẩm tú cầu
      cyl(0.3, 0.22, 0.42, 0, 0.21, 0, 0xf3eee6);
      P(new THREE.TorusGeometry(0.3, 0.025, 6, 28).rotateX(Math.PI / 2).translate(0, 0.42, 0), GOLD);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        P(new THREE.SphereGeometry(1, 8, 5).scale(0.14, 0.025, 0.07).rotateY(-a).translate(Math.cos(a) * 0.27, 0.47, Math.sin(a) * 0.27), LEAF);
      }
      const heads: Array<[number, number, number, number]> = [
        [-0.15, 0.62, 0.03, 0x8fb0e6],
        [0.15, 0.62, 0.05, 0xb9a3e3],
        [0, 0.74, -0.08, 0xa7c1ee],
        [0, 0.6, 0.18, 0xe8b8d0],
      ];
      for (const [cx, cy, cz, hex] of heads) {
        for (let i = 0; i < 16; i++) {
          const phi = Math.acos(1 - (i + 0.5) / 16); // nửa cầu trên
          const th = i * 2.4;
          const r = 0.16;
          P(new THREE.IcosahedronGeometry(0.052, 0).translate(cx + Math.sin(phi) * Math.cos(th) * r, cy + Math.cos(phi) * r * 0.9, cz + Math.sin(phi) * Math.sin(th) * r), i % 3 ? hex : shade(hex, 1.08));
        }
      }
    } else if (type === 'diapers') {
      // Bịch tã em bé (túi nilon phồng + quai xách)
      box(0.52, 0.5, 0.3, 0, 0.25, 0, 0x9ccbef);
      sph(0.26, 0.04, 0.15, 0, 0.5, 0, 0x9ccbef, 14);
      P(new THREE.TorusGeometry(0.09, 0.018, 6, 16, Math.PI).translate(0, 0.52, 0), 0x7fb6e3);
      bow(0.18, 0.47, 0.155, 0.9, 0xf3a6bd);
    } else if (type === 'washing_machine') {
      // Máy giặt cửa trước
      const WM = 0xf6f6f4;
      box(0.62, 0.84, 0.58, 0, 0.44, 0, WM);
      box(0.6, 0.02, 0.56, 0, 0.012, 0, 0x9a9a9a);
      box(0.6, 0.11, 0.015, 0, 0.78, 0.296, 0xdedfe2);
      box(0.14, 0.05, 0.01, 0.08, 0.78, 0.305, 0x2c3440);
      P(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 16).rotateX(Math.PI / 2).translate(-0.18, 0.78, 0.31), 0xb9bcc2);
      sph(0.012, 0.012, 0.006, 0.2, 0.79, 0.306, 0x48c774, 6);
      P(new THREE.TorusGeometry(0.19, 0.035, 10, 32).translate(0, 0.4, 0.3), 0xc9ccd1);
      P(new THREE.CylinderGeometry(0.165, 0.165, 0.02, 32).rotateX(Math.PI / 2).translate(0, 0.4, 0.292), 0x5d7489);
      sph(0.1, 0.1, 0.02, -0.04, 0.44, 0.302, 0x8fb3cc, 12);
      box(0.03, 0.08, 0.02, 0.19, 0.4, 0.33, 0xb9bcc2);
      bow(0.18, 0.92, 0.0, 1.5, 0xc0263f);
    } else if (type === 'car') {
      // Xe hoa (thân xe nằm ngang, mặt bên quay ra phía khách)
      const BODY = 0xf7f3ec;
      const GLASS = 0x5c6f82;
      box(1.34, 0.26, 0.62, 0, 0.3, 0, BODY);
      box(0.4, 0.07, 0.6, 0.45, 0.46, 0, BODY);
      box(0.7, 0.27, 0.56, -0.13, 0.56, 0, BODY);
      box(0.62, 0.04, 0.58, -0.13, 0.71, 0, BODY);
      box(0.3, 0.17, 0.566, -0.3, 0.57, 0, GLASS);
      box(0.27, 0.17, 0.566, 0.04, 0.57, 0, GLASS);
      P(new THREE.BoxGeometry(0.02, 0.2, 0.5).rotateZ(-0.5).translate(0.235, 0.57, 0), GLASS);
      for (const [x, z] of [[-0.42, 0.3], [0.42, 0.3], [-0.42, -0.3], [0.42, -0.3]]) {
        P(new THREE.CylinderGeometry(0.15, 0.15, 0.09, 18).rotateX(Math.PI / 2).translate(x, 0.15, z), 0x2a2522);
        P(new THREE.CylinderGeometry(0.075, 0.075, 0.095, 12).rotateX(Math.PI / 2).translate(x, 0.15, z * 1.02), 0xd9d9d9);
      }
      box(0.04, 0.07, 0.64, 0.68, 0.22, 0, 0xd0d0d0);
      box(0.04, 0.07, 0.64, -0.68, 0.22, 0, 0xd0d0d0);
      for (const z of [-0.2, 0.2]) {
        sph(0.02, 0.045, 0.06, 0.672, 0.36, z, 0xfff3c4, 10);
        sph(0.02, 0.04, 0.05, -0.672, 0.36, z, 0xd8424f, 10);
      }
      // trái tim hoa trên nắp capo
      for (let i = 0; i < 20; i++) {
        const t = (i / 20) * Math.PI * 2;
        const hx = 16 * Math.pow(Math.sin(t), 3);
        const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        rose(0.44 + hy * 0.011, 0.53, hx * 0.013, 0.04, i % 2 ? RED : PINK);
      }
      rose(0.47, 0.53, 0, 0.05, PINK);
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        rose(-0.13 + Math.cos(a) * 0.13, 0.76, Math.sin(a) * 0.13, 0.045, i % 3 ? WHITE : PINK);
      }
      rose(-0.13, 0.8, 0, 0.055, RED);
      for (const z of [-0.24, 0.24]) rod(new THREE.Vector3(0.44, 0.52, 0), new THREE.Vector3(0.21, 0.7, z), 0.012, PINK);
      bow(-0.67, 0.4, 0.0, 1.0, PINK);
    } else if (type === 'teddy') {
      // Gấu bông ngồi
      const FUR = 0xb07a4f;
      const MUZ = 0xe9cfa8;
      sph(0.31, 0.34, 0.28, 0, 0.36, 0, FUR, 20);
      sph(0.19, 0.22, 0.06, 0, 0.36, 0.24, MUZ, 14);
      sph(0.23, 0.21, 0.21, 0, 0.82, 0.02, FUR, 20);
      for (const s of [-1, 1]) {
        sph(0.085, 0.085, 0.05, s * 0.16, 1.0, 0, FUR, 12);
        sph(0.05, 0.05, 0.03, s * 0.16, 1.0, 0.03, MUZ, 10);
        sph(0.1, 0.17, 0.1, s * 0.3, 0.44, 0.08, FUR, 12); // tay
        sph(0.11, 0.1, 0.18, s * 0.15, 0.1, 0.22, FUR, 12); // chân duỗi trước
        sph(0.075, 0.075, 0.02, s * 0.15, 0.1, 0.4, MUZ, 12);
        sph(0.022, 0.026, 0.015, s * 0.075, 0.87, 0.2, 0x1e1715, 8); // mắt
      }
      sph(0.1, 0.075, 0.07, 0, 0.77, 0.18, MUZ, 14);
      sph(0.035, 0.026, 0.025, 0, 0.8, 0.245, 0x2a1d18, 8);
      bow(0, 0.62, 0.2, 1.3, 0xe78fa6);
    } else if (type === 'rice_cooker') {
      // Nồi cơm điện (thắt nơ đỏ)
      cyl(0.27, 0.27, 0.04, 0, 0.02, 0, 0x8d8d8d);
      cyl(0.3, 0.28, 0.34, 0, 0.21, 0, 0xfbfaf7, 28);
      cyl(0.303, 0.303, 0.06, 0, 0.3, 0, 0xe79fb0, 28);
      P(new THREE.SphereGeometry(0.3, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.42, 1).translate(0, 0.38, 0), 0xeceae6);
      P(new THREE.TorusGeometry(0.1, 0.02, 6, 16, Math.PI).translate(0, 0.49, 0), 0x9a9a9a);
      box(0.2, 0.1, 0.03, 0, 0.21, 0.285, 0x3b3b40);
      sph(0.018, 0.018, 0.01, -0.045, 0.21, 0.302, 0xe05a3a, 8);
      sph(0.018, 0.018, 0.01, 0.045, 0.21, 0.302, 0xf2a33a, 8);
      bow(0.12, 0.47, 0.12, 1.2, RED);
    } else if (type === 'detergent') {
      // Thùng bột giặt
      box(0.5, 0.66, 0.26, 0, 0.33, 0, 0x1d50b8);
      box(0.2, 0.05, 0.04, 0, 0.685, 0, 0x163f91);
      bow(0.17, 0.62, 0.135, 0.9, RED);
    } else if (type === 'noodles') {
      // 2 thùng mì chồng lên nhau
      box(0.62, 0.38, 0.42, 0, 0.19, 0, 0xd9a35f);
      box(0.63, 0.006, 0.08, 0, 0.381, 0, 0xc9b38b);
      P(new THREE.BoxGeometry(0.6, 0.36, 0.4).rotateY(0.12).translate(0.02, 0.56, 0), 0xd9a35f);
      P(new THREE.BoxGeometry(0.61, 0.006, 0.08).rotateY(0.12).translate(0.02, 0.741, 0), 0xc9b38b);
    } else if (type === 'piggy') {
      // Heo đất
      const BODY = 0xef8593;
      sph(0.28, 0.26, 0.34, 0, 0.33, 0, BODY, 22);
      P(new THREE.CylinderGeometry(0.09, 0.1, 0.08, 16).rotateX(Math.PI / 2).translate(0, 0.33, 0.36), 0xf5a7b1);
      for (const s of [-1, 1]) {
        sph(0.018, 0.024, 0.01, s * 0.032, 0.33, 0.402, 0x7a3640, 8);
        sph(0.024, 0.024, 0.015, s * 0.1, 0.45, 0.28, 0x1e1715, 8);
        P(new THREE.ConeGeometry(0.07, 0.13, 8).rotateZ(-s * 0.4).translate(s * 0.15, 0.57, 0.1), BODY);
        for (const z of [-0.17, 0.17]) cyl(0.06, 0.07, 0.12, s * 0.14, 0.06, z, BODY, 10);
        // hoa văn hoa trên hông
        rose(s * 0.27, 0.36, 0.02, 0.045, RED);
        rose(s * 0.25, 0.25, -0.12, 0.035, 0xf2cf6a);
        rose(s * 0.25, 0.44, -0.13, 0.035, 0xf2cf6a);
      }
      box(0.14, 0.012, 0.03, 0, 0.59, -0.03, 0x3a2a2a);
      P(new THREE.TorusGeometry(0.04, 0.012, 6, 12).translate(0, 0.38, -0.35), BODY);
    } else if (type === 'gift_box') {
      // Hộp quà bí mật
      box(0.56, 0.5, 0.56, 0, 0.25, 0, 0xd2546b);
      box(0.6, 0.1, 0.6, 0, 0.54, 0, 0xc34a60);
      box(0.1, 0.505, 0.565, 0, 0.25, 0, GOLD);
      box(0.565, 0.505, 0.1, 0, 0.25, 0, GOLD);
      box(0.1, 0.105, 0.605, 0, 0.54, 0, GOLD);
      box(0.605, 0.105, 0.1, 0, 0.54, 0, GOLD);
      bow(0, 0.66, 0, 2.0, GOLD);
    } else {
      // Phong bì mừng cưới trên giá
      rod(new THREE.Vector3(-0.28, 0, 0.14), new THREE.Vector3(-0.12, 1.1, 0), 0.014, GOLD);
      rod(new THREE.Vector3(0.28, 0, 0.14), new THREE.Vector3(0.12, 1.1, 0), 0.014, GOLD);
      rod(new THREE.Vector3(0, 0, -0.32), new THREE.Vector3(0, 1.02, -0.02), 0.014, GOLD);
      box(0.66, 0.03, 0.09, 0, 0.5, 0.07, GOLD);
      P(new THREE.BoxGeometry(0.62, 0.44, 0.02).rotateX(-0.12).translate(0, 0.74, 0.05), 0xb80f2a);
    }
    const g = mergeColored(parts);
    g.computeBoundingSphere();
    this.giftGeomCache.set(type, g);
    return g;
  }

  // Nhãn chữ in trên quà (bột giặt, thùng mì, phong bì, băng rôn, xe hoa)
  private giftLabels(type: string): THREE.Mesh[] {
    const make = (key: string, w: number, h: number, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void) => {
      let base = this.giftLabelCache.get(key);
      if (!base) {
        const W = 512;
        const H = Math.round((512 * h) / w);
        const cv = document.createElement('canvas');
        cv.width = W;
        cv.height = H;
        const c = cv.getContext('2d')!;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        draw(c, W, H);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = 4;
        base = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, transparent: true }));
        this.giftLabelCache.set(key, base);
      }
      return new THREE.Mesh(base.geometry, base.material);
    };
    const at = (m: THREE.Mesh, x: number, y: number, z: number, ry = 0, rx = 0) => {
      m.position.set(x, y, z);
      m.rotation.set(rx, ry, 0);
      return m;
    };
    if (type === 'detergent') {
      return [
        at(
          make('omo', 0.48, 0.62, (c, W, H) => {
            const gr = c.createLinearGradient(0, 0, 0, H);
            gr.addColorStop(0, '#2c6be0');
            gr.addColorStop(1, '#173f95');
            c.fillStyle = gr;
            c.fillRect(0, 0, W, H);
            c.fillStyle = '#ffffff';
            c.beginPath();
            c.arc(W / 2, H * 0.38, W * 0.36, 0, Math.PI * 2);
            c.fill();
            c.strokeStyle = '#e21f26';
            c.lineWidth = 14;
            c.beginPath();
            c.arc(W / 2, H * 0.38, W * 0.31, 0.3, Math.PI * 1.75);
            c.stroke();
            c.fillStyle = '#e21f26';
            c.font = `900 150px ${SANS_FONT}`;
            c.fillText('OMO', W / 2, H * 0.39);
            c.fillStyle = '#ffffff';
            c.font = `800 52px ${SANS_FONT}`;
            c.fillText('BỘT GIẶT', W / 2, H * 0.74);
            c.font = `600 34px ${SANS_FONT}`;
            c.fillText('Trắng sạch · Thơm lâu', W / 2, H * 0.85);
            c.fillStyle = '#f2cf6a';
            c.font = `700 30px ${SANS_FONT}`;
            c.fillText('Tặng Duy ♥ Tâm', W / 2, H * 0.94);
          }),
          0,
          0.33,
          0.131
        ),
      ];
    }
    if (type === 'noodles') {
      const label = (c: CanvasRenderingContext2D, W: number, H: number) => {
        c.fillStyle = '#f6c343';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#d7261e';
        c.fillRect(0, 0, W, H * 0.2);
        c.fillRect(0, H * 0.84, W, H * 0.16);
        c.fillStyle = '#ffffff';
        c.font = `800 38px ${SANS_FONT}`;
        c.fillText('THÙNG 30 GÓI', W / 2, H * 0.1);
        c.fillStyle = '#c0261e';
        c.font = `900 108px ${SANS_FONT}`;
        c.fillText('MÌ TÔM', W / 2, H * 0.48);
        c.fillStyle = '#7a3b12';
        c.font = `700 34px ${SANS_FONT}`;
        c.fillText('Chua cay · Cứu đói cuối tháng', W / 2, H * 0.71);
        c.fillStyle = '#ffffff';
        c.font = `700 30px ${SANS_FONT}`;
        c.fillText('Tặng Duy ♥ Tâm', W / 2, H * 0.92);
      };
      const top = make('noodles', 0.56, 0.32, label);
      top.rotation.y = 0.12;
      return [at(make('noodles', 0.58, 0.33, label), 0, 0.19, 0.211), at(top, 0.045, 0.56, 0.2 + 0.0, 0.12)];
    }
    if (type === 'envelope') {
      return [
        at(
          make('envelope', 0.6, 0.42, (c, W, H) => {
            c.fillStyle = '#c8102e';
            c.fillRect(0, 0, W, H);
            c.strokeStyle = '#e8c06a';
            c.lineWidth = 10;
            c.strokeRect(14, 14, W - 28, H - 28);
            c.lineWidth = 5;
            c.beginPath();
            c.moveTo(14, 14);
            c.lineTo(W / 2, H * 0.48);
            c.lineTo(W - 14, 14);
            c.stroke();
            c.fillStyle = '#f2cf6a';
            c.font = `700 64px ${SCRIPT_FONT}`;
            c.fillText('Mừng Cưới', W / 2, H * 0.66);
            c.font = `700 30px ${SANS_FONT}`;
            c.fillText('Duy ♥ Tâm · 29.11.2026', W / 2, H * 0.84);
          }),
          0,
          0.742,
          0.062,
          0,
          -0.12
        ),
      ];
    }
    if (type === 'diapers') {
      return [
        at(
          make('diapers', 0.48, 0.44, (c, W, H) => {
            const gr = c.createLinearGradient(0, 0, 0, H);
            gr.addColorStop(0, '#d9efff');
            gr.addColorStop(1, '#9ccbef');
            c.fillStyle = gr;
            c.fillRect(0, 0, W, H);
            c.font = `110px ${SANS_FONT}`;
            c.fillText('👶', W / 2, H * 0.3);
            c.fillStyle = '#2f5f9e';
            c.font = `900 72px ${SANS_FONT}`;
            c.fillText('TÃ EM BÉ', W / 2, H * 0.6);
            c.fillStyle = '#d0587a';
            c.font = `700 34px ${SANS_FONT}`;
            c.fillText('Size: Sắp có ♥', W / 2, H * 0.76);
            c.fillStyle = '#2f5f9e';
            c.font = `600 28px ${SANS_FONT}`;
            c.fillText('Chúc Duy & Tâm sớm có tin vui', W / 2, H * 0.9);
          }),
          0,
          0.25,
          0.151
        ),
      ];
    }
    if (type === 'car') {
      const plate = (c: CanvasRenderingContext2D, W: number, H: number) => {
        c.fillStyle = '#f7f3ec';
        c.fillRect(0, 0, W, H);
        c.fillStyle = '#b5354d';
        c.font = `700 64px ${SCRIPT_FONT}`;
        c.fillText('Just Married', W * 0.5, H * 0.42);
        c.font = `700 26px ${SANS_FONT}`;
        c.fillText('DUY ♥ TÂM', W * 0.5, H * 0.82);
      };
      return [at(make('car', 0.8, 0.2, plate), -0.05, 0.3, 0.312), at(make('car', 0.8, 0.2, plate), -0.05, 0.3, -0.312, Math.PI)];
    }
    return [];
  }

  private giftNameSprite(author: string) {
    const cv = document.createElement('canvas');
    cv.width = 512;
    cv.height = 96;
    const c = cv.getContext('2d')!;
    const text = `💝 ${author}`;
    let size = 40;
    c.font = `600 ${size}px ${SANS_FONT}`;
    while (size > 22 && c.measureText(text).width > 450) {
      size -= 2;
      c.font = `600 ${size}px ${SANS_FONT}`;
    }
    const w = Math.min(500, c.measureText(text).width + 50);
    c.fillStyle = 'rgba(255, 250, 244, 0.9)';
    c.strokeStyle = 'rgba(190, 150, 90, 0.7)';
    c.lineWidth = 3;
    c.beginPath();
    c.roundRect(256 - w / 2, 14, w, 68, 34);
    c.fill();
    c.stroke();
    c.fillStyle = '#7a3442';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, 256, 50);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    sp.scale.set(1.05, 0.197, 1);
    sp.renderOrder = 5;
    return sp;
  }

  private disposeGift(g: THREE.Object3D) {
    g.traverse((o) => {
      if (o instanceof THREE.Sprite) {
        o.material.map?.dispose();
        o.material.dispose();
      }
    });
  }

  public syncFlowers(flowers: FlowerGift[]) {
    [...this.flowerGroup.children].forEach((g) => this.disposeGift(g));
    this.flowerGroup.clear();
    flowers.forEach((f) => this.addFlowerMesh(f, false));
  }

  public addFlower(flower: FlowerGift) {
    this.addFlowerMesh(flower, true);
  }

  private addFlowerMesh(f: FlowerGift, animate: boolean) {
    const base = WeddingHall3D.GIFT_INFO[f.flowerType] || { h: 0.8, r: 0.4 };
    const scale = WeddingHall3D.GIFT_SCALE * (base.s || 1);
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(this.giftGeometry(f.flowerType), this.giftMaterial);
    mesh.castShadow = true;
    const body = new THREE.Group();
    body.add(mesh);
    this.giftLabels(f.flowerType).forEach((l) => body.add(l));
    g.add(body);
    // quay nhẹ vào phía thảm đỏ cho tự nhiên
    const x = f.position[0];
    const y = f.position[1] > 0.6 ? 1.2 : 0; // quà cũ (trên sân khấu) vẫn hiện đúng chỗ
    g.position.set(x, y, f.position[2]);
    // xe hoa đỗ chéo, đầu xe hướng ra thảm đỏ; quà khác quay nhẹ vào thảm đỏ
    body.rotation.y =
      f.flowerType === 'car'
        ? (x < 0 ? 0.55 : Math.PI - 0.55)
        : (x < 0 ? 0.22 : -0.22) + (Math.random() - 0.5) * 0.2;
    body.scale.setScalar(scale);
    // bảng tên: hàng ngoài thấp hơn hàng sát sân khấu để không chồng nhau
    const tag = this.giftNameSprite(f.author);
    const frontRow = f.position[2] > -12.3;
    tag.position.set(0, base.h * scale + (frontRow ? 0.12 : 0.32), 0);
    g.add(tag);
    g.userData = { id: f.id, r: base.r * scale, pop: animate ? 0 : 1 };
    if (animate) g.scale.setScalar(0.001);
    this.flowerGroup.add(g);
    while (this.flowerGroup.children.length > 40) {
      const old = this.flowerGroup.children[0];
      this.disposeGift(old);
      this.flowerGroup.remove(old);
    }
  }

  // quà mới tặng "bật" ra (phóng to có độ nảy)
  private updateGiftPops(delta: number) {
    for (const g of this.flowerGroup.children) {
      const u = g.userData;
      if (u.pop >= 1) continue;
      u.pop = Math.min(1, u.pop + delta * 1.8);
      const t = u.pop;
      const c1 = 1.70158;
      const s = 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); // easeOutBack
      g.scale.setScalar(Math.max(0.001, s));
    }
  }

  // ---------------- NGÀY / ĐÊM ----------------
  public setNightMode(isNight: boolean) {
    this.isNight = isNight;
    this.hemiLight.intensity = isNight ? 0.3 : 0.85;
    this.ambientLight.intensity = isNight ? 0.08 : this.theme.ambientIntensity;
    this.mainDirectionalLight.intensity = isNight ? 0.35 : 1.45;
    this.mainDirectionalLight.color.setHex(isNight ? 0xffc98a : this.theme.primaryLightColor);
    this.chandelierPointLights.forEach((l, i) => (l.intensity = this.pointBase[i] * (isNight ? 1.7 : 1)));
    this.glowMaterials.forEach((m) => (m.emissiveIntensity = (m.userData.base ??= m.emissiveIntensity) * (isNight ? 1.8 : 1)));
    this.renderer.toneMappingExposure = isNight ? 1.1 : 1.0;
  }

  // ---------------- VA CHẠM ----------------
  public checkMovement(currPos: THREE.Vector3, targetPos: THREE.Vector3): { pos: THREE.Vector3; onStage: boolean } {
    let x = targetPos.x;
    let z = targetPos.z;
    let y = 0;
    let onStage = false;

    if (z <= -14.2 && z >= -22 && x >= -9 && x <= 9) {
      if (currPos.y < 0.5) {
        if (x >= -2.4 && x <= 2.4 && z >= -15.6) {
          const progress = Math.max(0, Math.min(1, (-14.0 - z) / 1.4));
          y = progress * 1.2;
          onStage = progress > 0.8;
        } else {
          z = -14.0;
          y = 0;
        }
      } else {
        y = 1.2;
        onStage = true;
      }
    } else if (currPos.y >= 0.5 && z > -14.2) {
      y = 0;
      onStage = false;
    }

    for (const obs of this.collisionObstacles) {
      if (obs.isStairs) continue;
      if (y < obs.height && x >= obs.minX && x <= obs.maxX && z >= obs.minZ && z <= obs.maxZ) {
        const leftD = Math.abs(x - obs.minX);
        const rightD = Math.abs(x - obs.maxX);
        const frontD = Math.abs(z - obs.maxZ);
        const backD = Math.abs(z - obs.minZ);
        const minD = Math.min(leftD, rightD, frontD, backD);
        if (minD === leftD) x = obs.minX - 0.05;
        else if (minD === rightD) x = obs.maxX + 0.05;
        else if (minD === frontD) z = obs.maxZ + 0.05;
        else z = obs.minZ - 0.05;
      }
    }

    // Vật tròn (bàn, trụ hoa, standee, giá ảnh...): đẩy ra theo bán kính
    const onStageNow = y >= 1.0;
    for (const c of this.collisionCircles) {
      const stageObj = c.z < -14 && Math.abs(c.x) < 9;
      if (stageObj !== onStageNow) continue;
      const dx = x - c.x;
      const dz = z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < c.r) {
        const k = d < 1e-4 ? 1 : c.r / d;
        x = c.x + (d < 1e-4 ? c.r : dx * k);
        z = c.z + (d < 1e-4 ? 0 : dz * k);
      }
    }

    // Quà khách tặng dưới chân sân khấu
    if (!onStageNow) {
      for (const g of this.flowerGroup.children) {
        const r = g.userData.r as number | undefined;
        if (!r || g.position.y > 0.5) continue;
        const dx = x - g.position.x;
        const dz = z - g.position.z;
        const d = Math.hypot(dx, dz);
        if (d < r) {
          x = g.position.x + (d < 1e-4 ? r : (dx * r) / d);
          z = g.position.z + (d < 1e-4 ? 0 : (dz * r) / d);
        }
      }
    }

    return { pos: new THREE.Vector3(x, y, z), onStage };
  }

  // ---------------- VÒNG LẶP ----------------
  public update(delta: number, frameCount: number) {
    this.updateGiftPops(delta);
    const d = this.petalDummy;
    for (let i = 0; i < this.petalCount; i++) {
      const p = this.petalData[i];
      p.y -= p.vy * delta;
      p.x += Math.sin(p.rotY + p.y) * delta * 0.15;
      p.rotX += delta * 1.5;
      p.rotY += delta * 1.2;
      if (p.y < 0.05) {
        p.y = 8;
        p.x = (Math.random() - 0.5) * 14;
        p.z = -14 + Math.random() * 32;
      }
      d.position.set(p.x, p.y, p.z);
      d.rotation.set(p.rotX, p.rotY, 0);
      d.updateMatrix();
      this.fallingPetalsMesh.setMatrixAt(i, d.matrix);
    }
    this.fallingPetalsMesh.instanceMatrix.needsUpdate = true;
    this.updateGlitterAndBalloons(delta);

    // Cô dâu chú rể NPC
    this.npcAnimTime += delta;
    if (this.npcGroom && this.npcBride) {
      if (this.npcThankTimer > 0) {
        this.npcThankTimer -= delta;
        this.npcGroom.state.action = 'wave';
        this.npcBride.state.action = 'kiss';
        this.npcBride.holdPose = false;
      } else {
        this.npcGroom.state.action = 'idle';
        this.npcBride.state.action = 'idle';
        this.npcBride.holdPose = true;
      }
      this.npcGroom.update(delta, this.camera.position);
      this.npcBride.update(delta, this.camera.position);
    }

    // Đồng hồ đếm ngược cập nhật mỗi giây
    const sec = Math.floor(Date.now() / 1000);
    if (sec !== this.lastCountdownSecond) {
      this.lastCountdownSecond = sec;
      this.updateCountdownTexture();
    }

    // Bóng đổ cập nhật 1/4 khung hình (nhân vật di chuyển vẫn có bóng, đỡ tốn GPU)
    if (frameCount % 4 === 0) this.renderer.shadowMap.needsUpdate = true;

    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsLastTime >= 1000) {
      this.lastFps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = now;
      this.lastDrawCalls = this.renderer.info.render.calls;
    }

    this.renderer.render(this.scene, this.camera);
    this.cssRenderer.render(this.cssScene, this.camera);
  }

  public dispose() {
    window.removeEventListener('resize', this.onResize);
    if (this.onYoutubeMessage) window.removeEventListener('message', this.onYoutubeMessage);
    if (this.onUserGesture) {
      window.removeEventListener('pointerdown', this.onUserGesture, true);
      window.removeEventListener('touchend', this.onUserGesture, true);
    }
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    if (this.soundCheckTimer) clearInterval(this.soundCheckTimer);
    this.npcGroom?.dispose();
    this.npcBride?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
    this.cssRenderer.domElement.parentElement?.removeChild(this.cssRenderer.domElement);
  }
}
