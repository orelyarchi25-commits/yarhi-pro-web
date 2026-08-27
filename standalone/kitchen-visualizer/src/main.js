import "./style.css";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  BODY_MATERIALS,
  TOP_MATERIALS,
  CATALOG,
  cmToM,
  makeMat,
  createCabinetMesh,
  applyCabinetColors,
  toggleCabinetOpen,
  setCabinetOpen,
  updateCabinetAnimations,
} from "./cabinets.js";

const canvas = document.getElementById("c");
const placeModeEl = document.getElementById("placeMode");
const selectedSection = document.getElementById("selectedSection");
const selectedLabel = document.getElementById("selectedLabel");

let room = { w: 420, d: 380, h: 270 };
let pendingCatalogId = null;
let selected = null;
let bodyMatId = "oak";
let topMatId = "marble";
let dragging = false;
let dragOffset = new THREE.Vector3();
let lastTap = 0;

const cabinets = [];
let lastTime = performance.now();

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b0f14);

const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 80);
camera.position.set(4.5, 2.8, 5.2);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.9));

const sun = new THREE.DirectionalLight(0xfff2dd, 1.4);
sun.position.set(3.8, 6.2, 2.8);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { near: 0.5, far: 25, left: -9, right: 9, top: 9, bottom: -9 });
scene.add(sun);

const fill = new THREE.PointLight(0x9ecbff, 0.4, 22);
fill.position.set(-2.2, 2.3, -1.6);
scene.add(fill);

const roomGroup = new THREE.Group();
scene.add(roomGroup);
const cabinetsGroup = new THREE.Group();
scene.add(cabinetsGroup);

const ghostMat = new THREE.MeshStandardMaterial({
  color: 0xc4a35a,
  transparent: true,
  opacity: 0.32,
  roughness: 0.6,
});
const ghost = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.6), ghostMat);
ghost.visible = false;
scene.add(ghost);

const floorRayPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshBasicMaterial({ visible: false })
);
floorRayPlane.rotation.x = -Math.PI / 2;
scene.add(floorRayPlane);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function bodyHex() {
  return BODY_MATERIALS.find((m) => m.id === bodyMatId)?.color ?? 0xffffff;
}
function topHex() {
  return TOP_MATERIALS.find((m) => m.id === topMatId)?.color ?? 0xffffff;
}

function rebuildRoom() {
  while (roomGroup.children.length) {
    const c = roomGroup.children.pop();
    c.geometry?.dispose?.();
    if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
    else c.material?.dispose?.();
  }

  const w = cmToM(room.w);
  const d = cmToM(room.d);
  const h = cmToM(room.h);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), makeMat(0xd9cfc0, 0.88, 0));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  const wallMat = makeMat(0xf7f4ef, 0.93, 0);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), wallMat);
  back.position.set(0, h / 2, -d / 2);
  back.receiveShadow = true;
  roomGroup.add(back);

  const left = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat.clone());
  left.position.set(-w / 2, h / 2, 0);
  left.rotation.y = Math.PI / 2;
  left.receiveShadow = true;
  roomGroup.add(left);

  const right = new THREE.Mesh(new THREE.PlaneGeometry(d, h), wallMat.clone());
  right.position.set(w / 2, h / 2, 0);
  right.rotation.y = -Math.PI / 2;
  right.receiveShadow = true;
  roomGroup.add(right);

  // ceiling light glow board
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(w * 0.45, 1.6), 0.04, 0.35),
    makeMat(0xfff6e8, 0.4, 0.1)
  );
  lamp.position.set(0, h - 0.08, 0);
  roomGroup.add(lamp);

  controls.target.set(0, h * 0.35, 0);
  camera.position.set(w * 0.7, h * 0.95, d * 0.95);
  controls.update();
}

function refreshHelper(obj) {
  const helper = obj?.children.find((c) => c.name === "helper");
  if (helper) {
    helper.update();
    helper.visible = obj === selected;
  }
}

function selectCabinet(obj) {
  if (selected) {
    const prev = selected.children.find((c) => c.name === "helper");
    if (prev) prev.visible = false;
  }
  selected = obj;
  if (selected) {
    refreshHelper(selected);
    selectedSection.hidden = false;
    selectedLabel.textContent = selected.userData.label;
    bodyMatId = selected.userData.bodyMatId || bodyMatId;
    topMatId = selected.userData.topMatId || topMatId;
    syncSwatches();
    document.getElementById("openBtn").textContent = selected.userData.open
      ? "סגירת דלתות/מגירות"
      : "פתיחת דלתות/מגירות";
  } else {
    selectedSection.hidden = true;
  }
}

function snap(v, step = 0.05) {
  return Math.round(v / step) * step;
}

function clampToRoom(x, z, item) {
  const halfW = cmToM(room.w) / 2;
  const halfD = cmToM(room.d) / 2;
  const hw = cmToM(item.w) / 2;
  const hd = cmToM(item.d) / 2;
  return {
    x: THREE.MathUtils.clamp(x, -halfW + hw + 0.02, halfW - hw - 0.02),
    z: THREE.MathUtils.clamp(z, -halfD + hd + 0.02, halfD - hd - 0.02),
  };
}

function faceNearestWall(obj) {
  if (obj.userData.kind === "island") return;
  const halfW = cmToM(room.w) / 2;
  const halfD = cmToM(room.d) / 2;
  const distBack = Math.abs(obj.position.z + halfD);
  const distFront = Math.abs(obj.position.z - halfD);
  const distLeft = Math.abs(obj.position.x + halfW);
  const distRight = Math.abs(obj.position.x - halfW);
  const min = Math.min(distBack, distFront, distLeft, distRight);
  if (min === distBack) obj.rotation.y = Math.PI;
  else if (min === distFront) obj.rotation.y = 0;
  else if (min === distLeft) obj.rotation.y = Math.PI / 2;
  else obj.rotation.y = -Math.PI / 2;
}

function getHits(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return {
    cabinets: raycaster.intersectObjects(cabinetsGroup.children, true),
    floor: raycaster.intersectObject(floorRayPlane, false),
  };
}

function findCabinetRoot(obj) {
  let cur = obj;
  while (cur && cur.parent !== cabinetsGroup) cur = cur.parent;
  return cur && cur.parent === cabinetsGroup ? cur : null;
}

function setPending(id) {
  pendingCatalogId = id;
  document.querySelectorAll(".catalog button").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.id === id);
  });
  const item = CATALOG.find((c) => c.id === id);
  placeModeEl.textContent = item ? `מציבים: ${item.label}` : "בחרו מודול · דאבל־קליק לפתיחה";
  if (item) {
    ghost.geometry.dispose();
    ghost.geometry = new THREE.BoxGeometry(cmToM(item.w), cmToM(item.h), cmToM(item.d));
    ghost.visible = true;
    ghost.position.y = item.kind === "wall" ? cmToM(140) + cmToM(item.h) / 2 : cmToM(item.h) / 2;
  } else ghost.visible = false;
}

function placeCabinetAt(x, z) {
  const item = CATALOG.find((c) => c.id === pendingCatalogId);
  if (!item) return;
  const pos = clampToRoom(snap(x), snap(z), item);
  const mesh = createCabinetMesh(item, bodyHex(), topHex());
  mesh.userData.bodyMatId = bodyMatId;
  mesh.userData.topMatId = topMatId;
  mesh.position.set(pos.x, 0, pos.z);
  faceNearestWall(mesh);
  cabinetsGroup.add(mesh);
  cabinets.push(mesh);
  selectCabinet(mesh);
}

function onPointerMove(event) {
  const { floor } = getHits(event);
  if (dragging && selected && floor[0]) {
    const item = { w: selected.userData.w, d: selected.userData.d };
    const pos = clampToRoom(
      snap(floor[0].point.x - dragOffset.x),
      snap(floor[0].point.z - dragOffset.z),
      item
    );
    selected.position.x = pos.x;
    selected.position.z = pos.z;
    return;
  }
  if (!pendingCatalogId || !floor[0]) return;
  const item = CATALOG.find((c) => c.id === pendingCatalogId);
  const p = clampToRoom(snap(floor[0].point.x), snap(floor[0].point.z), item);
  ghost.position.x = p.x;
  ghost.position.z = p.z;
  ghost.position.y = item.kind === "wall" ? cmToM(140) + cmToM(item.h) / 2 : cmToM(item.h) / 2;
}

function onPointerDown(event) {
  if (event.button !== 0) return;
  const { cabinets: hits, floor } = getHits(event);
  const now = performance.now();
  const isDouble = now - lastTap < 280;
  lastTap = now;

  if (pendingCatalogId && floor[0] && hits.length === 0) {
    placeCabinetAt(floor[0].point.x, floor[0].point.z);
    return;
  }

  if (hits.length) {
    const root = findCabinetRoot(hits[0].object);
    if (!root) return;
    if (isDouble) {
      toggleCabinetOpen(root);
      selectCabinet(root);
      return;
    }
    selectCabinet(root);
    if (floor[0]) {
      dragging = true;
      controls.enabled = false;
      dragOffset.set(
        floor[0].point.x - root.position.x,
        0,
        floor[0].point.z - root.position.z
      );
    }
  } else {
    selectCabinet(null);
  }
}

function onPointerUp() {
  if (dragging && selected && selected.userData.kind !== "island") {
    faceNearestWall(selected);
  }
  dragging = false;
  controls.enabled = true;
}

function resize() {
  const { clientWidth: w, clientHeight: h } = canvas.parentElement;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}

function syncSwatches() {
  document.querySelectorAll("#bodyMaterials .swatch").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.id === bodyMatId);
  });
  document.querySelectorAll("#topMaterials .swatch").forEach((el) => {
    el.classList.toggle("is-active", el.dataset.id === topMatId);
  });
}

function buildUI() {
  const catalog = document.getElementById("catalog");
  catalog.innerHTML = CATALOG.map(
    (c) =>
      `<button type="button" data-id="${c.id}"><strong>${c.label}</strong><small>${c.w}×${c.d}×${c.h} ס״מ</small></button>`
  ).join("");
  catalog.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-id]");
    if (!btn) return;
    setPending(btn.dataset.id === pendingCatalogId ? null : btn.dataset.id);
  });

  const bodyWrap = document.getElementById("bodyMaterials");
  bodyWrap.innerHTML = BODY_MATERIALS.map(
    (m) =>
      `<button type="button" class="swatch" title="${m.name}" data-id="${m.id}" style="background:#${m.color.toString(16).padStart(6, "0")}"></button>`
  ).join("");
  bodyWrap.addEventListener("click", (e) => {
    const s = e.target.closest(".swatch");
    if (!s) return;
    bodyMatId = s.dataset.id;
    syncSwatches();
    if (selected) {
      selected.userData.bodyMatId = bodyMatId;
      applyCabinetColors(selected, bodyHex(), topHex());
    }
  });

  const topWrap = document.getElementById("topMaterials");
  topWrap.innerHTML = TOP_MATERIALS.map(
    (m) =>
      `<button type="button" class="swatch" title="${m.name}" data-id="${m.id}" style="background:#${m.color.toString(16).padStart(6, "0")}"></button>`
  ).join("");
  topWrap.addEventListener("click", (e) => {
    const s = e.target.closest(".swatch");
    if (!s) return;
    topMatId = s.dataset.id;
    syncSwatches();
    if (selected) {
      selected.userData.topMatId = topMatId;
      applyCabinetColors(selected, bodyHex(), topHex());
    }
  });

  document.getElementById("applyRoom").addEventListener("click", () => {
    room = {
      w: Number(document.getElementById("roomW").value) || 420,
      d: Number(document.getElementById("roomD").value) || 380,
      h: Number(document.getElementById("roomH").value) || 270,
    };
    rebuildRoom();
  });

  document.getElementById("rotateBtn").addEventListener("click", () => {
    if (!selected) return;
    selected.rotation.y += Math.PI / 2;
  });

  document.getElementById("openBtn")?.addEventListener("click", () => {
    if (!selected) return;
    toggleCabinetOpen(selected);
    document.getElementById("openBtn").textContent = selected.userData.open
      ? "סגירת דלתות/מגירות"
      : "פתיחת דלתות/מגירות";
  });

  document.getElementById("openAllBtn")?.addEventListener("click", () => {
    const anyClosed = cabinets.some((c) => !c.userData.open);
    cabinets.forEach((c) => setCabinetOpen(c, anyClosed));
  });

  document.getElementById("deleteBtn").addEventListener("click", () => {
    if (!selected) return;
    cabinetsGroup.remove(selected);
    const i = cabinets.indexOf(selected);
    if (i >= 0) cabinets.splice(i, 1);
    selectCabinet(null);
  });

  document.getElementById("clearBtn").addEventListener("click", () => {
    while (cabinetsGroup.children.length) cabinetsGroup.remove(cabinetsGroup.children[0]);
    cabinets.length = 0;
    selectCabinet(null);
  });

  document.getElementById("shotBtn").addEventListener("click", () => {
    renderer.render(scene, camera);
    const a = document.createElement("a");
    a.download = `kitchen-preview-${Date.now()}.png`;
    a.href = renderer.domElement.toDataURL("image/png");
    a.click();
  });

  syncSwatches();
}

canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerdown", onPointerDown);
window.addEventListener("pointerup", onPointerUp);
window.addEventListener("resize", resize);

rebuildRoom();
buildUI();
resize();

// Demo kitchen
(function seedDemo() {
  const demo = [
    { id: "base80dr", x: -1.35, z: -1.55 },
    { id: "sink80", x: -0.45, z: -1.55 },
    { id: "base100mix", x: 0.6, z: -1.55 },
    { id: "wall80", x: -1.35, z: -1.7 },
    { id: "wall60", x: 0.55, z: -1.7 },
    { id: "tall60", x: 1.65, z: -1.45 },
    { id: "island140", x: 0.1, z: 0.35 },
  ];
  demo.forEach((d) => {
    const item = CATALOG.find((c) => c.id === d.id);
    const mesh = createCabinetMesh(item, bodyHex(), topHex());
    mesh.userData.bodyMatId = bodyMatId;
    mesh.userData.topMatId = topMatId;
    mesh.position.set(d.x, 0, d.z);
    faceNearestWall(mesh);
    cabinetsGroup.add(mesh);
    cabinets.push(mesh);
  });
  // open one unit so feature is visible immediately
  setCabinetOpen(cabinets[0], true);
  setCabinetOpen(cabinets[6], true);
})();

function tick(now = performance.now()) {
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  cabinets.forEach((c) => updateCabinetAnimations(c, dt));
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
tick();
