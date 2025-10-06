'use client';

import React from 'react';
import { Settings, User, LogOut, Mail, Crown, Info } from 'lucide-react';
import { useAuth } from './AuthProvider';

export default function SettingsView() {
  const { me, logout } = useAuth();

  const handleLogout = async () => {
    if (confirm('Are you sure you want to logout?')) {
      await logout();
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Settings className="w-6 h-6 text-purple-400" />
        <h2 className="text-2xl font-bold text-white">Settings</h2>
      </div>

      {/* Profile Section */}
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl blur-xl wave-bg"></div>
        <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <User className="w-5 h-5 text-blue-400" />
            <h3 className="text-xl font-bold text-white">Profile</h3>
          </div>

          <div className="space-y-4">
            {/* Email */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-400">Email</p>
                  <p className="text-base font-medium text-white">{me?.email || 'Not set'}</p>
                </div>
              </div>
            </div>

            {/* Username */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                <User className="w-5 h-5 text-slate-400" />
                <div>
                  <p className="text-sm text-slate-400">Username</p>
                  <p className="text-base font-medium text-white">{me?.username || me?.email || 'Not set'}</p>
                </div>
              </div>
            </div>

            {/* Plan */}
            <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-center gap-3">
                <Crown className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-sm text-slate-400">Plan</p>
                  <p className="text-base font-medium text-white flex items-center gap-2">
                    {me?.plan || 'FREE'}
                    {me?.plan === 'PREMIUM' && (
                      <span className="px-2 py-0.5 text-xs bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-400/30 rounded">
                        Premium Active
                      </span>
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-red-500/20 hover:bg-red-500/30 border border-red-400/30 rounded-xl transition-all duration-200 text-red-300 hover:text-red-200"
            >
              <LogOut className="w-5 h-5" />
              <span className="font-semibold">Logout</span>
            </button>
          </div>
        </div>
      </div>

      {/* Application Info Section */}
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl blur-xl wave-bg"></div>
        <div className="relative bg-white/5 backdrop-blur-md rounded-2xl p-6 border border-white/10">
          <div className="flex items-center gap-3 mb-6">
            <Info className="w-5 h-5 text-green-400" />
            <h3 className="text-xl font-bold text-white">Application Info</h3>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <span className="text-sm text-slate-400">Version</span>
              <span className="text-sm font-medium text-white">1.0.0</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/5">
              <span className="text-sm text-slate-400">Platform</span>
              <span className="text-sm font-medium text-white">Web</span>
            </div>
          </div>
        </div>
      </div>

      {/* Help Section */}
      <div className="text-center text-sm text-slate-400 py-4">
        <p>Need help? Contact support at <a href="mailto:support@pumpaj.com" className="text-blue-400 hover:text-blue-300">support@pumpaj.com</a></p>
      </div>
    </div>
  );
}
