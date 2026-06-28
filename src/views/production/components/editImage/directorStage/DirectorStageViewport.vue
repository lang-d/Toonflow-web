<template>
  <div ref="hostRef" class="directorViewport" @click="handleCanvasClick">
    <div v-if="webglError" class="webglError">{{ webglError }}</div>
  </div>
</template>

<script setup lang="ts">
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import type { DirectorStageCamera, DirectorStageData, DirectorStagePlacedItem, DirectorVec3 } from "../../../utils/editImageType";
import { createMannequin, createPrimitive, disposeDirectorObject, updateDirectorObject } from "./directorModels";
import { getMediaOriginalUrl, normalizeMediaRef } from "@/utils/mediaRef";

const props = defineProps<{
  data: DirectorStageData;
  selectedItemId: string;
  transformMode: "translate" | "rotate" | "scale";
}>();

const emit = defineEmits<{
  select: [itemId: string];
  change: [];
  commit: [];
}>();

const hostRef = ref<HTMLElement | null>(null);
const webglError = ref("");
const scene = new THREE.Scene();
const directorCamera = new THREE.PerspectiveCamera(48, 16 / 9, 0.05, 300);
const shotCamera = new THREE.PerspectiveCamera(45, 16 / 9, 0.05, 300);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const objects = new Map<string, THREE.Object3D>();
const cameraHelpers = new Map<string, THREE.CameraHelper>();
let renderer: THREE.WebGLRenderer | null = null;
let orbit: OrbitControls | null = null;
let transform: TransformControls | null = null;
let transformHelper: THREE.Object3D | null = null;
let resizeObserver: ResizeObserver | null = null;
let grid: THREE.GridHelper | null = null;
let flatBackground: THREE.Mesh | null = null;
let panoramaBackground: THREE.Mesh | null = null;
let backgroundTexture: THREE.Texture | null = null;
let backgroundKey = "";
let backgroundImageAspect = 16 / 9;
let transforming = false;
let orbiting = false;
let pointerDownAt = { x: 0, y: 0 };

const activeCameraData = computed(() => props.data.cameras.find((camera) => camera.id === props.data.activeCameraId) || props.data.cameras[0]);

onMounted(() => {
  initialize();
});

onBeforeUnmount(dispose);

watch(
  () => props.data.items,
  () => syncObjects(),
  { deep: true },
);
watch(
  () => props.data.scene,
  () => syncBackground(),
  { deep: true },
);
watch(
  () => props.data.cameras,
  () => syncCameras(),
  { deep: true },
);
watch(
  () => [props.data.mode, props.data.activeCameraId],
  () => syncActiveView(),
);
watch(
  () => props.selectedItemId,
  () => attachTransform(),
);
watch(
  () => props.transformMode,
  (mode) => transform?.setMode(mode),
);

function initialize() {
  const host = hostRef.value;
  if (!host) return;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch {
    webglError.value = "当前设备无法初始化 WebGL";
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "directorViewportCanvas";
  renderer.domElement.addEventListener("pointerdown", handlePointerDown);
  host.appendChild(renderer.domElement);

  directorCamera.position.set(6, 4.5, 8);
  directorCamera.lookAt(0, 1.2, 0);
  orbit = new OrbitControls(directorCamera, renderer.domElement);
  orbit.target.set(0, 1.2, 0);
  orbit.enableDamping = true;
  orbit.addEventListener("start", () => (orbiting = true));
  orbit.addEventListener("end", handleOrbitEnd);

  transform = new TransformControls(directorCamera, renderer.domElement);
  transform.setMode(props.transformMode);
  transform.setSize(0.72);
  transformHelper = transform.getHelper();
  scene.add(transformHelper);
  transform.addEventListener("mouseDown", () => {
    transforming = true;
    if (orbit) orbit.enabled = false;
  });
  transform.addEventListener("objectChange", syncSelectedFromObject);
  transform.addEventListener("mouseUp", () => {
    transforming = false;
    if (orbit) orbit.enabled = true;
    syncSelectedFromObject();
    emit("commit");
  });

  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
  const key = new THREE.DirectionalLight(0xffffff, 3.2);
  key.position.set(6, 10, 7);
  key.castShadow = true;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8ec5ff, 1.2);
  fill.position.set(-6, 4, -4);
  scene.add(fill);

  grid = new THREE.GridHelper(40, 40, 0x4b5563, 0x263241);
  scene.add(grid);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.18 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  syncObjects();
  syncBackground();
  syncCameras();
  syncActiveView();
  resize();
  renderer.setAnimationLoop(render);
}

function resize() {
  if (!renderer || !hostRef.value) return;
  const width = Math.max(1, hostRef.value.clientWidth);
  const height = Math.max(1, hostRef.value.clientHeight);
  renderer.setSize(width, height, false);
  directorCamera.aspect = width / height;
  directorCamera.updateProjectionMatrix();
  shotCamera.aspect = width / height;
  shotCamera.updateProjectionMatrix();
}

function render() {
  if (!renderer) return;
  orbit?.update();
  if (grid) grid.visible = props.data.mode === "director" && (props.data.scene.backgroundMode === "panorama" || !flatBackground);
  const camera = props.data.mode === "camera" ? shotCamera : directorCamera;
  updateBackgroundTransform(camera);
  renderer.render(scene, camera);
}

function objectSignature(item: DirectorStagePlacedItem) {
  return item.role === "actor" ? `mannequin:${item.mannequinType || "neutral"}` : `primitive:${item.primitiveType || "box"}`;
}

function syncObjects() {
  const currentIds = new Set(props.data.items.map((item) => item.itemId));
  for (const [id, object] of objects) {
    if (currentIds.has(id)) continue;
    if (transform?.object === object) transform.detach();
    scene.remove(object);
    disposeDirectorObject(object);
    objects.delete(id);
  }
  props.data.items.forEach((item) => {
    let object = objects.get(item.itemId);
    if (!object || object.userData.modelSignature !== objectSignature(item)) {
      if (object) {
        scene.remove(object);
        disposeDirectorObject(object);
      }
      object = item.role === "actor" ? createMannequin(item) : createPrimitive(item);
      objects.set(item.itemId, object);
      scene.add(object);
    } else {
      updateDirectorObject(object, item);
    }
  });
  attachTransform();
}

function attachTransform() {
  if (!transform) return;
  const object = objects.get(props.selectedItemId);
  if (object) transform.attach(object);
  else transform.detach();
}

function syncSelectedFromObject() {
  const item = props.data.items.find((entry) => entry.itemId === props.selectedItemId);
  const object = objects.get(props.selectedItemId);
  if (!item || !object) return;
  item.position = { x: round(object.position.x), y: round(object.position.y), z: round(object.position.z) };
  item.rotation = {
    x: round(THREE.MathUtils.radToDeg(object.rotation.x)),
    y: round(THREE.MathUtils.radToDeg(object.rotation.y)),
    z: round(THREE.MathUtils.radToDeg(object.rotation.z)),
  };
  item.scale3d = { x: round(object.scale.x), y: round(object.scale.y), z: round(object.scale.z) };
  emit("change");
}

function handlePointerDown(event: PointerEvent) {
  pointerDownAt = { x: event.clientX, y: event.clientY };
}

function handleCanvasClick(event: MouseEvent) {
  if (!renderer || transforming || orbiting) {
    orbiting = false;
    return;
  }
  if (Math.hypot(event.clientX - pointerDownAt.x, event.clientY - pointerDownAt.y) > 4) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, props.data.mode === "camera" ? shotCamera : directorCamera);
  const hits = raycaster.intersectObjects([...objects.values()], true);
  const itemId = hits.map((hit) => findItemId(hit.object)).find(Boolean) || "";
  emit("select", itemId);
}

function findItemId(object: THREE.Object3D | null): string {
  let current = object;
  while (current) {
    if (current.userData.itemId) return current.userData.itemId;
    current = current.parent;
  }
  return "";
}

function syncActiveView() {
  if (!renderer || !orbit || !transform) return;
  syncShotCamera(activeCameraData.value);
  const camera = props.data.mode === "camera" ? shotCamera : directorCamera;
  transform.camera = camera;
  orbit.object = camera;
  orbit.target.copy(props.data.mode === "camera" ? vector(activeCameraData.value?.target) : orbit.target);
  orbit.update();
  cameraHelpers.forEach((helper) => (helper.visible = props.data.mode === "director"));
}

function syncShotCamera(camera?: DirectorStageCamera) {
  if (!camera) return;
  shotCamera.position.copy(vector(camera.position));
  shotCamera.fov = camera.fov;
  shotCamera.lookAt(vector(camera.target));
  shotCamera.updateProjectionMatrix();
}

function syncCameras() {
  cameraHelpers.forEach((helper) => {
    scene.remove(helper);
    helper.dispose();
  });
  cameraHelpers.clear();
  props.data.cameras.forEach((camera) => {
    const previewCamera = new THREE.PerspectiveCamera(camera.fov, 16 / 9, 0.05, 20);
    previewCamera.position.copy(vector(camera.position));
    previewCamera.lookAt(vector(camera.target));
    previewCamera.updateProjectionMatrix();
    const helper = new THREE.CameraHelper(previewCamera);
    helper.visible = props.data.mode === "director";
    scene.add(helper);
    cameraHelpers.set(camera.id, helper);
  });
  syncActiveView();
}

function handleOrbitEnd() {
  orbiting = false;
  if (props.data.mode !== "camera" || !orbit || !activeCameraData.value) return;
  const camera = activeCameraData.value;
  camera.position = vecFromThree(shotCamera.position);
  camera.target = vecFromThree(orbit.target);
  emit("commit");
}

function syncBackground() {
  if (!renderer) return;
  scene.background = new THREE.Color(props.data.scene.skyColor || "#111827");
  const media = normalizeMediaRef(props.data.scene.background?.media ?? props.data.scene.background, "image");
  const url = media ? getMediaOriginalUrl(media) : props.data.scene.background?.image || "";
  const nextKey = `${props.data.scene.backgroundMode}:${url}`;
  if (nextKey !== backgroundKey) {
    backgroundKey = nextKey;
    clearBackground();
    if (url) {
      new THREE.TextureLoader().load(
        url,
        (texture) => {
          if (nextKey !== backgroundKey) {
            texture.dispose();
            return;
          }
          texture.colorSpace = THREE.SRGBColorSpace;
          backgroundTexture = texture;
          backgroundImageAspect = texture.image?.width && texture.image?.height ? texture.image.width / texture.image.height : 16 / 9;
          if (props.data.scene.backgroundMode === "panorama") {
            const geometry = new THREE.SphereGeometry(props.data.scene.panoramaRadius, 48, 32);
            panoramaBackground = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide }));
            scene.add(panoramaBackground);
          } else {
            flatBackground = new THREE.Mesh(
              new THREE.PlaneGeometry(1, 1),
              new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, depthWrite: false, depthTest: false }),
            );
            flatBackground.frustumCulled = false;
            flatBackground.renderOrder = -1000;
            scene.add(flatBackground);
          }
          updateBackgroundTransform();
        },
        undefined,
        () => {
          webglError.value = "场景图片加载失败";
        },
      );
    }
  }
  updateBackgroundTransform();
}

function updateBackgroundTransform(camera: THREE.PerspectiveCamera = props.data.mode === "camera" ? shotCamera : directorCamera) {
  if (flatBackground) {
    const distance = Math.min(camera.far - 1, 80);
    const frameHeight = 2 * distance * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    const frameWidth = frameHeight * camera.aspect;
    const scale = props.data.scene.backgroundScale || 1;
    const fit = props.data.scene.backgroundFit || "cover";
    let width = frameWidth;
    let height = frameHeight;
    if (fit === "cover") {
      if (backgroundImageAspect > camera.aspect) {
        width = frameHeight * backgroundImageAspect;
      } else {
        height = frameWidth / backgroundImageAspect;
      }
    } else if (backgroundImageAspect > camera.aspect) {
      height = frameWidth / backgroundImageAspect;
    } else {
      width = frameHeight * backgroundImageAspect;
    }
    const direction = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
    flatBackground.position
      .copy(camera.position)
      .addScaledVector(direction, distance)
      .addScaledVector(right, frameWidth * ((props.data.scene.backgroundOffsetX || 0) / 100))
      .addScaledVector(up, frameHeight * ((props.data.scene.backgroundOffsetY || 0) / 100));
    flatBackground.quaternion.copy(camera.quaternion);
    flatBackground.scale.set(width * scale, height * scale, 1);
  }
  if (panoramaBackground) {
    panoramaBackground.rotation.y = THREE.MathUtils.degToRad(props.data.scene.panoramaRotation || 0);
    panoramaBackground.scale.setScalar((props.data.scene.panoramaRadius || 30) / 30);
  }
}

function clearBackground() {
  for (const value of [flatBackground, panoramaBackground]) {
    if (!value) continue;
    scene.remove(value);
    value.geometry.dispose();
    const currentMaterial = value.material;
    (Array.isArray(currentMaterial) ? currentMaterial : [currentMaterial]).forEach((entry) => entry.dispose());
  }
  flatBackground = null;
  panoramaBackground = null;
  backgroundTexture?.dispose();
  backgroundTexture = null;
  backgroundImageAspect = 16 / 9;
}

function fitView() {
  directorCamera.position.set(6, 4.5, 8);
  orbit?.target.set(0, 1.2, 0);
  orbit?.update();
}

function getDirectorCameraState() {
  return {
    position: vecFromThree(directorCamera.position),
    target: orbit ? vecFromThree(orbit.target) : { x: 0, y: 1.2, z: 0 },
    fov: directorCamera.fov,
  };
}

async function capture(): Promise<string> {
  if (!renderer) throw new Error("3D视口尚未初始化");
  syncShotCamera(activeCameraData.value);
  const width = 1280;
  const height = 720;
  const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
  target.texture.colorSpace = THREE.SRGBColorSpace;
  const pixels = new Uint8Array(width * height * 4);
  const previousTarget = renderer.getRenderTarget();
  const previousAspect = shotCamera.aspect;
  const hidden = [grid, transformHelper, ...cameraHelpers.values()].filter(Boolean) as THREE.Object3D[];
  const visibility = hidden.map((item) => item.visible);
  hidden.forEach((item) => (item.visible = false));
  shotCamera.aspect = width / height;
  shotCamera.updateProjectionMatrix();
  updateBackgroundTransform(shotCamera);
  renderer.setRenderTarget(target);
  renderer.render(scene, shotCamera);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  renderer.setRenderTarget(previousTarget);
  shotCamera.aspect = previousAspect;
  shotCamera.updateProjectionMatrix();
  hidden.forEach((item, index) => (item.visible = visibility[index]));
  target.dispose();

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("无法创建截图画布");
  const flipped = new Uint8ClampedArray(pixels.length);
  const rowLength = width * 4;
  for (let y = 0; y < height; y++) {
    flipped.set(pixels.subarray(y * rowLength, (y + 1) * rowLength), (height - y - 1) * rowLength);
  }
  context.putImageData(new ImageData(flipped, width, height), 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

function dispose() {
  resizeObserver?.disconnect();
  resizeObserver = null;
  renderer?.setAnimationLoop(null);
  renderer?.domElement.removeEventListener("pointerdown", handlePointerDown);
  transform?.detach();
  transform?.dispose();
  orbit?.dispose();
  clearBackground();
  cameraHelpers.forEach((helper) => {
    scene.remove(helper);
    helper.dispose();
  });
  cameraHelpers.clear();
  objects.forEach((object) => {
    scene.remove(object);
    disposeDirectorObject(object);
  });
  objects.clear();
  scene.traverse((object) => {
    const current = object as THREE.Mesh;
    current.geometry?.dispose();
    const materials = Array.isArray(current.material) ? current.material : current.material ? [current.material] : [];
    materials.forEach((entry) => entry.dispose());
  });
  renderer?.dispose();
  renderer?.forceContextLoss();
  renderer?.domElement.remove();
  renderer = null;
}

function vector(value?: DirectorVec3) {
  return new THREE.Vector3(value?.x ?? 0, value?.y ?? 0, value?.z ?? 0);
}

function vecFromThree(value: THREE.Vector3): DirectorVec3 {
  return { x: round(value.x), y: round(value.y), z: round(value.z) };
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}

defineExpose({ capture, fitView, getDirectorCameraState });
</script>

<style scoped>
.directorViewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  background: #111827;
}

.directorViewport :deep(.directorViewportCanvas) {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}

.webglError {
  position: absolute;
  z-index: 3;
  inset: 0;
  display: grid;
  place-items: center;
  color: #fecaca;
  background: #111827;
}
</style>
