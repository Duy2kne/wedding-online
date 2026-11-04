import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PlayerState, PlayerAction, GuestGroup, Gender } from '../shared/types.js';

/*
 * Nhân vật chibi cho tiệc cưới.
 * - Thân, đầu, tóc, trang phục gộp thành 1 mesh màu đỉnh (vertex color) -> ít draw call.
 * - Tay/chân dùng capsule nối khớp liền mạch (vai, khuỷu, hông, gối).
 * - Mặt là 1 mảnh cầu phía trước đầu có texture vẽ bằng canvas (mắt to, má hồng, miệng).
 * - Hình học được cache theo "ngoại hình" nên 50 khách mặc giống nhau dùng chung bộ nhớ.
 */

// ---------- Bảng màu ----------
const SKIN = 0xf6d5c0;
const WHITE_SHIRT = 0xfbfaf7;

interface OutfitSpec {
  kind: 'suit' | 'aodai_m' | 'gown' | 'aodai_f';
  top: number; // áo / thân váy
  bottom: number; // quần hoặc chân váy
  trim?: number; // viền, nơ, hoạ tiết
  shoes: number;
  skirtR?: number; // độ xoè chân váy
  layered?: boolean; // váy 2 lớp
  headwear?: 'khan_dong' | 'man';
}

const OUTFITS: Record<string, OutfitSpec> = {
  // Nam
  suit_black: { kind: 'suit', top: 0x1d1d24, bottom: 0x1d1d24, trim: 0x111114, shoes: 0x121214 },
  suit_navy: { kind: 'suit', top: 0x26344f, bottom: 0x1f2a40, trim: 0x111114, shoes: 0x16130f },
  suit_white: { kind: 'suit', top: 0xf1ebe1, bottom: 0x1d1d24, trim: 0x111114, shoes: 0x121214 },
  suit_burgundy: { kind: 'suit', top: 0x6a1f2b, bottom: 0x2a1b1f, trim: 0x111114, shoes: 0x121214 },
  ao_dai_male: { kind: 'aodai_m', top: 0x2d5682, bottom: 0xf3eee6, trim: 0xd8b56a, shoes: 0x2a2020, headwear: 'khan_dong' },
  ao_dai_silk: { kind: 'aodai_m', top: 0xb98a3a, bottom: 0xf6efe2, trim: 0x8a2a1c, shoes: 0x2a2020, headwear: 'khan_dong' },
  groom_tux: { kind: 'suit', top: 0x16161b, bottom: 0x16161b, trim: 0x0d0d10, shoes: 0x0e0e10 },
  // Nữ
  dress_pink: { kind: 'gown', top: 0xeeb7c0, bottom: 0xeeb7c0, trim: 0xf7dade, shoes: 0xf2d6d8, skirtR: 0.5 },
  dress_cream: { kind: 'gown', top: 0xf2e8d8, bottom: 0xf2e8d8, trim: 0xe2cfa9, shoes: 0xeadcc4, skirtR: 0.48 },
  dress_princess: { kind: 'gown', top: 0xd9a7c7, bottom: 0xe7bfd6, trim: 0xf5e1ec, shoes: 0xf2d6e4, skirtR: 0.62, layered: true },
  ao_dai_red: { kind: 'aodai_f', top: 0xae2232, bottom: 0xf6efe6, trim: 0xd9b56a, shoes: 0xd9b56a },
  ao_dai_phoenix: { kind: 'aodai_f', top: 0x8f1a28, bottom: 0xf3e6c8, trim: 0xdcb45c, shoes: 0xdcb45c, headwear: 'man' },
  bride_gown: { kind: 'gown', top: 0xfbf7ef, bottom: 0xfbf7ef, trim: 0xf1e7d4, shoes: 0xf5efe4, skirtR: 0.72, layered: true },
};

function outfitFor(state: PlayerState): OutfitSpec {
  const o = OUTFITS[state.outfit];
  if (o) {
    const male = o.kind === 'suit' || o.kind === 'aodai_m';
    if (male === (state.gender === 'male')) return o;
  }
  return state.gender === 'male' ? OUTFITS.suit_black : OUTFITS.dress_pink;
}

// ---------- Kích thước khung xương ----------
const HIP_Y = 0.52;
const THIGH = 0.24;
const SHIN = 0.2;
const SHOULDER_Y = 0.93;
const SHOULDER_X = 0.215;
const UPPER_ARM = 0.21;
const FOREARM = 0.17;
const HEAD_Y = 1.3;
const HEAD_R = 0.34;

// ---------- Vật liệu dùng chung ----------
const bodyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.02 });
const skirtMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.0, side: THREE.DoubleSide });
const glassMaterial = new THREE.MeshStandardMaterial({ color: 0xf3f7fb, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.55 });
const wineMaterial = new THREE.MeshStandardMaterial({ color: 0x8a1f2e, roughness: 0.25, transparent: true, opacity: 0.85 });
const veilMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false });
const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xff7a9a });

// ---------- Tiện ích hình học ----------
function paint(g: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  if (!g.index) {
    const idx: number[] = [];
    for (let i = 0; i < n; i++) idx.push(i);
    g.setIndex(idx);
  }
  return g;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const cleaned = parts.map((p) => {
    const g = p.index ? p : paint(p, 0xffffff);
    // Chỉ giữ position/normal/uv/color để gộp được
    for (const k of Object.keys(g.attributes)) {
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    }
    return g;
  });
  const m = mergeGeometries(cleaned, false)!;
  parts.forEach((p) => p.dispose());
  return m;
}

function ellipsoid(rx: number, ry: number, rz: number, x: number, y: number, z: number, hex: number, seg = 14) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(8, Math.round(seg * 0.7)));
  g.scale(rx, ry, rz);
  g.translate(x, y, z);
  return paint(g, hex);
}

function capsule(r: number, len: number, y: number, hex: number) {
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  g.translate(0, y, 0);
  return paint(g, hex);
}

// Thân áo hình tròn dẹt (lathe) từ hông lên vai
function torsoGeom(hex: number, waist = 0.16, chest = 0.2, bottomY = 0.5, flare = 0.19) {
  const pts = [
    new THREE.Vector2(0.001, bottomY - 0.01),
    new THREE.Vector2(flare, bottomY),
    new THREE.Vector2(waist + 0.01, 0.63),
    new THREE.Vector2(waist, 0.68),
    new THREE.Vector2(chest, 0.82),
    new THREE.Vector2(chest - 0.005, 0.9),
    new THREE.Vector2(0.15, 0.97),
    new THREE.Vector2(0.07, 1.0),
    new THREE.Vector2(0.001, 1.005),
  ];
  const g = new THREE.LatheGeometry(pts, 20);
  g.scale(1, 1, 0.78);
  return paint(g, hex);
}

// Chân váy xoè có viền gợn sóng
function skirtGeom(topY: number, botY: number, topR: number, botR: number, hex: number, wave = 0.04, waves = 9) {
  const h = topY - botY;
  const g = new THREE.CylinderGeometry(1, 1, h, 40, 8, true);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const t = Math.min(1, Math.max(0, (h / 2 - v.y) / h)); // 0 ở eo, 1 ở gấu
    const ang = Math.atan2(v.z, v.x);
    const bell = 1 - Math.pow(1 - t, 2.2);
    let r = topR + (botR - topR) * bell;
    r *= 1 + wave * t * t * Math.sin(ang * waves);
    v.x = Math.cos(ang) * r;
    v.z = Math.sin(ang) * r * 0.92;
    pos.setXYZ(i, v.x, v.y + botY + h / 2, v.z);
  }
  g.computeVertexNormals();
  return paint(g, hex);
}

// Vạt áo dài (trước / sau)
function flapGeom(topY: number, botY: number, topW: number, botW: number, z: number, hex: number) {
  const h = topY - botY;
  const g = new THREE.BoxGeometry(1, h, 0.018, 1, 4, 1);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const t = (h / 2 - y) / h;
    pos.setX(i, pos.getX(i) * (topW + (botW - topW) * t));
    // cong nhẹ theo thân
    pos.setZ(i, pos.getZ(i) + z + Math.sign(z) * t * 0.05);
    pos.setY(i, y + botY + h / 2);
  }
  g.computeVertexNormals();
  return paint(g, hex);
}

function triangleShape(w: number, h: number, hex: number) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(0, -h);
  s.closePath();
  return paint(new THREE.ShapeGeometry(s), hex);
}

// ---------- Tóc ----------
function hairParts(gender: Gender, style: number, hex: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const cap = (tilt: number, thetaLen: number, r = HEAD_R + 0.025) => {
    const g = new THREE.SphereGeometry(r, 24, 16, 0, Math.PI * 2, 0, thetaLen);
    g.rotateX(-tilt);
    g.translate(0, HEAD_Y, -0.005);
    return paint(g, hex);
  };
  // Mái tóc: các lọn hình giọt nước dọc trán
  const bangs = (count: number, spread: number, theta: number, size: number, skew = 0) => {
    for (let i = 0; i < count; i++) {
      const f = count === 1 ? 0 : i / (count - 1) - 0.5;
      const phi = f * spread + skew;
      const dir = new THREE.Vector3(Math.sin(phi) * Math.sin(theta), Math.cos(theta), Math.cos(phi) * Math.sin(theta));
      const g = new THREE.SphereGeometry(1, 10, 8);
      g.scale(size * 0.95, size * 1.15, size * 0.36);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir, new THREE.Vector3(0, 1, 0));
      g.applyMatrix4(m);
      const p = dir.multiplyScalar(HEAD_R + 0.012);
      g.translate(p.x, HEAD_Y + p.y, p.z);
      parts.push(paint(g, hex));
    }
  };

  if (gender === 'male') {
    if (style === 3) {
      // Side part Hàn Quốc: 2 bên gọn sát, phần trên phồng tròn, đường ngôi bên trái lộ trán,
      // mái vuốt chéo: cao ở bên ngôi, rủ dần xuống chân mày bên phải, đuôi thon.
      parts.push(cap(0.6, 1.8, HEAD_R + 0.02));
      // khối phồng phía trên (lệch phải) - đáy hạ thấp để nối mượt với lớp tóc nền
      parts.push(ellipsoid(0.29, 0.15, 0.3, 0.04, HEAD_Y + 0.195, -0.015, hex, 32));
      // lọn mái chéo
      const fr = new THREE.SphereGeometry(1, 40, 20);
      fr.scale(0.25, 0.075, 0.1);
      const pos = fr.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const t = (x + 0.25) / 0.5; // 0 = đường ngôi (trái), 1 = thái dương phải
        const thick = 1.25 - 0.85 * t; // dày ở gốc, thon ở đuôi
        pos.setY(i, pos.getY(i) * thick + 0.06 - 0.27 * t * t);
        pos.setZ(i, pos.getZ(i) * (1.1 - 0.5 * t) - 0.1 * t * t);
      }
      fr.computeVertexNormals();
      fr.rotateX(0.32);
      fr.translate(0.04, HEAD_Y + 0.17, 0.255);
      parts.push(paint(fr, hex));
      // gáy và mai tóc gọn
      parts.push(ellipsoid(0.27, 0.13, 0.16, 0, HEAD_Y - 0.1, -0.2, hex, 18));
      parts.push(ellipsoid(0.03, 0.075, 0.055, -0.318, HEAD_Y - 0.03, 0.06, hex, 10));
      parts.push(ellipsoid(0.03, 0.075, 0.055, 0.318, HEAD_Y - 0.03, 0.06, hex, 10));
    } else if (style === 1) {
      // Tóc dựng
      parts.push(cap(0.55, 1.75));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const g = new THREE.ConeGeometry(0.07, 0.18, 6);
        g.rotateX(0.5);
        g.rotateY(a);
        g.translate(Math.sin(a) * 0.14, HEAD_Y + 0.31, Math.cos(a) * 0.14 - 0.02);
        parts.push(paint(g, hex));
      }
      bangs(4, 1.1, 1.05, 0.085);
    } else if (style === 2) {
      // Vuốt ngược lịch lãm
      parts.push(cap(0.8, 1.9));
      parts.push(ellipsoid(0.2, 0.09, 0.14, 0, HEAD_Y + 0.3, 0.12, hex));
    } else {
      // Rẽ ngôi gọn gàng
      parts.push(cap(0.6, 1.8));
      bangs(5, 1.5, 1.1, 0.09, 0.25);
    }
    return parts;
  }

  // Nữ
  parts.push(cap(0.62, 1.95));
  bangs(7, 1.75, 1.12, 0.085);
  if (style === 0) {
    // Tóc dài thả lưng, 2 lọn trước vai
    parts.push(ellipsoid(0.34, 0.42, 0.2, 0, HEAD_Y - 0.28, -0.16, hex, 16));
    parts.push(ellipsoid(0.075, 0.24, 0.07, -0.27, HEAD_Y - 0.22, 0.06, hex, 10));
    parts.push(ellipsoid(0.075, 0.24, 0.07, 0.27, HEAD_Y - 0.22, 0.06, hex, 10));
  } else if (style === 1) {
    // Hai bím buộc cao
    parts.push(ellipsoid(0.11, 0.26, 0.11, -0.36, HEAD_Y - 0.08, -0.08, hex, 12));
    parts.push(ellipsoid(0.11, 0.26, 0.11, 0.36, HEAD_Y - 0.08, -0.08, hex, 12));
    parts.push(ellipsoid(0.06, 0.04, 0.05, -0.3, HEAD_Y + 0.14, -0.06, 0xe56b85, 8));
    parts.push(ellipsoid(0.06, 0.04, 0.05, 0.3, HEAD_Y + 0.14, -0.06, 0xe56b85, 8));
  } else {
    // Búi tóc cô dâu
    parts.push(ellipsoid(0.17, 0.15, 0.15, 0, HEAD_Y + 0.17, -0.27, hex, 14));
    parts.push(ellipsoid(0.03, 0.03, 0.03, 0.12, HEAD_Y + 0.2, -0.22, 0xf3e7c8, 6));
    parts.push(ellipsoid(0.03, 0.03, 0.03, -0.1, HEAD_Y + 0.26, -0.2, 0xf3e7c8, 6));
  }
  return parts;
}

// ---------- Mặt ----------
type Expression = 'happy' | 'joy' | 'blink' | 'kiss';
const FACE_PHI = 1.75; // độ rộng mảnh mặt (rad)
const FACE_T0 = 0.98;
const FACE_T1 = 2.42;
const faceGeometry = (() => {
  const g = new THREE.SphereGeometry(HEAD_R + 0.004, 24, 16, Math.PI / 2 - FACE_PHI / 2, FACE_PHI, FACE_T0, FACE_T1 - FACE_T0);
  g.translate(0, HEAD_Y, 0);
  return g;
})();

const faceMatCache = new Map<string, THREE.MeshStandardMaterial>();
function faceMaterial(gender: Gender, expr: Expression): THREE.MeshStandardMaterial {
  const key = `${gender}_${expr}`;
  const hit = faceMatCache.get(key);
  if (hit) return hit;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  const female = gender === 'female';
  const eyeY = 98;
  const ex = 40;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Má hồng
  for (const sx of [-1, 1]) {
    const gx = 128 + sx * 66;
    const grd = ctx.createRadialGradient(gx, 132, 2, gx, 132, 26);
    grd.addColorStop(0, female ? 'rgba(242,128,150,0.55)' : 'rgba(236,140,140,0.35)');
    grd.addColorStop(1, 'rgba(242,128,150,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(gx - 30, 104, 60, 56);
  }

  // Lông mày
  ctx.strokeStyle = female ? '#5a3a2c' : '#2e211b';
  ctx.lineWidth = female ? 4 : 6;
  for (const sx of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(128 + sx * (ex - 15), eyeY - 34);
    ctx.quadraticCurveTo(128 + sx * ex, eyeY - 41, 128 + sx * (ex + 15), eyeY - 35);
    ctx.stroke();
  }

  // Mắt
  for (const sx of [-1, 1]) {
    const cx = 128 + sx * ex;
    if (expr === 'happy') {
      ctx.fillStyle = '#2b1a14';
      ctx.beginPath();
      ctx.ellipse(cx, eyeY, 14, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      const ig = ctx.createLinearGradient(0, eyeY - 14, 0, eyeY + 16);
      ig.addColorStop(0, female ? '#5b3424' : '#3a2a24');
      ig.addColorStop(1, female ? '#a8673f' : '#6d5243');
      ctx.fillStyle = ig;
      ctx.beginPath();
      ctx.ellipse(cx, eyeY + 2, 10.5, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a0f0b';
      ctx.beginPath();
      ctx.ellipse(cx, eyeY + 2, 5.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(cx - sx * 4 - 3, eyeY - 7, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx + 4, eyeY + 8, 2.4, 0, Math.PI * 2);
      ctx.fill();
      // mí trên
      ctx.strokeStyle = '#1d120d';
      ctx.lineWidth = female ? 5 : 4;
      ctx.beginPath();
      ctx.ellipse(cx, eyeY + 1, 15, 20, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
      if (female) {
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + sx * 13, eyeY - 12);
        ctx.lineTo(cx + sx * 20, eyeY - 17);
        ctx.stroke();
      }
    } else {
      // Mắt cười híp (^ ^) hoặc chớp mắt
      ctx.strokeStyle = '#2b1a14';
      ctx.lineWidth = 5;
      ctx.beginPath();
      if (expr === 'blink') {
        ctx.moveTo(cx - 13, eyeY + 4);
        ctx.quadraticCurveTo(cx, eyeY + 10, cx + 13, eyeY + 4);
      } else {
        ctx.moveTo(cx - 13, eyeY + 5);
        ctx.quadraticCurveTo(cx, eyeY - 12, cx + 13, eyeY + 5);
      }
      ctx.stroke();
    }
  }

  // Miệng
  const my = 150;
  if (expr === 'kiss') {
    ctx.fillStyle = '#d4566f';
    ctx.beginPath();
    ctx.ellipse(128, my, 6, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffb3c4';
    ctx.beginPath();
    ctx.arc(126, my - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (expr === 'joy') {
    ctx.fillStyle = '#b8434f';
    ctx.beginPath();
    ctx.moveTo(114, my - 5);
    ctx.quadraticCurveTo(128, my + 16, 142, my - 5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f2a0a8';
    ctx.beginPath();
    ctx.ellipse(128, my + 4, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.strokeStyle = female ? '#c4505f' : '#9a4a43';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(118, my - 3);
    ctx.quadraticCurveTo(128, my + 6, 138, my - 3);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshStandardMaterial({
    map: tex,
    transparent: true,
    roughness: 0.7,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  faceMatCache.set(key, mat);
  return mat;
}

// ---------- Bộ phận tay chân (cache) ----------
const limbCache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry) {
  let g = limbCache.get(key);
  if (!g) {
    g = make();
    limbCache.set(key, g);
  }
  return g;
}

function upperArmGeom(sleeve: number, puff: boolean) {
  return cached(`ua_${sleeve}_${puff}`, () => {
    const parts = [capsule(0.058, UPPER_ARM, -UPPER_ARM / 2, sleeve)];
    parts.push(ellipsoid(puff ? 0.085 : 0.07, puff ? 0.08 : 0.07, puff ? 0.085 : 0.07, 0, 0, 0, puff ? sleeve : sleeve));
    return merge(parts);
  });
}
function lowerArmGeom(sleeve: number, cuff?: number, watch = false) {
  return cached(`la_${sleeve}_${cuff}_${watch}`, () => {
    const parts = [capsule(0.052, FOREARM, -FOREARM / 2, sleeve)];
    if (cuff !== undefined) {
      const g = new THREE.CylinderGeometry(0.056, 0.056, 0.03, 10);
      g.translate(0, -FOREARM + 0.01, 0);
      parts.push(paint(g, cuff));
    }
    if (watch) {
      // Đồng hồ: dây kim loại bạc + mặt số tối viền vàng, mặt quay ra ngoài cổ tay
      const band = new THREE.CylinderGeometry(0.06, 0.06, 0.028, 14);
      band.translate(0, -FOREARM + 0.045, 0);
      parts.push(paint(band, 0xcfd4da));
      const rim = new THREE.CylinderGeometry(0.034, 0.034, 0.014, 16);
      rim.rotateZ(Math.PI / 2);
      rim.translate(-0.062, -FOREARM + 0.045, 0);
      parts.push(paint(rim, 0xd8b56a));
      const face = new THREE.CylinderGeometry(0.027, 0.027, 0.006, 16);
      face.rotateZ(Math.PI / 2);
      face.translate(-0.07, -FOREARM + 0.045, 0);
      parts.push(paint(face, 0x1c2430));
    }
    parts.push(ellipsoid(0.058, 0.064, 0.05, 0, -FOREARM - 0.055, 0.005, SKIN, 10));
    return merge(parts);
  });
}
function thighGeom(hex: number) {
  return cached(`th_${hex}`, () => merge([capsule(0.075, THIGH, -THIGH / 2, hex)]));
}
function shinGeom(hex: number, shoe: number, heel: boolean) {
  return cached(`sh_${hex}_${shoe}_${heel}`, () => {
    const parts = [capsule(0.066, SHIN, -SHIN / 2, hex)];
    parts.push(ellipsoid(0.075, heel ? 0.05 : 0.055, 0.12, 0, -SHIN - 0.04, 0.035, shoe, 12));
    return merge(parts);
  });
}

// ---------- Thân (gộp) ----------
const bodyCache = new Map<string, { body: THREE.BufferGeometry; skirt?: THREE.BufferGeometry }>();

function buildBody(state: PlayerState, o: OutfitSpec) {
  const acc = (state.accessories || []).filter((a) => a !== 'veil' && a !== 'heart_halo').sort();
  const key = [state.gender, state.hairStyle, state.hairColor, state.outfit, acc.join(',')].join('|');
  const hit = bodyCache.get(key);
  if (hit) return hit;

  const hairHex = parseInt((state.hairColor || '#3d2314').replace('#', ''), 16) || 0x3d2314;
  const parts: THREE.BufferGeometry[] = [];
  let skirt: THREE.BufferGeometry | undefined;

  // Đầu + cổ + tai
  parts.push(ellipsoid(HEAD_R, HEAD_R * 0.97, HEAD_R * 0.95, 0, HEAD_Y, 0, SKIN, 24));
  parts.push(ellipsoid(0.05, 0.065, 0.035, -HEAD_R + 0.01, HEAD_Y - 0.03, 0, SKIN, 8));
  parts.push(ellipsoid(0.05, 0.065, 0.035, HEAD_R - 0.01, HEAD_Y - 0.03, 0, SKIN, 8));
  const neck = new THREE.CylinderGeometry(0.055, 0.06, 0.12, 10);
  neck.translate(0, 1.0, 0);
  parts.push(paint(neck, SKIN));
  parts.push(...hairParts(state.gender, state.hairStyle || 0, hairHex));

  if (o.kind === 'suit') {
    parts.push(torsoGeom(o.top, 0.165, 0.2, 0.5, 0.2));
    // hông quần
    parts.push(ellipsoid(0.19, 0.09, 0.15, 0, HIP_Y + 0.01, 0, o.bottom));
    // áo sơ mi chữ V + nơ
    const v = triangleShape(0.15, 0.2, WHITE_SHIRT);
    v.rotateX(-0.26);
    v.translate(0, 0.975, 0.112);
    parts.push(v);
    const bow = (state.accessories || []).includes('bowtie_gold') ? 0xd6b15e : o.trim || 0x111114;
    parts.push(ellipsoid(0.045, 0.03, 0.02, -0.04, 0.95, 0.135, bow, 8));
    parts.push(ellipsoid(0.045, 0.03, 0.02, 0.04, 0.95, 0.135, bow, 8));
    parts.push(ellipsoid(0.018, 0.018, 0.018, 0, 0.95, 0.142, bow, 6));
    // ve áo
    for (const sx of [-1, 1]) {
      // ve áo nằm sát ngực (nghiêng theo thân áo), cùng tông với áo
      const lapel = new THREE.BoxGeometry(0.04, 0.17, 0.008);
      lapel.rotateZ(sx * 0.3);
      lapel.rotateX(-0.3);
      lapel.translate(sx * 0.058, 0.885, 0.142);
      const c = new THREE.Color(o.top).multiplyScalar(0.92);
      parts.push(paint(lapel, c.getHex()));
    }
    // khuy áo + hoa cài ngực
    parts.push(ellipsoid(0.014, 0.014, 0.01, 0, 0.74, 0.137, 0x0c0c0f, 6));
    parts.push(ellipsoid(0.014, 0.014, 0.01, 0, 0.68, 0.128, 0x0c0c0f, 6));
    parts.push(ellipsoid(0.028, 0.028, 0.018, -0.12, 0.88, 0.13, 0xfdfcf8, 8));
  } else if (o.kind === 'aodai_m') {
    parts.push(torsoGeom(o.top, 0.17, 0.2, 0.5, 0.2));
    parts.push(ellipsoid(0.18, 0.08, 0.14, 0, HIP_Y, 0, o.bottom));
    const collar = new THREE.CylinderGeometry(0.075, 0.08, 0.06, 12);
    collar.translate(0, 1.0, 0);
    parts.push(paint(collar, o.top));
    parts.push(flapGeom(0.6, 0.18, 0.28, 0.33, 0.115, o.top));
    parts.push(flapGeom(0.6, 0.18, 0.28, 0.33, -0.115, o.top));
    // hàng cúc chéo
    for (let i = 0; i < 4; i++) parts.push(ellipsoid(0.012, 0.012, 0.01, 0.06 + i * 0.02, 0.95 - i * 0.05, 0.128, o.trim || 0xd8b56a, 6));
    // khăn đóng
    const kd = new THREE.TorusGeometry(0.29, 0.07, 10, 22);
    kd.rotateX(Math.PI / 2);
    kd.scale(1, 1.25, 0.98);
    kd.translate(0, HEAD_Y + 0.17, -0.02);
    parts.push(paint(kd, o.top));
    parts.push(ellipsoid(0.24, 0.07, 0.24, 0, HEAD_Y + 0.25, -0.02, o.top, 14));
  } else if (o.kind === 'gown') {
    // thân váy cúp ngực: phần trên là da (vai trần), thân váy từ ngực xuống
    parts.push(torsoGeom(SKIN, 0.15, 0.17, 0.62, 0.15));
    const bodice = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.17, 0.62),
        new THREE.Vector2(0.155, 0.68),
        new THREE.Vector2(0.185, 0.8),
        new THREE.Vector2(0.19, 0.86),
        new THREE.Vector2(0.18, 0.885),
      ],
      20
    );
    bodice.scale(1.04, 1, 0.82);
    parts.push(paint(bodice, o.top));
    // viền ngực
    const trim = new THREE.TorusGeometry(0.185, 0.012, 6, 24);
    trim.rotateX(Math.PI / 2);
    trim.scale(1.04, 1, 0.82);
    trim.translate(0, 0.885, 0);
    parts.push(paint(trim, o.trim || o.top));
    // vòng cổ ngọc trai (nếu không đeo vàng cưới)
    if (!(state.accessories || []).includes('gold_necklace')) {
      const pearl = new THREE.TorusGeometry(0.07, 0.01, 6, 16);
      pearl.rotateX(Math.PI / 2 - 0.35);
      pearl.translate(0, 0.98, 0.02);
      parts.push(paint(pearl, 0xfaf6ee));
    }
    // chân váy
    const r = o.skirtR || 0.5;
    const s1 = skirtGeom(0.66, 0.02, 0.17, r, o.bottom, 0.05, 10);
    const sp = [s1];
    // lớp voan phủ ngoài, ngắn hơn chân váy chính
    if (o.layered) sp.push(skirtGeom(0.67, 0.3, 0.18, r * 0.98, o.trim || o.bottom, 0.07, 7));
    // nơ eo
    sp.push(ellipsoid(0.05, 0.035, 0.03, 0.09, 0.67, 0.12, o.trim || o.top, 8));
    skirt = merge(sp);
  } else {
    // áo dài nữ
    parts.push(torsoGeom(o.top, 0.145, 0.18, 0.5, 0.17));
    parts.push(ellipsoid(0.17, 0.08, 0.13, 0, HIP_Y, 0, o.bottom));
    const collar = new THREE.CylinderGeometry(0.068, 0.072, 0.07, 12);
    collar.translate(0, 1.0, 0);
    parts.push(paint(collar, o.top));
    parts.push(flapGeom(0.6, 0.06, 0.25, 0.32, 0.105, o.top));
    parts.push(flapGeom(0.6, 0.06, 0.25, 0.32, -0.105, o.top));
    // hoạ tiết thêu vàng
    for (let i = 0; i < 5; i++) {
      parts.push(ellipsoid(0.03, 0.03, 0.008, -0.05 + (i % 2) * 0.09, 0.85 - i * 0.1, 0.15 + (i > 1 ? 0.01 * i : 0), o.trim || 0xd9b56a, 6));
    }
    if (o.headwear === 'man') {
      // mấn cô dâu (khăn vấn tròn)
      const man = new THREE.TorusGeometry(0.3, 0.085, 10, 24);
      man.rotateX(Math.PI / 2 - 0.25);
      man.translate(0, HEAD_Y + 0.2, -0.03);
      parts.push(paint(man, o.trim || 0xdcb45c));
      const top = new THREE.CylinderGeometry(0.31, 0.3, 0.06, 20);
      top.rotateX(-0.25);
      top.translate(0, HEAD_Y + 0.24, -0.05);
      parts.push(paint(top, o.top));
    }
  }

  // Phụ kiện gộp được
  if (acc.includes('flower_crown')) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const col = i % 3 === 0 ? 0xf6c7d0 : i % 3 === 1 ? 0xfdf8f0 : 0xf2d38a;
      parts.push(ellipsoid(0.05, 0.04, 0.05, Math.sin(a) * 0.29, HEAD_Y + 0.22 + Math.cos(a) * 0.04, Math.cos(a) * 0.25 - 0.03, col, 8));
    }
  }
  if (acc.includes('tiara')) {
    // Vương miện: vòng vàng trên tóc, các nhánh nhọn cao dần ở giữa, đầu nhánh gắn pha lê
    const tiara: THREE.BufferGeometry[] = [];
    const R = 0.3;
    const h = 0.2;
    const ring: THREE.Vector3[] = [];
    for (let i = 0; i <= 16; i++) {
      const a = -1.2 + (i / 16) * 2.4;
      ring.push(new THREE.Vector3(Math.sin(a) * R, h, Math.cos(a) * R));
    }
    tiara.push(paint(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring), 32, 0.016, 6, false), 0xe0b24f));
    for (let i = 0; i <= 8; i++) {
      const a = -1.0 + (i / 8) * 2.0;
      const center = 1 - Math.abs(a) / 1.0;
      const sh = 0.05 + center * 0.09;
      const cone = new THREE.ConeGeometry(0.016, sh, 6);
      cone.translate(0, h + sh / 2, 0);
      cone.applyMatrix4(new THREE.Matrix4().makeTranslation(Math.sin(a) * R, 0, Math.cos(a) * R));
      tiara.push(paint(cone, 0xe0b24f));
      const gem = new THREE.OctahedronGeometry(i === 4 ? 0.04 : 0.022, 0);
      gem.translate(Math.sin(a) * R, h + sh + 0.01, Math.cos(a) * R);
      tiara.push(paint(gem, i === 4 ? 0xf3a6b8 : 0xfdfbff));
      if (i % 2 === 1) {
        const pearlBead = new THREE.SphereGeometry(0.017, 8, 6);
        pearlBead.translate(Math.sin(a) * (R + 0.01), h + 0.02, Math.cos(a) * (R + 0.01));
        tiara.push(paint(pearlBead, 0xfbf6ee));
      }
    }
    // nghiêng ra sau theo mái tóc rồi đặt lên đầu
    for (const g of tiara) {
      g.rotateX(-0.32);
      g.translate(0, HEAD_Y, -0.01);
      parts.push(g);
    }
  }
  if (acc.includes('gold_necklace')) {
    // Kiềng cưới vàng ôm chân cổ
    const kieng = new THREE.TorusGeometry(0.1, 0.016, 8, 28);
    kieng.rotateX(Math.PI / 2 - 0.3);
    kieng.translate(0, 0.965, 0.01);
    parts.push(paint(kieng, 0xe0b24f));
    // Dây chuyền vàng chữ V + mặt dây chuyền trái tim
    const chain = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-0.11, 0.955, 0.04),
      new THREE.Vector3(-0.07, 0.925, 0.12),
      new THREE.Vector3(0, 0.905, 0.155),
      new THREE.Vector3(0.07, 0.925, 0.12),
      new THREE.Vector3(0.11, 0.955, 0.04),
    ]);
    parts.push(paint(new THREE.TubeGeometry(chain, 20, 0.006, 5, false), 0xe0b24f));
    const heart = new THREE.Shape();
    heart.moveTo(0, -0.03);
    heart.bezierCurveTo(-0.035, -0.005, -0.03, 0.025, 0, 0.012);
    heart.bezierCurveTo(0.03, 0.025, 0.035, -0.005, 0, -0.03);
    const hg = new THREE.ExtrudeGeometry(heart, { depth: 0.008, bevelEnabled: false });
    hg.translate(0, 0.875, 0.158);
    parts.push(paint(hg, 0xe0b24f));
  }
  if (acc.includes('sunglasses')) {
    for (const sx of [-1, 1]) parts.push(ellipsoid(0.065, 0.045, 0.02, sx * 0.105, HEAD_Y - 0.005, HEAD_R - 0.025, 0x18181d, 10));
    const bridge = new THREE.BoxGeometry(0.06, 0.012, 0.012);
    bridge.translate(0, HEAD_Y + 0.02, HEAD_R - 0.02);
    parts.push(paint(bridge, 0x18181d));
  }

  const result = { body: merge(parts), skirt };
  bodyCache.set(key, result);
  return result;
}

// ---------- Bảng tên & bóng chat ----------
function createNameplateSprite(name: string, group: GuestGroup, label?: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const color = group === 'groom' ? '#3c6fb4' : group === 'bride' ? '#c24d6b' : '#3f8f74';
  const tag = label || (group === 'groom' ? 'Nhà trai' : group === 'bride' ? 'Nhà gái' : 'Bạn bè');

  // Tên dài: thu nhỏ chữ cho vừa bảng (tối đa 2 dòng), không cắt bớt
  const FONT = '"Be Vietnam Pro", "Segoe UI", sans-serif';
  const MAXW = 400;
  let size = 40;
  ctx.font = `600 ${size}px ${FONT}`;
  while (size > 26 && ctx.measureText(name).width > MAXW) {
    size -= 2;
    ctx.font = `600 ${size}px ${FONT}`;
  }
  let lines = [name];
  if (ctx.measureText(name).width > MAXW) {
    // vẫn quá dài -> ngắt 2 dòng theo khoảng trắng gần giữa nhất
    size = 26;
    ctx.font = `600 ${size}px ${FONT}`;
    const words = name.split(' ');
    let best = [name];
    let bestW = Infinity;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      const mw = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (mw < bestW) {
        bestW = mw;
        best = [a, b];
      }
    }
    lines = best;
    const fitLine = (l: string) => {
      if (ctx.measureText(l).width <= MAXW) return l;
      let s = l;
      while (s.length > 1 && ctx.measureText(s + '…').width > MAXW) s = s.slice(0, -1);
      return s + '…';
    };
    lines = lines.map(fitLine);
  }
  const textW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const w = Math.min(490, Math.max(220, textW + 90));
  const x0 = 256 - w / 2;
  ctx.fillStyle = 'rgba(255, 251, 246, 0.92)';
  ctx.strokeStyle = 'rgba(120, 90, 70, 0.25)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(x0, 14, w, 70, 35);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x0 + 34, 49, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3b2a26';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (lines.length === 1) {
    ctx.fillText(lines[0], 256 + 14, 51);
  } else {
    ctx.fillText(lines[0], 256 + 14, 35);
    ctx.fillText(lines[1], 256 + 14, 65);
  }
  ctx.font = '600 22px "Be Vietnam Pro", "Segoe UI", sans-serif';
  ctx.fillStyle = color;
  ctx.fillText(tag, 256, 106);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.5, 0.375, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function createChatBubbleSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '500 28px "Be Vietnam Pro", "Segoe UI", sans-serif';
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > 440 && line) {
      lines.push(line);
      line = w;
    } else line = test;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  const h = 30 + shown.length * 36;
  const top = 160 - h;
  ctx.fillStyle = 'rgba(255,255,255,0.96)';
  ctx.strokeStyle = 'rgba(194, 77, 107, 0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(16, top, 480, h, 26);
  ctx.moveTo(240, top + h);
  ctx.lineTo(256, 186);
  ctx.lineTo(274, top + h);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#3b2a26';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  shown.forEach((l, i) => ctx.fillText(l, 256, top + 33 + i * 36));

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, depthTest: false, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.9, 0.71, 1);
  sprite.renderOrder = 11;
  return sprite;
}

// ---------- Tư thế ----------
interface Pose {
  lu: [number, number, number]; // vai trái (x: đưa trước, y: xoay, z: dang ngang)
  ru: [number, number, number];
  ll: [number, number]; // khuỷu trái (x: gập, z)
  rl: [number, number];
  lt: number; // đùi trái (âm = đưa trước)
  rt: number;
  lk: number; // gối trái (dương = gập ra sau)
  rk: number;
  bob: number;
  lean: number;
  sway: number;
  twist: number;
}

const basePose = (): Pose => ({
  lu: [0.05, 0, -0.12],
  ru: [0.05, 0, 0.12],
  ll: [-0.15, 0],
  rl: [-0.15, 0],
  lt: 0,
  rt: 0,
  lk: 0,
  rk: 0,
  bob: 0,
  lean: 0,
  sway: 0,
  twist: 0,
});

export interface CharacterOptions {
  label?: string; // chữ nhỏ dưới tên (mặc định theo nhà trai/nhà gái)
  showNameplate?: boolean;
  castShadow?: boolean;
}

export class Character3D {
  public group: THREE.Group;
  public state: PlayerState;
  private root!: THREE.Group;
  private bodyMesh!: THREE.Mesh;
  private skirtMesh?: THREE.Mesh;
  private faceMesh!: THREE.Mesh;
  private veilMesh?: THREE.Mesh;
  private haloMesh?: THREE.Mesh;
  private lArm!: THREE.Group;
  private rArm!: THREE.Group;
  private lElbow!: THREE.Group;
  private rElbow!: THREE.Group;
  private lLeg!: THREE.Group;
  private rLeg!: THREE.Group;
  private lKnee!: THREE.Group;
  private rKnee!: THREE.Group;
  private glassGroup!: THREE.Group;
  private bouquet?: THREE.Mesh;
  private nameplateSprite?: THREE.Sprite;
  private chatBubbleSprite?: THREE.Sprite;
  private targetPosition: THREE.Vector3;
  private targetRotation = 0;
  private t = Math.random() * 10;
  private blinkTimer = 2 + Math.random() * 3;
  private currentExpr: Expression = 'happy';
  private isLocal = false;
  private opts: CharacterOptions;
  private pose: Pose = basePose();
  public holdPose = false;
  private longGown = false;

  constructor(state: PlayerState, isLocal = false, opts: CharacterOptions = {}) {
    this.state = { ...state, accessories: [...(state.accessories || [])] };
    this.isLocal = isLocal;
    this.opts = opts;
    this.group = new THREE.Group();
    this.targetPosition = new THREE.Vector3(...state.position);
    this.targetRotation = state.rotation;
    this.group.position.set(...state.position);
    this.group.rotation.y = state.rotation;
    this.buildMesh();
  }

  private buildMesh() {
    // Dọn mesh cũ (geometry/material dùng chung nên không dispose)
    if (this.nameplateSprite) {
      this.nameplateSprite.material.map?.dispose();
      this.nameplateSprite.material.dispose();
      this.nameplateSprite = undefined;
    }
    this.group.clear();
    if (this.chatBubbleSprite) this.group.add(this.chatBubbleSprite);

    const o = outfitFor(this.state);
    this.longGown = o.kind === 'gown';
    const { body, skirt } = buildBody(this.state, o);
    const shadow = this.opts.castShadow !== false;

    this.root = new THREE.Group();
    this.group.add(this.root);

    this.bodyMesh = new THREE.Mesh(body, bodyMaterial);
    this.bodyMesh.castShadow = shadow;
    this.root.add(this.bodyMesh);

    if (skirt) {
      this.skirtMesh = new THREE.Mesh(skirt, skirtMaterial);
      this.skirtMesh.castShadow = shadow;
      this.root.add(this.skirtMesh);
    } else this.skirtMesh = undefined;

    this.currentExpr = 'happy';
    this.faceMesh = new THREE.Mesh(faceGeometry, faceMaterial(this.state.gender, 'happy'));
    this.faceMesh.renderOrder = 1;
    this.root.add(this.faceMesh);

    // Tay
    const sleeve = o.kind === 'gown' ? SKIN : o.top;
    const cuff = o.kind === 'suit' ? WHITE_SHIRT : o.kind === 'aodai_f' || o.kind === 'aodai_m' ? o.trim : undefined;
    const ua = upperArmGeom(sleeve, false);
    const la = lowerArmGeom(sleeve, cuff);
    const laWatch = (this.state.accessories || []).includes('watch') ? lowerArmGeom(sleeve, cuff, true) : la;
    const mkArm = (side: -1 | 1) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
      shoulder.add(new THREE.Mesh(ua, bodyMaterial));
      const elbow = new THREE.Group();
      elbow.position.y = -UPPER_ARM;
      elbow.add(new THREE.Mesh(side < 0 ? laWatch : la, bodyMaterial)); // đồng hồ đeo tay trái
      shoulder.add(elbow);
      this.root.add(shoulder);
      return { shoulder, elbow };
    };
    const L = mkArm(-1);
    const R = mkArm(1);
    this.lArm = L.shoulder;
    this.lElbow = L.elbow;
    this.rArm = R.shoulder;
    this.rElbow = R.elbow;

    // Ly rượu trên tay phải
    this.glassGroup = new THREE.Group();
    const bowl = new THREE.Mesh(cached('glass_bowl', () => new THREE.CylinderGeometry(0.045, 0.02, 0.08, 10, 1, true)), glassMaterial);
    bowl.position.y = 0.09;
    const wine = new THREE.Mesh(cached('glass_wine', () => new THREE.CylinderGeometry(0.036, 0.02, 0.04, 10)), wineMaterial);
    wine.position.y = 0.075;
    const stem = new THREE.Mesh(cached('glass_stem', () => new THREE.CylinderGeometry(0.007, 0.007, 0.07, 6)), glassMaterial);
    stem.position.y = 0.02;
    this.glassGroup.add(bowl, wine, stem);
    this.glassGroup.position.set(0, -FOREARM - 0.07, 0.035);
    this.glassGroup.rotation.x = 2.3; // giữ ly thẳng đứng khi nâng tay
    this.glassGroup.visible = false;
    this.rElbow.add(this.glassGroup);

    // Chân
    const heel = o.kind === 'gown' || o.kind === 'aodai_f';
    const th = thighGeom(o.bottom);
    const sh = shinGeom(o.kind === 'gown' ? SKIN : o.bottom, o.shoes, heel);
    const mkLeg = (side: -1 | 1) => {
      const hip = new THREE.Group();
      hip.position.set(side * 0.085, HIP_Y, 0);
      const thighM = new THREE.Mesh(th, bodyMaterial);
      thighM.castShadow = shadow;
      hip.add(thighM);
      const knee = new THREE.Group();
      knee.position.y = -THIGH;
      const shinM = new THREE.Mesh(sh, bodyMaterial);
      shinM.castShadow = shadow;
      knee.add(shinM);
      hip.add(knee);
      this.group.add(hip);
      return { hip, knee };
    };
    const LL = mkLeg(-1);
    const RL = mkLeg(1);
    this.lLeg = LL.hip;
    this.lKnee = LL.knee;
    this.rLeg = RL.hip;
    this.rKnee = RL.knee;
    // Váy dài che chân -> ẩn đùi cho đỡ xuyên váy
    if (this.longGown) {
      this.lLeg.visible = false;
      this.rLeg.visible = false;
    }

    this.applyAccessories();

    if (this.opts.showNameplate !== false) {
      this.nameplateSprite = createNameplateSprite(this.state.name, this.state.group, this.opts.label);
      this.nameplateSprite.position.set(0, 2.0, 0);
      this.group.add(this.nameplateSprite);
    }

    if (this.state.chatBubble && this.state.chatBubble.expiresAt > Date.now() && !this.chatBubbleSprite) {
      this.bubbleText = '';
      this.setChatBubble(this.state.chatBubble.text);
    }
  }

  private applyAccessories() {
    const acc = this.state.accessories || [];
    if (this.veilMesh) this.root.remove(this.veilMesh);
    if (this.haloMesh) this.root.remove(this.haloMesh);
    this.veilMesh = undefined;
    this.haloMesh = undefined;
    const veil = acc.includes('veil') || this.state.outfit === 'bride_gown';
    if (veil && this.state.gender === 'female') {
      const g = cached('veil', () => {
        const v = new THREE.CylinderGeometry(0.2, 0.5, 1.15, 20, 4, true, Math.PI * 0.55, Math.PI * 0.9);
        v.translate(0, HEAD_Y - 0.5, -0.16);
        return v;
      });
      this.veilMesh = new THREE.Mesh(g, veilMaterial);
      this.veilMesh.renderOrder = 2;
      this.root.add(this.veilMesh);
    }
    if (acc.includes('heart_halo')) {
      const g = cached('halo', () => new THREE.TorusGeometry(0.24, 0.025, 8, 28));
      this.haloMesh = new THREE.Mesh(g, haloMaterial);
      this.haloMesh.rotation.x = Math.PI / 2;
      this.haloMesh.position.y = HEAD_Y + 0.42;
      this.root.add(this.haloMesh);
    }
  }

  /** Cô dâu NPC cầm bó hoa */
  public holdBouquet(colors: number[] = [0xfdfbf6, 0xf4d4d8, 0xfdfbf6]) {
    if (this.bouquet) return;
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.055;
      parts.push(ellipsoid(0.042, 0.04, 0.042, Math.cos(a) * r, 0.03 + (i === 0 ? 0.02 : 0), Math.sin(a) * r, colors[i % colors.length], 8));
    }
    const stem = new THREE.CylinderGeometry(0.025, 0.018, 0.14, 8);
    stem.translate(0, -0.06, 0);
    parts.push(paint(stem, 0x6f8f5a));
    this.bouquet = new THREE.Mesh(merge(parts), bodyMaterial);
    this.bouquet.position.set(0.02, -FOREARM - 0.06, 0.04);
    this.bouquet.rotation.x = 1.55;
    this.rElbow.add(this.bouquet);
    this.holdPose = true;
  }

  public updateAccessories(accessories: string[] = []) {
    this.state.accessories = [...accessories];
    this.buildMesh();
  }

  private bubbleText = '';

  public setChatBubble(text: string) {
    if (text === this.bubbleText && (text === '' || this.chatBubbleSprite)) return; // không vẽ lại canvas nếu nội dung không đổi
    this.bubbleText = text;
    if (this.chatBubbleSprite) {
      this.group.remove(this.chatBubbleSprite);
      this.chatBubbleSprite.material.map?.dispose();
      this.chatBubbleSprite.material.dispose();
      this.chatBubbleSprite = undefined;
    }
    if (text) {
      this.chatBubbleSprite = createChatBubbleSprite(text);
      this.chatBubbleSprite.position.set(0, 2.55, 0);
      this.group.add(this.chatBubbleSprite);
    }
  }

  public updateState(newState: Partial<PlayerState>) {
    const prev = {
      outfit: this.state.outfit,
      acc: JSON.stringify(this.state.accessories || []),
      name: this.state.name,
      group: this.state.group,
      gender: this.state.gender,
      hairStyle: this.state.hairStyle,
      hairColor: this.state.hairColor,
    };

    Object.assign(this.state, newState);

    if (newState.position) this.targetPosition.set(...newState.position);
    if (newState.rotation !== undefined) this.targetRotation = newState.rotation;

    if (
      this.state.outfit !== prev.outfit ||
      this.state.gender !== prev.gender ||
      this.state.hairStyle !== prev.hairStyle ||
      this.state.hairColor !== prev.hairColor ||
      this.state.name !== prev.name ||
      this.state.group !== prev.group ||
      JSON.stringify(this.state.accessories || []) !== prev.acc
    ) {
      this.buildMesh();
    }

    if (newState.chatBubble !== undefined) {
      if (newState.chatBubble && newState.chatBubble.expiresAt > Date.now()) {
        this.setChatBubble(newState.chatBubble.text);
      } else if (!newState.chatBubble) {
        this.setChatBubble('');
      }
    }
  }

  private setExpr(e: Expression) {
    if (e === this.currentExpr) return;
    this.currentExpr = e;
    this.faceMesh.material = faceMaterial(this.state.gender, e);
  }

  private targetPose(action: PlayerAction, t: number): Pose {
    const p = basePose();
    switch (action) {
      case 'walk':
      case 'run': {
        const run = action === 'run';
        const s = Math.sin(t);
        const amp = run ? 0.75 : 0.5;
        p.lt = s * amp;
        p.rt = -s * amp;
        p.lk = Math.max(0, -Math.cos(t)) * (run ? 1.0 : 0.6);
        p.rk = Math.max(0, Math.cos(t)) * (run ? 1.0 : 0.6);
        p.lu = [-s * (run ? 0.7 : 0.45), 0, -0.1];
        p.ru = [s * (run ? 0.7 : 0.45), 0, 0.1];
        p.ll = [run ? -1.0 : -0.35, 0];
        p.rl = [run ? -1.0 : -0.35, 0];
        p.bob = Math.abs(Math.cos(t)) * (run ? 0.05 : 0.03);
        p.lean = run ? 0.12 : 0.03;
        p.twist = s * 0.06;
        break;
      }
      case 'sit':
        p.lt = -1.5;
        p.rt = -1.5;
        p.lk = 1.5;
        p.rk = 1.5;
        p.lu = [-0.55, 0, -0.05];
        p.ru = [-0.55, 0, 0.05];
        p.ll = [-0.75, 0];
        p.rl = [-0.75, 0];
        p.bob = -0.02 + Math.sin(t * 0.25) * 0.004;
        break;
      case 'toast': {
        const clink = Math.max(0, Math.sin(t * 0.9)) ** 6;
        p.ru = [-1.15 - clink * 0.35, 0, -0.18];
        p.rl = [-1.15 + clink * 0.3, 0];
        p.lu = [-0.2, 0, -0.1];
        p.ll = [-0.5, 0];
        p.lean = -0.04;
        break;
      }
      case 'cheer': {
        const pump = Math.sin(t * 2.4);
        p.lu = [-0.2, 0, -2.5 - pump * 0.2];
        p.ru = [-0.2, 0, 2.5 + pump * 0.2];
        p.ll = [-0.3, 0];
        p.rl = [-0.3, 0];
        p.bob = Math.max(0, pump) * 0.07;
        p.lean = -0.06;
        break;
      }
      case 'dance': {
        const s = Math.sin(t * 1.3);
        const c = Math.cos(t * 1.3);
        p.lu = [-0.4 - c * 0.3, 0, -1.2 - s * 0.5];
        p.ru = [-0.4 + c * 0.3, 0, 1.2 - s * 0.5];
        p.ll = [-0.9, 0];
        p.rl = [-0.9, 0];
        p.lt = s * 0.25;
        p.rt = -s * 0.25;
        p.lk = Math.max(0, s) * 0.4;
        p.rk = Math.max(0, -s) * 0.4;
        p.sway = s * 0.1;
        p.twist = c * 0.35;
        p.bob = Math.abs(s) * 0.05;
        break;
      }
      case 'clap': {
        const c = Math.sin(t * 5);
        p.lu = [-0.95, 0, 0.32 + c * 0.16];
        p.ru = [-0.95, 0, -0.32 - c * 0.16];
        p.ll = [-1.05, 0];
        p.rl = [-1.05, 0];
        p.bob = Math.abs(c) * 0.012;
        break;
      }
      case 'wave': {
        p.ru = [-0.1, 0, 1.35];
        p.rl = [-0.1, 1.25 + Math.sin(t * 3) * 0.4];
        p.lu = [0.05, 0, -0.12];
        p.lean = -0.02;
        p.sway = -0.04;
        break;
      }
      case 'kiss': {
        const ph = (t * 0.55) % (Math.PI * 2);
        const throwOut = Math.max(0, Math.sin(ph)) ** 2;
        p.ru = [-1.35 + throwOut * 0.4, 0, -0.45 + throwOut * 0.75];
        p.rl = [-1.95 + throwOut * 1.6, 0];
        p.lu = [0.05, 0, -0.15];
        p.lean = -0.03 - throwOut * 0.05;
        break;
      }
      default: {
        const b = Math.sin(t * 0.25);
        if (this.holdPose) {
          // NPC cô dâu: hai tay ôm bó hoa trước ngực
          p.lu = [-0.55, 0, 0.42];
          p.ru = [-0.55, 0, -0.42];
          p.ll = [-1.0, 0];
          p.rl = [-1.0, 0];
          p.bob = b * 0.006;
          break;
        }
        p.bob = b * 0.006;
        p.lu = [0.04 + b * 0.02, 0, -0.12];
        p.ru = [0.04 - b * 0.02, 0, 0.12];
      }
    }
    return p;
  }

  // Vòng lặp hoạt ảnh
  public update(delta: number, cameraPos?: THREE.Vector3) {
    if (!this.isLocal) {
      const k = 1 - Math.exp(-delta * 12);
      this.group.position.lerp(this.targetPosition, k);
      let diff = this.targetRotation - this.group.rotation.y;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.group.rotation.y += diff * Math.min(1, delta * 12);
    }

    if (this.state.chatBubble && Date.now() > this.state.chatBubble.expiresAt) {
      this.setChatBubble('');
      this.state.chatBubble = null;
    }

    if (cameraPos) {
      const dist = this.group.position.distanceTo(cameraPos);
      if (this.nameplateSprite) this.nameplateSprite.visible = dist <= 26;
      if (dist > 32) return; // xa thì bỏ hoạt ảnh chi tiết
    }

    const action: PlayerAction = this.state.action || 'idle';
    const speed = action === 'run' ? 13 : action === 'walk' ? 9 : 4;
    this.t += delta * speed;

    const target = this.targetPose(action, this.t);
    const k = 1 - Math.exp(-delta * 14);
    const P = this.pose;
    const lerp = (a: number, b: number) => a + (b - a) * k;
    for (const key of ['lu', 'ru'] as const) for (let i = 0; i < 3; i++) P[key][i] = lerp(P[key][i], target[key][i]);
    for (const key of ['ll', 'rl'] as const) for (let i = 0; i < 2; i++) P[key][i] = lerp(P[key][i], target[key][i]);
    P.lt = lerp(P.lt, target.lt);
    P.rt = lerp(P.rt, target.rt);
    P.lk = lerp(P.lk, target.lk);
    P.rk = lerp(P.rk, target.rk);
    P.bob = lerp(P.bob, target.bob);
    P.lean = lerp(P.lean, target.lean);
    P.sway = lerp(P.sway, target.sway);
    P.twist = lerp(P.twist, target.twist);

    this.lArm.rotation.set(P.lu[0], P.lu[1], P.lu[2]);
    this.rArm.rotation.set(P.ru[0], P.ru[1], P.ru[2]);
    this.lElbow.rotation.set(P.ll[0], 0, P.ll[1] * -1);
    this.rElbow.rotation.set(P.rl[0], 0, P.rl[1]);
    this.lLeg.rotation.x = P.lt;
    this.rLeg.rotation.x = P.rt;
    this.lKnee.rotation.x = P.lk;
    this.rKnee.rotation.x = P.rk;
    this.root.position.y = P.bob;
    this.root.rotation.set(P.lean, P.twist, P.sway);

    if (this.skirtMesh) {
      const moving = action === 'walk' || action === 'run' || action === 'dance';
      const sw = moving ? Math.sin(this.t) * 0.035 : 0;
      this.skirtMesh.rotation.z = sw;
      const sit = action === 'sit';
      this.skirtMesh.scale.y = lerp(this.skirtMesh.scale.y, sit ? 0.78 : 1);
      this.skirtMesh.position.y = (1 - this.skirtMesh.scale.y) * 0.66 - P.bob * 0;
    }
    if (this.haloMesh) this.haloMesh.rotation.z += delta * 1.2;

    this.glassGroup.visible = action === 'toast';

    // Biểu cảm
    let expr: Expression = 'happy';
    if (action === 'kiss') expr = 'kiss';
    else if (action === 'toast' || action === 'cheer' || action === 'dance' || action === 'clap') expr = 'joy';
    else {
      this.blinkTimer -= delta;
      if (this.blinkTimer < 0) {
        expr = 'blink';
        if (this.blinkTimer < -0.12) this.blinkTimer = 2.5 + Math.random() * 3;
      }
    }
    this.setExpr(expr);
  }

  public dispose() {
    if (this.nameplateSprite) {
      this.nameplateSprite.material.map?.dispose();
      this.nameplateSprite.material.dispose();
    }
    if (this.chatBubbleSprite) {
      this.chatBubbleSprite.material.map?.dispose();
      this.chatBubbleSprite.material.dispose();
    }
  }
}
