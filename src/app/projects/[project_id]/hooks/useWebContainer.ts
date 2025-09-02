// "use client"

// import { useCallback } from "react"
// import { WebContainer } from "@webcontainer/api"
// import { toast } from "sonner"
// import {
//   useWorkspaceStore,
//   useWorkspaceStoreApi,
// } from "@/stores/WorkspaceStoreProvider"

// // --- 架构级修复 ---
// // 1. 创建一个模块级的变量来持有唯一的 boot Promise。
// //    这可以防止在任何情况下（包括快速刷新）发生并发的 WebContainer.boot() 调用。
// let bootPromise: Promise<WebContainer | null> | null = null

// /**
//  * 一个封装了 WebContainer 核心交互逻辑的自定义 Hook。
//  * 职责聚焦于 WebContainer 的生命周期管理和文件I/O。
//  * @param projectId - 当前项目的ID，用于关联 WebContainer 实例。
//  */
// export function useWebContainer(projectId: string) {
//   const actions = useWorkspaceStore((state) => state.actions)
//   const { setWebcontainer, setPreviewUrl } = actions
//   const storeApi = useWorkspaceStoreApi()
//   /**
//    * 初始化 WebContainer 实例。
//    * 如果实例已存在则直接返回，否则启动一个新的实例并设置监听器。
//    */
//   const initWebContainer = useCallback(async () => {
//     const currentWc = storeApi.getState().webcontainer
//     if (currentWc) {
//       console.log("WebContainer instance already exists in store.")
//       return currentWc
//     }
//     console.log("？？？", bootPromise)
//     // 2. 如果已经有一个正在进行的 boot 进程，则直接等待它的结果，而不是创建一个新的。
//     if (bootPromise) {
//       toast.info("正在等待云端环境启动...")
//       return bootPromise
//     }

//     toast.loading("正在启动云端开发环境...", { id: "wc-boot" })

//     try {
//       // 3. 将 boot() 调用赋值给单例 Promise，上锁。
//       console.log('jinlai')
//       bootPromise = WebContainer.boot()
//       const wc = await bootPromise
//       console.log('wc', wc)
//       if (!wc) throw new Error("WebContainer boot failed silently.")

//       setWebcontainer(wc, projectId)

//       wc.on("server-ready", (port, url) => {
//         setPreviewUrl(`${url}?t=${Date.now()}`)
//         toast.success("预览服务器已就绪！")
//       })

//       wc.on("error", (error) =>
//         toast.error("开发容器发生错误", { description: error.message })
//       )

//       toast.success("开发环境已就绪！", { id: "wc-boot" })
//       return wc
//     } catch (error) {
//       const errorMessage = error instanceof Error ? error.message : "未知错误"
//       toast.error("启动开发环境失败", {
//         id: "wc-boot",
//         description: errorMessage,
//       })
//       console.log("errorMessage", errorMessage)
//       // 失败后重置 Promise，允许重试
//       bootPromise = null
//       return null
//     }
//   }, [setWebcontainer, projectId, setPreviewUrl, storeApi])

//   /**
//    * 安全地卸载 WebContainer 实例并重置相关状态。
//    */
//   const teardown = useCallback(() => {
//     const wc = storeApi.getState().webcontainer
//     wc?.teardown()
//     // 4. Teardown 时，必须重置 bootPromise，允许下一次完全重新启动。
//     bootPromise = null
//     setWebcontainer(null, null)
//   }, [setWebcontainer, storeApi])

//   /**
//    * 在 WebContainer 的虚拟文件系统中写入或更新一个文件。
//    * 会自动创建不存在的目录。
//    */
//   const writeFile = useCallback(
//     async (path: string, content: string) => {
//       const wc = storeApi.getState().webcontainer
//       if (!wc) {
//         toast.warning("WebContainer not ready, file write operation skipped.")
//         return
//       }
//       try {
//         const dir = path.substring(0, path.lastIndexOf("/"))
//         if (dir) {
//           await wc.fs.mkdir(dir, { recursive: true })
//         }
//         await wc.fs.writeFile(path, content)

//         setTimeout(async () => {
//           try {
//             const touchProcess = await wc.spawn("touch", [path])
//             await touchProcess.exit
//           } catch (touchError) {
//             console.warn(
//               `Could not 'touch' file ${path} after writing. HMR might be affected.`,
//               touchError
//             )
//           }
//         }, 0)
//       } catch (error) {
//         const errorMessage =
//           error instanceof Error ? error.message : "未知写入错误"
//         toast.error(`文件写入或更新失败: ${path}`, {
//           description: errorMessage,
//         })
//         console.error(`Error in writeFile for path "${path}":`, error)
//       }
//     },
//     [storeApi]
//   )

//   /**
//    * 从 WebContainer 的虚拟文件系统中读取一个文件。
//    */
//   const readFile = useCallback(
//     async (path: string): Promise<string | null> => {
//       const wc = storeApi.getState().webcontainer
//       if (!wc) {
//         toast.warning("开发容器尚未就绪，请稍候。")
//         return null
//       }
//       try {
//         return await wc.fs.readFile(path, "utf-8")
//       } catch (e) {
//         console.error(`Error reading file "${path}":`, e)
//         return null
//       }
//     },
//     [storeApi]
//   )

//   /**
//    * 从 WebContainer 的虚拟文件系统中删除一个文件或目录。
//    */
//   const deleteFile = useCallback(
//     async (path: string) => {
//       const wc = storeApi.getState().webcontainer
//       if (!wc) {
//         throw new Error("WebContainer not ready to delete file.")
//       }
//       await wc.fs.rm(path, { recursive: true })
//     },
//     [storeApi]
//   )

//   return {
//     initWebContainer,
//     teardown,
//     writeFile,
//     readFile,
//     deleteFile,
//   }
// }

// export function resetBootPromise() {
//   bootPromise = null
// }
"use client"

import { useCallback } from "react"
import { WebContainer } from "@webcontainer/api"
import { toast } from "sonner"
import {
  useWorkspaceStore,
  useWorkspaceStoreApi,
} from "@/stores/WorkspaceStoreProvider"

let bootPromise: Promise<WebContainer | null> | null = null

export function useWebContainer(projectId: string) {
  const actions = useWorkspaceStore((state) => state.actions)
  const { setWebcontainer, setPreviewUrl } = actions
  const storeApi = useWorkspaceStoreApi()
  const initWebContainer = useCallback(async () => {
    const currentWc = storeApi.getState().webcontainer
    if (currentWc) {
      console.log("WebContainer instance already exists in store.")
      return currentWc
    }

    if (bootPromise) {
      toast.info("正在等待云端环境启动...")
      return bootPromise
    }

    toast.loading("正在启动云端开发环境...", { id: "wc-boot" })

    try {
      bootPromise = WebContainer.boot()
      const wc = await bootPromise

      if (!wc) throw new Error("WebContainer boot failed silently.")

      setWebcontainer(wc, projectId)

      wc.on("server-ready", (port, url) => {
        console.log('url', url)
        setPreviewUrl(`${url}?t=${Date.now()}`)
        toast.success("预览服务器已就绪！")
      })

      wc.on("error", (error) =>
        toast.error("开发容器发生错误", { description: error.message })
      )

      toast.success("开发环境已就绪！", { id: "wc-boot" })
      return wc
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "未知错误"
      toast.error("启动开发环境失败", {
        id: "wc-boot",
        description: errorMessage,
      })
      console.log("errorMessage", errorMessage)
      bootPromise = null
      return null
    }
  }, [setWebcontainer, projectId, setPreviewUrl, storeApi])

  const teardown = useCallback(() => {
    const wc = storeApi.getState().webcontainer
    wc?.teardown()
    resetBootPromise()
    setWebcontainer(null, null)
  }, [setWebcontainer, storeApi])

  const writeFile = useCallback(
    async (path: string, content: string) => {
      const wc = storeApi.getState().webcontainer
      if (!wc) {
        toast.warning("WebContainer not ready, file write operation skipped.")
        return
      }
      try {
        const dir = path.substring(0, path.lastIndexOf("/"))
        if (dir) {
          await wc.fs.mkdir(dir, { recursive: true })
        }
        await wc.fs.writeFile(path, content)

        setTimeout(async () => {
          try {
            const touchProcess = await wc.spawn("touch", [path])
            await touchProcess.exit
          } catch (touchError) {
            console.warn(
              `Could not 'touch' file ${path} after writing. HMR might be affected.`,
              touchError
            )
          }
        }, 0)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "未知写入错误"
        toast.error(`文件写入或更新失败: ${path}`, {
          description: errorMessage,
        })
        console.error(`Error in writeFile for path "${path}":`, error)
      }
    },
    [storeApi]
  )

  const readFile = useCallback(
    async (path: string): Promise<string | null> => {
      const wc = storeApi.getState().webcontainer
      if (!wc) {
        toast.warning("开发容器尚未就绪，请稍候。")
        return null
      }
      try {
        return await wc.fs.readFile(path, "utf-8")
      } catch (e) {
        console.error(`Error reading file "${path}":`, e)
        return null
      }
    },
    [storeApi]
  )

  const deleteFile = useCallback(
    async (path: string) => {
      const wc = storeApi.getState().webcontainer
      if (!wc) {
        throw new Error("WebContainer not ready to delete file.")
      }
      await wc.fs.rm(path, { recursive: true })
    },
    [storeApi]
  )

  return {
    initWebContainer,
    teardown,
    writeFile,
    readFile,
    deleteFile,
  }
}

export function resetBootPromise() {
  bootPromise = null
}