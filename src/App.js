import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { supabase, isCloudEnabled } from './supabase';
import { useLS, useIDB } from './cloudHooks';
import { useLeadsCloud } from './useLeadsCloud';
import { draftLeadResponse, DEFAULT_CONCIERGE_SETTINGS } from './aiResponder';
import { draftSocialReply, looksLikeSpam, isLowSignalComment, DEFAULT_SOCIAL_SETTINGS } from './aiSocialAgent';
import { scoreAllLeads, groupByBucket, BUCKET_META } from './aiDatabaseIntel';
import { multiplyClosing } from './aiClosingMultiplier';
import VideoAuto from './VideoAuto';
import AIStudio from './AIStudio';
import AdComposer from './AdComposer';
import GoogleBusiness from './GoogleBusiness';
import ViralStudio from './ViralStudio';
import InfluencerWatch from './InfluencerWatch';
import Finances from './Finances';
import {
  Sparkles, MessageSquare, Video, Film, Calendar, FolderOpen, Heart,
  Share2, CalendarDays, BarChart3, Search, RefreshCw, Layout, FlaskConical,
  Globe, Mail, Settings, HelpCircle, Image, Clock, Users, DollarSign,
  Plus, Trash2, Copy, Edit3, ChevronRight, ChevronLeft, X, Check, Upload,
  Send, Bell, Save, Zap, ChevronDown, ChevronUp, Menu, ArrowLeft,
  RotateCcw, Wand2, Camera, ThumbsUp, Activity, Home, Play, Star,
  CheckCircle, AlertCircle, Info, List, Bookmark, TrendingUp, MapPin,
  Phone, Building, Key, FileText, UserCheck, Briefcase, Target, Award
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

// ─── STYLES ───────────────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800;900&family=DM+Serif+Display:ital@0;1&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body, #root { height: 100%; overflow: hidden; }

    body {
      font-family: 'DM Sans', sans-serif;
      background: #050810;
      color: #ffffff;
      font-size: 14px;
      font-weight: 600;
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    #root::before {
      content: '';
      position: fixed;
      inset: 0;
      background:
        radial-gradient(ellipse 80% 50% at 20% 0%, rgba(20,90,160,.13) 0%, transparent 60%),
        radial-gradient(ellipse 60% 40% at 80% 100%, rgba(212,160,23,.07) 0%, transparent 60%),
        radial-gradient(ellipse 40% 30% at 60% 50%, rgba(30,80,140,.05) 0%, transparent 60%);
      pointer-events: none;
      z-index: 0;
    }

    ::-webkit-scrollbar { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: rgba(20,90,160,.35); border-radius: 10px; }

    .sidebar {
      width: 236px; min-width: 236px; height: 100vh;
      background: rgba(6,8,18,.9);
      backdrop-filter: blur(20px);
      border-right: 1px solid rgba(255,255,255,.05);
      display: flex; flex-direction: column;
      position: relative; z-index: 10; overflow-y: auto;
    }
    .sidebar-logo {
      padding: 22px 18px 16px;
      border-bottom: 1px solid rgba(255,255,255,.05);
    }
    .sidebar-logo-mark {
      width: 36px; height: 36px; border-radius: 10px;
      background: linear-gradient(135deg, #1a5aa0, #2d7dd2);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 900; color: #fff;
      box-shadow: 0 4px 20px rgba(26,90,160,.45);
      font-family: 'DM Serif Display', serif;
    }
    .sidebar-title { font-size: 12.5px; font-weight: 800; color: #f1f5f9; letter-spacing: -.2px; line-height: 1.2; }
    .sidebar-sub { font-size: 9px; font-weight: 700; color: #475569; letter-spacing: 1.5px; text-transform: uppercase; }

    .nav-section { font-size: 9px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: #1e2d44; padding: 14px 18px 6px; }

    .nav-item {
      display: flex; align-items: center; gap: 9px;
      padding: 8px 14px; margin: 1px 8px; border-radius: 9px;
      cursor: pointer; transition: all .15s; color: #94a3b8;
      font-size: 13px; font-weight: 700; border: none; background: none; width: calc(100% - 16px); text-align: left;
    }
    .nav-item:hover { background: rgba(255,255,255,.04); color: #ffffff; }
    .nav-item.active {
      background: linear-gradient(135deg, rgba(26,90,160,.22), rgba(45,125,210,.1));
      color: #7eb8f7;
      border-left: 2px solid #1a5aa0;
      box-shadow: inset 0 0 20px rgba(26,90,160,.07);
    }
    .nav-item.active svg { filter: drop-shadow(0 0 6px rgba(126,184,247,.45)); }

    .sidebar-user {
      padding: 12px 14px; border-top: 1px solid rgba(255,255,255,.05);
      display: flex; align-items: center; gap: 10px;
    }
    .sidebar-avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: linear-gradient(135deg, #1a5aa0, #d4a017);
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 800; color: #fff; flex-shrink: 0;
      font-family: 'DM Serif Display', serif;
    }

    .main-layout { display: flex; height: 100vh; overflow: hidden; position: relative; z-index: 1; }
    .page-area { flex: 1; overflow-y: auto; height: 100vh; }

    .topbar {
      position: sticky; top: 0; z-index: 20;
      background: rgba(5,8,16,.85); backdrop-filter: blur(20px);
      border-bottom: 1px solid rgba(255,255,255,.05);
      padding: 0 28px; height: 56px;
      display: flex; align-items: center; justify-content: space-between;
    }
    .topbar-crumb { font-size: 12px; color: #475569; display: flex; align-items: center; gap: 6px; }
    .topbar-crumb .sep { color: #1e2d44; }
    .topbar-crumb .current { color: #94a3b8; font-weight: 600; }

    .page-content { padding: 28px 32px; }

    .glass-card {
      background: rgba(255,255,255,.025);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 18px; padding: 24px;
    }
    .glass-card-sm {
      background: rgba(255,255,255,.02);
      border: 1px solid rgba(255,255,255,.06);
      border-radius: 13px; padding: 16px;
    }

    .stat-card {
      border-radius: 18px; padding: 22px;
      position: relative; overflow: hidden;
      border: 1px solid rgba(255,255,255,.07);
    }
    .stat-card::after {
      content: ''; position: absolute; top: -60px; right: -60px;
      width: 160px; height: 160px; border-radius: 50%;
      background: inherit; opacity: .12; filter: blur(30px);
      pointer-events: none;
    }
    .stat-card-1 { background: linear-gradient(135deg, rgba(26,90,160,.28), rgba(18,65,120,.16)); }
    .stat-card-2 { background: linear-gradient(135deg, rgba(212,160,23,.2), rgba(180,130,10,.12)); }
    .stat-card-3 { background: linear-gradient(135deg, rgba(16,185,129,.2), rgba(5,150,105,.12)); }
    .stat-card-4 { background: linear-gradient(135deg, rgba(139,92,246,.2), rgba(109,40,217,.12)); }
    .stat-number { font-size: 30px; font-weight: 900; letter-spacing: -1px; color: #f8fafc; font-family: 'DM Serif Display', serif; }
    .stat-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,.4); text-transform: uppercase; letter-spacing: .8px; margin-bottom: 10px; }
    .stat-icon { position: absolute; top: 20px; right: 20px; opacity: .3; }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      border-radius: 9px; padding: 9px 18px; font-size: 13px; font-weight: 600;
      cursor: pointer; transition: all .2s; border: none; font-family: 'DM Sans', inherit; white-space: nowrap;
    }
    .btn-blue {
      background: linear-gradient(135deg, #1a5aa0, #1565c0); color: #fff;
      box-shadow: 0 4px 15px rgba(26,90,160,.35);
    }
    .btn-blue:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(26,90,160,.5); }
    .btn-blue:disabled { opacity: .4; cursor: not-allowed; transform: none; box-shadow: none; }
    .btn-gold { background: linear-gradient(135deg, #d4a017, #b8860b); color: #000; font-weight: 700; box-shadow: 0 4px 15px rgba(212,160,23,.3); }
    .btn-gold:hover { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(212,160,23,.45); }
    .btn-ghost { background: rgba(255,255,255,.05); color: #64748b; border: 1px solid rgba(255,255,255,.08); }
    .btn-ghost:hover { background: rgba(26,90,160,.12); color: #7eb8f7; border-color: rgba(26,90,160,.3); }
    .btn-danger { background: rgba(239,68,68,.1); color: #f87171; border: 1px solid rgba(239,68,68,.2); }
    .btn-danger:hover { background: rgba(239,68,68,.2); }
    .btn-green { background: linear-gradient(135deg, #10b981, #059669); color: #fff; box-shadow: 0 4px 15px rgba(16,185,129,.25); }
    .btn-sm { padding: 6px 14px; font-size: 12px; }
    .btn-xs { padding: 4px 10px; font-size: 11px; border-radius: 7px; }
    .btn-icon { padding: 7px; }
    .btn-back {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.08);
      border-radius: 8px; padding: 5px 12px 5px 8px; color: #64748b;
      font-size: 12px; font-weight: 600; cursor: pointer; transition: all .15s;
    }
    .btn-back:hover { background: rgba(26,90,160,.1); color: #7eb8f7; border-color: rgba(26,90,160,.3); }

    .input, .select, .textarea {
      background: rgba(255,255,255,.04);
      border: 1px solid rgba(255,255,255,.08);
      border-radius: 9px; padding: 10px 14px;
      color: #f1f5f9; font-size: 14px; font-family: 'DM Sans', inherit;
      width: 100%; outline: none; transition: all .2s;
    }
    .input:focus, .select:focus, .textarea:focus {
      border-color: rgba(26,90,160,.55);
      background: rgba(26,90,160,.07);
      box-shadow: 0 0 0 3px rgba(26,90,160,.12);
    }
    .input::placeholder, .textarea::placeholder { color: #1e2d44; }
    .select {
      appearance: none; cursor: pointer;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
      background-repeat: no-repeat; background-position: right 12px center; padding-right: 34px;
    }
    .select option { background: #0d1020; color: #e2e8f0; }
    .textarea { resize: vertical; min-height: 90px; line-height: 1.65; }
    input[type=range] { accent-color: #1a5aa0; width: 100%; }
    input[type=checkbox] { accent-color: #1a5aa0; width: 15px; height: 15px; cursor: pointer; }
    input[type=date], input[type=time], input[type=datetime-local] { color-scheme: dark; }

    .label { font-size: 12px; font-weight: 800; color: #ffffff; margin-bottom: 7px; text-transform: uppercase; letter-spacing: .6px; }
    .page-title { font-size: 28px; font-weight: 900; letter-spacing: -.5px; color: #f8fafc; font-family: 'DM Serif Display', serif; }
    .page-sub { font-size: 14px; color: #cbd5e1; font-weight: 600; margin-top: 4px; }
    .gradient-text { background: linear-gradient(135deg, #7eb8f7, #d4a017); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .section-title { font-size: 15px; font-weight: 800; color: #ffffff; margin-bottom: 14px; }

    .badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .badge-blue { background: rgba(26,90,160,.2); color: #7eb8f7; }
    .badge-gold { background: rgba(212,160,23,.15); color: #f0c040; }
    .badge-green { background: rgba(16,185,129,.15); color: #6ee7b7; }
    .badge-red { background: rgba(239,68,68,.15); color: #fca5a5; }
    .badge-purple { background: rgba(139,92,246,.15); color: #c4b5fd; }
    .badge-gray { background: rgba(255,255,255,.06); color: #64748b; }

    .ptag { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700; }
    .ptag-ig { background: rgba(225,48,108,.15); color: #f9a8d4; }
    .ptag-fb { background: rgba(24,119,242,.15); color: #93c5fd; }
    .ptag-yt { background: rgba(255,0,0,.15); color: #fca5a5; }
    .ptag-tw { background: rgba(29,161,242,.15); color: #7dd3fc; }
    .ptag-li { background: rgba(0,119,181,.15); color: #7eb8f7; }
    .ptag-zi { background: rgba(0,109,147,.15); color: #67c7e8; }

    .row-item {
      display: flex; align-items: center; gap: 12px;
      padding: 12px 16px; border-radius: 11px;
      border: 1px solid rgba(255,255,255,.05);
      background: rgba(255,255,255,.02);
      transition: all .15s;
    }
    .row-item:hover { border-color: rgba(26,90,160,.2); background: rgba(26,90,160,.04); }

    .flex-between { display: flex; align-items: center; justify-content: space-between; }
    .flex-center { display: flex; align-items: center; justify-content: center; }
    .flex-row { display: flex; align-items: center; gap: 10px; }
    .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .grid-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
    .grid-4 { display: grid; grid-template-columns: repeat(4,1fr); gap: 16px; }
    .grid-auto { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap: 14px; }
    .col { display: flex; flex-direction: column; gap: 14px; }
    .divider { border: none; border-top: 1px solid rgba(255,255,255,.05); margin: 18px 0; }

    .char-count { font-size: 11px; color: #475569; text-align: right; margin-top: 5px; }
    .char-count.warn { color: #d4a017; }
    .char-count.over { color: #ef4444; }

    .empty-state { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 20px; gap: 12px; }
    .empty-state svg { opacity: .2; }
    .empty-state h3 { font-size: 15px; font-weight: 700; color: #475569; }
    .empty-state p { font-size: 13px; color: #374151; text-align: center; max-width: 260px; }

    .spinner { width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.15); border-top-color: #7eb8f7; border-radius: 50%; animation: spin .7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .toast { background: rgba(8,10,22,.96); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,.1); border-radius: 12px; padding: 13px 16px; font-size: 13px; display: flex; align-items: center; gap: 10px; min-width: 280px; box-shadow: 0 20px 60px rgba(0,0,0,.5); animation: toastIn .25s cubic-bezier(.175,.885,.32,1.275); }
    @keyframes toastIn { from { transform: translateX(110%) scale(.9); opacity: 0; } to { transform: translateX(0) scale(1); opacity: 1; } }
    .toast-success { border-left: 3px solid #10b981; }
    .toast-error { border-left: 3px solid #ef4444; }
    .toast-info { border-left: 3px solid #1a5aa0; }

    .toggle-sw { position: relative; width: 40px; height: 22px; cursor: pointer; }
    .toggle-sw input { opacity: 0; width: 0; height: 0; position: absolute; }
    .toggle-track { position: absolute; inset: 0; background: rgba(255,255,255,.1); border-radius: 22px; transition: .25s; }
    .toggle-track::before { content: ''; position: absolute; width: 16px; height: 16px; left: 3px; bottom: 3px; background: #64748b; border-radius: 50%; transition: .25s; }
    .toggle-sw input:checked + .toggle-track { background: #1a5aa0; box-shadow: 0 0 10px rgba(26,90,160,.45); }
    .toggle-sw input:checked + .toggle-track::before { transform: translateX(18px); background: #fff; }

    .tabs { display: flex; gap: 3px; background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.06); border-radius: 11px; padding: 4px; }
    .tab { display: inline-flex; align-items: center; gap: 6px; padding: 7px 14px; border-radius: 8px; font-size: 12.5px; font-weight: 600; cursor: pointer; transition: all .15s; border: none; background: none; color: #3a4a60; }
    .tab:hover { color: #94a3b8; }
    .tab.active { background: rgba(26,90,160,.2); color: #7eb8f7; box-shadow: inset 0 0 0 1px rgba(26,90,160,.35); }

    .output-box { background: rgba(0,0,0,.3); border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 18px; white-space: pre-wrap; font-size: 13px; line-height: 1.8; color: #cbd5e1; min-height: 100px; }

    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.75); backdrop-filter: blur(8px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .modal { background: rgba(8,10,22,.97); backdrop-filter: blur(30px); border: 1px solid rgba(255,255,255,.1); border-radius: 22px; padding: 30px; max-width: 540px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 40px 100px rgba(0,0,0,.6); }

    .quick-action-card {
      background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.06);
      border-radius: 16px; padding: 20px; cursor: pointer;
      transition: all .2s; display: flex; align-items: center; gap: 14px;
      text-align: left;
    }
    .quick-action-card:hover { transform: translateY(-2px); border-color: rgba(255,255,255,.12); background: rgba(255,255,255,.04); }
    .quick-action-icon { border-radius: 12px; padding: 12px; flex-shrink: 0; }

    .info-banner { border-radius: 11px; padding: 12px 16px; font-size: 12.5px; line-height: 1.6; display: flex; gap: 10px; align-items: flex-start; }
    .info-blue { background: rgba(26,90,160,.08); border: 1px solid rgba(26,90,160,.25); color: #7eb8f7; }
    .info-gold { background: rgba(212,160,23,.08); border: 1px solid rgba(212,160,23,.25); color: #f0c040; }
    .info-green { background: rgba(16,185,129,.08); border: 1px solid rgba(16,185,129,.2); color: #6ee7b7; }
    .info-red { background: rgba(239,68,68,.08); border: 1px solid rgba(239,68,68,.2); color: #fca5a5; }

    .cal-cell { min-height: 90px; border: 1px solid rgba(255,255,255,.05); border-radius: 9px; padding: 7px; cursor: pointer; transition: all .15s; }
    .cal-cell:hover { background: rgba(255,255,255,.03); border-color: rgba(26,90,160,.25); }
    .cal-cell.today { border-color: rgba(26,90,160,.45); background: rgba(26,90,160,.06); }
    .cal-cell.other-month { opacity: .25; }
    .cal-cell.selected { border-color: rgba(26,90,160,.65); background: rgba(26,90,160,.1); }

    .lead-card { border-radius: 13px; padding: 14px 16px; border: 1px solid rgba(255,255,255,.06); background: rgba(255,255,255,.02); transition: all .15s; }
    .lead-card:hover { border-color: rgba(26,90,160,.2); background: rgba(26,90,160,.04); }
    .lead-status-hot { border-left: 3px solid #ef4444; }
    .lead-status-warm { border-left: 3px solid #f59e0b; }
    .lead-status-cold { border-left: 3px solid #3b82f6; }
    .lead-status-closed { border-left: 3px solid #10b981; }

    @media (max-width: 768px) {
      .sidebar { position: fixed; left: -236px; z-index: 100; transition: left .25s; }
      .sidebar.open { left: 0; box-shadow: 20px 0 60px rgba(0,0,0,.5); }
      .grid-2, .grid-3, .grid-4 { grid-template-columns: 1fr; }
      .page-content { padding: 14px; }
      .page-title { font-size: 20px !important; }
      .topbar { padding: 0 12px; height: 52px; }
      .stat-card { padding: 14px 16px; }
      .stat-number { font-size: 26px !important; }
      .glass-card { padding: 14px 16px; }
      .tabs { flex-wrap: wrap; }
      .tab { font-size: 11px; padding: 6px 10px; }
    }
    @media (max-width: 480px) {
      .page-content { padding: 10px; }
      .glass-card { padding: 12px 13px; border-radius: 11px; }
    }
    /* Safe area for iPhone notch / home indicator */
    .page-area { padding-bottom: env(safe-area-inset-bottom, 0px); }
    .topbar { padding-top: env(safe-area-inset-top, 0px); }

    /* PWA install banner */
    .pwa-banner {
      position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
      background: linear-gradient(135deg, #1a5aa0, #2d7dd2);
      color: #fff; border-radius: 14px; padding: 14px 20px;
      display: flex; align-items: center; gap: 12px;
      box-shadow: 0 8px 32px rgba(26,90,160,.5);
      z-index: 9000; min-width: 300px; max-width: 90vw;
      animation: slideUp .3s ease;
    }
    @keyframes slideUp { from { opacity:0; transform: translateX(-50%) translateY(20px); } to { opacity:1; transform: translateX(-50%) translateY(0); } }

    /* ─────────────────────────────────────────────────────────────
       Light Theme (.theme-light) — opt-in cream theme applied to
       individual pages. Inspired by Compass / Sotheby's editorial
       aesthetic. Cabinet Grotesk titles + Inter body.
       ───────────────────────────────────────────────────────────── */
    @import url('https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800,900&display=swap');
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

    .theme-light {
      background: linear-gradient(180deg, #FAF6EE 0%, #F0E7D2 100%);
      margin: -28px -32px;
      padding: 32px 36px 60px;
      min-height: 100vh;
      position: relative;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    .theme-light::before {
      content: '';
      position: absolute;
      inset: 0;
      background:
        radial-gradient(ellipse 50% 30% at 90% 0%, rgba(201,154,44,.10) 0%, transparent 60%),
        radial-gradient(ellipse 40% 25% at 0% 100%, rgba(26,90,160,.06) 0%, transparent 60%);
      pointer-events: none;
      z-index: 0;
    }
    .theme-light > * { position: relative; z-index: 1; }
    .theme-light input,
    .theme-light textarea,
    .theme-light select,
    .theme-light button { font-family: inherit; }

    /* Typography — dark warm text on cream */
    .theme-light, .theme-light div, .theme-light span,
    .theme-light h1, .theme-light h2, .theme-light h3,
    .theme-light p, .theme-light button, .theme-light label { color: #3F3528; }
    .theme-light h1, .theme-light .page-title,
    .theme-light [style*="DM Serif Display"] {
      font-family: 'Cabinet Grotesk', 'Inter', sans-serif !important;
      font-weight: 800 !important;
      letter-spacing: -.025em !important;
      color: #2C2418 !important;
    }
    .theme-light .page-title { font-size: 30px; letter-spacing: -.5px; }
    .theme-light .page-sub { color: #8B7A5F !important; font-size: 13px; }

    /* Back button */
    .theme-light .btn-back {
      background: rgba(255,255,255,.7) !important;
      border: 1px solid rgba(26,90,160,.18) !important;
      color: #2C2418 !important;
    }
    .theme-light .btn-back:hover { background: #fff !important; }

    /* Cards — bright white with soft warm shadow */
    .theme-light .glass-card,
    .theme-light .stat-card {
      background: #FFFFFF !important;
      border: 1px solid rgba(26,90,160,.10) !important;
      box-shadow: 0 2px 14px rgba(26,90,160,.06), 0 1px 3px rgba(0,0,0,.04) !important;
      border-radius: 14px !important;
      backdrop-filter: none !important;
    }
    .theme-light .stat-card .stat-label { color: #6B5D4B !important; font-weight: 700 !important; }
    .theme-light .stat-card .stat-number { color: #2C2418 !important; }
    .theme-light .stat-card .stat-icon { color: #C99A2C !important; }

    /* Inputs */
    .theme-light .input,
    .theme-light .select {
      background: #FFFFFF !important;
      border: 1.5px solid rgba(26,90,160,.18) !important;
      color: #2C2418 !important;
      font-weight: 600 !important;
    }
    .theme-light .input::placeholder { color: #98A2B5 !important; opacity: 1 !important; }
    .theme-light .input:focus,
    .theme-light .select:focus {
      border-color: #1A5AA0 !important;
      box-shadow: 0 0 0 3px rgba(26,90,160,.15) !important;
      outline: none !important;
    }
    .theme-light .label {
      color: #6B5D4B !important;
      font-weight: 700 !important;
      font-size: 11px !important;
      letter-spacing: .3px !important;
      text-transform: uppercase !important;
    }

    /* Buttons */
    .theme-light .btn-ghost {
      background: rgba(255,255,255,.85) !important;
      color: #2C2418 !important;
      border: 1px solid rgba(26,90,160,.18) !important;
      font-weight: 700 !important;
    }
    .theme-light .btn-ghost:hover { background: #fff !important; border-color: rgba(26,90,160,.35) !important; }
    .theme-light .btn-blue {
      background: linear-gradient(135deg,#1A5AA0,#2D7DD2) !important;
      color: #fff !important;
      font-weight: 700 !important;
      box-shadow: 0 3px 12px rgba(26,90,160,.32) !important;
    }
    .theme-light .btn-blue:hover { box-shadow: 0 6px 20px rgba(26,90,160,.45) !important; transform: translateY(-1px); }
    .theme-light .btn-danger {
      background: rgba(220,38,38,.08) !important;
      color: #DC2626 !important;
      border: 1px solid rgba(220,38,38,.22) !important;
    }
    .theme-light .btn-danger:hover { background: rgba(220,38,38,.15) !important; }

    /* Badges — vibrant solid */
    .theme-light .badge {
      padding: 5px 11px !important;
      border-radius: 99px !important;
      font-size: 10.5px !important;
      font-weight: 800 !important;
      letter-spacing: .3px !important;
      text-transform: uppercase !important;
      color: #fff !important;
    }
    .theme-light .badge-red    { background: #DC2626 !important; }
    .theme-light .badge-blue   { background: #1A5AA0 !important; }
    .theme-light .badge-gold   { background: #C99A2C !important; }
    .theme-light .badge-green  { background: #16A34A !important; }
    .theme-light .badge-gray   { background: #6B7280 !important; }

    /* Tabs */
    .theme-light .tabs {
      background: rgba(255,255,255,.5);
      border: 1px solid rgba(63,53,40,.12);
      border-radius: 12px;
      padding: 3px;
      display: inline-flex;
      gap: 2px;
    }
    .theme-light .tab {
      padding: 7px 14px;
      border: none;
      background: transparent;
      color: #6B5D4B !important;
      font-weight: 600;
      font-size: 12.5px;
      border-radius: 9px;
      cursor: pointer;
      transition: all .15s;
    }
    .theme-light .tab:hover { background: rgba(255,255,255,.7); color: #2C2418 !important; }
    .theme-light .tab.active {
      background: #FFFFFF !important;
      color: #2C2418 !important;
      box-shadow: 0 1px 4px rgba(26,90,160,.12), 0 0 0 1px rgba(26,90,160,.10);
      font-weight: 700;
    }

    /* Empty state */
    .theme-light .empty-state { color: #8B7A5F !important; padding: 50px 24px !important; }
    .theme-light .empty-state h3 { color: #2C2418 !important; font-size: 17px !important; }
    .theme-light .empty-state p { color: #8B7A5F !important; }
    .theme-light .empty-state svg { color: #C99A2C !important; opacity: .7; }

    /* Force-override of common inline dark text */
    .theme-light [style*="color:\"#fff\""],
    .theme-light [style*="color:\"#ffffff\""],
    .theme-light [style*="color:\"#f1f5f9\""] { color: #2C2418 !important; }
    .theme-light [style*="color:\"#64748b\""],
    .theme-light [style*="color:\"#94a3b8\""],
    .theme-light [style*="color:\"#475569\""],
    .theme-light [style*="color:\"#374151\""] { color: #6B5D4B !important; }
  `}</style>
);

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PLATFORMS = {
  instagram: { label:"Instagram", color:"#e1306c", cls:"ptag-ig" },
  facebook:  { label:"Facebook",  color:"#1877f2", cls:"ptag-fb" },
  youtube:   { label:"YouTube",   color:"#ff4444", cls:"ptag-yt" },
  twitter:   { label:"X/Twitter", color:"#1da1f2", cls:"ptag-tw" },
  linkedin:  { label:"LinkedIn",  color:"#0077b5", cls:"ptag-li" },
  zillow:    { label:"Zillow",    color:"#006d93", cls:"ptag-zi" },
};

const LIMITS = { instagram:2200, facebook:63206, youtube:5000, twitter:280, linkedin:3000, zillow:2000 };

const PROPERTY_TYPES = ["Single Family","Condo","Townhouse","Multi-Family","Land","Commercial","Luxury","Fixer-Upper","New Construction","Investment Property"];

const LEAD_STATUSES = ["Hot Prospect","Contact","Buyer","Seller","Casually Browsing","Nurture 3-6 Months","Nurture 1+ Year","Buy/Sell Nurture","Pending","Past Client","Closed","Trash"];

const TASK_TYPES = ["Call","Text","Email","Follow-up","Meeting","To-Do"];
const TASK_ICONS = {Call:"📞",Text:"💬",Email:"📧","Follow-up":"🔔",Meeting:"📅","To-Do":"✅"};
const TASK_COLORS = {Call:"#ef4444",Text:"#8b5cf6",Email:"#3b82f6","Follow-up":"#f59e0b",Meeting:"#10b981","To-Do":"#64748b"};

const BUILT_IN_PLANS = [
  { id:"plan_new_lead", name:"New Lead — 7 Day Blitz", isBuiltIn:true,
    description:"Aggressive first-week follow-up. Best for hot prospects and fresh inquiries.",
    steps:[
      {day:0, type:"Call",      title:"Welcome call — introduce yourself, find out their timeline"},
      {day:0, type:"Text",      title:"Text: 'Hi [name]! This is Monica Iskra. Just tried to reach you — happy to help you find your perfect home!'"},
      {day:1, type:"Email",     title:"Send intro email with neighborhood market snapshot"},
      {day:2, type:"Call",      title:"Follow-up call attempt #2"},
      {day:3, type:"Text",      title:"Text: 'Still here to help whenever you're ready. Any questions?'"},
      {day:5, type:"Email",     title:"Send 3 active listings that match their criteria"},
      {day:7, type:"Call",      title:"7-day check-in call — where are they in their search?"},
    ]
  },
  { id:"plan_buyer", name:"New Buyer Nurture (30 Day)", isBuiltIn:true,
    description:"For serious buyers — walks them from inquiry to showing appointments.",
    steps:[
      {day:0, type:"Call",      title:"Initial buyer consultation — budget, timeline, must-haves"},
      {day:1, type:"Email",     title:"Send buyer guide + pre-approval referral info"},
      {day:3, type:"Call",      title:"Check on pre-approval status, answer questions"},
      {day:7, type:"Email",     title:"Send curated home search with 5 top matches"},
      {day:10, type:"Call",     title:"Schedule first showings"},
      {day:14, type:"Text",     title:"Text: 'New listing just hit that fits your search — want to see it?'"},
      {day:21, type:"Call",     title:"3-week check-in — adjust search criteria?"},
      {day:30, type:"Email",    title:"30-day market update for their target area"},
    ]
  },
  { id:"plan_seller", name:"New Seller Prospect", isBuiltIn:true,
    description:"Convert a seller inquiry into a listing appointment.",
    steps:[
      {day:0, type:"Call",      title:"Initial call — understand their motivation and timeline"},
      {day:1, type:"Email",     title:"Send personalized CMA and neighborhood market report"},
      {day:2, type:"Call",      title:"CMA follow-up — answer pricing questions"},
      {day:5, type:"Email",     title:"Send your listing presentation and marketing plan"},
      {day:7, type:"Call",      title:"Schedule listing appointment"},
      {day:14, type:"Follow-up",title:"Check in — any hesitation? Address objections"},
      {day:21, type:"Email",    title:"Send comparable active listings to show market activity"},
      {day:30, type:"Call",     title:"Final push — are they ready to list?"},
    ]
  },
  { id:"plan_nurture_6mo", name:"Nurture — 6 Month", isBuiltIn:true,
    description:"For leads who are 3–6 months out. Stay top of mind without being pushy.",
    steps:[
      {day:0,   type:"Email",   title:"Welcome email — set expectations, offer help whenever they're ready"},
      {day:14,  type:"Call",    title:"Friendly check-in — any questions about the market?"},
      {day:30,  type:"Email",   title:"Month 1 market update for their target area"},
      {day:60,  type:"Call",    title:"2-month check-in — timeline update?"},
      {day:90,  type:"Email",   title:"Quarter market report — prices, inventory, trends"},
      {day:120, type:"Call",    title:"4-month check-in — are they getting closer?"},
      {day:150, type:"Email",   title:"5-month — send relevant new listings"},
      {day:180, type:"Call",    title:"6-month full check-in — ready to move forward?"},
    ]
  },
  { id:"plan_past_client", name:"Past Client Annual Check-In", isBuiltIn:true,
    description:"Stay top of mind with clients who already closed. Referral gold.",
    steps:[
      {day:0,   type:"Call",    title:"Annual check-in call — how's the home treating them?"},
      {day:1,   type:"Email",   title:"Send personalized home value update for their address"},
      {day:90,  type:"Email",   title:"Spring/Fall market update for their neighborhood"},
      {day:180, type:"Call",    title:"Mid-year check-in — any friends or family looking?"},
      {day:270, type:"Email",   title:"Holiday message + year-end market report"},
      {day:365, type:"Call",    title:"1-year anniversary call — how can I help?"},
    ]
  },
];

const CALL_OUTCOMES = [
  {id:"answered",       label:"Answered",          color:"#10b981", followUpDays:3},
  {id:"voicemail",      label:"Left Voicemail",     color:"#7eb8f7", followUpDays:1},
  {id:"no_answer",      label:"No Answer",          color:"#f59e0b", followUpDays:1},
  {id:"appt_set",       label:"Appointment Set 🎉", color:"#10b981", followUpDays:null},
  {id:"not_interested", label:"Not Interested",     color:"#ef4444", followUpDays:null},
  {id:"callback",       label:"Requested Callback", color:"#a78bfa", followUpDays:1},
];

// ─── BUILT-IN DRIP CAMPAIGNS ──────────────────────────────────────────────
// Research-grounded cadences (Tom Ferry / Sierra 8x8 / Zillow 10-Day plan /
// Brian Buffini 33-touch / FUB text-first playbook). Targets Metro Detroit
// (Livonia, Plymouth, Northville, Novi, Canton — I-275 corridor, $350K+).
//
// Each step is typed:
//   email — subject + body, queued to email_queue, auto-sent via Gmail
//   text  — body only, creates a Text task with smsBody (one-tap Send button)
//   call  — objective + talking-points, creates a Call task
//
// Placeholders: [name] / {firstName}, [area] / {neighborhood} /
// {city/zip}, [address] / {propertyAddress}.
const BUILT_IN_CAMPAIGNS = [

  // ── 1. Internet / IDX Website Lead (BoldTrail-generated) ────────────
  { id:"camp_internet_idx", name:"Internet / IDX Website Lead", description:"14-day intensive for high-intent leads from your BoldTrail site. Text-first, drops to long-term nurture if no engagement.",
    steps:[
      {day:0, type:"text", body:"Hi [name], this is Monica Iskra with RE/MAX Classic — I just saw you looked at [address]. That one's in a strong [area] pocket. Are you actively touring, or earlier in your search? (Reply STOP to opt out.)",
        why:"Speed-to-lead. Names property to prove human. Open-ended timeline question = response trigger."},
      {day:0, type:"email", subject:"[address] — a few things I noticed", body:"Hi [name],\n\nQuick notes on [address] before you decide whether to tour:\n\n• I pulled a comp from the last 60 days — similar bed/bath count in [area] sold for ~5% over list, 14 DOM\n• Inventory in your price range is at 1.17 months (deep seller's market — be ready to move fast on the right one)\n• 3-4 active listings I'd put on your short list with this one (let me know and I'll send the addresses)\n\nWant a 10-min call this week to walk through your search? I have Tuesday or Thursday between 4-7pm open.\n\nMonica Iskra\nRE/MAX Classic\n(248) 000-0000",
        why:"Demonstrates local expertise in 30 sec. Beats the generic 'Welcome!' autoresponder every other agent sends."},
      {day:1, type:"call", objective:"Day-1 connection call", body:"Goal: 15-min discovery call this week. Use ALM script:\n• Appointment: \"Can we set up 15 min Thursday or Saturday?\"\n• Location: \"Just [area], or also Plymouth/Northville/Novi?\"\n• Motivation: \"What's driving the move — schools, space, downsizing?\"\n\nIf no answer: VM under 20 sec referencing the specific property. \"Hey [name], Monica with RE/MAX — just wanted to flag something on [address] for you. Call me at (248) 000-0000.\"",
        why:"Day-1 call before lead goes cold; 78% of buyers hire first agent who connects."},
      {day:2, type:"text", body:"Hey [name] — did the [address] listing answer what you were looking for, or were you hoping for something different (more space, different school district)?",
        why:"Behavior-branched question pulls them into qualifying their own criteria."},
      {day:4, type:"email", subject:"3 homes that fit better than [address]", body:"Hi [name],\n\nI've been keeping an eye out — here are 3 active listings in [area] worth a look, with my actual thoughts:\n\n1. [Listing A] — Nicer kitchen than [address] but on a busier street\n2. [Listing B] — Smaller lot but turnkey, no projects\n3. [Listing C] — Best value in the price band IMO, but it'll move fast\n\nWant me to set up showings for any of them this weekend? I can usually get in within 24 hours.\n\nMonica",
        why:"Curated by a human outperforms saved-search autosends 4-to-1."},
      {day:7, type:"text", body:"Quick one — what's your timeline looking like? Some clients want to be in by summer, others are 6+ months out. Just want to make sure I'm helpful at the right pace.",
        why:"Explicit timeline qualifier. Sorts into 30/60/90/long-term buckets."},
      {day:10, type:"call", objective:"Reason-to-call (new comp/listing)", body:"Open with a reason, not a check-in:\n\"Hey [name], I just previewed a home in your range I wanted to flag — wanted to text you the address before it hits the open public list. You free for 5 min?\"\n\nA reason-to-call beats a check-in call 3:1.",
        why:"Reason-to-call beats a check-in call 3:1."},
      {day:14, type:"email", subject:"[area] market snapshot — what $350K is getting right now", body:"Hi [name],\n\nQuick market read for [area] as of this month:\n\n📊 Median sale price: $317K (up 5.5% YoY)\n⏱  Days on market: 37\n💰 Sale-to-list ratio: 99.66% — sellers are getting nearly full price\n📦 Inventory: 1.17 months (deep seller's market)\n\nWhat this means for you: if you're in the $350K+ band, the well-priced homes are gone in 1-2 weekends. We want pre-approval locked AND a fast-tour habit.\n\nReply if you want me to send 3 just-listeds in your range this week.\n\nMonica",
        why:"Value, not ask. Educates the slow-moving lead. If still no response by Day 14 → drop to Long-Term Nurture."},
    ]
  },

  // ── 2. Realtor.com Lead ──────────────────────────────────────────────
  { id:"camp_realtor_com", name:"Realtor.com Lead", description:"21-day intensive for Realtor.com / ReadyConnect leads. Beats the 2-3 other agents competing for the same lead via speed + differentiation.",
    steps:[
      {day:0, type:"text", body:"Hi [name], Monica here — RE/MAX Classic, [area]. Realtor.com just connected us. Quick question: are you still looking at [area], or has your search shifted? (Reply STOP to opt out.)",
        why:"Beat the other 2-3 agents competing for this lead. Source acknowledgement = trust."},
      {day:0, type:"call", objective:"Live transfer attempt", body:"Realtor.com leads expect a call. If no answer, ~15 sec VM:\n\"Hey [name], Monica from RE/MAX Classic — got your inquiry through Realtor.com and just wanted to make sure I'm useful to you. Call or text me at (248) 000-0000.\"\nDon't pitch — just confirm you got the inquiry.",
        why:"Realtor.com leads expect a call; not calling = abdicating the lead."},
      {day:0, type:"email", subject:"Following up on your Realtor.com search", body:"Hi [name],\n\nThanks for reaching out via Realtor.com. I'm Monica Iskra with RE/MAX Classic — born and raised on the I-275 corridor.\n\nBased on what you were searching, here are 5 active listings that match (sending separately if you want addresses).\n\nWant to grab 15 min on the phone? I have:\n• Tuesday 5pm\n• Saturday 11am\n\nReply with whichever works and I'll lock it in.\n\nMonica",
        why:"Two-time-slot ask converts 2x better than 'let me know when works.'"},
      {day:2, type:"text", body:"[name] — were any of the homes I sent worth a closer look, or should I tighten the criteria?",
        why:"Forces a yes/no/refine response."},
      {day:4, type:"email", subject:"What the Realtor.com listings don't show you", body:"Hi [name],\n\nQuick honest take: Realtor.com is a great starting point but it misses 3 things:\n\n1. Off-market and coming-soon inventory — agents see these days/weeks before they post\n2. School district nuance — the boundary maps online are wrong for ~15% of [area] streets\n3. Real market temperature — [area] is at 1.17 months of inventory right now, which means 'priced right' homes are gone fast\n\nIf you want me to flag coming-soons in your range, just reply YES.\n\nMonica",
        why:"Differentiation: positions you as having info the portal doesn't."},
      {day:7, type:"call", objective:"Reason-to-call (fresh listing)", body:"\"Hey [name], a home in your range hit the market this morning, wanted to make sure you saw it. Got 2 min?\"\n\nPattern interrupt at 1-week mark — when most agents quit.",
        why:"Pattern interrupt at 1-week mark — when most agents quit."},
      {day:10, type:"text", body:"Quick — are you working with another agent yet, or still scoping things out? No wrong answer, just want to know how I can help.",
        why:"Direct, respectful. Surfaces hidden competitor agent or confirms exclusivity."},
      {day:14, type:"email", subject:"[name], your [area] buyer cheat sheet", body:"Hi [name],\n\nQuick deliverable for you — the 1-page buyer cheat sheet I share with my clients:\n\n• 3 local mortgage brokers I trust (no kickbacks, just good people)\n• Average inspection cost: $400-$550 in [area]\n• School district boundary clarification map\n• Escalation clause primer — how to win in multi-offer\n\nReply if you want me to send the PDF.\n\nMonica",
        why:"Tangible deliverable. Most agents never send anything useful."},
      {day:21, type:"call", objective:"Honest re-qualification", body:"\"Hey [name] — I've been keeping you in the loop for a few weeks. Want to figure out if I'm still the right fit or if you've gone a different direction. No hard feelings either way — just want to be efficient with your time.\"\n\nCloses the loop or moves them to long-term nurture without bridge-burning.",
        why:"Closes the loop or moves them to long-term nurture without bridge-burning."},
    ]
  },

  // ── 3. Zillow Premier Agent Lead ─────────────────────────────────────
  { id:"camp_zillow", name:"Zillow Premier Agent Lead", description:"10-day intensive — Zillow leads decay fastest. 5-min response = 78% win rate per Zillow's own data. Call-first cadence.",
    steps:[
      {day:0, type:"call", objective:"INSTANT live connect (Zillow Connect Now)", body:"If they hit Connect Now they're literally on their phone waiting.\nUse ALM script:\n• \"I see you looked at [address] on Zillow — are you ready to tour or earlier in your search?\"\n• \"Just [area], or also Plymouth/Northville/Novi?\"\n• \"What's driving the move?\"\n• \"Let's grab 15 min Thursday or Saturday — I can show you what's actually moving in your price range. Which works?\"\n\nZillow leads convert on action, not nurture. Decay is fastest of any source.",
        why:"Zillow leads decay faster than any other source. 5-min response = 78% win rate."},
      {day:0, type:"text", body:"Hi [name], this is Monica Iskra — I just got your note on [address] via Zillow. Calling you now, but if a text is easier — what's your timeline? (Reply STOP to opt out.)",
        why:"Backstop the call. ~50% won't pick up a number they don't know."},
      {day:0, type:"email", subject:"[address] — quick notes from a local agent", body:"Hi [name],\n\n4 specifics on [address]:\n• Property taxes: pulling the exact figure from the assessor for you\n• Condition: I'll know more once I preview it, but recent permits show [area] homes built that decade typically need [common items]\n• Neighborhood: this stretch of [area] tends to have [trait]\n• Recent comp: similar home in same submarket sold last month at [%] of list\n\n3 alternative listings worth a look — I'll send addresses if you want.\n\nCan I walk you through [address] this week? I have:\n• Wednesday after 5pm\n• Saturday 10am-2pm\n\nReply with what works.\n\nMonica",
        why:"'Local agent' framing matters on Zillow — buyers don't know which agent they're being matched with."},
      {day:1, type:"text", body:"Did you want me to set up a showing at [address] this weekend? I can get it booked tonight if so.",
        why:"Direct close. Zillow leads convert on action, not nurture."},
      {day:3, type:"call", objective:"Second call attempt with urgency", body:"\"Hey [name], didn't want you to miss this — that home at [address] is getting attention. Just wanted to give you a heads-up before it's gone. Call me at (248) 000-0000.\"\n\nUrgency cue is real in [area] (37 DOM, 99.66% of list).",
        why:"Urgency cue is real in Livonia/area (37 DOM, 99.66% of list)."},
      {day:5, type:"email", subject:"3 homes I'd show you instead of [address]", body:"Hi [name],\n\nIf [address] is gone, off the table, or just not quite right — here are 3 active listings I'd put in front of you instead:\n\n1. [Listing A] — Better value per sq ft, slightly older\n2. [Listing B] — Updated kitchen, same price band\n3. [Listing C] — Coming soon, getting it before public list\n\nWant the addresses + a Saturday showing route? Reply YES.\n\nMonica",
        why:"If property is gone or wrong, pivot fast to inventory you do have."},
      {day:7, type:"text", body:"[name] — are you still looking, or did something else come together? Either way I want to make sure you've got what you need.",
        why:"Permission-to-leave language increases reply rate."},
      {day:10, type:"call", objective:"Final intensive-phase call", body:"\"Hey [name], it's been 10 days since you reached out via Zillow. I want to either get you to a closing or out of my way — whichever serves you. Got 3 min for a real conversation about where you're at?\"\n\nPer Zillow's plan: 10 days is the decision point. If no engagement → mark as long-term nurture but keep on weekly search alerts.",
        why:"Per Zillow's 10-Day Plan: this is the decision point."},
    ]
  },

  // ── 4. Facebook / Instagram Lead Ad ──────────────────────────────────
  { id:"camp_fb_lead", name:"Facebook / Instagram Lead Ad", description:"60-day low-pressure nurture for Meta ad leads. Most are 6-18 months out — don't pitch hard or they'll mark spam (which downranks your ads).",
    steps:[
      {day:0, type:"text", body:"Hi [name], Monica with RE/MAX Classic in [area]. You just grabbed the I-275 Corridor Home Value Guide — want me to text you the PDF link directly? (Reply STOP to opt out.)",
        why:"Re-confirm consent + deliver the lead magnet. Don't pitch."},
      {day:0, type:"email", subject:"Your I-275 Corridor guide is here", body:"Hi [name],\n\nHere's the guide you requested — attached as PDF (or use this link).\n\nIf you want me to run a free CMA on your specific home, just reply with the address. Takes me about 24 hours to do it properly with real comps.\n\nNo follow-up pressure — that's not how I work. But I'm here if you need me.\n\nMonica\nRE/MAX Classic",
        why:"Promised value, delivered. Soft second ask, no pressure."},
      {day:2, type:"text", body:"[name] — quick one: are you actually thinking about moving in the next 12 months, or just curious about the market? Either's a totally fine answer.",
        why:"Honest qualifier separates the 10% who are real from the 90% who aren't. People appreciate not being pitched."},
      {day:5, type:"email", subject:"What $350K, $450K, and $550K actually buys in [area] right now", body:"Hi [name],\n\nQuick market read — what each price band gets in [area] today:\n\n💰 $350K — 3BR/2BA, ~1,400 sq ft, built 1980s-90s, decent condition, smaller lot\n💰 $450K — 3-4BR/2.5BA, ~2,000 sq ft, updated kitchen/baths, half-acre\n💰 $550K — 4BR/3BA, ~2,500 sq ft, fully updated or newer construction, premium street\n\nWant 3 examples at your target price? Just reply with the number.\n\nMonica",
        why:"Educational, no ask. Builds the 'knowledgeable local' file."},
      {day:10, type:"text", body:"Saw a home this morning that reminded me you'd asked about [area]. Want me to send the link?",
        why:"Reason-to-text with opt-in."},
      {day:14, type:"email", subject:"[area] just hit 1.17 months of inventory — what that means for you", body:"Hi [name],\n\nQuick market update: [area] is at 1.17 months of housing inventory. For context, 6 months = balanced market. We're at 1/5th of that.\n\nWhat this means:\n• If you're buying — well-priced homes go in 1-2 weekends. Pre-approval + fast-tour habit are non-negotiable.\n• If you're selling — your home is probably worth more than you think. I'd happily run a free CMA.\n\nReply if you want me to run numbers for your address.\n\nMonica",
        why:"Dual-audience hook — you don't know yet if they're buyer or seller."},
      {day:21, type:"call", objective:"Soft check-in call", body:"\"Hey [name] — just checking in. Are you still in research mode or has this gotten more real? Don't want to pester you, just wanted a real human voice for a sec.\"\n\nDon't pitch. One call attempt at the 3-week mark separates active from cold.",
        why:"One call attempt at the 3-week mark separates active from cold."},
      {day:30, type:"email", subject:"Monthly Metro Detroit market snapshot", body:"Hi [name],\n\nThe monthly market read for Metro Detroit / I-275 corridor:\n\n📊 3 stats this month\n📍 3 just-listed in [area]\n🏆 1 client win story (selling above list in 8 days)\n\nReply if anything jumps out.\n\nMonica",
        why:"Shifts them onto monthly newsletter rhythm."},
      {day:45, type:"text", body:"Quick gut check — has anything changed on the home front since we connected? Job move, kids, anything? Life-stuff is usually what makes the timing real.",
        why:"Life-change is the #1 trigger event. Asking opens the door."},
      {day:60, type:"email", subject:"Are you still on the fence? Here's how I can help when you're ready", body:"Hi [name],\n\nFrank note: I won't keep pestering you. But if/when you're 60-90 days out from making a move, here's what we'd do together:\n\n1. 30-min strategy call — your timeline, your criteria, your numbers\n2. Pre-approval intro to a lender I trust\n3. A handpicked tour list — not the auto-MLS spam, real options\n4. Smooth offer + close\n\nWhen you're ready, here's my calendar link (or just text me).\n\nMonica\n(248) 000-0000",
        why:"Bridge to long-term nurture without dropping them entirely. After Day 60 → Long-Term Nurture (Campaign 7)."},
    ]
  },

  // ── 5. Open House Sign-In ────────────────────────────────────────────
  { id:"camp_open_house", name:"Open House Sign-In", description:"14-day intensive for in-person open house attendees. Highest physical intent — same-day text is critical (7x lift if responded within 1 hour).",
    steps:[
      {day:0, type:"text", body:"Hi [name], Monica from the open house at [address] today. Thanks for stopping by — what did you think? (Reply STOP to opt out.)",
        why:"Same-day-while-fresh. Specific property reference proves it's not a blast."},
      {day:1, type:"email", subject:"Quick recap from [address]", body:"Hi [name],\n\nGreat meeting you yesterday at [address]! A few thoughts as you mull it over:\n\n3 similar active listings in [area]:\n• [Listing A]\n• [Listing B]\n• [Listing C]\n\n1 just-sold comp nearby:\n• [Comp address] — $X, sold in [N] days at [%] of list\n\nMy direct cell: (248) 000-0000. Text me with questions any time.\n\nMonica",
        why:"Day-1 email outperforms day-3 by ~40%."},
      {day:2, type:"call", objective:"Hot-lead call (reference specific conversation)", body:"For anyone who seemed serious in person:\n\"Hey [name], Monica — you mentioned [specific thing from open house conversation] yesterday. I actually have 2 homes that fit that perfectly. Want me to set up showings this weekend?\"\n\nPersonal-detail recall converts at >2x generic call.",
        why:"Personal-detail recall converts at >2x generic call."},
      {day:5, type:"email", subject:"Your [area] buyer briefing", body:"Hi [name],\n\nThought you'd find this useful — neighborhood report for [area]:\n\n📍 Recent sales (last 30 days): 8 closed, median $X\n🏫 School ratings: [area] schools rank in top 15% statewide\n💸 Property tax range: $X-Y per $1K of value\n🏠 Coming-soon inventory I'm watching: 4 homes in your range\n\nWant the specific addresses? Just reply.\n\nMonica",
        why:"Position as info source, not seller."},
      {day:7, type:"text", body:"[name] — were any of the homes I sent worth touring this weekend? Happy to set something up.",
        why:"Direct showing close at 1-week mark."},
      {day:10, type:"call", objective:"Re-engage call", body:"\"Hey [name], was the [address] home still on your list, or are you looking at others now? Got a couple new ones I'd want you to see.\"\n\nPattern interrupt before they go cold.",
        why:"Pattern interrupt before they go cold."},
      {day:14, type:"email", subject:"Free 15-min buyer strategy call", body:"Hi [name],\n\nNo-pressure offer: a free 15-min phone consult to map your search.\n\nI'll walk you through:\n• Current [area] inventory in your range\n• What you can realistically expect in this market\n• A clear plan for the next 30/60 days\n\nGrab a slot:\n• Tuesday 5pm\n• Saturday 11am\n\nReply with what works.\n\nMonica",
        why:"Converts the warm-but-not-hot tier. If no engagement by Day 14 → Long-Term Nurture."},
    ]
  },

  // ── 6. Sphere of Influence / Past Client (33-touch annual) ──────────
  { id:"camp_soi", name:"Sphere / Past Client (Annual)", description:"Buffini-style 33-touch nurture. The highest-ROI campaign — past clients refer at ~25% when nurtured, 4% when ignored. 12 emails + handful of texts + call prompts over 1 year.",
    steps:[
      {day:0, type:"email", subject:"Metro Detroit market snapshot — month 1", body:"Hi [name],\n\nQuick monthly market read for your area:\n\n📊 3 stats\n📍 3 recent sales in your neighborhood\n💭 1 personal note\n\nHope you and the family are doing well!\n\nMonica",
        why:"Stays top-of-mind without selling."},
      {day:30, type:"email", subject:"Metro Detroit market snapshot — month 2", body:"Hi [name],\n\nMonth 2 market read for [area]:\n\n📊 3 stats this month\n📍 3 just-listeds I'm watching\n💭 Quick personal note\n\nReply if anything jumps out.\n\nMonica",
        why:"Monthly cadence builds expected rhythm."},
      {day:60, type:"text", body:"Hey [name] — just thinking about you. How's everything going? No agenda, just wanted to say hi.",
        why:"Semi-annual personal check. Genuine relationship, not a pitch."},
      {day:90, type:"email", subject:"Metro Detroit Q1 wrap + Q2 outlook", body:"Hi [name],\n\nQuarterly recap for [area]:\n• Q1 closed sales: [N]\n• Median price change: [%]\n• Inventory trend: [direction]\n• What I'm watching in Q2\n\nIf you know anyone thinking about buying or selling, I'd love an intro.\n\nMonica",
        why:"Quarterly summary + soft referral ask."},
      {day:120, type:"email", subject:"Metro Detroit market snapshot — month 4", body:"Hi [name],\n\nMonth 4 — quick check-in on [area]:\n\n📊 Stats\n📍 Just-listeds\n💭 Note\n\nHope all's well!\n\nMonica",
        why:"Consistent monthly drumbeat."},
      {day:150, type:"email", subject:"Your home's equity update", body:"Hi [name],\n\nI ran a quick CMA on your home — based on recent [area] sales, you're sitting on roughly $X in equity right now.\n\nFull breakdown attached. No ask — just thought you'd want to know.\n\nIf you're ever curious about a more detailed CMA (paint colors, comps, staging notes), I'm happy to do a walk-through.\n\nMonica",
        why:"Plants the 'if you ever sell' seed without asking."},
      {day:180, type:"call", objective:"6-month genuine check-in", body:"\"Hey [name] — no agenda, just wanted to actually hear your voice. How's everything going? How's the house treating you?\"\n\nGenuine relationship check, not a pitch. Reciprocity principle.",
        why:"The genuine non-pitch call is what builds the referral relationship."},
      {day:210, type:"email", subject:"Metro Detroit market snapshot — month 7", body:"Hi [name],\n\nMid-year market read for [area]:\n📊 What's changed in the last 6 months\n📍 Recent sales near you\n💭 Note\n\nMonica",
        why:"Continued monthly rhythm."},
      {day:240, type:"text", body:"Hey [name] — quick question. Do you know anyone thinking about buying or selling in the next year? I grow almost entirely through referrals from people like you. Even a name + heads-up helps.",
        why:"Direct referral ask 2-3x per year, naturally woven. Be explicit."},
      {day:270, type:"email", subject:"Metro Detroit market snapshot — month 9", body:"Hi [name],\n\nMonth 9 read. The market is shifting toward [direction]. What that means for homeowners like you: [insight].\n\nMonica",
        why:"Educational positioning."},
      {day:300, type:"email", subject:"Recent sales on your street", body:"Hi [name],\n\nHyper-local update — sales on or near your street in the last 90 days:\n• [Address] — $X\n• [Address] — $X\n• [Address] — $X\n\nYour neighborhood is [hot/balanced/cooling] right now. Reply if you want a sharper number for your specific home.\n\nMonica",
        why:"Hyper-local data = highest open rate of any email type."},
      {day:330, type:"email", subject:"Year-end Metro Detroit recap + next-year outlook", body:"Hi [name],\n\nAnnual wrap-up:\n• [area] median price: $X (up Y% YoY)\n• Avg DOM: [N]\n• Notable trends\n• What I'm watching next year\n\nIt's been a year since we last talked properties. As always — if you or anyone you know is thinking about moving, I'm here.\n\nHappy holidays,\nMonica",
        why:"Annual recap = high-engagement content."},
      {day:365, type:"call", objective:"Annual anniversary check-in", body:"\"Hey [name] — it's been a year! How's the house, how's the family? Any plans on the horizon I should know about?\"\n\nMost agents have forgotten this client exists. You haven't.",
        why:"Anniversary calls are the single highest-response touchpoint."},
    ]
  },

  // ── 7. Long-Term Nurture (6-12+ months out) ─────────────────────────
  { id:"camp_long_term", name:"Long-Term Nurture (6-12mo)", description:"For leads who didn't convert from any other campaign. ~80% of conversions happen between touches 5-12. Monthly cadence, low pressure, high value. Median time to close = 11 months.",
    steps:[
      {day:30, type:"email", subject:"Metro Detroit market update", body:"Hi [name],\n\nMonthly market read for [area]:\n📊 3 stats (median price, DOM, inventory)\n📍 3 just-solds in your target area\n🆕 1 just-listed worth flagging\n\nMonica",
        why:"Establishes monthly rhythm."},
      {day:60, type:"text", body:"[name] — quick check-in. Anything change on your housing front since we last talked? No agenda, just curious.",
        why:"Life-change trigger probe."},
      {day:90, type:"email", subject:"What buyers/sellers got wrong about this market", body:"Hi [name],\n\nMarket myth I keep hearing: 'I'll wait for prices to drop.'\n\nReality in [area]: inventory is at 1.17 months. Until inventory hits 3-4 months, prices won't drop — they'll keep climbing slower. Waiting costs you ~$1,500-$2,000/month in lost equity at current rates.\n\nMy 2¢: if you'd move in the next 12 months anyway, waiting probably costs more than it saves.\n\nMonica",
        why:"Positions as expert, not order-taker."},
      {day:120, type:"text", body:"Saw a home hit the market in [area] that made me think of you. Want the link?",
        why:"Reason-to-text with opt-in."},
      {day:150, type:"email", subject:"Free home value report for your current home", body:"Hi [name],\n\nQuick offer: I can pull a free CMA on your current home in about 24 hours.\n\nWhy: even buyers usually have a home to sell, and knowing your equity number changes the math.\n\nReply with your address if you want it.\n\nMonica",
        why:"Surfaces hidden seller leads inside your buyer database."},
      {day:180, type:"call", objective:"6-month 'where are you at' call", body:"\"Hey [name] — been about 6 months. Honest question: should I keep sending updates, or has your situation changed and you'd rather I leave you alone? Either's totally fine.\"\n\nRe-qualifies and either re-engages or graceful exit.",
        why:"Re-qualifies and either re-engages or graceful exit."},
      {day:210, type:"email", subject:"5 things I'd do differently if I were buying in [area] today", body:"Hi [name],\n\nMy actual opinions (not a corporate listicle):\n\n1. Get pre-approved BEFORE you fall in love with a house. Heartbreak otherwise.\n2. Tour 3-5 homes the first weekend to calibrate. Not 1.\n3. The 'perfect' house doesn't exist. The 'right-now' house does.\n4. Inspect everything, but don't kill deals over $5K worth of cosmetics.\n5. Trust your gut on the neighborhood feel — data only tells half the story.\n\nMonica",
        why:"Voice + opinion = memorability."},
      {day:240, type:"text", body:"Quick — if you were going to move in the next 6 months, what'd be the #1 thing that'd push you to act?",
        why:"Their answer = your roadmap to closing them."},
      {day:270, type:"email", subject:"What your neighbors are selling for", body:"Hi [name],\n\nHyper-local — recent sales near you:\n• [Address] — $X, [N] DOM\n• [Address] — $X, [N] DOM\n• [Address] — $X, [N] DOM\n\nReply if you want me to run your specific home value.\n\nMonica",
        why:"Hyper-local data = highest open rate of any email type."},
      {day:300, type:"text", body:"Hey [name] — been a minute. Anything I can help with this fall? Just want to make sure I'm not letting you fall through the cracks.",
        why:"Casual, human, low-pressure."},
      {day:330, type:"email", subject:"Year-end Metro Detroit recap", body:"Hi [name],\n\nAnnual market wrap-up for [area]:\n• What happened\n• What's coming\n• What it means for you\n\nMonica",
        why:"Annual report = high-engagement content."},
      {day:365, type:"call", objective:"1-year anniversary call", body:"\"Hey [name] — you reached out to me a year ago. Wanted to see where you landed. Did you find a home? Still looking? Decided to wait?\"\n\nMost agents have forgotten this lead exists. You haven't.",
        why:"Most agents have forgotten this lead exists. You haven't."},
    ]
  },

  // ── 8. Seller Prospect (Home Valuation Request) ─────────────────────
  { id:"camp_seller", name:"Seller Prospect Nurture", description:"35-day cadence for home-valuation requests and listing-alert signups. Triages curious vs considering vs ready-to-list, then pushes the right ones to a listing appointment.",
    steps:[
      {day:0, type:"text", body:"Hi [name], Monica Iskra here — RE/MAX Classic. I see you requested a home value for [address]. The instant estimate's a starting point, but I can pull real comps from the last 60 days if you want a sharper number. Want me to send those? (Reply STOP to opt out.)",
        why:"Acknowledges the (often inaccurate) AVM, offers something better. Triage question gets a response."},
      {day:0, type:"email", subject:"Your [address] home value — the real number", body:"Hi [name],\n\nQuick CMA on [address] — based on 3 recent comp sales within a half mile:\n\n• Comp A: [address] — $X, sold in [N] days\n• Comp B: [address] — $X, sold in [N] days\n• Comp C: [address] — $X, sold in [N] days\n\nMy honest range estimate for your home: $X-Y.\n\nWant a sharper number? Let me walk through in person for 20 min — I'll give you a real CMA.\n\nMonica",
        why:"Range + comps = credibility. Single auto-number = robot."},
      {day:2, type:"text", body:"[name] — are you exploring selling in the next few months, a year out, or just curious about the number? Any answer is totally fine.",
        why:"Triages into ABC buckets (Ready / Considering / Curious)."},
      {day:4, type:"email", subject:"What's selling in [area] right now", body:"Hi [name],\n\n5 active listings + 5 just-solds in [area]:\n\nACTIVE:\n• [Listing 1] / [Listing 2] / [Listing 3] / [Listing 4] / [Listing 5]\n\nJUST SOLD:\n• [Sale 1] / [Sale 2] / [Sale 3] / [Sale 4] / [Sale 5]\n\nFor context: [area] is at 99.66% sale-to-list ratio, 37 DOM. Sellers are getting nearly full price right now.\n\nMonica",
        why:"Specific, local, data-driven. Differentiates from generic seller drip."},
      {day:7, type:"call", objective:"Equity check call + listing appointment ask", body:"\"Hey [name], Monica — I sent over a CMA last week. I'd love to do an in-person walkthrough of your home — 20 minutes, no commitment, and I'll give you a real number plus 3 things you could do to add $15-30K to the sale price. When's good — Tuesday evening or Saturday morning?\"\n\nIn-person CMA appointment is the single best conversion mechanism for seller leads.",
        why:"In-person CMA appointment is the single best conversion mechanism for seller leads."},
      {day:10, type:"email", subject:"3 things that'd raise your home's value by $15-30K", body:"Hi [name],\n\nFrom 100+ home sales — the highest-ROI seller moves:\n\n1. Paint (interior, neutral) — $1,500 cost, $5-10K return\n2. Light landscaping + curb cleanup — $500-1,000 cost, $3-8K return\n3. Staging (or pseudo-staging) — $2,000 cost, $10-15K return\n\nDO NOT do: kitchen/bath remodels pre-sale. You'll spend $30K to gain $20K.\n\nWant the full 1-page seller prep guide? Just reply.\n\nMonica",
        why:"Establishes expertise and seeds the listing conversation."},
      {day:14, type:"text", body:"[name] — would it be helpful to walk through what your home would likely sell for and the timeline? No commitment, just a real number.",
        why:"Soft appointment ask, second attempt."},
      {day:21, type:"email", subject:"What your neighbors at [area] are listing for", body:"Hi [name],\n\nHyper-local — active listings near [address]:\n• [Address] — listed at $X (3BR/2BA, [N] sq ft)\n• [Address] — listed at $X (4BR/2.5BA, [N] sq ft)\n\nMy thoughts on positioning vs. these: [your unique value angle].\n\nMonica",
        why:"Hyper-local FOMO. Sellers care most about their immediate block."},
      {day:28, type:"call", objective:"Timeline decision call", body:"\"Hey [name] — have you decided on a timeline yet? If you're 6+ months out, I'll move you to monthly market updates. If you're 90 days, let's get the listing appointment on the calendar this week.\"\n\nClear branch point.",
        why:"Clear branch point — graduates them to either listing-ready or nurture."},
      {day:35, type:"email", subject:"Free seller readiness checklist", body:"Hi [name],\n\n1-page seller checklist attached:\n\n✓ Pre-list to-do (90/60/30 days out)\n✓ Expected timeline from list to close\n✓ What to expect at closing (line by line)\n✓ Tax implications quick-ref\n\nReply with any questions.\n\nMonica",
        why:"Tangible asset. Most agents never deliver anything useful."},
    ]
  },

  // ── 9. Just Listed / Just Sold (Sphere + Farm) ──────────────────────
  { id:"camp_just_listed_sold", name:"Just Listed / Just Sold", description:"Triggered when you list or close a property. Targets sphere + 200-500 home geographic farm. Sub-campaign for Listed + Sub-campaign for Sold combined. Mix of digital + direct mail prompts.",
    steps:[
      {day:0, type:"email", subject:"Just listed — [address], [area]", body:"Hi [name],\n\nQuick heads-up — I just listed:\n\n📍 [address], [area]\n💰 $X\n🛏 [beds]BR / [baths]BA, [sqft] sq ft\n✨ Standout features: [feature 1] / [feature 2] / [feature 3]\n\nOpen house: Saturday 1-3pm.\n\nKnow anyone who'd love it? Send them my way.\n\nMonica",
        why:"Same-day push to your sphere = 'agent in motion' signal."},
      {day:0, type:"text", body:"Hey [name] — just listed a 3BR/2BA in [area] at $XYZ. Know anyone who'd love it? Link: [url]",
        why:"Sphere referrals — the highest-converting lead type."},
      {day:1, type:"call", objective:"DIRECT MAIL: Just Listed postcard (200-500 homes)", body:"Drop 'Just Listed' postcard to 200-500 homes around the property.\n\nInclude:\n• Photo of home\n• Price\n• Your name + photo + (248) 000-0000\n• QR code to 'What's your home worth?' form\n\nFarm postcards are about repetition — one postcard does nothing; the 4th generates the call.",
        why:"Farm postcards are about repetition — one does nothing; the 4th generates the call."},
      {day:3, type:"email", subject:"First open house this Saturday — [address]", body:"Hi [name],\n\nReminder: open house at [address] this Saturday, 1-3pm.\n\nQuick stats:\n• [beds]BR/[baths]BA, [sqft] sq ft, $X\n• Coffee + donuts\n\nStop by if you're around!\n\nMonica",
        why:"Drives open house attendance from existing sphere."},
      {day:5, type:"text", body:"Open house Saturday at [address] 1-3pm. Coffee + donuts. Stop by if you're around.",
        why:"Casual invite tone = better turnout than 'official' invite."},
      {day:7, type:"call", objective:"DIRECT MAIL: Just Sold postcard (geographic farm)", body:"After closing, send 'Just Sold' postcard to 200-500 homes around the property.\n\nInclude:\n• 'Sold in [N] days at [X%] of list'\n• 'Want to know what YOUR home would sell for?'\n• QR code to home value form\n\nSpecificity sells. The single highest-converting farm postcard format.",
        why:"The single highest-converting farm postcard format."},
      {day:8, type:"email", subject:"Another one in the books — [area] sold for $X", body:"Hi [name],\n\nQuick story: just closed on a home in [area]. Listed Tuesday, accepted offer by Saturday, closed in 28 days at 102% of list.\n\nIf you're curious what your home would sell for in this market, just reply.\n\nMonica",
        why:"Social proof + soft seller-lead ask."},
      {day:9, type:"text", body:"Just closed on a home in [area] — 28 days, 102% of list. Know anyone in that area thinking about selling? They're going to want to see this number.",
        why:"Referral ask with hard data."},
    ]
  },

  // ── Legacy generic campaigns (kept for backward compat) ──────────────
  { id:"camp_new_lead", name:"(Legacy) New Lead Welcome", description:"5 emails over 14 days. Great for any fresh lead.",
    steps:[
      {day:0,  subject:"Great to connect, [name]!",             body:"Hi [name],\n\nI just wanted to reach out and say how excited I am to help you with your real estate goals! Whether you're buying, selling, or just exploring your options, I'm here to make the process as smooth as possible.\n\nA little about me — I'm Monica Iskra with RE/MAX Classic, and I specialize in the Livonia and surrounding areas. I know these neighborhoods inside and out.\n\nFeel free to reach out anytime with questions. I'm always just a call or text away.\n\nTalk soon,\nMonica\n(248) 000-0000"},
      {day:2,  subject:"How I can help you — Monica Iskra RE/MAX", body:"Hi [name],\n\nI wanted to follow up and share a little more about how I work.\n\nI provide:\n✅ Free home valuations for sellers\n✅ Custom home searches for buyers\n✅ Zero pressure — just expert guidance\n✅ Average days on market: 12 days\n\nWhatever your timeline, I'll work around YOUR schedule.\n\nAny questions? Just hit reply.\n\nBest,\nMonica"},
      {day:5,  subject:"What's happening in the market right now",  body:"Hi [name],\n\nHere's a quick snapshot of what's happening in our local real estate market:\n\n📈 Inventory is [low/balanced] right now\n💰 Median sale price is up\n⏱ Homes are selling in an average of 2-3 weeks\n\nThis means [buyers: you need to be ready to move fast / sellers: it's a great time to list].\n\nI'd love to put together a personalized report for your specific situation. Just reply and I'll get it to you!\n\nMonica"},
      {day:9,  subject:"3 homes I think you'll love",              body:"Hi [name],\n\nBased on what you're looking for, I hand-picked a few listings I think are worth a look:\n\n[Listing 1 - address, price, key features]\n[Listing 2 - address, price, key features]\n[Listing 3 - address, price, key features]\n\nWant to schedule a showing? I can usually get you in within 24 hours.\n\nJust reply or call me at (248) 000-0000.\n\nMonica"},
      {day:14, subject:"Still here to help — Monica",             body:"Hi [name],\n\nI know life gets busy! Just wanted to check in and make sure you have everything you need.\n\nWhenever you're ready to take the next step — whether that's a showing, a home valuation, or just a conversation — I'm here.\n\nNo pressure, no rush. Just good old-fashioned personal service.\n\nLooking forward to working with you,\nMonica Iskra\nRE/MAX Classic\n(248) 000-0000"},
    ]
  },
  { id:"camp_buyer", name:"(Legacy) New Buyer Drip (30 Day)", description:"8 emails guiding buyers from search to offer-ready.",
    steps:[
      {day:0,  subject:"Welcome to your home search, [name]!",    body:"Hi [name],\n\nWelcome! I'm thrilled to help you find your perfect home. The buying process can feel overwhelming, but I'll guide you every step of the way.\n\nFirst things first — let's make sure you're set up for success:\n\n✅ Get pre-approved (I can refer you to a trusted local lender)\n✅ Tell me your must-haves vs. nice-to-haves\n✅ Set up auto-alerts for new listings\n\nReply with your top 3 must-haves and I'll start searching today!\n\nMonica"},
      {day:3,  subject:"The #1 thing buyers skip (and shouldn't)",  body:"Hi [name],\n\nHere's the truth: in this market, if you're not pre-approved, you WILL lose the home you love to someone who is.\n\nPre-approval is free, takes 20 minutes, and gives you:\n🏆 Negotiating power\n🏆 Confidence knowing your exact budget\n🏆 The ability to make an offer same-day\n\nI work with several great local lenders. Want me to send you their contact info?\n\nMonica"},
      {day:7,  subject:"Understanding the buying process in [area]", body:"Hi [name],\n\nHere's a quick breakdown of how buying a home works:\n\n1️⃣ Get pre-approved\n2️⃣ Start touring homes\n3️⃣ Make an offer (I handle all negotiations)\n4️⃣ Inspection period (I know the best inspectors)\n5️⃣ Final walkthrough + closing day! 🎉\n\nThe whole process typically takes 30-45 days from accepted offer to keys in hand.\n\nAny questions? Just reply — I'm here!\n\nMonica"},
      {day:14, subject:"New listings alert for your search",         body:"Hi [name],\n\nI've been keeping an eye on the market and wanted to share what's been coming up in your search area.\n\nHomes are moving quickly, so when you see something you like, we should move fast.\n\nHave you thought about your timeline? Are you aiming to be in a home by a certain date?\n\nLet's connect for a quick call this week — even 15 minutes can help us get aligned.\n\nMonica"},
      {day:21, subject:"How to win in a competitive offer situation", body:"Hi [name],\n\nHere are my top strategies for winning in a competitive market:\n\n💡 Offer at or above asking on the right homes\n💡 Minimize contingencies where possible\n💡 Write a personal letter (yes, it works!)\n💡 Be flexible on closing date\n💡 Escalation clauses\n\nI've helped buyers win in multiple-offer situations many times. When you find \"the one,\" I'll know exactly how to structure your offer.\n\nMonica"},
      {day:30, subject:"30 days in — let's make sure your search is dialed in", body:"Hi [name],\n\nIt's been a month since we connected! I want to make sure I'm still sending you the right homes and that your search criteria hasn't changed.\n\nCan you do me a favor? Just reply with:\n- Still looking? Yes / No / Pausing\n- Anything changed about what you need?\n- Timeline update?\n\nI want to make sure I'm the most useful resource I can be for you!\n\nTalk soon,\nMonica"},
    ]
  },
  { id:"camp_seller_legacy", name:"(Legacy) Seller Prospect Nurture", description:"6 emails converting a seller lead into a listing appointment.",
    steps:[
      {day:0,  subject:"Your home's value in today's market",        body:"Hi [name],\n\nThank you for reaching out! I wanted to share some exciting news — it's still a great time to be a seller in our market.\n\nHere's what I'm seeing:\n📈 Low inventory = less competition for your home\n💰 Prices have held strong\n⏱ Well-priced homes are selling fast\n\nI'd love to put together a FREE Comparative Market Analysis (CMA) for your specific home. It takes me about 24 hours and you'll know exactly what your home is worth today.\n\nInterested? Just reply!\n\nMonica"},
      {day:3,  subject:"What makes homes sell for top dollar",        body:"Hi [name],\n\nEvery seller wants top dollar. Here's what the data shows about what actually moves the needle:\n\n🏠 First impressions — curb appeal and staging\n📸 Professional photos (I include this with every listing)\n💻 Maximum online exposure — Zillow, Realtor.com, Homes.com, MLS\n💬 Aggressive follow-up with every showing agent\n\nI include all of this in my listing package at no extra cost to you.\n\nWould you like to see my full marketing plan? I'll send it over!\n\nMonica"},
      {day:7,  subject:"Recent sales in your neighborhood",           body:"Hi [name],\n\nHere's a quick look at what's been selling near you recently:\n\n[Recent sale 1 — address, beds/baths, sold price, days on market]\n[Recent sale 2 — address, beds/baths, sold price, days on market]\n[Recent sale 3 — address, beds/baths, sold price, days on market]\n\nYour home could be next! Would you like me to schedule a quick 20-minute walkthrough? No commitment — I just want to see your home and give you an accurate number.\n\nMonica"},
      {day:14, subject:"Is now the right time to sell?",              body:"Hi [name],\n\nI get this question a lot: \"Should I wait for the market to be better?\"\n\nHere's my honest answer: the best time to sell is when it works for YOUR life — not when the market is \"perfect\" (it never is).\n\nThat said, right now we have:\n✅ Strong buyer demand\n✅ Limited inventory (your competition)\n✅ Motivated buyers with pre-approvals in hand\n\nI'm happy to walk you through what YOU could net on a sale right now. No obligation.\n\nMonica"},
      {day:21, subject:"Monica Iskra — still here to help",           body:"Hi [name],\n\nJust checking in! I know the decision to sell is a big one and there's never any rush.\n\nWhenever you're ready — whether that's next month or next year — I want to be your agent.\n\nIn the meantime, I'm always happy to answer questions about the market, your home's value, or the selling process.\n\nTalk soon,\nMonica Iskra\nRE/MAX Classic\n(248) 000-0000"},
    ]
  },
  { id:"camp_past_client", name:"(Legacy) Past Client Touch", description:"Quarterly emails to stay top of mind and generate referrals.",
    steps:[
      {day:0,   subject:"Checking in — how's the home, [name]?",     body:"Hi [name],\n\nI hope you and your family are doing great! I was thinking about you and wanted to reach out.\n\nIt's been a while since we closed on your home and I'd love to hear how it's going. Have you settled in well? Made any improvements?\n\nAlso — your home's value has likely changed. Would you like me to pull a quick market update for your address? It's always good to know what your biggest asset is worth!\n\nTake care,\nMonica"},
      {day:30,  subject:"Your home value update — [name]",            body:"Hi [name],\n\nI put together a quick market update for homes in your area and wanted to share it with you.\n\nHere's what's happening:\n📊 Median sale price in your area: [price]\n📈 Change from last year: [+/-%]\n⏱ Average days on market: [X days]\n\nIf you're curious about your specific home's value, just reply and I'll run a full CMA for free.\n\nAnd if you know anyone thinking about buying or selling — I'm always grateful for referrals! 🙏\n\nMonica"},
      {day:60,  subject:"Market update for your neighborhood",        body:"Hi [name],\n\nQuick market update from your favorite Realtor! 😊\n\nHere's what's been happening in real estate lately:\n\n[2-3 sentences about current market conditions]\n\nAnd a reminder — if you ever need anything: a home valuation, a contractor referral, or just real estate advice, I'm always just a text away.\n\nHope you're doing well!\nMonica"},
      {day:90,  subject:"One more thing, [name]...",                  body:"Hi [name],\n\nI know I reach out periodically, and I hope it's always been helpful rather than annoying! 😊\n\nI just wanted you to know: my business runs almost entirely on referrals from amazing past clients like you. If you know anyone who's thinking about buying or selling — even just exploring — please send them my way.\n\nNo pressure, of course. Just know that a referral from you means the world to me.\n\nThank you for being such a wonderful client!\n\nWith gratitude,\nMonica Iskra\nRE/MAX Classic"},
    ]
  },
];

const NAV = [
  { id:"ad-composer",         label:"Lead Generation",     icon:Sparkles },
  { section:"CREATE" },
  { id:"listing-writer",      label:"AI Listing Writer",    icon:FileText },
  { id:"social-studio",       label:"Social Caption Studio",icon:MessageSquare },
  { id:"video-studio",        label:"Auto Video Maker",     icon:Video },
  { id:"ai-studio",           label:"AI Studio",            icon:Wand2 },
  { id:"viral-studio",        label:"Viral Studio",         icon:TrendingUp },
  { id:"influencer-watch",    label:"Influencer Watch",    icon:Users },
  { id:"video-script",        label:"Video Script Writer",  icon:Film },
  { id:"market-report",       label:"Market Report Builder",icon:BarChart3 },
  { section:"GROW" },
  { id:"lead-inbox",          label:"Lead Inbox",          icon:Bell },
  { id:"ai-concierge",        label:"AI Lead Concierge",   icon:Zap },
  { id:"social-agent",        label:"Social Engagement AI", icon:MessageSquare },
  { id:"closing-mult",        label:"Closing Multiplier",  icon:Award },
  { id:"pipeline",            label:"Pipeline Board",      icon:Layout },
  { id:"tasks",               label:"Tasks",               icon:CheckCircle },
  { id:"action-plans",        label:"Action Plans",        icon:Zap },
  { id:"campaigns",           label:"Email Campaigns",     icon:Mail },
  { id:"prospecting",         label:"Prospecting Hub",     icon:Phone },
  { id:"lead-tracker",        label:"Lead Tracker",        icon:UserCheck },
  { id:"soi-manager",         label:"SOI Manager",         icon:Heart },
  { id:"transactions",        label:"Transaction Manager", icon:Key },
  { id:"commissions",         label:"Commission Tracker",  icon:DollarSign },
  { id:"finances",            label:"Finances",            icon:Briefcase },
  { section:"LISTINGS" },
  { id:"listing-tracker",     label:"Listing Tracker",     icon:Home },
  { id:"realcomp-mls",        label:"Realcomp MLS",        icon:Building },
  { section:"CONTENT" },
  { id:"scheduler",           label:"Content Scheduler",   icon:Calendar },
  { id:"social-connect",      label:"Social Connect",      icon:Share2 },
  { id:"google-business",     label:"Google Business",     icon:Globe },
  { id:"media-library",       label:"Media Library",       icon:FolderOpen },
  { id:"showing-calendar",    label:"Showing Calendar",    icon:CalendarDays },
  { id:"client-templates",    label:"Client Templates",    icon:Heart },
  { id:"integrations",        label:"Integrations",        icon:Globe },
  { section:"INSIGHTS" },
  { id:"db-intel",            label:"Database Intelligence", icon:Wand2 },
  { id:"analytics",           label:"Business Analytics",  icon:TrendingUp },
  { id:"market-analyzer",     label:"Market Analyzer",     icon:Search },
  { id:"cma-tool",            label:"CMA Assistant",       icon:Building },
  { section:"TOOLS" },
  { id:"content-repurposer",  label:"Content Repurposer",  icon:RefreshCw },
  { id:"carousel-builder",    label:"Property Carousel",   icon:Layout },
  { id:"ab-testing",          label:"A/B Description Test",icon:FlaskConical },
  { id:"landing-page",        label:"Listing Landing Page",icon:Globe },
  { id:"email-alerts",        label:"Email Alerts",        icon:Mail },
  { section:"ACCOUNT" },
  { id:"settings",            label:"Settings",            icon:Settings },
  { id:"help",                label:"Help Guide",          icon:HelpCircle },
];

// ─── UTILITIES ────────────────────────────────────────────────────────────────

// IndexedDB for large data (leads)
const idbGet = (key) => new Promise(resolve => {
  const req = indexedDB.open("re-hub", 1);
  req.onupgradeneeded = e => e.target.result.createObjectStore("kv");
  req.onsuccess = e => {
    const tx = e.target.result.transaction("kv","readonly");
    const r = tx.objectStore("kv").get(key);
    r.onsuccess = () => resolve(r.result ?? null);
    r.onerror = () => resolve(null);
  };
  req.onerror = () => resolve(null);
});

const idbSet = (key, val) => new Promise(resolve => {
  const req = indexedDB.open("re-hub", 1);
  req.onupgradeneeded = e => e.target.result.createObjectStore("kv");
  req.onsuccess = e => {
    const tx = e.target.result.transaction("kv","readwrite");
    tx.objectStore("kv").put(val, key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => resolve(false);
  };
  req.onerror = () => resolve(false);
});

// useLS and useIDB are imported from cloudHooks.js (Supabase-backed)

const callClaude = async (prompt, sys="", tokens=1500) => {
  const r = await fetch("/api/claude/messages", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ model:"claude-sonnet-4-20250514", max_tokens:tokens, ...(sys?{system:sys}:{}), messages:[{role:"user",content:prompt}] })
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.content[0].text;
};

const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
const now = () => new Date().toISOString();
const fmt = d => new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"});
const fmtT = d => new Date(d).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"});
const fmtMoney = n => n ? `$${Number(n).toLocaleString()}` : "—";

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
const Spinner = ({s=16}) => <div className="spinner" style={{width:s,height:s}}/>;

const Toast = ({toasts,remove}) => (
  <div style={{position:"fixed",bottom:24,right:24,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
    {toasts.map(t => (
      <div key={t.id} className={`toast toast-${t.type}`}>
        {t.type==="success"?<CheckCircle size={14} color="#10b981"/>:t.type==="error"?<AlertCircle size={14} color="#ef4444"/>:<Info size={14} color="#7eb8f7"/>}
        <span style={{flex:1}}>{t.msg}</span>
        <button style={{background:"none",border:"none",cursor:"pointer",color:"#475569",padding:2}} onClick={()=>remove(t.id)}><X size={12}/></button>
      </div>
    ))}
  </div>
);

const useToast = () => {
  const [toasts, setT] = useState([]);
  const add = useCallback((msg,type="info") => {
    const id=uid(); setT(p=>[...p,{id,msg,type}]);
    setTimeout(()=>setT(p=>p.filter(t=>t.id!==id)),4000);
  },[]);
  const rm = useCallback(id=>setT(p=>p.filter(t=>t.id!==id)),[]);
  return {toasts,remove:rm,success:m=>add(m,"success"),error:m=>add(m,"error"),info:m=>add(m,"info")};
};

const PTag = ({p}) => { const pl=PLATFORMS[p]; if(!pl) return null; return <span className={`ptag ${pl.cls}`}>{pl.label}</span>; };

const Toggle = ({checked,onChange}) => (
  <label className="toggle-sw">
    <input type="checkbox" checked={checked} onChange={e=>onChange(e.target.checked)}/>
    <span className="toggle-track"/>
  </label>
);

const CharCount = ({text,limit}) => {
  const l=(text||"").length;
  return <div className={`char-count${l>limit?" over":l>limit*.85?" warn":""}`}>{l.toLocaleString()}/{limit.toLocaleString()}</div>;
};

const CopyBtn = ({text,toast,sm}) => {
  const [ok,setOk] = useState(false);
  const copy = () => { navigator.clipboard.writeText(text).then(()=>{setOk(true);toast?.success("Copied!");setTimeout(()=>setOk(false),2000);}); };
  return <button className={`btn btn-ghost ${sm?"btn-sm":"btn-xs"}`} onClick={copy}>{ok?<Check size={12}/>:<Copy size={12}/>}{ok?"Copied":"Copy"}</button>;
};

const EmptyState = ({icon:Icon,title,desc,cta}) => (
  <div className="empty-state">
    <Icon size={44}/>
    <h3>{title}</h3>
    <p>{desc}</p>
    {cta}
  </div>
);

const PageHeader = ({title,sub,action,setPage,parent}) => (
  <div style={{marginBottom:28}}>
    {parent && (
      <button className="btn-back" style={{marginBottom:14}} onClick={()=>setPage?.(parent || "dashboard")}>
        <ArrowLeft size={13}/> {parent==="dashboard"?"Dashboard":NAV.find(n=>n.id===parent)?.label||"Back"}
      </button>
    )}
    <div className="flex-between">
      <div>
        <div className="page-title">{title}</div>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      {action}
    </div>
  </div>
);

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
const Dashboard = ({setPage,toast}) => {
  const [posts] = useLS("posts",[]);
  const [leads] = useLeadsCloud();
  const [txs] = useLS("transactions",[]);
  const [commissions] = useLS("commissions",[]);
  const [showings] = useLS("showings",[]);
  const [prospecting] = useLS("prospecting_log",[]);
  const [listings] = useLS("active_listings",[]);
  const [profile] = useLS("re_profile",{name:"Monica Iskra"});
  const [goals] = useLS("commission_goals",{target:""});
  const [tasks,setTasks] = useLS("tasks",[]);
  const [adCampaigns] = useLS("ad_campaigns",[]);

  const now2 = new Date();
  const thisYear = now2.getFullYear();
  const thisMonth = now2.getMonth();
  const thisWeekStart = new Date(now2); thisWeekStart.setDate(now2.getDate()-now2.getDay());

  // KPIs
  const hotLeads = leads.filter(l=>l.status==="Hot Prospect"||l.status==="Buyer"||l.status==="Seller").length;
  const pendingLeads = leads.filter(l=>l.status==="Pending").length;
  const activeTxs = txs.filter(t=>t.status==="Active").length;
  const activeListings = listings.filter(l=>l.status==="Active").length;
  const gciReceived = commissions.filter(e=>e.status==="Received"&&new Date(e.closeDate||e.createdAt).getFullYear()===thisYear).reduce((s,e)=>s+(Number(e.salePrice||0)*Number(e.commissionPct||0)/100),0);
  const gciPipeline = commissions.filter(e=>e.status==="Expected"&&new Date(e.closeDate||e.createdAt).getFullYear()===thisYear).reduce((s,e)=>s+(Number(e.salePrice||0)*Number(e.commissionPct||0)/100),0);
  const goalAmt = Number(goals.target)||0;
  const goalPct = goalAmt>0?Math.min(100,Math.round((gciReceived/goalAmt)*100)):0;

  // This week prospecting
  const weekActivity = prospecting.filter(p=>new Date(p.date)>=thisWeekStart);
  const weekCalls = weekActivity.reduce((s,p)=>s+(Number(p.calls)||0),0);
  const weekAppts = weekActivity.reduce((s,p)=>s+(Number(p.appointments)||0),0);

  // Lead Generation stats
  const totalCampaigns = adCampaigns.length;
  const draftCampaigns = adCampaigns.filter(c=>c.status==="draft").length;
  const launchedCampaigns = adCampaigns.filter(c=>c.status==="launched").length;
  const thisMonthLeads = leads.filter(l=>{
    const d = new Date(l.createdAt || l.receivedAt || 0);
    return d.getFullYear()===thisYear && d.getMonth()===thisMonth;
  });
  const adSourceLeads = thisMonthLeads.filter(l=>{
    const src = (l.source||"").toLowerCase();
    return src.includes("facebook") || src.includes("instagram") || src.includes("meta");
  }).length;
  const totalMonthBudget = adCampaigns
    .filter(c=>c.status==="launched")
    .reduce((s,c)=>s+(Number(c.budget?.totalSpend)||0),0);
  const costPerLead = adSourceLeads > 0 ? Math.round(totalMonthBudget / adSourceLeads) : null;

  // Funnel
  const funnelStages = [
    {label:"Hot Prospects",count:leads.filter(l=>l.status==="Hot Prospect").length,color:"#ef4444"},
    {label:"Buyers/Sellers",count:leads.filter(l=>l.status==="Buyer"||l.status==="Seller").length,color:"#8b5cf6"},
    {label:"Pending",count:leads.filter(l=>l.status==="Pending").length,color:"#f59e0b"},
    {label:"Closed",count:leads.filter(l=>["Closed","Past Client"].includes(l.status)).length,color:"#10b981"},
  ];
  const funnelMax = Math.max(...funnelStages.map(f=>f.count),1);

  // Upcoming showings
  const upcomingShowings = showings.filter(s=>new Date(s.date)>=now2).sort((a,b)=>new Date(a.date)-new Date(b.date)).slice(0,3);

  // Closing soon
  const closingSoon = txs.filter(t=>t.status==="Active"&&t.closingDate).sort((a,b)=>new Date(a.closingDate)-new Date(b.closingDate)).slice(0,3);

  const hour = now2.getHours();
  const greeting = hour<12?"Good morning":"Good afternoon";

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{marginBottom:28,display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
        <div>
          <div style={{fontSize:30,fontWeight:900,letterSpacing:"-.5px",color:"#ffffff",fontFamily:"'DM Serif Display', serif"}}>
            {greeting}, {profile.name?.split(" ")[0]||"Monica"}
          </div>
          <div style={{fontSize:14,color:"#94a3b8",marginTop:4,fontWeight:600}}>
            {new Date().toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"})}
          </div>
        </div>
        {goalAmt>0&&(
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginBottom:6}}>
              {thisYear} Goal — {goalPct}% there
            </div>
            <div style={{width:200,background:"rgba(255,255,255,.07)",borderRadius:99,height:8}}>
              <div style={{background:"linear-gradient(90deg,#1a5aa0,#10b981)",height:8,borderRadius:99,width:`${goalPct}%`,transition:"width .5s"}}/>
            </div>
            <div style={{fontSize:12,color:"#94a3b8",marginTop:4}}>${Math.round(gciReceived).toLocaleString()} of ${goalAmt.toLocaleString()}</div>
          </div>
        )}
      </div>

      {/* KPI Row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:12,marginBottom:16}}>
        {[
          {label:"GCI Received",val:`$${Math.round(gciReceived).toLocaleString()}`,sub:`+$${Math.round(gciPipeline).toLocaleString()} pipeline`,icon:DollarSign,cls:"stat-card-3",page:"commissions"},
          {label:"Active Leads",val:hotLeads,sub:`${pendingLeads} pending`,icon:UserCheck,cls:"stat-card-1",page:"lead-tracker"},
          {label:"Active Deals",val:activeTxs,sub:"in transaction",icon:Key,cls:"stat-card-2",page:"transactions"},
          {label:"Active Listings",val:activeListings,sub:"on market",icon:Home,cls:"stat-card-4",page:"listing-tracker"},
          {label:"Calls This Week",val:weekCalls,sub:`${weekAppts} appts set`,icon:Phone,cls:"stat-card-1",page:"prospecting"},
        ].map(s=>(
          <div key={s.label} className={`stat-card ${s.cls}`} style={{cursor:"pointer"}} onClick={()=>setPage(s.page)}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-number">{s.val}</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,.4)",marginTop:4,fontWeight:600}}>{s.sub}</div>
            <div className="stat-icon"><s.icon size={36}/></div>
          </div>
        ))}
      </div>

      {/* Lead Generation featured card */}
      <div
        className="glass-card"
        style={{
          marginBottom:24,
          padding:20,
          background:'linear-gradient(135deg, rgba(16,185,129,.10), rgba(126,184,247,.06))',
          borderColor:'rgba(16,185,129,.25)',
          cursor:'pointer'
        }}
        onClick={()=>setPage("ad-composer")}
      >
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,flexWrap:"wrap"}}>
          <div style={{flex:1,minWidth:240}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
              <Sparkles size={20} color="#10b981"/>
              <div style={{fontFamily:"'DM Serif Display',serif",fontSize:20,fontWeight:900,color:"#fff"}}>Lead Generation</div>
            </div>
            <div style={{fontSize:13,color:"#94a3b8",lineHeight:1.5}}>
              AI-built Facebook & Instagram ad campaigns. Launch, manage, and track your lead-gen ads from one place.
            </div>
          </div>
          <button className="btn btn-blue" onClick={(e)=>{e.stopPropagation();setPage("ad-composer");}}>
            <Sparkles size={13}/> {totalCampaigns===0?"Build your first campaign":"Manage campaigns"}
          </button>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginTop:18,paddingTop:16,borderTop:"1px solid rgba(255,255,255,.06)"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>Total Campaigns</div>
            <div style={{fontSize:24,fontWeight:900,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>{totalCampaigns}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>{draftCampaigns} draft · {launchedCampaigns} live</div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>Leads This Month</div>
            <div style={{fontSize:24,fontWeight:900,color:"#10b981",fontFamily:"'DM Serif Display',serif"}}>{adSourceLeads}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>from FB/IG ads</div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>Ad Spend</div>
            <div style={{fontSize:24,fontWeight:900,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>${totalMonthBudget||0}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>budgeted this month</div>
          </div>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"#64748b",textTransform:"uppercase",letterSpacing:".5px",marginBottom:2}}>Cost / Lead</div>
            <div style={{fontSize:24,fontWeight:900,color:"#a78bfa",fontFamily:"'DM Serif Display',serif"}}>{costPerLead?`$${costPerLead}`:"—"}</div>
            <div style={{fontSize:11,color:"#94a3b8"}}>{costPerLead?"actual":"need launched campaign"}</div>
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:16,marginBottom:16}}>
        {/* Lead Pipeline Funnel */}
        <div className="glass-card">
          <div className="flex-between" style={{marginBottom:18}}>
            <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>Lead Pipeline</div>
            <button className="btn btn-ghost btn-xs" onClick={()=>setPage("lead-tracker")}>View All →</button>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {funnelStages.map((f,i)=>(
              <div key={f.label}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>{f.label}</span>
                  <span style={{fontSize:13,fontWeight:800,color:f.color}}>{f.count.toLocaleString()}</span>
                </div>
                <div style={{background:"rgba(255,255,255,.06)",borderRadius:99,height:10}}>
                  <div style={{background:f.color,height:10,borderRadius:99,width:`${(f.count/funnelMax)*100}%`,opacity:.85,transition:"width .5s"}}/>
                </div>
                {i<funnelStages.length-1&&f.count>0&&funnelStages[i+1].count>0&&(
                  <div style={{fontSize:11,color:"#475569",marginTop:3,textAlign:"right"}}>
                    {Math.round((funnelStages[i+1].count/f.count)*100)}% convert
                  </div>
                )}
              </div>
            ))}
          </div>
          <div style={{marginTop:16,paddingTop:14,borderTop:"1px solid rgba(255,255,255,.06)",display:"flex",gap:20}}>
            <div><div style={{fontSize:11,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>Total Database</div><div style={{fontSize:18,fontWeight:900,color:"#fff"}}>{leads.length.toLocaleString()}</div></div>
            <div><div style={{fontSize:11,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px"}}>Past Clients</div><div style={{fontSize:18,fontWeight:900,color:"#6ee7b7"}}>{leads.filter(l=>l.status==="Past Client").length.toLocaleString()}</div></div>
          </div>
        </div>

        {/* Today's Agenda */}
        <div className="glass-card">
          <div style={{fontWeight:800,fontSize:15,color:"#fff",marginBottom:16}}>Today's Agenda</div>
          {upcomingShowings.length===0&&closingSoon.length===0
            ? <EmptyState icon={Calendar} title="Clear calendar" desc="No showings or closings scheduled"/>
            : <>
              {upcomingShowings.length>0&&(
                <>
                  <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:".8px",marginBottom:8}}>Upcoming Showings</div>
                  {upcomingShowings.map(s=>(
                    <div key={s.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                      <div style={{width:36,height:36,borderRadius:9,background:"rgba(26,90,160,.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Calendar size={14} color="#7eb8f7"/></div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.property||s.title||"Showing"}</div>
                        <div style={{fontSize:11,color:"#64748b"}}>{s.date?new Date(s.date).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):""}</div>
                      </div>
                    </div>
                  ))}
                </>
              )}
              {closingSoon.length>0&&(
                <>
                  <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:".8px",margin:"12px 0 8px"}}>Closing Soon</div>
                  {closingSoon.map(t=>{
                    const days=Math.ceil((new Date(t.closingDate)-new Date())/(1000*60*60*24));
                    return (
                      <div key={t.id} style={{display:"flex",gap:10,alignItems:"center",padding:"8px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                        <div style={{width:36,height:36,borderRadius:9,background:"rgba(16,185,129,.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}><Key size={14} color="#6ee7b7"/></div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:13,fontWeight:700,color:"#fff",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.address}</div>
                          <div style={{fontSize:11,color:"#64748b"}}>{t.client}</div>
                        </div>
                        <span style={{fontSize:12,fontWeight:800,color:days<=7?"#f87171":"#6ee7b7",flexShrink:0}}>{days}d</span>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          }
          <button className="btn btn-ghost btn-sm" style={{width:"100%",marginTop:12}} onClick={()=>setPage("showing-calendar")}>Open Calendar →</button>
        </div>
      </div>

      {/* Follow-up Reminders */}
      {(() => {
        const today = new Date().toISOString().slice(0,10);
        const due = leads.filter(l=>l.followUp&&l.followUp<=today).sort((a,b)=>a.followUp>b.followUp?1:-1);
        if(due.length===0) return null;
        return (
          <div className="glass-card" style={{marginBottom:20,borderLeft:"3px solid #f87171"}}>
            <div className="flex-between" style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18}}>📅</span>
                <div>
                  <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>Follow-ups Due</div>
                  <div style={{fontSize:12,color:"#f87171",fontWeight:600}}>{due.length} contact{due.length>1?"s":""} need{due.length===1?"s":""} a call today</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={()=>setPage("lead-tracker")}>View All →</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {due.slice(0,5).map(l=>{
                const overdue = Math.floor((new Date()-new Date(l.followUp+"T12:00:00"))/(1000*60*60*24));
                return (
                  <div key={l.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"rgba(239,68,68,.07)",borderRadius:10,border:"1px solid rgba(239,68,68,.15)"}}>
                    <div style={{flex:1}}>
                      <div style={{fontWeight:700,fontSize:14,color:"#fff"}}>{l.name}</div>
                      <div style={{fontSize:12,color:"#94a3b8"}}>{l.phone||l.email||l.area||""}</div>
                    </div>
                    <span style={{fontSize:12,fontWeight:800,color:"#f87171",flexShrink:0}}>{overdue===0?"Today":overdue===1?"1d overdue":`${overdue}d overdue`}</span>
                    <span className={`badge ${ {"Hot Prospect":"badge-red","Contact":"badge-blue","Buyer":"badge-blue","Seller":"badge-gold","Casually Browsing":"badge-gray","Nurture 3-6 Months":"badge-gold","Nurture 1+ Year":"badge-gold","Buy/Sell Nurture":"badge-gold","Pending":"badge-gold","Past Client":"badge-green","Closed":"badge-green","Trash":"badge-gray"}[l.status]||"badge-gray"}`}>{l.status}</span>
                  </div>
                );
              })}
              {due.length>5&&<div style={{fontSize:12,color:"#475569",textAlign:"center",paddingTop:4}}>+{due.length-5} more in Lead Tracker</div>}
            </div>
          </div>
        );
      })()}

      {/* Today's Tasks */}
      {(()=>{
        const todayStr = new Date().toISOString().slice(0,10);
        const dueTasks = tasks.filter(t=>!t.completed&&t.dueDate<=todayStr).sort((a,b)=>a.dueDate>b.dueDate?1:-1);
        if(dueTasks.length===0) return null;
        return (
          <div className="glass-card" style={{marginBottom:20,borderLeft:"3px solid #7eb8f7"}}>
            <div className="flex-between" style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontSize:18}}>✅</span>
                <div>
                  <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>Today's Tasks</div>
                  <div style={{fontSize:12,color:"#7eb8f7",fontWeight:600}}>{dueTasks.length} task{dueTasks.length>1?"s":""} due today</div>
                </div>
              </div>
              <button className="btn btn-ghost btn-xs" onClick={()=>setPage("tasks")}>View All →</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {dueTasks.slice(0,5).map(t=>(
                <div key={t.id} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 12px",background:"rgba(126,184,247,.05)",borderRadius:10,border:"1px solid rgba(126,184,247,.1)"}}>
                  <span style={{fontSize:16,flexShrink:0}}>{TASK_ICONS[t.type]||"✅"}</span>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#fff"}}>{t.title}</div>
                    {t.leadName&&<div style={{fontSize:11,color:"#64748b"}}>{t.leadName}</div>}
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:t.dueDate<todayStr?"#f87171":"#7eb8f7",flexShrink:0}}>
                    {t.dueDate<todayStr?"Overdue":"Today"}
                  </span>
                  <button className="btn btn-ghost btn-xs" onClick={()=>{setTasks(p=>p.map(x=>x.id===t.id?{...x,completed:true,completedAt:new Date().toISOString()}:x));toast.success("Done!");}}><Check size={12}/></button>
                </div>
              ))}
              {dueTasks.length>5&&<div style={{fontSize:12,color:"#475569",textAlign:"center",paddingTop:4}}>+{dueTasks.length-5} more in Tasks</div>}
            </div>
          </div>
        );
      })()}

      {/* Quick Actions */}
      <div style={{fontWeight:800,fontSize:13,color:"#475569",textTransform:"uppercase",letterSpacing:"1px",marginBottom:12}}>Quick Actions</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:20}}>
        {[
          {label:"Pipeline Board",sub:"Drag-drop leads",icon:Layout,page:"pipeline",color:"#8b5cf6"},
          {label:"Tasks",sub:"Today's to-dos",icon:CheckCircle,page:"tasks",color:"#10b981"},
          {label:"Log Activity",sub:"Prospecting tracker",icon:Phone,page:"prospecting",color:"#1a5aa0"},
          {label:"Add Deal",sub:"Transaction manager",icon:Key,page:"transactions",color:"#d4a017"},
          {label:"Write Listing",sub:"AI listing copy",icon:FileText,page:"listing-writer",color:"#ef4444"},
          {label:"SOI Follow-up",sub:"Past client touches",icon:Heart,page:"soi-manager",color:"#f59e0b"},
        ].map(a=>(
          <button key={a.page} className="quick-action-card" onClick={()=>setPage(a.page)}>
            <div className="quick-action-icon" style={{background:`${a.color}20`,marginBottom:8}}><a.icon size={18} color={a.color}/></div>
            <div style={{fontSize:12,fontWeight:700,color:"#fff",lineHeight:1.3}}>{a.label}</div>
            <div style={{fontSize:11,color:"#475569",marginTop:2}}>{a.sub}</div>
          </button>
        ))}
      </div>

      {/* Bottom Row */}
      <div className="grid-2">
        <div className="glass-card">
          <div className="flex-between" style={{marginBottom:14}}>
            <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>This Week's Prospecting</div>
            <button className="btn btn-ghost btn-xs" onClick={()=>setPage("prospecting")}>Log Activity →</button>
          </div>
          {weekActivity.length===0
            ? <div style={{fontSize:13,color:"#475569",textAlign:"center",padding:"20px 0"}}>No activity logged this week yet.<br/><span style={{fontSize:12}}>Start your day by logging your calls.</span></div>
            : <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
              {[
                {label:"Calls",val:weekCalls,color:"#7eb8f7"},
                {label:"Texts",val:weekActivity.reduce((s,p)=>s+(Number(p.texts)||0),0),color:"#a78bfa"},
                {label:"Emails",val:weekActivity.reduce((s,p)=>s+(Number(p.emails)||0),0),color:"#6ee7b7"},
                {label:"Doors",val:weekActivity.reduce((s,p)=>s+(Number(p.doors)||0),0),color:"#fcd34d"},
                {label:"Appts Set",val:weekAppts,color:"#f9a8d4"},
                {label:"Showings",val:weekActivity.reduce((s,p)=>s+(Number(p.showings)||0),0),color:"#fb923c"},
              ].map(m=>(
                <div key={m.label} style={{textAlign:"center",padding:"10px 6px",background:"rgba(255,255,255,.03)",borderRadius:9}}>
                  <div style={{fontSize:22,fontWeight:900,color:m.color,fontFamily:"'DM Serif Display',serif"}}>{m.val}</div>
                  <div style={{fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:".4px",marginTop:2}}>{m.label}</div>
                </div>
              ))}
            </div>
          }
        </div>

        <div className="glass-card">
          <div className="flex-between" style={{marginBottom:14}}>
            <div style={{fontWeight:800,fontSize:14,color:"#fff"}}>Recent Leads</div>
            <button className="btn btn-ghost btn-xs" onClick={()=>setPage("lead-tracker")}>View All →</button>
          </div>
          {leads.length===0
            ? <EmptyState icon={UserCheck} title="No leads yet" desc="Sync FUB or add manually"/>
            : [...leads].sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5).map(l=>(
              <div key={l.id} className="flex-between" style={{padding:"9px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
                <div>
                  <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{l.name}</div>
                  <div style={{fontSize:11,color:"#64748b"}}>{l.type} · {l.area||"No area"}</div>
                </div>
                <span className={`badge ${["Closed","Past Client"].includes(l.status)?"badge-green":l.status==="Pending"?"badge-gold":l.status==="Trash"?"badge-gray":"badge-blue"}`}>{l.status}</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
};

// ─── AI LISTING WRITER ────────────────────────────────────────────────────────
const ListingWriter = ({setPage,toast}) => {
  const [address,setAddress] = useState("");
  const [propType,setPropType] = useState("Single Family");
  const [beds,setBeds] = useState("");
  const [baths,setBaths] = useState("");
  const [sqft,setSqft] = useState("");
  const [price,setPrice] = useState("");
  const [features,setFeatures] = useState("");
  const [tone,setTone] = useState("Professional");
  const [format,setFormat] = useState("MLS");
  const [loading,setLoading] = useState(false);
  const [output,setOutput] = useState("");
  const [saved,setSaved] = useLS("saved_listings",[]);
  const [agentVoice] = useLS("agent_voice","");

  const generate = async () => {
    if(!address.trim()) return toast.error("Enter a property address");
    setLoading(true);
    try {
      const out = await callClaude(
        `Write a ${format} listing description for this property:\n\nAddress: ${address}\nType: ${propType}\nBeds: ${beds||"N/A"} | Baths: ${baths||"N/A"} | Sqft: ${sqft||"N/A"}\nList Price: ${price?fmtMoney(price):"N/A"}\nKey Features: ${features||"Not specified"}\nTone: ${tone}\n\nFormat: ${format==="MLS"?"Under 1000 characters, MLS-ready, highlight top 3 features, strong closing line.":format==="Social"?"Engaging social media caption with emojis, call to action, keep under 2000 characters.":"Full marketing brochure copy with headline, description paragraphs, and features list."}`,
        agentVoice?`You are a real estate marketing expert. Agent voice/brand: ${agentVoice}`:"You are an expert real estate copywriter who writes compelling, accurate, and SEO-friendly listing descriptions."
      );
      setOutput(out);
    } catch(e) { toast.error(e.message); }
    setLoading(false);
  };

  return (
    <div className="page-content">
      <PageHeader title="AI Listing Writer" sub="Generate MLS descriptions, social copy, and marketing brochures" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="glass-card">
          <div className="col">
            <div><div className="label">Property Address</div><input className="input" placeholder="123 Main St, City, State 00000" value={address} onChange={e=>setAddress(e.target.value)}/></div>
            <div className="grid-2" style={{gap:10}}>
              <div><div className="label">Property Type</div>
                <select className="select" value={propType} onChange={e=>setPropType(e.target.value)}>
                  {PROPERTY_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><div className="label">List Price</div><input className="input" type="number" placeholder="500000" value={price} onChange={e=>setPrice(e.target.value)}/></div>
            </div>
            <div className="grid-3" style={{gap:8}}>
              <div><div className="label">Beds</div><input className="input" type="number" placeholder="4" value={beds} onChange={e=>setBeds(e.target.value)}/></div>
              <div><div className="label">Baths</div><input className="input" type="number" step=".5" placeholder="2.5" value={baths} onChange={e=>setBaths(e.target.value)}/></div>
              <div><div className="label">Sqft</div><input className="input" type="number" placeholder="2100" value={sqft} onChange={e=>setSqft(e.target.value)}/></div>
            </div>
            <div><div className="label">Key Features & Highlights</div>
              <textarea className="textarea" placeholder="e.g. Updated kitchen, hardwood floors, pool, large backyard, cul-de-sac, walk to school..." value={features} onChange={e=>setFeatures(e.target.value)}/>
            </div>
            <div className="grid-2" style={{gap:10}}>
              <div><div className="label">Output Format</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {["MLS","Social","Brochure"].map(f=>(
                    <button key={f} className={`badge ${format===f?"badge-blue":"badge-gray"}`} style={{cursor:"pointer",border:"none",padding:"5px 11px"}} onClick={()=>setFormat(f)}>{f}</button>
                  ))}
                </div>
              </div>
              <div><div className="label">Tone</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                  {["Professional","Luxury","Warm","Bold"].map(t=>(
                    <button key={t} className={`badge ${tone===t?"badge-gold":"badge-gray"}`} style={{cursor:"pointer",border:"none",padding:"5px 11px"}} onClick={()=>setTone(t)}>{t}</button>
                  ))}
                </div>
              </div>
            </div>
            <button className="btn btn-blue" onClick={generate} disabled={loading}>
              {loading?<><Spinner s={13}/>Writing…</>:<><FileText size={13}/>Generate Description</>}
            </button>
          </div>
        </div>

        <div className="col">
          <div className="glass-card">
            <div className="flex-between" style={{marginBottom:12}}>
              <div className="section-title" style={{margin:0}}>Generated Description</div>
              {output&&<div style={{display:"flex",gap:6}}>
                <CopyBtn text={output} toast={toast}/>
                <button className="btn btn-ghost btn-xs" onClick={()=>{if(!address)return;setSaved(p=>[{id:uid(),address,propType,beds,baths,sqft,price,format,content:output,createdAt:now()},...p]);toast.success("Saved!");}}>
                  <Save size={11}/>Save
                </button>
                <button className="btn btn-ghost btn-xs" onClick={generate} disabled={loading}><RotateCcw size={11}/></button>
              </div>}
            </div>
            {output ? (
              <><div className="output-box">{output}</div>{format!=="Brochure"&&<CharCount text={output} limit={format==="MLS"?1000:LIMITS.instagram}/>}</>
            ) : (
              <div className="flex-center" style={{minHeight:200,flexDirection:"column",gap:10}}>
                <FileText size={32} color="#1a5aa0" opacity={.4}/>
                <div style={{fontSize:13,color:"#374151"}}>Your listing description appears here</div>
              </div>
            )}
          </div>

          <div className="glass-card">
            <div className="section-title">Saved Descriptions ({saved.length})</div>
            {saved.length===0?<div style={{fontSize:13,color:"#374151",textAlign:"center",padding:"16px 0"}}>No saved descriptions yet</div>
            :saved.slice(0,6).map(s=>(
              <div key={s.id} className="row-item" style={{marginBottom:8,flexDirection:"column",alignItems:"flex-start",gap:7}}>
                <div className="flex-between" style={{width:"100%"}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:700,color:"#94a3b8"}}>{s.address}</div>
                    <div style={{display:"flex",gap:6,marginTop:3}}><span className="badge badge-blue" style={{fontSize:10}}>{s.propType}</span><span className="badge badge-gray" style={{fontSize:10}}>{s.format}</span></div>
                  </div>
                  <div style={{display:"flex",gap:5}}><CopyBtn text={s.content} toast={toast}/><button className="btn btn-danger btn-icon btn-xs" onClick={()=>setSaved(p=>p.filter(x=>x.id!==s.id))}><Trash2 size={11}/></button></div>
                </div>
                <div style={{fontSize:12,color:"#64748b",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{s.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SOCIAL CAPTION STUDIO ────────────────────────────────────────────────────
const SocialStudio = ({setPage,toast}) => {
  const [platform,setPlatform] = useState("instagram");
  const [postType,setPostType] = useState("Just Listed");
  const [topic,setTopic] = useState("");
  const [tone,setTone] = useState("Professional");
  const [htags,setHtags] = useState(true);
  const [hcount,setHcount] = useState(15);
  const [loading,setLoading] = useState(false);
  const [output,setOutput] = useState("");
  const [saved,setSaved] = useLS("saved_captions",[]);
  const [agentVoice] = useLS("agent_voice","");

  const generate = async () => {
    if(!topic.trim()) return toast.error("Add topic or listing details first");
    setLoading(true);
    try {
      const out = await callClaude(
        `Write a ${postType} real estate post for ${PLATFORMS[platform]?.label} about: ${topic}\nTone: ${tone}\nCharacter limit: ${LIMITS[platform]}${htags?`\nAdd ${hcount} relevant real estate hashtags at the end`:""}`,
        `You write real estate social media content. ${agentVoice||"You are an expert real estate agent marketing specialist. Create compelling, authentic posts that generate leads and engagement. Include calls to action."} Never sound robotic or generic.`
      );
      setOutput(out);
    } catch(e) { toast.error(e.message); }
    setLoading(false);
  };

  const postTypes = ["Just Listed","Just Sold","Open House","Price Reduced","Market Update","Local Spotlight","Client Testimonial","Educational Tip","Behind the Scenes","Call to Action"];

  return (
    <div className="page-content">
      <PageHeader title="Social Caption Studio" sub="AI-powered real estate social media content" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="glass-card">
          <div className="col">
            <div><div className="label">Post Type</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {postTypes.map(t=>(
                  <button key={t} className={`badge ${postType===t?"badge-blue":"badge-gray"}`} style={{cursor:"pointer",border:"none",padding:"5px 11px"}} onClick={()=>setPostType(t)}>{t}</button>
                ))}
              </div>
            </div>
            <div><div className="label">Platform</div>
              <select className="select" value={platform} onChange={e=>setPlatform(e.target.value)}>
                {Object.entries(PLATFORMS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><div className="label">Topic / Property Details</div>
              <textarea className="textarea" placeholder="e.g. 4BR/2.5BA in Oak Park, just listed at $649k, updated kitchen, great schools. Open house this Sunday 1-4pm." value={topic} onChange={e=>setTopic(e.target.value)}/>
            </div>
            <div><div className="label">Tone</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {["Professional","Exciting","Warm","Luxury","Casual","Urgent"].map(t=>(
                  <button key={t} className={`badge ${tone===t?"badge-gold":"badge-gray"}`} style={{cursor:"pointer",border:"none",padding:"5px 11px"}} onClick={()=>setTone(t)}>{t}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="flex-between"><div className="label" style={{margin:0}}>Include Hashtags</div><Toggle checked={htags} onChange={setHtags}/></div>
              {htags&&<div style={{marginTop:10}}><div className="label">Count: {hcount}</div><input type="range" min={5} max={30} value={hcount} onChange={e=>setHcount(+e.target.value)}/></div>}
            </div>
            <button className="btn btn-blue" onClick={generate} disabled={loading}>
              {loading?<><Spinner s={13}/>Generating…</>:<><Sparkles size={13}/>Generate Caption</>}
            </button>
          </div>
        </div>

        <div className="col">
          <div className="glass-card">
            <div className="flex-between" style={{marginBottom:12}}>
              <div className="section-title" style={{margin:0}}>Generated Caption</div>
              {output&&<div style={{display:"flex",gap:6}}>
                <CopyBtn text={output} toast={toast}/>
                <button className="btn btn-ghost btn-xs" onClick={()=>setSaved(p=>[{id:uid(),platform,postType,content:output,createdAt:now()},...p])}>
                  <Save size={11}/>Save
                </button>
                <button className="btn btn-ghost btn-xs" onClick={generate} disabled={loading}><RotateCcw size={11}/></button>
              </div>}
            </div>
            {output?(
              <><div className="output-box">{output}</div><CharCount text={output} limit={LIMITS[platform]}/></>
            ):(
              <div className="flex-center" style={{minHeight:180,flexDirection:"column",gap:10}}>
                <MessageSquare size={32} color="#374151"/>
                <div style={{fontSize:13,color:"#374151"}}>Your caption appears here</div>
              </div>
            )}
          </div>
          <div className="glass-card">
            <div className="section-title">Saved Captions ({saved.length})</div>
            {saved.slice(0,6).map(c=>(
              <div key={c.id} className="row-item" style={{marginBottom:8,flexDirection:"column",alignItems:"flex-start",gap:7}}>
                <div className="flex-between" style={{width:"100%"}}>
                  <div style={{display:"flex",gap:6}}><PTag p={c.platform}/><span className="badge badge-gray" style={{fontSize:10}}>{c.postType}</span></div>
                  <div style={{display:"flex",gap:5}}><CopyBtn text={c.content} toast={toast}/><button className="btn btn-danger btn-icon btn-xs" onClick={()=>setSaved(p=>p.filter(x=>x.id!==c.id))}><Trash2 size={11}/></button></div>
                </div>
                <div style={{fontSize:12,color:"#64748b",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{c.content}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── PROPERTY VIDEO STUDIO ────────────────────────────────────────────────────
const VideoStudio = ({setPage,toast}) => {
  const [vtype,setVtype] = useState("Property Tour");
  const [propDetails,setPropDetails] = useState("");
  const [dur,setDur] = useState("60s");
  const [loading,setLoading] = useState(false);
  const [result,setResult] = useState(null);
  const [saved,setSaved] = useLS("video_concepts",[]);
  const [agentVoice] = useLS("agent_voice","");

  const generate = async () => {
    if(!propDetails.trim()) return toast.error("Describe the property first");
    setLoading(true);
    try {
      const raw = await callClaude(
        `Create a real estate video concept for a ${vtype} (${dur}):\n\nProperty: ${propDetails}\n\nRespond ONLY with valid JSON (no markdown):\n{"title":"string","hook":"opening 3-second hook","scenes":[{"number":1,"duration":"5s","shot":"camera direction/shot type","narration":"what agent says or voiceover"}],"caption":"full social media caption for this video","hashtags":"#tag1 #tag2","musicMood":"type of background music","agentTips":"3 tips for filming this property"}`,
        agentVoice?`Real estate agent brand: ${agentVoice}`:"Expert real estate video marketing strategist.",
        2000
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      const entry = {id:uid(),...parsed,vtype,dur,propDetails,createdAt:now()};
      setSaved(p=>[entry,...p.slice(0,49)]);
      setResult(entry); toast.success("Video concept ready!");
    } catch(e) { toast.error("Failed — try again"); }
    setLoading(false);
  };

  const vtypes = ["Property Tour","Just Listed Reel","Open House Promo","Neighborhood Spotlight","Agent Introduction","Market Update","Testimonial","Before & After","Drone Footage Script","Day in the Life"];

  return (
    <div className="page-content">
      <PageHeader title="Property Video Studio" sub="Scene-by-scene video scripts for listings" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="glass-card">
          <div className="col">
            <div><div className="label">Video Type</div>
              <select className="select" value={vtype} onChange={e=>setVtype(e.target.value)}>
                {vtypes.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><div className="label">Duration</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {["30s","60s","90s","3min","5min"].map(d=>(
                  <button key={d} className={`badge ${dur===d?"badge-gold":"badge-gray"}`} style={{cursor:"pointer",border:"none",padding:"5px 11px"}} onClick={()=>setDur(d)}>{d}</button>
                ))}
              </div>
            </div>
            <div><div className="label">Property / Topic Details</div>
              <textarea className="textarea" placeholder="e.g. 4BR colonial in Naperville, IL. $599k. 2500 sqft, renovated kitchen with quartz countertops, 3-car garage, backs to preserve. Want to highlight the great room and master suite." value={propDetails} onChange={e=>setPropDetails(e.target.value)}/>
            </div>
            <button className="btn btn-blue" onClick={generate} disabled={loading}>
              {loading?<><Spinner s={13}/>Creating script…</>:<><Film size={13}/>Generate Video Script</>}
            </button>
          </div>
        </div>

        <div className="col">
          {result?(
            <div className="glass-card">
              <div className="flex-between" style={{marginBottom:16}}>
                <div style={{fontWeight:800,fontSize:16,color:"#f8fafc",fontFamily:"'DM Serif Display', serif"}}>{result.title}</div>
                <div style={{display:"flex",gap:6}}><span className="badge badge-blue">{result.vtype}</span><span className="badge badge-gold">{result.dur}</span></div>
              </div>
              {[
                {label:"🎣 Opening Hook (3 Seconds)",content:result.hook},
                {label:"🎬 Shot List",content:result.scenes?.map((s,i)=>`Scene ${s.number||i+1} (${s.duration})\n📷 ${s.shot}\n🎤 "${s.narration}"`).join("\n\n")},
                {label:"📝 Social Caption",content:result.caption},
                {label:"#️⃣ Hashtags",content:result.hashtags},
                {label:"🎵 Music Mood",content:result.musicMood},
                {label:"📹 Filming Tips",content:result.agentTips},
              ].filter(s=>s.content).map(s=>(
                <div key={s.label} style={{marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#64748b",marginBottom:7,textTransform:"uppercase",letterSpacing:".7px"}}>{s.label}</div>
                  <div className="output-box" style={{fontSize:12,minHeight:"unset"}}>{s.content}</div>
                  <div style={{marginTop:5}}><CopyBtn text={s.content} toast={toast}/></div>
                </div>
              ))}
            </div>
          ):(
            <div className="glass-card flex-center" style={{minHeight:300,flexDirection:"column",gap:12,border:"1px dashed rgba(26,90,160,.2)"}}>
              <Film size={40} color="#1a5aa0" opacity={.4}/>
              <div style={{color:"#374151",fontSize:13}}>Your video script appears here</div>
            </div>
          )}
          {saved.length>0&&(
            <div className="glass-card">
              <div className="section-title">Saved Scripts ({saved.length})</div>
              {saved.slice(0,4).map(s=>(
                <div key={s.id} className="row-item" style={{marginBottom:6,cursor:"pointer"}} onClick={()=>setResult(s)}>
                  <Film size={14} color="#1a5aa0"/>
                  <div style={{flex:1,minWidth:0}}><div style={{fontSize:13,fontWeight:600,color:"#94a3b8"}}>{s.title}</div><div style={{fontSize:11,color:"#374151"}}>{s.vtype} · {s.dur}</div></div>
                  <button className="btn btn-danger btn-icon btn-xs" onClick={e=>{e.stopPropagation();setSaved(p=>p.filter(x=>x.id!==s.id));}}><Trash2 size={11}/></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── MARKET REPORT BUILDER ────────────────────────────────────────────────────
const MarketReport = ({setPage,toast}) => {
  const [area,setArea] = useState("");
  const [month,setMonth] = useState(new Date().toLocaleString("default",{month:"long"}));
  const [year,setYear] = useState(new Date().getFullYear().toString());
  const [stats,setStats] = useState({medianPrice:"",avgDays:"",listToSale:"",inventory:"",closedSales:""});
  const [audience,setAudience] = useState("Buyers & Sellers");
  const [loading,setLoading] = useState(false);
  const [output,setOutput] = useState("");
  const [agentVoice] = useLS("agent_voice","");

  const generate = async () => {
    if(!area.trim()) return toast.error("Enter a market area");
    setLoading(true);
    try {
      const out = await callClaude(
        `Write a professional real estate market report for ${area} — ${month} ${year}.\n\nMarket Data (use if provided, otherwise reference as "market data indicates"):\n- Median Sale Price: ${stats.medianPrice||"not specified"}\n- Avg Days on Market: ${stats.avgDays||"not specified"}\n- List-to-Sale Ratio: ${stats.listToSale||"not specified"}\n- Inventory (months): ${stats.inventory||"not specified"}\n- Closed Sales: ${stats.closedSales||"not specified"}\n\nAudience: ${audience}\n\nInclude: market summary, buyer takeaways, seller takeaways, and a call to action to contact the agent. Keep it engaging, around 400-600 words.`,
        agentVoice?`Real estate agent: ${agentVoice}`:"Expert real estate agent writing a client-facing market report."
      );
      setOutput(out);
    } catch(e) { toast.error(e.message); }
    setLoading(false);
  };

  return (
    <div className="page-content">
      <PageHeader title="Market Report Builder" sub="Generate professional market updates for clients and social media" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="glass-card">
          <div className="col">
            <div><div className="label">Market Area / Neighborhood</div><input className="input" placeholder="e.g. Oak Park, IL or 60302 ZIP code" value={area} onChange={e=>setArea(e.target.value)}/></div>
            <div className="grid-2" style={{gap:10}}>
              <div><div className="label">Month</div>
                <select className="select" value={month} onChange={e=>setMonth(e.target.value)}>
                  {["January","February","March","April","May","June","July","August","September","October","November","December"].map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div><div className="label">Year</div><input className="input" value={year} onChange={e=>setYear(e.target.value)}/></div>
            </div>
            <div style={{fontWeight:700,fontSize:14,color:"#94a3b8"}}>Market Stats (optional)</div>
            <div className="grid-2" style={{gap:10}}>
              <div><div className="label">Median Sale Price</div><input className="input" placeholder="$450,000" value={stats.medianPrice} onChange={e=>setStats(p=>({...p,medianPrice:e.target.value}))}/></div>
              <div><div className="label">Avg Days on Market</div><input className="input" placeholder="21" value={stats.avgDays} onChange={e=>setStats(p=>({...p,avgDays:e.target.value}))}/></div>
              <div><div className="label">List-to-Sale Ratio</div><input className="input" placeholder="98.5%" value={stats.listToSale} onChange={e=>setStats(p=>({...p,listToSale:e.target.value}))}/></div>
              <div><div className="label">Months of Inventory</div><input className="input" placeholder="1.8" value={stats.inventory} onChange={e=>setStats(p=>({...p,inventory:e.target.value}))}/></div>
            </div>
            <div><div className="label">Target Audience</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {["Buyers & Sellers","Buyers","Sellers","Investors","General Public"].map(a=>(
                  <button key={a} className={`badge ${audience===a?"badge-blue":"badge-gray"}`} style={{cursor:"pointer",border:"none",padding:"5px 11px"}} onClick={()=>setAudience(a)}>{a}</button>
                ))}
              </div>
            </div>
            <button className="btn btn-blue" onClick={generate} disabled={loading}>
              {loading?<><Spinner s={13}/>Building report…</>:<><BarChart3 size={13}/>Generate Market Report</>}
            </button>
          </div>
        </div>
        <div className="glass-card">
          <div className="flex-between" style={{marginBottom:12}}>
            <div className="section-title" style={{margin:0}}>Generated Report</div>
            {output&&<CopyBtn text={output} toast={toast} sm/>}
          </div>
          {output?(
            <div className="output-box" style={{maxHeight:500,overflow:"auto"}}>{output}</div>
          ):(
            <div className="flex-center" style={{minHeight:300,flexDirection:"column",gap:12,border:"1px dashed rgba(26,90,160,.2)",borderRadius:12}}>
              <BarChart3 size={40} color="#1a5aa0" opacity={.4}/>
              <div style={{color:"#374151",fontSize:13}}>Your market report appears here</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── FUB HELPERS ──────────────────────────────────────────────────────────────
const fubToLead = (p) => ({
  id: `fub_${p.id}`,
  fubId: p.id,
  name: (p.name || `${p.firstName||""} ${p.lastName||""}`.trim() || "Unknown").slice(0,60),
  email: (p.emails?.[0]?.value || "").slice(0,80),
  phone: (p.phones?.[0]?.value || "").slice(0,20),
  type: "Buyer",
  status: p.stage || "Hot Prospect",
  budget: "",
  area: (p.addresses?.[0]?.city || "").slice(0,40),
  notes: "",
  createdAt: p.created || new Date().toISOString(),
  source: "fub"
});

// ─── CONTACT DETAIL ───────────────────────────────────────────────────────────
const ACTIVITY_TYPES = [
  {id:"call",label:"Call",icon:"📞",color:"#7eb8f7"},
  {id:"text",label:"Text",icon:"💬",color:"#a78bfa"},
  {id:"email",label:"Email",icon:"✉️",color:"#6ee7b7"},
  {id:"meeting",label:"Meeting",icon:"🤝",color:"#fcd34d"},
  {id:"note",label:"Note",icon:"📝",color:"#94a3b8"},
];

const ContactDetail = ({lead, onClose, onUpdate, toast}) => {
  const [activities, setActivities] = useLS(`activities_${lead.id}`, []);
  const [noteText, setNoteText] = useState("");
  const [actType, setActType] = useState("call");
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({...lead});
  const [followUp, setFollowUp] = useState(lead.followUp||"");
  const [tab, setTab] = useState("activity");
  const [tasks, setTasks] = useLS("tasks",[]);
  const [allPlans] = useLS("action_plans",[]);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskType, setNewTaskType] = useState("Call");
  const [newTaskDate, setNewTaskDate] = useState(new Date().toISOString().slice(0,10));
  const [showApplyPlan, setShowApplyPlan] = useState(false);
  const [applyPlanId, setApplyPlanId] = useState("");
  const [applyPlanStart, setApplyPlanStart] = useState(new Date().toISOString().slice(0,10));
  // Drip campaign enrollment (queues emails into email_queue, fires via GmailSyncWorker)
  const [emailQueue, setEmailQueue] = useLS("email_queue", []);
  const [customCampaigns] = useLS("custom_campaigns", []);
  const [showEnrollCamp, setShowEnrollCamp] = useState(false);
  const [enrollCampId, setEnrollCampId] = useState("");
  const [enrollCampStart, setEnrollCampStart] = useState(new Date().toISOString().slice(0,10));
  // AI Lead Responder — drafts a personalized email reply via Claude, sends via Gmail.
  const [aiDraft, setAiDraft] = useState(null); // null | {busy, subject, body, error, sending}
  const [profile] = useLS("re_profile", { name: "Monica Iskra", brokerage: "", phone: "", email: "" });
  const [agentVoice] = useLS("agent_voice", "");

  const leadTasks = tasks.filter(t=>t.leadId===lead.id).sort((a,b)=>a.completed-b.completed||a.dueDate>b.dueDate?1:-1);
  const openTasks = leadTasks.filter(t=>!t.completed);
  const doneTasks = leadTasks.filter(t=>t.completed);

  const addTask = ()=>{
    if(!newTaskTitle.trim()) return;
    setTasks(p=>[...p,{id:uid(),title:newTaskTitle,type:newTaskType,leadId:lead.id,leadName:lead.name,dueDate:newTaskDate,completed:false,createdAt:now()}]);
    setNewTaskTitle(""); toast.success("Task added");
  };
  const completeTask = id => setTasks(p=>p.map(t=>t.id===id?{...t,completed:true,completedAt:now()}:t));
  const deleteTask = id => setTasks(p=>p.filter(t=>t.id!==id));

  const applyPlan = ()=>{
    const plans = [...BUILT_IN_PLANS,...allPlans];
    const plan = plans.find(p=>p.id===applyPlanId);
    if(!plan) return;
    const start = new Date(applyPlanStart);
    const newTasks = plan.steps.map(step=>{
      const due = new Date(start); due.setDate(due.getDate()+step.day);
      return {id:uid(),title:step.title.replace("[name]",lead.name.split(" ")[0]),type:step.type,leadId:lead.id,leadName:lead.name,dueDate:due.toISOString().slice(0,10),notes:"",actionPlanId:plan.id,actionPlanName:plan.name,completed:false,createdAt:now()};
    });
    setTasks(p=>[...p,...newTasks]);
    setShowApplyPlan(false);
    toast.success(`${newTasks.length} tasks created from "${plan.name}"`);
  };

  // ── ENROLL IN DRIP CAMPAIGN ──────────────────────────────────────────────
  // Multi-channel: campaign steps are typed (email | text | call). Each goes
  // to a different destination:
  //   • email → email_queue (GmailSyncWorker auto-sends what's due)
  //   • text  → tasks (type="Text") so Monica gets a reminder + the SMS body
  //             pre-written; she taps "Send" on mobile (sms: URL) or copies
  //             on desktop. Twilio auto-send is a v2.
  //   • call  → tasks (type="Call") with the talking-points in notes
  const enrollInCampaign = () => {
    const allCamps = [...BUILT_IN_CAMPAIGNS, ...customCampaigns];
    const camp = allCamps.find(c => c.id === enrollCampId);
    if (!camp) return;
    const hasEmailSteps = camp.steps.some(s => (s.type || "email") === "email");
    const hasTextSteps  = camp.steps.some(s => s.type === "text");
    if (hasEmailSteps && !lead.email) return toast.error(`${lead.name} has no email — add one or pick a text-only campaign`);
    if (hasTextSteps && !lead.phone)  return toast.error(`${lead.name} has no phone — add one or pick an email-only campaign`);

    const start = new Date(enrollCampStart);
    const firstName = (lead.name || "").split(" ")[0] || "there";
    const propertyAddr = lead.address || lead.area || "the home you were looking at";
    const neighborhood = lead.area || "your area";
    // Handles both [name] and {firstName} syntax variants used across campaigns
    const personalize = (s) => (s || "")
      .replace(/\[name\]/gi, firstName)
      .replace(/\[firstName\]/gi, firstName)
      .replace(/\{firstName\}/gi, firstName)
      .replace(/\[area\]/gi, neighborhood)
      .replace(/\{area\}/gi, neighborhood)
      .replace(/\[neighborhood\]/gi, neighborhood)
      .replace(/\{neighborhood\}/gi, neighborhood)
      .replace(/\[city\/zip\]/gi, neighborhood)
      .replace(/\{city\/zip\}/gi, neighborhood)
      .replace(/\[address\]/gi, propertyAddr)
      .replace(/\[propertyAddress\]/gi, propertyAddr)
      .replace(/\{propertyAddress\}/gi, propertyAddr);

    let emailCount = 0, textCount = 0, callCount = 0;
    const newEmails = [];
    const newTasks = [];

    camp.steps.forEach((step, i) => {
      const due = new Date(start); due.setDate(due.getDate() + step.day);
      const dueStr = due.toISOString().slice(0, 10);
      const type = step.type || "email";

      if (type === "email") {
        newEmails.push({
          id: uid(),
          leadId: lead.id, leadName: lead.name, leadEmail: lead.email,
          campaignId: camp.id, campaignName: camp.name,
          subject: personalize(step.subject || ""),
          body: personalize(step.body || ""),
          dueDate: dueStr,
          stepIndex: i, sent: false, createdAt: now(),
        });
        emailCount++;
      } else if (type === "text") {
        newTasks.push({
          id: uid(),
          title: `Text ${firstName} — ${camp.name} (step ${i+1})`,
          type: "Text",
          leadId: lead.id, leadName: lead.name,
          dueDate: dueStr,
          notes: personalize(step.body || ""),
          smsBody: personalize(step.body || ""),
          campaignId: camp.id, campaignName: camp.name,
          stepIndex: i, completed: false, createdAt: now(),
        });
        textCount++;
      } else if (type === "call") {
        newTasks.push({
          id: uid(),
          title: `Call ${firstName} — ${step.objective || camp.name + ` (step ${i+1})`}`,
          type: "Call",
          leadId: lead.id, leadName: lead.name,
          dueDate: dueStr,
          notes: personalize(step.body || step.talkingPoints || ""),
          campaignId: camp.id, campaignName: camp.name,
          stepIndex: i, completed: false, createdAt: now(),
        });
        callCount++;
      }
    });

    if (newEmails.length) setEmailQueue(p => [...p, ...newEmails]);
    if (newTasks.length)  setTasks(p => [...p, ...newTasks]);

    const parts = [];
    if (emailCount) parts.push(`${emailCount} email${emailCount===1?"":"s"}`);
    if (textCount)  parts.push(`${textCount} text${textCount===1?"":"s"}`);
    if (callCount)  parts.push(`${callCount} call${callCount===1?"":"s"}`);
    const summary = parts.join(" + ");

    // Activity log
    setActivities(p => [{
      id: uid(), type: "campaign", direction: "outbound",
      note: `📋 Enrolled in "${camp.name}" — ${summary} queued, starting ${enrollCampStart}`,
      createdAt: now(),
    }, ...p]);

    setShowEnrollCamp(false);
    setEnrollCampId("");
    toast.success(`${summary} queued for ${lead.name} — "${camp.name}"`);
  };

  // ── AI LEAD RESPONDER ──────────────────────────────────────────────────────
  // Draft a personalized email reply for this lead via Claude.
  const draftAIResponse = async () => {
    if (!lead.email) return toast.error(`${lead.name} has no email address — add one first`);
    setAiDraft({ busy: true, subject: "", body: "", error: null, sending: false });
    try {
      const firstName = (lead.name || "").split(" ")[0] || "there";
      const recentActivities = activities.slice(0, 5).map(a => `- ${a.type}: ${a.note}`).join("\n");
      const sys = `You are a senior real estate agent's assistant writing the first email reply to a NEW LEAD. The agent is ${profile.name || "Monica Iskra"}${profile.brokerage ? ` at ${profile.brokerage}` : ""}. ${agentVoice ? `Brand voice: ${agentVoice}.` : "Warm, direct, helpful, never pushy or salesy."} Write to a single specific person; never start with generic openers like "Thank you for your interest" — be human.`;
      const prompt = `Draft an email response to this lead.

LEAD DETAILS:
- Name: ${lead.name}
- Email: ${lead.email}
- Source: ${lead.source || "unknown"}
- Type: ${lead.type || "—"}
- Status: ${lead.status || "—"}
- Area: ${lead.area || "—"}
- Budget: ${lead.budget ? `$${Number(lead.budget).toLocaleString()}` : "—"}
- Property they inquired about: ${lead.address || "—"}
- Their message/notes: ${lead.notes || "(none)"}
${recentActivities ? `- Recent activity log:\n${recentActivities}` : ""}

WRITE:
- A short, specific subject line (under 60 chars; NOT "RE: your inquiry")
- A 4-6 sentence body in plain text, no markdown, no signoff variations beyond "${profile.name?.split(" ")[0] || "Monica"}":
  - Open by addressing ${firstName} by first name
  - Reference SPECIFICALLY what they inquired about (address/area/source if known)
  - Provide ONE piece of immediate value (a market insight, a question that helps qualify them, a confirmation you'll send listings, etc.)
  - One soft CTA: ask their best time for a 10-min call, or offer to send 3 hand-picked listings
  - Sign with "${profile.name?.split(" ")[0] || "Monica"}"

Return STRICT JSON only (no markdown fences, no explanation):
{
  "subject": "...",
  "body": "..."
}`;

      const r = await fetch("/api/claude/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: sys,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      const d = await r.json();
      if (d.error) throw new Error(d.error.message || "AI proxy error");
      const text = (d.content?.[0]?.text || "").trim();
      const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
      const parsed = JSON.parse(jsonText);
      setAiDraft({ busy: false, subject: parsed.subject || "", body: parsed.body || "", error: null, sending: false });
    } catch (e) {
      console.error("[AI draft]", e);
      setAiDraft({ busy: false, subject: "", body: "", error: e.message, sending: false });
      toast.error(`AI draft failed: ${e.message}`);
    }
  };

  const sendAIDraft = async () => {
    if (!aiDraft || !aiDraft.subject || !aiDraft.body) return;
    const token = localStorage.getItem("gmail_token");
    const expiry = parseInt(localStorage.getItem("gmail_token_expiry") || "0");
    if (!token || Date.now() > expiry) {
      return toast.error("Connect Gmail in Settings first (Settings → Integrations → Gmail).");
    }
    setAiDraft(d => ({ ...d, sending: true }));
    try {
      const msgId = await gmailSendMessage(token, {
        to: lead.email,
        subject: aiDraft.subject,
        body: aiDraft.body,
        fromName: profile.name || "",
      });
      // Log activity on the lead's timeline
      const entry = {
        id: uid(),
        type: "gmail",
        direction: "outbound",
        subject: aiDraft.subject,
        note: `📤 Sent AI-drafted reply: "${aiDraft.subject}"`,
        gmailId: msgId,
        createdAt: now(),
      };
      setActivities(p => [entry, ...p]);
      setAiDraft(null);
      toast.success("AI reply sent via Gmail — activity logged");
    } catch (e) {
      setAiDraft(d => ({ ...d, sending: false, error: e.message }));
      toast.error(`Send failed: ${e.message}`);
    }
  };

  const logActivity = () => {
    if(!noteText.trim()) return toast.error("Add a note");
    const entry = {id:uid(), type:actType, note:noteText, createdAt:now()};
    setActivities(p=>[entry,...p]);
    setNoteText("");
    toast.success("Activity logged");
  };

  const saveEdit = () => {
    onUpdate({...form, followUp});
    setEditing(false);
    toast.success("Contact updated");
  };

  const statusColors = {"Hot Prospect":"badge-red","Contact":"badge-blue","Buyer":"badge-blue","Seller":"badge-gold","Casually Browsing":"badge-gray","Nurture 3-6 Months":"badge-gold","Nurture 1+ Year":"badge-gold","Buy/Sell Nurture":"badge-gold","Pending":"badge-gold","Past Client":"badge-green","Closed":"badge-green","Trash":"badge-gray"};
  const daysFollowUp = followUp ? Math.ceil((new Date(followUp)-new Date())/(1000*60*60*24)) : null;

  return (
    <div className="lt-detail" style={{position:"fixed",inset:0,zIndex:200,display:"flex"}}>
      <div className="lt-detail-backdrop" style={{flex:1,background:"rgba(0,0,0,.45)",backdropFilter:"blur(4px)"}} onClick={onClose}/>
      <div className="lt-detail-panel" style={{width:520,height:"100vh",overflowY:"auto",display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div className="lt-detail-header" style={{padding:"20px 24px",display:"flex",justifyContent:"space-between",alignItems:"flex-start",position:"sticky",top:0,zIndex:10}}>
          <div>
            <div style={{fontFamily:"'DM Serif Display',serif",fontSize:22,fontWeight:900,color:"#fff"}}>{lead.name}</div>
            <div style={{display:"flex",gap:8,marginTop:6,flexWrap:"wrap"}}>
              <span className={`badge ${statusColors[lead.status]||"badge-gray"}`}>{lead.status}</span>
              <span className="badge badge-gray">{lead.type}</span>
              {lead.source==="fub"&&<span className="badge badge-gray" style={{fontSize:10}}>FUB</span>}
            </div>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={16}/></button>
        </div>

        {/* Follow-up banner */}
        {followUp&&(
          <div style={{padding:"10px 24px",background:daysFollowUp<=0?"rgba(239,68,68,.15)":daysFollowUp<=3?"rgba(212,160,23,.12)":"rgba(26,90,160,.1)",borderBottom:"1px solid rgba(255,255,255,.05)"}}>
            <span style={{fontSize:13,fontWeight:700,color:daysFollowUp<=0?"#f87171":daysFollowUp<=3?"#f0c040":"#7eb8f7"}}>
              📅 Follow-up: {new Date(followUp+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
              {daysFollowUp===0?" — Today!":daysFollowUp<0?` — ${Math.abs(daysFollowUp)}d overdue`:` — in ${daysFollowUp}d`}
            </span>
          </div>
        )}

        <div style={{padding:"0 24px",flex:1}}>
          {/* Contact Info */}
          <div style={{padding:"16px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
            {editing ? (
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                <div className="grid-2" style={{gap:10}}>
                  <div><div className="label">Phone</div><input className="input" value={form.phone||""} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
                  <div><div className="label">Email</div><input className="input" value={form.email||""} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
                  <div><div className="label">Status</div>
                    <select className="select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                      {LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}
                    </select>
                  </div>
                  <div><div className="label">Type</div>
                    <select className="select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                      {["Buyer","Seller","Buyer & Seller","Investor","Renter"].map(t=><option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><div className="label">Budget</div><input className="input" type="number" value={form.budget||""} onChange={e=>setForm(f=>({...f,budget:e.target.value}))}/></div>
                  <div><div className="label">Area</div><input className="input" value={form.area||""} onChange={e=>setForm(f=>({...f,area:e.target.value}))}/></div>
                </div>
                <div><div className="label">Follow-up Date</div><input className="input" type="date" value={followUp} onChange={e=>setFollowUp(e.target.value)}/></div>
                <div style={{display:"flex",gap:8}}>
                  <button className="btn btn-blue btn-sm" onClick={saveEdit}><Save size={12}/>Save</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setEditing(false)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <span style={{fontSize:12,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:".5px"}}>Contact Info</span>
                  <button className="btn btn-ghost btn-xs" onClick={()=>setEditing(true)}><Edit3 size={11}/>Edit</button>
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {lead.phone&&<div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <span style={{fontSize:14}}>📞</span>
                    <a href={`tel:${lead.phone}`} style={{fontSize:14,color:"#7eb8f7",fontWeight:600,textDecoration:"none"}}>{lead.phone}</a>
                  </div>}
                  {lead.email&&<div style={{display:"flex",gap:10,alignItems:"center"}}>
                    <span style={{fontSize:14}}>✉️</span>
                    <a href={`mailto:${lead.email}`} style={{fontSize:14,color:"#7eb8f7",fontWeight:600,textDecoration:"none"}}>{lead.email}</a>
                  </div>}
                  {lead.area&&<div style={{display:"flex",gap:10}}><span style={{fontSize:14}}>📍</span><span style={{fontSize:14,color:"#cbd5e1"}}>{lead.area}</span></div>}
                  {lead.budget&&<div style={{display:"flex",gap:10}}><span style={{fontSize:14}}>💰</span><span style={{fontSize:14,color:"#cbd5e1"}}>{fmtMoney(lead.budget)}</span></div>}
                  <div style={{marginTop:4}}>
                    <div className="label" style={{marginBottom:6}}>Follow-up Date</div>
                    <input className="input" type="date" value={followUp} onChange={e=>{setFollowUp(e.target.value);onUpdate({...lead,followUp:e.target.value});}}/>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* AI Lead Responder */}
          {lead.email && (
            <div style={{padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,padding:"12px 14px",borderRadius:10,background:"linear-gradient(135deg, rgba(167,139,250,.10), rgba(126,184,247,.06))",border:"1px solid rgba(167,139,250,.25)"}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                    <Sparkles size={14} color="#a78bfa"/>
                    <span style={{fontSize:13,fontWeight:800,color:"#fff"}}>AI Lead Responder</span>
                  </div>
                  <div style={{fontSize:11,color:"#94a3b8"}}>Draft a personalized email reply based on this lead's source, status, and notes — send via Gmail in one click.</div>
                </div>
                <button className="btn btn-blue btn-sm" disabled={aiDraft?.busy} onClick={draftAIResponse}>
                  {aiDraft?.busy ? <><Spinner s={11}/>Drafting…</> : <><Wand2 size={11}/>Draft AI Reply</>}
                </button>
              </div>
            </div>
          )}

          {/* AI Draft Modal */}
          {aiDraft && !aiDraft.busy && (
            <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>!aiDraft.sending && setAiDraft(null)}>
              <div style={{background:"#0d1117",borderRadius:16,padding:"22px 24px",maxWidth:580,width:"92%",maxHeight:"90vh",overflowY:"auto",border:"1px solid rgba(255,255,255,.1)"}} onClick={e=>e.stopPropagation()}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}>
                    <Sparkles size={16} color="#a78bfa"/>
                    <span style={{fontSize:15,fontWeight:800,color:"#fff"}}>AI-drafted reply to {lead.name}</span>
                  </div>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>!aiDraft.sending && setAiDraft(null)}><X size={14}/></button>
                </div>
                {aiDraft.error && (
                  <div style={{padding:"10px 12px",background:"rgba(239,68,68,.08)",border:"1px solid rgba(239,68,68,.25)",borderRadius:8,marginBottom:12,fontSize:12,color:"#f87171"}}>⚠ {aiDraft.error}</div>
                )}
                <div style={{marginBottom:12}}>
                  <div className="label" style={{marginBottom:5}}>To</div>
                  <div style={{fontSize:13,color:"#cbd5e1",padding:"8px 10px",background:"rgba(255,255,255,.03)",borderRadius:8,fontFamily:"monospace"}}>{lead.email}</div>
                </div>
                <div style={{marginBottom:12}}>
                  <div className="label" style={{marginBottom:5}}>Subject</div>
                  <input className="input" value={aiDraft.subject} onChange={e=>setAiDraft(d=>({...d,subject:e.target.value}))} disabled={aiDraft.sending}/>
                </div>
                <div style={{marginBottom:14}}>
                  <div className="label" style={{marginBottom:5}}>Body <span style={{fontWeight:500,color:"#475569"}}>(edit anything that doesn't sound like you)</span></div>
                  <textarea className="textarea" style={{minHeight:220,fontFamily:"'DM Sans',sans-serif"}} value={aiDraft.body} onChange={e=>setAiDraft(d=>({...d,body:e.target.value}))} disabled={aiDraft.sending}/>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button className="btn btn-blue" disabled={aiDraft.sending||!aiDraft.subject||!aiDraft.body} onClick={sendAIDraft} style={{flex:1,minWidth:140}}>
                    {aiDraft.sending ? <><Spinner s={12}/>Sending…</> : <><Send size={12}/>Send via Gmail</>}
                  </button>
                  <button className="btn btn-ghost" disabled={aiDraft.sending} onClick={draftAIResponse}><RefreshCw size={12}/>Re-draft</button>
                  <button className="btn btn-ghost" disabled={aiDraft.sending} onClick={()=>setAiDraft(null)}>Cancel</button>
                </div>
                <div style={{fontSize:11,color:"#64748b",marginTop:10,lineHeight:1.5}}>
                  Sends from your Gmail account. Reply goes back to your inbox where the existing Gmail sync logs it on this contact automatically.
                </div>
              </div>
            </div>
          )}

          {/* Tags */}
          <div style={{padding:"12px 0",borderBottom:"1px solid rgba(255,255,255,.06)"}}>
            <div style={{fontSize:11,fontWeight:800,color:"#475569",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Tags</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:8}}>
              {(form.tags||[]).map(tag=>(
                <span key={tag} style={{display:"inline-flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:20,background:"rgba(26,90,160,.2)",border:"1px solid rgba(26,90,160,.3)",fontSize:12,fontWeight:700,color:"#7eb8f7"}}>
                  {tag}
                  <button onClick={()=>{const t=(form.tags||[]).filter(x=>x!==tag);setForm(f=>({...f,tags:t}));onUpdate({...lead,...form,tags:t});}} style={{background:"none",border:"none",color:"#7eb8f7",cursor:"pointer",padding:0,lineHeight:1}}><X size={10}/></button>
                </span>
              ))}
            </div>
            <div style={{display:"flex",gap:6}}>
              <input className="input" placeholder="Add tag (press Enter)..." style={{fontSize:12}} id={`tag-input-${lead.id}`}
                onKeyDown={e=>{
                  if(e.key==="Enter"&&e.target.value.trim()){
                    const tag=e.target.value.trim();
                    const tags=[...(form.tags||[]).filter(x=>x!==tag),tag];
                    setForm(f=>({...f,tags}));
                    onUpdate({...lead,...form,tags});
                    e.target.value="";
                  }
                }}/>
            </div>
          </div>

          {/* Tabs */}
          <div className="tabs" style={{margin:"14px 0 12px"}}>
            <button className={`tab ${tab==="activity"?"active":""}`} onClick={()=>setTab("activity")}>Activity ({activities.length})</button>
            <button className={`tab ${tab==="tasks"?"active":""}`} onClick={()=>setTab("tasks")}>
              Tasks {openTasks.length>0&&<span style={{marginLeft:4,background:"#ef4444",color:"#fff",borderRadius:8,padding:"0 5px",fontSize:10}}>{openTasks.length}</span>}
            </button>
            <button className={`tab ${tab==="notes"?"active":""}`} onClick={()=>setTab("notes")}>Notes</button>
          </div>

          {tab==="activity"&&(
            <>
              {/* Log activity */}
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                  {ACTIVITY_TYPES.map(a=>(
                    <button key={a.id} onClick={()=>setActType(a.id)}
                      style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",border:`2px solid ${actType===a.id?a.color:"rgba(255,255,255,.08)"}`,background:actType===a.id?`${a.color}20`:"transparent",color:actType===a.id?a.color:"#475569"}}>
                      {a.icon} {a.label}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:8}}>
                  <input className="input" placeholder={`Log a ${actType}...`} value={noteText} onChange={e=>setNoteText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&logActivity()}/>
                  <button className="btn btn-blue btn-sm" onClick={logActivity}><Send size={12}/></button>
                </div>
              </div>

              {/* Activity feed */}
              {activities.length===0
                ? <div style={{textAlign:"center",padding:"30px 0",color:"#374151",fontSize:13}}>No activity yet — log your first interaction above</div>
                : <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {activities.map(a=>{
                    const t = a.type==='gmail'
                      ? {id:'gmail',label:'Gmail',icon:'📧',color:'#ea4335'}
                      : (ACTIVITY_TYPES.find(x=>x.id===a.type)||ACTIVITY_TYPES[4]);
                    return (
                      <div key={a.id} style={{display:"flex",gap:10,padding:"10px 12px",background:"rgba(255,255,255,.03)",borderRadius:10,border:"1px solid rgba(255,255,255,.05)"}}>
                        <span style={{fontSize:16,flexShrink:0}}>{t.icon}</span>
                        <div style={{flex:1}}>
                          <div style={{fontSize:13,color:"#fff",fontWeight:600}}>{a.note}</div>
                          <div style={{fontSize:11,color:"#475569",marginTop:3}}>{t.label} · {fmt(a.createdAt)}</div>
                        </div>
                        <button style={{background:"none",border:"none",color:"#374151",cursor:"pointer",padding:2}} onClick={()=>setActivities(p=>p.filter(x=>x.id!==a.id))}><X size={12}/></button>
                      </div>
                    );
                  })}
                </div>
              }
            </>
          )}

          {tab==="tasks"&&(
            <div style={{paddingBottom:20}}>
              {/* Apply Action Plan + Enroll in Drip Campaign — side by side */}
              <div style={{display:"flex",gap:8,marginBottom:14}}>
                {!showApplyPlan && !showEnrollCamp && (
                  <>
                    <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>setShowApplyPlan(true)}><Zap size={12}/>Apply Action Plan</button>
                    <button className="btn btn-ghost btn-sm" style={{flex:1}} onClick={()=>{
                      if(!lead.email){toast.error(`${lead.name} has no email — add one first`);return;}
                      setShowEnrollCamp(true);
                    }}><Mail size={12}/>Enroll in Drip Campaign</button>
                  </>
                )}
                {showApplyPlan && (
                  <div style={{background:"rgba(26,90,160,.1)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(26,90,160,.2)",flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#7eb8f7",marginBottom:10}}>Apply Action Plan to {lead.name.split(" ")[0]}</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <select className="select" value={applyPlanId} onChange={e=>setApplyPlanId(e.target.value)}>
                        <option value="">Choose a plan...</option>
                        {[...BUILT_IN_PLANS,...allPlans].map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                      <div>
                        <div className="label">Start Date</div>
                        <input className="input" type="date" value={applyPlanStart} onChange={e=>setApplyPlanStart(e.target.value)}/>
                      </div>
                      {applyPlanId&&(
                        <div style={{fontSize:11,color:"#64748b"}}>
                          Will create {[...BUILT_IN_PLANS,...allPlans].find(p=>p.id===applyPlanId)?.steps.length||0} tasks
                        </div>
                      )}
                      <div style={{display:"flex",gap:8}}>
                        <button className="btn btn-blue btn-sm" disabled={!applyPlanId} onClick={applyPlan}><CheckCircle size={12}/>Apply Plan</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>setShowApplyPlan(false)}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
                {showEnrollCamp && (
                  <div style={{background:"rgba(201,154,44,.10)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(201,154,44,.30)",flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:"#C99A2C",marginBottom:10}}>Enroll {lead.name.split(" ")[0]} in Drip Campaign</div>
                    <div style={{display:"flex",flexDirection:"column",gap:8}}>
                      <select className="select" value={enrollCampId} onChange={e=>setEnrollCampId(e.target.value)}>
                        <option value="">Choose a campaign...</option>
                        {[...BUILT_IN_CAMPAIGNS, ...customCampaigns].map(c => {
                          const counts = (c.steps||[]).reduce((acc,s)=>{const t=s.type||"email";acc[t]=(acc[t]||0)+1;return acc;},{});
                          const breakdown = [counts.email&&`${counts.email}✉`, counts.text&&`${counts.text}📱`, counts.call&&`${counts.call}📞`].filter(Boolean).join(" ");
                          return <option key={c.id} value={c.id}>{c.name} — {breakdown}</option>;
                        })}
                      </select>
                      <div>
                        <div className="label">Start Date (first touch goes out this day)</div>
                        <input className="input" type="date" value={enrollCampStart} onChange={e=>setEnrollCampStart(e.target.value)}/>
                      </div>
                      {enrollCampId && (() => {
                        const c = [...BUILT_IN_CAMPAIGNS,...customCampaigns].find(x=>x.id===enrollCampId);
                        if (!c) return null;
                        const counts = (c.steps||[]).reduce((acc,s)=>{const t=s.type||"email";acc[t]=(acc[t]||0)+1;return acc;},{});
                        const last = c.steps?.[c.steps.length-1];
                        const parts = [];
                        if (counts.email) parts.push(`${counts.email} email${counts.email===1?"":"s"}`);
                        if (counts.text)  parts.push(`${counts.text} text${counts.text===1?"":"s"}`);
                        if (counts.call)  parts.push(`${counts.call} call${counts.call===1?"":"s"}`);
                        return (
                          <div style={{fontSize:11,color:"#64748b",lineHeight:1.5}}>
                            {c.description}<br/>
                            <strong>{parts.join(" + ")}</strong> over {last?.day||0} day{last?.day===1?"":"s"}. Texts/calls become tasks (with one-tap Send button on mobile). Emails auto-send via Gmail if Auto-Send is on.
                          </div>
                        );
                      })()}
                      <div style={{display:"flex",gap:8}}>
                        <button className="btn btn-blue btn-sm" disabled={!enrollCampId} onClick={enrollInCampaign}><Mail size={12}/>Enroll & Queue</button>
                        <button className="btn btn-ghost btn-sm" onClick={()=>{setShowEnrollCamp(false);setEnrollCampId("");}}>Cancel</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Active campaigns this lead is enrolled in (emails + tasks combined) */}
              {(() => {
                const grouped = {};
                emailQueue.filter(e => e.leadId === lead.id && e.campaignId).forEach(e => {
                  const g = grouped[e.campaignId] = grouped[e.campaignId] || {name:e.campaignName, emailDone:0, emailPending:0, taskDone:0, taskPending:0, next:null};
                  if (e.sent) g.emailDone++; else {
                    g.emailPending++;
                    if (!g.next || e.dueDate < g.next) g.next = e.dueDate;
                  }
                });
                tasks.filter(t => t.leadId === lead.id && t.campaignId).forEach(t => {
                  const g = grouped[t.campaignId] = grouped[t.campaignId] || {name:t.campaignName, emailDone:0, emailPending:0, taskDone:0, taskPending:0, next:null};
                  if (t.completed) g.taskDone++; else {
                    g.taskPending++;
                    if (!g.next || t.dueDate < g.next) g.next = t.dueDate;
                  }
                });
                const list = Object.entries(grouped);
                if (list.length === 0) return null;
                return (
                  <div style={{marginBottom:14,padding:"10px 14px",background:"rgba(201,154,44,.06)",border:"1px solid rgba(201,154,44,.2)",borderRadius:10}}>
                    <div style={{fontSize:11,fontWeight:800,letterSpacing:".5px",textTransform:"uppercase",color:"#C99A2C",marginBottom:8}}>Active Drip Campaigns</div>
                    {list.map(([id,c]) => {
                      const done = c.emailDone + c.taskDone;
                      const pending = c.emailPending + c.taskPending;
                      const parts = [];
                      if (c.emailDone || c.emailPending) parts.push(`✉ ${c.emailDone}/${c.emailDone + c.emailPending}`);
                      if (c.taskDone || c.taskPending)   parts.push(`📱📞 ${c.taskDone}/${c.taskDone + c.taskPending}`);
                      return (
                        <div key={id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:12,padding:"4px 0"}}>
                          <div>
                            <div style={{fontWeight:700}}>{c.name}</div>
                            <div style={{fontSize:11,opacity:.7}}>{parts.join(" · ")} · {pending} pending{c.next?` · next ${c.next}`:""}</div>
                          </div>
                          <button className="btn btn-ghost btn-xs" onClick={()=>{
                            if(!window.confirm(`Stop the "${c.name}" drip for ${lead.name}? Pending emails and tasks will be removed.`)) return;
                            setEmailQueue(p => p.filter(e => !(e.leadId === lead.id && e.campaignId === id && !e.sent)));
                            setTasks(p => p.filter(t => !(t.leadId === lead.id && t.campaignId === id && !t.completed)));
                            toast.info("Stopped — pending emails and tasks removed");
                          }}><X size={11}/>Stop</button>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* Add Task */}
              <div style={{marginBottom:16,background:"rgba(255,255,255,.03)",borderRadius:10,padding:"12px 14px",border:"1px solid rgba(255,255,255,.06)"}}>
                <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                  {TASK_TYPES.map(t=>(
                    <button key={t} onClick={()=>setNewTaskType(t)}
                      style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,cursor:"pointer",border:`1px solid ${newTaskType===t?TASK_COLORS[t]:"rgba(255,255,255,.1)"}`,background:newTaskType===t?`${TASK_COLORS[t]}20`:"transparent",color:newTaskType===t?TASK_COLORS[t]:"#475569"}}>
                      {TASK_ICONS[t]} {t}
                    </button>
                  ))}
                </div>
                <div style={{display:"flex",gap:6,marginBottom:6}}>
                  <input className="input" style={{flex:1,fontSize:12}} placeholder="Task description..." value={newTaskTitle} onChange={e=>setNewTaskTitle(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()}/>
                  <input className="input" type="date" style={{width:140,fontSize:12}} value={newTaskDate} onChange={e=>setNewTaskDate(e.target.value)}/>
                  <button className="btn btn-blue btn-sm" onClick={addTask}><Plus size={12}/></button>
                </div>
              </div>

              {/* Task list */}
              {openTasks.length===0&&doneTasks.length===0?(
                <div style={{textAlign:"center",padding:"20px 0",color:"#374151",fontSize:13}}>No tasks yet — add one above or apply an action plan</div>
              ):(
                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {openTasks.map(t=>(
                    <div key={t.id} style={{display:"flex",gap:8,alignItems:"center",padding:"9px 12px",background:"rgba(255,255,255,.03)",borderRadius:9,border:"1px solid rgba(255,255,255,.06)",borderLeft:`3px solid ${TASK_COLORS[t.type]||"#475569"}`}}>
                      <span style={{fontSize:14}}>{TASK_ICONS[t.type]||"✅"}</span>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#fff"}}>{t.title}</div>
                        <div style={{fontSize:11,color: t.dueDate<new Date().toISOString().slice(0,10)?"#f87171":"#64748b"}}>{t.dueDate=== new Date().toISOString().slice(0,10)?"Today":new Date(t.dueDate+"T12:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}{t.actionPlanName&&` · ${t.actionPlanName}`}</div>
                      </div>
                      <button className="btn btn-ghost btn-xs" onClick={()=>completeTask(t.id)}><Check size={11}/>Done</button>
                      <button style={{background:"none",border:"none",cursor:"pointer",color:"#374151",padding:2}} onClick={()=>deleteTask(t.id)}><X size={11}/></button>
                    </div>
                  ))}
                  {doneTasks.length>0&&<div style={{fontSize:11,fontWeight:700,color:"#374151",marginTop:8,textTransform:"uppercase",letterSpacing:".5px"}}>Completed ({doneTasks.length})</div>}
                  {doneTasks.slice(0,3).map(t=>(
                    <div key={t.id} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",background:"rgba(255,255,255,.02)",borderRadius:9,opacity:.5}}>
                      <Check size={12} color="#10b981"/>
                      <div style={{flex:1,fontSize:12,color:"#475569",textDecoration:"line-through"}}>{t.title}</div>
                      <button style={{background:"none",border:"none",cursor:"pointer",color:"#374151",padding:2}} onClick={()=>deleteTask(t.id)}><X size={11}/></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab==="notes"&&(
            <div>
              <div className="label" style={{marginBottom:8}}>General Notes</div>
              <textarea className="textarea" style={{minHeight:180}} placeholder="Anything about this contact — preferences, timeline, how you met..." value={form.notes||""} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/>
              <button className="btn btn-blue btn-sm" style={{marginTop:10}} onClick={saveEdit}><Save size={12}/>Save Notes</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── QUICK CALL LOG ───────────────────────────────────────────────────────────
const QuickCallLog = ({lead, onClose, onSave, toast}) => {
  const [outcome,setOutcome] = useState("");
  const [notes,setNotes] = useState("");
  const [followUpDate,setFollowUpDate] = useState("");
  const [activities,setActivities] = useLS(`activities_${lead.id}`,[]);

  const suggestFollowUp = (outcomeId) => {
    const o = CALL_OUTCOMES.find(x=>x.id===outcomeId);
    if(o?.followUpDays!=null) {
      const d = new Date(); d.setDate(d.getDate()+o.followUpDays);
      setFollowUpDate(d.toISOString().slice(0,10));
    } else {
      setFollowUpDate("");
    }
  };

  const save = () => {
    if(!outcome) { toast.error("Select an outcome"); return; }
    const o = CALL_OUTCOMES.find(x=>x.id===outcome);
    const entry = {
      id: uid(), type:"call",
      note: `${o.label}${notes?` — ${notes}`:""}`,
      outcome, createdAt: now()
    };
    setActivities(p=>[entry,...p]);
    toast.success(`Call logged: ${o.label}`);
    onSave(lead.id, followUpDate||null);
  };

  return (
    <div style={{position:"fixed",inset:0,zIndex:250,background:"rgba(0,0,0,.65)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div style={{background:"#0d1117",borderRadius:16,padding:"22px 26px",width:400,border:"1px solid rgba(255,255,255,.1)",boxShadow:"0 20px 60px rgba(0,0,0,.6)"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>📞 Log Call</div>
            <div style={{fontSize:12,color:"#64748b",marginTop:2}}>{lead.name} {lead.phone&&`· ${lead.phone}`}</div>
          </div>
          <button style={{background:"none",border:"none",cursor:"pointer",color:"#475569"}} onClick={onClose}><X size={16}/></button>
        </div>

        <div style={{marginBottom:14}}>
          <div className="label" style={{marginBottom:8}}>Outcome</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {CALL_OUTCOMES.map(o=>(
              <button key={o.id} onClick={()=>{setOutcome(o.id);suggestFollowUp(o.id);}}
                style={{padding:"9px 14px",borderRadius:9,textAlign:"left",fontSize:13,fontWeight:700,cursor:"pointer",border:`1.5px solid ${outcome===o.id?o.color:"rgba(255,255,255,.08)"}`,background:outcome===o.id?`${o.color}18`:"rgba(255,255,255,.03)",color:outcome===o.id?o.color:"#94a3b8",transition:"all .1s"}}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{marginBottom:14}}>
          <div className="label" style={{marginBottom:6}}>Notes (optional)</div>
          <textarea className="input" rows={2} style={{resize:"none"}} placeholder="What did they say? Next steps?" value={notes} onChange={e=>setNotes(e.target.value)}/>
        </div>

        {followUpDate&&(
          <div style={{marginBottom:14}}>
            <div className="label" style={{marginBottom:6}}>Follow-up Date</div>
            <input className="input" type="date" value={followUpDate} onChange={e=>setFollowUpDate(e.target.value)}/>
            <div style={{fontSize:11,color:"#64748b",marginTop:4}}>Auto-set based on outcome — adjust as needed</div>
          </div>
        )}

        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-blue" style={{flex:1}} onClick={save}><Phone size={13}/>Save Call Log</button>
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
};

// ─── LEAD TRACKER ─────────────────────────────────────────────────────────────
const LeadTracker = ({setPage,toast}) => {
  const [leads,setLeads,leadsLoaded] = useLeadsCloud();
  const [filterStatus,setFilterStatus] = useState("all");
  const [filterType,setFilterType] = useState("all");
  const [form,setForm] = useState({name:"",email:"",phone:"",type:"Buyer",status:"warm",budget:"",area:"",notes:""});
  const [editId,setEditId] = useState(null);
  const [showForm,setShowForm] = useState(false);
  const [search,setSearch] = useState("");
  const [syncing,setSyncing] = useState(false);
  const [lastSync,setLastSync] = useLS("fub_last_sync", null);
  const [selectedLead, setSelectedLead] = useState(null);
  const [filterTag, setFilterTag] = useState("all");
  const [smartLists, setSmartLists] = useLS("smart_lists", []);
  const [showSaveList, setShowSaveList] = useState(false);
  const [listName, setListName] = useState("");
  // Bulk select
  const [selected,setSelected] = useState([]);
  const [bulkPanel,setBulkPanel] = useState(null); // null | "status" | "tag" | "plan"
  const [bulkValue,setBulkValue] = useState("");
  const [tasks,setTasks] = useLS("tasks",[]);
  const [customPlans] = useLS("action_plans",[]);
  // Quick call log
  const [callLogLead,setCallLogLead] = useState(null);
  // Limit rendered leads to keep the page snappy with large FUB sync (5k+ leads).
  // Reset when filter/search changes.
  const [renderLimit, setRenderLimit] = useState(100);

  const allTags = useMemo(() => [...new Set(leads.flatMap(l=>l.tags||[]))].sort(), [leads]);

  const BUILT_IN_LISTS = [
    {name:"Hot Prospects", filters:{status:"Hot Prospect",     type:"all",    tag:"all"}},
    {name:"Hot Buyers",    filters:{status:"Buyer",            type:"Buyer",  tag:"all"}},
    {name:"Sellers",       filters:{status:"Seller",           type:"Seller", tag:"all"}},
    {name:"Nurture",       filters:{status:"Nurture 3-6 Months",type:"all",   tag:"all"}},
    {name:"Pending",       filters:{status:"Pending",          type:"all",    tag:"all"}},
    {name:"Past Clients",  filters:{status:"Past Client",type:"all", tag:"all"}},
    {name:"Follow-up Due", filters:{status:"all",     type:"all",    tag:"all", followUpDue:true}},
  ];

  const applyList = (list) => {
    setFilterStatus(list.filters.status||"all");
    setFilterType(list.filters.type||"all");
    setFilterTag(list.filters.tag||"all");
    if(list.filters.followUpDue) setSearch("__followup__");
    else setSearch("");
  };

  const saveList = () => {
    if(!listName.trim()) return toast.error("Enter a name");
    setSmartLists(p=>[...p,{id:uid(),name:listName,filters:{status:filterStatus,type:filterType,tag:filterTag}}]);
    setListName(""); setShowSaveList(false);
    toast.success(`Smart list "${listName}" saved`);
  };

  const syncFUB = async (silent=false) => {
    setSyncing(true);
    try {
      // Pull the FUB key the user entered on the Integrations page so the
      // proxy can attach it as the Authorization header. Falls back to the
      // build-time env var if present.
      const fubKey = (JSON.parse(localStorage.getItem("integrations")||"{}")?.fub?.apiKey)
                  || process.env.REACT_APP_FUB_API_KEY
                  || "";
      if(!fubKey) {
        if(!silent) toast.error("No FUB API key — add it in Integrations → Follow Up Boss");
        setSyncing(false);
        return;
      }
      const fetchOpts = { headers: { "x-fub-key": fubKey } };
      let all = [], next = "/api/fub/people?limit=100";
      while(next) {
        const res = await fetch(next, fetchOpts);
        if(!res.ok) {
          const errText = await res.text();
          throw new Error(`FUB ${res.status}: ${errText.slice(0,200)}`);
        }
        const data = await res.json();
        all = all.concat(data.people || []);
        const nl = data._metadata?.nextLink;
        next = nl ? nl.replace("https://api.followupboss.com/v1", "/api/fub") : null;
      }
      if(all.length === 0) {
        if(!silent) toast.info("FUB returned 0 contacts — existing leads kept");
        setSyncing(false);
        return;
      }
      const fubLeads = all.map(fubToLead);
      try {
        setLeads(prev => {
          const manualLeads = prev.filter(l => !l.fubId);
          return [...fubLeads, ...manualLeads];
        });
        setLastSync(Date.now());
        if(!silent) toast.success(`Synced ${fubLeads.length} contacts from Follow Up Boss`);
      } catch(storageErr) {
        const trimmed = fubLeads.filter(l => l.status !== "Trash");
        setLeads(prev => [...trimmed, ...prev.filter(l => !l.fubId)]);
        setLastSync(Date.now());
        if(!silent) toast.success(`Synced ${trimmed.length} active contacts`);
      }
    } catch(e) {
      if(!silent) toast.error(`Sync failed: ${e.message}`);
      console.error(e);
    }
    setSyncing(false);
  };

  // Auto-sync FUB on mount, every 10 min, and when the tab regains focus.
  // Silent (no toast) — runs in background. Debounced to once per minute so
  // bouncing between sidebar pages doesn't hammer the API.
  useEffect(() => {
    let lastFireAt = 0;
    const maybeSync = () => {
      if (Date.now() - lastFireAt < 60000) return;
      lastFireAt = Date.now();
      syncFUB(true);
    };
    maybeSync();
    const interval = setInterval(maybeSync, 10 * 60 * 1000);
    window.addEventListener('focus', maybeSync);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', maybeSync);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  const today = new Date().toISOString().slice(0,10);
  // Memoize filtered list so form-keystroke re-renders don't re-walk all leads.
  // For 5000+ FUB leads this is the difference between freeze and snappy.
  const filtered = useMemo(() => {
    const searchLower = search ? search.toLowerCase() : "";
    return leads.filter(l=>{
      const matchStatus = filterStatus==="all"||l.status===filterStatus;
      const matchType = filterType==="all"||l.type===filterType;
      const matchTag = filterTag==="all"||(l.tags||[]).includes(filterTag);
      const matchFollowUp = search!=="__followup__"||(l.followUp&&l.followUp<=today);
      const matchSearch = search==="__followup__"||!search||l.name?.toLowerCase().includes(searchLower)||l.email?.toLowerCase().includes(searchLower)||l.area?.toLowerCase().includes(searchLower);
      return matchStatus&&matchType&&matchTag&&matchFollowUp&&matchSearch;
    });
  }, [leads, filterStatus, filterType, filterTag, search, today]);

  // Reset pagination when filters change
  useEffect(() => { setRenderLimit(100); }, [filterStatus, filterType, filterTag, search]);

  // Memoize per-status counts so the filter-tab row doesn't re-walk leads
  // 13 times on every keystroke
  const statusCounts = useMemo(() => {
    const counts = { all: leads.length };
    LEAD_STATUSES.forEach(s => { counts[s] = 0; });
    leads.forEach(l => { if (counts[l.status] !== undefined) counts[l.status]++; });
    return counts;
  }, [leads]);

  const save = () => {
    if(!form.name.trim()) return toast.error("Name is required");
    if(editId){
      setLeads(p=>p.map(x=>x.id===editId?{...x,...form}:x));
      toast.success("Lead updated!"); setEditId(null);
    } else {
      setLeads(p=>[{id:uid(),...form,createdAt:now()},...p]);
      toast.success("Lead added!");
    }
    setForm({name:"",email:"",phone:"",type:"Buyer",status:"warm",budget:"",area:"",notes:""});
    setShowForm(false);
  };

  const del = id => { setLeads(p=>p.filter(x=>x.id!==id)); toast.success("Lead removed"); };
  const statusColors = {"Hot Prospect":"badge-red","Contact":"badge-blue","Buyer":"badge-blue","Seller":"badge-gold","Casually Browsing":"badge-gray","Nurture 3-6 Months":"badge-gold","Nurture 1+ Year":"badge-gold","Buy/Sell Nurture":"badge-gold","Pending":"badge-gold","Past Client":"badge-green","Closed":"badge-green","Trash":"badge-gray"};
  const statusBorderCls = {"Hot Prospect":"lead-status-hot","Contact":"lead-status-warm","Buyer":"lead-status-warm","Seller":"lead-status-warm","Casually Browsing":"lead-status-cold","Nurture 3-6 Months":"lead-status-cold","Nurture 1+ Year":"lead-status-cold","Buy/Sell Nurture":"lead-status-cold","Pending":"lead-status-warm","Past Client":"lead-status-closed","Closed":"lead-status-closed","Trash":""};

  // ── Bulk actions ──────────────────────────────────────────────────────────
  const toggleSelect = id => setSelected(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const selectAll = () => setSelected(filtered.map(l=>l.id));
  const clearSel = () => { setSelected([]); setBulkPanel(null); setBulkValue(""); };

  const bulkChangeStatus = () => {
    if(!bulkValue) return;
    setLeads(p=>p.map(l=>selected.includes(l.id)?{...l,status:bulkValue}:l));
    toast.success(`Updated ${selected.length} leads to "${bulkValue}"`); clearSel();
  };
  const bulkAddTag = () => {
    if(!bulkValue.trim()) return;
    setLeads(p=>p.map(l=>selected.includes(l.id)?{...l,tags:[...(l.tags||[]).filter(t=>t!==bulkValue),bulkValue]}:l));
    toast.success(`Tagged ${selected.length} leads with "${bulkValue}"`); clearSel();
  };
  const bulkApplyPlan = () => {
    if(!bulkValue) return;
    const allPlans = [...BUILT_IN_PLANS,...customPlans];
    const plan = allPlans.find(p=>p.id===bulkValue);
    if(!plan) return;
    const start = new Date();
    const newTasks = [];
    selected.forEach(lid=>{
      const lead = leads.find(l=>l.id===lid);
      if(!lead) return;
      plan.steps.forEach(step=>{
        const due = new Date(start); due.setDate(due.getDate()+step.day);
        newTasks.push({id:uid(),title:step.title.replace("[name]",lead.name.split(" ")[0]),type:step.type,leadId:lead.id,leadName:lead.name,dueDate:due.toISOString().slice(0,10),actionPlanId:plan.id,actionPlanName:plan.name,completed:false,createdAt:now()});
      });
    });
    setTasks(p=>[...p,...newTasks]);
    toast.success(`${newTasks.length} tasks created for ${selected.length} leads`); clearSel();
  };
  const bulkDelete = () => {
    if(!window.confirm(`Delete ${selected.length} leads? This cannot be undone.`)) return;
    setLeads(p=>p.filter(l=>!selected.includes(l.id)));
    toast.success(`Deleted ${selected.length} leads`); clearSel();
  };
  const bulkExport = () => {
    const rows = leads.filter(l=>selected.includes(l.id));
    const csv = ["Name,Email,Phone,Status,Type,Budget,Area,Source,Tags,Created"]
      .concat(rows.map(l=>[l.name,l.email,l.phone,l.status,l.type,l.budget,l.area,l.source,(l.tags||[]).join(";"),l.createdAt].map(v=>`"${(v||"").toString().replace(/"/g,'""')}"`).join(","))).join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv;charset=utf-8,"+encodeURIComponent(csv); a.download = "leads-export.csv"; a.click();
    toast.success(`Exported ${rows.length} leads`); clearSel();
  };

  return (
    <div className="page-content lead-tracker-v2">
      <style>{`
        @import url('https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800,900&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .lead-tracker-v2 {
          background: linear-gradient(180deg, #FAF6EE 0%, #F0E7D2 100%);
          margin: -28px -32px;
          padding: 32px 36px 60px;
          min-height: 100vh;
          position: relative;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        /* Only override the elements that reset font in their UA stylesheet */
        .lead-tracker-v2 input,
        .lead-tracker-v2 textarea,
        .lead-tracker-v2 select,
        .lead-tracker-v2 button { font-family: inherit; }
        .lead-tracker-v2 .page-title,
        .lead-tracker-v2 [style*="DM Serif Display"],
        .lead-tracker-v2 .empty-state h3 {
          font-family: 'Cabinet Grotesk', 'Inter', sans-serif !important;
          font-weight: 800 !important;
          letter-spacing: -.025em !important;
        }

        /* Smart-list label + pills */
        .lead-tracker-v2 .lt-smart-label {
          font-size: 11px;
          font-weight: 700;
          color: #6B5D4B;
          text-transform: uppercase;
          letter-spacing: 1.2px;
          margin-right: 6px;
        }
        .lead-tracker-v2 .lt-smart-pill {
          padding: 6px 14px;
          border-radius: 99px;
          font-size: 12.5px;
          font-weight: 600;
          cursor: pointer;
          border: 1px solid rgba(63,53,40,.15);
          background: #FFFFFF;
          color: #2C2418;
          transition: all .15s;
          font-family: 'Inter', sans-serif;
        }
        .lead-tracker-v2 .lt-smart-pill:hover {
          background: #FFF9EC;
          border-color: #C99A2C;
          color: #2C2418;
          transform: translateY(-1px);
        }
        .lead-tracker-v2 .lt-smart-pill-dashed {
          background: transparent;
          border: 1px dashed rgba(63,53,40,.3);
          color: #6B5D4B;
        }
        .lead-tracker-v2 .lt-smart-pill-dashed:hover {
          background: rgba(255,255,255,.5);
          color: #2C2418;
        }
        .lead-tracker-v2 .lt-smart-x {
          margin-left: 6px;
          opacity: .5;
          font-size: 14px;
        }
        .lead-tracker-v2 .lt-smart-x:hover { opacity: 1; color: #DC2626; }

        .lead-tracker-v2::before {
          content: '';
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 50% 30% at 90% 0%, rgba(201,154,44,.10) 0%, transparent 60%),
            radial-gradient(ellipse 40% 25% at 0% 100%, rgba(26,90,160,.06) 0%, transparent 60%);
          pointer-events: none;
          z-index: 0;
        }
        .lead-tracker-v2 > * { position: relative; z-index: 1; }

        /* Typography reset — make most text dark on light bg */
        .lead-tracker-v2, .lead-tracker-v2 div, .lead-tracker-v2 span,
        .lead-tracker-v2 h1, .lead-tracker-v2 h2, .lead-tracker-v2 h3,
        .lead-tracker-v2 p, .lead-tracker-v2 button, .lead-tracker-v2 label {
          color: #3F3528;
        }

        /* Page header text overrides */
        .lead-tracker-v2 .page-title { color: #2C2418 !important; font-size: 30px; letter-spacing: -.5px; }
        .lead-tracker-v2 .page-sub { color: #8B7A5F !important; font-size: 13px; }
        .lead-tracker-v2 .btn-back {
          background: rgba(255,255,255,.7) !important;
          border: 1px solid rgba(26,90,160,.18) !important;
          color: #2C2418 !important;
        }
        .lead-tracker-v2 .btn-back:hover { background: #fff !important; }

        /* Cards — cream paper with soft warm shadow */
        .lead-tracker-v2 .glass-card,
        .lead-tracker-v2 .lead-card {
          background: #FFFFFF !important;
          border: 1px solid rgba(26,90,160,.10) !important;
          box-shadow: 0 2px 14px rgba(26,90,160,.06), 0 1px 3px rgba(0,0,0,.04) !important;
          border-radius: 14px !important;
          backdrop-filter: none !important;
          padding: 18px 20px;
        }
        .lead-tracker-v2 .lead-card { padding: 16px 20px; transition: transform .15s, box-shadow .15s; }
        .lead-tracker-v2 .lead-card:hover {
          transform: translateY(-1px);
          box-shadow: 0 8px 24px rgba(26,90,160,.14), 0 2px 6px rgba(0,0,0,.06) !important;
        }
        .lead-tracker-v2 .lead-card.lead-status-hot { border-left: 4px solid #DC2626 !important; }
        .lead-tracker-v2 .lead-card.lead-status-warm { border-left: 4px solid #1A5AA0 !important; }
        .lead-tracker-v2 .lead-card.lead-status-cold { border-left: 4px solid #D97706 !important; }
        .lead-tracker-v2 .lead-card.lead-status-closed { border-left: 4px solid #16A34A !important; }

        /* Lead name (the DM Serif inline style is dark grey on dark bg) — force dark text */
        .lead-tracker-v2 .lead-card [style*="DM Serif Display"] {
          color: #2C2418 !important;
          font-size: 18px !important;
        }

        /* Status badges — vibrant solid pills */
        .lead-tracker-v2 .badge {
          padding: 5px 11px !important;
          border-radius: 99px !important;
          font-size: 10.5px !important;
          font-weight: 800 !important;
          letter-spacing: .3px !important;
          text-transform: uppercase !important;
          color: #fff !important;
          display: inline-flex;
          align-items: center;
          line-height: 1;
        }
        .lead-tracker-v2 .badge-red { background: #DC2626 !important; }
        .lead-tracker-v2 .badge-blue { background: #1A5AA0 !important; }
        .lead-tracker-v2 .badge-gold { background: #C99A2C !important; }
        .lead-tracker-v2 .badge-green { background: #16A34A !important; }
        .lead-tracker-v2 .badge-gray { background: #6B7280 !important; }

        /* Inputs / selects — bright white on cream */
        .lead-tracker-v2 .input,
        .lead-tracker-v2 .select {
          background: #FFFFFF !important;
          border: 1.5px solid rgba(26,90,160,.18) !important;
          color: #2C2418 !important;
          font-weight: 600 !important;
        }
        .lead-tracker-v2 .input::placeholder { color: #98A2B5 !important; opacity: 1 !important; }
        .lead-tracker-v2 .input:focus,
        .lead-tracker-v2 .select:focus {
          border-color: #1A5AA0 !important;
          box-shadow: 0 0 0 3px rgba(26,90,160,.15) !important;
          outline: none !important;
        }
        .lead-tracker-v2 .label {
          color: #6B5D4B !important;
          font-weight: 700 !important;
          font-size: 11px !important;
          letter-spacing: .3px !important;
          text-transform: uppercase !important;
        }

        /* Buttons */
        .lead-tracker-v2 .btn-ghost {
          background: rgba(255,255,255,.85) !important;
          color: #2C2418 !important;
          border: 1px solid rgba(26,90,160,.18) !important;
          font-weight: 700 !important;
        }
        .lead-tracker-v2 .btn-ghost:hover { background: #fff !important; border-color: rgba(26,90,160,.35) !important; }
        .lead-tracker-v2 .btn-blue {
          background: linear-gradient(135deg,#1A5AA0,#2D7DD2) !important;
          color: #fff !important;
          font-weight: 700 !important;
          box-shadow: 0 3px 12px rgba(26,90,160,.32) !important;
        }
        .lead-tracker-v2 .btn-blue:hover { box-shadow: 0 6px 20px rgba(26,90,160,.45) !important; transform: translateY(-1px); }
        .lead-tracker-v2 .btn-danger {
          background: rgba(220,38,38,.08) !important;
          color: #DC2626 !important;
          border: 1px solid rgba(220,38,38,.22) !important;
        }
        .lead-tracker-v2 .btn-danger:hover { background: rgba(220,38,38,.15) !important; }

        /* Empty state */
        .lead-tracker-v2 .empty-state { color: #8B7A5F !important; padding: 50px 24px !important; }
        .lead-tracker-v2 .empty-state h3 { color: #2C2418 !important; font-size: 17px !important; }
        .lead-tracker-v2 .empty-state p { color: #8B7A5F !important; }
        .lead-tracker-v2 .empty-state svg { color: #C99A2C !important; opacity: .7; }

        /* Smart-list pill buttons (inline-styled) — apply via attribute is fragile,
           so we target buttons with rounded-pill geometry via known wrappers */
        .lead-tracker-v2 button[style*="borderRadius"][style*="99"] {
          background: rgba(255,255,255,.85) !important;
          color: #2C2418 !important;
          border: 1px solid rgba(26,90,160,.18) !important;
          font-weight: 700 !important;
        }

        /* Tag pills inside lead cards */
        .lead-tracker-v2 .lead-card div[style*="rgba(26,90,160,.15)"] {
          background: rgba(26,90,160,.10) !important;
          color: #1A5AA0 !important;
        }

        /* Checkbox accent */
        .lead-tracker-v2 input[type="checkbox"] { accent-color: #1A5AA0; }

        /* Secondary text (FUB badge, last synced, meta lines) */
        .lead-tracker-v2 [style*="color:\\"#64748b\\""],
        .lead-tracker-v2 [style*="color:\\"#94a3b8\\""],
        .lead-tracker-v2 [style*="color:\\"#475569\\""],
        .lead-tracker-v2 [style*="color:\\"#374151\\""] {
          color: #8B7A5F !important;
        }

        /* Lead card meta row (email/phone/budget/area) */
        .lead-tracker-v2 .lead-card div[style*="flexWrap"][style*="fontSize:12"] {
          color: #6B5D4B !important;
        }
        .lead-tracker-v2 .lead-card div[style*="flexWrap"][style*="fontSize:12"] span {
          color: #6B5D4B !important;
        }

        /* ─── Filter tabs (Status + Type) ─────────────────────────── */
        .lead-tracker-v2 .tabs {
          background: rgba(255,255,255,.5);
          border: 1px solid rgba(63,53,40,.12);
          border-radius: 12px;
          padding: 3px;
          display: inline-flex;
          gap: 2px;
        }
        .lead-tracker-v2 .tab {
          padding: 7px 14px;
          border: none;
          background: transparent;
          color: #6B5D4B !important;
          font-weight: 600;
          font-size: 12.5px;
          border-radius: 9px;
          cursor: pointer;
          font-family: 'Inter', sans-serif;
          transition: all .15s;
        }
        .lead-tracker-v2 .tab:hover {
          background: rgba(255,255,255,.7);
          color: #2C2418 !important;
        }
        .lead-tracker-v2 .tab.active {
          background: #FFFFFF !important;
          color: #2C2418 !important;
          box-shadow: 0 1px 4px rgba(26,90,160,.12), 0 0 0 1px rgba(26,90,160,.10);
          font-weight: 700;
        }

        /* ─── Bulk action bar (when leads are checkbox-selected) ──── */
        .lead-tracker-v2 .lt-bulk-bar {
          background: linear-gradient(135deg, #FFFFFF 0%, #FFF9EC 100%) !important;
          border: 1px solid rgba(201,154,44,.35) !important;
          box-shadow: 0 4px 16px rgba(201,154,44,.12), 0 1px 3px rgba(0,0,0,.04) !important;
        }
        .lead-tracker-v2 .lt-bulk-bar span { color: #2C2418 !important; }
        .lead-tracker-v2 .lt-bulk-bar button { color: #2C2418 !important; }

        /* ─── Add Lead / Edit Lead form text overrides ────────────── */
        .lead-tracker-v2 .glass-card div[style*="color:\\"#f1f5f9\\""] {
          color: #2C2418 !important;
        }
        .lead-tracker-v2 .glass-card .label { color: #6B5D4B !important; }

        /* ─── ContactDetail drawer (slide-in lead detail panel) ───── */
        .lead-tracker-v2 .lt-detail-panel {
          background: linear-gradient(180deg, #FAF6EE 0%, #F2EAD8 100%) !important;
          border-left: 1px solid rgba(63,53,40,.12) !important;
          box-shadow: -10px 0 40px rgba(63,53,40,.15);
        }
        .lead-tracker-v2 .lt-detail-header {
          background: rgba(250,246,238,.95) !important;
          border-bottom: 1px solid rgba(63,53,40,.08) !important;
          backdrop-filter: blur(8px);
        }
        .lead-tracker-v2 .lt-detail-panel div { color: #3F3528; }
        .lead-tracker-v2 .lt-detail-panel [style*="color:\\"#fff\\""],
        .lead-tracker-v2 .lt-detail-panel [style*="color:\\"#ffffff\\""],
        .lead-tracker-v2 .lt-detail-panel [style*="color:\\"#f1f5f9\\""] {
          color: #2C2418 !important;
        }
        .lead-tracker-v2 .lt-detail-panel [style*="DM Serif Display"] {
          color: #2C2418 !important;
          font-family: 'Cabinet Grotesk', 'Inter', sans-serif !important;
          letter-spacing: -.02em !important;
        }
        /* Section dividers inside the drawer */
        .lead-tracker-v2 .lt-detail-panel div[style*="border-bottom"][style*="rgba(255,255,255"],
        .lead-tracker-v2 .lt-detail-panel div[style*="borderBottom"][style*="rgba(255,255,255"] {
          border-bottom-color: rgba(63,53,40,.08) !important;
        }
        .lead-tracker-v2 .lt-detail-panel div[style*="border-top"][style*="rgba(255,255,255"],
        .lead-tracker-v2 .lt-detail-panel div[style*="borderTop"][style*="rgba(255,255,255"] {
          border-top-color: rgba(63,53,40,.08) !important;
        }
        /* Buttons inside the drawer keep their colors but text becomes legible */
        .lead-tracker-v2 .lt-detail-panel .btn-ghost {
          background: rgba(255,255,255,.85) !important;
          color: #2C2418 !important;
          border: 1px solid rgba(63,53,40,.15) !important;
        }
        .lead-tracker-v2 .lt-detail-panel .btn-blue { color: #fff !important; }
        .lead-tracker-v2 .lt-detail-panel input,
        .lead-tracker-v2 .lt-detail-panel textarea,
        .lead-tracker-v2 .lt-detail-panel select {
          background: #FFFFFF !important;
          border: 1.5px solid rgba(26,90,160,.18) !important;
          color: #2C2418 !important;
        }
        .lead-tracker-v2 .lt-detail-panel input::placeholder,
        .lead-tracker-v2 .lt-detail-panel textarea::placeholder { color: #98A2B5 !important; }
        /* Activity log timeline entries */
        .lead-tracker-v2 .lt-detail-panel div[style*="rgba(255,255,255,.03)"],
        .lead-tracker-v2 .lt-detail-panel div[style*="rgba(255,255,255,.04)"] {
          background: rgba(255,255,255,.7) !important;
          border: 1px solid rgba(63,53,40,.08) !important;
        }
      `}</style>
      <PageHeader title="Lead Tracker" sub={`${leads.length} total leads`} setPage={setPage} parent="dashboard"
        action={<div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={()=>syncFUB(false)} disabled={syncing}><RefreshCw size={12} style={syncing?{animation:"spin 1s linear infinite"}:{}}/>{syncing?"Syncing…":"Sync FUB"}</button>
          {lastSync&&!syncing&&<span style={{fontSize:11,color:"#8B7A5F",alignSelf:"center"}}>Last synced {Math.round((Date.now()-lastSync)/60000)}m ago</span>}
          <button className="btn btn-blue" onClick={()=>{setShowForm(true);setEditId(null);setForm({name:"",email:"",phone:"",type:"Buyer",status:"warm",budget:"",area:"",notes:""});}}><Plus size={13}/>Add Lead</button>
        </div>}
      />

      {showForm&&(
        <div className="glass-card" style={{marginBottom:24}}>
          <div className="flex-between" style={{marginBottom:16}}>
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>{editId?"Edit Lead":"New Lead"}</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setShowForm(false);setEditId(null);}}><X size={13}/>Cancel</button>
          </div>
          <div className="grid-2" style={{gap:12}}>
            <div><div className="label">Full Name *</div><input className="input" placeholder="Jane Smith" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><div className="label">Email</div><input className="input" type="email" placeholder="jane@email.com" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
            <div><div className="label">Phone</div><input className="input" placeholder="(555) 000-0000" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
            <div><div className="label">Lead Type</div>
              <select className="select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {["Buyer","Seller","Buyer & Seller","Investor","Renter"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><div className="label">Status</div>
              <select className="select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                {LEAD_STATUSES.map(s=><option key={s} style={{textTransform:"capitalize"}}>{s}</option>)}
              </select>
            </div>
            <div><div className="label">Budget / Price Range</div><input className="input" type="number" placeholder="500000" value={form.budget} onChange={e=>setForm(f=>({...f,budget:e.target.value}))}/></div>
            <div><div className="label">Target Area</div><input className="input" placeholder="Oak Park, River Forest..." value={form.area} onChange={e=>setForm(f=>({...f,area:e.target.value}))}/></div>
            <div><div className="label">Notes</div><input className="input" placeholder="Timeline, preferences, referral source..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <button className="btn btn-blue" style={{marginTop:16}} onClick={save}><Save size={13}/>{editId?"Update Lead":"Add Lead"}</button>
        </div>
      )}

      {/* Smart Lists */}
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <span className="lt-smart-label">Smart Lists</span>
          {[...BUILT_IN_LISTS,...smartLists].map(list=>(
            <button key={list.name} onClick={()=>applyList(list)} className="lt-smart-pill">
              {list.name}
              {!BUILT_IN_LISTS.find(b=>b.name===list.name)&&(
                <span onClick={e=>{e.stopPropagation();setSmartLists(p=>p.filter(s=>s.id!==list.id));}} className="lt-smart-x">×</span>
              )}
            </button>
          ))}
          {showSaveList
            ? <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input className="input" style={{width:160,padding:"5px 10px",fontSize:12}} placeholder="List name..." value={listName} onChange={e=>setListName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveList()} autoFocus/>
                <button className="btn btn-blue btn-xs" onClick={saveList}>Save</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>setShowSaveList(false)}>Cancel</button>
              </div>
            : <button onClick={()=>setShowSaveList(true)} className="lt-smart-pill lt-smart-pill-dashed">+ Save Current</button>
          }
        </div>
      </div>

      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
        <input className="input" style={{maxWidth:220}} placeholder="Search leads..." value={search==="__followup__"?"":search} onChange={e=>setSearch(e.target.value)}/>
        {allTags.length>0&&(
          <select className="select" style={{maxWidth:160}} value={filterTag} onChange={e=>setFilterTag(e.target.value)}>
            <option value="all">All Tags</option>
            {allTags.map(t=><option key={t}>{t}</option>)}
          </select>
        )}
        <div className="tabs" style={{width:"auto"}}>
          {["all",...LEAD_STATUSES].map(s=>(
            <button key={s} className={`tab ${filterStatus===s?"active":""}`} onClick={()=>setFilterStatus(s)} style={{textTransform:"capitalize"}}>{s} ({statusCounts[s]||0})</button>
          ))}
        </div>
        <div className="tabs" style={{width:"auto"}}>
          {["all","Buyer","Seller","Investor"].map(t=>(
            <button key={t} className={`tab ${filterType===t?"active":""}`} onClick={()=>setFilterType(t)}>{t}</button>
          ))}
        </div>
      </div>

      {/* Bulk select bar */}
      {selected.length>0&&(
        <div className="lt-bulk-bar" style={{position:"sticky",top:8,zIndex:50,borderRadius:13,padding:"12px 16px",marginBottom:12,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
          <span style={{fontSize:13,fontWeight:800}}>{selected.length} lead{selected.length>1?"s":""} selected</span>
          <div style={{display:"flex",gap:6,flex:1,flexWrap:"wrap"}}>
            {bulkPanel==="status"?(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <select className="select" style={{fontSize:12,padding:"4px 8px"}} value={bulkValue} onChange={e=>setBulkValue(e.target.value)}>
                  <option value="">Pick status...</option>
                  {LEAD_STATUSES.map(s=><option key={s}>{s}</option>)}
                </select>
                <button className="btn btn-blue btn-xs" onClick={bulkChangeStatus}>Apply</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>setBulkPanel(null)}>✕</button>
              </div>
            ):bulkPanel==="tag"?(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <input className="input" style={{fontSize:12,padding:"4px 10px",width:160}} placeholder="Tag name..." value={bulkValue} onChange={e=>setBulkValue(e.target.value)} onKeyDown={e=>e.key==="Enter"&&bulkAddTag()} autoFocus/>
                <button className="btn btn-blue btn-xs" onClick={bulkAddTag}>Add Tag</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>setBulkPanel(null)}>✕</button>
              </div>
            ):bulkPanel==="plan"?(
              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                <select className="select" style={{fontSize:12,padding:"4px 8px"}} value={bulkValue} onChange={e=>setBulkValue(e.target.value)}>
                  <option value="">Pick plan...</option>
                  {[...BUILT_IN_PLANS,...customPlans].map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <button className="btn btn-blue btn-xs" onClick={bulkApplyPlan}>Apply Plan</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>setBulkPanel(null)}>✕</button>
              </div>
            ):(
              <>
                <button className="btn btn-ghost btn-xs" onClick={()=>{setBulkPanel("status");setBulkValue("");}}>Change Status</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>{setBulkPanel("tag");setBulkValue("");}}>Add Tag</button>
                <button className="btn btn-ghost btn-xs" onClick={()=>{setBulkPanel("plan");setBulkValue("");}}>Apply Action Plan</button>
                <button className="btn btn-ghost btn-xs" onClick={bulkExport}>Export CSV</button>
                <button className="btn btn-ghost btn-xs" style={{color:"#f87171"}} onClick={bulkDelete}>Delete</button>
              </>
            )}
          </div>
          <button className="btn btn-ghost btn-xs" onClick={clearSel}>Clear</button>
        </div>
      )}

      {/* Select all row */}
      {filtered.length>0&&(
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,paddingLeft:4}}>
          <input type="checkbox" checked={selected.length===filtered.length&&filtered.length>0}
            onChange={e=>e.target.checked?selectAll():clearSel()} style={{width:15,height:15,cursor:"pointer"}}/>
          <span style={{fontSize:12,fontWeight:700,color:"#475569"}}>
            {selected.length>0?`${selected.length} selected`:`Select all ${filtered.length}`}
          </span>
        </div>
      )}

      {!leadsLoaded
        ? <div className="glass-card" style={{padding:"40px 20px",textAlign:"center",color:"#475569"}}><Spinner s={22}/><div style={{marginTop:10,fontSize:13}}>Loading your leads…</div></div>
        : (leadsLoaded && leads.length===0 && syncing)
          ? <div className="glass-card" style={{padding:"40px 20px",textAlign:"center",color:"#475569"}}><Spinner s={22}/><div style={{marginTop:10,fontSize:13}}>Syncing from Follow Up Boss…</div></div>
        : filtered.length===0
        ? <div className="glass-card"><EmptyState icon={UserCheck} title="No leads found" desc="Add leads or adjust your filters"/></div>
        : <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.length > renderLimit && (
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"4px 8px",fontSize:12}}>
              <span style={{color:"#8B7A5F"}}>Showing first {renderLimit} of {filtered.length} leads</span>
              <button className="btn btn-ghost btn-sm" onClick={()=>setRenderLimit(r=>r+200)}>Load 200 more</button>
            </div>
          )}
          {filtered.slice(0, renderLimit).map(l=>(
            <div key={l.id} className={`lead-card ${statusBorderCls[l.status]||""}`} style={{outline:selected.includes(l.id)?"1.5px solid rgba(126,184,247,.4)":"none"}}>
              <div className="flex-between">
                <div style={{display:"flex",gap:10,alignItems:"flex-start",flex:1,minWidth:0}}>
                  <input type="checkbox" checked={selected.includes(l.id)} onChange={()=>toggleSelect(l.id)}
                    style={{width:15,height:15,cursor:"pointer",marginTop:3,flexShrink:0}} onClick={e=>e.stopPropagation()}/>
                  <div style={{flex:1,minWidth:0,cursor:"pointer"}} onClick={()=>setSelectedLead(l)}>
                    <div className="flex-row" style={{marginBottom:6}}>
                      <div style={{fontSize:15,fontWeight:700,color:"#ffffff",fontFamily:"'DM Serif Display',serif"}}>{l.name}</div>
                      <span className={`badge ${statusColors[l.status]||"badge-gray"}`}>{l.status}</span>
                      <span className="badge badge-gray">{l.type}</span>
                      {l.followUp&&new Date(l.followUp)<=new Date()&&<span className="badge badge-red">Follow-up due</span>}
                    </div>
                    <div style={{display:"flex",gap:20,flexWrap:"wrap",fontSize:12,color:"#94a3b8"}}>
                      {l.email&&<span>✉ {l.email}</span>}
                      {l.phone&&<span>📞 {l.phone}</span>}
                      {l.budget&&<span>💰 {fmtMoney(l.budget)}</span>}
                      {l.area&&<span>📍 {l.area}</span>}
                    </div>
                    {(l.tags||[]).length>0&&(
                      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:6}}>
                        {l.tags.map(tag=><span key={tag} style={{padding:"2px 8px",borderRadius:20,background:"rgba(26,90,160,.15)",color:"#7eb8f7",fontSize:11,fontWeight:700}}>{tag}</span>)}
                      </div>
                    )}
                  </div>
                </div>
                <div style={{display:"flex",gap:4,marginLeft:12,flexShrink:0}}>
                  {l.phone&&<button className="btn btn-ghost btn-icon btn-xs" title="Log Call" onClick={e=>{e.stopPropagation();setCallLogLead(l);}} style={{color:"#10b981"}}><Phone size={13}/></button>}
                  <button className="btn btn-ghost btn-icon btn-xs" onClick={e=>{e.stopPropagation();setSelectedLead(l);}}><ChevronRight size={14}/></button>
                  <button className="btn btn-danger btn-icon btn-xs" onClick={e=>{e.stopPropagation();del(l.id);}}><Trash2 size={12}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      }

      {selectedLead&&(
        <ContactDetail
          lead={leads.find(l=>l.id===selectedLead.id)||selectedLead}
          onClose={()=>setSelectedLead(null)}
          onUpdate={updated=>{setLeads(p=>p.map(l=>l.id===updated.id?updated:l));setSelectedLead(updated);}}
          toast={toast}
        />
      )}

      {/* Quick Call Log Modal */}
      {callLogLead&&(
        <QuickCallLog lead={callLogLead} onClose={()=>setCallLogLead(null)}
          onSave={(leadId,followUpDate)=>{
            if(followUpDate) setLeads(p=>p.map(l=>l.id===leadId?{...l,followUp:followUpDate}:l));
            setCallLogLead(null);
          }}
          toast={toast}/>
      )}
    </div>
  );
};

// ─── CONTENT SCHEDULER ────────────────────────────────────────────────────────
const ContentScheduler = ({setPage,toast}) => {
  const [posts,setPosts] = useLS("posts",[]);
  const [statusTab,setStatusTab] = useState("all");
  const [form,setForm] = useState({platforms:["instagram"],caption:"",scheduledAt:"",status:"scheduled",propertyAddress:"",mediaUrl:"",mediaType:"image"});
  const [editId,setEditId] = useState(null);
  const [postingId,setPostingId] = useState(null);
  const [integrations] = useLS("integrations", {});
  const meta = integrations.meta || {};
  const metaReady = !!(meta.accessToken && meta.pageId);

  // The background worker writes to localStorage directly when scheduled posts fire.
  // Refresh state when it dispatches the update event.
  useEffect(() => {
    const refresh = () => {
      try { setPosts(JSON.parse(localStorage.getItem('posts') || '[]')); } catch {}
    };
    window.addEventListener('posts-updated', refresh);
    return () => window.removeEventListener('posts-updated', refresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePl = pl => setForm(f=>({...f,platforms:f.platforms.includes(pl)?f.platforms.filter(x=>x!==pl):[...f.platforms,pl]}));
  const filtered = posts.filter(p=>statusTab==="all"||p.status===statusTab);

  const save = () => {
    if(!form.caption.trim()) return toast.error("Caption is required");
    if(!form.platforms.length) return toast.error("Select at least one platform");
    if(form.platforms.includes("instagram") && !form.mediaUrl) {
      return toast.error("Instagram requires an image or video URL");
    }
    if(editId){
      setPosts(p=>p.map(x=>x.id===editId?{...x,...form}:x));
      toast.success("Post updated!"); setEditId(null);
    } else {
      setPosts(p=>[...form.platforms.map(pl=>({id:uid(),...form,platform:pl,createdAt:now()})),...p]);
      toast.success(`${form.platforms.length} post(s) scheduled!`);
    }
    setForm({platforms:["instagram"],caption:"",scheduledAt:"",status:"scheduled",propertyAddress:"",mediaUrl:"",mediaType:"image"});
  };

  const del = id => { setPosts(p=>p.filter(x=>x.id!==id)); toast.success("Deleted"); };
  const markPublished = id => { setPosts(p=>p.map(x=>x.id===id?{...x,status:"published",publishedAt:now()}:x)); toast.success("Marked published!"); };

  // Fire a single post immediately, regardless of its scheduledAt.
  const postNow = async (p) => {
    if (!metaReady) { toast.error("Connect Facebook in Integrations first"); return; }
    setPostingId(p.id);
    try {
      const platforms = p.platforms || (p.platform ? [p.platform] : []);
      const { results } = await publishPostToMeta({
        caption: p.caption, platforms, mediaUrl: p.mediaUrl, mediaType: p.mediaType,
      }, meta);
      const ok = results.filter(r => r.ok);
      const errs = results.filter(r => !r.ok);
      setPosts(prev => prev.map(x => x.id === p.id ? {
        ...x,
        status: ok.length > 0 ? "published" : "failed",
        publishedAt: ok.length > 0 ? now() : x.publishedAt,
        postResults: results,
        postError: errs.length ? errs.map(e=>`${e.platform}: ${e.error}`).join(' · ') : undefined,
        messageIds: ok.length ? ok.reduce((a,r)=>({...a, [r.platform]: r.messageId}), {}) : x.messageIds,
      } : x));
      if (ok.length > 0) toast.success(`Posted to ${ok.map(r=>r.platform).join(', ')}`);
      if (errs.length > 0) toast.error(errs.map(e=>`${e.platform}: ${e.error}`).join(' · '));
    } catch (e) {
      toast.error(`Post failed: ${e.message}`);
    } finally {
      setPostingId(null);
    }
  };

  // Surface what's coming up so she knows the worker will fire them.
  const dueSoon = posts.filter(p => p.status === 'scheduled' && p.scheduledAt && new Date(p.scheduledAt).getTime() <= Date.now() + 60*60*1000);

  return (
    <div className="page-content">
      <PageHeader title="Content Scheduler" sub="Schedule and manage your real estate posts" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="glass-card">
          <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:16,fontFamily:"'DM Serif Display',serif"}}>{editId?"Edit Post":"Schedule Post"}</div>
          <div className="col">
            <div><div className="label">Property Address (optional)</div><input className="input" placeholder="123 Main St — for your records" value={form.propertyAddress} onChange={e=>setForm(f=>({...f,propertyAddress:e.target.value}))}/></div>
            <div><div className="label">Platforms</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {Object.entries(PLATFORMS).map(([k,v])=>(
                  <button key={k} className={`ptag ${v.cls}`} style={{cursor:"pointer",border:`1px solid ${form.platforms.includes(k)?v.color:"transparent"}`,opacity:form.platforms.includes(k)?1:.4,transition:"all .15s"}} onClick={()=>togglePl(k)}>{v.label}</button>
                ))}
              </div>
            </div>
            <div><div className="label">Caption</div>
              <textarea className="textarea" style={{minHeight:130}} placeholder="Paste from Social Studio or write your caption..." value={form.caption} onChange={e=>setForm(f=>({...f,caption:e.target.value}))}/>
              {form.platforms[0]&&<CharCount text={form.caption} limit={Math.min(...form.platforms.map(p=>LIMITS[p]||9999))}/>}
            </div>
            <div className="grid-2">
              <div>
                <div className="label">Media URL <span style={{fontWeight:500,color:"#475569"}}>{form.platforms.includes("instagram")?"(required for IG)":"(optional)"}</span></div>
                <input className="input" placeholder="https://… public image or video URL" value={form.mediaUrl} onChange={e=>setForm(f=>({...f,mediaUrl:e.target.value}))}/>
              </div>
              <div><div className="label">Media Type</div>
                <select className="select" value={form.mediaType} onChange={e=>setForm(f=>({...f,mediaType:e.target.value}))}>
                  <option value="image">Image / Photo</option>
                  <option value="video">Video / Reel</option>
                </select>
              </div>
            </div>
            <div className="grid-2">
              <div><div className="label">Schedule Date & Time</div><input className="input" type="datetime-local" value={form.scheduledAt} onChange={e=>setForm(f=>({...f,scheduledAt:e.target.value}))}/></div>
              <div><div className="label">Status</div>
                <select className="select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                  <option value="scheduled">Scheduled</option>
                  <option value="draft">Draft</option>
                </select>
              </div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-blue" style={{flex:1}} onClick={save}><Save size={13}/>{editId?"Update":"Schedule Post"}</button>
              {editId&&<button className="btn btn-ghost" onClick={()=>{setEditId(null);setForm({platforms:["instagram"],caption:"",scheduledAt:"",status:"scheduled",propertyAddress:""});}}>Cancel</button>}
            </div>
          </div>
        </div>

        <div>
          {/* Auto-publish status banner */}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",marginBottom:14,borderRadius:10,background:metaReady?"rgba(16,185,129,.08)":"rgba(239,68,68,.08)",border:`1px solid ${metaReady?"rgba(16,185,129,.2)":"rgba(239,68,68,.2)"}`,flexWrap:"wrap"}}>
            {metaReady ? (
              <>
                <span style={{fontSize:18}}>🟢</span>
                <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>Auto-publish ON</span>
                <span style={{fontSize:12,color:"#94a3b8"}}>Scheduled posts fire every minute while this app is open. {dueSoon.length>0?`${dueSoon.length} due in next hour.`:""}</span>
              </>
            ) : (
              <>
                <span style={{fontSize:18}}>⚠️</span>
                <span style={{fontSize:13,fontWeight:700,color:"#fff"}}>Facebook not connected</span>
                <button className="btn btn-ghost btn-xs" onClick={()=>setPage("integrations")}>Connect →</button>
              </>
            )}
          </div>

          <div className="tabs" style={{marginBottom:12,width:"fit-content"}}>
            {["all","scheduled","published","draft","failed"].map(t=>(
              <button key={t} className={`tab ${statusTab===t?"active":""}`} onClick={()=>setStatusTab(t)} style={{textTransform:"capitalize"}}>{t} ({posts.filter(p=>t==="all"||p.status===t).length})</button>
            ))}
          </div>
          {filtered.length===0
            ? <div className="glass-card"><EmptyState icon={Calendar} title="No posts found" desc="Create your first scheduled post"/></div>
            : filtered.map(p=>{
              const isDue = p.status==="scheduled" && p.scheduledAt && new Date(p.scheduledAt).getTime() <= Date.now();
              return (
              <div key={p.id} className="glass-card" style={{marginBottom:10,padding:14,borderLeft:p.status==="failed"?"3px solid #f87171":isDue?"3px solid #f59e0b":"3px solid transparent"}}>
                <div className="flex-between">
                  <div style={{flex:1,minWidth:0}}>
                    {p.propertyAddress&&<div style={{fontSize:12,fontWeight:700,color:"#1a5aa0",marginBottom:5}}>📍 {p.propertyAddress}</div>}
                    <div style={{display:"flex",gap:6,marginBottom:7,flexWrap:"wrap",alignItems:"center"}}>
                      <PTag p={p.platform||p.platforms?.[0]}/>
                      <span className={`badge ${p.status==="published"?"badge-green":p.status==="scheduled"?"badge-blue":p.status==="failed"?"badge-red":"badge-gray"}`}>
                        {p._publishing?"⏳ posting…":p.status}
                      </span>
                      {isDue && p.status==="scheduled" && !p._publishing && <span style={{fontSize:10,fontWeight:800,color:"#f59e0b"}}>FIRING NEXT TICK</span>}
                      {p.mediaUrl && <span style={{fontSize:10,color:"#64748b"}}>{p.mediaType==="video"?"🎬":"🖼"} media</span>}
                    </div>
                    <div style={{fontSize:13,color:"#94a3b8",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{p.caption}</div>
                    {p.scheduledAt&&<div style={{fontSize:11,color:"#374151",marginTop:5}}>⏰ {fmtT(p.scheduledAt)}</div>}
                    {p.publishedAt&&p.status==="published"&&<div style={{fontSize:11,color:"#10b981",marginTop:3}}>✅ Posted {fmtT(p.publishedAt)}</div>}
                    {p.postError&&<div style={{fontSize:11,color:"#f87171",marginTop:5,padding:"6px 8px",background:"rgba(239,68,68,.08)",borderRadius:6}}>⚠ {p.postError}</div>}
                  </div>
                  <div style={{display:"flex",gap:5,marginLeft:12,flexShrink:0,flexDirection:"column",alignItems:"flex-end"}}>
                    {(p.status==="scheduled"||p.status==="draft"||p.status==="failed")&&metaReady&&(
                      <button className="btn btn-blue btn-xs" disabled={postingId===p.id} onClick={()=>postNow(p)}>
                        {postingId===p.id?<><Spinner s={10}/>Posting…</>:<><Send size={11}/>Post Now</>}
                      </button>
                    )}
                    {p.status==="draft"&&<button className="btn btn-ghost btn-xs" onClick={()=>markPublished(p.id)}><Check size={11}/>Mark Published</button>}
                    <div style={{display:"flex",gap:4}}>
                      <button className="btn btn-ghost btn-icon btn-xs" onClick={()=>{setEditId(p.id);setForm({...p,platforms:p.platforms||[p.platform],mediaUrl:p.mediaUrl||"",mediaType:p.mediaType||"image"});}}><Edit3 size={12}/></button>
                      <button className="btn btn-danger btn-icon btn-xs" onClick={()=>del(p.id)}><Trash2 size={12}/></button>
                    </div>
                  </div>
                </div>
              </div>
            );})
          }
        </div>
      </div>
    </div>
  );
};

// ─── SHOWING CALENDAR ─────────────────────────────────────────────────────────
const ShowingCalendar = ({setPage,toast}) => {
  const [showings,setShowings] = useLS("showings",[]);
  const [viewDate,setViewDate] = useState(new Date());
  const [selected,setSelected] = useState(null);
  const [form,setForm] = useState({address:"",clientName:"",type:"Showing",time:"",notes:"",status:"scheduled"});
  const [showForm,setShowForm] = useState(false);

  const today = new Date();
  const yr=viewDate.getFullYear(), mo=viewDate.getMonth();
  const firstDay=new Date(yr,mo,1).getDay(), daysInMo=new Date(yr,mo+1,0).getDate();
  const weeks=Math.ceil((firstDay+daysInMo)/7);
  const MONTHS=["January","February","March","April","May","June","July","August","September","October","November","December"];

  const dayShowings = d => showings.filter(s=>{
    if(!s.date) return false;
    const sd=new Date(s.date);
    return sd.getFullYear()===yr&&sd.getMonth()===mo&&sd.getDate()===d;
  });

  const addShowing = () => {
    if(!form.address.trim()) return toast.error("Address is required");
    const dateStr = selected ? `${yr}-${String(mo+1).padStart(2,"0")}-${String(selected).padStart(2,"0")}${form.time?`T${form.time}`:""}` : "";
    setShowings(p=>[{id:uid(),...form,date:dateStr,createdAt:now()},...p]);
    toast.success("Showing added!"); setShowForm(false); setForm({address:"",clientName:"",type:"Showing",time:"",notes:"",status:"scheduled"});
  };

  const showingTypes = ["Showing","Open House","Listing Appointment","Inspection","Closing","Follow-up"];

  return (
    <div className="page-content">
      <PageHeader title="Showing Calendar" sub="Manage showings, open houses, and appointments" setPage={setPage} parent="dashboard"
        action={
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setViewDate(new Date(yr,mo-1,1))}><ChevronLeft size={13}/></button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setViewDate(new Date())}>Today</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>setViewDate(new Date(yr,mo+1,1))}><ChevronRight size={13}/></button>
            <button className="btn btn-blue btn-sm" onClick={()=>setShowForm(!showForm)}><Plus size={12}/>Add Appointment</button>
          </div>
        }/>

      {showForm&&(
        <div className="glass-card" style={{marginBottom:20}}>
          <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:14}}>New Appointment {selected?`— ${MONTHS[mo]} ${selected}`:"(select a date)"}</div>
          <div className="grid-2" style={{gap:12}}>
            <div><div className="label">Property Address *</div><input className="input" placeholder="123 Main St" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
            <div><div className="label">Client Name</div><input className="input" placeholder="Jane & Bob Smith" value={form.clientName} onChange={e=>setForm(f=>({...f,clientName:e.target.value}))}/></div>
            <div><div className="label">Type</div>
              <select className="select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {showingTypes.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><div className="label">Time</div><input className="input" type="time" value={form.time} onChange={e=>setForm(f=>({...f,time:e.target.value}))}/></div>
            <div><div className="label">Notes</div><input className="input" placeholder="Gate code, parking, etc." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
            <div><div className="label">Status</div>
              <select className="select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                {["scheduled","confirmed","completed","cancelled"].map(s=><option key={s} style={{textTransform:"capitalize"}}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:8,marginTop:14}}>
            <button className="btn btn-blue" onClick={addShowing}><Plus size={13}/>Add Appointment</button>
            <button className="btn btn-ghost" onClick={()=>setShowForm(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="grid-2" style={{gap:20,alignItems:"start"}}>
        <div>
          <div style={{fontSize:18,fontWeight:700,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif",marginBottom:12}}>{MONTHS[mo]} {yr}</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:4}}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,fontWeight:800,color:"#374151",padding:"4px 0",textTransform:"uppercase",letterSpacing:"1px"}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4}}>
            {Array.from({length:weeks*7},(_,i)=>{
              const d=i-firstDay+1;
              const inMo=d>=1&&d<=daysInMo;
              const isToday=inMo&&d===today.getDate()&&mo===today.getMonth()&&yr===today.getFullYear();
              const isSel=inMo&&d===selected;
              const dp=inMo?dayShowings(d):[];
              return (
                <div key={i} className={`cal-cell ${isToday?"today":""} ${!inMo?"other-month":""} ${isSel?"selected":""}`} onClick={()=>inMo&&setSelected(d)}>
                  <div style={{fontSize:11,fontWeight:isToday?800:400,color:isToday?"#7eb8f7":"#475569",marginBottom:3}}>{inMo?d:""}</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:2}}>
                    {dp.slice(0,3).map(s=>(
                      <div key={s.id} style={{width:7,height:7,borderRadius:"50%",background:s.type==="Open House"?"#d4a017":s.type==="Closing"?"#10b981":"#1a5aa0"}}/>
                    ))}
                    {dp.length>3&&<div style={{fontSize:9,color:"#374151"}}>+{dp.length-3}</div>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="glass-card">
          {selected?(
            <>
              <div className="flex-between" style={{marginBottom:14}}>
                <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9"}}>{MONTHS[mo]} {selected}</div>
                <button className="btn btn-blue btn-sm" onClick={()=>setShowForm(true)}><Plus size={12}/>Add</button>
              </div>
              {dayShowings(selected).length===0
                ? <EmptyState icon={Calendar} title="Nothing scheduled" desc="Click Add to schedule an appointment"/>
                : dayShowings(selected).map(s=>(
                  <div key={s.id} className="row-item" style={{marginBottom:8,flexDirection:"column",alignItems:"flex-start",gap:6}}>
                    <div className="flex-between" style={{width:"100%"}}>
                      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                        <span className={`badge ${s.type==="Open House"?"badge-gold":s.type==="Closing"?"badge-green":"badge-blue"}`}>{s.type}</span>
                        <span className={`badge ${s.status==="confirmed"?"badge-green":s.status==="cancelled"?"badge-red":"badge-gray"}`}>{s.status}</span>
                      </div>
                      <button className="btn btn-danger btn-icon btn-xs" onClick={()=>setShowings(p=>p.filter(x=>x.id!==s.id))}><Trash2 size={11}/></button>
                    </div>
                    <div style={{fontSize:13,fontWeight:600,color:"#94a3b8"}}>📍 {s.address}</div>
                    {s.clientName&&<div style={{fontSize:12,color:"#64748b"}}>👤 {s.clientName}</div>}
                    {s.time&&<div style={{fontSize:12,color:"#475569"}}>⏰ {s.time}</div>}
                    {s.notes&&<div style={{fontSize:12,color:"#374151",fontStyle:"italic"}}>{s.notes}</div>}
                  </div>
                ))
              }
            </>
          ) : <EmptyState icon={CalendarDays} title="Select a day" desc="Click any date to view and add appointments"/>}
        </div>
      </div>
    </div>
  );
};

// ─── MEDIA LIBRARY ────────────────────────────────────────────────────────────
const MediaLibrary = ({setPage,toast}) => {
  const [assets,setAssets] = useLS("assets",[]);
  const [search,setSearch] = useState("");
  const [filter,setFilter] = useState("all");
  const fileRef = useRef();

  const handleFiles = files => {
    Array.from(files).forEach(f=>{
      const r=new FileReader();
      r.onload=e=>setAssets(p=>[{id:uid(),filename:f.name,url:e.target.result,mimeType:f.type,size:f.size,tags:"",address:"",createdAt:now()},...p]);
      r.readAsDataURL(f);
    });
    toast.success(`${files.length} file(s) added!`);
  };

  const filtered = assets.filter(a=>{
    const matchSearch = a.filename?.toLowerCase().includes(search.toLowerCase())||a.tags?.toLowerCase().includes(search.toLowerCase())||a.address?.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter==="all"||(filter==="images"&&a.mimeType?.startsWith("image"))||(filter==="videos"&&a.mimeType?.startsWith("video"));
    return matchSearch&&matchFilter;
  });

  return (
    <div className="page-content">
      <PageHeader title="Property Media Library" sub={`${assets.length} assets`} setPage={setPage} parent="dashboard"
        action={<button className="btn btn-blue" onClick={()=>fileRef.current?.click()}><Upload size={13}/>Upload Media</button>}
      />
      <input ref={fileRef} type="file" multiple accept="image/*,video/*" style={{display:"none"}} onChange={e=>handleFiles(e.target.files)}/>
      <div style={{border:"2px dashed rgba(26,90,160,.25)",borderRadius:16,padding:32,textAlign:"center",marginBottom:20,cursor:"pointer",transition:"all .2s"}} onClick={()=>fileRef.current?.click()} onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor="#1a5aa0";}} onDragLeave={e=>{e.currentTarget.style.borderColor="rgba(26,90,160,.25)";}} onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor="rgba(26,90,160,.25)";handleFiles(e.dataTransfer.files);}}>
        <Upload size={28} color="#1a5aa0" style={{margin:"0 auto 8px",opacity:.6}}/>
        <div style={{fontSize:14,fontWeight:600,color:"#475569"}}>Drop listing photos & videos here or click to upload</div>
      </div>
      <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
        <input className="input" style={{maxWidth:280}} placeholder="Search by filename, address, or tag..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <div className="tabs" style={{width:"auto"}}>
          {["all","images","videos"].map(f=>(
            <button key={f} className={`tab ${filter===f?"active":""}`} onClick={()=>setFilter(f)} style={{textTransform:"capitalize"}}>{f} ({f==="all"?assets.length:assets.filter(a=>(f==="images"&&a.mimeType?.startsWith("image"))||(f==="videos"&&a.mimeType?.startsWith("video"))).length})</button>
          ))}
        </div>
      </div>
      {filtered.length===0
        ? <div className="glass-card"><EmptyState icon={Image} title="No assets found" desc="Upload listing photos and videos to build your library"/></div>
        : <div className="grid-auto">
          {filtered.map(a=>(
            <div key={a.id} className="glass-card-sm">
              <div style={{width:"100%",paddingBottom:"72%",position:"relative",borderRadius:9,overflow:"hidden",background:"rgba(0,0,0,.3)",marginBottom:10}}>
                {a.mimeType?.startsWith("image")
                  ? <img src={a.url} alt={a.filename} style={{position:"absolute",inset:0,width:"100%",height:"100%",objectFit:"cover"}}/>
                  : <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center"}}><Video size={28} color="#1a5aa0" opacity={.5}/></div>
                }
              </div>
              <div style={{fontSize:12,fontWeight:600,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.filename}</div>
              <input className="input" style={{marginTop:7,fontSize:11,padding:"4px 8px"}} placeholder="Property address..." value={a.address||""} onChange={e=>setAssets(p=>p.map(x=>x.id===a.id?{...x,address:e.target.value}:x))}/>
              <input className="input" style={{marginTop:5,fontSize:11,padding:"4px 8px"}} placeholder="Tags (bedroom, kitchen...)" value={a.tags||""} onChange={e=>setAssets(p=>p.map(x=>x.id===a.id?{...x,tags:e.target.value}:x))}/>
              <div style={{display:"flex",gap:5,marginTop:8}}>
                <button className="btn btn-ghost btn-xs" style={{flex:1}} onClick={()=>{navigator.clipboard.writeText(a.url);toast.success("URL copied!");}}>
                  <Copy size={11}/>Copy URL
                </button>
                <button className="btn btn-danger btn-icon btn-xs" onClick={()=>{setAssets(p=>p.filter(x=>x.id!==a.id));toast.success("Deleted");}}><Trash2 size={11}/></button>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
};

// ─── CLIENT TEMPLATES ─────────────────────────────────────────────────────────
const ClientTemplates = ({setPage,toast}) => {
  const [templates,setTemplates] = useLS("templates",[]);
  const [form,setForm] = useState({name:"",type:"buyer-follow-up",platform:"",content:""});
  const [editId,setEditId] = useState(null);
  const [search,setSearch] = useState("");

  const types = [
    {id:"buyer-follow-up",label:"Buyer Follow-Up"},
    {id:"seller-follow-up",label:"Seller Follow-Up"},
    {id:"showing-confirmation",label:"Showing Confirmation"},
    {id:"offer-submitted",label:"Offer Submitted"},
    {id:"closing-congrats",label:"Closing Congrats"},
    {id:"open-house-invite",label:"Open House Invite"},
    {id:"referral-request",label:"Referral Request"},
    {id:"market-update",label:"Market Update"},
    {id:"custom",label:"Custom"},
  ];

  const save = () => {
    if(!form.name.trim()||!form.content.trim()) return toast.error("Name and content required");
    if(editId){setTemplates(p=>p.map(x=>x.id===editId?{...x,...form}:x));toast.success("Updated!");setEditId(null);}
    else{setTemplates(p=>[{id:uid(),...form,usageCount:0,createdAt:now()},...p]);toast.success("Saved!");}
    setForm({name:"",type:"buyer-follow-up",platform:"",content:""});
  };

  const filtered = templates.filter(t=>t.name?.toLowerCase().includes(search.toLowerCase())||t.content?.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="page-content">
      <PageHeader title="Client Templates" sub="Pre-written emails, texts, and social replies" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="glass-card">
          <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:16,fontFamily:"'DM Serif Display',serif"}}>{editId?"Edit Template":"New Template"}</div>
          <div className="col">
            <div><div className="label">Template Name</div><input className="input" placeholder="e.g. Post-Showing Thank You" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><div className="label">Type</div>
              <select className="select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {types.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div><div className="label">Content</div>
              <textarea className="textarea" style={{minHeight:160}} placeholder="Use {client_name} for name, {address} for property address, {date} for date..." value={form.content} onChange={e=>setForm(f=>({...f,content:e.target.value}))}/>
              <div style={{fontSize:11,color:"#374151",marginTop:5}}>Variables: {"{client_name}"} {"{address}"} {"{date}"} {"{agent_name}"} {"{phone}"}</div>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-blue" style={{flex:1}} onClick={save}><Save size={13}/>{editId?"Update":"Save Template"}</button>
              {editId&&<button className="btn btn-ghost" onClick={()=>{setEditId(null);setForm({name:"",type:"buyer-follow-up",platform:"",content:""});}}>Cancel</button>}
            </div>
          </div>
        </div>
        <div>
          <input className="input" style={{marginBottom:12}} placeholder="Search templates..." value={search} onChange={e=>setSearch(e.target.value)}/>
          {filtered.length===0
            ? <div className="glass-card"><EmptyState icon={Heart} title="No templates" desc="Create reusable client communication templates"/></div>
            : filtered.map(t=>(
              <div key={t.id} className="glass-card" style={{marginBottom:10,padding:14}}>
                <div className="flex-between" style={{marginBottom:8}}>
                  <div>
                    <div style={{fontSize:14,fontWeight:700,color:"#f1f5f9"}}>{t.name}</div>
                    <span className="badge badge-blue" style={{marginTop:4,fontSize:10}}>{types.find(x=>x.id===t.type)?.label||t.type}</span>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <CopyBtn text={t.content} toast={toast}/>
                    <button className="btn btn-ghost btn-icon btn-xs" onClick={()=>{setEditId(t.id);setForm(t);}}><Edit3 size={12}/></button>
                    <button className="btn btn-danger btn-icon btn-xs" onClick={()=>{setTemplates(p=>p.filter(x=>x.id!==t.id));toast.success("Deleted");}}><Trash2 size={12}/></button>
                  </div>
                </div>
                <div style={{fontSize:12,color:"#64748b",lineHeight:1.7}}>{t.content.slice(0,180)}{t.content.length>180?"…":""}</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
};

// ─── CMA ASSISTANT ────────────────────────────────────────────────────────────
const CMATool = ({setPage,toast}) => {
  const [subject,setSubject] = useState({address:"",beds:"",baths:"",sqft:"",propType:"Single Family",yearBuilt:"",garage:"",condition:"Good"});
  const [comps,setComps] = useState([{id:uid(),address:"",salePrice:"",sqft:"",beds:"",baths:"",daysOnMarket:"",notes:""}]);
  const [loading,setLoading] = useState(false);
  const [output,setOutput] = useState("");
  const [agentVoice] = useLS("agent_voice","");

  const addComp = () => setComps(p=>[...p,{id:uid(),address:"",salePrice:"",sqft:"",beds:"",baths:"",daysOnMarket:"",notes:""}]);
  const updateComp = (id,field,val) => setComps(p=>p.map(c=>c.id===id?{...c,[field]:val}:c));
  const removeComp = id => setComps(p=>p.filter(c=>c.id!==id));

  const generate = async () => {
    if(!subject.address.trim()) return toast.error("Enter the subject property address");
    if(comps.filter(c=>c.address.trim()).length===0) return toast.error("Add at least one comparable property");
    setLoading(true);
    try {
      const compText = comps.filter(c=>c.address).map((c,i)=>`Comp ${i+1}: ${c.address} | Sale: ${fmtMoney(c.salePrice)} | ${c.beds}bd/${c.baths}ba | ${c.sqft}sqft | ${c.daysOnMarket||"?"} DOM${c.notes?` | Notes: ${c.notes}`:""}`).join("\n");
      const out = await callClaude(
        `Perform a Comparative Market Analysis (CMA) for this property:\n\nSUBJECT PROPERTY:\nAddress: ${subject.address}\nType: ${subject.propType}\nBeds: ${subject.beds} | Baths: ${subject.baths} | Sqft: ${subject.sqft}\nYear Built: ${subject.yearBuilt||"unknown"} | Garage: ${subject.garage||"unknown"} | Condition: ${subject.condition}\n\nCOMPARABLE SALES:\n${compText}\n\nWrite a professional CMA analysis. Include:\n1. Price per square foot analysis\n2. Adjustments for differences\n3. Suggested list price range (low, mid, high)\n4. Market positioning recommendation\n5. Key talking points for the client presentation\n\nBe specific with numbers and professional.`,
        agentVoice?`Real estate agent: ${agentVoice}`:"Expert real estate agent performing a CMA for a client presentation."
      );
      setOutput(out);
    } catch(e) { toast.error(e.message); }
    setLoading(false);
  };

  return (
    <div className="page-content">
      <PageHeader title="CMA Assistant" sub="AI-assisted comparative market analysis" setPage={setPage} parent="dashboard"/>
      <div className="info-banner info-blue" style={{marginBottom:20}}><Info size={14} style={{flexShrink:0,marginTop:1}}/>Enter your subject property and recent comparable sales. AI will analyze and suggest pricing.</div>
      <div className="grid-2" style={{gap:22}}>
        <div className="col">
          <div className="glass-card">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:14,fontFamily:"'DM Serif Display',serif"}}>Subject Property</div>
            <div className="col">
              <div><div className="label">Address *</div><input className="input" placeholder="123 Main St, Oak Park, IL" value={subject.address} onChange={e=>setSubject(s=>({...s,address:e.target.value}))}/></div>
              <div className="grid-3" style={{gap:8}}>
                <div><div className="label">Beds</div><input className="input" type="number" placeholder="4" value={subject.beds} onChange={e=>setSubject(s=>({...s,beds:e.target.value}))}/></div>
                <div><div className="label">Baths</div><input className="input" type="number" step=".5" placeholder="2.5" value={subject.baths} onChange={e=>setSubject(s=>({...s,baths:e.target.value}))}/></div>
                <div><div className="label">Sqft</div><input className="input" type="number" placeholder="2000" value={subject.sqft} onChange={e=>setSubject(s=>({...s,sqft:e.target.value}))}/></div>
              </div>
              <div className="grid-2" style={{gap:8}}>
                <div><div className="label">Year Built</div><input className="input" type="number" placeholder="1985" value={subject.yearBuilt} onChange={e=>setSubject(s=>({...s,yearBuilt:e.target.value}))}/></div>
                <div><div className="label">Condition</div>
                  <select className="select" value={subject.condition} onChange={e=>setSubject(s=>({...s,condition:e.target.value}))}>
                    {["Excellent","Good","Average","Fair","Poor"].map(c=><option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card">
            <div className="flex-between" style={{marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>Comparable Sales</div>
              <button className="btn btn-blue btn-sm" onClick={addComp} disabled={comps.length>=8}><Plus size={12}/>Add Comp</button>
            </div>
            {comps.map((c,i)=>(
              <div key={c.id} className="glass-card-sm" style={{marginBottom:10}}>
                <div className="flex-between" style={{marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#7eb8f7"}}>Comp {i+1}</span>
                  {comps.length>1&&<button className="btn btn-danger btn-icon btn-xs" onClick={()=>removeComp(c.id)}><X size={11}/></button>}
                </div>
                <div className="col" style={{gap:8}}>
                  <input className="input" placeholder="123 Elm St" value={c.address} onChange={e=>updateComp(c.id,"address",e.target.value)}/>
                  <div className="grid-3" style={{gap:6}}>
                    <div><div className="label">Sale Price</div><input className="input" type="number" placeholder="450000" value={c.salePrice} onChange={e=>updateComp(c.id,"salePrice",e.target.value)}/></div>
                    <div><div className="label">Sqft</div><input className="input" type="number" placeholder="1900" value={c.sqft} onChange={e=>updateComp(c.id,"sqft",e.target.value)}/></div>
                    <div><div className="label">DOM</div><input className="input" type="number" placeholder="18" value={c.daysOnMarket} onChange={e=>updateComp(c.id,"daysOnMarket",e.target.value)}/></div>
                  </div>
                  <input className="input" style={{fontSize:11,padding:"5px 10px"}} placeholder="Notes (updates, garage, etc.)" value={c.notes} onChange={e=>updateComp(c.id,"notes",e.target.value)}/>
                </div>
              </div>
            ))}
            <button className="btn btn-blue" style={{marginTop:8,width:"100%"}} onClick={generate} disabled={loading}>
              {loading?<><Spinner s={13}/>Analyzing…</>:<><Building size={13}/>Generate CMA Analysis</>}
            </button>
          </div>
        </div>

        <div className="glass-card">
          <div className="flex-between" style={{marginBottom:12}}>
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>CMA Analysis</div>
            {output&&<CopyBtn text={output} toast={toast} sm/>}
          </div>
          {output?(
            <div className="output-box" style={{maxHeight:700,overflow:"auto"}}>{output}</div>
          ):(
            <div className="flex-center" style={{minHeight:400,flexDirection:"column",gap:12,border:"1px dashed rgba(26,90,160,.2)",borderRadius:12}}>
              <Building size={40} color="#1a5aa0" opacity={.4}/>
              <div style={{color:"#374151",fontSize:13}}>Your CMA analysis appears here</div>
              <div style={{fontSize:12,color:"#1e2d44",textAlign:"center",maxWidth:240}}>Fill in the subject property and at least one comparable sale, then click Generate</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
const Analytics = ({setPage,toast}) => {
  const [analytics,setAnalytics] = useLS("re_analytics",{});
  const [posts] = useLS("posts",[]);
  const [leads] = useLeadsCloud();
  const [editing,setEditing] = useState(null);
  const [form,setForm] = useState({});

  const closedLeads = leads.filter(l=>["Closed","Past Client"].includes(l.status));
  const totalVolume = closedLeads.reduce((s,l)=>s+(Number(l.salePrice)||0),0);
  const activeLeads = leads.filter(l=>["Hot Prospect","Contact","Buyer","Seller","Casually Browsing","Nurture 3-6 Months","Nurture 1+ Year","Buy/Sell Nurture","Pending"].includes(l.status)).length;
  const postsThisMo = posts.filter(p=>{const d=new Date(p.createdAt||0),n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear();}).length;

  const platformChart = Object.entries(PLATFORMS).map(([k,v])=>({name:v.label,followers:analytics[k]?.followers||0,engagement:analytics[k]?.engagement||0}));
  const leadChart = LEAD_STATUSES.map(s=>({name:s,value:leads.filter(l=>l.status===s).length}));
  const COLORS = ["#ef4444","#f59e0b","#3b82f6","#10b981","#64748b"];

  const saveEdit = () => { setAnalytics(p=>({...p,[editing]:{...form,followers:+form.followers||0,engagement:+form.engagement||0}})); setEditing(null); toast.success("Updated!"); };

  return (
    <div className="page-content">
      <PageHeader title="Business Analytics" sub="Track your real estate business performance" setPage={setPage} parent="dashboard"/>
      <div className="grid-4" style={{marginBottom:24}}>
        {[
          {label:"Active Leads",val:activeLeads,cls:"stat-card-1",icon:UserCheck},
          {label:"Closed Deals",val:closedLeads.length,cls:"stat-card-3",icon:Key},
          {label:"Posts This Month",val:postsThisMo,cls:"stat-card-2",icon:Calendar},
          {label:"Closed Volume",val:totalVolume?`$${(totalVolume/1e6).toFixed(2)}M`:"$0",cls:"stat-card-4",icon:DollarSign},
        ].map(s=>(
          <div key={s.label} className={`stat-card ${s.cls}`}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-number" style={{fontSize:24}}>{s.val}</div>
            <div className="stat-icon"><s.icon size={36}/></div>
          </div>
        ))}
      </div>

      <div className="grid-2" style={{gap:20,marginBottom:20}}>
        <div className="glass-card">
          <div className="section-title">Social Media Followers</div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={platformChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,.05)"/>
              <XAxis dataKey="name" tick={{fontSize:10,fill:"#475569"}}/>
              <YAxis tick={{fontSize:10,fill:"#475569"}}/>
              <Tooltip contentStyle={{background:"rgba(8,10,22,.95)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,fontSize:12}}/>
              <Bar dataKey="followers" fill="#1a5aa0" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="glass-card">
          <div className="section-title">Lead Pipeline</div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={leadChart.filter(d=>d.value>0)} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" nameKey="name">
                {leadChart.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}
              </Pie>
              <Tooltip contentStyle={{background:"rgba(8,10,22,.95)",border:"1px solid rgba(255,255,255,.1)",borderRadius:8,fontSize:12}}/>
            </PieChart>
          </ResponsiveContainer>
          <div style={{display:"flex",flexWrap:"wrap",gap:10,justifyContent:"center",marginTop:-10}}>
            {leadChart.filter(d=>d.value>0).map((d,i)=>(
              <div key={d.name} style={{display:"flex",alignItems:"center",gap:5,fontSize:11,color:"#64748b"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:COLORS[i%COLORS.length]}}/>
                <span style={{textTransform:"capitalize"}}>{d.name} ({d.value})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass-card">
        <div className="flex-between" style={{marginBottom:16}}>
          <div className="section-title" style={{margin:0}}>Social Platform Stats</div>
          <div style={{fontSize:12,color:"#374151"}}>Click a card to edit</div>
        </div>
        <div className="grid-3">
          {Object.entries(PLATFORMS).map(([k,p])=>{
            const d=analytics[k]||{};
            const isEd=editing===k;
            return (
              <div key={k} className="glass-card-sm" style={{cursor:"pointer"}} onClick={()=>{if(!isEd){setEditing(k);setForm(d);}}}>
                <div className="flex-between" style={{marginBottom:10}}>
                  <PTag p={k}/>
                  {isEd
                    ? <div style={{display:"flex",gap:5}}>
                        <button className="btn btn-blue btn-xs" onClick={e=>{e.stopPropagation();saveEdit();}}><Check size={10}/>Save</button>
                        <button className="btn btn-ghost btn-xs" onClick={e=>{e.stopPropagation();setEditing(null);}}><X size={10}/></button>
                      </div>
                    : <button className="btn btn-ghost btn-icon btn-xs" onClick={e=>{e.stopPropagation();setEditing(k);setForm(d);}}><Edit3 size={11}/></button>
                  }
                </div>
                {isEd
                  ? <div className="col" onClick={e=>e.stopPropagation()}>
                      <div><div className="label">Followers</div><input className="input" type="number" value={form.followers||""} onChange={e=>setForm(f=>({...f,followers:e.target.value}))}/></div>
                      <div><div className="label">Engagement %</div><input className="input" type="number" step=".1" value={form.engagement||""} onChange={e=>setForm(f=>({...f,engagement:e.target.value}))}/></div>
                    </div>
                  : <>
                      <div style={{fontSize:24,fontWeight:900,color:"#f8fafc",fontFamily:"'DM Serif Display',serif"}}>{(d.followers||0).toLocaleString()}</div>
                      <div style={{fontSize:11,color:"#374151"}}>followers</div>
                      <div style={{display:"flex",gap:16,marginTop:10}}>
                        <div><div style={{fontSize:14,fontWeight:700,color:"#6ee7b7"}}>{d.engagement||0}%</div><div style={{fontSize:10,color:"#374151"}}>engagement</div></div>
                      </div>
                    </>
                }
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ─── MARKET ANALYZER ─────────────────────────────────────────────────────────
const MarketAnalyzer = ({setPage,toast}) => {
  const [handle,setHandle] = useState("");
  const [platform,setPlatform] = useState("instagram");
  const [agentName,setAgentName] = useState("");
  const [loading,setLoading] = useState(false);
  const [result,setResult] = useState(null);
  const [saved,setSaved] = useLS("market_analyses",[]);
  const [agentVoice] = useLS("agent_voice","");

  const analyze = async () => {
    const target = agentName||`@${handle}`;
    if(!target.trim()) return toast.error("Enter an agent name or handle");
    setLoading(true);
    try {
      const raw = await callClaude(
        `Analyze ${target} as a real estate agent competitor on ${PLATFORMS[platform]?.label} and create a strategy guide.\n\nRespond ONLY with valid JSON:\n{"contentStrategy":"","postingFrequency":"","topContentTypes":[""],"engagementTactics":[""],"listingPresentationStyle":"","targetAudienceApproach":"","strengthsToLearnFrom":[""],"weaknessesAndGaps":[""],"recommendations":[""]}`,
        agentVoice?`Real estate agent context: ${agentVoice}`:"Real estate marketing strategist.",
        2000
      );
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      const entry = {id:uid(),handle,agentName,platform,...parsed,createdAt:now()};
      setSaved(p=>[entry,...p.slice(0,19)]); setResult(entry); toast.success("Analysis complete!");
    } catch(e) { toast.error("Analysis failed — try again"); }
    setLoading(false);
  };

  return (
    <div className="page-content">
      <PageHeader title="Market Analyzer" sub="AI competitor and market research for real estate agents" setPage={setPage} parent="dashboard"/>
      <div className="info-banner info-blue" style={{marginBottom:20}}><Info size={14} style={{flexShrink:0,marginTop:1}}/>AI-powered strategic analysis. Does not access live social media data.</div>
      <div className="grid-2" style={{gap:22}}>
        <div className="col">
          <div className="glass-card">
            <div className="col">
              <div><div className="label">Competing Agent Name</div><input className="input" placeholder="John Smith, RE/MAX" value={agentName} onChange={e=>setAgentName(e.target.value)}/></div>
              <div><div className="label">Social Handle (optional)</div><input className="input" placeholder="@agenthandle (without @)" value={handle} onChange={e=>setHandle(e.target.value.replace("@",""))}/></div>
              <div><div className="label">Platform to Analyze</div>
                <select className="select" value={platform} onChange={e=>setPlatform(e.target.value)}>
                  {Object.entries(PLATFORMS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <button className="btn btn-blue" onClick={analyze} disabled={loading}>
                {loading?<><Spinner s={13}/>Analyzing…</>:<><Search size={13}/>Analyze Agent Strategy</>}
              </button>
            </div>
          </div>
          {saved.length>0&&(
            <div className="glass-card">
              <div className="section-title">Past Analyses</div>
              {saved.map(s=>(
                <div key={s.id} className="row-item" style={{marginBottom:6,cursor:"pointer"}} onClick={()=>setResult(s)}>
                  <PTag p={s.platform}/>
                  <div style={{flex:1}}><div style={{fontSize:13,fontWeight:600,color:"#94a3b8"}}>{s.agentName||`@${s.handle}`}</div><div style={{fontSize:11,color:"#374151"}}>{fmt(s.createdAt)}</div></div>
                  <button className="btn btn-danger btn-icon btn-xs" onClick={e=>{e.stopPropagation();setSaved(p=>p.filter(x=>x.id!==s.id));}}><Trash2 size={11}/></button>
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          {result
            ? <div className="glass-card">
                <div className="flex-between" style={{marginBottom:16}}>
                  <div style={{fontWeight:800,fontSize:16,color:"#f8fafc",fontFamily:"'DM Serif Display',serif"}}>{result.agentName||`@${result.handle}`}</div>
                  <PTag p={result.platform}/>
                </div>
                {[
                  {label:"📊 Content Strategy",content:result.contentStrategy},
                  {label:"📅 Posting Frequency",content:result.postingFrequency},
                  {label:"🎯 Top Content Types",content:result.topContentTypes?.join("\n")},
                  {label:"🏠 Listing Presentation Style",content:result.listingPresentationStyle},
                  {label:"✅ Strengths to Learn From",content:result.strengthsToLearnFrom?.join("\n")},
                  {label:"🔍 Weaknesses & Gaps You Can Fill",content:result.weaknessesAndGaps?.join("\n")},
                  {label:"💡 Recommendations for You",content:result.recommendations?.join("\n\n")},
                ].filter(s=>s.content).map(s=>(
                  <div key={s.label} style={{marginBottom:14}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#64748b",marginBottom:7,textTransform:"uppercase",letterSpacing:".7px"}}>{s.label}</div>
                    <div className="output-box" style={{fontSize:12,minHeight:"unset"}}>{s.content}</div>
                  </div>
                ))}
              </div>
            : <div className="glass-card flex-center" style={{minHeight:300,flexDirection:"column",gap:12,border:"1px dashed rgba(26,90,160,.2)"}}>
                <Search size={40} color="#1a5aa0" opacity={.4}/>
                <div style={{color:"#374151",fontSize:13}}>Enter a competing agent to analyze their strategy</div>
              </div>
          }
        </div>
      </div>
    </div>
  );
};

// ─── CONTENT REPURPOSER ───────────────────────────────────────────────────────
const ContentRepurposer = ({setPage,toast}) => {
  const [original,setOriginal] = useState("");
  const [sourceType,setSourceType] = useState("MLS Listing");
  const [targets,setTargets] = useState(["instagram","facebook","linkedin"]);
  const [loading,setLoading] = useState(false);
  const [results,setResults] = useState({});
  const [agentVoice] = useLS("agent_voice","");

  const toggle = t => setTargets(p=>p.includes(t)?p.filter(x=>x!==t):[...p,t]);

  const repurpose = async () => {
    if(!original.trim()) return toast.error("Add original content first");
    if(!targets.length) return toast.error("Select target platforms");
    setLoading(true);
    try {
      const raw = await callClaude(
        `Repurpose this ${sourceType} for: ${targets.join(", ")}.\n\nOriginal:\n"${original}"\n\nRespond ONLY with JSON keys as platform names:\n{${targets.map(t=>`"${t}":"optimized content for ${t}"`).join(",")}}`,
        agentVoice?`Real estate agent: ${agentVoice}`:"Expert real estate marketing specialist. Adapt content to each platform's style and character limits.",
        2500
      );
      setResults(JSON.parse(raw.replace(/```json|```/g,"").trim()));
      toast.success("Content repurposed for all platforms!");
    } catch(e) { toast.error("Failed — try again"); }
    setLoading(false);
  };

  const sourceTypes = ["MLS Listing","Market Report","Client Testimonial","Just Sold Story","Open House Announcement","Blog Post","Email Newsletter"];

  return (
    <div className="page-content">
      <PageHeader title="Content Repurposer" sub="One listing or update → optimized for every platform" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="glass-card">
          <div className="col">
            <div><div className="label">Source Type</div>
              <select className="select" value={sourceType} onChange={e=>setSourceType(e.target.value)}>
                {sourceTypes.map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><div className="label">Original Content</div>
              <textarea className="textarea" style={{minHeight:180}} placeholder="Paste your MLS description, market report, testimonial, etc..." value={original} onChange={e=>setOriginal(e.target.value)}/>
            </div>
            <div><div className="label">Repurpose For</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                {Object.entries(PLATFORMS).map(([t,v])=>(
                  <button key={t} className={`ptag ${v.cls}`} style={{cursor:"pointer",border:`1px solid ${targets.includes(t)?v.color:"transparent"}`,opacity:targets.includes(t)?1:.4}} onClick={()=>toggle(t)}>{v.label}</button>
                ))}
              </div>
            </div>
            <button className="btn btn-blue" onClick={repurpose} disabled={loading}>
              {loading?<><Spinner s={13}/>Repurposing…</>:<><RefreshCw size={13}/>Repurpose Content</>}
            </button>
          </div>
        </div>
        <div className="col">
          {Object.keys(results).length===0
            ? <div className="glass-card flex-center" style={{minHeight:300,flexDirection:"column",gap:12,border:"1px dashed rgba(26,90,160,.2)"}}>
                <RefreshCw size={40} color="#1a5aa0" opacity={.4}/>
                <div style={{color:"#374151",fontSize:13}}>Repurposed versions appear here</div>
              </div>
            : Object.entries(results).map(([pl,content])=>(
              <div key={pl} className="glass-card" style={{padding:14}}>
                <div className="flex-between" style={{marginBottom:8}}>
                  <PTag p={pl}/>
                  <div style={{display:"flex",gap:6}}><CharCount text={content} limit={LIMITS[pl]||9999}/><CopyBtn text={content} toast={toast}/></div>
                </div>
                <div style={{fontSize:13,color:"#94a3b8",whiteSpace:"pre-wrap",lineHeight:1.7}}>{content}</div>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
};

// ─── PROPERTY CAROUSEL BUILDER ────────────────────────────────────────────────
const CarouselBuilder = ({setPage,toast}) => {
  const [slides,setSlides] = useState([{id:uid(),headline:"Welcome Home",body:"Stunning 4BR Colonial in the Heart of Oak Park",bg:"#061020",tc:"#e8f4ff"}]);
  const [theme,setTheme] = useState("navy");
  const [title,setTitle] = useState("");
  const [saved,setSaved] = useLS("carousels",[]);
  const [prev,setPrev] = useState(0);

  const THEMES={
    navy:{bg:"#061020",tc:"#e8f4ff"},
    gold:{bg:"#1a0f00",tc:"#ffd700"},
    slate:{bg:"#0f172a",tc:"#cbd5e1"},
    cream:{bg:"#faf7f2",tc:"#1a1a2e"},
    dark:{bg:"#060608",tc:"#f0f0f0"},
  };

  const applyTheme=t=>{setTheme(t);setSlides(p=>p.map(s=>({...s,bg:THEMES[t].bg,tc:THEMES[t].tc})));};
  const addSlide=()=>setSlides(p=>[...p,{id:uid(),headline:`Feature ${p.length}`,body:"Describe this feature...",bg:THEMES[theme].bg,tc:THEMES[theme].tc}]);
  const upd=(id,f,v)=>setSlides(p=>p.map(s=>s.id===id?{...s,[f]:v}:s));

  const slideTemplates = [
    {headline:"Welcome Home",body:"Stunning 4BR/2.5BA in {neighborhood}"},
    {headline:"Updated Kitchen",body:"Quartz counters · Stainless appliances · Custom cabinetry"},
    {headline:"Primary Suite",body:"Spa-like bath · Walk-in closet · Vaulted ceilings"},
    {headline:"Outdoor Living",body:"Entertainer's dream backyard · Patio · Landscaped lot"},
    {headline:"Location",body:"Walk to shops · Top-rated schools · Easy commute"},
    {headline:"Offered at $XXX,000",body:"Contact {agent_name} · {phone}"},
  ];

  return (
    <div className="page-content">
      <PageHeader title="Property Carousel Builder" sub="Build multi-slide Instagram and LinkedIn property posts" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="col">
          <div className="glass-card">
            <div className="flex-between" style={{marginBottom:14}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>Slides ({slides.length}/10)</div>
              <button className="btn btn-blue btn-sm" onClick={addSlide} disabled={slides.length>=10}><Plus size={12}/>Add Slide</button>
            </div>
            <div style={{marginBottom:12}}><div className="label">Carousel Title (internal)</div><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="123 Main St Listing Carousel"/></div>
            <div style={{marginBottom:14}}><div className="label">Theme</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {Object.keys(THEMES).map(t=><button key={t} className={`badge ${theme===t?"badge-blue":"badge-gray"}`} style={{cursor:"pointer",border:"none",padding:"5px 11px",textTransform:"capitalize"}} onClick={()=>applyTheme(t)}>{t}</button>)}
              </div>
            </div>
            <div style={{marginBottom:12}}>
              <div className="label">Quick Templates</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {slideTemplates.map((t,i)=>(
                  <button key={i} className="btn btn-ghost btn-xs" onClick={()=>setSlides(p=>[...p,{id:uid(),...t,bg:THEMES[theme].bg,tc:THEMES[theme].tc}])} disabled={slides.length>=10}>{t.headline}</button>
                ))}
              </div>
            </div>
            {slides.map((s,i)=>(
              <div key={s.id} className="glass-card-sm" style={{marginBottom:10,border:`1px solid ${prev===i?"rgba(26,90,160,.4)":"rgba(255,255,255,.05)"}`,cursor:"pointer"}} onClick={()=>setPrev(i)}>
                <div className="flex-between" style={{marginBottom:8}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#64748b"}}>Slide {i+1}</span>
                  <button className="btn btn-danger btn-icon btn-xs" onClick={e=>{e.stopPropagation();setSlides(p=>p.filter(x=>x.id!==s.id));}} disabled={slides.length<=1}><Trash2 size={11}/></button>
                </div>
                <input className="input" style={{marginBottom:7}} value={s.headline} onChange={e=>upd(s.id,"headline",e.target.value)} onClick={e=>e.stopPropagation()} placeholder="Headline"/>
                <textarea className="textarea" style={{minHeight:55}} value={s.body} onChange={e=>upd(s.id,"body",e.target.value)} onClick={e=>e.stopPropagation()} placeholder="Feature description"/>
              </div>
            ))}
            <div style={{display:"flex",gap:8,marginTop:8}}>
              <button className="btn btn-blue" style={{flex:1}} onClick={()=>{if(!title.trim())return toast.error("Add a title first");setSaved(p=>[{id:uid(),title,slides,theme,createdAt:now()},...p]);toast.success("Carousel saved!");}}><Save size={13}/>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>{navigator.clipboard.writeText(slides.map(s=>`${s.headline}\n${s.body}`).join("\n---\n"));toast.success("All slides copied!");}}>
                <Copy size={13}/>Copy All
              </button>
            </div>
          </div>
        </div>
        <div>
          <div style={{fontWeight:600,fontSize:14,color:"#64748b",marginBottom:12}}>Preview — Slide {prev+1} of {slides.length}</div>
          {slides[prev]&&(
            <div style={{background:slides[prev].bg,borderRadius:20,padding:40,minHeight:380,display:"flex",flexDirection:"column",justifyContent:"center",position:"relative",overflow:"hidden",boxShadow:"0 20px 60px rgba(0,0,0,.5)"}}>
              <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:"linear-gradient(90deg,#1a5aa0,#d4a017)"}}/>
              <div style={{position:"absolute",top:16,right:20,fontSize:10,fontWeight:800,color:slides[prev].tc,opacity:.3,textTransform:"uppercase",letterSpacing:"2px"}}>Real Estate</div>
              <div style={{fontSize:11,fontWeight:800,color:slides[prev].tc,opacity:.4,textTransform:"uppercase",letterSpacing:"2px",marginBottom:10}}>Property Feature</div>
              <div style={{fontSize:30,fontWeight:900,color:slides[prev].tc,lineHeight:1.2,marginBottom:14,fontFamily:"'DM Serif Display',serif"}}>{slides[prev].headline}</div>
              <div style={{fontSize:15,color:slides[prev].tc,opacity:.7,lineHeight:1.7}}>{slides[prev].body}</div>
              <div style={{position:"absolute",bottom:20,left:0,right:0,display:"flex",justifyContent:"center",gap:6}}>
                {slides.map((_,i)=>(
                  <div key={i} onClick={()=>setPrev(i)} style={{width:i===prev?20:8,height:8,borderRadius:4,background:i===prev?slides[prev].tc:`${slides[prev].tc}44`,cursor:"pointer",transition:"width .2s"}}/>
                ))}
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:8,marginTop:12}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setPrev(Math.max(0,prev-1))} disabled={prev===0}><ChevronLeft size={13}/>Prev</button>
            <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={()=>setPrev(Math.min(slides.length-1,prev+1))} disabled={prev===slides.length-1}>Next<ChevronRight size={13}/></button>
          </div>
          {saved.length>0&&(
            <div className="glass-card" style={{marginTop:16}}>
              <div className="section-title">Saved Carousels</div>
              {saved.map(c=>(
                <div key={c.id} className="row-item" style={{marginBottom:6}}>
                  <Layout size={14} color="#1a5aa0"/>
                  <div style={{flex:1}}><div style={{fontSize:13,color:"#94a3b8"}}>{c.title}</div><div style={{fontSize:11,color:"#374151"}}>{c.slides.length} slides · {fmt(c.createdAt)}</div></div>
                  <div style={{display:"flex",gap:5}}>
                    <button className="btn btn-ghost btn-xs" onClick={()=>{setSlides(c.slides);setTheme(c.theme);setTitle(c.title);}}>Load</button>
                    <button className="btn btn-danger btn-icon btn-xs" onClick={()=>setSaved(p=>p.filter(x=>x.id!==c.id))}><Trash2 size={11}/></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── A/B TESTING ──────────────────────────────────────────────────────────────
const ABTesting = ({setPage,toast}) => {
  const [tests,setTests] = useLS("ab_tests",[]);
  const [descA,setDescA] = useState("");
  const [descB,setDescB] = useState("");
  const [platform,setPlatform] = useState("instagram");
  const [notes,setNotes] = useState("");
  const [loading,setLoading] = useState(false);
  const [analyzing,setAnalyzing] = useState(null);
  const [agentVoice] = useLS("agent_voice","");

  const genB = async () => {
    if(!descA.trim()) return toast.error("Write Description A first");
    setLoading(true);
    try {
      const r = await callClaude(`Create an alternative real estate ${PLATFORMS[platform]?.label} post. Same property/topic but with a different hook, angle, or structure:\n\nDescription A:\n"${descA}"\n\nWrite ONLY the alternative description, nothing else.`);
      setDescB(r); toast.success("Description B generated!");
    } catch(e) { toast.error(e.message); }
    setLoading(false);
  };

  const analyze = async (t) => {
    setAnalyzing(t.id);
    try {
      const r = await callClaude(`Which real estate post will likely generate more leads and engagement on ${PLATFORMS[t.platform]?.label}?\n\nA: "${t.captionA}"\n\nB: "${t.captionB}"\n\nAnalyze: hook strength, CTA effectiveness, emotional appeal, listing detail clarity, and recommend a winner with reasoning.`,agentVoice?`Agent brand: ${agentVoice}`:"");
      setTests(p=>p.map(x=>x.id===t.id?{...x,aiAnalysis:r}:x));
      toast.success("Analysis complete!");
    } catch(e) { toast.error(e.message); }
    setAnalyzing(null);
  };

  return (
    <div className="page-content">
      <PageHeader title="A/B Description Testing" sub="Compare listing descriptions to find what converts best" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="glass-card">
          <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:16,fontFamily:"'DM Serif Display',serif"}}>Create New Test</div>
          <div className="col">
            <div><div className="label">Platform / Use Case</div>
              <select className="select" value={platform} onChange={e=>setPlatform(e.target.value)}>
                {Object.entries(PLATFORMS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div><div className="label">Description A</div>
              <textarea className="textarea" placeholder="Write your first listing description or post..." value={descA} onChange={e=>setDescA(e.target.value)}/>
              {descA&&<CharCount text={descA} limit={LIMITS[platform]}/>}
            </div>
            <div>
              <div className="flex-between" style={{marginBottom:7}}>
                <div className="label" style={{margin:0}}>Description B</div>
                <button className="btn btn-ghost btn-xs" onClick={genB} disabled={loading}>{loading?<Spinner s={11}/>:<><Wand2 size={11}/>AI Generate</>}</button>
              </div>
              <textarea className="textarea" placeholder="Or click AI Generate to create an alternative..." value={descB} onChange={e=>setDescB(e.target.value)}/>
              {descB&&<CharCount text={descB} limit={LIMITS[platform]}/>}
            </div>
            <div><div className="label">What Are You Testing?</div><input className="input" placeholder="e.g. Emotional headline vs. specs-first approach" value={notes} onChange={e=>setNotes(e.target.value)}/></div>
            <button className="btn btn-blue" onClick={()=>{if(!descA.trim()||!descB.trim())return toast.error("Both descriptions required");setTests(p=>[{id:uid(),captionA:descA,captionB:descB,platform,notes,winner:null,createdAt:now()},...p]);toast.success("Test saved!");setDescA("");setDescB("");setNotes("");}}>
              <Save size={13}/>Save A/B Test
            </button>
          </div>
        </div>
        <div>
          {tests.length===0
            ? <div className="glass-card flex-center" style={{minHeight:200,flexDirection:"column",gap:12}}><FlaskConical size={32} color="#1a5aa0" opacity={.4}/><div style={{color:"#374151",fontSize:13}}>No A/B tests yet</div></div>
            : tests.map(t=>(
              <div key={t.id} className="glass-card" style={{marginBottom:12}}>
                <div className="flex-between" style={{marginBottom:10}}>
                  <div style={{display:"flex",gap:6}}><PTag p={t.platform}/><span style={{fontSize:11,color:"#374151"}}>{fmt(t.createdAt)}</span></div>
                  <div style={{display:"flex",gap:5}}>
                    <button className="btn btn-ghost btn-xs" onClick={()=>analyze(t)} disabled={analyzing===t.id}>{analyzing===t.id?<Spinner s={11}/>:<><Sparkles size={11}/>AI Analysis</>}</button>
                    <button className="btn btn-danger btn-icon btn-xs" onClick={()=>setTests(p=>p.filter(x=>x.id!==t.id))}><Trash2 size={11}/></button>
                  </div>
                </div>
                {t.notes&&<div style={{fontSize:12,color:"#475569",marginBottom:10,fontStyle:"italic"}}>Testing: {t.notes}</div>}
                <div className="grid-2" style={{gap:10}}>
                  {[{l:"Version A",c:t.captionA,v:"A"},{l:"Version B",c:t.captionB,v:"B"}].map(cap=>(
                    <div key={cap.v} style={{background:"rgba(0,0,0,.25)",borderRadius:10,padding:12,border:`1px solid ${t.winner===cap.v?"rgba(26,90,160,.5)":"rgba(255,255,255,.05)"}`}}>
                      <div className="flex-between" style={{marginBottom:8}}>
                        <div style={{fontSize:12,fontWeight:700,color:t.winner===cap.v?"#7eb8f7":"#64748b"}}>{cap.l}{t.winner===cap.v?" 🏆":""}</div>
                        <button className="btn btn-ghost btn-xs" onClick={()=>setTests(p=>p.map(x=>x.id===t.id?{...x,winner:x.winner===cap.v?null:cap.v}:x))}><ThumbsUp size={10}/>Winner</button>
                      </div>
                      <div style={{fontSize:12,color:"#64748b",lineHeight:1.6}}>{cap.c.slice(0,130)}{cap.c.length>130?"…":""}</div>
                    </div>
                  ))}
                </div>
                {t.aiAnalysis&&(
                  <div style={{marginTop:10,background:"rgba(26,90,160,.06)",border:"1px solid rgba(26,90,160,.2)",borderRadius:9,padding:12}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#1a5aa0",marginBottom:6,textTransform:"uppercase",letterSpacing:".7px"}}>🤖 AI Analysis</div>
                    <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.75,whiteSpace:"pre-wrap"}}>{t.aiAnalysis}</div>
                  </div>
                )}
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
};

// ─── LISTING LANDING PAGE ─────────────────────────────────────────────────────
const LandingPage = ({setPage,toast}) => {
  const [pg,setPg] = useLS("listing_page",{agentName:"Your Name",brokerage:"",bio:"",phone:"",email:"",links:[],theme:"navy"});
  const [lf,setLf] = useState({label:"",url:"",emoji:"🏠"});

  const TH={
    navy:{bg:"#061020",card:"rgba(255,255,255,.06)",text:"#e8f4ff",btn:"#1a5aa0",btnTxt:"#fff"},
    gold:{bg:"#1a0f00",card:"rgba(255,255,255,.06)",text:"#fef3c7",btn:"#d4a017",btnTxt:"#000"},
    slate:{bg:"#0f172a",card:"rgba(255,255,255,.05)",text:"#e2e8f0",btn:"#475569",btnTxt:"#fff"},
    light:{bg:"#f8fafc",card:"#ffffff",text:"#0f172a",btn:"#1a5aa0",btnTxt:"#fff"},
  };
  const th=TH[pg.theme]||TH.navy;

  const quickLinks = [
    {emoji:"🏠",label:"Search Listings",url:"https://"},
    {emoji:"📊",label:"Home Valuation",url:"https://"},
    {emoji:"📞",label:"Schedule a Call",url:"https://calendly.com/"},
    {emoji:"⭐",label:"Client Reviews",url:"https://"},
  ];

  return (
    <div className="page-content">
      <PageHeader title="Listing Landing Page" sub="Your link-in-bio agent profile page" setPage={setPage} parent="dashboard"/>
      <div className="grid-2" style={{gap:22}}>
        <div className="col">
          <div className="glass-card">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:16,fontFamily:"'DM Serif Display',serif"}}>Agent Profile</div>
            <div className="col">
              <div><div className="label">Your Name</div><input className="input" value={pg.agentName} onChange={e=>setPg(p=>({...p,agentName:e.target.value}))}/></div>
              <div><div className="label">Brokerage</div><input className="input" placeholder="Keller Williams, RE/MAX..." value={pg.brokerage} onChange={e=>setPg(p=>({...p,brokerage:e.target.value}))}/></div>
              <div><div className="label">Tagline / Bio</div><textarea className="textarea" style={{minHeight:70}} placeholder="Your specialties, areas served, years of experience..." value={pg.bio} onChange={e=>setPg(p=>({...p,bio:e.target.value}))}/></div>
              <div className="grid-2" style={{gap:8}}>
                <div><div className="label">Phone</div><input className="input" placeholder="(555) 000-0000" value={pg.phone} onChange={e=>setPg(p=>({...p,phone:e.target.value}))}/></div>
                <div><div className="label">Email</div><input className="input" placeholder="agent@email.com" value={pg.email} onChange={e=>setPg(p=>({...p,email:e.target.value}))}/></div>
              </div>
              <div><div className="label">Theme</div>
                <div style={{display:"flex",gap:6}}>
                  {Object.keys(TH).map(k=><button key={k} className={`badge ${pg.theme===k?"badge-blue":"badge-gray"}`} style={{cursor:"pointer",border:"none",padding:"5px 11px",textTransform:"capitalize"}} onClick={()=>setPg(p=>({...p,theme:k}))}>{k}</button>)}
                </div>
              </div>
            </div>
          </div>
          <div className="glass-card">
            <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:14}}>Links</div>
            <div style={{marginBottom:10}}>
              <div className="label">Quick Add</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
                {quickLinks.map(l=><button key={l.label} className="btn btn-ghost btn-xs" onClick={()=>setPg(p=>({...p,links:[...p.links,{id:uid(),...l}]}))}>{l.emoji} {l.label}</button>)}
              </div>
            </div>
            <div className="col" style={{marginBottom:12}}>
              <div style={{display:"flex",gap:8}}><input className="input" style={{width:70,flexShrink:0}} placeholder="Emoji" value={lf.emoji} onChange={e=>setLf(f=>({...f,emoji:e.target.value}))}/><input className="input" placeholder="Label" value={lf.label} onChange={e=>setLf(f=>({...f,label:e.target.value}))}/></div>
              <input className="input" placeholder="https://..." value={lf.url} onChange={e=>setLf(f=>({...f,url:e.target.value}))}/>
              <button className="btn btn-blue btn-sm" onClick={()=>{if(!lf.label||!lf.url)return toast.error("Label and URL required");setPg(p=>({...p,links:[...p.links,{id:uid(),...lf}]}));setLf({label:"",url:"",emoji:"🏠"});toast.success("Link added!");}}>
                <Plus size={13}/>Add Link
              </button>
            </div>
            {pg.links.map(l=>(
              <div key={l.id} className="row-item" style={{marginBottom:6}}>
                <span style={{fontSize:18}}>{l.emoji}</span>
                <div style={{flex:1}}><div style={{fontSize:13,color:"#94a3b8"}}>{l.label}</div><div style={{fontSize:11,color:"#374151",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.url}</div></div>
                <button className="btn btn-danger btn-icon btn-xs" onClick={()=>setPg(p=>({...p,links:p.links.filter(x=>x.id!==l.id)}))}><Trash2 size={11}/></button>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:"#475569",textTransform:"uppercase",letterSpacing:"1px",marginBottom:12}}>Live Preview</div>
          <div style={{background:th.bg,borderRadius:22,padding:36,minHeight:550,display:"flex",flexDirection:"column",alignItems:"center",border:"1px solid rgba(255,255,255,.08)",boxShadow:"0 20px 60px rgba(0,0,0,.4)"}}>
            <div style={{width:90,height:90,borderRadius:"50%",background:"linear-gradient(135deg,#1a5aa0,#d4a017)",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28,fontWeight:900,color:"#fff",boxShadow:"0 8px 30px rgba(26,90,160,.4)",fontFamily:"'DM Serif Display',serif"}}>
              {(pg.agentName||"A").charAt(0)}
            </div>
            <div style={{fontSize:22,fontWeight:900,color:th.text,marginBottom:2,fontFamily:"'DM Serif Display',serif"}}>{pg.agentName||"Your Name"}</div>
            {pg.brokerage&&<div style={{fontSize:13,color:th.text,opacity:.5,marginBottom:4}}>{pg.brokerage}</div>}
            {pg.bio&&<div style={{fontSize:12,color:th.text,opacity:.5,textAlign:"center",marginBottom:20,maxWidth:260,lineHeight:1.6}}>{pg.bio}</div>}
            {(pg.phone||pg.email)&&(
              <div style={{display:"flex",gap:12,marginBottom:20,fontSize:12,color:th.text,opacity:.55}}>
                {pg.phone&&<span>📞 {pg.phone}</span>}
                {pg.email&&<span>✉ {pg.email}</span>}
              </div>
            )}
            <div style={{width:"100%",maxWidth:300,display:"flex",flexDirection:"column",gap:10}}>
              {pg.links.map(l=>(
                <a key={l.id} href={l.url} target="_blank" rel="noreferrer" style={{display:"flex",alignItems:"center",gap:10,background:th.btn,color:th.btnTxt,borderRadius:13,padding:"14px 18px",textDecoration:"none",fontWeight:700,fontSize:14}}>
                  <span style={{fontSize:18}}>{l.emoji}</span>{l.label}
                </a>
              ))}
              {pg.links.length===0&&<div style={{textAlign:"center",fontSize:13,color:th.text,opacity:.2}}>Add links above to see them here</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── PROSPECTING HUB ──────────────────────────────────────────────────────────
const PROSP_FIELDS = [
  {id:"calls",label:"Calls Made",color:"#7eb8f7",icon:"📞"},
  {id:"texts",label:"Texts Sent",color:"#a78bfa",icon:"💬"},
  {id:"emails",label:"Emails Sent",color:"#6ee7b7",icon:"✉️"},
  {id:"doors",label:"Doors Knocked",color:"#fcd34d",icon:"🚪"},
  {id:"appointments",label:"Appointments Set",color:"#f9a8d4",icon:"📅"},
  {id:"showings",label:"Showings Booked",color:"#fb923c",icon:"🏠"},
];

const ProspectingHub = ({setPage, toast}) => {
  const [log, setLog] = useLS("prospecting_log", []);
  const [goals, setGoals] = useLS("prospecting_goals", {calls:20,texts:15,emails:10,doors:0,appointments:3,showings:5});
  const [form, setForm] = useState({date:new Date().toISOString().slice(0,10),calls:"",texts:"",emails:"",doors:"",appointments:"",showings:"",notes:""});
  const [tab, setTab] = useState("log");

  const todayStr = new Date().toISOString().slice(0,10);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate()-weekStart.getDay());
  const weekLog = log.filter(e=>new Date(e.date)>=weekStart);
  const todayLog = log.find(e=>e.date===todayStr);

  const saveEntry = () => {
    const hasData = PROSP_FIELDS.some(f=>Number(form[f.id])>0);
    if(!hasData) return toast.error("Enter at least one activity");
    const entry = {...form, id:uid(), createdAt:now()};
    const exists = log.findIndex(e=>e.date===form.date);
    if(exists>=0) {
      setLog(p=>p.map((e,i)=>i===exists?{...e,...form}:e));
      toast.success("Activity updated");
    } else {
      setLog(p=>[entry,...p]);
      toast.success("Activity logged!");
    }
  };

  const weekTotal = (field) => weekLog.reduce((s,e)=>s+(Number(e[field])||0),0);

  return (
    <div className="page-content">
      <PageHeader title="Prospecting Hub" sub="Track daily activities and hit your weekly goals" setPage={setPage} parent="dashboard"/>

      <div style={{display:"grid",gridTemplateColumns:"repeat(6,1fr)",gap:10,marginBottom:24}}>
        {PROSP_FIELDS.map(f=>{
          const val = weekTotal(f.id);
          const goal = Number(goals[f.id])||0;
          const pct = goal>0?Math.min(100,Math.round((val/goal)*100)):0;
          return (
            <div key={f.id} className="glass-card" style={{padding:16,textAlign:"center"}}>
              <div style={{fontSize:20,marginBottom:6}}>{f.icon}</div>
              <div style={{fontSize:26,fontWeight:900,color:f.color,fontFamily:"'DM Serif Display',serif"}}>{val}</div>
              <div style={{fontSize:10,color:"#475569",fontWeight:700,textTransform:"uppercase",letterSpacing:".4px",marginBottom:8}}>{f.label}</div>
              {goal>0&&<>
                <div style={{background:"rgba(255,255,255,.06)",borderRadius:99,height:4}}>
                  <div style={{background:f.color,height:4,borderRadius:99,width:`${pct}%`,transition:"width .4s"}}/>
                </div>
                <div style={{fontSize:10,color:"#475569",marginTop:4}}>{val}/{goal} goal</div>
              </>}
            </div>
          );
        })}
      </div>

      <div className="tabs" style={{marginBottom:20}}>
        {["log","goals","history"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)} style={{textTransform:"capitalize"}}>{t==="log"?"Log Today":t==="goals"?"Weekly Goals":"History"}</button>)}
      </div>

      {tab==="log"&&(
        <div className="glass-card" style={{maxWidth:680}}>
          <div style={{fontWeight:800,fontSize:15,color:"#fff",marginBottom:4}}>Log Your Activity</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>{todayLog?"Today's activity logged — update below":"Nothing logged today yet"}</div>
          <div style={{marginBottom:12}}><div className="label">Date</div><input className="input" type="date" value={form.date} onChange={e=>setForm(f=>({...f,date:e.target.value}))}/></div>
          <div className="grid-3" style={{gap:10,marginBottom:14}}>
            {PROSP_FIELDS.map(f=>(
              <div key={f.id}>
                <div className="label" style={{color:f.color}}>{f.icon} {f.label}</div>
                <input className="input" type="number" min="0" placeholder="0" value={form[f.id]} onChange={e=>setForm(p=>({...p,[f.id]:e.target.value}))}/>
              </div>
            ))}
          </div>
          <div style={{marginBottom:14}}><div className="label">Notes</div><input className="input" placeholder="What worked today? Any hot leads?" value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          <button className="btn btn-blue" onClick={saveEntry}><Save size={13}/>Save Activity</button>
        </div>
      )}

      {tab==="goals"&&(
        <div className="glass-card" style={{maxWidth:480}}>
          <div style={{fontWeight:800,fontSize:15,color:"#fff",marginBottom:4}}>Weekly Goals</div>
          <div style={{fontSize:13,color:"#64748b",marginBottom:16}}>Set your weekly targets for each activity</div>
          <div className="grid-2" style={{gap:12}}>
            {PROSP_FIELDS.map(f=>(
              <div key={f.id}>
                <div className="label" style={{color:f.color}}>{f.icon} {f.label}</div>
                <input className="input" type="number" min="0" value={goals[f.id]||""} onChange={e=>setGoals(g=>({...g,[f.id]:e.target.value}))}/>
              </div>
            ))}
          </div>
          <button className="btn btn-blue" style={{marginTop:16}} onClick={()=>toast.success("Goals saved!")}><Save size={13}/>Save Goals</button>
        </div>
      )}

      {tab==="history"&&(
        log.length===0
          ? <div className="glass-card"><EmptyState icon={BarChart3} title="No history yet" desc="Start logging daily and your history will appear here"/></div>
          : <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {[...log].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,30).map(e=>(
              <div key={e.id} className="glass-card" style={{padding:"14px 18px"}}>
                <div className="flex-between">
                  <div style={{fontWeight:700,color:"#fff",fontSize:14}}>{new Date(e.date+"T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}</div>
                  <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                    {PROSP_FIELDS.filter(f=>Number(e[f.id])>0).map(f=>(
                      <span key={f.id} style={{fontSize:12,color:f.color,fontWeight:700}}>{f.icon} {e[f.id]} {f.label.split(" ")[0]}</span>
                    ))}
                  </div>
                </div>
                {e.notes&&<div style={{fontSize:12,color:"#475569",marginTop:6,fontStyle:"italic"}}>{e.notes}</div>}
              </div>
            ))}
          </div>
      )}
    </div>
  );
};

// ─── SOI MANAGER ──────────────────────────────────────────────────────────────
const SOIManager = ({setPage, toast}) => {
  const [contacts, setContacts] = useLS("soi_contacts", []);
  const [leads] = useLS("leads", []);
  const [form, setForm] = useState({name:"",phone:"",email:"",relationship:"Past Client",frequency:"Quarterly",lastContact:"",notes:"",birthday:""});
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("needs-touch");

  const importFromFUB = () => {
    const pastClients = leads.filter(l=>l.status==="Past Client"&&l.name&&l.name!=="Unknown");
    const existingNames = new Set(contacts.map(c=>c.name));
    const newContacts = pastClients.filter(l=>!existingNames.has(l.name)).map(l=>({
      id:uid(), name:l.name, phone:l.phone||"", email:l.email||"", relationship:"Past Client",
      frequency:"Quarterly", lastContact:"", notes:"", birthday:"", createdAt:now(), source:"fub"
    }));
    if(newContacts.length===0) return toast.info("All FUB past clients already imported");
    setContacts(p=>[...newContacts,...p]);
    toast.success(`Imported ${newContacts.length} past clients from FUB`);
  };

  const FREQ_DAYS = {Monthly:30,Quarterly:90,Biannually:180,Annually:365};
  const needsTouch = (c) => {
    if(!c.lastContact) return true;
    const days = (Date.now()-new Date(c.lastContact))/(1000*60*60*24);
    return days >= (FREQ_DAYS[c.frequency]||90);
  };
  const daysOverdue = (c) => {
    if(!c.lastContact) return 999;
    return Math.floor((Date.now()-new Date(c.lastContact))/(1000*60*60*24));
  };

  const logTouch = (id) => {
    setContacts(p=>p.map(c=>c.id===id?{...c,lastContact:new Date().toISOString().slice(0,10)}:c));
    toast.success("Touch logged!");
  };

  const save = () => {
    if(!form.name.trim()) return toast.error("Name required");
    if(editId) { setContacts(p=>p.map(c=>c.id===editId?{...c,...form}:c)); toast.success("Updated"); setEditId(null); }
    else { setContacts(p=>[{id:uid(),...form,createdAt:now()},...p]); toast.success("Contact added"); }
    setForm({name:"",phone:"",email:"",relationship:"Past Client",frequency:"Quarterly",lastContact:"",notes:"",birthday:""});
    setShowForm(false);
  };

  const needsTouchList = contacts.filter(c=>needsTouch(c)).sort((a,b)=>daysOverdue(b)-daysOverdue(a));
  const upToDate = contacts.filter(c=>!needsTouch(c));
  const displayed = filter==="needs-touch"?needsTouchList:filter==="up-to-date"?upToDate:contacts;

  return (
    <div className="page-content">
      <PageHeader title="SOI Manager" sub="Sphere of Influence — stay top of mind with every past client" setPage={setPage} parent="dashboard"
        action={<div style={{display:"flex",gap:8}}>
          <button className="btn btn-ghost btn-sm" onClick={importFromFUB}><RefreshCw size={12}/>Import Past Clients</button>
          <button className="btn btn-blue btn-sm" onClick={()=>{setShowForm(true);setEditId(null);}}><Plus size={13}/>Add Contact</button>
        </div>}
      />

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:24}}>
        {[
          {label:"Total SOI",val:contacts.length,color:"#7eb8f7"},
          {label:"Need a Touch",val:needsTouchList.length,color:"#f87171"},
          {label:"Up to Date",val:upToDate.length,color:"#6ee7b7"},
        ].map(s=>(
          <div key={s.label} className="glass-card" style={{textAlign:"center",padding:18}}>
            <div style={{fontSize:32,fontWeight:900,color:s.color,fontFamily:"'DM Serif Display',serif"}}>{s.val}</div>
            <div style={{fontSize:12,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginTop:4}}>{s.label}</div>
          </div>
        ))}
      </div>

      {showForm&&(
        <div className="glass-card" style={{marginBottom:20}}>
          <div className="flex-between" style={{marginBottom:14}}>
            <div style={{fontWeight:800,color:"#fff"}}>{editId?"Edit Contact":"Add SOI Contact"}</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setShowForm(false);setEditId(null);}}><X size={13}/>Cancel</button>
          </div>
          <div className="grid-2" style={{gap:10}}>
            <div><div className="label">Name *</div><input className="input" value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/></div>
            <div><div className="label">Relationship</div>
              <select className="select" value={form.relationship} onChange={e=>setForm(f=>({...f,relationship:e.target.value}))}>
                {["Past Client","Friend","Family","Neighbor","Colleague","Referral Partner"].map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div><div className="label">Phone</div><input className="input" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))}/></div>
            <div><div className="label">Email</div><input className="input" type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))}/></div>
            <div><div className="label">Follow-up Frequency</div>
              <select className="select" value={form.frequency} onChange={e=>setForm(f=>({...f,frequency:e.target.value}))}>
                {["Monthly","Quarterly","Biannually","Annually"].map(r=><option key={r}>{r}</option>)}
              </select>
            </div>
            <div><div className="label">Birthday</div><input className="input" type="date" value={form.birthday} onChange={e=>setForm(f=>({...f,birthday:e.target.value}))}/></div>
            <div><div className="label">Last Contact</div><input className="input" type="date" value={form.lastContact} onChange={e=>setForm(f=>({...f,lastContact:e.target.value}))}/></div>
            <div><div className="label">Notes</div><input className="input" placeholder="How you know them, preferences..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <button className="btn btn-blue" style={{marginTop:14}} onClick={save}><Save size={13}/>{editId?"Update":"Add"}</button>
        </div>
      )}

      <div className="tabs" style={{marginBottom:16}}>
        {[{id:"needs-touch",label:`Needs Touch (${needsTouchList.length})`},{id:"up-to-date",label:`Up to Date (${upToDate.length})`},{id:"all",label:`All (${contacts.length})`}].map(t=>(
          <button key={t.id} className={`tab ${filter===t.id?"active":""}`} onClick={()=>setFilter(t.id)}>{t.label}</button>
        ))}
      </div>

      {displayed.length===0
        ? <div className="glass-card"><EmptyState icon={Heart} title={filter==="needs-touch"?"You're all caught up!":"No contacts yet"} desc={filter==="needs-touch"?"Great job — everyone has been touched recently":"Import past clients from FUB or add manually"}/></div>
        : <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {displayed.map(c=>{
            const overdue = daysOverdue(c);
            const needs = needsTouch(c);
            return (
              <div key={c.id} className="glass-card" style={{borderLeft:`3px solid ${needs?"#f87171":"#10b981"}`}}>
                <div className="flex-between">
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:4}}>
                      <div style={{fontWeight:800,fontSize:15,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>{c.name}</div>
                      <span className="badge badge-gray">{c.relationship}</span>
                      <span className="badge badge-blue" style={{fontSize:10}}>{c.frequency}</span>
                    </div>
                    <div style={{display:"flex",gap:16,fontSize:12,color:"#64748b"}}>
                      {c.phone&&<span>📞 {c.phone}</span>}
                      {c.email&&<span>✉ {c.email}</span>}
                      {c.lastContact?<span style={{color:needs?"#f87171":"#6ee7b7"}}>{needs?`${overdue}d since last touch`:`Last touched ${overdue}d ago`}</span>:<span style={{color:"#f87171"}}>Never contacted</span>}
                    </div>
                    {c.notes&&<div style={{fontSize:12,color:"#475569",marginTop:4,fontStyle:"italic"}}>{c.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,marginLeft:12,flexShrink:0}}>
                    <button className="btn btn-green btn-sm" onClick={()=>logTouch(c.id)}><Check size={12}/>Touched</button>
                    <button className="btn btn-ghost btn-icon btn-xs" onClick={()=>{setEditId(c.id);setForm(c);setShowForm(true);}}><Edit3 size={12}/></button>
                    <button className="btn btn-danger btn-icon btn-xs" onClick={()=>setContacts(p=>p.filter(x=>x.id!==c.id))}><Trash2 size={12}/></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
};

// ─── LISTING TRACKER ──────────────────────────────────────────────────────────
const ListingTracker = ({setPage, toast}) => {
  const [listings, setListings] = useLS("active_listings", []);
  const [form, setForm] = useState({address:"",listPrice:"",listDate:"",status:"Active",beds:"",baths:"",sqft:"",mlsNum:"",notes:"",showingCount:0,priceReductions:0});
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("Active");

  const dom = (listDate) => listDate ? Math.floor((Date.now()-new Date(listDate))/(1000*60*60*24)) : null;

  const save = () => {
    if(!form.address.trim()) return toast.error("Address required");
    if(editId) { setListings(p=>p.map(l=>l.id===editId?{...l,...form}:l)); toast.success("Listing updated"); setEditId(null); }
    else { setListings(p=>[{id:uid(),...form,createdAt:now()},...p]); toast.success("Listing added"); }
    setForm({address:"",listPrice:"",listDate:"",status:"Active",beds:"",baths:"",sqft:"",mlsNum:"",notes:"",showingCount:0,priceReductions:0});
    setShowForm(false);
  };

  const logShowing = (id) => setListings(p=>p.map(l=>l.id===id?{...l,showingCount:(Number(l.showingCount)||0)+1}:l));
  const logPriceReduction = (id) => setListings(p=>p.map(l=>l.id===id?{...l,priceReductions:(Number(l.priceReductions)||0)+1}:l));

  const filtered = listings.filter(l=>filter==="all"||l.status===filter);
  const activeCount = listings.filter(l=>l.status==="Active").length;
  const avgDOM = listings.filter(l=>l.listDate&&l.status==="Active").reduce((s,l,_,a)=>s+dom(l.listDate)/a.length,0)||0;

  return (
    <div className="page-content">
      <PageHeader title="Listing Tracker" sub={`${activeCount} active listings · avg ${Math.round(avgDOM)} DOM`} setPage={setPage} parent="dashboard"
        action={<button className="btn btn-blue" onClick={()=>{setShowForm(true);setEditId(null);}}><Plus size={13}/>Add Listing</button>}
      />

      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:24}}>
        {[
          {label:"Active",val:activeCount,color:"#7eb8f7"},
          {label:"Under Contract",val:listings.filter(l=>l.status==="Under Contract").length,color:"#f59e0b"},
          {label:"Sold",val:listings.filter(l=>l.status==="Sold").length,color:"#6ee7b7"},
          {label:"Avg DOM",val:`${Math.round(avgDOM)}d`,color:"#a78bfa"},
        ].map(s=>(
          <div key={s.label} className="glass-card" style={{textAlign:"center",padding:16}}>
            <div style={{fontSize:28,fontWeight:900,color:s.color,fontFamily:"'DM Serif Display',serif"}}>{s.val}</div>
            <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginTop:4}}>{s.label}</div>
          </div>
        ))}
      </div>

      {showForm&&(
        <div className="glass-card" style={{marginBottom:20}}>
          <div className="flex-between" style={{marginBottom:14}}>
            <div style={{fontWeight:800,color:"#fff"}}>{editId?"Edit Listing":"Add Listing"}</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setShowForm(false);setEditId(null);}}><X size={13}/>Cancel</button>
          </div>
          <div className="grid-2" style={{gap:10}}>
            <div><div className="label">Address *</div><input className="input" placeholder="123 Main St, Livonia MI" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
            <div><div className="label">MLS #</div><input className="input" placeholder="23456789" value={form.mlsNum} onChange={e=>setForm(f=>({...f,mlsNum:e.target.value}))}/></div>
            <div><div className="label">List Price</div><input className="input" type="number" placeholder="350000" value={form.listPrice} onChange={e=>setForm(f=>({...f,listPrice:e.target.value}))}/></div>
            <div><div className="label">List Date</div><input className="input" type="date" value={form.listDate} onChange={e=>setForm(f=>({...f,listDate:e.target.value}))}/></div>
            <div><div className="label">Status</div>
              <select className="select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                {["Active","Under Contract","Sold","Expired","Withdrawn"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div><div className="label">Beds / Baths / Sqft</div>
              <div style={{display:"flex",gap:6}}>
                <input className="input" type="number" placeholder="Bd" value={form.beds} onChange={e=>setForm(f=>({...f,beds:e.target.value}))} style={{width:"33%"}}/>
                <input className="input" type="number" placeholder="Ba" value={form.baths} onChange={e=>setForm(f=>({...f,baths:e.target.value}))} style={{width:"33%"}}/>
                <input className="input" type="number" placeholder="Sqft" value={form.sqft} onChange={e=>setForm(f=>({...f,sqft:e.target.value}))} style={{width:"34%"}}/>
              </div>
            </div>
            <div style={{gridColumn:"1/-1"}}><div className="label">Notes</div><input className="input" placeholder="Seller situation, showing instructions, key details..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <button className="btn btn-blue" style={{marginTop:14}} onClick={save}><Save size={13}/>{editId?"Update":"Add Listing"}</button>
        </div>
      )}

      <div className="tabs" style={{marginBottom:16}}>
        {["Active","Under Contract","Sold","Expired","all"].map(s=>(
          <button key={s} className={`tab ${filter===s?"active":""}`} onClick={()=>setFilter(s)}>
            {s==="all"?"All":s} ({s==="all"?listings.length:listings.filter(l=>l.status===s).length})
          </button>
        ))}
      </div>

      {filtered.length===0
        ? <div className="glass-card"><EmptyState icon={Home} title="No listings" desc="Add your active listings to track DOM, showings, and price reductions"/></div>
        : <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {filtered.map(l=>{
            const days = dom(l.listDate);
            const domAlert = days>60?"#f87171":days>30?"#f59e0b":"#6ee7b7";
            return (
              <div key={l.id} className="glass-card">
                <div className="flex-between" style={{marginBottom:10}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:16,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>{l.address}</div>
                    <div style={{fontSize:13,color:"#94a3b8",marginTop:2}}>
                      {l.mlsNum&&<span>MLS# {l.mlsNum} · </span>}
                      {l.beds&&`${l.beds}bd `}{l.baths&&`${l.baths}ba `}{l.sqft&&`${Number(l.sqft).toLocaleString()} sqft`}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {l.listPrice&&<span style={{fontWeight:800,fontSize:16,color:"#6ee7b7"}}>${Number(l.listPrice).toLocaleString()}</span>}
                    {days!=null&&<span style={{fontSize:13,fontWeight:800,color:domAlert}}>{days} DOM</span>}
                    <span className={`badge ${l.status==="Active"?"badge-blue":l.status==="Under Contract"?"badge-gold":l.status==="Sold"?"badge-green":"badge-gray"}`}>{l.status}</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{display:"flex",gap:16,flex:1}}>
                    <span style={{fontSize:13,color:"#94a3b8"}}>🏠 <strong style={{color:"#fff"}}>{l.showingCount||0}</strong> showings</span>
                    <span style={{fontSize:13,color:"#94a3b8"}}>📉 <strong style={{color:Number(l.priceReductions)>0?"#f87171":"#fff"}}>{l.priceReductions||0}</strong> price reductions</span>
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn btn-ghost btn-xs" onClick={()=>logShowing(l.id)}>+ Showing</button>
                    <button className="btn btn-ghost btn-xs" onClick={()=>logPriceReduction(l.id)}>+ Price Cut</button>
                    <button className="btn btn-ghost btn-icon btn-xs" onClick={()=>{setEditId(l.id);setForm(l);setShowForm(true);}}><Edit3 size={12}/></button>
                    <button className="btn btn-danger btn-icon btn-xs" onClick={()=>setListings(p=>p.filter(x=>x.id!==l.id))}><Trash2 size={12}/></button>
                  </div>
                </div>
                {l.notes&&<div style={{fontSize:12,color:"#475569",marginTop:8,fontStyle:"italic"}}>{l.notes}</div>}
              </div>
            );
          })}
        </div>
      }
    </div>
  );
};

// ─── SOCIAL CONNECT ───────────────────────────────────────────────────────────
const SocialConnect = ({setPage, toast}) => {
  const [settings] = useLS("integrations", {});
  const [stats, setStats] = useLS("social_stats", {});
  const [post, setPost] = useState({caption:"", platforms:["facebook","instagram"], mediaUrl:"", mediaType:"image"});
  const [posting, setPosting] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [tab, setTab] = useState("overview");

  const meta = settings.meta || {};
  const hasMetaToken = !!(meta.accessToken && meta.pageId);

  const fetchStats = async () => {
    if(!hasMetaToken) return toast.error("Add your Facebook Page Access Token in Integrations first");
    setLoadingStats(true);
    try {
      const [pageRes, igRes] = await Promise.all([
        fetch(`https://graph.facebook.com/v19.0/${meta.pageId}?fields=name,fan_count,followers_count,picture&access_token=${meta.accessToken}`),
        meta.igAccountId ? fetch(`https://graph.facebook.com/v19.0/${meta.igAccountId}?fields=name,followers_count,media_count,profile_picture_url&access_token=${meta.accessToken}`) : Promise.resolve(null),
      ]);
      const pageData = await pageRes.json();
      if(pageData.error) throw new Error(pageData.error.message);
      const igData = igRes ? await igRes.json() : null;
      setStats(prev => ({
        ...prev,
        facebook: { followers: pageData.fan_count||0, name: pageData.name, updatedAt: Date.now() },
        instagram: igData && !igData.error ? { followers: igData.followers_count||0, posts: igData.media_count||0, name: igData.name, updatedAt: Date.now() } : prev.instagram,
      }));
      toast.success("Stats refreshed!");
    } catch(e) { toast.error(`Error: ${e.message}`); }
    setLoadingStats(false);
  };

  const postToMeta = async () => {
    if(!hasMetaToken) return toast.error("Add your Facebook token in Integrations first");
    if(!post.caption.trim()) return toast.error("Write a caption first");
    setPosting(true);
    try {
      const { results } = await publishPostToMeta({
        caption: post.caption,
        platforms: post.platforms,
        mediaUrl: post.mediaUrl,
        mediaType: post.mediaType,
      }, meta);
      const summary = results.map(r => r.ok ? `${r.platform}: posted!` : `${r.platform}: ${r.error}`).join(" · ");
      const anyOk = results.some(r => r.ok);
      const anyErr = results.some(r => !r.ok);
      if (anyOk && !anyErr) toast.success(summary);
      else if (anyOk && anyErr) toast.info(summary);
      else toast.error(summary || "Nothing was posted");
      if (anyOk) setPost(p => ({...p, caption:"", mediaUrl:""}));
    } catch(e) { toast.error(`Post failed: ${e.message}`); }
    setPosting(false);
  };

  const StatCard = ({platform, icon, color, data}) => (
    <div className="glass-card" style={{borderTop:`3px solid ${color}`}}>
      <div className="flex-between" style={{marginBottom:12}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:24}}>{icon}</span>
          <div>
            <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{platform}</div>
            {data?.name&&<div style={{fontSize:12,color:"#94a3b8"}}>@{data.name}</div>}
          </div>
        </div>
        {data?.updatedAt&&<span style={{fontSize:11,color:"#475569"}}>Updated {Math.round((Date.now()-data.updatedAt)/60000)}m ago</span>}
      </div>
      {data ? (
        <div className="grid-2" style={{gap:12}}>
          <div style={{textAlign:"center",padding:"14px",background:"rgba(255,255,255,.04)",borderRadius:10}}>
            <div style={{fontSize:28,fontWeight:900,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>{(data.followers||0).toLocaleString()}</div>
            <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginTop:4}}>Followers</div>
          </div>
          {data.posts!=null&&<div style={{textAlign:"center",padding:"14px",background:"rgba(255,255,255,.04)",borderRadius:10}}>
            <div style={{fontSize:28,fontWeight:900,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>{data.posts}</div>
            <div style={{fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:".5px",marginTop:4}}>Posts</div>
          </div>}
        </div>
      ) : (
        <div style={{fontSize:13,color:"#475569",textAlign:"center",padding:"16px 0"}}>
          {hasMetaToken ? "Hit Refresh Stats to load" : "Connect in Integrations first"}
        </div>
      )}
    </div>
  );

  return (
    <div className="page-content">
      <PageHeader title="Social Connect" sub="Manage and post to all your social platforms" setPage={setPage} parent="dashboard"
        action={<button className="btn btn-ghost btn-sm" onClick={fetchStats} disabled={loadingStats}><RefreshCw size={12} style={loadingStats?{animation:"spin 1s linear infinite"}:{}}/>{loadingStats?"Loading…":"Refresh Stats"}</button>}
      />

      <div className="tabs" style={{marginBottom:20}}>
        {["overview","post","tiktok"].map(t=><button key={t} className={`tab ${tab===t?"active":""}`} onClick={()=>setTab(t)} style={{textTransform:"capitalize"}}>{t==="tiktok"?"TikTok Setup":t==="post"?"Post Content":"Overview"}</button>)}
      </div>

      {tab==="overview"&&(
        <div className="grid-2" style={{gap:16}}>
          <StatCard platform="Facebook" icon="📘" color="#1877f2" data={stats.facebook}/>
          <StatCard platform="Instagram" icon="📸" color="#e1306c" data={stats.instagram}/>
          <div className="glass-card" style={{borderTop:"3px solid #000",gridColumn:"1/-1"}}>
            <div style={{fontWeight:800,fontSize:15,color:"#fff",marginBottom:8}}>TikTok</div>
            <div style={{fontSize:13,color:"#94a3b8"}}>See TikTok Setup tab for connection instructions.</div>
          </div>
        </div>
      )}

      {tab==="post"&&(
        <div className="glass-card" style={{maxWidth:680}}>
          <div style={{fontWeight:800,fontSize:15,color:"#fff",marginBottom:16}}>Post to Social Media</div>
          {!hasMetaToken&&<div className="info-banner" style={{marginBottom:16,background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.2)",color:"#fca5a5"}}><AlertCircle size={14}/>Add your Facebook token in <button className="btn btn-ghost btn-sm" style={{padding:"2px 8px"}} onClick={()=>setPage("integrations")}>Integrations</button> first</div>}
          <div className="label" style={{marginBottom:8}}>Platforms</div>
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            {[{id:"facebook",label:"Facebook",color:"#1877f2"},{id:"instagram",label:"Instagram",color:"#e1306c"}].map(p=>(
              <button key={p.id} onClick={()=>setPost(prev=>({...prev,platforms:prev.platforms.includes(p.id)?prev.platforms.filter(x=>x!==p.id):[...prev.platforms,p.id]}))}
                style={{padding:"8px 16px",borderRadius:9,fontWeight:700,fontSize:13,cursor:"pointer",border:`2px solid ${post.platforms.includes(p.id)?p.color:"rgba(255,255,255,.1)"}`,background:post.platforms.includes(p.id)?`${p.color}22`:"transparent",color:post.platforms.includes(p.id)?p.color:"#64748b"}}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="label" style={{marginBottom:8}}>Caption</div>
          <textarea className="textarea" style={{minHeight:140}} placeholder="Write your post..." value={post.caption} onChange={e=>setPost(p=>({...p,caption:e.target.value}))}/>

          <div style={{display:"grid",gridTemplateColumns:"2fr 1fr",gap:10,marginTop:14}}>
            <div>
              <div className="label" style={{marginBottom:6}}>Media URL <span style={{fontWeight:500,color:"#475569"}}>{post.platforms.includes("instagram")?"(required for IG)":"(optional)"}</span></div>
              <input className="input" placeholder="https://… public image or video URL" value={post.mediaUrl} onChange={e=>setPost(p=>({...p,mediaUrl:e.target.value}))}/>
            </div>
            <div>
              <div className="label" style={{marginBottom:6}}>Media Type</div>
              <select className="select" value={post.mediaType} onChange={e=>setPost(p=>({...p,mediaType:e.target.value}))}>
                <option value="image">Image / Photo</option>
                <option value="video">Video / Reel</option>
              </select>
            </div>
          </div>
          {post.platforms.includes("instagram") && !post.mediaUrl && (
            <div style={{fontSize:11,color:"#f59e0b",marginTop:8}}>⚠ Instagram requires a public image or video URL — text-only posts aren't supported by Meta's API.</div>
          )}

          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12}}>
            <span style={{fontSize:12,color:"#475569"}}>{post.caption.length} characters</span>
            <button className="btn btn-blue" onClick={postToMeta} disabled={posting||!hasMetaToken}><Send size={13}/>{posting?"Posting…":"Post Now"}</button>
          </div>
        </div>
      )}

      {tab==="tiktok"&&(
        <div className="glass-card" style={{maxWidth:680}}>
          <div style={{fontWeight:800,fontSize:18,color:"#fff",marginBottom:6}}>Connect TikTok</div>
          <div style={{fontSize:13,color:"#94a3b8",marginBottom:20}}>TikTok requires you to apply for API access through their developer program. Here's exactly how:</div>
          {[
            {n:"1",t:"Create a TikTok Developer Account",d:'Go to developers.tiktok.com → Sign in with your TikTok account → Click "Manage Apps"'},
            {n:"2",t:"Create an App",d:'Click "Create app" → Select "Web" → Fill in your app details. Use "Real Estate Hub" as the name.'},
            {n:"3",t:"Request Permissions",d:'Under Scopes, request: video.publish, video.upload, user.info.basic. Submit for review — usually takes 3-5 business days.'},
            {n:"4",t:"Get Your Token",d:"Once approved, use the OAuth flow to get your access token and paste it in Integrations below."},
          ].map(s=>(
            <div key={s.n} style={{display:"flex",gap:14,marginBottom:16}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"#1a5aa0",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#fff",flexShrink:0}}>{s.n}</div>
              <div><div style={{fontWeight:700,color:"#f1f5f9",marginBottom:4}}>{s.t}</div><div style={{fontSize:13,color:"#64748b",lineHeight:1.6}}>{s.d}</div></div>
            </div>
          ))}
          <div style={{display:"flex",gap:10,marginTop:8}}>
            <button className="btn btn-blue" onClick={()=>window.open("https://developers.tiktok.com","_blank")}><Globe size={13}/>Open TikTok Developers</button>
            <button className="btn btn-ghost" onClick={()=>setPage("integrations")}><Settings size={13}/>Add Token in Integrations</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── TRANSACTION MANAGER ──────────────────────────────────────────────────────
const TX_MILESTONES = ["Accepted Offer","Inspection","Appraisal","Clear to Close","Closing"];
const TransactionManager = ({setPage, toast}) => {
  const [txs, setTxs] = useLS("transactions", []);
  const [form, setForm] = useLS("tx_form_draft", {address:"",client:"",type:"Buyer",price:"",closingDate:"",status:"Active",milestones:{}});
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [filter, setFilter] = useState("Active");

  const save = () => {
    if(!form.address.trim()) return toast.error("Address is required");
    if(editId) { setTxs(p=>p.map(t=>t.id===editId?{...t,...form}:t)); toast.success("Transaction updated"); setEditId(null); }
    else { setTxs(p=>[{id:uid(),...form,createdAt:now()},...p]); toast.success("Transaction added"); }
    setForm({address:"",client:"",type:"Buyer",price:"",closingDate:"",status:"Active",milestones:{}});
    setShowForm(false);
  };

  const toggleMilestone = (id, m) => setTxs(p=>p.map(t=>t.id===id?{...t,milestones:{...t.milestones,[m]:!t.milestones?.[m]}}:t));
  const daysTo = d => d ? Math.ceil((new Date(d)-new Date())/(1000*60*60*24)) : null;
  const filtered = txs.filter(t=>filter==="all"||t.status===filter);

  return (
    <div className="page-content">
      <PageHeader title="Transaction Manager" sub={`${txs.filter(t=>t.status==="Active").length} active deals`} setPage={setPage} parent="dashboard"
        action={<button className="btn btn-blue" onClick={()=>{setShowForm(true);setEditId(null);}}><Plus size={13}/>Add Transaction</button>}
      />

      {showForm&&(
        <div className="glass-card" style={{marginBottom:24}}>
          <div className="flex-between" style={{marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{editId?"Edit Transaction":"New Transaction"}</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setShowForm(false);setEditId(null);}}><X size={13}/>Cancel</button>
          </div>
          <div className="grid-2" style={{gap:12}}>
            <div><div className="label">Property Address *</div><input className="input" placeholder="123 Main St, Livonia MI" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
            <div><div className="label">Client Name</div><input className="input" placeholder="John & Jane Smith" value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))}/></div>
            <div><div className="label">Type</div>
              <select className="select" value={form.type} onChange={e=>setForm(f=>({...f,type:e.target.value}))}>
                {["Buyer","Seller","Both"].map(t=><option key={t}>{t}</option>)}
              </select>
            </div>
            <div><div className="label">Sale Price</div><input className="input" type="number" placeholder="350000" value={form.price} onChange={e=>setForm(f=>({...f,price:e.target.value}))}/></div>
            <div><div className="label">Closing Date</div><input className="input" type="date" value={form.closingDate} onChange={e=>setForm(f=>({...f,closingDate:e.target.value}))}/></div>
            <div><div className="label">Status</div>
              <select className="select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                {["Active","Closed","Cancelled","On Hold"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-blue" style={{marginTop:16}} onClick={save}><Save size={13}/>{editId?"Update":"Add Transaction"}</button>
        </div>
      )}

      <div className="tabs" style={{marginBottom:16}}>
        {["Active","Closed","Cancelled","On Hold","all"].map(s=>(
          <button key={s} className={`tab ${filter===s?"active":""}`} onClick={()=>setFilter(s)}>
            {s==="all"?"All":s} ({s==="all"?txs.length:txs.filter(t=>t.status===s).length})
          </button>
        ))}
      </div>

      {filtered.length===0
        ? <div className="glass-card"><EmptyState icon={Key} title="No transactions" desc="Add your first active deal"/></div>
        : <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {filtered.map(t=>{
            const days = daysTo(t.closingDate);
            const done = TX_MILESTONES.filter(m=>t.milestones?.[m]).length;
            const pct = Math.round((done/TX_MILESTONES.length)*100);
            return (
              <div key={t.id} className="glass-card">
                <div className="flex-between" style={{marginBottom:12}}>
                  <div>
                    <div style={{fontWeight:800,fontSize:16,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>{t.address}</div>
                    <div style={{fontSize:13,color:"#94a3b8",marginTop:2}}>{t.client} · {t.type} · {t.price?`$${Number(t.price).toLocaleString()}`:""}</div>
                  </div>
                  <div style={{display:"flex",gap:8,alignItems:"center"}}>
                    {days!=null&&t.status==="Active"&&<span style={{fontSize:13,fontWeight:800,color:days<7?"#f87171":days<14?"#f0c040":"#6ee7b7"}}>{days>0?`${days}d to close`:days===0?"Closing today!":"Overdue"}</span>}
                    <span className={`badge ${t.status==="Active"?"badge-blue":t.status==="Closed"?"badge-green":t.status==="Cancelled"?"badge-red":"badge-gray"}`}>{t.status}</span>
                    <button className="btn btn-ghost btn-icon btn-xs" onClick={()=>{setEditId(t.id);setForm(t);setShowForm(true);}}><Edit3 size={12}/></button>
                    <button className="btn btn-danger btn-icon btn-xs" onClick={()=>setTxs(p=>p.filter(x=>x.id!==t.id))}><Trash2 size={12}/></button>
                  </div>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                    <span style={{fontSize:12,color:"#64748b",fontWeight:700}}>Progress</span>
                    <span style={{fontSize:12,color:"#7eb8f7",fontWeight:700}}>{pct}%</span>
                  </div>
                  <div style={{background:"rgba(255,255,255,.06)",borderRadius:99,height:6}}>
                    <div style={{background:"linear-gradient(90deg,#1a5aa0,#2d7dd2)",borderRadius:99,height:6,width:`${pct}%`,transition:"width .3s"}}/>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {TX_MILESTONES.map(m=>(
                    <button key={m} onClick={()=>toggleMilestone(t.id,m)}
                      style={{padding:"5px 12px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",border:"none",
                        background:t.milestones?.[m]?"rgba(16,185,129,.2)":"rgba(255,255,255,.05)",
                        color:t.milestones?.[m]?"#6ee7b7":"#475569"}}>
                      {t.milestones?.[m]?"✓ ":""}{m}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      }
    </div>
  );
};

// ─── COMMISSION TRACKER ───────────────────────────────────────────────────────
const CommissionTracker = ({setPage, toast}) => {
  const [entries, setEntries] = useLS("commissions", []);
  const [goals, setGoals] = useLS("commission_goals", {year:new Date().getFullYear(),target:""});
  const [form, setForm] = useState({address:"",client:"",salePrice:"",commissionPct:"3",status:"Expected",closeDate:"",notes:""});
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);

  const thisYear = new Date().getFullYear();
  const thisYearEntries = entries.filter(e=>new Date(e.closeDate||e.createdAt).getFullYear()===thisYear);
  const received = thisYearEntries.filter(e=>e.status==="Received").reduce((s,e)=>s+(Number(e.salePrice)*Number(e.commissionPct)/100),0);
  const expected = thisYearEntries.filter(e=>e.status==="Expected").reduce((s,e)=>s+(Number(e.salePrice)*Number(e.commissionPct)/100),0);
  const pipeline = received + expected;
  const goal = Number(goals.target)||0;
  const goalPct = goal>0?Math.min(100,Math.round((received/goal)*100)):0;

  const save = () => {
    if(!form.address.trim()) return toast.error("Address is required");
    const entry = {...form, commission: Number(form.salePrice)*Number(form.commissionPct)/100};
    if(editId) { setEntries(p=>p.map(e=>e.id===editId?{...e,...entry}:e)); toast.success("Updated"); setEditId(null); }
    else { setEntries(p=>[{id:uid(),...entry,createdAt:now()},...p]); toast.success("Commission added"); }
    setForm({address:"",client:"",salePrice:"",commissionPct:"3",status:"Expected",closeDate:"",notes:""});
    setShowForm(false);
  };

  return (
    <div className="page-content">
      <PageHeader title="Commission Tracker" sub={`${thisYear} income pipeline`} setPage={setPage} parent="dashboard"
        action={<button className="btn btn-blue" onClick={()=>{setShowForm(true);setEditId(null);}}><Plus size={13}/>Add Commission</button>}
      />

      <div className="grid-4" style={{gap:14,marginBottom:24}}>
        {[
          {label:"Received YTD",val:`$${Math.round(received).toLocaleString()}`,cls:"stat-card-3",icon:DollarSign},
          {label:"Expected Pipeline",val:`$${Math.round(expected).toLocaleString()}`,cls:"stat-card-2",icon:TrendingUp},
          {label:"Total Pipeline",val:`$${Math.round(pipeline).toLocaleString()}`,cls:"stat-card-1",icon:BarChart3},
          {label:"Goal Progress",val:`${goalPct}%`,cls:"stat-card-4",icon:Target},
        ].map(s=>(
          <div key={s.label} className={`stat-card ${s.cls}`}>
            <s.icon size={20} className="stat-icon"/>
            <div className="stat-label">{s.label}</div>
            <div className="stat-number">{s.val}</div>
          </div>
        ))}
      </div>

      <div className="glass-card" style={{marginBottom:24}}>
        <div className="flex-between" style={{marginBottom:12}}>
          <div style={{fontWeight:800,color:"#fff"}}>Annual Goal — {thisYear}</div>
        </div>
        <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:12}}>
          <input className="input" style={{maxWidth:200}} type="number" placeholder="150000" value={goals.target} onChange={e=>setGoals(g=>({...g,target:e.target.value}))}/>
          <span style={{fontSize:13,color:"#64748b"}}>Target commission income</span>
        </div>
        {goal>0&&(
          <>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:12,color:"#64748b",fontWeight:700}}>Received: ${Math.round(received).toLocaleString()} of ${goal.toLocaleString()}</span>
              <span style={{fontSize:12,color:"#7eb8f7",fontWeight:700}}>{goalPct}%</span>
            </div>
            <div style={{background:"rgba(255,255,255,.06)",borderRadius:99,height:8}}>
              <div style={{background:"linear-gradient(90deg,#10b981,#059669)",borderRadius:99,height:8,width:`${goalPct}%`,transition:"width .3s"}}/>
            </div>
          </>
        )}
      </div>

      {showForm&&(
        <div className="glass-card" style={{marginBottom:24}}>
          <div className="flex-between" style={{marginBottom:16}}>
            <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{editId?"Edit":"Add Commission"}</div>
            <button className="btn btn-ghost btn-sm" onClick={()=>{setShowForm(false);setEditId(null);}}><X size={13}/>Cancel</button>
          </div>
          <div className="grid-2" style={{gap:12}}>
            <div><div className="label">Property Address *</div><input className="input" placeholder="123 Main St" value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))}/></div>
            <div><div className="label">Client</div><input className="input" placeholder="Client name" value={form.client} onChange={e=>setForm(f=>({...f,client:e.target.value}))}/></div>
            <div><div className="label">Sale Price</div><input className="input" type="number" placeholder="350000" value={form.salePrice} onChange={e=>setForm(f=>({...f,salePrice:e.target.value}))}/></div>
            <div><div className="label">Commission %</div><input className="input" type="number" step="0.1" placeholder="3" value={form.commissionPct} onChange={e=>setForm(f=>({...f,commissionPct:e.target.value}))}/></div>
            {form.salePrice&&form.commissionPct&&<div style={{gridColumn:"1/-1",padding:"10px 14px",background:"rgba(16,185,129,.1)",borderRadius:9,fontSize:14,fontWeight:700,color:"#6ee7b7"}}>Commission: ${Math.round(Number(form.salePrice)*Number(form.commissionPct)/100).toLocaleString()}</div>}
            <div><div className="label">Status</div>
              <select className="select" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))}>
                {["Expected","Received","Cancelled"].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div><div className="label">Close Date</div><input className="input" type="date" value={form.closeDate} onChange={e=>setForm(f=>({...f,closeDate:e.target.value}))}/></div>
            <div style={{gridColumn:"1/-1"}}><div className="label">Notes</div><input className="input" placeholder="Split, referral, notes..." value={form.notes} onChange={e=>setForm(f=>({...f,notes:e.target.value}))}/></div>
          </div>
          <button className="btn btn-blue" style={{marginTop:16}} onClick={save}><Save size={13}/>{editId?"Update":"Add"}</button>
        </div>
      )}

      {entries.length===0
        ? <div className="glass-card"><EmptyState icon={DollarSign} title="No commissions yet" desc="Add your first deal to start tracking income"/></div>
        : <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {entries.map(e=>(
            <div key={e.id} className="glass-card">
              <div className="flex-between">
                <div style={{flex:1}}>
                  <div style={{fontWeight:800,fontSize:15,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>{e.address}</div>
                  <div style={{fontSize:13,color:"#94a3b8",marginTop:2}}>{e.client} · {e.closeDate?fmt(e.closeDate):""}</div>
                  {e.notes&&<div style={{fontSize:12,color:"#475569",marginTop:4,fontStyle:"italic"}}>{e.notes}</div>}
                </div>
                <div style={{display:"flex",gap:12,alignItems:"center",marginLeft:16}}>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:18,fontWeight:900,color:"#6ee7b7",fontFamily:"'DM Serif Display',serif"}}>${Math.round(e.commission||0).toLocaleString()}</div>
                    <div style={{fontSize:11,color:"#475569"}}>{e.commissionPct}% of ${Number(e.salePrice||0).toLocaleString()}</div>
                  </div>
                  <span className={`badge ${e.status==="Received"?"badge-green":e.status==="Expected"?"badge-gold":"badge-gray"}`}>{e.status}</span>
                  <button className="btn btn-ghost btn-icon btn-xs" onClick={()=>{setEditId(e.id);setForm(e);setShowForm(true);}}><Edit3 size={12}/></button>
                  <button className="btn btn-danger btn-icon btn-xs" onClick={()=>setEntries(p=>p.filter(x=>x.id!==e.id))}><Trash2 size={12}/></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
};

// ─── AI LEAD CONCIERGE — settings UI ──────────────────────────────────────────
// Pairs with AILeadConciergeWorker. This is the dashboard where Monica
// controls auto-response behavior: which sources, which channels, daily
// cap, quiet hours, and a today/this-week activity log.
const AILeadConcierge = ({setPage, toast}) => {
  const [settings, setSettings] = useLS("concierge_settings", DEFAULT_CONCIERGE_SETTINGS);
  const [profile] = useLS("re_profile", { name: "Monica Iskra", brokerage: "RE/MAX Classic" });
  const [agentVoice] = useLS("agent_voice", "");
  const [previewLead, setPreviewLead] = useState({
    name: "Sarah Johnson", email: "sarah@example.com", phone: "248-555-0199",
    source: "Zillow", type: "Buyer", area: "Livonia",
    address: "1234 Maple Ave, Livonia MI", budget: "425000",
    notes: "I'd like to schedule a showing this weekend if possible.",
  });
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  // Daily counter (read-only display)
  const todayKey = new Date().toISOString().slice(0, 10);
  const [logTick, setLogTick] = useState(0);
  const log = (() => { try { return JSON.parse(localStorage.getItem("concierge_log") || "{}"); } catch { return {}; } })();
  const todayCount = log[todayKey]?.count || 0;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setInterval(() => setLogTick(n=>n+1), 5000); return () => clearInterval(t); }, []);
  void logTick;

  const set = (path, val) => {
    setSettings(s => {
      const next = { ...s };
      const parts = path.split(".");
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = { ...(cursor[parts[i]] || {}) };
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = val;
      return next;
    });
  };

  const allSources = Object.keys(settings.sources || DEFAULT_CONCIERGE_SETTINGS.sources);

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const out = await draftLeadResponse({ lead: previewLead, profile, agentVoice });
      setPreview(out);
    } catch (e) {
      toast.error("Preview failed: " + e.message);
    }
    setPreviewing(false);
  };

  const resetTodayCounter = () => {
    if (!window.confirm(`Reset today's auto-response counter (currently ${todayCount})?`)) return;
    const fresh = { ...log };
    delete fresh[todayKey];
    localStorage.setItem("concierge_log", JSON.stringify(fresh));
    setLogTick(n => n + 1);
    toast.success("Today's counter reset to 0");
  };

  return (
    <div className="page-content">
      <PageHeader title="AI Lead Concierge" sub="Auto-respond to hot leads within 60 seconds" setPage={setPage} parent="dashboard"
        action={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:12,fontWeight:700,color:settings.enabled?"#6ee7b7":"#64748b"}}>
              {settings.enabled ? "🟢 ON — auto-firing" : "⚪ OFF — drafts only"}
            </span>
            <button
              className={`btn ${settings.enabled?"btn-danger":"btn-blue"} btn-sm`}
              onClick={()=>set("enabled", !settings.enabled)}>
              {settings.enabled ? "Turn OFF" : "Turn ON"}
            </button>
          </div>
        }
      />

      {/* Hero info banner */}
      <div className="glass-card" style={{marginBottom:20,padding:"18px 22px",background:"linear-gradient(135deg, rgba(110,231,183,.08), rgba(26,90,160,.05))",borderColor:"rgba(110,231,183,.2)"}}>
        <div style={{fontSize:14,color:"#cbd5e1",lineHeight:1.7}}>
          When a new lead arrives in your Lead Inbox (Zillow, Realtor.com, BoldTrail, web form, etc.) and the source is enabled below, the AI Concierge:
          <ul style={{marginTop:8,paddingLeft:20,color:"#94a3b8"}}>
            <li>📧 <strong>Drafts + auto-sends a personalized email</strong> via your connected Gmail (within ~30 sec of arrival)</li>
            <li>📱 <strong>Creates a Text task</strong> with the SMS pre-written — tap "Send" on your phone to fire it</li>
            <li>📊 <strong>Logs the activity</strong> on the lead's timeline so you see what went out</li>
          </ul>
          <div style={{marginTop:10,fontSize:12,color:"#64748b"}}>5-min response = 78% win rate. Most agents take 917 min. The concierge gets you to seconds.</div>
        </div>
      </div>

      <div className="grid-2" style={{gap:18,alignItems:"flex-start"}}>
        {/* LEFT: Settings */}
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          {/* Sources */}
          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>📥 Lead Sources to Auto-Respond</div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              {allSources.map(src => (
                <label key={src} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"7px 11px",borderRadius:8,background:settings.sources?.[src]?"rgba(110,231,183,.06)":"rgba(255,255,255,.02)",border:`1px solid ${settings.sources?.[src]?"rgba(110,231,183,.2)":"rgba(255,255,255,.05)"}`}}>
                  <input type="checkbox" checked={!!settings.sources?.[src]} onChange={e=>set(`sources.${src}`, e.target.checked)} style={{width:16,height:16}}/>
                  <span style={{fontSize:13,fontWeight:600,color:"#cbd5e1",flex:1}}>{src}</span>
                  {settings.sources?.[src] && <span style={{fontSize:10,color:"#6ee7b7",fontWeight:700}}>AUTO</span>}
                </label>
              ))}
            </div>
            <div style={{fontSize:11,color:"#475569",marginTop:10,fontStyle:"italic"}}>Tip: keep Facebook + Instagram OFF for auto-fire — those leads are low-intent and benefit from a human touch first.</div>
          </div>

          {/* Channels */}
          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>📨 Channels</div>
            <div style={{display:"flex",flexDirection:"column",gap:9}}>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                <input type="checkbox" checked={!!settings.channels?.email} onChange={e=>set("channels.email", e.target.checked)} style={{width:16,height:16}}/>
                <span style={{fontSize:13,fontWeight:600,color:"#cbd5e1"}}>📧 Email — auto-sent via your connected Gmail</span>
              </label>
              <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer"}}>
                <input type="checkbox" checked={!!settings.channels?.sms} onChange={e=>set("channels.sms", e.target.checked)} style={{width:16,height:16}}/>
                <span style={{fontSize:13,fontWeight:600,color:"#cbd5e1"}}>📱 SMS — drafted as a Text task (tap Send on mobile)</span>
              </label>
              <div style={{fontSize:11,color:"#64748b",marginTop:6,paddingLeft:26}}>SMS auto-send via Twilio coming in Phase 2. For now, tap "Send" on the task and your phone's SMS app opens pre-filled.</div>
            </div>
          </div>

          {/* Safety */}
          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>🛡 Safety Guardrails</div>
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div>
                <div className="label">Daily Max Auto-Responses</div>
                <input className="input" type="number" min="1" max="500" value={settings.dailyCap} onChange={e=>set("dailyCap", parseInt(e.target.value)||30)} style={{maxWidth:120}}/>
                <div style={{fontSize:11,color:"#64748b",marginTop:6}}>Used today: <strong style={{color:todayCount>=settings.dailyCap*.8?"#fbbf24":"#6ee7b7"}}>{todayCount} of {settings.dailyCap}</strong>{todayCount>0 && <button className="btn btn-ghost btn-xs" style={{marginLeft:8}} onClick={resetTodayCounter}>Reset</button>}</div>
              </div>

              <div>
                <label style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",marginBottom:10}}>
                  <input type="checkbox" checked={!!settings.quietHours?.enabled} onChange={e=>set("quietHours.enabled", e.target.checked)} style={{width:16,height:16}}/>
                  <span style={{fontSize:13,fontWeight:600,color:"#cbd5e1"}}>🌙 Quiet hours (skip auto-fire outside these)</span>
                </label>
                {settings.quietHours?.enabled && (
                  <div style={{display:"flex",gap:10,alignItems:"center",paddingLeft:26}}>
                    <div>
                      <div className="label">Start</div>
                      <select className="select" value={settings.quietHours.startHour} onChange={e=>set("quietHours.startHour", parseInt(e.target.value))}>
                        {Array.from({length:24}).map((_,h)=><option key={h} value={h}>{h===0?"12 AM":h<12?`${h} AM`:h===12?"12 PM":`${h-12} PM`}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="label">End</div>
                      <select className="select" value={settings.quietHours.endHour} onChange={e=>set("quietHours.endHour", parseInt(e.target.value))}>
                        {Array.from({length:24}).map((_,h)=><option key={h} value={h}>{h===0?"12 AM":h<12?`${h} AM`:h===12?"12 PM":`${h-12} PM`}</option>)}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT: Live preview */}
        <div style={{display:"flex",flexDirection:"column",gap:18}}>
          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>🎭 Preview — what the AI would send</div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:12}}>Edit this fake lead and click Preview to see the AI's draft. Test before turning auto-fire on.</div>
            <div className="grid-2" style={{gap:10,marginBottom:14}}>
              <div><div className="label">Name</div><input className="input" value={previewLead.name} onChange={e=>setPreviewLead(p=>({...p,name:e.target.value}))}/></div>
              <div><div className="label">Source</div>
                <select className="select" value={previewLead.source} onChange={e=>setPreviewLead(p=>({...p,source:e.target.value}))}>
                  {allSources.map(s=><option key={s}>{s}</option>)}
                </select>
              </div>
              <div><div className="label">Area</div><input className="input" value={previewLead.area} onChange={e=>setPreviewLead(p=>({...p,area:e.target.value}))}/></div>
              <div><div className="label">Budget</div><input className="input" value={previewLead.budget} onChange={e=>setPreviewLead(p=>({...p,budget:e.target.value}))}/></div>
              <div style={{gridColumn:"1/-1"}}><div className="label">Property they asked about</div><input className="input" value={previewLead.address} onChange={e=>setPreviewLead(p=>({...p,address:e.target.value}))}/></div>
              <div style={{gridColumn:"1/-1"}}><div className="label">Their notes / message</div><input className="input" value={previewLead.notes} onChange={e=>setPreviewLead(p=>({...p,notes:e.target.value}))}/></div>
            </div>
            <button className="btn btn-blue" onClick={runPreview} disabled={previewing}>
              {previewing ? <><Spinner s={13}/>Drafting…</> : <><Wand2 size={13}/>Preview AI Draft</>}
            </button>
          </div>

          {preview && (
            <>
              {preview.emailSubject && (
                <div className="glass-card" style={{padding:"16px 20px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#7eb8f7",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>📧 EMAIL</div>
                  <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:8}}>Subject: {preview.emailSubject}</div>
                  <div style={{fontSize:13,color:"#cbd5e1",whiteSpace:"pre-wrap",lineHeight:1.6}}>{preview.emailBody}</div>
                </div>
              )}
              {preview.smsBody && (
                <div className="glass-card" style={{padding:"16px 20px"}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#fbbf24",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>📱 SMS <span style={{color:"#64748b",fontWeight:600,marginLeft:8}}>{preview.smsBody.length} chars</span></div>
                  <div style={{fontSize:13,color:"#cbd5e1",whiteSpace:"pre-wrap",lineHeight:1.6}}>{preview.smsBody}</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};


// ─── SOCIAL ENGAGEMENT AGENT — settings + activity ───────────────────────────
// Companion to SocialEngagementWorker. Lets Monica toggle the agent on/off,
// configure rules, and see what auto-replied, auto-liked, was DM-drafted, or
// got escalated for her review.
const SocialAgent = ({setPage, toast}) => {
  const [settings, setSettings] = useLS("social_settings", DEFAULT_SOCIAL_SETTINGS);
  const [integrations] = useLS("integrations", {});
  const [tab, setTab] = useState("activity");
  const [profile] = useLS("re_profile", { name: "Monica Iskra", brokerage: "RE/MAX Classic" });
  const [agentVoice] = useLS("agent_voice", "");
  const [activity, setActivity] = useState(() => {
    try { return JSON.parse(localStorage.getItem("social_activity") || "[]"); } catch { return []; }
  });
  const [previewComment, setPreviewComment] = useState("How much is the home on Maple Ave? Looks gorgeous!");
  const [previewPostCaption, setPreviewPostCaption] = useState("Just listed in Plymouth — 4BR/2.5BA, fully updated, walkable to downtown.");
  const [previewResult, setPreviewResult] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      try { setActivity(JSON.parse(localStorage.getItem("social_activity") || "[]")); } catch {}
    };
    window.addEventListener("social-activity-updated", refresh);
    const t = setInterval(refresh, 10000);
    return () => { window.removeEventListener("social-activity-updated", refresh); clearInterval(t); };
  }, []);

  const set = (path, val) => {
    setSettings(s => {
      const next = { ...s };
      const parts = path.split(".");
      let cursor = next;
      for (let i = 0; i < parts.length - 1; i++) {
        cursor[parts[i]] = { ...(cursor[parts[i]] || {}) };
        cursor = cursor[parts[i]];
      }
      cursor[parts[parts.length - 1]] = val;
      return next;
    });
  };

  const fbConnected = !!(integrations?.meta?.accessToken && integrations?.meta?.pageId);
  const igConnected = !!(integrations?.meta?.accessToken && integrations?.meta?.igAccountId);

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayCount = (() => {
    try { return JSON.parse(localStorage.getItem("social_daily_count") || "{}")[todayKey] || 0; } catch { return 0; }
  })();
  const todayActivity = activity.filter(a => a.createdAt?.startsWith(todayKey));
  const stats = {
    repliesToday: todayActivity.filter(a => a.type === "reply").length,
    likesToday: todayActivity.filter(a => a.type === "like_only" || a.type === "reply").length,
    dmsDraftedToday: todayActivity.filter(a => a.type === "dm_draft").length,
    escalatedToday: todayActivity.filter(a => a.type === "escalate").length,
  };

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const out = await draftSocialReply({
        comment: { id: "preview", message: previewComment, fromName: "Sarah J." },
        post: { id: "preview", message: previewPostCaption, platform: "facebook" },
        agent: { name: profile.name, brokerage: profile.brokerage },
        agentVoice,
      });
      setPreviewResult(out);
    } catch (e) { toast.error("Preview failed: " + e.message); }
    setPreviewing(false);
  };

  return (
    <div className="page-content">
      <PageHeader title="Social Engagement Agent" sub="AI replies to your FB + IG comments in your voice — auto-likes, drafts DMs, escalates the hot ones" setPage={setPage} parent="dashboard"
        action={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:12,fontWeight:700,color:settings.enabled?"#6ee7b7":"#64748b"}}>
              {settings.enabled ? "🟢 ON" : "⚪ OFF"}
            </span>
            <button
              className={`btn ${settings.enabled?"btn-danger":"btn-blue"} btn-sm`}
              onClick={()=>set("enabled", !settings.enabled)}
              disabled={!fbConnected && !igConnected}>
              {settings.enabled ? "Turn OFF" : "Turn ON"}
            </button>
          </div>
        }
      />

      {/* Connection status banner */}
      {(!fbConnected && !igConnected) ? (
        <div className="glass-card" style={{marginBottom:20,padding:"14px 18px",borderColor:"rgba(239,68,68,.25)",background:"rgba(239,68,68,.07)"}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <AlertCircle size={16} color="#ef4444"/>
            <div>
              <div style={{fontWeight:800,color:"#f87171"}}>Meta not connected</div>
              <div style={{fontSize:12,color:"#94a3b8",marginTop:2}}>
                Sidebar → Integrations → Meta. You need a Page Access Token with these scopes:
                <code style={{background:"rgba(255,255,255,.08)",padding:"1px 5px",borderRadius:4,margin:"0 4px"}}>pages_manage_engagement</code>
                <code style={{background:"rgba(255,255,255,.08)",padding:"1px 5px",borderRadius:4}}>pages_read_engagement</code>
                + for IG <code style={{background:"rgba(255,255,255,.08)",padding:"1px 5px",borderRadius:4,margin:"0 4px"}}>instagram_manage_comments</code>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="info-banner info-green" style={{marginBottom:20}}>
          <CheckCircle size={14} style={{flexShrink:0}}/>
          Connected: {fbConnected && "📘 Facebook"}{fbConnected && igConnected && " + "}{igConnected && "📸 Instagram"}
          {settings.enabled ? ` · Polling every ${settings.pollIntervalMinutes} min for new comments.` : " · Toggle ON above to start auto-engagement."}
        </div>
      )}

      {/* Stats */}
      <div className="grid-4" style={{gap:14,marginBottom:22}}>
        <div className="stat-card stat-card-1">
          <MessageSquare size={20} className="stat-icon"/>
          <div className="stat-label">Replies Today</div>
          <div className="stat-number">{stats.repliesToday}</div>
        </div>
        <div className="stat-card stat-card-3">
          <Heart size={20} className="stat-icon"/>
          <div className="stat-label">Auto-Likes Today</div>
          <div className="stat-number">{stats.likesToday}</div>
        </div>
        <div className="stat-card stat-card-2">
          <Send size={20} className="stat-icon"/>
          <div className="stat-label">DMs Drafted</div>
          <div className="stat-number">{stats.dmsDraftedToday}</div>
        </div>
        <div className="stat-card stat-card-4">
          <AlertCircle size={20} className="stat-icon"/>
          <div className="stat-label">Escalated</div>
          <div className="stat-number">{stats.escalatedToday}</div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:18,borderBottom:"1px solid rgba(255,255,255,.06)"}}>
        {[["activity",`🔥 Activity (${activity.length})`],["settings","⚙ Settings"],["preview","🎭 Preview AI"]].map(([id,label])=>(
          <button key={id} onClick={()=>setTab(id)}
            style={{padding:"10px 16px",background:"none",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
              color:tab===id?"#7eb8f7":"#475569",borderBottom:tab===id?"2px solid #1a5aa0":"2px solid transparent"}}>
            {label}
          </button>
        ))}
      </div>

      {/* ACTIVITY tab */}
      {tab==="activity" && (
        <>
          {activity.length === 0 ? (
            <div className="glass-card">
              <EmptyState icon={MessageSquare} title="No activity yet"
                desc={settings.enabled ? `Polling Meta every ${settings.pollIntervalMinutes} min for new comments on your last ${settings.postsToWatch} posts.` : "Turn the agent ON above to start auto-engaging."}/>
            </div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {activity.slice(0, 100).map(a => {
                const icon = a.type==="reply"?"💬":a.type==="like_only"?"❤":a.type==="dm_draft"?"📩":a.type==="escalate"?"⚠":a.type==="skip"?"🚫":"❓";
                const color = a.type==="reply"?"#6ee7b7":a.type==="dm_draft"?"#fbbf24":a.type==="escalate"?"#f87171":"#64748b";
                return (
                  <div key={a.id} className="glass-card" style={{padding:"12px 16px",borderLeft:`3px solid ${color}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6,gap:10}}>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:800,color,textTransform:"uppercase",letterSpacing:".4px",marginBottom:3}}>
                          {icon} {a.type.replace(/_/g," ")} · {a.platform === "facebook" ? "📘 FB" : "📸 IG"}
                        </div>
                        <div style={{fontSize:13,color:"#fff",fontWeight:700}}>{a.from || "Anonymous"}</div>
                        <div style={{fontSize:12,color:"#94a3b8",marginTop:3,fontStyle:"italic"}}>"{(a.comment||"").slice(0,140)}"</div>
                      </div>
                      <div style={{fontSize:11,color:"#475569",whiteSpace:"nowrap"}}>{new Date(a.createdAt).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}</div>
                    </div>
                    {a.reply && <div style={{fontSize:12,color:"#cbd5e1",marginTop:8,padding:"8px 12px",background:"rgba(110,231,183,.06)",borderRadius:7,borderLeft:"2px solid #6ee7b7"}}><strong style={{color:"#6ee7b7"}}>Auto-reply:</strong> {a.reply}</div>}
                    {a.dm && <div style={{fontSize:12,color:"#cbd5e1",marginTop:6,padding:"8px 12px",background:"rgba(251,191,36,.06)",borderRadius:7,borderLeft:"2px solid #fbbf24"}}><strong style={{color:"#fbbf24"}}>DM drafted (review &amp; send):</strong> {a.dm}</div>}
                    {a.reason && <div style={{fontSize:12,color:"#fda4af",marginTop:6}}>⚠ {a.reason}</div>}
                    {a.error && <div style={{fontSize:11,color:"#f87171",marginTop:6}}>Error: {a.error}</div>}
                  </div>
                );
              })}
              {activity.length > 100 && (
                <div style={{textAlign:"center",fontSize:12,color:"#475569",padding:14}}>Showing latest 100 of {activity.length} events</div>
              )}
            </div>
          )}
        </>
      )}

      {/* SETTINGS tab */}
      {tab==="settings" && (
        <div style={{display:"flex",flexDirection:"column",gap:18,maxWidth:760}}>
          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>📘 Facebook Page</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.facebook.enabled} onChange={e=>set("facebook.enabled",e.target.checked)} style={{width:16,height:16}}/><span>Watch Page for new comments</span></label>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.facebook.autoReply} onChange={e=>set("facebook.autoReply",e.target.checked)} style={{width:16,height:16}}/><span>Auto-reply to substantive comments</span></label>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.facebook.autoLike} onChange={e=>set("facebook.autoLike",e.target.checked)} style={{width:16,height:16}}/><span>Auto-like ALL comments (algorithm booster)</span></label>
            </div>
          </div>

          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>📸 Instagram</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.instagram.enabled} onChange={e=>set("instagram.enabled",e.target.checked)} style={{width:16,height:16}}/><span>Watch IG Business account for new comments</span></label>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.instagram.autoReply} onChange={e=>set("instagram.autoReply",e.target.checked)} style={{width:16,height:16}}/><span>Auto-reply to substantive comments</span></label>
              <div style={{fontSize:11,color:"#64748b",paddingLeft:26,marginTop:4}}>Note: IG Business API doesn't support liking comments — only replies.</div>
            </div>
          </div>

          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>🛡 Rules &amp; Safety</div>
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.rules.skipSpam} onChange={e=>set("rules.skipSpam",e.target.checked)} style={{width:16,height:16}}/><span>Skip obvious spam (crypto, OF, follow-back, etc.)</span></label>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.rules.likeOnlyForNoise} onChange={e=>set("rules.likeOnlyForNoise",e.target.checked)} style={{width:16,height:16}}/><span>Just like (don't reply to) generic noise like "🔥🔥🔥" or "love it!"</span></label>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.rules.enableDmFunnel} onChange={e=>set("rules.enableDmFunnel",e.target.checked)} style={{width:16,height:16}}/><span>Draft DM when commenter shows buyer/seller intent (review in Activity tab)</span></label>
              <label style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}><input type="checkbox" checked={settings.rules.escalateToInbox} onChange={e=>set("rules.escalateToInbox",e.target.checked)} style={{width:16,height:16}}/><span>Flag negative / legal / contractual comments for review</span></label>
              <div style={{display:"flex",gap:14,marginTop:8}}>
                <div><div className="label">Max replies/post</div><input className="input" type="number" min="1" value={settings.rules.maxRepliesPerPost} onChange={e=>set("rules.maxRepliesPerPost", parseInt(e.target.value)||50)} style={{width:90}}/></div>
                <div><div className="label">Max replies/day</div><input className="input" type="number" min="1" value={settings.rules.maxRepliesPerDay} onChange={e=>set("rules.maxRepliesPerDay", parseInt(e.target.value)||200)} style={{width:90}}/></div>
                <div><div className="label">Used today</div><div style={{padding:"7px 0",fontWeight:800,color:todayCount>=settings.rules.maxRepliesPerDay*.8?"#fbbf24":"#6ee7b7"}}>{todayCount} / {settings.rules.maxRepliesPerDay}</div></div>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>⚙ Polling</div>
            <div style={{display:"flex",gap:14,alignItems:"flex-end"}}>
              <div><div className="label">Watch the most recent ___ posts</div><input className="input" type="number" min="1" max="100" value={settings.postsToWatch} onChange={e=>set("postsToWatch", parseInt(e.target.value)||20)} style={{width:90}}/></div>
              <div><div className="label">Check every ___ minutes</div><input className="input" type="number" min="1" max="60" value={settings.pollIntervalMinutes} onChange={e=>set("pollIntervalMinutes", parseInt(e.target.value)||5)} style={{width:90}}/></div>
              <div style={{fontSize:11,color:"#64748b",paddingBottom:8}}>(More frequent = faster replies but more Meta API calls. 5 min is plenty for most.)</div>
            </div>
          </div>
        </div>
      )}

      {/* PREVIEW tab */}
      {tab==="preview" && (
        <div style={{display:"flex",flexDirection:"column",gap:18,maxWidth:760}}>
          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14}}>🎭 Test the AI on a fake comment</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div><div className="label">Your post caption</div>
                <textarea className="textarea" rows={2} value={previewPostCaption} onChange={e=>setPreviewPostCaption(e.target.value)} style={{resize:"vertical"}}/>
              </div>
              <div><div className="label">A comment on it</div>
                <input className="input" value={previewComment} onChange={e=>setPreviewComment(e.target.value)}/>
              </div>
              <button className="btn btn-blue" onClick={runPreview} disabled={previewing}>
                {previewing ? <><Spinner s={13}/>Drafting…</> : <><Wand2 size={13}/>What would the AI do?</>}
              </button>
            </div>
          </div>

          {previewResult && (
            <div className="glass-card" style={{padding:"18px 22px"}}>
              <div style={{fontSize:11,fontWeight:800,color:"#7eb8f7",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>AI DECISION</div>
              <div style={{fontSize:18,fontWeight:800,color:"#fff",marginBottom:14}}>
                {previewResult.action === "reply" && "💬 Auto-reply"}
                {previewResult.action === "like_only" && "❤ Like only (skip reply)"}
                {previewResult.action === "skip" && "🚫 Skip (spam/noise)"}
                {previewResult.action === "escalate" && "⚠ Escalate to you"}
              </div>
              {previewResult.reply && <div style={{marginBottom:10,padding:"10px 14px",background:"rgba(110,231,183,.06)",borderRadius:8,borderLeft:"2px solid #6ee7b7"}}><div style={{fontSize:11,fontWeight:700,color:"#6ee7b7",marginBottom:4}}>PUBLIC REPLY</div><div style={{fontSize:13,color:"#cbd5e1"}}>{previewResult.reply}</div></div>}
              {previewResult.dmFollowup && <div style={{marginBottom:10,padding:"10px 14px",background:"rgba(251,191,36,.06)",borderRadius:8,borderLeft:"2px solid #fbbf24"}}><div style={{fontSize:11,fontWeight:700,color:"#fbbf24",marginBottom:4}}>PRIVATE DM (drafted for review)</div><div style={{fontSize:13,color:"#cbd5e1"}}>{previewResult.dmFollowup}</div></div>}
              {previewResult.escalateReason && <div style={{fontSize:13,color:"#fda4af",marginTop:8}}>Reason: {previewResult.escalateReason}</div>}
            </div>
          )}
        </div>
      )}
    </div>
  );
};


// ─── DATABASE INTELLIGENCE — find money hiding in 6000+ leads ────────────────
// Most agents lose 80% of their lead value by stopping follow-up after 2-3
// touches. NAR: median 11mo from first contact to close. This page batches
// leads through Claude/Gemini and surfaces actionable opportunities Monica
// has been ignoring.
const DatabaseIntel = ({setPage, toast}) => {
  const [leads] = useLeadsCloud();
  const [scored, setScored] = useLS("db_intel_results", null);
  const [lastRun, setLastRun] = useLS("db_intel_last_run", null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [activeBucket, setActiveBucket] = useState("hot_revival");
  const [emailQueue, setEmailQueue] = useLS("email_queue", []);
  const [tasks, setTasks] = useLS("tasks", []);

  const run = async () => {
    if (!leads.length) return toast.error("No leads to analyze yet");
    if (!window.confirm(`Analyze ${leads.length} leads via AI? Takes a few minutes. Free on Gemini.`)) return;
    setRunning(true);
    setProgress({ done: 0, total: leads.length });
    try {
      const results = await scoreAllLeads(leads, {
        batchSize: 25,
        onProgress: (done, total) => setProgress({ done, total }),
      });
      setScored(results);
      setLastRun(new Date().toISOString());
      toast.success(`Analyzed ${results.length} leads — see the buckets below`);
    } catch (e) {
      toast.error("Analysis failed: " + e.message);
    }
    setRunning(false);
  };

  const buckets = scored ? groupByBucket(scored) : null;

  const quickText = (lead) => {
    if (!lead.phone) return toast.error(`${lead.name} has no phone`);
    const body = lead.intel?.suggestedScript || "";
    navigator.clipboard?.writeText(body).catch(() => {});
    window.location.href = `sms:${lead.phone.replace(/\D/g, "")}?body=${encodeURIComponent(body)}`;
    toast.info("SMS opened — script copied too");
  };

  const enrollDrip = (lead, campId = "camp_long_term") => {
    // Quick re-enroll into Long-Term Nurture (sensible default)
    const camp = BUILT_IN_CAMPAIGNS.find(c => c.id === campId);
    if (!camp) return toast.error("Campaign not found");
    if (!lead.email && camp.steps.some(s => (s.type||"email") === "email")) return toast.error(`${lead.name} has no email`);
    const start = new Date();
    const firstName = (lead.name || "").split(" ")[0];
    const newEmails = [], newTasks = [];
    camp.steps.forEach((step, i) => {
      const due = new Date(start); due.setDate(due.getDate() + step.day);
      const dueStr = due.toISOString().slice(0, 10);
      const type = step.type || "email";
      const body = (step.body || "").replace(/\[name\]/gi, firstName).replace(/\[area\]/gi, lead.area || "your area");
      if (type === "email") newEmails.push({
        id: uid(), leadId: lead.id, leadName: lead.name, leadEmail: lead.email,
        campaignId: camp.id, campaignName: camp.name,
        subject: (step.subject||"").replace(/\[name\]/gi, firstName),
        body, dueDate: dueStr, stepIndex: i, sent: false, createdAt: now(),
      });
      else if (type === "text" || type === "call") newTasks.push({
        id: uid(), title: `${type === "text" ? "Text" : "Call"} ${firstName} — ${camp.name}`,
        type: type === "text" ? "Text" : "Call", leadId: lead.id, leadName: lead.name,
        dueDate: dueStr, notes: body, smsBody: type === "text" ? body : undefined,
        campaignId: camp.id, campaignName: camp.name, stepIndex: i, completed: false, createdAt: now(),
      });
    });
    if (newEmails.length) setEmailQueue(p => [...p, ...newEmails]);
    if (newTasks.length) setTasks(p => [...p, ...newTasks]);
    toast.success(`${lead.name} enrolled in "${camp.name}" (${newEmails.length} emails + ${newTasks.length} tasks queued)`);
  };

  return (
    <div className="page-content">
      <PageHeader title="Database Intelligence" sub="AI scans your 6000+ leads to surface money you've forgotten about" setPage={setPage} parent="dashboard"
        action={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            {lastRun && !running && <span style={{fontSize:11,color:"#64748b"}}>Last run: {new Date(lastRun).toLocaleString()}</span>}
            <button className="btn btn-blue" onClick={run} disabled={running}>
              {running ? <><Spinner s={13}/>Analyzing {progress.done}/{progress.total}…</> : <><Wand2 size={13}/>{scored ? "Re-Analyze" : "Run Analysis"}</>}
            </button>
          </div>
        }
      />

      {/* Hero info */}
      {!scored && !running && (
        <div className="glass-card" style={{marginBottom:22,padding:"24px 28px",background:"linear-gradient(135deg, rgba(110,231,183,.08), rgba(26,90,160,.05))",borderColor:"rgba(110,231,183,.2)"}}>
          <div style={{fontSize:20,fontWeight:900,color:"#fff",fontFamily:"'DM Serif Display',serif",marginBottom:10}}>Find the money hiding in your CRM</div>
          <div style={{fontSize:14,color:"#cbd5e1",lineHeight:1.7,marginBottom:14}}>
            You have <strong style={{color:"#6ee7b7"}}>{leads.length.toLocaleString()} leads</strong>. NAR data shows 80% of agents lose 80% of their lead value because they stop following up at touch 2-3. Median time from first contact to close is 11 months. Most of your "cold" leads are warm leads you forgot about.
          </div>
          <div style={{fontSize:14,color:"#cbd5e1",lineHeight:1.7,marginBottom:14}}>
            This tool batches every lead through the AI and groups them into <strong>5 actionable buckets</strong>:
            <ul style={{margin:"10px 0",paddingLeft:24,color:"#94a3b8"}}>
              <li>🔥 <strong>Hot Revival</strong> — high-intent leads you stopped working</li>
              <li>📈 <strong>Buyer Signals</strong> — active intent in their notes/status</li>
              <li>🏡 <strong>Past Clients in Sell Window</strong> — 4-7 yrs since closing (peak resell time)</li>
              <li>💌 <strong>Sphere Touch Due</strong> — overdue check-ins driving referrals</li>
              <li>❄ <strong>Truly Cold</strong> — suggest archive</li>
            </ul>
          </div>
          <div style={{fontSize:13,color:"#64748b",fontStyle:"italic"}}>Runs on free Gemini AI. Takes ~{Math.ceil(leads.length/25*5)}-{Math.ceil(leads.length/25*10)} seconds. Re-run weekly as your data updates.</div>
        </div>
      )}

      {/* Progress */}
      {running && (
        <div className="glass-card" style={{marginBottom:22,padding:"20px 24px"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#fff",marginBottom:12}}>Analyzing {progress.done}/{progress.total} leads…</div>
          <div style={{background:"rgba(255,255,255,.05)",borderRadius:99,height:8,overflow:"hidden"}}>
            <div style={{background:"linear-gradient(90deg,#10b981,#059669)",height:8,width:`${progress.total ? (progress.done/progress.total*100) : 0}%`,transition:"width .3s"}}/>
          </div>
          <div style={{fontSize:11,color:"#64748b",marginTop:8}}>Don't close the tab — analysis runs in your browser. Free Gemini, no API cost.</div>
        </div>
      )}

      {/* Bucket tabs + results */}
      {scored && buckets && (
        <>
          <div style={{display:"flex",gap:6,marginBottom:18,flexWrap:"wrap"}}>
            {Object.keys(BUCKET_META).map(b => {
              const meta = BUCKET_META[b];
              const count = buckets[b].length;
              const isActive = activeBucket === b;
              return (
                <button key={b} onClick={()=>setActiveBucket(b)}
                  style={{padding:"10px 16px",borderRadius:11,cursor:"pointer",border:`1.5px solid ${isActive?meta.color:"rgba(255,255,255,.08)"}`,background:isActive?`${meta.color}18`:"rgba(255,255,255,.02)",color:isActive?"#fff":"#94a3b8",fontWeight:700,fontSize:13,display:"flex",alignItems:"center",gap:8}}>
                  {meta.label}
                  <span style={{background:isActive?meta.color:"rgba(255,255,255,.1)",color:isActive?"#fff":"#94a3b8",borderRadius:10,padding:"2px 8px",fontSize:11,fontWeight:800}}>{count}</span>
                </button>
              );
            })}
          </div>

          <div className="glass-card" style={{marginBottom:18,padding:"14px 18px",borderLeft:`3px solid ${BUCKET_META[activeBucket].color}`}}>
            <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:4}}>{BUCKET_META[activeBucket].label}</div>
            <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.5}}>{BUCKET_META[activeBucket].desc}</div>
          </div>

          {buckets[activeBucket].length === 0 ? (
            <div className="glass-card"><EmptyState icon={CheckCircle} title="Nothing in this bucket" desc="That's good news — or it means we need more lead data. Try another bucket."/></div>
          ) : (
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {buckets[activeBucket].slice(0, 50).map(lead => (
                <div key={lead.id} className="glass-card" style={{padding:"16px 20px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:14,marginBottom:10}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",marginBottom:4}}>
                        <span style={{fontFamily:"'DM Serif Display',serif",fontSize:17,fontWeight:800,color:"#fff"}}>{lead.name}</span>
                        <span style={{padding:"3px 9px",borderRadius:99,background:`${BUCKET_META[activeBucket].color}22`,color:BUCKET_META[activeBucket].color,fontSize:11,fontWeight:800}}>SCORE {lead.intel?.score}/10</span>
                        <span className={`badge ${lead.status==="Hot Prospect"?"badge-red":lead.status==="Past Client"?"badge-green":"badge-gray"}`}>{lead.status}</span>
                        {lead.source && <span className="badge badge-gray" style={{fontSize:10}}>{lead.source}</span>}
                      </div>
                      <div style={{display:"flex",gap:16,fontSize:12,color:"#94a3b8",flexWrap:"wrap",marginBottom:6}}>
                        {lead.email && <span>✉ {lead.email}</span>}
                        {lead.phone && <span>📞 {lead.phone}</span>}
                        {lead.area && <span>📍 {lead.area}</span>}
                        {lead.budget && <span>💰 {fmtMoney(lead.budget)}</span>}
                      </div>
                      {lead.intel?.reason && (
                        <div style={{fontSize:12,color:"#cbd5e1",marginTop:6,padding:"8px 12px",background:"rgba(255,255,255,.03)",borderRadius:7,borderLeft:"2px solid rgba(126,184,247,.4)"}}>
                          <strong style={{color:"#7eb8f7"}}>Why this matters:</strong> {lead.intel.reason}
                        </div>
                      )}
                      {lead.intel?.suggestedScript && (
                        <div style={{fontSize:12,color:"#cbd5e1",marginTop:6,padding:"8px 12px",background:"rgba(110,231,183,.06)",borderRadius:7,borderLeft:"2px solid #6ee7b7"}}>
                          <strong style={{color:"#6ee7b7"}}>Suggested {lead.intel.suggestedAction}:</strong> {lead.intel.suggestedScript}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                    {lead.phone && <button className="btn btn-ghost btn-sm" onClick={()=>quickText(lead)}>📱 Text Now (script copied)</button>}
                    {lead.email && <button className="btn btn-ghost btn-sm" onClick={()=>enrollDrip(lead, "camp_long_term")}>📧 Enroll: Long-Term Nurture</button>}
                    {lead.status === "Past Client" && lead.email && <button className="btn btn-ghost btn-sm" onClick={()=>enrollDrip(lead, "camp_soi")}>💎 Enroll: Sphere 33-Touch</button>}
                    <button className="btn btn-ghost btn-sm" onClick={()=>setPage("leads")}>👤 Open lead</button>
                  </div>
                </div>
              ))}
              {buckets[activeBucket].length > 50 && (
                <div style={{textAlign:"center",fontSize:12,color:"#475569",padding:14}}>Showing top 50 of {buckets[activeBucket].length} in this bucket</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};


// ─── CLOSING MULTIPLIER — 1 closing → 6 marketing assets ─────────────────────
// Top producers turn every closing into compounding social proof. Most agents
// close and the marketing fades. This page generates 6 assets per deal:
// IG reel script, FB post, sphere email, postcard copy, Google review request,
// and a "lessons" teaching post. Pull data from Realcomp listings (auto-synced)
// or enter manually.
const ClosingMultiplier = ({setPage, toast}) => {
  const [closing, setClosing] = useState({
    address: "", neighborhood: "", dealType: "Listing side",
    salePrice: "", listPrice: "", dom: "", beds: "", baths: "", sqft: "",
    clientFirstName: "", notes: "",
  });
  const [generated, setGenerated] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [profile] = useLS("re_profile", { name: "Monica Iskra", brokerage: "RE/MAX Classic" });
  const [agentVoice] = useLS("agent_voice", "");
  const [library, setLibrary] = useLS("closing_assets_library", []);

  // Pull synced listings from Supabase so she can one-click "multiply this closing"
  const [soldListings, setSoldListings] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from("listings")
          .select("*")
          .ilike("status", "%sold%")
          .order("close_date", { ascending: false })
          .limit(20);
        setSoldListings(data || []);
      } catch {}
    })();
  }, []);

  const loadListing = (l) => {
    setClosing({
      address: l.address || "",
      neighborhood: l.city || "",
      dealType: "Listing side",
      salePrice: l.sale_price ? String(l.sale_price) : "",
      listPrice: l.list_price ? String(l.list_price) : "",
      dom: l.dom ? String(l.dom) : "",
      beds: l.beds ? String(l.beds) : "",
      baths: l.baths ? String(l.baths) : "",
      sqft: l.sqft ? String(l.sqft) : "",
      clientFirstName: "",
      notes: "",
    });
    setGenerated(null);
    toast.success(`Loaded ${l.address} — fill in notes and generate`);
  };

  const generate = async () => {
    if (!closing.address.trim()) return toast.error("Address required");
    setGenerating(true);
    try {
      const out = await multiplyClosing({
        closing,
        agent: { name: profile.name, brokerage: profile.brokerage },
        agentVoice,
      });
      setGenerated(out);
      toast.success("6 marketing assets generated");
    } catch (e) {
      toast.error("Generation failed: " + e.message);
    }
    setGenerating(false);
  };

  const saveToLibrary = () => {
    if (!generated) return;
    setLibrary(p => [{ id: uid(), createdAt: now(), closing, assets: generated }, ...p].slice(0, 50));
    toast.success("Saved to library");
  };

  const copy = (text) => { navigator.clipboard?.writeText(text).catch(()=>{}); toast.success("Copied"); };

  return (
    <div className="page-content">
      <PageHeader title="Closing Multiplier" sub="One closing → 6 marketing assets. Turn every win into compounding social proof." setPage={setPage} parent="dashboard"/>

      <div className="grid-2" style={{gap:18,alignItems:"flex-start"}}>
        {/* LEFT — Input */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {/* Pull from synced listings */}
          {soldListings.length > 0 && (
            <div className="glass-card" style={{padding:"14px 18px"}}>
              <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:10}}>📥 Pull from your synced Realcomp listings</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:240,overflowY:"auto"}}>
                {soldListings.slice(0,15).map(l => (
                  <button key={l.id} onClick={()=>loadListing(l)}
                    style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:8,padding:"8px 12px",textAlign:"left",cursor:"pointer",color:"#cbd5e1",fontSize:12,display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                    <span style={{flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.address}, {l.city}</span>
                    <span style={{fontWeight:700,color:"#6ee7b7"}}>{l.sale_price?`$${Number(l.sale_price).toLocaleString()}`:""}</span>
                    <span style={{fontSize:10,color:"#475569"}}>{l.close_date||""}</span>
                  </button>
                ))}
              </div>
              <div style={{fontSize:11,color:"#475569",marginTop:8,fontStyle:"italic"}}>Click to auto-fill. You can edit anything before generating.</div>
            </div>
          )}

          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:14}}>🏡 The Deal</div>
            <div className="grid-2" style={{gap:12}}>
              <div style={{gridColumn:"1/-1"}}><div className="label">Property address *</div><input className="input" value={closing.address} onChange={e=>setClosing(c=>({...c,address:e.target.value}))} placeholder="1234 Maple Ave, Plymouth MI"/></div>
              <div><div className="label">Neighborhood / City</div><input className="input" value={closing.neighborhood} onChange={e=>setClosing(c=>({...c,neighborhood:e.target.value}))}/></div>
              <div><div className="label">Deal type</div>
                <select className="select" value={closing.dealType} onChange={e=>setClosing(c=>({...c,dealType:e.target.value}))}>
                  {["Listing side","Buyer side","Dual / both"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><div className="label">List price</div><input className="input" value={closing.listPrice} onChange={e=>setClosing(c=>({...c,listPrice:e.target.value}))} placeholder="425000"/></div>
              <div><div className="label">Sale price</div><input className="input" value={closing.salePrice} onChange={e=>setClosing(c=>({...c,salePrice:e.target.value}))} placeholder="437500"/></div>
              <div><div className="label">Days on market</div><input className="input" value={closing.dom} onChange={e=>setClosing(c=>({...c,dom:e.target.value}))} placeholder="8"/></div>
              <div><div className="label">Beds</div><input className="input" value={closing.beds} onChange={e=>setClosing(c=>({...c,beds:e.target.value}))} placeholder="4"/></div>
              <div><div className="label">Baths</div><input className="input" value={closing.baths} onChange={e=>setClosing(c=>({...c,baths:e.target.value}))} placeholder="2.5"/></div>
              <div><div className="label">Sqft</div><input className="input" value={closing.sqft} onChange={e=>setClosing(c=>({...c,sqft:e.target.value}))} placeholder="2200"/></div>
              <div><div className="label">Client first name <span style={{color:"#475569"}}>(review request only)</span></div><input className="input" value={closing.clientFirstName} onChange={e=>setClosing(c=>({...c,clientFirstName:e.target.value}))} placeholder="Sarah"/></div>
              <div style={{gridColumn:"1/-1"}}><div className="label">What made this deal special?</div>
                <textarea className="textarea" rows={3} value={closing.notes} onChange={e=>setClosing(c=>({...c,notes:e.target.value}))} placeholder="Multiple offers in 48 hours, 12% over asking, sellers downsizing after 22 years..." style={{resize:"vertical"}}/>
              </div>
            </div>
            <button className="btn btn-blue" style={{marginTop:14,width:"100%"}} onClick={generate} disabled={generating}>
              {generating ? <><Spinner s={13}/>Generating 6 assets…</> : <><Sparkles size={13}/>Multiply This Closing → 6 Marketing Assets</>}
            </button>
          </div>
        </div>

        {/* RIGHT — Generated assets */}
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {!generated && !generating && (
            <div className="glass-card" style={{padding:"40px 28px",textAlign:"center"}}>
              <Sparkles size={42} color="#475569" style={{marginBottom:14}}/>
              <div style={{fontSize:16,fontWeight:800,color:"#cbd5e1",marginBottom:6}}>Your 6 assets will appear here</div>
              <div style={{fontSize:12,color:"#64748b",lineHeight:1.6,maxWidth:380,margin:"0 auto"}}>
                IG reel script + B-roll · FB post · Sphere email · Postcard copy · Google review request · "Lessons" teaching post.
                <br/>All branded to your voice, all reference the specific deal stats.
              </div>
            </div>
          )}

          {generated && (
            <>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn btn-ghost btn-sm" onClick={saveToLibrary}><Save size={12}/>Save to Library</button>
              </div>

              {/* Instagram Reel */}
              <div className="glass-card" style={{padding:"18px 22px",borderLeft:"3px solid #DC2626"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#DC2626",textTransform:"uppercase",letterSpacing:".5px"}}>📱 INSTAGRAM REEL</div>
                  <button className="btn btn-ghost btn-xs" onClick={()=>copy(`HOOK: ${generated.instagramReel.hook}\n\nSCRIPT: ${generated.instagramReel.script}\n\nB-ROLL: ${generated.instagramReel.broll}\n\nCAPTION: ${generated.instagramReel.caption}`)}><Copy size={11}/>Copy all</button>
                </div>
                <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:4}}>HOOK (on-screen text):</div>
                <div style={{fontSize:14,fontWeight:800,color:"#fff",marginBottom:14,padding:"8px 12px",background:"rgba(220,38,38,.08)",borderRadius:6}}>{generated.instagramReel.hook}</div>
                <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:4}}>VOICEOVER SCRIPT:</div>
                <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6,whiteSpace:"pre-wrap",marginBottom:14}}>{generated.instagramReel.script}</div>
                <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:4}}>B-ROLL TO SHOOT:</div>
                <div style={{fontSize:12,color:"#cbd5e1",fontStyle:"italic",marginBottom:14}}>{generated.instagramReel.broll}</div>
                <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:4}}>CAPTION:</div>
                <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{generated.instagramReel.caption}</div>
              </div>

              {/* Facebook Post */}
              <div className="glass-card" style={{padding:"18px 22px",borderLeft:"3px solid #1A5AA0"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#1A5AA0",textTransform:"uppercase",letterSpacing:".5px"}}>📘 FACEBOOK POST</div>
                  <button className="btn btn-ghost btn-xs" onClick={()=>copy(generated.facebookPost)}><Copy size={11}/>Copy</button>
                </div>
                <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{generated.facebookPost}</div>
              </div>

              {/* Sphere Email */}
              <div className="glass-card" style={{padding:"18px 22px",borderLeft:"3px solid #16A34A"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#16A34A",textTransform:"uppercase",letterSpacing:".5px"}}>✉ SPHERE EMAIL</div>
                  <button className="btn btn-ghost btn-xs" onClick={()=>copy(`Subject: ${generated.sphereEmail.subject}\n\n${generated.sphereEmail.body}`)}><Copy size={11}/>Copy</button>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:8}}>Subject: {generated.sphereEmail.subject}</div>
                <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{generated.sphereEmail.body}</div>
              </div>

              {/* Postcard */}
              <div className="glass-card" style={{padding:"18px 22px",borderLeft:"3px solid #C99A2C"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#C99A2C",textTransform:"uppercase",letterSpacing:".5px"}}>📮 JUST-SOLD POSTCARD</div>
                  <button className="btn btn-ghost btn-xs" onClick={()=>copy(`${generated.postcard.headline}\n\n${generated.postcard.subhead}\n\n${generated.postcard.cta}`)}><Copy size={11}/>Copy</button>
                </div>
                <div style={{textAlign:"center",padding:"24px 20px",background:"linear-gradient(135deg, rgba(201,154,44,.10), rgba(220,38,38,.05))",borderRadius:10,border:"1px dashed rgba(201,154,44,.25)"}}>
                  <div style={{fontSize:22,fontWeight:900,color:"#fff",fontFamily:"'DM Serif Display',serif",marginBottom:10,lineHeight:1.2}}>{generated.postcard.headline}</div>
                  <div style={{fontSize:13,color:"#cbd5e1",marginBottom:14,lineHeight:1.5}}>{generated.postcard.subhead}</div>
                  <div style={{fontSize:12,fontWeight:700,color:"#C99A2C",padding:"8px 16px",background:"rgba(201,154,44,.15)",borderRadius:6,display:"inline-block"}}>{generated.postcard.cta}</div>
                </div>
                <div style={{fontSize:11,color:"#475569",marginTop:10,fontStyle:"italic"}}>Send 200-500 around the property via Lob (postcard API) or your local printer. Geographic farming = compounding listings.</div>
              </div>

              {/* Google Review Request */}
              <div className="glass-card" style={{padding:"18px 22px",borderLeft:"3px solid #fbbf24"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#fbbf24",textTransform:"uppercase",letterSpacing:".5px"}}>⭐ GOOGLE REVIEW REQUEST {closing.clientFirstName && `(to ${closing.clientFirstName})`}</div>
                  <button className="btn btn-ghost btn-xs" onClick={()=>copy(`Subject: ${generated.googleReviewRequest.subject}\n\n${generated.googleReviewRequest.body}`)}><Copy size={11}/>Copy</button>
                </div>
                <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:8}}>Subject: {generated.googleReviewRequest.subject}</div>
                <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{generated.googleReviewRequest.body}</div>
                <div style={{fontSize:11,color:"#475569",marginTop:10,fontStyle:"italic"}}>Replace [REVIEW_LINK] with your Google Business review URL (find it in Google Business Profile manager → "Get more reviews").</div>
              </div>

              {/* Lessons Thread */}
              <div className="glass-card" style={{padding:"18px 22px",borderLeft:"3px solid #a78bfa"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div style={{fontSize:11,fontWeight:800,color:"#a78bfa",textTransform:"uppercase",letterSpacing:".5px"}}>💡 "LESSONS" TEACHING POST</div>
                  <button className="btn btn-ghost btn-xs" onClick={()=>copy(generated.lessonsThread)}><Copy size={11}/>Copy</button>
                </div>
                <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.6,whiteSpace:"pre-wrap"}}>{generated.lessonsThread}</div>
                <div style={{fontSize:11,color:"#475569",marginTop:10,fontStyle:"italic"}}>Great for LinkedIn, blog, or as the long-form caption on a carousel post.</div>
              </div>
            </>
          )}

          {/* Library */}
          {library.length > 0 && (
            <div className="glass-card" style={{padding:"16px 20px"}}>
              <div style={{fontSize:13,fontWeight:800,color:"#fff",marginBottom:10}}>📚 Library — Past Closings ({library.length})</div>
              <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:200,overflowY:"auto"}}>
                {library.slice(0,20).map(item => (
                  <button key={item.id} onClick={()=>{setClosing(item.closing);setGenerated(item.assets);}}
                    style={{background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.06)",borderRadius:8,padding:"8px 12px",textAlign:"left",cursor:"pointer",color:"#cbd5e1",fontSize:12,display:"flex",justifyContent:"space-between",gap:8}}>
                    <span>{item.closing.address}</span>
                    <span style={{fontSize:10,color:"#475569"}}>{new Date(item.createdAt).toLocaleDateString()}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};


// ─── INTEGRATIONS ─────────────────────────────────────────────────────────────
const Integrations = ({setPage,toast}) => {
  const [settings,setSettings] = useLS("integrations",{});
  const upd = (section,field,val) => setSettings(p=>({...p,[section]:{...(p[section]||{}),[field]:val}}));

  const [fbSyncing,setFbSyncing] = useState(false);
  const [leads,setLeads] = useLeadsCloud();

  const importFBLeads = async () => {
    const meta = settings.meta || {};
    if(!meta.accessToken || !meta.pageId) return toast.error("Enter your Facebook Page Access Token and Page ID first");
    setFbSyncing(true);
    try {
      const formsRes = await fetch(`https://graph.facebook.com/v19.0/${meta.pageId}/leadgen_forms?access_token=${meta.accessToken}&fields=id,name,status`);
      const formsData = await formsRes.json();
      if(formsData.error) throw new Error(formsData.error.message);
      const forms = formsData.data || [];
      if(forms.length === 0) { toast.info("No lead gen forms found on this page"); setFbSyncing(false); return; }
      let allLeads = [];
      for(const form of forms) {
        const lr = await fetch(`https://graph.facebook.com/v19.0/${form.id}/leads?access_token=${meta.accessToken}&fields=field_data,created_time`);
        const ld = await lr.json();
        (ld.data||[]).forEach(lead => {
          const fields = {};
          (lead.field_data||[]).forEach(f => { fields[f.name] = f.values?.[0] || ""; });
          allLeads.push({
            id: `fb_${lead.id}`,
            fbId: lead.id,
            name: fields.full_name || fields.first_name ? `${fields.first_name||""} ${fields.last_name||""}`.trim() : "FB Lead",
            email: fields.email || "",
            phone: fields.phone_number || "",
            type: "Buyer",
            status: "warm",
            budget: "",
            area: fields.city || "",
            notes: `Facebook Lead Ad · Form: ${form.name}`,
            createdAt: lead.created_time || new Date().toISOString(),
            source: "facebook"
          });
        });
      }
      const existingIds = new Set(leads.map(l=>l.fbId).filter(Boolean));
      const newLeads = allLeads.filter(l => !existingIds.has(l.fbId));
      if(newLeads.length === 0) { toast.info("No new Facebook leads found"); }
      else { setLeads(prev => [...newLeads, ...prev]); toast.success(`Imported ${newLeads.length} leads from Facebook`); }
    } catch(e) {
      toast.error(`Facebook error: ${e.message}`);
    }
    setFbSyncing(false);
  };

  const platforms = [
    {key:"fub",icon:"🏡",title:"Follow Up Boss CRM",color:"#1a5aa0",status:"free",statusLabel:"Connected · Your CRM",
     fields:[{id:"apiKey",label:"API Key",type:"password"}],
     defaultVals:{apiKey: process.env.REACT_APP_FUB_API_KEY || ""},
     instructions:"FUB key is loaded from .env.local (REACT_APP_FUB_API_KEY). Use the Sync FUB button in Lead Tracker to import your contacts."},
    {key:"meta",icon:"📘",title:"Meta — Facebook + Instagram",color:"#1877f2",status:"free",statusLabel:"Free · Direct API",
     fields:[{id:"accessToken",label:"Page Access Token",type:"password"},{id:"pageId",label:"Facebook Page ID"},{id:"igAccountId",label:"Instagram Business Account ID"}],
     instructions:"Facebook Developer Portal → Graph API Explorer → Select your Page → Generate token with pages_manage_posts + instagram_content_publish + leads_retrieval permissions."},
    {key:"linkedin",icon:"💼",title:"LinkedIn",color:"#0077b5",status:"approval",statusLabel:"Requires Developer App Approval",
     fields:[{id:"accessToken",label:"Access Token",type:"password"},{id:"organizationId",label:"Organization/Page ID (for company posts)"}],
     instructions:"LinkedIn Developer Portal → Create app → Request Marketing Developer Platform → Use OAuth 2.0 to get an access token with w_member_social scope."},
    {key:"youtube",icon:"▶️",title:"YouTube",color:"#ff4444",status:"free",statusLabel:"Free · Google Cloud",
     fields:[{id:"clientId",label:"Client ID"},{id:"clientSecret",label:"Client Secret",type:"password"},{id:"refreshToken",label:"Refresh Token",type:"password"}],
     instructions:"console.cloud.google.com → Enable YouTube Data API v3 → Create OAuth 2.0 credentials → Use OAuth Playground for refresh token."},
    {key:"zillow",icon:"🏠",title:"Zillow / IDX",color:"#006d93",status:"paid",statusLabel:"Requires Zillow Premier Agent",
     fields:[{id:"apiKey",label:"API Key"},{id:"zwsId",label:"Zillow Web Services ID"}],
     instructions:"Register at zillow.com/howto/api → Get your ZWSID → Use API for property data. Posting requires Premier Agent account."},
  ];

  const statusCls = {free:"badge-green",approval:"badge-gold",paid:"badge-red"};

  return (
    <div className="page-content">
      <PageHeader title="Integrations" sub="Direct API connections for your real estate business" setPage={setPage} parent="dashboard"/>
      <div className="info-banner info-green" style={{marginBottom:24}}><CheckCircle size={14} style={{flexShrink:0}}/> All credentials stored locally in your browser. Never sent to any third party.</div>
      <div className="col">
        {platforms.map(p=>{
          const vals={...(p.defaultVals||{}),...(settings[p.key]||{})};
          return (
            <div key={p.key} className="glass-card">
              <div className="flex-between" style={{marginBottom:12}}>
                <div style={{display:"flex",alignItems:"center",gap:12}}>
                  <span style={{fontSize:26}}>{p.icon}</span>
                  <div>
                    <div style={{fontWeight:800,fontSize:15,color:"#f1f5f9"}}>{p.title}</div>
                    <div style={{marginTop:4}}><span className={`badge ${statusCls[p.status]}`}>{p.statusLabel}</span></div>
                  </div>
                </div>
                <div style={{display:"flex",gap:8}}>
                  {p.key==="meta"&&<button className="btn btn-ghost btn-sm" onClick={importFBLeads} disabled={fbSyncing}><RefreshCw size={12}/>{fbSyncing?"Importing…":"Import Leads"}</button>}
                  {p.key==="fub"&&<button className="btn btn-ghost btn-sm" onClick={()=>setPage("leads")}><UserCheck size={12}/>Go to Lead Tracker</button>}
                  <button className="btn btn-blue btn-sm" onClick={()=>{upd(p.key,"_saved",true);toast.success("Settings saved!");}}><Save size={12}/>Save</button>
                </div>
              </div>
              <div style={{fontSize:12,color:"#475569",marginBottom:14,padding:"10px 14px",background:"rgba(0,0,0,.2)",borderRadius:9,lineHeight:1.7}}>ℹ️ {p.instructions}</div>
              <div className="grid-2" style={{gap:10}}>
                {p.fields.map(f=>(
                  <div key={f.id}><div className="label">{f.label}</div><input className="input" type={f.type||"text"} value={vals[f.id]||""} onChange={e=>upd(p.key,f.id,e.target.value)}/></div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ─── REALCOMP MLS ─────────────────────────────────────────────────────────────
const parseRealcompCSV = (text) => {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if(lines.length < 2) return [];
  const headers = lines[0].split(",").map(h => h.replace(/^"|"$/g,"").trim().toLowerCase());
  const get = (row, ...keys) => {
    for(const k of keys) {
      const i = headers.findIndex(h => h.includes(k));
      if(i !== -1 && row[i]) return row[i].replace(/^"|"$/g,"").trim();
    }
    return "";
  };
  return lines.slice(1).map((line, idx) => {
    const row = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g) || line.split(",");
    return {
      id: `rc_${idx}_${Date.now()}`,
      mlsNum:    get(row,"mls#","mls #","listing id","list num"),
      address:   get(row,"address","street"),
      city:      get(row,"city"),
      zip:       get(row,"zip","postal"),
      status:    get(row,"status","listing status"),
      listPrice: get(row,"list price","listing price","orig price"),
      salePrice: get(row,"sale price","sold price","close price","sold amt"),
      beds:      get(row,"bed","br"),
      baths:     get(row,"bath","ba"),
      sqft:      get(row,"sqft","sq ft","square feet","approx sqft"),
      dom:       get(row,"dom","days on market"),
      listDate:  get(row,"list date","listing date"),
      closeDate: get(row,"close date","sold date","closing date"),
      agent:     get(row,"list agent","agent name","agent"),
    };
  }).filter(r => r.address || r.mlsNum);
};

const RealcompMLS = ({setPage, toast}) => {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [showAutoSyncSetup, setShowAutoSyncSetup] = useState(false);
  const fileRef = useRef(null);

  // Load from Supabase listings table + realtime sub
  const reload = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      // Normalize snake_case → camelCase for UI consistency with the parser
      const ui = (data || []).map(r => ({
        id: r.id,
        mlsNum: r.mls_num || "",
        address: r.address || "",
        city: r.city || "",
        zip: r.zip || "",
        status: r.status || "",
        listPrice: r.list_price != null ? String(r.list_price) : "",
        salePrice: r.sale_price != null ? String(r.sale_price) : "",
        beds: r.beds != null ? String(r.beds) : "",
        baths: r.baths != null ? String(r.baths) : "",
        sqft: r.sqft != null ? String(r.sqft) : "",
        dom: r.dom != null ? String(r.dom) : "",
        listDate: r.list_date || "",
        closeDate: r.close_date || "",
        agent: r.agent || "",
        updatedAt: r.updated_at,
      }));
      setListings(ui);
    } catch (e) {
      console.warn("[realcomp] load failed:", e.message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    reload();
    const ch = supabase
      .channel("listings_changes_" + Date.now())
      .on("postgres_changes", {event:"*", schema:"public", table:"listings"}, () => reload())
      .subscribe();
    return () => { try { supabase.removeChannel(ch); } catch {} };
  }, [reload]);

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        // Upload to the same webhook endpoint Cloudmailin uses, so behavior is
        // identical for manual + auto imports.
        const res = await fetch("/api/webhook/realcomp-csv", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plain: ev.target.result }),
        });
        const j = await res.json();
        if (j.ok) {
          toast.success(`Imported ${j.upserted} listings (${j.received} rows in CSV)`);
          reload();
        } else {
          toast.error(j.error || "Import failed");
        }
      } catch(err) { toast.error("Upload error: " + err.message); }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const clearAll = async () => {
    if (!window.confirm("Delete ALL listings from your cloud? This can't be undone.")) return;
    try {
      const { error } = await supabase.from("listings").delete().neq("id", "");
      if (error) throw error;
      toast.success("Cleared all listings");
      reload();
    } catch (e) { toast.error("Clear failed: " + e.message); }
  };

  const statuses = ["all", ...Array.from(new Set(listings.map(l => l.status).filter(Boolean)))];
  const filtered = listings.filter(l => {
    const matchStatus = filter === "all" || l.status === filter;
    const matchSearch = !search || l.address?.toLowerCase().includes(search.toLowerCase()) || l.mlsNum?.includes(search) || l.city?.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const fmtPrice = v => v ? `$${Number(v.replace(/[^0-9.]/g,"")).toLocaleString()}` : "—";

  return (
    <div className="page-content">
      <PageHeader title="Realcomp MLS" sub={`${listings.length} listings ${loading?"loading…":"cloud-synced"}`} setPage={setPage} parent="dashboard"
        action={
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" onClick={()=>setShowAutoSyncSetup(s=>!s)}><Zap size={12}/>{showAutoSyncSetup?"Hide setup":"Auto-Sync Setup"}</button>
            <button className="btn btn-ghost btn-sm" onClick={()=>window.open("https://matrix.realcomponline.com","_blank")}><Globe size={12}/>Open Matrix</button>
            <button className="btn btn-blue btn-sm" onClick={()=>fileRef.current?.click()}><Upload size={12}/>Import CSV</button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{display:"none"}} onChange={handleFile}/>
          </div>
        }
      />

      {showAutoSyncSetup && (
        <div className="glass-card" style={{marginBottom:20,padding:"18px 22px"}}>
          <div style={{fontSize:15,fontWeight:800,color:"#fff",marginBottom:10,display:"flex",alignItems:"center",gap:8}}>
            <Zap size={16} color="#fbbf24"/>Auto-sync your Matrix saved search (free, ~10 min one-time setup)
          </div>
          <div style={{fontSize:12,color:"#94a3b8",lineHeight:1.7,marginBottom:14}}>
            Matrix can email a daily CSV of your saved search. A free service called <strong>Cloudmailin</strong> catches that email and forwards it to your hub. Result: every morning, your active / pending / sold listings are automatically refreshed here. No more manual CSV uploads.
          </div>
          <ol style={{paddingLeft:18,color:"#cbd5e1",lineHeight:1.9,fontSize:13,margin:0}}>
            <li><strong>Sign up for Cloudmailin</strong> (free) — <a href="https://www.cloudmailin.com/" target="_blank" rel="noreferrer" style={{color:"#7eb8f7"}}>cloudmailin.com</a>. Free plan = 10,000 emails/month (way more than you need).</li>
            <li>In Cloudmailin, create an inbound address. Get the email like <code style={{background:"rgba(255,255,255,.08)",padding:"1px 6px",borderRadius:4}}>abc123@cloudmailin.net</code> and set the destination URL to:</li>
            <li style={{listStyle:"none",marginLeft:-18,marginBottom:4}}>
              <div style={{display:"flex",gap:8,alignItems:"center",background:"rgba(255,255,255,.05)",borderRadius:7,padding:"8px 12px",marginTop:4}}>
                <code style={{flex:1,fontSize:12,color:"#cbd5e1",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{typeof window!=="undefined"?window.location.origin:"https://my-re-hub.vercel.app"}/api/webhook/realcomp-csv</code>
                <button className="btn btn-ghost btn-xs" onClick={()=>{navigator.clipboard.writeText((typeof window!=="undefined"?window.location.origin:"https://my-re-hub.vercel.app")+"/api/webhook/realcomp-csv");toast.success("Copied!");}}><Copy size={11}/>Copy</button>
              </div>
              Set the format to <strong>JSON Normalized</strong>.
            </li>
            <li><strong>In Matrix</strong>: run a search for <em>My Active Listings</em> (Listing Agent = your name, Status = Active / Pending / Sold — whatever you want included). Click <strong>Save Search</strong>.</li>
            <li>Click <strong>Email me Results</strong> → set frequency to <strong>Daily</strong>, format to <strong>CSV</strong>, recipient to your Cloudmailin address from step 2.</li>
            <li>That's it. Tomorrow morning the hub will auto-populate with your current actives, pendings, and solds.</li>
          </ol>
          <div style={{fontSize:11,color:"#475569",marginTop:14,fontStyle:"italic"}}>Tip: you can also POST any CSV manually to that URL with curl/Postman for testing. Or just use the Import CSV button above — same pipeline.</div>
        </div>
      )}

      <div className="info-banner info-green" style={{marginBottom:20}}>
        <CheckCircle size={14} style={{flexShrink:0}}/>
        Listings now live in Supabase. The webhook + Auto-Sync Setup button above lets Matrix push daily CSVs automatically. Or click Import CSV for manual upload.
      </div>

      {loading ? (
        <div className="glass-card" style={{padding:"40px",textAlign:"center",color:"#475569"}}><Spinner s={22}/><div style={{marginTop:10,fontSize:13}}>Loading your listings…</div></div>
      ) : listings.length === 0 ? (
        <div className="glass-card">
          <EmptyState icon={Building} title="No listings yet" desc="Click Auto-Sync Setup above to wire up the daily Matrix → cloud pipeline. Or Import CSV for a one-off upload."/>
        </div>
      ) : (
        <>
          <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap",alignItems:"center"}}>
            <input className="input" style={{maxWidth:240}} placeholder="Search address, MLS#, city..." value={search} onChange={e=>setSearch(e.target.value)}/>
            <div className="tabs" style={{width:"auto",flexWrap:"wrap"}}>
              {statuses.map(s=>(
                <button key={s} className={`tab ${filter===s?"active":""}`} onClick={()=>setFilter(s)} style={{textTransform:"capitalize"}}>
                  {s} ({s==="all"?listings.length:listings.filter(l=>l.status===s).length})
                </button>
              ))}
            </div>
            <button className="btn btn-ghost btn-sm" style={{marginLeft:"auto"}} onClick={clearAll}><Trash2 size={12}/>Clear All</button>
          </div>

          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
              <thead>
                <tr style={{borderBottom:"1px solid rgba(255,255,255,.08)"}}>
                  {["MLS#","Address","City","Status","List Price","Sale Price","Beds","Baths","Sqft","DOM","Close Date"].map(h=>(
                    <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:".5px",whiteSpace:"nowrap"}}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((l,i)=>(
                  <tr key={l.id} style={{borderBottom:"1px solid rgba(255,255,255,.04)",background:i%2===0?"transparent":"rgba(255,255,255,.01)"}}>
                    <td style={{padding:"10px 12px",color:"#7eb8f7",fontWeight:700,whiteSpace:"nowrap"}}>{l.mlsNum||"—"}</td>
                    <td style={{padding:"10px 12px",color:"#f1f5f9",fontWeight:600,maxWidth:200}}>{l.address||"—"}</td>
                    <td style={{padding:"10px 12px",color:"#cbd5e1"}}>{l.city||"—"}</td>
                    <td style={{padding:"10px 12px"}}>
                      <span className={`badge ${l.status?.toLowerCase().includes("sold")?"badge-green":l.status?.toLowerCase().includes("pend")?"badge-gold":l.status?.toLowerCase().includes("active")?"badge-blue":"badge-gray"}`}>
                        {l.status||"—"}
                      </span>
                    </td>
                    <td style={{padding:"10px 12px",color:"#f1f5f9",whiteSpace:"nowrap"}}>{fmtPrice(l.listPrice)}</td>
                    <td style={{padding:"10px 12px",color:"#6ee7b7",fontWeight:700,whiteSpace:"nowrap"}}>{fmtPrice(l.salePrice)}</td>
                    <td style={{padding:"10px 12px",color:"#cbd5e1",textAlign:"center"}}>{l.beds||"—"}</td>
                    <td style={{padding:"10px 12px",color:"#cbd5e1",textAlign:"center"}}>{l.baths||"—"}</td>
                    <td style={{padding:"10px 12px",color:"#cbd5e1",whiteSpace:"nowrap"}}>{l.sqft?Number(l.sqft.replace(/[^0-9]/g,"")).toLocaleString():"—"}</td>
                    <td style={{padding:"10px 12px",color:"#cbd5e1",textAlign:"center"}}>{l.dom||"—"}</td>
                    <td style={{padding:"10px 12px",color:"#cbd5e1",whiteSpace:"nowrap"}}>{l.closeDate||"—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

// ─── EMAIL ALERTS ─────────────────────────────────────────────────────────────
const EmailAlerts = ({setPage,toast}) => {
  const [s,setS] = useLS("email_settings",{smtpHost:"",smtpPort:"587",smtpUser:"",smtpPass:"",fromEmail:"",fromName:"",notifyLead:true,notifyShowing:true,notifyPublish:false});
  return (
    <div className="page-content">
      <PageHeader title="Email Alerts" sub="SMTP configuration for lead and activity notifications" setPage={setPage} parent="dashboard"/>
      <div className="glass-card" style={{maxWidth:680}}>
        <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:16,fontFamily:"'DM Serif Display',serif"}}>SMTP Configuration</div>
        <div className="grid-2" style={{gap:12,marginBottom:16}}>
          <div><div className="label">SMTP Host</div><input className="input" placeholder="smtp.gmail.com" value={s.smtpHost} onChange={e=>setS(p=>({...p,smtpHost:e.target.value}))}/></div>
          <div><div className="label">Port</div><input className="input" value={s.smtpPort} onChange={e=>setS(p=>({...p,smtpPort:e.target.value}))}/></div>
          <div><div className="label">Username / Email</div><input className="input" value={s.smtpUser} onChange={e=>setS(p=>({...p,smtpUser:e.target.value}))}/></div>
          <div><div className="label">Password / App Password</div><input className="input" type="password" value={s.smtpPass} onChange={e=>setS(p=>({...p,smtpPass:e.target.value}))}/></div>
          <div><div className="label">From Email</div><input className="input" value={s.fromEmail} onChange={e=>setS(p=>({...p,fromEmail:e.target.value}))}/></div>
          <div><div className="label">From Name</div><input className="input" placeholder="Your Name — Real Estate" value={s.fromName} onChange={e=>setS(p=>({...p,fromName:e.target.value}))}/></div>
        </div>
        <div className="divider"/>
        <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",marginBottom:14}}>Alert Preferences</div>
        {[
          {k:"notifyLead",l:"Alert when a new lead is added"},
          {k:"notifyShowing",l:"Alert for showing confirmations and reminders"},
          {k:"notifyPublish",l:"Alert when a post publishes successfully"},
        ].map(n=>(
          <div key={n.k} className="flex-between" style={{padding:"10px 0",borderBottom:"1px solid rgba(255,255,255,.04)"}}>
            <span style={{fontSize:13,color:"#94a3b8"}}>{n.l}</span>
            <Toggle checked={s[n.k]} onChange={v=>setS(p=>({...p,[n.k]:v}))}/>
          </div>
        ))}
        <div style={{display:"flex",gap:8,marginTop:20}}>
          <button className="btn btn-blue" onClick={()=>toast.success("Settings saved!")}><Save size={13}/>Save Settings</button>
          <button className="btn btn-ghost" onClick={()=>toast.info("Test email requires a live SMTP server")}><Send size={13}/>Send Test</button>
        </div>
      </div>
    </div>
  );
};

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
// ─── GMAIL SYNC HELPERS ───────────────────────────────────────────────────────
function gmailLoadGIS(){
  return new Promise(resolve=>{
    if(window.google?.accounts?.oauth2){ resolve(); return; }
    const s=document.createElement('script');
    s.src='https://accounts.google.com/gsi/client';
    s.onload=resolve; s.onerror=resolve;
    document.head.appendChild(s);
  });
}
async function gmailRequestToken(clientId){
  await gmailLoadGIS();
  return new Promise((resolve,reject)=>{
    try{
      const tc=window.google.accounts.oauth2.initTokenClient({
        client_id:clientId,
        scope:'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
        callback:r=>r.error?reject(new Error(r.error)):resolve(r),
      });
      tc.requestAccessToken({prompt:''});
    }catch(e){ reject(e); }
  });
}
async function gmailFetchNewEmails(token,sinceMs){
  const after=Math.floor((sinceMs||Date.now()-3600000)/1000);
  const r=await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=after:${after}&maxResults=100`,
    {headers:{Authorization:`Bearer ${token}`}}
  );
  if(!r.ok) throw new Error(`Gmail ${r.status}`);
  const d=await r.json();
  return d.messages||[];
}
async function gmailGetMessage(token,msgId){
  const r=await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`,
    {headers:{Authorization:`Bearer ${token}`}}
  );
  if(!r.ok) return null;
  return r.json();
}
function gmailExtractEmail(str){
  if(!str) return '';
  const m=str.match(/<([^>]+)>/)||str.match(/([^\s,<>"]+@[^\s,<>"]+)/);
  return m?m[1].toLowerCase().trim():str.toLowerCase().trim();
}

// Encode any string as base64url (Gmail API requires this, not standard base64).
function gmailB64url(str){
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

// RFC 2047 encode the Subject so emojis / accents survive transit.
function gmailEncodeSubject(subject){
  // eslint-disable-next-line no-control-regex
  return /[^\x00-\x7F]/.test(subject)
    ? `=?UTF-8?B?${gmailB64url(subject)}?=`
    : subject;
}

// ─── META (Facebook + Instagram) PUBLISHER ──────────────────────────────────
// Single source of truth for posting to FB Page + IG Business. Used by both
// the manual "Post Now" UI and the background ScheduledPostsWorker.
//
// post: { caption, platforms: ['facebook','instagram'], mediaUrl?, mediaType? }
//   mediaType: 'image' | 'video' (default 'image' if mediaUrl present)
// meta: { accessToken, pageId, igAccountId }
//
// Returns: { results: [{platform, ok, messageId?, error?}] }
// Never throws — errors are returned per-platform.
async function publishPostToMeta(post, meta) {
  const results = [];
  const hasMedia = !!post.mediaUrl;
  const mediaType = post.mediaType || 'image';

  // ── Facebook ─────────────────────────────────────────────────────────────
  if (post.platforms?.includes('facebook') && meta.pageId && meta.accessToken) {
    try {
      let endpoint, body;
      if (hasMedia && mediaType === 'video') {
        endpoint = `https://graph.facebook.com/v19.0/${meta.pageId}/videos`;
        body = { file_url: post.mediaUrl, description: post.caption, access_token: meta.accessToken };
      } else if (hasMedia) {
        endpoint = `https://graph.facebook.com/v19.0/${meta.pageId}/photos`;
        body = { url: post.mediaUrl, caption: post.caption, access_token: meta.accessToken };
      } else {
        endpoint = `https://graph.facebook.com/v19.0/${meta.pageId}/feed`;
        body = { message: post.caption, access_token: meta.accessToken };
      }
      const r = await fetch(endpoint, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body),
      });
      const d = await r.json();
      if (d.error) results.push({platform:'facebook', ok:false, error:d.error.message});
      else results.push({platform:'facebook', ok:true, messageId: d.id || d.post_id});
    } catch (e) {
      results.push({platform:'facebook', ok:false, error:e.message});
    }
  }

  // ── Instagram (requires media — IG has no text-only posts) ───────────────
  if (post.platforms?.includes('instagram') && meta.igAccountId && meta.accessToken) {
    if (!hasMedia) {
      results.push({platform:'instagram', ok:false, error:'Instagram requires an image or video URL — add one in the post form'});
    } else {
      try {
        // Step 1: create the media container
        const createBody = mediaType === 'video'
          ? { media_type: 'REELS', video_url: post.mediaUrl, caption: post.caption, access_token: meta.accessToken }
          : { image_url: post.mediaUrl, caption: post.caption, access_token: meta.accessToken };
        const cr = await fetch(`https://graph.facebook.com/v19.0/${meta.igAccountId}/media`, {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify(createBody),
        });
        const cd = await cr.json();
        if (cd.error) { results.push({platform:'instagram', ok:false, error:cd.error.message}); }
        else {
          // Step 2: video uploads need a few seconds to process — poll until FINISHED
          if (mediaType === 'video') {
            for (let i = 0; i < 12; i++) {
              await new Promise(r => setTimeout(r, 5000));
              const sr = await fetch(`https://graph.facebook.com/v19.0/${cd.id}?fields=status_code&access_token=${meta.accessToken}`);
              const sd = await sr.json();
              if (sd.status_code === 'FINISHED') break;
              if (sd.status_code === 'ERROR') throw new Error('Instagram failed to process the video');
            }
          }
          // Step 3: publish
          const pr = await fetch(`https://graph.facebook.com/v19.0/${meta.igAccountId}/media_publish`, {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ creation_id: cd.id, access_token: meta.accessToken }),
          });
          const pd = await pr.json();
          if (pd.error) results.push({platform:'instagram', ok:false, error:pd.error.message});
          else results.push({platform:'instagram', ok:true, messageId: pd.id});
        }
      } catch (e) {
        results.push({platform:'instagram', ok:false, error:e.message});
      }
    }
  }

  return { results };
}

// Send an email through the authenticated Gmail account.
// Returns the Gmail message ID on success; throws on failure.
async function gmailSendMessage(token, {to, subject, body, fromName}){
  const headers = [
    `To: ${to}`,
    `Subject: ${gmailEncodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
  ];
  if (fromName) headers.unshift(`From: ${fromName}`); // Gmail still enforces actual From = auth account
  const raw = gmailB64url(headers.join('\r\n') + '\r\n\r\n' + body);
  const r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({raw}),
  });
  if (!r.ok) {
    const err = await r.json().catch(()=>({}));
    throw new Error(err.error?.message || `Gmail send failed: ${r.status}`);
  }
  return (await r.json()).id;
}

// ─── GMAIL SYNC WORKER (background, renders nothing) ─────────────────────────
// Two passes each tick:
//   1. INBOUND sync — log new received/sent Gmail messages to contact timelines
//   2. DRIP AUTO-SEND — fire any queued campaign emails whose dueDate has arrived
//      (only when gmail_autosend === 'on' in localStorage).
const GmailSyncWorker = ({notify, toast}) => {
  const [leads]=useLeadsCloud();
  useEffect(()=>{
    const autoSendDrips=async(token)=>{
      if (localStorage.getItem('gmail_autosend') !== 'on') return 0;
      const queue = JSON.parse(localStorage.getItem('email_queue')||'[]');
      const todayStr = new Date().toISOString().slice(0,10);
      const due = queue.filter(e => !e.sent && e.dueDate <= todayStr && e.leadEmail);
      if (!due.length) return 0;
      const profile = JSON.parse(localStorage.getItem('re_profile')||'{}');
      const fromName = profile.name ? `${profile.name} <me>` : '';
      let sent = 0;
      for (const entry of due) {
        try {
          const msgId = await gmailSendMessage(token, {
            to: entry.leadEmail,
            subject: entry.subject,
            body: entry.body,
            fromName,
          });
          // Re-read queue (Campaigns page may have mutated it) and mark this entry sent.
          const fresh = JSON.parse(localStorage.getItem('email_queue')||'[]');
          const updated = fresh.map(e => e.id === entry.id
            ? {...e, sent:true, sentAt: new Date().toISOString(), sentMethod:'gmail-auto', gmailMessageId: msgId}
            : e);
          localStorage.setItem('email_queue', JSON.stringify(updated));
          // Drop a note on the lead's activity timeline.
          const actKey = `activities_${entry.leadId}`;
          const existing = JSON.parse(localStorage.getItem(actKey)||'[]');
          existing.unshift({
            id: uid(), type: 'gmail', direction: 'outbound',
            subject: entry.subject,
            note: `📤 Auto-sent "${entry.campaignName}" email: "${entry.subject}"`,
            gmailId: msgId,
            createdAt: new Date().toISOString(),
          });
          localStorage.setItem(actKey, JSON.stringify(existing));
          sent++;
        } catch (err) {
          console.warn(`Drip send failed for ${entry.leadEmail}:`, err.message);
          // Mark with an error so the Campaigns UI can surface it without retrying forever.
          const fresh = JSON.parse(localStorage.getItem('email_queue')||'[]');
          const updated = fresh.map(e => e.id === entry.id
            ? {...e, sendError: err.message, sendErrorAt: new Date().toISOString()}
            : e);
          localStorage.setItem('email_queue', JSON.stringify(updated));
        }
      }
      if (sent > 0) {
        window.dispatchEvent(new CustomEvent('email-queue-updated'));
        toast.success(`📤 Auto-sent ${sent} drip email${sent>1?'s':''} via Gmail`);
        notify('📤 Drips sent', `${sent} campaign email${sent>1?'s':''} went out automatically`, 'drip-auto');
      }
      return sent;
    };

    const doSync=async()=>{
      const token=localStorage.getItem('gmail_token');
      const expiry=parseInt(localStorage.getItem('gmail_token_expiry')||'0');
      if(!token||Date.now()>expiry) return;
      try{
        const since=parseInt(localStorage.getItem('gmail_last_sync')||'0')||Date.now()-3600000;
        const msgs=await gmailFetchNewEmails(token,since);
        let logged=0;
        for(const msg of msgs){
          const syncKey=`gmail_synced_${msg.id}`;
          if(localStorage.getItem(syncKey)) continue;
          const detail=await gmailGetMessage(token,msg.id);
          if(!detail) continue;
          const headers=detail.payload?.headers||[];
          const from=headers.find(h=>h.name==='From')?.value||'';
          const to=headers.find(h=>h.name==='To')?.value||'';
          const subject=headers.find(h=>h.name==='Subject')?.value||'(no subject)';
          const fromEmail=gmailExtractEmail(from);
          const toEmails=(to||'').split(',').map(gmailExtractEmail);
          leads.forEach(lead=>{
            if(!lead.email) return;
            const le=lead.email.toLowerCase().trim();
            const isIn=fromEmail===le;
            const isOut=toEmails.some(e=>e===le);
            if(!isIn&&!isOut) return;
            localStorage.setItem(syncKey,'1');
            const actKey=`activities_${lead.id}`;
            const existing=JSON.parse(localStorage.getItem(actKey)||'[]');
            if(existing.find(a=>a.gmailId===msg.id)) return;
            existing.unshift({id:uid(),type:'gmail',direction:isIn?'inbound':'outbound',subject,note:`${isIn?'📨 Email from':'📤 Email to'} ${lead.name}: "${subject}"`,gmailId:msg.id,createdAt:new Date().toISOString()});
            localStorage.setItem(actKey,JSON.stringify(existing));
            logged++;
          });
        }
        localStorage.setItem('gmail_last_sync',String(Date.now()));
        if(logged>0){
          toast.info(`📧 ${logged} email${logged>1?'s':''} logged from Gmail`);
          notify('📧 Gmail Sync',`${logged} email${logged>1?'s':''} logged on contact timelines`,'gmail-sync');
        }
        // After inbound sync, check the drip queue and fire anything that's due.
        await autoSendDrips(token);
      }catch(e){ console.warn('Gmail sync:',e.message); }
    };
    doSync();
    const interval=setInterval(doSync,5*60*1000);
    const handler=()=>doSync();
    window.addEventListener('gmail-sync-now',handler);
    return()=>{ clearInterval(interval); window.removeEventListener('gmail-sync-now',handler); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[leads]);
  return null;
};

// ─── SCHEDULED POSTS WORKER (background, renders nothing) ───────────────────
// Polls the posts queue every 60 seconds. For each post whose scheduledAt has
// ─── AI LEAD CONCIERGE WORKER ────────────────────────────────────────────────
// Listens for new rows in lead_inbox via Supabase realtime. For each new lead
// that matches the user's concierge settings (enabled, source allowed, within
// quiet hours, under daily cap), drafts a personalized AI response and:
//   • Queues the email into email_queue (GmailSyncWorker auto-sends within ~30s)
//   • Creates a Text task with the SMS pre-written (tap-to-send on mobile)
// Marks the lead_inbox row's meta with concierge_fired_at so we never re-fire.
const AILeadConciergeWorker = ({ notify, toast }) => {
  const [settings] = useLS("concierge_settings", DEFAULT_CONCIERGE_SETTINGS);
  const [profile]  = useLS("re_profile", { name: "Monica Iskra", brokerage: "RE/MAX Classic", phone: "" });
  const [agentVoice] = useLS("agent_voice", "");
  const [, setQueue] = useLS("email_queue", []);
  const [, setTasks] = useLS("tasks", []);
  const settingsRef = useRef(settings);
  const profileRef  = useRef(profile);
  const voiceRef    = useRef(agentVoice);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { profileRef.current  = profile;  }, [profile]);
  useEffect(() => { voiceRef.current    = agentVoice; }, [agentVoice]);

  const processedIds = useRef(new Set()); // session-local dedupe

  useEffect(() => {
    const handleNewLead = async (row) => {
      const s = settingsRef.current;
      if (!s.enabled) return;
      if (!row?.id || processedIds.current.has(row.id)) return;
      processedIds.current.add(row.id);

      // Source filter
      const source = row.source || "Web";
      const sourceAllowed = s.sources?.[source] === true;
      if (!sourceAllowed) {
        console.log(`[Concierge] Skipping ${row.name||row.id} — source "${source}" not enabled`);
        return;
      }

      // Quiet hours
      if (s.quietHours?.enabled) {
        const hour = new Date().getHours();
        if (hour < s.quietHours.startHour || hour >= s.quietHours.endHour) {
          console.log(`[Concierge] Quiet hours (${hour}:00) — skipping ${row.name||row.id}`);
          return;
        }
      }

      // Daily cap
      const todayKey = new Date().toISOString().slice(0, 10);
      const log = JSON.parse(localStorage.getItem("concierge_log") || "{}");
      const todayCount = log[todayKey]?.count || 0;
      if (todayCount >= (s.dailyCap || 30)) {
        console.log(`[Concierge] Daily cap (${s.dailyCap}) reached — skipping`);
        return;
      }

      // Channel + contact-info requirements
      const wantEmail = s.channels?.email && row.email;
      const wantSms   = s.channels?.sms   && row.phone;
      if (!wantEmail && !wantSms) {
        console.log(`[Concierge] Neither email nor SMS possible — skipping`);
        return;
      }

      // Draft
      let drafted;
      try {
        drafted = await draftLeadResponse({
          lead: row,
          profile: profileRef.current,
          agentVoice: voiceRef.current,
        });
      } catch (e) {
        console.warn(`[Concierge] AI draft failed for ${row.name||row.id}:`, e.message);
        toast?.error?.(`AI concierge couldn't draft response for ${row.name||"new lead"}: ${e.message}`);
        return;
      }

      const firstName = (row.name || "").split(" ")[0] || "there";
      let didEmail = false, didSms = false;

      // Queue email
      if (wantEmail && drafted.emailSubject && drafted.emailBody) {
        setQueue(p => [...p, {
          id: `concierge_e_${row.id}_${Date.now()}`,
          leadId: row.id,
          leadName: row.name,
          leadEmail: row.email,
          campaignId: "concierge",
          campaignName: "AI Concierge — instant response",
          subject: drafted.emailSubject,
          body: drafted.emailBody,
          dueDate: todayKey,
          stepIndex: 0,
          sent: false,
          createdAt: new Date().toISOString(),
        }]);
        didEmail = true;
      }

      // Create SMS task with smsBody pre-filled
      if (wantSms && drafted.smsBody) {
        setTasks(p => [...p, {
          id: `concierge_sms_${row.id}_${Date.now()}`,
          title: `📱 Send AI text to ${firstName} (${source} lead, just arrived)`,
          type: "Text",
          leadId: row.id,
          leadName: row.name,
          dueDate: todayKey,
          notes: drafted.smsBody,
          smsBody: drafted.smsBody,
          campaignId: "concierge",
          campaignName: "AI Concierge — instant response",
          stepIndex: 0,
          completed: false,
          createdAt: new Date().toISOString(),
        }]);
        didSms = true;
      }

      // Bump daily counter
      log[todayKey] = { count: (log[todayKey]?.count || 0) + 1 };
      localStorage.setItem("concierge_log", JSON.stringify(log));

      // Activity log on the lead (if it's already in leads)
      try {
        const actKey = `activities_${row.id}`;
        const existing = JSON.parse(localStorage.getItem(actKey) || "[]");
        existing.unshift({
          id: uid(), type: "concierge", direction: "outbound",
          note: `🤖 AI Concierge drafted ${didEmail?"email":""}${didEmail&&didSms?" + ":""}${didSms?"text":""} for new ${source} lead`,
          createdAt: new Date().toISOString(),
        });
        localStorage.setItem(actKey, JSON.stringify(existing));
      } catch {}

      // Mark inbox row as fired (so other sessions don't double-fire)
      try {
        await supabase.from("lead_inbox").update({
          raw: { ...(row.raw || {}), concierge_fired_at: new Date().toISOString() },
        }).eq("id", row.id);
      } catch (e) { console.warn("[Concierge] mark fired failed:", e?.message); }

      // Toast + notification
      const channels = [didEmail && "email", didSms && "text"].filter(Boolean).join(" + ");
      toast?.success?.(`🤖 AI Concierge ${channels} queued for ${row.name || "new lead"}`);
      notify?.(`AI Concierge fired`, `${channels} response queued for ${row.name || "new lead"} (${source})`, "concierge");
    };

    if (!isCloudEnabled) return; // no realtime without Supabase

    const channel = supabase
      .channel("concierge_inbox_" + Date.now())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_inbox" }, (payload) => {
        const row = payload.new;
        // Skip rows that already got a concierge response (e.g. seen on another device)
        if (row?.raw?.concierge_fired_at) return;
        handleNewLead(row).catch(e => console.warn("[Concierge handle]", e));
      })
      .subscribe();

    return () => { try { supabase.removeChannel(channel); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null; // invisible worker
};


// ─── SOCIAL ENGAGEMENT WORKER ─────────────────────────────────────────────
// Polls Meta Graph API every N minutes for new comments on Monica's recent
// FB Page posts + IG Business posts. For each new comment that hasn't been
// processed yet:
//   • Pre-filter (skip spam / low-signal noise)
//   • Auto-like (FB only — IG API doesn't support comment-likes)
//   • AI decides: reply / like_only / skip / escalate
//   • If reply: posts reply via Graph API
//   • If buyer-intent: drafts a DM to send (review-and-send for safety)
//   • If escalate: drops into a notification queue for Monica to review
// All actions logged to localStorage `social_activity` for the Activity tab.
const SocialEngagementWorker = ({ notify, toast }) => {
  const [settings] = useLS("social_settings", DEFAULT_SOCIAL_SETTINGS);
  const [integrations] = useLS("integrations", {});
  const [profile] = useLS("re_profile", { name: "Monica Iskra", brokerage: "RE/MAX Classic" });
  const [agentVoice] = useLS("agent_voice", "");
  const settingsRef = useRef(settings);
  const integrationsRef = useRef(integrations);
  useEffect(() => { settingsRef.current = settings; }, [settings]);
  useEffect(() => { integrationsRef.current = integrations; }, [integrations]);

  useEffect(() => {
    let cancelled = false;

    const fbApi = async (path, opts = {}) => {
      const token = integrationsRef.current?.meta?.accessToken;
      if (!token) throw new Error("Meta access token not set");
      const url = `https://graph.facebook.com/v19.0/${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
      const r = await fetch(url, opts);
      const j = await r.json();
      if (j.error) throw new Error(`FB ${j.error.code}: ${j.error.message}`);
      return j;
    };

    const logActivity = (entry) => {
      const log = JSON.parse(localStorage.getItem("social_activity") || "[]");
      log.unshift({ id: uid(), createdAt: new Date().toISOString(), ...entry });
      // Keep last 500 entries
      localStorage.setItem("social_activity", JSON.stringify(log.slice(0, 500)));
      window.dispatchEvent(new CustomEvent("social-activity-updated"));
    };

    const bumpDailyCounter = () => {
      const today = new Date().toISOString().slice(0, 10);
      const c = JSON.parse(localStorage.getItem("social_daily_count") || "{}");
      c[today] = (c[today] || 0) + 1;
      localStorage.setItem("social_daily_count", JSON.stringify(c));
      return c[today];
    };
    const todayCount = () => {
      const today = new Date().toISOString().slice(0, 10);
      const c = JSON.parse(localStorage.getItem("social_daily_count") || "{}");
      return c[today] || 0;
    };

    const handledIds = () => {
      try { return new Set(JSON.parse(localStorage.getItem("social_handled_ids") || "[]")); }
      catch { return new Set(); }
    };
    const markHandled = (id) => {
      const set = handledIds();
      set.add(id);
      // Keep last 5000 IDs
      const arr = Array.from(set).slice(-5000);
      localStorage.setItem("social_handled_ids", JSON.stringify(arr));
    };

    const processComment = async (comment, post) => {
      const s = settingsRef.current;
      if (handledIds().has(comment.id)) return;
      // Skip comments from herself / her page
      if (comment.fromId && (comment.fromId === post.pageId || comment.fromId === post.igUserId)) {
        markHandled(comment.id);
        return;
      }
      if (todayCount() >= s.rules.maxRepliesPerDay) {
        console.log("[SocialAgent] daily cap reached");
        return;
      }
      const text = comment.message || "";

      // Spam pre-filter
      if (s.rules.skipSpam && looksLikeSpam(text)) {
        markHandled(comment.id);
        logActivity({ type: "skip", platform: post.platform, postId: post.id, commentId: comment.id, from: comment.fromName, comment: text, action: "skip_spam" });
        return;
      }

      // Auto-like (FB only)
      if (post.platform === "facebook" && s.facebook.autoLike) {
        try {
          await fbApi(`${comment.id}/likes`, { method: "POST" });
        } catch (e) { console.warn("[SocialAgent] like failed", e.message); }
      }

      // Low-signal noise — just like, don't reply
      if (s.rules.likeOnlyForNoise && isLowSignalComment(text)) {
        markHandled(comment.id);
        logActivity({ type: "like_only", platform: post.platform, postId: post.id, commentId: comment.id, from: comment.fromName, comment: text, action: "auto_like_only" });
        return;
      }

      // Ask AI what to do
      let decision;
      try {
        decision = await draftSocialReply({
          comment: { id: comment.id, message: text, fromName: comment.fromName },
          post: { id: post.id, message: post.message, caption: post.caption, platform: post.platform },
          agent: { name: profile.name, brokerage: profile.brokerage },
          agentVoice,
        });
      } catch (e) {
        console.warn("[SocialAgent] AI draft failed", e.message);
        return; // try again next poll
      }

      // Reply
      const wantsReply = decision.action === "reply" && decision.reply &&
        ((post.platform === "facebook" && s.facebook.autoReply) || (post.platform === "instagram" && s.instagram.autoReply));

      if (wantsReply) {
        try {
          if (post.platform === "facebook") {
            await fbApi(`${comment.id}/comments`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ message: decision.reply }),
            });
          } else {
            // Instagram reply via /{ig-comment-id}/replies
            await fbApi(`${comment.id}/replies?message=${encodeURIComponent(decision.reply)}`, { method: "POST" });
          }
          bumpDailyCounter();
          logActivity({ type: "reply", platform: post.platform, postId: post.id, commentId: comment.id, from: comment.fromName, comment: text, reply: decision.reply, dm: decision.dmFollowup || null });
          notify?.("💬 Auto-reply sent", `Replied to ${comment.fromName || "comment"} on ${post.platform}`, "social-reply");
        } catch (e) {
          console.warn("[SocialAgent] reply failed", e.message);
          logActivity({ type: "error", platform: post.platform, postId: post.id, commentId: comment.id, from: comment.fromName, comment: text, error: e.message });
        }
      }

      // DM funnel
      if (s.rules.enableDmFunnel && decision.dmFollowup && comment.fromId) {
        // Don't actually auto-send DMs — they require pages_messaging scope and
        // 24-hour messaging window. Queue for Monica's review instead.
        logActivity({ type: "dm_draft", platform: post.platform, postId: post.id, commentId: comment.id, from: comment.fromName, fromId: comment.fromId, dm: decision.dmFollowup, status: "awaiting_send" });
      }

      // Escalate
      if (decision.action === "escalate" && s.rules.escalateToInbox) {
        logActivity({ type: "escalate", platform: post.platform, postId: post.id, commentId: comment.id, from: comment.fromName, comment: text, reason: decision.escalateReason });
        toast?.info?.(`⚠ Comment flagged for review: ${decision.escalateReason}`);
      }

      markHandled(comment.id);
    };

    const fetchAndProcess = async () => {
      const s = settingsRef.current;
      const ints = integrationsRef.current;
      if (!s.enabled || cancelled) return;
      if (!ints?.meta?.accessToken) return;

      try {
        // ── Facebook Page comments ──────────────────────────────────────
        if (s.facebook.enabled && ints.meta.pageId) {
          const posts = await fbApi(`${ints.meta.pageId}/posts?limit=${s.postsToWatch}&fields=id,message,created_time`);
          for (const p of (posts.data || [])) {
            if (cancelled) return;
            try {
              const cs = await fbApi(`${p.id}/comments?limit=50&order=reverse_chronological&fields=id,message,from,created_time,parent`);
              for (const c of (cs.data || [])) {
                if (cancelled) return;
                if (c.parent) continue; // skip nested replies
                await processComment(
                  { id: c.id, message: c.message, fromName: c.from?.name, fromId: c.from?.id },
                  { id: p.id, message: p.message, platform: "facebook", pageId: ints.meta.pageId }
                );
              }
            } catch (e) { console.warn(`[SocialAgent] FB post ${p.id} comments fetch failed`, e.message); }
          }
        }

        // ── Instagram comments ──────────────────────────────────────────
        if (s.instagram.enabled && ints.meta.igAccountId) {
          const media = await fbApi(`${ints.meta.igAccountId}/media?limit=${s.postsToWatch}&fields=id,caption,timestamp,media_type`);
          for (const m of (media.data || [])) {
            if (cancelled) return;
            try {
              const cs = await fbApi(`${m.id}/comments?limit=50&fields=id,text,username,from,timestamp`);
              for (const c of (cs.data || [])) {
                if (cancelled) return;
                await processComment(
                  { id: c.id, message: c.text, fromName: c.username || c.from?.username, fromId: c.from?.id },
                  { id: m.id, caption: m.caption, platform: "instagram", igUserId: ints.meta.igAccountId }
                );
              }
            } catch (e) { console.warn(`[SocialAgent] IG media ${m.id} comments fetch failed`, e.message); }
          }
        }
      } catch (e) {
        console.warn("[SocialAgent] fetch error", e.message);
      }
    };

    fetchAndProcess();
    const intervalMs = Math.max(60, (settings.pollIntervalMinutes || 5)) * 60 * 1000;
    const t = setInterval(fetchAndProcess, intervalMs);

    return () => { cancelled = true; clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};


// passed and is still status==='scheduled', tries to publish via Meta APIs.
// Updates the post in place with the result, then dispatches 'posts-updated'
// so any open Content Scheduler page re-renders.
const ScheduledPostsWorker = ({notify, toast}) => {
  useEffect(() => {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        const integrations = JSON.parse(localStorage.getItem('integrations') || '{}');
        const meta = integrations.meta || {};
        if (!meta.accessToken || !meta.pageId) { running = false; return; }
        const posts = JSON.parse(localStorage.getItem('posts') || '[]');
        const nowMs = Date.now();
        const due = posts.filter(p =>
          p.status === 'scheduled' &&
          p.scheduledAt &&
          new Date(p.scheduledAt).getTime() <= nowMs &&
          !p._publishing
        );
        if (!due.length) { running = false; return; }
        let published = 0, failed = 0;
        for (const p of due) {
          // Re-read fresh and mark as publishing to prevent any double-fire.
          {
            const fresh = JSON.parse(localStorage.getItem('posts') || '[]');
            const updated = fresh.map(x => x.id === p.id ? {...x, _publishing:true} : x);
            localStorage.setItem('posts', JSON.stringify(updated));
          }
          // ContentScheduler stores ONE post per platform (it explodes platforms on save),
          // so each scheduled record only targets one platform via p.platform.
          const platforms = p.platforms || (p.platform ? [p.platform] : []);
          const { results } = await publishPostToMeta({
            caption: p.caption,
            platforms,
            mediaUrl: p.mediaUrl,
            mediaType: p.mediaType,
          }, meta);
          const allOk = results.length > 0 && results.every(r => r.ok);
          const errs = results.filter(r => !r.ok);
          const ok   = results.filter(r => r.ok);
          const fresh = JSON.parse(localStorage.getItem('posts') || '[]');
          const updated = fresh.map(x => x.id === p.id ? {
            ...x,
            _publishing: false,
            status: allOk ? 'published' : (ok.length > 0 ? 'published' : 'failed'),
            publishedAt: ok.length > 0 ? new Date().toISOString() : x.publishedAt,
            postResults: results,
            postError: errs.length ? errs.map(e=>`${e.platform}: ${e.error}`).join(' · ') : undefined,
            messageIds: ok.length ? ok.reduce((a,r)=>({...a, [r.platform]: r.messageId}), {}) : x.messageIds,
          } : x);
          localStorage.setItem('posts', JSON.stringify(updated));
          if (allOk) published++; else failed++;
        }
        window.dispatchEvent(new CustomEvent('posts-updated'));
        if (published > 0) {
          toast.success(`📣 Published ${published} scheduled post${published>1?'s':''}`);
          notify('📣 Posts Published', `${published} scheduled post${published>1?'s':''} went live`, 'posts-published');
        }
        if (failed > 0) {
          toast.error(`⚠ ${failed} scheduled post${failed>1?'s':''} failed — check Content Scheduler`);
        }
      } catch (e) {
        console.warn('Scheduled post worker error:', e.message);
      } finally {
        running = false;
      }
    };
    tick();
    const id = setInterval(tick, 60 * 1000);
    const handler = () => tick();
    window.addEventListener('posts-fire-now', handler);
    return () => { clearInterval(id); window.removeEventListener('posts-fire-now', handler); };
  }, [notify, toast]);
  return null;
};

const SettingsPage = ({setPage,toast}) => {
  const [tab,setTab] = useState("profile");
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
  const [profile,setProfile] = useLS("re_profile",{name:"",brokerage:"",email:"",phone:"",license:""});
  const [agentVoice,setAgentVoice] = useLS("agent_voice","");
  const [areas,setAreas] = useLS("service_areas","");
  const [customPlans] = useLS("action_plans",[]);
  const [autoPlanId,setAutoPlanId] = useState(()=>localStorage.getItem('auto_action_plan_id')||'');
  const [gmailClientId,setGmailClientId] = useLS("gmail_client_id","");
  const [gmailConnected,setGmailConnected] = useState(()=>!!localStorage.getItem('gmail_token'));
  const [gmailLastSync,setGmailLastSync] = useState(()=>localStorage.getItem('gmail_last_sync')||'');
  const [gmailSyncStatus,setGmailSyncStatus] = useState('');

  const allPlans = [...BUILT_IN_PLANS,...customPlans];

  const saveAutoPlan = ()=>{
    localStorage.setItem('auto_action_plan_id',autoPlanId);
    toast.success(autoPlanId?'Auto-enroll plan saved!':'Auto-enroll disabled');
  };

  const connectGmail = async()=>{
    if(!gmailClientId.trim()) return toast.error("Enter your Google Client ID first");
    try{
      localStorage.setItem('gmail_client_id',gmailClientId.trim());
      const tokenResp = await gmailRequestToken(gmailClientId.trim());
      localStorage.setItem('gmail_token',tokenResp.access_token);
      localStorage.setItem('gmail_token_expiry',String(Date.now()+((tokenResp.expires_in||3600)*1000)));
      setGmailConnected(true);
      toast.success("Gmail connected! Emails will sync every 5 minutes.");
      window.dispatchEvent(new CustomEvent('gmail-sync-now'));
    }catch(e){
      toast.error("Connection failed — check your Client ID and ensure http://localhost:3000 is an authorized origin.");
    }
  };

  const disconnectGmail = ()=>{
    ['gmail_token','gmail_token_expiry','gmail_last_sync'].forEach(k=>localStorage.removeItem(k));
    setGmailConnected(false);
    toast.success("Gmail disconnected");
  };

  const manualSync = ()=>{
    setGmailSyncStatus('syncing');
    window.dispatchEvent(new CustomEvent('gmail-sync-now'));
    toast.info("Gmail sync triggered");
    setTimeout(()=>{ setGmailSyncStatus(''); setGmailLastSync(localStorage.getItem('gmail_last_sync')||''); },5000);
  };

  return (
    <div className="page-content">
      <PageHeader title="Settings" sub="Your profile, brand, and preferences" setPage={setPage} parent="dashboard"/>
      <div style={{display:"flex",gap:22}}>
        <div style={{display:"flex",flexDirection:"column",gap:3,minWidth:160,flexShrink:0}}>
          {[{id:"profile",l:"Agent Profile"},{id:"brand",l:"Brand Voice"},{id:"areas",l:"Service Areas"},{id:"ai",l:"AI Settings"},{id:"automation",l:"🤖 Automation"},{id:"gmail",l:"📧 Gmail Sync"},{id:"mobile",l:"📱 Mobile App"}].map(t=>(
            <button key={t.id} className={`nav-item ${tab===t.id?"active":""}`} onClick={()=>setTab(t.id)}>{t.l}</button>
          ))}
        </div>
        <div className="glass-card" style={{flex:1}}>
          {tab==="profile"&&(
            <div className="col" style={{maxWidth:480}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>Agent Profile</div>
              <div><div className="label">Full Name</div><input className="input" placeholder="Jane Smith" value={profile.name} onChange={e=>setProfile(p=>({...p,name:e.target.value}))}/></div>
              <div><div className="label">Brokerage</div><input className="input" placeholder="Keller Williams, RE/MAX, Coldwell Banker..." value={profile.brokerage} onChange={e=>setProfile(p=>({...p,brokerage:e.target.value}))}/></div>
              <div><div className="label">Email</div><input className="input" type="email" value={profile.email} onChange={e=>setProfile(p=>({...p,email:e.target.value}))}/></div>
              <div><div className="label">Phone</div><input className="input" placeholder="(555) 000-0000" value={profile.phone} onChange={e=>setProfile(p=>({...p,phone:e.target.value}))}/></div>
              <div><div className="label">License Number</div><input className="input" placeholder="State license number" value={profile.license} onChange={e=>setProfile(p=>({...p,license:e.target.value}))}/></div>
              <button className="btn btn-blue" style={{width:"fit-content"}} onClick={()=>toast.success("Profile saved!")}><Save size={13}/>Save Profile</button>
            </div>
          )}
          {tab==="brand"&&(
            <div className="col">
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>Agent Brand Voice</div>
              <div style={{fontSize:13,color:"#475569",lineHeight:1.7}}>This is what makes every AI tool sound authentically like <em>you</em>. The more detail you provide, the better the output quality across all tools.</div>
              <div className="info-banner info-blue"><Info size={14} style={{flexShrink:0}}/> Include your specialty, target client, personality, what makes you different, and how you talk to clients.</div>
              <textarea className="textarea" style={{minHeight:220}} placeholder="e.g. I'm Jane Smith, a luxury real estate agent in Chicago's North Shore with 12 years of experience. I specialize in move-up buyers and relocation clients. My tone is warm, professional, and confident — I never use pushy sales language. I talk to clients like a trusted advisor, not a salesperson. I'm known for deep market knowledge and white-glove service. My clients are typically families ages 35-55 with household incomes over $200k." value={agentVoice} onChange={e=>setAgentVoice(e.target.value)}/>
              <button className="btn btn-blue" style={{width:"fit-content"}} onClick={()=>toast.success("Brand voice saved!")}><Save size={13}/>Save Brand Voice</button>
            </div>
          )}
          {tab==="areas"&&(
            <div className="col">
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>Service Areas</div>
              <div style={{fontSize:13,color:"#475569"}}>List the neighborhoods, cities, and ZIP codes you serve. Used by AI tools for hyper-local content.</div>
              <textarea className="textarea" style={{minHeight:160}} placeholder="e.g. Oak Park, River Forest, Forest Park, Berwyn (IL)&#10;ZIP: 60302, 60304, 60305, 60130&#10;Specialties: North Shore, Lincoln Park luxury condos" value={areas} onChange={e=>setAreas(e.target.value)}/>
              <button className="btn btn-blue" style={{width:"fit-content"}} onClick={()=>toast.success("Service areas saved!")}><Save size={13}/>Save Areas</button>
            </div>
          )}
          {tab==="ai"&&(
            <div className="col" style={{maxWidth:480}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>AI Settings</div>
              <div className="info-banner info-blue">Claude AI powers all text generation throughout this hub. Your brand voice in the Brand Voice tab shapes all outputs.</div>
              <div style={{padding:14,background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.15)",borderRadius:11}}>
                <div style={{fontSize:13,fontWeight:700,color:"#6ee7b7",marginBottom:6}}>✅ Claude AI Connected</div>
                <div style={{fontSize:12,color:"#475569"}}>All listing descriptions, captions, market reports, and analyses are powered by Claude Sonnet.</div>
              </div>
            </div>
          )}
          {tab==="automation"&&(
            <div className="col" style={{maxWidth:520}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>🤖 Lead Automation</div>
              <div style={{fontSize:13,color:"#475569",lineHeight:1.8}}>Configure what happens automatically when a new lead arrives in your inbox.</div>

              {/* Auto-enroll action plan */}
              <div className="glass-card" style={{padding:"18px 20px"}}>
                <div style={{fontWeight:700,color:"#fff",marginBottom:8}}>📋 Auto-Enroll in Action Plan</div>
                <div style={{fontSize:12,color:"#475569",marginBottom:14}}>Every new lead that comes in through your inbox will automatically be enrolled in this action plan when you import them. Tasks get created for each step.</div>
                <div className="label">Default Action Plan for New Leads</div>
                <select className="input" value={autoPlanId} onChange={e=>setAutoPlanId(e.target.value)}>
                  <option value="">— None (don't auto-enroll) —</option>
                  {allPlans.map(p=>(
                    <option key={p.id} value={p.id}>{p.name} ({p.steps.length} tasks)</option>
                  ))}
                </select>
                {autoPlanId&&(
                  <div style={{marginTop:10,padding:"10px 14px",background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.15)",borderRadius:9}}>
                    <div style={{fontSize:12,color:"#6ee7b7",fontWeight:700}}>✅ Auto-enroll active</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:3}}>New leads will be enrolled in <strong style={{color:"#fff"}}>"{allPlans.find(p=>p.id===autoPlanId)?.name}"</strong> when imported from your inbox</div>
                  </div>
                )}
                <button className="btn btn-blue" style={{width:"fit-content",marginTop:14}} onClick={saveAutoPlan}><Save size={13}/>Save Setting</button>
              </div>

              {/* Notification settings */}
              <div className="glass-card" style={{padding:"18px 20px"}}>
                <div style={{fontWeight:700,color:"#fff",marginBottom:8}}>🔔 Browser Notifications</div>
                <div style={{fontSize:12,color:"#475569",marginBottom:14}}>Get desktop pop-up alerts for new leads, tasks due today, and Gmail sync summaries.</div>
                {Notification.permission==='granted'?(
                  <div style={{padding:"10px 14px",background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.15)",borderRadius:9}}>
                    <div style={{fontSize:12,color:"#6ee7b7",fontWeight:700}}>✅ Notifications enabled</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:3}}>You'll receive alerts for new leads, tasks due today, and Gmail sync summaries.</div>
                  </div>
                ):Notification.permission==='denied'?(
                  <div style={{padding:"10px 14px",background:"rgba(239,68,68,.06)",border:"1px solid rgba(239,68,68,.15)",borderRadius:9}}>
                    <div style={{fontSize:12,color:"#fca5a5",fontWeight:700}}>❌ Notifications blocked</div>
                    <div style={{fontSize:11,color:"#475569",marginTop:3}}>Click the 🔒 lock icon in the browser address bar → Notifications → Allow, then refresh.</div>
                  </div>
                ):(
                  <button className="btn btn-blue" style={{width:"fit-content"}} onClick={()=>Notification.requestPermission().then(p=>{ if(p==='granted') toast.success("Notifications enabled!"); })}><Bell size={13}/>Enable Notifications</button>
                )}
              </div>
            </div>
          )}

          {tab==="gmail"&&(
            <div className="col" style={{maxWidth:540}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>📧 Gmail Sync</div>
              <div style={{fontSize:13,color:"#475569",lineHeight:1.8}}>Connect your Gmail to automatically log emails to and from your leads on their contact timelines — just like Follow Up Boss.</div>

              {gmailConnected?(
                <>
                  <div style={{padding:"14px 18px",background:"rgba(16,185,129,.06)",border:"1px solid rgba(16,185,129,.2)",borderRadius:12}}>
                    <div style={{fontSize:14,fontWeight:800,color:"#6ee7b7",marginBottom:4}}>✅ Gmail Connected</div>
                    <div style={{fontSize:12,color:"#475569"}}>Syncing every 5 minutes. Emails to/from your leads are automatically logged on their Activity tab.</div>
                    {gmailLastSync&&<div style={{fontSize:11,color:"#475569",marginTop:6}}>Last sync: {new Date(parseInt(gmailLastSync)).toLocaleTimeString()}</div>}
                  </div>
                  <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                    <button className="btn btn-blue" style={{width:"fit-content"}} onClick={manualSync} disabled={gmailSyncStatus==='syncing'}>
                      <RefreshCw size={13} style={gmailSyncStatus==='syncing'?{animation:"spin 1s linear infinite"}:{}}/>{gmailSyncStatus==='syncing'?'Syncing…':'Sync Now'}
                    </button>
                    <button className="btn" style={{width:"fit-content",background:"rgba(239,68,68,.08)",color:"#f87171",border:"1px solid rgba(239,68,68,.2)"}} onClick={disconnectGmail}><X size={13}/>Disconnect Gmail</button>
                  </div>
                  <div style={{fontSize:12,color:"#64748b"}}>💡 Emails show up in the <strong style={{color:"#94a3b8"}}>Activity</strong> tab of each contact — look for the 📧 Gmail tag.</div>
                </>
              ):(
                <>
                  <div className="info-banner info-blue"><Info size={14} style={{flexShrink:0}}/>Gmail sync uses a free Google Cloud project. It takes about 5 minutes to set up and you only have to do it once.</div>

                  <div>
                    <div className="label">Google OAuth Client ID</div>
                    <input className="input" placeholder="xxxxxxxxxxxx-xxxx.apps.googleusercontent.com" value={gmailClientId} onChange={e=>setGmailClientId(e.target.value)} style={{fontFamily:"monospace",fontSize:12}}/>
                  </div>

                  <button className="btn btn-blue" style={{width:"fit-content"}} onClick={connectGmail} disabled={!gmailClientId.trim()}><Mail size={13}/>Connect Gmail</button>

                  <div className="glass-card" style={{padding:"16px 18px"}}>
                    <div style={{fontWeight:800,color:"#fff",fontSize:13,marginBottom:12}}>📋 Setup Instructions (5 min, free)</div>
                    <ol style={{paddingLeft:18,display:"flex",flexDirection:"column",gap:9}}>
                      <li style={{fontSize:12,color:"#94a3b8"}}>Go to <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" style={{color:"#7eb8f7"}}>console.cloud.google.com</a> → <strong style={{color:"#fff"}}>New Project</strong> → name it "RE Hub"</li>
                      <li style={{fontSize:12,color:"#94a3b8"}}><strong style={{color:"#fff"}}>APIs & Services → Library</strong> → search <strong style={{color:"#fff"}}>Gmail API</strong> → Enable</li>
                      <li style={{fontSize:12,color:"#94a3b8"}}><strong style={{color:"#fff"}}>OAuth consent screen</strong> → External → App name: "RE Hub" → your email → Save & Continue through all steps</li>
                      <li style={{fontSize:12,color:"#94a3b8"}}><strong style={{color:"#fff"}}>Test users</strong> (on consent screen) → Add your Gmail address</li>
                      <li style={{fontSize:12,color:"#94a3b8"}}><strong style={{color:"#fff"}}>Credentials → Create Credentials → OAuth client ID</strong> → Web application</li>
                      <li style={{fontSize:12,color:"#94a3b8"}}>Under <strong style={{color:"#fff"}}>"Authorized JavaScript origins"</strong> add: <code style={{background:"rgba(255,255,255,.06)",padding:"1px 6px",borderRadius:4}}>http://localhost:3000</code></li>
                      <li style={{fontSize:12,color:"#94a3b8"}}>Copy the <strong style={{color:"#fff"}}>Client ID</strong> (ends in .apps.googleusercontent.com) → paste above → click Connect</li>
                    </ol>
                  </div>
                </>
              )}
            </div>
          )}

          {tab==="mobile"&&(
            <div className="col" style={{maxWidth:540}}>
              <div style={{fontWeight:700,fontSize:15,color:"#f1f5f9",fontFamily:"'DM Serif Display',serif"}}>📱 Install on Your Phone</div>
              {isStandalone?(
                <div style={{padding:16,background:"rgba(16,185,129,.08)",border:"1px solid rgba(16,185,129,.2)",borderRadius:12}}>
                  <div style={{fontSize:14,fontWeight:800,color:"#6ee7b7"}}>✅ Running as installed app</div>
                  <div style={{fontSize:12,color:"#475569",marginTop:4}}>RE Hub is installed and running in standalone mode.</div>
                </div>
              ):(
                <div style={{padding:16,background:"rgba(26,90,160,.08)",border:"1px solid rgba(26,90,160,.2)",borderRadius:12,marginBottom:16}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#7eb8f7",marginBottom:4}}>Not yet installed — follow the steps below</div>
                  <div style={{fontSize:12,color:"#475569"}}>Once installed, RE Hub opens like a real app with no browser bar.</div>
                </div>
              )}

              <div style={{display:"flex",flexDirection:"column",gap:14}}>
                {/* Chrome Desktop */}
                <div className="glass-card" style={{padding:"16px 18px"}}>
                  <div style={{fontWeight:800,color:"#fff",fontSize:14,marginBottom:10}}>💻 Install on This Computer (Chrome)</div>
                  <ol style={{paddingLeft:18,display:"flex",flexDirection:"column",gap:6}}>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Open <strong style={{color:"#fff"}}>http://localhost:3000</strong> in Google Chrome</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Look for the <strong style={{color:"#fff"}}>install icon (⊕)</strong> in the address bar on the right side</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Click it and select <strong style={{color:"#fff"}}>"Install"</strong></li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>RE Hub opens as its own window — pin it to your taskbar!</li>
                  </ol>
                </div>

                {/* iPhone */}
                <div className="glass-card" style={{padding:"16px 18px"}}>
                  <div style={{fontWeight:800,color:"#fff",fontSize:14,marginBottom:10}}>📱 Install on iPhone</div>
                  <div style={{fontSize:12,color:"#f59e0b",fontWeight:700,marginBottom:10}}>⚠ First: find your computer's IP address (see below), then open it in Safari on your iPhone</div>
                  <ol style={{paddingLeft:18,display:"flex",flexDirection:"column",gap:6}}>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Make sure your iPhone is on the <strong style={{color:"#fff"}}>same WiFi</strong> as this computer</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Open <strong style={{color:"#fff"}}>Safari</strong> on your iPhone (must be Safari, not Chrome)</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Type your computer's IP address + :3000 (e.g. <strong style={{color:"#fff"}}>192.168.1.5:3000</strong>)</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Tap the <strong style={{color:"#fff"}}>Share button</strong> (box with arrow) at the bottom</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Tap <strong style={{color:"#fff"}}>"Add to Home Screen"</strong></li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Tap <strong style={{color:"#fff"}}>"Add"</strong> — it now appears on your home screen like a real app!</li>
                  </ol>
                </div>

                {/* Android */}
                <div className="glass-card" style={{padding:"16px 18px"}}>
                  <div style={{fontWeight:800,color:"#fff",fontSize:14,marginBottom:10}}>🤖 Install on Android</div>
                  <ol style={{paddingLeft:18,display:"flex",flexDirection:"column",gap:6}}>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Make sure your phone is on the <strong style={{color:"#fff"}}>same WiFi</strong></li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Open <strong style={{color:"#fff"}}>Chrome</strong> on your Android</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Type your computer's IP + :3000 in the address bar</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Tap the <strong style={{color:"#fff"}}>three-dot menu</strong> → <strong style={{color:"#fff"}}>"Add to Home Screen"</strong></li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Or tap the install banner that may appear at the bottom</li>
                  </ol>
                </div>

                {/* Find IP */}
                <div className="glass-card" style={{padding:"16px 18px",borderColor:"rgba(212,160,23,.2)"}}>
                  <div style={{fontWeight:800,color:"#f0c040",fontSize:14,marginBottom:8}}>🔍 How to Find Your Computer's IP Address</div>
                  <ol style={{paddingLeft:18,display:"flex",flexDirection:"column",gap:6}}>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Press <strong style={{color:"#fff"}}>Windows + R</strong>, type <strong style={{color:"#fff"}}>cmd</strong>, press Enter</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Type <strong style={{color:"#fff"}}>ipconfig</strong> and press Enter</li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Look for <strong style={{color:"#fff"}}>"IPv4 Address"</strong> — it'll look like <strong style={{color:"#fff"}}>192.168.x.x</strong></li>
                    <li style={{fontSize:13,color:"#94a3b8"}}>Use that address on your phone: <strong style={{color:"#fff"}}>192.168.x.x:3000</strong></li>
                  </ol>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── HELP GUIDE ───────────────────────────────────────────────────────────────
const HelpGuide = ({setPage}) => {
  const [open,setOpen] = useState(null);
  const sections=[
    {t:"🚀 Getting Started",c:"1. Go to Settings → Agent Profile and add your name, brokerage, and contact info.\n\n2. Go to Settings → Brand Voice. Write a detailed description of your personality, target clients, and how you like to communicate. This powers every AI tool.\n\n3. Add your service areas in Settings → Service Areas for hyper-local content.\n\n4. Try AI Listing Writer first — paste in a property address and features to generate your first description.\n\n5. Use Lead Tracker to start adding your pipeline."},
    {t:"✍️ AI Listing Writer",c:"Generates MLS descriptions, social captions, and marketing brochure copy for any property.\n\nTips:\n• Be specific in the Features field — the more detail, the better the output\n• MLS format keeps under 1000 characters and is copy-paste ready\n• Social format adds emojis and a call-to-action\n• Brochure format is full marketing copy for flyers and PDFs\n• Always set your Brand Voice first for on-brand results"},
    {t:"📅 Content Scheduler",c:"Create and manage social posts for all platforms.\n\n• Select multiple platforms to post the same caption across Instagram, Facebook, LinkedIn, etc.\n• Set a schedule date and time to keep posts organized\n• Use 'Draft' status for content that's not ready yet\n• Connect platforms in Integrations to enable direct posting via the Meta API"},
    {t:"👥 Lead Tracker",c:"Your CRM-lite for managing buyer and seller leads.\n\n• Status: Hot = ready to move now, Warm = engaged, Cold = early stage, Closed = deal done\n• Add budget and target area for quick reference\n• Filter by status and type to see your active pipeline at a glance\n• Notes field is great for timeline, referral source, and preferences"},
    {t:"🏠 CMA Assistant",c:"AI-assisted comparative market analysis.\n\n1. Enter the subject property details\n2. Add your comparable sales (comps) with sale price, sqft, and DOM\n3. Click Generate — Claude analyzes price per sqft, adjustments, and suggests a list price range\n4. Copy the analysis for your client presentation\n\nTip: Be specific in comp notes (garage, updates, condition) for more accurate analysis."},
    {t:"📊 Market Report Builder",c:"Generate professional market update reports for clients and social media.\n\n• Fill in your market stats (median price, DOM, inventory) for accurate data-driven reports\n• Leave stats blank and Claude generates a narrative-style update\n• Audience setting adjusts buyer vs. seller focus\n• Use the output for email newsletters, social posts, and client check-ins"},
    {t:"🔗 Integrations",c:"Meta (Facebook + Instagram): Free and works immediately. Get your Page Access Token from Facebook Developer Portal.\n\nLinkedIn: Requires applying for Marketing Developer Platform access at LinkedIn Developer Portal.\n\nYouTube: Free via Google Cloud. Enable YouTube Data API v3.\n\nZillow: Requires Zillow Premier Agent account for posting capabilities."},
  ];

  return (
    <div className="page-content">
      <PageHeader title="Help Guide" sub="Everything you need to use this hub effectively" setPage={setPage} parent="dashboard"/>
      <div style={{maxWidth:800}}>
        {sections.map((s,i)=>(
          <div key={i} className="glass-card" style={{marginBottom:10}}>
            <button style={{width:"100%",background:"none",border:"none",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}} onClick={()=>setOpen(open===i?null:i)}>
              <div style={{fontSize:15,fontWeight:700,color:"#f1f5f9",textAlign:"left",fontFamily:"'DM Serif Display',serif"}}>{s.t}</div>
              {open===i?<ChevronUp size={16} color="#1a5aa0"/>:<ChevronDown size={16} color="#475569"/>}
            </button>
            {open===i&&<div style={{marginTop:16,fontSize:13,color:"#64748b",whiteSpace:"pre-wrap",lineHeight:1.9,borderTop:"1px solid rgba(255,255,255,.05)",paddingTop:16}}>{s.c}</div>}
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── PIPELINE BOARD ───────────────────────────────────────────────────────────
const STAGE_COLORS_MAP = {
  "Hot Prospect":"#ef4444","Contact":"#3b82f6","Buyer":"#8b5cf6","Seller":"#f59e0b",
  "Casually Browsing":"#64748b","Nurture 3-6 Months":"#f97316","Nurture 1+ Year":"#6366f1",
  "Buy/Sell Nurture":"#ec4899","Pending":"#eab308","Past Client":"#10b981","Closed":"#22c55e",
};
const BOARD_STAGES = ["Hot Prospect","Contact","Buyer","Seller","Casually Browsing","Nurture 3-6 Months","Nurture 1+ Year","Buy/Sell Nurture","Pending","Past Client","Closed"];

const PipelineBoard = ({setPage,toast}) => {
  const [leads,setLeads] = useLeadsCloud();
  const [dragId,setDragId] = useState(null);
  const [dragOver,setDragOver] = useState(null);
  const [selectedLead,setSelectedLead] = useState(null);
  const [search,setSearch] = useState("");

  const filtered = search ? leads.filter(l=>l.name.toLowerCase().includes(search.toLowerCase())||l.phone?.includes(search)||l.area?.toLowerCase().includes(search.toLowerCase())) : leads;

  const onDrop = (stage) => {
    if(!dragId) return;
    setLeads(prev=>prev.map(l=>l.id===dragId?{...l,status:stage}:l));
    toast.success(`Moved to ${stage}`);
    setDragId(null); setDragOver(null);
  };

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 60px)",overflow:"hidden",padding:"20px 24px"}}>
      <PageHeader title="Pipeline Board" sub="Drag leads between stages to update their status" setPage={setPage} parent="dashboard"
        action={
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <input className="input" placeholder="Search leads..." value={search} onChange={e=>setSearch(e.target.value)} style={{width:200}}/>
            <span style={{fontSize:12,color:"#475569",fontWeight:700}}>{leads.length} leads</span>
          </div>
        }
      />
      <div style={{overflowX:"auto",flex:1,paddingBottom:16}}>
        <div style={{display:"flex",gap:12,alignItems:"flex-start",height:"100%",minWidth:"max-content"}}>
          {BOARD_STAGES.map(stage=>{
            const col = filtered.filter(l=>l.status===stage);
            const color = STAGE_COLORS_MAP[stage]||"#475569";
            const isOver = dragOver===stage;
            return (
              <div key={stage} style={{width:220,flexShrink:0,background:isOver?"rgba(26,90,160,.1)":"rgba(255,255,255,.02)",borderRadius:13,border:`1px solid ${isOver?"rgba(126,184,247,.3)":"rgba(255,255,255,.06)"}`,display:"flex",flexDirection:"column",maxHeight:"100%",transition:"all .15s"}}
                onDragOver={e=>{e.preventDefault();setDragOver(stage);}}
                onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOver(null);}}
                onDrop={()=>onDrop(stage)}>
                {/* Column Header */}
                <div style={{padding:"12px 12px 10px",borderBottom:`1px solid ${color}30`,flexShrink:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:12,fontWeight:800,color,letterSpacing:"-.1px"}}>{stage}</span>
                    <span style={{fontSize:11,fontWeight:800,background:`${color}20`,color,borderRadius:8,padding:"2px 8px"}}>{col.length}</span>
                  </div>
                </div>
                {/* Cards */}
                <div style={{overflowY:"auto",flex:1,padding:"8px 8px 8px",display:"flex",flexDirection:"column",gap:7}}>
                  {col.length===0&&(
                    <div style={{textAlign:"center",padding:"24px 8px",color:"#1e2d44",fontSize:11,fontWeight:700}}>
                      {isOver?"Drop here":"Empty"}
                    </div>
                  )}
                  {col.map(lead=>(
                    <div key={lead.id} draggable
                      onDragStart={e=>{setDragId(lead.id);e.dataTransfer.effectAllowed="move";}}
                      onDragEnd={()=>{setDragId(null);setDragOver(null);}}
                      onClick={()=>setSelectedLead(lead)}
                      style={{background:"rgba(255,255,255,.04)",borderRadius:9,padding:"10px 12px",cursor:"grab",border:"1px solid rgba(255,255,255,.07)",borderLeft:`3px solid ${color}`,opacity:dragId===lead.id?.3:1,transition:"opacity .1s",userSelect:"none"}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{lead.name}</div>
                      {lead.phone&&<div style={{fontSize:11,color:"#64748b",marginBottom:1}}>{lead.phone}</div>}
                      {lead.area&&<div style={{fontSize:11,color:"#64748b",marginBottom:1}}>{lead.area}</div>}
                      {lead.budget&&<div style={{fontSize:11,color:"#6ee7b7"}}>💰 {fmtMoney(lead.budget)}</div>}
                      {lead.followUp&&new Date(lead.followUp)<=new Date()&&<div style={{fontSize:10,fontWeight:700,color:"#f87171",marginTop:3}}>⚠ Follow-up due</div>}
                      {lead.source&&lead.source!=="fub"&&<div style={{fontSize:10,color:"#374151",marginTop:2}}>{lead.source}</div>}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedLead&&<ContactDetail lead={selectedLead} onClose={()=>setSelectedLead(null)} onUpdate={updated=>{setLeads(prev=>prev.map(l=>l.id===updated.id?updated:l));setSelectedLead(updated);}} toast={toast}/>}
    </div>
  );
};

// ─── TASK MANAGER ─────────────────────────────────────────────────────────────
const TaskManager = ({setPage,toast}) => {
  const [tasks,setTasks] = useLS("tasks",[]);
  const [leads] = useLeadsCloud();
  const [tab,setTab] = useState("today");
  const [showAdd,setShowAdd] = useState(false);
  const [f,setF] = useState({title:"",type:"Call",leadId:"",dueDate:new Date().toISOString().slice(0,10),notes:""});
  const [filterType,setFilterType] = useState("all");
  const [selectedLead,setSelectedLead] = useState(null);

  const todayStr = new Date().toISOString().slice(0,10);
  const tomorrow = new Date(Date.now()+86400000).toISOString().slice(0,10);

  const overdue   = tasks.filter(t=>!t.completed&&t.dueDate<todayStr);
  const today     = tasks.filter(t=>!t.completed&&t.dueDate===todayStr);
  const upcoming  = tasks.filter(t=>!t.completed&&t.dueDate>todayStr).sort((a,b)=>a.dueDate>b.dueDate?1:-1);
  const completed = tasks.filter(t=>t.completed).sort((a,b)=>new Date(b.completedAt)-new Date(a.completedAt));

  const display = (tab==="today"?[...overdue,...today]:tab==="upcoming"?upcoming:tab==="completed"?completed:tasks.filter(t=>!t.completed).sort((a,b)=>a.dueDate>b.dueDate?1:-1))
    .filter(t=>filterType==="all"||t.type===filterType);

  const complete = id => { setTasks(p=>p.map(t=>t.id===id?{...t,completed:true,completedAt:now()}:t)); toast.success("Task completed! 🎉"); };
  const del      = id => setTasks(p=>p.filter(t=>t.id!==id));

  const addTask = () => {
    if(!f.title.trim()){toast.error("Enter a task title");return;}
    const lead = leads.find(l=>l.id===f.leadId);
    setTasks(p=>[...p,{...f,id:uid(),leadName:lead?.name||"",completed:false,createdAt:now()}]);
    setF({title:"",type:"Call",leadId:"",dueDate:todayStr,notes:""});
    setShowAdd(false);
    toast.success("Task added");
  };

  const TABS = [{id:"today",label:"Today",count:overdue.length+today.length,warn:overdue.length>0},{id:"upcoming",label:"Upcoming",count:upcoming.length},{id:"completed",label:"Completed",count:0},{id:"all",label:"All Open",count:0}];

  return (
    <div className="page-content">
      <PageHeader title="Tasks" sub="Your daily follow-up engine" setPage={setPage} parent="dashboard"
        action={<button className="btn btn-blue btn-sm" onClick={()=>setShowAdd(!showAdd)}><Plus size={13}/>Add Task</button>}
      />

      {/* Add task form */}
      {showAdd&&(
        <div className="glass-card" style={{marginBottom:20}}>
          <div style={{fontWeight:800,fontSize:14,color:"#fff",marginBottom:14}}>New Task</div>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {TASK_TYPES.map(t=>(
                <button key={t} onClick={()=>setF(p=>({...p,type:t}))}
                  style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${f.type===t?TASK_COLORS[t]:"rgba(255,255,255,.1)"}`,background:f.type===t?`${TASK_COLORS[t]}20`:"transparent",color:f.type===t?TASK_COLORS[t]:"#64748b"}}>
                  {TASK_ICONS[t]} {t}
                </button>
              ))}
            </div>
            <div className="grid-2" style={{gap:10}}>
              <div>
                <div className="label">Task Description</div>
                <input className="input" value={f.title} placeholder="e.g. Call to check on pre-approval..." onChange={e=>setF(p=>({...p,title:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTask()}/>
              </div>
              <div>
                <div className="label">Due Date</div>
                <input className="input" type="date" value={f.dueDate} onChange={e=>setF(p=>({...p,dueDate:e.target.value}))}/>
              </div>
            </div>
            <div>
              <div className="label">Link to Lead (optional)</div>
              <select className="select" value={f.leadId} onChange={e=>setF(p=>({...p,leadId:e.target.value}))}>
                <option value="">— No lead —</option>
                {[...leads].sort((a,b)=>a.name>b.name?1:-1).slice(0,200).map(l=><option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div style={{display:"flex",gap:8}}>
              <button className="btn btn-blue btn-sm" onClick={addTask}><CheckCircle size={12}/>Add Task</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{display:"flex",gap:4,marginBottom:16,borderBottom:"1px solid rgba(255,255,255,.06)",paddingBottom:2}}>
        {TABS.map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{padding:"8px 16px",background:"none",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,color:tab===t.id?"#7eb8f7":"#475569",borderBottom:tab===t.id?"2px solid #1a5aa0":"2px solid transparent"}}>
            {t.label}{t.count>0&&<span style={{marginLeft:5,background:t.warn?"#ef4444":"rgba(255,255,255,.1)",color:t.warn?"#fff":"#64748b",borderRadius:8,padding:"0 6px",fontSize:10}}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Type filter */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
        <button onClick={()=>setFilterType("all")} style={{padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${filterType==="all"?"#7eb8f7":"rgba(255,255,255,.1)"}`,background:filterType==="all"?"rgba(126,184,247,.1)":"transparent",color:filterType==="all"?"#7eb8f7":"#475569"}}>All</button>
        {TASK_TYPES.map(t=>(
          <button key={t} onClick={()=>setFilterType(t)}
            style={{padding:"3px 12px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${filterType===t?TASK_COLORS[t]:"rgba(255,255,255,.1)"}`,background:filterType===t?`${TASK_COLORS[t]}18`:"transparent",color:filterType===t?TASK_COLORS[t]:"#475569"}}>
            {TASK_ICONS[t]} {t}
          </button>
        ))}
      </div>

      {display.length===0?(
        <div className="glass-card"><EmptyState icon={CheckCircle} title={tab==="today"?"No tasks due today 🎉":"No tasks"} desc={tab==="today"?"You're all caught up! Add tasks or apply an action plan to a lead.":"Nothing here yet."}/></div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {/* Date grouping for upcoming */}
          {display.map(t=>{
            const isOverdue = !t.completed&&t.dueDate<todayStr;
            const lead = t.leadId ? leads.find(l=>l.id===t.leadId) : null;
            return (
              <div key={t.id} style={{display:"flex",gap:12,alignItems:"center",padding:"13px 16px",borderRadius:12,background:t.completed?"rgba(255,255,255,.02)":"rgba(255,255,255,.04)",border:`1px solid rgba(255,255,255,.07)`,borderLeft:`3px solid ${t.completed?"#374151":TASK_COLORS[t.type]||"#475569"}`,opacity:t.completed?.6:1}}>
                <span style={{fontSize:18,flexShrink:0}}>{TASK_ICONS[t.type]||"✅"}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:14,fontWeight:700,color:t.completed?"#475569":"#fff",textDecoration:t.completed?"line-through":"none",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{t.title}</div>
                  <div style={{display:"flex",gap:12,marginTop:3,flexWrap:"wrap"}}>
                    {t.leadName&&(
                      <button style={{fontSize:11,color:"#7eb8f7",fontWeight:700,background:"none",border:"none",cursor:"pointer",padding:0}} onClick={()=>lead&&setSelectedLead(lead)}>
                        👤 {t.leadName}
                      </button>
                    )}
                    {t.actionPlanName&&<span style={{fontSize:11,color:"#475569"}}>⚡ {t.actionPlanName}</span>}
                    <span style={{fontSize:11,fontWeight:700,color:isOverdue?"#f87171":t.dueDate===todayStr?"#7eb8f7":"#475569"}}>
                      📅 {isOverdue?`Overdue (${t.dueDate})`:t.dueDate===todayStr?"Today":new Date(t.dueDate+"T12:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
                    </span>
                  </div>
                </div>
                <div style={{display:"flex",gap:6,flexShrink:0}}>
                  {!t.completed && t.smsBody && lead?.phone && (
                    <button className="btn btn-ghost btn-xs" title="Open SMS pre-filled (and copy to clipboard)" onClick={()=>{
                      const phone = (lead.phone||"").replace(/\D/g,"");
                      const body = t.smsBody || t.notes || "";
                      navigator.clipboard?.writeText(body).catch(()=>{});
                      window.location.href = `sms:${phone}?body=${encodeURIComponent(body)}`;
                      toast.info("SMS opened — text also copied to clipboard");
                    }}>📱 Send</button>
                  )}
                  {!t.completed&&<button className="btn btn-blue btn-xs" onClick={()=>complete(t.id)}><Check size={11}/>Done</button>}
                  <button style={{background:"none",border:"none",cursor:"pointer",color:"#374151",padding:4}} onClick={()=>del(t.id)}><Trash2 size={13}/></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {selectedLead&&<ContactDetail lead={selectedLead} onClose={()=>setSelectedLead(null)} onUpdate={()=>{}} toast={toast}/>}
    </div>
  );
};

// ─── ACTION PLANS ─────────────────────────────────────────────────────────────
const ActionPlans = ({setPage,toast}) => {
  const [customPlans,setCustomPlans] = useLS("action_plans",[]);
  const [tasks,setTasks] = useLS("tasks",[]);
  const [leads] = useLeadsCloud();
  const [tab,setTab] = useState("plans");
  const [expanded,setExpanded] = useState(null);
  const [applyModal,setApplyModal] = useState(null);
  const [applyLeadSearch,setApplyLeadSearch] = useState("");
  const [applyLeadId,setApplyLeadId] = useState("");
  const [applyStart,setApplyStart] = useState(new Date().toISOString().slice(0,10));
  const [newPlan,setNewPlan] = useState({name:"",description:"",steps:[]});
  const [newStep,setNewStep] = useState({day:0,type:"Call",title:""});

  const allPlans = [...BUILT_IN_PLANS,...customPlans];
  const matchedLeads = applyLeadSearch ? leads.filter(l=>l.name.toLowerCase().includes(applyLeadSearch.toLowerCase())||l.phone?.includes(applyLeadSearch)).slice(0,8) : [];

  const applyPlan = () => {
    const lead = leads.find(l=>l.id===applyLeadId);
    if(!lead||!applyModal) return;
    const start = new Date(applyStart);
    const newTasks = applyModal.steps.map(step=>{
      const due = new Date(start); due.setDate(due.getDate()+step.day);
      return {id:uid(),title:step.title.replace("[name]",lead.name.split(" ")[0]),type:step.type,leadId:lead.id,leadName:lead.name,dueDate:due.toISOString().slice(0,10),notes:"",actionPlanId:applyModal.id,actionPlanName:applyModal.name,completed:false,createdAt:now()};
    });
    setTasks(p=>[...p,...newTasks]);
    toast.success(`${newTasks.length} tasks created for ${lead.name} from "${applyModal.name}"`);
    setApplyModal(null); setApplyLeadId(""); setApplyLeadSearch("");
  };

  const savePlan = () => {
    if(!newPlan.name.trim()||newPlan.steps.length===0){toast.error("Add a name and at least one step");return;}
    setCustomPlans(p=>[...p,{...newPlan,id:uid(),isBuiltIn:false}]);
    setNewPlan({name:"",description:"",steps:[]});
    toast.success("Action plan saved");
    setTab("plans");
  };

  const addStep = ()=>{
    if(!newStep.title.trim()) return;
    setNewPlan(p=>({...p,steps:[...p.steps,{...newStep}]}));
    setNewStep(s=>({...s,day:s.day+1,title:""}));
  };

  return (
    <div className="page-content">
      <PageHeader title="Action Plans" sub="Pre-built follow-up sequences — apply to any lead with one click" setPage={setPage} parent="dashboard"/>

      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid rgba(255,255,255,.06)",paddingBottom:2}}>
        {[["plans","All Plans"],["create","Create Plan"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 16px",background:"none",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,color:tab===t?"#7eb8f7":"#475569",borderBottom:tab===t?"2px solid #1a5aa0":"2px solid transparent"}}>{l}</button>
        ))}
      </div>

      {tab==="plans"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {allPlans.map(plan=>(
            <div key={plan.id} className="glass-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                    <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{plan.name}</div>
                    {plan.isBuiltIn&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"rgba(26,90,160,.2)",color:"#7eb8f7"}}>Built-in</span>}
                  </div>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>{plan.description} · {plan.steps.length} steps</div>
                </div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <button className="btn btn-blue btn-sm" onClick={()=>{setApplyModal(plan);setApplyLeadId("");setApplyLeadSearch("");}}><Zap size={12}/>Apply to Lead</button>
                  <button className="btn btn-ghost btn-sm" onClick={()=>setExpanded(expanded===plan.id?null:plan.id)}>{expanded===plan.id?"Hide":"View"} Steps</button>
                  {!plan.isBuiltIn&&<button className="btn btn-ghost btn-sm" style={{color:"#f87171"}} onClick={()=>setCustomPlans(p=>p.filter(x=>x.id!==plan.id))}><Trash2 size={12}/></button>}
                </div>
              </div>
              {expanded===plan.id&&(
                <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:14,display:"flex",flexDirection:"column",gap:8}}>
                  {plan.steps.map((step,i)=>(
                    <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 12px",background:"rgba(255,255,255,.03)",borderRadius:9,borderLeft:`3px solid ${TASK_COLORS[step.type]||"#475569"}`}}>
                      <div style={{width:52,flexShrink:0}}>
                        <div style={{fontSize:10,fontWeight:800,color:"#475569",textTransform:"uppercase"}}>Day {step.day}</div>
                        <div style={{fontSize:11,fontWeight:700,color:TASK_COLORS[step.type]||"#64748b"}}>{TASK_ICONS[step.type]} {step.type}</div>
                      </div>
                      <div style={{fontSize:13,color:"#cbd5e1",lineHeight:1.5}}>{step.title}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="create"&&(
        <div className="glass-card" style={{maxWidth:680}}>
          <div style={{fontWeight:800,fontSize:15,color:"#fff",marginBottom:16}}>Create Action Plan</div>
          <div style={{display:"flex",flexDirection:"column",gap:12}}>
            <div>
              <div className="label">Plan Name</div>
              <input className="input" value={newPlan.name} placeholder="e.g. Expired Listing Outreach" onChange={e=>setNewPlan(p=>({...p,name:e.target.value}))}/>
            </div>
            <div>
              <div className="label">Description</div>
              <input className="input" value={newPlan.description} placeholder="What is this plan for?" onChange={e=>setNewPlan(p=>({...p,description:e.target.value}))}/>
            </div>
            <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:14}}>
              <div style={{fontWeight:700,fontSize:13,color:"#fff",marginBottom:10}}>Steps ({newPlan.steps.length})</div>
              {newPlan.steps.map((step,i)=>(
                <div key={i} style={{display:"flex",gap:8,alignItems:"center",padding:"8px 12px",background:"rgba(255,255,255,.03)",borderRadius:9,marginBottom:6,borderLeft:`3px solid ${TASK_COLORS[step.type]||"#475569"}`}}>
                  <span style={{fontSize:12,fontWeight:800,color:"#475569",minWidth:48}}>Day {step.day}</span>
                  <span style={{fontSize:12,fontWeight:700,color:TASK_COLORS[step.type],minWidth:60}}>{TASK_ICONS[step.type]} {step.type}</span>
                  <span style={{flex:1,fontSize:13,color:"#cbd5e1"}}>{step.title}</span>
                  <button style={{background:"none",border:"none",cursor:"pointer",color:"#374151"}} onClick={()=>setNewPlan(p=>({...p,steps:p.steps.filter((_,j)=>j!==i)}))}><X size={12}/></button>
                </div>
              ))}
              {/* Add step */}
              <div style={{display:"flex",gap:8,marginTop:10,flexWrap:"wrap"}}>
                <input className="input" type="number" value={newStep.day} onChange={e=>setNewStep(p=>({...p,day:Number(e.target.value)}))} style={{width:70}} placeholder="Day"/>
                <select className="select" value={newStep.type} onChange={e=>setNewStep(p=>({...p,type:e.target.value}))} style={{width:110}}>
                  {TASK_TYPES.map(t=><option key={t}>{t}</option>)}
                </select>
                <input className="input" style={{flex:1,minWidth:200}} value={newStep.title} placeholder="Step description..." onChange={e=>setNewStep(p=>({...p,title:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addStep()}/>
                <button className="btn btn-ghost btn-sm" onClick={addStep}><Plus size={12}/>Add Step</button>
              </div>
            </div>
            <button className="btn btn-blue" onClick={savePlan}><Save size={14}/>Save Action Plan</button>
          </div>
        </div>
      )}

      {/* Apply Modal */}
      {applyModal&&(
        <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setApplyModal(null)}>
          <div style={{background:"#0d1117",borderRadius:16,padding:"24px 28px",maxWidth:480,width:"90%",border:"1px solid rgba(255,255,255,.1)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:16,color:"#fff",marginBottom:4}}>Apply: {applyModal.name}</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:18}}>{applyModal.steps.length} tasks will be created for the selected lead</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div className="label">Search Lead</div>
                <input className="input" value={applyLeadSearch} placeholder="Type a name..." onChange={e=>{setApplyLeadSearch(e.target.value);setApplyLeadId("");}}/>
                {matchedLeads.length>0&&(
                  <div style={{background:"#0d1117",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,marginTop:4,overflow:"hidden"}}>
                    {matchedLeads.map(l=>(
                      <div key={l.id} onClick={()=>{setApplyLeadId(l.id);setApplyLeadSearch(l.name);}} style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,.05)",background:applyLeadId===l.id?"rgba(26,90,160,.2)":"transparent"}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{l.name}</div>
                        <div style={{fontSize:11,color:"#475569"}}>{l.status} · {l.phone||l.email}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="label">Start Date</div>
                <input className="input" type="date" value={applyStart} onChange={e=>setApplyStart(e.target.value)}/>
              </div>
              {applyLeadId&&<div style={{fontSize:12,color:"#10b981",fontWeight:700}}>✓ {leads.find(l=>l.id===applyLeadId)?.name} selected</div>}
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-blue" disabled={!applyLeadId} onClick={applyPlan} style={{flex:1}}><Zap size={13}/>Apply Plan → {applyModal.steps.length} Tasks</button>
                <button className="btn btn-ghost" onClick={()=>setApplyModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── EMAIL CAMPAIGNS ──────────────────────────────────────────────────────────
const Campaigns = ({setPage,toast}) => {
  const [queue,setQueue] = useLS("email_queue",[]);
  const [customCamps,setCustomCamps] = useLS("custom_campaigns",[]);
  const [leads] = useLeadsCloud();
  const [tab,setTab] = useState("campaigns");
  const [enrollModal,setEnrollModal] = useState(null);
  const [enrollSearch,setEnrollSearch] = useState("");
  const [enrollLeadId,setEnrollLeadId] = useState("");
  const [enrollDate,setEnrollDate] = useState(new Date().toISOString().slice(0,10));
  const [previewCamp,setPreviewCamp] = useState(null);
  const [previewStep,setPreviewStep] = useState(0);
  const [sendingBatch,setSendingBatch] = useState(false);

  // Gmail connection / auto-send status — re-read whenever the worker updates.
  const [gmailReady,setGmailReady] = useState(()=>{
    const tok=localStorage.getItem('gmail_token');
    const exp=parseInt(localStorage.getItem('gmail_token_expiry')||'0');
    return !!tok && Date.now()<exp;
  });
  const [autoSend,setAutoSend] = useState(()=>localStorage.getItem('gmail_autosend')==='on');

  // The background worker writes to localStorage directly — refresh state on its event.
  useEffect(()=>{
    const refresh = () => {
      try { setQueue(JSON.parse(localStorage.getItem('email_queue')||'[]')); } catch {}
      const tok=localStorage.getItem('gmail_token');
      const exp=parseInt(localStorage.getItem('gmail_token_expiry')||'0');
      setGmailReady(!!tok && Date.now()<exp);
      setAutoSend(localStorage.getItem('gmail_autosend')==='on');
    };
    window.addEventListener('email-queue-updated', refresh);
    return ()=>window.removeEventListener('email-queue-updated', refresh);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const toggleAutoSend = () => {
    const next = !autoSend;
    localStorage.setItem('gmail_autosend', next ? 'on' : 'off');
    setAutoSend(next);
    if (next && !gmailReady) toast.error('Connect Gmail in Settings first');
    else if (next) {
      toast.success('Auto-send ON — due drips will fire from your Gmail');
      window.dispatchEvent(new CustomEvent('gmail-sync-now'));
    } else toast.info('Auto-send OFF — drips stay in queue for manual send');
  };

  const sendAllDueNow = async () => {
    if (!gmailReady) return toast.error('Connect Gmail in Settings first');
    const token = localStorage.getItem('gmail_token');
    const todayStr = new Date().toISOString().slice(0,10);
    const due = queue.filter(e => !e.sent && e.dueDate <= todayStr && e.leadEmail);
    if (!due.length) return toast.info('Nothing due to send');
    setSendingBatch(true);
    const profile = JSON.parse(localStorage.getItem('re_profile')||'{}');
    const fromName = profile.name ? `${profile.name} <me>` : '';
    let ok=0, fail=0;
    for (const entry of due) {
      try {
        const msgId = await gmailSendMessage(token, {to:entry.leadEmail, subject:entry.subject, body:entry.body, fromName});
        setQueue(p => p.map(e => e.id===entry.id ? {...e, sent:true, sentAt:now(), sentMethod:'gmail-batch', gmailMessageId:msgId} : e));
        // Activity log
        const actKey = `activities_${entry.leadId}`;
        const existing = JSON.parse(localStorage.getItem(actKey)||'[]');
        existing.unshift({id:uid(), type:'gmail', direction:'outbound', subject:entry.subject, note:`📤 Sent "${entry.campaignName}" email: "${entry.subject}"`, gmailId:msgId, createdAt:now()});
        localStorage.setItem(actKey, JSON.stringify(existing));
        ok++;
      } catch (err) {
        setQueue(p => p.map(e => e.id===entry.id ? {...e, sendError:err.message, sendErrorAt:now()} : e));
        fail++;
      }
    }
    setSendingBatch(false);
    if (ok>0) toast.success(`Sent ${ok} email${ok>1?'s':''} via Gmail`);
    if (fail>0) toast.error(`${fail} failed — check the queue for details`);
  };

  const allCamps = [...BUILT_IN_CAMPAIGNS,...customCamps];
  const todayStr = new Date().toISOString().slice(0,10);
  const pendingQueue = queue.filter(e=>!e.sent).sort((a,b)=>a.dueDate>b.dueDate?1:-1);
  const sentQueue    = queue.filter(e=>e.sent).sort((a,b)=>new Date(b.sentAt)-new Date(a.sentAt));
  const dueToday     = pendingQueue.filter(e=>e.dueDate<=todayStr);

  const enroll = () => {
    const lead = leads.find(l=>l.id===enrollLeadId);
    if(!lead||!enrollModal) return;
    if(!lead.email) { toast.error(`${lead.name} has no email address — add one in their contact first`); return; }
    const start = new Date(enrollDate);
    const entries = enrollModal.steps.map((step,i)=>{
      const due = new Date(start); due.setDate(due.getDate()+step.day);
      const body = step.body
        .replace(/\[name\]/gi, lead.name.split(" ")[0])
        .replace(/\[area\]/gi, lead.area||"your area")
        .replace(/\[address\]/gi, lead.area||"");
      return {
        id:uid(), leadId:lead.id, leadName:lead.name, leadEmail:lead.email,
        campaignId:enrollModal.id, campaignName:enrollModal.name,
        subject:step.subject.replace(/\[name\]/gi,lead.name.split(" ")[0]),
        body, dueDate:due.toISOString().slice(0,10),
        stepIndex:i, sent:false, createdAt:now()
      };
    });
    setQueue(p=>[...p,...entries]);
    toast.success(`${entries.length} emails queued for ${lead.name} — "${enrollModal.name}"`);
    setEnrollModal(null); setEnrollLeadId(""); setEnrollSearch("");
  };

  const markSent = id => {
    setQueue(p=>p.map(e=>e.id===id?{...e,sent:true,sentAt:now()}:e));
    toast.success("Email marked as sent ✓");
  };
  const removeFromQueue = id => setQueue(p=>p.filter(e=>e.id!==id));

  const mailtoLink = entry =>
    `mailto:${entry.leadEmail}?subject=${encodeURIComponent(entry.subject)}&body=${encodeURIComponent(entry.body)}`;

  const matchedLeads = enrollSearch ? leads.filter(l=>l.name.toLowerCase().includes(enrollSearch.toLowerCase())||l.phone?.includes(enrollSearch)).slice(0,8) : [];

  return (
    <div className="page-content">
      <PageHeader title="Email Campaigns" sub="Pre-written drip sequences — enroll a lead and emails queue up automatically" setPage={setPage} parent="dashboard"/>

      {/* Stats row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12,marginBottom:20}}>
        {[
          {label:"Due Today",val:dueToday.length,color:"#ef4444",sub:"emails to send"},
          {label:"In Queue",val:pendingQueue.length,color:"#7eb8f7",sub:"upcoming emails"},
          {label:"Sent",val:sentQueue.length,color:"#10b981",sub:"all time"},
        ].map(s=>(
          <div key={s.label} className="glass-card" style={{textAlign:"center",padding:"16px"}}>
            <div style={{fontSize:28,fontWeight:900,color:s.color,fontFamily:"'DM Serif Display',serif"}}>{s.val}</div>
            <div style={{fontSize:13,fontWeight:700,color:"#fff",marginTop:2}}>{s.label}</div>
            <div style={{fontSize:11,color:"#475569"}}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid rgba(255,255,255,.06)",paddingBottom:2}}>
        {[["campaigns","Campaigns"],["queue",`Email Queue${dueToday.length>0?" ("+dueToday.length+" due)":""}`],["sent","Sent History"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{padding:"8px 16px",background:"none",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,color:tab===t?"#7eb8f7":"#475569",borderBottom:tab===t?"2px solid #1a5aa0":"2px solid transparent"}}>{l}</button>
        ))}
      </div>

      {tab==="campaigns"&&(
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          {allCamps.map(camp=>(
            <div key={camp.id} className="glass-card">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:4}}>
                    <div style={{fontWeight:800,fontSize:15,color:"#fff"}}>{camp.name}</div>
                    {BUILT_IN_CAMPAIGNS.find(c=>c.id===camp.id)&&<span style={{fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:8,background:"rgba(26,90,160,.2)",color:"#7eb8f7"}}>Built-in</span>}
                  </div>
                  <div style={{fontSize:12,color:"#64748b",marginBottom:10}}>{camp.description} · {camp.steps.length} emails</div>
                </div>
                <div style={{display:"flex",gap:8,flexShrink:0}}>
                  <button className="btn btn-ghost btn-sm" onClick={()=>{setPreviewCamp(previewCamp===camp.id?null:camp.id);setPreviewStep(0);}}>
                    {previewCamp===camp.id?"Hide":"Preview"}
                  </button>
                  <button className="btn btn-blue btn-sm" onClick={()=>{setEnrollModal(camp);setEnrollLeadId("");setEnrollSearch("");}}><Mail size={12}/>Enroll Lead</button>
                </div>
              </div>
              {previewCamp===camp.id&&(
                <div style={{borderTop:"1px solid rgba(255,255,255,.06)",paddingTop:14}}>
                  <div style={{display:"flex",gap:6,marginBottom:12,flexWrap:"wrap"}}>
                    {camp.steps.map((s,i)=>(
                      <button key={i} onClick={()=>setPreviewStep(i)}
                        style={{padding:"4px 12px",borderRadius:20,fontSize:12,fontWeight:700,cursor:"pointer",border:`1px solid ${previewStep===i?"#7eb8f7":"rgba(255,255,255,.1)"}`,background:previewStep===i?"rgba(126,184,247,.1)":"transparent",color:previewStep===i?"#7eb8f7":"#475569"}}>
                        Day {s.day}
                      </button>
                    ))}
                  </div>
                  <div style={{background:"rgba(255,255,255,.03)",borderRadius:10,padding:"14px 16px",border:"1px solid rgba(255,255,255,.07)"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#fff",marginBottom:4}}>Subject: {camp.steps[previewStep]?.subject}</div>
                    <pre style={{fontFamily:"'DM Sans',sans-serif",fontSize:12,color:"#94a3b8",whiteSpace:"pre-wrap",lineHeight:1.7,margin:0}}>{camp.steps[previewStep]?.body}</pre>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab==="queue"&&(
        <div>
          {/* Auto-send control bar */}
          <div style={{display:"flex",alignItems:"center",gap:12,padding:"12px 16px",marginBottom:14,borderRadius:12,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)"}}>
            <div style={{flex:1,display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
              {gmailReady ? (
                <span style={{fontSize:11,fontWeight:800,padding:"3px 9px",borderRadius:8,background:"rgba(16,185,129,.15)",color:"#10b981"}}>✓ Gmail connected</span>
              ) : (
                <span style={{fontSize:11,fontWeight:800,padding:"3px 9px",borderRadius:8,background:"rgba(239,68,68,.15)",color:"#f87171",cursor:"pointer"}} onClick={()=>setPage("settings")}>✗ Gmail not connected — set up in Settings</span>
              )}
              <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer",fontSize:13,color:"#cbd5e1"}}>
                <Toggle checked={autoSend} onChange={toggleAutoSend}/>
                <span style={{fontWeight:700}}>Auto-send drips via Gmail</span>
                {autoSend && gmailReady && <span style={{fontSize:11,fontWeight:800,color:"#10b981"}}>🟢 ON</span>}
              </label>
            </div>
            {gmailReady && dueToday.length>0 && (
              <button className="btn btn-blue btn-sm" disabled={sendingBatch} onClick={sendAllDueNow}>
                {sendingBatch ? <><Spinner s={12}/>Sending…</> : <><Mail size={12}/>Send All Due Now ({dueToday.length})</>}
              </button>
            )}
          </div>

          {pendingQueue.length===0?(
            <div className="glass-card"><EmptyState icon={Mail} title="Queue is empty" desc="Enroll a lead in a campaign to start sending emails"/></div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:10}}>
              {pendingQueue.map(entry=>{
                const isOverdue = entry.dueDate<todayStr;
                const isToday = entry.dueDate===todayStr;
                const hasErr = !!entry.sendError;
                return (
                  <div key={entry.id} style={{padding:"14px 16px",borderRadius:12,background:"rgba(255,255,255,.03)",border:`1px solid rgba(255,255,255,.07)`,borderLeft:`3px solid ${hasErr?"#f59e0b":(isOverdue||isToday)?"#ef4444":"#475569"}`}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                          <span style={{fontSize:14,fontWeight:700,color:"#fff"}}>{entry.leadName}</span>
                          <span style={{fontSize:11,color:"#7eb8f7",fontWeight:700}}>{entry.campaignName}</span>
                          <span style={{fontSize:11,fontWeight:800,color:isOverdue||isToday?"#f87171":"#475569"}}>
                            {isOverdue?"OVERDUE":isToday?"TODAY":new Date(entry.dueDate+"T12:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
                          </span>
                          {hasErr && <span style={{fontSize:10,fontWeight:800,padding:"2px 7px",borderRadius:6,background:"rgba(245,158,11,.15)",color:"#f59e0b"}}>SEND FAILED</span>}
                        </div>
                        <div style={{fontSize:13,fontWeight:600,color:"#cbd5e1",marginBottom:2}}>📧 {entry.subject}</div>
                        <div style={{fontSize:11,color:"#475569"}}>To: {entry.leadEmail}</div>
                        {hasErr && <div style={{fontSize:11,color:"#f59e0b",marginTop:4}}>⚠ {entry.sendError}</div>}
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <a href={mailtoLink(entry)} target="_blank" rel="noreferrer"
                          className="btn btn-blue btn-sm" onClick={()=>setTimeout(()=>markSent(entry.id),2000)}>
                          <Mail size={12}/>Open & Send
                        </a>
                        <button className="btn btn-ghost btn-xs" onClick={()=>markSent(entry.id)}><Check size={11}/>Mark Sent</button>
                        <button style={{background:"none",border:"none",cursor:"pointer",color:"#374151",padding:4}} onClick={()=>removeFromQueue(entry.id)}><X size={12}/></button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab==="sent"&&(
        <div>
          {sentQueue.length===0?(
            <div className="glass-card"><EmptyState icon={CheckCircle} title="No sent emails yet" desc="Sent emails will appear here for your records"/></div>
          ):(
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {sentQueue.slice(0,50).map(entry=>(
                <div key={entry.id} style={{padding:"12px 16px",borderRadius:10,background:"rgba(255,255,255,.02)",border:"1px solid rgba(255,255,255,.05)",display:"flex",gap:12,alignItems:"center",opacity:.8}}>
                  <Check size={14} color="#10b981" style={{flexShrink:0}}/>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:600,color:"#fff"}}>{entry.leadName} — {entry.subject}</div>
                    <div style={{fontSize:11,color:"#475569"}}>{entry.campaignName} · Sent {entry.sentAt?new Date(entry.sentAt).toLocaleDateString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"}):""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Enroll Modal */}
      {enrollModal&&(
        <div style={{position:"fixed",inset:0,zIndex:300,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>setEnrollModal(null)}>
          <div style={{background:"#0d1117",borderRadius:16,padding:"24px 28px",maxWidth:460,width:"90%",border:"1px solid rgba(255,255,255,.1)"}} onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:16,color:"#fff",marginBottom:4}}>{enrollModal.name}</div>
            <div style={{fontSize:12,color:"#64748b",marginBottom:18}}>{enrollModal.steps.length} emails will be queued starting on your chosen date</div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              <div>
                <div className="label">Search Lead</div>
                <input className="input" value={enrollSearch} placeholder="Type a name or phone..." autoFocus onChange={e=>{setEnrollSearch(e.target.value);setEnrollLeadId("");}}/>
                {matchedLeads.length>0&&(
                  <div style={{background:"#070b18",border:"1px solid rgba(255,255,255,.1)",borderRadius:9,marginTop:4,overflow:"hidden"}}>
                    {matchedLeads.map(l=>(
                      <div key={l.id} onClick={()=>{setEnrollLeadId(l.id);setEnrollSearch(l.name);}}
                        style={{padding:"10px 14px",cursor:"pointer",borderBottom:"1px solid rgba(255,255,255,.05)",background:enrollLeadId===l.id?"rgba(26,90,160,.2)":"transparent"}}>
                        <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{l.name}</div>
                        <div style={{fontSize:11,color:l.email?"#475569":"#f87171"}}>{l.email||"⚠ No email — add one first"} · {l.status}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <div className="label">Start Date (first email sends on this day)</div>
                <input className="input" type="date" value={enrollDate} onChange={e=>setEnrollDate(e.target.value)}/>
              </div>
              {enrollLeadId&&<div style={{fontSize:12,color:"#10b981",fontWeight:700}}>✓ {leads.find(l=>l.id===enrollLeadId)?.name} selected</div>}
              <div style={{display:"flex",gap:8}}>
                <button className="btn btn-blue" disabled={!enrollLeadId} onClick={enroll} style={{flex:1}}><Mail size={13}/>Enroll → Queue {enrollModal.steps.length} Emails</button>
                <button className="btn btn-ghost" onClick={()=>setEnrollModal(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── LEAD INBOX ───────────────────────────────────────────────────────────────
const SOURCE_ICONS = {
  "Homes.com":"🏠","Zillow":"🔵","Realtor.com":"🔴","Trulia":"🟢","Redfin":"🟠",
  "Facebook Lead Ads":"📘","Facebook":"📘","Instagram":"📷","OpCity":"⚡","BoldLeads":"⚡",
  "Ylopo":"🎯","Web":"🌐","Webhook":"🔗","Email":"📧","Zapier":"⚡",
};

const LeadInbox = ({setPage,toast,setInboxCount}) => {
  const [inbox,setInbox] = useState([]);
  const [loading,setLoading] = useState(true);
  const [importing,setImporting] = useState({});
  const [selected,setSelected] = useState([]);
  const [tab,setTab] = useState("inbox"); // inbox | setup | test
  // eslint-disable-next-line no-unused-vars
  const [leads,setLeads] = useLeadsCloud();

  const fetchInbox = useCallback(async()=>{
    try {
      const { data, error } = await supabase
        .from("lead_inbox")
        .select("*")
        .order("received_at", { ascending: false });
      if (error) throw error;
      // Normalize column names — DB uses snake_case (received_at), UI uses camelCase
      const rows = (data||[]).map(r => ({...r, receivedAt: r.received_at}));
      setInbox(rows);
      setInboxCount(rows.length);
    } catch (e) {
      console.warn("[lead_inbox] fetch failed:", e.message);
    }
    finally { setLoading(false); }
  },[setInboxCount]);

  // Initial fetch + realtime subscription so new webhook arrivals appear instantly
  useEffect(()=>{
    fetchInbox();
    const channel = supabase
      .channel("lead_inbox_changes_"+Date.now())
      .on("postgres_changes", {event:"*", schema:"public", table:"lead_inbox"}, ()=>fetchInbox())
      .subscribe();
    return ()=>{ try { supabase.removeChannel(channel); } catch {} };
  },[fetchInbox]);

  const importLeads = useCallback(async(ids)=>{
    const toImport = inbox.filter(l=>ids.includes(l.id));
    if(!toImport.length) return;
    ids.forEach(id=>setImporting(p=>({...p,[id]:true})));
    const newLeads = toImport.map(l=>({
      id: `inbox_${l.id}`,
      name: l.name||"New Lead",
      email: l.email||"",
      phone: l.phone||"",
      notes: [l.notes, l.address?`Property: ${l.address}`:""].filter(Boolean).join("\n"),
      area: l.area||"",
      budget: l.budget||"",
      type: l.type||"Buyer",
      status: l.status||"Hot Prospect",
      source: l.source||"Web",
      tags: ["New Lead",l.source||"Web"].filter(Boolean),
      createdAt: l.receivedAt||new Date().toISOString(),
    }));
    setLeads(prev=>{
      const existingIds = new Set(prev.map(x=>x.id));
      const fresh = newLeads.filter(x=>!existingIds.has(x.id));
      return [...fresh,...prev];
    });

    // Auto-enroll in action plan if configured
    try {
      const autoPlanId = localStorage.getItem('auto_action_plan_id');
      if(autoPlanId) {
        const allPlans = [...BUILT_IN_PLANS, ...JSON.parse(localStorage.getItem('action_plans')||'[]')];
        const plan = allPlans.find(p=>p.id===autoPlanId);
        if(plan) {
          const start = new Date();
          const autoTasks = [];
          newLeads.forEach(lead=>{
            plan.steps.forEach(step=>{
              const due = new Date(start); due.setDate(due.getDate()+step.day);
              autoTasks.push({id:uid(),title:step.title.replace("[name]",lead.name.split(" ")[0]),type:step.type,leadId:lead.id,leadName:lead.name,dueDate:due.toISOString().slice(0,10),actionPlanId:plan.id,actionPlanName:plan.name,completed:false,createdAt:now()});
            });
          });
          const existing = JSON.parse(localStorage.getItem('tasks')||'[]');
          localStorage.setItem('tasks', JSON.stringify([...existing,...autoTasks]));
          toast.info(`Auto-enrolled ${newLeads.length} lead${newLeads.length>1?"s":""} in "${plan.name}"`);
        }
      }
    } catch(e){}

    // Remove from cloud inbox
    try { await supabase.from("lead_inbox").delete().in("id", ids); } catch(e) { console.warn(e); }
    await fetchInbox();
    setSelected([]);
    toast.success(`${toImport.length} lead${toImport.length>1?"s":""} imported to Lead Tracker`);
  },[inbox,setLeads,fetchInbox,toast]);

  const dismiss = async(ids)=>{
    try { await supabase.from("lead_inbox").delete().in("id", ids); } catch(e) { console.warn(e); }
    await fetchInbox();
    setSelected([]);
  };

  const sourceTag = s => (
    <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:10,background:"rgba(26,90,160,.18)",color:"#7eb8f7"}}>
      {SOURCE_ICONS[s]||"📥"} {s}
    </span>
  );

  // Use the deployed origin in prod (my-re-hub.vercel.app) — falls back to
  // localhost when running the dev server.
  const WEBHOOK_BASE = typeof window !== "undefined" ? window.location.origin : "https://my-re-hub.vercel.app";

  const SOURCES_SETUP = [
    { name:"BoldTrail / kvCORE", logo:"🌐", how:"Email forwarding or API",
      steps:["BoldTrail → Settings → Notifications: set your lead notification email","Create a Gmail filter: From contains 'boldtrail.com' OR 'kvcore.com' → Forward to your Cloudmailin/Zapier email","Cloudmailin/Zapier POSTs to /webhook/boldtrail","(Brokerage-paid API tier? Skip email — set the webhook URL directly in BoldTrail integrations)"] },
    { name:"Homes.com", logo:"🏠", how:"Email forwarding",
      steps:["Homes.com → Account Settings → Lead Notifications","Forward those emails to a Cloudmailin or Zapier email-parser address","That service POSTs to /webhook/email"] },
    { name:"Zillow", logo:"🔵", how:"Email forwarding",
      steps:["Zillow Premier Agent → Notification Settings","Forward Zillow lead emails to Cloudmailin/Zapier","POSTs to /webhook/email (auto-detects as Zillow)"] },
    { name:"Realtor.com", logo:"🔴", how:"Email forwarding",
      steps:["Realtor.com → Account → Lead Settings → Notification Email","Forward to your Cloudmailin/Zapier email","POSTs to /webhook/email (auto-detects as Realtor.com)"] },
    { name:"Facebook Lead Ads", logo:"📘", how:"Meta webhook",
      steps:["Meta Business Suite → Instant Forms → Lead Webhook","Callback URL: copy /webhook/facebook-lead URL below","Verify token: re_hub_fb_verify","Subscribe to: leadgen"] },
    { name:"Zapier (any source)", logo:"⚡", how:"Universal bridge",
      steps:["Create a Zap with your lead source as Trigger","Action: Webhooks by Zapier → POST","URL: copy /webhook/lead below","Body: map name, email, phone, message fields"] },
  ];

  return (
    <div className="page-content">
      <PageHeader title="Lead Inbox" sub="Leads from Homes.com, Zillow, Realtor.com and more land here automatically" setPage={setPage} parent="dashboard"
        action={
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-ghost btn-sm" onClick={fetchInbox}><RefreshCw size={13}/>Refresh</button>
            {tab==="inbox"&&selected.length>0&&(
              <>
                <button className="btn btn-ghost btn-sm" style={{color:"#f87171"}} onClick={()=>dismiss(selected)}>Dismiss {selected.length}</button>
                <button className="btn btn-blue btn-sm" onClick={()=>importLeads(selected)}><CheckCircle size={13}/>Import {selected.length} Lead{selected.length>1?"s":""}</button>
              </>
            )}
          </div>
        }
      />

      {/* tabs */}
      <div style={{display:"flex",gap:4,marginBottom:20,borderBottom:"1px solid rgba(255,255,255,.06)",paddingBottom:2}}>
        {[["inbox","Lead Inbox"],["setup","Source Setup"],["test","Send Test Lead"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)}
            style={{padding:"8px 16px",background:"none",border:"none",cursor:"pointer",fontWeight:700,fontSize:13,color:tab===t?"#7eb8f7":"#475569",borderBottom:tab===t?"2px solid #1a5aa0":"2px solid transparent"}}>
            {l}{t==="inbox"&&inbox.length>0&&<span style={{marginLeft:6,background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 6px",fontSize:10}}>{inbox.length}</span>}
          </button>
        ))}
      </div>

      {tab==="inbox" && (
        <>
          {loading ? <div style={{textAlign:"center",padding:40}}><Spinner s={28}/></div>
          : inbox.length===0 ? (
            <div className="glass-card">
              <EmptyState icon={Bell} title="Inbox is empty" desc="New leads from your connected sources will appear here automatically. Go to Source Setup to connect your portals."/>
              <div style={{textAlign:"center",marginTop:0,paddingBottom:20}}>
                <button className="btn btn-blue btn-sm" onClick={()=>setTab("setup")}>Set Up Lead Sources</button>
              </div>
            </div>
          ) : (
            <>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                <input type="checkbox" checked={selected.length===inbox.length} onChange={e=>setSelected(e.target.checked?inbox.map(l=>l.id):[])}
                  style={{width:16,height:16,cursor:"pointer"}}/>
                <span style={{fontSize:12,fontWeight:700,color:"#475569"}}>{inbox.length} lead{inbox.length>1?"s":""} waiting • Select all</span>
                {inbox.length>0&&<button className="btn btn-blue btn-sm" style={{marginLeft:"auto"}} onClick={()=>importLeads(inbox.map(l=>l.id))}><Zap size={12}/>Import All</button>}
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:10}}>
                {inbox.map(lead=>(
                  <div key={lead.id} className="lead-card lead-status-hot" style={{opacity:importing[lead.id]?.5:1}}>
                    <div style={{display:"flex",gap:10,alignItems:"flex-start"}}>
                      <input type="checkbox" checked={selected.includes(lead.id)} onChange={e=>setSelected(p=>e.target.checked?[...p,lead.id]:p.filter(x=>x!==lead.id))}
                        style={{width:16,height:16,cursor:"pointer",marginTop:2,flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:4}}>
                          <div style={{fontSize:15,fontWeight:700,color:"#fff",fontFamily:"'DM Serif Display',serif"}}>{lead.name}</div>
                          {sourceTag(lead.source)}
                          <span style={{fontSize:10,fontWeight:700,color:"#475569",marginLeft:"auto"}}>{new Date(lead.receivedAt).toLocaleString("en-US",{month:"short",day:"numeric",hour:"numeric",minute:"2-digit"})}</span>
                        </div>
                        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:lead.notes?8:0}}>
                          {lead.email&&<span style={{fontSize:12,color:"#94a3b8"}}><Mail size={11} style={{marginRight:3}}/>  {lead.email}</span>}
                          {lead.phone&&<span style={{fontSize:12,color:"#94a3b8"}}><Phone size={11} style={{marginRight:3}}/>{lead.phone}</span>}
                          {lead.area&&<span style={{fontSize:12,color:"#94a3b8"}}><MapPin size={11} style={{marginRight:3}}/>{lead.area}</span>}
                          {lead.address&&<span style={{fontSize:12,color:"#94a3b8"}}><Home size={11} style={{marginRight:3}}/>{lead.address}</span>}
                          {lead.budget&&<span style={{fontSize:12,color:"#94a3b8"}}><DollarSign size={11} style={{marginRight:3}}/>{lead.budget}</span>}
                        </div>
                        {lead.notes&&<div style={{fontSize:12,color:"#64748b",borderTop:"1px solid rgba(255,255,255,.05)",paddingTop:8,marginTop:4,whiteSpace:"pre-wrap"}}>{lead.notes.slice(0,200)}{lead.notes.length>200?"…":""}</div>}
                      </div>
                    </div>
                    <div style={{display:"flex",gap:8,marginTop:10,paddingTop:10,borderTop:"1px solid rgba(255,255,255,.05)"}}>
                      <button className="btn btn-blue btn-sm" style={{flex:1}} disabled={!!importing[lead.id]} onClick={()=>importLeads([lead.id])}>
                        {importing[lead.id]?<Spinner s={12}/>:<CheckCircle size={12}/>} Import to Lead Tracker
                      </button>
                      <button className="btn btn-ghost btn-sm" style={{color:"#f87171"}} onClick={()=>dismiss([lead.id])}><X size={12}/>Dismiss</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab==="setup" && (
        <div style={{display:"flex",flexDirection:"column",gap:20}}>
          <div className="glass-card" style={{padding:"18px 22px"}}>
            <div style={{fontWeight:800,color:"#fff",fontSize:15,marginBottom:8}}>Your Webhook URLs</div>
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:14}}>
              These are your live public URLs. Plug them into Zapier, Cloudmailin, Meta Lead Ads, or any lead-source integration. They write directly to your cloud Lead Inbox — no laptop required.
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {[
                ["Generic / Zapier",`${WEBHOOK_BASE}/api/webhook/lead`],
                ["Email (any forwarder)",`${WEBHOOK_BASE}/api/webhook/email`],
                ["BoldTrail / kvCORE",`${WEBHOOK_BASE}/api/webhook/boldtrail`],
                ["Zillow",`${WEBHOOK_BASE}/api/webhook/zillow`],
                ["Realtor.com",`${WEBHOOK_BASE}/api/webhook/realtor`],
                ["Facebook Lead Ads",`${WEBHOOK_BASE}/api/webhook/facebook-lead`],
              ].map(([label,url])=>(
                <div key={label} style={{display:"flex",gap:8,alignItems:"center",background:"rgba(255,255,255,.03)",borderRadius:8,padding:"8px 12px"}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#7eb8f7",width:160,flexShrink:0}}>{label}</span>
                  <code style={{flex:1,fontSize:11,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{url}</code>
                  <button className="btn btn-ghost btn-xs" onClick={()=>{navigator.clipboard.writeText(url);toast.success("Copied!");}}>
                    <Copy size={11}/>Copy
                  </button>
                </div>
              ))}
            </div>
          </div>

          {SOURCES_SETUP.map(src=>(
            <div key={src.name} className="glass-card" style={{padding:"16px 20px"}}>
              <div style={{display:"flex",gap:10,alignItems:"center",marginBottom:12}}>
                <span style={{fontSize:22}}>{src.logo}</span>
                <div>
                  <div style={{fontWeight:800,color:"#fff",fontSize:14}}>{src.name}</div>
                  <div style={{fontSize:11,color:"#475569"}}>Via: {src.how}</div>
                </div>
              </div>
              <ol style={{paddingLeft:18,display:"flex",flexDirection:"column",gap:6}}>
                {src.steps.map((s,i)=>(
                  <li key={i} style={{fontSize:12,color:"#94a3b8",lineHeight:1.6}}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {tab==="test" && (
        <div className="glass-card" style={{maxWidth:560}}>
          <div style={{fontWeight:800,color:"#fff",fontSize:15,marginBottom:6}}>Send a Test Lead</div>
          <div style={{fontSize:12,color:"#64748b",marginBottom:18}}>Simulate a lead coming in from any source to make sure everything's working.</div>
          <TestLeadForm toast={toast} onSent={()=>{fetchInbox();setTab("inbox");}}/>
        </div>
      )}
    </div>
  );
};

const TestLeadForm = ({toast,onSent}) => {
  const [f,setF] = useState({name:"",email:"",phone:"",source:"Homes.com",notes:""});
  const [sending,setSending] = useState(false);
  const send = async()=>{
    if(!f.name){toast.error("Enter a name");return;}
    setSending(true);
    try {
      const res = await fetch("/api/webhook/lead",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(f)});
      if (!res.ok) throw new Error("Webhook returned " + res.status);
      toast.success("Test lead sent! Check the inbox.");
      onSent();
    } catch (e) { toast.error("Test failed: " + e.message); }
    finally { setSending(false); }
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:12}}>
      {[["name","Full Name","Jane Smith"],["email","Email","jane@example.com"],["phone","Phone","(248) 555-1234"]].map(([k,l,ph])=>(
        <div key={k}>
          <label style={{fontSize:11,fontWeight:700,color:"#475569",display:"block",marginBottom:4}}>{l}</label>
          <input className="input" value={f[k]} placeholder={ph} onChange={e=>setF(p=>({...p,[k]:e.target.value}))}/>
        </div>
      ))}
      <div>
        <label style={{fontSize:11,fontWeight:700,color:"#475569",display:"block",marginBottom:4}}>Source</label>
        <select className="input" value={f.source} onChange={e=>setF(p=>({...p,source:e.target.value}))}>
          {["BoldTrail","Homes.com","Zillow","Realtor.com","Trulia","Facebook Lead Ads","Instagram","Webhook","Zapier"].map(s=><option key={s}>{s}</option>)}
        </select>
      </div>
      <div>
        <label style={{fontSize:11,fontWeight:700,color:"#475569",display:"block",marginBottom:4}}>Message / Notes</label>
        <textarea className="input" rows={3} value={f.notes} placeholder="I'm interested in 3BR homes under $350k in Livonia..." onChange={e=>setF(p=>({...p,notes:e.target.value}))} style={{resize:"vertical"}}/>
      </div>
      <button className="btn btn-blue" disabled={sending} onClick={send}>
        {sending?<Spinner s={14}/>:<Send size={14}/>} Send Test Lead
      </button>
    </div>
  );
};

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────
const Sidebar = ({current,setPage,mobileOpen,setMobileOpen,inboxCount=0}) => {
  const [profile] = useLS("re_profile",{name:"Your Agency"});
  const [tasks] = useLS("tasks",[]);
  const [emailQueue] = useLS("email_queue",[]);
  const todayStr = new Date().toISOString().slice(0,10);
  const dueTasks = tasks.filter(t=>!t.completed&&t.dueDate<=todayStr).length;
  const dueEmails = emailQueue.filter(e=>!e.sent&&e.dueDate<=todayStr).length;
  return (
    <div className={`sidebar ${mobileOpen?"open":""}`}>
      <div className="sidebar-logo">
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <div className="sidebar-logo-mark">RE</div>
          <div>
            <div className="sidebar-title">Real Estate Hub</div>
            <div className="sidebar-sub">Intelligence Platform</div>
          </div>
        </div>
      </div>

      <div style={{flex:1,padding:"8px 0"}}>
        <button className={`nav-item ${current==="dashboard"?"active":""}`} onClick={()=>{setPage("dashboard");setMobileOpen(false);}} style={{width:"calc(100% - 16px)"}}>
          <Home size={14}/>Dashboard
        </button>
        {NAV.map((item,i) => {
          if(item.section) return <div key={i} className="nav-section">{item.section}</div>;
          const Icon=item.icon;
          return (
            <button key={item.id} className={`nav-item ${current===item.id?"active":""}`} onClick={()=>{setPage(item.id);setMobileOpen(false);}}>
              <Icon size={14}/>{item.label}
              {item.id==="lead-inbox" && inboxCount>0 && (
                <span style={{marginLeft:"auto",background:"#ef4444",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800}}>{inboxCount}</span>
              )}
              {item.id==="tasks" && dueTasks>0 && (
                <span style={{marginLeft:"auto",background:"#f59e0b",color:"#000",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800}}>{dueTasks}</span>
              )}
              {item.id==="campaigns" && dueEmails>0 && (
                <span style={{marginLeft:"auto",background:"#8b5cf6",color:"#fff",borderRadius:10,padding:"1px 7px",fontSize:10,fontWeight:800}}>{dueEmails}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="sidebar-user">
        <div className="sidebar-avatar">{(profile.name||"A").charAt(0)}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,fontWeight:700,color:"#94a3b8",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile.name||"Agent"}</div>
          <div style={{fontSize:10,color:"#374151"}}>Real Estate Agent</div>
        </div>
      </div>
    </div>
  );
};

// ─── APP ──────────────────────────────────────────────────────────────────────
// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'reset'
  const [resetSent, setResetSent] = useState(false);

  const handle = async (e) => {
    e.preventDefault();
    setLoading(true); setErr('');
    try {
      if (mode === 'reset') {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        setResetSent(true);
        setLoading(false);
        return;
      }
      const fn = mode === 'signup'
        ? supabase.auth.signUp({ email, password })
        : supabase.auth.signInWithPassword({ email, password });
      const { error } = await fn;
      if (error) throw error;
      onLogin();
    } catch (e) {
      setErr(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{minHeight:'100vh',background:'#050810',display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
      <GlobalStyles/>
      <div style={{width:'100%',maxWidth:400,background:'rgba(255,255,255,.04)',border:'1px solid rgba(255,255,255,.08)',borderRadius:20,padding:'40px 36px'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:36,marginBottom:8}}>🏠</div>
          <div style={{fontSize:22,fontWeight:800,color:'#fff',letterSpacing:'-0.5px'}}>Real Estate Hub</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,.45)',marginTop:4}}>Monica Iskra · Livonia, MI</div>
        </div>

        {resetSent ? (
          <div style={{textAlign:'center',color:'#10b981',padding:16}}>
            ✅ Check your email for a password reset link.<br/>
            <button onClick={()=>{setMode('login');setResetSent(false);}} style={{marginTop:16,background:'none',border:'none',color:'rgba(255,255,255,.5)',cursor:'pointer',textDecoration:'underline',fontSize:13}}>Back to login</button>
          </div>
        ) : (
          <form onSubmit={handle} style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <label style={{fontSize:12,color:'rgba(255,255,255,.5)',fontWeight:600,display:'block',marginBottom:5}}>EMAIL</label>
              <input
                type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="you@email.com" required autoComplete="email"
                style={{width:'100%',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,padding:'10px 14px',color:'#fff',fontSize:14,outline:'none'}}
              />
            </div>
            {mode !== 'reset' && (
              <div>
                <label style={{fontSize:12,color:'rgba(255,255,255,.5)',fontWeight:600,display:'block',marginBottom:5}}>PASSWORD</label>
                <input
                  type="password" value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••••" required autoComplete={mode==='signup'?'new-password':'current-password'}
                  style={{width:'100%',background:'rgba(255,255,255,.06)',border:'1px solid rgba(255,255,255,.1)',borderRadius:10,padding:'10px 14px',color:'#fff',fontSize:14,outline:'none'}}
                />
              </div>
            )}
            {err && <div style={{background:'rgba(239,68,68,.12)',border:'1px solid rgba(239,68,68,.3)',borderRadius:8,padding:'9px 12px',color:'#f87171',fontSize:13}}>{err}</div>}
            <button type="submit" disabled={loading}
              style={{background:'#1a56db',border:'none',borderRadius:10,padding:'12px',color:'#fff',fontWeight:700,fontSize:15,cursor:loading?'wait':'pointer',opacity:loading?.7:1,marginTop:4}}>
              {loading ? 'Please wait…' : mode==='login' ? 'Sign In' : mode==='signup' ? 'Create Account' : 'Send Reset Email'}
            </button>
            <div style={{display:'flex',justifyContent:'space-between',marginTop:4}}>
              {mode === 'login' && <>
                <button type="button" onClick={()=>setMode('signup')} style={{background:'none',border:'none',color:'rgba(255,255,255,.45)',cursor:'pointer',fontSize:12,textDecoration:'underline'}}>Create account</button>
                <button type="button" onClick={()=>setMode('reset')} style={{background:'none',border:'none',color:'rgba(255,255,255,.45)',cursor:'pointer',fontSize:12,textDecoration:'underline'}}>Forgot password?</button>
              </>}
              {mode !== 'login' && <button type="button" onClick={()=>setMode('login')} style={{background:'none',border:'none',color:'rgba(255,255,255,.45)',cursor:'pointer',fontSize:12,textDecoration:'underline'}}>Back to login</button>}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [page,setPage] = useState("dashboard");
  const [mobileOpen,setMobileOpen] = useState(false);
  const {toasts,remove,success,error,info} = useToast();
  const [authUser, setAuthUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    const supabaseConfigured = (process.env.REACT_APP_SUPABASE_URL||'').length > 0 &&
      !(process.env.REACT_APP_SUPABASE_URL||'').includes('YOUR-PROJECT');
    if (!supabaseConfigured) {
      // No Supabase — run as local app, no login required
      setAuthUser({ email: 'local@rehub.app', id: 'local' });
      setAuthLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUser(session?.user ?? null);
      setAuthLoading(false);
    }).catch(() => {
      setAuthUser({ email: 'local@rehub.app', id: 'local' });
      setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);
  const toast = {success,error,info};
  const [inboxCount,setInboxCount] = useState(0);
  const [installPrompt,setInstallPrompt] = useState(null);
  const [showInstallBanner,setShowInstallBanner] = useState(false);
  const [isInstalled,setIsInstalled] = useState(false);

  // Detect if already installed as PWA
  useEffect(()=>{
    if(window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
      setIsInstalled(true);
    }
  },[]);

  // Capture install prompt
  useEffect(()=>{
    const handler = e => { e.preventDefault(); setInstallPrompt(e); setTimeout(()=>setShowInstallBanner(true), 3000); };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', ()=>{ setIsInstalled(true); setShowInstallBanner(false); success("App installed! Open it from your home screen."); });
    return ()=>window.removeEventListener('beforeinstallprompt', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const installApp = async()=>{
    if(!installPrompt) return;
    installPrompt.prompt();
    const {outcome} = await installPrompt.userChoice;
    if(outcome==='accepted'){ setInstallPrompt(null); setShowInstallBanner(false); }
  };

  // ── Browser notification helper ───────────────────────────────────────────
  const notify = useCallback((title, body, tag="rehub")=>{
    if(Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, icon:'/logo192.png', badge:'/logo192.png', tag });
    n.onclick = ()=>{ window.focus(); n.close(); };
  },[]);

  // Request notification permission after 8 seconds
  useEffect(()=>{
    const t = setTimeout(()=>{
      if('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
    }, 8000);
    return ()=>clearTimeout(t);
  },[]);

  // Check tasks due today — on load + every hour
  useEffect(()=>{
    const check = ()=>{
      try {
        const tasks = JSON.parse(localStorage.getItem('tasks')||'[]');
        const today = new Date().toISOString().slice(0,10);
        const due = tasks.filter(t=>!t.completed && t.dueDate<=today);
        if(due.length>0) notify(`${due.length} task${due.length>1?'s':''} due today`, due.slice(0,3).map(t=>t.title).join(' · '), 'tasks-due');
      } catch(e){}
    };
    const t1 = setTimeout(check, 6000);
    const t2 = setInterval(check, 3600000);
    return ()=>{ clearTimeout(t1); clearInterval(t2); };
  },[notify]);

  // Watch Supabase lead_inbox table — count + notify on new arrivals.
  // Uses realtime subscription instead of polling, so new leads ping ~instantly.
  useEffect(() => {
    let mounted = true;
    const fetchCount = async () => {
      try {
        const { count, error } = await supabase
          .from("lead_inbox")
          .select("*", { count: "exact", head: true });
        if (error || !mounted) return;
        const n = count || 0;
        setInboxCount(prev => {
          if (n > prev && prev > 0) {
            success(`${n - prev} new lead${(n-prev)>1?"s":""} in your inbox!`);
            notify(`🏠 New Lead${(n-prev)>1?"s":""} Arrived`, `${n - prev} new lead${(n-prev)>1?"s":""} waiting in your inbox`, 'new-lead');
          }
          return n;
        });
      } catch {}
    };
    fetchCount();
    const channel = supabase
      .channel("inbox_count_watch_"+Date.now())
      .on("postgres_changes", {event:"*", schema:"public", table:"lead_inbox"}, fetchCount)
      .subscribe();
    return ()=>{ mounted = false; try { supabase.removeChannel(channel); } catch {} };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  const props = {setPage,toast};

  const pages = {
    dashboard:            <Dashboard {...props}/>,
    "listing-writer":     <ListingWriter {...props}/>,
    "social-studio":      <SocialStudio {...props}/>,
    "video-studio":       <VideoAuto {...props}/>,
    "ai-studio":          <AIStudio {...props}/>,
    "viral-studio":       <ViralStudio {...props}/>,
    "influencer-watch":   <InfluencerWatch {...props}/>,
    "video-script":       <VideoStudio {...props}/>,
    "market-report":      <MarketReport {...props}/>,
    scheduler:            <ContentScheduler {...props}/>,
    "media-library":      <MediaLibrary {...props}/>,
    "client-templates":   <ClientTemplates {...props}/>,
    "showing-calendar":   <ShowingCalendar {...props}/>,
    "ad-composer":        <AdComposer {...props}/>,
    "lead-inbox":         <LeadInbox {...props} setInboxCount={setInboxCount}/>,
    "ai-concierge":       <AILeadConcierge {...props}/>,
    "social-agent":       <SocialAgent {...props}/>,
    "db-intel":           <DatabaseIntel {...props}/>,
    "pipeline":           <PipelineBoard {...props}/>,
    "tasks":              <TaskManager {...props}/>,
    "action-plans":       <ActionPlans {...props}/>,
    "campaigns":          <Campaigns {...props}/>,
    "prospecting":        <ProspectingHub {...props}/>,
    "lead-tracker":       <LeadTracker {...props}/>,
    "soi-manager":        <SOIManager {...props}/>,
    "transactions":       <TransactionManager {...props}/>,
    "commissions":        <CommissionTracker {...props}/>,
    "finances":           <Finances {...props}/>,
    "listing-tracker":    <ListingTracker {...props}/>,
    "realcomp-mls":       <RealcompMLS {...props}/>,
    "social-connect":     <SocialConnect {...props}/>,
    "google-business":    <GoogleBusiness {...props}/>,
    integrations:         <Integrations {...props}/>,
    analytics:            <Analytics {...props}/>,
    "market-analyzer":    <MarketAnalyzer {...props}/>,
    "cma-tool":           <CMATool {...props}/>,
    "content-repurposer": <ContentRepurposer {...props}/>,
    "carousel-builder":   <CarouselBuilder {...props}/>,
    "ab-testing":         <ABTesting {...props}/>,
    "landing-page":       <LandingPage {...props}/>,
    "email-alerts":       <EmailAlerts {...props}/>,
    settings:             <SettingsPage {...props}/>,
    help:                 <HelpGuide {...props}/>,
  };

  // Show loading spinner while checking auth
  if (authLoading) {
    return (
      <div style={{minHeight:'100vh',background:'#050810',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <GlobalStyles/>
        <div style={{textAlign:'center',color:'rgba(255,255,255,.4)'}}>
          <div style={{fontSize:36,marginBottom:12}}>🏠</div>
          <div style={{fontSize:14}}>Loading RE Hub…</div>
        </div>
      </div>
    );
  }

  // Show login if not authenticated
  if (!authUser) {
    return <LoginScreen onLogin={() => supabase.auth.getSession().then(({data:{session}}) => setAuthUser(session?.user ?? null))} />;
  }

  return (
    <>
      <GlobalStyles/>
      <div className="main-layout">
        {mobileOpen&&<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.6)",zIndex:90}} onClick={()=>setMobileOpen(false)}/>}
        <Sidebar current={page} setPage={setPage} mobileOpen={mobileOpen} setMobileOpen={setMobileOpen} inboxCount={inboxCount}/>
        <div className="page-area">
          <div className="topbar">
            <button className="btn btn-ghost btn-icon btn-sm" onClick={()=>setMobileOpen(!mobileOpen)}><Menu size={16}/></button>
            <div className="topbar-crumb">
              <span style={{cursor:"pointer",color:"#374151"}} onClick={()=>setPage("dashboard")}>Dashboard</span>
              {page!=="dashboard"&&<><span className="sep">›</span><span className="current">{NAV.find(n=>n.id===page)?.label||page}</span></>}
            </div>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              <button className="btn btn-blue btn-sm" onClick={()=>setPage("listing-writer")}><Sparkles size={12}/>Write Listing</button>
              <button className="btn btn-ghost btn-sm" title={`Signed in as ${authUser?.email}`} onClick={()=>supabase.auth.signOut()} style={{fontSize:12,opacity:.6}}>Sign Out</button>
            </div>
          </div>
          {pages[page]||<div style={{padding:32}}><div className="glass-card"><EmptyState icon={AlertCircle} title="Page not found" desc="This page is under construction"/></div></div>}
        </div>
      </div>
      <GmailSyncWorker notify={notify} toast={toast}/>
      <ScheduledPostsWorker notify={notify} toast={toast}/>
      <AILeadConciergeWorker notify={notify} toast={toast}/>
      <SocialEngagementWorker notify={notify} toast={toast}/>
      <Toast toasts={toasts} remove={remove}/>

      {/* PWA Install Banner */}
      {showInstallBanner && !isInstalled && (
        <div className="pwa-banner">
          <div style={{fontSize:24}}>📱</div>
          <div style={{flex:1}}>
            <div style={{fontWeight:800,fontSize:14}}>Install RE Hub on your phone</div>
            <div style={{fontSize:12,opacity:.8,marginTop:2}}>Access your leads anywhere, even offline</div>
          </div>
          <button onClick={installApp} style={{background:"rgba(255,255,255,.2)",border:"none",color:"#fff",borderRadius:8,padding:"7px 14px",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap"}}>Install</button>
          <button onClick={()=>setShowInstallBanner(false)} style={{background:"none",border:"none",color:"rgba(255,255,255,.6)",cursor:"pointer",padding:"4px",fontSize:18,lineHeight:1}}>×</button>
        </div>
      )}
    </>
  );
}
