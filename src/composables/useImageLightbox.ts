export interface LightboxImage {
  src: string;
  originalSrc?: string;
  title?: string;
  downloadName?: string;
}

export interface OpenImageLightboxOptions {
  images: LightboxImage[];
  index?: number;
}

const visible = ref(false);
const images = shallowRef<LightboxImage[]>([]);
const index = ref(0);
const openVersion = ref(0);

function normalizeIndex(value: number, length: number) {
  if (!length) return 0;
  return Math.min(Math.max(value, 0), length - 1);
}

export function openImageLightbox(options: OpenImageLightboxOptions) {
  const nextImages = options.images.filter((item) => Boolean(item?.src));
  if (!nextImages.length) return;
  images.value = nextImages;
  index.value = normalizeIndex(options.index ?? 0, nextImages.length);
  openVersion.value += 1;
  visible.value = true;
}

export function closeImageLightbox() {
  visible.value = false;
}

export function useImageLightbox() {
  return {
    visible,
    images,
    index,
    openVersion,
    open: openImageLightbox,
    close: closeImageLightbox,
  };
}
