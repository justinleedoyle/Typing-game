// Relics are the souvenirs Wren brings home from each realm. They aren't
// power-ups in the RPG sense — they're flavor that pays off in the final
// battle, where the composition of the satchel shapes which allies and
// special phrases are available.
//
// Slice 2 introduces the Winter Mountain's two: one per CYOA branch.

export interface Relic {
  id: string;
  name: string;
  realmId: string;
  flavor: string;
}

export const RELICS: Record<string, Relic> = {
  "hunters-horn": {
    id: "hunters-horn",
    name: "The Huntress's Horn",
    realmId: "winter-mountain",
    flavor: "A spiral horn that quiets wolves and warms cold air.",
  },
  "fireflys-lantern": {
    id: "fireflys-lantern",
    name: "The Firefly's Lantern",
    realmId: "winter-mountain",
    flavor: "A paper lantern that holds three tireless fireflies.",
  },
};
