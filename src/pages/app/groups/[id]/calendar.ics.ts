import type { APIRoute } from "astro";
import { z } from "astro/zod";
import { icsFile, icsResponse } from "@/utils/ics.ts";

/* A group's time as a calendar file. Only people in the group get one: it is read through `group_page`. */
export const prerender = false;

type Json = {
  group: { id: string; title: string; purpose: string; startsAt: string; endsAt: string };
  place: { name: string; address: string; town: string };
};

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user || !z.uuid().safeParse(params.id).success) return new Response("Not found", { status: 404 });
  const { data } = await locals.supabase.rpc("group_page", { p_group: params.id });
  const json = data as Json | null;
  if (!json) return new Response("Not found", { status: 404 });
  return icsResponse(
    icsFile({
      uid: json.group.id,
      title: json.group.title,
      start: new Date(json.group.startsAt),
      end: new Date(json.group.endsAt),
      place: [json.place.name, json.place.address || json.place.town].filter(Boolean).join(", "),
      description: json.group.purpose,
    }),
    "group",
  );
};
