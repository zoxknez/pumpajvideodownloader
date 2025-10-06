'use client';

import { Github, Mail, DollarSign, Code, Heart, Zap, Shield, Users, Rocket } from 'lucide-react';

export default function AboutView() {
  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      {/* Compact Hero + Badges */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <img 
            src="/pumpaj-128.png" 
            alt="Pumpaj Logo" 
            className="w-16 h-16 rounded-xl shadow-lg shadow-purple-500/30"
          />
          <div>
            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-red-300">
              PUMPAJ VIDEO DOWNLOADER
            </h1>
            <p className="text-sm text-slate-400">Fast, powerful & free video downloader</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="px-3 py-1 rounded-full bg-purple-500/20 border border-purple-400/30 text-xs font-semibold text-purple-200">
            v1.0.0
          </div>
          <div className="px-3 py-1 rounded-full bg-green-500/20 border border-green-400/30 text-xs font-semibold text-green-200">
            Open Source
          </div>
          <div className="px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-xs font-semibold text-blue-200">
            Free
          </div>
        </div>
      </div>

      {/* Main Grid Layout - 2 Columns */}
      <div className="grid lg:grid-cols-2 gap-4">
        
        {/* Left Column */}
        <div className="space-y-4">
          
          {/* About */}
          <div className="bg-gradient-to-br from-slate-800/50 to-purple-900/30 backdrop-blur-sm rounded-xl p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Code className="w-5 h-5 text-purple-300" />
              <h2 className="text-lg font-bold text-white">About</h2>
            </div>
            <p className="text-sm text-slate-300 leading-relaxed mb-3">
              Modern web app for downloading video and audio content. Built with cutting-edge technologies, 
              focusing on <strong className="text-red-300">speed</strong>, 
              <strong className="text-purple-300"> privacy</strong> and 
              <strong className="text-blue-300"> simplicity</strong>.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Files are <strong className="text-yellow-300">automatically deleted</strong> after download - 
              nothing is stored on our servers, guaranteeing your complete privacy.
            </p>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <Shield className="w-5 h-5 text-purple-300 mb-2" />
              <div className="text-sm font-bold text-white">100% Private</div>
              <div className="text-xs text-slate-400">No logging</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <Zap className="w-5 h-5 text-yellow-300 mb-2" />
              <div className="text-sm font-bold text-white">Fast</div>
              <div className="text-xs text-slate-400">Real-time SSE</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <Code className="w-5 h-5 text-blue-300 mb-2" />
              <div className="text-sm font-bold text-white">4K Quality</div>
              <div className="text-xs text-slate-400">Up to 2160p</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <Users className="w-5 h-5 text-green-300 mb-2" />
              <div className="text-sm font-bold text-white">100+ Sites</div>
              <div className="text-xs text-slate-400">Multi-platform</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <Rocket className="w-5 h-5 text-orange-300 mb-2" />
              <div className="text-sm font-bold text-white">Batch DL</div>
              <div className="text-xs text-slate-400">Playlists</div>
            </div>
            <div className="bg-white/5 rounded-xl p-3 border border-white/10">
              <Heart className="w-5 h-5 text-red-300 mb-2" />
              <div className="text-sm font-bold text-white">Free Forever</div>
              <div className="text-xs text-slate-400">Open Source</div>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="bg-gradient-to-br from-slate-800/50 to-blue-900/30 backdrop-blur-sm rounded-xl p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-blue-300" />
              <h2 className="text-lg font-bold text-white">Tech Stack</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="bg-white/5 rounded-lg p-2 border border-white/10 text-center">
                <div className="text-xs font-semibold text-sky-300">Next.js 15</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10 text-center">
                <div className="text-xs font-semibold text-green-300">Express</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10 text-center">
                <div className="text-xs font-semibold text-purple-300">Supabase</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10 text-center">
                <div className="text-xs font-semibold text-red-300">yt-dlp</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10 text-center">
                <div className="text-xs font-semibold text-orange-300">Vercel</div>
              </div>
              <div className="bg-white/5 rounded-lg p-2 border border-white/10 text-center">
                <div className="text-xs font-semibold text-yellow-300">SSE</div>
              </div>
            </div>
          </div>

        </div>

        {/* Right Column */}
        <div className="space-y-4">

          {/* Developer */}
          <div className="bg-gradient-to-br from-slate-800/50 to-red-900/30 backdrop-blur-sm rounded-xl p-5 border border-white/10">
            <div className="flex items-center gap-2 mb-3">
              <Heart className="w-5 h-5 text-red-300" />
              <h2 className="text-lg font-bold text-white">Developer</h2>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-red-500 flex items-center justify-center text-xl font-bold">
                Z
              </div>
              <div>
                <div className="text-base font-bold text-white">Zoran Knežević</div>
                <div className="text-xs text-slate-400">Full Stack Developer</div>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed mb-3">
              Passionate developer focused on modern web tech, UX and open source. 
              This project is dedicated to the community seeking tools without compromise.
            </p>
          </div>

          {/* Contact Links */}
          <div className="space-y-2">
            <a 
              href="https://github.com/zoxknez" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all group"
            >
              <Github className="w-5 h-5 text-slate-300 group-hover:text-white transition-colors" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">GitHub</div>
                <div className="text-xs text-slate-400">github.com/zoxknez</div>
              </div>
            </a>
            
            <a 
              href="mailto:zoxknez@gmail.com" 
              className="flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-xl border border-white/10 transition-all group"
            >
              <Mail className="w-5 h-5 text-slate-300 group-hover:text-blue-300 transition-colors" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">Email</div>
                <div className="text-xs text-slate-400">zoxknez@gmail.com</div>
              </div>
            </a>
            
            <a 
              href="https://www.paypal.com/paypalme/o0o0o0o0o0o0o" 
              target="_blank" 
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-3 bg-gradient-to-r from-blue-500/10 to-blue-600/10 hover:from-blue-500/20 hover:to-blue-600/20 rounded-xl border border-blue-400/30 transition-all group"
            >
              <DollarSign className="w-5 h-5 text-blue-300 transition-colors" />
              <div className="flex-1">
                <div className="text-sm font-semibold text-white">Support (PayPal)</div>
                <div className="text-xs text-blue-200">paypal.me/o0o0o0o0o0o0o</div>
              </div>
            </a>
          </div>

          {/* Support Message */}
          {/* Support Message */}
          <div className="bg-gradient-to-r from-purple-500/10 to-red-500/10 rounded-xl p-4 border border-purple-400/20">
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong className="text-purple-300">💜 Thank you!</strong> If you like this project, 
              consider a donation to help maintain servers and further development. 
              Every contribution keeps the app free for everyone!
            </p>
          </div>

        </div>
      </div>

      {/* Compact Footer */}
      <div className="text-center mt-4 pt-4 border-t border-white/10">
        <p className="text-xs text-slate-400">
          © 2024-2025 Pumpaj Video Downloader • Made with <Heart className="w-3 h-3 text-red-400 inline animate-pulse" /> in Novi Sad, Serbia
        </p>
        <div className="flex items-center justify-center gap-2 mt-2">
          <span className="px-2 py-0.5 bg-green-500/20 rounded-full text-xs text-green-300 border border-green-400/30">
            Open Source
          </span>
          <span className="px-2 py-0.5 bg-blue-500/20 rounded-full text-xs text-blue-300 border border-blue-400/30">
            MIT License
          </span>
          <span className="px-2 py-0.5 bg-purple-500/20 rounded-full text-xs text-purple-300 border border-purple-400/30">
            Free Forever
          </span>
        </div>
      </div>

    </div>
  );
}
