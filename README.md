# GitMastery - Interactive Visual Git & Learning Platform

An interactive online visual Git learning platform and playground built with React, Tailwind CSS, and Lucide icons.

## Features
- **Visual Git DAG Tree (SVG)**: Real-time dynamic visual representation of commits, branch pointers, HEAD, and tags.
- **Simulated Git Terminal CLI**: Implements commands like `git commit -m`, `git branch`, `git checkout / switch`, `git merge`, `git rebase`, `git reset`, `git tag`, `git stash`, `git log`, `git status`, and `git help`.
- **Systematic Curriculum**: Step-by-step challenges covering Git basics, branching, merging, and tagging with automatic state verification.
- **Gamification & Progress Tracker**: Daily streak tracker with claim bonus, XP and leveling system, and overall progress meter.
- **Sandbox & Undo**: Revert states, re-initialize repository, or experiment freely.

## Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the local development server:
   ```bash
   npm run dev
   ```

3. Open your browser at the local Vite URL (typically `http://localhost:5173`).

## Production Build

```bash
npm run build     # outputs static files to dist/
npm run preview   # serves dist/ locally at http://localhost:4173
```

## Deploy to Render

This repo includes a `render.yaml` Blueprint for a free **Static Site**:

1. Push this folder to a GitHub repository.
2. In Render, choose **New → Blueprint** and select the repository (or **New → Static Site** with
   build command `npm ci && npm run build` and publish directory `dist`).
3. Render rebuilds and redeploys automatically on every push.

Lesson progress, XP and the daily streak are saved in the browser's `localStorage`.
