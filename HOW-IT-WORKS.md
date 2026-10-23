# How the backend works

This file explains, in plain words, how each important part of whatstheplan works
behind the scenes. It is for understanding the site, not for building it. The
technical notes for building live in `SUPABASE.md`; this file says what happens
and why.

**Contents**

1. [The big picture](#1-the-big-picture)
2. [Discover](#2-discover) (the longest section)
3. [Sign up, log in and staying signed in](#3-sign-up-log-in-and-staying-signed-in)
4. [Your profile, onboarding and account page](#4-your-profile-onboarding-and-account-page)
5. [The calendar](#5-the-calendar)
6. [Friends](#6-friends)
7. [Plans, invites and guests](#7-plans-invites-and-guests)
8. [Security: what keeps people's data safe](#8-security-what-keeps-peoples-data-safe)
9. [What is not built yet](#9-what-is-not-built-yet)
10. [Where things live, and settings you can change](#10-where-things-live-and-settings-you-can-change)

---

## 1. The big picture

Every action on the site passes through three layers. Knowing them makes the rest
of this file easy.

| Layer | What it is | Its job |
| --- | --- | --- |
| **The page** | Astro pages and the small scripts on them, running in the visitor's browser | Shows things and collects clicks. It is **not trusted**: anyone can open their browser tools and change what a page sends. |
| **Actions** | Server code on Vercel (`src/actions/index.ts`) | Receives what the page sends, checks the shape of it, and passes it on. Also not the last line of defence. |
| **The database** | Supabase (Postgres) | Holds all the data **and makes the final decision**. It decides who may see what and what is allowed, using row level security and small functions. |

**The rule that matters most:** the database enforces every important rule (who
you are, who can see a plan, whether a group is full, whether someone is blocked).
The page and the actions only help. So even if someone bypasses the page, the
database still says no.

### The journey of one click

Take "I'm in" on a plan invite:

1. You click the button. A small script on the page sends the choice to an **action**.
2. The action checks the request is well formed, and that you are signed in.
3. It calls a **database function** (`answer_plan`) *as you*. The database knows who
   you are from your session, not from anything the page says.
4. The function checks the invite really is yours, saves your answer, and writes a
   line to the plan's activity feed.
5. The page updates. If the database said no, the button goes back and a message says why.

### Three words you will see

- **Row level security (RLS):** rules inside the database that decide which rows a
  person may read. If you are not allowed to see a row, the database acts as if it
  does not exist.
- **Database function:** a small program stored in the database. Our important
  actions (join a group, send a friend request, save availability) are functions,
  so the rules cannot be skipped.
- **Rate limit:** a cap on how often someone can do something (for example five
  password guesses every fifteen minutes), so a script cannot hammer the site.

### Who the site thinks you are

A signed-in person has a **session**, stored in a cookie in their browser. On every
page that depends on you, the server (the *middleware*, `src/middleware.ts`) asks
Supabase "is this session real?" and loads your first name, color and username.
That is how the sidebar knows your name. Pages for signed-in people are never
cached or shared.

---

## 2. Discover

Discover is how someone meets **new people nearby**, as opposed to Plans, which is
for people you already know. It matches a person with small groups that meet in
public places.

### The idea in one paragraph

A group is a small meetup (3 to 10 people) at a public place at a set time: a board
game afternoon at a library, a walk in a park. Anyone aged 18 or over who has saved
their town can see groups near them, ranked by how well each one suits them, and
can join one. They can also start their own. Everything about who can see what is
decided by the database.

### The pieces

| Piece | What it holds or does |
| --- | --- |
| **Your town** | A ZIP code turned into the town's approximate centre, plus a distance setting (5, 10 or 25 miles). Saved on your profile. |
| **Places** | A list of public venues (name, kind, town, coordinates, whether it serves alcohol). A group can only be held at a place on this list. |
| **Groups** | One row per meetup: name, kind, interests, time, place, size, who started it, which age band it is for. |
| **Members** | Who is in each group. |
| **Blocks and reports** | People can block someone or report them. |
| **Settings** | Two switches in a small settings table: which age bands may use Discover, and the lowest score a group needs to be shown. |

### Step by step: from signing up to joining a group

**Step 1: you say your age group.** During onboarding you pick one of five age
groups. Under 13 is not accepted at all. This answer decides your **age band**:

| You said | Your band |
| --- | --- |
| 13 to 15 | `13-15` |
| 16 to 17 | `16-17` |
| 18 to 24, or 25 and up | `adult` |

You only ever meet people in your own band. Nobody sees across a band, and the
database refuses a join across bands even if someone tries to force it.

**Step 2: the switch.** A setting called `discover_bands` lists which bands may use
Discover. Right now it is **adults only**. If you are in a band that is switched
off, opening Discover shows a card saying it is not open for your age group yet.
Friends, plans and the calendar work for everyone. Turning teens on later means
changing that one setting, plus deciding on an age check (see section 9).

**Step 3: you save your town.** On the account page, "Your town" takes a ZIP code.
The server looks up the ZIP's centre and the database stores it rounded to about a
kilometre. We keep **only the town**, never where you are right now. If you open
Discover without a saved town, you see a card with a button to set it.

**Step 4: you open Discover.** The page asks the database for your matches with one
call (`discover_matches`). The database works in two stages.

*Stage A, the filters.* A group is dropped entirely if any of these is true:

- it is in a different age band, or your band is switched off;
- it is farther away than your distance setting;
- it has already started, or starts more than 7 days from now;
- it is full;
- fewer than 2 people are in it (organizers count). This is on purpose, so nobody
  turns up to meet one stranger alone;
- the person who started it, or anyone in it, is someone you blocked or who blocked you.

Groups you already joined always show, so you can find them again.

*Stage B, the score.* Every group that passes gets a score out of 100:

| Part | Points | What it measures |
| --- | --- | --- |
| Interests | 30 | Shared interests with the group (up to 20), plus up to 10 for how many members share an interest with you. |
| Vibe | 15 | Your four style answers (energy, pace, planning, warm-up) against the members' average. The closer, the more points. With nobody to compare, a neutral 9. |
| Distance | 15 | Within about 3 miles gets the most, then roughly 8, then 16, then less. |
| Timing | 15 | Sooner scores higher: within 3 hours, a day, or three days. |
| Mutual friends | 10 | Two people in it who are your friends: 10. One: 7. A friend of a friend: 4. |
| Nearly formed | 10 | A group one person short of its minimum gets the most, because joining makes it happen. |
| Newcomer fit | 5 | Groups that welcome new people, a little more if you said you like groups that go easy on newcomers. |

Groups under the **minimum score** (50 for now) are hidden, and the page says how
many were hidden. There is one exception: if *nothing* near you reaches that score
(a quiet area, or nothing matches your interests yet), the page shows the closest
groups anyway, with a line saying so, so you never open Discover to an empty page. A group that overlaps hours you marked busy on your calendar is
**sent down the list**, not hidden, and the page says so.

The page shows two numbers on each group. "Fits you" is the score above. "You fit
them" is separate: how many members share an interest with you, how close the vibe
is, and whether the group suits where you are as a newcomer.

**Step 5: you look around.** There are two ways:

- **The quiz.** It asks what you feel like, when, and how big. It tries your exact
  answers first. If nothing matches, it loosens one answer at a time (size, then
  activity, then time) and tells you what it had to loosen.
- **The feed.** Every matching group, with filters for activity, day, "starting
  soon", and size, plus a week view.

**Step 6: you join.** "Join this group" calls `join_group`. The database:

1. checks you are in the right band and that band is switched on;
2. **locks that group's row** so nobody else can change it at the same moment;
3. checks it has not started or been cancelled, you are not already in, and
   nobody in it is blocked either way;
4. counts the people, including starter organizers, and only adds you if there is
   room;
5. marks the group **full** if you took the last spot.

The lock is what stops two people taking the last spot together. If you lose the
race, the button goes back and the header says "That group just filled up."
Leaving removes you, reopens a full group, and cancels a hosted group if nobody is
left. A starter group stays open.

**Step 7: you start your own group (optional).** "Start your own group" asks for a
name, a kind of group, up to three interests (these help match people), a start
time and length, a public place from the list near you, a size up to 10, and
whether newcomers are welcome. The database checks it again: your band must be on,
the place must be on the places list, the start must be between half an hour and 30
days away, and you can start at most five groups a day. You become the first member.

**On the cards:** a group you are in shows an "Open group" button and a "Leave
group" button, and clicking anywhere else on that card opens the group page too.
A place in your own town reads "Right nearby" instead of "0.0 mi".

### Where groups come from

- **People start them** (adults, at launch).
- **You seed starter groups** so the page is never empty. A starter group has no
  host account; it lists how many organizers you know will be there, and they count
  toward the "at least 2 people" rule. You fill in a template
  (`supabase/seed-groups.sql`) with real places and groups, and they are loaded for you.
- **Groups the app forms itself** from people who asked to be told about new groups
  is planned for later.

### What other people can and cannot see about you

A stranger in a group sees only your **first name, your color, and the interests
you share with the person looking**. They never see your profile, your age, your
town, your calendar or your username. On the page, strangers get made-up ids, not
real ones. Distance is shown as a rounded figure from the centre of your town.
The venue's street address is not available to the page at all.

### Safety tools

- **Block:** hides you and the other person from each other in Discover, in friend
  search and in friend lists, and ends any friendship between you.
- **Report:** goes to a queue only the site owner can read. A report about anyone
  outside the adult band, or a report for "underage", is marked **priority**.
- **Public places only:** a group can only be held at a place on the list. When
  teens are switched on later, they will not be allowed at venues that serve alcohol.
- The line "Everyone is verified" was removed, because nothing verifies people yet.
  Age is **self-reported**, and the page says "18 and over only", not "verified".

### The group page

Once you join, "Open my group" takes you to the group's page. Only people in the
group can open it; anyone else is sent back to Discover, so a link alone shows
nothing. It has:

- **The plan:** who is going ("3 of 4 going"), what it is, where (the street
  address appears only now that you are in), and when, with a downloadable
  calendar file. Groups you are in also show on your calendar automatically.
- **Your answer:** "I'm going" or "Can't make it". Joining counts as going. The
  status at the top compares yeses with the group's minimum: "Needs 1 more
  person", "2 more yeses to lock it in", or "Locked in".
- **A question for the group:** the person who started the group can ask one
  question with two to four answers ("Where do we meet?"). Everyone votes once
  and can change or take back their vote.
- **Members:** first name and color. Each person has a "stand-in id" for the page,
  so you can add someone as a friend, block them, or report them without the page
  ever holding their account id. Someone you block disappears from your list but
  still counts in the headcount.
- **Leave:** one tap, with an undo (the undo fails if someone took your spot).

- **Chat:** text only, up to 500 characters a message. Joining, starting or
  leaving a group adds a line ("Sam joined the group"). New messages appear within
  about 4 seconds while the page is open (the page asks for new lines; it does not
  hold a live connection yet). A message you send shows at once as "Sending…". People
  you blocked, or who blocked you, never appear in your chat. The Plans page shows
  each group's latest line and how many you have not read.

### Limits to know about

- Nothing shows until you add real places and starter groups.
- Because age is self-reported, an adult could claim to be 16. That is the main
  reason teen Discover waits for an age check.

---

## 3. Sign up, log in and staying signed in

**What you see:** two separate pages, `/signup` and `/login`.

**Sign up.**
1. You enter an email and a password (8 to 72 characters).
2. A hCaptcha box proves you are a person. Supabase checks the captcha itself.
3. Supabase creates the account and sends a **6-digit code** to your email. The email
   is sent through Resend (our email service), because Supabase's built-in email is
   limited to a couple of messages an hour.
4. You type the code. That confirms the email and signs you in.
5. A profile row is created for you automatically, so every account has one.

**Log in.** Email and password, plus the captcha. If your email was never
confirmed, the page asks for a code instead of failing with a confusing message.

**Forgot password.** Enter your email, get a 6-digit code, enter it, choose a new
password. For privacy the page says the same thing whether or not an account
exists, so nobody can use it to find out who has an account.

**Staying signed in.** After login your browser holds a session cookie. We mark it
**httpOnly** (page scripts cannot read it), **SameSite=Lax**, and **Secure** on the
real site. Every page that depends on you sends that cookie, and the server checks
it with Supabase each time rather than trusting it blindly.

**Who can see what:**
- Signed-out visitors who open `/app/...` are sent to `/login`, and back to where
  they were after logging in.
- Signed-in people who open `/login` or `/signup` are sent into the app.
- If you have not finished onboarding, every app page sends you to onboarding first.

**Logging out** ends the session. **Deleting your account** (account page) asks you
to confirm, then a database function deletes your account, and everything tied to it goes with
it: your profile, the plans you host, your friendships, your replies and your group
memberships. A Discover group you started stays open for the others, with no host.
Then you are signed out.

---

## 4. Your profile, onboarding and account page

**What is stored.** One row per person in `profiles`: first name, avatar color, age
group, area, interests, four style answers, activity types, when you are free, group
size preference, who can find you, your username, your saved town, and a few flags.
Avatars are an initial on a color; there are no profile pictures.

**Onboarding.** A multi-step flow. Each step **saves as you go** with a "step
number", so closing the tab and coming back resumes where you stopped. Finishing
requires a complete profile (name, age group, area, at least 3 interests, all four
style answers, at least one activity and one time you are free, and agreeing to the
community guidelines). The server checks all of this again, not just the page.
Finishing also creates your **@username**, which is how friends add you.

**The account page.**
- **Save changes** writes your answers again, with the same checks.
- **Username:** as you type, the page checks (after a short pause) if the name is
  taken. A set of words is reserved. The name must be 3 to 20 letters, numbers or
  underscores. Changing it changes your add-friend link, so the page says so.
- **Password:** you must type your **current** password first. The check runs in
  the database (limited to five tries every fifteen minutes), so a borrowed session
  cannot change it.
- **Your town:** see Discover above.
- **Delete account:** described in section 3.

**Limits placed on what you type.** Lists like interests have a cap on how many
items and how long each can be, enforced in the database, so nobody can store huge
amounts of junk.

---

## 5. The calendar

**What it is.** A weekly grid where you paint the hours you are **free** or
**busy** from 8 AM to 11 PM. Friends can see only free or busy, never what you are doing.

**Saving.** Each week you edit is saved as a unit by a database function
(`save_availability_week`). It replaces that week's hours in one step, so you never
end up half-saved. A week you cleared on purpose is remembered as "saved but empty"
(a small marker table), so it does not snap back to your habit on reload. The
function refuses weeks too far in the past or the future, and limits how often you
can save.

**Weeks you never painted** start from your most recent painted week, so a habit
carries forward without extra work.

**Sharing.** A switch, "share my calendar", controls whether friends can see your
free hours at all. When on, a friend sees only a list of free time slots for each
week (`friend_free_slots`), not your busy hours and not your plans.

**Plans on the grid.** Plans you host, plans with a locked time, and plans you added
to your calendar yourself show on the grid. Plans you said you cannot make stay off.

**Friend overlap.** Pick friends and the grid shows the hours you are both free, so
you can plan around it.

---

## 6. Friends

**How people find each other.** Only by **exact username** or by a personal link,
`/add/<username>`. There is no browsing or searching the list of users, so nobody
can scroll through people. Looking up a username is limited to 60 tries every ten
minutes, so names cannot be collected by guessing.

**Sending a request.** From the Friends page, or by opening someone's link while
signed in. The database function checks: you are signed in, you are not over the
limit (30 requests an hour, 50 waiting at once), the person exists, it is not you,
you are not blocked either way, and there is no earlier request. If *they* already
asked *you*, sending one back simply makes you friends. The page only ever learns
the outcome (sent, already friends, not found), never anything more about the person.

**Accepting or declining.** Requests appear on the Friends page and as a number
badge on the sidebar and phone tab bar. Accepting makes you friends. The badge drops
as you answer.

**What you can do with a friend.** Mark favorites, add **private labels** (only you
ever see them), choose an **inner circle** of up to six, and see their free or busy
hours if they share their calendar. Each friend row shows only a free/busy flag.

**Blocking** ends a friendship and hides you from each other.

---

## 7. Plans, invites and guests

A **plan** is something you organize with people you already know: a hangout, a
dinner, a study group. Friends with the app reply inside the app; people without
the app reply through a link.

### Creating a plan

The home page builder walks through type, vibe, budget, who is coming, then the
details. You pick **a start time first** (required except for hangouts), and can
add nearby times as one-tap options (an hour earlier, an hour later, and so on, up
to five times in all). Friends you pick are added directly; people without the app
are added **by name** and get the link.

The database function `create_plan` checks that everyone you invited is really your
friend, caps the number of people and times, limits you to 20 plans an hour, saves
the plan with a long, unguessable link name, adds you as host with your own time
already voted for, and writes the first line of the activity feed.

### Who sees what

Only people in a plan can read it. The host's page shows who replied, who voted for
what, the feed, and controls. Other people in the plan do not see each other's
private answers (for example, how much each person is comfortable spending).

### The invite link, `/p/<slug>`

Anyone with the link can open it, no account needed. It shows the plan, who is
going (first names and colors only), the host's updates, and a short step-by-step
reply:

1. **Reply:** I'm in, maybe, or can't make it.
2. **Your name** (skipped if you are signed in).
3. **Times:** tap every time that works. The host's pick starts selected.
4. **Budget or guests**, depending on the kind of plan.
5. **Done:** a summary and your personal link.

**Guests get their own link, `/r/<token>`.** When a guest replies, the database
creates a long random token (about 240 bits, impossible to guess) and returns a
link containing it. That link is their key: it lets them reopen their reply and
change it. Nobody else can read the token, not even the host. A guest who types a
name the host already added takes that spot.

**Signed-in people** who open the link reply as themselves, and the plan appears
in their Plans page. The host never replies to their own plan; opening the link
takes them to the plan page instead.

**Limits** keep guest replies from being abused: a plan holds at most 60 people and
accepts at most 30 new guests an hour.

### Times, voting and locking

Each time is stored as an exact moment, plus the host's time zone, so everyone
reads the same clock time. The host sees how many people voted for each time and
who, with a tag on the leader. The **host decides**: tapping "Lock this in" fixes
one time (it does not have to be the leader), changes the plan to "locked in", and
writes a line to the feed. Nothing locks automatically.

### Updates and the activity feed

The host can send quick updates ("Running 10 minutes late", "Small change of
plans, details soon") or write their own, up to 120 characters. They are saved in
the plan's feed and appear on the invite page for everyone. Replies, notes about
times, and locks appear in the host's feed too.

### Add to calendar

- **People with an account** get "Add to my calendar", which puts the plan on their
  calendar grid inside the app (a small private table remembers it).
- **Guests without an account** get a downloadable calendar file for their phone's
  calendar. Before a time is locked it is marked tentative ("Time not locked in yet").

### Friends and accounts from an invite

- A signed-in person in the plan can send the **host** a friend request from the
  invite page.
- The **host** sees "Add friend" next to anyone in the plan who has an account and is
  not already a friend. Guests without accounts show as "Guest, no account".
- A guest who has an account can **link their guest reply to it**: the reply, votes
  and feed entries move to their account and the old link stops working.

### The Plans page

Three views: plans you are invited to (with a badge counting the ones you have not
answered), plans you host (with how many replied), and plans you are going to.

---

**The home page.** Everything on it comes from your own account: friends free
tonight, your plans (bigger bubble = closer to locked in), invites you have not
answered (your answer is saved and the sidebar badge updates), when you and each
friend are both free this week, and your monthly hangout budget (you set the number;
"planned" adds up your plans for the month). A new account sees an almost empty page
with the plan builder at the top.

## 8. Security: what keeps people's data safe

These protections are shared by every feature above.

- **Nothing is open by default.** Every table has row level security on, and the
  public (signed-out) role can touch nothing in our data. New tables start closed.
- **Writes go through functions.** People cannot insert or edit rows directly in
  the sensitive tables (plans, groups, availability, friend settings). The
  functions check who you are, what you are allowed to do, and how often.
- **Rate limits** on the actions that could be abused: password checks, friend
  requests, username lookups, joining groups, saving weeks, creating plans and
  groups, ZIP lookups, reports.
- **Private fields stay private.** Guest tokens, each person's comfortable spend,
  saved locations, and the reports queue are not readable by the page at all.
- **Cookies** are httpOnly, SameSite and Secure. The browser never needs to read them.
- **Page protections** (`vercel.json`): a content security policy that only allows
  our own code plus hCaptcha, no embedding the site in other pages, forced HTTPS,
  and limits on browser features like camera and location.
- **Escaping.** Data placed inside a page is escaped so stored text cannot break
  out and run as code.
- **Secrets stay out of the code.** API keys live in environment settings, not in
  files that are committed (`.env` files are ignored by git).
- **Known and accepted:** a build-time warning in a dependency of the Vercel
  adapter (it only affects how routes are built, not live visitors).
- **To check in the Supabase dashboard:** a minimum password length of 8 or more,
  CAPTCHA on, and sign-in redirect addresses limited to the real site.

---

## 9. What is not built yet

| Not built | What it will do |
| --- | --- |
| Live updates | Replies, votes and spots appear without reloading. (Chat already refreshes every few seconds.) |
| Email nudges and reminders | The Nudge and auto-nudge buttons do nothing yet. Emails would go through Resend; texts need a paid text-message service. |
| Teen Discover | 13 to 15 and 16 to 17 meeting only their own band. Waits for an age check (school email or parent consent) and a legal review. |
| Groups the app forms | The app grouping people from a waitlist who share interests and free hours. |

---

## 10. Where things live, and settings you can change

### Where to look

| Thing | Where |
| --- | --- |
| Pages | `src/pages/` (`app/` is the signed-in area, `p/` and `r/` are public invites) |
| Actions (what the page can ask the server) | `src/actions/index.ts` |
| Reading data for pages | `src/lib/*-db.ts` (for example `discover-db.ts`, `plans-db.ts`) |
| Calls the browser makes | `src/lib/*-repo.ts` |
| The database rules and functions | the migrations applied to Supabase; described in `SUPABASE.md` |
| Starter groups | `supabase/seed-groups.sql` |
| Security headers | `vercel.json` |

### Settings you can change (in the Supabase SQL editor)

- **Lowest score for Discover** (default 50):
  `update app_settings set value = '60' where key = 'discover_min_score';`
  Higher shows fewer, better groups. Lower shows more while an area is quiet.
- **Which age bands can use Discover** (default adults only):
  `update app_settings set value = '["adult"]' where key = 'discover_bands';`
  Add `"16-17"` or `"13-15"` only after you have decided on an age check and checked
  the legal side.
- **Add places and starter groups:** fill in `supabase/seed-groups.sql` and run it.
