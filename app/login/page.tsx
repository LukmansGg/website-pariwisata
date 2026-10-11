"use client";

import { useActionState, useEffect, useState } from 'react';
import { loginAction, type LoginState } from '@/src/server/auth/actions';

const initialState: LoginState = {};
const MAX_ATTEMPTS = 3;

// --- IKON & ASET SVG REUSABLE (STRICT PALETTE) ---
const IconDroplet = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);

const IconEye = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const IconEyeSlash = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
  </svg>
);

const IconPlane = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
  </svg>
);

const IconSparkle = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path fillRule="evenodd" d="M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813A3.75 3.75 0 007.466 7.89l.813-2.846A.75.75 0 019 4.5zM18 1.5a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0118 1.5zm-6.5 15a.75.75 0 01.728.568l.258 1.036c.236.94.97 1.674 1.91 1.91l1.036.258a.75.75 0 010 1.456l-1.036.258c-.94.236-1.674.97-1.91 1.91l-.258 1.036a.75.75 0 01-1.456 0l-.258-1.036a2.625 2.625 0 00-1.91-1.91l-1.036-.258a.75.75 0 010-1.456l1.036-.258a2.625 2.625 0 001.91-1.91l.258-1.036A.75.75 0 0111.5 16.5z" clipRule="evenodd" />
  </svg>
);

const IconLock = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12">
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
  </svg>
);

const IconShieldAlert = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const IconCheckCircle = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-10 h-10">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const GlobalStyles = () => (
  <style dangerouslySetInnerHTML={{__html: `
    :root {
      --white: #FFFFFF;
      --merino: #F5EEDD;
      --rock-blue: #84B3CE;
      --venice-blue: #16587B;
    }

    /* CSS Barcode Generator */
    .css-barcode {
      background: repeating-linear-gradient(
        90deg,
        var(--venice-blue) 0,
        var(--venice-blue) 2px,
        transparent 2px,
        transparent 6px,
        var(--venice-blue) 6px,
        var(--venice-blue) 12px,
        transparent 12px,
        transparent 16px,
        var(--venice-blue) 16px,
        var(--venice-blue) 18px,
        transparent 18px,
        transparent 22px
      );
    }

    /* Keyframes for Staggered Entrance */
    @keyframes slideFadeUp {
      0% { opacity: 0; transform: translateY(30px) scale(0.98) rotateX(5deg); }
      100% { opacity: 1; transform: translateY(0) scale(1) rotateX(0); }
    }
    
    @keyframes pulseSparkle {
      0%, 100% { opacity: 0; transform: scale(0.5) rotate(0deg); }
      50% { opacity: 0.9; transform: scale(1.3) rotate(15deg); }
    }

    @keyframes scanline {
      0% { top: 0%; opacity: 0; }
      10% { opacity: 1; }
      90% { opacity: 1; }
      100% { top: 100%; opacity: 0; }
    }

    /* Pop-up & Overlay Animations */
    @keyframes popIn {
      0% { opacity: 0; transform: scale(0.85) translateY(20px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    @keyframes popOut {
      0% { opacity: 1; transform: scale(1) translateY(0); }
      100% { opacity: 0; transform: scale(0.9) translateY(-10px); pointer-events: none; }
    }

    @keyframes shake {
      0%, 100% { transform: translateX(0); }
      20%, 60% { transform: translateX(-6px); }
      40%, 80% { transform: translateX(6px); }
    }

    @keyframes lockScreenDrop {
      0% { opacity: 0; backdrop-filter: blur(0px); }
      100% { opacity: 1; backdrop-filter: blur(12px); }
    }

    @keyframes lockContentDrop {
      0% { opacity: 0; transform: scale(1.2) translateY(-40px); }
      100% { opacity: 1; transform: scale(1) translateY(0); }
    }

    /* Animation Classes */
    .animate-entrance-card {
      animation: slideFadeUp 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      opacity: 0;
      transform-origin: center bottom;
    }

    .animate-entrance-stagger-1 { animation: slideFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.1s forwards; opacity: 0; }
    .animate-entrance-stagger-2 { animation: slideFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards; opacity: 0; }
    .animate-entrance-stagger-3 { animation: slideFadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.3s forwards; opacity: 0; }
    
    .animate-sparkle-1 { animation: pulseSparkle 3s ease-in-out infinite 0.2s; }
    .animate-sparkle-2 { animation: pulseSparkle 4.5s ease-in-out infinite 1.5s; }
    .animate-sparkle-3 { animation: pulseSparkle 3.5s ease-in-out infinite 2.5s; }

    .scanline-bar {
      position: absolute;
      left: 0;
      right: 0;
      height: 2px;
      background: linear-gradient(90deg, transparent, var(--rock-blue), transparent);
      box-shadow: 0 0 12px var(--rock-blue);
      animation: scanline 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }

    /* Modal Animation States */
    .modal-enter { animation: popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
    .modal-exit { animation: popOut 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    .modal-shake { animation: shake 0.5s cubic-bezier(0.36, 0.07, 0.19, 0.97) both; }
    
    .lock-overlay-enter { animation: lockScreenDrop 0.8s ease-out forwards; }
    .lock-content-enter { animation: lockContentDrop 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.2s forwards; opacity: 0; }

    /* Interaction Improvements */
    .btn-smooth-hover {
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .btn-smooth-hover:active {
      transform: scale(0.95);
    }
    
    .input-smooth {
      transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
  `}} />
);

export default function StaffLoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const [currentDate, setCurrentDate] = useState('');
  const [currentTime, setCurrentTime] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockRemaining, setLockRemaining] = useState('');
  
  // State untuk Custom Pop-up Modal
  const [popup, setPopup] = useState<{
    isVisible: boolean;
    type: 'success' | 'error' | null;
    title: string;
    message: string;
    shouldShake?: boolean;
  }>({
    isVisible: false,
    type: null,
    title: '',
    message: '',
    shouldShake: false,
  });

  useEffect(() => {
    if (state.success) {
      setPopup({
        isVisible: true,
        type: 'success',
        title: 'Akses Diberikan',
        message: 'Kredensial terverifikasi. Mengalihkan ke ruang kerja…',
        shouldShake: false,
      });
      const timeout = window.setTimeout(() => {
        window.location.assign('/ruang-kelola');
      }, 1100);
      return () => window.clearTimeout(timeout);
    }

    if (state.error) {
      const remaining = state.attemptsRemaining ?? MAX_ATTEMPTS;
      setAttempts(MAX_ATTEMPTS - remaining);
      setIsLocked(Boolean(state.locked));

      if (!state.locked) {
        setPopup({
          isVisible: true,
          type: 'error',
          title: 'Akses Ditolak',
          message: state.error,
          shouldShake: true,
        });
        const timeout = window.setTimeout(() => {
          setPopup((previous) => ({ ...previous, shouldShake: false }));
        }, 500);
        return () => window.clearTimeout(timeout);
      }
    }
  }, [state]);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      setCurrentDate(now.toLocaleDateString('id-ID', {
        timeZone: 'Asia/Jakarta', day: '2-digit', month: 'short', year: 'numeric',
      }));
      setCurrentTime(`${now.toLocaleTimeString('id-ID', {
        timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false,
      })} WIB`);
    };
    updateClock();
    const timer = window.setInterval(updateClock, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!isLocked || !state.resetAt) return;
    const updateLockTimer = () => {
      const seconds = Math.max(0, Math.ceil((state.resetAt! - Date.now()) / 1000));
      setLockRemaining(`${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`);
      if (seconds === 0) setIsLocked(false);
    };
    updateLockTimer();
    const timer = window.setInterval(updateLockTimer, 1000);
    return () => window.clearInterval(timer);
  }, [isLocked, state.resetAt]);

  const closePopup = () => {
    setPopup(prev => ({ ...prev, isVisible: false }));
  };

  return (
    <>
      <GlobalStyles />
      {/* Background Utama (White) */}
      <div className="min-h-dvh bg-white flex items-center justify-center p-4 sm:p-6 md:p-8 relative overflow-x-hidden overflow-y-auto font-sans selection:bg-[#84B3CE] selection:text-white" style={{ perspective: '1200px' }}>
        
        {/* Dekorasi Bintang/Sparkle (Aksen Rock Blue & Venice Blue) */}
        <IconSparkle className="absolute top-[15%] left-[20%] w-6 h-6 text-[#84B3CE] opacity-0 animate-sparkle-1 pointer-events-none" />
        <IconSparkle className="absolute bottom-[20%] right-[15%] w-8 h-8 text-[#16587B] opacity-0 animate-sparkle-2 pointer-events-none" />
        <IconSparkle className="absolute top-[30%] right-[25%] w-4 h-4 text-[#84B3CE] opacity-0 animate-sparkle-3 pointer-events-none" />

        {/* CONTAINER UTAMA: TIKET BOARDING PASS (Merino) */}
        <main className="w-full max-w-5xl flex flex-col md:flex-row bg-[#F5EEDD] rounded-[2rem] sm:rounded-[2.5rem] shadow-[0_24px_80px_-15px_rgba(22,88,123,0.12)] relative z-10 animate-entrance-card border border-[#84B3CE]/20 transition-all duration-500">
          
          {/* BAGIAN KIRI: Form Login */}
          <section className="flex-1 p-8 sm:p-10 md:p-12 lg:p-16 flex flex-col relative z-20">
            
            {/* Header / Identitas */}
            <header className="flex items-center justify-between mb-10 md:mb-12 animate-entrance-stagger-1">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="text-[#16587B]">
                  <IconDroplet />
                </div>
                <h1 className="text-xl sm:text-2xl font-black text-[#16587B] tracking-tight">
                  MadiunTrip<span className="text-[#84B3CE]">.</span>
                </h1>
              </div>
              <div className="bg-white/80 backdrop-blur-md border border-[#84B3CE]/30 px-3 sm:px-4 py-1.5 rounded-full shadow-sm flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-[#16587B] animate-pulse"></span>
                <span className="text-[10px] sm:text-xs font-bold text-[#16587B] tracking-widest uppercase">Staff Access</span>
              </div>
            </header>

            {/* Judul & Deskripsi */}
            <div className="mb-8 sm:mb-10 animate-entrance-stagger-2">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-[#16587B] mb-3 leading-[1.1] tracking-tight">
                Destination:<br/>Workspace
              </h2>
              <p className="text-[#16587B]/70 font-medium max-w-sm text-sm sm:text-base leading-relaxed">
                Akses sistem pengelolaan destinasi wisata. Harap verifikasi boarding pass Anda.
              </p>
            </div>

            {/* Form Autentikasi */}
            <form action={formAction} className="flex flex-col gap-5 max-w-md relative animate-entrance-stagger-3">
              <div className="group relative">
                <label htmlFor="email" className="block text-[10px] sm:text-xs font-bold text-[#16587B] uppercase tracking-wide mb-1.5 ml-1">Kode Staf / Email</label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  autoComplete="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={isPending || isLocked || popup.type === 'success'}
                  placeholder="petugas@contoh.id"
                  className="w-full bg-white/70 backdrop-blur-sm border-2 border-white focus:border-[#84B3CE] rounded-xl px-4 py-3.5 text-[#16587B] placeholder-[#16587B]/30 font-medium outline-none input-smooth shadow-sm focus:shadow-md disabled:opacity-60 disabled:cursor-not-allowed hover:bg-white"
                />
              </div>

              <div className="group relative">
                <label htmlFor="password" className="block text-[10px] sm:text-xs font-bold text-[#16587B] uppercase tracking-wide mb-1.5 ml-1">Kata Sandi</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    required
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    disabled={isPending || isLocked || popup.type === 'success'}
                    placeholder="••••••••"
                    className="w-full bg-white/70 backdrop-blur-sm border-2 border-white focus:border-[#84B3CE] rounded-xl pl-4 pr-12 py-3.5 text-[#16587B] placeholder-[#16587B]/30 font-medium outline-none input-smooth shadow-sm focus:shadow-md disabled:opacity-60 disabled:cursor-not-allowed hover:bg-white"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isPending || isLocked || popup.type === 'success'}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-[#84B3CE] hover:text-[#16587B] rounded-lg transition-colors focus:outline-none disabled:opacity-50"
                    aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                  >
                    {showPassword ? <IconEyeSlash /> : <IconEye />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isPending || isLocked || popup.type === 'success'}
                className="mt-2 w-full bg-[#16587B] text-white font-bold py-4 px-6 rounded-xl shadow-[0_8px_20px_-6px_rgba(22,88,123,0.5)] hover:shadow-[0_12px_25px_-6px_rgba(22,88,123,0.6)] btn-smooth-hover flex items-center justify-center gap-2 group disabled:opacity-70 disabled:pointer-events-none relative overflow-hidden"
              >
                <span className="relative z-10 flex items-center gap-2">
                  {isPending ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                      Memvalidasi...
                    </>
                  ) : (
                    <>
                      Boarding Sekarang
                      <span className="transform group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform duration-300">
                        <IconPlane />
                      </span>
                    </>
                  )}
                </span>
                {/* Efek Shine saat hover */}
                <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent group-hover:animate-[scanline_1.5s_ease-in-out_infinite]"></div>
              </button>
            </form>

            <footer className="mt-12 sm:mt-auto pt-8 text-[10px] sm:text-xs font-medium text-[#16587B]/40 flex flex-wrap items-center gap-2 animate-entrance-stagger-3">
               <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4"><path fillRule="evenodd" d="M12 1.5a5.25 5.25 0 00-5.25 5.25v3a3 3 0 00-3 3v6.75a3 3 0 003 3h10.5a3 3 0 003-3v-6.75a3 3 0 00-3-3v-3c0-2.9-2.35-5.25-5.25-5.25zm3.75 8.25v-3a3.75 3.75 0 10-7.5 0v3h7.5z" clipRule="evenodd" /></svg>
               Enkripsi Terverifikasi • Akses Khusus Petugas
            </footer>
          </section>

          {/* PEMISAH TIKET (Perforasi) */}
          <div className="relative flex flex-row md:flex-col items-center justify-center pointer-events-none z-30">
             {/* Desktop Vertical */}
             <div className="hidden md:block w-[2px] h-full border-l-[3px] border-dashed border-[#84B3CE]/20"></div>
             {/* Desktop Cutouts */}
             <div className="hidden md:block absolute -top-4 w-8 h-8 rounded-full bg-white border-b border-[#84B3CE]/10 shadow-inner"></div>
             <div className="hidden md:block absolute -bottom-4 w-8 h-8 rounded-full bg-white border-t border-[#84B3CE]/10 shadow-inner"></div>

             {/* Mobile Horizontal */}
             <div className="block md:hidden w-full h-[2px] border-t-[3px] border-dashed border-[#84B3CE]/20 my-2"></div>
             {/* Mobile Cutouts */}
             <div className="block md:hidden absolute -left-4 w-8 h-8 rounded-full bg-white border-r border-[#84B3CE]/10 shadow-inner"></div>
             <div className="block md:hidden absolute -right-4 w-8 h-8 rounded-full bg-white border-l border-[#84B3CE]/10 shadow-inner"></div>
          </div>

          {/* BAGIAN KANAN: Tiket Stub (Detail Boarding Pass) */}
          <aside className="w-full md:w-[320px] lg:w-[360px] bg-[#F5EEDD] rounded-b-[2rem] sm:rounded-b-[2.5rem] md:rounded-bl-none md:rounded-r-[2.5rem] p-8 sm:p-10 flex flex-col justify-between relative z-20 animate-entrance-stagger-3">

            <div className="space-y-6 mt-2 md:mt-4">
              <div>
                <h3 className="text-[10px] font-bold text-[#16587B]/50 uppercase tracking-[0.2em] mb-1">Boarding Pass</h3>
                <p className="text-xl sm:text-2xl font-black text-[#16587B] tracking-tight">MDN-TRP-001</p>
              </div>

              <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                <div>
                  <h4 className="text-[10px] font-bold text-[#16587B]/50 uppercase tracking-widest mb-1">Date</h4>
                  <p className="text-sm sm:text-base font-bold text-[#16587B]">
                    {currentDate || 'Memuat...'}
                  </p>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-[#16587B]/50 uppercase tracking-widest mb-1">Time</h4>
                  <p className="text-sm sm:text-base font-bold text-[#16587B]">
                    {currentTime || 'Memuat...'}
                  </p>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-[#16587B]/50 uppercase tracking-widest mb-1">Terminal</h4>
                  <p className="text-sm sm:text-base font-bold text-[#16587B]">ADMIN</p>
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-[#16587B]/50 uppercase tracking-widest mb-1">Class</h4>
                  <p className="text-sm sm:text-base font-bold text-[#16587B]">PREMIUM</p>
                </div>
              </div>
            </div>

            {/* Area Barcode */}
            <div className="mt-10 md:mt-16 pt-8 border-t border-[#84B3CE]/20">
              <div className="w-full h-16 sm:h-20 css-barcode relative overflow-hidden opacity-80 mix-blend-multiply rounded-sm">
                 {/* Animasi Scanner pada idle */}
                 <div className="scanline-bar"></div>
              </div>
              <p className="text-center mt-4 text-[9px] sm:text-[10px] font-bold text-[#16587B]/50 tracking-[0.3em] uppercase">
                Scan to Authenticate
              </p>
            </div>
          </aside>
        </main>
      </div>

      {}
      {/* 1. Pop-up Modal (Success & Error) */}
      {popup.isVisible && !isLocked && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/20 backdrop-blur-sm transition-opacity duration-300">
          <div 
            className={`
              w-full max-w-sm bg-white rounded-[2rem] p-8 shadow-[0_20px_60px_-15px_rgba(22,88,123,0.3)]
              border border-[#84B3CE]/20 relative
              ${popup.isVisible ? 'modal-enter' : 'modal-exit'}
              ${popup.shouldShake ? 'modal-shake' : ''}
            `}
          >
            <div className="flex flex-col items-center text-center">
              {/* Ikon Dinamis */}
              <div className={`
                w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-inner
                ${popup.type === 'success' ? 'bg-[#84B3CE] text-white' : 'bg-[#16587B] text-white'}
              `}>
                {popup.type === 'success' ? <IconCheckCircle /> : <IconShieldAlert />}
              </div>
              
              <h3 className="text-2xl font-black text-[#16587B] mb-2">{popup.title}</h3>
              <p className="text-[#16587B]/70 font-medium text-sm mb-8 leading-relaxed">
                {popup.message}
              </p>
              
              {/* Informasi Sisa Percobaan (Khusus Error) */}
              {popup.type === 'error' && (
                <div className="mb-8 w-full bg-[#F5EEDD] rounded-xl py-3 px-4 border border-[#84B3CE]/30 flex items-center justify-between">
                  <span className="text-xs font-bold text-[#16587B] uppercase tracking-wider">Sisa Percobaan</span>
                  <span className="text-lg font-black text-[#16587B]">{Math.max(0, MAX_ATTEMPTS - attempts)}</span>
                </div>
              )}

              {/* Tombol Aksi */}
              {popup.type === 'error' ? (
                <button 
                  onClick={closePopup}
                  className="w-full bg-[#16587B] text-white font-bold py-3.5 px-6 rounded-xl btn-smooth-hover shadow-md"
                >
                  Coba Lagi
                </button>
              ) : (
                <div className="w-full bg-[#F5EEDD] text-[#16587B] font-bold py-3.5 px-6 rounded-xl border border-[#84B3CE]/20 flex justify-center">
                  <span className="animate-pulse">Memuat...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Lock Screen Overlay (Setelah 3x gagal) */}
      {isLocked && (
        <div className="fixed inset-0 z-[100] bg-[#16587B]/95 flex items-center justify-center p-6 lock-overlay-enter">
          
          {/* Background Ambient Animasi di Lock Screen */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-[#84B3CE] rounded-full mix-blend-screen filter blur-[100px] animate-pulse"></div>
            <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-white rounded-full mix-blend-screen filter blur-[120px] animate-pulse" style={{ animationDelay: '2s' }}></div>
          </div>

          <div className="relative z-10 max-w-md w-full flex flex-col items-center text-center lock-content-enter">
            
            <div className="w-32 h-32 rounded-full border-4 border-dashed border-[#84B3CE]/50 flex items-center justify-center mb-8 relative">
              <div className="absolute inset-0 rounded-full border-4 border-[#84B3CE] border-t-transparent animate-spin" style={{ animationDuration: '3s' }}></div>
              <div className="text-white">
                <IconLock />
              </div>
            </div>
            
            <div className="bg-white/10 backdrop-blur-md px-4 py-1.5 rounded-full border border-white/20 mb-6">
              <span className="text-xs font-black text-white tracking-[0.3em] uppercase">Security Protocol</span>
            </div>
            
            <h1 className="text-4xl sm:text-5xl font-black text-white mb-4 tracking-tight">Terminal Locked</h1>
            
            <p className="text-[#84B3CE] font-medium text-base sm:text-lg mb-8 leading-relaxed">
              Batas {MAX_ATTEMPTS} percobaan login tercapai. Form login dikunci sementara untuk melindungi akun. Coba kembali setelah penghitung waktu berakhir.
            </p>

            <div className="w-full bg-[#16587B] border border-[#84B3CE]/30 p-6 rounded-2xl">
              <p className="text-white/60 text-xs font-medium uppercase tracking-widest mb-1">Silakan Hubungi</p>
              <p className="text-white font-bold text-lg">System Administrator</p>
              <p className="mt-2 text-sm font-semibold text-[#84B3CE]">{lockRemaining ? `Coba lagi dalam ${lockRemaining}` : 'Penguncian sementara'}</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
