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

        const currentDisplayed = target.substring(0, currentIndex)
        setDisplayedText(currentDisplayed)

        if (currentIndex < target.length) {
          currentIndexRef.current++
        }
      }

      if (currentIndexRef.current <= targetTextRef.current.length) {
        animationFrameIdRef.current = requestAnimationFrame(animate)
      }
    }

    animationFrameIdRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current)
      }
    }
  }, [speed])

  useEffect(() => {
    if (text === "" || !text.startsWith(displayedText)) {
      setDisplayedText("")
      currentIndexRef.current = 0
      previousTimeRef.current = 0
    }
  }, [text, displayedText])

  return displayedText
}
