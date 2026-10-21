// README loop: the chariot turns exactly once on the spot (6 s), the camera
// is still; the gate on the left, the figure's hand on it all the way round.
(() => {
  const PRE = 1.0, LAP = 6.0;
  window.__T = { from: PRE, end: PRE + LAP };
  let placed = false;
  window.__shot = (st, P) => {
    if (!placed) {
      placed = true;
      window.__place(0, 0, Math.PI / 2 + 0.3);
      P.app.state.speed = (2 * Math.PI) / LAP / 0.9;
    }
    st.cmd = { fwd: 0, turn: -1 };
    st.fov = 38;
    st.cam = { pos: [20, 9.5, -20], target: [0.5, 6.4, 8.6] };
    st.dof = false;
  };
})();
