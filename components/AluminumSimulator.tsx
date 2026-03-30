"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const RAL_COLORS = [
  { hex: "#2c3e50", name: "אפור פחם" },
  { hex: "#000000", name: "שחור 9005" },
  { hex: "#ffffff", name: "לבן 9016" },
  { hex: "#f5f5dc", name: "שמנת 9001" },
  { hex: "#383E42", name: "אנתרציט 7016" },
  { hex: "#2F3234", name: "שחור גרפיט 7021" },
  { hex: "#A5A5A5", name: "אלומיניום 9006" },
  { hex: "#8F8F8F", name: "אפור כהה 9007" },
  { hex: "#E3D9C6", name: "פנינה 1013" },
  { hex: "#4B3D35", name: "חום 8014" },
  { hex: "#4E3B31", name: "חום טרה 8028" },
  { hex: "#9DA1AA", name: "אפור חלון 7040" },
  { hex: "#114232", name: "ירוק זית 6005" },
];
const SLAT_COLORS = [
  { hex: "#a67c52", name: "עץ אלון" },
  ...RAL_COLORS,
];

type DividerState = { led: boolean; fan: boolean };

export default function AluminumSimulator() {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    pergolaGroup: THREE.Group;
    floor: THREE.Mesh;
    ambientLight: THREE.AmbientLight;
    sun: THREE.DirectionalLight;
    fans: THREE.Group[];
    labelPoints: { pos: THREE.Vector3; text: string; element?: HTMLDivElement }[];
  } | null>(null);

  const [dimL, setDimL] = useState(400);
  const [dimW, setDimW] = useState(300);
  const [frameType, setFrameType] = useState("120");
  const [roofType, setRoofType] = useState<"slats" | "pvc">("slats");
  const [slatType, setSlatType] = useState("40");
  const [orientation, setOrientation] = useState<"horizontal" | "vertical">("horizontal");
  const [gapVal, setGapVal] = useState(3);
  const [slatAngle, setSlatAngle] = useState(0);
  const [pvcDeploy, setPvcDeploy] = useState(100);
  const [pvcColor, setPvcColor] = useState(0xffffff);
  const [hasPvcLed, setHasPvcLed] = useState(true);
  const [showPosts, setShowPosts] = useState(true);
  const [showTensions, setShowTensions] = useState(false);
  const [showGrass, setShowGrass] = useState(true);
  const [showFurniture, setShowFurniture] = useState(true);
  const [showWall, setShowWall] = useState(true);
  const [frameColor, setFrameColor] = useState(0x2c3e50);
  const [slatColor, setSlatColor] = useState(0xa67c52);
  const [counters, setCounters] = useState({ posts: 2, tension: 2, divider: 2 });
  const [dividerStates, setDividerStates] = useState<DividerState[]>([
    { led: true, fan: false },
    { led: true, fan: false },
  ]);
  const [vitrineFront, setVitrineFront] = useState("none");
  const [vitrineRight, setVitrineRight] = useState("none");
  const [vitrineLeft, setVitrineLeft] = useState("none");
  const [glassType, setGlassType] = useState("clear");
  const [scrFront, setScrFront] = useState(0);
  const [scrRight, setScrRight] = useState(0);
  const [scrLeft, setScrLeft] = useState(0);
  const [scrColorStr, setScrColorStr] = useState("black");
  const [ledTone, setLedTone] = useState("white");
  const [price, setPrice] = useState(0);
  const [pricing, setPricing] = useState({
    base: 800,
    slats: 500,
    pvc: 600,
    divider: 450,
    zip: 950,
    vitrine: 1800,
  });
  const [showPricingPanel, setShowPricingPanel] = useState(false);
  const [isNightMode, setIsNightMode] = useState(false);
  const [isPanelVisible, setIsPanelVisible] = useState(true);
  const [logoText, setLogoText] = useState("ירחי אלומיניום");
  const [logoSub, setLogoSub] = useState("מפעל ייצור");
  const [logoAddress, setLogoAddress] = useState("הסולל 3, חולון");

  const animateRef = useRef<number | null>(null);

  const createBox = useCallback(
    (
      w: number,
      h: number,
      l: number,
      color: number,
      isLed = false,
      opacity = 1
    ): THREE.Mesh => {
      const matOpts: THREE.MeshStandardMaterialParameters = {
        color,
        side: THREE.DoubleSide,
        transparent: opacity < 1,
        opacity,
      };
      if (!isLed) {
        matOpts.roughness = 0.5;
        matOpts.metalness = 0.3;
      } else {
        matOpts.emissive = new THREE.Color(color);
        matOpts.emissiveIntensity = isNightMode ? 2.5 : 0.8;
        matOpts.roughness = 1.0;
        matOpts.metalness = 0.0;
      }
      const mat = new THREE.MeshStandardMaterial(matOpts);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, l), mat);
      if (!isLed) mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    },
    [isNightMode]
  );

  const createFan = useCallback((): { group: THREE.Group; blades: THREE.Group } => {
    const fan = new THREE.Group();
    const rod = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.1, 0.03),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    fan.add(rod);
    const motor = new THREE.Mesh(
      new THREE.BoxGeometry(0.15, 0.08, 0.15),
      new THREE.MeshStandardMaterial({ color: 0x333333 })
    );
    motor.position.y = -0.08;
    fan.add(motor);
    const blades = new THREE.Group();
    blades.position.y = -0.1;
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.01, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x444444 })
      );
      b.position.x = 0.25;
      const pivot = new THREE.Group();
      pivot.rotation.y = (Math.PI * 2) / 3 * i;
      pivot.add(b);
      blades.add(pivot);
    }
    fan.add(blades);
    return { group: fan, blades };
  }, []);

  const createFurniture = useCallback(
    (L: number, W: number): THREE.Group => {
      const group = new THREE.Group();
      const furnitureColor = 0x1a1a1a;
      const sofa = createBox(2, 0.4, 0.8, furnitureColor);
      sofa.position.set(-L / 4, 0.2, 0);
      group.add(sofa);
      const back = createBox(2, 0.6, 0.2, furnitureColor);
      back.position.set(-L / 4, 0.3, -0.4);
      group.add(back);
      const table = createBox(0.8, 0.4, 0.8, 0x333333);
      table.position.set(0, 0.2, 0);
      group.add(table);
      return group;
    },
    [createBox]
  );

  const clearGroup = useCallback((group: THREE.Group) => {
    for (let i = group.children.length - 1; i >= 0; i--) {
      const child = group.children[i];
      if (child instanceof THREE.Group) clearGroup(child);
      if (child instanceof THREE.Mesh) {
        child.geometry?.dispose();
        if (child.material) {
          const mat = child.material as THREE.Material;
          mat.dispose();
        }
      }
      group.remove(child);
    }
  }, []);

  const calculatePrice = useCallback(
    (L: number, W: number) => {
      const area = L * W;
      let total = area * pricing.base;
      if (roofType === "pvc") total += area * pricing.pvc;
      else total += area * pricing.slats;
      total += counters.divider * pricing.divider;
      if (scrFront > 0) total += L * pricing.zip;
      if (scrRight > 0) total += W * pricing.zip;
      if (scrLeft > 0) total += W * pricing.zip;
      if (vitrineFront !== "none") total += L * pricing.vitrine;
      if (vitrineRight !== "none") total += W * pricing.vitrine;
      if (vitrineLeft !== "none") total += W * pricing.vitrine;
      setPrice(Math.round(total));
    },
    [
      roofType,
      counters.divider,
      scrFront,
      scrRight,
      scrLeft,
      vitrineFront,
      vitrineRight,
      vitrineLeft,
      pricing,
    ]
  );

  const updateModel = useCallback(() => {
    const ctx = sceneRef.current;
    if (!ctx) return;

    const L = Math.max(2, dimL / 100);
    const W = Math.max(1.5, dimW / 100);
    const gap = gapVal / 100;
    const slatAngleRad = (slatAngle * Math.PI) / 180;
    const pvcDeployVal = pvcDeploy / 100;
    const scrColorHex =
      scrColorStr === "black" ? 0x222222 : scrColorStr === "grey" ? 0x555555 : 0xdddddd;
    const ledColor = ledTone === "warm" ? 0xfff4d6 : 0xffffff;
    const H = 2.7;
    const frameHeight = frameType === "140" ? 0.14 : 0.12;
    const frameWidth = 0.04;

    calculatePrice(L, W);

    clearGroup(ctx.pergolaGroup);
    ctx.fans = [];
    ctx.labelPoints = [];

    ctx.floor.visible = showGrass;

    if (showWall) {
      const wall = createBox(L + 6, 6, 0.4, 0xffffff);
      wall.position.set(0, 3, -W / 2 - 0.21);
      ctx.pergolaGroup.add(wall);
    }

    [W / 2, -W / 2].forEach((z) => {
      const b = createBox(L, frameHeight, frameWidth, frameColor);
      b.position.set(0, H, z);
      ctx.pergolaGroup.add(b);
    });
    [L / 2, -L / 2].forEach((x) => {
      const b = createBox(frameWidth, frameHeight, W, frameColor);
      b.position.set(x, H, 0);
      ctx.pergolaGroup.add(b);
    });

    if (showPosts) {
      for (let i = 0; i < counters.posts; i++) {
        const xPos =
          counters.posts > 1
            ? -L / 2 + 0.05 + (i * (L - 0.1)) / (counters.posts - 1)
            : 0;
        const p = createBox(0.1, H, 0.1, frameColor);
        p.position.set(xPos, H / 2, W / 2 - 0.05);
        ctx.pergolaGroup.add(p);
      }
    }

    if (showTensions) {
      const dH = 1.0;
      const rodLen = Math.sqrt(W * W + dH * dH);
      const angle = Math.atan2(dH, W);
      for (let i = 0; i < counters.tension; i++) {
        const xPos =
          counters.tension > 1
            ? -L / 2 + (i * L) / (counters.tension - 1)
            : 0;
        const rod = createBox(0.04, 0.04, rodLen, frameColor);
        rod.position.set(xPos, H + frameHeight / 2 + dH / 2, 0);
        rod.rotation.x = angle;
        ctx.pergolaGroup.add(rod);
      }
    }

    if (roofType === "slats") {
      const pattern: number[] =
        slatType === "40"
          ? [0.04]
          : slatType === "70"
          ? [0.07]
          : slatType === "combo1"
          ? [0.04, 0.04, 0.07]
          : [0.02, 0.02, 0.07, 0.04, 0.04];

      if (orientation === "vertical") {
        let currentPos = -L / 2 + 0.02;
        let pIndex = 0;
        while (currentPos < L / 2 - 0.02) {
          const sw = pattern[pIndex % pattern.length];
          if (currentPos + sw > L / 2) break;
          const s = createBox(sw, 0.02, W - 0.08, slatColor);
          s.position.set(currentPos + sw / 2, H, 0);
          s.rotation.z = slatAngleRad;
          ctx.pergolaGroup.add(s);
          currentPos += sw + gap;
          pIndex++;
        }
      } else {
        let currentPos = -W / 2 + 0.02;
        let pIndex = 0;
        while (currentPos < W / 2 - 0.02) {
          const sw = pattern[pIndex % pattern.length];
          if (currentPos + sw > W / 2) break;
          const s = createBox(L - 0.08, 0.02, sw, slatColor);
          s.position.set(0, H, currentPos + sw / 2);
          s.rotation.x = -slatAngleRad;
          ctx.pergolaGroup.add(s);
          currentPos += sw + gap;
          pIndex++;
        }
      }

      for (let i = 0; i < counters.divider; i++) {
        const xPos = -L / 2 + (i + 1) * (L / (counters.divider + 1));
        const div = createBox(0.06, frameHeight - 0.02, W - 0.08, frameColor);
        div.position.set(xPos, H, 0);
        ctx.pergolaGroup.add(div);
        if (dividerStates[i]?.led) {
          const led = createBox(0.02, 0.02, W - 0.1, ledColor, true);
          led.position.set(xPos, H - 0.06, 0);
          ctx.pergolaGroup.add(led);
        }
        if (dividerStates[i]?.fan) {
          const f = createFan();
          f.group.position.set(xPos, H - 0.08, 0);
          ctx.pergolaGroup.add(f.group);
          ctx.fans.push(f.blades);
        }
      }
    } else {
      const numBars = Math.max(2, Math.ceil(W / 0.5));
      const gatheredSizePerBar = 0.08;
      const totalDeployLen = W * pvcDeployVal;
      for (let i = 0; i < numBars; i++) {
        let zPos: number;
        if (pvcDeployVal === 1) {
          zPos = -W / 2 + (i * W) / (numBars - 1);
        } else {
          const gatheredZ = -W / 2 + i * gatheredSizePerBar;
          const stretchedZ =
            -W / 2 + (i * totalDeployLen) / (numBars - 1);
          zPos = Math.max(gatheredZ, stretchedZ);
        }
        const bar = createBox(L - 0.08, 0.02, 0.04, frameColor);
        bar.position.set(0, H - 0.01, zPos);
        ctx.pergolaGroup.add(bar);
        if (hasPvcLed) {
          const led = createBox(L - 0.08, 0.005, 0.02, ledColor, true);
          led.position.set(0, H - 0.02, zPos);
          ctx.pergolaGroup.add(led);
        }
        if (i > 0) {
          let prevZ: number;
          if (pvcDeployVal === 1) {
            prevZ = -W / 2 + ((i - 1) * W) / (numBars - 1);
          } else {
            const prevGatheredZ = -W / 2 + (i - 1) * gatheredSizePerBar;
            const prevStretchedZ =
              -W / 2 + ((i - 1) * totalDeployLen) / (numBars - 1);
            prevZ = Math.max(prevGatheredZ, prevStretchedZ);
          }
          const gapVal = zPos - prevZ;
          if (gapVal > 0.01) {
            const halfGap = gapVal / 2;
            const fabricLen = (W / (numBars - 1)) * 1.05;
            const halfFab = fabricLen / 2;
            let droop = 0;
            if (halfFab > halfGap)
              droop = Math.sqrt(halfFab * halfFab - halfGap * halfGap);
            droop = Math.min(droop, 0.35);
            const segLen = Math.hypot(halfGap, droop);
            const f1 = createBox(L - 0.08, 0.005, segLen, pvcColor);
            f1.position.set(0, H - droop / 2, prevZ + halfGap / 2);
            f1.rotation.x = Math.atan2(droop, halfGap);
            ctx.pergolaGroup.add(f1);
            const f2 = createBox(L - 0.08, 0.005, segLen, pvcColor);
            f2.position.set(0, H - droop / 2, zPos - halfGap / 2);
            f2.rotation.x = -Math.atan2(droop, halfGap);
            ctx.pergolaGroup.add(f2);
          }
        }
      }
    }

    if (showFurniture) {
      const furn = createFurniture(L, W);
      ctx.pergolaGroup.add(furn);
    }

    const createVitrineSystem = (
      length: number,
      height: number,
      vitrineModel: string,
      glassTypeStr: string
    ) => {
      const group = new THREE.Group();
      const trackHeight = 0.06;
      const trackDepth = 0.1;
      const glassColor = glassTypeStr === "clear" ? 0xe0f2fe : 0x1e293b;
      const glassOpacity = glassTypeStr === "clear" ? 0.15 : 0.6;
      const bottomTrack = createBox(length, trackHeight, trackDepth, frameColor);
      bottomTrack.position.set(0, trackHeight / 2, 0);
      group.add(bottomTrack);
      const topTrack = createBox(length, trackHeight, trackDepth, frameColor);
      topTrack.position.set(0, height - trackHeight / 2, 0);
      group.add(topTrack);
      const numPanels = Math.max(2, Math.ceil(length));
      const overlap = 0.05;
      const panelW =
        (length + overlap * (numPanels - 1)) / numPanels;
      const panelH = height - trackHeight * 2;
      const pFrameW = vitrineModel === "7000" ? 0.04 : 0.07;
      const matGlass = new THREE.MeshStandardMaterial({
        color: glassColor,
        transparent: true,
        opacity: glassOpacity,
        roughness: 0.05,
        metalness: 0.1,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      for (let i = 0; i < numPanels; i++) {
        const panelGroup = new THREE.Group();
        const pGlass = new THREE.Mesh(
          new THREE.BoxGeometry(panelW - pFrameW * 2, panelH - pFrameW * 2, 0.01),
          matGlass
        );
        panelGroup.add(pGlass);
        const fL = createBox(pFrameW, panelH, 0.03, frameColor);
        fL.position.set(-panelW / 2 + pFrameW / 2, 0, 0);
        const fR = createBox(pFrameW, panelH, 0.03, frameColor);
        fR.position.set(panelW / 2 - pFrameW / 2, 0, 0);
        const fT = createBox(panelW - pFrameW * 2, pFrameW, 0.03, frameColor);
        fT.position.set(0, panelH / 2 - pFrameW / 2, 0);
        const fB = createBox(panelW - pFrameW * 2, pFrameW, 0.03, frameColor);
        fB.position.set(0, -panelH / 2 + pFrameW / 2, 0);
        panelGroup.add(fL, fR, fT, fB);
        const xOffset = -length / 2 + panelW / 2 + i * (panelW - overlap);
        panelGroup.position.set(xOffset, height / 2, (i % 2 === 0 ? -0.02 : 0.02));
        group.add(panelGroup);
      }
      return group;
    };

    const createRollerBlind = (
      length: number,
      maxDrop: number,
      percent: number,
      fabricColorHex: number
    ) => {
      const group = new THREE.Group();
      if (percent === 0) return group;
      const drop = maxDrop * (percent / 100);
      const cassetteSize = 0.12;
      const cassette = createBox(
        length - 0.02,
        cassetteSize,
        cassetteSize,
        frameColor
      );
      cassette.position.set(0, -cassetteSize / 2, 0);
      group.add(cassette);
      if (drop > 0) {
        const matFabric = new THREE.MeshStandardMaterial({
          color: fabricColorHex,
          transparent: true,
          opacity: 0.9,
          roughness: 0.9,
          side: THREE.DoubleSide,
        });
        const fabric = new THREE.Mesh(
          new THREE.BoxGeometry(length - 0.06, drop, 0.005),
          matFabric
        );
        fabric.position.set(0, -cassetteSize - drop / 2, 0);
        group.add(fabric);
        const bottomBar = createBox(length - 0.04, 0.04, 0.02, frameColor);
        bottomBar.position.set(0, -cassetteSize - drop, 0);
        group.add(bottomBar);
      }
      return group;
    };

    const maxDrop = H - frameHeight;
    if (vitrineFront !== "none") {
      const vFront = createVitrineSystem(
        L,
        H,
        vitrineFront,
        glassType
      );
      vFront.position.set(0, 0, W / 2);
      ctx.pergolaGroup.add(vFront);
    }
    if (vitrineRight !== "none") {
      const vRight = createVitrineSystem(
        W,
        H,
        vitrineRight,
        glassType
      );
      vRight.rotation.y = Math.PI / 2;
      vRight.position.set(L / 2, 0, 0);
      ctx.pergolaGroup.add(vRight);
    }
    if (vitrineLeft !== "none") {
      const vLeft = createVitrineSystem(W, H, vitrineLeft, glassType);
      vLeft.rotation.y = Math.PI / 2;
      vLeft.position.set(-L / 2, 0, 0);
      ctx.pergolaGroup.add(vLeft);
    }

    if (scrFront > 0) {
      const blind = createRollerBlind(L, maxDrop, scrFront, scrColorHex);
      blind.position.set(
        0,
        H - frameHeight / 2,
        W / 2 - frameWidth / 2 - 0.06
      );
      ctx.pergolaGroup.add(blind);
    }
    if (scrRight > 0) {
      const blind = createRollerBlind(W, maxDrop, scrRight, scrColorHex);
      blind.rotation.y = Math.PI / 2;
      blind.position.set(
        L / 2 - frameWidth / 2 - 0.06,
        H - frameHeight / 2,
        0
      );
      ctx.pergolaGroup.add(blind);
    }
    if (scrLeft > 0) {
      const blind = createRollerBlind(W, maxDrop, scrLeft, scrColorHex);
      blind.rotation.y = Math.PI / 2;
      blind.position.set(
        -L / 2 + frameWidth / 2 + 0.06,
        H - frameHeight / 2,
        0
      );
      ctx.pergolaGroup.add(blind);
    }

    if (isNightMode) {
      const centralLight = new THREE.PointLight(
        ledColor,
        1.5,
        Math.max(L, W) * 2
      );
      centralLight.position.set(0, H - 0.5, 0);
      ctx.pergolaGroup.add(centralLight);
    }

    ctx.labelPoints = [
      { pos: new THREE.Vector3(0, H + 0.8, W / 2), text: `${Math.round(L * 100)} ס"מ אורך` },
      { pos: new THREE.Vector3(L / 2 + 0.5, H + 0.8, 0), text: `${Math.round(W * 100)} ס"מ יציאה` },
    ];
  }, [
    dimL,
    dimW,
    frameType,
    roofType,
    slatType,
    orientation,
    gapVal,
    slatAngle,
    pvcDeploy,
    pvcColor,
    hasPvcLed,
    showPosts,
    showTensions,
    showGrass,
    showWall,
    showFurniture,
    frameColor,
    slatColor,
    counters,
    dividerStates,
    vitrineFront,
    vitrineRight,
    vitrineLeft,
    glassType,
    scrFront,
    scrRight,
    scrLeft,
    scrColorStr,
    ledTone,
    isNightMode,
    createBox,
    createFan,
    createFurniture,
    clearGroup,
    calculatePrice,
    pricing,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9);

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.set(12, 10, 12);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
      alpha: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(0xffffff, 0.8);
    sun.position.set(15, 25, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    scene.add(sun);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({
        color: 0x4d7c0f,
        roughness: 0.9,
        metalness: 0.1,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const pergolaGroup = new THREE.Group();
    scene.add(pergolaGroup);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      pergolaGroup,
      floor,
      ambientLight,
      sun,
      fans: [],
      labelPoints: [],
    };

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", onResize);

    const animate = () => {
      animateRef.current = requestAnimationFrame(animate);
      if (!sceneRef.current) return;
      controls.update();
      sceneRef.current.fans.forEach((f) => (f.rotation.y += 0.15));

      const canvas = renderer.domElement;
      const currentScale = pergolaGroup.scale.x;
      sceneRef.current.labelPoints.forEach((lp) => {
        if (!lp.element || !labelsRef.current) return;
        const worldPos = lp.pos
          .clone()
          .multiplyScalar(currentScale)
          .add(pergolaGroup.position);
        const vector = worldPos.project(camera);
        const x = (vector.x * 0.5 + 0.5) * canvas.clientWidth;
        const y = (vector.y * -0.5 + 0.5) * canvas.clientHeight;
        lp.element.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
        lp.element.style.display = vector.z > 1 ? "none" : "block";
      });

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      window.removeEventListener("resize", onResize);
      if (animateRef.current) cancelAnimationFrame(animateRef.current);
      clearGroup(pergolaGroup);
      renderer.dispose();
      container.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, [clearGroup]);

  useEffect(() => {
    updateModel();
  }, [updateModel]);

  useEffect(() => {
    if (!sceneRef.current || !labelsRef.current) return;
    labelsRef.current.innerHTML = "";
    sceneRef.current.labelPoints.forEach((lp) => {
      const div = document.createElement("div");
      div.className =
        "absolute bg-navy-900/90 text-white px-2 py-1 rounded text-[10px] font-bold pointer-events-none z-[5]";
      div.innerText = lp.text;
      lp.element = div;
      labelsRef.current!.appendChild(div);
    });
  }, [
    dimL,
    dimW,
    roofType,
    slatType,
    orientation,
    frameType,
    counters,
    showPosts,
    showTensions,
    showGrass,
    showWall,
    showFurniture,
    frameColor,
    slatColor,
  ]);

  useEffect(() => {
    if (!sceneRef.current) return;
    const { scene, ambientLight, sun } = sceneRef.current;
    scene.background = new THREE.Color(isNightMode ? 0x0b1120 : 0xf1f5f9);
    ambientLight.intensity = isNightMode ? 0.05 : 0.7;
    sun.intensity = isNightMode ? 0.05 : 0.8;
  }, [isNightMode]);

  const updateCounter = (key: "posts" | "tension" | "divider", delta: number) => {
    const maxVal =
      key === "posts" ? 6 : key === "divider" ? 8 : 20;
    setCounters((c) => {
      const val = Math.max(0, Math.min(maxVal, (c[key] || 0) + delta));
      const next = { ...c, [key]: val };
      if (key === "divider" && delta > 0)
        setDividerStates((s) => [...s, { led: false, fan: false }]);
      else if (key === "divider" && delta < 0)
        setDividerStates((s) => (s.length > 1 ? s.slice(0, -1) : s));
      return next;
    });
  };

  const toggleDividerPart = (idx: number, part: "led" | "fan") => {
    setDividerStates((s) => {
      const next = [...s];
      if (part === "fan") {
        next[idx] = { ...next[idx], fan: !next[idx].fan };
        if (next[idx].fan) next[idx].led = false;
      } else {
        next[idx] = { ...next[idx], led: !next[idx].led };
        if (next[idx].led) next[idx].fan = false;
      }
      return next;
    });
  };

  const resetCamera = () => {
    if (!sceneRef.current) return;
    sceneRef.current.camera.position.set(12, 10, 12);
    sceneRef.current.controls.target.set(0, 1.5, 0);
    sceneRef.current.controls.update();
  };

  const handlePrint = () => {
    if (sceneRef.current) {
      sceneRef.current.renderer.render(
        sceneRef.current.scene,
        sceneRef.current.camera
      );
    }
    setTimeout(() => window.print(), 150);
  };

  return (
    <div
      className="relative w-full h-[calc(100dvh-8rem)] min-h-[420px] rounded-2xl overflow-hidden border border-metallic-700/50 bg-navy-900/30"
      dir="rtl"
    >
      <div
        ref={containerRef}
        className="absolute inset-0 bottom-14 z-[1] outline-none"
        style={{ background: isNightMode ? "#0b1120" : "#f1f5f9" }}
      />
      <div
        ref={labelsRef}
        className="absolute inset-0 bottom-14 pointer-events-none z-[5]"
      />

      <div className="absolute top-4 right-4 z-50 flex gap-2">
        <button
          type="button"
          onClick={() => setIsPanelVisible((v) => !v)}
          className="bg-slate-800 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-lg hover:bg-slate-900 transition flex items-center border border-slate-700"
        >
          {isPanelVisible ? "👁️ הסתר תפריט" : "👁️ הצג תפריט"}
        </button>
        <button
          type="button"
          onClick={() => setIsNightMode((v) => !v)}
          className={`px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition flex items-center border ${
            isNightMode
              ? "bg-amber-500 text-white border-amber-400 hover:bg-amber-600"
              : "bg-indigo-600 text-white border-indigo-500 hover:bg-indigo-700"
          }`}
        >
          {isNightMode ? "☀️ מצב יום" : "🌙 מצב לילה"}
        </button>
      </div>

      <div
        className={`absolute top-6 left-6 z-50 px-6 py-4 rounded-3xl shadow-2xl flex flex-col items-center transition-all ${
          isNightMode ? "bg-slate-900/95 border-slate-700" : "bg-white/95 border-slate-200"
        } border`}
      >
        <div className="flex items-center justify-between w-full mb-1">
          <p
            className={`text-[10px] font-bold uppercase tracking-widest ${
              isNightMode ? "text-slate-400" : "text-slate-500"
            }`}
          >
            הערכת מחיר למערכת
          </p>
          <button
            type="button"
            onClick={() => setShowPricingPanel((v) => !v)}
            className="text-slate-400 hover:text-slate-600 transition"
            title="הגדרות תמחור"
          >
            ⚙️
          </button>
        </div>
        <h2 className="text-3xl font-black text-blue-600 tracking-tight">
          ₪{price.toLocaleString()}
        </h2>
        <p className="text-[9px] text-slate-400 mt-1">* לא כולל מע&quot;מ והתקנה מורכבת</p>
      </div>

      {showPricingPanel && (
        <div
          className={`absolute top-32 left-6 z-50 px-6 py-4 rounded-2xl shadow-xl w-[300px] ${
            isNightMode ? "bg-slate-900/95 border-slate-700" : "bg-white/95 border-slate-200"
          } border`}
        >
          <h3 className="font-bold text-slate-800 mb-3 border-b pb-2 text-sm dark:text-slate-200">
            הגדרות מחירון (₪)
          </h3>
          <div className="space-y-2 text-xs">
            {[
              { id: "base", label: "מסגרת ועמודים (למ\"ר)", key: "base" as const },
              { id: "slats", label: "שלבים קבועים (למ\"ר)", key: "slats" as const },
              { id: "pvc", label: "גג PVC (למ\"ר)", key: "pvc" as const },
              { id: "divider", label: "חציץ / מחיצה (ליחידה)", key: "divider" as const },
              { id: "zip", label: "מסך גלילה Zip (למטר רץ)", key: "zip" as const },
              { id: "vitrine", label: "סגירת וטרינה (למטר רץ)", key: "vitrine" as const },
            ].map(({ id, label, key }) => (
              <div key={id} className="flex justify-between items-center">
                <label>{label}</label>
                <input
                  type="number"
                  value={pricing[key]}
                  onChange={(e) =>
                    setPricing((p) => ({
                      ...p,
                      [key]: Number(e.target.value) || 0,
                    }))
                  }
                  className="w-16 border rounded px-1 text-center bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setShowPricingPanel(false)}
            className="w-full mt-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold py-1.5 rounded-lg transition text-xs"
          >
            סגור
          </button>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 h-14 bg-slate-800 text-white text-center py-3 font-bold text-base z-20 border-t border-slate-700">
        {logoText} – {logoSub} – {logoAddress}
      </div>

      {isPanelVisible && (
        <div
          className={`absolute bottom-20 left-4 z-10 w-[340px] max-h-[70vh] overflow-y-auto rounded-2xl p-5 border shadow-xl ${
            isNightMode
              ? "bg-slate-900/95 border-slate-700 text-white"
              : "bg-white/95 border-slate-200 text-slate-900"
          }`}
        >
          <div className="space-y-4">
            <div>
              <div className="font-extrabold text-sm mb-2 border-b-2 border-blue-500 pb-1 flex items-center gap-2">
                📏 מידות ופרופילים
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="flex justify-between text-xs font-bold mb-1">
                    אורך (ס&quot;מ):{" "}
                    <input
                      type="number"
                      value={dimL}
                      onChange={(e) => setDimL(Number(e.target.value) || 400)}
                      className="w-14 text-center border rounded p-0.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-white border-slate-300 dark:border-slate-600"
                    />
                  </label>
                  <input
                    type="range"
                    min={200}
                    max={1500}
                    value={dimL}
                    onChange={(e) => setDimL(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="flex justify-between text-xs font-bold mb-1">
                    יציאה (ס&quot;מ):{" "}
                    <input
                      type="number"
                      value={dimW}
                      onChange={(e) => setDimW(Number(e.target.value) || 300)}
                      className="w-14 text-center border rounded p-0.5 bg-white dark:bg-slate-800 text-slate-800 dark:text-white border-slate-300 dark:border-slate-600"
                    />
                  </label>
                  <input
                    type="range"
                    min={150}
                    max={1000}
                    value={dimW}
                    onChange={(e) => setDimW(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
              <div className="mt-2">
                <label className="text-xs font-bold block mb-1">סוג פרופיל מסגרת:</label>
                <select
                  value={frameType}
                  onChange={(e) => setFrameType(e.target.value)}
                  className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                >
                  <option value="120">היקפי 120/40</option>
                  <option value="140">דאבל טי 140/40</option>
                </select>
              </div>
            </div>

            <div>
              <div className="font-extrabold text-sm mb-2 border-b-2 border-blue-500 pb-1 flex items-center gap-2">
                🏡 סביבה וריהוט
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showGrass}
                    onChange={(e) => setShowGrass(e.target.checked)}
                  />
                  דשא סינטטי
                </label>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFurniture}
                    onChange={(e) => setShowFurniture(e.target.checked)}
                  />
                  פינת ישיבה
                </label>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showWall}
                    onChange={(e) => setShowWall(e.target.checked)}
                  />
                  קיר אחורי לבן
                </label>
              </div>
            </div>

            <div>
              <div className="font-extrabold text-sm mb-2 border-b-2 border-blue-500 pb-1 flex items-center gap-2">
                🏗️ תמיכה ועמודים
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showPosts}
                    onChange={(e) => setShowPosts(e.target.checked)}
                  />
                  עמודי תמיכה
                </label>
                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showTensions}
                    onChange={(e) => setShowTensions(e.target.checked)}
                  />
                  מותחני קיר
                </label>
                <div>
                  <label className="text-xs font-bold block mb-1">כמות עמודים:</label>
                  <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border dark:border-slate-600">
                    <button
                      type="button"
                      onClick={() => updateCounter("posts", -1)}
                      className="w-6 h-6 rounded border flex items-center justify-center font-bold hover:bg-blue-500 hover:text-white hover:border-blue-500"
                    >
                      -
                    </button>
                    <span className="font-bold">{counters.posts}</span>
                    <button
                      type="button"
                      onClick={() => updateCounter("posts", 1)}
                      className="w-6 h-6 rounded border flex items-center justify-center font-bold hover:bg-blue-500 hover:text-white hover:border-blue-500"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">כמות מותחנים:</label>
                  <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border dark:border-slate-600">
                    <button
                      type="button"
                      onClick={() => updateCounter("tension", -1)}
                      className="w-6 h-6 rounded border flex items-center justify-center font-bold hover:bg-blue-500 hover:text-white hover:border-blue-500"
                    >
                      -
                    </button>
                    <span className="font-bold">{counters.tension}</span>
                    <button
                      type="button"
                      onClick={() => updateCounter("tension", 1)}
                      className="w-6 h-6 rounded border flex items-center justify-center font-bold hover:bg-blue-500 hover:text-white hover:border-blue-500"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <div className="font-extrabold text-sm mb-2 border-b-2 border-blue-500 pb-1 flex items-center gap-2">
                ☀️ מערכת קירוי גג
              </div>
              <select
                value={roofType}
                onChange={(e) => setRoofType(e.target.value as "slats" | "pvc")}
                className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
              >
                <option value="slats">ביוקלימטית / שלבי אלומיניום</option>
                <option value="pvc">יריעת PVC חשמלית נאספת</option>
              </select>
              {roofType === "slats" && (
                <>
                  <div className="mt-2">
                    <label className="text-xs font-bold block mb-1">סוג שלב אלומיניום:</label>
                    <select
                      value={slatType}
                      onChange={(e) => setSlatType(e.target.value)}
                      className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                    >
                      <option value="40">פרופיל 20/40 סטנדרט</option>
                      <option value="70">פרופיל 20/70 רחב</option>
                      <option value="combo1">משולב 1: (x2) 20/40 + (x1) 20/70</option>
                      <option value="combo2">משולב 2: (x2) 20/20 + (x1) 20/70 + (x2) 20/40</option>
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-xs font-bold block mb-1">כיוון השלבים:</label>
                      <select
                        value={orientation}
                        onChange={(e) =>
                          setOrientation(e.target.value as "horizontal" | "vertical")
                        }
                        className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                      >
                        <option value="horizontal">אופקי</option>
                        <option value="vertical">אנכי</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold block mb-1">
                        מרווח: {gapVal} ס&quot;מ
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={gapVal}
                        onChange={(e) => setGapVal(Number(e.target.value))}
                        className="w-full"
                      />
                    </div>
                  </div>
                  <div className="mt-2 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                    <label className="text-xs font-bold block mb-1">
                      פתיחה ביוקלימטית (זווית): {slatAngle}°
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={90}
                      step={5}
                      value={slatAngle}
                      onChange={(e) => setSlatAngle(Number(e.target.value))}
                      className="w-full mt-1"
                    />
                  </div>
                </>
              )}
              {roofType === "pvc" && (
                <>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="text-xs font-bold block mb-1">גוון בד PVC:</label>
                      <select
                        value={pvcColor.toString(16)}
                        onChange={(e) => setPvcColor(parseInt(e.target.value, 16))}
                        className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                      >
                        <option value="ffffff">לבן נקי</option>
                        <option value="f5f5dc">שמנת קלאסי</option>
                        <option value="dddddd">אפור בהיר</option>
                        <option value="3b3b3b">אפור פחם / שחור</option>
                      </select>
                    </div>
                    <label className="flex items-center gap-2 text-[10px] font-bold cursor-pointer mt-4">
                      <input
                        type="checkbox"
                        checked={hasPvcLed}
                        onChange={(e) => setHasPvcLed(e.target.checked)}
                      />
                      נורות לד על הבד
                    </label>
                  </div>
                  <div className="mt-3 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                    <label className="text-xs font-bold block mb-1">
                      מצב סגירת גג: {pvcDeploy}%
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={pvcDeploy}
                      onChange={(e) => setPvcDeploy(Number(e.target.value))}
                      className="w-full mt-1"
                    />
                  </div>
                </>
              )}
            </div>

            <div>
              <div className="font-extrabold text-sm mb-2 border-b-2 border-blue-500 pb-1 flex items-center gap-2">
                🎨 צבעי אלומיניום (RAL)
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 block mb-1 dark:text-slate-400">
                    מסגרת ועמודים:
                  </label>
                  <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {RAL_COLORS.map((c) => (
                      <button
                        key={c.hex}
                        type="button"
                        onClick={() =>
                          setFrameColor(parseInt(c.hex.replace("#", "0x")))
                        }
                        className={`w-5 h-5 rounded-full border-2 border-white shadow transition hover:scale-110 ${
                          frameColor === parseInt(c.hex.replace("#", "0x"))
                            ? "ring-2 ring-blue-500 scale-110"
                            : ""
                        }`}
                        style={{ backgroundColor: c.hex }}
                        title={c.name}
                      />
                    ))}
                  </div>
                </div>
                {roofType === "slats" && (
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 block mb-1 dark:text-slate-400">
                      שלבי אלומיניום:
                    </label>
                    <div className="flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                      {SLAT_COLORS.map((c) => (
                        <button
                          key={c.hex}
                          type="button"
                          onClick={() =>
                            setSlatColor(parseInt(c.hex.replace("#", "0x")))
                          }
                          className={`w-5 h-5 rounded-full border-2 border-white shadow transition hover:scale-110 ${
                            slatColor === parseInt(c.hex.replace("#", "0x"))
                              ? "ring-2 ring-blue-500 scale-110"
                              : ""
                          }`}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div>
              <div className="font-extrabold text-sm mb-2 border-b-2 border-blue-500 pb-1 flex items-center gap-2">
                💡 חציצה ותוספות
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold block mb-1">מספר חציצים:</label>
                  <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-lg border dark:border-slate-600">
                    <button
                      type="button"
                      onClick={() => updateCounter("divider", -1)}
                      className="w-6 h-6 rounded border flex items-center justify-center font-bold hover:bg-blue-500 hover:text-white hover:border-blue-500"
                    >
                      -
                    </button>
                    <span className="font-bold">{counters.divider}</span>
                    <button
                      type="button"
                      onClick={() => updateCounter("divider", 1)}
                      className="w-6 h-6 rounded border flex items-center justify-center font-bold hover:bg-blue-500 hover:text-white hover:border-blue-500"
                    >
                      +
                    </button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">גוון תאורה:</label>
                  <select
                    value={ledTone}
                    onChange={(e) => setLedTone(e.target.value)}
                    className="w-full text-[10px] border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  >
                    <option value="white">לבן (6000K)</option>
                    <option value="warm">צהוב (3000K)</option>
                  </select>
                </div>
              </div>
              <div className="mt-2 space-y-1">
                {dividerStates.map((state, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-1.5 px-2 bg-slate-100 dark:bg-slate-800 rounded text-[11px] border dark:border-slate-600"
                  >
                    <span className="font-bold">חציץ {idx + 1}:</span>
                    <div className="flex gap-2">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.led}
                          onChange={() => toggleDividerPart(idx, "led")}
                        />
                        לד
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={state.fan}
                          onChange={() => toggleDividerPart(idx, "fan")}
                        />
                        מאוורר
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="font-extrabold text-sm mb-2 border-b-2 border-blue-500 pb-1 flex items-center gap-2">
                🪟 סגירת וטרינות זכוכית
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-bold block mb-1">חזית:</label>
                  <select
                    value={vitrineFront}
                    onChange={(e) => setVitrineFront(e.target.value)}
                    className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  >
                    <option value="none">ללא</option>
                    <option value="7000">דגם 7000</option>
                    <option value="9000">דגם 9000</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">סוג זכוכית:</label>
                  <select
                    value={glassType}
                    onChange={(e) => setGlassType(e.target.value)}
                    className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  >
                    <option value="clear">שקוף (Clear)</option>
                    <option value="antisun">כהה (Anti-Sun)</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">צד ימין:</label>
                  <select
                    value={vitrineRight}
                    onChange={(e) => setVitrineRight(e.target.value)}
                    className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  >
                    <option value="none">ללא</option>
                    <option value="7000">דגם 7000</option>
                    <option value="9000">דגם 9000</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">צד שמאל:</label>
                  <select
                    value={vitrineLeft}
                    onChange={(e) => setVitrineLeft(e.target.value)}
                    className="w-full text-xs border p-2 rounded-lg bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                  >
                    <option value="none">ללא</option>
                    <option value="7000">דגם 7000</option>
                    <option value="9000">דגם 9000</option>
                  </select>
                </div>
              </div>
            </div>

            <div>
              <div className="font-extrabold text-sm mb-2 border-b-2 border-blue-500 pb-1 flex items-center gap-2">
                🔽 מסכי גלילה (Zip)
              </div>
              <div className="mb-2">
                <label className="text-xs font-bold block mb-1">צבע בד:</label>
                <select
                  value={scrColorStr}
                  onChange={(e) => setScrColorStr(e.target.value)}
                  className="w-full text-[10px] border p-1 rounded bg-white dark:bg-slate-800 dark:border-slate-600 dark:text-white"
                >
                  <option value="black">שחור (90% אטימות)</option>
                  <option value="grey">אפור פחם</option>
                  <option value="white">לבן</option>
                </select>
              </div>
              <div className="space-y-2">
                <div>
                  <label className="text-xs font-bold block mb-1">
                    חזית (% פתוח): {scrFront}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={scrFront}
                    onChange={(e) => setScrFront(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">
                    צד ימין (% פתוח): {scrRight}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={scrRight}
                    onChange={(e) => setScrRight(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold block mb-1">
                    צד שמאל (% פתוח): {scrLeft}%
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={scrLeft}
                    onChange={(e) => setScrLeft(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 pb-4">
              <button
                type="button"
                onClick={resetCamera}
                className="bg-slate-700 text-white py-2.5 rounded-xl font-bold text-xs hover:bg-slate-800 transition"
              >
                🎥 איפוס מבט
              </button>
              <button
                type="button"
                onClick={handlePrint}
                className="bg-blue-600 text-white py-2.5 rounded-xl font-bold text-xs hover:bg-blue-700 transition"
              >
                🖨️ ייצא / הדפסה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
