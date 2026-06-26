<template>
  <t-dialog
    v-model:visible="visible"
    attach="body"
    width="min(1120px, 96vw)"
    :header="$t('workbench.production.editImage.annotateImage')"
    :footer="false"
    placement="center"
    destroy-on-close
    @opened="loadImage"
    @closed="resetState">
    <div class="annotator">
      <div class="toolbar" @mousedown.stop @click.stop>
        <t-radio-group v-model="tool" variant="default-filled" size="small">
          <t-radio-button value="rect">{{ $t("workbench.production.editImage.annotateRect") }}</t-radio-button>
          <t-radio-button value="ellipse">{{ $t("workbench.production.editImage.annotateCircle") }}</t-radio-button>
          <t-radio-button value="pen">{{ $t("workbench.production.editImage.annotatePen") }}</t-radio-button>
          <t-radio-button value="arrow">{{ $t("workbench.production.editImage.annotateArrow") }}</t-radio-button>
          <t-radio-button value="text">{{ $t("workbench.production.editImage.annotateText") }}</t-radio-button>
        </t-radio-group>
        <input v-model="color" class="colorPicker" type="color" />
        <t-input-number v-model="lineWidth" class="lineWidth" :min="2" :max="24" size="small" />
        <t-input
          v-if="tool === 'text'"
          v-model="textValue"
          class="textInput"
          size="small"
          :placeholder="$t('workbench.production.editImage.annotateTextPlaceholder')" />
      </div>

      <div class="canvasShell">
        <div v-if="loading" class="canvasPlaceholder">{{ $t("workbench.production.editImage.annotateLoading") }}</div>
        <div v-else-if="loadError" class="canvasPlaceholder error">{{ loadError }}</div>
        <canvas
          v-show="!loading && !loadError"
          ref="canvasRef"
          class="canvas"
          @pointerdown="handlePointerDown"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @pointerleave="handlePointerUp" />
      </div>

      <div class="actions">
        <t-button variant="outline" :disabled="!marks.length" @click="undo">{{ $t("workbench.production.editImage.annotateUndo") }}</t-button>
        <t-button variant="outline" :disabled="!redoMarks.length" @click="redo">{{ $t("workbench.production.editImage.annotateRedo") }}</t-button>
        <t-button variant="outline" :disabled="!marks.length" @click="clearMarks">
          {{ $t("workbench.production.editImage.annotateClear") }}
        </t-button>
        <t-button variant="outline" @click="visible = false">{{ $t("workbench.production.editImage.annotateCancel") }}</t-button>
        <t-button theme="primary" :disabled="loading || Boolean(loadError)" @click="save">
          {{ $t("workbench.production.editImage.annotateSave") }}
        </t-button>
      </div>
    </div>
  </t-dialog>
</template>

<script setup lang="ts">
type Tool = "rect" | "ellipse" | "pen" | "arrow" | "text";

type Point = { x: number; y: number };

type Mark =
  | { type: "rect" | "ellipse"; x: number; y: number; width: number; height: number; color: string; lineWidth: number }
  | { type: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string; lineWidth: number }
  | { type: "pen"; points: Point[]; color: string; lineWidth: number }
  | { type: "text"; x: number; y: number; text: string; color: string; fontSize: number };

const props = defineProps<{
  src: string;
}>();

const emit = defineEmits<{
  save: [base64Data: string];
}>();

const visible = defineModel<boolean>("visible", { default: false });

const canvasRef = ref<HTMLCanvasElement | null>(null);
const imageEl = ref<HTMLImageElement | null>(null);
const loading = ref(false);
const loadError = ref("");
const tool = ref<Tool>("rect");
const color = ref("#ff3b30");
const lineWidth = ref(6);
const textValue = ref("");
const marks = ref<Mark[]>([]);
const redoMarks = ref<Mark[]>([]);
const currentMark = ref<Mark | null>(null);
const drawing = ref(false);

watch(
  () => props.src,
  () => {
    if (visible.value) void loadImage();
  },
);

async function loadImage() {
  if (!props.src || !canvasRef.value) return;
  loading.value = true;
  loadError.value = "";
  try {
    const image = await loadCanvasImage(props.src);
    imageEl.value = image;
    const canvas = canvasRef.value;
    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth || image.width, image.naturalHeight || image.height));
    canvas.width = Math.max(1, Math.round((image.naturalWidth || image.width) * scale));
    canvas.height = Math.max(1, Math.round((image.naturalHeight || image.height) * scale));
    redraw();
  } catch (error: any) {
    loadError.value = error?.message || $t("workbench.production.editImage.annotateLoadFailed");
  } finally {
    loading.value = false;
  }
}

function loadCanvasImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error($t("workbench.production.editImage.annotateLoadFailed")));
    image.src = src;
  });
}

function resetState() {
  drawing.value = false;
  currentMark.value = null;
  marks.value = [];
  redoMarks.value = [];
  textValue.value = "";
  loadError.value = "";
}

function getCanvasPoint(event: PointerEvent): Point {
  const canvas = canvasRef.value!;
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvas.width,
    y: ((event.clientY - rect.top) / rect.height) * canvas.height,
  };
}

function handlePointerDown(event: PointerEvent) {
  if (!canvasRef.value || !imageEl.value || loadError.value) return;
  const point = getCanvasPoint(event);
  redoMarks.value = [];
  if (tool.value === "text") {
    const text = textValue.value.trim();
    if (!text) {
      window.$message.warning($t("workbench.production.editImage.annotateTextRequired"));
      return;
    }
    marks.value.push({ type: "text", x: point.x, y: point.y, text, color: color.value, fontSize: Math.max(24, lineWidth.value * 5) });
    redraw();
    return;
  }
  drawing.value = true;
  (event.currentTarget as HTMLCanvasElement).setPointerCapture(event.pointerId);
  if (tool.value === "rect" || tool.value === "ellipse") {
    currentMark.value = { type: tool.value, x: point.x, y: point.y, width: 0, height: 0, color: color.value, lineWidth: lineWidth.value };
  } else if (tool.value === "arrow") {
    currentMark.value = { type: "arrow", x1: point.x, y1: point.y, x2: point.x, y2: point.y, color: color.value, lineWidth: lineWidth.value };
  } else {
    currentMark.value = { type: "pen", points: [point], color: color.value, lineWidth: lineWidth.value };
  }
  redraw();
}

function handlePointerMove(event: PointerEvent) {
  if (!drawing.value || !currentMark.value || !canvasRef.value) return;
  const point = getCanvasPoint(event);
  const mark = currentMark.value;
  if (mark.type === "rect" || mark.type === "ellipse") {
    mark.width = point.x - mark.x;
    mark.height = point.y - mark.y;
  } else if (mark.type === "arrow") {
    mark.x2 = point.x;
    mark.y2 = point.y;
  } else if (mark.type === "pen") {
    mark.points.push(point);
  }
  redraw();
}

function handlePointerUp(event: PointerEvent) {
  if (!drawing.value || !currentMark.value) return;
  drawing.value = false;
  try {
    (event.currentTarget as HTMLCanvasElement).releasePointerCapture(event.pointerId);
  } catch {}
  if (!isTinyMark(currentMark.value)) {
    marks.value.push(cloneMark(currentMark.value));
  }
  currentMark.value = null;
  redraw();
}

function isTinyMark(mark: Mark) {
  if (mark.type === "rect" || mark.type === "ellipse") return Math.abs(mark.width) < 4 && Math.abs(mark.height) < 4;
  if (mark.type === "arrow") return Math.hypot(mark.x2 - mark.x1, mark.y2 - mark.y1) < 4;
  if (mark.type === "pen") return mark.points.length < 2;
  return false;
}

function cloneMark(mark: Mark): Mark {
  return mark.type === "pen" ? { ...mark, points: mark.points.map((point) => ({ ...point })) } : { ...mark };
}

function redraw() {
  const canvas = canvasRef.value;
  const image = imageEl.value;
  if (!canvas || !image) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  marks.value.forEach((mark) => drawMark(ctx, mark));
  if (currentMark.value) drawMark(ctx, currentMark.value);
}

function drawMark(ctx: CanvasRenderingContext2D, mark: Mark) {
  ctx.save();
  ctx.strokeStyle = mark.color;
  ctx.fillStyle = mark.color;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (mark.type === "rect") {
    ctx.lineWidth = mark.lineWidth;
    ctx.strokeRect(mark.x, mark.y, mark.width, mark.height);
  } else if (mark.type === "ellipse") {
    ctx.lineWidth = mark.lineWidth;
    ctx.beginPath();
    ctx.ellipse(mark.x + mark.width / 2, mark.y + mark.height / 2, Math.abs(mark.width / 2), Math.abs(mark.height / 2), 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (mark.type === "arrow") {
    drawArrow(ctx, mark);
  } else if (mark.type === "pen") {
    ctx.lineWidth = mark.lineWidth;
    ctx.beginPath();
    mark.points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.stroke();
  } else if (mark.type === "text") {
    ctx.font = `700 ${mark.fontSize}px sans-serif`;
    ctx.lineWidth = Math.max(3, mark.fontSize / 9);
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.strokeText(mark.text, mark.x, mark.y);
    ctx.fillStyle = mark.color;
    ctx.fillText(mark.text, mark.x, mark.y);
  }
  ctx.restore();
}

function drawArrow(ctx: CanvasRenderingContext2D, mark: Extract<Mark, { type: "arrow" }>) {
  const angle = Math.atan2(mark.y2 - mark.y1, mark.x2 - mark.x1);
  const headLength = Math.max(18, mark.lineWidth * 4);
  ctx.lineWidth = mark.lineWidth;
  ctx.beginPath();
  ctx.moveTo(mark.x1, mark.y1);
  ctx.lineTo(mark.x2, mark.y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(mark.x2, mark.y2);
  ctx.lineTo(mark.x2 - headLength * Math.cos(angle - Math.PI / 6), mark.y2 - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(mark.x2 - headLength * Math.cos(angle + Math.PI / 6), mark.y2 - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

function undo() {
  const mark = marks.value.pop();
  if (mark) redoMarks.value.push(mark);
  redraw();
}

function redo() {
  const mark = redoMarks.value.pop();
  if (mark) marks.value.push(mark);
  redraw();
}

function clearMarks() {
  redoMarks.value.push(...marks.value.splice(0));
  redraw();
}

function save() {
  const canvas = canvasRef.value;
  if (!canvas) return;
  try {
    emit("save", canvas.toDataURL("image/png"));
    visible.value = false;
  } catch {
    window.$message.error($t("workbench.production.editImage.annotateExportFailed"));
  }
}
</script>

<style scoped lang="scss">
.annotator {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar,
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar {
  flex-wrap: wrap;
}

.colorPicker {
  width: 34px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 4px;
  background: transparent;
}

.lineWidth {
  width: 86px;
}

.textInput {
  width: min(320px, 70vw);
}

.canvasShell {
  display: grid;
  min-height: 360px;
  max-height: calc(100vh - 240px);
  place-items: center;
  overflow: auto;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: 8px;
  background: var(--td-bg-color-page);
}

.canvas {
  max-width: 100%;
  max-height: calc(100vh - 260px);
  cursor: crosshair;
  background: #fff;
}

.canvasPlaceholder {
  color: var(--td-text-color-secondary);
}

.canvasPlaceholder.error {
  color: var(--td-error-color);
}

.actions {
  justify-content: flex-end;
}
</style>
