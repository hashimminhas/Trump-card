// Game DOM - extracted verbatim from the Phase 2 build
export const TEMPLATE = `
<div id="fx-layer"></div>

<!-- ================= HOME ================= -->
<div class="screen show" id="screen-home">
  <div class="home-inner">
    <div class="logo">ELECTR<span class="o-core"></span>N<br>CARD</div>
    <div class="tagline">Charge the pile. Hold the Senior seat. Sweep all 52 - or it's a draw.</div>
    <div class="home-actions">
      <button class="btn btn-primary" onclick="startMatch()">New match</button>
      <button class="btn btn-ghost" onclick="showHistory()">Match history</button>
      <button class="btn btn-ghost" onclick="showStats()">Statistics</button>
      <button class="btn btn-ghost" onclick="showRules()">How to play</button>
      <button class="btn btn-ghost" id="btn-exit-account" style="display:none;">← Back to account</button>
    </div>
    <div class="home-card">
      <h3>GAME</h3>
      <div class="setting-row"><span>Trump selection</span>
        <div class="seg" id="trump-seg"><button data-v="random" class="on">Random</button><button data-v="manual">Manual</button></div></div>
      <div class="setting-row"><span>Bot difficulty</span>
        <div class="seg" id="diff-seg"><button data-v="easy">Easy</button><button data-v="normal" class="on">Normal</button><button data-v="hard">Hard</button></div></div>
      <div class="setting-row"><span>Bot thinking time</span>
        <div class="seg" id="speed-seg"><button data-v="1000">1s</button><button data-v="3000" class="on">3s</button><button data-v="5000">5s</button></div></div>
      <div class="setting-row"><span>Your turn timer <span class="dim">(60s)</span></span><button class="toggle on" id="tgl-timer"></button></div>
      <div class="setting-row"><span>Ace restriction rule</span><button class="toggle on" id="tgl-ace"></button></div>
      <div class="setting-row"><span>Sound</span><button class="toggle on" id="tgl-sound"></button></div>
    </div>
    <div class="home-card">
      <h3>ACCESSIBILITY</h3>
      <div class="setting-row"><span>Reduced motion</span><button class="toggle" id="tgl-rm"></button></div>
      <div class="setting-row"><span>Color-blind deck <span class="dim">(♦ blue · ♣ green)</span></span><button class="toggle" id="tgl-cb"></button></div>
      <div class="setting-row"><span>Larger text</span><button class="toggle" id="tgl-lt"></button></div>
      <div class="setting-row dim" style="font-size:11.5px;">Keyboard: ← → select a card · Enter plays</div>
    </div>
    <div class="home-stats" id="home-stats"></div>
  </div>
</div>

<!-- ================= GAME ================= -->
<div class="screen" id="screen-game">
  <div class="hud">
    <span class="chip hud-trump"><span class="dim" style="font-size:10px;letter-spacing:.1em;">TRUMP</span> <span class="glyph" id="hud-trump-g">-</span></span>
    <span class="chip mono" id="hud-round" style="font-size:12px;">R 0/13</span>
    <div class="round-track" id="round-track"></div>
    <div class="hud-spacer"></div>
    <span class="chip khoti-chip live" id="khoti-chip">KHOTI LIVE</span>
    <span class="meter ac"><span class="shape">▲</span>AC <span class="bar"><span class="fill" id="bar-ac" style="width:0%"></span></span><span class="mono" id="cnt-ac">0</span></span>
    <span class="meter bd"><span class="shape">●</span>BD <span class="bar"><span class="fill" id="bar-bd" style="width:0%"></span></span><span class="mono" id="cnt-bd">0</span></span>
    <button class="btn btn-ghost btn-sm" onclick="quitMatch()">Quit</button>
  </div>
  <div class="table-wrap">
    <div class="table-oval"></div>
    <div class="seat seat-C team-ac" id="seat-C">
      <div class="thinking"><span></span><span></span><span></span></div>
      <div class="avatar">C<div class="senior-badge">⚡</div><div class="timer-ring"></div></div>
      <div class="label">C · partner <span class="tag" id="tag-C" style="display:none;"></span></div>
      <div class="cards-left" id="cl-C"></div>
    </div>
    <div class="seat seat-B team-bd" id="seat-B">
      <div class="thinking"><span></span><span></span><span></span></div>
      <div class="avatar">B<div class="senior-badge">⚡</div><div class="timer-ring"></div></div>
      <div class="label">B <span class="tag" id="tag-B" style="display:none;"></span></div>
      <div class="cards-left" id="cl-B"></div>
    </div>
    <div class="seat seat-D team-bd" id="seat-D">
      <div class="thinking"><span></span><span></span><span></span></div>
      <div class="avatar">D<div class="senior-badge">⚡</div><div class="timer-ring"></div></div>
      <div class="label">D <span class="tag" id="tag-D" style="display:none;"></span></div>
      <div class="cards-left" id="cl-D"></div>
    </div>
    <div class="seat seat-A team-ac" id="seat-A">
      <div class="thinking"><span></span><span></span><span></span></div>
      <div class="avatar">A<div class="senior-badge">⚡</div><div class="timer-ring" id="timer-ring"></div></div>
      <div class="label">You <span class="tag" id="tag-A" style="display:none;"></span></div>
    </div>

    <div class="pile-core" id="pile-core">
      <div class="pc-trump"><span class="g" id="pc-trump-g">-</span><span id="pc-trump-n"></span></div>
      <div class="pc-round" id="pc-round">Round - / 13</div>
      <div class="pc-senior" id="pc-senior">Senior: -</div>
      <div class="pc-pile"><span class="count" id="pile-count">0</span><span class="plabel">PILE</span></div>
      <div class="sub" id="pile-sub">no collection yet</div>
      <div class="pc-status" id="pc-status"></div>
    </div>

    <div class="trick-slot slot-A" id="slot-A"></div>
    <div class="trick-slot slot-B" id="slot-B"></div>
    <div class="trick-slot slot-C" id="slot-C"></div>
    <div class="trick-slot slot-D" id="slot-D"></div>
    <div class="banner" id="banner"></div>
    <div class="hand" id="hand"></div>

    <div class="overlay" id="trump-overlay">
      <div class="panel">
        <h2>Choose the trump suit</h2>
        <div class="sub">Decide from your first five cards. Trump holds for the entire match.</div>
        <div class="ts-cards" id="ts-cards"></div>
        <div class="suit-row" id="suit-row"></div>
      </div>
    </div>
    <div class="overlay" id="rules-overlay">
      <div class="panel" style="text-align:left;max-height:80vh;overflow-y:auto;">
        <h2 style="text-align:center;">How to play</h2>
        <div class="sub" style="text-align:center;">Electron Card in five ideas</div>
        <div style="font-size:14px;line-height:1.65;display:flex;flex-direction:column;gap:12px;">
          <p><b style="color:var(--charge)">1 · Tricks.</b> You and partner C face B and D. Thirteen rounds of four cards. Follow the lead suit if you can. Highest trump wins the round; if no trump is played, the highest card of the lead suit wins.</p>
          <p><b style="color:var(--charge)">2 · The Senior seat.</b> The Trump Chooser starts as Senior. Whoever wins a round takes the Senior seat and leads the next round.</p>
          <p><b style="color:var(--charge)">3 · The pile.</b> Won cards aren't yours yet - every round's four cards charge the central pile. From Round 3, if the player who <i>started</i> the round as Senior also <i>wins</i> it, their team banks the entire pile. Rounds 1–2 can never collect.</p>
          <p><b style="color:var(--charge)">4 · Aces.</b> Win a round with an Ace and you can't lead an Ace next round (lifts when a non-Ace lead is played, and never applies from Round 11).</p>
          <p><b style="color:var(--charge)">5 · KHOTI.</b> A team wins only by banking all 52 cards. Any other split - even 48 to 4 - is a draw. Cards stranded in the pile at the end belong to no one.</p>
        </div>
        <div style="text-align:center;margin-top:20px;"><button class="btn btn-primary" onclick="hideRules()">Got it</button></div>
      </div>
    </div>
  </div>
</div>

<!-- ================= SUMMARY ================= -->
<div class="screen" id="screen-summary">
  <div class="sum-panel">
    <div class="sum-result" id="sum-result">DRAW</div>
    <div class="sum-sub" id="sum-sub"></div>
    <div class="sum-scores">
      <div class="score-block ac"><div class="t">▲ TEAM AC</div><div class="v" id="sum-ac">0</div></div>
      <div class="score-block bd"><div class="t">● TEAM BD</div><div class="v" id="sum-bd">0</div></div>
    </div>
    <div class="stranded" id="sum-stranded"></div>
    <div class="col-timeline" id="sum-timeline"></div>
    <div class="insights" id="sum-insights"></div>
    <div class="sum-actions">
      <button class="btn btn-primary" onclick="startMatch()">Play again</button>
      <button class="btn btn-ghost" id="btn-sum-replay">Watch replay</button>
      <button class="btn btn-ghost" id="btn-view-report">Full report</button>
      <button class="btn btn-ghost" onclick="goHome()">Home</button>
    </div>
  </div>
</div>

<!-- ================= HISTORY ================= -->
<div class="screen" id="screen-history">
  <div class="page-head">
    <button class="btn btn-ghost btn-sm" onclick="goHome()">← Home</button>
    <h1>Match history</h1>
  </div>
  <div class="scroll-area" id="history-list"></div>
</div>

<!-- ================= REPORT ================= -->
<div class="screen" id="screen-report">
  <div class="page-head">
    <button class="btn btn-ghost btn-sm" id="btn-report-back">← Back</button>
    <h1>Match report</h1>
    <button class="btn btn-ghost btn-sm" id="btn-report-replay">▶ Watch replay</button>
  </div>
  <div class="scroll-area" id="report-body"></div>
</div>

<!-- ================= STATS ================= -->
<div class="screen" id="screen-stats">
  <div class="page-head">
    <button class="btn btn-ghost btn-sm" onclick="goHome()">← Home</button>
    <h1>Statistics</h1>
  </div>
  <div class="scroll-area" id="stats-body"></div>
</div>

<!-- ================= REPLAY ================= -->
<div class="screen" id="screen-replay">
  <div class="rp-stage" id="rp-stage">
    <div class="rp-banner" id="rp-banner">Replay</div>
    <div class="pile-core" id="rp-core">
      <div class="pc-trump"><span class="g" id="rp-trump-g">-</span><span id="rp-trump-n"></span></div>
      <div class="pc-round" id="rp-round">Round - / 13</div>
      <div class="pc-senior" id="rp-lead">Lead: -</div>
      <div class="pc-pile"><span class="count" id="rp-pile">0</span><span class="plabel">PILE</span></div>
    </div>
    <div class="rp-slot rp-A" id="rp-slot-A"><span class="who">A</span></div>
    <div class="rp-slot rp-B" id="rp-slot-B"><span class="who">B</span></div>
    <div class="rp-slot rp-C" id="rp-slot-C"><span class="who">C</span></div>
    <div class="rp-slot rp-D" id="rp-slot-D"><span class="who">D</span></div>
    <div class="rp-totals"><span class="ac">▲ AC <b id="rp-ac">0</b></span><span class="bd">● BD <b id="rp-bd">0</b></span></div>
  </div>
  <div class="rp-controls">
    <button class="btn btn-ghost btn-sm" id="rp-exit">✕ Exit</button>
    <button class="btn btn-ghost btn-sm" id="rp-prev">⏮ Prev</button>
    <button class="btn btn-primary btn-sm" id="rp-play" style="min-width:88px;">▶ Play</button>
    <button class="btn btn-ghost btn-sm" id="rp-next">Next ⏭</button>
    <span class="rinfo" id="rp-info">R 1/13</span>
    <div class="seg" id="rp-speed"><button data-v="1" class="on">×1</button><button data-v="2">×2</button><button data-v="4">×4</button></div>
  </div>
</div>

`;
