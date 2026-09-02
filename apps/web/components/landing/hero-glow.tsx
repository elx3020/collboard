const BLOB_CLIP =
    'polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)'

/** The blur lives on the wrapper: clip-path is applied after filters, so blurring
 *  the clipped element itself would give it hard edges. */
function Blob({ wrapper, shape }: { wrapper: string; shape: string }) {
    return (
        <div className={`absolute inset-x-0 transform-gpu blur-3xl ${wrapper}`}>
            <div
                style={{ clipPath: BLOB_CLIP }}
                className={`relative aspect-1155/678 w-144.5 -translate-x-1/2 bg-accent opacity-30 sm:w-288.75 ${shape}`}
            />
        </div>
    )
}

/** Two blurred accent blobs — the landing page background for <Hero />. */
export default function HeroGlow() {
    return (
        <>
            <Blob
                wrapper="-top-40 sm:-top-80"
                shape="left-[calc(50%-11rem)] rotate-30 sm:left-[calc(50%-30rem)]"
            />
            <Blob
                wrapper="top-[calc(100%-13rem)] sm:top-[calc(100%-30rem)]"
                shape="left-[calc(50%+3rem)] sm:left-[calc(50%+36rem)]"
            />
        </>
    )
}
