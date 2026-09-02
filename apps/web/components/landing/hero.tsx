import Link from 'next/link'
import { clsx } from 'clsx'
import type { ReactNode } from 'react'

interface HeroProps {
    title: ReactNode
    subtitle?: ReactNode
    cta?: { label: string; href: string }
    /** Decorative layer rendered behind the content, e.g. <HeroGlow />. */
    background?: ReactNode
    className?: string
}

/**
 * Full-viewport section with centered title, subtitle and a single call to action.
 * Carries no visuals of its own — pass a `background` to theme it per page.
 */
export default function Hero({ title, subtitle, cta, background, className }: HeroProps) {
    return (
        <section
            className={clsx(
                'relative isolate flex min-h-dvh items-center justify-center px-6 py-24 lg:px-8',
                className
            )}
        >
            {background && (
                <div aria-hidden="true" className="absolute inset-0 -z-10 overflow-hidden">
                    {background}
                </div>
            )}

            <div className="mx-auto max-w-2xl text-center">
                <h1 className="text-5xl font-semibold tracking-tight text-balance text-foreground sm:text-7xl">
                    {title}
                </h1>

                {subtitle && (
                    <p className="mt-8 text-lg font-medium text-pretty text-muted-foreground sm:text-xl/8">
                        {subtitle}
                    </p>
                )}

                {cta && (
                    <Link
                        href={cta.href}
                        className="mt-10 inline-block rounded-md bg-accent px-3.5 py-2.5 text-sm font-semibold text-accent-foreground shadow-xs hover:bg-accent/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                    >
                        {cta.label}
                    </Link>
                )}
            </div>
        </section>
    )
}
