import * as THREE from "three";
import type { DirectorJointName, DirectorStagePlacedItem, DirectorVec3 } from "../../../utils/editImageType";
import { getPoseJoints } from "./posePresets";

type JointMap = Partial<Record<DirectorJointName, THREE.Group>>;

function material(color: string) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.05 });
}

function mesh(geometry: THREE.BufferGeometry, color: string) {
  const value = new THREE.Mesh(geometry, material(color));
  value.castShadow = true;
  value.receiveShadow = true;
  return value;
}

function limb(length: number, radius: number, color: string) {
  const value = mesh(new THREE.CapsuleGeometry(radius, Math.max(0.05, length - radius * 2), 6, 12), color);
  value.position.y = -length / 2;
  return value;
}

function joint(parent: THREE.Object3D, name: DirectorJointName, position: [number, number, number], joints: JointMap) {
  const value = new THREE.Group();
  value.name = name;
  value.position.set(...position);
  parent.add(value);
  joints[name] = value;
  return value;
}

function bodyScale(type: DirectorStagePlacedItem["mannequinType"]) {
  if (type === "male") return { width: 1.12, height: 1.04, head: 1 };
  if (type === "female") return { width: 0.88, height: 0.98, head: 0.96 };
  if (type === "youth") return { width: 0.8, height: 0.78, head: 1.12 };
  return { width: 1, height: 1, head: 1 };
}

export function createMannequin(item: DirectorStagePlacedItem) {
  const root = new THREE.Group();
  root.userData.itemId = item.itemId;
  root.userData.modelSignature = `mannequin:${item.mannequinType || "neutral"}`;
  const joints: JointMap = {};
  root.userData.joints = joints;
  const color = item.color || "#5585f7";
  const proportions = bodyScale(item.mannequinType);
  const body = new THREE.Group();
  body.scale.set(proportions.width, proportions.height, proportions.width);
  root.add(body);

  const pelvis = mesh(new THREE.SphereGeometry(0.32, 18, 12), color);
  pelvis.scale.set(1.12, 0.72, 0.72);
  pelvis.position.y = 1.05;
  body.add(pelvis);

  const spine = joint(body, "spine", [0, 1.14, 0], joints);
  const torso = mesh(new THREE.CapsuleGeometry(0.38, 0.65, 8, 16), color);
  torso.position.y = 0.48;
  torso.scale.set(1.08, 1, 0.68);
  spine.add(torso);

  const neck = joint(spine, "neck", [0, 1.03, 0], joints);
  neck.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.2, 12), color));
  const head = joint(neck, "head", [0, 0.2, 0], joints);
  const headMesh = mesh(new THREE.SphereGeometry(0.28 * proportions.head, 20, 16), color);
  headMesh.position.y = 0.25;
  headMesh.scale.set(0.88, 1.12, 0.92);
  head.add(headMesh);

  const leftShoulder = joint(spine, "leftShoulder", [-0.48, 0.82, 0], joints);
  leftShoulder.add(limb(0.68, 0.12, color));
  const leftElbow = joint(leftShoulder, "leftElbow", [0, -0.67, 0], joints);
  leftElbow.add(limb(0.62, 0.1, color));
  const rightShoulder = joint(spine, "rightShoulder", [0.48, 0.82, 0], joints);
  rightShoulder.add(limb(0.68, 0.12, color));
  const rightElbow = joint(rightShoulder, "rightElbow", [0, -0.67, 0], joints);
  rightElbow.add(limb(0.62, 0.1, color));

  const leftHip = joint(body, "leftHip", [-0.2, 1.02, 0], joints);
  leftHip.add(limb(0.82, 0.15, color));
  const leftKnee = joint(leftHip, "leftKnee", [0, -0.8, 0], joints);
  leftKnee.add(limb(0.78, 0.13, color));
  const leftFoot = mesh(new THREE.BoxGeometry(0.28, 0.16, 0.48), color);
  leftFoot.position.set(0, -0.79, 0.1);
  leftKnee.add(leftFoot);

  const rightHip = joint(body, "rightHip", [0.2, 1.02, 0], joints);
  rightHip.add(limb(0.82, 0.15, color));
  const rightKnee = joint(rightHip, "rightKnee", [0, -0.8, 0], joints);
  rightKnee.add(limb(0.78, 0.13, color));
  const rightFoot = mesh(new THREE.BoxGeometry(0.28, 0.16, 0.48), color);
  rightFoot.position.set(0, -0.79, 0.1);
  rightKnee.add(rightFoot);

  root.traverse((child) => {
    child.userData.itemId = item.itemId;
  });
  updateDirectorObject(root, item);
  return root;
}

export function createPrimitive(item: DirectorStagePlacedItem) {
  const type = item.primitiveType || "box";
  const geometry =
    type === "sphere"
      ? new THREE.SphereGeometry(0.7, 24, 18)
      : type === "cylinder"
        ? new THREE.CylinderGeometry(0.58, 0.58, 1.4, 24)
        : type === "cone"
          ? new THREE.ConeGeometry(0.65, 1.5, 24)
          : type === "capsule"
            ? new THREE.CapsuleGeometry(0.45, 0.8, 8, 18)
            : new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const value = mesh(geometry, item.color || "#10b981");
  const root = new THREE.Group();
  root.userData.itemId = item.itemId;
  root.userData.modelSignature = `primitive:${type}`;
  value.position.y = type === "sphere" ? 0.7 : 0.75;
  root.add(value);
  root.traverse((child) => (child.userData.itemId = item.itemId));
  updateDirectorObject(root, item);
  return root;
}

function applyRotation(target: THREE.Object3D | undefined, value?: DirectorVec3) {
  if (!target) return;
  const rotation = value || { x: 0, y: 0, z: 0 };
  target.rotation.set(THREE.MathUtils.degToRad(rotation.x), THREE.MathUtils.degToRad(rotation.y), THREE.MathUtils.degToRad(rotation.z));
}

export function updateDirectorObject(root: THREE.Object3D, item: DirectorStagePlacedItem) {
  root.visible = item.visible;
  root.position.set(item.position.x, item.position.y, item.position.z);
  root.rotation.set(
    THREE.MathUtils.degToRad(item.rotation.x),
    THREE.MathUtils.degToRad(item.rotation.y),
    THREE.MathUtils.degToRad(item.rotation.z),
  );
  root.scale.set(item.scale3d.x, item.scale3d.y, item.scale3d.z);
  const color = new THREE.Color(item.color || (item.role === "actor" ? "#5585f7" : "#10b981"));
  root.traverse((child) => {
    const materialValue = (child as THREE.Mesh).material;
    if (materialValue instanceof THREE.MeshStandardMaterial) materialValue.color.copy(color);
  });
  const joints = root.userData.joints as JointMap | undefined;
  if (joints) {
    const pose = getPoseJoints(item.poseId);
    for (const [name, target] of Object.entries(joints)) {
      applyRotation(target, item.joints?.[name as DirectorJointName] ?? pose[name as DirectorJointName]);
    }
  }
}

export function disposeDirectorObject(root: THREE.Object3D) {
  root.traverse((child) => {
    const current = child as THREE.Mesh;
    current.geometry?.dispose();
    const materials = Array.isArray(current.material) ? current.material : current.material ? [current.material] : [];
    materials.forEach((item) => item.dispose());
  });
}

