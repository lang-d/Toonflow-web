export type AxisMapNodeKind = "person" | "object" | "anchor";

export interface AxisMapNode {
  id: string;
  kind: AxisMapNodeKind;
  label: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface AxisMapCamera {
  id: string;
  x: number;
  y: number;
  target: string;
}

export interface AxisMapAxis {
  from: string;
  to: string;
  label: string;
  resolved: boolean;
}

export interface AxisMap {
  v: 1;
  title: string;
  axis?: AxisMapAxis;
  nodes: AxisMapNode[];
  cameras: AxisMapCamera[];
}

export type DirectorPlanSegment =
  | { kind: "markdown"; content: string }
  | { kind: "axis-map"; map: AxisMap };

const AXIS_MAP_FENCE = /^```axis-map[\t ]*\r?\n([\s\S]*?)^```[\t ]*$/gm;
const NODE_KINDS = new Set<AxisMapNodeKind>(["person", "object", "anchor"]);

export function splitDirectorPlanMarkdown(markdown: string): DirectorPlanSegment[] {
  const source = typeof markdown === "string" ? markdown : "";
  const segments: DirectorPlanSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  const appendMarkdown = (content: string) => {
    if (!content) return;
    const previous = segments[segments.length - 1];
    if (previous?.kind === "markdown") {
      previous.content += content;
    } else {
      segments.push({ kind: "markdown", content });
    }
  };

  AXIS_MAP_FENCE.lastIndex = 0;
  while ((match = AXIS_MAP_FENCE.exec(source))) {
    appendMarkdown(source.slice(cursor, match.index));
    const map = parseAxisMap(match[1]);
    if (map) {
      segments.push({ kind: "axis-map", map });
    } else {
      appendMarkdown(match[0]);
    }
    cursor = AXIS_MAP_FENCE.lastIndex;
  }
  appendMarkdown(source.slice(cursor));

  return segments.length ? segments : [{ kind: "markdown", content: source }];
}

function parseAxisMap(source: string): AxisMap | null {
  let input: unknown;
  try {
    input = JSON.parse(source);
  } catch {
    return null;
  }
  if (!isRecord(input) || input.v !== 1) return null;

  const title = stringValue(input.title);
  if (!title || !Array.isArray(input.nodes) || !Array.isArray(input.cameras)) return null;

  const usedIds = new Set<string>();
  const nodes: AxisMapNode[] = [];
  for (const inputNode of input.nodes) {
    if (!isRecord(inputNode)) return null;
    const id = stringValue(inputNode.id);
    const label = stringValue(inputNode.label);
    const kind = inputNode.kind;
    const x = rangedNumber(inputNode.x);
    const y = rangedNumber(inputNode.y);
    if (!id || !label || typeof kind !== "string" || !NODE_KINDS.has(kind as AxisMapNodeKind) || x === null || y === null || usedIds.has(id)) return null;

    const node: AxisMapNode = { id, label, kind: kind as AxisMapNodeKind, x, y };
    if (node.kind !== "person" && (inputNode.w !== undefined || inputNode.h !== undefined)) {
      const w = sizeNumber(inputNode.w);
      const h = sizeNumber(inputNode.h);
      if (w === null || h === null) return null;
      node.w = w;
      node.h = h;
    }
    usedIds.add(id);
    nodes.push(node);
  }
  if (!nodes.length) return null;

  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  let axis: AxisMapAxis | undefined;
  if (input.axis !== undefined) {
    if (!isRecord(input.axis)) return null;
    const from = stringValue(input.axis.from);
    const to = stringValue(input.axis.to);
    const label = stringValue(input.axis.label);
    if (!from || !to || !label || from === to) return null;
    axis = { from, to, label, resolved: nodeById.has(from) && nodeById.has(to) };
  }

  const cameras: AxisMapCamera[] = [];
  for (const inputCamera of input.cameras) {
    if (!isRecord(inputCamera)) return null;
    const id = stringValue(inputCamera.id);
    const target = stringValue(inputCamera.target);
    const x = rangedNumber(inputCamera.x);
    const y = rangedNumber(inputCamera.y);
    if (!id || !target || x === null || y === null || usedIds.has(id) || !nodeById.has(target)) return null;
    usedIds.add(id);
    cameras.push({ id, x, y, target });
  }

  return { v: 1, title, axis, nodes, cameras };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function rangedNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100 ? value : null;
}

function sizeNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value <= 100 ? value : null;
}
