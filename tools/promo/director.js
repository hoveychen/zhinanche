// Runs in the page (?promo). Pins the set in the world, takes the camera and
// the driving away from the app, and calls window.__shot(st) just before every
// render so a timeline (shots.js) can place the camera, drive and caption.
(() => {
  const P = /** @type {any} */ (window).__promo;
  const { app, world } = P;
  const st = {
    t: 0,
    cmd: { fwd: 0, turn: 0 },
    /** body opacity while it fades for the gears (null: leave the app's look) */
    shell: /** @type {number | null} */ (null),
    arcs: false,
    dof: /** @type {boolean | null} */ (false),
    cam: { pos: [0, 10, -20], target: [0, 2, 0] },
  };
  window.__dir = st;
  let THREE, Chariot, wireOpacity = 0.2;

  window.__setup = async (cfg = {}) => {
    THREE = await import('three');
    ({ Chariot } = await import('/js/sim/chariot.js'));
    P.course.free({ mechanism: 'differential', view: 'follow' });
    app.state.speed = cfg.speed ?? 2;
    const look = world.look;
    // the courtyard, ground and gate stay put; only the sun's shadow box rides along
    look.follow.call(look, 0, 0);
    look.follow = (x, z) => look.env.follow(x, z);
    const gate = world.scene.getObjectByName('landmark');
    world.scene.attach(gate);
    gate.position.set(cfg.gateX ?? 0, 0, cfg.gateZ ?? 105);
    world.route.line.visible = false;
    app.input.command = () => st.cmd;
    world.cam.update = () => {};
    const render = look.render.bind(look);
    look.render = () => {
      window.__shot?.(st, P, THREE);
      const cam = world.camera;
      cam.position.fromArray(st.cam.pos);
      world.controls.target.fromArray(st.cam.target);
      cam.lookAt(world.controls.target);
      if (st.fov && cam.fov !== st.fov) { cam.fov = st.fov; cam.updateProjectionMatrix(); }
      if (look.postfx && st.dof !== null) look.postfx.dofOn = st.dof;
      const rig = world.rig;
      if (rig) {
        if (!st.arcs) for (const sp of rig.spinners) if (sp.arc) sp.arc.group.visible = false;
        if (st.shell !== null) shellFade(rig, st.shell);
      }
      render();
    };
  };

  /** Fade the body from solid (1) to the x-ray wireframe (0). */
  function shellFade(rig, k) {
    for (const l of rig.looks) {
      if (!l.wire) continue;
      const m = l.mat;
      if (!m.transparent) { m.transparent = true; m.needsUpdate = true; }
      m.opacity = k;
      m.colorWrite = k > 0.005;
      m.depthWrite = k > 0.98;
      if (l.lines) {
        l.lines.visible = k < 0.995;
        l.lines.material.opacity = wireOpacity * (1 - k);
      }
    }
  }

  /** Put the chariot at a world point, figure on south, tracks cleared. */
  window.__place = (x, z, heading) => {
    app.chariot = new Chariot({ mechanism: app.state.mechanism, x, y: -z, heading });
    world.clearTrails();
    world.showPose(app.chariot.pose(), 0);
  };

  /** Turn x-ray on (the app's own look: gear outlines and glow), body faded by st.shell. */
  window.__xray = (on) => world.setLook(on, []);
})();
