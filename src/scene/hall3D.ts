import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
  /** Gọi khi trình duyệt không cho phát tiếng video (cần khách bấm nút) */
  public onSoundBlocked?: () => void;
  /** Gọi khi video lỗi (bị xoá / tắt nhúng) để chuyển sang nhạc nền dự phòng */
  public onVideoError?: (code: number) => void;

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
    this.buildDecorFlowers();
    this.buildPetals();
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
    this.buildLeaderboardScreen();
  }

  private buildNPCs() {
    const base = (id: string, name: string, gender: 'male' | 'female', outfit: string, x: number): PlayerState => ({
      id,
      uid: id,
      name,
      group: gender === 'male' ? 'groom' : 'bride',
      gender,
      hairStyle: gender === 'male' ? 0 : 2,
      hairColor: gender === 'male' ? '#24170f' : '#3a2418',
      outfit,
      accessories: [],
      position: [x, 1.2, -16.6],
      rotation: 0,
      action: 'idle',
      hallId: 'npc',
    });
    this.npcGroom = new Character3D(base('npc_groom', this.config.groom, 'male', 'groom_tux', -0.55), true, { label: 'Chú rể' });
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

  private buildLeaderboardScreen() {
    this.makeScreenFrame(4.3, 3.3, 6.8, 4.5);
    this.leaderboardCanvas = document.createElement('canvas');
    this.leaderboardCanvas.width = 768;
    this.leaderboardCanvas.height = 576;
    this.leaderboardTexture = new THREE.CanvasTexture(this.leaderboardCanvas);
    this.leaderboardTexture.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.0), new THREE.MeshBasicMaterial({ map: this.leaderboardTexture, toneMapped: false, color: 0xe6e0da }));
    mesh.position.set(6.8, 4.5, -20.14);
    this.scene.add(mesh);
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
      ctx.font = `600 24px ${SANS_FONT}`;
      const name = e.name.length > 12 ? e.name.slice(0, 11) + '…' : e.name;
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
        if (!this.ytReady && (msg.event === 'onReady' || msg.event === 'infoDelivery' || msg.event === 'initialDelivery')) {
          this.ytReady = true;
          this.applyVideoSound();
        }
        if (msg.event === 'onError') this.onVideoError?.(Number(msg.info));
        // Muốn có tiếng mà YouTube vẫn báo đang tắt tiếng -> trình duyệt chặn (thường là iPhone)
        if (msg.event === 'infoDelivery' && msg.info && typeof msg.info.muted === 'boolean') {
          const blocked = this.videoSoundWanted && msg.info.muted;
          if (blocked && Date.now() - this.lastSoundApply > 2500) this.onSoundBlocked?.();
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
    iframe.addEventListener('load', () => {
      disableCaptions();
      setTimeout(disableCaptions, 1500);
      // Đăng ký nhận sự kiện từ trình phát YouTube
      try {
        iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'wedding-yt-player' }), '*');
      } catch {}
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
    if (this.videoSoundWanted) {
      this.ytSend('unMute');
      this.ytSend('setVolume', [85]);
      this.ytSend('playVideo');
    } else {
      this.ytSend('mute');
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
      { x: -3.6, z: -11.6, ry: 0.4 },
      { x: 3.6, z: -11.6, ry: -0.4 },
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
    const petalMat = new THREE.MeshStandardMaterial({ color: 0xf0c4c8, side: THREE.DoubleSide, roughness: 0.7, transparent: true, opacity: 0.85 });
    this.fallingPetalsMesh = new THREE.InstancedMesh(petalGeom, petalMat, this.petalCount);
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

  // ---------------- HOA KHÁCH TẶNG ----------------
  private giftGeomCache = new Map<string, THREE.BufferGeometry>();
  private giftMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });

  private giftGeometry(type: FlowerGift['flowerType']) {
    const hit = this.giftGeomCache.get(type);
    if (hit) return hit;
    const parts: THREE.BufferGeometry[] = [];
    const bloom = (x: number, y: number, z: number, r: number, hex: number) => parts.push(colorGeom(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z), hex));
    const leaf = (x: number, y: number, z: number, hex = 0x6f8a5c) => parts.push(colorGeom(new THREE.SphereGeometry(1, 6, 4).scale(0.05, 0.015, 0.1).translate(x, y, z), hex));
    if (type === 'rose') {
      parts.push(colorGeom(new THREE.CylinderGeometry(0.012, 0.012, 0.4, 5).translate(0, 0.2, 0), 0x5f7f4c));
      bloom(0, 0.42, 0, 0.07, 0xc23b52);
      leaf(0.05, 0.25, 0);
    } else if (type === 'hydrangea') {
      parts.push(colorGeom(new THREE.CylinderGeometry(0.08, 0.05, 0.25, 10).translate(0, 0.125, 0), 0xf2ece4));
      for (let i = 0; i < 14; i++) {
        const a = i * 2.4;
        const r = 0.04 + (i % 3) * 0.035;
        bloom(Math.cos(a) * r, 0.33 + (i % 4) * 0.02, Math.sin(a) * r, 0.05, i % 2 ? 0x9fb7e0 : 0xc6b4e2);
      }
    } else if (type === 'basket') {
      parts.push(colorGeom(new THREE.CylinderGeometry(0.22, 0.15, 0.22, 14).translate(0, 0.11, 0), 0xb08a5a));
      parts.push(colorGeom(new THREE.TorusGeometry(0.2, 0.015, 6, 20, Math.PI).translate(0, 0.25, 0), 0xb08a5a));
      for (let i = 0; i < 12; i++) {
        const a = i * 2.4;
        bloom(Math.cos(a) * 0.12, 0.26 + (i % 3) * 0.02, Math.sin(a) * 0.12, 0.055, [0xf0bcc2, 0xfbeee6, 0xe8c48a][i % 3]);
      }
    } else {
      // xe hoa mini
      parts.push(colorGeom(new THREE.BoxGeometry(0.5, 0.14, 0.26).translate(0, 0.12, 0), 0xf3ece1));
      parts.push(colorGeom(new THREE.BoxGeometry(0.28, 0.12, 0.24).translate(-0.04, 0.25, 0), 0xf3ece1));
      for (const [x, z] of [[-0.16, 0.13], [0.16, 0.13], [-0.16, -0.13], [0.16, -0.13]]) {
        parts.push(colorGeom(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 10).rotateX(Math.PI / 2).translate(x, 0.05, z), 0x2b2420));
      }
      for (let i = 0; i < 6; i++) bloom(0.18 - (i % 3) * 0.04, 0.22, (i < 3 ? 1 : -1) * 0.05, 0.04, i % 2 ? 0xc23b52 : 0xf0bcc2);
    }
    const g = mergeColored(parts);
    this.giftGeomCache.set(type, g);
    return g;
  }

  public syncFlowers(flowers: FlowerGift[]) {
    this.flowerGroup.clear();
    flowers.forEach((f) => this.addFlowerMesh(f));
  }

  public addFlower(flower: FlowerGift) {
    this.addFlowerMesh(flower);
  }

  private addFlowerMesh(f: FlowerGift) {
    const mesh = new THREE.Mesh(this.giftGeometry(f.flowerType), this.giftMaterial);
    mesh.position.set(f.position[0], 1.2, f.position[2]);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    mesh.userData.id = f.id;
    this.flowerGroup.add(mesh);
    while (this.flowerGroup.children.length > 60) this.flowerGroup.remove(this.flowerGroup.children[0]);
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

    return { pos: new THREE.Vector3(x, y, z), onStage };
  }

  // ---------------- VÒNG LẶP ----------------
  public update(delta: number, frameCount: number) {
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
    this.npcGroom?.dispose();
    this.npcBride?.dispose();
    this.renderer.dispose();
    this.renderer.domElement.parentElement?.removeChild(this.renderer.domElement);
    this.cssRenderer.domElement.parentElement?.removeChild(this.cssRenderer.domElement);
  }
}
