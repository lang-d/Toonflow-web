<template>
  <figure class="axisMapDiagram">
    <figcaption>
      <span>{{ map.title }}</span>
      <small v-if="unresolvedAxis">轴线：{{ unresolvedAxis.label }}（端点未声明，未绘制）</small>
    </figcaption>
    <svg :viewBox="viewBox" preserveAspectRatio="xMidYMid meet" role="img" :aria-label="map.title">
      <defs>
        <marker :id="markerId" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse">
          <path d="M 0 0 L 8 4 L 0 8 z" class="cameraArrow" />
        </marker>
      </defs>

      <line
        v-if="axisEndpoints"
        class="axisLine"
        :x1="axisEndpoints.from.x"
        :y1="axisEndpoints.from.y"
        :x2="axisEndpoints.to.x"
        :y2="axisEndpoints.to.y" />

      <g v-for="camera in map.cameras" :key="camera.id" class="camera">
        <line :x1="camera.x" :y1="camera.y" :x2="nodeById.get(camera.target)!.x" :y2="nodeById.get(camera.target)!.y" :marker-end="`url(#${markerId})`" />
        <circle :cx="camera.x" :cy="camera.y" r="3.5" />
        <text :x="camera.x" :y="camera.y + 0.9" text-anchor="middle">{{ cameraBadge(camera.id) }}</text>
      </g>

      <template v-for="node in map.nodes" :key="`${node.id}-label`">
        <line
          v-if="nodeLabel(node.id)?.leader"
          class="labelLeader"
          :x1="nodeLabel(node.id)!.leader!.x1"
          :y1="nodeLabel(node.id)!.leader!.y1"
          :x2="nodeLabel(node.id)!.leader!.x2"
          :y2="nodeLabel(node.id)!.leader!.y2" />
      </template>

      <g v-for="node in map.nodes" :key="node.id" :class="['node', node.kind]">
        <circle v-if="node.kind === 'person'" :cx="node.x" :cy="node.y" r="3.8" />
        <rect v-else :x="node.x - nodeWidth(node) / 2" :y="node.y - nodeHeight(node) / 2" :width="nodeWidth(node)" :height="nodeHeight(node)" rx="1.8" />
      </g>

      <text v-if="axisLabelLayout" class="axisLabel" :x="axisLabelLayout.x" :y="axisLabelLayout.y" :text-anchor="axisLabelLayout.anchor">
        <tspan v-for="(line, index) in axisLabelLayout.lines" :key="index" :x="axisLabelLayout.x" :dy="index === 0 ? 0 : lineHeight">{{ line }}</tspan>
      </text>

      <text
        v-for="node in map.nodes"
        :key="`${node.id}-text`"
        class="nodeLabel"
        :x="nodeLabel(node.id)!.x"
        :y="nodeLabel(node.id)!.y"
        :text-anchor="nodeLabel(node.id)!.anchor">
        <tspan v-for="(line, index) in nodeLabel(node.id)!.lines" :key="index" :x="nodeLabel(node.id)!.x" :dy="index === 0 ? 0 : lineHeight">{{ line }}</tspan>
      </text>
    </svg>
  </figure>
</template>

<script setup lang="ts">
import type { AxisMap, AxisMapNode } from "../utils/axisMap";

type LabelAnchor = "start" | "middle" | "end";
type Direction = "top" | "right" | "bottom" | "left";

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface LabelLayout {
  x: number;
  y: number;
  anchor: LabelAnchor;
  lines: string[];
  box: Rect;
  leader?: { x1: number; y1: number; x2: number; y2: number };
}

const props = defineProps<{ map: AxisMap }>();
const instance = getCurrentInstance();
const markerId = `axis-map-arrow-${instance?.uid ?? Math.random().toString(36).slice(2)}`;
const fontSize = 3.1;
const lineHeight = 3.8;
const nodeById = computed(() => new Map(props.map.nodes.map((node) => [node.id, node])));
const axisEndpoints = computed(() => {
  if (!props.map.axis?.resolved) return null;
  const from = nodeById.value.get(props.map.axis.from);
  const to = nodeById.value.get(props.map.axis.to);
  return from && to ? { from, to } : null;
});
const unresolvedAxis = computed(() => (props.map.axis && !props.map.axis.resolved ? props.map.axis : null));

const nodeRects = computed(() => props.map.nodes.map(nodeRect));
const cameraRects = computed(() => props.map.cameras.map((camera) => circleRect(camera.x, camera.y, 3.5)));
const layout = computed(() => {
  const blocked = [...nodeRects.value, ...cameraRects.value];
  const labels: Record<string, LabelLayout> = {};
  const placed: Rect[] = [];

  for (const node of props.map.nodes) {
    const placement = placeLabel(node.label, nodeRect(node), blocked, placed);
    labels[node.id] = placement;
    placed.push(placement.box);
  }

  let axisLabel: LabelLayout | null = null;
  const endpoints = axisEndpoints.value;
  if (endpoints && props.map.axis) {
    const midpoint = {
      left: (endpoints.from.x + endpoints.to.x) / 2,
      right: (endpoints.from.x + endpoints.to.x) / 2,
      top: (endpoints.from.y + endpoints.to.y) / 2,
      bottom: (endpoints.from.y + endpoints.to.y) / 2,
    };
    axisLabel = placeLabel(props.map.axis.label, midpoint, blocked, placed);
  }

  const bounds = [...blocked, ...placed, ...(axisLabel ? [axisLabel.box] : [])].reduce(includeRect, emptyRect());
  const width = Math.max(bounds.right - bounds.left, 36);
  const height = Math.max(bounds.bottom - bounds.top, 36);
  const padding = Math.max(7, Math.min(14, Math.max(width, height) * 0.16));

  return {
    labels,
    axisLabel,
    viewBox: `${round(bounds.left - padding)} ${round(bounds.top - padding)} ${round(width + padding * 2)} ${round(height + padding * 2)}`,
  };
});

const viewBox = computed(() => layout.value.viewBox);
const axisLabelLayout = computed(() => layout.value.axisLabel);

function nodeLabel(id: string) {
  return layout.value.labels[id];
}

function nodeWidth(node: AxisMapNode) {
  return node.w ?? 16;
}

function nodeHeight(node: AxisMapNode) {
  return node.h ?? 8;
}

function nodeRect(node: AxisMapNode): Rect {
  if (node.kind === "person") return circleRect(node.x, node.y, 3.8);
  const halfWidth = nodeWidth(node) / 2;
  const halfHeight = nodeHeight(node) / 2;
  return { left: node.x - halfWidth, right: node.x + halfWidth, top: node.y - halfHeight, bottom: node.y + halfHeight };
}

function circleRect(x: number, y: number, radius: number): Rect {
  return { left: x - radius, right: x + radius, top: y - radius, bottom: y + radius };
}

function placeLabel(label: string, target: Rect, blocked: Rect[], placed: Rect[]) {
  const lines = wrapLabel(label);
  const width = Math.max(...lines.map((line) => labelWidth(line))) + 1.6;
  const height = lines.length * lineHeight + 1.2;
  const candidates = labelCandidates(target, width, height);
  let fallback = candidates[0];
  let lowestOverlap = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    const overlap = [...blocked, ...placed].reduce((total, item) => total + overlapArea(candidate.box, item), 0);
    if (overlap === 0) return { ...candidate, lines };
    if (overlap < lowestOverlap) {
      fallback = candidate;
      lowestOverlap = overlap;
    }
  }
  return { ...fallback, lines };
}

function labelCandidates(target: Rect, width: number, height: number): LabelLayout[] {
  const candidates: LabelLayout[] = [];
  const directions: Direction[] = ["top", "right", "bottom", "left"];
  const centerX = (target.left + target.right) / 2;
  const centerY = (target.top + target.bottom) / 2;

  for (const distance of [2.8, 7, 12, 17]) {
    for (const direction of directions) {
      let box: Rect;
      let anchor: LabelAnchor;
      if (direction === "top") {
        box = { left: centerX - width / 2, right: centerX + width / 2, top: target.top - distance - height, bottom: target.top - distance };
        anchor = "middle";
      } else if (direction === "right") {
        box = { left: target.right + distance, right: target.right + distance + width, top: centerY - height / 2, bottom: centerY + height / 2 };
        anchor = "start";
      } else if (direction === "bottom") {
        box = { left: centerX - width / 2, right: centerX + width / 2, top: target.bottom + distance, bottom: target.bottom + distance + height };
        anchor = "middle";
      } else {
        box = { left: target.left - distance - width, right: target.left - distance, top: centerY - height / 2, bottom: centerY + height / 2 };
        anchor = "end";
      }

      const x = anchor === "start" ? box.left : anchor === "end" ? box.right : centerX;
      const y = box.top + fontSize;
      const offset = distance > 2.8 || direction === "right" || direction === "left";
      candidates.push({
        x,
        y,
        anchor,
        lines: [],
        box,
        leader: offset ? { x1: centerX, y1: centerY, x2: nearestPoint(box, centerX, centerY).x, y2: nearestPoint(box, centerX, centerY).y } : undefined,
      });
    }
  }
  return candidates;
}

function wrapLabel(label: string) {
  const maxLength = 9;
  const lines: string[] = [];
  for (let index = 0; index < label.length; index += maxLength) lines.push(label.slice(index, index + maxLength));
  return lines.length ? lines : [""];
}

function labelWidth(line: string) {
  return [...line].reduce((width, character) => width + (character.charCodeAt(0) > 255 ? fontSize : fontSize * 0.62), 0);
}

function overlapArea(left: Rect, right: Rect) {
  const width = Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left));
  const height = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  return width * height;
}

function nearestPoint(rect: Rect, x: number, y: number) {
  return { x: Math.max(rect.left, Math.min(x, rect.right)), y: Math.max(rect.top, Math.min(y, rect.bottom)) };
}

function emptyRect(): Rect {
  return { left: Number.POSITIVE_INFINITY, right: Number.NEGATIVE_INFINITY, top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY };
}

function includeRect(bounds: Rect, rect: Rect): Rect {
  return {
    left: Math.min(bounds.left, rect.left),
    right: Math.max(bounds.right, rect.right),
    top: Math.min(bounds.top, rect.top),
    bottom: Math.max(bounds.bottom, rect.bottom),
  };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}

function cameraBadge(id: string) {
  return id.length > 3 ? id.slice(0, 3) : id;
}
</script>

<style lang="scss" scoped>
.axisMapDiagram {
  width: min(100%, 780px);
  margin: 16px auto;
  padding: 12px;
  border: 1px solid var(--td-border-level-2-color, #e7e7e7);
  background: var(--td-bg-color-container, #fff);
  box-sizing: border-box;

  figcaption {
    margin-bottom: 8px;
    color: var(--td-text-color-primary, #222);
    font-size: 13px;
    font-weight: 600;

    small {
      display: block;
      margin-top: 4px;
      color: var(--td-text-color-secondary, #666);
      font-size: 12px;
      font-weight: 400;
      line-height: 1.5;
    }
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    min-width: 0;
    margin: 0 auto;
  }
}

.axisLine {
  stroke: var(--td-text-color-secondary, #666);
  stroke-width: 0.8;
  stroke-dasharray: 3 2;
}

.axisLabel,
.nodeLabel {
  fill: var(--td-text-color-primary, #222);
  font-size: 3.1px;
  font-weight: 500;
}

.axisLabel {
  fill: var(--td-text-color-secondary, #666);
  font-size: 2.9px;
}

.labelLeader {
  stroke: var(--td-border-level-2-color, #a6a6a6);
  stroke-width: 0.45;
  stroke-dasharray: 1.1 1.1;
}

.camera {
  fill: var(--td-text-color-secondary, #666);
  stroke: var(--td-text-color-secondary, #666);
  stroke-width: 0.65;

  line {
    stroke-dasharray: 1.8 1.5;
  }

  circle {
    fill: var(--td-bg-color-container, #fff);
  }

  text {
    stroke: none;
    fill: var(--td-text-color-secondary, #666);
    font-size: 2.35px;
    font-weight: 600;
  }
}

.cameraArrow {
  fill: var(--td-text-color-secondary, #666);
}

.node {
  fill: var(--td-bg-color-container, #fff);
  stroke: var(--td-brand-color, #0052d9);
  stroke-width: 0.8;

  &.person circle {
    fill: var(--td-brand-color, #0052d9);
  }

  &.object rect,
  &.anchor rect {
    fill: var(--td-bg-color-secondarycontainer, #f5f5f5);
  }
}
</style>
