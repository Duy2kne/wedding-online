import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { HALL_THEMES, type HallThemeConfig } from './hallThemes.js';
import type { FlowerGift, LeaderboardEntry, WishItem, WeddingConfig } from '../shared/types.js';

// Table and chair configuration
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

export class WeddingHall3D {
  public scene: THREE.Scene;
  public cssScene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;
  public renderer: THREE.WebGLRenderer;
  public cssRenderer: CSS3DRenderer;
  public container: HTMLElement;
  public theme: HallThemeConfig;
  public config: WeddingConfig;

  // Interaction locations
  public tableSeats: TableSeatLocation[] = [];
  public collisionObstacles: CollisionBox[] = [];
  public photoWallObjects: Array<{ mesh: THREE.Mesh; url: string; title: string }> = [];
  public boothLocations: Array<{ id: string; name: string; position: THREE.Vector3; radius: number }> = [];
  public receptionPosition = new THREE.Vector3(7.5, 0, 14);
  public shopPosition = new THREE.Vector3(-8.5, 0, 14);
  public stageCenter = new THREE.Vector3(0, 1.2, -18);

  // Dynamic meshes
  private flowerGroup: THREE.Group;
  private cakeTowerGroup!: THREE.Group;
  private npcCoupleGroup!: THREE.Group;
  private fallingPetalsMesh!: THREE.InstancedMesh;
  private petalCount = 80;
  private petalData: Array<{ x: number; y: number; z: number; vy: number; rotX: number; rotY: number }> = [];

  // Stage Screens
  private countdownCanvas!: HTMLCanvasElement;
  private countdownTexture!: THREE.CanvasTexture;
  private countdownMesh!: THREE.Mesh;
  private leaderboardCanvas!: HTMLCanvasElement;
  private leaderboardTexture!: THREE.CanvasTexture;
  private leaderboardMesh!: THREE.Mesh;
  private mainVideoHoleMesh!: THREE.Mesh;
  private youtubeCssObject?: CSS3DObject;
  private youtubeIframe?: HTMLIFrameElement;

  // Lighting
  private ambientLight!: THREE.AmbientLight;
  private mainDirectionalLight!: THREE.DirectionalLight;
  private chandelierPointLights: THREE.PointLight[] = [];
  private isNight = false;

  // NPC animation
  private npcAnimTime = 0;
  private npcThankTimer = 0;

  // Performance debug
  public lastDrawCalls = 0;
  public lastFps = 60;
  private fpsFrames = 0;
  private fpsLastTime = performance.now();

  constructor(
    container: HTMLElement,
    themeId: 'diamond' | 'sophia' = 'diamond',
    config: WeddingConfig
  ) {
    this.container = container;
    this.theme = HALL_THEMES[themeId] || HALL_THEMES.diamond;
    this.config = config;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    // 1. Scenes
    this.scene = new THREE.Scene();
    this.cssScene = new THREE.Scene();

    // 2. Camera
    this.camera = new THREE.PerspectiveCamera(55, width / height, 0.2, 200);
    this.camera.position.set(0, 3.2, 25);

    // 3. WebGL Renderer (with alpha: true for hole punch technique)
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.autoUpdate = true;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.zIndex = '2'; // Canvas sits ON TOP of CSS3D layer
    container.appendChild(this.renderer.domElement);

    // 4. CSS3D Renderer (positioned directly behind WebGL canvas)
    this.cssRenderer = new CSS3DRenderer();
    this.cssRenderer.setSize(width, height);
    this.cssRenderer.domElement.style.position = 'absolute';
    this.cssRenderer.domElement.style.top = '0';
    this.cssRenderer.domElement.style.left = '0';
    this.cssRenderer.domElement.style.zIndex = '1'; // Behind canvas
    this.cssRenderer.domElement.style.pointerEvents = 'none'; // Click-through so camera orbit & controls work
    container.appendChild(this.cssRenderer.domElement);

    this.flowerGroup = new THREE.Group();
    this.scene.add(this.flowerGroup);

    this.buildScene();
    this.setupYoutubeVideo();
    this.setupWindowResize();
  }

  private buildScene() {
    this.setupLighting();
    this.buildArchitecture();
    this.buildStage();
    this.buildDiningTables();
    this.buildEntranceAndAisle();
    this.buildBoothsAndStalls();
    this.buildGardenAndLake();
    this.buildPetals();
  }

  private setupLighting() {
    // 1. Bright Hemisphere Light: sky from above, warm gold bounce from floor
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd4af37, 2.5);
    this.scene.add(hemiLight);

    // 2. Soft romantic ambient light
    this.ambientLight = new THREE.AmbientLight(this.theme.ambientColor, this.theme.ambientIntensity);
    this.scene.add(this.ambientLight);

    // 3. Primary sunlight / spotlight towards stage and center hall
    this.mainDirectionalLight = new THREE.DirectionalLight(this.theme.primaryLightColor, 2.6);
    this.mainDirectionalLight.position.set(10, 25, 15);
    this.mainDirectionalLight.castShadow = true;
    this.mainDirectionalLight.shadow.mapSize.width = 1024;
    this.mainDirectionalLight.shadow.mapSize.height = 1024;
    this.mainDirectionalLight.shadow.camera.near = 5;
    this.mainDirectionalLight.shadow.camera.far = 70;
    this.mainDirectionalLight.shadow.camera.left = -25;
    this.mainDirectionalLight.shadow.camera.right = 25;
    this.mainDirectionalLight.shadow.camera.top = 25;
    this.mainDirectionalLight.shadow.camera.bottom = -25;
    this.mainDirectionalLight.shadow.bias = -0.0005;
    this.scene.add(this.mainDirectionalLight);

    // 4. Fill Directional Light from the front entrance
    const frontLight = new THREE.DirectionalLight(0xffeedd, 1.8);
    frontLight.position.set(-10, 20, 25);
    this.scene.add(frontLight);

    // 5. PointLights with decay = 0 so crystal chandeliers vividly illuminate all tables, chairs & flowers
    const light1 = new THREE.PointLight(this.theme.accentLightColor, 3.5, 30, 0);
    light1.position.set(-5, 7.5, 2);
    const light2 = new THREE.PointLight(this.theme.accentLightColor, 3.5, 30, 0);
    light2.position.set(5, 7.5, 2);

    // Warm spotlight over Stage
    const stageLight = new THREE.PointLight(0xfff1e6, 4.0, 35, 0);
    stageLight.position.set(0, 7.5, -16);

    // Entrance Arch Romantic Light
    const entranceLight = new THREE.PointLight(0xffd1dc, 3.2, 25, 0);
    entranceLight.position.set(0, 5, 17);

    this.chandelierPointLights = [light1, light2, stageLight, entranceLight];
    this.chandelierPointLights.forEach((l) => this.scene.add(l));
  }

  private buildArchitecture() {
    // 1. Hall Floor (Vast 120m x 120m polished grand ballroom marble floor)
    const floorGeom = new THREE.PlaneGeometry(120, 120);

    // Procedural luxury marble tile canvas texture (1024x1024)
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    const isDiamond = this.theme.id === 'diamond';
    // Warm, prestigious French Crema Marfil / Calacatta Gold base
    ctx.fillStyle = isDiamond ? '#faf6ee' : '#fcf4ea';
    ctx.fillRect(0, 0, 1024, 1024);

    // Natural delicate golden & amber marble veining
    const veiningColor1 = isDiamond ? 'rgba(212, 175, 55, 0.22)' : 'rgba(217, 119, 6, 0.20)';
    const veiningColor2 = isDiamond ? 'rgba(180, 140, 90, 0.14)' : 'rgba(190, 120, 80, 0.14)';

    ctx.lineWidth = 4;
    ctx.strokeStyle = veiningColor1;
    ctx.beginPath();
    ctx.moveTo(30, 0);
    ctx.bezierCurveTo(180, 220, 320, 180, 480, 512);
    ctx.bezierCurveTo(620, 780, 780, 680, 1000, 1024);
    ctx.stroke();

    ctx.lineWidth = 2.5;
    ctx.strokeStyle = veiningColor2;
    ctx.beginPath();
    ctx.moveTo(512, 0);
    ctx.bezierCurveTo(680, 320, 380, 600, 820, 1024);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, 400);
    ctx.bezierCurveTo(280, 520, 600, 380, 1024, 600);
    ctx.stroke();

    // 4 Grand Palace Tiles (512x512 each)
    const darkEmperador = isDiamond ? '#382516' : '#421d0a';
    const goldPinstripe = '#d4af37';

    const tiles = [
      { x: 12, y: 12, w: 488, h: 488 },
      { x: 524, y: 12, w: 488, h: 488 },
      { x: 12, y: 524, w: 488, h: 488 },
      { x: 524, y: 524, w: 488, h: 488 },
    ];

    tiles.forEach((t) => {
      // Outer Dark Emperador Marble Inlay (8px)
      ctx.strokeStyle = darkEmperador;
      ctx.lineWidth = 8;
      ctx.strokeRect(t.x, t.y, t.w, t.h);

      // Inner Champagne Gold Filigree Pinstripe (3px)
      ctx.strokeStyle = goldPinstripe;
      ctx.lineWidth = 3;
      ctx.strokeRect(t.x + 14, t.y + 14, t.w - 28, t.h - 28);

      // Fine inner perimeter frame
      ctx.strokeStyle = isDiamond ? '#e2e8f0' : '#fed7aa';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(t.x + 24, t.y + 24, t.w - 48, t.h - 48);
    });

    // Golden 8-point starburst rosettes at tile corners and intersections
    const stars = [
      [512, 512],
      [0, 512],
      [1024, 512],
      [512, 0],
      [512, 1024],
      [0, 0],
      [1024, 0],
      [0, 1024],
      [1024, 1024],
    ];

    stars.forEach(([sx, sy]) => {
      ctx.save();
      ctx.translate(sx, sy);

      // Gold outer diamond
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(22, 0);
      ctx.lineTo(0, 22);
      ctx.lineTo(-22, 0);
      ctx.closePath();
      ctx.fill();

      // Dark Emperador inner diamond
      ctx.fillStyle = darkEmperador;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(14, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-14, 0);
      ctx.closePath();
      ctx.fill();

      // Center bright gold jewel
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    });

    const floorTex = new THREE.CanvasTexture(canvas);
    floorTex.wrapS = THREE.RepeatWrapping;
    floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(16, 16);
    floorTex.colorSpace = THREE.SRGBColorSpace;

    const floorMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: floorTex,
      roughness: 0.15,
      metalness: 0.08,
    });
    const floorMesh = new THREE.Mesh(floorGeom, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(0, 0, 0);
    floorMesh.receiveShadow = true;
    this.scene.add(floorMesh);

    // 2. Grand Illuminated Ceiling
    const ceilGeom = new THREE.PlaneGeometry(120, 120);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
    });
    const ceilMesh = new THREE.Mesh(ceilGeom, ceilMat);
    ceilMesh.position.y = 10;
    ceilMesh.rotation.x = Math.PI / 2;
    this.scene.add(ceilMesh);

    // 3. Grand Walls with Arches, Columns & Panoramic Garden Windows
    const wallMat = new THREE.MeshStandardMaterial({
      color: this.theme.wallColor,
      roughness: 0.4,
    });

    // Back Wall (behind stage)
    const backWall = new THREE.Mesh(new THREE.PlaneGeometry(48, 10), wallMat);
    backWall.position.set(0, 5, -22);
    this.scene.add(backWall);

    // Left Wall with Arched Windows
    const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(56, 10), wallMat);
    leftWall.position.set(-20, 5, 4);
    leftWall.rotation.y = Math.PI / 2;
    this.scene.add(leftWall);

    // Right Wall
    const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(56, 10), wallMat);
    rightWall.position.set(20, 5, 4);
    rightWall.rotation.y = -Math.PI / 2;
    this.scene.add(rightWall);

    // Front Wall with Entrance Arch
    const frontWall = new THREE.Mesh(new THREE.PlaneGeometry(48, 10), wallMat);
    frontWall.position.set(0, 5, 30);
    frontWall.rotation.y = Math.PI;
    this.scene.add(frontWall);

    // Classical Marble Columns along the hall
    const colGeom = new THREE.CylinderGeometry(0.4, 0.45, 9.8, 16);
    const colMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });
    [-19, 19].forEach((x) => {
      [-16, -8, 0, 8, 16, 24].forEach((z) => {
        const col = new THREE.Mesh(colGeom, colMat);
        col.position.set(x, 4.9, z);
        col.castShadow = true;
        this.scene.add(col);
      });
    });

    // Collision for outer hall boundaries
    this.collisionObstacles.push(
      { minX: -21, maxX: 21, minZ: -23, maxZ: -21.8, height: 10 }, // Back
      { minX: -21, maxX: -19.5, minZ: -22, maxZ: 31, height: 10 }, // Left
      { minX: 19.5, maxX: 21, minZ: -22, maxZ: 31, height: 10 },  // Right
      { minX: -21, maxX: 21, minZ: 29.5, maxZ: 31, height: 10 }    // Front
    );

    // 4. Chandeliers (Crystal vs Fairy)
    const chGeom = new THREE.CylinderGeometry(1.6, 0.4, 1.2, 12, 1, true);
    const chMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: this.theme.accentLightColor,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9,
    });
    const ch1 = new THREE.Mesh(chGeom, chMat);
    ch1.position.set(-5, 8.5, 2);
    const ch2 = new THREE.Mesh(chGeom, chMat);
    ch2.position.set(5, 8.5, 2);
    this.scene.add(ch1, ch2);
  }

  private buildStage() {
    // 1. Stage Platform: width 18, depth 8, height 1.2m at z = -18
    const stageGeom = new THREE.BoxGeometry(18, 1.2, 8);
    const stageMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.1,
    });
    const stageMesh = new THREE.Mesh(stageGeom, stageMat);
    stageMesh.position.set(0, 0.6, -18);
    stageMesh.receiveShadow = true;
    stageMesh.castShadow = true;
    this.scene.add(stageMesh);

    // Stage Front Stairs: width 4.5, steps rising from z = -14 to -14.8
    const stepMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    for (let i = 0; i < 4; i++) {
      const stepH = 0.3 * (i + 1);
      const stepMesh = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.3, 0.4), stepMat);
      stepMesh.position.set(0, 0.15 + i * 0.3, -14.2 - i * 0.3);
      stepMesh.receiveShadow = true;
      this.scene.add(stepMesh);
    }

    // Collision Boundaries for Stage:
    // Left & Right & Back cannot be walked through; Front can ONLY be ascended via the stairs!
    this.collisionObstacles.push(
      // Left side of stage
      { minX: -9.2, maxX: -2.3, minZ: -22, maxZ: -14, height: 1.2 },
      // Right side of stage
      { minX: 2.3, maxX: 9.2, minZ: -22, maxZ: -14, height: 1.2 },
      // Back of stage
      { minX: -9, maxX: 9, minZ: -22.2, maxZ: -21.6, height: 1.2 },
      // Central stairs passage: flagged as stairs so player height ascends smoothly
      { minX: -2.3, maxX: 2.3, minZ: -15.4, maxZ: -14.0, height: 1.2, isStairs: true }
    );

    // 2. Floral Stage Backdrop
    const backdropGeom = new THREE.PlaneGeometry(16, 5.5);
    const backdropCanvas = document.createElement('canvas');
    backdropCanvas.width = 1024;
    backdropCanvas.height = 350;
    const bCtx = backdropCanvas.getContext('2d')!;
    bCtx.fillStyle = '#fffdfa';
    bCtx.fillRect(0, 0, 1024, 350);

    // Gold border
    bCtx.strokeStyle = '#d4af37';
    bCtx.lineWidth = 8;
    bCtx.strokeRect(20, 20, 984, 310);

    // Text
    bCtx.fillStyle = '#9b111e';
    bCtx.font = 'bold 44px "Playfair Display", Georgia, serif';
    bCtx.textAlign = 'center';
    bCtx.fillText(`${this.config.groom} ♥ ${this.config.bride}`, 512, 110);

    bCtx.fillStyle = '#b45309';
    bCtx.font = '24px "Segoe UI", sans-serif';
    bCtx.letterSpacing = '4px';
    bCtx.fillText('HÔN LỄ TRỌN VẸN YÊU THƯƠNG · 29/11/2026', 512, 160);

    bCtx.fillStyle = '#4a5568';
    bCtx.font = 'italic 20px "Segoe UI", sans-serif';
    bCtx.fillText(this.config.welcome, 512, 220);

    const backdropTex = new THREE.CanvasTexture(backdropCanvas);
    backdropTex.colorSpace = THREE.SRGBColorSpace;
    const backdropMat = new THREE.MeshStandardMaterial({ map: backdropTex, roughness: 0.6 });
    const backdropMesh = new THREE.Mesh(backdropGeom, backdropMat);
    backdropMesh.position.set(0, 4.2, -21.8);
    this.scene.add(backdropMesh);

    // 3. Multi-tier Wedding Cake on Stage Left
    this.cakeTowerGroup = new THREE.Group();
    this.cakeTowerGroup.position.set(-6, 1.2, -18);
    const cakeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.4 });
    [
      { r: 0.9, h: 0.5, y: 0.25 },
      { r: 0.65, h: 0.45, y: 0.725 },
      { r: 0.4, h: 0.4, y: 1.15 },
    ].forEach((tier) => {
      const tierMesh = new THREE.Mesh(new THREE.CylinderGeometry(tier.r, tier.r, tier.h, 16), cakeMat);
      tierMesh.position.y = tier.y;
      const trimMesh = new THREE.Mesh(new THREE.TorusGeometry(tier.r, 0.04, 6, 20), trimMat);
      trimMesh.rotation.x = Math.PI / 2;
      trimMesh.position.y = tier.y - tier.h / 2;
      this.cakeTowerGroup.add(tierMesh, trimMesh);
    });
    this.scene.add(this.cakeTowerGroup);

    // 4. Champagne Glass Fountain on Stage Right
    const champGroup = new THREE.Group();
    champGroup.position.set(6, 1.2, -18);
    const champGlassMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.1,
      transparent: true,
      opacity: 0.75,
    });
    for (let lvl = 0; lvl < 3; lvl++) {
      const count = 3 - lvl;
      for (let cx = 0; cx < count; cx++) {
        for (let cz = 0; cz < count; cz++) {
          const gMesh = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 8), champGlassMat);
          gMesh.position.set((cx - count / 2) * 0.22, lvl * 0.22 + 0.1, (cz - count / 2) * 0.22);
          champGroup.add(gMesh);
        }
      }
    }
    this.scene.add(champGroup);

    // 5. NPC Bride & Groom Greeting on Stage Center
    this.buildNPCs();

    // 6. Stage Screens:
    // Left Screen: Countdown
    this.buildCountdownScreen();
    // Center Screen: YouTube Video Hole Punch Mesh
    this.buildVideoHoleMesh();
    // Right Screen: Top 10 Leaderboard
    this.buildLeaderboardScreen();
  }

  private buildNPCs() {
    this.npcCoupleGroup = new THREE.Group();
    this.npcCoupleGroup.position.set(0, 1.2, -16.5);

    // Groom NPC (Hoàng Duy)
    const groomGroup = new THREE.Group();
    groomGroup.position.set(-0.8, 0, 0);

    const suitMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.5 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffebd8, roughness: 0.5 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });

    const groomBody = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.6, 12), suitMat);
    groomBody.position.y = 0.7;
    const groomHead = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16), skinMat);
    groomHead.position.y = 1.28;
    const groomHair = new THREE.Mesh(new THREE.SphereGeometry(0.4, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), hairMat);
    groomHair.position.y = 1.34;
    groomGroup.add(groomBody, groomHead, groomHair);

    // Bride NPC (Thiều Tâm)
    const brideGroup = new THREE.Group();
    brideGroup.position.set(0.8, 0, 0);

    const gownMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const brideBody = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.58, 12), gownMat);
    brideBody.position.y = 0.7;
    const brideDress = new THREE.Mesh(new THREE.ConeGeometry(0.55, 0.65, 16), gownMat);
    brideDress.position.y = 0.42;
    const brideHead = new THREE.Mesh(new THREE.SphereGeometry(0.36, 16, 16), skinMat);
    brideHead.position.y = 1.25;
    const brideHair = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    brideHair.position.y = 1.3;

    // Bride Veil
    const veilMat = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 });
    const veil = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), veilMat);
    veil.position.set(0, 1.15, -0.32);
    brideGroup.add(brideBody, brideDress, brideHead, brideHair, veil);

    // Bouquet in bride's hand
    const bqtMat = new THREE.MeshStandardMaterial({ color: 0xf472b6 });
    const bouquetMesh = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), bqtMat);
    bouquetMesh.position.set(-0.25, 0.7, 0.25);
    brideGroup.add(bouquetMesh);

    this.npcCoupleGroup.add(groomGroup, brideGroup);
    this.scene.add(this.npcCoupleGroup);
  }

  public triggerNPCThank() {
    this.npcThankTimer = 4.0; // 4 seconds bowing & waving
  }

  // 5.1 Center Video Screen: Hole Punch Technique
  private buildVideoHoleMesh() {
    // Large LED Screen frame
    const frameGeom = new THREE.BoxGeometry(8.6, 5.0, 0.2);
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6, roughness: 0.3 });
    const frameMesh = new THREE.Mesh(frameGeom, frameMat);
    frameMesh.position.set(0, 4.4, -20.2);
    this.scene.add(frameMesh);

    // Hole Punch mesh: MeshBasicMaterial with transparent: true and NoBlending
    // Clears the WebGL canvas alpha so CSS3D iframe positioned underneath shows through directly!
    const holeGeom = new THREE.PlaneGeometry(8.2, 4.6);
    const holeMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      opacity: 0,
      transparent: true,
      blending: THREE.NoBlending,
    });
    this.mainVideoHoleMesh = new THREE.Mesh(holeGeom, holeMat);
    this.mainVideoHoleMesh.position.set(0, 4.4, -20.08);
    this.scene.add(this.mainVideoHoleMesh);
  }

  // Left Secondary Screen: Countdown
  private buildCountdownScreen() {
    const frameMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 3.2, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4 })
    );
    frameMesh.position.set(-6.8, 4.5, -20.2);
    this.scene.add(frameMesh);

    this.countdownCanvas = document.createElement('canvas');
    this.countdownCanvas.width = 512;
    this.countdownCanvas.height = 384;
    this.countdownTexture = new THREE.CanvasTexture(this.countdownCanvas);
    this.countdownTexture.colorSpace = THREE.SRGBColorSpace;

    const screenMat = new THREE.MeshBasicMaterial({ map: this.countdownTexture });
    this.countdownMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.0), screenMat);
    this.countdownMesh.position.set(-6.8, 4.5, -20.08);
    this.scene.add(this.countdownMesh);

    this.updateCountdownTexture();
  }

  public updateCountdownTexture() {
    const ctx = this.countdownCanvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 384);

    // Glowing border
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 364);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 24px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ĐẾM NGƯỢC HÔN LỄ', 256, 50);

    ctx.fillStyle = '#fda4af';
    ctx.font = 'bold 28px "Playfair Display", serif';
    ctx.fillText(`${this.config.groom} ♥ ${this.config.bride}`, 256, 95);

    // Target: 18:00 29/11/2026
    const targetDate = new Date('2026-11-29T18:00:00+07:00').getTime();
    const diff = targetDate - Date.now();

    if (diff <= 0) {
      ctx.fillStyle = '#f59e0b';
      ctx.font = 'bold 32px "Segoe UI", sans-serif';
      ctx.fillText('💍 HÔN LỄ ĐANG DIỄN RA', 256, 180);
      ctx.fillStyle = '#ffffff';
      ctx.font = '22px "Segoe UI", sans-serif';
      ctx.fillText('Trăm năm hạnh phúc · Duy ♥ Tâm', 256, 230);
    } else {
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / 1000 / 60) % 60);
      const seconds = Math.floor((diff / 1000) % 60);

      const dStr = days.toString().padStart(2, '0');
      const hStr = hours.toString().padStart(2, '0');
      const mStr = minutes.toString().padStart(2, '0');
      const sStr = seconds.toString().padStart(2, '0');

      ctx.fillStyle = '#f43f5e';
      ctx.font = 'bold 44px monospace';
      ctx.fillText(`${dStr}d : ${hStr}h : ${mStr}m`, 256, 175);
      ctx.fillText(`${sStr}s`, 256, 235);

      ctx.fillStyle = '#94a3b8';
      ctx.font = '18px "Segoe UI", sans-serif';
      ctx.fillText('29/11/2026 · Sảnh Diamond & Sophia', 256, 290);
    }

    this.countdownTexture.needsUpdate = true;
  }

  // Right Secondary Screen: Top 10 Leaderboard
  private buildLeaderboardScreen() {
    const frameMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4.2, 3.2, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.4 })
    );
    frameMesh.position.set(6.8, 4.5, -20.2);
    this.scene.add(frameMesh);

    this.leaderboardCanvas = document.createElement('canvas');
    this.leaderboardCanvas.width = 512;
    this.leaderboardCanvas.height = 384;
    this.leaderboardTexture = new THREE.CanvasTexture(this.leaderboardCanvas);
    this.leaderboardTexture.colorSpace = THREE.SRGBColorSpace;

    const screenMat = new THREE.MeshBasicMaterial({ map: this.leaderboardTexture });
    this.leaderboardMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.0, 3.0), screenMat);
    this.leaderboardMesh.position.set(6.8, 4.5, -20.08);
    this.scene.add(this.leaderboardMesh);

    this.updateLeaderboardTexture([]);
  }

  public updateLeaderboardTexture(entries: LeaderboardEntry[]) {
    const ctx = this.leaderboardCanvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 384);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 492, 364);

    ctx.fillStyle = '#f59e0b';
    ctx.font = 'bold 22px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 TOP ĐIỂM HỶ 💗 TOÀN TIỆC', 256, 42);

    ctx.textAlign = 'left';
    ctx.font = '16px "Segoe UI", sans-serif';

    const top5 = entries.slice(0, 6);
    top5.forEach((item, idx) => {
      const y = 80 + idx * 46;
      const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `${idx + 1}.`;
      ctx.fillStyle = idx === 0 ? '#fbbf24' : idx < 3 ? '#e2e8f0' : '#94a3b8';
      ctx.fillText(`${medal} ${item.name.slice(0, 14)}`, 30, y);

      ctx.fillStyle = '#f43f5e';
      ctx.fillText(`${item.score} 💗`, 400, y);
    });

    if (top5.length === 0) {
      ctx.fillStyle = '#94a3b8';
      ctx.textAlign = 'center';
      ctx.fillText('Tham gia trò chơi để ghi danh lên bảng vàng!', 256, 180);
    }

    this.leaderboardTexture.needsUpdate = true;
  }

  // Setup CSS3D YouTube Iframe attached to main stage LED screen
  private setupYoutubeVideo() {
    const ytid = this.config.video?.youtubeId || 'uIlNkfn6NcA';

    // CSS3D Object size matching the hole punch mesh aspect ratio (8.2m x 4.6m -> 820px x 460px)
    const iframe = document.createElement('iframe');
    iframe.width = '820';
    iframe.height = '460';
    iframe.style.border = '0';
    iframe.style.pointerEvents = 'none'; // allow rotating 3D camera
    const origin = window.location.origin;
    // Strictly disable closed captions (cc_load_policy=0, cc_lang_pref=off)
    iframe.src = `https://www.youtube-nocookie.com/embed/${ytid}?autoplay=1&mute=1&controls=0&disablekb=1&modestbranding=1&rel=0&playsinline=1&iv_load_policy=3&fs=0&cc_load_policy=0&cc_lang_pref=off&hl=vi&enablejsapi=1&origin=${encodeURIComponent(origin)}`;
    iframe.allow = 'autoplay; encrypted-media';
    iframe.id = 'wedding-yt-player';
    this.youtubeIframe = iframe;

    // Send postMessage to YouTube player API to unload captions module
    const disableCaptions = () => {
      try {
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'unloadModule', args: ['captions'] }),
          '*'
        );
        iframe.contentWindow?.postMessage(
          JSON.stringify({ event: 'command', func: 'setOption', args: ['captions', 'track', {}] }),
          '*'
        );
      } catch {}
    };

    iframe.addEventListener('load', () => {
      disableCaptions();
      setTimeout(disableCaptions, 1200);
      setTimeout(disableCaptions, 2500);
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

  // Chiavari / Tiffany Chair Frame: Champagne Gold Metal (Merged into 1 BufferGeometry)
  private createChiavariFrameGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];

    // 4 Turned Tapered Legs (height 0.44m)
    const legGeom = new THREE.CylinderGeometry(0.016, 0.012, 0.44, 8);
    const legPositions = [
      [-0.18, 0.22, 0.18],
      [0.18, 0.22, 0.18],
      [-0.18, 0.22, -0.18],
      [0.18, 0.22, -0.18],
    ];
    legPositions.forEach(([lx, ly, lz]) => {
      const g = legGeom.clone();
      g.translate(lx, ly, lz);
      parts.push(g);
    });

    // Seat perimeter frame bars connecting leg tops at y = 0.42
    const barFront = new THREE.BoxGeometry(0.36, 0.024, 0.024);
    barFront.translate(0, 0.42, 0.18);
    const barBack = new THREE.BoxGeometry(0.36, 0.024, 0.024);
    barBack.translate(0, 0.42, -0.18);
    const barLeft = new THREE.BoxGeometry(0.024, 0.024, 0.36);
    barLeft.translate(-0.18, 0.42, 0);
    const barRight = new THREE.BoxGeometry(0.024, 0.024, 0.36);
    barRight.translate(0.18, 0.42, 0);
    parts.push(barFront, barBack, barLeft, barRight);

    // Lower cross stretchers between legs at y = 0.14
    const rungFront = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6);
    rungFront.rotateZ(Math.PI / 2);
    rungFront.translate(0, 0.14, 0.18);

    const rungBack = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6);
    rungBack.rotateZ(Math.PI / 2);
    rungBack.translate(0, 0.14, -0.18);

    const rungLeft = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6);
    rungLeft.rotateX(Math.PI / 2);
    rungLeft.translate(-0.18, 0.14, 0);

    const rungRight = new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6);
    rungRight.rotateX(Math.PI / 2);
    rungRight.translate(0.18, 0.14, 0);
    parts.push(rungFront, rungBack, rungLeft, rungRight);

    // 2 Backrest Uprights extending up to y = 0.90
    const uprightGeom = new THREE.CylinderGeometry(0.015, 0.014, 0.48, 8);
    const upL = uprightGeom.clone();
    upL.translate(-0.18, 0.66, -0.18);
    const upR = uprightGeom.clone();
    upR.translate(0.18, 0.66, -0.18);
    parts.push(upL, upR);

    // Top curved/horizontal backrest rail at y = 0.90
    const topRail = new THREE.CylinderGeometry(0.018, 0.018, 0.38, 8);
    topRail.rotateZ(Math.PI / 2);
    topRail.translate(0, 0.90, -0.18);
    parts.push(topRail);

    // 3 Turned vertical spindles in the backrest
    const spindleGeom = new THREE.CylinderGeometry(0.009, 0.009, 0.42, 6);
    [-0.09, 0, 0.09].forEach((sx) => {
      const sp = spindleGeom.clone();
      sp.translate(sx, 0.66, -0.18);
      parts.push(sp);
    });

    return BufferGeometryUtils.mergeGeometries(parts, false);
  }

  // Chair Sash / Ribbon Bow at Backrest (Merged into 1 BufferGeometry)
  private createChairBowGeometry(): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    // Horizontal sash band wrapping backrest spindles at y = 0.70
    const sash = new THREE.BoxGeometry(0.38, 0.09, 0.025);
    sash.translate(0, 0.70, -0.18);
    // Center knot rosette
    const knot = new THREE.SphereGeometry(0.038, 8, 8);
    knot.translate(0, 0.70, -0.20);
    // Dangling ribbon tails
    const tailL = new THREE.PlaneGeometry(0.06, 0.24);
    tailL.rotateZ(0.15);
    tailL.translate(-0.04, 0.56, -0.20);
    const tailR = new THREE.PlaneGeometry(0.06, 0.24);
    tailR.rotateZ(-0.15);
    tailR.translate(0.04, 0.56, -0.20);
    parts.push(sash, knot, tailL, tailR);
    return BufferGeometryUtils.mergeGeometries(parts, false);
  }

  // Dining Tables & Chairs (3 InstancedMeshes for 48 chairs: only 3 draw calls total)
  private buildDiningTables() {
    const tableCoords = [
      { x: -9, z: -7 },
      { x: 9, z: -7 },
      { x: -9, z: 2 },
      { x: 9, z: 2 },
      { x: -9, z: 11 },
      { x: 9, z: 11 },
    ];

    const isDiamond = this.theme.id === 'diamond';

    // 1. Procedural Luxury Carpet Medallion Texture for each table (Circle d = 3.7m)
    const medCanvas = document.createElement('canvas');
    medCanvas.width = 512;
    medCanvas.height = 512;
    const mCtx = medCanvas.getContext('2d')!;

    // Outer edge soft fade
    mCtx.clearRect(0, 0, 512, 512);

    // Medallion Carpet Body
    mCtx.beginPath();
    mCtx.arc(256, 256, 248, 0, Math.PI * 2);
    // Rich contrast base: Royal Deep Navy for Diamond, Royal Burgundy for Sophia
    mCtx.fillStyle = isDiamond ? '#0f172a' : '#4c0519';
    mCtx.fill();

    // Outer Gilded Filigree Ring
    mCtx.strokeStyle = '#d4af37';
    mCtx.lineWidth = 8;
    mCtx.stroke();

    // Secondary Gold Ring
    mCtx.beginPath();
    mCtx.arc(256, 256, 230, 0, Math.PI * 2);
    mCtx.strokeStyle = isDiamond ? '#38bdf8' : '#f472b6';
    mCtx.lineWidth = 3;
    mCtx.stroke();

    // Concentric Inner Border
    mCtx.beginPath();
    mCtx.arc(256, 256, 175, 0, Math.PI * 2);
    mCtx.strokeStyle = '#d4af37';
    mCtx.lineWidth = 4;
    mCtx.stroke();

    // Center Gold Rosette / Sunburst
    mCtx.save();
    mCtx.translate(256, 256);
    for (let i = 0; i < 16; i++) {
      mCtx.rotate(Math.PI / 8);
      mCtx.fillStyle = i % 2 === 0 ? '#f59e0b' : '#d4af37';
      mCtx.beginPath();
      mCtx.ellipse(0, 110, 10, 40, 0, 0, Math.PI * 2);
      mCtx.fill();
    }
    mCtx.restore();

    const medTex = new THREE.CanvasTexture(medCanvas);
    medTex.colorSpace = THREE.SRGBColorSpace;
    const medMat = new THREE.MeshStandardMaterial({
      map: medTex,
      transparent: true,
      roughness: 0.7,
      metalness: 0.1,
    });
    const medGeom = new THREE.CircleGeometry(3.6, 48);

    // 2. Materials for Tables & Chiavari Chairs
    const tableClothMat = new THREE.MeshStandardMaterial({
      color: this.theme.tableClothColor,
      roughness: 0.65,
    });
    const tableOverlayMat = new THREE.MeshStandardMaterial({
      color: this.theme.tableOverlayColor,
      roughness: 0.35,
      metalness: 0.3,
    });
    const turntableMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      transparent: true,
      opacity: 0.75,
    });
    const vaseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
    });
    const flowerMat = new THREE.MeshStandardMaterial({
      color: this.theme.flowerPalette.primary,
      roughness: 0.55,
    });
    const candleMat = new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.5,
    });
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xfffefb,
      roughness: 0.25,
      metalness: 0.15,
    });
    const gobletMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      roughness: 0.1,
      transparent: true,
      opacity: 0.7,
    });

    // 3. Prepare Instanced Geometries & Materials for Chairs
    const chairFrameGeom = this.createChiavariFrameGeometry();
    const chairFrameMat = new THREE.MeshStandardMaterial({
      color: this.theme.chairFrameColor,
      metalness: 0.82,
      roughness: 0.22,
    });

    const chairCushionGeom = new THREE.BoxGeometry(0.42, 0.08, 0.42);
    chairCushionGeom.translate(0, 0.45, 0);
    const chairCushionMat = new THREE.MeshStandardMaterial({
      color: this.theme.chairClothColor,
      roughness: 0.65,
      metalness: 0.08,
    });

    const chairBowGeom = this.createChairBowGeometry();
    const chairBowMat = new THREE.MeshStandardMaterial({
      color: this.theme.chairBowColor,
      roughness: 0.35,
      metalness: 0.15,
    });

    const totalChairs = tableCoords.length * 8;
    const chairFrameInstanced = new THREE.InstancedMesh(chairFrameGeom, chairFrameMat, totalChairs);
    chairFrameInstanced.castShadow = true;
    chairFrameInstanced.receiveShadow = true;

    const chairCushionInstanced = new THREE.InstancedMesh(chairCushionGeom, chairCushionMat, totalChairs);
    chairCushionInstanced.castShadow = true;
    chairCushionInstanced.receiveShadow = true;

    const chairBowInstanced = new THREE.InstancedMesh(chairBowGeom, chairBowMat, totalChairs);
    chairBowInstanced.castShadow = true;

    let chairIdx = 0;
    const dummy = new THREE.Object3D();

    tableCoords.forEach((coord, tIdx) => {
      // A. Royal Carpet Medallion under this table setting
      const medMesh = new THREE.Mesh(medGeom, medMat);
      medMesh.position.set(coord.x, 0.012, coord.z);
      medMesh.rotation.x = -Math.PI / 2;
      medMesh.receiveShadow = true;
      this.scene.add(medMesh);

      // B. Table Group
      const tableGroup = new THREE.Group();
      tableGroup.position.set(coord.x, 0, coord.z);

      // Base draped ivory silk tablecloth
      const tableSkirt = new THREE.Mesh(
        new THREE.CylinderGeometry(1.65, 1.7, 0.74, 24),
        tableClothMat
      );
      tableSkirt.position.y = 0.37;
      tableSkirt.castShadow = true;
      tableSkirt.receiveShadow = true;
      tableGroup.add(tableSkirt);

      // Tabletop Embroidered Gold Runner Topper
      const tableRunner = new THREE.Mesh(
        new THREE.CylinderGeometry(1.22, 1.22, 0.02, 24),
        tableOverlayMat
      );
      tableRunner.position.y = 0.745;
      tableGroup.add(tableRunner);

      // Crystal Lazy Susan Turntable
      const turntable = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 0.02, 24),
        turntableMat
      );
      turntable.position.y = 0.76;
      tableGroup.add(turntable);

      // Centerpiece: Crystal Goblet Vase
      const vase = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.08, 0.45, 12),
        vaseMat
      );
      vase.position.y = 0.98;
      tableGroup.add(vase);

      // Centerpiece: Lush Fresh Rose Dome
      const flowerDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.34, 12, 10),
        flowerMat
      );
      flowerDome.position.y = 1.34;
      tableGroup.add(flowerDome);

      // Warm Glowing Candle Lantern
      const candle = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 8, 8),
        candleMat
      );
      candle.position.set(0.24, 0.80, 0.15);
      tableGroup.add(candle);

      // 8 Place Settings (Gold-rimmed bone china plate & crystal goblet)
      for (let sIdx = 0; sIdx < 8; sIdx++) {
        const pAngle = (sIdx / 8) * Math.PI * 2;
        const px = Math.cos(pAngle) * 1.35;
        const pz = Math.sin(pAngle) * 1.35;

        const plate = new THREE.Mesh(
          new THREE.CylinderGeometry(0.16, 0.16, 0.015, 16),
          plateMat
        );
        plate.position.set(px, 0.745, pz);

        const goblet = new THREE.Mesh(
          new THREE.CylinderGeometry(0.035, 0.02, 0.09, 8),
          gobletMat
        );
        goblet.position.set(px * 0.88 + 0.08, 0.79, pz * 0.88 + 0.08);

        tableGroup.add(plate, goblet);
      }

      this.scene.add(tableGroup);

      // Collision boundary for table
      this.collisionObstacles.push({
        minX: coord.x - 1.8,
        maxX: coord.x + 1.8,
        minZ: coord.z - 1.8,
        maxZ: coord.z + 1.8,
        height: 0.8,
      });

      // 8 Chiavari Chairs arranged in a circle facing the table center
      for (let sIdx = 0; sIdx < 8; sIdx++) {
        const angle = (sIdx / 8) * Math.PI * 2;
        const cx = coord.x + Math.cos(angle) * 2.3;
        const cz = coord.z + Math.sin(angle) * 2.3;

        dummy.position.set(cx, 0, cz);
        dummy.rotation.y = -angle - Math.PI / 2;
        dummy.updateMatrix();

        chairFrameInstanced.setMatrixAt(chairIdx, dummy.matrix);
        chairCushionInstanced.setMatrixAt(chairIdx, dummy.matrix);
        chairBowInstanced.setMatrixAt(chairIdx, dummy.matrix);

        // Record seat location for interactive "Sit down" action
        this.tableSeats.push({
          tableIndex: tIdx,
          seatIndex: sIdx,
          position: new THREE.Vector3(cx, 0, cz),
          lookAt: new THREE.Vector3(coord.x, 0.75, coord.z),
        });

        chairIdx++;
      }
    });

    this.scene.add(chairFrameInstanced, chairCushionInstanced, chairBowInstanced);
  }

  // Entrance Floral Arch & Red Carpet Aisle
  private buildEntranceAndAisle() {
    // 1. Red Carpet Aisle running from z = 19 to z = -14
    const carpetGeom = new THREE.PlaneGeometry(3.6, 33);
    const carpetMat = new THREE.MeshStandardMaterial({
      color: this.theme.carpetColor,
      roughness: 0.7,
    });
    const carpetMesh = new THREE.Mesh(carpetGeom, carpetMat);
    carpetMesh.position.set(0, 0.015, 2.5);
    carpetMesh.rotation.x = -Math.PI / 2;
    carpetMesh.receiveShadow = true;
    this.scene.add(carpetMesh);

    // Gold trim ribbons along carpet edges
    const trimGeom = new THREE.PlaneGeometry(0.12, 33);
    const trimMat = new THREE.MeshStandardMaterial({ color: this.theme.carpetBorderColor, metalness: 0.4 });
    const trimL = new THREE.Mesh(trimGeom, trimMat);
    trimL.position.set(-1.8, 0.02, 2.5);
    trimL.rotation.x = -Math.PI / 2;
    const trimR = new THREE.Mesh(trimGeom, trimMat);
    trimR.position.set(1.8, 0.02, 2.5);
    trimR.rotation.x = -Math.PI / 2;
    this.scene.add(trimL, trimR);

    // 2. Floral Entrance Arch
    const archGroup = new THREE.Group();
    archGroup.position.set(0, 0, 18);

    const archGeom = new THREE.TorusGeometry(3.2, 0.35, 10, 24, Math.PI);
    const archMat = new THREE.MeshStandardMaterial({
      color: this.theme.flowerPalette.primary,
      roughness: 0.6,
    });
    const archMesh = new THREE.Mesh(archGeom, archMat);
    archMesh.position.y = 2.8;
    archMesh.rotation.z = Math.PI;

    // Welcome Signboard on Arch
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 128;
    const sCtx = signCanvas.getContext('2d')!;
    sCtx.fillStyle = '#fffaf0';
    sCtx.fillRect(0, 0, 512, 128);
    sCtx.strokeStyle = '#d4af37';
    sCtx.lineWidth = 6;
    sCtx.strokeRect(6, 6, 500, 116);
    sCtx.fillStyle = '#be185d';
    sCtx.font = 'bold 36px "Playfair Display", Georgia, serif';
    sCtx.textAlign = 'center';
    sCtx.fillText('Duy ♥ Tâm', 256, 75);

    const signTex = new THREE.CanvasTexture(signCanvas);
    signTex.colorSpace = THREE.SRGBColorSpace;
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.4, 0.65),
      new THREE.MeshStandardMaterial({ map: signTex })
    );
    signMesh.position.y = 4.2;

    archGroup.add(archMesh, signMesh);
    this.scene.add(archGroup);
  }

  // Interactive Reception, Shop, Game Arcade Booths, and Photo Wall
  private buildBoothsAndStalls() {
    // 1. Reception Table (Guestbook & Wedding gift box)
    const recepGroup = new THREE.Group();
    recepGroup.position.copy(this.receptionPosition);

    const tableMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.4, 0.85, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xffedd5, roughness: 0.5 })
    );
    tableMesh.position.y = 0.425;

    // Guestbook on table
    const bookMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.06, 0.4),
      new THREE.MeshStandardMaterial({ color: 0x9b111e })
    );
    bookMesh.position.set(-0.4, 0.88, 0);

    // Decorative Gift Box ("Thùng mừng cưới")
    const boxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.5, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 })
    );
    boxMesh.position.set(0.5, 1.1, 0);

    recepGroup.add(tableMesh, bookMesh, boxMesh);
    this.scene.add(recepGroup);

    this.collisionObstacles.push({
      minX: this.receptionPosition.x - 1.4,
      maxX: this.receptionPosition.x + 1.4,
      minZ: this.receptionPosition.z - 0.8,
      maxZ: this.receptionPosition.z + 0.8,
      height: 1.2,
    });

    // 2. Gift & Wardrobe Stall
    const shopGroup = new THREE.Group();
    shopGroup.position.copy(this.shopPosition);
    const shopCounter = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 0.9, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xfdf4ff, roughness: 0.4 })
    );
    shopCounter.position.y = 0.45;
    shopGroup.add(shopCounter);
    this.scene.add(shopGroup);

    this.collisionObstacles.push({
      minX: this.shopPosition.x - 1.5,
      maxX: this.shopPosition.x + 1.5,
      minZ: this.shopPosition.z - 0.8,
      maxZ: this.shopPosition.z + 0.8,
      height: 1.2,
    });

    // 3. Grand Wedding Game Arcade Area (Left Wall at x = -14)
    // Overhead Arcade Marquee Arch
    const arcadeArchGroup = new THREE.Group();
    arcadeArchGroup.position.set(-14.5, 3.8, 2.5);

    const arcadeArchCanvas = document.createElement('canvas');
    arcadeArchCanvas.width = 1024;
    arcadeArchCanvas.height = 128;
    const aCtx = arcadeArchCanvas.getContext('2d')!;
    aCtx.fillStyle = '#0f172a';
    aCtx.fillRect(0, 0, 1024, 128);
    aCtx.strokeStyle = '#f59e0b';
    aCtx.lineWidth = 6;
    aCtx.strokeRect(6, 6, 1012, 116);
    aCtx.fillStyle = '#fef08a';
    aCtx.font = 'bold 36px "Segoe UI", sans-serif';
    aCtx.textAlign = 'center';
    aCtx.fillText('🎮 KHU TRÒ CHƠI CƯỚI · THỬ TÀI NHẬN ĐIỂM HỶ 💗', 512, 58);
    aCtx.fillStyle = '#f472b6';
    aCtx.font = '20px "Segoe UI", sans-serif';
    aCtx.fillText('Chơi game vui mừng tân hôn · Tích luỹ điểm Hỷ tặng hoa Duy ♥ Tâm', 512, 98);

    const arcadeArchTex = new THREE.CanvasTexture(arcadeArchCanvas);
    arcadeArchTex.colorSpace = THREE.SRGBColorSpace;
    const arcadeArchMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 2.0),
      new THREE.MeshStandardMaterial({
        map: arcadeArchTex,
        roughness: 0.3,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.25,
      })
    );
    arcadeArchMesh.rotation.y = Math.PI / 2;
    arcadeArchGroup.add(arcadeArchMesh);
    this.scene.add(arcadeArchGroup);

    // 4 High-Visibility Game Booths with Large Signboards & Floating Icons
    const boothsData = [
      {
        id: 'jigsaw',
        title: '🧩 GHÉP HÌNH CƯỚI',
        reward: 'Thưởng: +10 ~ +35 💗 Điểm Hỷ',
        desc: 'Ghép tranh kỷ niệm Duy ♥ Tâm',
        color: 0xec4899,
        colorHex: '#ec4899',
        pos: new THREE.Vector3(-14, 0, -5),
      },
      {
        id: 'cards',
        title: '🃏 LẬT THẺ TRÍ NHỚ',
        reward: 'Thưởng: +10 ~ +25 💗 Điểm Hỷ',
        desc: 'Tìm các cặp đôi hạnh phúc',
        color: 0x8b5cf6,
        colorHex: '#8b5cf6',
        pos: new THREE.Vector3(-14, 0, 0),
      },
      {
        id: 'quiz',
        title: '❓ ĐỐ VUI TÌNH YÊU',
        reward: 'Thưởng: +5 ~ +50 💗 Điểm Hỷ',
        desc: 'Trả lời câu hỏi về Duy & Tâm',
        color: 0xf59e0b,
        colorHex: '#f59e0b',
        pos: new THREE.Vector3(-14, 0, 5),
      },
      {
        id: 'hearts',
        title: '💘 BẮN TIM HẠNH PHÚC',
        reward: 'Thưởng: +15 💗 Điểm Hỷ',
        desc: 'Bắn tim chúc phúc cô dâu chú rể',
        color: 0xef4444,
        colorHex: '#ef4444',
        pos: new THREE.Vector3(-14, 0, 10),
      },
    ];

    boothsData.forEach((b) => {
      const bGroup = new THREE.Group();
      bGroup.position.copy(b.pos);

      // Floor Zone Ring with Theme Color
      const ringMesh = new THREE.Mesh(
        new THREE.RingGeometry(0.8, 1.6, 32),
        new THREE.MeshBasicMaterial({
          color: b.color,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.65,
        })
      );
      ringMesh.rotation.x = -Math.PI / 2;
      ringMesh.position.y = 0.015;
      bGroup.add(ringMesh);

      // Lower Cabinet Console
      const cabinetMesh = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.9, 1.0),
        new THREE.MeshStandardMaterial({
          color: 0x1e293b,
          roughness: 0.3,
          metalness: 0.4,
        })
      );
      cabinetMesh.position.y = 0.45;
      bGroup.add(cabinetMesh);

      // Angled Screen & Signboard (Canvas 512x384)
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 512;
      signCanvas.height = 384;
      const sCtx = signCanvas.getContext('2d')!;

      // Background
      sCtx.fillStyle = '#0f172a';
      sCtx.fillRect(0, 0, 512, 384);

      // Vibrant Border
      sCtx.strokeStyle = b.colorHex;
      sCtx.lineWidth = 10;
      sCtx.strokeRect(8, 8, 496, 368);

      // Header Tag
      sCtx.fillStyle = b.colorHex;
      sCtx.fillRect(16, 16, 480, 50);
      sCtx.fillStyle = '#ffffff';
      sCtx.font = 'bold 22px "Segoe UI", sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText('MINI GAME TIỆC CƯỚI', 256, 50);

      // Big Game Title
      sCtx.fillStyle = '#ffffff';
      sCtx.font = 'bold 32px "Segoe UI", sans-serif';
      sCtx.fillText(b.title, 256, 140);

      // Description
      sCtx.fillStyle = '#cbd5e1';
      sCtx.font = '20px "Segoe UI", sans-serif';
      sCtx.fillText(b.desc, 256, 190);

      // Reward Banner
      sCtx.fillStyle = '#fef08a';
      sCtx.font = 'bold 24px "Segoe UI", sans-serif';
      sCtx.fillText(b.reward, 256, 250);

      // Call to action button
      sCtx.fillStyle = b.colorHex;
      sCtx.beginPath();
      sCtx.roundRect(56, 290, 400, 60, 20);
      sCtx.fill();
      sCtx.fillStyle = '#ffffff';
      sCtx.font = 'bold 24px "Segoe UI", sans-serif';
      sCtx.fillText('👉 NHẤN E HOẶC CHẠM ĐỂ CHƠI', 256, 328);

      const signTex = new THREE.CanvasTexture(signCanvas);
      signTex.colorSpace = THREE.SRGBColorSpace;
      const screenMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.5, 1.2),
        new THREE.MeshStandardMaterial({
          map: signTex,
          roughness: 0.2,
          emissive: b.color,
          emissiveIntensity: 0.15,
        })
      );
      screenMesh.position.set(0, 1.5, 0.45);
      screenMesh.rotation.y = Math.PI / 2; // Facing the hall interior towards +X
      bGroup.add(screenMesh);

      // Back Screen for two-sided visibility
      const backScreenMesh = screenMesh.clone();
      backScreenMesh.rotation.y = -Math.PI / 2;
      backScreenMesh.position.set(0, 1.5, -0.45);
      bGroup.add(backScreenMesh);

      // Top Marquee Header Box
      const topBox = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 0.35, 1.0),
        new THREE.MeshStandardMaterial({
          color: b.color,
          roughness: 0.2,
          emissive: b.color,
          emissiveIntensity: 0.4,
        })
      );
      topBox.position.y = 2.25;
      bGroup.add(topBox);

      // Floating 3D Glowing Gem / Heart above booth
      const gemMesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.3, 0),
        new THREE.MeshStandardMaterial({
          color: b.color,
          roughness: 0.1,
          metalness: 0.8,
          emissive: b.color,
          emissiveIntensity: 0.8,
        })
      );
      gemMesh.position.y = 2.75;
      bGroup.add(gemMesh);

      this.scene.add(bGroup);

      this.boothLocations.push({
        id: b.id,
        name: b.title,
        position: b.pos,
        radius: 2.8,
      });

      this.collisionObstacles.push({
        minX: b.pos.x - 1.0,
        maxX: b.pos.x + 1.0,
        minZ: b.pos.z - 0.8,
        maxZ: b.pos.z + 0.8,
        height: 2.2,
      });
    });

    // 4. Photo Gallery Wall on Right Wall (x = 17.8)
    const samplePhotos = [
      { url: '/media/photos/photo1.svg', title: 'Khoảnh Khắc Bình Yên' },
      { url: '/media/photos/photo2.svg', title: 'Nắm Tay Dưới Hoàng Hôn' },
      { url: '/media/photos/photo3.svg', title: 'Lời Hứa Trọn Đời' },
      { url: '/media/photos/photo4.svg', title: 'Nâng Ly Hạnh Phúc' },
    ];

    const texLoader = new THREE.TextureLoader();
    samplePhotos.forEach((item, idx) => {
      const pZ = -8 + idx * 5.5;
      const frameGeom = new THREE.BoxGeometry(0.1, 2.2, 2.9);
      const frameMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.8, roughness: 0.2 });
      const frameMesh = new THREE.Mesh(frameGeom, frameMat);
      frameMesh.position.set(17.8, 3.8, pZ);

      // Photo inside
      texLoader.load(item.url, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const picGeom = new THREE.PlaneGeometry(2.6, 1.9);
        const picMat = new THREE.MeshBasicMaterial({ map: tex });
        const picMesh = new THREE.Mesh(picGeom, picMat);
        picMesh.position.set(-0.06, 0, 0);
        picMesh.rotation.y = -Math.PI / 2;
        frameMesh.add(picMesh);
        this.photoWallObjects.push({ mesh: picMesh, url: item.url, title: item.title });
      });

      this.scene.add(frameMesh);
    });

    // 5. Dedicated 3D Photo Booth & Face Swap Kiosk (Right Wall at x = 14.5, z = 14)
    const photoBoothGroup = new THREE.Group();
    photoBoothGroup.position.set(14.5, 0, 14);

    // Red Carpet Studio Mat
    const matMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.7 })
    );
    matMesh.rotation.x = -Math.PI / 2;
    matMesh.position.y = 0.015;
    photoBoothGroup.add(matMesh);

    // Kiosk Body
    const pbBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.8, 1.0, 1.2),
      new THREE.MeshStandardMaterial({ color: 0xfff1f2, roughness: 0.4 })
    );
    pbBody.position.y = 0.5;
    photoBoothGroup.add(pbBody);

    // Photo Booth Signboard Canvas
    const pbCanvas = document.createElement('canvas');
    pbCanvas.width = 512;
    pbCanvas.height = 300;
    const pbCtx = pbCanvas.getContext('2d')!;
    pbCtx.fillStyle = '#fff0f5';
    pbCtx.fillRect(0, 0, 512, 300);
    pbCtx.strokeStyle = '#d4af37';
    pbCtx.lineWidth = 8;
    pbCtx.strokeRect(6, 6, 500, 288);
    pbCtx.fillStyle = '#be185d';
    pbCtx.font = 'bold 30px "Playfair Display", Georgia, serif';
    pbCtx.textAlign = 'center';
    pbCtx.fillText('📸 GÓC CHỤP ẢNH CƯỚI', 256, 65);
    pbCtx.fillStyle = '#831843';
    pbCtx.font = 'bold 24px "Segoe UI", sans-serif';
    pbCtx.fillText('GHÉP MẶT DUY ♥ TÂM', 256, 115);
    pbCtx.fillStyle = '#475569';
    pbCtx.font = '18px "Segoe UI", sans-serif';
    pbCtx.fillText('Tải ảnh bạn lên · Ghép mặt cùng cô dâu chú rể', 256, 170);
    pbCtx.fillStyle = '#e11d48';
    pbCtx.font = 'bold 22px "Segoe UI", sans-serif';
    pbCtx.fillText('👉 NHẤN E HOẶC CHẠM ĐỂ CHỤP ẢNH', 256, 235);

    const pbTex = new THREE.CanvasTexture(pbCanvas);
    pbTex.colorSpace = THREE.SRGBColorSpace;
    const pbSignMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1.8, 1.1),
      new THREE.MeshStandardMaterial({ map: pbTex })
    );
    pbSignMesh.position.set(0, 1.6, 0.45);
    pbSignMesh.rotation.y = -Math.PI / 2;
    photoBoothGroup.add(pbSignMesh);

    // 3D Camera Prop on top of Kiosk
    const cameraBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.35, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 })
    );
    cameraBody.position.y = 2.3;
    const cameraLens = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.15, 16),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.7 })
    );
    cameraLens.rotation.x = Math.PI / 2;
    cameraLens.position.set(0, 2.3, 0.18);
    photoBoothGroup.add(cameraBody, cameraLens);

    this.scene.add(photoBoothGroup);

    this.boothLocations.push({
      id: 'photobooth',
      name: 'Góc Chụp Ảnh & Ghép Mặt Cưới 📸',
      position: new THREE.Vector3(14.5, 0, 14),
      radius: 3.2,
    });

    this.collisionObstacles.push({
      minX: 13.5,
      maxX: 15.5,
      minZ: 13.2,
      maxZ: 14.8,
      height: 2.2,
    });
  }

  // Outdoor Garden, Trees, Romantic Swan Pond & Floral Swing
  private buildGardenAndLake() {
    // Grass expanse around the hall
    const grassGeom = new THREE.PlaneGeometry(90, 90);
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x3f6212, roughness: 0.85 });
    const grassMesh = new THREE.Mesh(grassGeom, grassMat);
    grassMesh.rotation.x = -Math.PI / 2;
    grassMesh.position.set(0, -0.05, 30);
    grassMesh.receiveShadow = true;
    this.scene.add(grassMesh);

    // Swan Lake Pond
    const lakeGeom = new THREE.CircleGeometry(7.5, 24);
    const lakeMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.85,
    });
    const lakeMesh = new THREE.Mesh(lakeGeom, lakeMat);
    lakeMesh.rotation.x = -Math.PI / 2;
    lakeMesh.position.set(-18, 0.02, 32);
    this.scene.add(lakeMesh);

    // Floral Photo Swing on right side of garden [14, 0, 28]
    const swingGroup = new THREE.Group();
    swingGroup.position.set(14, 0, 28);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5), postMat);
    p1.position.set(-1.2, 1.75, 0);
    const p2 = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.5), postMat);
    p2.position.set(1.2, 1.75, 0);
    const topBar = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.6), postMat);
    topBar.rotation.z = Math.PI / 2;
    topBar.position.set(0, 3.4, 0);

    // Swing seat
    const seatMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.08, 0.5),
      new THREE.MeshStandardMaterial({ color: 0xfef08a })
    );
    seatMesh.position.set(0, 0.9, 0);
    swingGroup.add(p1, p2, topBar, seatMesh);
    this.scene.add(swingGroup);

    this.boothLocations.push({
      id: 'photo_swing',
      name: 'Xích Đu Hoa Chụp Ảnh 📸',
      position: new THREE.Vector3(14, 0, 28),
      radius: 2.8,
    });
  }

  // Falling Rose Petals Particle System
  private buildPetals() {
    const petalGeom = new THREE.PlaneGeometry(0.12, 0.16);
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
      roughness: 0.6,
      transparent: true,
      opacity: 0.8,
    });

    this.fallingPetalsMesh = new THREE.InstancedMesh(petalGeom, petalMat, this.petalCount);
    const dummy = new THREE.Object3D();

    for (let i = 0; i < this.petalCount; i++) {
      const x = (Math.random() - 0.5) * 16;
      const y = 0.5 + Math.random() * 8;
      const z = -14 + Math.random() * 32;
      this.petalData.push({
        x,
        y,
        z,
        vy: 0.4 + Math.random() * 0.6,
        rotX: Math.random() * Math.PI,
        rotY: Math.random() * Math.PI,
      });

      dummy.position.set(x, y, z);
      dummy.updateMatrix();
      this.fallingPetalsMesh.setMatrixAt(i, dummy.matrix);
    }

    this.scene.add(this.fallingPetalsMesh);
  }

  // Synchronize dynamic flower gifts on stage
  public syncFlowers(flowers: FlowerGift[]) {
    while (this.flowerGroup.children.length > 0) {
      const child = this.flowerGroup.children[0] as THREE.Mesh;
      this.flowerGroup.remove(child);
      if (child.geometry) child.geometry.dispose();
    }

    flowers.forEach((f) => {
      this.addFlowerMesh(f);
    });
  }

  // Separate addFlower method to append a newly gifted flower without wiping old ones!
  public addFlower(flower: FlowerGift) {
    this.addFlowerMesh(flower);
  }

  private addFlowerMesh(f: FlowerGift) {
    let color = 0xf43f5e;
    if (f.flowerType === 'hydrangea') color = 0x38bdf8;
    if (f.flowerType === 'basket') color = 0xf59e0b;
    if (f.flowerType === 'car') color = 0xec4899;

    const fMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 8, 8),
      new THREE.MeshStandardMaterial({ color, roughness: 0.5 })
    );
    fMesh.position.set(...f.position);
    this.flowerGroup.add(fMesh);
  }

  // Day / Night Toggle
  public setNightMode(isNight: boolean) {
    this.isNight = isNight;
    if (isNight) {
      this.ambientLight.intensity = 1.4;
      this.mainDirectionalLight.intensity = 1.2;
      this.mainDirectionalLight.color.setHex(0xfcd34d); // Warm candlelight
      this.chandelierPointLights.forEach((l) => (l.intensity = 4.5));
    } else {
      this.ambientLight.intensity = this.theme.ambientIntensity;
      this.mainDirectionalLight.intensity = 2.6;
      this.mainDirectionalLight.color.setHex(this.theme.primaryLightColor);
      this.chandelierPointLights.forEach((l) => (l.intensity = 3.5));
    }
  }

  // Collision and Step Height check
  // Returns: [newX, newZ, heightY]
  public checkMovement(currPos: THREE.Vector3, targetPos: THREE.Vector3): { pos: THREE.Vector3; onStage: boolean } {
    let x = targetPos.x;
    let z = targetPos.z;
    let y = 0;
    let onStage = false;

    // Check if on the stage (z <= -14 && z >= -22 && x >= -9 && x <= 9)
    if (z <= -14.2 && z >= -22 && x >= -9 && x <= 9) {
      // Ascending stage: if previously on ground (currPos.y < 0.5), only allowed via front stairs [x in -2.3..2.3]
      if (currPos.y < 0.5) {
        if (x >= -2.4 && x <= 2.4 && z >= -15.6) {
          // Walking up the stairs
          const progress = Math.max(0, Math.min(1, (-14.0 - z) / 1.4));
          y = progress * 1.2;
          onStage = progress > 0.8;
        } else {
          // Blocked by stage wall (>30cm height)
          z = -14.0;
          y = 0;
        }
      } else {
        // Already on stage! Can walk freely at height 1.2m
        y = 1.2;
        onStage = true;
      }
    } else if (currPos.y >= 0.5 && z > -14.2) {
      // Stepping DOWN from stage onto the dance floor: smoothly step down anywhere!
      y = 0;
      onStage = false;
    }

    // Check box obstacles
    for (const obs of this.collisionObstacles) {
      if (obs.isStairs) continue;
      // If we are at the same height level
      if (y < obs.height) {
        if (x >= obs.minX && x <= obs.maxX && z >= obs.minZ && z <= obs.maxZ) {
          // Collision detected: push back along closest axis
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
    }

    return { pos: new THREE.Vector3(x, y, z), onStage };
  }

  // Render Loop update
  public update(delta: number, frameCount: number) {
    // 1. Update Falling Petals
    const dummy = new THREE.Object3D();
    for (let i = 0; i < this.petalCount; i++) {
      const p = this.petalData[i];
      p.y -= p.vy * delta;
      p.rotX += delta * 1.5;
      p.rotY += delta * 1.2;
      if (p.y < 0.05) {
        p.y = 8;
        p.x = (Math.random() - 0.5) * 16;
        p.z = -14 + Math.random() * 32;
      }
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rotX, p.rotY, 0);
      dummy.updateMatrix();
      this.fallingPetalsMesh.setMatrixAt(i, dummy.matrix);
    }
    this.fallingPetalsMesh.instanceMatrix.needsUpdate = true;

    // 2. Animate Bride & Groom NPCs
    this.npcAnimTime += delta * 2;
    if (this.npcThankTimer > 0) {
      this.npcThankTimer -= delta;
      // Bowing forward and waving gratefully
      this.npcCoupleGroup.rotation.x = Math.sin(this.npcAnimTime * 3) * 0.2;
    } else {
      this.npcCoupleGroup.rotation.x = 0;
      this.npcCoupleGroup.rotation.y = Math.sin(this.npcAnimTime) * 0.12;
    }

    // 3. Update Shadows every 3 frames for 60 FPS
    if (frameCount % 3 === 0) {
      this.renderer.shadowMap.needsUpdate = true;
    }

    // 4. Measure FPS & Draw calls
    this.fpsFrames++;
    const now = performance.now();
    if (now - this.fpsLastTime >= 1000) {
      this.lastFps = Math.round((this.fpsFrames * 1000) / (now - this.fpsLastTime));
      this.fpsFrames = 0;
      this.fpsLastTime = now;
      this.lastDrawCalls = this.renderer.info.render.calls;
    }

    // 5. Render both WebGL and CSS3D with shared camera
    this.renderer.render(this.scene, this.camera);
    this.cssRenderer.render(this.cssScene, this.camera);
  }

  private setupWindowResize() {
    const handleResize = () => {
      const width = this.container.clientWidth || window.innerWidth;
      const height = this.container.clientHeight || window.innerHeight;
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(width, height);
      this.cssRenderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
  }

  public dispose() {
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement) {
      this.renderer.domElement.parentElement.removeChild(this.renderer.domElement);
    }
    if (this.cssRenderer.domElement.parentElement) {
      this.cssRenderer.domElement.parentElement.removeChild(this.cssRenderer.domElement);
    }
  }
}
