export interface HomecomingLine {
  speaker: string | null;
  text: string;
}

/** Resolve only the promise actually made in the opening. Old saves without
 * an identity get a family-neutral return, rather than an invented sibling. */
export function homecomingLines(gender: "boy" | "girl" | null): readonly HomecomingLine[] {
  const arrival: HomecomingLine = {
    speaker: null,
    text: "Holdfast is quiet. Wren steps back into the lamplit study. This time, the quiet feels like home.",
  };
  const sibling: HomecomingLine = gender === "boy"
    ? { speaker: "Saga", text: "Saga is waiting by the door. Wren unfolds her drawing and lays it beside the Almanac. “You kept it,” she says. Then she is across the room, both arms around Wren." }
    : gender === "girl"
      ? { speaker: "Magnus", text: "Magnus is still by the door, just as he promised. The joke he was ready to make disappears. “You're here.” Wren nods, and he pulls Wren into a hug." }
      : { speaker: null, text: "Someone has kept the study lamp burning. Wren sets the Almanac on the desk and takes a long, steady breath. The journey has brought Wren home." };
  return [arrival, sibling, {
    speaker: "Runa",
    text: "Runa closes the Almanac gently. “Enough words for tonight.” Beyond the window, Holdfast begins to wake.",
  }];
}
