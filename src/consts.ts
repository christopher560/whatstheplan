/** Site name. Appended to every page title and used as `og:site_name`. */
export const SITE_NAME = "whatstheplan";
/** Fallback meta description for pages that don't set their own. */
export const SITE_DESCRIPTION =
  "whatstheplan is a social calendar that helps you plan events with friends, family, school, and work. It also allows you to meet new people safely to have a great experience.";
/** Canonical origin. Resolves canonical URLs, social images, and the sitemap. */
export const SITE_URL = "https://whatstheplan.social/";
/** BCP 47 locale tag used to format dates and numbers. */
export const SITE_LOCALE = "en-US";
/** Routes excluded from search and the sitemap. Surrounding slashes are ignored. */
export const NOINDEX_ROUTES: string[] = ["/404"];
