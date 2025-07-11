import { FileTreeNode } from "@/types/webcontainer";
import { ProjectFile } from "@/types/database";
import { WebContainer } from "@webcontainer/api";
import path from "path";
import { Ignore } from "ignore";

export const findNode = (
  nodes: FileTreeNode[],
  path: string
): FileTreeNode | null => {
  for (const node of nodes) {
    if (node.path === path) return node;
    if (node.type === "directory" && node.children) {
      const found = findNode(node.children, path);
      if (found) return found;
    }
  }
  return null;
};

export const createFile = (
  nodes: FileTreeNode[],
  path: string,
  content: string = ""
): FileTreeNode[] => {
  const newNodes = JSON.parse(JSON.stringify(nodes));
  const parts = path.split("/").filter(Boolean);

  let currentLevel = newNodes;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const isLastPart = i === parts.length - 1;
    const currentPath = parts.slice(0, i + 1).join("/");

    let node = currentLevel.find((n: FileTreeNode) => n.name === part);

    if (!node) {
      node = {
        name: part,
        path: currentPath,
        type: isLastPart ? "file" : "directory",
        ...(isLastPart ? { content } : { children: [] }),
      };
      currentLevel.push(node);
      currentLevel.sort((a: FileTreeNode, b: FileTreeNode) => {
        if (a.type !== b.type) return a.type === "directory" ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }

    if (node.type === "directory") {
      currentLevel = node.children!;
    } else if (!isLastPart) {
      console.error(
        "Path conflict: Cannot create children under a file.",
        path
      );
      return newNodes;
    }
  }

  return newNodes;
};

export const updateFileContent = (
  nodes: FileTreeNode[],
  path: string,
  content: string
): FileTreeNode[] => {
  let fileFound = false;

  const recursivelyUpdate = (currentNodes: FileTreeNode[]): FileTreeNode[] => {
    return currentNodes.map((node) => {
      if (node.path === path && node.type === "file") {
        fileFound = true;
        return { ...node, content };
      }
      if (node.type === "directory" && path.startsWith(node.path + "/")) {
        return { ...node, children: recursivelyUpdate(node.children || []) };
      }
      return node;
    });
  };

  const updatedNodes = recursivelyUpdate(nodes);

  if (!fileFound) {
    return createFile(nodes, path, content);
  }

  return updatedNodes;
};

/**
 * [已修复] 删除文件或目录。
 */
export const deleteFileOrDirectory = (
  nodes: FileTreeNode[],
  path: string
): FileTreeNode[] => {
  const newNodes = nodes.filter((node) => node.path !== path);

  return newNodes.map((node) => {
    if (node.type === "directory" && path.startsWith(node.path + "/")) {
      return {
        ...node,
        children: deleteFileOrDirectory(node.children || [], path),
      };
    }
    return node;
  });
};

/**
 * [已修复] 将从数据库获取的扁平文件列表转换为树状结构。
 * 这个函数现在也使用新的、可靠的createFile逻辑。
 *
 * @param initialFiles - 从数据库来的文件列表。
 * @returns FileTreeNode[]
 */
export const convertInitialFilesToFileSystem = (
  initialFiles: ProjectFile[]
): FileTreeNode[] => {
  if (!initialFiles || initialFiles.length === 0) {
    return [];
  }

  let fileSystem: FileTreeNode[] = [];
  initialFiles.forEach((file) => {
    fileSystem = createFile(fileSystem, file.path, file.content);
  });

  return fileSystem;
};

function globToRegex(glob: string): RegExp {
  const pattern = glob
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${pattern}(/.*)?$`);
}

async function recursiveListFiles(
  wc: WebContainer,
  dir: string
): Promise<string[]> {
  const entries = await wc.fs.readdir(dir, { withFileTypes: true });
  let fileList: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      fileList = fileList.concat(await recursiveListFiles(wc, fullPath));
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

/**
 * Reads the .gitignore file and returns an array of regex patterns.
 * @param wc The WebContainer instance.
 * @returns A promise that resolves to an array of RegExp.
 */
async function getIgnoreRules(wc: WebContainer): Promise<RegExp[]> {
  const defaultIgnores = [
    "node_modules",
    "dist",
    "build",
    "package-lock.json",
    ".DS_Store",
    "*.log",
    ".env",
  ];
  try {
    const gitignoreContent = await wc.fs.readFile("/.gitignore", "utf-8");
    const customRules = gitignoreContent
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.startsWith("#"));
    return [...defaultIgnores, ...customRules].map(globToRegex);
  } catch {
    return defaultIgnores.map(globToRegex);
  }
}

export async function getFilteredFileSystemState(
  wc: WebContainer | null
): Promise<Set<string>> {
  if (!wc) return new Set();

  const rules = await getIgnoreRules(wc);
  const allFiles = await recursiveListFiles(wc, "/");

  const filtered = allFiles.filter((filePath) => {
    const normalizedPath = filePath.startsWith("/")
      ? filePath.substring(1)
      : filePath;
    return !rules.some((rule) => rule.test(normalizedPath));
  });

  return new Set(filtered);
}

export function computeDiff(beforeState: Set<string>, afterState: Set<string>) {
  const createdFiles = [...afterState].filter((file) => !beforeState.has(file));
  const deletedFiles = [...beforeState].filter((file) => !afterState.has(file));

  return {
    created: createdFiles,
    deleted: deletedFiles,
  };
}
async function _readDirRecursive(
  path: string,
  fs: WebContainer["fs"]
): Promise<string[]> {
  const entries = await fs.readdir(path, { withFileTypes: true });
  const allPaths: string[] = [];

  for (const entry of entries) {
    const fullPath = path === "/" ? entry.name : `${path}/${entry.name}`;
    allPaths.push(fullPath);

    // 3. 如果是目录，则进行递归调用
    if (entry.isDirectory()) {
      const subPaths = await _readDirRecursive(fullPath, fs);
      // 将子目录的结果合并到总列表中
      allPaths.push(...subPaths);
    }
  }
  return allPaths;
}
export const filterAndSnapshotFileSystem = async (
  webcontainer: WebContainer,
  gitignoreParser: Ignore
): Promise<string[]> => {
  try {
    const allPaths = await _readDirRecursive("/", webcontainer.fs);

    const filteredPaths = allPaths.filter(
      (path) => !gitignoreParser.ignores(path)
    );

    return filteredPaths;
  } catch (error) {
    console.error("Error creating file system snapshot:", error);
    return [];
  }
};
