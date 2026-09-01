/**
 * Top nav — minimal placeholder bar wired to the app's mechanisms:
 * nav.ts-driven links (with role/dev filtering), sign-in via <AuthOverlay>,
 * and sign-out. Restyle or rebuild it freely; keep the data-testid hooks
 * (`app-navigation`, `nav-sign-in-button`, `nav-user-name`, `nav-user-email`)
 * — the shipped tests rely on them. `nav-user-email` is the one that carries
 * an identity the test can check exactly: a display name is optional, the
 * email is the credential the session was opened with.
 */

import { useState, useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AuthOverlay, useAuthProfileReady, signOut } from 'deepspace'
import { ChevronDown, LogOut, Menu, X } from 'lucide-react'
import { APP_NAME } from '../constants'
import type { Role } from '../constants'
import { nav } from '../nav'
import { cn } from '../lib/utils'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui'

/** Mono wall clock — the newsroom is always on the clock. */
function WireClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  const date = now
    .toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase()
  return (
    <span className="wire hidden items-center gap-2 text-chrome lg:flex" aria-hidden>
      <span className="breathe h-1.5 w-1.5 rounded-full bg-live" />
      <span>{date}</span>
      <span className="tabular-nums text-foreground/80">
        {hh}:{mm}
        <span className="text-chrome/60">:{ss}</span>
      </span>
    </span>
  )
}

/** Day/night desk toggle (D-027) — persisted, applied pre-paint in index.html. */
function ThemeToggle() {
  const [day, setDay] = useState(() => document.documentElement.dataset.theme === 'day')
  function toggle() {
    const next = !day
    setDay(next)
    document.documentElement.dataset.theme = next ? 'day' : 'slate'
    try {
      localStorage.setItem('warroom-theme', next ? 'day' : 'night')
    } catch {
      /* private windows: theme just won't persist */
    }
  }
  return (
    <button
      onClick={toggle}
      title={day ? 'Back to the night desk' : 'Switch to the day edition'}
      className="wire flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-chrome hover:border-chrome hover:text-foreground"
    >
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
        {day ? (
          // moon — click for night
          <path d="M9.5 7.5A4.5 4.5 0 014.6 1.6 4.5 4.5 0 106 10.5c1.5 0 2.8-.7 3.5-3z" />
        ) : (
          // sun — click for day
          <>
            <circle cx="6" cy="6" r="2.4" />
            <path d="M6 .8v1.4M6 9.8v1.4M.8 6h1.4M9.8 6h1.4M2.3 2.3l1 1M8.7 8.7l1 1M9.7 2.3l-1 1M3.3 8.7l-1 1" />
          </>
        )}
      </svg>
      {day ? 'NIGHT' : 'DAY'}
    </button>
  )
}

export default function Navigation() {
  const { isLoaded, isSignedIn, user, userLoading } = useAuthProfileReady({ requireUser: true })
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)

  const profileReady = !isSignedIn || (!userLoading && !!user)
  const userRole = (user?.role ?? 'anonymous') as Role | 'anonymous'

  // Close the mobile menu when navigating
  useEffect(() => {
    setMobileMenuOpen(false)
  }, [location.pathname])

  const visibleNav = nav.filter((item) => {
    if (item.devOnly && !import.meta.env.DEV) return false
    if (!item.roles) return true
    if (!profileReady) return false
    if (userRole === 'admin') return true
    return item.roles.includes(userRole as Role)
  })

  const navLink = (item: (typeof nav)[number]) => {
    const active = location.pathname.startsWith(item.path)
    return (
      <Link
        key={item.path}
        to={item.path}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'wire border-b px-3.5 py-2.5',
          active
            ? 'border-primary text-foreground'
            : 'border-transparent text-chrome hover:text-foreground',
        )}
      >
        {item.label.toUpperCase()}
      </Link>
    )
  }

  return (
    <>
      <nav data-testid="app-navigation" className="border-b border-border bg-background">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-5">
          <Link to="/home" className="flex items-baseline gap-2.5">
            <span className="font-serif text-3xl tracking-tight text-foreground">{APP_NAME}</span>
            <span className="wire hidden text-[9px] text-chrome/60 sm:inline">
              THE MEETING IS THE ARTIFACT
            </span>
          </Link>

          <div className="mx-1 hidden h-6 w-px bg-border md:block" />
          <div className="hidden items-center md:flex">{visibleNav.map(navLink)}</div>

          <div className="flex-1" />

          <WireClock />
          <ThemeToggle />

          {!isLoaded ? null : isSignedIn && !profileReady ? (
            /* Signed in, profile still loading — skeleton pill, never the
               Sign in button (that would offer sign-in to a signed-in user). */
            <div className="flex items-center gap-2 rounded-full border border-border bg-card/60 py-1 pl-1 pr-2.5">
              <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
              <div className="hidden h-4 w-20 animate-pulse rounded-md bg-muted sm:block" />
            </div>
          ) : isSignedIn && user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <button
                    aria-label="Account menu"
                    className="group flex items-center gap-2 rounded-full border border-border bg-card/60 py-1 pl-1 pr-2.5 text-sm transition-colors hover:bg-card"
                  >
                    <Avatar className="h-6 w-6 ring-1 ring-inset ring-border">
                      <AvatarImage src={user.imageUrl ?? undefined} referrerPolicy="no-referrer" />
                      <AvatarFallback className="text-[11px]">
                        {(user.name?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span
                      data-testid="nav-user-name"
                      className="hidden max-w-[140px] truncate text-foreground sm:inline"
                    >
                      {user.name || user.email}
                    </span>
                    <ChevronDown
                      className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-150 group-data-[popup-open]:rotate-180"
                      aria-hidden
                    />
                  </button>
                }
              />
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <div className="truncate font-medium text-foreground">
                    {user.name || 'Signed in'}
                  </div>
                  <div
                    data-testid="nav-user-email"
                    className="truncate text-xs font-normal text-muted-foreground"
                  >
                    {user.email}
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut aria-hidden />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <button
              data-testid="nav-sign-in-button"
              onClick={() => setShowAuthModal(true)}
              className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              Sign in
            </button>
          )}

          <button
            className="inline-flex h-8 w-8 items-center justify-center text-muted-foreground hover:text-foreground md:hidden"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-label="Toggle menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="flex flex-col border-t border-border px-2 py-2 md:hidden">
            {visibleNav.map(navLink)}
          </div>
        )}
      </nav>

      {showAuthModal && <AuthOverlay onClose={() => setShowAuthModal(false)} />}
    </>
  )
}
