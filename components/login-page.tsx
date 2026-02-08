"use client"

import type React from "react"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { User, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAuth } from "@/hooks/use-auth"

export default function LoginPage() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const { login } = useAuth()
  const router = useRouter()
  const beanLayerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

    let lastSpawn = 0
    const spawnBeans = () => {
      const now = Date.now()
      if (now - lastSpawn < 140) return
      lastSpawn = now

      const layer = beanLayerRef.current
      if (!layer) return

      const beanCount = Math.floor(Math.random() * 2) + 1
      for (let i = 0; i < beanCount; i += 1) {
        const bean = document.createElement("span")
        bean.className = "coffee-bean"
        bean.style.left = `${Math.random() * 90 + 5}%`
        bean.style.animationDuration = `${Math.random() * 1.8 + 3.2}s`
        bean.style.opacity = `${Math.random() * 0.4 + 0.4}`
        bean.style.transform = `rotate(${Math.random() * 180}deg)`
        layer.appendChild(bean)

        window.setTimeout(() => {
          bean.remove()
        }, 5200)
      }
    }

    window.addEventListener("scroll", spawnBeans, { passive: true })
    window.addEventListener("touchmove", spawnBeans, { passive: true })

    return () => {
      window.removeEventListener("scroll", spawnBeans)
      window.removeEventListener("touchmove", spawnBeans)
    }
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")

    try {
      const result = await login(username, password)
      if (!result.ok) {
        throw new Error(result.error || "Invalid username or password")
      }
      router.push("/dashboard")
    } catch (err: any) {
      setError(err.message || "Invalid username or password")
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-8">
      <div ref={beanLayerRef} className="pointer-events-none absolute inset-0 overflow-hidden" />
      <div className="relative z-10 flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <div className="w-full max-w-md">
          <div className="bg-white/85 dark:bg-slate-900/75 rounded-2xl border border-white/50 dark:border-white/10 shadow-2xl backdrop-blur-md p-6 sm:p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-green-700">FarmFlow</h1>
              <p className="text-gray-600 mt-2">Sign in to access your estate operations workspace</p>
            </div>

          {error && <div className="bg-red-50 text-red-700 p-3 rounded-md mb-4 text-sm">{error}</div>}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Label htmlFor="username" className="block text-gray-700 mb-1">
                  Username
                </Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <Input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    placeholder="Enter username"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="password" className="block text-gray-700 mb-1">
                  Password
                </Label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    placeholder="Enter password"
                    required
                  />
                </div>
              </div>

              <Button type="submit" className="w-full bg-green-700 hover:bg-green-800">
                Sign In
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
