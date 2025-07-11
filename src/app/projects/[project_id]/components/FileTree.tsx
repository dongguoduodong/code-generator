import { cn } from "@/lib/utils";
import { FileTreeNode } from "@/types/webcontainer";
import { Code, Folder } from "lucide-react";

export const FileTree = ({
  nodes,
  onFileClick,
  activeFile,
  depth = 0,
}: {
  nodes: FileTreeNode[];
  onFileClick: (path: string) => void;
  activeFile: string | null;
  depth?: number;
}) => {
  return (
    <>
      {nodes.map((node) => (
        <div key={node.path}>
          <button
            onClick={() => node.type === "file" && onFileClick(node.path)}
            className={cn(
              "w-full text-left text-sm py-1 rounded flex items-center transition-colors text-neutral-300",
              activeFile === node.path
                ? "bg-blue-600/20 text-blue-400"
                : "hover:bg-neutral-700/50",
              node.type === "directory" && "font-semibold cursor-default"
            )}
            style={{ paddingLeft: `${depth * 1 + 0.5}rem` }}
          >
            {node.type === "directory" ? (
              <Folder size={14} className="mr-2 flex-shrink-0" />
            ) : (
              <Code size={14} className="mr-2 flex-shrink-0" />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {node.type === "directory" && node.children && (
            <FileTree
              nodes={node.children}
              onFileClick={onFileClick}
              activeFile={activeFile}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </>
  );
};
