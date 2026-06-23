import type { Ref } from "vue";
import { onBeforeUnmount, onMounted, ref } from "vue";

interface FloatingPosition {
  x: number;
  y: number;
}

type CollapseSide = "left" | "right";

interface FloatingState extends FloatingPosition {
  collapsed?: boolean;
  side?: CollapseSide;
}

const EDGE_GAP = 12;
const SNAP_EDGE_DISTANCE = 18;

export function useFloatingPosition(elementRef: Ref<HTMLElement | null>, storageKey: string) {
  const position = ref<FloatingPosition>({ x: EDGE_GAP, y: EDGE_GAP });
  const collapsed = ref(false);
  const collapseSide = ref<CollapseSide>("right");
  const draggedRecently = ref(false);
  let dragStart: { pointerX: number; pointerY: number; x: number; y: number } | null = null;
  let activePointerId: number | null = null;
  let mouseDragging = false;
  let moved = false;

  const style = computed(() => ({
    left: `${position.value.x}px`,
    top: `${position.value.y}px`,
  }));

  const sideStyle = computed(() => {
    const top = Math.min(Math.max(EDGE_GAP, position.value.y), Math.max(EDGE_GAP, window.innerHeight - 92));
    return collapseSide.value === "left"
      ? { left: "0px", top: `${top}px` }
      : { right: "0px", top: `${top}px` };
  });

  function clamp(next: FloatingPosition) {
    const rect = elementRef.value?.getBoundingClientRect();
    const width = rect?.width || 220;
    const height = rect?.height || 72;
    return {
      x: Math.min(Math.max(EDGE_GAP, next.x), Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP)),
      y: Math.min(Math.max(EDGE_GAP, next.y), Math.max(EDGE_GAP, window.innerHeight - height - EDGE_GAP)),
    };
  }

  function persist() {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          ...position.value,
          collapsed: collapsed.value,
          side: collapseSide.value,
        }),
      );
    } catch {}
  }

  function restore() {
    let saved: FloatingState | null = null;
    try {
      const raw = localStorage.getItem(storageKey);
      saved = raw ? JSON.parse(raw) : null;
    } catch {}
    position.value = clamp(
      saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)
        ? saved
        : { x: window.innerWidth - 232, y: window.innerHeight - 92 },
    );
    collapsed.value = Boolean(saved?.collapsed);
    collapseSide.value = saved?.side === "left" ? "left" : "right";
    if (collapsed.value) {
      position.value = snapPositionToSide(position.value, collapseSide.value);
    }
  }

  function snapPositionToSide(next: FloatingPosition, side: CollapseSide) {
    const rect = elementRef.value?.getBoundingClientRect();
    const width = rect?.width || 220;
    const x = side === "left" ? EDGE_GAP : window.innerWidth - width - EDGE_GAP;
    return clamp({ x, y: next.y });
  }

  function collapse(side?: CollapseSide) {
    collapseSide.value = side || (position.value.x < window.innerWidth / 2 ? "left" : "right");
    position.value = snapPositionToSide(position.value, collapseSide.value);
    collapsed.value = true;
    persist();
  }

  function expand() {
    collapsed.value = false;
    position.value = snapPositionToSide(position.value, collapseSide.value);
    persist();
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragStart || activePointerId !== event.pointerId) return;
    const deltaX = event.clientX - dragStart.pointerX;
    const deltaY = event.clientY - dragStart.pointerY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) moved = true;
    position.value = clamp({ x: dragStart.x + deltaX, y: dragStart.y + deltaY });
  }

  function stopDragging(event: PointerEvent) {
    if (activePointerId !== event.pointerId) return;
    elementRef.value?.releasePointerCapture?.(event.pointerId);
    activePointerId = null;
    dragStart = null;
    finishDrag();
  }

  function finishDrag() {
    if (moved) {
      draggedRecently.value = true;
      const rect = elementRef.value?.getBoundingClientRect();
      const width = rect?.width || 220;
      if (position.value.x <= EDGE_GAP + SNAP_EDGE_DISTANCE) {
        collapse("left");
      } else if (position.value.x + width >= window.innerWidth - EDGE_GAP - SNAP_EDGE_DISTANCE) {
        collapse("right");
      } else {
        persist();
      }
      window.setTimeout(() => {
        draggedRecently.value = false;
      }, 0);
    }
    moved = false;
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0) return;
    activePointerId = event.pointerId;
    moved = false;
    dragStart = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: position.value.x,
      y: position.value.y,
    };
    elementRef.value?.setPointerCapture?.(event.pointerId);
  }

  function onMouseMove(event: MouseEvent) {
    if (!mouseDragging || !dragStart) return;
    const deltaX = event.clientX - dragStart.pointerX;
    const deltaY = event.clientY - dragStart.pointerY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) moved = true;
    position.value = clamp({ x: dragStart.x + deltaX, y: dragStart.y + deltaY });
  }

  function stopMouseDragging() {
    if (!mouseDragging) return;
    mouseDragging = false;
    dragStart = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopMouseDragging);
    finishDrag();
  }

  function onMouseDown(event: MouseEvent) {
    if (event.button !== 0 || activePointerId !== null) return;
    mouseDragging = true;
    moved = false;
    dragStart = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      x: position.value.x,
      y: position.value.y,
    };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", stopMouseDragging, { once: true });
  }

  function handleResize() {
    position.value = collapsed.value ? snapPositionToSide(position.value, collapseSide.value) : clamp(position.value);
    persist();
  }

  function handleVisibilityChange() {
    if (document.visibilityState !== "visible") return;
    handleResize();
  }

  onMounted(() => {
    restore();
    window.addEventListener("resize", handleResize);
    document.addEventListener("visibilitychange", handleVisibilityChange);
  });

  onBeforeUnmount(() => {
    window.removeEventListener("resize", handleResize);
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", stopMouseDragging);
  });

  return {
    style,
    sideStyle,
    collapsed,
    collapseSide,
    draggedRecently,
    collapse,
    expand,
    onPointerDown,
    onPointerMove,
    stopDragging,
    onMouseDown,
  };
}
