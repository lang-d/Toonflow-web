<template>
  <main class="moduleError">
    <section class="panel">
      <div class="icon"><i-error :size="30" /></div>
      <h1>页面资源加载失败</h1>
      <p class="summary">前端开发服务可能刚刚重启或正在热更新。系统已自动重试，仍失败时才会显示此页面。</p>

      <dl v-if="errorState" class="details">
        <template v-if="errorState.module">
          <dt>失败模块</dt>
          <dd>{{ errorState.module }}</dd>
        </template>
        <template v-if="isDev">
          <dt>前端地址</dt>
          <dd>{{ windowOrigin }}</dd>
          <dt>错误详情</dt>
          <dd>{{ errorState.message }}</dd>
        </template>
      </dl>

      <div class="actions">
        <t-button theme="primary" @click="reload">
          <template #icon><i-refresh /></template>
          重新加载
        </t-button>
        <t-button variant="outline" @click="backToProjects">返回项目列表</t-button>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { clearModuleRecovery, getModuleLoadError } from "@/utils/moduleRecovery";

const router = useRouter();
const errorState = getModuleLoadError();
const isDev = import.meta.env.DEV;
const windowOrigin = window.location.origin;

function reload() {
  clearModuleRecovery();
  window.location.reload();
}

async function backToProjects() {
  clearModuleRecovery();
  await router.replace("/project");
}
</script>

<style lang="scss" scoped>
.moduleError {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 32px;
  background: var(--td-bg-color-page);
}

.panel {
  width: min(620px, 100%);
  padding: 32px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  box-shadow: var(--td-shadow-2);
}

.icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  margin-bottom: 20px;
  border-radius: 50%;
  color: var(--td-error-color);
  background: var(--td-error-color-1);
}

h1 {
  margin: 0;
  font-size: 24px;
  line-height: 1.4;
}

.summary {
  margin: 10px 0 24px;
  color: var(--td-text-color-secondary);
}

.details {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 10px 16px;
  margin: 0 0 24px;
  padding: 16px;
  background: var(--td-bg-color-secondarycontainer);
}

dt {
  color: var(--td-text-color-secondary);
}

dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  font-family: Consolas, monospace;
  font-size: 13px;
}

.actions {
  display: flex;
  gap: 12px;
}
</style>
