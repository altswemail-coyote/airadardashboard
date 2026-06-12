/**
 * Design reference — runtime HTML/CSS lives in `airadar-loading-screen.js` (`getAiradarCompactCardHTML`).
 */
function LoadingDots({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';

  return (
    <div className="flex items-center gap-2">
      <span className={`${dotSize} animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.2s]`} />
      <span className={`${dotSize} animate-bounce rounded-full bg-cyan-300/90 [animation-delay:-0.1s]`} />
      <span className={`${dotSize} animate-bounce rounded-full bg-cyan-300/80`} />
    </div>
  );
}

function LoadingBar() {
  return (
    <div className="h-1 w-[180px] overflow-hidden rounded-full bg-white/10">
      <div className="h-full w-1/2 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(0,174,239,0.6)] animate-[loadingBar_2.2s_ease-in-out_infinite]" />
    </div>
  );
}

function CompactLoaderCard({
  title,
  subtitle,
  width = 'w-[420px]',
  height = 'min-h-[180px]',
}: {
  title: string;
  subtitle?: string;
  width?: string;
  height?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-[24px] border border-cyan-400/15 bg-[#061225]/95 shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl ${width} ${height}`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,174,239,0.10),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.015),rgba(255,255,255,0))]" />
      <div className="absolute inset-0 opacity-15">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:42px_42px]" />
      </div>
      <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/8 blur-3xl" />

      <div className="relative z-10 flex h-full flex-col">
        <div className="border-b border-white/8 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
            {title}
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-5 py-4 shadow-[0_0_30px_rgba(0,174,239,0.06)]">
            <img
              src="icons/logo-dark.svg"
              alt="AI Radar"
              className="w-[120px] opacity-95 drop-shadow-[0_0_18px_rgba(0,174,239,0.16)]"
            />
          </div>

          <div className="mt-5 text-[11px] font-semibold uppercase tracking-[0.28em] text-cyan-200/75">
            Loading your intelligence
          </div>

          {subtitle ? <div className="mt-2 text-sm text-white/50">{subtitle}</div> : null}

          <div className="mt-4">
            <LoadingDots size="sm" />
          </div>

          <div className="mt-4">
            <LoadingBar />
          </div>
        </div>
      </div>

      <style>{`
        @keyframes loadingBar {
          0% { transform: translateX(-110%) scaleX(0.8); }
          50% { transform: translateX(40%) scaleX(1); }
          100% { transform: translateX(210%) scaleX(0.8); }
        }
      `}</style>
    </div>
  );
}

export function PowerPromptsLoadingCard() {
  return (
    <CompactLoaderCard
      title="Power Prompts"
      subtitle="Generating prompts..."
      width="w-[520px] max-w-[92vw]"
      height="min-h-[200px]"
    />
  );
}

export function IntelligenceBriefLoadingCard() {
  return (
    <CompactLoaderCard
      title="Intelligence Brief"
      subtitle="Synthesizing insights..."
      width="w-[460px] max-w-[92vw]"
      height="min-h-[190px]"
    />
  );
}

export function PageBriefLoadingCard() {
  return (
    <CompactLoaderCard
      title="Page Brief"
      subtitle="Analyzing full article text..."
      width="w-[460px] max-w-[92vw]"
      height="min-h-[190px]"
    />
  );
}

export function NewsletterLoadingCard() {
  return (
    <CompactLoaderCard
      title="Newsletter"
      subtitle="Building your newsletter…"
      width="w-[520px] max-w-[92vw]"
      height="min-h-[200px]"
    />
  );
}
