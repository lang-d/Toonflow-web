<template>
  <div class="cornerScape">
    <div class="content">
      <template v-if="selectableAssetItems.length > 0">
        <section v-for="group in groupedDataList" :key="group.type" class="assetGroup">
          <div class="groupHeader">
            <span>{{ group.label }}</span>
            <t-tag size="small" theme="primary" variant="light">{{ group.count }}</t-tag>
          </div>
          <div class="groupGrid">
            <div v-for="item in group.items" :key="item.id" class="assetFamily">
              <t-popup trigger="hover" placement="top" :show-arrow="true" overlay-class-name="assetDossierPopup">
                <template #content>
                  <div class="assetDossier">
                    <div class="dossierHead">
                      <strong>{{ item.name || $t("workbench.cornerScape.unnamed") }}</strong>
                      <div class="dossierTags">
                        <t-tag size="small" variant="light-outline" theme="warning">{{ getTypeLabel(item.type) }}</t-tag>
                        <t-tag size="small" :theme="getPromptStateTheme(item)" variant="light">{{ getPromptStateLabel(item) }}</t-tag>
                      </div>
                    </div>
                    <div class="dossierBlock">
                      <span>{{ $t("workbench.cornerScape.foundationDescribe") }}</span>
                      <p>{{ getFoundationDisplay(item) || $t("workbench.cornerScape.foundationEmpty") }}</p>
                    </div>
                    <div class="dossierBlock">
                      <span>{{ $t("workbench.cornerScape.foundationPrompt") }}</span>
                      <p>{{ item.prompt || $t("workbench.cornerScape.promptEmpty") }}</p>
                    </div>
                    <div v-if="isFoundationFailed(item) && getFoundationFailureReason(item)" class="dossierBlock dossierFailure">
                      <span>{{ $t("workbench.task.col.reason") }}</span>
                      <p>{{ getFoundationFailureReason(item) }}</p>
                    </div>
                    <div class="dossierBlock">
                      <span>{{ $t("workbench.production.node.assets.addDerivedAsset") }}</span>
                      <div v-if="getDerivedAssets(item).length" class="dossierTagList">
                        <t-tag v-for="child in getDerivedAssets(item)" :key="child.id" size="small" variant="outline">
                          {{ child.name || $t("workbench.cornerScape.unnamed") }}
                        </t-tag>
                      </div>
                      <p v-else>{{ $t("workbench.production.node.assets.noDerivedAssets") }}</p>
                    </div>
                    <div class="dossierBlock">
                      <span>{{ $t("workbench.cornerScape.assetsAudioLabel") }}</span>
                      <div v-if="item.relepedAudio.length" class="dossierTagList">
                        <t-tag v-for="audio in item.relepedAudio" :key="audio.id" size="small" variant="outline" theme="primary">{{ audio.name }}</t-tag>
                      </div>
                      <p v-else>{{ $t("workbench.cornerScape.noAudio") }}</p>
                    </div>
                  </div>
                </template>
                <t-card shadow class="card assetCard" @click="openDrawer(item)">
                  <div class="imageBox">
                    <t-checkbox
                      class="selectBox"
                      :model-value="selectedIds.includes(item.id)"
                      @click.stop
                      @change="(checked: boolean) => setSelected(item.id, checked)" />
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
                    <t-image v-else-if="getAssetPreviewUrl(item)" class="image" :src="getAssetPreviewUrl(item)" :fit="getCardImageFit(item)" :preview="false" :lazy="true">
                      <template #error>
                        <t-empty type="fail" :title="$t('workbench.cornerScape.imageError')" />
                      </template>
                      <template #overlayContent>
                        <div class="imageToolsWrap">
                          <ImageTools :src="getAssetPreviewUrl(item)" position="br" />
                        </div>
                      </template>
                    </t-image>
                    <t-empty v-else type="maintenance" :title="$t('workbench.cornerScape.waitingGen')" />
                  </div>
                  <div class="infoBox">
                    <div class="title">
                      <span class="assetNameText">{{ item.name || $t("workbench.cornerScape.unnamed") }}</span>
                      <t-tag size="small" variant="light" :theme="getPromptStateTheme(item)">{{ getPromptStateLabel(item) }}</t-tag>
                    </div>
                    <div class="meta">
                      <t-tag size="small" variant="light-outline" theme="warning" class="typeTag">{{ getTypeLabel(item.type) }}</t-tag>
                      <t-tag size="small" variant="outline" class="stateTag" v-if="item.model">{{ item.model }}</t-tag>
                      <t-tag size="small" variant="outline" v-if="item.resolution">{{ item.resolution }}</t-tag>
                      <t-tag size="small" variant="outline" theme="primary" v-if="getDerivedAssets(item).length">
                        {{ getDerivedAssets(item).length }} {{ $t("workbench.production.node.assets.derived") }}
                      </t-tag>
                    </div>
                    <div class="prompt" v-if="getFoundationDisplay(item)">
                      {{ getTypeLabel(item.type) }}{{ $t("workbench.cornerScape.descriptionSuffix") }}{{ getFoundationDisplay(item) }}
                    </div>
                    <div v-if="item.relepedAudio.length" class="audioChipList">
                      <t-tag v-for="audio in item.relepedAudio" :key="audio.id" size="small" variant="outline" theme="primary">{{ audio.name }}</t-tag>
                    </div>
                  </div>
                </t-card>
              </t-popup>
            </div>
          </div>
        </section>
      </template>
      <t-empty v-else type="empty" :title="$t('workbench.cornerScape.operateScriptFirst')" />
      <t-drawer
        :closeBtn="true"
        closeOnEscKeydown
        :showOverlay="false"
        :footer="false"
        placement="right"
        v-model:visible="drawerVisible"
        size="min(860px, 82vw)"
        class="assetDetailDrawer">
        <template #header>
          <div class="drawerHeader drawerHeaderV2">
            <div class="drawerTitleGroup">
              <strong>{{ currentItem?.name || $t("workbench.cornerScape.unnamed") }}</strong>
              <span v-if="currentParentAsset">所属主资产：{{ currentParentAsset.name || $t("workbench.cornerScape.unnamed") }}</span>
              <span v-else>{{ $t("workbench.cornerScape.individualConfig") }}</span>
            </div>
            <div class="drawerHeaderTags">
              <t-button v-if="currentParentAsset" size="small" variant="outline" @click.stop="openParentAsset">
                <template #icon><t-icon name="arrow-left" /></template>
                返回主资产
              </t-button>
              <t-tag size="medium" variant="light-outline" theme="warning">{{ getTypeLabel(currentItem?.type) }}</t-tag>
              <t-tag v-if="currentItem && isDerivedAsset(currentItem)" size="medium" theme="warning" variant="light">
                {{ $t("workbench.production.node.assets.derived") }}
              </t-tag>
              <t-tag v-if="currentItem" size="medium" :theme="getPromptStateTheme(currentItem)" variant="light">
                {{ getPromptStateLabel(currentItem) }}
              </t-tag>
            </div>
          </div>
        </template>
        <div v-if="currentItem" class="detailEditor">
          <section class="detailHero">
            <div class="detailMediaColumn">
              <div class="drawerImageBox">
                <div v-if="isImageTaskActive(currentItem)" class="generatingBox">
                  <t-loading />
                  <span class="generatingText">{{ $t("workbench.cornerScape.generating") }}</span>
                </div>
                <t-empty v-else-if="isImageTaskFailed(currentItem)" type="fail" :title="$t('workbench.cornerScape.genFailed')" />
                <t-image v-else-if="currentItem.filePath" class="image" :src="currentItem.filePath" fit="contain" :preview="false">
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
              <div class="detailHistoryStrip">
                <div class="detailSectionTitle">{{ $t("workbench.cornerScape.history") }}</div>
                <t-loading :loading="historyLoading" style="width: 100%">
                  <div class="historyImageList f">
                    <div
                      v-for="item in currentItem.historyImages"
                      :key="item.id"
                      class="historyImageItem"
                      :class="{ selected: selectedHistoryId === item.id }"
                      @click.stop="toggleHistorySelect(item.id)">
                      <t-image :src="item.filePath" :style="{ width: '76px', minWidth: '76px', height: '76px' }" :lazy="true" fit="contain" />
                    </div>
                    <t-empty v-if="!currentItem.historyImages.length && !historyLoading" size="small" />
                  </div>
                </t-loading>
              </div>
            </div>
            <t-form class="detailIdentityForm" labelAlign="top">
              <t-form-item :label="$t('workbench.production.node.assets.assetName')">
                <t-input v-model="editForm.name" :placeholder="$t('workbench.assets.add.namePh')" />
              </t-form-item>
              <div class="detailFormGrid">
                <t-form-item :label="$t('workbench.cornerScape.genModel')">
                  <modelSelect v-model="detailModelValue" :type="`image`" />
                </t-form-item>
                <t-form-item :label="$t('workbench.cornerScape.resolution')">
                  <t-select v-model="editForm.resolution" :placeholder="$t('workbench.cornerScape.resolutionPh')" :options="resolutionOptions" />
                </t-form-item>
              </div>
              <div class="detailTags">
                <t-tag size="small" variant="light-outline" theme="warning">{{ getTypeLabel(currentItem.type) }}</t-tag>
                <t-tag v-if="isDerivedAsset(currentItem)" size="small" theme="warning" variant="light">{{ $t("workbench.production.node.assets.derived") }}</t-tag>
                <t-tag size="small" :theme="getPromptStateTheme(currentItem)" variant="light">{{ getPromptStateLabel(currentItem) }}</t-tag>
              </div>
            </t-form>
          </section>

          <section class="detailSection">
            <div class="detailSectionTitle">{{ $t("workbench.cornerScape.foundationDescribe") }}</div>
            <t-textarea v-model="editForm.foundationText" :placeholder="$t('workbench.assets.add.describePh')" :autosize="{ minRows: 4, maxRows: 8 }" />
            <div v-if="currentItem && getFoundationFailureReason(currentItem)" class="foundationErrorReason">{{ getFoundationFailureReason(currentItem) }}</div>
          </section>

          <section class="detailSection">
            <div class="detailSectionTitle">{{ $t("workbench.cornerScape.foundationPrompt") }}</div>
            <t-loading style="width: 100%" :loading="isPromptTaskActive(currentItem)">
              <t-textarea
                v-model="editForm.prompt"
                :placeholder="$t('workbench.cornerScape.promptPh')"
                :autosize="{ minRows: 5, maxRows: 10 }"
                :disabled="polishing" />
            </t-loading>
          </section>

          <section class="detailSection">
            <div class="detailSectionTitle detailSectionTitleAction">
              <span>{{ $t("workbench.production.node.assets.addDerivedAsset") }}</span>
              <t-button size="small" variant="outline" @click="openAssetDialog(currentItem)">
                <template #icon><i-plus /></template>
                {{ $t("workbench.production.node.assets.addDerivedAsset") }}
              </t-button>
            </div>
            <button v-if="currentParentAsset" type="button" class="parentAssetItem" @click="openParentAsset">
              <div class="derivedEditThumb">
                <t-image v-if="getAssetPreviewUrl(currentParentAsset)" :src="getAssetPreviewUrl(currentParentAsset)" fit="cover" :lazy="true" />
                <t-empty v-else size="small" />
              </div>
              <div class="derivedEditInfo">
                <strong>{{ currentParentAsset.name || $t("workbench.cornerScape.unnamed") }}</strong>
                <span>点击返回主资产，继续查看同级衍生资产</span>
              </div>
              <t-tag size="small" theme="primary" variant="light">主资产</t-tag>
            </button>
            <div v-if="getDerivedAssets(currentItem).length" class="derivedEditList">
              <button v-for="child in getDerivedAssets(currentItem)" :key="child.id" type="button" class="derivedEditItem" @click="openDrawer(child)">
                <div class="derivedEditThumb">
                  <t-image v-if="getAssetPreviewUrl(child)" :src="getAssetPreviewUrl(child)" fit="cover" :lazy="true" />
                  <t-empty v-else size="small" />
                </div>
                <div class="derivedEditInfo">
                  <strong>{{ child.name || $t("workbench.cornerScape.unnamed") }}</strong>
                  <span>{{ getFoundationDisplay(child) || child.prompt || $t("workbench.cornerScape.foundationEmpty") }}</span>
                </div>
                <t-tag size="small" theme="warning" variant="light">{{ $t("workbench.production.node.assets.derived") }}</t-tag>
              </button>
            </div>
            <div v-else class="assets-empty">{{ $t("workbench.production.node.assets.noDerivedAssets") }}</div>
          </section>

          <section class="detailSection">
            <div class="detailSectionTitle detailSectionTitleAction">
              <span>{{ $t("workbench.cornerScape.assetsAudioLabel") }}</span>
              <t-button size="small" theme="primary" variant="outline" @click="selectAudio">
                <template #icon><i-plus /></template>
                {{ $t("workbench.cornerScape.selectAudio") }}
              </t-button>
            </div>
            <div class="audioList" v-if="editForm.relepedAudio.length">
              <div v-for="audio in editForm.relepedAudio" :key="audio.id" class="audioBindItem">
                <div class="audioBindInfo">
                  <i-volume-notice size="16" />
                  <span>{{ audio.name }}</span>
                </div>
                <div class="audioBindActions">
                  <t-button
                    size="small"
                    variant="text"
                    :loading="isAudioActionLoading(audio, 'preview')"
                    :disabled="!canResolveAudio(audio)"
                    @click="openAudioClipDialog(audio, 'preview')">
                    试听
                  </t-button>
                  <t-button
                    size="small"
                    variant="text"
                    :loading="isAudioActionLoading(audio, 'clip')"
                    :disabled="!canResolveAudio(audio)"
                    @click="openAudioClipDialog(audio, 'clip')">
                    截取
                  </t-button>
                  <t-button size="small" variant="text" theme="danger" @click="removeAudio(audio.id)">
                    解绑
                  </t-button>
                </div>
              </div>
            </div>
            <div v-else class="assets-empty">{{ $t("workbench.cornerScape.noAudio") }}</div>
          </section>

          <div class="detailActionBar">
            <t-button theme="primary" :loading="assetSaving" @click="saveAssetProfile">{{ $t("common.save") }}</t-button>
            <t-button theme="default" variant="outline" :loading="uploadLoading" @click="uploadLocalAssetImage">
              <template #icon><i-upload /></template>
              {{ $t("workbench.production.generatedNode.localUpload") }}
            </t-button>
            <t-button theme="default" variant="outline" :loading="polishing" @click="polishPrompts" :disabled="isPromptTaskActive(currentItem)">
              <template #icon><t-icon name="edit" /></template>
              {{ $t("workbench.cornerScape.aiPolish") }}
            </t-button>
            <t-button theme="primary" variant="outline" @click="regenerateItem" :disabled="isImageTaskActive(currentItem)">
              <template #icon><t-icon name="refresh" /></template>
              {{ $t("workbench.cornerScape.regenerate") }}
            </t-button>
          </div>
        </div>
      </t-drawer>
      <t-dialog
        v-model:visible="assetDialogVisible"
        :header="assetDialogParent ? $t('workbench.production.node.assets.addDerivedAsset') : `${$t('workbench.assets.addPrefix')}${$t('workbench.menu.assetCenter')}`"
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
      <AudioClipDialog
        v-model:visible="audioClipVisible"
        :src="getAudioUrl(activeAudio)"
        :title="audioClipMode === 'clip' ? '截取音频片段' : '试听音频'"
        :name="activeAudio?.name"
        :mode="audioClipMode"
        save-label="Save and Bind"
        @save="saveAudioClipAsBoundAsset" />
    </div>
    <Teleport to="body">
      <aside class="batchDock" :class="{ expanded: batchDockOpen }" :title="$t('workbench.cornerScape.batchSettings')">
        <button v-if="!batchDockOpen" type="button" class="dockSideTab" @click="batchDockOpen = true">
          <span class="sideIcon"><t-icon name="setting" /></span>
          <strong>{{ selectedIds.length || selectableAssetItems.length }}</strong>
        </button>
        <div v-else class="dockPanel">
          <div class="dockHeader">
            <div>
              <strong>{{ $t("workbench.cornerScape.batchSettings") }}</strong>
              <p>{{ $t("workbench.cornerScape.selectedCount", { count: selectedIds.length }) }}</p>
            </div>
            <div class="dockHeaderActions">
              <t-tag size="small" theme="primary" variant="light">{{ selectableAssetItems.length }}</t-tag>
              <button type="button" class="dockClose" @click="batchDockOpen = false">
                <t-icon name="close" />
              </button>
            </div>
          </div>
          <div class="dockBody">
            <section class="dockSection">
              <div class="dockSectionTitle">{{ $t("workbench.cornerScape.quickActions") }}</div>
              <div class="dockQuickActions">
                <t-button size="small" theme="primary" variant="outline" @click="selectAll">{{ $t("workbench.cornerScape.selectAll") }}</t-button>
                <t-button size="small" theme="primary" variant="outline" @click="selectPromptEmpty()">{{ $t("workbench.cornerScape.selectPromptEmpty") }}</t-button>
                <t-button size="small" theme="primary" variant="outline" @click="selectFoundationMissing">{{ $t("workbench.cornerScape.selectUngenerated") }}</t-button>
                <t-button size="small" theme="primary" variant="outline" @click="toggleSelectAll">{{ $t("workbench.cornerScape.invertSelection") }}</t-button>
                <t-button size="small" theme="default" variant="outline" @click="clearSelection">{{ $t("workbench.cornerScape.clearSelection") }}</t-button>
                <t-button size="small" theme="default" variant="outline" @click="openAssetDialog()">
                  <template #icon><i-plus /></template>
                  {{ $t("workbench.assets.addPrefix") }}{{ $t("workbench.menu.assetCenter") }}
                </t-button>
              </div>
            </section>
            <section class="dockSection">
              <div class="dockSectionTitle">{{ $t("workbench.cornerScape.assetTypeFilter") }}</div>
              <t-checkbox-group @change="onChangeFn" v-model="checkboxValue" :options="translatedOptions" class="filterGroup" />
            </section>
            <section class="dockSection">
              <div class="dockSectionTitle">{{ $t("workbench.cornerScape.genModel") }}</div>
              <div class="dockTwoCol">
                <modelSelect v-model="batchModelValue" :type="`image`" :popup-props="dockSelectPopupProps" />
                <t-select
                  v-model="resolution"
                  :placeholder="$t('workbench.cornerScape.resolutionPh')"
                  :options="resolutionOptions"
                  :popup-props="dockSelectPopupProps" />
              </div>
              <t-textarea
                class="dockTextarea"
                v-model="otherTextPrompt"
                :placeholder="$t('workbench.cornerScape.foundationInstructionPh')"
                :autosize="{ minRows: 3, maxRows: 5 }" />
              <t-checkbox v-model="foundationOverwrite">{{ $t("workbench.cornerScape.foundationOverwrite") }}</t-checkbox>
            </section>
          </div>
          <div class="dockFooter">
            <t-button theme="primary" block @click="batchGenerationPrompt">{{ $t("workbench.cornerScape.generateFoundation") }}</t-button>
            <div class="dockFooterGrid">
              <t-button theme="primary" variant="outline" @click="batchSelectBindAudio">{{ $t("workbench.cornerScape.batchBingAudio") }}</t-button>
              <t-button theme="primary" variant="outline" @click="batchGenerationImage">{{ $t("workbench.cornerScape.startBatch") }}</t-button>
            </div>
            <t-button block theme="default" variant="outline" :disabled="!hasPreviewImages" @click="openBatchPreview">
              {{ $t("workbench.cornerScape.batchPreview") }}
            </t-button>
          </div>
        </div>
      </aside>
    </Teleport>
    <t-image-viewer
      v-model="batchPreviewVisible"
      :images="previewImages"
      :imageScale="{ defaultScale: 1.6, min: 0.2, max: 5, step: 0.2 }"
      :closeOnEscKeydown="true"
      :closeOnOverlay="true" />
  </div>
</template>

<script setup lang="ts">
import axios from "@/utils/axios";
import projectStore from "@/stores/project";
import modelSelect from "@/components/modelSelect.vue";
import settingStore from "@/stores/setting";
import openAssetsSelector from "@/utils/assetsCheck";
import useTaskCenterStore, { createTaskKey, normalizeTaskStatus, type RuntimeTask } from "@/stores/taskCenter";
import { attachLegacyMediaFields, getMediaDisplayUrls, getMediaOriginalUrl, getMediaPreviewUrl, getPlayableMediaUrl, normalizeMediaRef } from "@/utils/mediaRef";
import { normalizeAssetImageType } from "@/utils/assetImageTask";
import type { MediaRef } from "@/types/api";
import { useFileDialog } from "@vueuse/core";
import AudioClipDialog from "@/components/AudioClipDialog.vue";
import { generateAssetFoundation } from "@/api/assetFoundation";

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
  foundationText: string;
  foundationStatus: string;
  foundationErrorReason: string;
  promptState: string;
  historyImages: Image[];
  errorReason: string;
  promptErrorReason: string;
  relepedAudio: BoundAudio[];
  audioBindState: string;
  taskId?: string;
  legacyTaskId?: number | string;
  promptTaskId?: string;
  audioTaskId?: string;
  media?: MediaRef;
  sonAssets?: DataItem[];
}

interface BoundAudio {
  id: number;
  name: string;
  src?: string;
  url?: string;
  media?: MediaRef;
  prompt?: string;
  describe?: string;
  parentName?: string;
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
const batchModelValue = ref(project.value?.imageModel ?? "");
const detailModelValue = ref("");
const resolution = ref("1K");
const otherTextPrompt = ref("");
const foundationOverwrite = ref(false);
const batchDockOpen = ref(false);
const batchPreviewVisible = ref(false);
const assetSaving = ref(false);
const dockSelectPopupProps = {
  attach: "body",
  zIndex: 7800,
  overlayClassName: "cornerScapeDockSelectPopup",
};
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
const audioClipVisible = ref(false);
const activeAudio = ref<BoundAudio | null>(null);
const audioClipMode = ref<"preview" | "clip">("preview");
const audioAssetDetails = shallowRef(new Map<number, BoundAudio>());
const resolvingAudioAction = ref("");
let audioAssetProjectId: number | null = null;
let audioAssetIndexComplete = false;
let audioAssetLoadPromise: Promise<Map<number, BoundAudio>> | null = null;

const selectedIds = ref<number[]>([]);
const activeAssetId = ref<number | null>(null);
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
    group.count += 1;
  });
  return groups.filter((group) => group.items.length > 0);
});
const selectableAssetItems = computed(() => groupedDataList.value.flatMap((group) => group.items));
const selectedAssetItems = computed(() => selectedIds.value.map((id) => findAssetById(id)).filter((item): item is DataItem => Boolean(item)));

// 鐢ㄤ簬鍙栨秷杩涜涓殑鐢熸垚璇锋眰
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

function isDerivedAsset(item: DataItem) {
  if (!item.assetsId) return false;
  return Number(item.assetsId) !== Number(item.id);
}

function getParentAsset(item: DataItem) {
  if (!item.assetsId || Number(item.assetsId) === Number(item.id)) return null;
  return findAssetById(Number(item.assetsId));
}

function getDerivedAssets(item: DataItem) {
  return item.sonAssets ?? [];
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

function normalizeBoundAudio(row: any): BoundAudio {
  const playableUrl = getPlayableMediaUrl(row, "audio");
  const media = normalizeMediaRef(row?.media, "audio") ?? normalizeMediaRef(playableUrl || row, "audio");
  return {
    id: Number(row?.id),
    name: row?.name || media?.name || "音频",
    src: playableUrl,
    url: playableUrl,
    media,
    prompt: row?.prompt,
    describe: row?.describe,
    parentName: row?.parentName,
  };
}

function normalizeDataItem(row: any): DataItem {
  const media = normalizeMediaRef(row?.media ?? row, "image");
  const normalized = attachLegacyMediaFields({ ...row }, media) as DataItem;
  normalized.id = Number(row?.id);
  const parentId = row?.assetsId ?? row?.assetId ?? null;
  normalized.assetsId = parentId == null || parentId === "" ? null : Number(parentId);
  normalized.describe = row?.describe ?? row?.desc ?? normalized.describe ?? "";
  normalized.foundationText = row?.foundationText ?? normalized.foundationText ?? "";
  normalized.foundationStatus = row?.foundationStatus ?? row?.foundationState ?? normalized.foundationStatus ?? "";
  normalized.foundationErrorReason = row?.foundationErrorReason ?? normalized.foundationErrorReason ?? "";
  normalized.historyImages = normalizeHistoryImages(normalized);
  normalized.relepedAudio = Array.isArray(row?.relepedAudio) ? row.relepedAudio.map(normalizeBoundAudio) : [];
  normalized.sonAssets = getRawDerivedRows(row).map((item: any) => normalizeDataItem(item));
  normalized.errorReason = normalized.errorReason ?? "";
  normalized.promptErrorReason = normalized.promptErrorReason ?? "";
  normalized.promptState = normalized.promptState ?? "";
  normalized.audioBindState = normalized.audioBindState ?? "";
  normalized.state = normalized.state ?? "";
  return normalized;
}

function getResponseRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.list)) return payload.list;
  if (Array.isArray(payload?.assets)) return payload.assets;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function getRawDerivedRows(row: any): any[] {
  return [row?.sonAssets, row?.derive, row?.derivedAssets, row?.deriveAssets, row?.children, row?.childAssets].find(Array.isArray) ?? [];
}

function flattenRawAssetRows(rows: any) {
  const result: any[] = [];
  const visit = (row: any, parentId?: number) => {
    if (!row) return;
    const rowId = Number(row.id);
    const inheritedParentId = parentId != null && !row.assetsId && !row.assetId ? parentId : undefined;
    const children = getRawDerivedRows(row);
    result.push({
      ...row,
      assetsId: inheritedParentId ?? row.assetsId,
      assetId: inheritedParentId ?? row.assetId,
      sonAssets: [],
      derive: [],
      derivedAssets: [],
      deriveAssets: [],
      children: [],
      childAssets: [],
    });
    children.forEach((child) => visit(child, Number.isFinite(rowId) ? rowId : parentId));
  };
  getResponseRows(rows).forEach((row) => visit(row));
  return result;
}

function normalizeAssetTree(rows: any): DataItem[] {
  const byId = new Map<number, DataItem>();
  const orderedIds: number[] = [];
  flattenRawAssetRows(rows).forEach((row) => {
    const item = normalizeDataItem(row);
    if (!Number.isFinite(item.id)) return;
    const existing = byId.get(item.id);
    if (existing) {
      Object.assign(existing, item);
      existing.sonAssets = [];
      return;
    }
    item.sonAssets = [];
    byId.set(item.id, item);
    orderedIds.push(item.id);
  });
  const childIds = new Set<number>();

  orderedIds.forEach((id) => {
    const item = byId.get(id);
    if (!item) return;
    const parentId = Number(item.assetsId);
    if (!Number.isFinite(parentId) || parentId === item.id) return;
    const parent = byId.get(parentId);
    if (!parent) return;
    const children = (parent.sonAssets ??= []);
    if (!children.some((child) => child.id === item.id)) {
      children.push(item);
    }
    childIds.add(item.id);
  });

  return orderedIds.map((id) => byId.get(id)).filter((item): item is DataItem => Boolean(item && !childIds.has(item.id)));
}

function flattenAssetItems(items = dataList.value): DataItem[] {
  return items.flatMap((item) => [item, ...flattenAssetItems(item.sonAssets ?? [])]);
}

function getVisibleAssetItems() {
  return flattenAssetItems();
}

function findInAssetTree(items: DataItem[], id: number): DataItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    const child = findInAssetTree(item.sonAssets ?? [], id);
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
  editForm.foundationText = getFoundationDisplay(item);
  editForm.promptState = item.promptState || "";
  editForm.relepedAudio = item.relepedAudio ?? [];
}

function mergeAssetPatch(id: number, patch: Partial<DataItem>) {
  const target = findAssetById(id);
  if (!target) return null;
  Object.assign(target, patch);
  target.historyImages = normalizeHistoryImages(target);
  target.relepedAudio = Array.isArray(target.relepedAudio) ? target.relepedAudio.map(normalizeBoundAudio) : [];
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
    void hydrateBoundAudioDetails();
    syncSelectedIdsWithData();
    syncRuntimeTasks();
  } catch (error) {
    console.error("鍔犺浇璧勪骇鏁版嵁澶辫触:", error);
    dataList.value = [];
    selectedIds.value = [];
  } finally {
    loading.value = false;
  }
}

function syncSelectedIdsWithData() {
  const visibleIds = new Set(selectableAssetItems.value.map((item) => item.id));
  selectedIds.value = Array.from(new Set(selectedIds.value)).filter((id) => visibleIds.has(id));
  if (!activeAssetId.value || !visibleIds.has(activeAssetId.value)) {
    activeAssetId.value = selectableAssetItems.value[0]?.id ?? null;
  }
}

const previewImages = computed((): string[] => {
  const selectedImageList = selectedAssetItems.value
    .filter((item) => selectedIds.value.includes(item.id))
    .map((item) => getMediaDisplayUrls(item, "image").originalUrl)
    .filter(Boolean);

  if (selectedImageList.length > 0) {
    return selectedImageList;
  }

  return selectableAssetItems.value.map((item) => getMediaDisplayUrls(item, "image").originalUrl).filter(Boolean);
});

const hasPreviewImages = computed(() => previewImages.value.length > 0);

function openBatchPreview() {
  if (!hasPreviewImages.value) return;
  batchPreviewVisible.value = true;
}

function setSelected(id: number, checked: boolean) {
  activeAssetId.value = id;
  const idx = selectedIds.value.indexOf(id);
  if (checked && idx === -1) selectedIds.value = [...selectedIds.value, id];
  if (!checked && idx !== -1) selectedIds.value = selectedIds.value.filter((item) => item !== id);
}

function focusAsset(item: DataItem) {
  activeAssetId.value = item.id;
}

function getAssetPreviewUrl(item: DataItem) {
  return getMediaDisplayUrls(item, "image").previewUrl || getMediaDisplayUrls(item, "image").originalUrl || item.filePath || "";
}

function getCardImageFit(_item: DataItem) {
  return "cover" as const;
}

function getFoundationDisplay(item?: DataItem | null) {
  return String(item?.foundationText || item?.describe || "").trim();
}

function getFoundationTaskStatus(item: DataItem) {
  const rawStatus = String(item.foundationStatus || "").trim();
  return normalizeTaskStatus(rawStatus, "pending");
}

function getPromptTaskStatus(item: DataItem) {
  return normalizeTaskStatus(item.promptState, "pending");
}

function isFoundationReady(item: DataItem) {
  return getFoundationTaskStatus(item) === "completed" && String(item.foundationText || "").trim().length > 0;
}

function isFoundationFailed(item: DataItem) {
  const foundationStatus = getFoundationTaskStatus(item);
  const promptStatus = getPromptTaskStatus(item);
  return foundationStatus === "failed" || foundationStatus === "cancelled" || promptStatus === "failed" || promptStatus === "cancelled";
}

function getFoundationFailureReason(item?: DataItem | null) {
  if (!item) return "";
  return String(item.foundationErrorReason || item.promptErrorReason || "").trim();
}

function getPromptStateLabel(item: DataItem) {
  const status = getFoundationTaskStatus(item);
  if (status === "processing" || status === "queued" || status === "submitting") return $t("workbench.cornerScape.generating");
  if (isFoundationFailed(item)) return $t("workbench.cornerScape.genFailed");
  if (isFoundationReady(item)) return $t("workbench.cornerScape.foundationReady");
  if (item.prompt) return $t("workbench.cornerScape.promptReady");
  return $t("workbench.cornerScape.foundationMissing");
}

function getPromptStateTheme(item: DataItem): "default" | "primary" | "success" | "warning" | "danger" {
  const status = getFoundationTaskStatus(item);
  if (status === "processing" || status === "queued" || status === "submitting") return "primary";
  if (isFoundationFailed(item)) return "danger";
  if (isFoundationReady(item)) return "success";
  if (item.prompt) return "warning";
  return "default";
}

function selectFoundationMissing() {
  const ids = selectableAssetItems.value.filter((item) => !isFoundationReady(item)).map((item) => item.id);
  if (ids.length === 0) {
    window.$message.warning($t("workbench.cornerScape.foundationMissing"));
    return;
  }
  selectedIds.value = ids;
  window.$message.success($t("workbench.cornerScape.selectedCount", { count: selectedIds.value.length }));
}

// Select assets whose prompt is empty.
function selectPromptEmpty() {
  const lite = selectableAssetItems.value.filter((item) => !item.prompt || item.prompt.trim() === "").map((item) => item.id);
  if (lite.length === 0) {
    window.$message.warning($t("workbench.cornerScape.noEmptyPrompt"));
    return;
  }
  selectedIds.value = lite;
  window.$message.success($t("workbench.cornerScape.selectedCount", { count: selectedIds.value.length }));
}

function selectAll() {
  selectedIds.value = selectableAssetItems.value.map((item) => item.id);
}

function toggleSelectAll() {
  if (selectedIds.value.length === selectableAssetItems.value.length) {
    selectedIds.value = [];
  } else {
    selectedIds.value = selectableAssetItems.value.map((item) => item.id);
  }
}
function clearSelection() {
  selectedIds.value = [];
}
//鍙栨秷鐢熸垚
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
        window.$message.error(e.message ?? $t("workbench.cornerScape.cancelGeneration") + "澶辫触");
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
const currentParentAsset = computed(() => (currentItem.value ? getParentAsset(currentItem.value) : null));

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
      state: "completed",
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
  foundationText: "",
  promptState: "",
  relepedAudio: [] as BoundAudio[],
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
    window.$message.error(e?.message || "添加失败");
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
  if (!detailModelValue.value) detailModelValue.value = project.value?.imageModel ?? "";
  // 鍏堢敤褰撳墠鏁版嵁鎵撳紑鎶藉眽
  currentItem.value = item;
  syncEditFormFromItem(item);
  drawerVisible.value = true;
  // Refresh current asset details and image history.
  try {
    await refreshAssetWithHistory(item.id);
  } catch (e) {
    console.error("鍒锋柊璧勪骇璇︽儏澶辫触:", e);
  }
}

async function openParentAsset() {
  const parent = currentParentAsset.value;
  if (!parent) return;
  await openDrawer(parent);
}

function setItemState(id: number, state: string) {
  mergeAssetPatch(id, { state, status: normalizeTaskStatus(state, "pending") });
}

function regenerateItem() {
  if (!currentItem.value) return;
  const selectedModel = detailModelValue.value;
  if (!selectedModel) {
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
  setItemState(item.id, "processing");
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
        model: selectedModel,
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
        item.state = "processing";
      }
      window.$message.success($t("workbench.cornerScape.msg.genSuccess", { name: item.name }));
      syncRuntimeTasks();
    })
    .catch((e: any) => {
      if (e.name === "CanceledError" || e.code === "ERR_CANCELED") return;
      window.$message.error(e.message ?? $t("workbench.cornerScape.msg.genFailed", { name: item.name }));
      setItemState(item.id, "failed");
    });
}

// 鎻愮ず璇嶅け鐒︿繚瀛?
async function savePromptOnBlur() {
  if (!currentItem.value) return;
  // 鍐呭娌℃湁鍙樺寲鍒欎笉淇濆瓨
  if (editForm.prompt === currentItem.value.prompt) return;
  try {
    await axios.post("/assets/saveAssets", {
      id: currentItem.value.id,
      type: currentItem.value.type,
      projectId: project.value?.id,
      prompt: editForm.prompt,
    });
    // 鍚屾鏇存柊鏈湴鏁版嵁
    mergeAssetPatch(currentItem.value.id, { prompt: editForm.prompt });
    window.$message.success($t("workbench.cornerScape.msg.saveSuccess"));
  } catch (e) {
    window.$message.error($t("workbench.cornerScape.msg.saveFailed"));
  }
}

async function saveAssetProfile() {
  if (!currentItem.value || assetSaving.value) return;
  const name = editForm.name.trim();
  if (!name) {
    window.$message.warning($t("workbench.production.node.assets.assetNameRequired"));
    return;
  }
  assetSaving.value = true;
  try {
    await axios.post("/assets/updateAssets", {
      id: currentItem.value.id,
      name,
      describe: editForm.foundationText,
      remark: "",
      prompt: editForm.prompt,
    });
    mergeAssetPatch(currentItem.value.id, {
      name,
      describe: editForm.foundationText,
      prompt: editForm.prompt,
    });
    window.$message.success($t("workbench.cornerScape.msg.saveSuccess"));
    await refreshAssetDetail(currentItem.value.id);
  } catch (e: any) {
    window.$message.error(e?.message || $t("workbench.cornerScape.msg.saveFailed"));
  } finally {
    assetSaving.value = false;
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

// AI 娑﹁壊
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
      describe: editForm.foundationText || editForm.describe,
    });
    window.$message.success($t("workbench.cornerScape.msg.promptGenSuccess"));
    if (data.assetsId === editForm.assetsId) {
      editForm.prompt = data.prompt;
      mergeAssetPatch(editForm.assetsId, { prompt: data.prompt, promptState: data.promptState ?? "completed" });
    }
  } catch (e) {
    window.$message.error((e as any)?.message ?? $t("workbench.cornerScape.msg.polishFailed"));
  } finally {
    polishing.value = false;
  }
}
//鎵归噺鐢熸垚鍩虹璁惧畾
async function batchGenerationPrompt() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }
  if (!project.value?.id) {
    window.$message.warning($t("workbench.project.msg.notFound"));
    return;
  }

  const items = selectedAssetItems.value;
  const previousState = new Map(
    items.map((item) => [
      item.id,
      {
        foundationStatus: item.foundationStatus,
        foundationErrorReason: item.foundationErrorReason,
        promptState: item.promptState,
        promptTaskId: item.promptTaskId,
        legacyTaskId: item.legacyTaskId,
        promptErrorReason: item.promptErrorReason,
      },
    ]),
  );

  items.forEach((item) => {
    releasePromptTask(item.id);
    mergeAssetPatch(item.id, { foundationStatus: "processing", foundationErrorReason: "", promptState: "processing", promptErrorReason: "" });
  });

  try {
    const data = await generateAssetFoundation({
      projectId: Number(project.value?.id),
      assetIds: items.map((item) => item.id),
      mode: "selected",
      instruction: otherTextPrompt.value.trim() || undefined,
      overwrite: foundationOverwrite.value,
      generatePrompt: true,
    });
    const rows = data?.tasks ?? [];
    rows.forEach((row: { assetId?: number; taskId?: string; legacyTaskId?: number }) => {
      const id = row.assetId;
      if (!id) return;
      mergeAssetPatch(id, {
        promptTaskId: row.taskId,
        legacyTaskId: row.legacyTaskId,
        foundationStatus: "processing",
        foundationErrorReason: "",
        promptState: "processing",
        promptErrorReason: "",
      });
    });
    const skipped = data?.skipped ?? [];
    if (rows.length) window.$message.success($t("workbench.cornerScape.foundationStarted", { count: rows.length }));
    if (skipped.length) {
      const reasons = skipped
        .slice(0, 3)
        .map((item) => item.reason)
        .filter(Boolean)
        .join("; ");
      window.$message.warning($t("workbench.cornerScape.foundationSkipped", { count: skipped.length, reasons }));
    }
    syncRuntimeTasks();
    selectedIds.value = [];
  } catch (e: any) {
    items.forEach((item) => {
      const previous = previousState.get(item.id);
      if (previous) mergeAssetPatch(item.id, previous);
    });
    window.$message.error(e?.message ?? $t("workbench.cornerScape.msg.promptGenFail"));
  }
}
//缁戝畾闊抽
async function batchSelectBindAudio() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastBindOne"));
    return;
  }

  const items = selectedAssetItems.value;

  // Mark selected audio binding tasks as processing before polling takes over.
  items.forEach((item) => {
    mergeAssetPatch(item.id, { audioBindState: "processing" });
  });

  // 娓呴櫎宸查€変腑鐨勯」
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
    // 鐢熸垚澶辫触鏃堕噸缃?audioBindState
    items.forEach((item) => {
      mergeAssetPatch(item.id, { audioBindState: "" });
    });
  }
}
// 鎵归噺鐢熸垚鍥剧墖
async function batchGenerationImage() {
  if (selectedIds.value.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }
  if (!batchModelValue.value) {
    window.$message.warning($t("workbench.cornerScape.msg.selectModel"));
    return;
  }
  if (!resolution.value) {
    window.$message.warning($t("workbench.cornerScape.msg.selectResolution"));
    return;
  }

  const items = selectedAssetItems.value.filter((item) => normalizeAssetImageType(item.type));
  if (items.length === 0) {
    window.$message.warning($t("workbench.cornerScape.msg.selectAtLeastOne"));
    return;
  }
  //妫€鏌ュ鏋滃嬀閫夌殑鏁版嵁prompt鏈夌┖鐨勶紝鎻愮ず鐢ㄦ埛鍕鹃€夌殑鍝竴涓彁绀鸿瘝鏈敓鎴愶紝鐒跺悗缁堟鎵归噺鐢熸垚
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
    mergeAssetPatch(item.id, { state: "processing", status: "processing", taskId: undefined, legacyTaskId: undefined, errorReason: "" });
  });

  window.$message.success(
    $t("workbench.cornerScape.msg.batchStarted", { count: items.length, concurrent: otherSetting.value.assetsBatchGenereateSize }),
  );

  try {
    const { data } = await axios.post("/assetsGenerate/batchGenerateImageAssets", {
      projectId: Number(project.value?.id),
      model: batchModelValue.value,
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
      console.error("鍒锋柊浠诲姟缁撴灉澶辫触:", e);
    }
  });
}

function applyPromptRuntimeTask(id: number, task: RuntimeTask) {
  const record = (task.result ?? {}) as any;
  const failed = task.status === "failed" || task.status === "cancelled";
  const failureReason = String(record.foundationErrorReason || record.promptErrorReason || task.reason || "").trim();
  mergeAssetPatch(id, {
    promptState: task.status === "completed" ? "completed" : task.status === "failed" || task.status === "cancelled" ? "failed" : "processing",
    promptErrorReason: failed ? failureReason : "",
    foundationStatus: task.status === "completed" ? "completed" : failed ? "failed" : "processing",
    foundationErrorReason: failed ? failureReason : "",
    ...(record.foundationText !== undefined ? { foundationText: record.foundationText } : {}),
    ...(record.describe !== undefined ? { describe: record.describe } : {}),
    ...(record.prompt !== undefined ? { prompt: record.prompt } : {}),
  });
  if (task.status === "failed" || task.status === "cancelled") window.$message.error(failureReason || $t("workbench.cornerScape.msg.promptGenFail"));
  if (task.status === "completed" || task.status === "failed" || task.status === "cancelled") {
    queueMicrotask(() => releasePromptTask(id));
    if (task.status === "completed") queueMicrotask(() => void refreshAssetDetail(id));
  }
}

function applyImageRuntimeTask(id: number, task: RuntimeTask) {
  const record = (task.result ?? {}) as any;
  const media = normalizeMediaRef(record.media ?? record, "image");
  mergeAssetPatch(id, {
    state: task.status === "completed" ? "completed" : task.status === "failed" || task.status === "cancelled" ? "failed" : "processing",
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
    audioBindState: task.status === "completed" ? "completed" : task.status === "failed" || task.status === "cancelled" ? "failed" : "processing",
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

function isValidAudioId(id: unknown) {
  return Number.isFinite(Number(id)) && Number(id) > 0;
}

function cacheAudioDetails(rows: any[], projectId = Number(project.value?.id)) {
  if (!Number.isFinite(projectId) || projectId <= 0) return;
  if (audioAssetProjectId !== projectId) resetAudioAssetIndex(projectId);
  const next = new Map(audioAssetDetails.value);
  rows.forEach((row) => {
    if (isValidAudioId(row?.id)) next.set(Number(row.id), normalizeBoundAudio(row));
    if (!Array.isArray(row?.sonAssets)) return;
    row.sonAssets.forEach((child: any) => {
      if (!isValidAudioId(child?.id)) return;
      next.set(Number(child.id), normalizeBoundAudio({ ...child, parentName: row.name }));
    });
  });
  audioAssetDetails.value = next;
}

function resetAudioAssetIndex(projectId: number) {
  audioAssetProjectId = projectId;
  audioAssetIndexComplete = false;
  audioAssetLoadPromise = null;
  audioAssetDetails.value = new Map();
}

async function loadAudioAssetIndex(targetIds = new Set<number>()) {
  const projectId = Number(project.value?.id);
  if (!Number.isFinite(projectId) || projectId <= 0) return audioAssetDetails.value;
  if (audioAssetProjectId !== projectId) resetAudioAssetIndex(projectId);
  if (targetIds.size && Array.from(targetIds).every((id) => audioAssetDetails.value.has(id))) return audioAssetDetails.value;
  if (audioAssetIndexComplete) return audioAssetDetails.value;
  if (audioAssetLoadPromise) return audioAssetLoadPromise;

  const loadPromise = (async () => {
    const pageSize = 100;
    let page = 1;
    let total = Number.POSITIVE_INFINITY;
    while ((page - 1) * pageSize < total) {
      const { data } = await axios.post("/assets/getAssetsApi", {
        projectId,
        type: "audio",
        page,
        limit: pageSize,
      });
      if (audioAssetProjectId !== projectId) return audioAssetDetails.value;
      const rows = Array.isArray(data?.data) ? data.data : [];
      cacheAudioDetails(rows, projectId);
      total = Number(data?.total ?? rows.length);
      if (!rows.length || (targetIds.size && Array.from(targetIds).every((id) => audioAssetDetails.value.has(id)))) break;
      page += 1;
    }
    if (audioAssetProjectId === projectId && (!Number.isFinite(total) || page * pageSize >= total || total === 0)) {
      audioAssetIndexComplete = true;
    }
    return audioAssetDetails.value;
  })();
  audioAssetLoadPromise = loadPromise;
  try {
    return await loadPromise;
  } finally {
    if (audioAssetLoadPromise === loadPromise) audioAssetLoadPromise = null;
  }
}

function collectBoundAudioIds(items: DataItem[], ids = new Set<number>()) {
  items.forEach((item) => {
    item.relepedAudio.forEach((audio) => {
      if (isValidAudioId(audio.id) && !getPlayableMediaUrl(audio, "audio")) ids.add(Number(audio.id));
    });
    if (item.sonAssets?.length) collectBoundAudioIds(item.sonAssets, ids);
  });
  return ids;
}

async function hydrateBoundAudioDetails() {
  const ids = collectBoundAudioIds(dataList.value);
  if (!ids.size) return;
  try {
    await loadAudioAssetIndex(ids);
  } catch (error) {
    console.error("鍔犺浇缁戝畾闊抽璇︽儏澶辫触:", error);
  }
}

function resolveBoundAudio(audio?: BoundAudio | null) {
  if (!audio) return null;
  const detail = audioAssetDetails.value.get(Number(audio.id));
  return normalizeBoundAudio(detail ? { ...audio, ...detail, id: audio.id, name: audio.name || detail.name } : audio);
}

function getAudioUrl(audio?: BoundAudio | null) {
  return getPlayableMediaUrl(resolveBoundAudio(audio), "audio");
}

function canResolveAudio(audio?: BoundAudio | null) {
  return Boolean(getAudioUrl(audio) || isValidAudioId(audio?.id));
}

function getAudioActionKey(audio: BoundAudio, mode: "preview" | "clip") {
  return `${audio.id}:${mode}`;
}

function isAudioActionLoading(audio: BoundAudio, mode: "preview" | "clip") {
  return resolvingAudioAction.value === getAudioActionKey(audio, mode);
}

async function ensureBoundAudioDetails(audio: BoundAudio) {
  let resolved = resolveBoundAudio(audio) ?? audio;
  if (getPlayableMediaUrl(resolved, "audio")) return resolved;
  if (isValidAudioId(audio.id)) {
    await loadAudioAssetIndex(new Set([Number(audio.id)]));
    resolved = resolveBoundAudio(audio) ?? audio;
  }
  if (!getPlayableMediaUrl(resolved, "audio") && audio.name) {
    const queried = await queryAudioAssetByName(audio.name, Number(audio.id));
    if (queried) {
      cacheAudioDetails([queried]);
      resolved = resolveBoundAudio(audio) ?? queried;
    }
  }
  return resolved;
}

async function openAudioClipDialog(audio: BoundAudio, mode: "preview" | "clip") {
  const actionKey = getAudioActionKey(audio, mode);
  if (resolvingAudioAction.value) return;
  resolvingAudioAction.value = actionKey;
  try {
    const resolved = await ensureBoundAudioDetails(audio);
    if (!getPlayableMediaUrl(resolved, "audio")) {
      window.$message.warning("当前音频暂无可播放地址");
      return;
    }
    activeAudio.value = resolved;
    audioClipMode.value = mode;
    audioClipVisible.value = true;
  } catch (error: any) {
    window.$message.error(error?.message || "音频详情加载失败");
  } finally {
    resolvingAudioAction.value = "";
  }
}

function findCreatedAudioInResponse(input: any, name: string): BoundAudio | null {
  const payloads = [input, input?.data, input?.data?.data, input?.response, input?.response?.data, input?.response?.data?.data].filter(Boolean);
  for (const payload of payloads) {
    const audioAsset = payload?.audioAsset;
    const child = Array.isArray(audioAsset?.sonAssets) ? audioAsset.sonAssets.find((item: any) => isValidAudioId(item?.id)) : null;
    if (child) {
      return normalizeBoundAudio({
        ...child,
        name: child.name || name,
        describe: child.describe || audioAsset.describe,
        prompt: child.prompt,
        parentName: audioAsset.name,
      });
    }
  }

  const candidates: any[] = [];
  const visit = (value: any) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value.id && (value.name === name || value.media || value.src || value.url || value.filePath)) candidates.push(value);
    Object.values(value).forEach(visit);
  };
  visit(input);
  const matched = candidates.find((item) => item.name === name) ?? candidates[0];
  return matched?.id ? normalizeBoundAudio(matched) : null;
}

async function queryAudioAssetByName(name: string, preferredId?: number): Promise<BoundAudio | null> {
  const { data } = await axios.post("/assets/getAssetsApi", {
    projectId: project.value?.id,
    type: "audio",
    name,
    page: 1,
    limit: 20,
  });
  const rows = data?.data ?? [];
  const candidates = rows.flatMap((row: any) => [row, ...(row?.sonAssets ?? []).map((child: any) => ({ ...child, parentName: row.name }))]);
  const matched = candidates.find((item: any) => preferredId && Number(item?.id) === preferredId) ?? candidates.find((item: any) => item?.name === name);
  return matched ? normalizeBoundAudio(matched) : null;
}

async function bindAudioToCurrentAsset(audio: BoundAudio) {
  cacheAudioDetails([audio]);
  editForm.relepedAudio = [audio];
  await axios.post("/cornerScape/updateAssetsAudio", {
    assetsId: editForm.assetsId,
    audioIds: editForm.relepedAudio.map((i) => i.id),
  });
  mergeAssetPatch(editForm.assetsId, { relepedAudio: editForm.relepedAudio });
}

async function saveAudioClipAsBoundAsset(payload: { base64Data: string; name: string }, controls?: { done: (error?: unknown) => void }) {
  if (!editForm.assetsId) {
    const error = new Error("褰撳墠璧勪骇缂哄皯 ID");
    controls?.done(error);
    return;
  }
  const source = activeAudio.value;
  try {
    const response = await axios.post("/assets/addAudioAssets", {
      name: payload.name.replace(/\.wav$/i, ""),
      describe: source?.describe || source?.name || "音频片段",
      projectId: project.value?.id ?? 0,
      assetsItem: [
        {
          base64: payload.base64Data,
          prompt: source?.prompt || "",
          name: payload.name,
          describe: source?.name ? `从 ${source.name} 截取` : "音频截取片段",
        },
      ],
    });
    const created = findCreatedAudioInResponse(response, payload.name) ?? (await queryAudioAssetByName(payload.name));
    if (!created?.id) throw new Error("音频资产已创建，但未能获取新音频 ID");
    await bindAudioToCurrentAsset(created);
    audioClipVisible.value = false;
    window.$message.success("已截取为新音频资产并绑定");
    controls?.done();
  } catch (e: any) {
    window.$message.error(e?.message || "音频截取保存失败");
    controls?.done(e);
  }
}

async function removeAudio(id: number) {
  editForm.relepedAudio = editForm.relepedAudio.filter((a) => a.id !== id);
  await axios.post("/cornerScape/updateAssetsAudio", {
    assetsId: editForm.assetsId,
    audioIds: editForm.relepedAudio.map((i) => i.id),
  });
  mergeAssetPatch(editForm.assetsId, { relepedAudio: editForm.relepedAudio });
}
async function selectAudio() {
  const assets = await openAssetsSelector({
    title: $t("workbench.script.add.msg.selectAssetsTitle"),
    types: ["audio"],
    selectorMode: true,
    multiple: false,
  });
  if (assets.length) {
    await bindAudioToCurrentAsset(normalizeBoundAudio(assets[0]));
  }
}
</script>

<style lang="scss" scoped>
/* Stable corner-scape layout. Keep this block last so older experimental rules cannot leak through. */
.cornerScape {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow: hidden;
  background: transparent;

  .content {
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    padding: 0 48px 22px 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 28px;
  }

  .assetGroup {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .groupHeader {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 4px;
    color: var(--td-text-color-primary);
    font-size: 15px;
    font-weight: 700;
  }

  .groupGrid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    justify-content: stretch;
    align-items: start;
    gap: 16px 14px;
  }

  .assetFamily {
    min-width: 0;
    width: 100%;
  }

  .assetCard {
    width: 100%;
    height: auto;
    overflow: hidden;
    border: 1px solid var(--td-component-border);
    border-radius: 6px;
    background: var(--td-bg-color-container);
    box-shadow: none;
    cursor: pointer;
    transition:
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      transform 0.18s ease;

    &:hover {
      border-color: var(--td-brand-color);
      box-shadow: var(--td-shadow-2);
      transform: translateY(-1px);
    }

    :deep(.t-card__body) {
      padding: 0;
      display: block;
    }

    .imageBox {
      position: relative;
      width: 100%;
      height: 180px;
      margin: 0;
      overflow: hidden;
      border-radius: 0;
      background: #f4f5f7;
      display: flex;
      align-items: center;
      justify-content: center;

      .image,
      :deep(.t-image),
      :deep(.t-image__wrapper),
      :deep(.t-image__img) {
        width: 100%;
        height: 100%;
      }

      :deep(.t-image__img) {
        display: block;
        object-fit: cover;
        object-position: center;
      }
    }

    .selectBox {
      position: absolute;
      top: 8px;
      left: 8px;
      z-index: 12;
      width: 16px;
      height: 16px;
      padding: 0;
      line-height: 16px;
      background: transparent;

      :deep(.t-checkbox__input) {
        width: 16px;
        height: 16px;
        margin: 0;
        border-radius: 3px;
        box-shadow: 0 1px 4px rgb(0 0 0 / 14%);
      }

      &:not(.t-is-checked) :deep(.t-checkbox__input) {
        background-color: rgba(255, 255, 255, 0.96);
      }
    }

    .cardActions {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 12;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }

    .imageToolsWrap {
      position: absolute;
      right: 8px;
      bottom: 8px;
      z-index: 12;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }

    .cancelGeneration {
      position: absolute;
      top: 8px;
      right: 8px;
      z-index: 13;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.18s ease;
    }

    &:hover {
      .cardActions,
      .imageToolsWrap,
      .cancelGeneration {
        opacity: 1;
        pointer-events: auto;
      }
    }

    .generatingBox {
      width: 100%;
      height: 100%;
      display: grid;
      place-items: center;
      align-content: center;
      gap: 10px;
      background: linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%);
    }

    .generatingText {
      color: var(--td-brand-color);
      font-size: 13px;
    }

    .infoBox {
      padding: 9px 10px 10px;
      background: var(--td-bg-color-container);
      display: grid;
      gap: 6px;
    }

    .title {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 6px;
      justify-content: flex-start;
      overflow: hidden;
      background: transparent;
      color: var(--td-text-color-primary);
      font-size: 14px;
      font-weight: 700;
      line-height: 20px;
      white-space: nowrap;
    }

    .assetNameText {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .title :deep(.t-tag) {
      flex-shrink: 0;
    }

    .meta,
    .audioChipList {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      min-width: 0;
    }

    .prompt {
      margin: 0;
      color: var(--td-text-color-secondary);
      font-size: 12px;
      line-height: 1.55;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      line-clamp: 2;
      -webkit-box-orient: vertical;
    }
  }
}

:global(.assetDossierPopup) {
  max-width: 310px;
}

:global(.assetDossierPopup .t-popup__content) {
  padding: 0;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-2);
}

:global(.assetDossier) {
  width: 292px;
  padding: 12px;
  display: grid;
  gap: 10px;
  color: var(--td-text-color-primary);
}

:global(.dossierHead) {
  display: grid;
  gap: 6px;
}

:global(.dossierHead strong) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 1.4;
}

:global(.dossierTags),
:global(.dossierTagList) {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

:global(.dossierBlock) {
  display: grid;
  gap: 4px;
}

:global(.dossierBlock span) {
  color: var(--td-text-color-secondary);
  font-size: 12px;
  font-weight: 700;
}

:global(.dossierBlock p) {
  margin: 0;
  color: var(--td-text-color-secondary);
  font-size: 13px;
  line-height: 1.6;
  word-break: break-word;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
}

:global(.dossierFailure p) {
  color: var(--td-error-color-7);
}

.batchDock {
  position: fixed;
  top: 118px;
  right: 0;
  z-index: 7600;
  width: auto;
  pointer-events: none;

  &.expanded {
    width: 336px;
  }
}

.dockSideTab {
  pointer-events: auto;
  width: 46px;
  min-height: 86px;
  display: grid;
  grid-template-rows: 24px 22px;
  place-items: center;
  gap: 4px;
  padding: 9px 6px;
  border: 1px solid var(--td-component-border);
  border-right: 0;
  border-radius: 8px 0 0 8px;
  background: color-mix(in srgb, var(--td-bg-color-container) 97%, transparent);
  color: var(--td-text-color-primary);
  box-shadow: var(--td-shadow-2);
  cursor: pointer;

  &:hover {
    border-color: var(--td-brand-color);
    color: var(--td-brand-color);
    box-shadow: var(--td-shadow-3);
  }

  strong {
    font-size: 15px;
    line-height: 1;
  }
}

.sideIcon {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-size: 16px;
}

.dockPanel {
  pointer-events: auto;
  position: fixed;
  top: 118px;
  right: 24px;
  width: 336px;
  max-height: calc(100vh - 148px);
  padding: 0;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-3);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dockClose {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid var(--td-component-border);
  border-radius: 50%;
  background: var(--td-bg-color-container);
  color: var(--td-text-color-secondary);
  box-shadow: var(--td-shadow-1);
  cursor: pointer;
}

.dockHeader {
  flex-shrink: 0;
  padding: 14px 14px 12px;
  border-bottom: 1px solid var(--td-component-border);
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;

  strong {
    display: block;
    font-size: 15px;
    line-height: 1.4;
  }

  p {
    margin: 3px 0 0;
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.dockHeaderActions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.dockBody {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 12px 14px;
  display: grid;
  gap: 12px;
}

.dockSection {
  display: grid;
  gap: 9px;
}

.dockSectionTitle {
  color: var(--td-text-color-primary);
  font-size: 13px;
  font-weight: 700;
}

.dockQuickActions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.dockTwoCol {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 92px;
  gap: 10px;
}

.dockTextarea {
  width: 100%;
}

.filterGroup {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 12px;
}

.dockFooter {
  flex-shrink: 0;
  padding: 12px 14px 14px;
  border-top: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
  display: grid;
  gap: 8px;
}

.dockFooterGrid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

:global(.cornerScapeDockSelectPopup) {
  max-width: min(360px, 90vw);
}

:global(.assetDetailDrawer),
:global(.assetDetailDrawer .t-drawer),
:global(.assetDetailDrawer .t-drawer__content-wrapper) {
  top: 0;
  right: 0;
  bottom: 0;
  height: 100vh;
  max-height: 100vh;
}

:global(.assetDetailDrawer .t-drawer__content) {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--td-bg-color-page);
}

:global(.assetDetailDrawer .t-drawer__header) {
  flex-shrink: 0;
  min-height: 56px;
  border-bottom: 1px solid var(--td-component-border);
  background: var(--td-bg-color-container);
}

:global(.assetDetailDrawer .t-drawer__body) {
  flex: 1;
  min-height: 0;
  height: auto;
  padding: 0;
  overflow: auto;
  background: var(--td-bg-color-page);
}

.drawerHeaderV2 {
  width: 100%;
  padding-right: 28px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.drawerTitleGroup {
  min-width: 0;
  display: grid;
  gap: 3px;

  strong {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 16px;
  }

  span {
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.drawerHeaderTags,
.detailTags {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.detailEditor {
  min-height: 100%;
  padding: 16px 18px 20px;
  display: grid;
  align-content: start;
  gap: 14px;
}

.detailHero,
.detailSection,
.detailActionBar {
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-1);
}

.detailHero {
  padding: 12px;
  display: grid;
  grid-template-columns: minmax(260px, 300px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.detailMediaColumn {
  min-width: 0;
  display: grid;
  gap: 10px;
}

.detailHero .drawerImageBox {
  width: 100%;
  min-height: 212px;
  height: 212px;
  max-height: 212px;
  margin: 0;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: #f6f7f9;
  overflow: hidden;
}

.detailHero .drawerImageBox :deep(.t-image),
.detailHero .drawerImageBox :deep(.t-image__wrapper),
.detailHero .drawerImageBox :deep(.t-image__img) {
  width: 100%;
  height: 100%;
}

.detailHistoryStrip {
  min-width: 0;
  padding-top: 10px;
  border-top: 1px solid var(--td-component-border);
}

.detailHistoryStrip .detailSectionTitle {
  margin-bottom: 8px;
}

.detailHistoryStrip .historyImageList {
  width: 100%;
  min-width: 0;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 2px;
}

.detailIdentityForm {
  min-width: 0;
  align-self: stretch;

  :deep(.t-form__item) {
    margin-bottom: 12px;
  }
}

.detailFormGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 110px;
  gap: 10px;
}

.detailSection {
  padding: 12px;
}

.foundationErrorReason {
  margin-top: 8px;
  padding: 8px 10px;
  border: 1px solid var(--td-error-color-3);
  border-radius: 6px;
  background: var(--td-error-color-1);
  color: var(--td-error-color-7);
  font-size: 12px;
  line-height: 1.5;
  word-break: break-word;
}

.detailSectionTitle {
  margin-bottom: 10px;
  color: var(--td-text-color-primary);
  font-size: 13px;
  font-weight: 700;
}

.detailSectionTitleAction {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.derivedEditList {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.derivedEditItem,
.parentAssetItem {
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  box-shadow: none;
  display: grid;
  grid-template-columns: 54px minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  text-align: left;
  cursor: pointer;

  &:hover {
    border-color: var(--td-brand-color);
    background: var(--td-brand-color-light);
  }
}

.parentAssetItem {
  margin-bottom: 10px;
}

.derivedEditThumb {
  width: 54px;
  height: 54px;
  border-radius: 6px;
  overflow: hidden;
  background: #f5f7fa;

  :deep(.t-image),
  :deep(.t-image__wrapper),
  :deep(.t-image__img) {
    width: 100%;
    height: 100%;
  }
}

.derivedEditInfo {
  min-width: 0;
  display: grid;
  gap: 4px;

  strong,
  span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    color: var(--td-text-color-secondary);
    font-size: 12px;
  }
}

.audioList {
  display: grid;
  gap: 8px;
}

.audioBindItem {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--td-component-border);
  border-radius: 6px;
  background: var(--td-bg-color-container);
}

.audioBindInfo {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;

  span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.audioBindActions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.detailActionBar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.assets-empty {
  color: var(--td-text-color-secondary);
  font-size: 13px;
}

@media (max-width: 980px) {
  .cornerScape .groupGrid {
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    justify-content: stretch;
  }

  .detailHero {
    grid-template-columns: 1fr;
  }
}
</style>
