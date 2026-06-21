<template>
  <t-card class="assetCard">
    <div v-if="asset.src" class="assetImageWrap">
      <t-image :src="asset.src" fit="contain" class="assetImage" :preview="true">
        <template #overlayContent>
          <div class="imageToolsWrap show">
            <ImageTools :src="asset.src" position="br" />
          </div>
        </template>
      </t-image>
    </div>
    <div v-else class="assetImageWrap assetImagePlaceholder">
      <t-loading v-if="isActive" size="small" />
      <span v-else-if="taskStatus === 'failed' || taskStatus === 'cancelled'" style="color: red">{{ $t("workbench.production.node.assets.generateFailed") }}</span>
      <t-empty v-else size="small" :title="$t('workbench.production.node.assets.notGenerated')" />
    </div>
    <div class="cardInfo">
      <div class="cardName">
        <span class="nameText">{{ asset.name }}</span>
        <t-tag theme="success">{{ $t("workbench.production.node.assets.originalAsset") }}</t-tag>
      </div>
      <div class="cardDesc">{{ asset.desc }}</div>
    </div>
  </t-card>
</template>

<script setup lang="ts">
import type { AssetItem } from "../../../utils/flowBuilder";
import { normalizeTaskStatus } from "@/stores/taskCenter";

const props = defineProps<{
  asset: AssetItem;
}>();

const taskStatus = computed(() => normalizeTaskStatus(props.asset.status ?? props.asset.state, "pending"));
const isActive = computed(() => ["queued", "submitting", "processing"].includes(taskStatus.value));
</script>
