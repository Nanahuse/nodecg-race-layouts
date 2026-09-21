import type { ParticipantListData, ParticipantListEntry } from "../../../src/domain";
import type { CSSProperties } from "react";
import { getParticipantLayout } from "./participant-layout";

function EventLabel({ event }: { event: ParticipantListData["event"] }) {
  if (event.logoUrl)
    return (
      <img
        className="participants-event-logo"
        src={event.logoUrl}
        alt={event.shortName ?? event.name}
      />
    );
  return <span>{event.shortName ?? event.name}</span>;
}

function ParticipantCard({
  participant,
  dense,
}: {
  participant: ParticipantListEntry;
  dense: boolean;
}) {
  const speedrunName =
    !dense && participant.speedrunComName && participant.speedrunComName !== participant.displayName
      ? participant.speedrunComName
      : null;
  return (
    <article className="participant-card">
      <strong>{participant.displayName}</strong>
      {speedrunName && <small>{speedrunName}</small>}
      <span className="participant-stats">
        PB {participant.personalBest.time ?? "—"} · {participant.personalBest.rank ?? "—"}
      </span>
    </article>
  );
}

export function ParticipantListGraphic({ data }: { data: ParticipantListData | null }) {
  if (!data) return null;
  const layout = getParticipantLayout(data.participants.length);
  return (
    <main
      className={`participant-graphic density-${layout.density}`}
      style={{ "--columns": layout.columns } as CSSProperties}
    >
      <header className="participant-header">
        <div className="participant-event">
          <EventLabel event={data.event} />
        </div>
        <div className="participant-category">{data.category.name}</div>
        {data.commentators.length > 0 && (
          <div className="participant-commentary">
            COMMENTARY {data.commentators.map((commentator) => commentator.displayName).join(" / ")}
          </div>
        )}
      </header>
      <section className="participant-list" aria-label="Participants">
        {data.participants.map((participant) => (
          <ParticipantCard
            key={participant.racetimeUserId}
            participant={participant}
            dense={layout.density === "extra-dense"}
          />
        ))}
      </section>
    </main>
  );
}
