"use client"
import React from "react"
import dynamic from "next/dynamic"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { HardDrive, Code as CodeIcon, Play } from "lucide-react"
import PreviewPanel from "./PreviewPanel"
import { useWorkspaceStore } from "@/stores/WorkspaceStoreProvider"
import { cn } from "@/lib/utils"

const CodePanel = dynamic(
  () => import("./CodePanel").then((mod) => mod.CodePanel),
  { ssr: false }
)

export default function WorkspacePanel({
  onFixDevError,
}: {
  onFixDevError: (errorLog: string) => void
}) {
  const isLoadingContainer = useWorkspaceStore(
    (state) => state.isLoadingContainer
  )
  const previewUrl = useWorkspaceStore((state) => state.previewUrl)
  const activeTab = useWorkspaceStore((state) => state.activeWorkspaceTab)
  const setActiveTab = useWorkspaceStore(
    (state) => state.actions.setActiveWorkspaceTab
  )
  return (
    <main className='w-full md:w-2/3 flex-col hidden md:flex h-screen'>
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as "code" | "preview")}
        className='flex-1 flex flex-col bg-[#0d1117] h-screen'
      >
        <TabsList className='flex bg-neutral-900 border-b border-neutral-800 px-1 shrink-0'>
          <TabsTrigger
            value='code'
            className='px-4 py-2 text-sm text-neutral-400 data-[state=active]:bg-neutral-800 data-[state=active]:text-white hover:bg-neutral-700/50 flex items-center gap-2 rounded-t-md'
          >
            <CodeIcon size={14} /> Code
          </TabsTrigger>
          <TabsTrigger
            value='preview'
            className='px-4 py-2 text-sm text-neutral-400 data-[state=active]:bg-neutral-800 data-[state=active]:text-white hover:bg-neutral-700/50 flex items-center gap-2 rounded-t-md'
          >
            <Play size={14} /> Preview
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value='code'
          forceMount
          className={cn(
            "flex-1 flex flex-col overflow-hidden focus-visible:ring-0",
            "data-[state=inactive]:hidden"
          )}
        >
          {isLoadingContainer ? (
            <div className='flex-1 flex items-center justify-center text-center p-4'>
              <div>
                <HardDrive
                  size={48}
                  className='mx-auto animate-pulse text-blue-500'
                />
                <p className='mt-4 text-lg font-semibold text-neutral-200'>
                  正在启动云端开发容器...
                </p>
                <p className='text-sm text-neutral-400'>
                  这可能需要一点时间，请稍候。
                </p>
              </div>
            </div>
          ) : (
            <CodePanel onFixDevError={onFixDevError} />
          )}
        </TabsContent>
        <TabsContent
          value='preview'
          forceMount
          className={cn(
            "flex-1 bg-white focus-visible:ring-0",
            "data-[state=inactive]:hidden"
          )}
        >
          <PreviewPanel
            previewUrl={previewUrl}
            isLoading={isLoadingContainer}
          />
        </TabsContent>
      </Tabs>
    </main>
  )
}
