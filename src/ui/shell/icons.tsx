import type { ReactNode } from 'react'

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const PanelLeftIcon = () => (
  <Icon>
    <rect x="2" y="3" width="12" height="10" rx="1.5" />
    <path d="M6 3v10" />
  </Icon>
)

/** Half-filled circle: the theme control. */
export const ThemeIcon = () => (
  <Icon>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" stroke="none" />
  </Icon>
)

export const LayoutIcon = () => (
  <Icon>
    <rect x="5.5" y="2" width="5" height="3.5" rx="1" />
    <rect x="1.5" y="10.5" width="5" height="3.5" rx="1" />
    <rect x="9.5" y="10.5" width="5" height="3.5" rx="1" />
    <path d="M8 5.5V8M4 10.5V8h8v2.5" />
  </Icon>
)

export const SearchIcon = () => (
  <Icon>
    <circle cx="7" cy="7" r="4.5" />
    <path d="M10.5 10.5L14 14" />
  </Icon>
)
