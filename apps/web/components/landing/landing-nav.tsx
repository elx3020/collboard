'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Dialog, DialogPanel } from '@headlessui/react'
import { Bars3Icon, XMarkIcon } from '@heroicons/react/24/outline'

const navigation = [
    { name: 'Collboard', href: '#' },
    { name: 'Features', href: '#' },
]

const linkClass = 'text-sm/6 font-semibold text-foreground'

function Logo({ priority = false }: { priority?: boolean }) {
    return (
        <Link href="/" className="-m-1.5 p-1.5">
            <span className="sr-only">Collboard</span>
            <Image
                alt="Collboard logo"
                src="/collboard-icon.svg"
                width={32}
                height={32}
                className="h-8 w-auto"
                priority={priority}
            />
        </Link>
    )
}

export default function LandingNav() {
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

    return (
        <header className="absolute inset-x-0 top-0 z-50">
            <nav aria-label="Global" className="flex items-center justify-between p-6 lg:px-8">
                <div className="flex lg:flex-1">
                    <Logo priority />
                </div>
                <button
                    type="button"
                    onClick={() => setMobileMenuOpen(true)}
                    className="-m-2.5 inline-flex items-center justify-center rounded-md p-2.5 text-muted-foreground lg:hidden"
                >
                    <span className="sr-only">Open main menu</span>
                    <Bars3Icon aria-hidden="true" className="size-6" />
                </button>
                <div className="hidden lg:flex lg:gap-x-12">
                    {navigation.map((item) => (
                        <a key={item.name} href={item.href} className={linkClass}>
                            {item.name}
                        </a>
                    ))}
                </div>
                <div className="hidden lg:flex lg:flex-1 lg:justify-end">
                    <Link href="/auth/signin" className={linkClass}>
                        Log in <span aria-hidden="true">&rarr;</span>
                    </Link>
                </div>
            </nav>

            <Dialog open={mobileMenuOpen} onClose={setMobileMenuOpen} className="lg:hidden">
                <div className="fixed inset-0 z-50" />
                <DialogPanel className="fixed inset-y-0 right-0 z-50 w-full overflow-y-auto bg-card p-6 sm:max-w-sm sm:ring-1 sm:ring-border">
                    <div className="flex items-center justify-between">
                        <Logo />
                        <button
                            type="button"
                            onClick={() => setMobileMenuOpen(false)}
                            className="-m-2.5 rounded-md p-2.5 text-muted-foreground"
                        >
                            <span className="sr-only">Close menu</span>
                            <XMarkIcon aria-hidden="true" className="size-6" />
                        </button>
                    </div>
                    <div className="mt-6 divide-y divide-border">
                        <div className="space-y-2 py-6">
                            {navigation.map((item) => (
                                <a
                                    key={item.name}
                                    href={item.href}
                                    className="-mx-3 block rounded-lg px-3 py-2 text-base/7 font-semibold text-foreground hover:bg-muted"
                                >
                                    {item.name}
                                </a>
                            ))}
                        </div>
                        <div className="py-6">
                            <Link
                                href="/auth/signin"
                                className="-mx-3 block rounded-lg px-3 py-2.5 text-base/7 font-semibold text-foreground hover:bg-muted"
                            >
                                Log in
                            </Link>
                        </div>
                    </div>
                </DialogPanel>
            </Dialog>
        </header>
    )
}
