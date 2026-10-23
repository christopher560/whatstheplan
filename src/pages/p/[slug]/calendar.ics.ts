import type { APIRoute } from "astro";
import { icsFile, icsResponse } from "@/utils/ics.ts";

/* The locked time of a plan as a calendar file, for the invite page's "Add to calendar". */
export const prerender = false;

type Json = {
  plan: { title: string; description: string; place: string; slug: string; locked: string | null };
  slots: { id: string; at: string; pos: number }[];
};

export const GET: APIRoute = async ({ params, locals }) => {
  const slug = params.slug ?? "";
  if (!/^[a-z0-9-]{8,80}$/.test(slug)) return new Response("Not found", { status: 404 });

  const { data } = await locals.supabase.rpc("public_invite", { p_slug: slug });
  const json = data as Json | null;
  const slot = json?.slots.find((item) => item.id === json.plan.locked) ?? json?.slots.find((item) => item.pos === 0) ?? json?.slots[0];
  if (!json || !slot) return new Response("No time has been picked yet.", { status: 404 });
  const tentative = json.plan.locked !== slot.id;

  return icsResponse(
    icsFile({
      uid: slot.id,
      title: json.plan.title,
      start: new Date(slot.at),
      end: new Date(new Date(slot.at).getTime() + 2 * 60 * 60 * 1000),
      place: json.plan.place || undefined,
      description: json.plan.description || undefined,
      tentative,
    }),
    slug,
  );
};
