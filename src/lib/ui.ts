import type { AccentColor } from "@/types.ts";

/** Small DOM helpers for components that draw from `<template>` markup. */

const accents: AccentColor[] = ["red", "orange", "yellow", "green", "blue", "purple", "pink"];

/** Swaps the accent class (the colors `Avatar`, `Pill` and `Panel` share). */
export const setAccent = (element: Element, color?: AccentColor) => {
  element.classList.remove(...accents);
  if (color) element.classList.add(color);
};

/** A fresh copy of a template's first element. */
export const cloneFirst = <T extends HTMLElement = HTMLElement>(
  template: HTMLTemplateElement,
) => template.content.firstElementChild!.cloneNode(true) as T;

/** Sets the text of the first match inside `root`. */
export const setText = (root: ParentNode, selector: string, text: string) => {
  const target = root.querySelector<HTMLElement>(selector);
  if (target) target.textContent = text;
};

/** An avatar span that matches `Avatar.astro`: an initial on an accent color. */
export const avatarElement = (name: string, color: AccentColor, size = "small") => {
  const avatar = document.createElement("span");
  avatar.className = `avatar_wrap ${size} ${color}`;
  avatar.textContent = name.charAt(0).toUpperCase();
  return avatar;
};

/** Pushes the stroke path into a `PathIcon` clone. */
export const setIconPath = (root: ParentNode, d: string) =>
  root.querySelector<SVGPathElement>("[data-path]")?.setAttribute("d", d);
