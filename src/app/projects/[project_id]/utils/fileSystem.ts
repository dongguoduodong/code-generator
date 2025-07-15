import { FileTreeNode } from "@/types/webcontainer";
import { ProjectFile } from "@/types/database";
import { WebContainer } from "@webcontainer/api";
import { Ignore } from "ignore";


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

    // 如果是目录，则进行递归调用
    if (entry.isDirectory()) {
      const subPaths = await _readDirRecursive(fullPath, fs);
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
