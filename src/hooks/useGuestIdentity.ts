import { useEffect, useState } from "react";

const KEY = "opentube:guest-identity";

const ANIMALS = [
  "Ocelot", "Lynx", "Fox", "Otter", "Owl", "Falcon", "Panda",
  "Wolf", "Raven", "Heron", "Cobra", "Kite", "Hare", "Bison",
];
const COLORS = [
  "oklch(0.62 0.22 25)", "oklch(0.65 0.2 145)", "oklch(0.6 0.2 260)",
  "oklch(0.68 0.18 200)", "oklch(0.7 0.2 60)", "oklch(0.6 0.22 320)",
];

export type GuestIdentity = {
  alias: string;
  initials: string;
  color: string;
  createdAt: number;
};

function generate(): GuestIdentity {
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  const number = Math.floor(1000 + Math.random() * 9000);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];
  const alias = `Anon-${animal}-${number}`;
  return {
    alias,
    initials: `A${animal[0]}`,
    color,
    createdAt: Date.now(),
  };
}

export function useGuestIdentity(): GuestIdentity {
  const [identity, setIdentity] = useState<GuestIdentity>(() => {
    if (typeof window === "undefined") {
      return { alias: "Anon-Node", initials: "AN", color: COLORS[0], createdAt: 0 };
    }
    try {
      const raw = window.sessionStorage.getItem(KEY);
      if (raw) return JSON.parse(raw) as GuestIdentity;
    } catch {}
    const g = generate();
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(g));
    } catch {}
    return g;
  });

  useEffect(() => {
    try {
      window.sessionStorage.setItem(KEY, JSON.stringify(identity));
    } catch {}
  }, [identity]);

  return identity;
}

export function clearGuestIdentity() {
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {}
}
