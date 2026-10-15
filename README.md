# BeatVision Skeleton

![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/DaddyDom8249/BeatVision?utm_source=oss&utm_medium=github&utm_campaign=DaddyDom8249%2FBeatVision&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

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
