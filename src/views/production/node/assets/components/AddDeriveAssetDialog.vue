<template>
  <t-dialog
    v-model:visible="visible"
    attach="body"
    placement="center"
    :z-index="12000"
    destroy-on-close
    :close-on-overlay-click="false"
    dialog-class-name="derive-asset-dialog"
    :header="$t('workbench.production.node.assets.addDerivedAsset')"
    width="520px"
    :confirmBtn="$t('common.confirm')"
    :cancelBtn="$t('common.cancel')"
    :confirm-loading="confirmLoading"
    @confirm="emit('confirm')">
    <div v-if="parentName" class="derive-asset-dialog__parent">
      <span class="derive-asset-dialog__parent-label">{{ $t("workbench.production.node.assets.originalAsset") }}</span>
      <strong>{{ parentName }}</strong>
    </div>
    <t-form class="derive-asset-dialog__form" label-align="top">
      <t-form-item :label="$t('workbench.production.node.assets.assetName')" required-mark>
        <t-input
          v-model="form.name"
          clearable
          :maxlength="40"
          :placeholder="$t('workbench.production.node.assets.assetName')" />
      </t-form-item>
      <t-form-item :label="$t('workbench.production.node.assets.assetDesc')">
        <t-textarea
          v-model="form.desc"
          :maxlength="500"
          :placeholder="$t('workbench.production.node.assets.assetDesc')"
          :autosize="{ minRows: 4, maxRows: 8 }" />
      </t-form-item>
    </t-form>
  </t-dialog>
</template>

<script setup lang="ts">
const visible = defineModel<boolean>("visible", { default: false });

defineProps<{
  parentName?: string;
  confirmLoading?: boolean;
  form: {
    name: string;
    desc: string;
  };
}>();

const emit = defineEmits<{
  confirm: [];
}>();
</script>

<style lang="scss">
.derive-asset-dialog {
  max-width: calc(100vw - 32px);
  border-radius: 8px;

  .t-dialog__header {
    padding-bottom: 16px;
    font-size: 18px;
  }

  .t-dialog__body {
    padding-top: 0;
  }

  .derive-asset-dialog__parent {
    display: flex;
    align-items: center;
    gap: 10px;
    min-height: 40px;
    margin-bottom: 18px;
    padding: 10px 12px;
    color: var(--td-text-color-primary);
    background: var(--td-bg-color-container-hover);
    border-radius: 6px;
  }

  .derive-asset-dialog__parent-label {
    color: var(--td-text-color-secondary);
  }

  .derive-asset-dialog__form {
    .t-form__item:last-child {
      margin-bottom: 0;
    }
  }
}
</style>
