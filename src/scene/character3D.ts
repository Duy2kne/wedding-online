import * as THREE from 'three';
import type { PlayerState, PlayerAction, GuestGroup, Gender } from '../shared/types.js';

// Cache for shared textures and geometries across characters to prevent leaks
const textureCache = new Map<string, THREE.CanvasTexture>();
const geomCache = new Map<string, THREE.BufferGeometry>();

function getOrCreateGeometry(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
  if (!geomCache.has(key)) {
    geomCache.set(key, factory());
  }
  return geomCache.get(key)!;
}

// Generate stylized 2D anime/chibi facial texture on canvas
function getFaceTexture(gender: Gender, expression: 'happy' | 'smile_closed' = 'happy'): THREE.CanvasTexture {
  const key = `face_${gender}_${expression}`;
  if (textureCache.has(key)) return textureCache.get(key)!;

  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  // Skin base
  ctx.fillStyle = '#ffebd8';
  ctx.fillRect(0, 0, 256, 256);

  if (expression === 'smile_closed') {
    // Closed happy laughing eyes (^‿^)
    ctx.strokeStyle = '#2d1b10';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    // Left eye arc
    ctx.beginPath();
    ctx.arc(80, 115, 20, Math.PI * 1.1, Math.PI * 1.9, false);
    ctx.stroke();

    // Right eye arc
    ctx.beginPath();
    ctx.arc(176, 115, 20, Math.PI * 1.1, Math.PI * 1.9, false);
    ctx.stroke();
  } else {
    // Large sparkling chibi eyes
    const eyeY = 110;
    // Eye whites
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(80, eyeY, 22, 28, 0, 0, Math.PI * 2);
    ctx.ellipse(176, eyeY, 22, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // Dark iris
    ctx.fillStyle = gender === 'female' ? '#7b341e' : '#1e3a5f';
    ctx.beginPath();
    ctx.ellipse(82, eyeY, 17, 24, 0, 0, Math.PI * 2);
    ctx.ellipse(178, eyeY, 17, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Sparkles
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(76, eyeY - 8, 6, 0, Math.PI * 2);
    ctx.arc(88, eyeY + 6, 3, 0, Math.PI * 2);
    ctx.arc(172, eyeY - 8, 6, 0, Math.PI * 2);
    ctx.arc(184, eyeY + 6, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eyelashes for female
    if (gender === 'female') {
      ctx.strokeStyle = '#2d1b10';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(80, eyeY - 5, 22, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(176, eyeY - 5, 22, Math.PI * 1.15, Math.PI * 1.85);
      ctx.stroke();
    }
  }

  // Blushed pink cheeks
  ctx.fillStyle = 'rgba(255, 130, 160, 0.45)';
  ctx.beginPath();
  ctx.ellipse(65, 142, 18, 10, 0, 0, Math.PI * 2);
  ctx.ellipse(191, 142, 18, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sweet smiling mouth
  ctx.strokeStyle = '#be185d';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(128, 140, 14, 0.2 * Math.PI, 0.8 * Math.PI);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  textureCache.set(key, tex);
  return tex;
}

// Generate Nameplate Sprite
function createNameplateSprite(name: string, group: GuestGroup): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 384;
  canvas.height = 96;
  const ctx = canvas.getContext('2d')!;

  // Group border color: Nhà trai (Blue), Nhà gái (Rose), Bạn bè (Green)
  const borderColor = group === 'groom' ? '#2563eb' : group === 'bride' ? '#e11d48' : '#059669';
  const groupLabel = group === 'groom' ? 'Nhà trai' : group === 'bride' ? 'Nhà gái' : 'Bạn bè';

  // Rounded rectangle pill
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(10, 10, 364, 76, 24);
  ctx.fill();
  ctx.stroke();

  // Name
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 26px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, 192, 38);

  // Group tag
  ctx.fillStyle = borderColor;
  ctx.font = 'bold 16px "Segoe UI", sans-serif';
  ctx.fillText(`• ${groupLabel} •`, 192, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.5, 0.38, 1);
  return sprite;
}

// Generate Chat Bubble Sprite
function createChatBubbleSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 440;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(10, 10, 420, 110, 20);
  ctx.fill();
  ctx.stroke();

  // Speech pointer triangle
  ctx.beginPath();
  ctx.moveTo(210, 120);
  ctx.lineTo(220, 145);
  ctx.lineTo(235, 120);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1e293b';
  ctx.font = 'bold 22px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Multiline wrapping
  const words = text.split(' ');
  let line = '';
  let y = 45;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    if (ctx.measureText(testLine).width > 380 && i > 0) {
      ctx.fillText(line, 220, y);
      line = words[i] + ' ';
      y += 28;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, 220, y);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.8, 0.65, 1);
  return sprite;
}

export class Character3D {
  public group: THREE.Group;
  public state: PlayerState;
  private headMesh!: THREE.Mesh;
  private hairMesh!: THREE.Mesh;
  private bodyMesh!: THREE.Mesh;
  private dressMesh?: THREE.Mesh;
  private leftArmPivot!: THREE.Group;
  private rightArmPivot!: THREE.Group;
  private leftArmLowerPivot!: THREE.Group;
  private rightArmLowerPivot!: THREE.Group;
  private leftLegPivot!: THREE.Group;
  private rightLegPivot!: THREE.Group;
  private glassMesh?: THREE.Mesh;
  private accessoriesGroup: THREE.Group;
  private nameplateSprite?: THREE.Sprite;
  private chatBubbleSprite?: THREE.Sprite;
  private targetPosition: THREE.Vector3;
  private targetRotation = 0;
  private walkTime = 0;
  private isLocal = false;

  constructor(state: PlayerState, isLocal = false) {
    this.state = { ...state };
    this.isLocal = isLocal;
    this.group = new THREE.Group();
    this.targetPosition = new THREE.Vector3(...state.position);
    this.targetRotation = state.rotation;
    this.group.position.set(...state.position);
    this.group.rotation.y = state.rotation;
    this.accessoriesGroup = new THREE.Group();

    this.buildMesh();
  }

  private buildMesh() {
    // Clear any existing children
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children[0]);
    }

    const { gender, hairStyle, hairColor, outfit, accessories } = this.state;

    // Body Outfit Colors
    let bodyColor = 0x2d3748;
    let pantsColor = 0x1a202c;
    let shoeColor = 0x111827;

    if (gender === 'male') {
      if (outfit === 'suit_navy') {
        bodyColor = 0x1e3a8a;
        pantsColor = 0x172554;
      } else if (outfit === 'ao_dai_male') {
        bodyColor = 0x0284c7;
        pantsColor = 0xf8fafc;
      } else if (outfit === 'suit_white') {
        bodyColor = 0xf8fafc;
        pantsColor = 0xe2e8f0;
        shoeColor = 0x94a3b8;
      } else if (outfit === 'suit_burgundy') {
        bodyColor = 0x881337;
        pantsColor = 0x4c0519;
      } else if (outfit === 'ao_dai_silk') {
        bodyColor = 0xd97706;
        pantsColor = 0xfef3c7;
      }
    } else {
      // Female
      if (outfit === 'dress_pink') {
        bodyColor = 0xf472b6;
      } else if (outfit === 'ao_dai_red') {
        bodyColor = 0xdc2626;
        pantsColor = 0xfef2f2;
      } else if (outfit === 'dress_cream') {
        bodyColor = 0xfef3c7;
      } else if (outfit === 'dress_princess') {
        bodyColor = 0xec4899;
      } else if (outfit === 'ao_dai_phoenix') {
        bodyColor = 0xb91c1c;
        pantsColor = 0xfef08a;
      }
    }

    // 1. Torso / Upper Body
    const torsoGeom = getOrCreateGeometry('torso_geom', () => new THREE.CylinderGeometry(0.24, 0.28, 0.55, 12));
    const torsoMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      roughness: 0.6,
      metalness: 0.1,
    });
    this.bodyMesh = new THREE.Mesh(torsoGeom, torsoMat);
    this.bodyMesh.position.y = 0.68;
    this.bodyMesh.castShadow = true;
    this.group.add(this.bodyMesh);

    // 2. Head (Large round cute chibi head)
    const headGeom = getOrCreateGeometry('head_geom', () => new THREE.SphereGeometry(0.38, 20, 20));
    const faceTex = getFaceTexture(gender, 'happy');
    const headMat = new THREE.MeshStandardMaterial({
      map: faceTex,
      roughness: 0.5,
    });
    this.headMesh = new THREE.Mesh(headGeom, headMat);
    this.headMesh.position.y = 1.25;
    this.headMesh.rotation.y = -Math.PI / 2; // Face texture orientation
    this.headMesh.castShadow = true;
    this.group.add(this.headMesh);

    // 3. Hair (Custom styles)
    const hairColorNum = parseInt((hairColor || '#3d2314').replace('#', '0x'), 16);
    const hairMat = new THREE.MeshStandardMaterial({ color: hairColorNum, roughness: 0.7 });

    if (gender === 'female') {
      // Female Hair (Style 0: Twin tails, Style 1: Long straight, Style 2: Elegant bun)
      const hairBaseGeom = getOrCreateGeometry('fem_hair_base', () => new THREE.SphereGeometry(0.41, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.55));
      this.hairMesh = new THREE.Mesh(hairBaseGeom, hairMat);
      this.hairMesh.position.y = 1.32;

      if (hairStyle === 0) {
        // Twin ponytails
        const tailGeom = getOrCreateGeometry('ponytail', () => new THREE.ConeGeometry(0.12, 0.45, 10));
        const leftTail = new THREE.Mesh(tailGeom, hairMat);
        leftTail.position.set(-0.35, -0.15, -0.1);
        leftTail.rotation.z = 0.5;
        const rightTail = new THREE.Mesh(tailGeom, hairMat);
        rightTail.position.set(0.35, -0.15, -0.1);
        rightTail.rotation.z = -0.5;
        this.hairMesh.add(leftTail, rightTail);
      } else if (hairStyle === 1) {
        // Long flowing locks
        const backGeom = getOrCreateGeometry('hair_back_long', () => new THREE.CylinderGeometry(0.28, 0.36, 0.55, 12));
        const backHair = new THREE.Mesh(backGeom, hairMat);
        backHair.position.set(0, -0.3, -0.2);
        this.hairMesh.add(backHair);
      } else {
        // Bun
        const bunGeom = getOrCreateGeometry('hair_bun', () => new THREE.SphereGeometry(0.16, 12, 12));
        const bun = new THREE.Mesh(bunGeom, hairMat);
        bun.position.set(0, 0.35, -0.2);
        this.hairMesh.add(bun);
      }
      this.group.add(this.hairMesh);

      // Flared Gala Dress / Skirt
      const dressGeom = getOrCreateGeometry('dress_skirt_geom', () => new THREE.ConeGeometry(0.48, 0.6, 16, 1, true));
      const dressMat = new THREE.MeshStandardMaterial({
        color: bodyColor,
        roughness: 0.5,
        side: THREE.DoubleSide,
      });
      this.dressMesh = new THREE.Mesh(dressGeom, dressMat);
      this.dressMesh.position.y = 0.42;
      this.dressMesh.castShadow = true;
      this.group.add(this.dressMesh);
    } else {
      // Male Hair (Style 0: Side parted, Style 1: Spiky modern, Style 2: Classic gentleman)
      const maleHairGeom = getOrCreateGeometry('male_hair_base', () => new THREE.SphereGeometry(0.41, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5));
      this.hairMesh = new THREE.Mesh(maleHairGeom, hairMat);
      this.hairMesh.position.y = 1.32;

      if (hairStyle === 1) {
        // Spiky
        const spikeGeom = getOrCreateGeometry('spike_geom', () => new THREE.ConeGeometry(0.08, 0.16, 6));
        for (let i = -2; i <= 2; i++) {
          const spike = new THREE.Mesh(spikeGeom, hairMat);
          spike.position.set(i * 0.1, 0.38, 0.1);
          spike.rotation.x = -0.3;
          this.hairMesh.add(spike);
        }
      }
      this.group.add(this.hairMesh);
    }

    // 4. Arms (Seamless 2-bone shoulder + elbow IK joint structure)
    const sleeveMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.6 });
    const handMat = new THREE.MeshStandardMaterial({ color: 0xffebd8, roughness: 0.5 });

    const upperArmGeom = getOrCreateGeometry('upper_arm', () => new THREE.CylinderGeometry(0.065, 0.06, 0.24, 8));
    upperArmGeom.translate(0, -0.12, 0);
    const lowerArmGeom = getOrCreateGeometry('lower_arm', () => new THREE.CylinderGeometry(0.06, 0.055, 0.22, 8));
    lowerArmGeom.translate(0, -0.11, 0);
    const handGeom = getOrCreateGeometry('hand_geom', () => new THREE.SphereGeometry(0.065, 8, 8));

    // Left Arm
    this.leftArmPivot = new THREE.Group();
    this.leftArmPivot.position.set(-0.32, 0.86, 0);
    const leftUpperMesh = new THREE.Mesh(upperArmGeom, sleeveMat);
    this.leftArmPivot.add(leftUpperMesh);

    this.leftArmLowerPivot = new THREE.Group();
    this.leftArmLowerPivot.position.set(0, -0.24, 0);
    const leftLowerMesh = new THREE.Mesh(lowerArmGeom, sleeveMat);
    const leftHandMesh = new THREE.Mesh(handGeom, handMat);
    leftHandMesh.position.set(0, -0.22, 0);
    this.leftArmLowerPivot.add(leftLowerMesh, leftHandMesh);
    this.leftArmPivot.add(this.leftArmLowerPivot);
    this.group.add(this.leftArmPivot);

    // Right Arm
    this.rightArmPivot = new THREE.Group();
    this.rightArmPivot.position.set(0.32, 0.86, 0);
    const rightUpperMesh = new THREE.Mesh(upperArmGeom, sleeveMat);
    this.rightArmPivot.add(rightUpperMesh);

    this.rightArmLowerPivot = new THREE.Group();
    this.rightArmLowerPivot.position.set(0, -0.24, 0);
    const rightLowerMesh = new THREE.Mesh(lowerArmGeom, sleeveMat);
    const rightHandMesh = new THREE.Mesh(handGeom, handMat);
    rightHandMesh.position.set(0, -0.22, 0);

    // Wine glass attached to right hand (for toasting)
    const glassGeom = getOrCreateGeometry('wine_glass', () => {
      const g = new THREE.ConeGeometry(0.045, 0.08, 8, 1, true);
      const stem = new THREE.CylinderGeometry(0.01, 0.01, 0.08, 6);
      stem.translate(0, -0.06, 0);
      const base = new THREE.CylinderGeometry(0.04, 0.04, 0.015, 8);
      base.translate(0, -0.1, 0);
      const group = new THREE.Group();
      group.add(new THREE.Mesh(g), new THREE.Mesh(stem), new THREE.Mesh(base));
      return g; // simplified
    });
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
    });
    this.glassMesh = new THREE.Mesh(glassGeom, glassMat);
    this.glassMesh.position.set(0, -0.24, 0.08);
    this.glassMesh.visible = false;
    this.rightArmLowerPivot.add(rightLowerMesh, rightHandMesh, this.glassMesh);
    this.rightArmPivot.add(this.rightArmLowerPivot);
    this.group.add(this.rightArmPivot);

    // 5. Legs
    const legGeom = getOrCreateGeometry('leg_geom', () => new THREE.CylinderGeometry(0.08, 0.07, 0.38, 8));
    legGeom.translate(0, -0.19, 0);
    const legMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.6 });
    const shoeGeom = getOrCreateGeometry('shoe_geom', () => new THREE.BoxGeometry(0.12, 0.08, 0.18));
    shoeGeom.translate(0, -0.38, 0.04);
    const shoeMat = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.4 });

    this.leftLegPivot = new THREE.Group();
    this.leftLegPivot.position.set(-0.14, 0.42, 0);
    this.leftLegPivot.add(new THREE.Mesh(legGeom, legMat), new THREE.Mesh(shoeGeom, shoeMat));

    this.rightLegPivot = new THREE.Group();
    this.rightLegPivot.position.set(0.14, 0.42, 0);
    this.rightLegPivot.add(new THREE.Mesh(legGeom, legMat), new THREE.Mesh(shoeGeom, shoeMat));

    this.group.add(this.leftLegPivot, this.rightLegPivot);

    // 6. Accessories
    this.group.add(this.accessoriesGroup);
    this.updateAccessories(accessories);

    // 7. Floating Nameplate (Colored border by guest group, no title above head!)
    this.nameplateSprite = createNameplateSprite(this.state.name, this.state.group);
    this.nameplateSprite.position.set(0, 1.88, 0);
    this.group.add(this.nameplateSprite);

    // 8. Chat Bubble
    if (this.state.chatBubble && this.state.chatBubble.expiresAt > Date.now()) {
      this.setChatBubble(this.state.chatBubble.text);
    }
  }

  public updateAccessories(accessories: string[] = []) {
    while (this.accessoriesGroup.children.length > 0) {
      this.accessoriesGroup.remove(this.accessoriesGroup.children[0]);
    }

    if (accessories.includes('sunglasses')) {
      const sunglassGeom = getOrCreateGeometry('sunglass', () => new THREE.BoxGeometry(0.42, 0.1, 0.08));
      const sunglassMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.1, metalness: 0.8 });
      const glasses = new THREE.Mesh(sunglassGeom, sunglassMat);
      glasses.position.set(0, 1.25, 0.35);
      this.accessoriesGroup.add(glasses);
    }

    if (accessories.includes('heart_halo')) {
      const haloGeom = getOrCreateGeometry('heart_halo_geom', () => new THREE.TorusGeometry(0.3, 0.04, 8, 24));
      const haloMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });
      const halo = new THREE.Mesh(haloGeom, haloMat);
      halo.position.set(0, 1.82, 0);
      halo.rotation.x = Math.PI / 2;
      this.accessoriesGroup.add(halo);
    }

    if (accessories.includes('flower_crown')) {
      const crownGeom = getOrCreateGeometry('flower_crown_geom', () => new THREE.TorusGeometry(0.38, 0.05, 8, 20));
      const crownMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.5 });
      const crown = new THREE.Mesh(crownGeom, crownMat);
      crown.position.set(0, 1.55, 0);
      crown.rotation.x = Math.PI / 2;
      this.accessoriesGroup.add(crown);
    }
  }

  public setChatBubble(text: string) {
    if (this.chatBubbleSprite) {
      this.group.remove(this.chatBubbleSprite);
      this.chatBubbleSprite.material.dispose();
      this.chatBubbleSprite = undefined;
    }
    if (text) {
      this.chatBubbleSprite = createChatBubbleSprite(text);
      this.chatBubbleSprite.position.set(0, 2.45, 0);
      this.group.add(this.chatBubbleSprite);
    }
  }

  public updateState(newState: Partial<PlayerState>) {
    const prevOutfit = this.state.outfit;
    const prevAccessories = JSON.stringify(this.state.accessories);
    const prevName = this.state.name;
    const prevGroup = this.state.group;
    const prevGender = this.state.gender;
    const prevHairStyle = this.state.hairStyle;

    Object.assign(this.state, newState);

    if (newState.position) {
      this.targetPosition.set(...newState.position);
    }
    if (newState.rotation !== undefined) {
      this.targetRotation = newState.rotation;
    }

    // Rebuild mesh if visual appearance changed
    if (
      this.state.outfit !== prevOutfit ||
      this.state.gender !== prevGender ||
      this.state.hairStyle !== prevHairStyle ||
      this.state.name !== prevName ||
      this.state.group !== prevGroup
    ) {
      this.buildMesh();
    } else if (JSON.stringify(this.state.accessories) !== prevAccessories) {
      this.updateAccessories(this.state.accessories);
    }

    if (newState.chatBubble !== undefined) {
      if (newState.chatBubble && newState.chatBubble.expiresAt > Date.now()) {
        this.setChatBubble(newState.chatBubble.text);
      } else {
        this.setChatBubble('');
      }
    }
  }

  // Animation Update
  public update(delta: number, cameraPos?: THREE.Vector3) {
    // Interpolate towards target position and rotation for remote players
    if (!this.isLocal) {
      this.group.position.lerp(this.targetPosition, 0.22);

      // Smooth shortest-arc rotation interpolation
      let diff = this.targetRotation - this.group.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.group.rotation.y += diff * 0.25;
    }

    // Check distance for performance optimization (Section 0: > 25m reduce animation & hide nameplate)
    if (cameraPos) {
      const dist = this.group.position.distanceTo(cameraPos);
      if (this.nameplateSprite) {
        this.nameplateSprite.visible = dist <= 28;
      }
      if (dist > 35) return; // Skip detailed skeletal animation if far
    }

    const action: PlayerAction = this.state.action || 'idle';
    const isMoving = action === 'walk' || action === 'run';
    const speedMultiplier = action === 'run' ? 1.6 : 1.0;

    // Check chat bubble expiration
    if (this.state.chatBubble && Date.now() > this.state.chatBubble.expiresAt) {
      this.setChatBubble('');
      this.state.chatBubble = null;
    }

    // Reset arm and leg defaults
    if (this.glassMesh) {
      this.glassMesh.visible = action === 'toast';
    }

    // Switch face expression for toasting, kissing
    if (action === 'toast' || action === 'kiss') {
      const closedTex = getFaceTexture(this.state.gender, 'smile_closed');
      (this.headMesh.material as THREE.MeshStandardMaterial).map = closedTex;
      (this.headMesh.material as THREE.MeshStandardMaterial).needsUpdate = true;
    } else {
      const happyTex = getFaceTexture(this.state.gender, 'happy');
      (this.headMesh.material as THREE.MeshStandardMaterial).map = happyTex;
    }

    if (isMoving) {
      this.walkTime += delta * 9 * speedMultiplier;
      const legSwing = Math.sin(this.walkTime) * 0.55;
      const armSwing = Math.cos(this.walkTime) * 0.45;

      this.leftLegPivot.rotation.x = legSwing;
      this.rightLegPivot.rotation.x = -legSwing;
      this.leftArmPivot.rotation.x = -armSwing;
      this.rightArmPivot.rotation.x = armSwing;
      this.leftArmLowerPivot.rotation.x = -0.15;
      this.rightArmLowerPivot.rotation.x = -0.15;

      // Gentle vertical bounce
      this.bodyMesh.position.y = 0.68 + Math.abs(Math.sin(this.walkTime)) * 0.05;
      this.headMesh.position.y = 1.25 + Math.abs(Math.sin(this.walkTime)) * 0.05;
    } else if (action === 'sit') {
      // Sitting on chair
      this.leftLegPivot.rotation.x = -Math.PI / 2;
      this.rightLegPivot.rotation.x = -Math.PI / 2;
      this.leftArmPivot.rotation.x = -0.3;
      this.rightArmPivot.rotation.x = -0.3;
      this.leftArmLowerPivot.rotation.x = -0.6;
      this.rightArmLowerPivot.rotation.x = -0.6;
      this.bodyMesh.position.y = 0.48;
      this.headMesh.position.y = 1.05;
    } else if (action === 'toast') {
      // Raising glass to chest/eye level with right arm
      this.walkTime += delta * 3;
      this.rightArmPivot.rotation.x = -Math.PI * 0.42 + Math.sin(this.walkTime) * 0.08;
      this.rightArmPivot.rotation.z = -0.15;
      this.rightArmLowerPivot.rotation.x = -Math.PI * 0.35;
      this.leftArmPivot.rotation.x = -0.2;
      this.leftLegPivot.rotation.x = 0;
      this.rightLegPivot.rotation.x = 0;
    } else if (action === 'dance') {
      // Romantic wedding dance sway
      this.walkTime += delta * 4;
      const sway = Math.sin(this.walkTime) * 0.22;
      this.group.rotation.z = sway * 0.2;
      this.leftArmPivot.rotation.z = 0.45 + sway * 0.25;
      this.rightArmPivot.rotation.z = -0.45 - sway * 0.25;
      this.leftArmLowerPivot.rotation.x = -0.7;
      this.rightArmLowerPivot.rotation.x = -0.7;
      this.leftLegPivot.rotation.x = 0;
      this.rightLegPivot.rotation.x = 0;
    } else if (action === 'clap') {
      // Clapping hands
      this.walkTime += delta * 12;
      const clap = Math.sin(this.walkTime) * 0.25;
      this.leftArmPivot.rotation.set(-Math.PI * 0.35, 0.4 + clap, 0.2);
      this.rightArmPivot.rotation.set(-Math.PI * 0.35, -0.4 - clap, -0.2);
      this.leftArmLowerPivot.rotation.x = -0.8;
      this.rightArmLowerPivot.rotation.x = -0.8;
      this.leftLegPivot.rotation.x = 0;
      this.rightLegPivot.rotation.x = 0;
    } else if (action === 'wave') {
      // Waving with right hand
      this.walkTime += delta * 8;
      const wave = Math.sin(this.walkTime) * 0.45;
      this.rightArmPivot.rotation.set(-Math.PI * 0.7, 0, -0.3 + wave * 0.3);
      this.rightArmLowerPivot.rotation.x = -0.5;
      this.leftArmPivot.rotation.set(0, 0, 0);
      this.leftLegPivot.rotation.x = 0;
      this.rightLegPivot.rotation.x = 0;
    } else {
      // Idle gentle breathing
      this.walkTime += delta * 2;
      const breath = Math.sin(this.walkTime) * 0.02;
      this.bodyMesh.position.y = 0.68 + breath;
      this.headMesh.position.y = 1.25 + breath;
      this.leftArmPivot.rotation.set(0, 0, 0.08);
      this.rightArmPivot.rotation.set(0, 0, -0.08);
      this.leftArmLowerPivot.rotation.set(-0.05, 0, 0);
      this.rightArmLowerPivot.rotation.set(-0.05, 0, 0);
      this.leftLegPivot.rotation.set(0, 0, 0);
      this.rightLegPivot.rotation.set(0, 0, 0);
      this.group.rotation.z = 0;
    }
  }

  public dispose() {
    if (this.nameplateSprite) {
      this.nameplateSprite.material.dispose();
    }
    if (this.chatBubbleSprite) {
      this.chatBubbleSprite.material.dispose();
    }
  }
}
