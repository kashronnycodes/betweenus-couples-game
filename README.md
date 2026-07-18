# Between Us

Between Us is a cinematic two-player relationship game. Each partner privately chooses an answer, predicts the other's choice, and sees the shared reveal only after both answers are locked. Supabase authentication and Realtime keep both devices in the same server-authoritative room.

## Install and run

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` for real multiplayer:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

No secret service-role key belongs in the client.

## Supabase setup

1. Create a Supabase project.
2. In Authentication → Providers, enable Anonymous Sign-Ins.
3. Apply `supabase/migrations/202607190001_between_us.sql` with `supabase db push`, or paste it into the SQL editor.
4. Add the project URL and anonymous key to `.env.local`.
5. Restart the development server.

The migration enables RLS, revokes direct access to private submissions, and exposes three authenticated RPCs: `submit_round_answer`, `get_round_reveal`, and `advance_game_round`. This prevents either partner’s answer from being returned until both submissions are locked. Room/player rows are Realtime-enabled; subscribe once per active room and remove the channel when leaving or unmounting.

Supabase configuration is required for room creation and two-device play. The application displays a friendly connection error instead of creating a fake local room when configuration is missing.

## Test with two browsers

Run the app in a normal window and a private/incognito window so each receives a separate anonymous identity. Create a room in the first, enter its six-character code in the second, and keep both tabs visible while checking presence, answers, reveals, refresh recovery, and host-only advancement.

## Quality checks

```bash
npm run typecheck
npm test
npm run build
```

Tests cover question selection, categories, scoring, room codes, locked answers, secure reveal gating, final rounds, host advancement, and surprising-round selection.

## Customize

- Add questions in `src/data/questions.ts`. Each needs an ID, question, two options, category, and intensity. Category-specific games must contain enough questions for the selected round count.
- Change application identity and background video in `src/constants/app.ts`.
- Change semantic colors, type scale, motion, and glass treatment in `src/styles/theme.css` and `src/styles/globals.css`.
- Fonts are configured in `src/styles/fonts.css` with `font-display: swap` provided by Google Fonts CSS.
- Replace the background video URL with any browser-playable MP4. The component retains its static fallback and custom non-native loop behavior.

## Deploy to Vercel

Import the repository into Vercel, use the Vite preset, set the two `VITE_SUPABASE_*` variables, and deploy. The build command is `npm run build` and output directory is `dist`. Add the deployed origin to Supabase Authentication URL configuration.

## Accessibility

The game uses semantic forms and buttons, radio-group semantics for answers, visible keyboard focus, polite live status, 44px-or-larger touch targets, text labels in addition to color, safe-area spacing, and an immediate reduced-motion reveal. Test zoom, keyboard-only use, contrast, and screen-reader announcements before release.

## Realtime troubleshooting

- Verify Anonymous Sign-Ins and the migration are enabled.
- Confirm both browsers have different authenticated user IDs.
- Confirm `rooms` and `players` are in the `supabase_realtime` publication.
- If a room appears stale, inspect its `expires_at`, the browser network state, and channel status.
- Never add direct `SELECT` access to `round_submissions`; reveals must go through `get_round_reveal`.
