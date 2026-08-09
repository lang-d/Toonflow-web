import axios from "@/utils/axios";

export interface Project {
  id: string;
  name: string;
  intro: string;
  type: string;
  artStyle: string | null;
  videoRatio: string | null;
  createTime: number;
  updatedAt: number;
  imageModel: string;
  videoModel: string;
  projectType: string;
  imageQuality: "1K" | "2K" | "4K" | "";
  mode: string;
  videoPromptType: string | null;
  directorManual: string;
}

export default defineStore(
  "project",
  () => {
    const allProject = ref<Project[]>([]);

    const project = ref<Project | null>(null);

    async function fetchProjects() {
      const response = await axios.post("/project/getProject");
      allProject.value = (response as any).data || [];
      return allProject.value;
    }

    return { allProject, project, fetchProjects };
  },
  { persist: true },
);
