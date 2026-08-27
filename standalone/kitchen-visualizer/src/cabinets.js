import * as THREE from "three";

const CM = 0.01;

export function cmToM(cm) {
  return cm * CM;
}

export function makeMat(color, roughness = 0.5, metalness = 0.05) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function chromeMat() {
  const m = makeMat(0xc9ced4, 0.28, 0.85);
  m.userData.role = "chrome";
  return m;
}

function bodyMat(color) {
  const m = makeMat(color, 0.45, 0.04);
  m.userData.role = "body";
  return m;
}

function innerMat() {
  const m = makeMat(0xe8e4dc, 0.75, 0);
  m.userData.role = "inner";
  return m;
}

function topMat(color) {
  const m = makeMat(color, 0.32, 0.12);
  m.userData.role = "top";
  return m;
}

function tag(mesh, role) {
  mesh.userData.role = role;
  return mesh;
}

/**
 * Kitchen module with openable doors / drawers.
 */
export function createCabinetMesh(item, bodyColor, topColorHex) {
  const group = new THREE.Group();
  const animatables = [];

  const w = cmToM(item.w);
  const d = cmToM(item.d);
  const h = cmToM(item.h);
  const hasTop = item.kind === "base" || item.kind === "sink" || item.kind === "island" || item.kind === "drawers";
  const topT = hasTop ? 0.04 : 0;
  const carcassH = hasTop ? h - topT : h;
  const wallLift = item.kind === "wall" ? cmToM(140) : 0;
  const toe = item.kind === "wall" ? 0 : 0.1;

  group.userData = {
    catalogId: item.id,
    label: item.label,
    kind: item.kind,
    front: item.front,
    w: item.w,
    d: item.d,
    h: item.h,
    bodyMatId: null,
    topMatId: null,
    open: false,
    animatables,
    frontZBase: d / 2 - 0.008,
  };

  const bMat = bodyMat(bodyColor);
  const iMat = innerMat();
  const tMat = topMat(topColorHex);

  const carcass = new THREE.Group();
  carcass.position.y = wallLift;

  const sideT = 0.018;
  const backT = 0.012;
  const bottomY = toe;
  const usableH = carcassH - toe;

  const left = tag(new THREE.Mesh(new THREE.BoxGeometry(sideT, usableH, d), bMat), "body");
  left.position.set(-w / 2 + sideT / 2, bottomY + usableH / 2, 0);
  left.castShadow = true;
  carcass.add(left);

  const right = tag(new THREE.Mesh(new THREE.BoxGeometry(sideT, usableH, d), bMat.clone()), "body");
  right.position.set(w / 2 - sideT / 2, bottomY + usableH / 2, 0);
  right.castShadow = true;
  carcass.add(right);

  const back = tag(new THREE.Mesh(new THREE.BoxGeometry(w - sideT * 2, usableH, backT), bMat.clone()), "body");
  back.position.set(0, bottomY + usableH / 2, -d / 2 + backT / 2);
  carcass.add(back);

  const bottom = tag(new THREE.Mesh(new THREE.BoxGeometry(w - sideT * 2, sideT, d - backT), bMat.clone()), "body");
  bottom.position.set(0, bottomY + sideT / 2, backT / 2);
  carcass.add(bottom);

  const topShelf = tag(
    new THREE.Mesh(new THREE.BoxGeometry(w - sideT * 2, sideT, d - backT), bMat.clone()),
    "body"
  );
  topShelf.position.set(0, bottomY + usableH - sideT / 2, backT / 2);
  carcass.add(topShelf);

  if (toe > 0) {
    const kick = tag(
      new THREE.Mesh(new THREE.BoxGeometry(w - 0.04, toe - 0.01, 0.02), makeMat(0x1c1f24, 0.7, 0.1)),
      "kick"
    );
    kick.position.set(0, toe / 2, d / 2 - 0.03);
    carcass.add(kick);
  }

  const shelf = tag(
    new THREE.Mesh(new THREE.BoxGeometry(w - sideT * 2 - 0.01, 0.014, d * 0.7), iMat),
    "inner"
  );
  shelf.position.set(0, bottomY + usableH * 0.45, 0);
  carcass.add(shelf);
  group.add(carcass);

  if (hasTop) {
    const over = item.kind === "island" ? 0.2 : 0.02;
    const top = tag(
      new THREE.Mesh(new THREE.BoxGeometry(w + 0.03, topT, d + over + 0.02), tMat),
      "top"
    );
    top.position.set(0, h - topT / 2, item.kind === "island" ? over / 2 : 0);
    top.castShadow = true;
    top.name = "top";
    group.add(top);

    if (item.kind === "island") {
      // second-side drawer bank hint (decorative panel)
      const panel = tag(
        new THREE.Mesh(new THREE.BoxGeometry(w * 0.92, usableH * 0.85, 0.02), bMat.clone()),
        "body"
      );
      panel.position.set(0, wallLift + bottomY + usableH * 0.5, -d / 2 + 0.02);
      group.add(panel);
    }
  }

  if (item.kind === "sink") {
    const basin = tag(
      new THREE.Mesh(new THREE.BoxGeometry(w * 0.42, 0.035, d * 0.38), makeMat(0xb8bec6, 0.22, 0.55)),
      "chrome"
    );
    basin.position.set(0, h - 0.01, 0);
    group.add(basin);
  }

  const frontType = item.front || "doors";
  const frontZ = d / 2 - 0.008;
  const doorT = 0.018;
  const gap = 0.003;
  const frontW = w - gap * 2;
  const frontH = usableH - gap * 2;
  const frontY0 = wallLift + bottomY + gap;

  function addDoor(i, count, y, height) {
    const doorW = (frontW - gap * (count - 1)) / count;
    const hingeOnLeft = count === 1 ? true : i % 2 === 0;
    const pivotX = hingeOnLeft
      ? -w / 2 + gap + i * (doorW + gap)
      : -w / 2 + gap + i * (doorW + gap) + doorW;

    const doorPivot = new THREE.Group();
    doorPivot.position.set(pivotX, y, frontZ);
    doorPivot.userData = {
      type: "door",
      open: 0,
      target: 0,
      max: hingeOnLeft ? -Math.PI * 0.75 : Math.PI * 0.75,
      hingeOnLeft,
    };

    const door = tag(new THREE.Mesh(new THREE.BoxGeometry(doorW, height, doorT), bMat.clone()), "body");
    door.position.set(hingeOnLeft ? doorW / 2 : -doorW / 2, height / 2, doorT / 2);
    door.castShadow = true;
    doorPivot.add(door);

    const panel = tag(
      new THREE.Mesh(new THREE.BoxGeometry(doorW * 0.78, height * 0.78, 0.004), bMat.clone()),
      "body"
    );
    panel.position.set(door.position.x, height / 2, doorT + 0.002);
    doorPivot.add(panel);

    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.007, 0.007, height > 0.9 ? 0.16 : 0.11, 12),
      chromeMat()
    );
    handle.rotation.z = Math.PI / 2;
    handle.position.set(
      hingeOnLeft ? doorW - 0.05 : -(doorW - 0.05),
      height * (item.kind === "tall" ? 0.65 : 0.5),
      doorT + 0.02
    );
    doorPivot.add(handle);

    group.add(doorPivot);
    animatables.push(doorPivot);
  }

  function addDrawer(i, count, areaH, startY) {
    const drawerH = (areaH - gap * (count - 1)) / count;
    const drawerPivot = new THREE.Group();
    drawerPivot.position.set(0, startY + i * (drawerH + gap), frontZ);
    drawerPivot.userData = {
      type: "drawer",
      open: 0,
      target: 0,
      max: d * 0.75,
      baseZ: frontZ,
    };

    const face = tag(new THREE.Mesh(new THREE.BoxGeometry(frontW, drawerH, doorT), bMat.clone()), "body");
    face.position.set(0, drawerH / 2, doorT / 2);
    face.castShadow = true;
    drawerPivot.add(face);

    const box = tag(
      new THREE.Mesh(new THREE.BoxGeometry(frontW * 0.9, Math.max(0.04, drawerH * 0.65), d * 0.55), iMat.clone()),
      "inner"
    );
    box.position.set(0, drawerH / 2, -d * 0.2);
    drawerPivot.add(box);

    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(Math.min(0.18, frontW * 0.3), 0.012, 0.012),
      chromeMat()
    );
    handle.position.set(0, drawerH / 2, doorT + 0.015);
    drawerPivot.add(handle);

    group.add(drawerPivot);
    animatables.push(drawerPivot);
  }

  if (frontType === "doors" || frontType === "tall" || frontType === "wall") {
    const doorCount = item.doors ?? (item.w >= 80 ? 2 : 1);
    for (let i = 0; i < doorCount; i++) addDoor(i, doorCount, frontY0, frontH);
  } else if (frontType === "drawers") {
    const drawerCount = item.drawers ?? 3;
    for (let i = 0; i < drawerCount; i++) addDrawer(i, drawerCount, frontH, frontY0);
  } else if (frontType === "mix") {
    const drawerCount = item.drawers ?? 2;
    const drawerArea = frontH * 0.5;
    for (let i = 0; i < drawerCount; i++) addDrawer(i, drawerCount, drawerArea, frontY0);
    const doorCount = 2;
    const doorH = frontH * 0.45;
    for (let i = 0; i < doorCount; i++) addDoor(i, doorCount, frontY0 + frontH * 0.55, doorH);
  }

  const helper = new THREE.BoxHelper(group, 0xc4a35a);
  helper.visible = false;
  helper.name = "helper";
  group.add(helper);

  return group;
}

export function applyCabinetColors(obj, bodyHex, topHex) {
  obj.traverse((child) => {
    if (!child.isMesh || !child.material?.color) return;
    const role = child.userData.role || child.material.userData?.role;
    if (role === "body") child.material.color.setHex(bodyHex);
    if (role === "top") child.material.color.setHex(topHex);
  });
}

export function setCabinetOpen(obj, open) {
  obj.userData.open = open;
  for (const part of obj.userData.animatables || []) {
    part.userData.target = open ? 1 : 0;
  }
}

export function toggleCabinetOpen(obj) {
  setCabinetOpen(obj, !obj.userData.open);
}

export function updateCabinetAnimations(obj, dt = 0.016) {
  const speed = 7;
  for (const part of obj.userData.animatables || []) {
    const u = part.userData;
    u.open += (u.target - u.open) * Math.min(1, dt * speed);
    if (u.type === "door") {
      part.rotation.y = u.max * u.open;
    } else if (u.type === "drawer") {
      part.position.z = u.baseZ + u.max * u.open;
    }
  }
}

export const CATALOG = [
  { id: "base60d", label: "תחתון 60 · דלת", kind: "base", front: "doors", doors: 1, w: 60, d: 60, h: 90 },
  { id: "base80d", label: "תחתון 80 · 2 דלתות", kind: "base", front: "doors", doors: 2, w: 80, d: 60, h: 90 },
  { id: "base60dr", label: "תחתון 60 · 3 מגירות", kind: "drawers", front: "drawers", drawers: 3, w: 60, d: 60, h: 90 },
  { id: "base80dr", label: "תחתון 80 · 4 מגירות", kind: "drawers", front: "drawers", drawers: 4, w: 80, d: 60, h: 90 },
  { id: "base100mix", label: "תחתון 100 · דלתות+מגירות", kind: "base", front: "mix", drawers: 2, w: 100, d: 60, h: 90 },
  { id: "sink80", label: "כיור 80 · דלתות", kind: "sink", front: "doors", doors: 2, w: 80, d: 60, h: 90 },
  { id: "wall60", label: "עליון 60 · דלת", kind: "wall", front: "wall", doors: 1, w: 60, d: 35, h: 70 },
  { id: "wall80", label: "עליון 80 · 2 דלתות", kind: "wall", front: "wall", doors: 2, w: 80, d: 35, h: 70 },
  { id: "tall60", label: "גבוה 60 · מזווה", kind: "tall", front: "tall", doors: 1, w: 60, d: 60, h: 210 },
  { id: "island140", label: "אי 140 · מגירות", kind: "island", front: "drawers", drawers: 3, w: 140, d: 90, h: 90 },
  { id: "island180", label: "אי 180 · מגירות כפול", kind: "island", front: "drawers", drawers: 4, w: 180, d: 95, h: 90 },
];

export const BODY_MATERIALS = [
  { id: "white", name: "לבן מט", color: 0xf4f1ea },
  { id: "cream", name: "קרם", color: 0xe8dcc8 },
  { id: "oak", name: "אלון", color: 0xb08968 },
  { id: "walnut", name: "אגוז", color: 0x6b4226 },
  { id: "gray", name: "אפור", color: 0x8b939c },
  { id: "black", name: "שחור", color: 0x2a2e33 },
  { id: "green", name: "ירוק יער", color: 0x3f5d4a },
  { id: "navy", name: "כחול עמוק", color: 0x243447 },
];

export const TOP_MATERIALS = [
  { id: "marble", name: "שיש לבן", color: 0xf0eeea },
  { id: "quartz", name: "קוורץ אפור", color: 0xc5c8cc },
  { id: "blackstone", name: "אבן שחורה", color: 0x303338 },
  { id: "wood", name: "עץ טבעי", color: 0xa67c52 },
  { id: "concrete", name: "בטון", color: 0x9a9ea3 },
];
