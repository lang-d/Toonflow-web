<template>
  <div class="cardGrid">
    <div v-for="asset in assets" :key="asset.id" class="assetItemBox">
      <AssetCard :asset="asset" />
      <div class="divider">
        <i-right size="32"></i-right>
      </div>
      <div class="deriveAssets">
        <DeriveAssetCard
          v-for="item in asset.derive"
          :key="item.id"
          :item="item"
          :parent-src="asset.src"
          @generate="emit('generate', $event)"
          @edit="emit('edit', $event, asset.src)"
          @remove="emit('remove', $event)" />
        <t-card class="assetCard addCard" @mousedown.stop @click.stop="emit('add', asset)">
          <i-plus />
          <span>{{ $t("workbench.production.node.assets.addDerivedAsset") }}</span>
        </t-card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AssetItem, DeriveAsset } from "../../../utils/flowBuilder";
import AssetCard from "./AssetCard.vue";
import DeriveAssetCard from "./DeriveAssetCard.vue";

defineProps<{
  assets: AssetItem[];
}>();

const emit = defineEmits<{
  generate: [item: DeriveAsset];
  edit: [item: DeriveAsset, parentSrc: string];
  remove: [id: number];
  add: [asset: AssetItem];
}>();
</script>
