# ResumeIQ design system

## Direction

Quiet, professional productivity software: warm-white surfaces, deep ink typography, and restrained green accents. Hierarchy comes from spacing and type, not gradients, fake metrics, logos, or decorative dashboards. No third-party branding/assets and no remote font downloads.

## Tokens

Source of truth: `src/app/globals.css`. Tailwind v4 maps semantic utilities to CSS variables.

| Role | Token / value | Usage |
| --- | --- | --- |
| Canvas | `background` / `#f8faf8` | Page background |
| Surface | `card` / `#ffffff` | Forms and content cards |
| Text | `foreground` / `#192f33` | Headings and body |
| Supporting text | `muted-foreground` / `#586b66` | Instructions and descriptions |
| Brand/action | `primary` / `#17624f` | CTA, selected controls, accents |
| Soft selection | `accent` / `#e8f3ec` | Selected cards and confirmation |
| Neutral tint | `muted` / `#f0f4f1` | Notices and disabled controls |
| Borders | `border` / `#dce5df` | Card separators |
| Input border | `input` / `#bbc9c1` | Form control boundaries |
| Focus | `ring` / `#287c65` | Visible 2px outlines, offset from controls |
| Error | `destructive` / `#b32e36` | Validation text and error borders |

Light theme only in this phase; no dead theme toggle. The landing privacy panel uses a dark green editorial surface with light text, not an application dark mode.

## Typography and layout

- System stack: Segoe UI, Arial, Helvetica, sans-serif. No network dependency.
- Body: generally 16px with generous line height; supporting copy 14px, metadata 12px.
- Headings: semibold, tight tracking; hero 36px mobile / 60px from `sm`, section headings 30–36px.
- Text fields: 16px to avoid mobile input zoom; multiline fields have a visible resize affordance.
- Standard Tailwind 4px spacing unit: favor 8, 12, 16, 24, 32, 48, 64, and 96px intervals.
- Container: max-width `max-w-6xl`; horizontal padding 20px mobile, 32px at `sm`, 40px at `lg`.
- Breakpoints: standard Tailwind `sm` 640px, `md` 768px, `lg` 1024px. Mode cards become two columns at `sm`; review sidebar appears alongside at `lg`.
- Verification includes 320px narrow phones, 390/393px mobile, 768px tablet, and desktop layouts.

## Borders, corners, and surfaces

Use 1px solid borders for cards and inputs; 2px dashed border for file drop area. Radius scale: 6px small, 8px controls, 12px inset groups, 16px cards, 24px editorial hero panel. Subtle `shadow-xs` on cards; no large floating shadows. Selected radio cards use a brand border plus inset outline and check indicator, not color alone.

## Reusable controls

- `Button` / `buttonVariants`: existing shadcn Base UI primitive customized to 44px default / 48px large targets; primary, outline, secondary, ghost, destructive, and link variants. Use real `Link`/anchor elements styled with `buttonVariants` for navigation.
- `Card`: surface, padding, border, radius, and small shadow; page content supplies semantic headings/sections.
- `Textarea` / `.field-control`: default, hover, focus, invalid, disabled, and placeholder states share tokens. `aria-invalid` controls error styling. Labels and instructions are always outside the placeholder.
- `Notice`: info, success, or error appearance; caller chooses appropriate `role`, labeling, or focus behavior.
- Native radio inputs cover selectable mode cards. Their semantic group is a `fieldset`/`legend`; arrows work without custom keyboard handlers.
- File picker stays a native input with a visible styled label and focus-within ring. Drag/drop is an additional input method, not the only one.

## Interaction and accessibility

- Navigation remains real links; no simulated buttons or unavailable analysis CTA.
- Full 44px or larger default action targets. Disabled extraction/confirmation controls explain their prerequisites and completed state.
- Actual file-read/server-processing loading, reduced-motion-safe spinner, accessible live status, cancel/start-over controls, and specific errors.
- Validation focuses the invalid field; extraction focuses the editable text; confirmation receives focus. Paste fallback focuses its textarea. Reset returns focus to file selection even after a pending read is cancelled.
- Selection, errors, and success are described in text as well as color/icons.
- Layout stacks on small screens and wraps long filenames. No fixed-width text blocks or clipped job descriptions.
- Global `prefers-reduced-motion` rule disables unnecessary animation/transition; focus remains visible.

Keyboard/browser checks are not a full WCAG audit. No assistive-technology certification, physical-device testing, or cross-engine coverage is claimed.
