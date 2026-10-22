// README loop: the chariot turns exactly once on the spot (6 s), the camera
// is still, on the sunny side, 50° west of looking due south (as far round as
// keeps the gate in, decision 0015) so the figure's pointer runs across the
// picture to the gate on the right; it starts and ends side-on, the near wheel showing.
(() => {
  const PRE = 1.0, LAP = 6.0;
  window.__T = { from: PRE, end: PRE + LAP };
  let placed = false;
  window.__shot = (st, P) => {
    if (!placed) {
      placed = true;
      window.__place(0, 0, Math.PI / 4);
      P.app.state.speed = (2 * Math.PI) / LAP / 0.9;
    }
    st.cmd = { fwd: 0, turn: window.__hold ? 0 : -1 }; // held still while rec.mjs waits for the picture to settle
    st.fov = 44;
    st.cam = { pos: [-26.05, 6.5, -21.85], target: [-6.83, 6.3, 1.19] };
    st.dof = false;
  };
})();
