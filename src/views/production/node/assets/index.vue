<template>
  <t-card class="assets">
    <Handle :id="props.handleIds.target" type="target" :position="Position.Top" />
    <div class="titleBar dragHandle">
      <div class="title">{{ $t("workbench.production.node.assets.title") }}</div>
    </div>
    <div class="content">
      <AssetsGrid :assets="assets" @generate="generateDeriveAsset" @edit="openEdit" @remove="removeFn" @add="openAddDialog" />
    </div>
    <editImage v-model="visible" v-if="visible" :flowData="currentRow" @save="save" />
    <AddDeriveAssetDialog
      v-model:visible="addVisible"
      :form="addForm"
      :parent-name="currentParentAsset?.name"
      :confirm-loading="addSubmitting"
      @confirm="submitAddDerive" />
  </t-card>
</template>

<script setup lang="ts">
import { Handle, Position } from "@vue-flow/core";
import editImage from "../../components/editImage/index.vue";
import { type AssetItem, type DeriveAsset } from "../../utils/flowBuilder";
import type { ImageFlowSavePayload } from "../../utils/editImageType";
import axios from "@/utils/axios";
import useProjectStore from "@/stores/project";
import productionAgentStore from "@/stores/productionAgent";
import AssetsGrid from "./components/AssetsGrid.vue";
import AddDeriveAssetDialog from "./components/AddDeriveAssetDialog.vue";
import "./styles.scss";

const { project } = storeToRefs(useProjectStore());
const productionStore = productionAgentStore();
const { episodesId } = storeToRefs(productionStore);
const props = defineProps<{
  id: string;
  handleIds: {
    target: string;
  };
}>();

const assets = defineModel<AssetItem[]>({ required: true });
const currentRow = ref<{
  flowId?: number | null;
  targetType?: "deriveAsset";
  targetId?: number | null;
  resultImages: { src: string; prompt: string }[];
  referanceImages: string[];
}>({
  flowId: null,
  targetType: "deriveAsset",
  targetId: null,
  resultImages: [],
  referanceImages: [],
});
const visible = ref(false);
const currentAssetsId = ref<number | null>(null);
const addVisible = ref(false);
const addSubmitting = ref(false);
const currentParentAsset = ref<AssetItem | null>(null);
const addForm = reactive({
  name: "",
  desc: "",
});

function openEdit(row: DeriveAsset, referanceImageUrl: string) {
  currentRow.value = {
    flowId: row?.flowId ?? null,
    targetType: "deriveAsset",
    targetId: row.id,
    resultImages: [{ src: row.src, prompt: row.prompt }],
    referanceImages: referanceImageUrl ? [referanceImageUrl] : [],
  };
  currentAssetsId.value = row.id;
  visible.value = true;
}

async function generateDeriveAsset(row: DeriveAsset) {
  if (!row.id || row.state === "生成中") return;
  row.errorReason = "";
  try {
    await persistDeriveAssetPrompt(row);
    await productionStore.batchGenerateAssets([row.id]);
  } catch (e) {
    row.errorReason = (e as any)?.message ?? "";
    window.$message.error(row.errorReason || $t("workbench.novel.genFailed"));
  }
}

async function persistDeriveAssetPrompt(row: DeriveAsset) {
  await axios.post("/assets/updateAssets", {
    id: row.id,
    name: row.name,
    describe: row.desc ?? "",
    type: row.type,
    remark: "",
    prompt: row.prompt ?? "",
  });
}

function openAddDialog(asset: AssetItem) {
  currentParentAsset.value = asset;
  addForm.name = "";
  addForm.desc = "";
  addVisible.value = true;
}

async function submitAddDerive() {
  const parent = currentParentAsset.value;
  if (!parent || addSubmitting.value) return;
  if (!addForm.name.trim()) return window.$message.warning($t("workbench.production.node.assets.assetNameRequired"));
  addSubmitting.value = true;
  try {
    const { data } = await axios.post("/production/assets/addDeriveAsset", {
      projectId: project.value?.id,
      scriptId: episodesId.value,
      assetsId: parent.id,
      name: addForm.name.trim(),
      desc: addForm.desc.trim(),
    });
    parent.derive ||= [];
    parent.derive.push({
      id: data.id,
      assetsId: data.assetsId ?? parent.id,
      name: data.name ?? addForm.name.trim(),
      prompt: data.prompt ?? "",
      desc: data.desc ?? addForm.desc.trim(),
      src: data.src ?? "",
      flowId: data.flowId,
      state: data.state ?? "未生成",
      type: data.type ?? parent.type,
      errorReason: data.errorReason ?? "",
    });
    addVisible.value = false;
    window.$message.success($t("common.addSuccess"));
  } catch (e) {
    window.$message.error((e as any)?.message || $t("common.addFailed"));
  } finally {
    addSubmitting.value = false;
  }
}

async function save({ imageUrl, media, flowId, prompt }: ImageFlowSavePayload) {
  const targetId = currentRow.value.targetId ?? currentAssetsId.value;
  if (!targetId || !flowId) return;
  let targetAsset: DeriveAsset | null = null;

  for (const asset of assets.value) {
    const target = asset.derive.find((item) => item.id === targetId);
    if (!target) continue;
    targetAsset = target;
    target.flowId = flowId;
    if (prompt !== undefined) target.prompt = prompt;
    if (imageUrl) {
      target.src = imageUrl;
      target.media = media;
      target.status = "completed";
      target.state = "已完成";
      target.errorReason = "";
      delete target.taskId;
      delete target.legacyTaskId;
      delete target.imageId;
    }
    break;
  }

  currentRow.value.flowId = flowId;
  if (prompt !== undefined && currentRow.value.resultImages[0]) {
    currentRow.value.resultImages[0].prompt = prompt;
  }
  if (imageUrl) {
    currentRow.value.resultImages = [
      {
        src: imageUrl,
        prompt: prompt ?? currentRow.value.resultImages[0]?.prompt ?? "",
      },
    ];
  }
  if (targetAsset && prompt !== undefined) {
    try {
      await persistDeriveAssetPrompt(targetAsset);
    } catch (e) {
      window.$message.error((e as any)?.message || $t("workbench.production.editImage.saveFailed"));
    }
  }
}

async function removeFn(id: number) {
  const dialog = DialogPlugin.confirm({
    header: $t("workbench.assets.confirmDeleteHeader"),
    body: $t("workbench.production.node.assets.confirmDeleteBody"),
    confirmBtn: $t("workbench.assets.deleteBtn"),
    cancelBtn: $t("workbench.assets.cancelBtn"),
    theme: "warning",
    onConfirm: async () => {
      try {
        await axios.post("/production/assets/deleteAssetsDireve", {
          id,
          projectId: project.value?.id,
        });
        assets.value.forEach((item) => {
          const targetIndex = item.derive.findIndex((s) => s.id === id);
          if (targetIndex !== -1) {
            item.derive.splice(targetIndex, 1);
          }
        });
      } catch (e) {
        window.$message.error((e as any)?.message || $t("workbench.production.node.assets.removeFailed"));
      } finally {
        dialog.destroy();
      }
    },
  });
}
</script>
