import React from "react";

interface PreviewPanelProps {
  previewUrl: string;
  isLoading: boolean;
}

export default function PreviewPanel({
  previewUrl,
  isLoading,
}: PreviewPanelProps) {
  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white text-neutral-800 p-4 text-center">
        <p>正在等待开发容器完成加载...</p>
      </div>
    );
  }

  if (!previewUrl) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white text-neutral-800 p-4 text-center">
        <div className="flex flex-col items-center gap-2">
          <h3 className="font-semibold text-lg">预览不可用</h3>
          <p className="text-sm text-neutral-600">
            预览服务器尚未运行。
            <br />
            请通过AI指令来启动它 (例如，告诉AI: &quot;npm run dev&quot;)。
          </p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      src={previewUrl}
      className='w-full h-full border-0'
      title='WebContainer Preview'
      sandbox='allow-scripts allow-same-origin allow-forms'
    />
  )
}
