
export interface Template {
  id: "react-vite-basic";
  name: string;
  description: string;
  matchKeywords: string[]; // 用于Router Agent进行意图匹配的关键词
  plan: string;
}

// 定义我们的模板库
export const TEMPLATES: Template[] = [
  {
    id: "react-vite-basic",
    name: "React + Vite (基础版)",
    description: "一个标准的、使用NPM的React + Vite项目。",
    matchKeywords: ["react", "vite", "react.js", "reactjs", "ui"],
    plan: `好的，我将为您创建一个全新的、基于 React + Vite 的标准项目。这是一个经过验证的最佳实践方案：
  
  1.  首先，我会创建 \`.gitignore\` 文件，这是至关重要的一步，可以避免将 \`node_modules\` 等不必要的文件提交到版本控制中。
  2.  接下来，我会生成 \`package.json\`，其中定义了项目所需的依赖，如 \`react\`, \`react-dom\` 和开发依赖 \`vite\`。
  3.  然后，我会创建 Vite 的核心配置文件 \`vite.config.js\`。
  4.  之后，我会创建项目的入口 HTML 文件 \`index.html\`。
  5.  接着，在 \`src\` 目录下，我会创建应用的主入口 \`main.jsx\`，根组件 \`App.jsx\`，以及基础样式文件 \`App.css\`。
  6.  最后，也是最关键的一步，我会创建可执行的 \`setup.sh\` 脚本。这个脚本会通过 \`npm install && npm run dev\` 命令，自动完成依赖安装并启动开发服务器。
  
  这个计划看起来符合您的预期吗？`,
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