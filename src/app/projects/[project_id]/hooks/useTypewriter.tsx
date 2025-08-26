import { useState, useEffect, useRef } from "react"


export const useTypewriter = (text: string, speed: number = 15): string => {
  const [displayedText, setDisplayedText] = useState<string>("")

  const targetTextRef = useRef<string>(text)

  const currentIndexRef = useRef<number>(0)

  const previousTimeRef = useRef<number>(0)

  const animationFrameIdRef = useRef<number | null>(null)

  useEffect(() => {
    targetTextRef.current = text
  }, [text])

  useEffect(() => {
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - previousTimeRef.current

      if (deltaTime > speed) {
        previousTimeRef.current = currentTime

        const target = targetTextRef.current
        const currentIndex = currentIndexRef.current

        if (currentIndex < target.length) {
          setDisplayedText(target.substring(0, currentIndex + 1))
          currentIndexRef.current++
        }
      }

      animationFrameIdRef.current = requestAnimationFrame(animate)
    }

    animationFrameIdRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [speed]) 
    
  useEffect(() => {
    if (text === "" || (text.length > 0 && text[0] !== displayedText[0])) {
      setDisplayedText("")
      currentIndexRef.current = 0
      previousTimeRef.current = 0
    }
  }, [text])

  return displayedText
}
