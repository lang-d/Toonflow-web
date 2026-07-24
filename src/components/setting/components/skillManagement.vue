<template>
  <div class="skillManagement">
    <aside class="sidebarPanel">
      <t-input v-model="keyword" clearable :placeholder="$t('setting.skillManagement.search')" />
      <t-alert v-if="listError" theme="error" :message="listError" close @close="listError = ''" />
      <div class="treeWrap">
        <t-tree v-if="treeData.length" activable hover line expand-on-click-node :data="treeData" :actived="activedKeys" @active="onTreeActive">
          <template #icon="{ node }">
            <i-folder-open v-if="!node.data.isFile" theme="outline" size="16" />
            <i-file-text v-else-if="node.data.isRoot" theme="outline" size="16" fill="red" />
            <i-file-text v-else theme="outline" size="16" />
          </template>
        </t-tree>
        <t-empty v-else :description="$t('setting.skillManagement.empty')" />
      </div>
    </aside>

    <section class="viewPanel">
      <div v-if="activeEntry" class="viewHeader">
        <span class="fileName">{{ activeEntry }}</span>
        <t-button size="small" theme="primary" variant="outline" @click="openEditDialog">{{ $t("setting.skillManagement.edit") }}</t-button>
      </div>

      <t-alert v-if="contentError" class="contentError" theme="error" :message="contentError" close @close="contentError = ''" />
      <div v-if="activeEntry" class="previewWrap">
        <MdPreview :theme="mdTheme" :modelValue="content" :toolbars="[]" preview-only preview-theme="github" code-theme="atom" />
      </div>

      <t-empty v-else :description="$t('setting.skillManagement.selectOnTheLeft')" />
    </section>

    <t-dialog
      placement="center"
      v-model:visible="editVisible"
      :header="$t('setting.skillManagement.edit') + ` ${activeEntry}`"
      width="80vw"
      :confirm-btn="$t('common.save')"
      :confirm-on-enter="false"
      :on-confirm="onSave"
      :loading="isSaving">
      <MdEditor :theme="mdTheme" v-model="draft" :toolbars="mdToolbars" preview-theme="github" code-theme="atom" style="height: 72vh" />
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { MdEditor, MdPreview } from "md-editor-v3";
import type { ToolbarNames } from "md-editor-v3";
import settingStore from "@/stores/setting";
const { themeSetting } = storeToRefs(settingStore());
const mdTheme = computed(() => (themeSetting.value.mode === "auto" ? undefined : themeSetting.value.mode));
import type { TreeNodeModel, TreeNodeValue, TreeOptionData } from "tdesign-vue-next";
import axios from "@/utils/axios";

const mdToolbars: ToolbarNames[] = [
  "bold",
  "underline",
  "italic",
  "strikeThrough",
  "-",
  "title",
  "sub",
  "sup",
  "quote",
  "unorderedList",
  "orderedList",
  "task",
  "-",
  "codeRow",
  "code",
  "table",
  "-",
  "revoke",
  "next",
  "=",
  "preview",
];

interface TreeItem {
  label: string;
  value: string;
  children?: TreeItem[];
  isFile?: boolean;
  isRoot?: boolean;
  source?: string;
  sourceRoot?: string;
}

interface SkillListEntry {
  path: string;
  source?: string;
  sourceRoot?: string;
}

const entries = ref<SkillListEntry[]>([]);
const activeEntry = ref("");
const keyword = ref("");
const content = ref("");
const draft = ref("");
const editVisible = ref(false);
const isSaving = ref(false);
const listError = ref("");
const contentError = ref("");

const activedKeys = computed(() => (activeEntry.value ? [activeEntry.value] : []));

const filteredEntries = computed(() => {
  let result = entries.value.filter((entry) => entry.path.endsWith(".md"));
  if (!keyword.value) return result;
  const kw = keyword.value.toLowerCase();
  return result.filter((entry) => entry.path.toLowerCase().includes(kw));
});

const treeData = computed<TreeItem[]>(() => {
  const dirMap = new Map<string, TreeItem>();
  const rootItems: TreeItem[] = [];

  for (const entry of filteredEntries.value) {
    const filePath = entry.path;
    const parts = filePath.split("/").filter(Boolean);
    let parentChildren = rootItems;
    let cur = "";

    for (let i = 0; i < parts.length; i++) {
      cur = cur ? `${cur}/${parts[i]}` : parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        if (!parentChildren.some((c) => c.value === cur)) {
          parentChildren.push({
            label: parts[i],
            value: cur,
            isFile: true,
            isRoot: parts.length === 1,
            source: entry.source,
            sourceRoot: entry.sourceRoot,
          });
        }
      } else {
        let dir = dirMap.get(cur);
        if (!dir) {
          dir = { label: parts[i], value: cur, isFile: false, children: [] };
          dirMap.set(cur, dir);
          parentChildren.push(dir);
        }
        parentChildren = dir.children!;
      }
    }
  }

  const sortItems = (items: TreeItem[]) => {
    items.sort((a, b) => {
      if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
      return a.label.localeCompare(b.label);
    });
    items.forEach((item) => item.children && sortItems(item.children));
  };
  sortItems(rootItems);

  return rootItems;
});

function normalizeEntries(data: unknown): SkillListEntry[] {
  if (!Array.isArray(data)) return [];

  const seen = new Set<string>();
  const result: SkillListEntry[] = [];
  for (const item of data) {
    const path = typeof item === "string" ? item : typeof item === "object" && item ? (item as { path?: unknown }).path : undefined;
    if (typeof path !== "string" || !path.trim() || seen.has(path)) continue;

    const metadata = typeof item === "object" && item ? (item as { source?: unknown; sourceRoot?: unknown }) : {};
    seen.add(path);
    result.push({
      path,
      source: typeof metadata.source === "string" ? metadata.source : undefined,
      sourceRoot: typeof metadata.sourceRoot === "string" ? metadata.sourceRoot : undefined,
    });
  }
  return result;
}

async function fetchList() {
  listError.value = "";
  try {
    const { data } = await axios.post("/setting/skillManagement/getSkillList");
    entries.value = normalizeEntries(data);
  } catch (e) {
    console.error(e);
    entries.value = [];
    listError.value = "读取技能文件列表失败，请稍后重试。";
  }
}

async function loadContent(path: string) {
  contentError.value = "";
  try {
    const { data } = await axios.post("/setting/skillManagement/getSkillContent", { path });
    content.value = typeof data === "string" ? data : data?.content || "";
  } catch (e) {
    console.error(e);
    content.value = "";
    contentError.value = "读取技能文件失败，请稍后重试。";
  }
}

async function onTreeActive(value: TreeNodeValue[], context: { node: TreeNodeModel<TreeOptionData> }) {
  const key = value[value.length - 1];
  const path = typeof key === "string" ? key : String(key || "");
  const node = context.node.data as TreeItem | undefined;
  if (!path || !node?.isFile || path === activeEntry.value) return;
  activeEntry.value = path;
  await loadContent(path);
}

function openEditDialog() {
  draft.value = content.value;
  editVisible.value = true;
}

async function onSave() {
  if (!activeEntry.value) return;
  isSaving.value = true;
  try {
    await axios.post("/setting/skillManagement/saveSkillContent", {
      path: activeEntry.value,
      content: draft.value,
    });
    content.value = draft.value;
    editVisible.value = false;
  } catch (e) {
    console.error(e);
    window.$message.error("保存技能文件失败，请稍后重试。");
  } finally {
    isSaving.value = false;
  }
}

onMounted(() => fetchList());
</script>

<style lang="scss" scoped>
.skillManagement {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 12px;
  height: 100%;

  .sidebarPanel {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--td-component-stroke);
    border-radius: 8px;
    overflow: hidden;
    min-height: 0;

    .treeWrap {
      flex: 1;
      overflow: auto;
      user-select: none;
    }
  }

  .viewPanel {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--td-component-stroke);
    border-radius: 8px;
    overflow: hidden;

    .contentError {
      margin: 12px 16px 0;
    }

    .viewHeader {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 16px;
      border-bottom: 1px solid var(--td-component-stroke);

      .fileName {
        font-size: 14px;
        font-weight: 600;
        word-break: break-all;
      }
    }

    .previewWrap {
      flex: 1;
      overflow: auto;
      padding: 12px 16px;
    }
  }
}
</style>
