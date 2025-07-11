import { Project, ProjectFile } from "./database";
import { Message } from "ai";

export interface ProjectClientPageProps {
  project: Project;
  initialMessages: Message[];
  initialFiles: ProjectFile[];
  isFirstLoad: boolean;
  initialGitignoreContent: string;
}
