import type { DirectorJointName, DirectorJointState, DirectorVec3 } from "../../../utils/editImageType";

export interface DirectorPosePreset {
  id: string;
  label: string;
  joints: DirectorJointState;
}

const v = (x = 0, y = 0, z = 0): DirectorVec3 => ({ x, y, z });

export const DIRECTOR_JOINTS: Array<{ key: DirectorJointName; label: string }> = [
  { key: "head", label: "头部" },
  { key: "neck", label: "颈部" },
  { key: "spine", label: "躯干" },
  { key: "leftShoulder", label: "左肩" },
  { key: "rightShoulder", label: "右肩" },
  { key: "leftElbow", label: "左肘" },
  { key: "rightElbow", label: "右肘" },
  { key: "leftHip", label: "左髋" },
  { key: "rightHip", label: "右髋" },
  { key: "leftKnee", label: "左膝" },
  { key: "rightKnee", label: "右膝" },
];

export const DIRECTOR_POSES: DirectorPosePreset[] = [
  { id: "stand", label: "站立", joints: {} },
  { id: "tpose", label: "T型", joints: { leftShoulder: v(0, 0, 90), rightShoulder: v(0, 0, -90) } },
  {
    id: "walk",
    label: "行走",
    joints: { leftShoulder: v(28), rightShoulder: v(-28), leftHip: v(-25), rightHip: v(25), leftKnee: v(12), rightKnee: v(18) },
  },
  {
    id: "run",
    label: "跑步",
    joints: { spine: v(12), leftShoulder: v(55), rightShoulder: v(-55), leftElbow: v(-55), rightElbow: v(-55), leftHip: v(-42), rightHip: v(48), leftKnee: v(72), rightKnee: v(18) },
  },
  {
    id: "sit",
    label: "坐姿",
    joints: { leftHip: v(-82), rightHip: v(-82), leftKnee: v(88), rightKnee: v(88), spine: v(4) },
  },
  {
    id: "squat",
    label: "蹲下",
    joints: { leftHip: v(-65), rightHip: v(-65), leftKnee: v(105), rightKnee: v(105), spine: v(18) },
  },
  {
    id: "kneel",
    label: "单膝跪",
    joints: { leftHip: v(-20), rightHip: v(-72), leftKnee: v(82), rightKnee: v(118), spine: v(6) },
  },
  {
    id: "doubleKneel",
    label: "双膝跪",
    joints: { leftHip: v(-55), rightHip: v(-55), leftKnee: v(125), rightKnee: v(125), spine: v(6) },
  },
  {
    id: "handsWaist",
    label: "叉腰",
    joints: { leftShoulder: v(10, 0, 42), rightShoulder: v(10, 0, -42), leftElbow: v(-78), rightElbow: v(-78) },
  },
  {
    id: "armsFolded",
    label: "抱臂",
    joints: { leftShoulder: v(45, 18, 28), rightShoulder: v(45, -18, -28), leftElbow: v(-92), rightElbow: v(-92) },
  },
  {
    id: "thinking",
    label: "思考",
    joints: { head: v(0, 0, -8), rightShoulder: v(35, 0, -18), rightElbow: v(-112), leftShoulder: v(22, 0, 25), leftElbow: v(-78) },
  },
  { id: "wave", label: "招手", joints: { rightShoulder: v(0, 0, -138), rightElbow: v(-42), head: v(0, -10, 0) } },
  { id: "reach", label: "伸手", joints: { rightShoulder: v(-82, 0, -8), rightElbow: v(-8) } },
  {
    id: "hug",
    label: "拥抱",
    joints: { leftShoulder: v(-68, 18, 18), rightShoulder: v(-68, -18, -18), leftElbow: v(-38), rightElbow: v(-38) },
  },
  { id: "phone", label: "看手机", joints: { leftShoulder: v(-48, 0, 18), rightShoulder: v(-48, 0, -18), leftElbow: v(-82), rightElbow: v(-82), head: v(18) } },
];

export function getPoseJoints(id = "stand"): DirectorJointState {
  const preset = DIRECTOR_POSES.find((item) => item.id === id) ?? DIRECTOR_POSES[0];
  return Object.fromEntries(Object.entries(preset.joints).map(([key, value]) => [key, value ? { ...value } : value])) as DirectorJointState;
}

