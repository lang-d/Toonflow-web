<template>
  <t-card class="assetCard deriveCard">
    <div v-if="item.src && taskStatus === 'completed'" class="assetImageWrap">
      <t-image :src="item.src" fit="contain" class="assetImage" :preview="true">
        <template #overlayContent>
          <div class="imageToolsWrap show">
            <ImageTools :src="item.src" position="br" />
          </div>
        </template>
      </t-image>
    </div>
    <div v-else class="assetImageWrap assetImagePlaceholder">
      <t-loading v-if="isActive" size="small" />
      <t-tooltip v-else-if="taskStatus === 'failed' || taskStatus === 'cancelled'" :content="item?.errorReason">
        <div style="color: red; cursor: pointer">{{ $t("workbench.novel.genFailed") }}</div>
      </t-tooltip>
      <t-empty v-else size="small" :title="$t('workbench.production.node.assets.notGenerated')" />
    </div>
    <div class="assetActions" @click.stop>
      <t-tooltip :content="$t('workbench.production.node.assets.generateSingle')">
        <t-button size="small" shape="circle" :loading="isActive" @click="emit('generate', item)">
          <template #icon><i-play-one /></template>
        </t-button>
      </t-tooltip>
      <t-tooltip :content="$t('workbench.production.node.storyboard.editNode')">
        <t-button size="small" shape="circle" @click="emit('edit', item, parentSrc)">
          <template #icon><i-edit /></template>
        </t-button>
      </t-tooltip>
      <t-tooltip :content="$t('workbench.production.node.storyboard.deleteNode')">
        <t-button size="small" shape="circle" theme="danger" @click="emit('remove', item.id!)">
          <template #icon><i-delete /></template>
        </t-button>
      </t-tooltip>
    </div>
    <div class="cardInfo">
      <div class="cardName">
        <span class="nameText">{{ item.name }}</span>
        <t-tag theme="warning">{{ $t("workbench.production.node.assets.derived") }}</t-tag>
      </div>
      <div class="cardDesc">{{ item.desc }}</div>
    </div>
  </t-card>
</template>

<script setup lang="ts">
import type { DeriveAsset } from "../../../utils/flowBuilder";
import { normalizeTaskStatus } from "@/stores/taskCenter";

const props = defineProps<{
  item: DeriveAsset;
  parentSrc: string;
}>();

const taskStatus = computed(() => normalizeTaskStatus(props.item.status ?? props.item.state, "pending"));
const isActive = computed(() => ["queued", "submitting", "processing"].includes(taskStatus.value));

const emit = defineEmits<{
  generate: [item: DeriveAsset];
  edit: [item: DeriveAsset, parentSrc: string];
  remove: [id: number];
}>();
</script>
