"use client"

import React from "react"
import { Mic } from "lucide-react"
import { AnimatePresence, motion } from "motion/react"

import { cn } from "@/lib/utils"

interface VoiceInputProps {
  onStart?: () => void
  onStop?: () => void
  listening?: boolean
  setListening?: (l: boolean) => void
}

export function VoiceInput({
  className,
  onStart,
  onStop,
  listening,
  setListening,
  ...props
}: React.ComponentProps<"div"> & VoiceInputProps) {
  const [_listening, _setListening] = React.useState<boolean>(false)
  const [_time, _setTime] = React.useState<number>(0)

  const activeListening = listening !== undefined ? listening : _listening
  const activeSetListening = setListening !== undefined ? setListening : _setListening

  React.useEffect(() => {
    let intervalId: NodeJS.Timeout

    if (activeListening) {
      onStart?.()
      intervalId = setInterval(() => {
        _setTime((t) => t + 1)
      }, 1000)
    } else {
      onStop?.()
      _setTime(0)
    }

    return () => clearInterval(intervalId)
  }, [activeListening])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const onClickHandler = () => {
    activeSetListening(!activeListening)
  }

  return (
    <div className={cn("flex flex-col items-center justify-center", className)} {...props}>
      <motion.div
        className="flex p-2 border border-brand-border items-center justify-center rounded-full cursor-pointer bg-brand-bg text-brand-text hover:bg-brand-card transition-colors"
        layout
        transition={{
          layout: {
            duration: 0.4,
          },
        }}
        onClick={onClickHandler}
      >
        <div className="h-6 w-6 items-center justify-center flex ">
          {activeListening ? (
            <motion.div
              className="w-4 h-4 bg-brand-accent rounded-sm"
              animate={{
                rotate: [0, 180, 360],
              }}
              transition={{
                duration: 2,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }}
            />
          ) : (
            <Mic className="w-5 h-5 text-brand-accent" />
          )}
        </div>
        <AnimatePresence mode="wait">
          {activeListening && (
            <motion.div
              initial={{ opacity: 0, width: 0, marginLeft: 0 }}
              animate={{ opacity: 1, width: "auto", marginLeft: 8 }}
              exit={{ opacity: 0, width: 0, marginLeft: 0 }}
              transition={{
                duration: 0.4,
              }}
              className="overflow-hidden flex gap-2 items-center justify-center"
            >
              {/* Frequency Animation */}
              <div className="flex gap-0.5 items-center justify-center">
                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-0.5 bg-brand-accent rounded-full"
                    initial={{ height: 2 }}
                    animate={{
                      height: activeListening
                        ? [2, 3 + Math.random() * 10, 3 + Math.random() * 5, 2]
                        : 2,
                    }}
                    transition={{
                      duration: activeListening ? 1 : 0.3,
                      repeat: activeListening ? Infinity : 0,
                      delay: activeListening ? i * 0.05 : 0,
                      ease: "easeInOut",
                    }}
                  />
                ))}
              </div>
              {/* Timer */}
              <div className="text-xs text-brand-muted w-10 text-center font-mono">
                {formatTime(_time)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
