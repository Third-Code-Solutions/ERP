'use client'

import { useState } from 'react'

type Theme = 'light' | 'dark'

export function ThemeToggle({ initialTheme }: { initialTheme: Theme }) {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  function toggleTheme(): void {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    const shell = document.querySelector<HTMLElement>('.app-layout, .platform-layout')
    if (!shell) return

    shell.dataset.theme = nextTheme
    document.cookie = `erp_theme=${nextTheme}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
    setTheme(nextTheme)
  }

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
      aria-pressed={theme === 'dark'}
      title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
    >
      <span aria-hidden="true">{theme === 'dark' ? '☀' : '☾'}</span>
      <span className="theme-toggle-label">{theme === 'dark' ? 'Light' : 'Dark'}</span>
    </button>
  )
}
