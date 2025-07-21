
export interface Template {
  id: "react-vite-basic";
  name: string;
  description: string;
  planBody: string[];
  planExecutionSteps: string[];
  planConclusion: string;
}


export const TEMPLATES: Template[] = [
  {
    id: "react-vite-basic",
    name: "React + Vite (基础版)",
    description: "一个标准的、使用NPM的React + Vite项目。",
    planBody: [
      "首先，我会创建 `.gitignore` 文件，这是至关重要的一步，可以避免将 `node_modules` 等不必要的文件提交到版本控制中。",
      "接下来，我会生成 `package.json`，其中定义了项目所需的依赖，如 `react`, `react-dom` 和开发依赖 `vite`。",
      "然后，我会创建 Vite 的核心配置文件 `vite.config.js`。",
      "之后，我会创建项目的入口 HTML 文件 `index.html`。",
      "接着，在 `src` 目录下，我会创建应用的主入口 `main.jsx`，根组件 `App.jsx`，以及基础样式文件 `App.css`。",
    ],
    planExecutionSteps: [
      "最后，也是最关键的一步，我会创建可执行的 `setup.sh` 脚本，并通过 `{{PM_INSTALL}} && {{PM_RUN_DEV}}` 命令自动完成依赖安装并启动开发服务器。脚本创建后会立即在后台执行。",
    ],
    planConclusion: `\n这个计划看起来符合您的预期吗？`,
  },
];

/**
 * 根据ID查找模板的辅助函数
 * @param id 模板ID
 * @returns 找到的模板或 undefined
 */
export function getTemplateById(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function customStreamTransformer() {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
  });
}