import { javascript } from "@codemirror/lang-javascript";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { json } from "@codemirror/lang-json";
import { markdown as md } from "@codemirror/lang-markdown";

export const getLanguageExtension = (filePath: string | null) => {
  if (!filePath) return [];
  const ext = filePath?.split(".").pop();
  switch (ext) {
    case "js":
    case "jsx":
    case "ts":
    case "tsx":
      return [javascript({ jsx: true, typescript: true })];
    case "css":
      return [css()];
    case "html":
      return [html()];
    case "json":
      return [json()];
    case "md":
      return [md()];
    default:
      return [];
  }
};
