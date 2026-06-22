<template>
  <div class="cornerScape f">
    <div class="left">
      <t-card shadow class="card">
        <template #title>
          {{ $t("workbench.cornerScape.batchSettings") }}
          <t-tag size="small" theme="primary" variant="light" style="margin-left: 8px">{{ visibleAssetItems.length }}</t-tag>
        </template>
        <t-form labelAlign="top">
          <t-form-item :label="$t('workbench.cornerScape.quickActions')">
            <div class="quickActions">
              <t-button theme="primary" variant="outline" @click="selectAll">{{ $t("workbench.cornerScape.selectAll") }}</t-button>
              <t-button theme="primary" variant="outline" @click="selectPromptEmpty()">{{ $t("workbench.cornerScape.selectPromptEmpty") }}</t-button>
              <t-button theme="primary" variant="outline" @click="selectByState('')">{{ $t("workbench.cornerScape.selectUngenerated") }}</t-button>
              <t-button theme="primary" variant="outline" @click="selectByState('已完成')">
                {{ $t("workbench.cornerScape.selectGenerated") }}
              </t-button>
              <t-button theme="primary" variant="outline" @click="selectByState('生成失败')">{{ $t("workbench.cornerScape.selectFailed") }}</t-button>
              <t-button theme="primary" variant="outline" @click="toggleSelectAll">{{ $t("workbench.cornerScape.invertSelection") }}</t-button>
              <t-button theme="primary" variant="outline" @click="clearSelection">{{ $t("workbench.cornerScape.clearSelection") }}</t-button>
              <t-button theme="primary" variant="outline" @click="openAssetDialog()">
                <template #icon><i-plus /></template>
                {{ $t("common.add") }}{{ $t("workbench.menu.assetCenter") }}
              </t-button>
              <t-image-viewer :images="previewImages" :closeOnEscKeydown="true" :closeOnOverlay="true">
                <template #trigger="{ open }">
                  <t-button theme="primary" variant="outline" :disabled="!hasPreviewImages" @click="hasPreviewImages && open()">
                    {{ $t("workbench.cornerScape.batchPreview") }}
                  </t-button>
                </template>
              </t-image-viewer>
            </div>
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.assetTypeFilter')">
            <t-checkbox-group @change="onChangeFn" v-model="checkboxValue" :options="translatedOptions" class="filterGroup" />
          </t-form-item>

          <t-form-item :label="$t('workbench.cornerScape.genModel')">
            <modelSelect v-model="selectValue" :type="`image`" />
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.resolution')">
            <t-select
              v-model="resolution"
              :placeholder="$t('workbench.cornerScape.resolutionPh')"
              :options="[
                { label: '1K', value: '1K' },
                { label: '2K', value: '2K' },
                { label: '4K', value: '4K' },
              ]"></t-select>
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.textPromptInput')">
            <t-textarea v-model="otherTextPrompt" :placeholder="$t('workbench.cornerScape.textPromptPh')"></t-textarea>
          </t-form-item>
          <t-form-item>
            <div class="btnGap ac">
              <div class="selectedInfo" v-if="selectedIds.length > 0">
                <t-tag size="medium" theme="primary" variant="light">
                  {{ $t("workbench.cornerScape.selectedCount", { count: selectedIds.length }) }}
                </t-tag>
              </div>
              <div class="ac jb" style="width: 100%">
                <t-button theme="primary" block @click="batchGenerationPrompt">{{ $t("workbench.cornerScape.batchGenerationPrompt") }}</t-button>
                <t-button theme="primary" style="margin-left: 10px" block @click="batchSelectBindAudio">
                  {{ $t("workbench.cornerScape.batchBingAudio") }}
                </t-button>
              </div>
              <t-button theme="primary" block @click="batchGenerationImage">
                {{ $t("workbench.cornerScape.startBatch") }}
              </t-button>
            </div>
          </t-form-item>
        </t-form>
      </t-card>
    </div>
    <div class="content">
      <template v-if="visibleAssetItems.length > 0">
        <section v-for="group in groupedDataList" :key="group.type" class="assetGroup">
          <div class="groupHeader">
            <span>{{ group.label }}</span>
            <t-tag size="small" theme="primary" variant="light">{{ group.count }}</t-tag>
          </div>
          <div class="groupGrid">
            <div v-for="item in group.items" :key="item.id" class="assetFamily">
              <t-card shadow class="card" @click="openDrawer(item)">
                <div class="imageBox">
                  <t-checkbox class="selectBox" :checked="selectedIds.includes(item.id)" @click.stop @change="toggleSelect(item.id)" />
                  <div class="cancelGeneration" @click.stop="cancelGenerationFn(item)" v-if="isImageTaskActive(item)">
                    <t-tag theme="danger" size="small">
                      {{ $t("workbench.cornerScape.cancelGeneration") }}
                    </t-tag>
                  </div>
                  <div class="cardActions" @click.stop>
                    <t-tooltip :content="$t('workbench.production.node.assets.addDerivedAsset')">
                      <t-button size="small" shape="circle" variant="outline" @click="openAssetDialog(item)">
                        <template #icon><i-plus /></template>
                      </t-button>
                    </t-tooltip>
                  </div>
                  <div v-if="isAssetBusy(item)" class="generatingBox">
                    <t-loading />
                    <span class="generatingText">
                      {{ isAudioTaskActive(item) ? $t("workbench.cornerScape.audioState") : $t("workbench.cornerScape.generating") }}
                    </span>
                  </div>
                  <t-popup :content="item.errorReason" v-else-if="isImageTaskFailed(item)">
                    <t-empty type="fail" :title="$t('workbench.cornerScape.genFailed')" />
                  </t-popup>
                  <t-image v-else-if="item.filePath" class="image" :src="item.filePath" fit="contain" :preview="true" :lazy="true">
                    <template #error>
                      <t-empty type="fail" :title="$t('workbench.cornerScape.imageError')" />
                    </template>
                    <template #overlayContent>
                      <div class="imageToolsWrap">
                        <ImageTools :src="item.filePath!" position="br" />
                      </div>
                    </template>
                  </t-image>
                  <t-empty v-else type="maintenance" :title="$t('workbench.cornerScape.waitingGen')" />
                </div>
                <div class="infoBox">
                  <div class="title ac jb">
                    {{ item.name }}
                    <t-tag size="small" variant="outline" theme="success" v-if="item.prompt">已生成提示词</t-tag>
                    <t-tag size="small" variant="outline" theme="danger" v-else>未生成提示词</t-tag>
                  </div>
                  <div class="meta">
                    <t-tag size="small" variant="light-outline" theme="warning" class="typeTag">{{ getTypeLabel(item.type) }}</t-tag>
                    <t-tag size="small" variant="outline" class="stateTag" v-if="item.model">
                      {{ item.model }}
                    </t-tag>
                    <t-tag size="small" variant="outline" v-if="item.resolution">
                      {{ item.resolution }}
                    </t-tag>
                  </div>
                  <div class="prompt" v-if="item.describe">{{ getTypeLabel(item.type) }}{{ $t("workbench.cornerScape.descriptionSuffix") }}{{ item.describe }}</div>
                  <div v-if="item.relepedAudio.length" style="margin-top: 6px">
                    <t-tag v-for="audio in item.relepedAudio" :key="audio.id" size="small" variant="outline" theme="primary">{{ audio.name }}</t-tag>
                  </div>
                </div>
              </t-card>
              <div v-if="item.sonAssets?.length" class="derivedList">
                <t-card v-for="child in item.sonAssets" :key="child.id" shadow class="card derivedCard" @click="openDrawer(child)">
                  <div class="imageBox">
                    <t-checkbox class="selectBox" :checked="selectedIds.includes(child.id)" @click.stop @change="toggleSelect(child.id)" />
                    <t-tag class="derivedBadge" size="small" theme="warning" variant="light">{{ $t("workbench.production.node.assets.derived") }}</t-tag>
                    <div class="cancelGeneration" @click.stop="cancelGenerationFn(child)" v-if="isImageTaskActive(child)">
                      <t-tag theme="danger" size="small">
                        {{ $t("workbench.cornerScape.cancelGeneration") }}
                      </t-tag>
                    </div>
                    <div v-if="isAssetBusy(child)" class="generatingBox">
                      <t-loading />
                      <span class="generatingText">
                        {{ isAudioTaskActive(child) ? $t("workbench.cornerScape.audioState") : $t("workbench.cornerScape.generating") }}
                      </span>
                    </div>
                    <t-popup :content="child.errorReason" v-else-if="isImageTaskFailed(child)">
                      <t-empty type="fail" :title="$t('workbench.cornerScape.genFailed')" />
                    </t-popup>
                    <t-image v-else-if="child.filePath" class="image" :src="child.filePath" fit="contain" :preview="true" :lazy="true">
                      <template #error>
                        <t-empty type="fail" :title="$t('workbench.cornerScape.imageError')" />
                      </template>
                      <template #overlayContent>
                        <div class="imageToolsWrap">
                          <ImageTools :src="child.filePath!" position="br" />
                        </div>
                      </template>
                    </t-image>
                    <t-empty v-else type="maintenance" :title="$t('workbench.cornerScape.waitingGen')" />
                  </div>
                  <div class="infoBox">
                    <div class="title ac jb">
                      {{ child.name }}
                      <t-tag size="small" variant="outline" theme="success" v-if="child.prompt">已生成提示词</t-tag>
                      <t-tag size="small" variant="outline" theme="danger" v-else>未生成提示词</t-tag>
                    </div>
                    <div class="meta">
                      <t-tag size="small" variant="light-outline" theme="warning" class="typeTag">{{ getTypeLabel(child.type) }}</t-tag>
                      <t-tag size="small" variant="outline" class="stateTag" v-if="child.model">
                        {{ child.model }}
                      </t-tag>
                      <t-tag size="small" variant="outline" v-if="child.resolution">
                        {{ child.resolution }}
                      </t-tag>
                    </div>
                    <div class="prompt" v-if="child.describe">{{ getTypeLabel(child.type) }}{{ $t("workbench.cornerScape.descriptionSuffix") }}{{ child.describe }}</div>
                    <div v-if="child.relepedAudio.length" style="margin-top: 6px">
                      <t-tag v-for="audio in child.relepedAudio" :key="audio.id" size="small" variant="outline" theme="primary">{{ audio.name }}</t-tag>
                    </div>
                  </div>
                </t-card>
              </div>
            </div>
          </div>
        </section>
      </template>
      <t-empty v-else type="empty" :title="$t('workbench.cornerScape.operateScriptFirst')" />
      <t-drawer :closeBtn="true" closeOnEscKeydown :showOverlay="false" :footer="false" v-model:visible="drawerVisible" size="480px">
        <template #header>
          <div class="drawerHeader">
            <span>{{ currentItem?.name }} - {{ $t("workbench.cornerScape.individualConfig") }}</span>
            <t-tag size="medium" variant="light-outline" theme="warning">
              {{
                currentItem?.type === "role"
                  ? $t("workbench.cornerScape.typeRole")
                  : currentItem?.type === "scene"
                    ? $t("workbench.cornerScape.typeScene")
                    : currentItem?.type === "tool"
                      ? $t("workbench.cornerScape.typeTool")
                      : $t("workbench.cornerScape.typeUnknown")
              }}
            </t-tag>
          </div>
        </template>
        <div v-if="currentItem" class="drawerImageBox">
          <div v-if="isImageTaskActive(currentItem)" class="generatingBox">
            <t-loading />
            <span class="generatingText">{{ $t("workbench.cornerScape.generating") }}</span>
          </div>
          <t-empty v-else-if="isImageTaskFailed(currentItem)" type="fail" :title="$t('workbench.cornerScape.genFailed')" />
          <t-image v-else-if="currentItem.filePath" class="image" :src="currentItem.filePath" fit="contain">
            <template #error>
              <t-empty type="fail" :title="$t('workbench.cornerScape.imageError')" />
            </template>
            <template #overlayContent>
              <div class="imageToolsWrap show">
                <ImageTools :src="currentItem.filePath!" position="br" />
              </div>
            </template>
          </t-image>
          <t-empty v-else type="maintenance" :title="$t('workbench.cornerScape.noImage')" />
        </div>
        <t-form v-if="currentItem" labelAlign="top">
          <t-form-item :label="$t('workbench.cornerScape.history')">
            <t-loading :loading="historyLoading" style="width: 100%">
              <div class="historyImageList f">
                <div
                  v-for="item in currentItem.historyImages"
                  :key="item.id"
                  class="historyImageItem"
                  :class="{ selected: selectedHistoryId === item.id }"
                  @click.stop="toggleHistorySelect(item.id)">
                  <t-image :src="item.filePath" :style="{ width: '100px', minWidth: '100px', height: '100px' }" :lazy="true" fit="contain" />
                </div>
                <t-empty v-if="!currentItem.historyImages.length && !historyLoading" size="small" />
              </div>
            </t-loading>
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.genModel')">
            <modelSelect v-model="selectValue" :type="`image`" />
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.resolution')">
            <t-select v-model="editForm.resolution" :placeholder="$t('workbench.cornerScape.resolutionPh')" :options="resolutionOptions" />
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.promptLabel')">
            <t-loading style="width: 100%" :loading="isPromptTaskActive(currentItem)">
              <t-textarea
                v-model="editForm.prompt"
                :placeholder="$t('workbench.cornerScape.promptPh')"
                :autosize="{ minRows: 4, maxRows: 10 }"
                :disabled="polishing"
                @blur="savePromptOnBlur" />
            </t-loading>
          </t-form-item>
          <t-form-item :label="$t('workbench.cornerScape.assetsAudioLabel')">
            <div>
              <div>
                <t-button size="small" theme="primary" variant="outline" @click="selectAudio">
                  <template #icon><i-plus /></template>
                  {{ $t("workbench.cornerScape.selectAudio") }}
                </t-button>
              </div>
              <div class="audioList ac w" v-if="editForm.relepedAudio.length">
                <t-tag v-for="audio in editForm.relepedAudio" :key="audio.id" closable variant="light-outline" @close="removeAudio(audio.id)">
                  {{ audio.name }}
                </t-tag>
              </div>
              <div v-else class="assets-empty">{{ $t("workbench.cornerScape.noAudio") }}</div>
            </div>
          </t-form-item>
          <t-form-item>
            <div class="drawerActions">
              <t-button theme="default" variant="outline" :loading="uploadLoading" @click="uploadLocalAssetImage">
                <template #icon><i-upload /></template>
                {{ $t("workbench.production.generatedNode.localUpload") }}
              </t-button>
              <t-button theme="default" variant="outline" @click="openAssetDialog(currentItem)">
                <template #icon><i-plus /></template>
                {{ $t("workbench.production.node.assets.addDerivedAsset") }}
              </t-button>
              <t-button
                theme="default"
                variant="outline"
                :loading="polishing"
                @click="polishPrompts"
                :disabled="isPromptTaskActive(currentItem)">
                <template #icon><t-icon name="edit" /></template>
                {{ $t("workbench.cornerScape.aiPolish") }}
              </t-button>
              <t-button theme="primary" @click="regenerateItem" :disabled="isImageTaskActive(currentItem)">
                <template #icon><t-icon name="refresh" /></template>
                {{ $t("workbench.cornerScape.regenerate") }}
              </t-button>
            </div>
          </t-form-item>
        </t-form>
      </t-drawer>
      <t-dialog
        v-model:visible="assetDialogVisible"
        :header="assetDialogParent ? $t('workbench.production.node.assets.addDerivedAsset') : `${$t('common.add')}${$t('workbench.menu.assetCenter')}`"
        width="520px"
        :confirm-loading="assetDialogSubmitting"
        :confirm-btn="$t('common.confirm')"
        :cancel-btn="$t('common.cancel')"
        @confirm="submitAssetDialog">
        <t-form label-align="top">
          <t-form-item v-if="!assetDialogParent" :label="$t('workbench.cornerScape.assetTypeFilter')">
            <t-select v-model="assetForm.type" :options="assetTypeOptions" />
          </t-form-item>
          <t-form-item v-else :label="$t('workbench.production.node.assets.originalAsset')">
            <t-input :model-value="assetDialogParent.name" readonly />
          </t-form-item>
          <t-form-item :label="$t('workbench.assets.add.name')" required-mark>
            <t-input v-model="assetForm.name" :placeholder="$t('workbench.assets.add.namePh')" />
          </t-form-item>
          <t-form-item :label="$t('workbench.assets.add.describe')" required-mark>
            <t-textarea v-model="assetForm.describe" :placeholder="$t('workbench.assets.add.describePh')" :autosize="{ minRows: 3, maxRows: 6 }" />
          </t-form-item>
          <t-form-item :label="$t('workbench.assets.add.prompt')">
            <t-textarea v-model="assetForm.prompt" :placeholder="$t('workbench.assets.add.promptPh')" :autosize="{ minRows: 3, maxRows: 6 }" />
          </t-form-item>
        </t-form>
      </t-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import modelSelect from "@/components/modelSelect.vue";
import settingStore from "@/stores/setting";
import openAssetsSelector from "@/utils/assetsCheck";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { attachLegacyMediaFields, getMediaOriginalUrl, getMediaPreviewUrl, normalizeMediaRef } from "@/utils/mediaRef";
import { normalizeAssetImageType } from "@/utils/assetImageTask";
import type { MediaRef } from "@/types/api";
import { useFileDialog } from "@vueuse/core";

const { otherSetting } = storeToRefs(settingStore());
interface Image {
  filePath: string;
  originalPath: string;
  id: number;
  media?: MediaRef;
  selected?: boolean;
}
interface DataItem {
  id: number;
  assetsId?: number | null;
  imageId: number;
  type: string;
  name: string;
  prompt: string;
  filePath: string | null;
  state: string;
  status?: string;
  model: string;
  resolution: string;
  describe: string;
  promptState: string;
  historyImages: Image[];
  errorReason: string;
  promptErrorReason: string;
  relepedAudio: { id: number; name: string }[];
  audioBindState: string;
  taskId?: string;
  legacyTaskId?: number | string;
  promptTaskId?: string;
  audioTaskId?: string;
  media?: MediaRef;
  sonAssets?: DataItem[];
}

type AssetType = "role" | "scene" | "tool" | "unknown";

interface AssetGroup {
  type: AssetType;
  label: string;
  count: number;
  items: DataItem[];
}

const checkboxValue = ref<string[]>([]);
const { project } = storeToRefs(projectStore());
const selectValue = ref(project.value?.imageModel ?? "");
const resolution = ref("1K");
const otherTextPrompt = ref("");
const resolutionOptions = [
  { label: "1K", value: "1K" },
  { label: "2K", value: "2K" },
  { label: "4K", value: "4K" },
];
const options = ref([
  { labelKey: "workbench.cornerScape.filterRole", value: "role" },
  { labelKey: "workbench.cornerScape.filterScene", value: "scene" },
  { labelKey: "workbench.cornerScape.filterTool", value: "tool" },
]);
const assetTypeOptions = computed(() =>
  options.value.map((item) => ({
    label: $t(item.labelKey),
    value: item.value,
  })),
);

const translatedOptions = computed(() =>
  options.value.map((opt) => ({
    ...opt,
    label: $t(opt.labelKey),
  })),
);
const dataList = ref<DataItem[]>([]);
const loading = ref(false);
const taskCenter = useTaskCenterStore();
const imageTaskBindings = new Map<number, () => void>();
const promptTaskBindings = new Map<number, () => void>();
const audioTaskBindings = new Map<number, () => void>();
const assetDialogVisible = ref(false);
const assetDialogSubmitting = ref(false);
const assetDialogParent = ref<DataItem | null>(null);
const assetForm = reactive({
  type: "role",
  name: "",
  describe: "",
  prompt: "",
});
const uploadLoading = ref(false);
const localImageDialog = useFileDialog({ multiple: false, reset: true, accept: "image/*" });

const visibleAssetItems = computed(() => getVisibleAssetItems());
const groupedDataList = computed<AssetGroup[]>(() => {
  const groups: AssetGroup[] = [
    { type: "role", label: getTypeLabel("role"), count: 0, items: [] },
    { type: "scene", label: getTypeLabel("scene"), count: 0, items: [] },
    { type: "tool", label: getTypeLabel("tool"), count: 0, items: [] },
    { type: "unknown", label: getTypeLabel("unknown"), count: 0, items: [] },
  ];
  const groupMap = new Map(groups.map((item) => [item.type, item]));
  dataList.value.forEach((item) => {
    const type = normalizeAssetType(item.type);
    const group = groupMap.get(type) ?? groupMap.get("unknown")!;
    group.items.push(item);
    group.count += 1 + (item.sonAssets?.length ?? 0);
  });
  return groups.filter((group) => group.items.length > 0);
});

// 用于取消进行中的生成请求
let abortController: AbortController | null = null;

function createAbortController() {
  abortController?.abort();
  abortController = new AbortController();
  return abortController;
}

onMounted(() => {
  getFilteredData();
});

onUnmounted(() => {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
  releaseAllRuntimeTasks();
});
function onChangeFn() {
  getFilteredData();
}

function normalizeAssetType(type?: string | null): AssetType {
  if (type === "role" || type === "scene" || type === "tool") return type;
  return "unknown";
}

function getTypeLabel(type?: string | null) {
  const normalized = normalizeAssetType(type);
  if (normalized === "role") return $t("workbench.cornerScape.typeRole");
  if (normalized === "scene") return $t("workbench.cornerScape.typeScene");
  if (normalized === "tool") return $t("workbench.cornerScape.typeTool");
  return $t("workbench.cornerScape.typeUnknown");
}

function isAssetBusy(item: DataItem) {
  return isImageTaskActive(item) || isPromptTaskActive(item) || isAudioTaskActive(item);
}

function isActiveTaskStatus(status: ReturnType<typeof normalizeTaskStatus>) {
  return status === "queued" || status === "submitting" || status === "processing";
}

function isFailedTaskStatus(status: ReturnType<typeof normalizeTaskStatus>) {
  return status === "failed" || status === "cancelled";
}

function getImageTaskStatus(item: DataItem) {
  return normalizeTaskStatus(item.status ?? item.state, "pending");
}

function isImageTaskActive(item: DataItem) {
  return isActiveTaskStatus(getImageTaskStatus(item));
}

function isImageTaskFailed(item: DataItem) {
  return isFailedTaskStatus(getImageTaskStatus(item));
}

function isPromptTaskActive(item: DataItem) {
  return isActiveTaskStatus(normalizeTaskStatus(item.promptState, "pending"));
}

function isAudioTaskActive(item: DataItem) {
  return isActiveTaskStatus(normalizeTaskStatus(item.audioBindState, "pending"));
}

function normalizeHistoryImages(item: DataItem): Image[] {
  return Array.isArray(item.historyImages) ? item.historyImages : [];
}

function normalizeDataItem(row: any): DataItem {
  const media = normalizeMediaRef(row?.media ?? row, "image");
  const normalized = attachLegacyMediaFields({ ...row }, media) as DataItem;
  normalized.assetsId = row?.assetsId ?? row?.assetId ?? null;
  normalized.historyImages = normalizeHistoryImages(normalized);
  normalized.relepedAudio = Array.isArray(row?.relepedAudio) ? row.relepedAudio : [];
  normalized.sonAssets = Array.isArray(row?.sonAssets) ? row.sonAssets.map((item: any) => normalizeDataItem(item)) : [];
  normalized.errorReason = normalized.errorReason ?? "";
  normalized.promptErrorReason = normalized.promptErrorReason ?? "";
  normalized.promptState = normalized.promptState ?? "";
  normalized.audioBindState = normalized.audioBindState ?? "";
  normalized.state = normalized.state ?? "";
  return normalized;
}

function normalizeAssetTree(rows: any[]): DataItem[] {
  const normalizedRows = (rows ?? []).map(normalizeDataItem);
  const byId = new Map(normalizedRows.map((item) => [item.id, item]));
  const childIds = new Set<number>();

  normalizedRows.forEach((item) => {
    const parentId = item.assetsId;
    if (!parentId || parentId === item.id) return;
    const parent = byId.get(parentId);
    if (!parent) return;
    parent.sonAssets ||= [];
    if (!parent.sonAssets.some((child) => child.id === item.id)) {
      parent.sonAssets.push(item);
    }
    childIds.add(item.id);
  });

  return normalizedRows.filter((item) => !childIds.has(item.id));
}

function flattenAssetItems(items = dataList.value): DataItem[] {
  return items.flatMap((item) => [item, ...(item.sonAssets ?? [])]);
}

function getVisibleAssetItems() {
  return flattenAssetItems();
}

function findInAssetTree(items: DataItem[], id: number): DataItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const child = (item.sonAssets ?? []).find((row) => row.id === id);
    if (child) return child;
  }
  return null;
}

function findAssetById(id: number) {
  return findInAssetTree(dataList.value, id);
}

function syncEditFormFromItem(item: DataItem) {
  editForm.assetsId = item.id;
  editForm.name = item.name || "";
  editForm.type = item.type || "";
  editForm.model = item.model || "";
  editForm.resolution = item.resolution || "";
  editForm.prompt = item.prompt || "";
  editForm.describe = item.describe || "";
  editForm.promptState = item.promptState || "";
  editForm.relepedAudio = item.relepedAudio ?? [];
}

function mergeAssetPatch(id: number, patch: Partial<DataItem>) {
  const target = findAssetById(id);
  if (!target) return null;
  Object.assign(target, patch);
  target.historyImages = normalizeHistoryImages(target);
  target.relepedAudio = Array.isArray(target.relepedAudio) ? target.relepedAudio : [];
  if (currentItem.value?.id === id) {
    currentItem.value = target;
    syncEditFormFromItem(target);
  }
  return target;
}

async function getFilteredData() {
  try {
    loading.value = true;
    const { data } = await axios.post("/cornerScape/getAllAssets", {
      projectId: project.value?.id,
      type: checkboxValue.value,
    });
    dataList.value = normalizeAssetTree(data ?? []);
    syncSelectedIdsWithData();
    syncRuntimeTasks();
  } catch (error) {
    console.error("加载资产数据失败:", error);
    dataList.value = [];
    selectedIds.value = [];
  } finally {
    loading.value = false;
  }
}

const selectedIds = ref<number[]>([]);

function syncSelectedIdsWithData() {
  const visibleIds = new Set(visibleAssetItems.value.map((item) => item.id));
  selectedIds.value = Array.from(new Set(selectedIds.value)).filter((id) => visibleIds.has(id));
}

const previewImages = computed((): string[] => {
  const selectedImageList = visibleAssetItems.value
    .filter((item) => selectedIds.value.includes(item.id) && item.filePath)
    .map((item) => item.filePath as string);

  if (selectedImageList.length > 0) {
    return selectedImageList;
  }

  return visibleAssetItems.value.filter((item) => item.filePath).map((item) => item.filePath as string);
});

const hasPreviewImages = computed(() => previewImages.value.length > 0);

const toggleSelect = (id: number) => {
  const idx = selectedIds.value.indexOf(id);
  if (idx === -1) selectedIds.value.push(id);
  else selectedIds.value.splice(idx, 1);
};

const selectByState = (state: string) => {
  selectedIds.value = visibleAssetItems.value.filter((item) => (state === "" ? !item.state : item.state === state)).map((item) => item.id);
};
//全选提示词为空的
function selectPromptEmpty() {
  const lite = visibleAssetItems.value.filter((item) => !item.prompt || item.prompt.trim() === "").map((item) => item.id);
  if (lite.length === 0) {
    window.$message.warning($t("workbench.cornerScape.noEmptyPrompt"));
    return;
  }
  selectedIds.value = lite;
  window.$message.success($t("workbench.cornerScape.selectedCount", { count: selectedIds.value.length }));
}

function selectAll() {
  selectedIds.value = visibleAssetItems.value.map((item) => item.id);
}

function toggleSelectAll() {
  if (selectedIds.value.length === visibleAssetItems.value.length) {
    selectedIds.value = [];
  } else {
    selectedIds.value = visibleAssetItems.value.map((item) => item.id);
  }
}
function clearSelection() {
  selectedIds.value = [];
}
//取消生成
async function cancelGenerationFn(item: DataItem) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmCancellation"),
    body: $t("workbench.assets.confirmAgain"),
    confirmBtn: $t("workbench.assets.sure"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        const { data } = await axios.post("/cornerScape/getAllAssets", {
          projectId: project.value?.id,
          type: checkboxValue.value,
        });
        const freshItem = findInAssetTree(normalizeAssetTree(data ?? []), item.id);
        if (!freshItem || !freshItem.imageId) {
          window.$message.warning($t("workbench.cornerScape.noGenerating"));
          return;
        }
        await axios.post("/assetsGenerate/cancelGenerate", {
          id: freshItem.imageId,
        });
        window.$message.success($t("workbench.cornerScape.cancelGeneration") + " " + item.name);
      } catch (e: any) {
        window.$message.error(e.message ?? $t("workbench.cornerScape.cancelGeneration") + "失败");
      } finally {
        getFilteredData();
        dialog.destroy();
      }
    },
  });
}

// Drawer
const drawerVisible = ref(false);
const currentItem = ref<DataItem | null>(null);
const selectedHistoryId = ref<number | null>(null);
const historyLoading = ref(false);

async function loadAssetImageHistory(assetId: number) {
  historyLoading.value = true;
  try {
    const { data } = await axios.post("/assets/getImage", { assetsId: assetId });
    const historyImages = (data?.tempAssets ?? [])
      .map((item: any): Image | null => {
        const status = normalizeTaskStatus(item.status ?? item.state, "pending");
        const media = normalizeMediaRef(item.media ?? item, "image");
        if (status !== "completed" || !media) return null;
        return {
          id: Number(item.id),
          filePath: getMediaPreviewUrl(media),
          originalPath: getMediaOriginalUrl(media),
          media,
          selected: Boolean(item.selected),
        };
      })
      .filter((item: Image | null): item is Image => Boolean(item));
    mergeAssetPatch(assetId, { historyImages });
    if (currentItem.value?.id === assetId) {
      selectedHistoryId.value = historyImages.find((item: Image) => item.selected)?.id ?? null;
    }
    return historyImages;
  } finally {
    historyLoading.value = false;
  }
}

async function refreshAssetWithHistory(assetId: number) {
  await refreshAssetDetail(assetId);
  await loadAssetImageHistory(assetId);
}

async function toggleHistorySelect(id: number) {
  if (!currentItem.value) return;
  const assetId = currentItem.value.id;
  const selectedImage = currentItem.value.historyImages.find((img) => img.id === id);
  if (!selectedImage) return;
  selectedHistoryId.value = id;
  try {
    await axios.post("/assets/saveAssets", {
      id: assetId,
      type: currentItem.value.type,
      projectId: project.value?.id,
      prompt: currentItem.value.prompt,
      imageId: selectedImage.id,
    });
    mergeAssetPatch(assetId, {
      imageId: selectedImage.id,
      filePath: selectedImage.filePath,
      media: selectedImage.media,
      state: "已完成",
      status: "completed",
    });
    await refreshAssetWithHistory(assetId);
    window.$message.success($t("workbench.cornerScape.msg.replaceSuccess"));
  } catch (e) {
    window.$message.error($t("workbench.cornerScape.msg.replaceFailed"));
    return;
  }
}

const editForm = reactive({
  assetsId: 0,
  model: "",
  type: "",
  resolution: "",
  prompt: "",
  name: "",
  describe: "",
  promptState: "",
  relepedAudio: [] as { id: number; name: string }[],
});

function openAssetDialog(parent?: DataItem | null) {
  assetDialogParent.value = parent ?? null;
  assetForm.type = parent?.type && parent.type !== "unknown" ? parent.type : checkboxValue.value[0] || "role";
  assetForm.name = "";
  assetForm.describe = "";
  assetForm.prompt = "";
  assetDialogVisible.value = true;
}

async function submitAssetDialog() {
  if (assetDialogSubmitting.value) return;
  if (!assetForm.name.trim()) return window.$message.warning($t("workbench.assets.add.nameRequired"));
  if (!assetForm.describe.trim()) return window.$message.warning($t("workbench.assets.add.describeRequired"));
  const parent = assetDialogParent.value;
  assetDialogSubmitting.value = true;
  try {
    await axios.post("/assets/addAssets", {
      projectId: project.value?.id,
      assetsId: parent?.id,
      type: parent?.type || assetForm.type,
      name: assetForm.name.trim(),
      describe: assetForm.describe.trim(),
      remark: "",
      prompt: assetForm.prompt.trim(),
    });
    assetDialogVisible.value = false;
    window.$message.success($t("workbench.assets.add.addSuccess"));
    await getFilteredData();
    if (parent) await refreshAssetDetail(parent.id);
  } catch (e: any) {
    window.$message.error(e?.message || $t("common.addFailed"));
  } finally {
    assetDialogSubmitting.value = false;
  }
}

async function refreshAssetDetail(id: number) {
  const { data } = await axios.post("/cornerScape/getAllAssets", {
    projectId: project.value?.id,
    type: checkboxValue.value,
  });
  dataList.value = normalizeAssetTree(data ?? []);
  syncSelectedIdsWithData();
  syncRuntimeTasks();
  const freshItem = findAssetById(id);
  if (freshItem && currentItem.value?.id === id) {
    currentItem.value = freshItem;
    syncEditFormFromItem(freshItem);
  }
  return freshItem;
}

async function openDrawer(item: DataItem) {
  selectedHistoryId.value = null;
  // 先用当前数据打开抽屉
  currentItem.value = item;
  syncEditFormFromItem(item);
  drawerVisible.value = true;
  // 重新获取最新资产数据和当前资产的图片历史。
  try {
    await refreshAssetWithHistory(item.id);
  } catch (e) {
    console.error("刷新资产详情失败:", e);
  }
}

function setItemState(id: number, state: string) {
  mergeAssetPatch(id, { state, status: normalizeTaskStatus(state, "pending") });
}

function regenerateItem() {
  if (!currentItem.value) return;
  if (!selectValue.value) {
    window.$message.warning($t("workbench.cornerScape.msg.selectModel"));
    return;
  }
  if (!editForm.resolution) {
    window.$message.warning($t("workbench.cornerScape.msg.selectResolution"));
    return;
  }
  if (!editForm.prompt.trim()) {
    window.$message.warning($t("workbench.cornerScape.msg.enterPrompt"));
    return;
  }
  const item = currentItem.value;
  setItemState(item.id, "生成中");
  drawerVisible.value = false;
  const controller = createAbortController();
  axios
    .post(
      "/assetsGenerate/generateAssets",
      {
        type: item.type ?? "props",
        projectId: project.value?.id,
        name: item.name ?? $t("workbench.cornerScape.unnamed"),
        base64: "",
        prompt: editForm.prompt,
        model: selectValue.value,
        id: item.id,
        resolution: editForm.resolution,
        concurrentCount: 1,
      },
      { signal: controller.signal },
    )
    .then(({ data }) => {
      item.taskId = data?.taskId;
      item.legacyTaskId = data?.legacyTaskId;
      if (data?.status) {
        item.status = normalizeTaskStatus(data.status, "queued");
        item.state = "生成中";
      }
      window.$message.success($t("workbench.cornerScape.msg.genSuccess", { name: item.name }));
      syncRuntimeTasks();
    })
    .catch((e: any) => {
      if (e.name === "CanceledError" || e.code === "ERR_CANCELED") return;
      window.$message.error(e.message ?? $t("workbench.cornerScape.msg.genFailed", { name: item.name }));
      setItemState(item.id, "生成失败");
    });
}

// 提示词失焦保存
async function savePromptOnBlur() {
  if (!currentItem.value) return;
  // 内容没有变化则不保存
  if (editForm.prompt === currentItem.value.prompt) return;
  try {
    await axios.post("/assets/saveAssets", {
      id: currentItem.value.id,
      type: currentItem.value.type,
      projectId: project.value?.id,
      prompt: editForm.prompt,
    });
    // 同步更新本地数据
    mergeAssetPatch(currentItem.value.id, { prompt: editForm.prompt });
    window.$message.success($t("workbench.cornerScape.msg.saveSuccess"));
  } catch (e) {
    window.$message.error($t("workbench.cornerScape.msg.saveFailed"));
  }
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function selectLocalImageFile() {
  return await new Promise<File | null>((resolve) => {
    let stopChange: { off: () => void } | null = null;
    let stopCancel: { off: () => void } | null = null;
    const cleanup = () => {
      stopChange?.off();
      stopCancel?.off();
      stopChange = null;
      stopCancel = null;
    };
    stopChange = localImageDialog.onChange((files: FileList | null) => {
      cleanup();
      resolve(files?.[0] ?? null);
    });
    stopCancel = localImageDialog.onCancel(() => {
      cleanup();
      resolve(null);
    });
    localImageDialog.open();
  });
}

async function uploadLocalAssetImage() {
  if (!currentItem.value || uploadLoading.value) return;
  const file = await selectLocalImageFile();
  if (!file) return;
  uploadLoading.value = true;
  try {
    const base64 = await fileToDataUrl(file);
    await axios.post("/assets/saveAssets", {
      id: currentItem.value.id,
      type: currentItem.value.type,
      projectId: project.value?.id,
      prompt: editForm.prompt,
      base64,
    });
    window.$message.success($t("workbench.assets.uploadSuccess"));
    await refreshAssetWithHistory(currentItem.value.id);
  } catch (e: any) {
    window.$message.error(e?.message || $t("workbench.production.editImage.uploadFailed"));
  } finally {
    uploadLoading.value = false;
  }
}

// AI 润色
const polishing = ref(false);
async function polishPrompts() {
  if (!editForm.prompt.trim()) {
    window.$message.warning($t("workbench.cornerScape.msg.enterPromptFirst"));
    return;
  }
  polishing.value = true;
  try {
    const { data } = await axios.post("/assetsGenerate/polishAssetsPrompt", {
      projectId: project.value?.id,
      assetsId: editForm.assetsId,
      type: editForm.type ?? "props",
      name: editForm.name,
      describe: editForm.describe,
    });
    window.$message.success($t("workbench.cornerScape.msg.promptGenSuccess"));
    if (data.assetsId === editForm.assetsId) {
      editForm.prompt = data.prompt;
      mergeAssetPatch(editForm.assetsId, { prompt: data.prompt, promptState: data.promptState ?? "已完成" });
    }
  } catch (e) {
    window.$message.error((e as any)?.message ?? $t("workbench.cornerScape.msg.polishFailed"));
  } finally {
    polishing.value = false;
  }
}
//批量生成提示词
async function batchGenerationPrompt() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }

  const items = visibleAssetItems.value.filter((item) => selectedIds.value.includes(item.id));

  // 前端先将所有选中项的 promptState 标记为"生成中"，让轮询自动接管状态跟踪
  items.forEach((item) => {
    mergeAssetPatch(item.id, { promptState: "生成中", promptErrorReason: "" });
  });

  // 清除已选中的项
  selectedIds.value = [];

  try {
    const { data } = await axios.post("/assetsGenerate/batchPolishAssetsPrompt", {
      projectId: project.value?.id,
      items: items.map((item) => ({
        assetsId: item.id,
        type: item.type ?? "props",
        name: item.name,
        describe: item.describe,
      })),
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
      otherTextPrompt: otherTextPrompt.value,
    });
    const rows = Array.isArray(data) ? data : (data?.tasks ?? (data ? [data] : []));
    rows.forEach((row: { assetId?: number; assetsId?: number; id?: number; taskId?: string; legacyTaskId?: number; prompt?: string; promptState?: string }) => {
      const id = row.assetId ?? row.assetsId ?? row.id;
      if (!id) return;
      mergeAssetPatch(id, {
        promptTaskId: row.taskId,
        legacyTaskId: row.legacyTaskId,
        ...(row.prompt !== undefined ? { prompt: row.prompt } : {}),
        ...(row.promptState !== undefined ? { promptState: row.promptState } : {}),
      });
    });
    syncRuntimeTasks();
  } catch (e: any) {
    window.$message.error(e?.message ?? $t("workbench.cornerScape.msg.promptGenFail"));
    // 生成失败时重置 promptState
    items.forEach((item) => {
      mergeAssetPatch(item.id, { promptState: "" });
    });
  }
}
//绑定音频
async function batchSelectBindAudio() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastBindOne"));
    return;
  }

  const items = visibleAssetItems.value.filter((item) => selectedIds.value.includes(item.id));

  // 前端先将所有选中项的 promptState 标记为"生成中"，让轮询自动接管状态跟踪
  items.forEach((item) => {
    mergeAssetPatch(item.id, { audioBindState: "生成中" });
  });

  // 清除已选中的项
  selectedIds.value = [];

  try {
    const { data } = await axios.post("/cornerScape/batchBindAudio", {
      projectId: project.value?.id,
      assetsIds: items.map((item) => item.id),
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
    });
    const rows = Array.isArray(data) ? data : (data?.tasks ?? []);
    rows.forEach((row: { assetId?: number; assetsId?: number; id?: number; taskId?: string; legacyTaskId?: number; audioBindState?: string }) => {
      const id = row.assetId ?? row.assetsId ?? row.id;
      if (!id) return;
      mergeAssetPatch(id, {
        audioTaskId: row.taskId,
        legacyTaskId: row.legacyTaskId,
        ...(row.audioBindState !== undefined ? { audioBindState: row.audioBindState } : {}),
      });
    });
    syncRuntimeTasks();
  } catch (e: any) {
    window.$message.error(e.message ?? $t("workbench.cornerScape.msg.promptGenFail"));
    // 生成失败时重置 audioBindState
    items.forEach((item) => {
      mergeAssetPatch(item.id, { audioBindState: "" });
    });
  }
}
// 批量生成图片
async function batchGenerationImage() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }
  if (!selectValue.value) {
    window.$message.warning($t("workbench.cornerScape.msg.selectModel"));
    return;
  }
  if (!resolution.value) {
    window.$message.warning($t("workbench.cornerScape.msg.selectResolution"));
    return;
  }

  const items = visibleAssetItems.value.filter((item) => selectedIds.value.includes(item.id) && normalizeAssetImageType(item.type));
  if (items.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }
  //检查如果勾选的数据prompt有空的，提示用户勾选的哪一个提示词未生成，然后终止批量生成
  const emptyPrompts = items.filter((item) => !item.prompt);
  if (emptyPrompts.length > 0) {
    const emptyPromptNames = emptyPrompts.map((item) => item.name).join(", ");
    window.$message.warning(
      $t("workbench.cornerScape.msg.emptyPrompt", {
        emptyPromptNames,
      }),
    );
    return;
  }

  const previousState = new Map(
    items.map((item) => [
      item.id,
      {
        state: item.state,
        status: item.status,
        taskId: item.taskId,
        legacyTaskId: item.legacyTaskId,
        imageId: item.imageId,
        errorReason: item.errorReason,
      },
    ]),
  );
  items.forEach((item) => {
    releaseImageTask(item.id);
    taskCenter.removeTask(createTaskKey("assetImage", Number(project.value?.id), item.id, undefined, item.taskId));
    mergeAssetPatch(item.id, { state: "生成中", status: "processing", taskId: undefined, legacyTaskId: undefined, errorReason: "" });
  });

  window.$message.success(
    $t("workbench.cornerScape.msg.batchStarted", { count: items.length, concurrent: otherSetting.value.assetsBatchGenereateSize }),
  );

  try {
    const { data } = await axios.post("/assetsGenerate/batchGenerateImageAssets", {
      projectId: Number(project.value?.id),
      model: selectValue.value,
      resolution: resolution.value,
      concurrentCount: otherSetting.value.assetsBatchGenereateSize,
      items: items.map((item) => ({
        id: item.id,
        type: normalizeAssetImageType(item.type)!,
        name: item.name ?? $t("workbench.cornerScape.unnamed"),
        prompt: item.prompt,
      })),
    });
    const rows = Array.isArray(data) ? data : (data?.tasks ?? (data ? [data] : []));
    rows.forEach(
      (row: {
        assetId?: number;
        assetsId?: number;
        id?: number;
        taskId?: string;
        legacyTaskId?: number;
        imageId?: number;
        state?: string;
        status?: string;
      }) => {
      const id = row.assetId ?? row.assetsId ?? row.id;
      if (!id) return;
      mergeAssetPatch(id, {
        taskId: row.taskId,
        legacyTaskId: row.legacyTaskId,
        ...(row.imageId ? { imageId: row.imageId } : {}),
        ...(row.state !== undefined ? { state: row.state } : {}),
        ...(row.status !== undefined ? { status: normalizeTaskStatus(row.status, "queued") } : {}),
      });
      },
    );
    syncRuntimeTasks();
    selectedIds.value = [];
  } catch (e: any) {
    items.forEach((item) => {
      releaseImageTask(item.id);
      const previous = previousState.get(item.id);
      if (previous) mergeAssetPatch(item.id, previous);
    });
    if (e.name === "CanceledError" || e.code === "ERR_CANCELED") return;
    window.$message.error(e.message ?? $t("workbench.cornerScape.msg.batchFailed"));
  }
}
function releaseImageTask(id: number) {
  imageTaskBindings.get(id)?.();
  imageTaskBindings.delete(id);
}

function releasePromptTask(id: number) {
  promptTaskBindings.get(id)?.();
  promptTaskBindings.delete(id);
}

function releaseAudioTask(id: number) {
  audioTaskBindings.get(id)?.();
  audioTaskBindings.delete(id);
}

function releaseAllRuntimeTasks() {
  imageTaskBindings.forEach((release) => release());
  promptTaskBindings.forEach((release) => release());
  audioTaskBindings.forEach((release) => release());
  imageTaskBindings.clear();
  promptTaskBindings.clear();
  audioTaskBindings.clear();
}

function refreshFinishedItem(id: number, field: "historyImages" | "relepedAudio") {
  queueMicrotask(async () => {
    try {
      if (field === "historyImages") {
        await refreshAssetWithHistory(id);
        return;
      }
      const fresh = await refreshAssetDetail(id);
      if (fresh) mergeAssetPatch(id, { [field]: (fresh as any)[field] } as Partial<DataItem>);
    } catch (e) {
      console.error("刷新任务结果失败:", e);
    }
  });
}

function applyPromptRuntimeTask(id: number, task: RuntimeTask) {
  const record = (task.result ?? {}) as any;
  mergeAssetPatch(id, {
    promptState: task.status === "completed" ? "已完成" : task.status === "failed" || task.status === "cancelled" ? "生成失败" : "生成中",
    promptErrorReason: task.reason ?? "",
    ...(record.prompt !== undefined ? { prompt: record.prompt } : {}),
  });
  if (task.status === "failed" || task.status === "cancelled") window.$message.error(task.reason || $t("workbench.cornerScape.msg.promptGenFail"));
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    queueMicrotask(() => releasePromptTask(id));
    if (task.status === "completed") queueMicrotask(() => void refreshAssetDetail(id));
  }
}

function applyImageRuntimeTask(id: number, task: RuntimeTask) {
  const record = (task.result ?? {}) as any;
  const media = normalizeMediaRef(record.media ?? record, "image");
  mergeAssetPatch(id, {
    state: task.status === "completed" ? "已完成" : task.status === "failed" || task.status === "cancelled" ? "生成失败" : "生成中",
    status: task.status,
    errorReason: task.reason ?? "",
    ...(media ? { media, filePath: getMediaPreviewUrl(media) } : {}),
  });
  if (task.status === "failed" || task.status === "cancelled") window.$message.error(task.reason || $t("workbench.cornerScape.msg.batchFailed"));
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    queueMicrotask(() => releaseImageTask(id));
    if (task.status === "completed") refreshFinishedItem(id, "historyImages");
  }
}

function applyAudioRuntimeTask(id: number, task: RuntimeTask) {
  mergeAssetPatch(id, {
    audioBindState: task.status === "completed" ? "已完成" : task.status === "failed" || task.status === "cancelled" ? "生成失败" : "生成中",
  });
  if (task.status === "failed" || task.status === "cancelled") window.$message.error(task.reason || $t("workbench.cornerScape.msg.promptGenFail"));
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    queueMicrotask(() => releaseAudioTask(id));
    if (task.status === "completed") refreshFinishedItem(id, "relepedAudio");
  }
}

function syncRuntimeTasks() {
  const activeImageIds = new Set<number>();
  const activePromptIds = new Set<number>();
  const activeAudioIds = new Set<number>();
  visibleAssetItems.value.forEach((item) => {
    if (isImageTaskActive(item)) {
      activeImageIds.add(item.id);
      const key = createTaskKey("assetImage", Number(project.value?.id), item.id, undefined, item.taskId);
      const existing = taskCenter.getTask(key);
      if (!imageTaskBindings.has(item.id) || (item.taskId && existing?.unifiedTaskId !== item.taskId)) {
        releaseImageTask(item.id);
        imageTaskBindings.set(
          item.id,
          taskCenter.registerTask(
            {
              key,
              domain: "assetImage",
              unifiedTaskId: item.taskId,
              legacyTaskId: item.legacyTaskId,
              targetType: "asset",
              targetId: item.id,
              projectId: Number(project.value?.id),
              status: getImageTaskStatus(item),
            },
            (task) => applyImageRuntimeTask(item.id, task),
          ),
        );
      }
    }
    if (isPromptTaskActive(item)) {
      activePromptIds.add(item.id);
      const key = createTaskKey("assetPrompt", Number(project.value?.id), item.id, undefined, item.promptTaskId);
      const existing = taskCenter.getTask(key);
      if (!promptTaskBindings.has(item.id) || (item.promptTaskId && existing?.unifiedTaskId !== item.promptTaskId)) {
        releasePromptTask(item.id);
        promptTaskBindings.set(
          item.id,
          taskCenter.registerTask(
            {
              key,
              domain: "assetPrompt",
              unifiedTaskId: item.promptTaskId,
              legacyTaskId: item.legacyTaskId,
              targetType: "assetPrompt",
              targetId: item.id,
              projectId: Number(project.value?.id),
              status: normalizeTaskStatus(item.promptState, "processing"),
            },
            (task) => applyPromptRuntimeTask(item.id, task),
          ),
        );
      }
    }
    if (isAudioTaskActive(item)) {
      activeAudioIds.add(item.id);
      const key = createTaskKey("audioBind", Number(project.value?.id), item.id, undefined, item.audioTaskId);
      const existing = taskCenter.getTask(key);
      if (!audioTaskBindings.has(item.id) || (item.audioTaskId && existing?.unifiedTaskId !== item.audioTaskId)) {
        releaseAudioTask(item.id);
        audioTaskBindings.set(
          item.id,
          taskCenter.registerTask(
            {
              key,
              domain: "audioBind",
              unifiedTaskId: item.audioTaskId,
              legacyTaskId: item.legacyTaskId,
              targetType: "audioBind",
              targetId: item.id,
              projectId: Number(project.value?.id),
              status: normalizeTaskStatus(item.audioBindState, "processing"),
            },
            (task) => applyAudioRuntimeTask(item.id, task),
          ),
        );
      }
    }
  });
  Array.from(imageTaskBindings.keys()).forEach((id) => {
    if (!activeImageIds.has(id)) releaseImageTask(id);
  });
  Array.from(promptTaskBindings.keys()).forEach((id) => {
    if (!activePromptIds.has(id)) releasePromptTask(id);
  });
  Array.from(audioTaskBindings.keys()).forEach((id) => {
    if (!activeAudioIds.has(id)) releaseAudioTask(id);
  });
}
async function removeAudio(id: number) {
  editForm.relepedAudio = editForm.relepedAudio.filter((a) => a.id !== id);
  await axios.post("/cornerScape/updateAssetsAudio", {
    assetsId: editForm.assetsId,
  });
}
async function selectAudio() {
  const assets = await openAssetsSelector({
    title: $t("workbench.script.add.msg.selectAssetsTitle"),
    types: ["audio"],
    selectorMode: true,
    multiple: false,
  });
  if (assets.length) {
    editForm.relepedAudio = [{ id: assets[0].id, name: assets[0].name }];
    await axios.post("/cornerScape/updateAssetsAudio", {
      assetsId: editForm.assetsId,
      audioIds: editForm.relepedAudio.map((i) => i.id),
    });
  }
}
</script>

<style lang="scss" scoped>
.cornerScape {
  width: 100%;
  height: 100%;
  min-height: 0;
  align-items: flex-start;
  .left {
    width: clamp(240px, 22vw, 320px);
    height: 100%;
    min-height: 0;
    flex-shrink: 0;
    margin-right: 16px;
    margin-bottom: 16px;
    display: flex;
    flex-direction: column;
    .btnGap {
      gap: 8px;
      width: 100%;
      flex-wrap: wrap;
    }
    .selectedInfo {
      width: 100%;
      text-align: center;
    }
    .card {
      height: 100%;
      min-height: 0;
      display: flex;
      flex-direction: column;
      overflow: auto;
      :deep(.t-card__body) {
        flex: 1;
        min-height: 0;
        overflow: auto;
      }
    }
    :deep(.t-form) {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    :deep(.t-form__item) {
      margin-bottom: 0;
    }
    .quickActions {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
      :deep(.t-button) {
        width: 100%;
      }
    }
    .filterGroup {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
  }
  .content {
    overflow: auto;
    height: 100%;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 16px;
    .assetGroup {
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: 100%;
    }
    .groupHeader {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 15px;
      font-weight: 700;
      color: var(--td-text-color-primary);
    }
    .groupGrid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(270px, 1fr));
      align-items: start;
      gap: 16px;
    }
    .assetFamily {
      display: flex;
      flex-direction: column;
      gap: 10px;
      min-width: 0;
    }
    .derivedList {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 10px;
      padding-left: 12px;
      border-left: 2px solid var(--td-component-border, #e7e7e7);
    }
    .card {
      cursor: pointer;
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
      :deep(.t-card__body) {
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }
      .imageBox {
        position: relative;
        width: 100%;
        height: 160px;
        background-color: #f5f7fa;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        .selectBox {
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 10;
        }
        .cancelGeneration {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s;
          cursor: pointer;
          font-size: 12px;
        }
        .cardActions {
          position: absolute;
          right: 8px;
          bottom: 8px;
          z-index: 10;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        .derivedBadge {
          position: absolute;
          top: 8px;
          right: 8px;
          z-index: 10;
        }
        .generatingBox {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: 100%;
          height: 100%;
          background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
          .generatingText {
            font-size: 13px;
            color: var(--td-brand-color);
            letter-spacing: 0.05em;
          }
        }
        .image {
          width: 100%;
          height: 100%;
          :deep(.t-image__img) {
            width: 100%;
            height: 100%;
            object-fit: contain;
          }
        }
        .imageToolsWrap {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease;
        }
        :deep(.t-empty) {
          width: 100%;
        }
      }
      &:hover {
        .imageToolsWrap {
          opacity: 1;
          pointer-events: auto;
        }
        .cancelGeneration {
          opacity: 1;
          pointer-events: auto;
        }
        .cardActions {
          opacity: 1;
          pointer-events: auto;
        }
      }
      .infoBox {
        flex: 1;
        padding: 8px 0;
        overflow: hidden;
        cursor: pointer;
        .title {
          font-size: 14px;
          font-weight: 600;
          line-height: 1.5;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .meta {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          margin-top: 4px;
          .typeTag {
            flex-shrink: 0;
          }
          .stateTag {
            flex-shrink: 0;
          }
          .modelTag {
            min-width: 0;
            max-width: 100%;
            overflow: hidden;
            :deep(.t-tag__text) {
              overflow: hidden;
              text-overflow: ellipsis;
              white-space: nowrap;
            }
          }
        }
        .prompt {
          margin-top: 4px;
          font-size: 12px;
          color: var(--td-text-color-secondary);
          line-height: 1.5;
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          line-clamp: 2;
          -webkit-box-orient: vertical;
        }
      }
    }
  }
}

.drawerHeader {
  display: flex;
  align-items: center;
  gap: 8px;
}
.audioList {
  margin-top: 8px;
}
.drawerImageBox {
  width: 100%;
  min-height: 120px;
  max-height: 400px;
  background-color: #f5f7fa;
  border-radius: 6px;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;

  .image {
    width: 100%;
    height: auto;
    :deep(.t-image__img) {
      max-height: 400px;
      object-fit: contain;
    }
  }
  .generatingBox {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    .generatingText {
      font-size: 13px;
      color: var(--td-brand-color);
    }
  }
  .imageToolsWrap {
    opacity: 1;
    pointer-events: auto;
  }
}

.historyImageList {
  gap: 10px;
  overflow-x: auto;
  overflow-y: hidden;
  max-width: 100%;
  width: 0;
  min-width: 100%;
  flex-shrink: 1;
  padding-bottom: 4px;

  &::-webkit-scrollbar {
    height: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: #c1c1c1;
    border-radius: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
}

.historyImageItem {
  border-radius: 4px;
  border: 3px solid transparent;
  cursor: pointer;
  transition: border-color 0.2s;
  flex-shrink: 0;
  overflow: hidden;

  &:hover {
    border-color: var(--td-brand-color-light);
  }
  &.selected {
    border-color: var(--td-brand-color);
  }
}

.drawerActions {
  display: flex;
  gap: 8px;
  width: 100%;
  :deep(.t-button) {
    flex: 1;
  }
}
</style>
