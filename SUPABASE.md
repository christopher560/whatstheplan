# Supabase plan (not implemented yet)

The dashboard is built so Supabase drops in behind one seam:
`src/lib/dashboard-repo.ts`. Pages call `dashboardRepo.getHome()` and the
interactive components will call the write methods. Today the repo returns the
sample data in `src/data/dashboard.ts`.

## Wiring

1. Add `@supabase/supabase-js` and `@supabase/ssr`.
2. Dashboard pages need per-user data, so they must render on request:
   add an adapter (`wrangler` is already a dev dependency, so
   `@astrojs/cloudflare`) and set `export const prerender = false` on
   `src/pages/app/*`.
3. Middleware (`src/middleware.ts`) creates a request-scoped Supabase client
   from cookies, redirects signed-out visitors away from `/app/*`, and puts
   `{ supabase, user }` on `Astro.locals`.
4. A `supabaseDashboardRepo(locals)` implements `DashboardRepo`. Reads are
   server-side in the page frontmatter. Writes go through Astro Actions
   (`src/actions/`), which the component scripts call instead of keeping local
   state. Each action calls the matching repo method.
5. Keep the ids already on the markup: `data-plan`, `data-detail`,
   `data-invite-id`. Scripts post those, never display text.

## Proposed tables (all with RLS on)

| Table | Purpose | Key columns |
| --- | --- | --- |
| `profiles` | one per auth user | `id` (= auth.users.id), `name`, `color`, `free_tonight bool`, `free_note` |
| `friendships` | accepted friends | `user_id`, `friend_id`, `status` |
| `plans` | the bubbles | `id`, `owner_id`, `category`, `stage` (0 idea, 1 voting, 2 locked), `title`, `starts_at`, `place`, `cost_cents`, `slug` |
| `plan_members` | invites and RSVPs | `id`, `plan_id`, `user_id`, `rsvp` (in, maybe, out, pending), `invited_by` |
| `ideas` | idea stash | `id`, `vibe`, `label`, `cost_cents` |
| `monthly_budgets` | budget card | `user_id`, `month`, `total_cents`, `comfort_cents` |
| `expenses` | spent and planned | `user_id`, `plan_id`, `amount_cents`, `kind` (spent, planned) |
| `availability` | overlap grid | `user_id`, `weekday`, `slot` (morn, aft, eve), `free bool` |

Money is stored in cents. The mock uses whole dollars, so convert in the repo,
not in components.

## Row level security

- `profiles`: read own and friends'; update own.
- `plans`: read when owner or a `plan_members` row exists; write when owner.
- `plan_members`: read when you are the member or the plan owner; a member may
  update only their own `rsvp`.
- `monthly_budgets`, `expenses`, `availability`: own rows only, except
  `availability` and `free_tonight`, which friends may read.
- The group comfort cap is computed in a view or RPC so private per-person
  numbers never leave the database.

## Mapping from the UI

| UI | Read | Write |
| --- | --- | --- |
| Header, Who's free tonight | `profiles` + `friendships` | `setFreeTonight` updates `profiles.free_tonight` |
| Plan builder | `ideas` | `createPlan` inserts `plans` and `plan_members`, returns `slug` |
| Plan bubbles | `plans` + `plan_members` | none yet (nudge, lock in) |
| Invites for you | `plan_members` where `user_id = me` and `rsvp = pending` or answered | `setRsvp` |
| Budget card | `monthly_budgets` + `expenses` | `setMonthlyBudget` |
| Overlap | `availability` for me and the chosen friend, intersected in SQL | none |

## Onboarding (`/app/onboarding`)

Every choice is stored as a stable id, never a display label, so the UI can be
reworded without a data migration. `src/lib/onboarding-repo.ts` defines the
`Profile` type; its fields are the `profiles` column names, so the object can
be upserted as it is. The page already routes through `onboardingRepo`.

| Profile field | Column | Notes |
| --- | --- | --- |
| `first_name`, `avatar_color` | `text` | color is a hex string |
| `age_group` | `text` + check | `u13` is rejected server-side; `birth_date` replaces it later |
| `area_id` | `uuid`/`text` references `areas.id` | `other` means no area |
| `interests`, `activity_types`, `availability` | `text[]` | ids from lookup tables or enums |
| `style` | `jsonb` | four 1-5 answers; the style name is derived, not stored |
| `group_size`, `group_first` | `text`, `bool` | |
| `discoverable_by`, `contactable_by`, `show_area` | `text`, `text`, `bool` | drive the Discover RLS |
| `guidelines_accepted` | `bool` (+ `accepted_at`) | |
| `onboarding_step`, `onboarded` | `int`, `bool` | saved after every step so setup resumes |

**Areas.** The Area step lists towns near the person (Aurora, Oswego,
Naperville and so on), not a fixed list in code.
- `areas`: `id`, `name`, `state`, `center geography(point)` with a GiST index.
- `onboardingRepo.getAreas()` returns them nearest first. The query takes the
  person's approximate location (coarse IP location or a rounded, opt-in
  browser position, never stored raw) and orders by `ST_Distance` with a
  limit of about 8. If location is unavailable it falls back to the most
  populated nearby areas.
- `profiles.area_id` stores the choice. Discover matches on `area_id` and
  distance between `areas.center` points, so a person's exact location is
  never needed.
- New towns are rows, not code changes.

**Saving.** `saveProfile({ profile, onboarding_step, onboarded })` is called
after each step. The Supabase version is an Astro Action that validates with
the same rules as the page (13+, at least 3 interests, guidelines accepted),
upserts `profiles` for `auth.uid()`, and sets `onboarded_at` on the last step.
RLS: a person can read and update only their own row.

## Account (`/app/account`)

The page edits the same `Profile` as onboarding, so it reads and writes the
same `profiles` row. `src/lib/account-repo.ts` is the seam:

| Method | Supabase |
| --- | --- |
| `getProfile()` | select the signed-in person's `profiles` row |
| `updateProfile(profile)` | update that row; the server repeats the page's checks (first name, 3+ interests, 1+ activity, 1+ time) |
| `changePassword({ current, next })` | re-authenticate with `current`, then `auth.updateUser({ password })`; return `{ ok: false, error }` on failure |
| `deleteAccount()` | Edge Function with the service role: delete the auth user; `on delete cascade` removes `profiles`, `plan_members`, `availability`, `monthly_budgets` and hosted `plans` |

Notes:
- Under-13 is not selectable here. A minor changing to an adult age group (or
  the reverse) should go through `birth_date` verification, not this form.
- Changing `discoverable_by`, `contactable_by` or `show_area` takes effect
  immediately through RLS; no cached copies.
- Send a confirmation email through Resend after deletion, as the page copy
  promises.

## Calendar (`/app/calendar`)

The page shares one client store (`src/lib/calendar-store.ts`) between its
components, and `src/lib/calendar-repo.ts` is the Supabase seam:

| Method | Supabase |
| --- | --- |
| `getCalendar()` | the person's `availability` rows, plus rows for friends who share (RLS filters the rest), `share` from `profiles` |
| `saveAvailability(cells)` | upsert the person's `availability` rows (`user_id`, `weekday`, `hour`, `state`), delete rows that were erased; the page debounces to one call per 600ms |
| `saveShare(share)` | update `profiles.calendar_shared` |

Notes:
- The grid is a weekly pattern (`weekday` 0 to 6, `hour` 8 to 23, `state`
  free or busy). The week arrows only change the dates shown. Per-date
  overrides would be a second table, `availability_overrides`, keyed by date.
- Friends who turn sharing off must return no rows, so best times never leak
  a hidden calendar. The best-times match runs in the browser today; move it to
  an RPC that intersects `availability` rows once friend counts grow.
- Calendar import (Google, Apple, school timetable) is a placeholder that says
  it is coming soon. It will need OAuth and an Edge Function that stores only
  free or busy, never event details.

## Plans (`/app/plans`)

The plans page shares one client store (`src/lib/plans-store.ts`) between the
header, the waiting list and the board. `src/lib/plans-repo.ts` is the seam:

| Method | Supabase |
| --- | --- |
| `getPlans()` | `plans` joined with the viewer's `plan_members` row and a count of replies; `stage` is a column (0 idea, 1 voting, 2 locked) |
| `setActionDone(planId, done)` | update the viewer's `plan_members` row (RSVP, picked days, bill split); one RPC per action type as they are built |
| `promoteIdea(planId)` | set `plans.stage = 1`, only for the owner or members with permission |

Notes:
- "Waiting on you" is derived: plans where the viewer's `plan_members.rsvp`
  is `pending`, or the plan has a deadline the viewer has not answered.
- Each card links to `/app/plans/{id}` (the "who replied" page, from the
  artifact's Plan replies design). That page is not built yet.
- The reply bar is `replied / invited`; compute both in the select, not in the
  browser.

## Plan replies (`/app/plans/[id]`)

One plan's page shares a client store (`src/lib/plan-store.ts`) between its
components. `src/lib/plan-repo.ts` is the seam:

| Method | Supabase |
| --- | --- |
| `getPlan(id)` | `plans` + `plan_members` (reply per friend) + `plan_slots` + `slot_votes` + latest `plan_events` for the feed |
| `listPlanIds()` | only for static builds; with SSR (`prerender = false`) drop `getStaticPaths` |
| `nudge(planId, friendIds)` | insert `plan_events`, send a text or email through Resend (rate limit: one nudge per friend per 24h) |
| `setAutoNudge(planId, on)` | `plans.auto_nudge`; a Cloudflare Cron Trigger sends the 24h reminders |
| `lockTime(planId, slotId \| null)` | set `plans.locked_slot_id` and `stage = 2`, notify everyone going, write the time to their `availability` as busy |
| `saveDescription(planId, text)` | update `plans.description` (max 200 characters, enforced in a check) |
| `sendUpdate(planId, message)` | insert a `plan_events` row and notify everyone on their chosen channel |

Notes:
- Replies arrive live: subscribe to `plan_members`, `slot_votes` and
  `plan_events` for the plan with Realtime and call `applyReply` in the store.
- Friends reply from the public invite link without an account, so
  `plan_members` rows can have a null `user_id` and a signed `guest_token`.
- Only the host sees nudge, lock, edit and update controls; guard each write
  with RLS (`plans.owner_id = auth.uid()`).
- "Preview as a friend" links to `/p/{slug}`, the public invite page. It is
  not built yet.

## Stack (decided)

- Porkbun: domain (`whatstheplan.social`). Vercel: hosting and scheduled jobs
  (Vercel Cron for reminders; Hobby allows daily runs only, so 24h nudges need
  Pro or a Supabase `pg_cron` job). Cloudflare is no longer used, so swap
  `@astrojs/cloudflare` and `wrangler.jsonc` for `@astrojs/vercel`.
- Supabase: Postgres, Auth, Storage, Realtime and PostGIS.
- Resend: invite and reminder emails, sent from a server action or an Edge
  Function, never from the browser.
- GitHub: code, deploys, and weekly database backups via Actions.
- Auth is Supabase Auth, so no Memberstack mirror is needed.
- No profile pictures for now. Avatars stay an initial on an accent color, so
  `profiles` keeps a `color` column and no `avatar_url`.

## Planned later (design for it, do not build yet)

**Meet people nearby.** Discover matches people by interests, age range and
distance, then suggests a public place (park, cafe) to meet.
- `profiles` gains `birth_year`, `interests text[]`, `discoverable bool`
  (default false) and `home_area geography(point)`. Store an approximate
  location only (rounded to a neighborhood), never a live position.
- `places` (public venues: name, kind, `geo geography(point)`) with a GiST
  index. Nearby search is an RPC using `ST_DWithin`; matching is an RPC that
  returns only opted-in profiles, filtered by age band and shared interests.
- `meetups` reuse `plans` and `plan_members` with a `source = 'discover'` flag,
  so RSVP, budget and reminders work unchanged.
- Strangers see only first name, color, shared interests and an age band, never
  exact age, school or location. RLS enforces this through a view, not the UI.

**Safety and wellbeing (the mental health side).** Read as: reduce loneliness
without putting people at risk. Needs your confirmation.
- Opt-in everywhere: discovery off by default, and no one is shown to anyone
  they have blocked.
- `blocks` and `reports` tables; a block hides both people from each other
  everywhere, including `availability` and Discover.
- Meet in public places only (from `places`), with an optional "share my plan
  with a trusted friend" step and a check-in reminder email via Resend.
- Minors (under-18 are allowed, so this is designed in from the start):
  - Store `birth_date` (not just a year) and derive `age_band` in a view:
    `minor` (13-17) and `adult` (18+). Set a minimum age of 13 (COPPA), and
    check what parental consent your launch regions require (GDPR sets 13-16
    by country).
  - Friends-only features (plans, budget, free tonight, friend search) work the
    same for everyone.
  - Stranger Discover launches adults-only. Minors never appear in an adult's
    results and never see adults, enforced in the RPC and RLS, not the UI.
  - A later option is minor-to-minor discovery only if it is safer by design:
    same age band, public places only, no direct messages before a plan is
    accepted, and parent or school verification. Treat it as a separate
    release with legal review.
  - Minors cannot turn on `discoverable` with a precise location, and `places`
    suggestions for them exclude venues that serve alcohol.
  - Reports involving a minor go to a priority queue and can freeze the
    account pending review.
- Gentle prompts rather than streaks or pressure: an "ideas you could try"
  nudge, and a low-stakes "maybe" RSVP so declining never feels like failing.
- Crisis resources: a static support link in settings and on report flows; no
  attempt to detect mood or diagnose.

**Friends.** Search by username or email, send and accept requests, all through
`friendships` with `status` (pending, accepted, blocked). Search is an RPC that
returns only exact username matches, so the user list cannot be browsed.

## Open questions

- Confirmed: under-18 users are allowed; "mental health" means loneliness
  plus safety when meeting strangers.
- Should minor-to-minor discovery ever ship, and who verifies age (self-report,
  school code, parent consent)?
- Realtime: subscribe to `plan_members` and `profiles.free_tonight` for live
  updates, or refresh on navigation first?
- Friends without the app (the share link in the builder) need an anonymous
  RSVP path. That likely means a signed token on `plans.slug`.

## Plan builder inputs (home dashboard)

`createPlan` now takes the full builder state: `type`, `vibe`, `budgetTier`,
`friendIds` (friends with the app), `guestNames` (people without the app, who
get the link), `title`, `description` (max 200), `place` and `when` (a suggested
time carried over from the calendar). It inserts the `plans` row plus a
`plan_members` row per friend, and a `plan_members` row with a null `user_id`
and a signed `guest_token` per guest. The home page also reads
`?with=maya,dev&when=...&from=calendar|friend|group` to pre-fill friends and a
suggested time; the Calendar's "Plan it" buttons already link that way. Validate
the ids server-side against the person's real friends.

## Discover (`/app/discover`)

Reads and writes go through `src/lib/discover-repo.ts` (`getDiscover`,
`joinGroup`, `leaveGroup`). Today it returns `sampleDiscover`.

- **Open groups** are a new `meetup_groups` table: `title`, `category` (a stable
  id: outdoors, games, food, create, active, chill), `tags text[]`, `purpose`,
  `starts_at`/`ends_at` (timestamptz, the UI shows the viewer's zone), `place_id`
  (a row in `places`, public venues only), `capacity` (max 10), `host_id`,
  `newcomer_friendly`, and `age_band`. `meetup_members` joins people to groups.
  A group starts when a viewer taps "Join this group" on a result and the group
  does not exist yet, or joins an existing one (see "Open your group" below).
- **Who can see what.** `getDiscover` returns only groups in the viewer's
  `age_band`, within range of `profiles.home_area` (PostGIS `ST_DWithin`).
  Stranger Discover is adults-only at launch (see "Planned later"), so a minor
  gets an empty feed from the RPC, not a UI check. Members are returned as first
  name, color and shared interests only.
- **Matching.** `src/lib/discover-fit.ts` is the prototype of a SQL view,
  `discover_matches(viewer_id)`, that returns each group with `fit_you`,
  `fit_them`, `spots_open` and `calendar_clash` (compared with `availability`).
  The page then only filters. Groups under a mutual fit of 60 are hidden, and the
  page says how many.
- **Joining.** `joinGroup` is one transaction that checks capacity under a row
  lock, inserts `meetup_members`, and rejects when the group filled meanwhile.
  `leaveGroup` deletes the row. Both hold a spot, so write them as RPCs.
- **Open your group.** The success banner links to the group page, which is not
  built yet (it links to `/app/plans` for now).
- **Safety copy.** "Everyone is verified" and "Always in public places" are
  promises: only show them once verification exists and `places` is the only
  venue source. Leave, block and report reuse the `blocks` and `reports` tables.
- **Realtime.** Subscribe to `meetup_members` so "spots open" updates without a
  refresh.

## Calendar, Plans and Friends updates

**Calendar (`/app/calendar`).** Availability is now stored per week: `availability`
keeps the weekly pattern (`weekday`, `hour`, `state`) and gains an optional
`week_start date` for a one-off week that differs from the pattern.
`saveAvailability(weekStart, cells)` writes one week. Friends return one
`freeByWeek` list per week ahead (0 to 7). Plans on the grid come from
`plan_members` joined to `plans` for the shown week: `kind` is host, going,
group (from `meetup_members`) or pending (an unanswered invite). Pending plans do
not count as busy and do not block a best-time match; the other kinds do.

**Plans (`/app/plans`).** The board is gone. The page has two tabs, "With friends"
and "New groups". `answerInvite(inviteId, reply)` writes `plan_members.reply`
(in, out, or null to undo); the answer also puts the plan on the calendar when it
is "in". The shell badge on Plans counts unanswered invites and is told about
changes through a `plans:pending` window event, so the Supabase version should
also subscribe to `plan_members` for the same count. `setOnCalendar` stores a
`calendar_pins` row. `setFriendRequest` creates a `friendships` row with status
pending. Past groups come from `meetup_members` for groups that ended.

**Friends (`/app/friends`).** `friendships` rows with status accepted are the
list; pending rows addressed to the viewer are the requests. The inner circle
(at most 6) is `friend_circle (user_id, friend_id, position)`, favorites are a
boolean on `friendships`, and tags are private rows in `friend_tags (user_id,
friend_id, label)` that the friend never reads. Each friend row carries only a
free or busy flag per day, never what they are doing. Accepting or declining and
the add-friend link (`/add/{username}`) go through RPCs so a request cannot be
spoofed.

## Invite link (`/p/[slug]`)

The public page a friend opens from a link the host copied. It has no app
shell and needs no account. `src/lib/invite-repo.ts` is the seam:

| Method | Supabase |
| --- | --- |
| `getInvite(slug)` | `plans` row by `slug` with the host's first name and color, the proposed `plan_slots`, and first names and colors of people already in (never anyone's contact details) |
| `listSlugs()` | only for static builds; with SSR (`prerender = false`) drop `getStaticPaths` |
| `replyAsGuest(slug, reply)` | insert a `plan_members` row with a null `user_id` and a signed `guest_token`; returns the guest's own link (`/r/{token}`) |

Notes:
- Each plan kind (`hangout`, `formal`, `school`) lists its own steps in
  `Invite.steps`, so a new kind is data, not code. The answers go to
  `plan_members` columns or a `jsonb` `answers` column: `rsvp`, `slot_votes`,
  `comfort_cents` (private, only the group minimum is ever shown), `plus_one`,
  `meal`, `diets`, `section`, `remind_via`, `remind_when`.
- The guest token must be signed and unguessable, rate limited per IP, and let
  the guest change their reply later from `/r/{token}` (not built yet).
- **The copied link is the guest's own page.** `/r/{token}` (not built yet) shows
  the last step of this page for that guest: their stored reply, the time that
  won (`plans.locked_slot_id`), and the host's updates (`plan_events` for the
  plan, newest first). They can change the reply from there, which updates the
  same `plan_members` row, and a changed plan or new update shows up on reload
  or through Realtime. The page store can start from the stored reply instead of
  the defaults, so the form and the receipt are one view.
- A signed-in person who opens the link should be matched to their own
  `plan_members` row instead of becoming a guest.
- "Make a free account" goes to `/app/onboarding`; after sign-up, claim the guest
  row by its token so the reply carries over.
- Reminders by text or email go through Resend and an SMS provider. Ask for the
  contact detail only when the guest chooses that channel.
- The prototype resolves `preview`, `beach-day`, `hangout-chill-5x9k` and
  `trivia-crew` to the taco night sample so existing links do not 404.

## Group page (`/app/groups/[id]`)

The page for one Discover group the viewer joined, with its persistent chat. It
shares one client store (`src/lib/group-store.ts`) between its components.
`src/lib/group-repo.ts` is the seam; leaving, the calendar pin and friend
requests reuse `discover-repo` and `plans-repo`:

| Method | Supabase |
| --- | --- |
| `getGroup(id)` | `meetup_groups` + `meetup_members` (first name, color, note) + last 50 `group_messages` + the open `group_polls` row; returns nothing unless the viewer is a member |
| `setGoing(groupId, going)` | update the viewer's `meetup_members.going` |
| `vote(groupId, optionId)` | upsert `group_poll_votes`, one per person per poll |
| `sendMessage(groupId, text)` | insert `group_messages` (`group_id`, `user_id`, `body` max 500, `created_at`); RLS allows members only |
| `blockMember(memberId)` / `reportMember(memberId, reasonId)` | `blocks` and `reports` (see "Planned later"); a block hides both people from each other everywhere |

Notes:
- Chat is live: subscribe to `group_messages` for the group with Realtime and
  append to the store. Text only at launch; no images, files or direct messages.
- The status line ("Locked in", "N more yeses") is derived from `going` counts
  against `meetup_groups.min_people`; compute it in a view so the page and the
  Plans badge agree.
- Members are returned as first name, color and a short note only. A blocked
  member's messages are filtered in the query, not just hidden in the UI.
- Reports about a minor go to the priority queue described under "Planned later".
- Leaving writes a system line ("X left") and removes the calendar pin.
- Groups without a hand-written sample are derived from the Discover data, so
  every Discover group links to a working page.

## Sign up and log in (`/signup`, `/login`) - built

Auth is live against the Supabase project `whatstheplan`
(`pdipxygigtownmishvwl`, us-east-2). The pages match the artifact's Auth design
and the Sign up and Log in tabs are links between two separate pages. Emails carry
a **6-digit code**, not a link: people type it into the page, so there is no
callback route and nothing to open on another device.

| Piece | Where |
| --- | --- |
| Env | `.env` (not committed) holds `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY`; `.env.example` shows the shape. Declared in `astro.config.mjs` (`env.schema`) and read with `astro:env/client`. Also set on the Vercel project. |
| Hosting | `@astrojs/vercel`. Pages are static unless they say `export const prerender = false`; every `/app/*` page, `/login` and `/signup` do. `/p/[slug]` and the marketing pages stay static. |
| Request client | `src/lib/supabase.ts` builds a `@supabase/ssr` client from the request's cookies. |
| Middleware | `src/middleware.ts` checks the session with `auth.getUser()` on every non-prerendered request and puts `supabase`, `user` and `onboarded` on `Astro.locals`. Signed out on `/app/*` goes to `/login?next=...`; signed in on `/login` or `/signup` goes to the app; signed in but not onboarded goes to `/app/onboarding`. Session pages send `Cache-Control: private, no-store`. |
| Actions | `src/actions/index.ts`: `auth.signUp`, `auth.logIn`, `auth.verifyCode`, `auth.resendCode`, `auth.requestPasswordReset`, `auth.updatePassword`, `auth.logOut`, `onboarding.saveProgress`. Expected problems come back as `{ ok: false, error }` with friendly text. |
| Client wrappers | `src/lib/auth-repo.ts` and `saveProfile` in `src/lib/onboarding-repo.ts` call the actions. No password or code is stored by page scripts. |
| Table | `public.profiles` (`id` = `auth.users.id`, `onboarded`, `onboarding_step`, timestamps). A trigger creates the row on sign up. RLS: owners read and update their own row; `authenticated` may update only `onboarded` and `onboarding_step`. Migrations: `create_profiles`, `grant_profiles_to_authenticated`. |

Flows:
- **Sign up:** `signUp` creates the account and Supabase emails a code. The page
  shows six boxes (pasting or iOS autofill fills them all). `verifyCode` with
  purpose `signup` signs the person in, then the page offers "Let's set you up"
  (onboarding). An address that already has an account looks identical, so nobody
  can probe for emails.
- **Log in:** password sign in. Someone who signed up but never typed their code
  gets a fresh code and the same six boxes. People who have not finished
  onboarding go to `/app/onboarding`, everyone else to `?next=` or the dashboard.
- **Forgot password:** `requestPasswordReset` (always answers ok) emails a code,
  `verifyCode` with purpose `recovery` signs the person in, then the page asks
  for a new password and `updatePassword` saves it.
- **Resend:** one new code per 60 seconds (the page counts down; Supabase enforces
  it too). Codes last 1 hour.
- Log out is a button in the sidebar and on the account page.
- Google sign-in is designed but not connected (the button says it is coming soon).

Email setup (all in dashboards; the Supabase MCP cannot change auth settings):
1. **Resend domain.** `whatstheplan.social` is added in Resend (region us-east-1).
   Add its DNS records at Porkbun (the domain's nameservers), then verify:
   - TXT `resend._domainkey` = the DKIM value shown in Resend
   - MX `send` = `feedback-smtp.us-east-1.amazonses.com`, priority 10
   - TXT `send` = `v=spf1 include:amazonses.com ~all`
   - CNAME `rsend` = `send.forge.rmta.net`
2. **Supabase SMTP** (Authentication > Emails > SMTP Settings, turn on custom SMTP):
   host `smtp.resend.com`, port `465`, username `resend`, password = a Resend API
   key with Sending access limited to the domain, sender email
   `no-reply@whatstheplan.social`, sender name `whatstheplan`. Never put the API
   key in the repo.
3. **Supabase templates** (Authentication > Emails > Templates): in "Confirm sign up"
   and "Reset password" show `{{ .Token }}` instead of the link. Suggested body:

   ```html
   <div style="font-family:Arial,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#1D1740">
     <h2 style="margin:0 0 8px">Your code</h2>
     <p style="margin:0 0 16px">Enter this code to finish creating your whatstheplan account:</p>
     <p style="font-size:36px;font-weight:700;letter-spacing:8px;margin:0 0 16px">{{ .Token }}</p>
     <p style="color:#5F5C66;font-size:14px">It expires in 1 hour. If you did not ask for it, ignore this email.</p>
   </div>
   ```
   Subject: `Your whatstheplan code: {{ .Token }}`. For "Reset password" say "reset your
   password" instead of "finish creating your account".
4. **Rate limits** (Authentication > Rate Limits): with custom SMTP the default is
   30 emails an hour; raise it before launch.
5. Authentication > Sign In / Providers > Email: keep "Confirm email" on, and check
   "Email OTP Length" is 6 and expiry is 3600 seconds.
6. Authentication > URL Configuration: Site URL `https://www.whatstheplan.social`
   (Vercel sends the bare domain to www). Codes need no redirect URLs, but keep
   `http://localhost:4321/**` and the production domains for Google sign-in later.
7. Authentication > Attack Protection: turn on leaked password protection, and a
   CAPTCHA before launch.
8. Google sign-in (later): create a Google OAuth client, enable the provider, then
   replace the stub `signInWithGoogle` with `auth.signInWithOAuth`.

Notes:
- The security advisor flags `public.rls_auto_enable()`, a Supabase-provided
  helper that already existed in the project; it is not part of this app.
- The terms and privacy links on the sign-up form are placeholders until those
  pages exist.
- Until the templates show `{{ .Token }}`, Supabase still emails a link and the
  six boxes cannot be filled, so do step 3 before testing sign up.
