# Supabase: what is built and what is next

For a plain-language explanation of how each feature works, read `HOW-IT-WORKS.md`.

Most of the app now runs on Supabase. The sections marked "built" at the bottom of
this file describe what exists; the early sections (Wiring, Proposed tables,
Mapping from the UI) are the original plan and are partly out of date: the
host is Vercel, not Cloudflare, and the real tables and functions are the ones
named in the "built" sections.

## Where things stand

| Area | State |
| --- | --- |
| Sign up and log in (email, password, 6-digit code, CAPTCHA) | built |
| Profiles, onboarding, account page | built |
| Calendar availability | built |
| Friends (usernames, requests, circle, tags, `/add/<username>`) | built |
| Plans: builder, invites, guest replies, time voting, locking, calendar, host updates | built |
| Security pass (grants, RLS, rate limits, headers, cookies) | built |
| Discover, round 1: your town and distance | built |
| Discover, round 2: places, groups, joining, blocks, reports, starter groups (database) | built |
| Discover, round 3: ranking function, the Discover page, start a group | built |
| Discover, round 4: the real group page (members, plan, poll; chat comes next) | built |
| Group chat (text only, refreshes every few seconds) | built |
| Live updates (frequent checks) on plan page, group page, Discover, Plans page, badges | built |
| Email nudges, reminders and "locked in" emails | after group chat |
| Teen Discover with an age check | later, needs a decision on verification and legal review |

Order was set by the owner: Discover and group chat come before nudges and live updates.

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
- `areas`: `id`, `name`, `state` (the area step is still a fixed list in code today). Where someone lives for Discover is the separate saved town on the account page (see "Discover - plan"), not this list.
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
- Supabase: Postgres, Auth, Storage and Realtime. PostGIS is not needed: distance is between town centres, worked out with a plain formula.
- Resend: invite and reminder emails, sent from a server action or an Edge
  Function, never from the browser.
- GitHub: code, deploys, and weekly database backups via Actions.
- Auth is Supabase Auth, so no Memberstack mirror is needed.
- No profile pictures for now. Avatars stay an initial on an accent color, so
  `profiles` keeps a `color` column and no `avatar_url`.

## Planned later (design for it, do not build yet)

**Meet people nearby.** Superseded by the "Discover (`/app/discover`)" plan below,
which is the current design: town-level location, age bands, public places only.

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

- Decided: under-18 users are allowed in the app. Discover launches for adults
  only; teen Discover (13-15 with 13-15, 16-17 with 16-17) waits for an age
  check (school email or parent consent) and legal review. Age is self-reported
  until then.
- Decided: location is a town (ZIP code), for every age. No device location.
- Decided: Discover groups come from hosts and from the app forming them; the
  owner seeds a few starter groups. Hosts are adults at launch.
- Still open: which age check for teens, and whether 13-15 needs parent consent
  where you launch.
- Friends without the app reply from the invite link (`/p/<slug>`, built).

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

## Discover (`/app/discover`) - plan

Reads and writes go through `src/lib/discover-repo.ts` (`getDiscover`,
`joinGroup`, `leaveGroup`). Today it returns `sampleDiscover`; the rounds below
replace it with the database.

### Who can use it
- **Age bands, enforced in the database** (not the page): 13-15 only meet 13-15,
  16-17 only 16-17, adults only adults. Nobody sees across a band, and a join
  across bands is refused by the function.
- **Launch: adults only.** `app_settings` holds `discover_bands` (starts as
  `["adult"]`). A person's band comes from `profiles.age_group`. Turning teens on
  later is a settings change, plus the teen rules: public venues only and none
  that serve alcohol, daytime and early evening starts only, teen hosts only,
  reports about a teen first in the queue. Friends and plans work for all ages.
- Age is self-reported. A band is only as true as what people enter, which is why
  teen Discover waits for an age check.

### Location (built)
A town, saved as the approximate centre of a ZIP code, with a distance setting of
5, 10 or 25 miles (`profiles.home_lat`, `home_lng`, `location_label`,
`discover_radius_km`). Distance between a person and a venue is a plain formula
on those coordinates, so no PostGIS. People see a rough distance ("about 3
miles") and the venue name; the street address appears once they join.

### Tables (round 2)
- `places`: public venues only (name, kind, town, address, `lat`, `lng`,
  `serves_alcohol`). Filled by hand. A group can only be placed at a `places` row.
- `meetup_groups`: `host_id` (null for starter groups), `source` (`host`, `seed`,
  `formed`), `title`, `category` (outdoors, games, food, create, active, chill),
  `tags text[]`, `purpose` (200), `starts_at`, `ends_at`, `place_id`, `capacity`
  (3 to 10), `min_people`, `newcomer_friendly`, `age_band`, `status` (open, full,
  cancelled).
- `meetup_members`: `group_id`, `user_id`, `going`, `note`, `joined_at`.
- `blocks` and `reports` (a block hides both people from each other everywhere,
  including Discover and the calendar; a report about a minor goes first).
- `discover_waitlist`: a person, their categories and town, for "tell me when a
  group forms near me" and for groups the app forms.
- Writes only through functions, like plans: `create_group` (host, adults at
  launch, public place, start within 30 days), `join_group` (locks the row so
  capacity holds, checks band, distance and calendar clash), `leave_group`.

### How the feed is ranked (round 3)
One database function, `discover_matches`, filters then scores, so the page only
displays what it is given.

**Filters** (a group that fails any of these is never shown):
1. The viewer's band is switched on, and the group is in the same band.
2. Within the viewer's distance setting.
3. At least one spot open and at least 2 people already in, so nobody meets one
   stranger alone.
4. Starts in the future, inside the window the viewer asked for (right now,
   tonight, this weekend, this week).
5. Nobody in it is blocked either way.

**Score** (out of 100) for what is left:

| Part | Weight | What it measures |
| --- | --- | --- |
| Interests | 30 | shared interests with the group's tags, and how many members share them |
| Vibe | 15 | the viewer's four style answers (energy, pace, planning, warm-up) against the group's |
| Distance | 15 | closer scores higher |
| Timing | 15 | sooner scores higher when the viewer asked for "right now" |
| Mutual friends | 10 | members who are the viewer's friends or friends of friends |
| Nearly formed | 10 | a group that needs one more person to happen |
| Newcomer fit | 5 | newcomer-friendly and a comfortable size, higher for first-time users |

- Groups under 60 are hidden, and the page says how many.
- A group that clashes with hours the viewer marked busy is pushed down, not removed.
- Every result carries its reasons ("3 shared interests, 2 miles, you're free
  Thursday") so people can see why it was shown.
- Variety: the page mixes categories instead of five of the same.
- Later, once there is data: learn from joins, leaves and "not for me", and rank
  reliable hosts higher.

### Where groups come from
- **Hosted:** an adult starts a group at a public place and it joins the feed.
- **Starter groups:** the owner seeds a few real groups (venue, day, time, size,
  activity) from a template, loaded with `source = 'seed'` and no host, so the page
  is never empty in a town.
- **Formed by the app (later round):** people on the waitlist in the same town
  with the same category and overlapping free hours are grouped and offered a
  group of at least 3, which becomes `source = 'formed'`.

### Safety copy
"Everyone is verified" and "Always in public places" are promises: only show
them once verification exists and `places` is the only venue source. Leave, block
and report are always one tap.

### Rounds
1. Your town and distance. **Built.**
2. Places, groups and members; joining with a capacity lock; blocks and reports;
   the age-band setting; starter groups. **Built (database).**
3. `discover_matches`, the quiz, the feed and filters on the real data, and
   "Start a group" for hosts. **Built.**
4. The real group page `/app/groups/[id]` (members, the plan, the poll), with
   "Open your group" linking to it. **Built (chat is the next round).**
Then group chat and Realtime ("spots open" updates without a refresh), then
email nudges and reminders, then teen Discover with an age check.

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

## Group page (`/app/groups/[id]`) - plan (Discover round 4, chat after)

Built after the Discover feed. The members, the plan and the poll come first;
the live chat is its own round right after, with Realtime.

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

## Profile answers, account page and CAPTCHA - built

**Profiles.** `public.profiles` now holds every onboarding answer (`first_name`,
`avatar_color`, `age_group`, `area_id`, `interests`, `style`, `activity_types`,
`availability`, `group_size`, `group_first`, `discoverable_by`, `contactable_by`,
`show_area`, `guidelines_accepted`, `guidelines_accepted_at`) with check constraints,
plus `onboarded` and `onboarding_step`. Choices are stable ids from
`src/data/onboarding.ts`. `authenticated` may update only those columns.
Migrations: `profile_answers_and_delete_account`, `check_my_password`.

| Piece | Where |
| --- | --- |
| Rules | `src/lib/profile-schema.ts` (zod). Every choice must be a known id; `incomplete()` is what a finished profile needs. |
| Read and write helpers | `src/lib/profile-db.ts` (`readProfile`, `profileRow`) |
| Actions | `onboarding.save` (drafts may be incomplete; `onboarded: true` needs a complete profile and never goes back to false), `account.updateProfile`, `account.changePassword`, `account.deleteAccount` |
| Onboarding | resumes at the saved step with the saved answers (`data-initial`); someone who finished starts from the top and can edit |
| Account page | reads the saved profile; edits go through `account.updateProfile` |
| Shell | the sidebar and dashboard greeting use the saved first name and the nearest accent to the saved avatar color (`src/utils/avatar-accent.ts`) |

Database functions (security definer, callable only by signed-in people, each only
touches the caller's own row):
- `delete_my_account()` deletes the auth user; `profiles` goes with it through the
  foreign key. This avoids needing a service-role key.
- `check_my_password(candidate)` confirms the current password for the change
  password form, because signing in again would need a CAPTCHA. It could be used
  to guess a password by someone who already holds the session, so add a throttle
  before launch.

Still sample data: friend count, plans, calendar, groups, budget.

**CAPTCHA (hCaptcha).** Supabase checks a token on every sign in, sign up, reset
and resend, so the forms show a box. `src/lib/captcha.ts` loads hCaptcha and
`AuthForm` mounts a box in the form, the forgot-password view and the code view's
resend. Tokens work once, so the box resets after every request. `PUBLIC_HCAPTCHA_SITE_KEY`
(the public site key) goes in `.env` and on Vercel; the secret stays in Supabase.
Without the site key the forms show no box and Supabase rejects requests while its
CAPTCHA is on. Someone who signed up but never typed their code gets the code
screen with a "Send me a code" button instead of an automatic email, because the
log-in token was already used.

## Calendar availability - built (Round 1)

`/app/calendar` now reads and writes the signed-in person's own free and busy hours.

| Piece | Where |
| --- | --- |
| Table | `public.availability_cells (user_id, week_start, weekday 0-6, hour 8-23, state free or busy)`, primary key on all but `state`. `week_start` is always a Monday. RLS: the owner reads and writes only their own rows. Migration: `availability_cells`. |
| Saving | RPC `save_availability_week(p_week_start, p_cells jsonb)` deletes and re-inserts one week in a single step (security invoker, so RLS applies) and records the week in `public.availability_weeks`, so a week cleared on purpose stays empty instead of falling back to an earlier one. Migration: `availability_weeks_marker`. Called by the action `calendar.saveAvailability`, which also checks the week is a Monday within the next 8 weeks. |
| Sharing | `profiles.calendar_shared` (default true), saved by `calendar.saveShare`. |
| Reading | `src/lib/availability-db.ts` `readCalendar`: painted weeks from this one on, plus a base for unpainted weeks. |
| Client | `src/lib/calendar-repo.ts` wrappers call the actions; the store, grid and summary components are unchanged. |

How weeks work: there is no separate weekly pattern. A saved week shows exactly what
was saved, even if it is empty. A week never saved starts from the most recent saved
week, up to this week, so a habit carries forward on its own. Saving a week affects just that week.

Tested with SQL as two signed-in users: each sees only their own rows, B cannot
insert, update or delete A's rows, a bad hour is rejected and rolls back the whole
save, duplicate hours keep the first, and an empty save clears the week.

Still sample or empty: friends on the calendar (shows a "find friends" card), plans on
the grid, and calendar import. The server works out "this week" in its own time zone
(UTC on Vercel), so near midnight on Sunday the week can differ from the person's; pass
the browser's date to the page if that matters.

## Friends - built (Round 2)

People find each other by exact username or a personal link, never by email or by
browsing. `/app/friends` and the calendar overlay now use real friends.

| Piece | Where |
| --- | --- |
| Username | `profiles.username` (unique, `^[a-z0-9_]{3,20}$`). `ensure_my_username()` gives one (first name plus 4 digits) the first time the friends page loads. People change it on the Account page (`UsernameCard`, actions `account.checkUsername` and `account.setUsername`) with no limit on changes; the old add link stops working when it changes. Reserved words (admin, support, whatstheplan...) are refused in the app and by a check constraint (`reserved_usernames`). |
| Tables | `friendships (requester_id, addressee_id, status pending or accepted)`, one row per pair either way round; `friend_prefs (user_id, friend_id, favorite, tags[], circle_position 0-5)`, private to its owner. Migrations: `friends`, `friend_free_slots_by_week`. |
| No direct writes | `friendships` has a select policy only. Every change goes through functions that act for `auth.uid()`: `send_friend_request(username)` (answers sent, accepted, already_friends, already_requested, not_found, self, too_many; asking someone who already asked you accepts), `respond_friend_request(other, accept)`, `set_friend_favorite`, `set_friend_tags`, `set_circle(ids)` (up to 6 accepted friends). |
| What friends may see | `list_friends()` returns only first name, avatar color, username, whether they share a calendar, and your own private favorite, labels and circle spot. `friend_free_slots(monday)` returns the hours free for each accepted friend who has `calendar_shared` on, for this week and the next seven (a saved week as saved, otherwise their latest saved week). Nobody else's profile or calendar rows are readable. `profile_by_username` gives a name and color for the add page. |
| Server | `src/lib/friends-db.ts` builds the page data (tonight's mood and next free time are worked out from the shared hours); actions in `friends` of `src/actions/index.ts`; wrappers in `src/lib/friends-repo.ts`. |
| Pages | `/add/[username]` asks for a sign in, shows who it is and sends the request. The Friends page also has a "type a username" box. Requests show on the page of the person asked; a decline deletes the request. |
| Time zone | The dashboard layout sets a `tz` cookie; `src/utils/now.ts` turns it into "now" for this week, today and tonight. First visit falls back to UTC. |

Tested with SQL as three signed-in users: a request, a repeat, a request to self and to
an unknown name; the asked person sees it and the asker does not see it as theirs;
accepting makes it two-way; a friend's free hours appear for week 0 to 7 and vanish when
they stop sharing; a stranger sees nothing; direct inserts into `friendships` and adding
a non-friend to the circle are refused; prefs are invisible to the friend.

Not built: removing a friend, blocking, "plans together" counts
(shown as "Friends since ..."), notifications, and `/add` for people who have not signed up
(they sign up first and are sent back through `?next=`).

## Security hardening - built

- **Grants:** `anon` has no access to the `public` schema. `authenticated` has no TRUNCATE, TRIGGER or REFERENCES. New tables and functions start with no access.
- **Writes through functions only:** `availability_cells`, `availability_weeks` and `friend_prefs` cannot be written directly. `save_availability_week`, `set_friend_favorite`, `set_friend_tags` and `set_circle` are security definer, act only for `auth.uid()`, and check the week window, friendship and sizes.
- **Rate limits:** `rate_limits` (no API access) and `hit_rate_limit(key, max, window)`. `check_my_password` 5 per 15 min, `profile_by_username` 60 per 10 min, `send_friend_request` 30 per hour (returns `rate_limited`), `save_availability_week` 120 per 10 min.
- **Size limits:** every interest, activity, availability and tag item is length-checked; `style` is capped.
- **Cookies:** session cookies are httpOnly, SameSite=Lax, and Secure in production (`src/lib/supabase.ts`).
- **Headers:** `vercel.json` sets CSP (self plus hCaptcha), HSTS, frame denial, nosniff, referrer and permissions policies.
- **JSON in pages:** every `*State.astro` escapes `<` as `\u003c` so stored text cannot close the script tag.
- **Known and accepted:** `npm audit` reports `path-to-regexp` through `@astrojs/vercel` (build-time routing only; the fix is a breaking adapter downgrade).
- **Dashboard settings to check:** minimum password length 8+, leaked-password protection (Pro plan), CAPTCHA on, redirect URLs limited to whatstheplan.social.

## Plans, round A - built

Real plans for the plan builder, the Plans page and the host's plan page.

- **Tables** (read-only through the API, RLS on): `plans` (owner, unguessable `slug`, kind, vibe, budget tier, title, description, place, free-text time, stage, auto nudge), `plan_members` (a friend by `user_id` or a guest by `guest_name`, `is_host`, `reply` in/maybe/out), `plan_events` (the feed: created, reply, update, description). `in_plan(plan)` is the security-definer helper the policies use, so members can read a plan but strangers see nothing.
- **Functions** (security definer, act for `auth.uid()`): `create_plan` (friends must be accepted friends, up to 30 friends and 20 guests, 20 plans an hour), `answer_plan` (only your own invite, not the host's), `set_plan_description` and `post_plan_update` (host only), `set_plan_auto_nudge`, `my_plan_people`, `plan_feed`.
- **App:** `src/lib/plans-db.ts` reads (hub, host plan, builder friends, pending count); `src/lib/plans-repo.ts` and `plan-repo.ts` call the `plans.*` actions. The sidebar Plans badge counts unanswered invites. The builder lists the person's real friends, and people without the app are added by name.
- **Not built yet:** the public `/p/[slug]` page and guest replies (round B), time slots and locking, nudges and reminders, calendar pins, group chat. `Add to calendar`, `nudge` and `lockTime` save nothing yet.
- Finishing onboarding now creates the person's `@username`.

## Plans, round B (public invite and guests) - built

- **`/p/[slug]`** renders on request from `public_invite(slug)`; **`/r/[token]`** is a guest's own page from `guest_receipt(token)`. The steps come from the plan kind (hangout/casual/event: reply, name, budget; formal: reply, name, guests; school: reply, name). A signed-in visitor skips the name step and replies as themselves; the host is sent to their plan page.
- **Guest tokens** are 64 hex characters (two random UUIDs), stored on `plan_members.guest_token`, and only the definer functions can read them: members get column-level SELECT without `guest_token` or the private `comfort_dollars`. A guest who types a name the host already added takes that spot; otherwise they get a new row. A plan holds at most 60 people and takes at most 30 new guests an hour.
- **Public surface (anon can call):** `public_invite`, `guest_receipt`, `guest_reply`. They return first names and colors of people going, never usernames, ids or contact details. `member_reply` is for signed-in people.
- Both pages send `Cache-Control: private, no-store` and are `noindex`. The link is the key, so share it only with the guest.
- **Not built yet:** time slots to vote on, locking a time, reminders, "add to calendar", Realtime.
- To limit abuse by IP, add a Vercel Firewall rate limit rule on `/_actions/invite.reply`.

## Plans, round C (times, voting, locking, calendar) - built

- **Tables:** `plan_slots` (a proposed instant, up to 5 per plan, none further than a year away), `slot_votes` (read only through `plan_votes(plan)`), plus `plans.tz` (the host's time zone, so every guest reads the same wall-clock time) and `plans.locked_slot_id`. Members can read `plan_slots`; nobody writes it directly.
- **Functions:** `create_plan` takes the time zone and the times; `guest_reply` and `member_reply` take the slots the person can do (decline clears them; leaving them out keeps earlier votes; slots from another plan are ignored); `lock_plan_slot(plan, slot|null)` is host only, sets the stage to 2 (or 1 on unlock) and writes a feed event.
- **App:** the plan builder has "Times to vote on" (date-time pickers, up to 5). The invite gets a Times step (after the name) with live vote counts; the host's plan page shows votes per time and locks one; the Plans list shows the locked time or "Voting on N times".
- **Calendar:** `/p/<slug>/calendar.ics` returns the locked time as a calendar file (2 hours, with place and description); the invite's "Add to calendar" is that download. `/app/calendar` shows plans with a locked time on the grid (hosting, going, or an unanswered invite as "waiting"), on the viewer's own clock.
- **Not built yet:** nudges and reminders (need Resend and an SMS provider), Realtime, group chat, Discover. Plans do not yet mark friends busy in their own availability.

## Plans, round C2 (host's pick, leeway, notes) - built

- **The host picks the start time first.** The plan builder asks "When does it start?" (required except for hangouts) and offers one-tap nearby times (1 hour earlier or later, 2 hours later, next day), plus extra custom times, five in all. The first time given is stored at `plan_slots.position = 0` and the host's vote for it is already in.
- **The invite always has the Times step** for hangouts, casual meetups and events (formal and school plans get it when the host offered more than one time). The host's pick is tagged "<host>'s pick" and starts selected for a new guest; someone who already replied keeps their own choices. With no time set, the step says so and still takes a note.
- **Time note:** `guest_note` and `member_note` add "left a note about times" to the host's feed (120 characters, once per identical note).
- A plan with one time shows that time; with leeway it reads "<time>, or nearby" until the host locks one.

## Plans, round C3 (friends from an invite, calendar) - built

- **Add the host as a friend.** `add_plan_host(slug)` lets someone who is in the plan send the host a friend request (it reuses `send_friend_request`, so the same limits and results apply); a stranger with only the link gets `not_found`. `public_invite` tells a signed-in visitor whether they and the host are `friends`, `requested` or `none`. The invite's last step shows the button, or "Log in" for guests (it comes back to their own link).
- **Guests with an account.** `claim_guest_reply(token)` attaches the guest row (reply, votes, feed entries) to the signed-in account, or merges it into the account's own row if it is already in the plan, and kills the old token. The guest page shows "Link this reply to my account" when someone is signed in.
- **Add to calendar** always works once a time exists: the locked time, or the host's pick marked `STATUS:TENTATIVE` ("Time not locked in yet"). The same file is the button on the Plans page's "You're going to" cards.

## Plans, round C4 (in-app calendar, host adds friends) - built

- **Add to calendar for accounts** puts the plan on their in-app calendar: `calendar_pins (user_id, plan_id)` (read own; written only by `set_plan_pin`, members only). The button on the invite's last step and on the Plans page's "You're going to" cards toggles it ("On your calendar" in green). Guests without an account still get the `.ics` file.
- **The grid** (`readCalendarPlans`) shows plans the person hosts, plans with a locked time, and plans they pinned, at the locked time or the host's pick. "Can't make it" plans stay off.
- **Host adds friends.** The host's "Who said what" list shows "Add friend" next to anyone in the plan who has an account and is not already a friend (`plan_member_friend_states`, `add_plan_member_friend`, which reuses `send_friend_request`). Guests are labelled "Guest, no account", accounts that joined from the link "Joined from your link". The old made-up "Opened the link 2 h ago" is gone.

## Discover, round 1 (your town) - built

- **Saved town, for every age:** `profiles.home_lat`, `home_lng` (the approximate centre of the town or ZIP, rounded to two decimals), `location_label` ("Aurora, IL"), `location_set_at`, and `discover_radius_km` (8, 16 or 40: 5, 10 or 25 miles). Only the definer functions write them: `set_my_location`, `clear_my_location`, `set_discover_radius`. Nobody can read another person's row, and the page is never sent the coordinates, only whether a town is saved, its label and the distance.
- **How it is set** (card "Your town" on the account page): a US ZIP code, looked up server-side on api.zippopotam.us, limited to 20 lookups an hour per person (`location_lookup_allowed`). There is no device location button: only a town is ever kept.

### Decision: who sees Discover (age bands, adults first)

- **Age bands, enforced in the database when groups are listed or joined:** 13-15 only meet 13-15, 16-17 only 16-17, adults only adults. Nobody sees across a band.
- **Launch: adults only.** A setting lists the bands that may use Discover; it starts as adults only. Friends and plans work for everyone.
- **Later: teens**, only after an age check is chosen (school email or parent consent) and the legal side is settled. Turning it on is a settings change, not new code. Teen groups would also be public venues only (no alcohol), daytime and early evening only, hosted by teens, with reports to the front of the queue. Age is self-reported today, so a band is only as true as what people enter.
- **Next rounds:** places and groups with joining and your starter groups; the ranking function (filters, then score: interests 30, vibe 15, distance 15, timing 15, mutual friends 10, nearly formed 10, newcomer fit 5); the real group page.

## Discover, round 2 (places, groups, joining) - built

Database only: nothing on the Discover page uses it until round 3.

- **Switch:** `app_settings.discover_bands` is `["adult"]`. `discover_band(age_group)` maps `18-24` and `25+` to `adult`, `13-15` and `16-17` to themselves. To open a teen band later, add it to that list (the database refuses everything for a band that is off, for creating, joining and later listing).
- **Tables:** `places` (public venues; the street `address` column is not readable by the API, only name, kind, town, coordinates and `serves_alcohol`), `meetup_groups` (`source` host, seed or formed; `starter_people` and `host_label` for starter groups; capacity 3-10; `age_band`; status open, full or cancelled), `meetup_members`, `blocks`, `reports` (queue only the owner reads; `priority` is set for reports about anyone outside the adult band, or for "underage"), `app_settings`. People read only groups they are in; everyone else finds groups through the Discover function (round 3). Writes only through functions.
- **Functions:** `create_group` (the person's band must be on, a real `places` row, start 30 minutes to 30 days ahead, five groups a day; a teen band cannot use a venue that serves alcohol), `join_group` (locks the group so the last spot cannot go to two people; refuses another band, a blocked host or member, a started or cancelled group, and returns `joined`, `already`, `full`, `closed`, `not_found`, `not_allowed` or `rate_limited`), `leave_group` (reopens a full group; a hosted group with nobody left is cancelled, a starter group stays), `block_user`, `unblock_user`, `report_user`.
- **Blocks reach the friend tools:** `profile_by_username`, `send_friend_request` and `list_friends` ignore anyone blocked either way, and a block ends an existing friendship.
- **Starter groups:** `supabase/seed-groups.sql` is the template. A starter group has no host account; `starter_people` is how many organizers the owner knows will be there, and they count toward people in and capacity.
- Tested as adults, a teen, a not-yet-onboarded person and a blocked person: cross-band joins and creating while the switch is off or at an alcohol venue are all refused, and a full group reopens when someone leaves.

## Discover, round 3 (ranking and the page) - built

- **`discover_matches()`** (one database function) returns what the page needs: the groups that pass the filters, each with its score, plus the public places near the viewer. It returns `status: "closed"` when the viewer's age band is switched off and `"needs_location"` when no town is saved, and the page shows a card for each instead of the feed.
- **Filters:** same band as the viewer (and the band is on), within the viewer's distance, open and not started, at least 2 people in counting starter organizers, at least one spot, no blocked host or member. Groups the viewer already joined always show.
- **Score (out of 100):** interests 30 (shared tags 20 or 14, plus up to 10 for how many members share an interest), vibe 15 (four style answers against the members', neutral 9 with nothing to compare), distance 15 (within about 3, 8 or 16 miles), timing 15 (within 3 hours, a day or three days), mutual friends 10 (two friends 10, one 7, a friend of a friend 4), nearly formed 10 (one person from the minimum), newcomer fit 5. The page's "Fits you" is this score; "You fit them" is how many members share an interest, how close the vibe is, and newcomer fit.
- **The bar is a setting:** `app_settings.discover_min_score` (50 for now; the early prototype used 60). Raise it as more groups exist, lower it while an area is quiet. A group that overlaps hours the viewer marked busy is sent down the list, not hidden.
- **Privacy:** strangers in a group arrive as first name, color and only the interests they share with the viewer; they get made-up ids for the page, never profile ids. Distance is a rounded figure from the town centre.
- **Page wiring:** `src/lib/discover-db.ts` turns the function's output into the shape the existing store expects (days, hours in the viewer's time zone, busy blocks from the calendar, members). Joining and leaving call `join_group` and `leave_group`; if the database says no (it filled up, say) the button goes back and the header says why. The safety line "Everyone is verified" now reads "18 and over only", because nothing verifies people yet.
- **Start a group:** "Start your own group" on the page (name, kind, up to three interests, start and length, a public place near you, size up to 10, newcomer-friendly, a line about it) calls `create_group`. With no places set up nearby it says so. Places are added by you through `supabase/seed-groups.sql`.
- **Not built yet:** the real group page (round 4: "Open my group" still goes to the sample page), the teen bands, groups the app forms from the waitlist, and block and report buttons on the page.

## Discover, round 4 (the real group page) - built

- **Who can open it:** only people in the group. `group_page(group)` returns nothing for anyone else, and the page then sends them to Discover, so a link alone shows nothing. It also gives the street address (hidden until you are in), the place, the members and the poll.
- **Members are stand-ins:** each member is shown by a per-group `handle` (a column on `meetup_members`), not their account id. Block, report and "add as friend" take that handle (`block_group_member`, `report_group_member`, `friend_request_group_member`), and the database works out the person. Blocked people are hidden from the blocker's list but still counted in the headcount. Starter organizers are shown as one line, "<label>: N organizers are going".
- **Going:** joining counts as going (`meetup_members.going` defaults to true). `set_group_going` lets someone say "can't make it" or clear it. The status line compares yeses with the group's minimum: "Needs N more people", "N more yeses to lock it in", or "Locked in".
- **The question for the group:** the person who started the group asks one question with two to four different answers (`create_group_poll`; a new question replaces the old one). Members vote once each and can change or take back the vote (`vote_group_poll`). Nobody else can create one.
- **Calendar:** groups you are in show on the calendar grid automatically (kind "group") and open the group page; "Add to my calendar" downloads a calendar file (`/app/groups/<id>/calendar.ics`, members only). The plans' calendar files now share the same builder (`src/utils/ics.ts`).
- **Plans page:** the "groups" view lists the groups you are in (`my_groups`), with a real status ("Needs 1 more yes", "Confirmed"), people, and an open question you have not answered.
- **Chat:** the page says "Group chat is coming soon" instead of showing a chat box that saves nothing. Group chat is the next round.

## Group chat - built

- **Table:** `group_messages` (`seq` is a running number used as the cursor, `kind` message or system, `body` 1 to 500 characters). Nobody reads or writes it directly; `send_group_message` and `group_messages` check membership.
- **Sending:** members only, 40 messages every ten minutes. The text is trimmed, empty and over-long messages are refused, and it is shown as plain text (never as markup).
- **Reading:** `group_messages(group, after)` gives the lines newer than `after` (0 gives the latest 50), leaves out anyone the viewer blocked or who blocked them, names senders by first name, color and the per-group `handle` (never account ids), and marks the group as read for the viewer.
- **System lines:** a trigger on `meetup_members` writes "X started the group", "X joined the group" and "X left the group".
- **"Live":** the browser's session cookie is not readable by page scripts (a security choice), so the page cannot open a Supabase Realtime connection. Instead the page asks for new lines every 4 seconds while the tab is visible, and straight away when the tab comes back. A sent message appears at once as "Sending…" and is replaced by the saved copy. Real Realtime can replace this later through a server-side stream.
- **Plans page:** each group card shows the latest line and the number of unread messages (lines other people wrote after the viewer last opened the chat).

## Discover: quiet areas still show something

- Found while testing a second adult account whose interests matched nothing (sports, volunteering, dance) in a town 8 miles from the test groups: both groups scored about 40, under the bar of 50, so the page showed nothing even though groups existed.
- **Fix:** if no group in reach scores above the bar, the page drops the bar and shows the closest groups with a line saying "Nothing matches your interests yet, so these are the groups closest to you. A good chance to try something new." The quiz does the same as a last step. As soon as one group matches, the bar applies again and the others are counted as "not shown". The scores are unchanged and the bar is still the `discover_min_score` setting.

## Dashboard home - built (no sample data left)

- **One reader:** `readHome` (`src/lib/home-db.ts`) builds the whole page from the person's own plans, friends and calendar. A new account gets empty lists and the page hides any card it cannot fill.
- **Header:** the friends who are free tonight (from the hours friends share on their calendars) and how many plans are cooking (plans you host plus invites you have not answered).
- **Plans with your people:** plans you host, then plans you were invited to and have not turned down. Bubble size follows how close it is to locked in (locked is biggest; otherwise how many have replied). The detail button opens the plan page (host) or the invite (guest).
- **Invites for you:** only unanswered invites. "I'm in", "Maybe" and "Can't" (or Accept and Decline for formal plans) save through `answer_plan`; none starts selected, and the sidebar badge updates.
- **Who's free tonight:** friends whose shared hours show free or maybe tonight, with a button that opens the plan builder with them already picked. The "I'm free tonight" switch was removed: it changed nothing.
- **You + a friend are both free:** the three friends who share the most free time with you this week, in morning, afternoon and evening blocks, with the best window named. The button opens the builder with that friend picked.
- **Hangout budget:** the monthly number you set (`profiles.monthly_budget`, default $100 until you change it; saved by `set_monthly_budget`) and what your plans this month add up to (a typical spend for each plan's budget step). Spending is not tracked, so there is no "spent" line; the group comfort block was removed.
- **Group comfort on the plan page** is now real: `plan_comfort` returns the lowest comfortable spend among invitees, only to the host and only once two or more people have answered, so one person's number is never shown alone. Before that the card says so.
- **Idea stash:** not being built. Its links and "cheaper swaps from your idea stash" text were removed from the plan builder, the Plans page and the plan page.

## Live updates - built (cheap checks, not push)

- **Why not Realtime:** the session cookie is httpOnly, so page scripts cannot read the token a Supabase Realtime connection needs. Opening that up would undo a security protection, so the decision (owner's choice) was patient checking, the same way chat works.
- **Two-step checking** (`src/lib/live.ts`): an open page first asks `live_pulse(kind, id)`, which returns a 32-character fingerprint of what the page shows (a hash of the replies, votes, members, feed and so on, and for chat just the newest line number). Only when the fingerprint changes does the page fetch the full data (`live.plan`, `live.group`, `live.discover`, `live.plans`, or the chat lines). Every kind first checks the caller belongs, and answers null otherwise. Because most checks find nothing new, almost no data moves.
- **Patient:** pages check every 10 seconds; chat every 4. The longer nothing changes the slower it goes (2x after about a minute of quiet, 3x after two, so 30 seconds, and chat 12), and any touch, scroll, key press or returning to the tab snaps it back to the fast rate. Checking pauses while the tab is hidden and stops after 15 minutes without anyone touching the page, resuming on the next touch. After errors it backs off up to 60 seconds. The sidebar badges check every 30 seconds.
- **Plan page (host):** replies, votes, the locked time and the feed update in place. A person or time that was not on the page needs the page rebuilt, so it refreshes itself once the host has stopped typing (`reloadWhenIdle`: no touch for 4 seconds and nothing typed in a field).
- **Group page:** who is going and the question's votes update in place; someone joining or leaving, or a new question, refreshes the page when idle. Chat appends new lines as they arrive.
- **Discover:** the whole feed updates in place (spots open, people, new groups), without disturbing a quiz in progress; the hour is part of its fingerprint so "starting soon" labels stay right.
- **Plans page:** a new invite, a new reply count, a new group or a new chat line refreshes the page once the person is idle.
- **Sidebar and tab bar badges:** the numbers for Plans and Friends stay current on every page.
- **Not live:** the invite pages for guests (`/p`, `/r`), the calendar and the Friends page. They still update on reload.
- **Cost to know:** a check with nothing new is a very small request and answer (a few hundred bytes of data plus normal headers) and one cheap database query, roughly 6 an open-tab minute at the fastest rate and about 2 once quiet. If usage grows, raise the base interval in the `poll` calls.
