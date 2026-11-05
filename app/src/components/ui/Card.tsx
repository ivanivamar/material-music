import type { ElementType, HTMLAttributes, ReactNode } from 'react'

/** Surface variants of the shared content card (components/ui/card.css). */
export type CardVariant = 'outlined' | 'filled' | 'raised' | 'inset' | 'empty'
export type CardSize = 'sm' | 'md' | 'lg'

export type CardOptions = { variant?: CardVariant; size?: CardSize; interactive?: boolean; flush?: boolean }

/** Class list for a content card, for elements that can't be swapped for <Card> (e.g. <a>, <button>). */
export function cardClass({ variant = 'outlined', size = 'md', interactive, flush }: CardOptions = {}, extra?: string) {
  return [
    'card',
    variant !== 'outlined' && `card-${variant}`,
    `card-${size}`,
    interactive && 'card-interactive',
    flush && 'card-flush',
    extra,
  ]
    .filter(Boolean)
    .join(' ')
}

/**
 * The one content-card surface. Pages pass a className for their own layout only;
 * colour, radius, outline, padding scale and hover all come from card.css.
 */
export function Card({
  as: Tag = 'div',
  variant,
  size,
  interactive,
  flush,
  className,
  children,
  ...rest
}: CardOptions & { as?: ElementType; className?: string; children?: ReactNode } & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cardClass({ variant, size, interactive, flush }, className)} {...rest}>
      {children}
    </Tag>
  )
}
