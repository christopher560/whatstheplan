/** Usernames: 3 to 20 lowercase letters, numbers or underscores. */
export const usernamePattern = /^[a-z0-9_]{3,20}$/;

/** Words nobody may take, so no one can pass as the app or its staff. */
export const reservedUsernames = [
  "abuse",
  "admin",
  "administrator",
  "help",
  "mod",
  "moderator",
  "official",
  "root",
  "security",
  "staff",
  "support",
  "system",
  "team",
  "whatstheplan",
];

/** What someone typed, tidied: no leading @, no spaces around it, lowercase. */
export const cleanUsername = (value: string) => value.trim().replace(/^@+/, "").toLowerCase();

/** Why a username can't be used, or null when it looks fine. */
export const usernameProblem = (value: string) => {
  if (!usernamePattern.test(value)) return "Use 3 to 20 letters, numbers or underscores.";
  if (reservedUsernames.includes(value)) return "That username is reserved.";
  return null;
};
