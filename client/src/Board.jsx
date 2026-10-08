export function Board({ state, show }) {
  const animating = show && show.phase !== 'done';
  // Hide the cells of a draw that is still spinning on stage, so the board never spoils it.
  const hidden = animating ? new Set(show.teamNumbers) : null;
  const fresh = show?.phase === 'done' ? new Set(show.teamNumbers) : null;
  const highlight = animating ? (show.mode === 'spin' ? show.teamNumbers[0] : null) : state.mode === 'spin' ? state.currentTeam : null;

  return (
    <section className="board-wrap" aria-label="Teams">
      <ol className="board">
        {state.teams.map(team => (
          <li key={team.number} className={team.number === highlight ? 'team current' : 'team'}>
            <span className="team-no">
              <span className="sr-only">Team </span>
              {team.number}
            </span>
            <dl>
              {state.categories.map(c => {
                const isOnStage = c.key === show?.category;
                const masked = isOnStage && hidden?.has(team.number);
                const isFresh = isOnStage && fresh?.has(team.number);
                const name = masked ? null : team.players[c.key];
                return (
                  <div key={c.key} className={isFresh ? 'fresh' : undefined} style={isFresh ? { animationDelay: `${(team.number - show.teamNumbers[0]) * 90}ms` } : undefined}>
                    <dt>{c.label.length > 1 ? <abbr title={c.label}>{c.label[0]}</abbr> : c.label}</dt>
                    <dd>{masked ? '???' : (name ?? '—')}</dd>
                  </div>
                );
              })}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}
