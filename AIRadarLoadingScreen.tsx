/**
 * Design reference — the Chrome extension uses the vanilla port:
 * `airadar-loading-screen.css` + `airadar-loading-screen.js` (`getAiradarLoadingHTML`).
 */
export default function AIRadarLoadingScreen() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06111b] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,174,239,0.12),transparent_34%),radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.035),transparent_22%),radial-gradient(circle_at_80%_30%,rgba(0,174,239,0.06),transparent_18%),linear-gradient(180deg,#07111a_0%,#03070c_100%)]" />

      <div className="absolute inset-0 opacity-20">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:56px_56px]" />
      </div>

      <div className="absolute left-1/2 top-1/2 h-[40rem] w-[40rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-400/5 blur-3xl animate-pulse" />
      <div className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/5" />
      <div className="absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/10" />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-6">
        <div className="rounded-[32px] border border-white/10 bg-white/5 px-8 py-8 shadow-2xl backdrop-blur-xl">
          <img
            src="/logo-dark.png"
            alt="AI Radar"
            className="w-[320px] max-w-[72vw] opacity-95 drop-shadow-[0_0_24px_rgba(0,174,239,0.16)] sm:w-[420px]"
          />
        </div>

        <div className="mt-8 text-center">
          <div className="text-sm uppercase tracking-[0.35em] text-cyan-200/75">
            Loading your intelligence
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300 [animation-delay:-0.2s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300/90 [animation-delay:-0.1s]" />
          <span className="h-2 w-2 animate-bounce rounded-full bg-cyan-300/80" />
        </div>

        <div className="mt-6 h-1.5 w-[320px] max-w-[78vw] overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 rounded-full bg-cyan-400 shadow-[0_0_18px_rgba(0,174,239,0.6)] animate-[loadingBar_2.2s_ease-in-out_infinite]" />
        </div>

        <style>{`
          @keyframes loadingBar {
            0% { transform: translateX(-110%) scaleX(0.8); }
            50% { transform: translateX(40%) scaleX(1); }
            100% { transform: translateX(210%) scaleX(0.8); }
          }
        `}</style>
      </div>
    </div>
  );
}