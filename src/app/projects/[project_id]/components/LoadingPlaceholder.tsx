import { Bot } from "lucide-react";

export const LoadingPlaceholder = () => (
  <div className='flex gap-3 items-start animate-in fade-in duration-300'>
    <div className='w-8 h-8 rounded-full bg-neutral-700 flex items-center justify-center flex-shrink-0'>
      <Bot size={18} />
    </div>
    <div className='p-3 rounded-lg bg-[#161b22] text-white flex items-center gap-3'>
      <span className='text-neutral-300'>正在分析您的需求</span>
      <div className='flex gap-1'>
        <span
          className='h-1.5 w-1.5 rounded-full bg-neutral-400 animate-pulse'
          style={{ animationDelay: "0s" }}
        ></span>
        <span
          className='h-1.5 w-1.5 rounded-full bg-neutral-400 animate-pulse'
          style={{ animationDelay: "0.2s" }}
        ></span>
        <span
          className='h-1.5 w-1.5 rounded-full bg-neutral-400 animate-pulse'
          style={{ animationDelay: "0.4s" }}
        ></span>
      </div>
    </div>
  </div>
)
