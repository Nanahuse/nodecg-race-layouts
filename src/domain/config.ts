import type {
  CategoryPresentation,
  CategorySelectionState,
  SpeedrunCategorySelection,
} from "./category";
import type { PlayerId } from "./ids";
import type { ActiveRaceParticipant, DraftRaceParticipant } from "./participant";
import type { DraftPlayer, PlayerMapping } from "./player";
import type { RaceReference } from "./race";
import type { ActiveRaceScreenSlots, DraftRaceScreenSlots } from "./race-screen";

/**
 * Draft config: the editable working state. It may contain unresolved player
 * identities and unset slots.
 */
export type DraftConfig = {
  revision: number;

  race: RaceReference | null;

  participants: DraftRaceParticipant[];

  players: Record<PlayerId, DraftPlayer>;

  raceScreenSlots: DraftRaceScreenSlots;

  commentatorPlayerIds: PlayerId[];

  categorySelection: CategorySelectionState;

  categoryPresentation: CategoryPresentation | null;
};

/**
 * Active config: the complete state that can be applied to broadcast. Unresolved
 * identities, a missing race, a missing category selection are impossible by
 * construction. Race screen positions may intentionally remain unassigned.
 */
export type ActiveConfig = {
  revision: number;

  race: RaceReference;

  participants: ActiveRaceParticipant[];

  players: Record<PlayerId, PlayerMapping>;

  raceScreenSlots: ActiveRaceScreenSlots;

  commentatorPlayerIds: PlayerId[];

  categorySelection: SpeedrunCategorySelection;

  categoryPresentation: CategoryPresentation | null;
};
