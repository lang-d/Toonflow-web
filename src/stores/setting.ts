export default defineStore(
  "setting",
  () => {
    const showSetting = ref(false);
    const isElectron = ref(false);
    const canvasWheelEvent = ref("zoom");
    const activeMenu = ref("ui");

    const baseUrl = ref<string>("http://127.0.0.1:10588/api");
    const apiReady = ref(false);

    const needUpdate = ref(false);

    const otherSetting = ref({
      axiosTimeOut: 60 * 10 * 1000,
      assetsBatchGenereateSize: 5,
      chapterReg: "/第\\s*([0-9０-９零一二三四五六七八九十百千万]+)\\s*[章回节]\\s*([^\\n\\r]*)/g",
      interacting: true,
    });

    const themeSetting = ref<{
      mode: "auto" | "light" | "dark";
      primaryColor: string;
      fontSize: number;
    }>({
      mode: "auto",
      primaryColor: "#0052D9",
      fontSize: 16,
    });

    const language = ref<string>("zh-CN");

    return { showSetting, baseUrl, apiReady, otherSetting, themeSetting, language, activeMenu, isElectron, canvasWheelEvent, needUpdate };
  },
  { persist: { pick: ["otherSetting", "themeSetting", "language"] } },
);
