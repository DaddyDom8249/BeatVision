# BeatVision Skeleton

**Every Song Has a World. BeatVision Reveals It.**

This is the complete structural skeleton for BeatVision. It is a scaffold, not a claim that every component is already implemented or production-ready.

## Product flow

Song → World → Style → Story → Scenes → Motion → Final Video

## Architecture

USER
↓
VERCEL / REACT FRONTEND
↓ authenticated requests
SUPABASE
├ Auth
├ PostgreSQL
├ Storage
└ Edge Functions
↓
BEATVISION GENERATION CONTROLLER
↓
ARENA PROVIDER GATEWAY
├→ PIXAZO
└→ SHOTSTACK
↓
SUPABASE STORAGE + DATABASE
↓
DB-authoritative UI

## Core invariants

- GitHub is the source of truth.
- Provider secrets stay server-side.
- The database is authoritative for durable state.
- New batches append; they never erase earlier assets.
- Approved assets are never silently replaced.
- Async jobs use queued → submitted → processing → completed/failed.
